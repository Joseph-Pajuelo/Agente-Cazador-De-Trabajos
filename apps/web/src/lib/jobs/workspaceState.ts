import { JobSummary, CrmStatus } from '../domain/types';
import { isJobRecent, parseJobDate, sortByModalityThenRecent } from '../domain/ranking';
import { searchJobs } from '../domain/searchEngine';
import * as jobNormalization from '../domain/jobNormalization';
import type { RoleLevel, EnglishLevel } from '../domain/jobNormalization';

export type WorkspaceCrmTab =
  | 'activas'
  | 'to_apply'
  | 'favorite'
  | 'applied'
  | 'interview'
  | 'discarded'
  | 'todas';

export type WorkspaceSortBy =
  | 'modality_score'
  | 'score'
  | 'recent';

export type SalaryFilterKey =
  | 'any'
  | 'has_salary'
  | 'gte_1130'
  | 'gte_1500'
  | 'gte_2000';

export interface WorkspaceFilters {
  search: string;
  crmTab: WorkspaceCrmTab;
  modalities: string[];
  sources: string[];
  minScore: number;
  maxAgeDays: number | null; // null represents "Cualquier fecha (Histórico DB)"
  sortBy: WorkspaceSortBy;
  includeDiscardedAi: boolean;

  // Lima location filters
  includedDistricts: string[];
  excludedDistricts: string[];
  keepRemoteWhenDistrictFiltered: boolean;
  includeLimaUnspecifiedDistrict: boolean;

  // Language & Role filters
  englishOnly: boolean;
  englishLevels: EnglishLevel[];
  categories: string[];
  roleLevels: Exclude<RoleLevel, 'unknown'>[];

  // Compensation filter
  salaryFilter: SalaryFilterKey;

  // Selected job for master-detail view
  selectedJobId?: number | string | null;
}

export const DEFAULT_WORKSPACE_FILTERS: WorkspaceFilters = {
  search: '',
  crmTab: 'activas',
  modalities: ['Híbrido', 'Presencial', 'Remoto'],
  sources: [],
  minScore: 0,
  maxAgeDays: 14,
  sortBy: 'recent',
  includeDiscardedAi: false,
  includedDistricts: [],
  excludedDistricts: [],
  keepRemoteWhenDistrictFiltered: true,
  includeLimaUnspecifiedDistrict: false,
  englishOnly: false,
  englishLevels: [],
  categories: [],
  roleLevels: ['preprofesional'],
  salaryFilter: 'any',
  selectedJobId: null,
};

export interface CrmCounts {
  activas: number;
  to_apply: number;
  favorite: number;
  applied: number;
  interview: number;
  discarded: number;
  todas: number;
}

export interface WorkspaceFilterResult {
  jobs: JobSummary[];
  didYouMean: string[];
  correctedQuery: string | null;
  agencyMatchesCount: number;
}

/**
 * Computes live count badges for each CRM tab.
 * Respects the AI discard filter unless explicitly included or already tracked by the user.
 */
export function computeCrmCounts(
  jobs: JobSummary[],
  options?: { includeDiscardedAi?: boolean }
): CrmCounts {
  const includeAi = Boolean(options?.includeDiscardedAi);

  const visibleJobs = jobs.filter((job) => {
    if (includeAi) return true;
    if (job.user_status) return true;
    if (job.is_pre_professional === false || job.is_unrealistic_or_smoke === true) {
      return false;
    }
    return true;
  });

  const counts: CrmCounts = {
    activas: 0,
    to_apply: 0,
    favorite: 0,
    applied: 0,
    interview: 0,
    discarded: 0,
    todas: visibleJobs.length,
  };

  for (const job of visibleJobs) {
    if (job.user_status !== 'discarded') {
      counts.activas++;
    }

    if (job.user_status === 'to_apply') {
      counts.to_apply++;
    } else if (job.user_status === 'favorite') {
      counts.favorite++;
    } else if (job.user_status === 'applied') {
      counts.applied++;
    } else if (job.user_status === 'interview') {
      counts.interview++;
    } else if (job.user_status === 'discarded') {
      counts.discarded++;
    }
  }

  return counts;
}

/**
 * Detects whether the active filter set requires querying Supabase's historical DB index.
 * Triggers when maxAgeDays is null ("Cualquier fecha").
 */
export function requiresHistoricalQuery(filters: { maxAgeDays: number | null }): boolean {
  return filters.maxAgeDays === null;
}

/**
 * Gate check to determine whether current user can mutate CRM states.
 * Unauthenticated guest users trigger the native <dialog> AuthModal instead.
 */
export function canMutateCrm(user: { id?: string } | null | undefined): boolean {
  return Boolean(user && typeof user.id === 'string' && user.id.trim().length > 0);
}

