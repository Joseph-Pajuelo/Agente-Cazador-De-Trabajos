'use server';

import { createClient, isSupabaseConfigured } from '../lib/supabase/server';
import {
  buildHistoricalSearchFilters,
  mapRowToJobSummary,
  type HistoricalSearchParams,
  type HistoricalSearchFilters,
} from '../lib/supabase/queries';
import { JobSummary, CrmStatus, ReasoningChain } from '../lib/domain/types';

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
  district,
  lima_zone,
  category,
  role_level,
  english_required,
  english_level,
  salary_min,
  salary_max,
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

/**
 * Pure evaluator to check whether an extracted row qualifies under role_level and pre-professional checks.
 */
export function isHistoricalRowEligible(
  row: Record<string, unknown>,
  includeDiscardedAi: boolean
): boolean {
  const roleLevel = row.role_level as string | undefined;
  if (roleLevel !== 'unknown') {
    return true;
  }
  const evaluations = row.job_evaluations as
    | Array<Record<string, unknown>>
    | Record<string, unknown>
    | undefined;
  const ev = Array.isArray(evaluations)
    ? evaluations.find((e) => !e.profile_id) || evaluations[0]
    : evaluations;
  return ev?.is_pre_professional === true || includeDiscardedAi;
}

/**
 * Builds the PostgREST query builder for historical job searches with indexed column filters.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildHistoricalSupabaseQuery(
  supabase: { from: (table: string) => any },
  filters: HistoricalSearchFilters
) {
  let queryBuilder = supabase
    .from('job_listings')
    .select(HISTORICAL_SEARCH_SELECT)
    .is('job_evaluations.profile_id', null);

  // 1. AI quality filter (decoupled from role level)
  if (!filters.includeDiscardedAi) {
    queryBuilder = queryBuilder.eq('job_evaluations.is_unrealistic_or_smoke', false);
  }

  // 2. Role levels filter & unknown refinement
  const hasRoleLevels = filters.roleLevels && filters.roleLevels.length > 0;
  const includesPreprof = hasRoleLevels && filters.roleLevels.includes('preprofesional');

  if (hasRoleLevels) {
    if (includesPreprof) {
      // Query selected role levels plus 'unknown' to refine via is_pre_professional
      const levelsToQuery = Array.from(new Set([...filters.roleLevels, 'unknown']));
      queryBuilder = queryBuilder.in('role_level', levelsToQuery);
    } else {
      queryBuilder = queryBuilder.in('role_level', filters.roleLevels);
    }
  }

  // 3. Min score filter
  if (filters.minScore > 0) {
    queryBuilder = queryBuilder.gte(
      'job_evaluations.final_ranking_score',
      filters.minScore
    );
  }

  // 4. Modality filter
  if (filters.modalities.length > 0) {
    queryBuilder = queryBuilder.in('modality', filters.modalities);
  }

  // 5. Source filter
  if (filters.sources.length > 0) {
    queryBuilder = queryBuilder.in('source', filters.sources);
  }

  // 6. Cutoff date filter
  if (filters.cutoffDate) {
    queryBuilder = queryBuilder.gte('published_date', filters.cutoffDate);
  }

  // 7. Category filter
  if (filters.categories.length > 0) {
    queryBuilder = queryBuilder.in('category', filters.categories);
  }

  // 8. English filters
  if (filters.englishOnly) {
    queryBuilder = queryBuilder.eq('english_required', true);
  }
  if (filters.englishLevels.length > 0) {
    queryBuilder = queryBuilder.in('english_level', filters.englishLevels);
  }

  // 9. Salary filter
  if (filters.salaryFilter === 'has_salary') {
    queryBuilder = queryBuilder.or('salary_min.not.is.null,salary_max.not.is.null');
  } else if (filters.salaryFilter === 'gte_1130') {
    queryBuilder = queryBuilder.or('salary_min.gte.1130,salary_max.gte.1130');
  } else if (filters.salaryFilter === 'gte_1500') {
    queryBuilder = queryBuilder.or('salary_min.gte.1500,salary_max.gte.1500');
  } else if (filters.salaryFilter === 'gte_2000') {
    queryBuilder = queryBuilder.or('salary_min.gte.2000,salary_max.gte.2000');
  }

  // 10. District inclusion filter (skips empty/whitespace entries)
  const sanitizedInc = filters.includedDistricts
    .map((d) => (typeof d === 'string' ? d.trim() : ''))
    .filter((d) => d.length > 0);

  if (sanitizedInc.length > 0) {
    const targetDistricts = new Set(sanitizedInc);
    if (filters.keepRemoteWhenDistrictFiltered) {
      targetDistricts.add('Remoto');
    }
    if (filters.includeLimaUnspecifiedDistrict) {
      targetDistricts.add('Lima Metropolitana');
    }
    const districtList = Array.from(targetDistricts).map((d) => `"${d}"`).join(',');

    if (filters.keepRemoteWhenDistrictFiltered) {
      queryBuilder = queryBuilder.or(`district.in.(${districtList}),modality.eq.Remoto`);
    } else {
      queryBuilder = queryBuilder.in('district', Array.from(targetDistricts));
    }
  }

  // 11. District exclusion filter (precedence over inclusion)
  // Preserves rows where district IS NULL (e.g. un-localized / remote) per PostgreSQL 3-valued logic
  const sanitizedExcl = filters.excludedDistricts
    .map((d) => (typeof d === 'string' ? d.trim() : ''))
    .filter((d) => d.length > 0);

  if (sanitizedExcl.length > 0) {
    const exclList = sanitizedExcl.map((d) => `"${d}"`).join(',');
    queryBuilder = queryBuilder.or(`district.is.null,district.not.in.(${exclList})`);
  }

  // 12. Keyword / Brand / Sector / FTS filtering
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

  return queryBuilder
    .order('published_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
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

    const hasRoleLevels = filters.roleLevels && filters.roleLevels.length > 0;
    const includesPreprof = hasRoleLevels && filters.roleLevels.includes('preprofesional');
    // Only refine in-memory when preprofesional is requested AND discarded AI items are hidden
    const needsUnknownRefinement = includesPreprof && !filters.includeDiscardedAi;

    const collected: Array<{ row: Record<string, unknown>; sqlIndex: number }> = [];
    let currentSqlOffset = offset;
    const batchSize = limit * 2 + 1;
    let queryErrorMessage: string | null = null;

    if (!needsUnknownRefinement) {
      const { data: rawRows, error } = await buildHistoricalSupabaseQuery(
        supabase,
        filters
      ).range(offset, offset + limit);

      if (error) {
        queryErrorMessage = error.message;
      } else {
        const rows = (rawRows as Record<string, unknown>[]) || [];
        for (let i = 0; i < rows.length; i++) {
          collected.push({ row: rows[i], sqlIndex: offset + i });
        }
      }
    } else {
      // Bounded scan loop up to 5 batches of `batchSize = limit * 2 + 1`
      const maxBatches = 5;
      for (let batch = 0; batch < maxBatches; batch++) {
        const batchStart = currentSqlOffset;
        const batchEnd = batchStart + batchSize - 1;

        const { data: batchRows, error } = await buildHistoricalSupabaseQuery(
          supabase,
          filters
        ).range(batchStart, batchEnd);

        if (error) {
          queryErrorMessage = error.message;
          break;
        }

        const rows = (batchRows as Record<string, unknown>[]) || [];
        if (rows.length === 0) {
          break;
        }

        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          const sqlIdx = batchStart + i;

          if (isHistoricalRowEligible(r, filters.includeDiscardedAi)) {
            collected.push({ row: r, sqlIndex: sqlIdx });
            if (collected.length > limit) {
              break;
            }
          }
        }

        currentSqlOffset += rows.length;

        // If we found limit + 1 items or reached the end of available records:
        if (collected.length > limit || rows.length < batchSize) {
          break;
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
