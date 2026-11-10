"""
Registro de empresas y agencias de reclutamiento del mercado peruano.

Lo usan tanto el buscador (para entender que 'bcp' = 'Banco de Crédito' = 'Yape', o que una
oferta de ManpowerGroup para "el banco más grande del Perú" es del BCP) como el dashboard
(para dibujar el avatar de la empresa empleadora real).
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Optional


def normalize(text: str) -> str:
    """Minúsculas, sin tildes y sin signos: 'BANCO DE CRÉDITO(BCP)' -> 'banco de credito bcp'."""
    if not text:
        return ""
    text = unicodedata.normalize("NFKD", str(text)).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def contains_phrase(haystack_norm: str, phrase_norm: str, allow_prefix: bool = False) -> bool:
    """Coincidencia por palabra completa (o prefijo de palabra) sobre texto ya normalizado."""
    if not phrase_norm:
        return False
    tail = "" if allow_prefix else r"(?![a-z0-9])"
    return re.search(r"(?<![a-z0-9])" + re.escape(phrase_norm) + tail, haystack_norm) is not None


@dataclass(frozen=True)
class Brand:
    key: str
    display: str
    code: str                       # siglas para el avatar
    color: str                      # color de texto del avatar
    tint: str                       # fondo del avatar
    sector: str
    patterns: tuple[str, ...]       # cómo aparece la empresa escrita en un anuncio
    triggers: tuple[str, ...] = ()  # cómo la escribe alguien en el buscador (además de patterns)
    clues: tuple[str, ...] = ()     # descripciones indirectas: "el banco más grande del Perú"


BRANDS: tuple[Brand, ...] = (
    Brand("bcp", "BCP", "BCP", "#1F4E9E", "#E8EEF8", "banca",
          ("bcp", "banco de credito", "viabcp", "yape"), ("banco credito",),
          ("banco mas grande del peru", "banco mas grande del pais", "banco lider del peru",
           "principal banco del peru")),
    Brand("interbank", "Interbank", "IBK", "#1E6B4F", "#E6F2EC", "banca", ("interbank", "ibk")),
    Brand("intercorp", "Intercorp", "ITC", "#1E6B4F", "#E6F2EC", "holding", ("intercorp",)),
    Brand("bbva", "BBVA", "BBVA", "#1A3F7A", "#E7ECF5", "banca", ("bbva",), ("continental",)),
    Brand("scotiabank", "Scotiabank", "SCT", "#A3312F", "#F7E9E8", "banca", ("scotiabank", "scotia")),
    Brand("mibanco", "Mibanco", "MIB", "#2F6B3A", "#E8F1EA", "banca", ("mibanco",)),
    Brand("banbif", "BanBif", "BIF", "#245C80", "#E6EFF5", "banca", ("banbif",)),
    Brand("pichincha", "Banco Pichincha", "PCH", "#8A6A12", "#F6F0DF", "banca", ("pichincha",)),
    Brand("sbs", "SBS", "SBS", "#3D4A5C", "#ECEEF1", "gobierno",
          ("superintendencia de banca", "sbs")),
    Brand("credicorp", "Credicorp", "CRC", "#1F4E9E", "#E8EEF8", "holding", ("credicorp",)),
    Brand("pacifico", "Pacífico Seguros", "PAC", "#245C80", "#E6EFF5", "seguros",
          ("pacifico seguros", "pacifico eps", "pacifico vida"), ("pacifico",)),
    Brand("rimac", "Rímac", "RIM", "#A3312F", "#F7E9E8", "seguros", ("rimac",)),
    Brand("mapfre", "Mapfre", "MAP", "#A3312F", "#F7E9E8", "seguros", ("mapfre",)),
    Brand("sanna", "Sanna", "SAN", "#245C80", "#E6EFF5", "salud", ("sanna",)),
    Brand("alicorp", "Alicorp", "ALI", "#A3312F", "#F7E9E8", "consumo", ("alicorp",)),
    Brand("movistar", "Movistar", "MOV", "#245C80", "#E6EFF5", "telecom",
          ("movistar", "telefonica", "integratel")),
    Brand("claro", "Claro", "CLR", "#A3312F", "#F7E9E8", "telecom",
          ("america movil", "claro peru"), ("claro",)),
    Brand("entel", "Entel", "ENT", "#1A3F7A", "#E7ECF5", "telecom", ("entel",)),
    Brand("bitel", "Bitel", "BTL", "#8A6A12", "#F6F0DF", "telecom", ("bitel",)),
    Brand("sunat", "SUNAT", "SNT", "#3D4A5C", "#ECEEF1", "gobierno", ("sunat",)),
    Brand("kpmg", "KPMG", "KPMG", "#1A3F7A", "#E7ECF5", "consultoria", ("kpmg",)),
    Brand("deloitte", "Deloitte", "DLT", "#2F6B3A", "#E8F1EA", "consultoria", ("deloitte",)),
    Brand("pwc", "PwC", "PWC", "#8A4B12", "#F6EBDF", "consultoria", ("pwc", "pricewaterhouse")),
    Brand("ey", "EY", "EY", "#5E5A1A", "#F3F2E2", "consultoria", ("ernst young", "ey peru")),
    Brand("accenture", "Accenture", "ACN", "#5B3A8C", "#EFE9F6", "tecnologia", ("accenture",)),
    Brand("ibm", "IBM", "IBM", "#1A3F7A", "#E7ECF5", "tecnologia", ("ibm",)),
    Brand("sonda", "SONDA", "SND", "#3E4C8A", "#EAECF5", "tecnologia", ("sonda",)),
    Brand("nttdata", "NTT DATA", "NTT", "#245C80", "#E6EFF5", "tecnologia", ("ntt data", "nttdata", "everis")),
    Brand("indra", "Indra", "IND", "#5B3A8C", "#EFE9F6", "tecnologia", ("indra", "minsait")),
    Brand("globant", "Globant", "GLB", "#2F6B3A", "#E8F1EA", "tecnologia", ("globant",)),
    Brand("stefanini", "Stefanini", "STF", "#3E4C8A", "#EAECF5", "tecnologia", ("stefanini",)),
    Brand("falabella", "Falabella", "FAL", "#2F6B3A", "#E8F1EA", "retail",
          ("falabella", "saga falabella")),
    Brand("tottus", "Tottus", "TOT", "#2F6B3A", "#E8F1EA", "retail", ("tottus",)),
    Brand("utp", "UTP", "UTP", "#A3312F", "#F7E9E8", "educacion",
          ("universidad tecnologica del peru", "utp")),
    Brand("ferreyros", "Ferreyros", "FER", "#8A6A12", "#F6F0DF", "industria", ("ferreyros", "ferreycorp")),
)

SECTOR_KEYWORDS: dict[str, tuple[str, ...]] = {
    "banca": ("banco", "bancario", "bancaria", "sector banca", "entidad financiera", "sector financiero"),
    "seguros": ("aseguradora", "seguros"),
    "telecom": ("telecomunicaciones", "operador movil"),
    "consultoria": ("consultora", "auditoria", "big four"),
    "tecnologia": ("consultora de tecnologia", "empresa de tecnologia", "software factory"),
    "retail": ("retail", "tienda por departamento", "supermercado"),
}

STAFFING_AGENCIES: tuple[str, ...] = (
    "manpower", "manpowergroup", "experis", "adecco", "randstad", "kelly services", "michael page",
    "page personnel", "hays", "robert half", "pigmalion", "evaluar", "bumeran seleccion", "laborum",
    "talent search", "headhunter",
)

_BRAND_BY_KEY = {b.key: b for b in BRANDS}


def get_brand(key: Optional[str]) -> Optional[Brand]:
    return _BRAND_BY_KEY.get(key or "")


def is_agency_or_confidential(company: str) -> bool:
    c = normalize(company)
    if not c or "confidencial" in c or "no especificado" in c:
        return True
    return any(contains_phrase(c, a) for a in STAFFING_AGENCIES)


def brand_in_text(text_norm: str, include_triggers: bool = False) -> Optional[Brand]:
    for b in BRANDS:
        phrases = b.patterns + (b.triggers if include_triggers else ())
        if any(contains_phrase(text_norm, p) for p in phrases):
            return b
    return None


def brand_by_clue(text_norm: str) -> Optional[tuple[Brand, str]]:
    for b in BRANDS:
        for clue in b.clues:
            if clue in text_norm:
                return b, clue
    return None


@dataclass
class Employer:
    """Quién contrata realmente, aunque publique una agencia."""
    brand: Optional[Brand]
    basis: str = "publisher"  # publisher | agency_explicit | agency_clue | unknown
    publisher: str = ""
    clue: str = ""
    sector_hint: Optional[str] = None
    extra: dict = field(default_factory=dict)

    @property
    def via_agency(self) -> bool:
        return self.basis in ("agency_explicit", "agency_clue")


def resolve_employer(company: str, title: str, description: str) -> Employer:
    company_n = normalize(company)
    publisher_brand = brand_in_text(company_n, include_triggers=True)
    if publisher_brand and not is_agency_or_confidential(company):
        return Employer(publisher_brand, "publisher", company)

    if is_agency_or_confidential(company):
        text_n = normalize(f"{title} {description}")
        explicit = brand_in_text(text_n)
        if explicit:
            return Employer(explicit, "agency_explicit", company)
        clue = brand_by_clue(text_n)
        if clue:
            return Employer(clue[0], "agency_clue", company, clue=clue[1])
        sector = next(
            (s for s, kws in SECTOR_KEYWORDS.items() if any(contains_phrase(text_n, k) for k in kws)),
            None,
        )
        return Employer(None, "unknown", company, sector_hint=sector)

    return Employer(None, "publisher", company)
