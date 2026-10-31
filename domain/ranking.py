"""
Reglas de ordenamiento compartidas por el reporte PDF y el dashboard.
Preferencia del candidato: Híbrido > Presencial > Remoto > No especificado,
y dentro de cada modalidad, mayor puntaje primero.
"""
from typing import List, Dict

MODALITY_ORDER = {
    "Híbrido": 0,
    "Presencial": 1,
    "Remoto": 2,
    "No especificado": 3,
}


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
