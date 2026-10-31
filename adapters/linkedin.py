"""
Adapter de LinkedIn usando los endpoints públicos para invitados (sin login).
No usa la cuenta del usuario, así que no hay riesgo de restricción de cuenta.

Truco de ingeniería: LinkedIn permite filtrar por tipo de lugar de trabajo (f_WT).
Hacemos una búsqueda por cada modalidad para ETIQUETAR la modalidad de forma confiable,
en vez de adivinarla del texto.
"""
import logging
from typing import List, Dict

from bs4 import BeautifulSoup

from config.search import SEARCH_KEYWORDS, SEARCH_LOCATION
from domain.enums import JobSource, Modality
from domain.models import JobListing
from .base import BaseJobAdapter

logger = logging.getLogger(__name__)

SEARCH_URL = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"
DETAIL_URL = "https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{job_id}"

# f_WT: 1 = presencial, 2 = remoto, 3 = híbrido  (orden = prioridad del candidato)
WORKPLACE_FILTERS = [("3", Modality.HIBRIDO), ("1", Modality.PRESENCIAL), ("2", Modality.REMOTO)]


class LinkedInGuestAdapter(BaseJobAdapter):
    request_delay = 1.0  # LinkedIn es sensible al ritmo de peticiones

    def __init__(self, keywords: List[str] | None = None):
        super().__init__(name="LinkedIn")
        self.keywords = keywords or SEARCH_KEYWORDS

    @staticmethod
    def parse_search_results(html: str) -> List[Dict]:
        """Convierte el HTML de resultados en dicts básicos (id, título, empresa, ubicación, url)."""
        soup = BeautifulSoup(html, "html.parser")
        results = []
        for card in soup.select("li"):
            urn_el = card.select_one("[data-entity-urn]")
            title_el = card.select_one(".base-search-card__title")
            if not urn_el or not title_el:
                continue
            company_el = card.select_one(".base-search-card__subtitle")
            loc_el = card.select_one(".job-search-card__location")
            link_el = card.select_one("a.base-card__full-link")
            date_el = card.select_one("time")
            results.append({
                "job_id": urn_el["data-entity-urn"].split(":")[-1],
                "title": title_el.get_text(strip=True),
                "company": company_el.get_text(strip=True) if company_el else "No especificado",
                "location": loc_el.get_text(strip=True) if loc_el else "Lima, Perú",
                "url": (link_el["href"].split("?")[0] if link_el else ""),
                "published_at": date_el.get("datetime") if date_el else None,
            })
        return results

    @staticmethod
    def parse_detail(html: str) -> str:
        soup = BeautifulSoup(html, "html.parser")
        desc = soup.select_one(".show-more-less-html__markup")
        criteria = [c.get_text(" ", strip=True) for c in soup.select(".description__job-criteria-item")]
        text = desc.get_text("\n", strip=True) if desc else ""
        if criteria:
            text += "\n\nCriterios LinkedIn: " + " | ".join(criteria)
        return text

    def fetch_listings(self, limit: int = 15, known_urls: set[str] | None = None) -> List[JobListing]:
        found: Dict[str, Dict] = {}
        skip_urls = set(known_urls or ())
        with self._client() as client:
            # 1) Búsquedas por palabra clave x modalidad ordenadas por más recientes (sortBy=DD)
            for keyword in self.keywords:
                for wt, modality in WORKPLACE_FILTERS:
                    if len(found) >= limit:
                        break
                    resp = self._get(client, SEARCH_URL, params={
                        "keywords": keyword,
                        "location": SEARCH_LOCATION,
                        "f_WT": wt,
                        "sortBy": "DD",
                        "start": 0,
                    })
                    if resp is None:
                        continue
                    for item in self.parse_search_results(resp.text):
                        if item["url"] in skip_urls:
                            continue
                        if item["job_id"] not in found and len(found) < limit:
                            item["modality"] = modality
                            found[item["job_id"]] = item

            # 2) Detalle de cada vacante
            listings: List[JobListing] = []
            for item in found.values():
                resp = self._get(client, DETAIL_URL.format(job_id=item["job_id"]))
                description = self.parse_detail(resp.text) if resp else ""
                if not description:
                    description = f"{item['title']} en {item['company']} ({item['location']}). Descripción no disponible."
                try:
                    listing = JobListing(
                        source=JobSource.LINKEDIN,
                        title=item["title"],
                        company=item["company"],
                        location=item["location"],
                        modality=item["modality"],
                        url=item["url"] or f"https://www.linkedin.com/jobs/view/{item['job_id']}",
                        raw_description=description[:4000],
                        published_at=item["published_at"],
                    )
                    listing.compute_hash()
                    listings.append(listing)
                except Exception as e:
                    logger.warning(f"[LinkedIn] Vacante inválida {item.get('job_id')}: {e}")
        return listings
