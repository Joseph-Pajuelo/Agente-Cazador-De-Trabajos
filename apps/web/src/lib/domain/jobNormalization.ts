/**
 * Deterministic Lima Job Metadata Extractor & Normalizer
 * Single source of truth for district, zone, category, role level, English, and salary normalization.
 */

export const LIMA_DISTRICTS = [
  'San Isidro',
  'Miraflores',
  'Santiago de Surco',
  'San Borja',
  'La Molina',
  'Jesús María',
  'Magdalena del Mar',
  'Lince',
  'Pueblo Libre',
  'San Miguel',
  'Barranco',
  'Surquillo',
  'Lima Centro',
  'La Victoria',
  'Breña',
  'Rímac',
  'Ate',
  'Santa Anita',
  'San Juan de Lurigancho',
  'Lurigancho - Chosica',
  'Los Olivos',
  'Independencia',
  'San Martín de Porres',
  'Chorrillos',
  'San Juan de Miraflores',
  'Villa María del Triunfo',
  'Villa El Salvador',
  'Callao',
  'Lurín / Balnearios',
  'Remoto',
  'Lima Metropolitana',
] as const;

export type LimaDistrict = (typeof LIMA_DISTRICTS)[number];

export const LIMA_ZONES_BY_DISTRICT: Record<string, string> = {
  'San Isidro': 'Lima Moderna',
  'Miraflores': 'Lima Moderna',
  'Santiago de Surco': 'Lima Moderna',
  'San Borja': 'Lima Moderna',
  'La Molina': 'Lima Moderna',
  'Jesús María': 'Lima Moderna',
  'Magdalena del Mar': 'Lima Moderna',
  'Lince': 'Lima Moderna',
  'Pueblo Libre': 'Lima Moderna',
  'San Miguel': 'Lima Moderna',
  'Barranco': 'Lima Moderna',
  'Surquillo': 'Lima Moderna',
  'Lima Centro': 'Lima Centro',
  'La Victoria': 'Lima Centro',
  'Breña': 'Lima Centro',
  'Rímac': 'Lima Centro',
  'Ate': 'Lima Este',
  'Santa Anita': 'Lima Este',
  'San Juan de Lurigancho': 'Lima Este',
  'Lurigancho - Chosica': 'Lima Este',
  'Los Olivos': 'Lima Norte',
  'Independencia': 'Lima Norte',
  'San Martín de Porres': 'Lima Norte',
  'Chorrillos': 'Lima Sur',
  'San Juan de Miraflores': 'Lima Sur',
  'Villa María del Triunfo': 'Lima Sur',
  'Villa El Salvador': 'Lima Sur',
  'Callao': 'Callao',
  'Lurín / Balnearios': 'Lima Sur',
  'Remoto': 'Remoto',
  'Lima Metropolitana': 'Lima Metropolitana',
};

export const LIMA_CATEGORIES = [
  'Datos, BI & IA',
  'Desarrollo & Software',
  'Sistemas & TI',
  'Administración, Banca & Finanzas',
  'Ingeniería & Operaciones',
] as const;

export type LimaCategory = (typeof LIMA_CATEGORIES)[number];

export type RoleLevel = 'preprofesional' | 'profesional' | 'trainee_junior' | 'unknown';

export type EnglishLevel = 'basico' | 'intermedio' | 'avanzado';

export interface JobNormalizationInput {
  title?: string | null;
  location?: string | null;
  modality?: string | null;
  salary?: string | null;
  raw_description?: string | null;
}

export interface NormalizedJobMetadata {
  district: string;
  lima_zone: string;
  category: string;
  role_level: RoleLevel;
  english_required: boolean;
  english_level: EnglishLevel | null;
  salary_min: number | null;
  salary_max: number | null;
}

/**
 * Normalizes text to lower-case, accent-free, alphanumeric with single spaces.
 */
export function normalizeText(text?: string | null): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * District lookup dictionary with canonical names and regex matchers.
 * Ordered intentionally: specific phrases before generic substrings.
 */
interface DistrictRule {
  canonical: string;
  patterns: RegExp[];
  acronyms?: RegExp[];
}

