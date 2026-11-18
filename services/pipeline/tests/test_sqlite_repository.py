import gc
import os
import tempfile
import pytest
from storage.sqlite_repo import SqliteRepository
from storage.base import JobRepository
from domain.models import JobListing, JobEvaluation
from domain.enums import JobSource


@pytest.fixture
def temp_db():
    temp_dir = tempfile.mkdtemp()
    db_file = os.path.join(temp_dir, "test_jobs.db")
    db = SqliteRepository(db_path=db_file)
    yield db
    gc.collect()
    try:
        if os.path.exists(db_file):
            os.remove(db_file)
        wal_file = db_file + "-wal"
        shm_file = db_file + "-shm"
        if os.path.exists(wal_file):
            os.remove(wal_file)
        if os.path.exists(shm_file):
            os.remove(shm_file)
        os.rmdir(temp_dir)
    except Exception:
        pass


def test_insert_and_deduplication(temp_db):
    assert isinstance(temp_db, JobRepository)
    listing = JobListing(
        source=JobSource.PRACTICAS_PE,
        title="Practicante de Automatización",
        company="BCP",
        url="https://practicas.pe/1",
        raw_description="Python y Power BI en San Isidro",
    )

    id1, is_new1 = temp_db.insert_listing(listing)
    assert is_new1 is True
    assert id1 is not None

    id2, is_new2 = temp_db.insert_listing(listing)
    assert is_new2 is False
    assert id2 == id1


def test_evaluation_workflow_and_normalized_columns(temp_db):
    listing = JobListing(
        source=JobSource.PRACTICAS_PE,
        title="Practicante Preprofesional de Datos",
        company="Interbank",
        location="San Isidro, Lima",
        salary="S/ 1,500",
        url="https://practicas.pe/2",
        raw_description="Estudiante de Ingeniería de Sistemas. SQL, Python e Inglés intermedio.",
    )
    listing_id, _ = temp_db.insert_listing(listing)

    pending = temp_db.get_pending_listings()
    assert len(pending) == 1
    assert pending[0][0] == listing_id

    eval_obj = JobEvaluation(
        is_pre_professional=True,
        is_unrealistic_or_smoke=False,
        technical_match_score=0.9,
        modality_score=1.0,
        location_score=1.0,
        final_ranking_score=93.0,
        matching_skills=["SQL", "Python"],
        missing_skills=[],
        verdict_summary="Afinidad excelente con el perfil.",
    )
    temp_db.insert_evaluation(listing_id, eval_obj)

    pending_after = temp_db.get_pending_listings()
    assert len(pending_after) == 0

    all_jobs = temp_db.get_all_evaluated_jobs()
    assert len(all_jobs) == 1
    job = all_jobs[0]
    assert job["company"] == "Interbank"
    assert job["resolved_brand_key"] == "interbank"
    assert job["district"] == "San Isidro"
    assert job["lima_zone"] == "Lima Moderna"
    assert job["role_level"] == "preprofesional"
    assert job["english_required"] == 1
    assert job["salary_min"] == 1500
    assert job["final_ranking_score"] == 93.0
