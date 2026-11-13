import json
from datetime import datetime
from unittest.mock import MagicMock
import pytest

from domain.models import JobListing, JobEvaluation, ReasoningChain
from domain.enums import JobSource, Modality
from domain.ranking import is_job_recent

from storage.base import normalize_listing_enrichment, JobRepository, CRM_STATUS_MAP
from storage.supabase_repo import SupabaseRepository
from scripts.migrate_sqlite_to_supabase import run_migration, map_crm_status


def test_normalize_listing_enrichment_agency_resolution_and_date():
    # 1. ManpowerGroup + "el banco más grande del Perú" + "30-10-2026"
    listing1 = JobListing(
        source=JobSource.COMPUTRABAJO,
        title="Practicante Pre Profesional de Sistemas",
        company="ManpowerGroup",
        url="https://computrabajo.com/job/1",
        raw_description="Importante empresa cliente, el banco más grande del Perú, requiere practicante.",
        published_at="30-10-2026",
    )
    enrichment1 = normalize_listing_enrichment(listing1)
    assert enrichment1["resolved_brand_key"] == "bcp"
    assert enrichment1["resolved_via_agency"] is True
    assert enrichment1["sector_hint"] == "banca"
    assert enrichment1["agency_clue"] == "banco mas grande del peru"
    assert enrichment1["published_date"] == "2026-10-30"

    # 2. ISO timestamp date: "2026-11-12T10:00:00Z"
    listing2 = JobListing(
        source=JobSource.LINKEDIN,
        title="Data Analytics Intern",
        company="Interbank",
        url="https://linkedin.com/jobs/2",
        raw_description="Looking for SQL and Python skills.",
        published_at="2026-11-12T10:00:00Z",
    )
    enrichment2 = normalize_listing_enrichment(listing2)
    assert enrichment2["published_date"] == "2026-11-12"
    assert enrichment2["resolved_brand_key"] == "interbank"
    assert enrichment2["resolved_via_agency"] is False

    # 3. Invalid or missing date returns None
    listing3 = JobListing(
        source=JobSource.PRACTICAS_PE,
        title="Practicante de Redes",
        company="Empresa Desconocida",
        url="https://practicas.pe/3",
        raw_description="Conocimientos de redes.",
        published_at="fecha-invalida",
    )
    enrichment3 = normalize_listing_enrichment(listing3)
    assert enrichment3["published_date"] is None
    assert enrichment3["resolved_brand_key"] is None

    # 4. is_job_recent keeps age <= 14 and rejects age >= 15
    fixed_now = datetime(2026, 11, 15, 12, 0, 0)
    job_14_days = {"published_at": "2026-11-01"}  # exactly 14 days
    job_15_days = {"published_at": "2026-10-31"}  # 15 days
    assert is_job_recent(job_14_days, max_days=14, now=fixed_now) is True
    assert is_job_recent(job_15_days, max_days=14, now=fixed_now) is False


