import { describe, it, expect, vi } from 'vitest';
import { crmStateSchema, upsertJobState } from '../src/actions/crm';
import {
  profileUpdateSchema,
  validateProfileUpdatePayload,
  updateProfile,
} from '../src/actions/profile';
import { shouldRedirectToLogin } from '../src/lib/supabase/middleware';
import { buildHistoricalSearchFilters } from '../src/lib/supabase/queries';

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
    it('accepts valid profile updates with clean fields', () => {
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
      const parsed = validateProfileUpdatePayload(valid);
      expect(parsed.ok).toBe(true);
      expect(profileUpdateSchema.safeParse(valid).success).toBe(true);
    });

    it('rejects or forbids is_admin / isAdmin escalation attempts', () => {
      const attempt1 = {
        full_name: 'Hacker',
        is_admin: true,
      };
      const result1 = validateProfileUpdatePayload(attempt1);
      expect(result1.ok).toBe(false);
      expect(profileUpdateSchema.safeParse(attempt1).success).toBe(false);

      const attempt2 = {
        full_name: 'Hacker',
        isAdmin: true,
      };
      const result2 = validateProfileUpdatePayload(attempt2);
      expect(result2.ok).toBe(false);
      expect(profileUpdateSchema.safeParse(attempt2).success).toBe(false);
    });

    it('validates array lengths and field limits cleanly', () => {
      const tooManyDistricts = {
        preferred_districts: Array.from({ length: 60 }, (_, i) => `Distrito ${i}`),
      };
      expect(profileUpdateSchema.safeParse(tooManyDistricts).success).toBe(false);
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
    });
  });
});