/**
 * Pure optimistic updater for CRM transitions.
 * Returns a new array without mutating input objects.
 */
export function applyOptimisticCrmTransition(
  jobs: JobSummary[],
  listingId: number | string,
  nextStatus: CrmStatus,
  nextNotes?: string
): JobSummary[] {
  const targetId = String(listingId);

  return jobs.map((job) => {
    if (String(job.id) !== targetId) {
      return job;
    }

    let appliedAt = job.applied_at;
    if (nextStatus === 'applied') {
      appliedAt = appliedAt || new Date().toISOString();
    }

    return {
      ...job,
      user_status: nextStatus,
      applied_at: appliedAt,
      user_notes: nextNotes !== undefined ? nextNotes : job.user_notes,
    };
  });
}

/**
 * Reverts an individual job's CRM status and notes back to its previous state on server action failure.
 */
export function rollbackJobTransition(
  jobs: JobSummary[],
  listingId: number | string,
  previousJobState: {
    user_status?: CrmStatus | null;
    applied_at?: string | null;
    user_notes?: string | null;
  }
): JobSummary[] {
  const targetId = String(listingId);
  return jobs.map((job) => {
    if (String(job.id) !== targetId) return job;
    return {
      ...job,
      user_status: previousJobState.user_status ?? null,
      applied_at: previousJobState.applied_at ?? null,
      user_notes: previousJobState.user_notes ?? null,
    };
  });
}

/**
 * Resolves normalized metadata for a JobSummary, using pre-populated DB fields directly
 * and falling back lazily to deterministic extraction only when fields are missing.
 */
export function resolveJobNormalizedMeta(job: JobSummary): {
  district: string;
  lima_zone: string;
  category: string;
  role_level: RoleLevel;
  english_required: boolean;
  english_level: EnglishLevel | null;
  salary_min: number | null;
  salary_max: number | null;
} {
  // Fast path: if all normalized fields already exist on job, return immediately without regex parsing
  if (
    job.district !== undefined &&
    job.district !== null &&
    job.lima_zone !== undefined &&
    job.lima_zone !== null &&
    job.category !== undefined &&
    job.category !== null &&
    job.role_level !== undefined &&
    job.role_level !== null &&
    job.english_required !== undefined &&
    job.english_required !== null &&
    job.english_level !== undefined &&
    job.salary_min !== undefined &&
    job.salary_max !== undefined
  ) {
    return {
      district: job.district,
      lima_zone: job.lima_zone,
      category: job.category,
      role_level: job.role_level,
      english_required: Boolean(job.english_required),
      english_level: job.english_level,
      salary_min: job.salary_min,
      salary_max: job.salary_max,
    };
  }

  // Fallback: lazily normalize metadata from listing content
  const rawDesc =
    'raw_description' in job &&
    typeof (job as { raw_description?: unknown }).raw_description === 'string'
      ? (job as { raw_description?: string }).raw_description ?? null
      : null;

  const norm = jobNormalization.normalizeJobMetadata({
    title: job.title,
    location: job.location,
    modality: job.modality,
    salary: job.salary,
    raw_description: rawDesc,
  });

  return {
    district:
      job.district !== undefined && job.district !== null ? job.district : norm.district,
    lima_zone:
      job.lima_zone !== undefined && job.lima_zone !== null
        ? job.lima_zone
        : norm.lima_zone,
    category:
      job.category !== undefined && job.category !== null
        ? job.category
        : norm.category,
    role_level:
      job.role_level !== undefined && job.role_level !== null
        ? job.role_level
        : norm.role_level,
    english_required:
      job.english_required !== undefined && job.english_required !== null
        ? Boolean(job.english_required)
        : norm.english_required,
    english_level:
      job.english_level !== undefined ? job.english_level : norm.english_level,
    salary_min: job.salary_min !== undefined ? job.salary_min : norm.salary_min,
    salary_max: job.salary_max !== undefined ? job.salary_max : norm.salary_max,
  };
}

/**
 * Evaluates whether a job is eligible under the active role levels filter.
 * Decouples role level from AI discard status so junior and profesional jobs remain accessible.
 */
