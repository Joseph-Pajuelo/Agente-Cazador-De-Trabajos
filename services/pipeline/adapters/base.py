from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone
from typing import List, Optional
import logging
import re
import time

import httpx

from domain.models import JobListing
from domain.enums import Modality

logger = logging.getLogger(__name__)

_PERU_TZ = timezone(timedelta(hours=-5))

_INTERNSHIP_MARKER_RE = re.compile(
    r"\b("
    r"practicante|practicantes|practicas|practica|"
    r"intern|internship|pasante|pasantia|becari[oa]|"
    r"preprofesional|pre\s*profesional|preprof|trainee"
    r")\b"
)

_NON_IT_PRACTICE_TITLE_RE = re.compile(
    r"\b("
    r"sst|seguridad\s+y\s+salud\s+en\s+el\s+trabajo|hse|ssoma|"
    r"logistica|almacen|supply\s+chain|despacho|comercio\s+exterior|aduanas|pricing\s+freight|"
    r"electricidad|electrotecnia|mecanica|refrigeracion|soldadura|mantenimiento\s+industrial|"
    r"quimica|biologia|farmacia|agronomia|ingenieria\s+civil|arquitectura|mineria|"
    r"recursos\s+humanos|rrhh|hrbp|talento\s+humano|seleccion\s+de\s+personal|"
    r"comercial|ventas|trade\s+marketing|community\s+manager|diseno\s+grafico|"
    r"sistema\s+integrado\s+de\s+gestion|sistemas\s+integrados\s+de\s+gestion"
    r")\b"
)


def detect_modality(text: str) -> Modality:
    """Detecta modalidad a partir de texto libre (heurística compartida por todos los adapters)."""
    lower = text.lower()
    if any(k in lower for k in ("híbrido", "hibrido", "híbrida", "hibrida", "semipresencial", "presencial y remoto")):
        return Modality.HIBRIDO
    if any(k in lower for k in ("remoto", "home office", "teletrabajo", "100% virtual")):
        return Modality.REMOTO
    if "presencial" in lower:
        return Modality.PRESENCIAL
    return Modality.DESCONOCIDO


def parse_relative_es_date(text: Optional[str], now: Optional[datetime] = None) -> Optional[str]:
    """Convierte etiquetas relativas ('Hoy', 'Ayer', 'Hace 2 días', 'Hace 4 horas') a YYYY-MM-DD."""
    if not text:
        return None
    cleaned = " ".join(str(text).split()).strip().lower()
    if not cleaned:
        return None

    iso_match = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", cleaned)
    if iso_match:
        return iso_match.group(1)

    ref = now or datetime.now(_PERU_TZ)
    if "hoy" in cleaned or "recien" in cleaned or "recién" in cleaned or "minuto" in cleaned or "hora" in cleaned:
        return ref.strftime("%Y-%m-%d")
    if "ayer" in cleaned:
        return (ref - timedelta(days=1)).strftime("%Y-%m-%d")

    days_match = re.search(r"hace\s+(?:\+\s*)?(\d+)\s+d[ií]a", cleaned)
    if days_match:
        days = int(days_match.group(1))
        return (ref - timedelta(days=days)).strftime("%Y-%m-%d")

    weeks_match = re.search(r"hace\s+(?:\+\s*)?(\d+)\s+semana", cleaned)
    if weeks_match:
        weeks = int(weeks_match.group(1))
        return (ref - timedelta(days=weeks * 7)).strftime("%Y-%m-%d")

    return None


def extract_json_ld_date_posted(html: Optional[str]) -> Optional[str]:
    """Extrae la fecha YYYY-MM-DD del campo JSON-LD datePosted si está presente en el HTML."""
    if not html:
        return None
    match = re.search(r'"datePosted"\s*:\s*"(\d{4}-\d{2}-\d{2})', html, re.IGNORECASE)
    return match.group(1) if match else None


