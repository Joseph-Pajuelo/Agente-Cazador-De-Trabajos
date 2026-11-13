import { describe, it, expect, vi } from 'vitest';
import { crmStateSchema, profileUpdateSchema } from '../src/actions/schemas';
import { upsertJobState } from '../src/actions/crm';
import {
  validateProfileUpdatePayload,
  updateProfile,
} from '../src/actions/profile';
import { shouldRedirectToLogin } from '../src/lib/supabase/middleware';
import { buildHistoricalSearchFilters } from '../src/lib/supabase/queries';
import { getJobDetail, getJobDescription } from '../src/actions/jobs';

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
});
