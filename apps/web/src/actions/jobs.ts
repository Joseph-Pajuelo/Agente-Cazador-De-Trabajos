'use server';

import { createClient, isSupabaseConfigured } from '../lib/supabase/server';
import {
  buildHistoricalSearchFilters,
  mapRowToJobSummary,
  buildHistoricalSupabaseQuery,
  type HistoricalSearchParams,
} from '../lib/supabase/queries';
import { JobSummary, CrmStatus, ReasoningChain } from '../lib/domain/types';

export interface HistoricalSearchResult {
  jobs: JobSummary[];
  hasMore: boolean;
  nextOffset?: number;
  didYouMean: string | null;
  note: string | null;
}

export async function getJobDetail(
  listingId: number
): Promise<{
  rawDescription: string | null;
  reasoningChain: ReasoningChain | null;
  error?: string;
}> {
  if (!listingId || listingId <= 0 || !Number.isInteger(listingId)) {
    return { rawDescription: null, reasoningChain: null, error: 'INVALID_LISTING_ID' };
  }

  if (!isSupabaseConfigured()) {
    return { rawDescription: null, reasoningChain: null, error: 'SUPABASE_NOT_CONFIGURED' };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('job_listings')
      .select('raw_description, job_evaluations(reasoning_chain, profile_id)')
      .eq('id', listingId)
      .maybeSingle();

    if (error) {
      console.error('getJobDetail query error:', error);
      return { rawDescription: null, reasoningChain: null, error: error.message };
    }

    if (!data) {
      return { rawDescription: null, reasoningChain: null, error: 'JOB_NOT_FOUND' };
    }

    const evaluations = data.job_evaluations as
      | Array<Record<string, unknown>>
      | Record<string, unknown>
      | undefined;
    const ev = Array.isArray(evaluations)
      ? evaluations.find((e) => !e.profile_id) || evaluations[0]
      : evaluations;

    return {
      rawDescription: (data.raw_description as string | null) ?? null,
      reasoningChain: (ev?.reasoning_chain as ReasoningChain | null) ?? null,
    };
  } catch (err: unknown) {
    console.error('getJobDetail exception:', err);
    return { rawDescription: null, reasoningChain: null, error: 'FAILED_TO_LOAD' };
  }
}

export async function getJobDescription(
  listingId: number
): Promise<{ rawDescription: string | null; error?: string }> {
  const detail = await getJobDetail(listingId);
  return {
    rawDescription: detail.rawDescription,
    error: detail.error,
  };
}

export async function searchHistoricalJobs(
  params: HistoricalSearchParams
): Promise<HistoricalSearchResult> {
  const filters = buildHistoricalSearchFilters(params);
  const offset = typeof params.offset === 'number' && params.offset >= 0 ? params.offset : 0;
  const limit = typeof params.limit === 'number' && params.limit > 0 ? params.limit : 20;

  if (!isSupabaseConfigured()) {
    return {
      jobs: [],
      hasMore: false,
      nextOffset: undefined,
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

    const collected: Array<{ row: Record<string, unknown>; sqlIndex: number }> = [];
    let queryErrorMessage: string | null = null;

    const { data: rawRows, error } = await buildHistoricalSupabaseQuery(
      supabase,
      filters
    ).range(offset, offset + limit);

    if (error) {
      queryErrorMessage = error.message;
    } else {
      const rows = (rawRows as Record<string, unknown>[]) || [];
      for (let i = 0; i < rows.length; i++) {
        if (
          filters.roleLevels.length === 0 ||
          filters.roleLevels.includes(String(rows[i].role_level ?? 'unknown'))
        ) {
          collected.push({ row: rows[i], sqlIndex: offset + i });
        }
      }
    }

    if (queryErrorMessage) {
      console.error('searchHistoricalJobs query error:', queryErrorMessage);
      return {
        jobs: [],
        hasMore: false,
        nextOffset: undefined,
        didYouMean: filters.didYouMean,
        note: queryErrorMessage,
      };
    }

    const hasMore = collected.length > limit;
    const finalItems = hasMore ? collected.slice(0, limit) : collected;
    const finalRows = finalItems.map((item) => item.row);

    // Compute exact nextOffset: lastRowSqlIndex + 1 to eliminate overlap / duplicates
    const nextOffset =
      hasMore && finalItems.length > 0
        ? finalItems[finalItems.length - 1].sqlIndex + 1
        : undefined;

    // Join authenticated user CRM states if user is signed in
    const userStateMap = new Map<
      number,
      {
        status: CrmStatus;
        applied_at?: string | null;
        updated_at?: string | null;
        notes?: string;
      }
    >();

    if (userId && finalRows.length > 0) {
      const listingIds = finalRows.map((r: Record<string, unknown>) => Number(r.id));
      const { data: userStates } = await supabase
        .from('user_job_states')
        .select('listing_id, status, applied_at, updated_at, notes')
        .eq('user_id', userId)
        .in('listing_id', listingIds);

      if (userStates) {
        for (const s of userStates) {
          userStateMap.set(Number(s.listing_id), {
            status: s.status as CrmStatus,
            applied_at: s.applied_at,
            updated_at: s.updated_at,
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
      nextOffset,
      didYouMean: filters.didYouMean,
      note,
    };
  } catch (err: unknown) {
    console.error('searchHistoricalJobs exception:', err);
    return {
      jobs: [],
      hasMore: false,
      nextOffset: undefined,
      didYouMean: filters.didYouMean,
      note: 'QUERY_EXECUTION_FAILED',
    };
  }
}
