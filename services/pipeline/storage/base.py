from __future__ import annotations

from typing import Protocol, runtime_checkable, Optional, List, Tuple, Set, Dict, Any
from domain.models import JobListing, JobEvaluation

CRM_STATUS_MAP: Dict[str, str] = {
    "📋 Por postular": "to_apply",
    "⭐ Favorita": "favorite",
    "🚀 Postulado": "applied",
    "🎤 En entrevista": "interview",
    "❌ Descartada por mí": "discarded",
}

REVERSE_CRM_STATUS_MAP: Dict[str, str] = {v: k for k, v in CRM_STATUS_MAP.items()}


def map_crm_status(raw_status: Optional[str]) -> str:
    """Mapea cadenas de estado de CRM (emojis legados o códigos canónicos) al código canónico."""
    if not raw_status:
        return "to_apply"
    raw = str(raw_status).strip()
    if raw in CRM_STATUS_MAP:
        return CRM_STATUS_MAP[raw]
    if raw in CRM_STATUS_MAP.values():
        return raw
    return "to_apply"


def normalize_listing_enrichment(listing: JobListing) -> Dict[str, Any]:
    """
    Precomputa metadatos enriquecidos de empleador y fecha normalizada para almacenamiento y búsqueda rápida.
    """
    from domain.companies import resolve_employer
    from domain.ranking import parse_job_date

    emp = resolve_employer(listing.company, listing.title, listing.raw_description)
    brand_key = emp.brand.key if emp.brand else None
    via_agency = emp.via_agency
    agency_clue = emp.clue or ""
    sector = emp.brand.sector if emp.brand else emp.sector_hint

    dt = parse_job_date(listing.published_at)
    pub_date = dt.strftime("%Y-%m-%d") if dt else None

    return {
        "resolved_brand_key": brand_key,
        "resolved_via_agency": via_agency,
        "agency_clue": agency_clue,
        "sector_hint": sector,
        "published_date": pub_date,
    }


@runtime_checkable
class JobRepository(Protocol):
    """Contrato abstracto para persistencia de vacantes y evaluaciones."""

    def get_known_urls(self) -> Set[str]:
        """Retorna el conjunto de URLs conocidas para evitar descargas repetidas."""
        ...

    def insert_listing(self, listing: JobListing) -> Tuple[Optional[int], bool]:
        """Inserta o actualiza una vacante. Retorna (id, es_nueva)."""
        ...

    def insert_evaluation(
        self,
        listing_id: int,
        evaluation: JobEvaluation,
        profile_id: Optional[str] = None,
    ) -> None:
        """Inserta o actualiza una evaluación."""
        ...

    def get_pending_listings(self, limit: int = 200) -> List[Tuple[int, JobListing]]:
        """Retorna vacantes con status 'PENDING_EVALUATION'."""
        ...

    def reset_evaluations(self) -> None:
        """Limpia evaluaciones y regresa vacantes a estado PENDING_EVALUATION."""
        ...

    def get_all_evaluated_jobs(self) -> List[Dict[str, Any]]:
        """Retorna todas las vacantes evaluadas con su score y datos completos."""
        ...

    def checkpoint(self) -> None:
        """Persiste / hace flush de cambios pendientes."""
        ...
