import { createClient, isSupabaseConfigured } from './server';
import { JobSummary, UserProfile, CrmStatus } from '../domain/types';
import { RoleLevel, EnglishLevel } from '../domain/jobNormalization';
import { SalaryFilterKey } from '../jobs/workspaceState';
import { resolveBrandOrSectorFromQuery } from '../domain/companies';
import { suggestCorrections } from '../domain/searchEngine';

export interface HistoricalSearchParams {
  query?: string;
  includeDiscardedAi?: boolean;
  minScore?: number;
  modalities?: string[];
  sources?: string[];
  maxAgeDays?: number | null;
  offset?: number;
  limit?: number;
  includedDistricts?: string[];
  excludedDistricts?: string[];
  keepRemoteWhenDistrictFiltered?: boolean;
  includeLimaUnspecifiedDistrict?: boolean;
  categories?: string[];
  roleLevels?: (Exclude<RoleLevel, 'unknown'> | RoleLevel | string)[];
  englishOnly?: boolean;
  englishLevels?: EnglishLevel[];
  salaryFilter?: SalaryFilterKey;
}

export interface HistoricalSearchFilters {
  brandKey: string | null;
  sectorHint: string | null;
  ftsQuery: string | null;
  didYouMean: string | null;
  minScore: number;
  includeDiscardedAi: boolean;
  modalities: string[];
  sources: string[];
  cutoffDate: string | null;
  includedDistricts: string[];
  excludedDistricts: string[];
  keepRemoteWhenDistrictFiltered: boolean;
  includeLimaUnspecifiedDistrict: boolean;
  categories: string[];
  roleLevels: (Exclude<RoleLevel, 'unknown'> | RoleLevel | string)[];
  englishOnly: boolean;
  englishLevels: EnglishLevel[];
  salaryFilter: SalaryFilterKey;
}

export const LIGHTWEIGHT_JOB_SELECT = `
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
  salary_max
`;

