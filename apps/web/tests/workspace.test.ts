import { describe, it, expect, vi } from 'vitest';
import { JobSummary } from '../src/lib/domain/types';
import { isJobNewToday } from '../src/lib/domain/ranking';
import * as jobNormalization from '../src/lib/domain/jobNormalization';
import {
  WorkspaceFilters,
  DEFAULT_WORKSPACE_FILTERS,
  PendingCrmOverride,
  RECENT_CRM_OVERRIDE_TTL_MS,
  computeCrmCounts,
  requiresHistoricalQuery,
  canMutateCrm,
  applyOptimisticCrmTransition,
  mergeServerJobsWithPendingCrm,
  rollbackJobTransition,
  filterAndSortWorkspaceJobs,
  isJobEligibleForRoleLevels,
  resolveJobNormalizedMeta,
  computeDistrictFacetCounts,
  computeCategoryFacetCounts,
} from '../src/lib/jobs/workspaceState';
import { sanitizeNextPath } from '../src/lib/auth/safeRedirect';

const sampleJobs: JobSummary[] = [
  {
    id: 1,
    deduplication_hash: 'hash-1',
    source: 'practicas_pe',
    title: 'Practicante Pre Profesional de Sistemas / TI',
    company: 'Banco de Crédito BCP',
    location: 'Lima, Perú',
    modality: 'Híbrido',
    url: 'https://ejemplo.pe/bcp-1',
    salary: 'S/. 1,500',
    published_at: null,
    published_date: '2026-11-10',
    resolved_brand_key: 'bcp',
    resolved_via_agency: false,
    agency_clue: '',
    sector_hint: 'banca',
    role_level: 'preprofesional',
    is_pre_professional: true,
    is_unrealistic_or_smoke: false,
    final_ranking_score: 92.5,
    user_status: null,
    user_notes: null,
  },
  {
    id: 2,
    deduplication_hash: 'hash-2',
    source: 'computrabajo',
    title: 'Practicante de Datos / Analytics',
    company: 'Manpower Perú',
    location: 'San Isidro, Lima',
    modality: 'Remoto',
    url: 'https://ejemplo.pe/manpower-2',
    salary: 'S/. 1,200',
    published_at: null,
    published_date: '2026-11-08',
    resolved_brand_key: 'interbank',
    resolved_via_agency: true,
    agency_clue: 'importante entidad financiera del grupo Intercorp',
    sector_hint: 'banca',
    role_level: 'preprofesional',
    is_pre_professional: true,
    is_unrealistic_or_smoke: false,
    final_ranking_score: 84.0,
    user_status: 'favorite',
    user_notes: 'Revisar portafolio de Power BI',
  },
  {
    id: 3,
    deduplication_hash: 'hash-3',
    source: 'bumeran',
    title: 'Practicante Preprofesional de Desarrollo Python',
    company: 'Belcorp',
    location: 'Miraflores, Lima',
    modality: 'Presencial',
    url: 'https://ejemplo.pe/belcorp-3',
    salary: null,
    published_at: null,
    published_date: '2026-11-01', // >7d, <=14d
    resolved_brand_key: 'belcorp',
    resolved_via_agency: false,
    agency_clue: '',
    sector_hint: 'retail',
    is_pre_professional: true,
    is_unrealistic_or_smoke: false,
    final_ranking_score: 78.0,
    user_status: 'applied',
    applied_at: '2026-11-05T10:00:00.000Z',
    user_notes: 'CV adaptado enviado',
  },
  {
    id: 4,
    deduplication_hash: 'hash-4',
    source: 'linkedin',
    title: 'Desarrollador Senior Java (5 años exp)',
    company: 'Consultora Tech',
    location: 'Lima, Perú',
    modality: 'Híbrido',
    url: 'https://ejemplo.pe/senior-4',
    salary: 'S/. 8,000',
    published_at: null,
    published_date: '2026-11-12',
    resolved_brand_key: null,
    resolved_via_agency: false,
    agency_clue: '',
    sector_hint: null,
    is_pre_professional: false, // AI discarded
    is_unrealistic_or_smoke: true,
    final_ranking_score: 25.0,
    user_status: null,
    user_notes: null,
  },
  {
    id: 5,
    deduplication_hash: 'hash-5',
    source: 'linkedin',
    title: 'Practicante de Soporte Técnico',
    company: 'Empresa Servicios',
    location: 'Lima, Perú',
    modality: 'Presencial',
    url: 'https://ejemplo.pe/discarded-5',
    salary: 'S/. 1,025',
    published_at: null,
    published_date: '2026-11-02',
    resolved_brand_key: null,
    resolved_via_agency: false,
    agency_clue: '',
    sector_hint: null,
    is_pre_professional: true,
    is_unrealistic_or_smoke: false,
    final_ranking_score: 60.0,
    user_status: 'discarded', // Discarded by user
    user_notes: 'Horario incompatible',
  },
  {
    id: 6,
    deduplication_hash: 'hash-6',
    source: 'practicas_pe',
    title: 'Practicante Pre Profesional de Base de Datos SQL',
    company: 'BBVA Perú',
    location: 'San Isidro, Lima',
    modality: 'Híbrido',
    url: 'https://ejemplo.pe/bbva-6',
    salary: 'S/. 1,400',
    published_at: null,
    published_date: '2026-10-10', // > 30 days old
    resolved_brand_key: 'bbva',
    resolved_via_agency: false,
    agency_clue: '',
    sector_hint: 'banca',
    role_level: 'preprofesional',
    is_pre_professional: true,
    is_unrealistic_or_smoke: false,
    final_ranking_score: 88.0,
    user_status: 'to_apply',
    user_notes: null,
  },
];

