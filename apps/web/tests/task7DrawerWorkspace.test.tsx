import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JobDetailDrawer } from '../src/components/jobs/JobDetailDrawer';
import { JobsWorkspace } from '../src/components/jobs/JobsWorkspace';
import { JobSummary, ReasoningChain } from '../src/lib/domain/types';
import {
  DEFAULT_WORKSPACE_FILTERS,
} from '../src/lib/jobs/workspaceState';
import {
  parseFiltersFromSearchParams,
  serializeFiltersToSearchParams,
  reconcileProfileExclusions,
} from '../src/lib/jobs/urlFilterParams';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// Mock Supabase client
vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: () => false,
  createClient: () => ({
    auth: {
      signOut: vi.fn(),
    },
  }),
}));

// Mock Server Actions
vi.mock('@/actions/jobs', () => ({
  getJobDetail: vi.fn().mockResolvedValue({
    rawDescription: 'Descripción de prueba para vacante',
    reasoningChain: {
      academic_eligibility: 'Estudiante de 8vo ciclo en Ingeniería de Sistemas',
      experience_requirements: 'Sin experiencia previa requerida',
      tech_stack_overlap: 'Manejo de Python y SQL al 90%',
      gaps_and_risks: 'Falta experiencia en Docker en producción',
      score_rationale: 'Cumple con el perfil preprofesional solicitado',
    },
  }),
  searchHistoricalJobs: vi.fn().mockResolvedValue({
    jobs: [],
    hasMore: false,
    nextOffset: 40,
    didYouMean: null,
    note: null,
  }),
}));

vi.mock('@/actions/crm', () => ({
  upsertJobState: vi.fn().mockResolvedValue({ ok: true, appliedAt: null }),
}));

