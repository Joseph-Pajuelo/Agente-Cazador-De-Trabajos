"""
Motor de búsqueda inteligente para vacantes:
1. Resolución de empresas y agencias (ej. buscar 'bcp' encuentra ofertas directas del BCP,
   ofertas de Manpower/Adecco con pistas del BCP y ofertas de agencias para el sector banca).
2. Tolerancia a errores ortográficos (fuzzy matching sobre vocabulario de empresas, tecnologías y distritos).
3. Sugerencias de corrección ('¿Quisiste decir...?') y términos relacionados.
"""
from __future__ import annotations

import difflib
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence

from .companies import (
    BRANDS,
    Brand,
    SECTOR_KEYWORDS,
    contains_phrase,
    is_agency_or_confidential,
    normalize,
    resolve_employer,
)

# Sinónimos y variantes comunes (incluye errores frecuentes de tipeo)
SYNONYM_MAP: dict[str, tuple[str, ...]] = {
    "python": ("python", "phyton", "pyhton", "piton", "py"),
    "sql": ("sql", "postgresql", "postgres", "mysql", "sql server", "plsql", "tsql", "base de datos", "bases de datos"),
    "power bi": ("power bi", "powerbi", "pauer bi", "power-bi", "dax", "dashboard", "dashboards"),
    "excel": ("excel", "exel", "excell", "macros", "vba", "tablas dinamicas"),
    "inteligencia artificial": ("inteligencia artificial", "ia", "ai", "llm", "llms", "langgraph", "langchain", "machine learning", "agentes"),
    "datos": ("datos", "data", "analytics", "analitica", "bi", "business intelligence", "etl", "ingenieria de datos"),
    "sistemas": ("sistemas", "sistema", "sitemas", "informatica", "ti", "it", "tecnologia", "computacion"),
    "software": ("software", "sofware", "desarrollo", "developer", "backend", "frontend", "fullstack", "programacion", "java", "react", "spring"),
    "automatizacion": ("automatizacion", "automatizar", "rpa", "power automate", "uipath"),
    "hibrido": ("hibrido", "hibrida", "semipresencial", "presencial y remoto"),
    "remoto": ("remoto", "teletrabajo", "home office", "virtual"),
    "presencial": ("presencial",),
    "banca": ("banca", "banco", "bancos", "bancario", "financiero", "finanzas"),
}

# Vocabulario canónico para corrección ortográfica ("¿Quisiste decir...?")
CANONICAL_VOCABULARY: tuple[str, ...] = (
    # Empresas principales
    "bcp", "interbank", "bbva", "scotiabank", "mibanco", "banbif", "pichincha",
    "credicorp", "pacifico", "rimac", "mapfre", "alicorp", "movistar", "claro",
    "entel", "bitel", "sunat", "sbs", "kpmg", "deloitte", "pwc", "accenture",
    "sonda", "ntt data", "indra", "globant", "stefanini", "falabella", "tottus",
    "ferreyros", "manpower", "adecco", "utp",
    # Tecnologías y áreas
    "python", "sql", "power bi", "excel", "java", "spring boot", "react",
    "typescript", "postgresql", "mongodb", "langgraph", "inteligencia artificial",
    "datos", "business intelligence", "sistemas", "software", "backend",
    "automatizacion", "banca", "finanzas",
    # Distritos
    "san isidro", "la molina", "miraflores", "surco", "san borja", "ate",
    "la victoria", "lince", "jesus maria", "lima centro",
)


@dataclass
class SearchOutcome:
    jobs: List[Dict]
    corrected_query: Optional[str] = None
    did_you_mean: List[str] = field(default_factory=list)
    related_suggestions: List[str] = field(default_factory=list)
    agency_matches_count: int = 0
    inferred_brand: Optional[Brand] = None


def _match_brand_from_query(q_norm: str) -> Optional[Brand]:
    """Detecta si la búsqueda del usuario se refiere a una empresa conocida (incluso con typo leve)."""
    for b in BRANDS:
        all_terms = b.patterns + b.triggers + (b.key, normalize(b.display))
        for t in all_terms:
            if t and (q_norm == t or contains_phrase(q_norm, t)):
                return b

    # Fuzzy match sobre nombres cortos de marcas (ej. 'interbanck' -> interbank, 'bumeram', 'alikorp')
    tokens = q_norm.split()
    for tok in tokens:
        if len(tok) < 3:
            continue
        for b in BRANDS:
            candidates = [b.key, normalize(b.display)] + list(b.patterns)
            for cand in candidates:
                if " " not in cand and len(cand) >= 3:
                    ratio = difflib.SequenceMatcher(None, tok, cand).ratio()
                    if ratio >= 0.80:
                        return b
    return None


