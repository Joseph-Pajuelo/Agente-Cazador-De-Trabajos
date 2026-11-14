/**
 * Motor de búsqueda inteligente para vacantes:
 * 1. Resolución de empresas y agencias (ej. buscar 'bcp' encuentra ofertas directas del BCP,
 *    ofertas de Manpower/Adecco con pistas del BCP y ofertas de agencias para el sector banca).
 * 2. Tolerancia a errores ortográficos (fuzzy matching sobre vocabulario de empresas, tecnologías y distritos).
 * 3. Sugerencias de corrección ('¿Quisiste decir...?') y términos relacionados.
 *
 * Port directo de services/pipeline/domain/search_engine.py
 */

import { Brand, JobSummary, SearchOutcome } from './types';
import {
  BRANDS,
  SECTOR_KEYWORDS,
  containsPhrase,
  isAgencyOrConfidential,
  normalize,
  resolveEmployer,
} from './companies';

// Sinónimos y variantes comunes (incluye errores frecuentes de tipeo)
export const SYNONYM_MAP: Record<string, readonly string[]> = {
  python: ['python', 'phyton', 'pyhton', 'piton', 'py'],
  sql: [
    'sql',
    'postgresql',
    'postgres',
    'mysql',
    'sql server',
    'plsql',
    'tsql',
    'base de datos',
    'bases de datos',
  ],
  'power bi': [
    'power bi',
    'powerbi',
    'pauer bi',
    'power-bi',
    'dax',
    'dashboard',
    'dashboards',
  ],
  excel: ['excel', 'exel', 'excell', 'macros', 'vba', 'tablas dinamicas'],
  'inteligencia artificial': [
    'inteligencia artificial',
    'ia',
    'ai',
    'llm',
    'llms',
    'langgraph',
    'langchain',
    'machine learning',
    'agentes',
  ],
  datos: [
    'datos',
    'data',
    'analytics',
    'analitica',
    'bi',
    'business intelligence',
    'etl',
    'ingenieria de datos',
  ],
  sistemas: [
    'sistemas',
    'sistema',
    'sitemas',
    'informatica',
    'ti',
    'it',
    'tecnologia',
    'computacion',
  ],
  software: [
    'software',
    'sofware',
    'desarrollo',
    'developer',
    'backend',
    'frontend',
    'fullstack',
    'programacion',
    'java',
    'react',
    'spring',
  ],
  automatizacion: [
    'automatizacion',
    'automatizar',
    'rpa',
    'power automate',
    'uipath',
  ],
  hibrido: ['hibrido', 'hibrida', 'semipresencial', 'presencial y remoto'],
  remoto: ['remoto', 'teletrabajo', 'home office', 'virtual'],
  presencial: ['presencial'],
  banca: ['banca', 'banco', 'bancos', 'bancario', 'financiero', 'finanzas'],
  'san isidro': ['san isidro', 'sani isidro', 'sanisidro', 'isidro', 'san isidr'],
  'la molina': ['la molina', 'lamolina', 'molina'],
  miraflores: ['miraflores', 'miraflore'],
  'san borja': ['san borja', 'sanborja', 'borja'],
  surco: ['surco', 'santiago de surco'],
  ate: ['ate', 'ate vitarte'],
  'jesus maria': ['jesus maria', 'jesús maría', 'jesusmaria'],
};

// Vocabulario canónico para corrección ortográfica ("¿Quisiste decir...?")
export const CANONICAL_VOCABULARY: readonly string[] = [
  // Empresas principales
  'bcp',
  'interbank',
  'bbva',
  'scotiabank',
  'mibanco',
  'banbif',
  'pichincha',
  'credicorp',
  'pacifico',
  'rimac',
  'mapfre',
  'alicorp',
  'movistar',
  'claro',
  'entel',
  'bitel',
  'sunat',
  'sbs',
  'kpmg',
  'deloitte',
  'pwc',
  'accenture',
  'sonda',
  'ntt data',
  'indra',
  'globant',
  'stefanini',
  'falabella',
  'tottus',
  'ferreyros',
  'manpower',
  'adecco',
  'utp',
  // Tecnologías y áreas
  'python',
  'sql',
  'power bi',
  'excel',
  'java',
  'spring boot',
  'react',
  'typescript',
  'postgresql',
  'mongodb',
  'langgraph',
  'inteligencia artificial',
  'datos',
  'business intelligence',
  'sistemas',
  'software',
  'backend',
  'automatizacion',
  'banca',
  'finanzas',
  // Distritos
  'san isidro',
  'la molina',
  'miraflores',
  'surco',
  'san borja',
  'ate',
  'la victoria',
  'lince',
  'jesus maria',
  'lima centro',
];

