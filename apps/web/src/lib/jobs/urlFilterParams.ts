import {
  WorkspaceFilters,
  DEFAULT_WORKSPACE_FILTERS,
  SalaryFilterKey,
  WorkspaceCrmTab,
  WorkspaceSortBy,
} from './workspaceState';
import { EnglishLevel, RoleLevel, LIMA_CATEGORIES } from '../domain/jobNormalization';

export interface ParsedFiltersResult {
  filters: WorkspaceFilters;
  hasExplicitExclParam: boolean;
  urlSelectedJobId: number | null;
}

const VALID_CRM_TABS = new Set<WorkspaceCrmTab>([
  'activas',
  'to_apply',
  'favorite',
  'applied',
  'interview',
  'discarded',
  'todas',
]);

const VALID_SORT_BYS = new Set<WorkspaceSortBy>([
  'modality_score',
  'score',
  'recent',
]);

const VALID_SALARY_KEYS = new Set<SalaryFilterKey>([
  'any',
  'has_salary',
  'gte_1130',
  'gte_1500',
  'gte_2000',
]);

const VALID_ENGLISH_LEVELS = new Set<EnglishLevel>([
  'basico',
  'intermedio',
  'avanzado',
]);

const VALID_ROLE_LEVELS = new Set<Exclude<RoleLevel, 'unknown'>>([
  'preprofesional',
  'profesional',
  'trainee_junior',
]);

function parseCategoriesParam(catParam: string): string[] {
  const trimmed = catParam.trim();
  if (!trimmed) return [];

  if (trimmed.includes('|')) {
    return trimmed.split('|').map((s) => s.trim()).filter(Boolean);
  }

  // Check known LIMA_CATEGORIES first to avoid splitting on internal commas
  const matchedCategories: string[] = [];
  let remaining = trimmed;

  for (const cat of LIMA_CATEGORIES) {
    if (remaining.includes(cat)) {
      matchedCategories.push(cat);
      remaining = remaining.replace(cat, '');
    }
  }

  if (matchedCategories.length > 0) {
    const extra = remaining
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !matchedCategories.includes(s));
    return [...matchedCategories, ...extra];
  }

  return trimmed
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function getParam(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
  key: string
): string | null {
  if (params instanceof URLSearchParams) {
    return params.get(key);
  }
  const val = params[key];
  if (Array.isArray(val)) {
    return val[0] ?? null;
  }
  return val ?? null;
}

function hasParam(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
  key: string
): boolean {
  if (params instanceof URLSearchParams) {
    return params.has(key);
  }
  return params[key] !== undefined;
}

