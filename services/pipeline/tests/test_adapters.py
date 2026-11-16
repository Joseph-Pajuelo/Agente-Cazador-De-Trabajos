from adapters.bumeran import BumeranAdapter
from adapters.linkedin import LinkedInGuestAdapter
from adapters.computrabajo import ComputrabajoAdapter
from adapters.cvmatcher import CVMatcherAdapter
from adapters.practicas_pe import PracticasPeAdapter
from bs4 import BeautifulSoup
from ai.matcher import JobMatcherAI
from config.candidate_profile import CANDIDATE_PROFILE
from domain.enums import JobSource, Modality
from domain.models import JobListing


def test_bumeran_parse_api_items():
    mock_items = [
        {
            "id": 1118484847,
            "titulo": "Practicante Pre Profesional de Sistemas",
            "empresa": "SONDA",
            "logoURL": "https://imgbum.jobscdn.com/portal/img/empresas/11/static/logo_sonda.jpg",
            "confidencial": False,
            "localizacion": "San Isidro, Lima",
            "modalidadTrabajo": "Híbrido",
            "detalle": "<p>Buscamos estudiante de 8vo ciclo con conocimientos en Python, SQL y Power BI. S/ 1,300</p>",
            "fechaPublicacion": "30-10-2026",
        },
        {
            "id": 1118484848,
            "titulo": "Practicante de TI",
            "empresa": "Empresa Privada",
            "logoURL": "https://imgbum.jobscdn.com/portal/img/empresas/11/static/logo_secret.jpg",
            "confidencial": True,
            "localizacion": "Lima",
            "modalidadTrabajo": "Presencial",
            "detalle": "<p>Estudiante de Sistemas</p>",
            "fechaPublicacion": "30-10-2026",
        },
    ]
    parsed = BumeranAdapter.parse_api_items(mock_items)
    assert len(parsed) == 2
    assert parsed[0]["company"] == "SONDA"
    assert parsed[0]["company_logo_url"] == "https://imgbum.jobscdn.com/portal/img/empresas/11/static/logo_sonda.jpg"
    assert parsed[0]["modality"] == Modality.HIBRIDO
    assert parsed[0]["salary"] == "S/ 1,300"
    assert "Python" in parsed[0]["raw_description"]
    assert parsed[1]["company"] == "Empresa confidencial"
    assert parsed[1]["company_logo_url"] is None


def test_linkedin_parse_search_results():
    sample_html = """
    <ul>
      <li>
        <div data-entity-urn="urn:li:jobPosting:999888"></div>
        <img class="artdeco-entity-image" data-delayed-url="https://media.licdn.com/dms/image/v2/interbank/company-logo_100_100/logo"/>
        <h3 class="base-search-card__title">Practicante de Datos e IA</h3>
        <h4 class="base-search-card__subtitle">Interbank</h4>
        <span class="job-search-card__location">La Victoria, Lima, Perú</span>
        <a class="base-card__full-link" href="https://pe.linkedin.com/jobs/view/999888?trk=123">Ver</a>
      </li>
    </ul>
    """
    results = LinkedInGuestAdapter.parse_search_results(sample_html)
    assert len(results) == 1
    assert results[0]["job_id"] == "999888"
    assert results[0]["company"] == "Interbank"
    assert results[0]["company_logo_url"] == "https://media.licdn.com/dms/image/v2/interbank/company-logo_100_100/logo"
    assert results[0]["location"] == "La Victoria, Lima, Perú"


def test_computrabajo_parse_search_results():
    sample_html = """
    <article class="box_offer" data-id="ABC123">
      <h2><a href="/ofertas-de-trabajo/practicante-sistemas-ABC123#lc=1">Practicante Preprofesional de TI</a></h2>
      <p><a offer-grid-article-company-url="" href="#">BCP</a></p>
      <p class="fs16"><span class="mr10">La Molina, Lima</span></p>
    </article>
    """
    results = ComputrabajoAdapter.parse_search_results(sample_html)
    assert len(results) == 1
    assert results[0]["offer_id"] == "ABC123"
    assert results[0]["company"] == "BCP"
    assert results[0]["location"] == "La Molina, Lima"

    detail_html = '<div><img src="//ii.ct-stc.com/3/logos/empresas/2026/j v resguardos.png"/></div>'
    assert (
        ComputrabajoAdapter.parse_detail_logo(detail_html)
        == "https://ii.ct-stc.com/3/logos/empresas/2026/j%20v%20resguardos.png"
    )


