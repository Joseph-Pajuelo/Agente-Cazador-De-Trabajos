/**
 * Registro de empresas y agencias de reclutamiento del mercado peruano.
 * Port directo de services/pipeline/domain/companies.py
 */

import { Brand, Employer } from './types';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Minúsculas, sin tildes y sin signos:
 * 'BANCO DE CRÉDITO (BCP)' -> 'banco de credito bcp'
 */
export function normalize(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Coincidencia por palabra completa (o prefijo de palabra) sobre texto ya normalizado.
 * Utiliza lookaround para asegurar límites de palabra exactos sobre [a-z0-9].
 */
export function containsPhrase(
  haystackNorm: string,
  phraseNorm: string,
  allowPrefix: boolean = false
): boolean {
  if (!phraseNorm) return false;
  const tail = allowPrefix ? '' : '(?![a-z0-9])';
  const regex = new RegExp(`(?<![a-z0-9])${escapeRegex(phraseNorm)}${tail}`);
  return regex.test(haystackNorm);
}

export const BRANDS: readonly Brand[] = [
  {
    key: 'bcp',
    display: 'BCP',
    code: 'BCP',
    color: '#1F4E9E',
    tint: '#E8EEF8',
    sector: 'banca',
    patterns: ['bcp', 'banco de credito', 'viabcp', 'yape'],
    triggers: ['banco credito'],
    clues: [
      'banco mas grande del peru',
      'banco mas grande del pais',
      'banco lider del peru',
      'principal banco del peru',
    ],
  },
  {
    key: 'interbank',
    display: 'Interbank',
    code: 'IBK',
    color: '#1E6B4F',
    tint: '#E6F2EC',
    sector: 'banca',
    patterns: ['interbank', 'ibk'],
  },
  {
    key: 'intercorp',
    display: 'Intercorp',
    code: 'ITC',
    color: '#1E6B4F',
    tint: '#E6F2EC',
    sector: 'holding',
    patterns: ['intercorp'],
  },
  {
    key: 'bbva',
    display: 'BBVA',
    code: 'BBVA',
    color: '#1A3F7A',
    tint: '#E7ECF5',
    sector: 'banca',
    patterns: ['bbva'],
    triggers: ['continental'],
  },
  {
    key: 'scotiabank',
    display: 'Scotiabank',
    code: 'SCT',
    color: '#A3312F',
    tint: '#F7E9E8',
    sector: 'banca',
    patterns: ['scotiabank', 'scotia'],
  },
  {
    key: 'mibanco',
    display: 'Mibanco',
    code: 'MIB',
    color: '#2F6B3A',
    tint: '#E8F1EA',
    sector: 'banca',
    patterns: ['mibanco'],
  },
  {
    key: 'banbif',
    display: 'BanBif',
    code: 'BIF',
    color: '#245C80',
    tint: '#E6EFF5',
    sector: 'banca',
    patterns: ['banbif'],
  },
  {
    key: 'pichincha',
    display: 'Banco Pichincha',
    code: 'PCH',
    color: '#8A6A12',
    tint: '#F6F0DF',
    sector: 'banca',
    patterns: ['pichincha'],
  },
  {
    key: 'sbs',
    display: 'SBS',
    code: 'SBS',
    color: '#3D4A5C',
    tint: '#ECEEF1',
    sector: 'gobierno',
    patterns: ['superintendencia de banca', 'sbs'],
  },
  {
    key: 'credicorp',
    display: 'Credicorp',
    code: 'CRC',
    color: '#1F4E9E',
    tint: '#E8EEF8',
    sector: 'holding',
    patterns: ['credicorp'],
  },
  {
    key: 'pacifico',
    display: 'Pacífico Seguros',
    code: 'PAC',
    color: '#245C80',
    tint: '#E6EFF5',
    sector: 'seguros',
    patterns: ['pacifico seguros', 'pacifico eps', 'pacifico vida'],
    triggers: ['pacifico'],
  },
  {
    key: 'rimac',
    display: 'Rímac',
    code: 'RIM',
    color: '#A3312F',
    tint: '#F7E9E8',
    sector: 'seguros',
    patterns: ['rimac'],
  },
  {
    key: 'mapfre',
    display: 'Mapfre',
    code: 'MAP',
    color: '#A3312F',
    tint: '#F7E9E8',
    sector: 'seguros',
    patterns: ['mapfre'],
  },
  {
    key: 'sanna',
    display: 'Sanna',
    code: 'SAN',
    color: '#245C80',
    tint: '#E6EFF5',
    sector: 'salud',
    patterns: ['sanna'],
  },
  {
    key: 'alicorp',
    display: 'Alicorp',
    code: 'ALI',
    color: '#A3312F',
    tint: '#F7E9E8',
    sector: 'consumo',
    patterns: ['alicorp'],
  },
  {
    key: 'movistar',
    display: 'Movistar',
    code: 'MOV',
    color: '#245C80',
    tint: '#E6EFF5',
    sector: 'telecom',
    patterns: ['movistar', 'telefonica', 'integratel'],
  },
  {
    key: 'claro',
    display: 'Claro',
    code: 'CLR',
    color: '#A3312F',
    tint: '#F7E9E8',
    sector: 'telecom',
    patterns: ['america movil', 'claro peru'],
    triggers: ['claro'],
  },
  {
    key: 'entel',
    display: 'Entel',
    code: 'ENT',
    color: '#1A3F7A',
    tint: '#E7ECF5',
    sector: 'telecom',
    patterns: ['entel'],
  },
  {
    key: 'bitel',
    display: 'Bitel',
    code: 'BTL',
    color: '#8A6A12',
    tint: '#F6F0DF',
    sector: 'telecom',
    patterns: ['bitel'],
  },
  {
    key: 'sunat',
    display: 'SUNAT',
    code: 'SNT',
    color: '#3D4A5C',
    tint: '#ECEEF1',
    sector: 'gobierno',
    patterns: ['sunat'],
  },
  {
    key: 'kpmg',
    display: 'KPMG',
    code: 'KPMG',
    color: '#1A3F7A',
    tint: '#E7ECF5',
    sector: 'consultoria',
    patterns: ['kpmg'],
  },
  {
    key: 'deloitte',
    display: 'Deloitte',
    code: 'DLT',
    color: '#2F6B3A',
    tint: '#E8F1EA',
    sector: 'consultoria',
    patterns: ['deloitte'],
  },
  {
    key: 'pwc',
    display: 'PwC',
    code: 'PWC',
    color: '#8A4B12',
    tint: '#F6EBDF',
    sector: 'consultoria',
    patterns: ['pwc', 'pricewaterhouse'],
  },
  {
    key: 'ey',
    display: 'EY',
    code: 'EY',
    color: '#5E5A1A',
    tint: '#F3F2E2',
    sector: 'consultoria',
    patterns: ['ernst young', 'ey peru'],
  },
  {
    key: 'accenture',
    display: 'Accenture',
    code: 'ACN',
    color: '#5B3A8C',
    tint: '#EFE9F6',
    sector: 'tecnologia',
    patterns: ['accenture'],
  },
  {
    key: 'ibm',
    display: 'IBM',
    code: 'IBM',
    color: '#1A3F7A',
    tint: '#E7ECF5',
    sector: 'tecnologia',
    patterns: ['ibm'],
  },
  {
    key: 'sonda',
    display: 'SONDA',
    code: 'SND',
    color: '#3E4C8A',
    tint: '#EAECF5',
    sector: 'tecnologia',
    patterns: ['sonda'],
  },
  {
    key: 'nttdata',
    display: 'NTT DATA',
    code: 'NTT',
    color: '#245C80',
    tint: '#E6EFF5',
    sector: 'tecnologia',
    patterns: ['ntt data', 'nttdata', 'everis'],
  },
  {
    key: 'indra',
    display: 'Indra',
    code: 'IND',
    color: '#5B3A8C',
    tint: '#EFE9F6',
    sector: 'tecnologia',
    patterns: ['indra', 'minsait'],
  },
  {
    key: 'globant',
    display: 'Globant',
    code: 'GLB',
    color: '#2F6B3A',
    tint: '#E8F1EA',
    sector: 'tecnologia',
    patterns: ['globant'],
  },
  {
    key: 'stefanini',
    display: 'Stefanini',
    code: 'STF',
    color: '#3E4C8A',
    tint: '#EAECF5',
    sector: 'tecnologia',
    patterns: ['stefanini'],
  },
  {
    key: 'falabella',
    display: 'Falabella',
    code: 'FAL',
    color: '#2F6B3A',
    tint: '#E8F1EA',
    sector: 'retail',
    patterns: ['falabella', 'saga falabella'],
  },
  {
    key: 'tottus',
    display: 'Tottus',
    code: 'TOT',
    color: '#2F6B3A',
    tint: '#E8F1EA',
    sector: 'retail',
    patterns: ['tottus'],
  },
  {
    key: 'utp',
    display: 'UTP',
    code: 'UTP',
    color: '#A3312F',
    tint: '#F7E9E8',
    sector: 'educacion',
    patterns: ['universidad tecnologica del peru', 'utp'],
  },
  {
    key: 'ferreyros',
    display: 'Ferreyros',
    code: 'FER',
    color: '#8A6A12',
    tint: '#F6F0DF',
    sector: 'industria',
    patterns: ['ferreyros', 'ferreycorp'],
  },
];

export const SECTOR_KEYWORDS: Record<string, readonly string[]> = {
  banca: [
    'banco',
    'bancario',
    'bancaria',
    'sector banca',
    'entidad financiera',
    'sector financiero',
  ],
  seguros: ['aseguradora', 'seguros'],
  telecom: ['telecomunicaciones', 'operador movil'],
  consultoria: ['consultora', 'auditoria', 'big four'],
  tecnologia: [
    'consultora de tecnologia',
    'empresa de tecnologia',
    'software factory',
  ],
  retail: ['retail', 'tienda por departamento', 'supermercado'],
};

export const STAFFING_AGENCIES: readonly string[] = [
  'manpower',
  'manpowergroup',
  'experis',
  'adecco',
  'randstad',
  'kelly services',
  'michael page',
  'page personnel',
  'hays',
  'robert half',
  'pigmalion',
  'evaluar',
  'bumeran seleccion',
  'laborum',
  'talent search',
  'headhunter',
];

const BRAND_BY_KEY = new Map<string, Brand>(
  BRANDS.map((b) => [b.key, b])
);

export function getBrand(key: string | null | undefined): Brand | null {
  if (!key) return null;
  return BRAND_BY_KEY.get(key) || null;
}

export function isAgencyOrConfidential(company: string): boolean {
  const c = normalize(company);
  if (!c || c.includes('confidencial') || c.includes('no especificado')) {
    return true;
  }
  return STAFFING_AGENCIES.some((agency) => containsPhrase(c, agency));
}

export function brandInText(
  textNorm: string,
  includeTriggers: boolean = false
): Brand | null {
  for (const b of BRANDS) {
    const phrases = [
      ...b.patterns,
      ...(includeTriggers && b.triggers ? b.triggers : []),
    ];
    if (phrases.some((p) => containsPhrase(textNorm, p))) {
      return b;
    }
  }
  return null;
}

export function brandByClue(textNorm: string): [Brand, string] | null {
  for (const b of BRANDS) {
    if (b.clues) {
      for (const clue of b.clues) {
        if (textNorm.includes(clue)) {
          return [b, clue];
        }
      }
    }
  }
  return null;
}

export function resolveEmployer(
  company: string,
  title: string,
  description: string
): Employer {
  const companyNorm = normalize(company);
  const publisherBrand = brandInText(companyNorm, true);

  if (publisherBrand && !isAgencyOrConfidential(company)) {
    return {
      brand: publisherBrand,
      basis: 'publisher',
      publisher: company,
      clue: '',
      sector_hint: null,
      via_agency: false,
    };
  }

  if (isAgencyOrConfidential(company)) {
    const textNorm = normalize(`${title} ${description}`);
    const explicit = brandInText(textNorm);
    if (explicit) {
      return {
        brand: explicit,
        basis: 'agency_explicit',
        publisher: company,
        clue: '',
        sector_hint: null,
        via_agency: true,
      };
    }

    const clueMatch = brandByClue(textNorm);
    if (clueMatch) {
      return {
        brand: clueMatch[0],
        basis: 'agency_clue',
        publisher: company,
        clue: clueMatch[1],
        sector_hint: null,
        via_agency: true,
      };
    }

    let detectedSector: string | null = null;
    for (const [sector, kws] of Object.entries(SECTOR_KEYWORDS)) {
      if (kws.some((kw) => containsPhrase(textNorm, kw))) {
        detectedSector = sector;
        break;
      }
    }

    return {
      brand: null,
      basis: 'unknown',
      publisher: company,
      clue: '',
      sector_hint: detectedSector,
      via_agency: false,
    };
  }

  return {
    brand: null,
    basis: 'publisher',
    publisher: company,
    clue: '',
    sector_hint: null,
    via_agency: false,
  };
}

/**
 * Pre-flight export for Task 4's buildHistoricalSearchFilters:
 * Analyzes query to identify target brand, associated sector hint,
 * and expanded search terms without duplicating keyword maps.
 */
export function resolveBrandOrSectorFromQuery(rawQuery: string): {
  brandKey: string | null;
  sectorHint: string | null;
  expandedTerms: string[];
} {
  const qNorm = normalize(rawQuery);
  if (!qNorm) {
    return { brandKey: null, sectorHint: null, expandedTerms: [] };
  }

  // 1. Check direct or trigger brand match
  for (const b of BRANDS) {
    const terms = [
      b.key,
      normalize(b.display),
      ...b.patterns,
      ...(b.triggers || []),
    ];
    if (terms.some((t) => t && (qNorm === t || containsPhrase(qNorm, t)))) {
      const expanded = Array.from(
        new Set([b.key, normalize(b.display), ...b.patterns, ...(b.triggers || [])])
      );
      return {
        brandKey: b.key,
        sectorHint: b.sector,
        expandedTerms: expanded,
      };
    }
  }

  // 2. Check sector keywords
  for (const [sector, kws] of Object.entries(SECTOR_KEYWORDS)) {
    if (kws.some((kw) => qNorm === kw || containsPhrase(qNorm, kw))) {
      return {
        brandKey: null,
        sectorHint: sector,
        expandedTerms: [...kws],
      };
    }
  }

  return {
    brandKey: null,
    sectorHint: null,
    expandedTerms: [qNorm],
  };
}