def is_within_max_age_days(date_str: Optional[str], max_days: int = 14, now: Optional[datetime] = None) -> bool:
    """Retorna True si date_str está dentro de max_days o si no es parseable."""
    if not date_str:
        return True
    ref = (now or datetime.now(_PERU_TZ)).replace(tzinfo=None)
    raw = str(date_str).strip()[:10]
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y"):
        try:
            dt = datetime.strptime(raw, fmt)
            return (ref - dt).days <= max_days
        except ValueError:
            continue
    return True


def should_skip_candidate_title(title: Optional[str]) -> bool:
    """
    Pre-filtro ligero sobre el título en páginas de búsqueda para no desperdiciar
    cupos ni peticiones HTTP en puestos para egresados, senior o carreras ajenas.
    Mantiene títulos genéricos ('Practicante Pre Profesional') para evaluarlos por descripción.
    """
    from domain.normalization import (
        EXPLICIT_NON_IT_CAREER_RE,
        FALSE_SYSTEMS_PHRASES_RE,
        GENAI_MEDIA_MARKETING_RE,
        SENIOR_MANAGEMENT_TITLE_RE,
        STRONG_TECH_TITLE_RE,
        extract_role_level,
        normalize_text,
    )

    raw_norm = normalize_text(title)
    if not raw_norm:
        return True

    title_norm = FALSE_SYSTEMS_PHRASES_RE.sub(" ", raw_norm)

    if not _INTERNSHIP_MARKER_RE.search(title_norm):
        return True

    role_level = extract_role_level(title, "")
    if role_level in ("profesional", "trainee_junior"):
        return True

    if SENIOR_MANAGEMENT_TITLE_RE.search(title_norm):
        return True

    if GENAI_MEDIA_MARKETING_RE.search(title_norm) and not re.search(
        r"\b(ing(?:enieria)?\s+(?:de\s+)?sistemas|ing(?:enieria)?\s+(?:de\s+)?software|desarrollo\s+de\s+software|programacion|sql)\b",
        title_norm,
    ):
        return True

    has_tech_title = bool(
        STRONG_TECH_TITLE_RE.search(title_norm)
        or re.search(
            r"\b(sistemas|software|datos|data|bi|power\s+bi|inteligencia\s+artificial|rpa|ti|it)\b",
            title_norm,
        )
    )
    if has_tech_title:
        return False

    if EXPLICIT_NON_IT_CAREER_RE.search(raw_norm) or _NON_IT_PRACTICE_TITLE_RE.search(raw_norm):
        return True

    return False


class BaseJobAdapter(ABC):
    """
    Contrato base (Patrón Adapter) para fuentes de empleo.
    Permite desacoplar la extracción de datos de la lógica de negocio y persistencia.
    """
    #: Pausa entre peticiones al mismo sitio (scraping cortés)
    request_delay: float = 0.6

    def __init__(self, name: str):
        self.name = name
        self.default_headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "es-PE,es;q=0.9,en;q=0.8",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
        }

    def _client(self) -> httpx.Client:
        return httpx.Client(headers=self.default_headers, timeout=15.0, follow_redirects=True)

    def _get(self, client: httpx.Client, url: str, **kwargs) -> httpx.Response | None:
        """GET con pausa cortés; retorna None ante error de red o estado != 200."""
        try:
            time.sleep(self.request_delay)
            resp = client.get(url, **kwargs)
            if resp.status_code != 200:
                logger.warning(f"[{self.name}] HTTP {resp.status_code} en {url}")
                return None
            return resp
        except httpx.HTTPError as e:
            logger.warning(f"[{self.name}] Error de red en {url}: {e}")
            return None

    @abstractmethod
    def fetch_listings(self, limit: int = 15, known_urls: set[str] | None = None) -> List[JobListing]:
        """
        Extrae y normaliza las ofertas de la plataforma a modelos JobListing.
        Debe manejar sus propias excepciones de red y retornar una lista vacía o parcial en caso de error.
        """
        pass
