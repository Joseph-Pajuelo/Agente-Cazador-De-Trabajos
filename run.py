#!/usr/bin/env python
"""
Job Hunter & ATS Tailor - Orquestador Principal del Pipeline de Ingesta y Evaluación.
Diseñado bajo arquitectura modular y desacoplada (5 Adapters activos + Circuit Breaker).
"""

import sys
import logging
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Callable

# Configurar encoding UTF-8 en stdout para terminales de Windows
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Añadir raíz al sys.path
root_dir = Path(__file__).resolve().parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from config.candidate_profile import CANDIDATE_PROFILE
from storage.database import DatabaseManager
from adapters.practicas_pe import PracticasPeAdapter
from adapters.bumeran import BumeranAdapter
from adapters.linkedin import LinkedInGuestAdapter
from adapters.computrabajo import ComputrabajoAdapter
from adapters.cvmatcher import CVMatcherAdapter
from ai.matcher import JobMatcherAI
from domain.ranking import sort_by_modality_then_score, is_recommended
from delivery.pdf_report import generate_pdf_report

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("fontTools").setLevel(logging.WARNING)
logger = logging.getLogger("JobHunterAgent")

REPORTS_DIR = root_dir / "reports"


def get_adapters():
    """Retorna las 5 fuentes activas del sistema."""
    return [
        PracticasPeAdapter(),
        BumeranAdapter(),
        LinkedInGuestAdapter(),
        ComputrabajoAdapter(),
        CVMatcherAdapter(),
    ]


def run_pipeline(
    limit_per_source: int = 8,
    min_score: float = 50.0,
    generate_pdf: bool = True,
    selected_adapters: Optional[List[str]] = None,
    reevaluate_all: bool = False,
    on_progress: Optional[Callable[[str, float], None]] = None,
) -> dict:
    logger.info("=== INICIANDO PIPELINE DE CAZADOR DE VACANTES (5 FUENTES) ===")
    db = DatabaseManager()

    if reevaluate_all:
        logger.info("Reseteando evaluaciones previas para re-evaluar todo el catálogo...")
        db.reset_evaluations()

    adapters = [
        a for a in get_adapters()
        if selected_adapters is None or a.name in selected_adapters
    ]

    total_extracted = 0
    total_new = 0
    per_source_stats = {}
    known_urls = db.get_known_urls()

    # 1. Extracción y deduplicación por cada Adapter seleccionado
    for idx, adapter in enumerate(adapters):
        if on_progress:
            on_progress(f"Escaneando {adapter.name} ({idx + 1}/{len(adapters)})...", (idx / max(len(adapters) + 1, 1)))
        logger.info(f"Ejecutando adapter: {adapter.name} (límite={limit_per_source})...")
        listings = adapter.fetch_listings(limit=limit_per_source, known_urls=known_urls)
        total_extracted += len(listings)
        new_in_source = 0
        for item in listings:
            _, is_new = db.insert_listing(item)
            if is_new:
                total_new += 1
                new_in_source += 1
                logger.info(f"[NUEVA - {adapter.name}] {item.title} @ {item.company} ({item.modality.value})")
        per_source_stats[adapter.name] = {"extracted": len(listings), "new": new_in_source}

    logger.info(f"Extracción finalizada. Extraídas: {total_extracted} | Nuevas únicas: {total_new}")

    # 2. Evaluación (Pre-filtro + Gemini 3.8 Flash con Circuit Breaker)
    matcher = JobMatcherAI()
    pending_jobs = db.get_pending_listings(limit=300)
    if on_progress:
        on_progress(f"Evaluando {len(pending_jobs)} vacantes pendientes...", 0.85)

    for listing_id, listing in pending_jobs:
        evaluation = matcher.evaluate(listing, CANDIDATE_PROFILE)
        db.insert_evaluation(listing_id, evaluation)
        logger.info(
            f"-> {evaluation.final_ranking_score}/100 | PreProf={evaluation.is_pre_professional} | "
            f"{listing.title} ({listing.company}) [{listing.source.value}]"
        )

    # 3. Ranking y generación de PDF
    recommended = sort_by_modality_then_score(
        [j for j in db.get_all_evaluated_jobs() if is_recommended(j, min_score)]
    )
    pdf_path = None
    if generate_pdf:
        pdf_path = REPORTS_DIR / f"reporte_vacantes_{datetime.now():%Y%m%d_%H%M%S}.pdf"
        generate_pdf_report(recommended, CANDIDATE_PROFILE["name"], str(pdf_path))
        logger.info(f"Reporte PDF generado en: {pdf_path}")

    if on_progress:
        on_progress("¡Proceso completado!", 1.0)

    engine_label = f"Gemini ({matcher.MODEL_ID})" if (matcher.client and not matcher._circuit_open) else "Heurístico + Circuit Breaker"
    return {
        "extracted": total_extracted,
        "new": total_new,
        "evaluated": len(pending_jobs),
        "recommended": len(recommended),
        "per_source": per_source_stats,
        "ai_engine": engine_label,
        "pdf_path": str(pdf_path) if pdf_path else None,
    }


if __name__ == "__main__":
    summary = run_pipeline(limit_per_source=6, min_score=50.0)
    print("\n" + "=" * 75)
    for k, v in summary.items():
        print(f"  {k:14}: {v}")
    print("=" * 75)
    print("Dashboard activo en: http://localhost:8501")
