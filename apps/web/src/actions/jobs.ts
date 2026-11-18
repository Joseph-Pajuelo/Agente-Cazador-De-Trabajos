'use server';

/**
 * Server Actions de consulta bajo demanda para vacantes:
 * 1. `getJobDetail`: carga diferida (lazy loading) de `raw_description` y `reasoning_chain`
 *    cuando el usuario abre el drawer de una vacante, manteniendo ligero el payload inicial SSR.
 * 2. `searchHistoricalJobs`: búsqueda y paginación en PostgreSQL sobre todo el catálogo histórico
 *    usando Full-Text Search en español (`search_tsv`) y columnas normalizadas de Lima.
 */
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

// ============================================================================
// 1. Carga Diferida (Lazy Detail) para el Drawer de Vacante
// ============================================================================
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

// ============================================================================
// 2. Búsqueda y Paginación sobre el Catálogo Histórico Completo
// ============================================================================
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

    // Resolver usuario autenticado opcional para cruzar con sus estados en user_job_states
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
      console.error('searchHistoricalJobs query error:', error);
      queryErrorMessage = error.message;
    } else if (rawRows && rawRows.length > 0) {
      for (let i = 0; i < rawRows.length; i++) {
        collected.push({
          row: rawRows[i] as Record<string, unknown>,
          sqlIndex: offset + i,
        });
      }
    }

    if (queryErrorMessage && collected.length === 0) {
      return {
        jobs: [],
        hasMore: false,
        nextOffset: undefined,
        didYouMean: filters.didYouMean,
        note: queryErrorMessage,
      };
    }

    const hasMore = collected.length > limit;
    const pageEntries = collected.slice(0, limit);
    const nextOffset =
      hasMore && pageEntries.length > 0
        ? pageEntries[pageEntries.length - 1].sqlIndex + 1
        : undefined;
    const pageRows = pageEntries.map((e) => e.row);

    // Enriquecer con estados CRM personales si el usuario tiene sesión activa
    const userStateMap = new Map<
      number,
      {
        status: CrmStatus;
        applied_at?: string | null;
        updated_at?: string | null;
        notes?: string;
      }
    >();

    if (userId && pageRows.length > 0) {
      const pageIds = pageRows.map((r) => Number(r.id)).filter(Boolean);
      if (pageIds.length > 0) {
        const { data: stateRows } = await supabase
          .from('user_job_states')
          .select('listing_id, status, applied_at, updated_at, notes')
          .eq('user_id', userId)
          .in('listing_id', pageIds);

        if (stateRows) {
          for (const s of stateRows) {
            userStateMap.set(Number(s.listing_id), {
              status: s.status as CrmStatus,
              applied_at: s.applied_at,
              updated_at: s.updated_at,
              notes: s.notes,
            });
          }
        }
      }
    }

    const jobs = pageRows.map((row) => {
      const state = userStateMap.get(Number(row.id)) || null;
      return mapRowToJobSummary(row, state);
    });

    let note: string | null = null;
    if (filters.brandKey) {
      note = `Filtrando vacantes vinculadas a la marca "${filters.brandKey.toUpperCase()}"`;
    } else if (filters.sectorHint) {
      note = `Filtrando vacantes del sector "${filters.sectorHint}"`;
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
      note: 'SEARCH_ERROR',
    };
  }
}