def test_cvmatcher_parse_search_results():
    sample_html = """
    <div class="w-full shadow rounded-[20px]">
      <img alt="Logo de Alicorp" src="https://imgbum.jobscdn.com/alicorp.jpg"/>
      <h4>Practicante Pre Profesional de Datos</h4>
      <p>Alicorp</p>
      <p>Lima</p>
      <a href="https://dashboard.cvmatcher.app/jobs/practicante-datos-123">Ver oferta</a>
      <img alt="Fuente del empleo" src="https://example.com/sources/bumeran.webp"/>
    </div>
    """
    results = CVMatcherAdapter.parse_search_results(sample_html)
    assert len(results) == 1
    assert results[0]["company"] == "Alicorp"
    assert results[0]["company_logo_url"] == "https://imgbum.jobscdn.com/alicorp.jpg"
    assert results[0]["origin"] == "bumeran"


def test_matcher_distinguishes_preprofesional_vs_profesional():
    matcher = JobMatcherAI(api_key=None)  # Forzar evaluación determinista

    # Caso 1: Practicante Profesional (Egresado) -> debe ser descartado como no preprofesional
    prof_job = JobListing(
        source=JobSource.LINKEDIN,
        title="Practicante Profesional de Sistemas",
        company="Salog",
        location="Callao, Lima",
        modality=Modality.PRESENCIAL,
        url="https://linkedin.com/jobs/view/1",
        raw_description="Requisitos: Egresado o Bachiller de Ingeniería de Sistemas.",
    )
    eval_prof = matcher._evaluate_heuristic(prof_job, CANDIDATE_PROFILE)
    assert eval_prof.is_pre_professional is False

    # Caso 1B: Variantes como "Practicante Pro", "(Egresados)" o "Modalidad: Profesional" deben descartarse rigurosamente
    egresado_title_job = JobListing(
        source=JobSource.PRACTICAS_PE,
        title="Practicante de Análisis de datos (Egresados)",
        company="UTP",
        location="Lima",
        modality=Modality.HIBRIDO,
        url="https://practicas.pe/1.html",
        raw_description="Estudios universitarios en carreras afines. Power BI y Excel.",
    )
    assert matcher._evaluate_heuristic(egresado_title_job, CANDIDATE_PROFILE).is_pre_professional is False

    practicante_pro_job = JobListing(
        source=JobSource.BUMERAN,
        title="Practicante Pro de Automatización",
        company="Movistar",
        location="Lima",
        modality=Modality.HIBRIDO,
        url="https://bumeran.com.pe/pro.html",
        raw_description="Buscamos practicante pro para automatización de procesos.",
    )
    assert matcher._evaluate_heuristic(practicante_pro_job, CANDIDATE_PROFILE).is_pre_professional is False

    mod_profesional_job = JobListing(
        source=JobSource.PRACTICAS_PE,
        title="Practicante de Sistemas",
        company="Entidad Pública",
        location="Lima",
        modality=Modality.PRESENCIAL,
        url="https://practicas.pe/2.html",
        raw_description="Requisitos:\nModalidad de prácticas: Profesional\nFormación: Egresado de Sistemas.",
    )
    assert matcher._evaluate_heuristic(mod_profesional_job, CANDIDATE_PROFILE).is_pre_professional is False

    # Caso 2: Practicante Preprofesional en La Molina con modalidad Híbrida -> alto puntaje y apto
    pre_job = JobListing(
        source=JobSource.BUMERAN,
        title="Practicante Pre Profesional de Automatización y Datos",
        company="BCP",
        location="La Molina, Lima",
        modality=Modality.HIBRIDO,
        url="https://bumeran.com.pe/empleos/2.html",
        raw_description="Estudiante de 7mo u 8vo ciclo de Ingeniería de Sistemas. Python, SQL, Power BI, Excel.",
    )
    eval_pre = matcher._evaluate_heuristic(pre_job, CANDIDATE_PROFILE)
    assert eval_pre.is_pre_professional is True
    assert eval_pre.modality_score == 1.0
    assert eval_pre.location_score == 1.0
    assert eval_pre.final_ranking_score >= 85.0


