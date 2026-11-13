"""
Adapter de CompuTrabajo Perú (HTML renderizado en servidor).
Respeta robots.txt: solo usa las páginas de listado por palabra clave y el detalle de la oferta,
sin parámetros de filtro bloqueados (dis=, sal=, etc.).
"""
import logging
import re
import unicodedata
from typing import List, Dict

from bs4 import BeautifulSoup

from config.search import SEARCH_KEYWORDS
from domain.enums import JobSource
from domain.models import JobListing
from .base import BaseJobAdapter, detect_modality

logger = logging.getLogger(__name__)

BASE_URL = "https://pe.computrabajo.com"


def _slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


class ComputrabajoAdapter(BaseJobAdapter):
    def __init__(self, keywords: List[str] | None = None):
        super().__init__(name="CompuTrabajo")
        self.keywords = keywords or SEARCH_KEYWORDS

    @staticmethod
    def parse_search_results(html: str) -> List[Dict]:
        soup = BeautifulSoup(html, "html.parser")
        results = []
        for art in soup.select("article.box_offer"):
            link = art.select_one("h2 a")
            if not link:
                continue
            company_el = art.select_one("a[offer-grid-article-company-url]") or art.select_one("p a")
            loc_el = art.select_one("p.fs16 span.mr10")
            results.append({
                "offer_id": art.get("data-id") or link["href"],
                "title": link.get_text(strip=True),
                "company": company_el.get_text(strip=True) if company_el else "Empresa confidencial",
                "location": loc_el.get_text(strip=True) if loc_el else "Lima",
                "url": BASE_URL + link["href"].split("#")[0],
            })
        return results

    @staticmethod
    def parse_detail(html: str) -> str:
        soup = BeautifulSoup(html, "html.parser")
        box = soup.select_one("div[div-link='oferta']") or soup.select_one("main")
        return box.get_text("\n", strip=True) if box else ""

    def fetch_listings(self, limit: int = 15, known_urls: set[str] | None = None) -> List[JobListing]:
        found: Dict[str, Dict] = {}
        skip_urls = set(known_urls or ())
        with self._client() as client:
            for keyword in self.keywords:
                if len(found) >= limit:
                    break
                url = f"{BASE_URL}/trabajo-de-{_slugify(keyword)}-en-lima"
                resp = self._get(client, url)
                if resp is None:
                    continue
                for item in self.parse_search_results(resp.text):
                    if item["url"] in skip_urls:
                        continue
                    if item["offer_id"] not in found and len(found) < limit:
                        found[item["offer_id"]] = item

            listings: List[JobListing] = []
            for item in found.values():
                resp = self._get(client, item["url"])
                description = self.parse_detail(resp.text) if resp else ""
                if not description:
                    description = f"{item['title']} en {item['company']} ({item['location']})."
                salary_match = re.search(r"S/\.?\s*[\d,\.]+", description)
                try:
                    listing = JobListing(
                        source=JobSource.COMPUTRABAJO,
                        title=item["title"],
                        company=item["company"],
                        location=item["location"],
                        modality=detect_modality(description),
                        url=item["url"],
                        raw_description=description[:4000],
                        salary=salary_match.group(0) if salary_match else None,
                    )
                    listing.compute_hash()
                    listings.append(listing)
                except Exception as e:
                    logger.warning(f"[CompuTrabajo] Vacante inválida {item.get('url')}: {e}")
        return listings