const DISTRICT_RULES: DistrictRule[] = [
  // Multi-word / specific districts first
  {
    canonical: 'Santiago de Surco',
    patterns: [
      /\bsantiago de surco\b/,
      /\bsurco\b/,
      /\bchacarilla\b/,
      /\bmonterrico\b/,
      /\bel polo\b/,
    ],
  },
  {
    canonical: 'San Juan de Miraflores',
    patterns: [/\bsan juan de miraflores\b/],
    acronyms: [/\bsjm\b/],
  },
  {
    canonical: 'San Juan de Lurigancho',
    patterns: [/\bsan juan de lurigancho\b/],
    acronyms: [/\bsjl\b/],
  },
  {
    canonical: 'Lurigancho - Chosica',
    patterns: [
      /\blurigancho\b/,
      /\bchosica\b/,
      /\bsanta maria de huachipa\b/,
      /\bhuachipa\b/,
    ],
  },
  {
    canonical: 'San Martín de Porres',
    patterns: [/\bsan martin de porres\b/, /\bsan martin de porras\b/],
    acronyms: [/\bsmp\b/],
  },
  {
    canonical: 'Villa María del Triunfo',
    patterns: [/\bvilla maria del triunfo\b/],
    acronyms: [/\bvmt\b/],
  },
  {
    canonical: 'Villa El Salvador',
    patterns: [/\bvilla el salvador\b/],
    acronyms: [/\bves\b/],
  },
  {
    canonical: 'Magdalena del Mar',
    patterns: [/\bmagdalena del mar\b/, /\bmagdalena\b/],
  },
  {
    canonical: 'Pueblo Libre',
    patterns: [/\bpueblo libre\b/],
  },
  {
    canonical: 'Jesús María',
    patterns: [/\bjesus maria\b/],
  },
  {
    canonical: 'San Isidro',
    patterns: [
      /\bsan isidro\b/,
      /\bsanhattan\b/,
      /\bcamino real\b/,
      /\bcanaval y moreyra\b/,
      /\brivera navarrete\b/,
    ],
  },
  {
    canonical: 'San Borja',
    patterns: [/\bsan borja\b/],
  },
  {
    canonical: 'San Miguel',
    patterns: [/\bsan miguel\b/],
  },
  {
    canonical: 'Santa Anita',
    patterns: [/\bsanta anita\b/],
  },
  {
    canonical: 'Los Olivos',
    patterns: [/\blos olivos\b/],
  },
  {
    canonical: 'La Molina',
    patterns: [/\bla molina\b/],
  },
  {
    canonical: 'La Victoria',
    patterns: [/\bla victoria\b/, /\bsanta catalina\b/, /\bgamarra\b/],
  },
  {
    canonical: 'Lima Centro',
    patterns: [/\bcercado de lima\b/, /\bcercado\b/, /\blima centro\b/, /\bcentro de lima\b/],
  },
  {
    canonical: 'Lurín / Balnearios',
    patterns: [
      /\blurin\b/,
      /\bpunta negra\b/,
      /\bpunta hermosa\b/,
      /\bsan bartolo\b/,
      /\bsanta maria del mar\b/,
      /\bpucusana\b/,
      /\bpachacamac\b/,
    ],
  },
  {
    canonical: 'Callao',
    patterns: [
      /\bgobierno regional del callao\b/,
      /\bcallao\b/,
      /\bbellavista\b/,
      /\bla perla\b/,
      /\bla punta\b/,
      /\bcarmen de la legua\b/,
      /\bventanilla\b/,
    ],
  },
  {
    canonical: 'Ate',
    patterns: [
      /\bate vitarte\b/,
      /\bvitarte\b/,
      /\bcarretera central\b.*?\bate\b/,
      /\bate\b.*?carretera central\b/,
      /\bate\b/,
    ],
  },
  {
    canonical: 'Miraflores',
    patterns: [/\bmiraflores\b/],
  },
  {
    canonical: 'Lince',
    patterns: [/\blince\b/],
  },
  {
    canonical: 'Surquillo',
    patterns: [/\bsurquillo\b/],
  },
  {
    canonical: 'Barranco',
    patterns: [/\bbarranco\b/],
  },
  {
    canonical: 'Independencia',
    patterns: [/\bindependencia\b/],
  },
  {
    canonical: 'Chorrillos',
    patterns: [/\bchorrillos\b/],
  },
  {
    canonical: 'Breña',
    patterns: [/\bbrena\b/],
  },
  {
    canonical: 'Rímac',
    patterns: [/\brimac\b/],
  },
];

