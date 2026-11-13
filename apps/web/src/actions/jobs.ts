'use server';

import { createClient, isSupabaseConfigured } from '../lib/supabase/server';
import {
  buildHistoricalSearchFilters,
  mapRowToJobSummary,
} from '../lib/supabase/queries';
import { JobSummary, CrmStatus } from '../lib/domain/types';

export const HISTORICAL_SEARCH_SELECT = `
  id,
  deduplication_hash,
  source,
  title,
  company,
  location,
  modality,
  url,
  salary,
  published_at,
  published_date,
  status,
  created_at,
  resolved_brand_key,
  resolved_via_agency,
  agency_clue,
  sector_hint,
  job_evaluations!inner (
    id,
    listing_id,
    profile_id,
    is_pre_professional,
    is_unrealistic_or_smoke,
    technical_match_score,
    modality_score,
    location_score,
    final_ranking_score,
    matching_skills,
    missing_skills,
    verdict_summary,
    engine,
    evaluated_at
  )
`;

export async function getJobDescription(
  listingId: number
): Promise<{ rawDescription: string | null; error?: string }> {
  if (!listingId || listingId <= 0 || !Number.isInteger(listingId)) {
    return { rawDescription: null, error: 'INVALID_LISTING_ID' };
  }

  if (!isSupabaseConfigured()) {
    return { rawDescription: null, error: 'SUPABASE_NOT_CONFIGURED' };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('job_listings')
      .select('raw_description')
      .eq('id', listingId)
      .maybeSingle();

    if (error) {
      console.error('getJobDescription query error:', error);
      return { rawDescription: null, error: error.message };
    }

    return { rawDescription: data?.raw_description ?? null };
  } catch (err: unknown) {
    console.error('getJobDescription exception:', err);
    return { rawDescription: null, error: 'FAILED_TO_LOAD' };
  }
}

export async function searchHistoricalJobs(params: {
  query: string;
  includeDiscardedAi: boolean;
  minScore: number;
  modalities: string[];
  sources: string[];
  maxAgeDays: number | null;
  offset: number;
  limit: number;
}): Promise<{
  jobs: JobSummary[];
  hasMore: boolean;
  didYouMean: string | null;
  note: string | null;
}> {
  const filters = buildHistoricalSearchFilters(params);
  const offset = typeof params.offset === 'number' && params.offset >= 0 ? params.offset : 0;
  const limit = typeof params.limit === 'number' && params.limit > 0 ? params.limit : 20;

  if (!isSupabaseConfigured()) {
    return {
      jobs: [],
      hasMore: false,
      didYouMean: filters.didYouMean,
      note: 'SUPABASE_NOT_CONFIGURED',
    };
  }

  try {
    const supabase = await createClient();

    // Check optional authenticated user for CRM state join
    let userId: string | null = null;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        userId = user.id;
      }
    } catch {
      userId = null;
    }

    let queryBuilder = supabase
      .from('job_listings')
      .select(HISTORICAL_SEARCH_SELECT)
      .is('job_evaluations.profile_id', null);

    // AI quality filter
    if (!filters.includeDiscardedAi) {
      queryBuilder = queryBuilder
        .eq('job_evaluations.is_pre_professional', true)
        .eq('job_evaluations.is_unrealistic_or_smoke', false);
    }

    // Min score filter
    if (filters.minScore > 0) {
      queryBuilder = queryBuilder.gte(
        'job_evaluations.final_ranking_score',
        filters.minScore
      );
    }

    // Modality filter
    if (filters.modalities.length > 0) {
      queryBuilder = queryBuilder.in('modality', filters.modalities);
    }

    // Source filter
    if (filters.sources.length > 0) {
      queryBuilder = queryBuilder.in('source', filters.sources);
    }

    // Cutoff date filter
    if (filters.cutoffDate) {
      queryBuilder = queryBuilder.gte('published_date', filters.cutoffDate);
    }

    // Keyword / Brand / Sector / FTS filtering
    if (filters.brandKey) {
      queryBuilder = queryBuilder.or(
        `resolved_brand_key.eq.${filters.brandKey},title.ilike.%${filters.brandKey}%,company.ilike.%${filters.brandKey}%`
      );
    } else if (filters.sectorHint) {
      queryBuilder = queryBuilder.or(
        `sector_hint.eq.${filters.sectorHint},title.ilike.%${filters.sectorHint}%,company.ilike.%${filters.sectorHint}%`
      );
    } else if (filters.ftsQuery) {
      queryBuilder = queryBuilder.textSearch('search_tsv', filters.ftsQuery, {
        config: 'spanish',
        type: 'websearch',
      });
    }

    // Order and paginate (fetching limit + 1 to compute hasMore without exact count)
    queryBuilder = queryBuilder
      .order('published_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit);

    const { data: rawRows, error } = await queryBuilder;

    if (error) {
      console.error('searchHistoricalJobs query error:', error);
      return {
        jobs: [],
        hasMore: false,
        didYouMean: filters.didYouMean,
        note: error.message,
      };
    }

    const rows = rawRows || [];
    const hasMore = rows.length > limit;
    const finalRows = hasMore ? rows.slice(0, limit) : rows;

    // Join authenticated user CRM states if user is signed in
    const userStateMap = new Map<
      number,
      { status: CrmStatus; applied_at?: string | null; notes?: string }
    >();

    if (userId && finalRows.length > 0) {
      const listingIds = finalRows.map((r: Record<string, unknown>) => Number(r.id));
      const { data: userStates } = await supabase
        .from('user_job_states')
        .select('listing_id, status, applied_at, notes')
        .eq('user_id', userId)
        .in('listing_id', listingIds);

      if (userStates) {
        for (const s of userStates) {
          userStateMap.set(Number(s.listing_id), {
            status: s.status as CrmStatus,
            applied_at: s.applied_at,
            notes: s.notes,
          });
        }
      }
    }

    const jobs: JobSummary[] = finalRows.map((row: Record<string, unknown>) => {
      const state = userStateMap.get(Number(row.id)) || null;
      return mapRowToJobSummary(row, state);
    });

    let note: string | null = null;
    if (filters.didYouMean) {
      note = `Mostrando resultados para "${filters.didYouMean}"`;
    }

    return {
      jobs,
      hasMore,
      didYouMean: filters.didYouMean,
      note,
    };
  } catch (err: unknown) {
    console.error('searchHistoricalJobs exception:', err);
    return {
      jobs: [],
      hasMore: false,
      didYouMean: filters.didYouMean,
      note: 'QUERY_EXECUTION_FAILED',
    };
  }
}