def test_practicas_pe_extract_description_skips_promo_alert_article():
    html = """
    <main>
      <article>
        <p>Alerta Informativa</p>
        <p>Diploma GRATUITO de especialización profesional ISO 27001</p>
      </article>
      <article>
        <h3>Requisitos</h3>
        <p>Estudiante universitario 8° ciclo de Ingeniería de Sistemas. Conocimiento en Python y SQL.</p>
        <h3>Condiciones del contrato</h3>
        <p>Subvención: S/ 1,300.00 soles</p>
      </article>
    </main>
    """
    soup = BeautifulSoup(html, "html.parser")
    extracted = PracticasPeAdapter.extract_description(soup)
    assert "Alerta Informativa" not in extracted
    assert "Requisitos" in extracted
    assert "Subvención: S/ 1,300.00 soles" in extracted


def test_candidate_pre_filter_and_relative_dates():
    from datetime import datetime
    from adapters.base import (
        extract_json_ld_date_posted,
        is_within_max_age_days,
        parse_relative_es_date,
        should_skip_candidate_title,
    )
    from domain.normalization import classify_systems_software_relevance

    # Skips graduated, regular, senior, and clear non-IT titles
    assert should_skip_candidate_title("Practicante Profesional de Sistemas") is True
    assert should_skip_candidate_title("Junior Software Engineer") is True
    assert should_skip_candidate_title("Practicante de Tesorería") is True
    assert should_skip_candidate_title("Practicante de Contabilidad") is True
    assert should_skip_candidate_title("Practicante de Sistema Integrado de Gestión / Lurin") is True
    assert should_skip_candidate_title("Banquero Beyond") is True

    # Keeps preprofesional, ambiguous IT, and generic internship titles
    assert should_skip_candidate_title("Practicante Pre Profesional de Sistemas") is False
    assert should_skip_candidate_title("Practicante de TI (Soporte)") is False
    assert should_skip_candidate_title("Practicante Pre o Pro de Desarrollo Web") is False
    assert should_skip_candidate_title("Practicante de Análisis de Datos") is False
    assert should_skip_candidate_title("Practicante de Operaciones") is False

    ref = datetime(2026, 11, 16, 18, 0, 0)
    assert parse_relative_es_date("Hoy", now=ref) == "2026-11-16"
    assert parse_relative_es_date("Ayer", now=ref) == "2026-11-15"
    assert parse_relative_es_date("Hace  2  días", now=ref) == "2026-11-14"
    assert is_within_max_age_days("2026-11-10", max_days=14, now=ref) is True
    assert is_within_max_age_days("2026-10-25", max_days=14, now=ref) is False
    assert extract_json_ld_date_posted('{"datePosted": "2026-11-16 16:21:17"}') == "2026-11-16"

    # CVMatcher keeps practicante keywords and accepts concise Data/BI internship titles
    cvm = CVMatcherAdapter()
    assert any("practicante" in kw for kw in cvm.keywords)
    rel, reason = classify_systems_software_relevance(
        "Practicante de Análisis de Datos - SANNA Clínica San Borja",
        "Nota: CVMatcher solo expone el resumen.",
        "cvmatcher",
    )
    assert rel is True
    assert reason == "cvmatcher_concise_it_title"

    # GenAI content creation title is still rejected even without description
    rel_media, reason_media = classify_systems_software_relevance(
        "Practicante de Creación de contenidos digitales con Inteligencia Artificial",
        "Nota: CVMatcher solo expone el resumen.",
        "cvmatcher",
    )
    assert rel_media is False
    assert reason_media == "marketing_or_media_role"