/**
 * Searches for a canonical district in normalized text.
 */
function findDistrictInText(normText: string, allowAcronyms = true): string | null {
  if (!normText) return null;
  for (const rule of DISTRICT_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(normText)) {
        return rule.canonical;
      }
    }
    if (allowAcronyms && rule.acronyms) {
      for (const acr of rule.acronyms) {
        if (acr.test(normText)) {
          return rule.canonical;
        }
      }
    }
  }
  return null;
}

/**
 * Strips rating numbers (e.g. "4,3", "4.1") and generic Lima / Peru strings.
 */
function cleanLocationNoise(rawLocation?: string | null): string {
  if (!rawLocation) return '';
  const trimmed = rawLocation.trim();

  // Strip Computrabajo / job board rating numbers (e.g. "4,3", "4.1", "4,6")
  if (/^\d+([.,]\d+)?$/.test(trimmed)) {
    return '';
  }

  // Strip purely generic location mentions
  const norm = normalizeText(trimmed);
  const genericPatterns = [
    /^lima peru$/,
    /^lima lima$/,
    /^lima$/,
    /^peru$/,
    /^provincia de lima peru$/,
    /^provincia de lima$/,
    /^area metropolitana de lima$/,
  ];
  for (const gen of genericPatterns) {
    if (gen.test(norm)) {
      return '';
    }
  }

  return norm;
}

/**
 * Extracts canonical Lima district and zone.
 */
export function extractLimaDistrictAndZone(input: {
  title?: string | null;
  location?: string | null;
  modality?: string | null;
  raw_description?: string | null;
}): { district: string; lima_zone: string } {
  const cleanedLoc = cleanLocationNoise(input.location);
  const normTitle = normalizeText(input.title);
  const normDesc = normalizeText(input.raw_description);
  const normModality = normalizeText(input.modality);

  // 1. Prioritize physical district in location (if not noise/generic)
  let foundDistrict = findDistrictInText(cleanedLoc, true);

  // 2. Then check title
  if (!foundDistrict) {
    foundDistrict = findDistrictInText(normTitle, true);
  }

  // 3. Then check description (skip 3-letter acronyms like "ves" which mean "you see" in Spanish)
  if (!foundDistrict) {
    foundDistrict = findDistrictInText(normDesc, false);
  }

  if (foundDistrict) {
    return {
      district: foundDistrict,
      lima_zone: LIMA_ZONES_BY_DISTRICT[foundDistrict] || 'Lima Metropolitana',
    };
  }

  // 4. If no physical district found, check if remote
  const isRemote =
    normModality.includes('remoto') ||
    cleanedLoc.includes('remoto') ||
    cleanedLoc.includes('teletrabajo') ||
    normalizeText(input.location).includes('remoto') ||
    normalizeText(input.location).includes('teletrabajo');

  if (isRemote) {
    return {
      district: 'Remoto',
      lima_zone: 'Remoto',
    };
  }

  // 5. Default fallback
  return {
    district: 'Lima Metropolitana',
    lima_zone: 'Lima Metropolitana',
  };
}

/**
 * Parses numeric currency amount in PEN within plausible bounds [800, 12000].
 */
function parseBoundedPENNumber(raw: string): number | null {
  const cleaned = raw.replace(/\s+/g, '');
  let val: number;

  if (cleaned.includes(',') && cleaned.includes('.')) {
    // Both separators present
    if (cleaned.indexOf('.') < cleaned.indexOf(',')) {
      // 1.300,00 -> dot thousand, comma decimal
      val = parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
    } else {
      // 1,300.00 -> comma thousand, dot decimal
      val = parseFloat(cleaned.replace(/,/g, ''));
    }
  } else if (cleaned.includes(',')) {
    // 1,230 or 1,230,00
    const parts = cleaned.split(',');
    if (parts.length === 2 && parts[1].length === 3) {
      val = parseFloat(parts.join(''));
    } else {
      val = parseFloat(cleaned.replace(',', '.'));
    }
  } else if (cleaned.includes('.')) {
    // 1.300 or 1.300.00
    const parts = cleaned.split('.');
    if (parts.length === 2 && parts[1].length === 3) {
      val = parseFloat(parts.join(''));
    } else {
      val = parseFloat(cleaned);
    }
  } else {
    val = parseFloat(cleaned);
  }

  if (isNaN(val)) return null;
  val = Math.round(val);
  if (val >= 800 && val <= 12000) {
    return val;
  }
  return null;
}

