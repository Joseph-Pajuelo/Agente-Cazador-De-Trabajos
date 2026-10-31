import pytest
from domain.models import JobListing, JobEvaluation
from domain.enums import JobSource, Modality

def test_job_listing_hash_computation():
    listing1 = JobListing(
        source=JobSource.PRACTICAS_PE,
        title="Practicante de Sistemas",
        company="Banco de Crédito BCP",
        url="https://example.com/bcp1",
        raw_description="Requisitos: SQL, Python."
    )
    hash1 = listing1.compute_hash()
    assert hash1 is not None
    assert len(hash1) == 64  # SHA-256 hex string

    # Mismo título y empresa con espacios distintos debe generar idéntico hash
    listing2 = JobListing(
        source=JobSource.BUMERAN,
        title="  practicante   de sistemas  ",
        company="banco de crédito BCP  ",
        url="https://example.com/bcp2",
        raw_description="Requisitos diferentes."
    )
    hash2 = listing2.compute_hash()
    assert hash1 == hash2

def test_job_evaluation_validation():
    eval_obj = JobEvaluation(
        is_pre_professional=True,
        is_unrealistic_or_smoke=False,
        technical_match_score=0.85,
        modality_score=1.0,
        location_score=0.9,
        final_ranking_score=88.5,
        matching_skills=["Python", "SQL"],
        missing_skills=["Docker"],
        verdict_summary="Excelente oportunidad.",
        pitch_recommendation="Elevator pitch."
    )
    assert eval_obj.technical_match_score <= 1.0
    assert eval_obj.final_ranking_score == 88.5

def test_job_evaluation_invalid_score_fails():
    with pytest.raises(ValueError):
        JobEvaluation(
            is_pre_professional=True,
            is_unrealistic_or_smoke=False,
            technical_match_score=1.5, # Invalido: ge=0.0, le=1.0
            verdict_summary="Error",
            pitch_recommendation="Error"
        )
