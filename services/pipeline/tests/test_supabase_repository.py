from datetime import datetime
from unittest.mock import MagicMock
import pytest

from domain.models import JobListing, JobEvaluation, ReasoningChain
from domain.enums import JobSource
from domain.ranking import is_job_recent
from storage.base import normalize_listing_enrichment, JobRepository
from storage.supabase_repo import SupabaseRepository


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

    listings_table = MagicMock()
    select_query = MagicMock()
    select_query.eq.return_value.execute.return_value = MagicMock(data=[])
    listings_table.select.return_value = select_query

    upsert_query = MagicMock()
    upsert_query.execute.return_value = MagicMock(data=[{"id": 42}])
    listings_table.upsert.return_value = upsert_query

    update_query = MagicMock()
    update_query.eq.return_value.execute.return_value = MagicMock(data=[{"id": 42}])
    listings_table.update.return_value = update_query

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
        company_logo_url="https://imgbum.jobscdn.com/bcp.jpg",
    )

    row_id, is_new = repo.insert_listing(listing)
    assert row_id == 42
    assert is_new is True

    listings_table.upsert.assert_called_once()
    call_args, call_kwargs = listings_table.upsert.call_args
    upsert_payload = call_args[0]
    assert call_kwargs.get("on_conflict") == "deduplication_hash"
    assert upsert_payload["deduplication_hash"] == listing.deduplication_hash
    assert upsert_payload["company_logo_url"] == "https://imgbum.jobscdn.com/bcp.jpg"
    assert upsert_payload["resolved_brand_key"] == "bcp"
    assert upsert_payload["published_date"] == "2026-11-10"
    assert upsert_payload["status"] == "PENDING_EVALUATION"

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

    listings_table.update.assert_called_with({"status": "EVALUATED"})


def test_supabase_repository_insert_listing_existing_does_not_upsert_or_reset_status():
    mock_client = MagicMock()
    listings_table = MagicMock()

    select_query = MagicMock()
    select_query.eq.return_value.execute.return_value = MagicMock(data=[{"id": 42}])
    listings_table.select.return_value = select_query

    mock_client.table.return_value = listings_table

    repo = SupabaseRepository(client=mock_client)
    listing = JobListing(
        source=JobSource.BUMERAN,
        title="Practicante de TI",
        company="BCP",
        url="https://bumeran.com.pe/job/10",
        raw_description="Automatización de procesos con Python.",
        published_at="2026-11-10",
    )

    row_id, is_new = repo.insert_listing(listing)

    assert row_id == 42
    assert is_new is False
    listings_table.upsert.assert_not_called()
    listings_table.insert.assert_not_called()


def test_supabase_repository_reset_evaluations_scoped_to_null_profile():
    mock_client = MagicMock()
    evaluations_table = MagicMock()
    listings_table = MagicMock()

    def table_router(table_name):
        if table_name == "job_evaluations":
            return evaluations_table
        elif table_name == "job_listings":
            return listings_table
        return MagicMock()

    mock_client.table.side_effect = table_router

    repo = SupabaseRepository(client=mock_client)
    repo.reset_evaluations()

    evaluations_table.delete.return_value.is_.assert_called_once_with("profile_id", "null")
    evaluations_table.delete.return_value.is_.return_value.execute.assert_called_once()


def test_supabase_repository_get_all_evaluated_jobs_scoped_to_null_profile():
    mock_client = MagicMock()
    evaluations_table = MagicMock()

    mock_client.table.return_value = evaluations_table
    evaluations_table.select.return_value.is_.return_value.order.return_value.execute.return_value = MagicMock(data=[])

    repo = SupabaseRepository(client=mock_client)
    repo.get_all_evaluated_jobs()

    evaluations_table.select.return_value.is_.assert_called_once_with("profile_id", "null")


def test_supabase_repository_strips_credentials_and_rejects_blank_env(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    with pytest.raises(ValueError, match="SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"):
        SupabaseRepository()

    monkeypatch.setenv("SUPABASE_URL", "   ")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "\n")
    with pytest.raises(ValueError, match="SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"):
        SupabaseRepository()

    created_args = {}

    def fake_create_client(url, key):
        created_args["url"] = url
        created_args["key"] = key
        return MagicMock()

    monkeypatch.setattr("supabase.create_client", fake_create_client)
    monkeypatch.setenv("SUPABASE_URL", "  https://demo.supabase.co\n")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "  service-role-secret  ")

    repo = SupabaseRepository()
    assert repo.url == "https://demo.supabase.co"
    assert repo.service_role_key == "service-role-secret"
    assert created_args == {
        "url": "https://demo.supabase.co",
        "key": "service-role-secret",
    }


def test_supabase_get_known_urls_paginates_past_1000():
    mock_client = MagicMock()
    page1 = [{"url": f"https://example.com/{i}"} for i in range(1000)]
    page2 = [{"url": f"https://example.com/{i}"} for i in range(1000, 1050)]

    table_mock = MagicMock()
    select_mock = MagicMock()
    range_mock_1 = MagicMock()
    range_mock_1.execute.return_value = MagicMock(data=page1)
    range_mock_2 = MagicMock()
    range_mock_2.execute.return_value = MagicMock(data=page2)
    select_mock.range.side_effect = [range_mock_1, range_mock_2]
    table_mock.select.return_value = select_mock
    mock_client.table.return_value = table_mock

    repo = SupabaseRepository(client=mock_client)
    urls = repo.get_known_urls()
    assert len(urls) == 1050
    assert "https://example.com/1049" in urls
    assert select_mock.range.call_count == 2


def test_supabase_purge_expired_listings_respects_21d_and_protected_ids():
    from datetime import timedelta, timezone

    mock_client = MagicMock()
    now_pe = datetime.now(timezone(timedelta(hours=-5)))
    recent_date = (now_pe - timedelta(days=5)).strftime("%Y-%m-%d")
    old_date = (now_pe - timedelta(days=25)).strftime("%Y-%m-%d")
    old_created = f"{old_date}T12:00:00Z"

    states_table = MagicMock()
    states_table.select.return_value.execute.return_value = MagicMock(
        data=[{"listing_id": 2}]
    )

    listings_table = MagicMock()
    listings_table.select.return_value.execute.return_value = MagicMock(
        data=[
            {"id": 1, "published_date": recent_date, "created_at": None},
            {"id": 2, "published_date": old_date, "created_at": None},  # protected by CRM state
            {"id": 3, "published_date": old_date, "created_at": None},  # expired
            {"id": 4, "published_date": None, "created_at": old_created},  # expired via created_at fallback
        ]
    )
    delete_in_mock = MagicMock()
    delete_in_mock.execute.return_value = MagicMock(data=[])
    listings_table.delete.return_value.in_.return_value = delete_in_mock

    def table_router(table_name):
        if table_name == "user_job_states":
            return states_table
        if table_name == "job_listings":
            return listings_table
        return MagicMock()

    mock_client.table.side_effect = table_router

    repo = SupabaseRepository(client=mock_client)
    purged = repo.purge_expired_listings(max_age_days=21)
    assert purged == 2
    listings_table.delete.return_value.in_.assert_called_once_with("id", [3, 4])
