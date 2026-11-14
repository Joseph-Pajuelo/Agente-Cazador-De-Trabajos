from abc import ABC, abstractmethod
from typing import List
import logging
import time

import httpx

from domain.models import JobListing
from domain.enums import Modality

logger = logging.getLogger(__name__)


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