def suggest_corrections(raw_query: str) -> tuple[Optional[str], List[str]]:
    """
    Si el usuario escribió una palabra o frase con error ortográfico (ej. 'phyton', 'pauer bi', 'sitemas'),
    devuelve la versión corregida y una lista de sugerencias cercanas.
    """
    q_norm = normalize(raw_query)
    if not q_norm:
        return None, []

    # 0. Revisar si la frase completa coincide con un sinónimo/variante (incluyendo frases de 2 palabras como 'pauer bi')
    for canonical, variants in SYNONYM_MAP.items():
        if q_norm in variants and q_norm != canonical:
            return canonical, [canonical]

    close_full = difflib.get_close_matches(q_norm, CANONICAL_VOCABULARY, n=4, cutoff=0.72)
    if close_full and close_full[0] != q_norm and " " in close_full[0]:
        return close_full[0], [s for s in close_full if s != q_norm]

    # 1. Revisar token por token
    tokens = q_norm.split()
    corrected_tokens = list(tokens)
    changed = False

    for i, tok in enumerate(tokens):
        if tok in CANONICAL_VOCABULARY:
            continue
        mapped = None
        for canonical, variants in SYNONYM_MAP.items():
            if tok in variants and tok != canonical:
                mapped = canonical
                break
        if mapped:
            corrected_tokens[i] = mapped
            changed = True
            continue

        # 2. Fuzzy match contra palabras del CANONICAL_VOCABULARY
        if len(tok) >= 4:
            close = difflib.get_close_matches(tok, CANONICAL_VOCABULARY, n=3, cutoff=0.74)
            if close and close[0] != tok:
                corrected_tokens[i] = close[0]
                changed = True

    corrected = " ".join(corrected_tokens) if changed else None
    suggestions = difflib.get_close_matches(q_norm, CANONICAL_VOCABULARY, n=4, cutoff=0.60)
    suggestions = [s for s in suggestions if s != q_norm]
    return corrected, suggestions


def _expand_token_variants(token: str) -> tuple[str, ...]:
    """Expande un token a sus sinónimos técnicos o sectoriales."""
    for canonical, variants in SYNONYM_MAP.items():
        if token == canonical or token in variants:
            return (canonical, *variants)
    return (token,)