/**
 * Extracts monthly PEN salary range [salary_min, salary_max].
 */
export function extractSalaryPEN(
  salary?: string | null,
  rawDescription?: string | null
): { salary_min: number | null; salary_max: number | null } {
  // Check explicit salary field first
  if (salary && typeof salary === 'string') {
    const raw = salary.trim();
    // Reject hourly, annual, and vague terms
    const isHourlyOrAnnual = /(?:hora|\/hr|\/h\b|hour|anual|al año|año\b|year)/i.test(raw);
    const isVague = /(?:convenir|confidencial|tratar|especificado)/i.test(raw);

    if (!isHourlyOrAnnual && !isVague) {
      // Range check: e.g. S/ 1,200 - S/ 1,500 or 1200 a 1500
      const rangeMatch = raw.match(
        /([0-9]+[0-9.,]*)\s*(?:-|a|al|hasta)\s*(?:s\/\.?|s\.)?\s*([0-9]+[0-9.,]*)/i
      );
      if (rangeMatch) {
        const minVal = parseBoundedPENNumber(rangeMatch[1]);
        const maxVal = parseBoundedPENNumber(rangeMatch[2]);
        if (minVal !== null && maxVal !== null) {
          return {
            salary_min: Math.min(minVal, maxVal),
            salary_max: Math.max(minVal, maxVal),
          };
        }
      }

      // Single amount check: e.g. S/ 1,230.00
      const singleMatch = raw.match(/([0-9]+[0-9.,]*)/);
      if (singleMatch) {
        const val = parseBoundedPENNumber(singleMatch[1]);
        if (val !== null) {
          return { salary_min: val, salary_max: val };
        }
      }
    }
  }

  // Check description for explicit subvención / sueldo / remuneración mentions
  if (rawDescription && typeof rawDescription === 'string') {
    const contextRegex =
      /(?:subvenci[oó]n|sueldo|remuneraci[oó]n|salario)\s*(?:econ[oó]mica|mensual|b[aá]sico)?\s*(?:de|en|:)?\s*(?:s\/\.?|s\.)?\s*([0-9]+[0-9.,]*)(?:\s*(?:-|a)\s*(?:s\/\.?|s\.)?\s*([0-9]+[0-9.,]*))?/gi;

    let match: RegExpExecArray | null;
    while ((match = contextRegex.exec(rawDescription)) !== null) {
      // Check surrounding window for hourly / annual rejection
      const windowStart = Math.max(0, match.index - 20);
      const windowEnd = Math.min(rawDescription.length, match.index + match[0].length + 20);
      const windowText = rawDescription.slice(windowStart, windowEnd);

      if (/(?:hora|\/hr|\/h\b|hour|anual|al año|año\b|year)/i.test(windowText)) {
        continue;
      }

      const num1 = parseBoundedPENNumber(match[1]);
      if (match[2]) {
        const num2 = parseBoundedPENNumber(match[2]);
        if (num1 !== null && num2 !== null) {
          return {
            salary_min: Math.min(num1, num2),
            salary_max: Math.max(num1, num2),
          };
        }
      } else if (num1 !== null) {
        return { salary_min: num1, salary_max: num1 };
      }
    }
  }

  return { salary_min: null, salary_max: null };
}

/**
 * Extracts role level from title and raw description without relying on AI evaluations.
 */
