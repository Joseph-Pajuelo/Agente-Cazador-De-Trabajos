from adapters.bumeran import BumeranAdapter
from adapters.linkedin import LinkedInGuestAdapter
from adapters.computrabajo import ComputrabajoAdapter
from adapters.cvmatcher import CVMatcherAdapter
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
            "confidencial": False,
            "localizacion": "San Isidro, Lima",
            "modalidadTrabajo": "Híbrido",
            "detalle": "<p>Buscamos estudiante de 8vo ciclo con conocimientos en Python, SQL y Power BI. S/ 1,300</p>",
            "fechaPublicacion": "30-10-2026",
        }
    ]
    parsed = BumeranAdapter.parse_api_items(mock_items)
    assert len(parsed) == 1
    assert parsed[0]["company"] == "SONDA"
    assert parsed[0]["modality"] == Modality.HIBRIDO
    assert parsed[0]["salary"] == "S/ 1,300"
    assert "Python" in parsed[0]["raw_description"]


def test_linkedin_parse_search_results():
    sample_html = """
    <ul>
      <li>
        <div data-entity-urn="urn:li:jobPosting:999888"></div>
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


def test_cvmatcher_parse_search_results():
    sample_html = """
    <div class="w-full shadow rounded-[20px]">
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