export function isJobEligibleForRoleLevels(
  job: JobSummary,
  roleLevels: readonly (Exclude<RoleLevel, 'unknown'> | RoleLevel | string)[],
  includeDiscardedAi?: boolean
): boolean {
  const includeAi = Boolean(includeDiscardedAi);

  // Always hide unrealistic / smoke jobs unless includeDiscardedAi is true
  if (job.is_unrealistic_or_smoke === true && !includeAi) {
    return false;
  }

  // When includeDiscardedAi is true and roleLevels is empty: show all
  if (includeAi && roleLevels.length === 0) {
    return true;
  }

  const rawDesc =
    'raw_description' in job &&
    typeof (job as { raw_description?: unknown }).raw_description === 'string'
      ? (job as { raw_description?: string }).raw_description ?? null
      : null;

  const resolvedLevel: RoleLevel =
    job.role_level !== undefined && job.role_level !== null
      ? job.role_level
      : jobNormalization.normalizeJobMetadata({
          title: job.title,
          location: job.location,
          modality: job.modality,
          salary: job.salary,
          raw_description: rawDesc,
        }).role_level;

  // If roleLevels is empty (user unchecked all boxes): allow all non-smoke levels
  if (roleLevels.length === 0) {
    return true;
  }

  // Check matching against selected roleLevels
  let matches = false;

  if (roleLevels.includes('preprofesional')) {
    if (resolvedLevel === 'preprofesional') {
      matches = true;
    } else if (
      resolvedLevel === 'unknown' &&
      (job.is_pre_professional !== false || includeAi)
    ) {
      matches = true;
    }
  }

  if (roleLevels.includes('profesional')) {
    if (resolvedLevel === 'profesional') {
      matches = true;
    }
  }

  if (roleLevels.includes('trainee_junior')) {
    if (resolvedLevel === 'trainee_junior') {
      matches = true;
    }
  }

  if (roleLevels.includes('unknown') && resolvedLevel === 'unknown') {
    matches = true;
  }

  return matches;
}

/**
 * Pure filtering and sorting engine for the Master-Detail Explorer.
 * Integrates CRM tabs, Lima district include/exclude, modalities, categories, role levels,
 * English, salary ranges, score cutoff, date recency, and smart search.
 */
