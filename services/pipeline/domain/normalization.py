"""
Deterministic Lima job metadata normalizer and Sistemas/Software relevance filter.
Mirrors apps/web/src/lib/domain/jobNormalization.ts for single-source consistency
across Python ingestion, evaluation pre-filtering, and Supabase storage.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any, Dict, List, Optional, Tuple

LIMA_DISTRICTS: Tuple[str, ...] = (
    "San Isidro",
    "Miraflores",
    "Santiago de Surco",
    "San Borja",
    "La Molina",
    "Jesús María",
    "Magdalena del Mar",
    "Lince",
    "Pueblo Libre",
    "San Miguel",
    "Barranco",
    "Surquillo",
    "Lima Centro",
    "La Victoria",
    "Breña",
    "Rímac",
    "Ate",
    "Santa Anita",
    "San Juan de Lurigancho",
    "Lurigancho - Chosica",
    "Los Olivos",
    "Independencia",
    "San Martín de Porres",
    "Chorrillos",
    "San Juan de Miraflores",
    "Villa María del Triunfo",
    "Villa El Salvador",
    "Callao",
    "Lurín / Balnearios",
    "Remoto",
    "Lima Metropolitana",
)

LIMA_ZONES_BY_DISTRICT: Dict[str, str] = {
    "San Isidro": "Lima Moderna",
    "Miraflores": "Lima Moderna",
    "Santiago de Surco": "Lima Moderna",
    "San Borja": "Lima Moderna",
    "La Molina": "Lima Moderna",
    "Jesús María": "Lima Moderna",
    "Magdalena del Mar": "Lima Moderna",
    "Lince": "Lima Moderna",
    "Pueblo Libre": "Lima Moderna",
    "San Miguel": "Lima Moderna",
    "Barranco": "Lima Moderna",
    "Surquillo": "Lima Moderna",
    "Lima Centro": "Lima Centro",
    "La Victoria": "Lima Centro",
    "Breña": "Lima Centro",
    "Rímac": "Lima Centro",
    "Ate": "Lima Este",
    "Santa Anita": "Lima Este",
    "San Juan de Lurigancho": "Lima Este",
    "Lurigancho - Chosica": "Lima Este",
    "Los Olivos": "Lima Norte",
    "Independencia": "Lima Norte",
    "San Martín de Porres": "Lima Norte",
    "Chorrillos": "Lima Sur",
    "San Juan de Miraflores": "Lima Sur",
    "Villa María del Triunfo": "Lima Sur",
    "Villa El Salvador": "Lima Sur",
    "Callao": "Callao",
    "Lurín / Balnearios": "Lima Sur",
    "Remoto": "Remoto",
    "Lima Metropolitana": "Lima Metropolitana",
}

DISTRICT_RULES: List[Dict[str, Any]] = [
    {
        "canonical": "Santiago de Surco",
        "patterns": [
            re.compile(r"\bsantiago de surco\b"),
            re.compile(r"\bsurco\b"),
            re.compile(r"\bchacarilla\b"),
            re.compile(r"\bmonterrico\b"),
            re.compile(r"\bel polo\b"),
        ],
    },
    {
        "canonical": "San Juan de Miraflores",
        "patterns": [re.compile(r"\bsan juan de miraflores\b")],
        "acronyms": [re.compile(r"\bsjm\b")],
    },
    {
        "canonical": "San Juan de Lurigancho",
        "patterns": [re.compile(r"\bsan juan de lurigancho\b")],
        "acronyms": [re.compile(r"\bsjl\b")],
    },
    {
        "canonical": "Lurigancho - Chosica",
        "patterns": [
            re.compile(r"\blurigancho\b"),
            re.compile(r"\bchosica\b"),
            re.compile(r"\bsanta maria de huachipa\b"),
            re.compile(r"\bhuachipa\b"),
        ],
    },
    {
        "canonical": "San Martín de Porres",
        "patterns": [re.compile(r"\bsan martin de porres\b"), re.compile(r"\bsan martin de porras\b")],
        "acronyms": [re.compile(r"\bsmp\b")],
    },
    {
        "canonical": "Villa María del Triunfo",
        "patterns": [re.compile(r"\bvilla maria del triunfo\b")],
        "acronyms": [re.compile(r"\bvmt\b")],
    },
    {
        "canonical": "Villa El Salvador",
        "patterns": [re.compile(r"\bvilla el salvador\b")],
        "acronyms": [re.compile(r"\bves\b")],
    },
    {
        "canonical": "Magdalena del Mar",
        "patterns": [re.compile(r"\bmagdalena del mar\b"), re.compile(r"\bmagdalena\b")],
    },
    {"canonical": "Pueblo Libre", "patterns": [re.compile(r"\bpueblo libre\b")]},
    {"canonical": "Jesús María", "patterns": [re.compile(r"\bjesus maria\b")]},
    {
        "canonical": "San Isidro",
        "patterns": [
            re.compile(r"\bsan isidro\b"),
            re.compile(r"\bsanhattan\b"),
            re.compile(r"\bcamino real\b"),
            re.compile(r"\bcanaval y moreyra\b"),
            re.compile(r"\brivera navarrete\b"),
        ],
    },
    {"canonical": "San Borja", "patterns": [re.compile(r"\bsan borja\b")]},
    {"canonical": "San Miguel", "patterns": [re.compile(r"\bsan miguel\b")]},
    {"canonical": "Santa Anita", "patterns": [re.compile(r"\bsanta anita\b")]},
    {"canonical": "Los Olivos", "patterns": [re.compile(r"\blos olivos\b")]},
    {"canonical": "La Molina", "patterns": [re.compile(r"\bla molina\b")]},
    {
        "canonical": "La Victoria",
        "patterns": [re.compile(r"\bla victoria\b"), re.compile(r"\bsanta catalina\b"), re.compile(r"\bgamarra\b")],
    },
    {
        "canonical": "Lima Centro",
        "patterns": [
            re.compile(r"\bcercado de lima\b"),
            re.compile(r"\bcercado\b"),
            re.compile(r"\blima centro\b"),
            re.compile(r"\bcentro de lima\b"),
        ],
    },
    {
        "canonical": "Lurín / Balnearios",
        "patterns": [
            re.compile(r"\blurin\b"),
            re.compile(r"\bpunta negra\b"),
            re.compile(r"\bpunta hermosa\b"),
            re.compile(r"\bsan bartolo\b"),
            re.compile(r"\bsanta maria del mar\b"),
            re.compile(r"\bpucusana\b"),
            re.compile(r"\bpachacamac\b"),
        ],
    },
    {
        "canonical": "Callao",
        "patterns": [
            re.compile(r"\bgobierno regional del callao\b"),
            re.compile(r"\bcallao\b"),
            re.compile(r"\bbellavista\b"),
            re.compile(r"\bla perla\b"),
            re.compile(r"\bla punta\b"),
            re.compile(r"\bcarmen de la legua\b"),
            re.compile(r"\bventanilla\b"),
        ],
    },
    {
        "canonical": "Ate",
        "patterns": [
            re.compile(r"\bate vitarte\b"),
            re.compile(r"\bvitarte\b"),
            re.compile(r"\bcarretera central\b.*?\bate\b"),
            re.compile(r"\bate\b.*?carretera central\b"),
            re.compile(r"\bate\b"),
        ],
    },
    {"canonical": "Miraflores", "patterns": [re.compile(r"\bmiraflores\b")]},
    {"canonical": "Lince", "patterns": [re.compile(r"\blince\b")]},
    {"canonical": "Surquillo", "patterns": [re.compile(r"\bsurquillo\b")]},
    {"canonical": "Barranco", "patterns": [re.compile(r"\bbarranco\b")]},
    {"canonical": "Independencia", "patterns": [re.compile(r"\bindependencia\b")]},
    {"canonical": "Chorrillos", "patterns": [re.compile(r"\bchorrillos\b")]},
    {"canonical": "Breña", "patterns": [re.compile(r"\bbrena\b")]},
    {"canonical": "Rímac", "patterns": [re.compile(r"\brimac\b")]},
]

GENERIC_LOCATION_PATTERNS = (
    re.compile(r"^lima peru$"),
    re.compile(r"^lima lima$"),
    re.compile(r"^lima$"),
    re.compile(r"^peru$"),
    re.compile(r"^provincia de lima peru$"),
    re.compile(r"^provincia de lima$"),
    re.compile(r"^area metropolitana de lima$"),
)

CATEGORY_RULES: List[Dict[str, Any]] = [
    {
        "category": "Datos, BI & IA",
        "keywords": [
            "datos",
            "data",
            "business intelligence",
            "bi",
            "analytics",
            "analitica",
            "inteligencia artificial",
            "ia",
            "machine learning",
            "power bi",
            "sql",
            "etl",
            "big data",
            "data science",
            "ciencia de datos",
            "data engineer",
            "ingeniero de datos",
            "tableau",
            "base de datos",
            "bases de datos",
        ],
    },
    {
        "category": "Desarrollo & Software",
        "keywords": [
            "desarrollo",
            "software",
            "programador",
            "developer",
            "full stack",
            "fullstack",
            "frontend",
            "backend",
            "web",
            "mobile",
            "react",
            "node",
            "python",
            "java",
            "flutter",
            "devops",
            "qa",
            "testing",
            "sw",
            "aplicaciones",
            "microservicios",
            "api",
        ],
    },
    {
        "category": "Sistemas & TI",
        "keywords": [
            "sistemas",
            "ti",
            "it",
            "tecnologias de la informacion",
            "tecnologia de la informacion",
            "soporte tecnico",
            "soporte digital",
            "help desk",
            "redes",
            "infraestructura",
            "seguridad informatica",
            "ciberseguridad",
            "cloud",
            "servidores",
            "sysadmin",
            "telecomunicaciones",
        ],
    },
    {
        "category": "Administración, Banca & Finanzas",
        "keywords": [
            "administracion",
            "finanzas",
            "contabilidad",
            "banca",
            "creditos",
            "riesgos",
            "recursos humanos",
            "rrhh",
            "gestion humana",
            "talento",
            "compras",
            "tesoreria",
            "wealth management",
            "inversionistas",
            "contable",
            "tributario",
            "auditoria",
            "control de asistencia",
            "servicios generales",
            "gestion patrimonial",
            "registros y academicos",
            "planeamiento comercial",
        ],
    },
    {
        "category": "Ingeniería & Operaciones",
        "keywords": [
            "operaciones",
            "ingenieria industrial",
            "procesos",
            "logistica",
            "calidad",
            "produccion",
            "almacen",
            "cadena de suministro",
            "supply chain",
            "mejora continua",
            "mantenimiento",
        ],
    },
]

# Precompiled regexes for description-first role level & Systems/Software relevance
STRIP_SPLITS = (
    re.compile(r"\n\s*Te sugerimos\s*:", re.IGNORECASE),
    re.compile(r"\n\s*Recomendaciones para postular\b", re.IGNORECASE),
    re.compile(r"¿Eres estudiante\?\s*Únete a nuestro canal", re.IGNORECASE),
)

STRIP_SUBS = (
    re.compile(r"Nota:\s*CVMatcher[^\n]*", re.IGNORECASE),
    re.compile(r"ley\s+(?:de\s+protecci[oó]n\s+de\s+datos\s+personales[^\n.]*|n[°º]?\s*29733[^\n.]*)", re.IGNORECASE),
    re.compile(r"protecci[oó]n\s+de\s+datos\s+personales[^\n.]*", re.IGNORECASE),
    re.compile(r"tratamiento\s+de\s+(?:sus\s+)?datos\s+personales[^\n.]*", re.IGNORECASE),
    re.compile(r"banco\s+de\s+datos\s+(?:personales|de\s+postulantes)[^\n.]*", re.IGNORECASE),
    re.compile(
        r"experiencia(?:\s+previa)?(?:\s+(?:minima|min|deseable))?(?:\s+de[^\n.;,]*)?\s+(?:como|en)\s+practicante\s+pre\s*-?\s*profesional(?:es)?",
        re.IGNORECASE,
    ),
    re.compile(r"mediante\s+pr[aá]cticas\s+pre\s*-?\s*profesional(?:es)?", re.IGNORECASE),
    re.compile(r"haber\s+realizado\s+pr[aá]cticas\s+pre\s*-?\s*profesional(?:es)?", re.IGNORECASE),
)

SENIOR_MANAGEMENT_TITLE_RE = re.compile(
    r"\b(subgerente|sub\s+gte|gerente|jefe|subdirector|director|semi\s+senior|ssr|senior|sr|lead|tech\s+lead|lider\s+tecnico|principal|staff|architect|arquitecto)\b"
)
EXPLICIT_CS_SW_CAREER_RE = re.compile(
    r"\b("
    r"ing(?:enieria)?\s+(?:de\s+|en\s+)?sistemas(?:\s+e\s+informatica|\s+y\s+computacion)?|"
    r"sistemas\s+e\s+informatica|"
    r"ing(?:enieria)?\s+(?:de\s+|en\s+)?software|"
    r"ing(?:enieria)?\s+informatica(?:\s+y\s+de\s+sistemas)?|"
    r"ing(?:enieria)?\s+(?:de\s+|en\s+)?computacion(?:\s+e\s+informatica|\s+y\s+sistemas)?|"
    r"ciencias?\s+de\s+la\s+computacion|computer\s+science|ciencia\s+de\s+datos|data\s+science|"
    r"computacion\s+e\s+informatica|informatica|"
    r"carreras?\s+afines\s+a\s+(?:la\s+)?tecnologia|"
    r"ing(?:enieria)?\s+(?:de\s+)?telecomunicaciones\s+y\s+(?:redes|sistemas)|"
    r"ing(?:enieria)?\s+empresarial\s+y\s+de\s+sistemas|"
    r"tecnologias?\s+de\s+(?:la\s+)?informacion|information\s+technology|"
    r"ciberseguridad|seguridad\s+informatica|redes\s+y\s+comunicaciones"
    r")\b"
)
FALSE_SYSTEMS_PHRASES_RE = re.compile(
    r"\b("
    r"sistema\s+integrado\s+de\s+gestion|sistemas\s+integrados\s+de\s+gestion|"
    r"sistemas\s+de\s+bombeo|sistemas\s+hidraulicos|sistemas\s+de\s+riego|"
    r"sistemas\s+electricos|sistemas\s+de\s+puesta\s+a\s+tierra|sistemas\s+mecanicos|"
    r"sistemas\s+contables|sistema\s+contable|sistemas\s+tributarios|"
    r"sistema\s+de\s+gestion\s+de\s+seguridad\s+y\s+salud|sistema\s+de\s+gestion\s+de\s+calidad|"
    r"sistema\s+de\s+gestion\s+ambiental|sistemas\s+de\s+refrigeracion|sistemas\s+contra\s+incendio|"
    r"sistemas\s+de\s+informacion\s+geografica"
    r")\b"
)
EXPLICIT_NON_IT_CAREER_RE = re.compile(
    r"\b("
    r"marketing|comunicaciones|publicidad|diseno\s+grafico|audiovisual|periodismo|relaciones\s+publicas|"
    r"contabilidad|contable|tributacion|tributaria|auditoria\s+financiera|cuentas\s+por\s+pagar|cobranzas|tesoreria|"
    r"derecho|abogado|legal|regulatorio|"
    r"psicologia|recursos\s+humanos|gestion\s+humana|talento\s+humano|bienestar\s+social|seleccion\s+de\s+personal|remuneraciones|"
    r"electricista|mecanico|mecanica\s+automotriz|electrotecnia|soldador|todista|gasfiteria|albanil|"
    r"textil|tintoreria|confeccion|patronaje|moda|"
    r"odontologia|enfermeria|medicina|farmacia|nutricion|obstetricia|veterinaria|"
    r"turismo|hoteleria|gastronomia|cocina|"
    r"arquitectura\s+de\s+interiores|diseno\s+de\s+interiores|museologia|artes\s+plastica|conservacion\s+ambiental|trabajo\s+social|docente|educacion"
    r")\b"
)
GENAI_MEDIA_MARKETING_RE = re.compile(
    r"\b(canva|capcut|midjourney|runway|elevenlabs|reels|tiktok|youtube\s+shorts|creacion\s+de\s+contenidos|edicion\s+de\s+videos|diseno\s+grafico|redes\s+sociales|copies|guiones)\b"
)
STRONG_TECH_TITLE_RE = re.compile(
    r"\b("
    r"desarrollador|developer|software|backend|frontend|full\s*stack|fullstack|mobile|android|ios|flutter|"
    r"devops|sre|cloud|aws|azure|gcp|kubernetes|docker|"
    r"data\s+engineer|data\s+analyst|data\s+scientist|data\s+science|ciencia\s+de\s+datos|ingenier[oa]\s+de\s+datos|analista\s+de\s+datos|business\s+intelligence|bi|power\s+bi|etl|"
    r"machine\s+learning|deep\s+learning|ciberseguridad|cybersecurity|seguridad\s+informatica|riesgo\s+tecnologico|resiliencia\s+operacional|auditoria\s+(?:de\s+)?sistemas|"
    r"qa|quality\s+assurance|testing\s+de\s+software|automatizacion\s+de\s+pruebas|tester|"
    r"soporte\s+ti|soporte\s+tecnico|mesa\s+de\s+ayuda|help\s+desk|it\s+operations|it\s+support|sysadmin|"
    r"tecnologias?\s+de\s+(?:la\s+)?informacion|infraestructura\s+ti|redes\s+y\s+comunicaciones|"
    r"programador|sistemas|ti|it|erp|sap|rpa|power\s+platform|power\s+automate|inteligencia\s+artificial|automatizacion\s+de\s+procesos|bases?\s+de\s+datos"
    r")\b"
)
STRONG_TECH_STACK_RE = re.compile(
    r"\b("
    r"python|java|javascript|typescript|react|angular|vue|node\s*js|nextjs|next\s+js|c#|dotnet|net\s+core|php|laravel|golang|elixir|rust|kotlin|swift|"
    r"sql|sql\s+server|postgresql|mysql|oracle|mongodb|nosql|bigquery|snowflake|databricks|microsoft\s+fabric|pyspark|airflow|etl|"
    r"power\s+bi|power\s+automate|power\s+apps|looker\s+studio|tableau|qlik|"
    r"api\s+rest|apis\s+rest|postman|graphql|microservices|microservicios|"
    r"git|github|gitlab|ci\s+cd|jenkins|docker|kubernetes|terraform|linux|servicenow|jira|istqb|selenium|jmeter|sonarqube|"
    r"uipath|blue\s+prism|automation\s+anywhere|rpa|sap\s+abap|sap\s+basis|active\s+directory|vmware|cisco|fortinet|siem|iso\s+27001|nist|owasp|pentesting"
    r")\b"
)
CORE_DEV_DATA_ENG_STACK_RE = re.compile(
    r"\b(python|java|javascript|typescript|react|angular|node\s*js|c#|dotnet|php|golang|elixir|rust|sql|sql\s+server|postgresql|mysql|mongodb|databricks|microsoft\s+fabric|pyspark|airflow|etl|docker|kubernetes|git|istqb|selenium|sonarqube|api\s+rest|apis\s+rest|linux|uipath|rpa)\b"
)


def normalize_text(text: Optional[str]) -> str:
    """Lowercases, removes accents, and collapses non-alphanumeric characters into single spaces."""
    if not text:
        return ""
    decomposed = "".join(
        ch for ch in unicodedata.normalize("NFD", text) if unicodedata.category(ch) != "Mn"
    )
    alnum = re.sub(r"[^a-z0-9]+", " ", decomposed.lower())
    return re.sub(r"\s+", " ", alnum).strip()


def strip_description_boilerplate(raw_description: Optional[str]) -> str:
    """Removes portal footers, habeas data disclaimers, and past-experience false positives."""
    if not raw_description:
        return ""
    cleaned = raw_description
    for split_pat in STRIP_SPLITS:
        cleaned = split_pat.split(cleaned, maxsplit=1)[0]
    for sub_pat in STRIP_SUBS:
        cleaned = sub_pat.sub(" ", cleaned)
    return cleaned


def _find_district_in_text(norm_text: str, allow_acronyms: bool = True) -> Optional[str]:
    if not norm_text:
        return None
    for rule in DISTRICT_RULES:
        for pattern in rule["patterns"]:
            if pattern.search(norm_text):
                return rule["canonical"]
        if allow_acronyms and "acronyms" in rule:
            for acr in rule["acronyms"]:
                if acr.search(norm_text):
                    return rule["canonical"]
    return None


def _clean_location_noise(raw_location: Optional[str]) -> str:
    if not raw_location:
        return ""
    trimmed = raw_location.strip()
    if re.match(r"^\d+([.,]\d+)?$", trimmed):
        return ""
    norm = normalize_text(trimmed)
    for gen in GENERIC_LOCATION_PATTERNS:
        if gen.match(norm):
            return ""
    return norm


def extract_lima_district_and_zone(
    title: Optional[str] = None,
    location: Optional[str] = None,
    modality: Optional[str] = None,
    raw_description: Optional[str] = None,
) -> Dict[str, str]:
    """Extracts canonical Lima district and Lima zone from job text."""
    cleaned_loc = _clean_location_noise(location)
    norm_title = normalize_text(title)
    norm_desc = normalize_text(raw_description)
    norm_modality = normalize_text(modality)

    found_district = _find_district_in_text(cleaned_loc, allow_acronyms=True)
    if not found_district:
        found_district = _find_district_in_text(norm_title, allow_acronyms=True)
    if not found_district:
        found_district = _find_district_in_text(norm_desc, allow_acronyms=False)

    if found_district:
        return {
            "district": found_district,
            "lima_zone": LIMA_ZONES_BY_DISTRICT.get(found_district, "Lima Metropolitana"),
        }

    norm_loc = normalize_text(location)
    is_remote = (
        "remoto" in norm_modality
        or "remoto" in cleaned_loc
        or "teletrabajo" in cleaned_loc
        or "remoto" in norm_loc
        or "teletrabajo" in norm_loc
    )
    if is_remote:
        return {"district": "Remoto", "lima_zone": "Remoto"}

    return {"district": "Lima Metropolitana", "lima_zone": "Lima Metropolitana"}


def _parse_bounded_pen_number(raw: str) -> Optional[int]:
    cleaned = re.sub(r"\s+", "", raw)
    try:
        if "," in cleaned and "." in cleaned:
            if cleaned.index(".") < cleaned.index(","):
                val = float(cleaned.replace(".", "").replace(",", "."))
            else:
                val = float(cleaned.replace(",", ""))
        elif "," in cleaned:
            parts = cleaned.split(",")
            if len(parts) == 2 and len(parts[1]) == 3:
                val = float("".join(parts))
            else:
                val = float(cleaned.replace(",", "."))
        elif "." in cleaned:
            parts = cleaned.split(".")
            if len(parts) == 2 and len(parts[1]) == 3:
                val = float("".join(parts))
            else:
                val = float(cleaned)
        else:
            val = float(cleaned)
    except ValueError:
        return None

    rounded = int(round(val))
    if 800 <= rounded <= 12000:
        return rounded
    return None


def extract_salary_pen(
    salary: Optional[str] = None,
    raw_description: Optional[str] = None,
) -> Dict[str, Optional[int]]:
    """Extracts monthly PEN salary range [salary_min, salary_max] within [800, 12000]."""
    if salary and isinstance(salary, str):
        raw = salary.strip()
        is_hourly_or_annual = bool(re.search(r"(?:hora|/hr|/h\b|hour|anual|al año|año\b|year)", raw, re.IGNORECASE))
        is_vague = bool(re.search(r"(?:convenir|confidencial|tratar|especificado)", raw, re.IGNORECASE))

        if not is_hourly_or_annual and not is_vague:
            range_match = re.search(
                r"([0-9]+[0-9.,]*)\s*(?:-|a|al|hasta)\s*(?:s/\.?|s\.)?\s*([0-9]+[0-9.,]*)",
                raw,
                re.IGNORECASE,
            )
            if range_match:
                min_val = _parse_bounded_pen_number(range_match.group(1))
                max_val = _parse_bounded_pen_number(range_match.group(2))
                if min_val is not None and max_val is not None:
                    return {"salary_min": min(min_val, max_val), "salary_max": max(min_val, max_val)}

            single_match = re.search(r"([0-9]+[0-9.,]*)", raw)
            if single_match:
                val = _parse_bounded_pen_number(single_match.group(1))
                if val is not None:
                    return {"salary_min": val, "salary_max": val}

    if raw_description and isinstance(raw_description, str):
        context_regex = re.compile(
            r"(?:subvenci[oó]n|sueldo|remuneraci[oó]n|salario)\s*(?:econ[oó]mica|mensual|b[aá]sico)?\s*(?:de|en|:)?\s*(?:s/\.?|s\.)?\s*([0-9]+[0-9.,]*)(?:\s*(?:-|a)\s*(?:s/\.?|s\.)?\s*([0-9]+[0-9.,]*))?",
            re.IGNORECASE,
        )
        for match in context_regex.finditer(raw_description):
            win_start = max(0, match.start() - 20)
            win_end = min(len(raw_description), match.end() + 20)
            win_text = raw_description[win_start:win_end]
            if re.search(r"(?:hora|/hr|/h\b|hour|anual|al año|año\b|year)", win_text, re.IGNORECASE):
                continue

            num1 = _parse_bounded_pen_number(match.group(1))
            if match.group(2):
                num2 = _parse_bounded_pen_number(match.group(2))
                if num1 is not None and num2 is not None:
                    return {"salary_min": min(num1, num2), "salary_max": max(num1, num2)}
            elif num1 is not None:
                return {"salary_min": num1, "salary_max": num1}

    return {"salary_min": None, "salary_max": None}


def extract_role_level(title: Optional[str] = None, raw_description: Optional[str] = None) -> str:
    """Extracts role level strictly from title and boilerplate-stripped full description."""
    norm_title = normalize_text(title)
    norm_desc = normalize_text(strip_description_boilerplate(raw_description))

    is_title_pro = bool(re.search(
        r"\b(practicante\s+profesional|practicante\s+pro\b|practicas\s+profesionales|practica\s+profesional|profesional|egresado|egresados|egresada|egresadas|bachiller|bachilleres|graduado|titulado|asistente|analista|consultor|consultora|tester|especialista|coordinador|jefe|supervisor|subgerente|sub\s+gte|gerente|arquitecto|semi\s+senior|senior|ingenier[oa]\s+(?:de\s+software|de\s+sistemas)|ingenierio|software\s+engineer|administrador\s+de\s+servidores|operador\s+de\s+sistemas|tecnico\s+de\s+soporte|technical\s+support)\b",
        norm_title,
    ))
    is_title_trainee_jr = bool(re.search(r"\b(trainee|junior|jr|entry\s+level|joven\s+talento)\b", norm_title))
    is_title_pre_explicit = bool(re.search(
        r"\b(preprofesional|pre\s+profesional|preprof|practicas\s+pre|practica\s+pre)\b",
        norm_title,
    ))
    is_title_intern = bool(re.search(r"\b(intern|internship|pasante|pasantia)\b", norm_title))
    is_title_practicante = bool(re.search(r"\b(practicante|practicantes|practicas|practica|pasante|intern)\b", norm_title))

    if is_title_pro and not is_title_pre_explicit:
        if is_title_trainee_jr and not re.search(r"\b(profesional|pro|egresad|bachiller|jefe|gerente|subgerente|senior)\b", norm_title):
            return "trainee_junior"
        return "profesional"

    if is_title_pre_explicit:
        return "preprofesional"

    if is_title_trainee_jr:
        return "trainee_junior"

    if is_title_intern:
        if re.search(
            r"\b(modalidad\s+(?:de\s+)?practicas\s+profesional|practicas\s+profesionales|convenio\s+de\s+practicas\s+profesionales)\b",
            norm_desc,
        ) and not re.search(r"\b(preprofesional|pre\s+profesional)\b", norm_desc):
            return "profesional"
        return "preprofesional"

    has_desc_pro = bool(re.search(
        r"\b(practicante\s+profesional|practicas\s+profesionales|practica\s+profesional|convenio\s+de\s+practicas\s+profesionales|egresado|egresados|egresada|egresadas|bachiller|bachilleres|graduado|titulado|recien\s+egresad[oa]s?)\b",
        norm_desc,
    )) and not bool(re.search(r"\b(no\s+egresado|sin\s+egresar|abstenerse\s+egresados)\b", norm_desc))

    desc_no_pro_conv = re.sub(r"\bconvenio\s+de\s+practicas\s+profesional(?:es)?\b", " ", norm_desc)
    has_desc_pre = bool(re.search(
        r"\b("
        r"preprofesional|preprofesionales|pre\s+profesional|pre\s+profesionales|practicas\s+pre|practica\s+pre|"
        r"convenio\s+de\s+practicas\s+pre\s*profesional(?:es)?|"
        r"estudiante\s+(?:universitario|universitaria|tecnico|actual|de|en|entre|desde|o\s+(?:recien\s+)?egresad[oa]s?|y\s+o\s+(?:recien\s+)?egresad[oa]s?)|"
        r"estudiantes\s+(?:universitarios|universitarias|tecnicos|actuales|de|en|entre|desde)|"
        r"ultimos\s+ciclos|cursando|alumnos\s+de|formacion\s+en\s+curso|estudios\s+(?:universitarios\s+|tecnicos\s+)?en\s+curso|"
        r"6to|7mo|8vo|9no|10mo|6\s+a\s+8\s+ciclo|7\s+a\s+9\s+ciclo|7\s+a\s+10\s+ciclo|8\s+a\s+10\s+ciclo|"
        r"sexto\s+ciclo|septimo\s+ciclo|octavo\s+ciclo|noveno\s+ciclo|decimo\s+ciclo|"
        r"constancia\s+de\s+estudios|pursuing\s+a\s+(?:bachelor|technical|computer|degree)|currently\s+pursuing|university\s+student"
        r")\b",
        desc_no_pro_conv,
    ))

    has_mod_pre = bool(re.search(r"\bmodalidad\s+(?:de\s+)?(?:practicas\s+)?pre\s*profesional(?:es)?\b", norm_desc))
    has_mod_pro = bool(re.search(r"\bmodalidad\s+(?:de\s+)?practicas\s+profesional(?:es)?\b", norm_desc))
    if has_mod_pro and not has_mod_pre:
        return "profesional"
    if has_mod_pre:
        if re.search(r"\bformacion\s+academica\s+egresad[oa]\b", norm_desc) and not re.search(r"\bestudiante\b", desc_no_pro_conv):
            return "profesional"
        return "preprofesional"

    has_desc_trainee_jr = bool(re.search(
        r"\b(trainee|programa\s+trainee|junior|jr|entry\s+level|jovenes\s+talentos|joven\s+talento)\b",
        norm_desc,
    ))

    if not is_title_practicante and re.search(
        r"\b(?:1|2|3)\s+anos?\s+de\s+experiencia\b|\bexperiencia\s+desde\s+6\s+meses\b",
        norm_desc,
    ):
        return "trainee_junior" if has_desc_trainee_jr else "profesional"

    if has_desc_pro and not has_desc_pre:
        return "profesional"
    if has_desc_pre and not has_desc_pro:
        return "preprofesional"
    if has_desc_pre and has_desc_pro:
        if re.search(r"\bconvenio\s+de\s+practicas\s+profesionales\b", norm_desc) and not re.search(
            r"\b(preprofesional|pre\s+profesional)\b",
            norm_desc,
        ):
            return "profesional"
        if re.search(
            r"\bbusqueda\s+de\s+(?:un|una|un\s+a)\s+practicante\s+profesional\b|\bocupar\s+la\s+posicion\s+de\s+practicante\s+profesional\b",
            norm_desc,
        ):
            return "profesional"
        return "preprofesional"
    if has_desc_trainee_jr:
        return "trainee_junior"

    return "unknown"


def extract_english_requirement(
    title: Optional[str] = None,
    raw_description: Optional[str] = None,
) -> Dict[str, Any]:
    """Extracts English requirement and level ('basico' | 'intermedio' | 'avanzado' | None)."""
    full_text = f"{normalize_text(title)} {normalize_text(raw_description)}".strip()

    if not re.search(r"\b(ingles|english|bilingue|bilingual)\b", full_text):
        return {"english_required": False, "english_level": None}

    if re.search(r"\b(no\s+requerido|no\s+indispensable|sin\s+requisito\s+de\s+ingles|no\s+necesario)\b", full_text):
        return {"english_required": False, "english_level": None}

    if re.search(r"\b(bilingue|bilingual)\b", full_text):
        return {"english_required": True, "english_level": "avanzado"}

    advanced_patterns = (
        r"\b(ingles|english)\b[\w\s/-]{0,25}\b(avanzado|advanced|fluido|fluent|c1|c2|full\s+professional\s+proficiency)\b",
        r"\b(advanced|fluent)\s+english\b",
        r"\b(avanzado|fluido)\s+en\s+(ingles|english)\b",
        r"\b(nivel|dominio|manejo)\s+(avanzado|fluido)\s+(de\s+)?(ingles|english)\b",
        r"\b(c1|c2)\s+(en\s+|de\s+)?(ingles|english)\b",
    )
    for pat in advanced_patterns:
        if re.search(pat, full_text):
            return {"english_required": True, "english_level": "avanzado"}

    intermediate_patterns = (
        r"\b(ingles|english)\b[\w\s/-]{0,25}\b(intermedio|intermediate|b1|b2|professional\s+working\s+proficiency)\b",
        r"\b(intermediate)\s+english\b",
        r"\bintermedio\s+en\s+(ingles|english)\b",
        r"\b(nivel|dominio|manejo)\s+intermedio\s+(de\s+)?(ingles|english)\b",
        r"\b(b1|b2)\s+(en\s+|de\s+)?(ingles|english)\b",
    )
    for pat in intermediate_patterns:
        if re.search(pat, full_text):
            return {"english_required": True, "english_level": "intermedio"}

    basic_patterns = (
        r"\b(ingles|english)\b[\w\s/-]{0,25}\b(basico|basic|tecnico|lector|a1|a2)\b",
        r"\b(basic)\s+english\b",
        r"\bbasico\s+en\s+(ingles|english)\b",
        r"\b(nivel|dominio|manejo)\s+(basico|tecnico)\s+(de\s+)?(ingles|english)\b",
        r"\b(a1|a2)\s+(en\s+|de\s+)?(ingles|english)\b",
    )
    for pat in basic_patterns:
        if re.search(pat, full_text):
            return {"english_required": True, "english_level": "basico"}

    return {"english_required": True, "english_level": None}


def extract_category(title: Optional[str] = None, raw_description: Optional[str] = None) -> str:
    """Extracts weighted job category across title (5x) and boilerplate-stripped description (1x)."""
    norm_title = normalize_text(title)
    norm_desc = normalize_text(strip_description_boilerplate(raw_description))

    best_category = "Sistemas & TI"
    max_score = 0

    for rule in CATEGORY_RULES:
        score = 0
        for kw in rule["keywords"]:
            kw_re = re.compile(rf"\b{re.escape(kw)}\b", re.IGNORECASE)
            if kw_re.search(norm_title):
                score += 5
            if kw_re.search(norm_desc):
                score += 1
        if score > max_score:
            max_score = score
            best_category = rule["category"]

    return best_category


def classify_systems_software_relevance(
    title: Optional[str],
    raw_description: Optional[str],
    source: Optional[str] = None,
) -> Tuple[bool, str]:
    """
    Determines whether a listing matches Ingeniería de Sistemas / Ingeniería de Software
    (or closely aligned IT/Data/Cloud/Security/QA roles), returning (is_relevant, reason_code).
    """
    clean_desc = strip_description_boilerplate(raw_description)
    title_norm = FALSE_SYSTEMS_PHRASES_RE.sub(" ", normalize_text(title))
    desc_norm = FALSE_SYSTEMS_PHRASES_RE.sub(" ", normalize_text(clean_desc))
    combined = f"{title_norm} {desc_norm}".strip()

    if SENIOR_MANAGEMENT_TITLE_RE.search(title_norm) or re.search(r"\b(engineer\s+ii|specialist)\b", title_norm):
        return False, "senior_or_management_title"

    has_explicit_cs_career = bool(EXPLICIT_CS_SW_CAREER_RE.search(combined))
    non_it_title = bool(EXPLICIT_NON_IT_CAREER_RE.search(title_norm))
    non_it_desc = bool(EXPLICIT_NON_IT_CAREER_RE.search(desc_norm))
    tech_title = bool(STRONG_TECH_TITLE_RE.search(title_norm))
    stack_hits = set(STRONG_TECH_STACK_RE.findall(combined))
    core_eng_hits = set(CORE_DEV_DATA_ENG_STACK_RE.findall(combined))

    if (
        GENAI_MEDIA_MARKETING_RE.search(combined)
        and non_it_desc
        and not re.search(
            r"\b(ing(?:enieria)?\s+(?:de\s+)?sistemas|ing(?:enieria)?\s+(?:de\s+)?software|ing(?:enieria)?\s+informatica|computacion|desarrollo\s+de\s+software|programacion|sql)\b",
            combined,
        )
    ):
        return False, "marketing_or_media_role"

    if non_it_title:
        if has_explicit_cs_career and re.search(r"\b(area\s+sistemas|sistemas|ti|software|datos)\b", title_norm):
            return True, "hybrid_with_explicit_cs_area"
        if re.search(r"\b(auditoria\s+de\s+sistemas|rpa)\b", title_norm):
            return True, "it_audit_or_rpa"
        return False, "off_career_title"

    acad_match = re.search(
        r"(formacion\s+academica|carreras?\s+profesional(?:es)?|carrera(?:s)?\s+de|estudiante(?:s)?\s+(?:universitario(?:s)?\s+|tecnico\s+o\s+universitario\s+)?(?:de|desde|en|entre|del|o\s+(?:recien\s+)?egresad)[^.]{0,180}|egresad[oa](?:s)?\s+(?:de|en)[^.]{0,180})",
        desc_norm,
    )
    acad_snippet = acad_match.group(1) if acad_match else ""
    acad_has_cs = bool(EXPLICIT_CS_SW_CAREER_RE.search(acad_snippet))

    if has_explicit_cs_career:
        if (
            not tech_title
            and len(stack_hits) == 0
            and not re.search(
                r"\b(software|programacion|base(?:s)?\s+de\s+datos|sql|python|power\s+bi|redes|servidores|soporte\s+tecnico|mesa\s+de\s+ayuda|desarrollo\s+web|analisis\s+de\s+datos|ciberseguridad|infraestructura|automatizacion|sistemas?\s+informatico)\b",
                combined,
            )
        ):
            return False, "gov_admin_role_despite_broad_cs_list"
        if (
            GENAI_MEDIA_MARKETING_RE.search(combined)
            and len(core_eng_hits) == 0
            and not re.search(
                r"\b(ing(?:enieria)?\s+(?:de\s+)?sistemas|ing(?:enieria)?\s+(?:de\s+)?software|computacion|informatica)\b",
                combined,
            )
        ):
            return False, "marketing_or_media_role"
        return True, "explicit_cs_sw_it_career"

    if non_it_desc and len(core_eng_hits) < 2 and not tech_title:
        return False, "off_career_desc_no_cs_or_stack"

    if len(core_eng_hits) >= 3 or (len(core_eng_hits) >= 2 and tech_title):
        return True, "strong_core_eng_stack"

    if acad_snippet and not acad_has_cs:
        if re.search(
            r"\b(desarrollador|developer|software|backend|frontend|full\s*stack|data\s+engineer|devops|ciberseguridad|infraestructura\s+ti|sistemas)\b",
            title_norm,
        ):
            return True, "strong_sw_data_title_despite_career_omission"
        return False, "career_excludes_cs_sw"

    if re.search(
        r"\b(desarrollador|developer|software|backend|frontend|full\s*stack|devops|cloud|data\s+analyst|data\s+engineer|data\s+scientist|ciberseguridad|seguridad\s+informatica|riesgo\s+tecnologico|resiliencia\s+operacional|soporte\s+ti|mesa\s+de\s+ayuda|help\s+desk|it\s+operations|it\s+support|sysadmin|tecnologias?\s+de\s+la\s+informacion|programador|qa|tester|sistemas|ti)\b",
        title_norm,
    ):
        if stack_hits or re.search(
            r"\b(software|ti|it\s+service|it\s+operations|tecnolog|redes|servidores|riesgos\s+ti|ciber|cloud|base(?:s)?\s+de\s+datos|desarrollo\s+web|documentacion\s+tecnica|quality\s+assurance|pruebas\s+funcionales)\b",
            combined,
        ):
            return True, "tech_title_plus_tech_context"
        if (
            source == "cvmatcher"
            and re.search(r"\b(practica|practicante|egresado|asistente|analista|operador)\b", title_norm)
            and re.search(
                r"\b(sistemas|auditoria\s+de\s+sistemas|inteligencia\s+artificial|bases?\s+de\s+datos|datos|seguridad\s+de\s+sistemas|negocios\s+it|soporte\s+ti)\b",
                title_norm,
            )
        ):
            return True, "cvmatcher_concise_it_title"

    if len(stack_hits) >= 2 and not non_it_desc:
        return True, "multi_tech_stack"

    return False, "insufficient_cs_sw_relevance"


def is_systems_software_relevant(
    title: Optional[str],
    raw_description: Optional[str],
    source: Optional[str] = None,
) -> bool:
    """Boolean predicate wrapper around classify_systems_software_relevance."""
    relevant, _ = classify_systems_software_relevance(title, raw_description, source)
    return relevant


def normalize_job_metadata(
    title: Optional[str] = None,
    company: Optional[str] = None,
    location: Optional[str] = None,
    modality: Optional[str] = None,
    salary: Optional[str] = None,
    raw_description: Optional[str] = None,
) -> Dict[str, Any]:
    """Computes full normalized metadata dict matching Postgres job_listings columns."""
    del company  # kept for signature parity with TypeScript JobNormalizationInput
    loc = extract_lima_district_and_zone(
        title=title,
        location=location,
        modality=modality,
        raw_description=raw_description,
    )
    sal = extract_salary_pen(salary=salary, raw_description=raw_description)
    eng = extract_english_requirement(title=title, raw_description=raw_description)
    return {
        "district": loc["district"],
        "lima_zone": loc["lima_zone"],
        "category": extract_category(title=title, raw_description=raw_description),
        "role_level": extract_role_level(title=title, raw_description=raw_description),
        "english_required": eng["english_required"],
        "english_level": eng["english_level"],
        "salary_min": sal["salary_min"],
        "salary_max": sal["salary_max"],
    }