describe('Workspace State & Pure Reducer Helpers', () => {
  const fixedNow = new Date('2026-11-13T12:00:00.000Z');

  describe('1. computeCrmCounts', () => {
    it('accurately counts jobs per CRM tab and excludes AI-discarded, applied, and >21d jobs from activas', () => {
      const counts = computeCrmCounts(sampleJobs, { now: fixedNow });

      // Job 4 is AI discarded (no user_status) and Job 6 (2026-10-10) is >21d old, so visible pool has 4 jobs:
      // Job 1 (null status, 3d)   -> Activa, Todas
      // Job 2 (favorite, 5d)      -> Activa, Destacada, Todas
      // Job 3 (applied, 12d)      -> Postulado, Todas (excluded from Activa)
      // Job 5 (discarded, 11d)    -> Descartada, Todas
      expect(counts.todas).toBe(4);
      expect(counts.activas).toBe(2); // jobs 1, 2 (not discarded or applied by user, and <=21d)
      expect(counts.favorite).toBe(1); // job 2
      expect(counts.applied).toBe(1); // job 3
      expect(counts.to_apply).toBe(0); // job 6 excluded because >21d old
      expect(counts.interview).toBe(0);
      expect(counts.discarded).toBe(1); // job 5
    });

    it('includes AI-discarded jobs when includeDiscardedAi is true while still discarding >21d and applied jobs from activas', () => {
      const counts = computeCrmCounts(sampleJobs, {
        includeDiscardedAi: true,
        now: fixedNow,
      });
      expect(counts.todas).toBe(5);
      expect(counts.activas).toBe(3); // jobs 1, 2, 4
    });
  });

  describe('2. requiresHistoricalQuery', () => {
    it('flags true when maxAgeDays is null ("Cualquier fecha")', () => {
      expect(requiresHistoricalQuery({ maxAgeDays: null })).toBe(true);
    });

    it('flags false when maxAgeDays is a number', () => {
      expect(requiresHistoricalQuery({ maxAgeDays: 14 })).toBe(false);
      expect(requiresHistoricalQuery({ maxAgeDays: 7 })).toBe(false);
      expect(requiresHistoricalQuery({ maxAgeDays: 30 })).toBe(false);
    });
  });

  describe('3. canMutateCrm guest gate', () => {
    it('returns false for null, undefined, or empty user object', () => {
      expect(canMutateCrm(null)).toBe(false);
      expect(canMutateCrm(undefined)).toBe(false);
      expect(canMutateCrm({} as any)).toBe(false);
      expect(canMutateCrm({ id: '' } as any)).toBe(false);
    });

    it('returns true when user has a valid id', () => {
      expect(canMutateCrm({ id: 'user-uuid-123' })).toBe(true);
    });
  });

  describe('4. applyOptimisticCrmTransition', () => {
    it('updates status and adds applied_at timestamp when transitioning to "applied"', () => {
      const updated = applyOptimisticCrmTransition(sampleJobs, 1, 'applied');
      const target = updated.find((j) => j.id === 1);
      const original = sampleJobs.find((j) => j.id === 1);

      expect(target).toBeDefined();
      expect(target?.user_status).toBe('applied');
      expect(target?.applied_at).toBeTruthy();
      expect(original?.user_status).toBeNull(); // immutability
    });

    it('updates status and notes cleanly without mutating unrelated jobs', () => {
      const updated = applyOptimisticCrmTransition(
        sampleJobs,
        2,
        'interview',
        'Entrevista técnica agendada'
      );
      const target = updated.find((j) => j.id === 2);
      const untouched = updated.find((j) => j.id === 3);

      expect(target?.user_status).toBe('interview');
      expect(target?.user_notes).toBe('Entrevista técnica agendada');
      expect(untouched?.user_status).toBe('applied');
      expect(untouched?.user_notes).toBe('CV adaptado enviado');
    });

    it('preserves existing applied_at if status remains "applied"', () => {
      const prevAppliedAt = sampleJobs.find((j) => j.id === 3)?.applied_at;
      const updated = applyOptimisticCrmTransition(
        sampleJobs,
        3,
        'applied',
        'Seguimiento enviado'
      );
      const target = updated.find((j) => j.id === 3);

      expect(target?.applied_at).toBe(prevAppliedAt);
      expect(target?.user_notes).toBe('Seguimiento enviado');
    });
  });

  describe('5. filterAndSortWorkspaceJobs', () => {
    it('filters by CRM tab "favorite"', () => {
      const filters: WorkspaceFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        crmTab: 'favorite',
      };
      const result = filterAndSortWorkspaceJobs(sampleJobs, filters, fixedNow);
      expect(result.jobs.length).toBe(1);
      expect(result.jobs[0].id).toBe(2);
    });

    it('filters by CRM tab "activas" excluding discarded, applied, and >21d jobs', () => {
      const filters: WorkspaceFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        crmTab: 'activas',
        maxAgeDays: 21,
      };
      const result = filterAndSortWorkspaceJobs(sampleJobs, filters, fixedNow);
      const ids = result.jobs.map((j) => j.id);
      expect(ids).toContain(1);
      expect(ids).toContain(2);
      expect(ids).not.toContain(3); // applied by user
      expect(ids).not.toContain(6); // >21 days old (2026-10-10)
      expect(ids).not.toContain(5); // discarded by user
      expect(ids).not.toContain(4); // discarded by AI
    });

    it('respects maxAgeDays: 14 antiquity filter', () => {
      const filters: WorkspaceFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        crmTab: 'todas',
        maxAgeDays: 14,
      };
      const result = filterAndSortWorkspaceJobs(sampleJobs, filters, fixedNow);
      const ids = result.jobs.map((j) => j.id);
      expect(ids).toContain(1); // 3d
      expect(ids).toContain(2); // 5d
      expect(ids).toContain(3); // 12d
      expect(ids).not.toContain(6); // >21d
    });

    it('includes 18-day jobs up to the 21-day ceiling while always discarding >21d jobs even when maxAgeDays is null or 60', () => {
      const jobsWith18d: JobSummary[] = [
        ...sampleJobs,
        {
          id: 9,
          deduplication_hash: 'hash-9-18d',
          source: 'linkedin',
          title: 'Practicante Pre Profesional Cloud 18d',
          company: 'Interbank',
          location: 'San Isidro, Lima',
          modality: 'Híbrido',
          url: 'https://ejemplo.pe/interbank-9',
          salary: 'S/. 1,500',
          published_at: null,
          published_date: '2026-10-26', // 18 days old at 2026-11-13
          resolved_brand_key: 'interbank',
          resolved_via_agency: false,
          agency_clue: '',
          sector_hint: 'banca',
          role_level: 'preprofesional',
          is_pre_professional: true,
          is_unrealistic_or_smoke: false,
          final_ranking_score: 80.0,
          user_status: null,
          user_notes: null,
        },
      ];

      const at21 = filterAndSortWorkspaceJobs(
        jobsWith18d,
        { ...DEFAULT_WORKSPACE_FILTERS, crmTab: 'todas', maxAgeDays: 21 },
        fixedNow
      );
      expect(at21.jobs.map((j) => j.id)).toContain(9);
      expect(at21.jobs.map((j) => j.id)).not.toContain(6);

      const atNull = filterAndSortWorkspaceJobs(
        jobsWith18d,
        { ...DEFAULT_WORKSPACE_FILTERS, crmTab: 'todas', maxAgeDays: null },
        fixedNow
      );
      expect(atNull.jobs.map((j) => j.id)).toContain(9);
      expect(atNull.jobs.map((j) => j.id)).not.toContain(6);

      const at60 = filterAndSortWorkspaceJobs(
        jobsWith18d,
        { ...DEFAULT_WORKSPACE_FILTERS, crmTab: 'todas', maxAgeDays: 60 },
        fixedNow
      );
      expect(at60.jobs.map((j) => j.id)).toContain(9);
      expect(at60.jobs.map((j) => j.id)).not.toContain(6);
    });

    it('filters by modality', () => {
      const filters: WorkspaceFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        crmTab: 'todas',
        maxAgeDays: 60,
        modalities: ['Remoto'],
      };
      const result = filterAndSortWorkspaceJobs(sampleJobs, filters, fixedNow);
      expect(result.jobs.length).toBe(1);
      expect(result.jobs[0].id).toBe(2);
      expect(result.jobs[0].modality).toBe('Remoto');
    });

    it('retains "No especificado" and null modality jobs under default filters and excludes them when narrowed', () => {
      const jobsWithUnspecified: JobSummary[] = [
        ...sampleJobs,
        {
          id: 7,
          deduplication_hash: 'hash-7',
          source: 'computrabajo',
          title: 'Practicante de Sistemas Sin Modalidad',
          company: 'Empresa Test 1',
          location: 'Lima, Perú',
          modality: 'No especificado',
          url: 'https://ejemplo.pe/test-7',
          salary: null,
          published_at: null,
          published_date: '2026-11-11',
          resolved_brand_key: null,
          resolved_via_agency: false,
          agency_clue: '',
          sector_hint: null,
          role_level: 'preprofesional',
          is_pre_professional: true,
          is_unrealistic_or_smoke: false,
          final_ranking_score: 75.0,
          user_status: null,
          user_notes: null,
        },
        {
          id: 8,
          deduplication_hash: 'hash-8',
          source: 'computrabajo',
          title: 'Practicante de Sistemas Modalidad Null',
          company: 'Empresa Test 2',
          location: 'Lima, Perú',
          modality: null as any,
          url: 'https://ejemplo.pe/test-8',
          salary: null,
          published_at: null,
          published_date: '2026-11-11',
          resolved_brand_key: null,
          resolved_via_agency: false,
          agency_clue: '',
          sector_hint: null,
          role_level: 'preprofesional',
          is_pre_professional: true,
          is_unrealistic_or_smoke: false,
          final_ranking_score: 74.0,
          user_status: null,
          user_notes: null,
        },
      ];

      // (a) Under default filters (['Híbrido', 'Presencial', 'Remoto']), unspecified & null remain visible
      const defaultFilters: WorkspaceFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        crmTab: 'todas',
      };
      const defaultResult = filterAndSortWorkspaceJobs(jobsWithUnspecified, defaultFilters, fixedNow);
      const defaultIds = defaultResult.jobs.map((j) => j.id);
      expect(defaultIds).toContain(7);
      expect(defaultIds).toContain(8);

      // (b) When narrowed to ['Remoto'], unspecified & null are excluded cleanly
      const narrowedFilters: WorkspaceFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        crmTab: 'todas',
        modalities: ['Remoto'],
      };
      const narrowedResult = filterAndSortWorkspaceJobs(jobsWithUnspecified, narrowedFilters, fixedNow);
      const narrowedIds = narrowedResult.jobs.map((j) => j.id);
      expect(narrowedIds).toContain(2); // Job 2 is Remoto
      expect(narrowedIds).not.toContain(7); // 'No especificado' excluded
      expect(narrowedIds).not.toContain(8); // null excluded
    });

    it('filters by minimum score', () => {
      const filters: WorkspaceFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        crmTab: 'todas',
        maxAgeDays: 60,
        minScore: 85,
      };
      const result = filterAndSortWorkspaceJobs(sampleJobs, filters, fixedNow);
      const scores = result.jobs.map((j) => j.final_ranking_score);
      scores.forEach((score) => expect(score).toBeGreaterThanOrEqual(85));
    });

    it('integrates smart search with brand resolution and typo chips', () => {
      const filters: WorkspaceFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        crmTab: 'todas',
        maxAgeDays: 60,
        search: 'phyton', // Typo for python
      };
      const result = filterAndSortWorkspaceJobs(sampleJobs, filters, fixedNow);
      expect(result.jobs.length).toBeGreaterThan(0);
      expect(result.jobs[0].id).toBe(3); // Belcorp python job
      expect(result.correctedQuery).toBe('python');
    });

    it('sorts by modality priority (Híbrido > Presencial > Remoto) then recency', () => {
      const filters: WorkspaceFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        crmTab: 'todas',
        maxAgeDays: 60,
        sortBy: 'modality_score',
      };
      const result = filterAndSortWorkspaceJobs(sampleJobs, filters, fixedNow);
      expect(result.jobs[0].modality).toBe('Híbrido');
      expect(result.jobs[0].id).toBe(1); // Most recent Híbrido job (BCP 2026-11-10)
    });

    it('falls back to descending recency when legacy sortBy is "score"', () => {
      const filters: WorkspaceFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        crmTab: 'todas',
        maxAgeDays: 60,
        sortBy: 'score',
      };
      const result = filterAndSortWorkspaceJobs(sampleJobs, filters, fixedNow);
      const timestamps = result.jobs.map((j) =>
        new Date(j.published_at || j.published_date || 0).getTime()
      );
      for (let i = 0; i < timestamps.length - 1; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i + 1]);
      }
    });
  });

  describe('6. rollbackJobTransition', () => {
    it('restores previous CRM status and notes upon server failure', () => {
      const original = sampleJobs[0];
      const mutated = applyOptimisticCrmTransition(sampleJobs, original.id, 'applied', 'Nueva nota');

      expect(mutated.find((j) => j.id === original.id)?.user_status).toBe('applied');

      const restored = rollbackJobTransition(mutated, original.id, {
        user_status: original.user_status,
        applied_at: original.applied_at,
        user_notes: original.user_notes,
      });

      const target = restored.find((j) => j.id === original.id);
      expect(target?.user_status).toBeNull();
      expect(target?.applied_at).toBeNull();
      expect(target?.user_notes).toBeNull();
    });
  });

  describe('7. sanitizeNextPath open redirect prevention', () => {
    it('allows safe relative paths', () => {
      expect(sanitizeNextPath('/pipeline')).toBe('/pipeline');
      expect(sanitizeNextPath('/profile?tab=saved#details')).toBe('/profile?tab=saved#details');
      expect(sanitizeNextPath('/')).toBe('/');
      expect(sanitizeNextPath('/jobs/123')).toBe('/jobs/123');
    });

    it('rejects backslash bypass vectors like /\\evil.com or \\\\evil.com', () => {
      expect(sanitizeNextPath('/\\evil.com')).toBe('/');
      expect(sanitizeNextPath('/\\/evil.com')).toBe('/');
      expect(sanitizeNextPath('\\evil.com')).toBe('/');
      expect(sanitizeNextPath('/test\\evil.com')).toBe('/');
    });

    it('rejects double leading slashes //evil.com', () => {
      expect(sanitizeNextPath('//evil.com')).toBe('/');
      expect(sanitizeNextPath('///evil.com')).toBe('/');
      expect(sanitizeNextPath('//')).toBe('/');
    });

    it('rejects external absolute URLs and schemes', () => {
      expect(sanitizeNextPath('https://evil.com')).toBe('/');
      expect(sanitizeNextPath('http://evil.com/phish')).toBe('/');
      expect(sanitizeNextPath('javascript:alert(1)')).toBe('/');
      expect(sanitizeNextPath('data:text/html,evil')).toBe('/');
    });

    it('handles null, undefined, empty string and whitespace cleanly', () => {
      expect(sanitizeNextPath(null)).toBe('/');
      expect(sanitizeNextPath(undefined)).toBe('/');
      expect(sanitizeNextPath('')).toBe('/');
      expect(sanitizeNextPath('   ')).toBe('/');
    });

    it('uses custom fallback when provided', () => {
      expect(sanitizeNextPath('//evil.com', '/fallback')).toBe('/fallback');
      expect(sanitizeNextPath(null, '/login')).toBe('/login');
    });
  });

  describe('8. DEFAULT_WORKSPACE_FILTERS Invariants', () => {
    it('sets expected initial values for phase 1 filter redesign', () => {
      expect(DEFAULT_WORKSPACE_FILTERS.excludedDistricts).toEqual([]);
      expect(DEFAULT_WORKSPACE_FILTERS.includedDistricts).toEqual([]);
      expect(DEFAULT_WORKSPACE_FILTERS.keepRemoteWhenDistrictFiltered).toBe(true);
      expect(DEFAULT_WORKSPACE_FILTERS.includeLimaUnspecifiedDistrict).toBe(false);
      expect(DEFAULT_WORKSPACE_FILTERS.roleLevels).toEqual(['preprofesional']);
      expect(DEFAULT_WORKSPACE_FILTERS.salaryFilter).toBe('any');
      expect(DEFAULT_WORKSPACE_FILTERS.englishOnly).toBe(false);
      expect(DEFAULT_WORKSPACE_FILTERS.englishLevels).toEqual([]);
      expect(DEFAULT_WORKSPACE_FILTERS.categories).toEqual([]);
      expect(DEFAULT_WORKSPACE_FILTERS.selectedJobId).toBeNull();
    });
  });

  describe('9. District Inclusion, Exclusion & CRM Tab Precedence', () => {
    const districtTestJobs: JobSummary[] = [
      {
        id: 101,
        deduplication_hash: 'd-101',
        source: 'computrabajo',
        title: 'Practicante de Sistemas',
        company: 'Fábrica Ate',
        location: 'Ate, Lima',
        modality: 'Presencial',
        url: 'https://ejemplo.pe/ate-101',
        salary: 'S/. 1,200',
        published_at: null,
        published_date: '2026-11-12',
        resolved_brand_key: null,
        resolved_via_agency: false,
        agency_clue: '',
        sector_hint: null,
        role_level: 'preprofesional',
        is_pre_professional: true,
        user_status: null,
      },
      {
        id: 102,
        deduplication_hash: 'd-102',
        source: 'computrabajo',
        title: 'Practicante de TI Guardado en Ate',
        company: 'Empresa Ate Guardada',
        location: 'Ate, Lima',
        modality: 'Presencial',
        url: 'https://ejemplo.pe/ate-102',
        salary: 'S/. 1,300',
        published_at: null,
        published_date: '2026-11-12',
        resolved_brand_key: null,
        resolved_via_agency: false,
        agency_clue: '',
        sector_hint: null,
        role_level: 'preprofesional',
        is_pre_professional: true,
        user_status: 'to_apply',
      },
      {
        id: 103,
        deduplication_hash: 'd-103',
        source: 'computrabajo',
        title: 'Practicante de Datos San Isidro',
        company: 'Corporativo San Isidro',
        location: 'San Isidro, Lima',
        modality: 'Presencial',
        url: 'https://ejemplo.pe/si-103',
        salary: 'S/. 1,500',
        published_at: null,
        published_date: '2026-11-12',
        resolved_brand_key: null,
        resolved_via_agency: false,
        agency_clue: '',
        sector_hint: null,
        role_level: 'preprofesional',
        is_pre_professional: true,
        user_status: null,
      },
      {
        id: 104,
        deduplication_hash: 'd-104',
        source: 'computrabajo',
        title: 'Practicante Remoto 100%',
        company: 'Tech Remoto SAC',
        location: 'Remoto',
        modality: 'Remoto',
        url: 'https://ejemplo.pe/rem-104',
        salary: 'S/. 1,400',
        published_at: null,
        published_date: '2026-11-12',
        resolved_brand_key: null,
        resolved_via_agency: false,
        agency_clue: '',
        sector_hint: null,
        role_level: 'preprofesional',
        is_pre_professional: true,
        user_status: null,
      },
      {
        id: 105,
        deduplication_hash: 'd-105',
        source: 'computrabajo',
        title: 'Practicante Lima Metropolitana Sin Distrito',
        company: 'Empresa Lima General',
        location: 'Lima, Perú',
        modality: 'Presencial',
        url: 'https://ejemplo.pe/lima-105',
        salary: 'S/. 1,130',
        published_at: null,
        published_date: '2026-11-12',
        resolved_brand_key: null,
        resolved_via_agency: false,
        agency_clue: '',
        sector_hint: null,
        role_level: 'preprofesional',
        is_pre_professional: true,
        user_status: null,
      },
    ];

    it('includes all districts including Ate by default in activas and todas tabs', () => {
      const filters: WorkspaceFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        crmTab: 'todas',
      };
      const result = filterAndSortWorkspaceJobs(districtTestJobs, filters, fixedNow);
      const ids = result.jobs.map((j) => j.id);

      expect(ids).toContain(101);
      expect(ids).toContain(102);
      expect(ids).toContain(103);
      expect(ids).toContain(104);
      expect(ids).toContain(105);
    });

    it('excludes Ate jobs when Ate is explicitly excluded in activas and todas tabs', () => {
      const filters: WorkspaceFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        crmTab: 'todas',
        excludedDistricts: ['Ate'],
      };
      const result = filterAndSortWorkspaceJobs(districtTestJobs, filters, fixedNow);
      const ids = result.jobs.map((j) => j.id);

      expect(ids).not.toContain(101); // untracked Ate job excluded
      expect(ids).not.toContain(102); // tracked Ate job excluded from generic todas tab
      expect(ids).toContain(103); // San Isidro
      expect(ids).toContain(104); // Remoto
      expect(ids).toContain(105); // Lima Metropolitana
    });

    it('preserves Ate jobs when viewed inside their explicit CRM tab (e.g. to_apply)', () => {
      const filters: WorkspaceFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        crmTab: 'to_apply',
      };
      const result = filterAndSortWorkspaceJobs(districtTestJobs, filters, fixedNow);
      const ids = result.jobs.map((j) => j.id);

      expect(ids).toContain(102); // Tracked Ate job stays visible in to_apply tab!
    });

    it('keeps Remoto when keepRemoteWhenDistrictFiltered is true, drops Remoto when false', () => {
      const withRemote: WorkspaceFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        crmTab: 'todas',
        includedDistricts: ['San Isidro'],
        keepRemoteWhenDistrictFiltered: true,
      };
      const resWithRemote = filterAndSortWorkspaceJobs(districtTestJobs, withRemote, fixedNow);
      const idsWithRemote = resWithRemote.jobs.map((j) => j.id);
      expect(idsWithRemote).toContain(103); // San Isidro
      expect(idsWithRemote).toContain(104); // Remoto kept!

      const withoutRemote: WorkspaceFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        crmTab: 'todas',
        includedDistricts: ['San Isidro'],
        keepRemoteWhenDistrictFiltered: false,
      };
      const resWithoutRemote = filterAndSortWorkspaceJobs(districtTestJobs, withoutRemote, fixedNow);
      const idsWithoutRemote = resWithoutRemote.jobs.map((j) => j.id);
      expect(idsWithoutRemote).toContain(103); // San Isidro
      expect(idsWithoutRemote).not.toContain(104); // Remoto dropped!
    });

    it('drops Lima Metropolitana unless includeLimaUnspecifiedDistrict is true', () => {
      const withoutLimaUnspecified: WorkspaceFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        crmTab: 'todas',
        includedDistricts: ['San Isidro'],
        keepRemoteWhenDistrictFiltered: false,
        includeLimaUnspecifiedDistrict: false,
      };
      const res1 = filterAndSortWorkspaceJobs(districtTestJobs, withoutLimaUnspecified, fixedNow);
      expect(res1.jobs.map((j) => j.id)).not.toContain(105);

      const withLimaUnspecified: WorkspaceFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        crmTab: 'todas',
        includedDistricts: ['San Isidro'],
        keepRemoteWhenDistrictFiltered: false,
        includeLimaUnspecifiedDistrict: true,
      };
      const res2 = filterAndSortWorkspaceJobs(districtTestJobs, withLimaUnspecified, fixedNow);
      expect(res2.jobs.map((j) => j.id)).toContain(105);
    });

    it('gives exclusion precedence over inclusion if a district is in both', () => {
      const conflictFilters: WorkspaceFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        crmTab: 'todas',
        includedDistricts: ['San Isidro'],
        excludedDistricts: ['San Isidro'],
      };
      const result = filterAndSortWorkspaceJobs(districtTestJobs, conflictFilters, fixedNow);
      expect(result.jobs.map((j) => j.id)).not.toContain(103);
    });
  });

  describe('10. isJobEligibleForRoleLevels & Role Decoupling', () => {
    const juniorJob: JobSummary = {
      id: 201,
      deduplication_hash: 'r-201',
      source: 'linkedin',
      title: 'Trainee de Desarrollo Frontend',
      company: 'Tech Start',
      location: 'Miraflores, Lima',
      modality: 'Híbrido',
      url: 'https://ejemplo.pe/tj-201',
      salary: null,
      published_at: null,
      published_date: '2026-11-12',
      resolved_brand_key: null,
      resolved_via_agency: false,
      agency_clue: '',
      sector_hint: null,
      is_pre_professional: false,
      is_unrealistic_or_smoke: false,
    };

    const profesionalJob: JobSummary = {
      id: 202,
      deduplication_hash: 'r-202',
      source: 'linkedin',
      title: 'Analista de Sistemas Semi Senior',
      company: 'Corp TI',
      location: 'San Isidro, Lima',
      modality: 'Presencial',
      url: 'https://ejemplo.pe/prof-202',
      salary: 'S/. 3,500',
      published_at: null,
      published_date: '2026-11-12',
      resolved_brand_key: null,
      resolved_via_agency: false,
      agency_clue: '',
      sector_hint: null,
      is_pre_professional: false,
      is_unrealistic_or_smoke: false,
    };

    const smokeJob: JobSummary = {
      id: 203,
      deduplication_hash: 'r-203',
      source: 'linkedin',
      title: 'Practicante con 10 años experiencia en Rust',
      company: 'Fake Corp',
      location: 'San Isidro, Lima',
      modality: 'Presencial',
      url: 'https://ejemplo.pe/smoke-203',
      salary: 'S/. 1,000',
      published_at: null,
      published_date: '2026-11-12',
      resolved_brand_key: null,
      resolved_via_agency: false,
      agency_clue: '',
      sector_hint: null,
      role_level: 'preprofesional',
      is_pre_professional: true,
      is_unrealistic_or_smoke: true,
    };

    const unknownJobNotPre: JobSummary = {
      id: 204,
      deduplication_hash: 'r-204',
      source: 'linkedin',
      title: 'Colaborador General Operaciones',
      company: 'Empresa X',
      location: 'San Isidro, Lima',
      modality: 'Presencial',
      url: 'https://ejemplo.pe/unk-204',
      salary: null,
      published_at: null,
      published_date: '2026-11-12',
      resolved_brand_key: null,
      resolved_via_agency: false,
      agency_clue: '',
      sector_hint: null,
      role_level: 'unknown',
      is_pre_professional: false,
      is_unrealistic_or_smoke: false,
    };

    it('returns trainee_junior job when selected without requiring includeDiscardedAi', () => {
      expect(isJobEligibleForRoleLevels(juniorJob, ['trainee_junior'], false)).toBe(true);
      expect(isJobEligibleForRoleLevels(juniorJob, ['preprofesional'], false)).toBe(false);
    });

    it('returns profesional job when selected without requiring includeDiscardedAi', () => {
      expect(isJobEligibleForRoleLevels(profesionalJob, ['profesional'], false)).toBe(true);
      expect(isJobEligibleForRoleLevels(profesionalJob, ['preprofesional'], false)).toBe(false);
    });

    it('always hides smoke jobs unless includeDiscardedAi is true', () => {
      expect(isJobEligibleForRoleLevels(smokeJob, ['preprofesional'], false)).toBe(false);
      expect(isJobEligibleForRoleLevels(smokeJob, ['preprofesional'], true)).toBe(true);
      expect(isJobEligibleForRoleLevels(smokeJob, [], false)).toBe(false);
      expect(isJobEligibleForRoleLevels(smokeJob, [], true)).toBe(true);
    });

    it('strictly excludes unknown role_level from preprofesional even when includeDiscardedAi is true, allowing unknown only when roleLevels is empty', () => {
      expect(isJobEligibleForRoleLevels(unknownJobNotPre, ['preprofesional'], false)).toBe(false);
      expect(isJobEligibleForRoleLevels(unknownJobNotPre, ['preprofesional'], true)).toBe(false);
      expect(isJobEligibleForRoleLevels(unknownJobNotPre, [], false)).toBe(true);
    });

    it('allows all non-smoke levels when roleLevels is empty', () => {
      expect(isJobEligibleForRoleLevels(juniorJob, [], false)).toBe(true);
      expect(isJobEligibleForRoleLevels(profesionalJob, [], false)).toBe(true);
      expect(isJobEligibleForRoleLevels(smokeJob, [], false)).toBe(false);
    });
  });

  describe('11. Salary and English Filtering', () => {
    const salaryEnglishJobs: JobSummary[] = [
      {
        id: 301,
        deduplication_hash: 'se-301',
        source: 'computrabajo',
        title: 'Practicante Pre Profesional Bilingüe',
        company: 'Multinacional',
        location: 'San Isidro, Lima',
        modality: 'Híbrido',
        url: 'https://ejemplo.pe/se-301',
        salary: 'S/. 2,200',
        published_at: null,
        published_date: '2026-11-12',
        resolved_brand_key: null,
        resolved_via_agency: false,
        agency_clue: '',
        sector_hint: null,
        english_required: true,
        english_level: 'avanzado',
        salary_min: 2200,
        salary_max: 2200,
      },
      {
        id: 302,
        deduplication_hash: 'se-302',
        source: 'computrabajo',
        title: 'Practicante Pre Profesional de Finanzas',
        company: 'Banco Local',
        location: 'Miraflores, Lima',
        modality: 'Presencial',
        url: 'https://ejemplo.pe/se-302',
        salary: 'S/. 1,300',
        published_at: null,
        published_date: '2026-11-12',
        resolved_brand_key: null,
        resolved_via_agency: false,
        agency_clue: '',
        sector_hint: null,
        english_required: false,
        english_level: null,
        salary_min: 1300,
        salary_max: 1300,
      },
      {
        id: 303,
        deduplication_hash: 'se-303',
        source: 'computrabajo',
        title: 'Practicante Pre Profesional General',
        company: 'Empresa Sin Sueldo',
        location: 'San Borja, Lima',
        modality: 'Presencial',
        url: 'https://ejemplo.pe/se-303',
        salary: null,
        published_at: null,
        published_date: '2026-11-12',
        resolved_brand_key: null,
        resolved_via_agency: false,
        agency_clue: '',
        sector_hint: null,
        english_required: false,
        english_level: null,
        salary_min: null,
        salary_max: null,
      },
    ];

    it('filters by salaryFilter: has_salary, gte_1130, gte_1500, gte_2000', () => {
      const fHasSalary: WorkspaceFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        crmTab: 'todas',
        salaryFilter: 'has_salary',
      };
      const resHas = filterAndSortWorkspaceJobs(salaryEnglishJobs, fHasSalary, fixedNow);
      expect(resHas.jobs.map((j) => j.id)).toEqual([301, 302]);

      const f1500: WorkspaceFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        crmTab: 'todas',
        salaryFilter: 'gte_1500',
      };
      const res1500 = filterAndSortWorkspaceJobs(salaryEnglishJobs, f1500, fixedNow);
      expect(res1500.jobs.map((j) => j.id)).toEqual([301]);

      const f2000: WorkspaceFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        crmTab: 'todas',
        salaryFilter: 'gte_2000',
      };
      const res2000 = filterAndSortWorkspaceJobs(salaryEnglishJobs, f2000, fixedNow);
      expect(res2000.jobs.map((j) => j.id)).toEqual([301]);
    });

    it('filters by englishOnly and englishLevels', () => {
      const fEngOnly: WorkspaceFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        crmTab: 'todas',
        englishOnly: true,
      };
      const resEng = filterAndSortWorkspaceJobs(salaryEnglishJobs, fEngOnly, fixedNow);
      expect(resEng.jobs.map((j) => j.id)).toEqual([301]);

      const fEngLvl: WorkspaceFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        crmTab: 'todas',
        englishLevels: ['avanzado'],
      };
      const resLvl = filterAndSortWorkspaceJobs(salaryEnglishJobs, fEngLvl, fixedNow);
      expect(resLvl.jobs.map((j) => j.id)).toEqual([301]);
    });
  });

  describe('12. Live Facet Counts (Districts & Categories)', () => {
    const facetJobs: JobSummary[] = [
      {
        id: 401,
        deduplication_hash: 'f-401',
        source: 'computrabajo',
        title: 'Practicante Pre Profesional de Sistemas',
        company: 'Tech A',
        location: 'San Isidro, Lima',
        modality: 'Presencial',
        url: 'https://ejemplo.pe/f-401',
        salary: 'S/. 1,500',
        published_at: null,
        published_date: '2026-11-12',
        resolved_brand_key: null,
        resolved_via_agency: false,
        agency_clue: '',
        sector_hint: null,
        district: 'San Isidro',
        category: 'Sistemas & TI',
        role_level: 'preprofesional',
      },
      {
        id: 402,
        deduplication_hash: 'f-402',
        source: 'computrabajo',
        title: 'Practicante Pre Profesional de Datos',
        company: 'Data B',
        location: 'San Isidro, Lima',
        modality: 'Presencial',
        url: 'https://ejemplo.pe/f-402',
        salary: 'S/. 1,500',
        published_at: null,
        published_date: '2026-11-12',
        resolved_brand_key: null,
        resolved_via_agency: false,
        agency_clue: '',
        sector_hint: null,
        district: 'San Isidro',
        category: 'Datos, BI & IA',
        role_level: 'preprofesional',
      },
      {
        id: 403,
        deduplication_hash: 'f-403',
        source: 'computrabajo',
        title: 'Practicante Pre Profesional de Finanzas',
        company: 'Banco C',
        location: 'Miraflores, Lima',
        modality: 'Presencial',
        url: 'https://ejemplo.pe/f-403',
        salary: 'S/. 1,500',
        published_at: null,
        published_date: '2026-11-12',
        resolved_brand_key: null,
        resolved_via_agency: false,
        agency_clue: '',
        sector_hint: null,
        district: 'Miraflores',
        category: 'Administración, Banca & Finanzas',
        role_level: 'preprofesional',
      },
    ];

    it('computes district facet counts over pool before district inclusion/exclusion', () => {
      const filters: WorkspaceFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        crmTab: 'todas',
        includedDistricts: ['Miraflores'], // Even if filtered to Miraflores, district counts see both
      };
      const counts = computeDistrictFacetCounts(facetJobs, filters, fixedNow);
      expect(counts['San Isidro']).toBe(2);
      expect(counts['Miraflores']).toBe(1);
    });

    it('computes category facet counts over pool before category filtering', () => {
      const filters: WorkspaceFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        crmTab: 'todas',
        categories: ['Datos, BI & IA'], // Even if filtered to Datos, BI & IA, counts see other categories
      };
      const counts = computeCategoryFacetCounts(facetJobs, filters, fixedNow);
      expect(counts['Sistemas & TI']).toBe(1);
      expect(counts['Datos, BI & IA']).toBe(1);
      expect(counts['Administración, Banca & Finanzas']).toBe(1);
    });
  });

  describe('13. resolveJobNormalizedMeta fast-path & lazy fallback', () => {
    it('uses pre-populated DB fields directly without calling normalizeJobMetadata', () => {
      const spy = vi.spyOn(jobNormalization, 'normalizeJobMetadata');
      const populatedJob: JobSummary = {
        id: 999,
        deduplication_hash: 'pop-999',
        source: 'computrabajo',
        title: 'Practicante de Sistemas',
        company: 'Empresa',
        location: 'San Isidro, Lima',
        modality: 'Presencial',
        url: 'https://ejemplo.pe/999',
        salary: 'S/. 1,500',
        published_at: null,
        published_date: '2026-11-12',
        resolved_brand_key: null,
        resolved_via_agency: false,
        agency_clue: '',
        sector_hint: null,
        district: 'San Isidro',
        lima_zone: 'Lima Moderna',
        category: 'Sistemas & TI',
        role_level: 'preprofesional',
        english_required: true,
        english_level: 'intermedio',
        salary_min: 1500,
        salary_max: 1500,
      };

      const meta = resolveJobNormalizedMeta(populatedJob);
      expect(meta.district).toBe('San Isidro');
      expect(meta.lima_zone).toBe('Lima Moderna');
      expect(meta.category).toBe('Sistemas & TI');
      expect(meta.role_level).toBe('preprofesional');
      expect(meta.english_required).toBe(true);
      expect(meta.english_level).toBe('intermedio');
      expect(meta.salary_min).toBe(1500);
      expect(meta.salary_max).toBe(1500);

      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('falls back to normalizeJobMetadata lazily when normalized fields are missing', () => {
      const spy = vi.spyOn(jobNormalization, 'normalizeJobMetadata');
      const unpopulatedJob: JobSummary = {
        id: 1000,
        deduplication_hash: 'unpop-1000',
        source: 'computrabajo',
        title: 'Practicante Pre Profesional de Base de Datos',
        company: 'Empresa',
        location: 'Miraflores, Lima',
        modality: 'Híbrido',
        url: 'https://ejemplo.pe/1000',
        salary: 'S/. 1,800',
        published_at: null,
        published_date: '2026-11-12',
        resolved_brand_key: null,
        resolved_via_agency: false,
        agency_clue: '',
        sector_hint: null,
      };

      const meta = resolveJobNormalizedMeta(unpopulatedJob);
      expect(meta.district).toBe('Miraflores');
      expect(meta.lima_zone).toBe('Lima Moderna');
      expect(meta.role_level).toBe('preprofesional');
      expect(meta.salary_min).toBe(1800);
      expect(meta.salary_max).toBe(1800);

      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });

    it('isJobEligibleForRoleLevels uses pre-populated role_level directly without calling normalizeJobMetadata', () => {
      const spy = vi.spyOn(jobNormalization, 'normalizeJobMetadata');
      const populatedJob: JobSummary = {
        id: 1001,
        deduplication_hash: 'pop-1001',
        source: 'computrabajo',
        title: 'Analista Semi Senior',
        company: 'Empresa',
        location: 'San Isidro',
        modality: 'Presencial',
        url: 'https://ejemplo.pe/1001',
        salary: null,
        published_at: null,
        published_date: '2026-11-12',
        resolved_brand_key: null,
        resolved_via_agency: false,
        agency_clue: '',
        sector_hint: null,
        role_level: 'profesional',
        is_unrealistic_or_smoke: false,
      };

      const eligible = isJobEligibleForRoleLevels(populatedJob, ['profesional'], false);
      expect(eligible).toBe(true);
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('excludes DB-flagged off_career_filter rows even when includeDiscardedAi is true unless user_status exists', () => {
      const offCareerJob: JobSummary = {
        id: 1002,
        deduplication_hash: 'off-1002',
        source: 'computrabajo',
        title: 'Practicante de Creación de contenidos digitales con Inteligencia Artificial',
        company: 'Biznes Sac',
        location: 'La Victoria, Lima',
        modality: 'Híbrido',
        url: 'https://ejemplo.pe/1002',
        salary: null,
        published_at: null,
        published_date: '2026-11-12',
        resolved_brand_key: null,
        resolved_via_agency: false,
        agency_clue: '',
        sector_hint: null,
        role_level: 'unknown',
        is_pre_professional: false,
        is_unrealistic_or_smoke: true,
        engine: 'off_career_filter',
      };
      const trackedLegacyJob: JobSummary = {
        ...offCareerJob,
        id: 1003,
        deduplication_hash: 'off-1003',
        user_status: 'to_apply',
      };

      const resAllRoles = filterAndSortWorkspaceJobs(
        [offCareerJob, trackedLegacyJob],
        {
          ...DEFAULT_WORKSPACE_FILTERS,
          crmTab: 'todas',
          roleLevels: [],
          includeDiscardedAi: true,
        },
        fixedNow
      );
      expect(resAllRoles.jobs.map((j) => j.id)).toEqual([1003]);

      const counts = computeCrmCounts([offCareerJob, trackedLegacyJob], {
        includeDiscardedAi: true,
      });
      expect(counts.todas).toBe(1);
      expect(counts.to_apply).toBe(1);
    });
  });

  describe('mergeServerJobsWithPendingCrm', () => {
    it('preserves in-flight and recently settled applied status against stale router.refresh initialJobs', () => {
      const overrides = new Map<string, PendingCrmOverride>([
        [
          '1',
          {
            seq: 1,
            status: 'applied',
            applied_at: '2026-11-16T08:00:00.000Z',
            user_notes: null,
            settledAt: null,
          },
        ],
        [
          '2',
          {
            seq: 1,
            status: 'applied',
            applied_at: '2026-11-16T08:00:05.000Z',
            user_notes: 'Postulé en portal',
            settledAt: 100_000,
          },
        ],
      ]);

      const staleServerJobs: JobSummary[] = sampleJobs.slice(0, 2).map((j) => ({
        ...j,
        user_status: null,
        applied_at: null,
        user_notes: null,
      }));

      const merged = mergeServerJobsWithPendingCrm(
        staleServerJobs,
        overrides,
        100_000 + 3_000
      );

      expect(merged[0].user_status).toBe('applied');
      expect(merged[0].applied_at).toBe('2026-11-16T08:00:00.000Z');
      expect(merged[1].user_status).toBe('applied');
      expect(merged[1].user_notes).toBe('Postulé en portal');
      expect(overrides.has('2')).toBe(true);
    });

    it('clears settled override once serverJobs catches up or TTL expires', () => {
      const overrides = new Map<string, PendingCrmOverride>([
        [
          '1',
          {
            seq: 1,
            status: 'applied',
            applied_at: '2026-11-16T08:00:00.000Z',
            user_notes: null,
            settledAt: 100_000,
          },
        ],
        [
          '2',
          {
            seq: 1,
            status: 'favorite',
            applied_at: null,
            user_notes: null,
            settledAt: 100_000,
          },
        ],
      ]);

      const serverJobsWithSyncedJob1: JobSummary[] = [
        {
          ...sampleJobs[0],
          user_status: 'applied',
          applied_at: '2026-11-16T08:00:00.000Z',
          user_notes: null,
        },
        {
          ...sampleJobs[1],
          user_status: null,
          applied_at: null,
          user_notes: null,
        },
      ];

      // Before TTL: job 1 clears because server caught up; job 2 preserves override
      const mergedEarly = mergeServerJobsWithPendingCrm(
        serverJobsWithSyncedJob1,
        overrides,
        100_000 + 2_000
      );
      expect(mergedEarly[0].user_status).toBe('applied');
      expect(overrides.has('1')).toBe(false);
      expect(mergedEarly[1].user_status).toBe('favorite');
      expect(overrides.has('2')).toBe(true);

      // After TTL: expired override on job 2 drops cleanly
      const mergedLate = mergeServerJobsWithPendingCrm(
        serverJobsWithSyncedJob1,
        overrides,
        100_000 + RECENT_CRM_OVERRIDE_TTL_MS + 1
      );
      expect(mergedLate[1].user_status).toBeNull();
      expect(overrides.has('2')).toBe(false);
    });
  });

  describe('14. Nuevas de hoy, selection-order sorting, and return to Activas', () => {
    it('detects isJobNewToday from published_date or created_at and filters maxAgeDays: 0', () => {
      const todayNow = new Date('2026-11-17T12:00:00.000Z');
      const todayJobByPub: JobSummary = {
        ...sampleJobs[0],
        id: 501,
        deduplication_hash: 'today-pub',
        published_date: '2026-11-17',
        created_at: '2026-11-16T18:00:00Z',
        user_status: null,
      };
      const todayJobByCreated: JobSummary = {
        ...sampleJobs[0],
        id: 502,
        deduplication_hash: 'today-created',
        published_date: '2026-11-15',
        created_at: '2026-11-17T11:00:00Z',
        user_status: null,
      };
      const yesterdayJob: JobSummary = {
        ...sampleJobs[0],
        id: 503,
        deduplication_hash: 'yesterday-job',
        published_date: '2026-11-16',
        created_at: '2026-11-16T18:00:00Z',
        user_status: null,
      };

      expect(isJobNewToday(todayJobByPub, todayNow)).toBe(true);
      expect(isJobNewToday(todayJobByCreated, todayNow)).toBe(true);
      expect(isJobNewToday(yesterdayJob, todayNow)).toBe(false);

      const res = filterAndSortWorkspaceJobs(
        [todayJobByPub, todayJobByCreated, yesterdayJob],
        { ...DEFAULT_WORKSPACE_FILTERS, maxAgeDays: 0 },
        todayNow
      );
      expect(res.jobs.map((j) => j.id)).toEqual([501, 502]);
    });

    it('sorts applied and discarded tabs by selection order descending instead of publication date', () => {
      const now = new Date('2026-11-17T12:00:00.000Z');
      const olderPublishedSelectedSecond: JobSummary = {
        ...sampleJobs[0],
        id: 601,
        deduplication_hash: 'sel-older-pub',
        published_date: '2026-11-05',
        user_status: 'applied',
        applied_at: '2026-11-17T19:00:00.000Z',
        status_updated_at: '2026-11-17T19:00:00.000Z',
      };
      const newerPublishedSelectedFirst: JobSummary = {
        ...sampleJobs[0],
        id: 602,
        deduplication_hash: 'sel-newer-pub',
        published_date: '2026-11-16',
        user_status: 'applied',
        applied_at: '2026-11-17T18:00:00.000Z',
        status_updated_at: '2026-11-17T18:00:00.000Z',
      };

      const appliedRes = filterAndSortWorkspaceJobs(
        [newerPublishedSelectedFirst, olderPublishedSelectedSecond],
        { ...DEFAULT_WORKSPACE_FILTERS, crmTab: 'applied' },
        now
      );
      expect(appliedRes.jobs.map((j) => j.id)).toEqual([601, 602]);

      const discardedOlderPubNewerSelect: JobSummary = {
        ...olderPublishedSelectedSecond,
        id: 603,
        deduplication_hash: 'disc-older-pub',
        user_status: 'discarded',
        applied_at: null,
        status_updated_at: '2026-11-17T20:00:00.000Z',
      };
      const discardedNewerPubOlderSelect: JobSummary = {
        ...newerPublishedSelectedFirst,
        id: 604,
        deduplication_hash: 'disc-newer-pub',
        user_status: 'discarded',
        applied_at: null,
        status_updated_at: '2026-11-17T17:00:00.000Z',
      };
      const discardedRes = filterAndSortWorkspaceJobs(
        [discardedNewerPubOlderSelect, discardedOlderPubNewerSelect],
        { ...DEFAULT_WORKSPACE_FILTERS, crmTab: 'discarded' },
        now
      );
      expect(discardedRes.jobs.map((j) => j.id)).toEqual([603, 604]);
    });

    it('restores a job back to Activas when applyOptimisticCrmTransition receives null', () => {
      const applied = applyOptimisticCrmTransition(sampleJobs, 1, 'applied');
      expect(applied.find((j) => j.id === 1)?.user_status).toBe('applied');
      expect(applied.find((j) => j.id === 1)?.status_updated_at).toBeTruthy();

      const restored = applyOptimisticCrmTransition(applied, 1, null);
      const restoredJob = restored.find((j) => j.id === 1);
      expect(restoredJob?.user_status).toBeNull();
      expect(restoredJob?.applied_at).toBeNull();
      expect(restoredJob?.status_updated_at).toBeNull();
    });
  });
});