export function extractRoleLevel(
  title?: string | null,
  rawDescription?: string | null
): RoleLevel {
  const normTitle = normalizeText(title);
  const normDesc = normalizeText(rawDescription);

  // 1. Direct title checks (highest precision)
  const isTitlePre =
    /\b(preprofesional|pre profesional|pre-profesional|practicas pre|practica pre|intern|internship|pasante|pasantia)\b/.test(
      normTitle
    );
  if (isTitlePre) return 'preprofesional';

  const isTitlePro =
    /\b(practicante profesional|practicas profesionales|practica profesional|egresado|bachiller|asistente|analista|coordinador)\b/.test(
      normTitle
    );
  if (isTitlePro) return 'profesional';

  const isTitleTraineeJr = /\b(trainee|junior|\bjr\b|entry level|joven talento)\b/.test(normTitle);
  if (isTitleTraineeJr) return 'trainee_junior';

  // 2. Explicit structured modality headers in description (e.g. Practicas.pe "Modalidad de prácticas: Pre-Profesional")
  if (/\bmodalidad de practicas\s+pre\s*profesional\b/.test(normDesc)) {
    return 'preprofesional';
  }
  if (/\bmodalidad de practicas\s+profesional\b/.test(normDesc)) {
    return 'profesional';
  }

  // 3. Description checks for preprofesional vs profesional vs trainee_junior
  const hasDescPre =
    /\b(preprofesional|pre profesional|pre-profesional|practicas pre|practica pre|estudiante universitario|estudiantes universitarios|ultimos ciclos|cursando|estudiante de|alumnos de|convenio de practicas|6to|7mo|8vo|9no|sexto ciclo|septimo ciclo|octavo ciclo|noveno ciclo)\b/.test(
      normDesc
    );

  const hasDescPro =
    /\b(practicante profesional|practicas profesionales|practica profesional|egresado|bachiller|graduado|titulado)\b/.test(
      normDesc
    ) && !/\b(no egresado|sin egresar|abstenerse egresados)\b/.test(normDesc);

  const hasDescTraineeJr = /\b(trainee|junior|\bjr\b|entry level|jovenes talentos|joven talento)\b/.test(
    normDesc
  );

  if (hasDescPre && !hasDescPro) return 'preprofesional';
  if (hasDescPro && !hasDescPre) return 'profesional';
  if (hasDescPre && hasDescPro) {
    // Mixed pre/pro description ("estudiantes de últimos ciclos o recién egresados"):
    return 'preprofesional';
  }
  if (hasDescTraineeJr) return 'trainee_junior';

  return 'unknown';
}

/**
 * Cleans scraper prefix artifacts from job titles (e.g., "de Practicante de ..." -> "Practicante de ...").
 */
export function cleanJobTitle(title?: string | null): string {
  if (!title) return '';
  let cleaned = title.trim();
  cleaned = cleaned.replace(/^convocatoria\s+(?:para|de)\s+/i, '');
  cleaned = cleaned.replace(
    /^de\s+(?=(?:practicante|pr[aá]cticas|becario|asistente|analista|t[eé]cnico|auxiliar|programa)\b)/i,
    ''
  );
  if (cleaned.length > 1) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return cleaned;
}

/**
 * Cleans scraper numeric rating noise (e.g., CompuTrabajo "4,3") from location display string.
 */
export function cleanJobLocation(
  rawLocation?: string | null,
  district?: string | null
): string {
  const trimmed = (rawLocation || '').trim();
  if (!trimmed || /^\d+([.,]\d+)?$/.test(trimmed)) {
    if (district === 'Remoto') return 'Remoto, Lima';
    if (district && district !== 'Lima Metropolitana') {
      return `${district}, Lima`;
    }
    return 'Lima, Perú';
  }
  return trimmed;
}

/**
 * Infers modality ("Remoto", "Híbrido", "Presencial") when raw modality is unspecified.
 */
export function extractModality(input: {
  title?: string | null;
  modality?: string | null;
  raw_description?: string | null;
}): string {
  const rawMod = (input.modality || '').trim();
  const normMod = normalizeText(rawMod);
  if (normMod === 'remoto') return 'Remoto';
  if (normMod === 'hibrido') return 'Híbrido';
  if (normMod === 'presencial') return 'Presencial';

  const normTitle = normalizeText(input.title);
  const normDesc = normalizeText(input.raw_description);
  const combined = `${normTitle} ${normDesc}`;

  if (
    /\b(hibrido|presencial y remoto|remoto y presencial|semipresencial|semi presencial|modalidad mixta)\b/.test(
      combined
    )
  ) {
    return 'Híbrido';
  }
  if (
    /\b(remoto|teletrabajo|home office)\b/.test(normTitle) ||
    /\b(100 remoto|trabajo remoto|modalidad remoto|modalidad teletrabajo|home office|desde casa)\b/.test(
      normDesc
    )
  ) {
    return 'Remoto';
  }
  if (
    /\b(presencial)\b/.test(normTitle) ||
    /\b(trabajo presencial|modalidad presencial|100 presencial|en oficina)\b/.test(normDesc)
  ) {
    return 'Presencial';
  }

  return rawMod || 'No especificado';
}