def test_supabase_repository_insert_listing_and_evaluation():
    mock_client = MagicMock()

    # Mock table("job_listings")
    listings_table = MagicMock()
    # Mock select().eq().execute() returning empty list (is_new = True)
    select_query = MagicMock()
    select_query.eq.return_value.execute.return_value = MagicMock(data=[])
    listings_table.select.return_value = select_query

    # Mock upsert().execute() returning inserted row with id 42
    upsert_query = MagicMock()
    upsert_query.execute.return_value = MagicMock(data=[{"id": 42}])
    listings_table.upsert.return_value = upsert_query

    # Mock update().eq().execute()
    update_query = MagicMock()
    update_query.eq.return_value.execute.return_value = MagicMock(data=[{"id": 42}])
    listings_table.update.return_value = update_query

    # Mock table("job_evaluations")
    evaluations_table = MagicMock()
    eval_upsert_query = MagicMock()
    eval_upsert_query.execute.return_value = MagicMock(data=[{"id": 101}])
    evaluations_table.upsert.return_value = eval_upsert_query

    def table_router(table_name):
        if table_name == "job_listings":
            return listings_table
        elif table_name == "job_evaluations":
            return evaluations_table
        return MagicMock()

    mock_client.table.side_effect = table_router

    repo = SupabaseRepository(client=mock_client)
    assert isinstance(repo, JobRepository)

    listing = JobListing(
        source=JobSource.BUMERAN,
        title="Practicante de TI",
        company="BCP",
        url="https://bumeran.com.pe/job/10",
        raw_description="Automatización de procesos con Python.",
        published_at="2026-11-10",
    )

    # 1. Insert listing (new)
    row_id, is_new = repo.insert_listing(listing)
    assert row_id == 42
    assert is_new is True

    # Verify upsert call on job_listings with on_conflict="deduplication_hash"
    listings_table.upsert.assert_called_once()
    call_args, call_kwargs = listings_table.upsert.call_args
    upsert_payload = call_args[0]
    assert call_kwargs.get("on_conflict") == "deduplication_hash"
    assert upsert_payload["deduplication_hash"] == listing.deduplication_hash
    assert upsert_payload["resolved_brand_key"] == "bcp"
    assert upsert_payload["published_date"] == "2026-11-10"
    assert upsert_payload["status"] == "PENDING_EVALUATION"

    # 2. Insert evaluation
    eval_obj = JobEvaluation(
        is_pre_professional=True,
        is_unrealistic_or_smoke=False,
        technical_match_score=0.92,
        modality_score=1.0,
        location_score=0.8,
        final_ranking_score=88.5,
        matching_skills=["Python", "SQL"],
        missing_skills=["Docker"],
        verdict_summary="Excelente perfil para prácticas.",
        pitch_recommendation="Destacar proyectos en Python.",  # Obsolete field - MUST BE OMITTED
        reasoning=ReasoningChain(
            academic_eligibility="Estudiante de 8vo ciclo apto.",
            experience_requirements="Sin experiencia previa requerida.",
            tech_stack_overlap="Domina Python y bases de datos.",
            gaps_and_risks="Falta Docker pero es deseable.",
            score_rationale="Afinidad técnica muy alta.",
        ),
    )

    repo.insert_evaluation(listing_id=42, evaluation=eval_obj, profile_id=None)

    evaluations_table.upsert.assert_called_once()
    eval_args, eval_kwargs = evaluations_table.upsert.call_args
    eval_payload = eval_args[0]
    assert eval_kwargs.get("on_conflict") == "listing_id,profile_id"
    assert eval_payload["listing_id"] == 42
    assert eval_payload["profile_id"] is None
    assert "pitch_recommendation" not in eval_payload
    assert eval_payload["is_pre_professional"] is True
    assert eval_payload["technical_match_score"] == 0.92
    assert eval_payload["final_ranking_score"] == 88.5
    assert eval_payload["reasoning_chain"]["academic_eligibility"] == "Estudiante de 8vo ciclo apto."

    # Verify listing status updated to EVALUATED
    listings_table.update.assert_called_with({"status": "EVALUATED"})


def test_migrate_sqlite_to_supabase_dry_run():
    # Test CRM emoji mapping
    assert map_crm_status("📋 Por postular") == "to_apply"
    assert map_crm_status("⭐ Favorita") == "favorite"
    assert map_crm_status("🚀 Postulado") == "applied"
    assert map_crm_status("🎤 En entrevista") == "interview"
    assert map_crm_status("❌ Descartada por mí") == "discarded"
    assert map_crm_status("to_apply") == "to_apply"
    assert map_crm_status("unknown_status") == "to_apply"

    sample_catalog = {
        "version": "1.0",
        "total_listings": 2,
        "total_evaluations": 2,
        "listings": [
            {
                "deduplication_hash": "hash1",
                "source": "Bumeran",
                "title": "Practicante Sistemas",
                "company": "BCP",
                "location": "Lima",
                "modality": "Híbrido",
                "url": "https://example.com/1",
                "salary": None,
                "raw_description": "Desarrollo Python",
                "published_at": "2026-11-01",
                "crm": {
                    "status": "⭐ Favorita",
                    "applied_at": None,
                    "notes": "Postular el lunes",
                },
            },
            {
                "deduplication_hash": "hash2",
                "source": "LinkedIn",
                "title": "Data Intern",
                "company": "Interbank",
                "location": "Lima",
                "modality": "Remoto",
                "url": "https://example.com/2",
                "salary": "S/ 1,200",
                "raw_description": "SQL y PowerBI",
                "published_at": "2026-11-02",
                "crm": None,
            },
        ],
        "evaluations": [
            {
                "deduplication_hash": "hash1",
                "is_pre_professional": True,
                "is_unrealistic_or_smoke": False,
                "technical_match_score": 0.85,
                "modality_score": 1.0,
                "location_score": 1.0,
                "final_ranking_score": 90.0,
                "matching_skills": ["Python"],
                "missing_skills": [],
                "verdict_summary": "Recomendado",
                "reasoning_chain": None,
                "engine": "heuristic",
                "evaluated_at": "2026-11-01T12:00:00Z",
            }
        ],
    }

    mock_client = MagicMock()
    stats = run_migration(
        catalog_data=sample_catalog,
        supabase_client=mock_client,
        dry_run=True,
        owner_email="test@example.com",
    )

    assert stats["listings_count"] == 2
    assert stats["evaluations_count"] == 1
    assert stats["crm_states_count"] == 1
    assert stats["dry_run"] is True

    # In dry run, no database writes should occur
    mock_client.table.assert_not_called()
