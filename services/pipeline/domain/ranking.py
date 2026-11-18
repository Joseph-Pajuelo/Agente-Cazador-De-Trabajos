"""
Reglas de fechas, frescura y ordenamiento de vacantes en el pipeline.
Preferencia de modalidad: Híbrido > Presencial > Remoto > No especificado,
y dentro de cada modalidad, mayor puntaje primero.
"""
from datetime import datetime
from typing import List, Dict, Optional

MODALITY_ORDER = {
    "Híbrido": 0,
    "Presencial": 1,
    "Remoto": 2,
    "No especificado": 3,
}


# ============================================================================
# 1. Normalización y Cálculo de Antigüedad de Publicación
# ============================================================================
def parse_job_date(date_str: Optional[str]) -> Optional[datetime]:
    """Parsea fechas en formatos ISO (YYYY-MM-DD), latinos (DD-MM-YYYY) o con hora."""
    if not date_str:
        return None
    cleaned = str(date_str).strip()
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%Y-%m-%d %H:%M:%S", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(cleaned[:10], fmt)
        except ValueError:
            pass
    return None


def get_job_age_days(job: Dict, now: Optional[datetime] = None) -> Optional[int]:
    """Calcula la antigüedad en días de una vacante frente a la fecha actual."""
    now = now or datetime.now()
    dt = parse_job_date(job.get("published_at")) or parse_job_date(job.get("created_at"))
    if not dt:
        return None
    delta = (now - dt).days
    return max(0, delta)


def is_job_recent(job: Dict, max_days: int = 14, now: Optional[datetime] = None) -> bool:
    """Verifica si la vacante fue publicada dentro de los últimos `max_days` días."""
    age_days = get_job_age_days(job, now=now)
    if age_days is None:
        return True
    return age_days <= max_days


# ============================================================================
# 2. Ordenamiento y Filtro de Recomendación
# ============================================================================
def sort_by_modality_then_score(jobs: List[Dict]) -> List[Dict]:
    """Ordena vacantes priorizando modalidad (Híbrido > Presencial > Remoto) y puntaje."""
    return sorted(
        jobs,
        key=lambda j: (
            MODALITY_ORDER.get(j.get("modality", ""), 9),
            -float(j.get("final_ranking_score") or 0),
        ),
    )


def is_recommended(job: Dict, min_score: float = 50.0) -> bool:
    """Determina si una vacante es apta (preprofesional, no humo y supera el puntaje mínimo)."""
    return (
        bool(job.get("is_pre_professional"))
        and not bool(job.get("is_unrealistic_or_smoke"))
        and float(job.get("final_ranking_score") or 0) >= min_score
    )
