"""
Contrato de persistencia (JobRepository Protocol) y precomputación de metadatos en ingesta.
"""
from __future__ import annotations

from typing import Protocol, runtime_checkable, Optional, List, Tuple, Set, Dict, Any
from domain.models import JobListing, JobEvaluation


# ============================================================================
# 1. Enriquecimiento Determinista Precomputado en Ingesta
# ============================================================================
def normalize_listing_enrichment(listing: JobListing) -> Dict[str, Any]:
    """
    Precomputa metadatos enriquecidos de empleador (marca/agencia/sector), fecha ISO
    y atributos normalizados de Lima (distrito, zona, categoría, nivel, inglés, salario)
    antes de almacenar la vacante, evitando escaneos de texto pesado en las consultas web.
    """
    from domain.companies import resolve_employer
    from domain.normalization import normalize_job_metadata
    from domain.ranking import parse_job_date

    emp = resolve_employer(listing.company, listing.title, listing.raw_description)
    brand_key = emp.brand.key if emp.brand else None
    via_agency = emp.via_agency
    agency_clue = emp.clue or ""
    sector = emp.brand.sector if emp.brand else emp.sector_hint

    dt = parse_job_date(listing.published_at)
    pub_date = dt.strftime("%Y-%m-%d") if dt else None

    norm_meta = normalize_job_metadata(
        title=listing.title,
        company=listing.company,
        location=listing.location,
        modality=listing.modality.value if hasattr(listing.modality, "value") else str(listing.modality),
        salary=listing.salary,
        raw_description=listing.raw_description,
    )

    return {
        "resolved_brand_key": brand_key,
        "resolved_via_agency": via_agency,
        "agency_clue": agency_clue,
        "sector_hint": sector,
        "published_date": pub_date,
        **norm_meta,
    }


# ============================================================================
# 2. Contrato Abstracto del Repositorio (Patrón Repository)
# ============================================================================
@runtime_checkable
class JobRepository(Protocol):
    """Contrato abstracto para persistencia de vacantes y evaluaciones (Supabase o SQLite)."""

    def get_known_urls(self) -> Set[str]:
        """Retorna el conjunto de URLs conocidas para evitar descargas repetidas."""
        ...

    def insert_listing(self, listing: JobListing) -> Tuple[Optional[int], bool]:
        """Inserta una vacante si su hash SHA-256 es nuevo. Retorna (id, es_nueva)."""
        ...

    def insert_evaluation(
        self,
        listing_id: int,
        evaluation: JobEvaluation,
        profile_id: Optional[str] = None,
    ) -> None:
        """Inserta o actualiza la evaluación técnica y de afinidad para una vacante."""
        ...

    def get_pending_listings(self, limit: int = 200) -> List[Tuple[int, JobListing]]:
        """Retorna vacantes con status 'PENDING_EVALUATION' listas para evaluar."""
        ...

    def reset_evaluations(self) -> None:
        """Limpia evaluaciones base y regresa vacantes a estado 'PENDING_EVALUATION'."""
        ...

    def get_all_evaluated_jobs(self) -> List[Dict[str, Any]]:
        """Retorna todas las vacantes evaluadas con su puntaje y metadatos completos."""
        ...

    def checkpoint(self) -> None:
        """Sincroniza o consolida escrituras pendientes en el motor de almacenamiento."""
        ...