export const JOB_WITH_EVALUATION_SELECT = `
  ${LIGHTWEIGHT_JOB_SELECT},
  job_evaluations (
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

export function mapRowToJobSummary(
  row: Record<string, unknown>,
  userState?: { status: CrmStatus; applied_at?: string | null; notes?: string } | null
): JobSummary {
  const evaluations = row.job_evaluations as
    | Array<Record<string, unknown>>
    | Record<string, unknown>
    | undefined;

  const ev: Record<string, unknown> | undefined = Array.isArray(evaluations)
    ? evaluations.find((e) => !e.profile_id) || evaluations[0]
    : evaluations;

  return {
    id: row.id as number | string,
    deduplication_hash: String(row.deduplication_hash || ''),
    source: String(row.source || ''),
    title: String(row.title || ''),
    company: String(row.company || ''),
    location: (row.location as string) || 'Lima, Perú',
    modality: (row.modality as string) || 'No especificado',
    url: String(row.url || ''),
    salary: (row.salary as string | null) ?? null,
    published_at: (row.published_at as string | null) ?? null,
    published_date: (row.published_date as string | null) ?? null,
    status: row.status as string | undefined,
    created_at: row.created_at as string | undefined,
    resolved_brand_key: (row.resolved_brand_key as string | null) ?? null,
    resolved_via_agency: Boolean(row.resolved_via_agency),
    agency_clue: (row.agency_clue as string) ?? '',
    sector_hint: (row.sector_hint as string | null) ?? null,

    // Normalized Lima metadata
    district: (row.district as string | null) ?? null,
    lima_zone: (row.lima_zone as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    role_level: (row.role_level as RoleLevel | null) ?? null,
    english_required:
      row.english_required !== undefined && row.english_required !== null
        ? Boolean(row.english_required)
        : false,
    english_level: (row.english_level as EnglishLevel | null) ?? null,
    salary_min:
      row.salary_min !== undefined && row.salary_min !== null
        ? Number(row.salary_min)
        : null,
    salary_max:
      row.salary_max !== undefined && row.salary_max !== null
        ? Number(row.salary_max)
        : null,

    is_pre_professional: ev?.is_pre_professional as boolean | undefined,
    is_unrealistic_or_smoke: ev?.is_unrealistic_or_smoke as boolean | undefined,
    technical_match_score:
      ev?.technical_match_score !== undefined && ev?.technical_match_score !== null
        ? Number(ev.technical_match_score)
        : undefined,
    modality_score:
      ev?.modality_score !== undefined && ev?.modality_score !== null
        ? Number(ev.modality_score)
        : undefined,
    location_score:
      ev?.location_score !== undefined && ev?.location_score !== null
        ? Number(ev.location_score)
        : undefined,
    final_ranking_score:
      ev?.final_ranking_score !== undefined && ev?.final_ranking_score !== null
        ? Number(ev.final_ranking_score)
        : undefined,
    matching_skills: Array.isArray(ev?.matching_skills)
      ? (ev.matching_skills as string[])
      : [],
    missing_skills: Array.isArray(ev?.missing_skills)
      ? (ev.missing_skills as string[])
      : [],
    verdict_summary: (ev?.verdict_summary as string) ?? '',
    engine: ev?.engine as string | undefined,

    user_status: userState?.status ?? null,
    applied_at: userState?.applied_at ?? null,
    user_notes: userState?.notes ?? null,
  };
}

export function buildHistoricalSearchFilters(
  params: HistoricalSearchParams
): HistoricalSearchFilters {
  const rawQuery = (params.query || '').trim();
  const minScore = typeof params.minScore === 'number' ? params.minScore : 0;
  const includeDiscardedAi = Boolean(params.includeDiscardedAi);
  const modalities = Array.isArray(params.modalities) ? params.modalities : [];
  const sources = Array.isArray(params.sources) ? params.sources : [];

  const includedDistricts = Array.isArray(params.includedDistricts)
    ? params.includedDistricts
    : [];
  const excludedDistricts = Array.isArray(params.excludedDistricts)
    ? params.excludedDistricts
    : [];
  const keepRemoteWhenDistrictFiltered =
    params.keepRemoteWhenDistrictFiltered !== undefined
      ? Boolean(params.keepRemoteWhenDistrictFiltered)
      : true;
  const includeLimaUnspecifiedDistrict = Boolean(
    params.includeLimaUnspecifiedDistrict
  );
  const categories = Array.isArray(params.categories) ? params.categories : [];
  const roleLevels = Array.isArray(params.roleLevels) ? params.roleLevels : [];
  const englishOnly = Boolean(params.englishOnly);
  const englishLevels = Array.isArray(params.englishLevels)
    ? params.englishLevels
    : [];
  const salaryFilter: SalaryFilterKey = params.salaryFilter || 'any';

  const cutoffDate =
    typeof params.maxAgeDays === 'number' && params.maxAgeDays > 0
      ? new Date(Date.now() - params.maxAgeDays * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0]
      : null;

  if (!rawQuery) {
    return {
      brandKey: null,
      sectorHint: null,
      ftsQuery: null,
      didYouMean: null,
      minScore,
      includeDiscardedAi,
      modalities,
      sources,
      cutoffDate,
      includedDistricts,
      excludedDistricts,
      keepRemoteWhenDistrictFiltered,
      includeLimaUnspecifiedDistrict,
      categories,
      roleLevels,
      englishOnly,
      englishLevels,
      salaryFilter,
    };
  }

  // 1. Run typo correction first
  const [correctedQuery, didYouMeanList] = suggestCorrections(rawQuery);
  const didYouMean =
    correctedQuery && correctedQuery !== rawQuery.toLowerCase()
      ? correctedQuery
      : didYouMeanList && didYouMeanList.length > 0 && didYouMeanList[0] !== rawQuery.toLowerCase()
      ? didYouMeanList[0]
      : null;

  const targetQuery = correctedQuery || rawQuery;

  // 2. Resolve brand or sector from the corrected target query
  const { brandKey, sectorHint } = resolveBrandOrSectorFromQuery(targetQuery);

  const ftsQuery = correctedQuery || rawQuery;

  return {
    brandKey,
    sectorHint,
    ftsQuery,
    didYouMean,
    minScore,
    includeDiscardedAi,
    modalities,
    sources,
    cutoffDate,
    includedDistricts,
    excludedDistricts,
    keepRemoteWhenDistrictFiltered,
    includeLimaUnspecifiedDistrict,
    categories,
    roleLevels,
    englishOnly,
    englishLevels,
    salaryFilter,
  };
}

export interface AuthUserInfo {
  id: string;
  email?: string;
}

export async function getInitialRadarData(): Promise<{
  jobs: JobSummary[];
  user: AuthUserInfo | null;
  profileExcludedDistricts: string[];
  lastUpdated: string | null;
  isConfigured: boolean;
}> {
  if (!isSupabaseConfigured()) {
    return {
      jobs: [],
      user: null,
      profileExcludedDistricts: ['Ate'],
      lastUpdated: null,
      isConfigured: false,
    };
  }

  try {
    const supabase = await createClient();

    // 1. Fetch authenticated user (if any)
    let authUser: AuthUserInfo | null = null;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        authUser = { id: user.id, email: user.email };
      }
    } catch {
      authUser = null;
    }

    let profileExcludedDistricts: string[] = ['Ate'];
    if (authUser) {
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('excluded_districts')
        .eq('id', authUser.id)
        .maybeSingle();

      if (userProfile?.excluded_districts && Array.isArray(userProfile.excluded_districts)) {
        profileExcludedDistricts = userProfile.excluded_districts;
      }
    }

    // 2. Fetch recent evaluated jobs (<= 45d, limit 600)
    const cutoff45d = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const { data: rawListings, error } = await supabase
      .from('job_listings')
      .select(JOB_WITH_EVALUATION_SELECT)
      .or(`published_date.gte.${cutoff45d},published_date.is.null`)
      .order('created_at', { ascending: false })
      .limit(600);

    if (error) {
      console.error('getInitialRadarData job_listings error:', error);
      return {
        jobs: [],
        user: authUser,
        profileExcludedDistricts,
        lastUpdated: null,
        isConfigured: true,
      };
    }

    let listings = rawListings || [];

    // 3. If user is signed in, fetch user_job_states and any older user-tracked listings
    const userStateMap = new Map<
      number,
      { status: CrmStatus; applied_at?: string | null; notes?: string }
    >();

    if (authUser) {
      const { data: userStates } = await supabase
        .from('user_job_states')
        .select('listing_id, status, applied_at, notes')
        .eq('user_id', authUser.id);

      if (userStates) {
        for (const s of userStates) {
          userStateMap.set(Number(s.listing_id), {
            status: s.status as CrmStatus,
            applied_at: s.applied_at,
            notes: s.notes,
          });
        }

        // Check if there are user-tracked listings older than 45d not in the fetched batch
        const existingIds = new Set(listings.map((l: Record<string, unknown>) => Number(l.id)));
        const missingIds = userStates
          .map((s: { listing_id: number | string }) => Number(s.listing_id))
          .filter((id) => !existingIds.has(id));

        if (missingIds.length > 0) {
          const { data: extraListings } = await supabase
            .from('job_listings')
            .select(JOB_WITH_EVALUATION_SELECT)
            .in('id', missingIds);

          if (extraListings) {
            listings = [...listings, ...extraListings];
          }
        }
      }
    }

    // 4. Map to JobSummary array and compute lastUpdated
    let maxTimestamp: string | null = null;
    const jobs: JobSummary[] = listings.map((row: Record<string, unknown>) => {
      const ts = row.created_at as string | undefined;
      if (ts && (!maxTimestamp || ts > maxTimestamp)) {
        maxTimestamp = ts;
      }
      const userState = userStateMap.get(Number(row.id)) || null;
      return mapRowToJobSummary(row, userState);
    });

    return {
      jobs,
      user: authUser,
      profileExcludedDistricts,
      lastUpdated: maxTimestamp,
      isConfigured: true,
    };
  } catch (err) {
    console.error('getInitialRadarData error:', err);
    return {
      jobs: [],
      user: null,
      profileExcludedDistricts: ['Ate'],
      lastUpdated: null,
      isConfigured: false,
    };
  }
}

export async function getUserPipelineJobs(): Promise<JobSummary[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return [];
    }

    const { data: userStates, error: stateError } = await supabase
      .from('user_job_states')
      .select('listing_id, status, applied_at, notes')
      .eq('user_id', user.id);

    if (stateError || !userStates || userStates.length === 0) {
      return [];
    }

    // Filter to listings with status != 'to_apply' OR non-empty notes
    const activeStates = userStates.filter(
      (s: { status: string; notes?: string | null }) =>
        s.status !== 'to_apply' || (s.notes && s.notes.trim().length > 0)
    );

    if (activeStates.length === 0) {
      return [];
    }

    const activeMap = new Map<
      number,
      { status: CrmStatus; applied_at?: string | null; notes?: string }
    >();
    for (const s of activeStates) {
      activeMap.set(Number(s.listing_id), {
        status: s.status as CrmStatus,
        applied_at: s.applied_at,
        notes: s.notes,
      });
    }

    const listingIds = Array.from(activeMap.keys());
    const { data: listings, error: listingsError } = await supabase
      .from('job_listings')
      .select(JOB_WITH_EVALUATION_SELECT)
      .in('id', listingIds);

    if (listingsError || !listings) {
      return [];
    }

    return listings.map((row: Record<string, unknown>) => {
      const state = activeMap.get(Number(row.id));
      return mapRowToJobSummary(row, state);
    });
  } catch (err) {
    console.error('getUserPipelineJobs error:', err);
    return [];
  }
}

export async function getUserProfile(): Promise<UserProfile | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return null;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error || !data) {
      return null;
    }

    const profile = data as UserProfile;
    return {
      ...profile,
      excluded_districts: Array.isArray(profile.excluded_districts)
        ? profile.excluded_districts
        : ['Ate'],
    };
  } catch (err) {
    console.error('getUserProfile error:', err);
    return null;
  }
}

export interface UserPipelineCounts {
  favoriteCount: number;
  appliedCount: number;
  interviewCount: number;
  discardedCount: number;
  totalTracked: number;
}

export function calculatePipelineCounts(
  userStates: Array<{ status?: string | null }>
): UserPipelineCounts {
  let favoriteCount = 0;
  let appliedCount = 0;
  let interviewCount = 0;
  let discardedCount = 0;

  for (const s of userStates) {
    if (s.status === 'favorite') favoriteCount++;
    else if (s.status === 'applied') appliedCount++;
    else if (s.status === 'interview') interviewCount++;
    else if (s.status === 'discarded') discardedCount++;
  }

  return {
    favoriteCount,
    appliedCount,
    interviewCount,
    discardedCount,
    totalTracked: favoriteCount + appliedCount + interviewCount + discardedCount,
  };
}

export async function getUserPipelineCounts(): Promise<UserPipelineCounts> {
  const defaultCounts: UserPipelineCounts = {
    favoriteCount: 0,
    appliedCount: 0,
    interviewCount: 0,
    discardedCount: 0,
    totalTracked: 0,
  };

  if (!isSupabaseConfigured()) {
    return defaultCounts;
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return defaultCounts;
    }

    const { data, error } = await supabase
      .from('user_job_states')
      .select('status')
      .eq('user_id', user.id);

    if (error || !data) {
      return defaultCounts;
    }

    return calculatePipelineCounts(data);
  } catch (err) {
    console.error('getUserPipelineCounts error:', err);
    return defaultCounts;
  }
}