def search_jobs(jobs: Sequence[Dict], raw_query: str) -> SearchOutcome:
    """
    Filtra y ordena por relevancia las vacantes según la consulta del usuario.
    Cada vacante devuelta incluye metadatos en `_search_note` cuando fue encontrada
    de forma inteligente (por agencia intermediaria o por corrección ortográfica).
    """
    q_norm = normalize(raw_query)
    if not q_norm:
        return SearchOutcome(jobs=list(jobs))

    corrected, did_you_mean = suggest_corrections(raw_query)
    target_brand = _match_brand_from_query(q_norm) or (
        _match_brand_from_query(corrected) if corrected else None
    )

    scored_results: list[tuple[float, Dict]] = []
    agency_hits = 0

    # Caso 1: Búsqueda enfocada en una empresa específica (ej. "bcp", "interbank", "movistar", "alicorp")
    if target_brand is not None:
        brand_terms = set(target_brand.patterns + target_brand.triggers + (target_brand.key, normalize(target_brand.display)))
        sector_terms = SECTOR_KEYWORDS.get(target_brand.sector, ())

        for job in jobs:
            comp = job.get("company") or ""
            title = job.get("title") or ""
            desc = job.get("raw_description") or ""
            employer = resolve_employer(comp, title, desc)
            full_norm = normalize(f"{comp} {title} {desc}")

            # 1A. Coincidencia directa con la empresa publicante
            if employer.brand and employer.brand.key == target_brand.key and not employer.via_agency:
                j_copy = dict(job)
                j_copy["_search_note"] = None
                scored_results.append((100.0 + float(job.get("final_ranking_score") or 0) * 0.1, j_copy))
                continue

            # 1B. Agencia de reclutamiento o confidencial que menciona explícitamente o por pista a la empresa
            if employer.brand and employer.brand.key == target_brand.key and employer.via_agency:
                j_copy = dict(job)
                if employer.basis == "agency_clue":
                    j_copy["_search_note"] = f"Detectada para {target_brand.display} vía {comp} («{employer.clue}»)"
                else:
                    j_copy["_search_note"] = f"Reclutamiento para {target_brand.display} gestionado por {comp}"
                agency_hits += 1
                scored_results.append((92.0 + float(job.get("final_ranking_score") or 0) * 0.1, j_copy))
                continue

            # 1C. Mención directa en el texto completo
            if any(contains_phrase(full_norm, bt) for bt in brand_terms if bt):
                j_copy = dict(job)
                j_copy["_search_note"] = f"Menciona a {target_brand.display} en la convocatoria"
                scored_results.append((85.0 + float(job.get("final_ranking_score") or 0) * 0.1, j_copy))
                continue

            # 1D. Agencia (Manpower, Adecco, Confidencial) reclutando para un cliente del mismo sector (ej. Banca para BCP)
            if is_agency_or_confidential(comp) and sector_terms:
                if employer.brand is None and any(contains_phrase(full_norm, st_term) for st_term in sector_terms):
                    j_copy = dict(job)
                    j_copy["_search_note"] = (
                        f"Posible vacante de {target_brand.display}: {comp} recluta para cliente confidencial del sector {target_brand.sector}"
                    )
                    agency_hits += 1
                    scored_results.append((70.0 + float(job.get("final_ranking_score") or 0) * 0.1, j_copy))
                    continue

        scored_results.sort(key=lambda pair: -pair[0])
        related = [b.display for b in BRANDS if b.sector == target_brand.sector and b.key != target_brand.key][:4]
        return SearchOutcome(
            jobs=[ pair[1] for pair in scored_results ],
            corrected_query=target_brand.display if normalize(target_brand.display) != q_norm and target_brand.key != q_norm else corrected,
            did_you_mean=did_you_mean,
            related_suggestions=related,
            agency_matches_count=agency_hits,
            inferred_brand=target_brand,
        )

    # Caso 2: Búsqueda general por puesto, tecnología, distrito o modalidad (con sinónimos y tolerancia a typos)
    effective_query = corrected or q_norm
    if effective_query in SYNONYM_MAP or effective_query in CANONICAL_VOCABULARY:
        query_tokens = [effective_query]
    else:
        query_tokens = [t for t in effective_query.split() if t]

    for job in jobs:
        comp = job.get("company") or ""
        title = job.get("title") or ""
        loc = job.get("location") or ""
        mod = job.get("modality") or ""
        skills = str(job.get("matching_skills") or "")
        desc = job.get("raw_description") or ""

        primary_norm = normalize(f"{title} {comp} {loc} {mod} {skills}")
        full_norm = normalize(f"{primary_norm} {desc}")
        words_in_primary = primary_norm.split()

        all_tokens_matched = True
        relevance = 0.0
        fuzzy_used = False

        for tok in query_tokens:
            variants = _expand_token_variants(tok)
            if any(contains_phrase(primary_norm, v, allow_prefix=len(v) >= 4) for v in variants):
                relevance += 30.0
            elif any(contains_phrase(full_norm, v, allow_prefix=len(v) >= 4) for v in variants):
                relevance += 15.0
            else:
                # Intentar coincidencia difusa contra palabras del título/empresa/ubicación
                if len(tok) >= 4 and words_in_primary:
                    best = max(difflib.SequenceMatcher(None, tok, w).ratio() for w in words_in_primary)
                    if best >= 0.78:
                        relevance += 12.0
                        fuzzy_used = True
                        continue
                all_tokens_matched = False
                break

        if all_tokens_matched:
            j_copy = dict(job)
            if corrected and corrected != q_norm:
                j_copy["_search_note"] = f"Coincidencia para «{corrected}»"
            elif fuzzy_used:
                j_copy["_search_note"] = "Coincidencia aproximada por similitud de texto"
            else:
                j_copy["_search_note"] = None
            scored_results.append((relevance + float(job.get("final_ranking_score") or 0) * 0.1, j_copy))

    scored_results.sort(key=lambda pair: -pair[0])

    # Si no hubo resultados, proponer términos cercanos presentes en la base
    if not scored_results and not did_you_mean:
        did_you_mean = ["Python", "SQL", "Power BI", "BCP", "Sistemas", "Datos"]

    return SearchOutcome(
        jobs=[pair[1] for pair in scored_results],
        corrected_query=corrected if corrected != q_norm else None,
        did_you_mean=did_you_mean,
        related_suggestions=[],
        agency_matches_count=0,
    )
