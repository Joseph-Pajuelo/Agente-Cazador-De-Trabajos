"""
Adapter de Bumeran Perú consumiendo directamente su API REST JSON interna (/api/avisos/searchV2).
Ventaja arquitectónica: una sola petición POST con la cabecera 'x-site-id: BMPE' devuelve título,
empresa, distrito ('San Isidro, Lima'), modalidad estructurada ('Híbrido', 'Presencial', 'Remoto')
y la descripción completa ('detalle') sin necesidad de raspar HTML ni hacer N peticiones adicionales.
"""
import html
import logging
import re
import time
from datetime import datetime
from typing import List, Dict, Any

import httpx
from bs4 import BeautifulSoup

from config.search import SEARCH_KEYWORDS
from domain.enums import JobSource, Modality
from domain.models import JobListing
from .base import BaseJobAdapter, detect_modality

logger = logging.getLogger(__name__)

API_URL = "https://www.bumeran.com.pe/api/avisos/searchV2"


class BumeranAdapter(BaseJobAdapter):
    request_delay = 0.5

    def __init__(self, keywords: List[str] | None = None):
        super().__init__(name="Bumeran")
        self.keywords = keywords or [
            "practicante pre profesional sistemas",
            "practicante preprofesional datos",
            *SEARCH_KEYWORDS,
        ]
        self.api_headers = {
            **self.default_headers,
            "Accept": "application/json",
            "Content-Type": "application/json",
            "x-site-id": "BMPE",
            "Origin": "https://www.bumeran.com.pe",
            "Referer": "https://www.bumeran.com.pe/empleos-busqueda-practicante-sistemas.html",
        }

    @staticmethod
    def _map_modality(raw_modality: str | None, detail_text: str) -> Modality:
        if raw_modality:
            low = raw_modality.lower()
            if "híbrido" in low or "hibrido" in low:
                return Modality.HIBRIDO
            if "remoto" in low or "virtual" in low or "teletrabajo" in low:
                return Modality.REMOTO
            if "presencial" in low:
                return Modality.PRESENCIAL
        return detect_modality(detail_text)

    @staticmethod
    def _clean_detail(raw_detail: str) -> str:
        if not raw_detail:
            return ""
        unescaped = html.unescape(raw_detail)
        soup = BeautifulSoup(unescaped, "html.parser")
        return soup.get_text("\n", strip=True)

    @classmethod
    def parse_api_items(cls, items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        parsed = []
        for item in items:
            job_id = str(item.get("id") or "")
            title = (item.get("titulo") or "").strip()
            if not job_id or not title:
                continue
            company = (item.get("empresa") or "Empresa confidencial").strip()
            if item.get("confidencial"):
                company = "Empresa confidencial"
            location = (item.get("localizacion") or "Lima, Perú").strip()
            detail_text = cls._clean_detail(item.get("detalle") or "")
            modality = cls._map_modality(item.get("modalidadTrabajo"), detail_text)
            salary_match = re.search(r"S/\.?\s*[\d,\.]+", detail_text)
            parsed.append({
                "job_id": job_id,
                "title": title,
                "company": company,
                "location": location,
                "modality": modality,
                "url": f"https://www.bumeran.com.pe/empleos/{job_id}.html",
                "raw_description": detail_text or f"{title} en {company} ({location}).",
                "salary": salary_match.group(0) if salary_match else None,
                "published_at": item.get("fechaPublicacion"),
            })
        return parsed

    def fetch_listings(self, limit: int = 15, known_urls: set[str] | None = None) -> List[JobListing]:
        listings: List[JobListing] = []
        seen_urls = set(known_urls or ())

        with httpx.Client(headers=self.api_headers, timeout=15.0, follow_redirects=True) as client:
            for query in self.keywords:
                if len(listings) >= limit:
                    break
                try:
                    time.sleep(self.request_delay)
                    resp = client.post(
                        API_URL,
                        params={"pageSize": 30, "page": 0, "sort": "RECIENTES"},
                        json={"query": query},
                    )
                    if resp.status_code != 200:
                        logger.warning(f"[Bumeran] HTTP {resp.status_code} para query '{query}'")
                        continue
                    payload = resp.json()
                    items = payload.get("content") or []
                    now = datetime.now()
                    for parsed in self.parse_api_items(items):
                        if parsed["url"] in seen_urls or len(listings) >= limit:
                            continue

                        # Validación estricta de antigüedad: máximo 14 días (2 semanas)
                        pub_str = parsed.get("published_at")
                        if pub_str:
                            for fmt in ("%d-%m-%Y", "%Y-%m-%d"):
                                try:
                                    dt = datetime.strptime(pub_str.strip()[:10], fmt)
                                    if (now - dt).days > 14:
                                        pub_str = None
                                        break
                                except ValueError:
                                    pass
                            if pub_str is None:
                                continue
                        seen_urls.add(parsed["url"])
                        listing = JobListing(
                            source=JobSource.BUMERAN,
                            title=parsed["title"],
                            company=parsed["company"],
                            location=parsed["location"],
                            modality=parsed["modality"],
                            url=parsed["url"],
                            raw_description=parsed["raw_description"][:4000],
                            salary=parsed["salary"],
                            published_at=parsed["published_at"],
                        )
                        listing.compute_hash()
                        listings.append(listing)
                except Exception as e:
                    logger.warning(f"[Bumeran] Error consultando '{query}': {e}")

        return listings
