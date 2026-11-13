import { describe, it, expect } from 'vitest';
import { JobSummary } from '../src/lib/domain/types';
import {
  WorkspaceFilters,
  DEFAULT_WORKSPACE_FILTERS,
  computeCrmCounts,
  requiresHistoricalQuery,
  canMutateCrm,
  applyOptimisticCrmTransition,
  rollbackJobTransition,
  filterAndSortWorkspaceJobs,
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
    it('accurately counts jobs per CRM tab and excludes AI-discarded by default', () => {
      const counts = computeCrmCounts(sampleJobs);

      // Job 4 is AI discarded (is_pre_professional: false, no user_status), so visible pool has 5 jobs:
      // Job 1 (null status) -> Activa, Todas
      // Job 2 (favorite)    -> Activa, Destacada, Todas
      // Job 3 (applied)     -> Activa, Postulado, Todas
      // Job 5 (discarded)   -> Descartada, Todas
      // Job 6 (to_apply)    -> Activa, Por postular, Todas
      expect(counts.todas).toBe(5);
      expect(counts.activas).toBe(4); // jobs 1, 2, 3, 6 (not discarded by user)
      expect(counts.favorite).toBe(1); // job 2
      expect(counts.applied).toBe(1); // job 3
      expect(counts.to_apply).toBe(1); // job 6
      expect(counts.interview).toBe(0);
      expect(counts.discarded).toBe(1); // job 5
    });

    it('includes AI-discarded jobs when includeDiscardedAi is true', () => {
      const counts = computeCrmCounts(sampleJobs, { includeDiscardedAi: true });
      expect(counts.todas).toBe(6);
      expect(counts.activas).toBe(5);
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

    it('filters by CRM tab "activas" excluding discarded jobs', () => {
      const filters: WorkspaceFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        crmTab: 'activas',
        maxAgeDays: 60, // allow older jobs to test tab logic cleanly
      };
      const result = filterAndSortWorkspaceJobs(sampleJobs, filters, fixedNow);
      const ids = result.jobs.map((j) => j.id);
      expect(ids).toContain(1);
      expect(ids).toContain(2);
      expect(ids).toContain(3);
      expect(ids).toContain(6);
      expect(ids).not.toContain(5); // discarded by user
      expect(ids).not.toContain(4); // discarded by AI
    });

    it('respects default maxAgeDays: 14 antiquity filter', () => {
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
      expect(ids).not.toContain(6); // >30d
    });

    it('includes historical jobs when maxAgeDays is null ("Cualquier fecha")', () => {
      const filters: WorkspaceFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        crmTab: 'todas',
        maxAgeDays: null,
      };
      const result = filterAndSortWorkspaceJobs(sampleJobs, filters, fixedNow);
      const ids = result.jobs.map((j) => j.id);
      expect(ids).toContain(6); // Job from October included!
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

    it('sorts by modality priority (Híbrido > Presencial > Remoto) then score', () => {
      const filters: WorkspaceFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        crmTab: 'todas',
        maxAgeDays: 60,
        sortBy: 'modality_score',
      };
      const result = filterAndSortWorkspaceJobs(sampleJobs, filters, fixedNow);
      expect(result.jobs[0].modality).toBe('Híbrido');
      expect(result.jobs[0].final_ranking_score).toBe(92.5); // BCP job 1
    });

    it('sorts by score descending when sortBy is "score"', () => {
      const filters: WorkspaceFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        crmTab: 'todas',
        maxAgeDays: 60,
        sortBy: 'score',
      };
      const result = filterAndSortWorkspaceJobs(sampleJobs, filters, fixedNow);
      for (let i = 0; i < result.jobs.length - 1; i++) {
        const cur = Number(result.jobs[i].final_ranking_score) || 0;
        const next = Number(result.jobs[i + 1].final_ranking_score) || 0;
        expect(cur).toBeGreaterThanOrEqual(next);
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
});
