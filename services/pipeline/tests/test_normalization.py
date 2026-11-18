from types import SimpleNamespace
from unittest.mock import MagicMock

from adapters.cvmatcher import CVMatcherAdapter
from adapters.practicas_pe import PracticasPeAdapter
from ai.matcher import JobMatcherAI
from domain.enums import JobSource, Modality
from domain.models import JobListing
from domain.normalization import (
    classify_systems_software_relevance,
    extract_category,
    extract_role_level,
    is_systems_software_relevant,
    normalize_job_metadata,
    strip_description_boilerplate,
)
from run import run_pipeline
from storage.base import normalize_listing_enrichment
from storage.supabase_repo import SupabaseRepository


def test_role_level_distinguishes_pro_egresado_from_preprofesional():
    # Live FINANTY PRO case (id=472)
    assert (
        extract_role_level(
            "Practicante PRO (profesional) de Inteligencia y Automatización",
            "Buscamos Egresado(a) de Ingeniería de Sistemas con Convenio de Prácticas Profesionales.",
        )
        == "profesional"
    )

    # English Intern title whose body specifies Prácticas Profesionales (id=136)
    assert (
        extract_role_level(
            "Software Developer - Intern - (Practicas Profesionales)",
            "Modalidad de Prácticas Profesionales. Para recién egresados de Ingeniería de Software.",
        )
        == "profesional"
    )

    # Typo in header ("Modalidad: Preprofesional") paired with "Formación académica: Egresado" (id=176)
    assert (
        extract_role_level(
            "Practicante de Sistemas",
            "Modalidad: Preprofesional. Formación académica: Egresado de Ingeniería Informática.",
        )
        == "profesional"
    )

    # Student 8th cycle case
    assert (
        extract_role_level(
            "Practicante Preprofesional de Ingeniería de Sistemas",
            "Estudiante universitario entre 6 a 8 ciclo de Ingeniería de Sistemas o Software. Python y SQL.",
        )
        == "preprofesional"
    )

    # Flexible student or recent graduate phrase (id=133)
    assert (
        extract_role_level(
            "Practicante de Desarrollo y TI",
            "Buscamos estudiante o recién egresado de Ingeniería de Sistemas con conocimiento en SQL.",
        )
        == "preprofesional"
    )


def test_boilerplate_stripping_prevents_false_student_or_data_category():
    raw_with_footer = (
        "Buscamos Egresado o Bachiller en Ingeniería de Software.\n"
        "Funciones: Desarrollo de APIs REST y microservicios backend en Java.\n"
        "Nota: De acuerdo a la Ley N° 29733 de Protección de Datos Personales...\n"
        "¿Eres estudiante? Únete a nuestro canal de WhatsApp para recibir prácticas preprofesionales.\n"
    )
    stripped = strip_description_boilerplate(raw_with_footer)
    assert "WhatsApp" not in stripped
    assert "29733" not in stripped
    assert extract_role_level("Desarrollador Backend", raw_with_footer) == "profesional"
    assert extract_category("Desarrollador Backend", raw_with_footer) == "Desarrollo & Software"


