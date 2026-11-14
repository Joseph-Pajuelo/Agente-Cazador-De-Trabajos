"""
Adapter de CVMatcher (agregador peruano de prácticas y empleos junior).
El listado público (/empleos) viene renderizado en servidor (Astro), pero el detalle de cada
oferta solo carga con JavaScript/login. Por eso este adapter trabaja con los datos de la tarjeta:
título, empresa, ciudad y la plataforma de origen.
"""
import logging
import re
from typing import List, Dict

from bs4 import BeautifulSoup

from config.search import SEARCH_KEYWORDS
from domain.enums import JobSource
from domain.models import JobListing
from .base import BaseJobAdapter, detect_modality

logger = logging.getLogger(__name__)

LIST_URL = "https://www.cvmatcher.app/empleos"


class CVMatcherAdapter(BaseJobAdapter):
    def __init__(self, keywords: List[str] | None = None):
        super().__init__(name="CVMatcher")
        # CVMatcher busca por área, así que quitamos la palabra "practicante" del query
        base_kw = [k.replace("practicante", "").replace("preprofesional", "").strip() for k in (keywords or SEARCH_KEYWORDS)]
        extra_kw = ["practica", "practicante", "sistemas", "datos", "software", "ti", "ingenieria", "analista"]
        self.keywords = list(dict.fromkeys([k for k in (*base_kw, *extra_kw) if k]))

    @staticmethod
    def parse_search_results(html: str) -> List[Dict]:
        soup = BeautifulSoup(html, "html.parser")
        results = []
        for title_el in soup.select("h4"):
            card = title_el.find_parent("div", class_="shadow")
            if card is None:
                continue
            link = card.select_one("a[href*='/jobs/']")
            if not link:
                continue
            paragraphs = [p.get_text(strip=True) for p in card.select("p")]
            company = paragraphs[0] if paragraphs else "No especificado"
            location = paragraphs[1] if len(paragraphs) > 1 else "Lima"
            origin = "desconocida"
            src_img = card.select_one("img[alt='Fuente del empleo']")
            if src_img and src_img.get("src"):
                m = re.search(r"/sources/([a-z0-9_\-]+)\.", src_img["src"])
                if m:
                    origin = m.group(1)
            logo_url = None
            logo_img = card.select_one("img[alt^='Logo de ']")
            if logo_img and logo_img.get("src"):
                src_val = logo_img["src"].strip()
                if src_val.startswith("http"):
                    logo_url = src_val
            results.append({
                "title": title_el.get_text(strip=True),
                "company": company,
                "company_logo_url": logo_url,
                "location": location,
                "url": link["href"],
                "origin": origin,
            })
        return results

    def fetch_listings(self, limit: int = 15, known_urls: set[str] | None = None) -> List[JobListing]:
        listings: List[JobListing] = []
        seen = set(known_urls or ())
        with self._client() as client:
            for keyword in self.keywords:
                if len(listings) >= limit:
                    break
                resp = self._get(client, LIST_URL, params={"de": keyword, "en": "lima"})
                if resp is None:
                    continue
                for item in self.parse_search_results(resp.text):
                    if item["url"] in seen or len(listings) >= limit:
                        continue
                    seen.add(item["url"])
                    description = (
                        f"Puesto: {item['title']}\nEmpresa: {item['company']}\nUbicación: {item['location']}\n"
                        f"Publicado originalmente en: {item['origin']}\n"
                        "Nota: CVMatcher solo expone el resumen; la descripción completa requiere abrir la oferta."
                    )
                    try:
                        listing = JobListing(
                            source=JobSource.CVMATCHER,
                            title=item["title"],
                            company=item["company"],
                            location=item["location"],
                            modality=detect_modality(item["title"]),
                            url=item["url"],
                            raw_description=description,
                            company_logo_url=item.get("company_logo_url"),
                        )
                        listing.compute_hash()
                        listings.append(listing)
                    except Exception as e:
                        logger.warning(f"[CVMatcher] Vacante inválida {item.get('url')}: {e}")
        return listings
