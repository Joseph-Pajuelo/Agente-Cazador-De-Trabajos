import os
import logging
from typing import Optional, List, Tuple, Set, Dict, Any

from domain.models import JobListing, JobEvaluation
from domain.enums import JobSource, Modality
from storage.base import JobRepository, normalize_listing_enrichment

logger = logging.getLogger(__name__)


class SupabaseRepository(JobRepository):
    """
    Repositorio PostgreSQL en la nube vía Supabase HTTPS (PostgREST API).
    Garantiza compatibilidad IPv4/IPv6 y persistencia multi-usuario mediante RLS.
    """

    def __init__(
        self,
        url: Optional[str] = None,
        service_role_key: Optional[str] = None,
        client: Any = None,
    ):
        if client is not None:
            self.client = client
        else:
            self.url = url or os.environ.get("SUPABASE_URL")
            self.service_role_key = service_role_key or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
            if not self.url or not self.service_role_key:
                raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to initialize SupabaseRepository")
            from supabase import create_client
            self.client = create_client(self.url, self.service_role_key)

    def get_known_urls(self) -> Set[str]:
        """Obtiene todas las URLs registradas en job_listings."""
        try:
            resp = self.client.table("job_listings").select("url").execute()
            return {row["url"] for row in (resp.data or []) if row.get("url")}
        except Exception as e:
            logger.error(f"Error fetching known URLs from Supabase: {e}")
            return set()

    def insert_listing(self, listing: JobListing) -> Tuple[Optional[int], bool]:
        """
        Inserta o actualiza una vacante con enriquecimiento precomputado.
        Retorna (id, is_new).
        """
        if not listing.deduplication_hash:
            listing.compute_hash()

        enrichment = normalize_listing_enrichment(listing)

        payload = {
            "deduplication_hash": listing.deduplication_hash,
            "source": listing.source.value if hasattr(listing.source, "value") else str(listing.source),
            "title": listing.title,
            "company": listing.company,
            "location": listing.location,
            "modality": listing.modality.value if hasattr(listing.modality, "value") else str(listing.modality),
            "url": listing.url,
            "salary": listing.salary,
            "raw_description": listing.raw_description,
            "published_at": listing.published_at,
            "published_date": enrichment["published_date"],
            "resolved_brand_key": enrichment["resolved_brand_key"],
            "resolved_via_agency": bool(enrichment["resolved_via_agency"]),
            "agency_clue": enrichment["agency_clue"] or "",
            "sector_hint": enrichment["sector_hint"],
            "status": "PENDING_EVALUATION",
        }

        # Verificar existencia previa por deduplication_hash
        existing = (
            self.client.table("job_listings")
            .select("id")
            .eq("deduplication_hash", listing.deduplication_hash)
            .execute()
        )
        if existing.data and len(existing.data) > 0:
            return existing.data[0]["id"], False

        resp = self.client.table("job_listings").upsert(payload, on_conflict="deduplication_hash").execute()
        row_id = resp.data[0]["id"] if (resp.data and len(resp.data) > 0) else None
        return row_id, True

    def insert_evaluation(
        self,
        listing_id: int,
        evaluation: JobEvaluation,
        profile_id: Optional[str] = None,
    ) -> None:
        """
        Inserta evaluación omitiendo pitch_recommendation y asociando a profile_id (None para catálogo compartido).
        """
        eval_payload = {
            "listing_id": listing_id,
            "profile_id": profile_id,
            "is_pre_professional": bool(evaluation.is_pre_professional),
            "is_unrealistic_or_smoke": bool(evaluation.is_unrealistic_or_smoke),
            "technical_match_score": float(evaluation.technical_match_score),
            "modality_score": float(evaluation.modality_score),
            "location_score": float(evaluation.location_score),
            "final_ranking_score": float(evaluation.final_ranking_score),
            "matching_skills": evaluation.matching_skills or [],
            "missing_skills": evaluation.missing_skills or [],
            "verdict_summary": evaluation.verdict_summary,
            "reasoning_chain": evaluation.reasoning.model_dump() if evaluation.reasoning else None,
            "engine": evaluation.engine or "heuristic",
        }

        self.client.table("job_evaluations").upsert(eval_payload, on_conflict="listing_id,profile_id").execute()
        self.client.table("job_listings").update({"status": "EVALUATED"}).eq("id", listing_id).execute()

    def get_pending_listings(self, limit: int = 200) -> List[Tuple[int, JobListing]]:
        """Recupera vacantes pendientes de evaluación."""
        resp = (
            self.client.table("job_listings")
            .select("*")
            .eq("status", "PENDING_EVALUATION")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        results = []
        for row in resp.data or []:
            source_val = row.get("source")
            modality_val = row.get("modality")
            listing = JobListing(
                id=str(row["id"]),
                source=JobSource(source_val) if source_val in JobSource._value2member_map_ else JobSource.PRACTICAS_PE,
                title=row["title"],
                company=row["company"],
                location=row.get("location") or "Lima, Perú",
                modality=Modality(modality_val) if modality_val in Modality._value2member_map_ else Modality.DESCONOCIDO,
                url=row["url"],
                salary=row.get("salary"),
                raw_description=row["raw_description"],
                published_at=row.get("published_at"),
                deduplication_hash=row["deduplication_hash"],
            )
            results.append((row["id"], listing))
        return results

    def reset_evaluations(self) -> None:
        """Limpia evaluaciones del catálogo base (profile_id IS NULL) y marca vacantes como pendientes."""
        self.client.table("job_evaluations").delete().is_("profile_id", "null").execute()
        self.client.table("job_listings").update({"status": "PENDING_EVALUATION"}).neq("id", 0).execute()

    def get_all_evaluated_jobs(self) -> List[Dict[str, Any]]:
        """Recupera todas las vacantes evaluadas del catálogo base (profile_id IS NULL) con sus datos completos."""
        resp = (
            self.client.table("job_evaluations")
            .select("*, job_listings(*)")
            .is_("profile_id", "null")
            .order("final_ranking_score", desc=True)
            .execute()
        )
        flat_results = []
        for row in resp.data or []:
            listing = row.get("job_listings") or {}
            combined = {
                "id": listing.get("id", row.get("listing_id")),
                "deduplication_hash": listing.get("deduplication_hash"),
                "title": listing.get("title", ""),
                "company": listing.get("company", ""),
                "location": listing.get("location", ""),
                "modality": listing.get("modality", ""),
                "url": listing.get("url", ""),
                "salary": listing.get("salary"),
                "source": listing.get("source", ""),
                "raw_description": listing.get("raw_description", ""),
                "published_at": listing.get("published_at"),
                "published_date": listing.get("published_date"),
                "created_at": listing.get("created_at"),
                "resolved_brand_key": listing.get("resolved_brand_key"),
                "resolved_via_agency": listing.get("resolved_via_agency", False),
                "agency_clue": listing.get("agency_clue", ""),
                "sector_hint": listing.get("sector_hint"),
                "application_status": "to_apply",
                "applied_at": None,
                "user_notes": "",
                "is_pre_professional": row.get("is_pre_professional"),
                "is_unrealistic_or_smoke": row.get("is_unrealistic_or_smoke"),
                "technical_match_score": row.get("technical_match_score"),
                "modality_score": row.get("modality_score"),
                "location_score": row.get("location_score"),
                "final_ranking_score": row.get("final_ranking_score"),
                "matching_skills": row.get("matching_skills") or [],
                "missing_skills": row.get("missing_skills") or [],
                "verdict_summary": row.get("verdict_summary", ""),
                "pitch_recommendation": "",
                "evaluated_at": row.get("evaluated_at"),
                "reasoning_chain": row.get("reasoning_chain"),
                "engine": row.get("engine", "heuristic"),
            }
            flat_results.append(combined)
        return flat_results

    def checkpoint(self) -> None:
        """No-op en Supabase: las escrituras HTTP se confirman de inmediato."""
        pass