def test_systems_software_relevance_filters_marketing_senior_and_off_career():
    # Live Biznes Sac Marketing + GenAI media case (id=479)
    ok_biznes, reason_biznes = classify_systems_software_relevance(
        "Practicante de Creación de contenidos digitales con Inteligencia Artificial / Modalidad Híbrido",
        (
            "Requisitos: Estudiante de últimos ciclos o egresado(a) de Marketing, Comunicaciones, "
            "Publicidad, Diseño, Audiovisual o carreras afines. Herramientas: ChatGPT, Claude, Canva, "
            "CapCut, Midjourney, Runway, ElevenLabs, Reels, TikTok, n8n, Zapier."
        ),
        "computrabajo",
    )
    assert ok_biznes is False
    assert reason_biznes == "marketing_or_media_role"

    # Senior / management rejections
    assert is_systems_software_relevant("Subgerente de Sistemas TI", "Liderar área TI", "bumeran") is False
    assert is_systems_software_relevant("Senior Python Backend Engineer", "5 años de experiencia", "linkedin") is False

    # False positive "sistema" phrases
    assert (
        is_systems_software_relevant(
            "Practicante de Sistema Integrado de Gestión",
            "Estudiante de Ingeniería Ambiental o Seguridad y Salud en el Trabajo (SSOMA).",
            "practicas_pe",
        )
        is False
    )

    # Off-career rejection
    assert (
        is_systems_software_relevant(
            "Practicante Preprofesional de Contabilidad",
            "Estudiante de Contabilidad. Registro de facturas y conciliaciones bancarias.",
            "practicas_pe",
        )
        is False
    )

    # Genuine Systems / Software / Data / Security accepts
    assert (
        is_systems_software_relevant(
            "Practicante Preprofesional de Desarrollo de Software",
            "Estudiante de 8vo ciclo de Ingeniería de Software o Sistemas. React, TypeScript, Python y PostgreSQL.",
            "linkedin",
        )
        is True
    )
    assert (
        is_systems_software_relevant(
            "Practicante Preprofesional de Datos & BI",
            "Estudiante de Ingeniería de Sistemas o Ciencia de Datos. SQL, Python y Power BI.",
            "bumeran",
        )
        is True
    )


def test_enrichment_and_supabase_payload_persist_normalized_columns():
    listing = JobListing(
        source=JobSource.LINKEDIN,
        title="Practicante Preprofesional de Inteligencia Artificial y Ciencia de Datos",
        company="Interbank",
        location="San Isidro, Lima",
        modality=Modality.HIBRIDO,
        url="https://example.com/job/999",
        salary="S/ 1,500",
        raw_description=(
            "Estudiante universitario de 7mo a 9no ciclo de Ingeniería de Sistemas o Software. "
            "Python, FastAPI, SQL, Power BI y nivel de inglés intermedio."
        ),
    )
    enrichment = normalize_listing_enrichment(listing)
    assert enrichment["role_level"] == "preprofesional"
    assert enrichment["district"] == "San Isidro"
    assert enrichment["lima_zone"] == "Lima Moderna"
    assert enrichment["category"] == "Datos, BI & IA"
    assert enrichment["english_required"] is True
    assert enrichment["english_level"] == "intermedio"
    assert enrichment["salary_min"] == 1500
    assert enrichment["salary_max"] == 1500

    # Emoji and en-dash boundaries must normalize cleanly into spaces (ID=19 / ID=526 regression)
    emoji_meta = normalize_job_metadata(
        title="Technical Support L1 English speakers",
        location="Lima",
        raw_description="Fluent spoken English (B2–C1 English). Lugar de trabajo: Santa Anita🚀OFRECEMOS: S/ 1,400.",
    )
    assert emoji_meta["district"] == "Santa Anita"
    assert emoji_meta["lima_zone"] == "Lima Este"
    assert emoji_meta["english_required"] is True
    assert emoji_meta["english_level"] == "avanzado"

    # Verify SupabaseRepository persists normalized columns on insert
    repo = SupabaseRepository.__new__(SupabaseRepository)
    mock_client = MagicMock()
    table_mock = mock_client.table.return_value
    table_mock.select.return_value.eq.return_value.execute.return_value = SimpleNamespace(data=[])
    table_mock.upsert.return_value.execute.return_value = SimpleNamespace(data=[{"id": 999}])
    repo.client = mock_client

    inserted_id, is_new = repo.insert_listing(listing)
    assert inserted_id == 999
    assert is_new is True
    inserted_payload = table_mock.upsert.call_args[0][0]
    assert inserted_payload["role_level"] == "preprofesional"
    assert inserted_payload["category"] == "Datos, BI & IA"
    assert inserted_payload["district"] == "San Isidro"
    assert inserted_payload["lima_zone"] == "Lima Moderna"
    assert inserted_payload["salary_min"] == 1500