/**
 * Extracts English requirement and highest level (basico / intermedio / avanzado).
 */
export function extractEnglishRequirement(
  title?: string | null,
  rawDescription?: string | null
): { english_required: boolean; english_level: EnglishLevel | null } {
  const fullText = `${normalizeText(title)} ${normalizeText(rawDescription)}`;

  // Check if English is mentioned at all
  const hasEnglishMention = /\b(ingles|english|bilingue|bilingual)\b/.test(fullText);
  if (!hasEnglishMention) {
    return { english_required: false, english_level: null };
  }

  // Check if explicitly marked as not required
  const isNegated =
    /\b(no requerido|no indispensable|sin requisito de ingles|no necesario)\b/.test(fullText);
  if (isNegated) {
    return { english_required: false, english_level: null };
  }

  // Direct bilingual check
  if (/\b(bilingue|bilingual)\b/.test(fullText)) {
    return { english_required: true, english_level: 'avanzado' };
  }

  // Target English context patterns: either english followed by level, or level preceding english
  const advancedPatterns = [
    /\b(ingles|english)\b[\w\s/–-]{0,25}\b(avanzado|advanced|fluido|fluent|c1|c2|full professional proficiency)\b/,
    /\b(advanced|fluent)\s+english\b/,
    /\b(avanzado|fluido)\s+en\s+(ingles|english)\b/,
    /\b(nivel|dominio|manejo)\s+(avanzado|fluido)\s+(de\s+)?(ingles|english)\b/,
    /\b(c1|c2)\s+(en\s+|de\s+)?(ingles|english)\b/,
  ];
  for (const pat of advancedPatterns) {
    if (pat.test(fullText)) {
      return { english_required: true, english_level: 'avanzado' };
    }
  }

  const intermediatePatterns = [
    /\b(ingles|english)\b[\w\s/–-]{0,25}\b(intermedio|intermediate|b1|b2|professional working proficiency)\b/,
    /\b(intermediate)\s+english\b/,
    /\bintermedio\s+en\s+(ingles|english)\b/,
    /\b(nivel|dominio|manejo)\s+intermedio\s+(de\s+)?(ingles|english)\b/,
    /\b(b1|b2)\s+(en\s+|de\s+)?(ingles|english)\b/,
  ];
  for (const pat of intermediatePatterns) {
    if (pat.test(fullText)) {
      return { english_required: true, english_level: 'intermedio' };
    }
  }

  const basicPatterns = [
    /\b(ingles|english)\b[\w\s/–-]{0,25}\b(basico|basic|tecnico|lector|a1|a2)\b/,
    /\b(basic)\s+english\b/,
    /\bbasico\s+en\s+(ingles|english)\b/,
    /\b(nivel|dominio|manejo)\s+(basico|tecnico)\s+(de\s+)?(ingles|english)\b/,
    /\b(a1|a2)\s+(en\s+|de\s+)?(ingles|english)\b/,
  ];
  for (const pat of basicPatterns) {
    if (pat.test(fullText)) {
      return { english_required: true, english_level: 'basico' };
    }
  }

  // English mentioned as requirement or skill but without a specific level
  return { english_required: true, english_level: null };
}

/**
 * Weighted category keywords.
 */
interface CategoryRule {
  category: LimaCategory;
  keywords: string[];
}

