"""
Reglas de ordenamiento compartidas por el reporte PDF y el dashboard.
Preferencia del candidato: Híbrido > Presencial > Remoto > No especificado,
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
    """Verifica si la vacante fue publicada dentro de las últimas N semanas/días (por defecto 14 días)."""
    age_days = get_job_age_days(job, now=now)
    if age_days is None:
        return True
    return age_days <= max_days


def get_job_age_pill_html(job: Dict, now: Optional[datetime] = None) -> str:
    """Genera una píldora visual estilizada con la antigüedad de la oferta."""
    age_days = get_job_age_days(job, now=now)
    if age_days is None:
        return ""
    if age_days == 0:
        label = "Hoy"
    elif age_days == 1:
        label = "Ayer"
    elif age_days < 7:
        label = f"Hace {age_days}d"
    elif age_days < 14:
        label = "Hace 1 sem"
    elif age_days < 21:
        label = "Hace 2 sem"
    elif age_days < 30:
        label = "Hace 3 sem"
    else:
        label = f"Hace {age_days // 30} mes" if age_days < 60 else f"Hace {age_days // 30} meses"

    cls = "pill-sage" if age_days <= 7 else ("pill-indigo" if age_days <= 14 else "pill-neutral")
    return f"<span class='pill {cls}' style='font-size:0.75rem;padding:2px 8px;'>🕒 {label}</span>"


def sort_by_modality_then_score(jobs: List[Dict]) -> List[Dict]:
    return sorted(
        jobs,
        key=lambda j: (
            MODALITY_ORDER.get(j.get("modality", ""), 9),
            -float(j.get("final_ranking_score") or 0),
        ),
    )


def is_recommended(job: Dict, min_score: float = 50.0) -> bool:
    return (
        bool(job.get("is_pre_professional"))
        and not bool(job.get("is_unrealistic_or_smoke"))
        and float(job.get("final_ranking_score") or 0) >= min_score
    )