export function filterAndSortWorkspaceJobs(
  jobs: JobSummary[],
  filters: WorkspaceFilters,
  now?: Date
): WorkspaceFilterResult {
  const isCrmTrackedTab =
    filters.crmTab === 'to_apply' ||
    filters.crmTab === 'favorite' ||
    filters.crmTab === 'applied' ||
    filters.crmTab === 'interview' ||
    filters.crmTab === 'discarded';

  // 1. Role Level & AI Discard filtering
  let pool = jobs.filter((job) => {
    // If job is inside its explicit user CRM tab, do not drop on role level / smoke
    if (isCrmTrackedTab && job.user_status === filters.crmTab) {
      return true;
    }
    return isJobEligibleForRoleLevels(
      job,
      filters.roleLevels ?? [],
      filters.includeDiscardedAi
    );
  });

  // 2. Antiquity / Recency filter (only if not "Cualquier fecha")
  if (filters.maxAgeDays !== null) {
    pool = pool.filter((job) => isJobRecent(job, filters.maxAgeDays!, now));
  }

  // 3. Modality filter
  if (filters.modalities && filters.modalities.length > 0) {
    const modSet = new Set(filters.modalities);
    const allStandardSelected = ['Híbrido', 'Presencial', 'Remoto'].every((m) =>
      modSet.has(m)
    );
    pool = pool.filter((job) => {
      if (!job.modality || job.modality === 'No especificado') {
        return allStandardSelected;
      }
      return modSet.has(job.modality);
    });
  }

  // 4. Source filter
  if (filters.sources && filters.sources.length > 0) {
    const srcSet = new Set(filters.sources);
    pool = pool.filter((job) => job.source && srcSet.has(job.source));
  }

  // 5. Min Score filter
  if (typeof filters.minScore === 'number' && filters.minScore > 0) {
    pool = pool.filter((job) => (Number(job.final_ranking_score) || 0) >= filters.minScore);
  }

  // 6. CRM Tab filter
  if (filters.crmTab === 'activas') {
    pool = pool.filter((job) => job.user_status !== 'discarded');
  } else if (filters.crmTab === 'to_apply') {
    pool = pool.filter((job) => job.user_status === 'to_apply');
  } else if (filters.crmTab === 'favorite') {
    pool = pool.filter((job) => job.user_status === 'favorite');
  } else if (filters.crmTab === 'applied') {
    pool = pool.filter((job) => job.user_status === 'applied');
  } else if (filters.crmTab === 'interview') {
    pool = pool.filter((job) => job.user_status === 'interview');
  } else if (filters.crmTab === 'discarded') {
    pool = pool.filter((job) => job.user_status === 'discarded');
  }
  // 'todas' retains all items

  // 7. District Inclusion and Exclusion
  // excludedDistricts ALWAYS take precedence at the end EXCEPT for jobs already tracked in user's CRM tab
  pool = pool.filter((job) => {
    if (isCrmTrackedTab && job.user_status === filters.crmTab) {
      return true;
    }

    const meta = resolveJobNormalizedMeta(job);
    const district = meta.district;

    // Inclusion check
    if (filters.includedDistricts && filters.includedDistricts.length > 0) {
      const matchesDistrict = filters.includedDistricts.includes(district);
      const matchesRemote =
        filters.keepRemoteWhenDistrictFiltered &&
        (district === 'Remoto' || job.modality === 'Remoto');
      const matchesLimaUnspecified =
        filters.includeLimaUnspecifiedDistrict && district === 'Lima Metropolitana';

      if (!matchesDistrict && !matchesRemote && !matchesLimaUnspecified) {
        return false;
      }
    }

    // Exclusion check (precedence over inclusion)
    if (filters.excludedDistricts && filters.excludedDistricts.length > 0) {
      if (filters.excludedDistricts.includes(district)) {
        return false;
      }
    }

    return true;
  });

  // 8. English filter
  if (filters.englishOnly || (filters.englishLevels && filters.englishLevels.length > 0)) {
    pool = pool.filter((job) => {
      const meta = resolveJobNormalizedMeta(job);
      if (filters.englishOnly && !meta.english_required) {
        return false;
      }
      if (filters.englishLevels && filters.englishLevels.length > 0) {
        if (!meta.english_level || !filters.englishLevels.includes(meta.english_level)) {
          return false;
        }
      }
      return true;
    });
  }

  // 9. Category filter
  if (filters.categories && filters.categories.length > 0) {
    const catSet = new Set(filters.categories);
    pool = pool.filter((job) => {
      const meta = resolveJobNormalizedMeta(job);
      return Boolean(meta.category && catSet.has(meta.category));
    });
  }

  // 10. Salary filter
  if (filters.salaryFilter && filters.salaryFilter !== 'any') {
    pool = pool.filter((job) => {
      const meta = resolveJobNormalizedMeta(job);
      const effectiveSalary = Math.max(meta.salary_min ?? 0, meta.salary_max ?? 0);
      const hasSalary = meta.salary_min !== null || meta.salary_max !== null;

      if (filters.salaryFilter === 'has_salary') {
        return hasSalary;
      }
      if (filters.salaryFilter === 'gte_1130') {
        return hasSalary && effectiveSalary >= 1130;
      }
      if (filters.salaryFilter === 'gte_1500') {
        return hasSalary && effectiveSalary >= 1500;
      }
      if (filters.salaryFilter === 'gte_2000') {
        return hasSalary && effectiveSalary >= 2000;
      }
      return true;
    });
  }

  // 11. Smart search
  let didYouMean: string[] = [];
  let correctedQuery: string | null = null;
  let agencyMatchesCount = 0;

  if (filters.search && filters.search.trim().length > 0) {
    const searchOutcome = searchJobs(pool, filters.search);
    pool = searchOutcome.jobs;
    didYouMean = searchOutcome.did_you_mean || [];
    correctedQuery = searchOutcome.corrected_query ?? null;
    agencyMatchesCount = searchOutcome.agency_matches_count || 0;
  }

  // 12. Sorting (neutral: recent or modality priority without personal CV score)
  if (filters.sortBy === 'modality_score') {
    pool = sortByModalityThenRecent(pool);
  } else {
    pool = [...pool].sort((a, b) => {
      const dateA =
        parseJobDate(a.published_date || a.published_at || a.created_at)?.getTime() || 0;
      const dateB =
        parseJobDate(b.published_date || b.published_at || b.created_at)?.getTime() || 0;
      return dateB - dateA;
    });
  }

  return {
    jobs: pool,
    didYouMean,
    correctedQuery,
    agencyMatchesCount,
  };
}

/**
 * Computes live counts per Lima district across the active filtered pool
 * BEFORE applying district inclusion/exclusion filters.
 */
export function computeDistrictFacetCounts(
  jobs: JobSummary[],
  filters: WorkspaceFilters,
  now?: Date
): Record<string, number> {
  const facetFilters: WorkspaceFilters = {
    ...filters,
    includedDistricts: [],
    excludedDistricts: [],
  };

  const result = filterAndSortWorkspaceJobs(jobs, facetFilters, now);
  const counts: Record<string, number> = {};

  for (const job of result.jobs) {
    const meta = resolveJobNormalizedMeta(job);
    const d = meta.district;
    if (d) {
      counts[d] = (counts[d] || 0) + 1;
    }
  }

  return counts;
}

/**
 * Computes live counts per Category across the active filtered pool
 * BEFORE applying category filter.
 */
export function computeCategoryFacetCounts(
  jobs: JobSummary[],
  filters: WorkspaceFilters,
  now?: Date
): Record<string, number> {
  const facetFilters: WorkspaceFilters = {
    ...filters,
    categories: [],
  };

  const result = filterAndSortWorkspaceJobs(jobs, facetFilters, now);
  const counts: Record<string, number> = {};

  for (const job of result.jobs) {
    const meta = resolveJobNormalizedMeta(job);
    const c = meta.category;
    if (c) {
      counts[c] = (counts[c] || 0) + 1;
    }
  }

  return counts;
}
