import { describe, it, expect, vi } from 'vitest';
import { crmStateSchema, profileUpdateSchema } from '../src/actions/schemas';
import { upsertJobState } from '../src/actions/crm';
import {
  validateProfileUpdatePayload,
  updateProfile,
} from '../src/actions/profile';
import { shouldRedirectToLogin } from '../src/lib/supabase/middleware';
import {
  buildHistoricalSearchFilters,
  buildHistoricalSupabaseQuery,
} from '../src/lib/supabase/queries';
import {
  getJobDetail,
  getJobDescription,
  searchHistoricalJobs,
} from '../src/actions/jobs';
import * as supabaseServer from '../src/lib/supabase/server';

describe('Task 4: Supabase Auth, Middleware, Queries & Server Actions', () => {
  describe('1. crmStateSchema', () => {
    it('accepts valid CrmStatus and positive listingId with optional notes', () => {
      const validPayload = {
        listingId: 101,
        status: 'applied',
        notes: 'Postulado por LinkedIn con CV adaptado',
      };
      const result = crmStateSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.listingId).toBe(101);
        expect(result.data.status).toBe('applied');
        expect(result.data.notes).toBe('Postulado por LinkedIn con CV adaptado');
      }
    });

    it('accepts valid statuses without notes', () => {
      const statuses = ['to_apply', 'favorite', 'applied', 'interview', 'discarded'] as const;
      for (const status of statuses) {
        const res = crmStateSchema.safeParse({ listingId: 1, status });
        expect(res.success).toBe(true);
      }
    });

    it('rejects invalid status strings like "hacked"', () => {
      const invalidPayload = {
        listingId: 42,
        status: 'hacked',
      };
      const result = crmStateSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });

    it('rejects non-positive listing IDs (0, -1, float)', () => {
      expect(crmStateSchema.safeParse({ listingId: 0, status: 'to_apply' }).success).toBe(false);
      expect(crmStateSchema.safeParse({ listingId: -5, status: 'favorite' }).success).toBe(false);
      expect(crmStateSchema.safeParse({ listingId: 1.5, status: 'applied' }).success).toBe(false);
    });

    it('rejects notes exceeding 2000 characters', () => {
      const tooLongNotes = 'a'.repeat(2001);
      const res = crmStateSchema.safeParse({
        listingId: 10,
        status: 'favorite',
        notes: tooLongNotes,
      });
      expect(res.success).toBe(false);
    });
  });

  describe('2. profileUpdateSchema & validateProfileUpdatePayload', () => {
    it('accepts valid profile updates with clean fields', async () => {
      const valid = {
        full_name: 'Joseph Thorne',
        headline: 'Estudiante de Ingeniería de Sistemas',
        university: 'Universidad Nacional de Ingeniería',
        current_cycle: '8vo ciclo',
        preferred_districts: ['San Isidro', 'Miraflores', 'Surco'],
        modality_priority: ['Híbrido', 'Presencial', 'Remoto'],
        target_areas: ['Datos', 'Desarrollo de Software'],
        technical_skills: { python: 'avanzado', sql: 'intermedio' },
      };
      const parsed = await validateProfileUpdatePayload(valid);
      expect(parsed.ok).toBe(true);
      expect(profileUpdateSchema.safeParse(valid).success).toBe(true);
    });

    it('rejects or forbids is_admin / isAdmin escalation attempts', async () => {
      const attempt1 = {
        full_name: 'Hacker',
        is_admin: true,
      };
      const result1 = await validateProfileUpdatePayload(attempt1);
      expect(result1.ok).toBe(false);
      expect(profileUpdateSchema.safeParse(attempt1).success).toBe(false);

      const attempt2 = {
        full_name: 'Hacker',
        isAdmin: true,
      };
      const result2 = await validateProfileUpdatePayload(attempt2);
      expect(result2.ok).toBe(false);
      expect(profileUpdateSchema.safeParse(attempt2).success).toBe(false);
    });

    it('validates array lengths and field limits cleanly', () => {
      const tooManyDistricts = {
        preferred_districts: Array.from({ length: 60 }, (_, i) => `Distrito ${i}`),
      };
      expect(profileUpdateSchema.safeParse(tooManyDistricts).success).toBe(false);

      const tooManyExcludedDistricts = {
        excluded_districts: Array.from({ length: 51 }, (_, i) => `Distrito ${i}`),
      };
      expect(profileUpdateSchema.safeParse(tooManyExcludedDistricts).success).toBe(false);
    });

    it('accepts and validates excluded_districts array', async () => {
      const payloadWithExclusions = {
        excluded_districts: ['Ate', 'Santa Anita'],
      };
      const result = await validateProfileUpdatePayload(payloadWithExclusions);
      expect(result.ok).toBe(true);
      expect(profileUpdateSchema.safeParse(payloadWithExclusions).success).toBe(true);
    });
  });

  describe('3. shouldRedirectToLogin route protection', () => {
    it('redirects unauthenticated users from /pipeline and /profile to /login?next=<encoded>', () => {
      expect(shouldRedirectToLogin('/pipeline', false)).toBe('/login?next=%2Fpipeline');
      expect(shouldRedirectToLogin('/profile', false)).toBe('/login?next=%2Fprofile');
      expect(shouldRedirectToLogin('/pipeline/details', false)).toBe(
        '/login?next=%2Fpipeline%2Fdetails'
      );
    });

    it('allows public routes when unauthenticated', () => {
      expect(shouldRedirectToLogin('/', false)).toBeNull();
      expect(shouldRedirectToLogin('/login', false)).toBeNull();
      expect(shouldRedirectToLogin('/auth/callback', false)).toBeNull();
    });

    it('allows protected routes when user is authenticated', () => {
      expect(shouldRedirectToLogin('/pipeline', true)).toBeNull();
      expect(shouldRedirectToLogin('/profile', true)).toBeNull();
      expect(shouldRedirectToLogin('/', true)).toBeNull();
    });
  });

  describe('4. Unauthenticated Server Actions safety', () => {
    it('upsertJobState returns AUTH_REQUIRED with no DB writes when unauthenticated', async () => {
      const res = await upsertJobState({ listingId: 10, status: 'favorite' });
      expect(res).toEqual({ ok: false, error: 'AUTH_REQUIRED' });
    });

    it('updateProfile returns AUTH_REQUIRED with no DB writes when unauthenticated', async () => {
      const res = await updateProfile({ full_name: 'Nuevo Nombre' });
      expect(res).toEqual({ ok: false, error: 'AUTH_REQUIRED' });
    });
  });

  describe('5. buildHistoricalSearchFilters', () => {
    it('resolves "bcp" to brandKey: "bcp" and sectorHint: "banca"', () => {
      const filters = buildHistoricalSearchFilters({
        query: 'bcp',
        includeDiscardedAi: false,
        minScore: 60,
        modalities: ['Híbrido'],
        sources: ['practicas_pe'],
        maxAgeDays: 14,
      });

      expect(filters.brandKey).toBe('bcp');
      expect(filters.sectorHint).toBe('banca');
      expect(filters.ftsQuery).toBe('bcp');
      expect(filters.didYouMean).toBeNull();
      expect(filters.minScore).toBe(60);
      expect(filters.includeDiscardedAi).toBe(false);
      expect(filters.modalities).toEqual(['Híbrido']);
      expect(filters.sources).toEqual(['practicas_pe']);
      expect(filters.cutoffDate).toBeDefined();
      expect(typeof filters.cutoffDate).toBe('string');
    });

    it('corrects typo "phyton" to ftsQuery: "python" and didYouMean: "python"', () => {
      const filters = buildHistoricalSearchFilters({
        query: 'phyton',
      });

      expect(filters.ftsQuery).toBe('python');
      expect(filters.didYouMean).toBe('python');
      expect(filters.brandKey).toBeNull();
    });

    it('corrects typo "interbanck" and resolves brandKey: "interbank"', () => {
      const filters = buildHistoricalSearchFilters({
        query: 'interbanck',
      });

      expect(filters.brandKey).toBe('interbank');
      expect(filters.sectorHint).toBe('banca');
      expect(filters.didYouMean).toBe('interbank');
    });

    it('handles empty query cleanly without throwing', () => {
      const filters = buildHistoricalSearchFilters({ query: '' });
      expect(filters.brandKey).toBeNull();
      expect(filters.sectorHint).toBeNull();
      expect(filters.ftsQuery).toBeNull();
      expect(filters.didYouMean).toBeNull();
      expect(filters.cutoffDate).toBeNull();
      expect(filters.includedDistricts).toEqual([]);
      expect(filters.excludedDistricts).toEqual([]);
      expect(filters.keepRemoteWhenDistrictFiltered).toBe(true);
      expect(filters.includeLimaUnspecifiedDistrict).toBe(false);
      expect(filters.categories).toEqual([]);
      expect(filters.roleLevels).toEqual([]);
      expect(filters.englishOnly).toBe(false);
      expect(filters.englishLevels).toEqual([]);
      expect(filters.salaryFilter).toBe('any');
    });

    it('parses extended Lima filters, English, role level, and salary options cleanly', () => {
      const filters = buildHistoricalSearchFilters({
        query: 'python',
        includedDistricts: ['San Isidro', 'Miraflores'],
        excludedDistricts: ['Ate', 'Santa Anita'],
        keepRemoteWhenDistrictFiltered: false,
        includeLimaUnspecifiedDistrict: true,
        categories: ['Desarrollo & Software', 'Datos, BI & IA'],
        roleLevels: ['preprofesional', 'profesional'],
        englishOnly: true,
        englishLevels: ['intermedio', 'avanzado'],
        salaryFilter: 'gte_1500',
      });

      expect(filters.ftsQuery).toBe('python');
      expect(filters.includedDistricts).toEqual(['San Isidro', 'Miraflores']);
      expect(filters.excludedDistricts).toEqual(['Ate', 'Santa Anita']);
      expect(filters.keepRemoteWhenDistrictFiltered).toBe(false);
      expect(filters.includeLimaUnspecifiedDistrict).toBe(true);
      expect(filters.categories).toEqual(['Desarrollo & Software', 'Datos, BI & IA']);
      expect(filters.roleLevels).toEqual(['preprofesional', 'profesional']);
      expect(filters.englishOnly).toBe(true);
      expect(filters.englishLevels).toEqual(['intermedio', 'avanzado']);
      expect(filters.salaryFilter).toBe('gte_1500');
    });
  });

  describe('6. Lazy getJobDetail & getJobDescription wrapper', () => {
    it('validates listingId and rejects invalid inputs', async () => {
      expect(await getJobDetail(0)).toEqual({
        rawDescription: null,
        reasoningChain: null,
        error: 'INVALID_LISTING_ID',
      });
      expect(await getJobDetail(-1)).toEqual({
        rawDescription: null,
        reasoningChain: null,
        error: 'INVALID_LISTING_ID',
      });
      expect(await getJobDescription(0)).toEqual({
        rawDescription: null,
        error: 'INVALID_LISTING_ID',
      });
      expect(await getJobDescription(-5)).toEqual({
        rawDescription: null,
        error: 'INVALID_LISTING_ID',
      });
    });

    it('returns SUPABASE_NOT_CONFIGURED gracefully when unconfigured in test environment', async () => {
      const detail = await getJobDetail(101);
      expect(detail).toEqual({
        rawDescription: null,
        reasoningChain: null,
        error: 'SUPABASE_NOT_CONFIGURED',
      });

      const desc = await getJobDescription(101);
      expect(desc).toEqual({
        rawDescription: null,
        error: 'SUPABASE_NOT_CONFIGURED',
      });
    });
  });

  describe('7. SQL Filter Construction & 3VL District Exclusion Semantics', () => {
    function createMockQueryBuilder() {
      const orCalls: string[] = [];
      const inCalls: { column: string; values: unknown[] }[] = [];
      const notCalls: { column: string; operator: string; value: unknown }[] = [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        select: vi.fn(() => builder),
        is: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        gte: vi.fn(() => builder),
        in: vi.fn((column: string, values: unknown[]) => {
          inCalls.push({ column, values });
          return builder;
        }),
        not: vi.fn((column: string, operator: string, value: unknown) => {
          notCalls.push({ column, operator, value });
          return builder;
        }),
        or: vi.fn((filter: string) => {
          orCalls.push(filter);
          return builder;
        }),
        textSearch: vi.fn(() => builder),
        order: vi.fn(() => builder),
      };

      const mockSupabase = {
        from: vi.fn(() => builder),
      };

      return { mockSupabase, builder, orCalls, inCalls, notCalls };
    }

    it('constructs district.is.null,district.not.in.(...) to preserve null districts under Postgres 3VL', () => {
      const { mockSupabase, orCalls, notCalls } = createMockQueryBuilder();
      const filters = buildHistoricalSearchFilters({
        excludedDistricts: ['Ate', 'Santa Anita'],
      });

      buildHistoricalSupabaseQuery(mockSupabase, filters);

      // Verify that PostgREST .or() with district.is.null is used instead of bare .not('district', 'in')
      expect(orCalls).toContain('district.is.null,district.not.in.("Ate","Santa Anita")');
      expect(notCalls.filter((c) => c.column === 'district')).toHaveLength(0);
    });

    it('skips empty and whitespace-only entries in excludedDistricts before quoting', () => {
      const { mockSupabase, orCalls } = createMockQueryBuilder();
      const filters = buildHistoricalSearchFilters({
        excludedDistricts: ['  ', 'Ate', '', '   '],
      });

      buildHistoricalSupabaseQuery(mockSupabase, filters);

      expect(orCalls).toContain('district.is.null,district.not.in.("Ate")');
    });

    it('does not add district exclusion filter when excludedDistricts is empty', () => {
      const { mockSupabase, orCalls } = createMockQueryBuilder();
      const filters = buildHistoricalSearchFilters({
        excludedDistricts: [],
      });

      buildHistoricalSupabaseQuery(mockSupabase, filters);

      const districtExclusion = orCalls.find((c) => c.includes('district.is.null'));
      expect(districtExclusion).toBeUndefined();
    });
  });

  describe('8. searchHistoricalJobs Pagination & Multi-batch Unknown Refinement', () => {
    it('returns SUPABASE_NOT_CONFIGURED gracefully when unconfigured', async () => {
      const res = await searchHistoricalJobs({ query: 'python' });
      expect(res).toEqual({
        jobs: [],
        hasMore: false,
        nextOffset: undefined,
        didYouMean: null,
        note: 'SUPABASE_NOT_CONFIGURED',
      });
    });

    it('refines unknown role levels across batches with accurate hasMore and nextOffset eliminating duplicates', async () => {
      // 7 mock database rows:
      // Index 0: eligible (preprofesional)
      // Index 1: ineligible (unknown, not pre-prof) -> must skip
      // Index 2: ineligible (unknown, not pre-prof) -> must skip
      // Index 3: eligible (preprofesional)
      // Index 4: eligible (unknown, pre-prof = true)
      // Index 5: ineligible (unknown, not pre-prof) -> must skip
      // Index 6: eligible (preprofesional)
      const mockDbRows = [
        {
          id: 101,
          deduplication_hash: 'h1',
          source: 'linkedin',
          title: 'Practicante Backend 1',
          company: 'Empresa A',
          location: 'Lima',
          modality: 'Híbrido',
          url: 'https://example.com/1',
          role_level: 'preprofesional',
          job_evaluations: [{ is_pre_professional: true, is_unrealistic_or_smoke: false }],
        },
        {
          id: 102,
          deduplication_hash: 'h2',
          source: 'linkedin',
          title: 'Senior Dev (Smoke/Non-pre)',
          company: 'Empresa B',
          location: 'Lima',
          modality: 'Híbrido',
          url: 'https://example.com/2',
          role_level: 'unknown',
          job_evaluations: [{ is_pre_professional: false, is_unrealistic_or_smoke: false }],
        },
        {
          id: 103,
          deduplication_hash: 'h3',
          source: 'linkedin',
          title: 'Mid Level Dev',
          company: 'Empresa C',
          location: 'Lima',
          modality: 'Híbrido',
          url: 'https://example.com/3',
          role_level: 'unknown',
          job_evaluations: [{ is_pre_professional: false, is_unrealistic_or_smoke: false }],
        },
        {
          id: 104,
          deduplication_hash: 'h4',
          source: 'linkedin',
          title: 'Practicante Backend 2',
          company: 'Empresa D',
          location: 'Lima',
          modality: 'Híbrido',
          url: 'https://example.com/4',
          role_level: 'preprofesional',
          job_evaluations: [{ is_pre_professional: true, is_unrealistic_or_smoke: false }],
        },
        {
          id: 105,
          deduplication_hash: 'h5',
          source: 'linkedin',
          title: 'Practicante Datos (Unknown evaluated pre-prof)',
          company: 'Empresa E',
          location: 'Lima',
          modality: 'Híbrido',
          url: 'https://example.com/5',
          role_level: 'unknown',
          job_evaluations: [{ is_pre_professional: true, is_unrealistic_or_smoke: false }],
        },
        {
          id: 106,
          deduplication_hash: 'h6',
          source: 'linkedin',
          title: 'Analista Senior',
          company: 'Empresa F',
          location: 'Lima',
          modality: 'Híbrido',
          url: 'https://example.com/6',
          role_level: 'unknown',
          job_evaluations: [{ is_pre_professional: false, is_unrealistic_or_smoke: false }],
        },
        {
          id: 107,
          deduplication_hash: 'h7',
          source: 'linkedin',
          title: 'Practicante Frontend',
          company: 'Empresa G',
          location: 'Lima',
          modality: 'Híbrido',
          url: 'https://example.com/7',
          role_level: 'preprofesional',
          job_evaluations: [{ is_pre_professional: true, is_unrealistic_or_smoke: false }],
        },
      ];

      // Setup mock Supabase client
      const rangeCalls: { start: number; end: number }[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const createBuilder = (): any => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const b: any = {
          select: vi.fn(() => b),
          is: vi.fn(() => b),
          eq: vi.fn(() => b),
          gte: vi.fn(() => b),
          in: vi.fn(() => b),
          not: vi.fn(() => b),
          or: vi.fn(() => b),
          textSearch: vi.fn(() => b),
          order: vi.fn(() => b),
          range: vi.fn((start: number, end: number) => {
            rangeCalls.push({ start, end });
            const slice = mockDbRows.slice(start, end + 1);
            return Promise.resolve({ data: slice, error: null });
          }),
        };
        return b;
      };

      const mockClient = {
        from: vi.fn(() => createBuilder()),
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        },
      };

      vi.spyOn(supabaseServer, 'isSupabaseConfigured').mockReturnValue(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(supabaseServer, 'createClient').mockResolvedValue(mockClient as any);

      try {
        // Page 1: Request limit = 2 with roleLevels = ['preprofesional'], includeDiscardedAi = false
        const page1 = await searchHistoricalJobs({
          query: '',
          limit: 2,
          offset: 0,
          roleLevels: ['preprofesional'],
          includeDiscardedAi: false,
        });

        // Eligible items: index 0 (101) and index 3 (104). Index 4 (105) triggers hasMore.
        expect(page1.jobs).toHaveLength(2);
        expect(page1.jobs.map((j) => j.id)).toEqual([101, 104]);
        expect(page1.hasMore).toBe(true);
        // nextOffset must be index 3 + 1 = 4
        expect(page1.nextOffset).toBe(4);

        // Page 2: Request limit = 2 starting at nextOffset (4)
        const page2 = await searchHistoricalJobs({
          query: '',
          limit: 2,
          offset: page1.nextOffset,
          roleLevels: ['preprofesional'],
          includeDiscardedAi: false,
        });

        // Eligible items starting from index 4: index 4 (105) and index 6 (107).
        expect(page2.jobs).toHaveLength(2);
        expect(page2.jobs.map((j) => j.id)).toEqual([105, 107]);

        // CRITICAL: ZERO duplicate job IDs between page 1 and page 2
        const page1Ids = new Set(page1.jobs.map((j) => j.id));
        const duplicateIds = page2.jobs.filter((j) => page1Ids.has(j.id));
        expect(duplicateIds).toHaveLength(0);

        // Reached end of data -> hasMore must be false and nextOffset undefined
        expect(page2.hasMore).toBe(false);
        expect(page2.nextOffset).toBeUndefined();
      } finally {
        vi.restoreAllMocks();
      }
    });
  });
});
