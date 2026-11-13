import os
import sys
import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from pathlib import Path
from typing import Dict, Any, List
from dotenv import load_dotenv

from domain.models import JobListing, JobEvaluation, LLMJobAssessment, ReasoningChain
from domain.enums import Modality
from .prompts import SYSTEM_EVALUATION_PROMPT, build_matching_prompt

logger = logging.getLogger(__name__)

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"

# Un razonamiento CoT completo tarda más que una respuesta directa: timeout duro algo mayor.
LLM_TIMEOUT_SECONDS = 18.0
# Ejecutor compartido (antes se creaba un ThreadPoolExecutor por cada vacante).
_LLM_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="gemini-cot")


def resolve_gemini_api_key(explicit_key: str | None = None) -> str | None:
    """
    Resuelve la GEMINI_API_KEY con prioridad:
    1. Clave explícita pasada por parámetro
    2. Streamlit session_state / st.secrets (persistente en Streamlit Cloud)
    3. Variables de entorno / archivo local .env
    """
    if explicit_key and explicit_key.strip():
        return explicit_key.strip()

    if "streamlit" in sys.modules:
        try:
            st = sys.modules["streamlit"]
            session_key = (st.session_state.get("GEMINI_API_KEY") or "").strip()
            if session_key:
                return session_key
            secret_key = (st.secrets.get("GEMINI_API_KEY") or "").strip()
            if secret_key:
                return secret_key
        except Exception:
            pass

    if ENV_PATH.exists():
        load_dotenv(ENV_PATH, override=True)

    env_key = (os.environ.get("GEMINI_API_KEY") or "").strip()
    return env_key or None


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
        self.api_key = resolve_gemini_api_key(api_key)
        self.client = None
        self._circuit_open = False
        if self.api_key:
            try:
                from google import genai
                from google.genai import types
                self.client = genai.Client(
                    api_key=self.api_key,
                    http_options=types.HttpOptions(timeout=int(LLM_TIMEOUT_SECONDS * 1000) + 2000),
                )
                logger.info(f"Cliente Gemini ({self.MODEL_ID}) inicializado exitosamente.")
            except Exception as e:
                logger.warning(f"No se pudo inicializar Gemini SDK: {e}. Se usará motor heurístico.")

    @property
    def llm_available(self) -> bool:
        return bool(self.client) and not self._circuit_open

    def open_circuit(self, reason: str):
        if not self._circuit_open:
            logger.warning(f"Circuit Breaker abierto ({reason}). El resto del lote usará el motor heurístico.")
        self._circuit_open = True

    def evaluate(self, listing: JobListing, candidate_profile: Dict[str, Any]) -> JobEvaluation:
        """
        Punto de entrada único. Delega en el grafo LangGraph (ai/graph.py):
        pre-filtro determinista -> razonamiento CoT con Gemini -> puntaje determinista,
        con Circuit Breaker y degradación elegante al motor heurístico.
        """
        from .graph import evaluate_with_graph
        return evaluate_with_graph(self, listing, candidate_profile)

    def assess_with_gemini(self, listing: JobListing, candidate_profile: Dict[str, Any]) -> LLMJobAssessment:
        """Llama a Gemini con salida estructurada (CoT primero) y un timeout duro."""
        future = _LLM_EXECUTOR.submit(self._call_gemini, listing, candidate_profile)
        return future.result(timeout=LLM_TIMEOUT_SECONDS)

    def _call_gemini(self, listing: JobListing, candidate_profile: Dict[str, Any]) -> LLMJobAssessment:
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
                "schema": LLMJobAssessment.model_json_schema(),
            },
        )
        return LLMJobAssessment.model_validate_json(interaction.output_text)

    def apply_deterministic_scores(self, evaluation: JobEvaluation, listing: JobListing) -> JobEvaluation:
        """Modalidad, ubicación y ranking final se calculan con reglas, no los decide el LLM."""
        evaluation.modality_score = round(self._calculate_modality_score(listing.modality), 2)
        evaluation.location_score = round(self._calculate_location_score(listing.location, listing.raw_description), 2)
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

        # 1. Validación rigurosa de Práctica Preprofesional (Estudiante vs Egresado/Profesional/Empleo regular)
        is_pre = True
        reject_reason = ""

        has_pre_in_title = bool(re.search(r"\bpre\b|pre[\s\-]*profesional", title_lower))
        is_profesional_title = bool(
            re.search(
                r"\b(practicante[s]?\s+profesional(es)?|pr[áa]ctica[s]?\s+profesional(es)?|practicante\s+pro)\b",
                title_lower,
            )
        )
        has_egresado_title = bool(
            re.search(r"\b(egresad[oa]s?|bachiller(es)?|titulad[oa]s?|graduate|graduad[oa]s?)\b", title_lower)
        )

        has_student_marker = any(
            m in combined for m in [
                "preprofesional", "pre-profesional", "pre profesional",
                "7mo", "8vo", "9no", "séptimo", "septimo", "octavo", "noveno", "décimo", "decimo", "10mo",
                "estudiante universitario", "estudiantes universitarios",
                "estudiantes de", "estudiante de", "últimos ciclos", "ultimos ciclos",
                "cursando actualmente", "en curso"
            ]
        )

        # Regla A: Título explícito de práctica profesional o dirigido a egresados/graduados
        if is_profesional_title and not has_pre_in_title:
            is_pre = False
            reject_reason = "El título indica Práctica Profesional (exclusiva para egresados universitarios, no preprofesional)."
        elif has_egresado_title and not has_pre_in_title:
            is_pre = False
            reject_reason = "El puesto está dirigido a egresados/graduados (no para estudiante de 8vo ciclo)."

        # Regla B: Empleo regular que no es modalidad formativa de prácticas
        if is_pre:
            is_internship_title = any(
                k in title_lower for k in [
                    "practicante", "práctica", "practica", "trainee", "becari", "pasant", "intern"
                ]
            )
            has_student_in_desc = any(
                m in desc_lower for m in [
                    "preprofesional", "pre-profesional", "pre profesional",
                    "7mo", "8vo", "9no", "séptimo", "septimo", "octavo", "noveno",
                    "estudiante universitario", "estudiante de", "estudiantes de", "últimos ciclos"
                ]
            )
            if not is_internship_title and not has_pre_in_title and not has_student_in_desc:
                is_pre = False
                reject_reason = "Puesto laboral regular (no es convocatoria de práctica preprofesional formativa)."

        # Regla C: Modalidad explícita en ficha técnica / descripción
        if is_pre:
            mod_match = re.search(r"modalidad\s+de\s+pr[áa]cticas?:\s*([^\r\n]+)", desc_lower)
            if mod_match:
                mod_text = mod_match.group(1).strip()
                if "pre" not in mod_text and ("profesional" in mod_text or "profesionales" in mod_text):
                    is_pre = False
                    reject_reason = f"La convocatoria especifica 'Modalidad de prácticas: {mod_text}', incompatible con preprofesional."

        # Regla D: Requisito de egreso excluyente sin opción para estudiantes
        if is_pre:
            has_egresado_req = bool(
                re.search(
                    r"\b(constancia\s+de\s+egresad|acreditar\s+ser\s+egresad|condici[óo]n\s+de\s+egresad|"
                    r"egresad[oa]\s+universitari[oa]|egresad[oa]\s+de\s+(las\s+)?carreras?|"
                    r"egresado\s+o\s+bachiller|bachiller\s+o\s+titulado|titulado\s+colegiado|"
                    r"reci[eé]n\s+egresad[oa]|formaci[oó]n\s+universitaria\s+completa)\b",
                    desc_lower,
                )
            )
            if has_egresado_req and not has_student_marker and not has_pre_in_title:
                is_pre = False
                reject_reason = "Exige constancia de egreso, formación universitaria completa o condición de egresado/bachiller."

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

        skills_str = ", ".join(matching[:4]) if matching else "ninguna competencia clave explícita"

        status_note = "Apta para 8vo ciclo (preprofesional)." if is_pre else f"Descartada: {reject_reason or 'No es preprofesional.'}"
        verdict = (
            f"{status_note} Coincide en {len(matching)} competencias clave ({skills_str}). "
            f"Ubicación: {listing.location} · Modalidad: {listing.modality.value}."
        )

        # Cadena de razonamiento determinista: hace explicable incluso la evaluación sin LLM
        if not is_pre:
            academic = reject_reason or "La oferta apunta a egresados/bachilleres o empleo regular; incompatible con estudiante de 8vo ciclo."
        elif has_student_marker or has_pre_in_title:
            academic = "La oferta menciona explícitamente prácticas preprofesionales o ciclo universitario compatible con el 8vo."
        else:
            academic = "Es una práctica, aunque no especifica ciclo; se asume compatible con un estudiante de 8vo ciclo."
        experience = (
            "Detecta exigencia de 2+ años de experiencia o falta de remuneración: posible oferta trampa."
            if is_smoke else
            "No se detectan exigencias de experiencia irreales ni señales de práctica no remunerada."
        )
        reasoning = ReasoningChain(
            academic_eligibility=academic,
            experience_requirements=experience,
            tech_stack_overlap=(
                f"Coincidencias detectadas por reglas: {', '.join(matching)}." if matching
                else "No se detectaron tecnologías del perfil en el texto de la oferta."
            ),
            gaps_and_risks=(
                f"Pide tecnologías que el perfil no cubre: {', '.join(missing)}." if missing
                else "No se detectan brechas tecnológicas relevantes en el texto."
            ),
            score_rationale=(
                f"Puntaje técnico {base_match:.2f} = base 0.30 + 0.11 por cada una de las {len(matching)} coincidencias"
                f"{' + 0.20 por título del área TI/datos' if title_bonus else ''} (motor heurístico, sin LLM)."
            ),
        )

        return JobEvaluation(
            reasoning=reasoning,
            engine="heuristic",
            is_pre_professional=is_pre,
            is_unrealistic_or_smoke=is_smoke,
            technical_match_score=base_match,
            modality_score=round(modality_score, 2),
            location_score=round(loc_score, 2),
            final_ranking_score=final_score,
            matching_skills=matching,
            missing_skills=missing,
            verdict_summary=verdict,
        )
