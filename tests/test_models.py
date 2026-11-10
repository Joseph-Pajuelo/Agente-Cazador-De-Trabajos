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


def test_smart_search_agency_and_typos():
    from domain.search_engine import search_jobs

    sample_jobs = [
        {
            "id": 1,
            "title": "Practicante de Ingeniería de Datos",
            "company": "BANCO DE CREDITO(BCP)",
            "location": "La Molina, Lima",
            "modality": "Híbrido",
            "matching_skills": '["Python", "SQL"]',
            "raw_description": "Prácticas preprofesionales con Python y SQL en BCP.",
            "final_ranking_score": 90.0,
        },
        {
            "id": 2,
            "title": "Practicante Preprofesional de Ingeniería — Sector Banca",
            "company": "ManpowerGroup",
            "location": "Lima",
            "modality": "Híbrido",
            "matching_skills": '["Excel"]',
            "raw_description": "Únete a nuestra convocatoria en el banco más grande del Perú.",
            "final_ranking_score": 82.0,
        },
    ]

    # 1. Buscar "bcp" debe traer tanto la directa del BCP como la de ManpowerGroup para "el banco más grande del Perú"
    res_bcp = search_jobs(sample_jobs, "bcp")
    assert len(res_bcp.jobs) == 2
    assert res_bcp.agency_matches_count == 1
    assert res_bcp.jobs[1]["_search_note"] is not None

    # 2. Buscar con error ortográfico ("phyton") debe corregir a "python" y encontrar la vacante #1
    res_typo = search_jobs(sample_jobs, "phyton")
    assert res_typo.corrected_query == "python"
    assert len(res_typo.jobs) == 1
    assert res_typo.jobs[0]["id"] == 1

