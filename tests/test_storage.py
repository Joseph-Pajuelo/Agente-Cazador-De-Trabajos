import gc
import os
import tempfile
import pytest
from storage.database import DatabaseManager
from domain.models import JobListing, JobEvaluation
from domain.enums import JobSource, Modality

@pytest.fixture
def temp_db():
    temp_dir = tempfile.mkdtemp()
    db_file = os.path.join(temp_dir, "test_jobs.db")
    db = DatabaseManager(db_path=db_file)
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
    listing = JobListing(
        source=JobSource.PRACTICAS_PE,
        title="Practicante de Automatización",
        company="BCP",
        url="https://practicas.pe/1",
        raw_description="Python y Power BI"
    )

    id1, is_new1 = temp_db.insert_listing(listing)
    assert is_new1 is True
    assert id1 is not None

    id2, is_new2 = temp_db.insert_listing(listing)
    assert is_new2 is False
    assert id2 == id1

def test_evaluation_workflow(temp_db):
    listing = JobListing(
        source=JobSource.PRACTICAS_PE,
        title="Practicante de Datos",
        company="Interbank",
        url="https://practicas.pe/2",
        raw_description="SQL y Excel"
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
        matching_skills=["SQL", "Excel"],
        missing_skills=[],
        verdict_summary="Afinidad perfecta con el perfil.",
        pitch_recommendation="Postulación recomendada."
    )
    temp_db.insert_evaluation(listing_id, eval_obj)

    pending_after = temp_db.get_pending_listings()
    assert len(pending_after) == 0

    top = temp_db.get_top_ranked_jobs(min_score=80.0)
    assert len(top) == 1
    assert top[0]["company"] == "Interbank"
    assert top[0]["application_status"] == "📋 Por postular"

    # Probar actualización de seguimiento (Postulado + Notas)
    temp_db.update_application_status(listing_id, "🚀 Postulado", notes="Envié CV de Datos")
    all_jobs = temp_db.get_all_evaluated_jobs()
    assert all_jobs[0]["application_status"] == "🚀 Postulado"
    assert all_jobs[0]["user_notes"] == "Envié CV de Datos"
    assert all_jobs[0]["applied_at"] is not None