/**
 * Ratcliff/Obershelp pattern matching equivalent to Python's difflib.SequenceMatcher.
 * Ratio = 2.0 * M / (len(a) + len(b))
 */
function findLongestMatch(
  a: string,
  alo: number,
  ahi: number,
  b: string,
  blo: number,
  bhi: number
): { i: number; j: number; k: number } {
  let besti = alo;
  let bestj = blo;
  let bestsize = 0;
  for (let i = alo; i < ahi; i++) {
    for (let j = blo; j < bhi; j++) {
      let k = 0;
      while (i + k < ahi && j + k < bhi && a[i + k] === b[j + k]) {
        k++;
      }
      if (k > bestsize) {
        besti = i;
        bestj = j;
        bestsize = k;
      }
    }
  }
  return { i: besti, j: bestj, k: bestsize };
}

function countMatches(
  a: string,
  alo: number,
  ahi: number,
  b: string,
  blo: number,
  bhi: number
): number {
  const match = findLongestMatch(a, alo, ahi, b, blo, bhi);
  if (match.k === 0) return 0;
  let matches = match.k;
  if (alo < match.i && blo < match.j) {
    matches += countMatches(a, alo, match.i, b, blo, match.j);
  }
  if (match.i + match.k < ahi && match.j + match.k < bhi) {
    matches += countMatches(
      a,
      match.i + match.k,
      ahi,
      b,
      match.j + match.k,
      bhi
    );
  }
  return matches;
}

export function sequenceMatcherRatio(a: string, b: string): number {
  if (a === b) return 1.0;
  const total = a.length + b.length;
  if (total === 0) return 1.0;
  const matches = countMatches(a, 0, a.length, b, 0, b.length);
  return (2.0 * matches) / total;
}

export function getCloseMatches(
  word: string,
  possibilities: readonly string[],
  n: number = 3,
  cutoff: number = 0.72
): string[] {
  const scored: { word: string; score: number }[] = [];
  for (const p of possibilities) {
    const score = sequenceMatcherRatio(word, p);
    if (score >= cutoff) {
      scored.push({ word: p, score });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, n).map((s) => s.word);
}

export function matchBrandFromQuery(qNorm: string): Brand | null {
  for (const b of BRANDS) {
    const allTerms = [
      ...b.patterns,
      ...(b.triggers || []),
      b.key,
      normalize(b.display),
    ];
    for (const t of allTerms) {
      if (t && (qNorm === t || containsPhrase(qNorm, t))) {
        return b;
      }
    }
  }

  // Fuzzy match sobre nombres cortos de marcas (ej. 'interbanck' -> interbank, 'alikorp')
  const tokens = qNorm.split(' ');
  for (const tok of tokens) {
    if (tok.length < 3) continue;
    for (const b of BRANDS) {
      const candidates = [b.key, normalize(b.display), ...b.patterns];
      for (const cand of candidates) {
        if (!cand.includes(' ') && cand.length >= 3) {
          const ratio = sequenceMatcherRatio(tok, cand);
          if (ratio >= 0.8) {
            return b;
          }
        }
      }
    }
  }
  return null;
}

export function suggestCorrections(
  rawQuery: string
): [string | null, string[]] {
  const qNorm = normalize(rawQuery);
  if (!qNorm) return [null, []];

  // 0. Revisar si la frase completa coincide con un sinónimo/variante
  for (const [canonical, variants] of Object.entries(SYNONYM_MAP)) {
    if (variants.includes(qNorm) && qNorm !== canonical) {
      return [canonical, [canonical]];
    }
  }

  const closeFull = getCloseMatches(qNorm, CANONICAL_VOCABULARY, 4, 0.72);
  if (closeFull.length > 0 && closeFull[0] !== qNorm) {
    return [closeFull[0], closeFull.filter((s) => s !== qNorm)];
  }

  // 1. Revisar token por token
  const tokens = qNorm.split(' ');
  const correctedTokens = [...tokens];
  let changed = false;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (CANONICAL_VOCABULARY.includes(tok)) continue;

    let mapped: string | null = null;
    for (const [canonical, variants] of Object.entries(SYNONYM_MAP)) {
      if (variants.includes(tok) && tok !== canonical) {
        mapped = canonical;
        break;
      }
    }

    if (mapped) {
      correctedTokens[i] = mapped;
      changed = true;
      continue;
    }

    // 2. Fuzzy match contra palabras del CANONICAL_VOCABULARY
    if (tok.length >= 4) {
      const close = getCloseMatches(tok, CANONICAL_VOCABULARY, 3, 0.74);
      if (close.length > 0 && close[0] !== tok) {
        correctedTokens[i] = close[0];
        changed = true;
      }
    }
  }

  const corrected = changed ? correctedTokens.join(' ') : null;
  const suggestions = getCloseMatches(
    qNorm,
    CANONICAL_VOCABULARY,
    4,
    0.6
  ).filter((s) => s !== qNorm);

  return [corrected, suggestions];
}

