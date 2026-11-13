import { JobSummary, CrmStatus } from '../domain/types';
import { isJobRecent, parseJobDate, sortByModalityThenScore } from '../domain/ranking';
import { searchJobs } from '../domain/searchEngine';

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

export interface WorkspaceFilters {
  search: string;
  crmTab: WorkspaceCrmTab;
  modalities: string[];
  sources: string[];
  minScore: number;
  maxAgeDays: number | null; // null represents "Cualquier fecha (Histórico DB)"
  sortBy: WorkspaceSortBy;
  includeDiscardedAi: boolean;
}

export const DEFAULT_WORKSPACE_FILTERS: WorkspaceFilters = {
  search: '',
  crmTab: 'activas',
  modalities: ['Híbrido', 'Presencial', 'Remoto'],
  sources: [],
  minScore: 0,
  maxAgeDays: 14,
  sortBy: 'modality_score',
  includeDiscardedAi: false,
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
 * Pure filtering and sorting engine for the Master-Detail Explorer.
 * Integrates CRM tabs, modalities, score cutoff, date recency, and smart search.
 */
export function filterAndSortWorkspaceJobs(
  jobs: JobSummary[],
  filters: WorkspaceFilters,
  now?: Date
): WorkspaceFilterResult {
  const includeAi = Boolean(filters.includeDiscardedAi);

  // 1. AI Discard filter
  let pool = jobs.filter((job) => {
    if (includeAi) return true;
    if (job.user_status) return true;
    if (job.is_pre_professional === false || job.is_unrealistic_or_smoke === true) {
      return false;
    }
    return true;
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
  // 'todas' retains all remaining items

  // 7. Smart search
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

  // 8. Sorting
  if (filters.sortBy === 'modality_score') {
    pool = sortByModalityThenScore(pool);
  } else if (filters.sortBy === 'score') {
    pool = [...pool].sort((a, b) => {
      const scoreA = Number(a.final_ranking_score) || 0;
      const scoreB = Number(b.final_ranking_score) || 0;
      return scoreB - scoreA;
    });
  } else if (filters.sortBy === 'recent') {
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
