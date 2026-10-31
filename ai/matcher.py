import os
import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from pathlib import Path
from typing import Dict, Any, List
from dotenv import load_dotenv

from domain.models import JobListing, JobEvaluation
from domain.enums import Modality
from .prompts import SYSTEM_EVALUATION_PROMPT, build_matching_prompt

logger = logging.getLogger(__name__)

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"


class JobMatcherAI:
    """
    Motor de evaluación semántica y matching de vacantes.
    Implementa:
    1. Pre-filtrado heurístico (no gasta llamadas de IA en puestos de egresados/seniors).
    2. Inferencia con Google Gemini API (gemini-3.8-flash + JSON Schema) con timeout corto (8s).
    3. Patrón Circuit Breaker: si la red o cuota de la API falla, abre el circuito para evaluar
       instantáneamente el resto del lote sin bloquear al usuario.
    """
    MODEL_ID = "gemini-3.8-flash"

    def __init__(self, api_key: str | None = None):
        if ENV_PATH.exists():
            load_dotenv(ENV_PATH, override=True)
        self.api_key = (api_key or os.environ.get("GEMINI_API_KEY") or "").strip() or None
        self.client = None
        self._circuit_open = False
        if self.api_key:
            try:
                from google import genai
                from google.genai import types
                self.client = genai.Client(
                    api_key=self.api_key,
                    http_options=types.HttpOptions(timeout=8000),
                )
                logger.info(f"Cliente Gemini ({self.MODEL_ID}) inicializado exitosamente.")
            except Exception as e:
                logger.warning(f"No se pudo inicializar Gemini SDK: {e}. Se usará motor heurístico.")

    def evaluate(self, listing: JobListing, candidate_profile: Dict[str, Any]) -> JobEvaluation:
        """
        Evalúa la vacante:
        - Paso 1: Pre-filtro determinista rápido (descarta puestos no preprofesionales sin gastar IA).
        - Paso 2: Si aplica y el Circuit Breaker está cerrado, consulta Gemini 3.8 Flash.
        """
        heuristic_eval = self._evaluate_heuristic(listing, candidate_profile)

        # Optimización de arquitectura (Pregunta 5 Hackathon): No gastar LLM en ofertas descartadas por reglas duras
        if not heuristic_eval.is_pre_professional or heuristic_eval.is_unrealistic_or_smoke:
            return heuristic_eval

        if self.client and not self._circuit_open:
            try:
                ex = ThreadPoolExecutor(max_workers=1)
                fut = ex.submit(self._evaluate_with_gemini, listing, candidate_profile)
                try:
                    return fut.result(timeout=5.0)
                finally:
                    ex.shutdown(wait=False, cancel_futures=True)
            except (FuturesTimeoutError, Exception) as e:
                logger.warning(f"Circuit Breaker activado tras timeout/fallo en Gemini API ({type(e).__name__}). Usando motor heurístico para el lote.")
                self._circuit_open = True
                return heuristic_eval
        return heuristic_eval

    def _evaluate_with_gemini(self, listing: JobListing, candidate_profile: Dict[str, Any]) -> JobEvaluation:
        prompt = build_matching_prompt(
            candidate_profile_json=json.dumps(candidate_profile, ensure_ascii=False, indent=2),
            job_listing_dict=listing.model_dump(mode="json")
        )

        interaction = self.client.interactions.create(
            model=self.MODEL_ID,
            input=prompt,
            system_instruction=SYSTEM_EVALUATION_PROMPT,
            response_format={
                "type": "text",
                "mime_type": "application/json",
                "schema": JobEvaluation.model_json_schema(),
            },
        )

        evaluation = JobEvaluation.model_validate_json(interaction.output_text)

        modality_weight = self._calculate_modality_score(listing.modality)
        location_weight = self._calculate_location_score(listing.location, listing.raw_description)
        evaluation.modality_score = modality_weight
        evaluation.location_score = location_weight

        evaluation.final_ranking_score = round(
            (evaluation.technical_match_score * 0.55 +
             evaluation.modality_score * 0.25 +
             evaluation.location_score * 0.20) * 100.0,
            2
        )
        return evaluation

    def _calculate_modality_score(self, modality: Modality) -> float:
        if modality == Modality.HIBRIDO:
            return 1.0   # Prioridad #1
        elif modality == Modality.PRESENCIAL:
            return 0.85  # Prioridad #2
        elif modality == Modality.REMOTO:
            return 0.70  # Prioridad #3
        return 0.55

    def _calculate_location_score(self, location: str, raw_desc: str) -> float:
        text = f"{location} {raw_desc}".lower()
        far_zones = ["huacho", "barranca", "cañete", "arequipa", "trujillo", "piura", "cusco", "chiclayo", "ica", "lurin", "lurín", "ventanilla", "ancón"]
        if any(z in text for z in far_zones):
            return 0.25

        preferred = [
            "ate", "vitarte", "la molina", "molina", "surco", "san isidro",
            "san borja", "la victoria", "miraflores", "lince", "jesús maría",
            "jesus maria", "santa anita", "cercado de lima", "lima centro"
        ]
        if any(d in text for d in preferred):
            return 1.0
        if "lima" in text:
            return 0.80
        if "remoto" in text:
            return 0.70
        return 0.45

    def _evaluate_heuristic(self, listing: JobListing, candidate_profile: Dict[str, Any]) -> JobEvaluation:
        desc_lower = listing.raw_description.lower()
        title_lower = listing.title.lower()
        combined = f"{title_lower} {desc_lower}"

        # 1. Validación estricta de Práctica Preprofesional (Estudiante vs Egresado/Senior)
        is_pre = True
        has_pre_marker = any(
            m in combined for m in [
                "preprofesional", "pre-profesional", "pre profesional",
                "7mo", "8vo", "9no", "séptimo", "octavo", "noveno",
                "estudiante universitario", "estudiantes de", "estudiante de"
            ]
        )
        if re.search(r"practicante\s+profesional", title_lower) and not re.search(r"pre[\s\-]*profesional", title_lower):
            is_pre = False
        if not any(k in title_lower for k in ["practicante", "práctica", "practica", "trainee", "becario", "intern", "pasante"]):
            if not has_pre_marker:
                is_pre = False
        if any(term in desc_lower for term in ["egresado o bachiller", "bachiller o titulado", "titulado colegiado"]):
            if not has_pre_marker:
                is_pre = False

        # 2. Detección de ofertas trampa / humo
        is_smoke = False
        if "ad honorem" in combined or "no remunerado" in combined or "sin remuneración" in combined:
            is_smoke = True
        if re.search(r"[2-5]\s*a[ñn]os\s+de\s+experiencia", desc_lower):
            is_smoke = True

        # 3. Match de Habilidades Técnicas y de Dominio
        key_skills_map = {
            "python": "Python",
            "sql": "SQL / Consultas Avanzadas",
            "power bi": "Power BI / Dashboards",
            "powerbi": "Power BI / Dashboards",
            "excel": "Microsoft Excel",
            "java": "Java 17",
            "spring": "Spring Boot",
            "react": "React / TypeScript",
            "typescript": "React / TypeScript",
            "langgraph": "Agentes IA / LangGraph",
            "agente": "Agentes Autónomos de IA",
            "inteligencia artificial": "Inteligencia Artificial",
            "automatizaci": "Automatización de Procesos",
            "datos": "Análisis y Modelado de Datos",
            "data": "Análisis y Modelado de Datos",
            "bi ": "Business Intelligence (BI)",
            "indicadores": "KPIs e Inteligencia Comercial",
            "kpi": "KPIs e Inteligencia Comercial",
            "auditor": "Auditorías y Control de Calidad",
            "postgresql": "PostgreSQL",
            "mongodb": "MongoDB",
            "sql server": "SQL Server",
            "git": "Git / GitHub",
            "api": "APIs REST",
        }

        matching: List[str] = []
        for term, label in key_skills_map.items():
            if term in combined and label not in matching:
                matching.append(label)

        common_extras = ["AWS", "Docker", "Azure", "GCP", "Spark", "Airflow", "SAP", "Tableau", "Inglés Avanzado"]
        missing: List[str] = [s for s in common_extras if s.lower() in desc_lower]

        title_bonus = 0.20 if any(
            k in title_lower for k in ["sistemas", "datos", "data", "ia", "inteligencia artificial", "automatiz", "software", "ti", "tecnolog", "informátic", "informatic", "bi", "comercial"]
        ) else 0.0
        base_match = min(1.0, round(0.30 + len(matching) * 0.11 + title_bonus, 2))
        if not matching and title_bonus == 0:
            base_match = 0.25

        modality_score = self._calculate_modality_score(listing.modality)
        loc_score = self._calculate_location_score(listing.location, listing.raw_description)

        final_score = round((base_match * 0.55 + modality_score * 0.25 + loc_score * 0.20) * 100.0, 2)

        company_name = listing.company if listing.company not in ("Empresa Confidencial", "Empresa confidencial") else "su equipo"
        skills_str = ", ".join(matching[:4]) if matching else "SQL, Python, Power BI y desarrollo de software"

        status_note = "Apta para 8vo ciclo (Preprofesional)." if is_pre else "Atención: requiere perfil egresado/profesional."
        verdict = (
            f"{status_note} Coincide en {len(matching)} competencias clave ({skills_str}). "
            f"Ubicación: {listing.location} | Modalidad: {listing.modality.value}."
        )

        pitch = (
            f"Hola, soy Joseph Pajuelo, estudiante de 8vo ciclo de Ingeniería de Sistemas e Informática en la UTP. "
            f"Me interesa postular a la posición de {listing.title} en {company_name} porque combino experiencia práctica "
            f"construyendo agentes de IA, APIs y dashboards en Clevtronix con certificaciones en Python y Power BI (UNI) y Excel (UNMSM). "
            f"Además, como Master Trainer en Papa John's he liderado equipos bajo presión asegurando auditorías al 100%. "
            f"Puedo aportar desde el primer día en {skills_str}."
        )

        return JobEvaluation(
            is_pre_professional=is_pre,
            is_unrealistic_or_smoke=is_smoke,
            technical_match_score=base_match,
            modality_score=round(modality_score, 2),
            location_score=round(loc_score, 2),
            final_ranking_score=final_score,
            matching_skills=matching,
            missing_skills=missing,
            verdict_summary=verdict,
            pitch_recommendation=pitch,
        )
