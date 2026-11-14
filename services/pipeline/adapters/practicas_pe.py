import re
import time
import logging
from typing import List
import httpx
from bs4 import BeautifulSoup

from domain.models import JobListing
from domain.enums import JobSource, Modality
from .base import BaseJobAdapter

logger = logging.getLogger(__name__)

class PracticasPeAdapter(BaseJobAdapter):
    """
    Adapter para extraer convocatorias reales de prácticas preprofesionales
    desde practicas.pe filtradas por Ingeniería de Sistemas y Computación en Lima.
    """
    CATEGORY_URLS = [
        "https://www.practicas.pe/profesionales-preprofesionales-ingenieria-de-sistemas-lima-18-15.html",
        "https://www.practicas.pe/profesionales-preprofesionales-computacion-lima-12-15.html",
        "https://www.practicas.pe/pre-profesional-region-lima-15.html",
        "https://www.practicas.pe/profesionales-preprofesionales-ingenieria-informatica-lima-19-15.html",
        "https://www.practicas.pe/profesionales-preprofesionales-ingenieria-de-software-lima-59-15.html",
        "https://www.practicas.pe/profesionales-preprofesionales-estadistica-lima-15-15.html",
        "https://www.practicas.pe/profesionales-preprofesionales-ingenieria-industrial-lima-17-15.html",
    ]

    def __init__(self):
        super().__init__(name="Practicas.pe")

    def _detect_modality(self, text: str) -> Modality:
        lower = text.lower()
        if "híbrido" in lower or "hibrido" in lower or "semipresencial" in lower:
            return Modality.HIBRIDO
        elif "remoto" in lower or "home office" in lower or "teletrabajo" in lower or "virtual" in lower:
            return Modality.REMOTO
        elif "presencial" in lower:
            return Modality.PRESENCIAL
        return Modality.DESCONOCIDO

    def _extract_company_and_title(self, raw_header: str) -> tuple[str, str]:
        """
        Separa la empresa y el título.
        Ej: 'BANCO DE CREDITO(BCP)Convocatoria para Practicante de Automatización de Procesos'
        o 'BANCO DE CREDITO(BCP): Convocatoria para...'
        """
        cleaned = " ".join(raw_header.split()).strip()
        
        if "convocatoria" in cleaned.lower():
            parts = re.split(
                r"convocatoria\s+(?:(?:para|de)\s+|n[º°]?\s*\d+[-–]\d+\s*:\s*)?",
                cleaned,
                flags=re.IGNORECASE,
            )
            if len(parts) >= 2:
                company = parts[0].strip(": -–")
                title = parts[1].strip(": -–")
            else:
                company = "Empresa Confidencial"
                title = cleaned
        elif ":" in cleaned:
            parts = cleaned.split(":", 1)
            company = parts[0].strip()
            title = parts[1].strip()
        else:
            company = "Empresa Confidencial"
            title = cleaned

        title = re.sub(
            r"^de\s+(?=(?:practicante|pr[aá]cticas|becario|asistente|analista|t[eé]cnico)\b)",
            "",
            title,
            flags=re.IGNORECASE,
        )
        # Limpiar sufijo 'en Lima' o similar
        title = re.sub(r"\s+en\s+Lima.*$", "", title, flags=re.IGNORECASE)
        # Limpiar empresa vacía
        if not company:
            company = "Empresa Confidencial"

        return company, title

    def fetch_listings(self, limit: int = 15, known_urls: set[str] | None = None) -> List[JobListing]:
        results: List[JobListing] = []
        seen_urls = set(known_urls or ())

        with httpx.Client(headers=self.default_headers, timeout=12.0, follow_redirects=True) as client:
            for cat_url in self.CATEGORY_URLS:
                if len(results) >= limit:
                    break
                try:
                    resp = client.get(cat_url)
                    if resp.status_code != 200:
                        logger.warning(f"Error HTTP {resp.status_code} al consultar {cat_url}")
                        continue

                    soup = BeautifulSoup(resp.text, "html.parser")
                    links = soup.find_all("a", href=True)

                    offer_links = []
                    for a in links:
                        href = a["href"].strip()
                        # Solo enlaces directos a la oferta en practicas.pe
                        if (
                            "oferta-convocatoria-" in href 
                            and href.endswith(".html")
                            and "practicas.pe" in href
                            and not any(x in href.lower() for x in ["facebook", "share", "wa.me", "whatsapp", "linkedin", "twitter", "x.com", "messenger"])
                            and href not in seen_urls
                        ):
                            seen_urls.add(href)
                            offer_links.append((href, a.get_text(strip=True)))

                    for href, anchor_text in offer_links:
                        if len(results) >= limit:
                            break
                        try:
                            # Visitar detalle de la oferta
                            detail_resp = client.get(href)
                            if detail_resp.status_code != 200:
                                continue

                            detail_soup = BeautifulSoup(detail_resp.text, "html.parser")
                            
                            # Obtener título y empresa
                            h1 = detail_soup.find("h1")
                            raw_header = h1.get_text(strip=True) if h1 else anchor_text
                            company, title = self._extract_company_and_title(raw_header)

                            # Obtener descripción principal
                            article = detail_soup.select_one("article")
                            if article:
                                raw_desc = article.get_text("\n", strip=True)
                            else:
                                main_tag = detail_soup.select_one("main")
                                raw_desc = main_tag.get_text("\n", strip=True) if main_tag else detail_soup.get_text("\n", strip=True)

                            # Detectar modalidad y remuneración
                            modality = self._detect_modality(raw_desc)
                            
                            salary_match = re.search(r"(S/\.?\s*\d+[\d,\.]*|remuneraci[oó]n:?\s*S/\.?\s*\d+)", raw_desc, re.IGNORECASE)
                            salary = salary_match.group(0) if salary_match else None

                            listing = JobListing(
                                source=JobSource.PRACTICAS_PE,
                                title=title,
                                company=company,
                                location="Lima, Perú",
                                modality=modality,
                                url=href,
                                raw_description=raw_desc[:3500], # truncar por seguridad
                                salary=salary
                            )
                            listing.compute_hash()
                            results.append(listing)

                            # Respetar rate-limiting cortés
                            time.sleep(0.3)
                        except Exception as e:
                            logger.error(f"Error procesando detalle {href}: {e}")
                            continue

                except Exception as e:
                    logger.error(f"Error al consultar categoría {cat_url}: {e}")

        return results