describe('Task 7: JobDetailDrawer & Rewired JobsWorkspace', () => {
  const sampleReasoningChain: ReasoningChain = {
    academic_eligibility: 'Estudiante universitario de últimos ciclos en Ingeniería de Software',
    experience_requirements: 'Deseable prácticas previas o proyectos personales demostrables',
    tech_stack_overlap: 'Excelente dominio de React, Next.js, TypeScript y Tailwind CSS',
    gaps_and_risks: 'Falta certificación formal en infraestructura cloud AWS',
    score_rationale: 'Alta afinidad técnica y alineamiento con modalidad híbrida',
  };

  const sampleJob: JobSummary = {
    id: 201,
    deduplication_hash: 'hash-cvmatcher-201',
    source: 'cvmatcher',
    title: 'Practicante de Frontend / UI Engineer',
    company: 'BCP - Banco de Crédito',
    location: 'La Molina, Lima',
    modality: 'Híbrido',
    url: 'https://cvmatcher.pe/jobs/201',
    salary: 'S/ 2,000',
    published_at: '2026-11-12T14:00:00Z',
    published_date: '2026-11-12',
    resolved_brand_key: 'bcp',
    resolved_via_agency: false,
    agency_clue: '',
    sector_hint: 'Banca y Finanzas',
    final_ranking_score: 94,
    technical_match_score: 0.92,
    user_status: 'favorite',
    user_notes: 'Enviada versión CV 2.1 con proyectos Next.js',
    matching_skills: ['React', 'TypeScript', 'Tailwind', 'Next.js'],
    missing_skills: ['AWS CloudWatch', 'Kubernetes'],
    verdict_summary: 'Candidato ideal para el squad de canales digitales con sólido stack moderno.',
    english_required: true,
    english_level: 'intermedio',
    district: 'La Molina',
    lima_zone: 'Lima Este',
    category: 'Tecnología y Sistemas',
    role_level: 'preprofesional',
    salary_min: 1800,
    salary_max: 2200,
  };

  const sampleJob2: JobSummary = {
    id: 202,
    deduplication_hash: 'hash-cvmatcher-202',
    source: 'linkedin',
    title: 'Practicante de Datos y Analítica',
    company: 'Alicorp',
    location: 'Miraflores, Lima',
    modality: 'Remoto',
    url: 'https://pe.linkedin.com/jobs/view/202',
    salary: 'S/ 1,500',
    published_at: '2026-11-11T10:00:00Z',
    published_date: '2026-11-11',
    resolved_brand_key: 'alicorp',
    resolved_via_agency: false,
    agency_clue: '',
    sector_hint: 'Consumo Masivo',
    final_ranking_score: 88,
    user_status: 'to_apply',
    matching_skills: ['SQL', 'Python', 'Power BI'],
    district: 'Miraflores',
    lima_zone: 'Lima Centro',
    category: 'Datos y Analítica',
    role_level: 'preprofesional',
  };

  describe('1. JobDetailDrawer Component', () => {
    it('renders native <dialog> with aria-labelledby and NO redundant role="dialog" or aria-modal="true"', () => {
      const html = renderToStaticMarkup(
        <JobDetailDrawer
          job={sampleJob}
          rawDescription="Descripción de prueba completa"
          reasoningChain={sampleReasoningChain}
          isLoadingDetail={false}
          onClose={() => {}}
          onStatusChange={() => {}}
          onSaveNotes={async () => true}
        />
      );

      // Verify native dialog wrapper
      expect(html).toContain('<dialog');
      expect(html).toContain('id="job-detail-drawer"');
      expect(html).toContain('aria-labelledby="job-drawer-title"');
      expect(html).toContain('class="job-detail-drawer overscroll-contain"');

      // MWG constraint: NO redundant role="dialog" or aria-modal="true"
      expect(html).not.toContain('role="dialog"');
      expect(html).not.toContain('aria-modal');

      // Title must match aria-labelledby
      expect(html).toContain('id="job-drawer-title"');
      expect(html).toContain('Practicante de Frontend / UI Engineer');
    });

    it('renders neutral detected skills and hides personal-CV AI affinity evaluation and CoT accordion', () => {
      const html = renderToStaticMarkup(
        <JobDetailDrawer
          job={sampleJob}
          rawDescription="Descripción de prueba completa para practicante de frontend."
          reasoningChain={sampleReasoningChain}
          isLoadingDetail={false}
          onClose={() => {}}
          onStatusChange={() => {}}
          onSaveNotes={async () => true}
        />
      );

      // Neutral combined detected skills section
      expect(html).toContain('Tecnologías y requisitos detectados');
      expect(html).toContain('React');
      expect(html).toContain('TypeScript');
      expect(html).toContain('AWS CloudWatch');

      // Personal-CV AI evaluation & broken CoT accordion must NOT render
      expect(html).not.toContain('Evaluación de Afinidad IA');
      expect(html).not.toContain('Veredicto del Perfil');
      expect(html).not.toContain('Ver análisis detallado');
      expect(html).not.toContain('Match técnico:');
      expect(html).not.toContain('Habilidades y requisitos que cumples');
      expect(html).not.toContain('Requisitos a reforzar o validar en entrevista');
      expect(html).not.toContain('Fundamento de la puntuación');
    });

    it('renders full job description and shows external notice for login-gated CVMatcher previews', () => {
      const html = renderToStaticMarkup(
        <JobDetailDrawer
          job={sampleJob}
          rawDescription="Resumen corto de CVMatcher..."
          onClose={() => {}}
          onStatusChange={() => {}}
          onSaveNotes={async () => true}
        />
      );

      expect(html).toContain('Descripción completa de la vacante');
      expect(html).toContain('Resumen corto de CVMatcher...');
      expect(html).toContain('Abrir vacante original');
      expect(html).not.toContain('max-h-96 overflow-y-auto');
    });

    it('renders 5-state CRM toolbar with active state aria-pressed="true"', () => {
      const html = renderToStaticMarkup(
        <JobDetailDrawer
          job={sampleJob} // user_status is 'favorite'
          rawDescription="Descripción"
          onClose={() => {}}
          onStatusChange={() => {}}
          onSaveNotes={async () => true}
        />
      );

      expect(html).toContain('role="toolbar"');
      expect(html).toContain('aria-label="Seguimiento de postulación"');

      // Buttons
      expect(html).toContain('Por postular');
      expect(html).toContain('Destacar');
      expect(html).toContain('Postulado');
      expect(html).toContain('Entrevista');
      expect(html).toContain('Descartar');

      // Active state
      expect(html).toContain('aria-pressed="true"');
    });

    it('renders metadata badges: district, zone, category, role level, modality, salary, english', () => {
      const html = renderToStaticMarkup(
        <JobDetailDrawer
          job={sampleJob}
          rawDescription="Desc"
          onClose={() => {}}
          onStatusChange={() => {}}
          onSaveNotes={async () => true}
        />
      );

      expect(html).toContain('La Molina');
      expect(html).toContain('Lima Este');
      expect(html).toContain('Tecnología y Sistemas');
      expect(html).toContain('Preprofesional');
      expect(html).toContain('Híbrido');
      expect(html).toContain('S/ 2,000');
      expect(html).toContain('Inglés (intermedio)');
      expect(html).toContain('Fuente: CVMatcher');
    });

    it('renders Prev and Next buttons with proper disabled states', () => {
      const htmlFirstJob = renderToStaticMarkup(
        <JobDetailDrawer
          job={sampleJob}
          hasPrev={false}
          hasNext={true}
          onPrevJob={() => {}}
          onNextJob={() => {}}
          onClose={() => {}}
          onStatusChange={() => {}}
          onSaveNotes={async () => true}
        />
      );

      expect(htmlFirstJob).toContain('aria-label="Vacante anterior"');
      expect(htmlFirstJob).toContain('aria-label="Siguiente vacante"');
      expect(htmlFirstJob).toContain('disabled=""'); // Prev should be disabled
    });

    it('renders personal notes form with existing notes and submit button', () => {
      const html = renderToStaticMarkup(
        <JobDetailDrawer
          job={sampleJob}
          rawDescription="Desc"
          onClose={() => {}}
          onStatusChange={() => {}}
          onSaveNotes={async () => true}
        />
      );

      expect(html).toContain('Notas personales');
      expect(html).toContain('id="job-personal-notes"');
      expect(html).toContain('Enviada versión CV 2.1 con proyectos Next.js');
      expect(html).toContain('Guardar nota');
    });
  });

  describe('2. JobsWorkspace Component Integration & Layout', () => {
    it('renders full AppShell layout with 296px sticky FilterSidebar and 1fr feed', () => {
      const html = renderToStaticMarkup(
        <JobsWorkspace
          initialJobs={[sampleJob, sampleJob2]}
          user={null}
          lastUpdated="2026-11-13T12:00:00Z"
          isConfigured={true}
        />
      );

      // AppShell and Sidebar
      expect(html).toContain('w-[296px]');
      expect(html).toContain('Radar');
      expect(html).toContain('Mis Postulaciones');

      // CRM Tabs Bar
      expect(html).toContain('Activas');
      expect(html).toContain('Por postular');
      expect(html).toContain('Destacadas');
      expect(html).toContain('Postuladas');
      expect(html).toContain('Entrevista');
      expect(html).toContain('Descartadas');
      expect(html).toContain('Todas');

      // Results count & sort dropdown
      expect(html).toContain('vacantes encontradas');
      expect(html).toContain('Ordenar por:');
      expect(html).toContain('Más recientes');
      expect(html).toContain('Prioridad por modalidad');
      expect(html).not.toContain('Afinidad + Modalidad');
      expect(html).not.toContain('Mayor afinidad');

      // Job cards
      expect(html).toContain('Practicante de Frontend / UI Engineer');
      expect(html).toContain('Practicante de Datos y Analítica');

      // Mobile Filter Dialog
      expect(html).toContain('id="mobile-filter-drawer"');
      expect(html).toContain('Filtros de Búsqueda');
    });

    it('hydrates initialSearchParams deterministically on SSR without mismatch', () => {
      const initialParams = {
        q: 'Frontend',
        tab: 'favorite',
        excl: 'none',
        sort: 'score',
      };

      const parsed = parseFiltersFromSearchParams(initialParams, ['Ate']);
      expect(parsed.filters.search).toBe('Frontend');
      expect(parsed.filters.crmTab).toBe('favorite');
      expect(parsed.filters.excludedDistricts).toEqual([]);
      expect(parsed.hasExplicitExclParam).toBe(true);
      expect(parsed.filters.sortBy).toBe('recent');

      const html = renderToStaticMarkup(
        <JobsWorkspace
          initialJobs={[sampleJob, sampleJob2]}
          user={null}
          lastUpdated={null}
          isConfigured={true}
          initialSearchParams={initialParams}
        />
      );

      // Renders with the search term and active tab
      expect(html).toContain('value="Frontend"');
    });

    it('deep-links to selected job when job param is in searchParams', () => {
      const initialParams = {
        job: '201',
      };

      const html = renderToStaticMarkup(
        <JobsWorkspace
          initialJobs={[sampleJob, sampleJob2]}
          user={null}
          lastUpdated={null}
          isConfigured={true}
          initialSearchParams={initialParams}
        />
      );

      // Drawer should be populated with job 201's details
      expect(html).toContain('id="job-detail-drawer"');
      expect(html).toContain('BCP - Banco de Crédito');
      expect(html).toContain('Practicante de Frontend / UI Engineer');
    });

    it('renders clean empty state with "Restaurar perfil" button when 0 jobs match', () => {
      const html = renderToStaticMarkup(
        <JobsWorkspace
          initialJobs={[]}
          user={null}
          lastUpdated={null}
          isConfigured={true}
        />
      );

      expect(html).toContain('No se encontraron vacantes con los filtros seleccionados');
      expect(html).toContain('Restaurar perfil');
    });
  });

  describe('3. URL Serialization & Exclusions Reconciliation', () => {
    it('serializes excl=none when excludedDistricts is empty', () => {
      const filters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        excludedDistricts: [],
      };

      const params = serializeFiltersToSearchParams(filters, ['Ate']);
      expect(params.get('excl')).toBe('none');
    });

    it('reconcileProfileExclusions preserves excl=none when hasExplicitExclParam is true', () => {
      const filters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        excludedDistricts: [],
      };

      const reconciled = reconcileProfileExclusions(filters, true, ['Ate', 'Comas']);
      // Must NOT snap back to ['Ate', 'Comas']
      expect(reconciled.excludedDistricts).toEqual([]);
    });

    it('reconcileProfileExclusions adopts profile exclusions when hasExplicitExclParam is false', () => {
      const filters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        excludedDistricts: ['Ate'],
      };

      const reconciled = reconcileProfileExclusions(filters, false, ['San Juan de Lurigancho']);
      expect(reconciled.excludedDistricts).toEqual(['San Juan de Lurigancho']);
    });
  });
});