const CATEGORY_RULES: CategoryRule[] = [
  {
    category: 'Datos, BI & IA',
    keywords: [
      'datos',
      'data',
      'business intelligence',
      'bi',
      'analytics',
      'analitica',
      'inteligencia artificial',
      'ia',
      'machine learning',
      'power bi',
      'sql',
      'etl',
      'big data',
      'data science',
      'ciencia de datos',
      'data engineer',
      'ingeniero de datos',
      'tableau',
      'base de datos',
      'bases de datos',
    ],
  },
  {
    category: 'Desarrollo & Software',
    keywords: [
      'desarrollo',
      'software',
      'programador',
      'developer',
      'full stack',
      'fullstack',
      'frontend',
      'backend',
      'web',
      'mobile',
      'react',
      'node',
      'python',
      'java',
      'flutter',
      'devops',
      'qa',
      'testing',
      'sw',
      'aplicaciones',
      'microservicios',
      'api',
    ],
  },
  {
    category: 'Sistemas & TI',
    keywords: [
      'sistemas',
      'ti',
      'it',
      'tecnologias de la informacion',
      'tecnologia de la informacion',
      'soporte tecnico',
      'soporte digital',
      'help desk',
      'redes',
      'infraestructura',
      'seguridad informatica',
      'ciberseguridad',
      'cloud',
      'servidores',
      'sysadmin',
      'telecomunicaciones',
    ],
  },
  {
    category: 'Administración, Banca & Finanzas',
    keywords: [
      'administracion',
      'finanzas',
      'contabilidad',
      'banca',
      'creditos',
      'riesgos',
      'recursos humanos',
      'rrhh',
      'gestion humana',
      'talento',
      'compras',
      'tesoreria',
      'wealth management',
      'inversionistas',
      'contable',
      'tributario',
      'auditoria',
      'control de asistencia',
      'servicios generales',
      'gestion patrimonial',
      'registros y academicos',
      'planeamiento comercial',
    ],
  },
  {
    category: 'Ingeniería & Operaciones',
    keywords: [
      'operaciones',
      'ingenieria industrial',
      'procesos',
      'logistica',
      'cadena de suministro',
      'supply chain',
      'mantenimiento',
      'calidad',
      'sig',
      'sistema integrado de gestion',
      'produccion',
      'planta',
      'mejora continua',
      'almacen',
      'automatizacion de procesos',
      'control de calidad',
      'control operativo',
    ],
  },
];

/**
 * Extracts category using weighted keyword scores across title and description.
 */
export function extractCategory(
  title?: string | null,
  rawDescription?: string | null
): LimaCategory {
  const normTitle = normalizeText(title);
  const normDesc = normalizeText(rawDescription);

  let bestCategory: LimaCategory = 'Sistemas & TI';
  let maxScore = -1;

  for (const rule of CATEGORY_RULES) {
    let score = 0;
    for (const kw of rule.keywords) {
      // Title matches weighted 5x
      const kwRegex = new RegExp(`\\b${kw}\\b`, 'i');
      if (kwRegex.test(normTitle)) {
        score += 5;
      }
      // Description matches weighted 1x
      if (kwRegex.test(normDesc)) {
        score += 1;
      }
    }

    if (score > maxScore) {
      maxScore = score;
      bestCategory = rule.category;
    }
  }

  return bestCategory;
}

/**
 * Pure deterministic normalizer for job listing metadata.
 */
export function normalizeJobMetadata(input: JobNormalizationInput): NormalizedJobMetadata {
  const { district, lima_zone } = extractLimaDistrictAndZone(input);
  const { salary_min, salary_max } = extractSalaryPEN(input.salary, input.raw_description);
  const role_level = extractRoleLevel(input.title, input.raw_description);
  const { english_required, english_level } = extractEnglishRequirement(
    input.title,
    input.raw_description
  );
  const category = extractCategory(input.title, input.raw_description);

  return {
    district,
    lima_zone,
    category,
    role_level,
    english_required,
    english_level,
    salary_min,
    salary_max,
  };
}

/**
 * Combines and deduplicates skills/requirements detected in a listing without
 * splitting them against any specific user's CV.
 */
export function collectDetectedSkills(job: {
  matching_skills?: string[] | null;
  missing_skills?: string[] | null;
}): string[] {
  const seen = new Set<string>();
  const combined: string[] = [];

  for (const group of [job.matching_skills, job.missing_skills]) {
    if (!Array.isArray(group)) continue;
    for (const raw of group) {
      const trimmed = typeof raw === 'string' ? raw.trim() : '';
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        combined.push(trimmed);
      }
    }
  }

  return combined;
}