export function parseFiltersFromSearchParams(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
  profileExcludedDistricts?: string[] | null
): ParsedFiltersResult {
  // Search
  const search = getParam(params, 'q') ?? '';

  // Included districts
  const distParam = getParam(params, 'dist');
  const includedDistricts = distParam
    ? distParam
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  // Excluded districts & hasExplicitExclParam
  const hasExplicitExclParam = hasParam(params, 'excl');
  const exclParam = getParam(params, 'excl');

  let excludedDistricts: string[];
  if (hasExplicitExclParam) {
    if (!exclParam || exclParam.trim().toLowerCase() === 'none') {
      excludedDistricts = [];
    } else {
      excludedDistricts = exclParam
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  } else {
    // Guest or profile default (no automatic district exclusion by default)
    if (profileExcludedDistricts && profileExcludedDistricts.length > 0) {
      excludedDistricts = [...profileExcludedDistricts];
    } else {
      excludedDistricts = [];
    }
  }

  // Keep remote when district filtered
  const dremParam = getParam(params, 'drem');
  const keepRemoteWhenDistrictFiltered = dremParam !== '0';

  // Include Lima unspecified district
  const dlimParam = getParam(params, 'dlim');
  const includeLimaUnspecifiedDistrict = dlimParam === '1';

  // English only
  const engParam = getParam(params, 'eng');
  const englishOnly = engParam === '1';

  // English levels
  const englParam = getParam(params, 'engl');
  const englishLevels: EnglishLevel[] = englParam
    ? (englParam
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter((s): s is EnglishLevel => VALID_ENGLISH_LEVELS.has(s as EnglishLevel)))
    : [];

  // Time / MaxAgeDays
  const timeParam = getParam(params, 'time');
  let maxAgeDays: number | null = DEFAULT_WORKSPACE_FILTERS.maxAgeDays;
  if (timeParam === 'all') {
    maxAgeDays = null;
  } else if (timeParam && /^\d+$/.test(timeParam)) {
    maxAgeDays = Number(timeParam);
  }

  // Categories
  const catParam = getParam(params, 'cat');
  const categories = catParam ? parseCategoriesParam(catParam) : [];

  // Role levels
  const lvlParam = getParam(params, 'lvl');
  let roleLevels: Exclude<RoleLevel, 'unknown'>[] = ['preprofesional'];
  if (lvlParam !== null) {
    if (lvlParam === 'all' || lvlParam === 'none') {
      roleLevels = [];
    } else {
      roleLevels = lvlParam
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter((s): s is Exclude<RoleLevel, 'unknown'> =>
          VALID_ROLE_LEVELS.has(s as Exclude<RoleLevel, 'unknown'>)
        );
    }
  }

  // Include discarded AI
  const aiParam = getParam(params, 'ai');
  const includeDiscardedAi = aiParam === '1';

  // Modalities
  const modParam = getParam(params, 'mod');
  const modalities = modParam
    ? modParam
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : ['Híbrido', 'Presencial', 'Remoto'];

  // Salary
  const salParam = getParam(params, 'sal');
  const salaryFilter: SalaryFilterKey =
    salParam && VALID_SALARY_KEYS.has(salParam as SalaryFilterKey)
      ? (salParam as SalaryFilterKey)
      : 'any';

  // Sources
  const srcParam = getParam(params, 'src');
  const sources = srcParam
    ? srcParam
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  // Score
  const scoreParam = getParam(params, 'score');
  const minScore = scoreParam && !isNaN(Number(scoreParam)) ? Number(scoreParam) : 0;

  // CRM Tab
  const tabParam = getParam(params, 'tab');
  const crmTab: WorkspaceCrmTab =
    tabParam && VALID_CRM_TABS.has(tabParam as WorkspaceCrmTab)
      ? (tabParam as WorkspaceCrmTab)
      : 'activas';

  // Sort
  const sortParam = getParam(params, 'sort');
  const sortBy: WorkspaceSortBy =
    sortParam && VALID_SORT_BYS.has(sortParam as WorkspaceSortBy)
      ? (sortParam as WorkspaceSortBy)
      : 'modality_score';

  // Selected job
  const jobParam = getParam(params, 'job');
  const urlSelectedJobId =
    jobParam && !isNaN(Number(jobParam)) ? Number(jobParam) : null;

  return {
    filters: {
      search,
      crmTab,
      modalities,
      sources,
      minScore,
      maxAgeDays,
      sortBy,
      includeDiscardedAi,
      includedDistricts,
      excludedDistricts,
      keepRemoteWhenDistrictFiltered,
      includeLimaUnspecifiedDistrict,
      englishOnly,
      englishLevels,
      categories,
      roleLevels,
      salaryFilter,
      selectedJobId: urlSelectedJobId ?? null,
    },
    hasExplicitExclParam,
    urlSelectedJobId,
  };
}

export function serializeFiltersToSearchParams(
  filters: WorkspaceFilters,
  profileExcludedDistricts?: string[] | null,
  selectedJobId?: number | string | null
): URLSearchParams {
  const params = new URLSearchParams();

  // 1. Search
  if (filters.search && filters.search.trim().length > 0) {
    params.set('q', filters.search.trim());
  }

  // 2. Included districts
  if (filters.includedDistricts && filters.includedDistricts.length > 0) {
    params.set('dist', filters.includedDistricts.join(','));
  }

  // 3. Excluded districts
  // Keep clean root URL `/` when both filters and profile have zero exclusions.
  // Emit excl=none only when temporarily overriding non-empty saved profile exclusions.
  const defaultExclusions = profileExcludedDistricts ?? [];
  const isSameAsDefault =
    filters.excludedDistricts.length === defaultExclusions.length &&
    filters.excludedDistricts.every((d, i) => d === defaultExclusions[i]);

  if (!isSameAsDefault) {
    if (filters.excludedDistricts.length === 0) {
      params.set('excl', 'none');
    } else {
      params.set('excl', filters.excludedDistricts.join(','));
    }
  }

  // 4. Remote toggle
  if (filters.keepRemoteWhenDistrictFiltered === false) {
    params.set('drem', '0');
  }

  // 5. Lima Metropolitana toggle
  if (filters.includeLimaUnspecifiedDistrict === true) {
    params.set('dlim', '1');
  }

  // 6. English toggle
  if (filters.englishOnly === true) {
    params.set('eng', '1');
  }

  // 7. English levels
  if (filters.englishLevels && filters.englishLevels.length > 0) {
    params.set('engl', filters.englishLevels.join(','));
  }

  // 8. Time / maxAgeDays
  if (filters.maxAgeDays === null) {
    params.set('time', 'all');
  } else if (filters.maxAgeDays !== 14) {
    params.set('time', String(filters.maxAgeDays));
  }

  // 9. Categories
  if (filters.categories && filters.categories.length > 0) {
    params.set('cat', filters.categories.join(','));
  }

  // 10. Role levels
  if (filters.roleLevels.length === 0) {
    params.set('lvl', 'all');
  } else {
    const isDefault =
      filters.roleLevels.length === 1 && filters.roleLevels[0] === 'preprofesional';
    if (!isDefault) {
      params.set('lvl', filters.roleLevels.join(','));
    }
  }

  // 11. AI toggle
  if (filters.includeDiscardedAi === true) {
    params.set('ai', '1');
  }

  // 12. Modalities
  const defaultModalities = ['Híbrido', 'Presencial', 'Remoto'];
  const hasDefaultModalities =
    filters.modalities.length === defaultModalities.length &&
    defaultModalities.every((m) => filters.modalities.includes(m));
  if (!hasDefaultModalities && filters.modalities.length > 0) {
    params.set('mod', filters.modalities.join(','));
  }

  // 13. Salary
  if (filters.salaryFilter && filters.salaryFilter !== 'any') {
    params.set('sal', filters.salaryFilter);
  }

  // 14. Sources
  if (filters.sources && filters.sources.length > 0) {
    params.set('src', filters.sources.join(','));
  }

  // 15. Min Score
  if (typeof filters.minScore === 'number' && filters.minScore > 0) {
    params.set('score', String(filters.minScore));
  }

  // 16. CRM Tab
  if (filters.crmTab && filters.crmTab !== 'activas') {
    params.set('tab', filters.crmTab);
  }

  // 17. Sort By
  if (filters.sortBy && filters.sortBy !== 'modality_score') {
    params.set('sort', filters.sortBy);
  }

  // 18. Selected Job
  const resolvedJobId = selectedJobId ?? filters.selectedJobId;
  if (resolvedJobId !== undefined && resolvedJobId !== null && String(resolvedJobId).length > 0) {
    params.set('job', String(resolvedJobId));
  }

  return params;
}

export function reconcileProfileExclusions(
  currentFilters: WorkspaceFilters,
  hasExplicitExclParam: boolean,
  profileExcludedDistricts: string[]
): WorkspaceFilters {
  if (hasExplicitExclParam) {
    return currentFilters;
  }
  return {
    ...currentFilters,
    excludedDistricts: [...profileExcludedDistricts],
  };
}