function expandTokenVariants(token: string): readonly string[] {
  for (const [canonical, variants] of Object.entries(SYNONYM_MAP)) {
    if (token === canonical || variants.includes(token)) {
      return [canonical, ...variants];
    }
  }
  return [token];
}

function getJobDescription(job: JobSummary): string {
  if (
    'raw_description' in job &&
    typeof (job as { raw_description?: unknown }).raw_description === 'string'
  ) {
    return (job as { raw_description: string }).raw_description;
  }
  return '';
}

export function searchJobs(
  jobs: readonly JobSummary[],
  rawQuery: string
): SearchOutcome {
  const qNorm = normalize(rawQuery);
  if (!qNorm) {
    return {
      jobs: [...jobs],
      corrected_query: null,
      did_you_mean: [],
      related_suggestions: [],
      agency_matches_count: 0,
      inferred_brand: null,
    };
  }

  const [corrected, didYouMean] = suggestCorrections(rawQuery);
  const targetBrand =
    matchBrandFromQuery(qNorm) ||
    (corrected ? matchBrandFromQuery(corrected) : null);

  const scoredResults: [number, JobSummary][] = [];
  let agencyHits = 0;

  // Caso 1: Búsqueda enfocada en una empresa específica
  if (targetBrand !== null) {
    const brandTerms = new Set([
      ...targetBrand.patterns,
      ...(targetBrand.triggers || []),
      targetBrand.key,
      normalize(targetBrand.display),
    ]);
    const sectorTerms = SECTOR_KEYWORDS[targetBrand.sector] || [];

    for (const job of jobs) {
      const comp = job.company || '';
      const title = job.title || '';
      const desc = getJobDescription(job);

      // Check precomputed fields or resolve on the fly
      let resolvedBrandKey = job.resolved_brand_key;
      let isViaAgency = job.resolved_via_agency;
      let agencyClue = job.agency_clue;

      if (!resolvedBrandKey && comp) {
        const employer = resolveEmployer(comp, title, desc);
        resolvedBrandKey = employer.brand?.key || null;
        isViaAgency = employer.via_agency;
        agencyClue = employer.clue;
      }

      const fullNorm = normalize(`${comp} ${title} ${desc}`);

      // 1A. Coincidencia directa con la empresa publicante
      if (resolvedBrandKey === targetBrand.key && !isViaAgency) {
        const jCopy: JobSummary = { ...job, _search_note: null };
        scoredResults.push([
          100.0 + (Number(job.final_ranking_score) || 0) * 0.1,
          jCopy,
        ]);
        continue;
      }

      // 1B. Agencia de reclutamiento o confidencial que menciona explícitamente o por pista a la empresa
      if (resolvedBrandKey === targetBrand.key && isViaAgency) {
        const note = agencyClue
          ? `Detectada para ${targetBrand.display} vía ${comp} («${agencyClue}»)`
          : `Reclutamiento para ${targetBrand.display} gestionado por ${comp}`;
        const jCopy: JobSummary = { ...job, _search_note: note };
        agencyHits++;
        scoredResults.push([
          92.0 + (Number(job.final_ranking_score) || 0) * 0.1,
          jCopy,
        ]);
        continue;
      }

      // 1C. Mención directa en el texto completo
      if (
        Array.from(brandTerms).some(
          (bt) => bt && containsPhrase(fullNorm, bt)
        )
      ) {
        const jCopy: JobSummary = {
          ...job,
          _search_note: `Menciona a ${targetBrand.display} en la convocatoria`,
        };
        scoredResults.push([
          85.0 + (Number(job.final_ranking_score) || 0) * 0.1,
          jCopy,
        ]);
        continue;
      }

      // 1D. Agencia reclutando para un cliente del mismo sector
      if (isAgencyOrConfidential(comp) && sectorTerms.length > 0) {
        if (
          !resolvedBrandKey &&
          sectorTerms.some((st) => containsPhrase(fullNorm, st))
        ) {
          const jCopy: JobSummary = {
            ...job,
            _search_note: `Posible vacante de ${targetBrand.display}: ${comp} recluta para cliente confidencial del sector ${targetBrand.sector}`,
          };
          agencyHits++;
          scoredResults.push([
            70.0 + (Number(job.final_ranking_score) || 0) * 0.1,
            jCopy,
          ]);
          continue;
        }
      }
    }

    scoredResults.sort((a, b) => b[0] - a[0]);

    const related = BRANDS.filter(
      (b) => b.sector === targetBrand.sector && b.key !== targetBrand.key
    )
      .slice(0, 4)
      .map((b) => b.display);

    const isDifferentDisplay =
      normalize(targetBrand.display) !== qNorm && targetBrand.key !== qNorm;

    return {
      jobs: scoredResults.map((pair) => pair[1]),
      corrected_query: isDifferentDisplay ? targetBrand.display : corrected,
      did_you_mean: didYouMean,
      related_suggestions: related,
      agency_matches_count: agencyHits,
      inferred_brand: targetBrand,
    };
  }

  // Caso 2: Búsqueda general por puesto, tecnología, distrito o modalidad
  const effectiveQuery = corrected || qNorm;
  let queryTokens: string[];
  if (
    Object.hasOwn(SYNONYM_MAP, effectiveQuery) ||
    CANONICAL_VOCABULARY.includes(effectiveQuery)
  ) {
    queryTokens = [effectiveQuery];
  } else {
    queryTokens = effectiveQuery.split(' ').filter(Boolean);
  }

  for (const job of jobs) {
    const comp = job.company || '';
    const title = job.title || '';
    const loc = job.location || '';
    const mod = job.modality || '';
    const skills = Array.isArray(job.matching_skills)
      ? job.matching_skills.join(' ')
      : String(job.matching_skills || '');
    const desc = getJobDescription(job);

    const primaryNorm = normalize(`${title} ${comp} ${loc} ${mod} ${skills}`);
    const fullNorm = normalize(`${primaryNorm} ${desc}`);
    const wordsInPrimary = primaryNorm.split(' ').filter(Boolean);

    let allTokensMatched = true;
    let relevance = 0.0;
    let fuzzyUsed = false;

    for (const tok of queryTokens) {
      const variants = expandTokenVariants(tok);

      if (
        variants.some((v) =>
          containsPhrase(primaryNorm, v, v.length >= 4)
        )
      ) {
        relevance += 30.0;
      } else if (
        variants.some((v) =>
          containsPhrase(fullNorm, v, v.length >= 4)
        )
      ) {
        relevance += 15.0;
      } else {
        // Coincidencia difusa contra palabras del título/empresa/ubicación
        if (tok.length >= 4 && wordsInPrimary.length > 0) {
          const best = Math.max(
            ...wordsInPrimary.map((w) => sequenceMatcherRatio(tok, w))
          );
          if (best >= 0.78) {
            relevance += 12.0;
            fuzzyUsed = true;
            continue;
          }
        }
        allTokensMatched = false;
        break;
      }
    }

    if (allTokensMatched) {
      let note: string | null = null;
      if (corrected && corrected !== qNorm) {
        note = `Coincidencia para «${corrected}»`;
      } else if (fuzzyUsed) {
        note = 'Coincidencia aproximada por similitud de texto';
      }

      scoredResults.push([
        relevance + (Number(job.final_ranking_score) || 0) * 0.1,
        { ...job, _search_note: note },
      ]);
    }
  }

  scoredResults.sort((a, b) => b[0] - a[0]);

  let finalDidYouMean = didYouMean;
  if (scoredResults.length === 0 && finalDidYouMean.length === 0) {
    finalDidYouMean = ['Python', 'SQL', 'Power BI', 'BCP', 'Sistemas', 'Datos'];
  }

  return {
    jobs: scoredResults.map((pair) => pair[1]),
    corrected_query: corrected !== qNorm ? corrected : null,
    did_you_mean: finalDidYouMean,
    related_suggestions: [],
    agency_matches_count: 0,
    inferred_brand: null,
  };
}