def test_heuristic_matcher_uses_strict_role_level():
    matcher = JobMatcherAI(api_key="")
    pro_listing = JobListing(
        source=JobSource.COMPUTRABAJO,
        title="Practicante PRO (profesional) de Inteligencia y Automatización",
        company="FINANTY S.A.",
        location="San Isidro, Lima",
        modality=Modality.PRESENCIAL,
        url="https://example.com/pro",
        raw_description="Egresado de Ingeniería de Sistemas. Convenio de prácticas profesionales.",
    )
    pro_eval = matcher._evaluate_heuristic(pro_listing, {"name": "Student"})
    assert pro_eval.is_pre_professional is False

    pre_listing = JobListing(
        source=JobSource.LINKEDIN,
        title="Practicante Preprofesional de Ingeniería de Software",
        company="BCP",
        location="La Molina, Lima",
        modality=Modality.HIBRIDO,
        url="https://example.com/pre",
        raw_description="Estudiante de 8vo ciclo de Ingeniería de Software. Python, SQL, React.",
    )
    pre_eval = matcher._evaluate_heuristic(pre_listing, {"name": "Student"})
    assert pre_eval.is_pre_professional is True


def test_adapter_scoping_and_pipeline_off_career_filtering(monkeypatch, tmp_path):
    assert "https://www.practicas.pe/pre-profesional-region-lima-15.html" not in PracticasPeAdapter.CATEGORY_URLS

    cv_kw = CVMatcherAdapter().keywords
    assert "practica" not in cv_kw
    assert "practicante" not in cv_kw
    assert "ingenieria" not in cv_kw
    assert "analista" not in cv_kw
    for expected in (
        "practicante sistemas",
        "practicante software",
        "practicante datos",
        "practicante ti",
        "practicante ciberseguridad",
    ):
        assert expected in cv_kw

    fake_listings = [
        JobListing(
            source=JobSource.COMPUTRABAJO,
            title="Practicante de Creación de contenidos digitales con Inteligencia Artificial",
            company="Biznes Sac",
            location="La Victoria, Lima",
            modality=Modality.HIBRIDO,
            url="https://example.com/biznes",
            raw_description="Estudiante de Marketing, Comunicaciones o Publicidad. Canva, CapCut, TikTok, Reels.",
        ),
        JobListing(
            source=JobSource.BUMERAN,
            title="Subgerente de Tecnología",
            company="Empresa X",
            location="San Isidro, Lima",
            modality=Modality.PRESENCIAL,
            url="https://example.com/subgerente",
            raw_description="Liderar área de sistemas y presupuestos TI.",
        ),
        JobListing(
            source=JobSource.LINKEDIN,
            title="Practicante Preprofesional de Ingeniería de Sistemas",
            company="Tech Peru",
            location="Surco, Lima",
            modality=Modality.HIBRIDO,
            url="https://example.com/tech-ok",
            raw_description="Estudiante de 8vo ciclo de Ingeniería de Sistemas. Python, SQL, Power BI, Git.",
        ),
    ]

    class FakeAdapter:
        name = "FakePortal"

        def fetch_listings(self, limit=40, known_urls=None):
            return fake_listings

    from storage.sqlite_repo import SqliteRepository

    test_repo = SqliteRepository(db_path=str(tmp_path / "pipeline_filter_test.db"))
    monkeypatch.setattr("run.get_adapters", lambda: [FakeAdapter()])
    monkeypatch.setattr("run.get_repository", lambda backend="sqlite": test_repo)
    monkeypatch.setenv("GEMINI_API_KEY", "")

    summary = run_pipeline(
        limit_per_source=10,
        backend="sqlite",
    )
    assert summary["extracted"] == 3
    assert summary["filtered_off_career"] == 2
    assert summary["new"] == 1
    assert summary["evaluated"] == 1
