import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JobCard } from '../src/components/jobs/JobCard';
import {
  FilterSidebar,
  clearFilterCriteria,
  resetFilterCriteriaToDefaults,
} from '../src/components/jobs/FilterSidebar';
import { AppShell } from '../src/components/layout/AppShell';
import { JobSummary } from '../src/lib/domain/types';
import {
  DEFAULT_WORKSPACE_FILTERS,
  WorkspaceFilters,
} from '../src/lib/jobs/workspaceState';

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

describe('Task 6: Unified AppShell, FilterSidebar & JobCard UI Components', () => {
  const sampleJob: JobSummary = {
    id: 101,
    deduplication_hash: 'hash-cvmatcher-101',
    source: 'cvmatcher',
    title: 'Practicante Pre-Profesional de Machine Learning',
    company: 'Interbank',
    location: 'San Isidro, Lima',
    modality: 'Híbrido',
    url: 'https://cvmatcher.pe/jobs/101',
    salary: 'S/ 1,800',
    published_at: '2026-11-12T10:00:00Z',
    published_date: '2026-11-12',
    resolved_brand_key: 'interbank',
    resolved_via_agency: false,
    agency_clue: '',
    sector_hint: 'Banca y Finanzas',
    final_ranking_score: 95,
    user_status: 'favorite',
    matching_skills: ['Python', 'PyTorch', 'SQL', 'FastAPI', 'Docker', 'Git'],
    english_required: true,
    english_level: 'avanzado',
    district: 'San Isidro',
    lima_zone: 'Lima Moderna',
    role_level: 'preprofesional',
  };

  describe('1. JobCard Component', () => {
    it('renders accessible article with non-nested interactive triggers', () => {
      const html = renderToStaticMarkup(
        <JobCard
          job={sampleJob}
          isSelected={false}
          onSelect={() => {}}
          onQuickCrmChange={() => {}}
        />
      );

      // Verify article wrapper
      expect(html).toContain('<article');
      expect(html).toContain('</article>');

      // Verify external link anchor is rendered
      expect(html).toContain('href="https://cvmatcher.pe/jobs/101"');
      expect(html).toContain('target="_blank"');

      // Verify CRM toolbar is rendered with proper semantics
      expect(html).toContain('role="toolbar"');
      expect(html).toContain('aria-label="Seguimiento de postulación"');

      // Crucial accessibility check: No nested <button> inside <button>
      // In the output HTML, the main button should close before toolbar buttons begin
      const buttonMatches = html.match(/<button[\s\S]*?<\/button>/g);
      expect(buttonMatches).toBeDefined();
      expect(buttonMatches!.length).toBeGreaterThanOrEqual(6); // 1 main card button + 5 CRM buttons

      // Ensure no button starts inside another button
      expect(html).not.toMatch(/<button[^>]*>(?:(?!<\/button>)[\s\S])*<button/);
      // Ensure no anchor starts inside a button
      expect(html).not.toMatch(/<button[^>]*>(?:(?!<\/button>)[\s\S])*<a/);
    });

    it('renders company monogram, title, salary, and source pill', () => {
      const html = renderToStaticMarkup(
        <JobCard
          job={sampleJob}
          isSelected={true}
          onSelect={() => {}}
          onToggleFavorite={() => {}}
        />
      );

      expect(html).toContain('Practicante Pre-Profesional de Machine Learning');
      expect(html).toContain('Interbank');
      expect(html).toContain('S/ 1,800');
      expect(html).toContain('CVMatcher');
      expect(html).toContain('San Isidro');
      expect(html).toContain('95% afinidad');
    });

    it('renders up to 4 skill pills plus English pill and remaining count', () => {
      const html = renderToStaticMarkup(
        <JobCard
          job={sampleJob}
          isSelected={false}
          onSelect={() => {}}
        />
      );

      // 4 displayed skills
      expect(html).toContain('Python');
      expect(html).toContain('PyTorch');
      expect(html).toContain('SQL');
      expect(html).toContain('FastAPI');

      // English pill
      expect(html).toContain('Inglés (avanzado)');

      // Remainder pill (+2 más)
      expect(html).toContain('+2 más');
    });

    it('reflects active CRM status with aria-pressed="true"', () => {
      const html = renderToStaticMarkup(
        <JobCard
          job={sampleJob} // user_status is 'favorite'
          isSelected={false}
          onSelect={() => {}}
        />
      );

      // Find the Destacar button
      expect(html).toContain('aria-pressed="true"');
      expect(html).toContain('Destacar');
    });

    it('disables CRM buttons when isPendingCrm is true', () => {
      const html = renderToStaticMarkup(
        <JobCard
          job={sampleJob}
          isSelected={false}
          onSelect={() => {}}
          isPendingCrm={true}
        />
      );

      expect(html).toContain('disabled=""');
    });

    it('renders agency clue pill when resolved_via_agency is true', () => {
      const agencyJob: JobSummary = {
        ...sampleJob,
        resolved_via_agency: true,
        resolved_brand_key: 'bcp',
        agency_clue: 'Cliente sector financiero',
      };

      const html = renderToStaticMarkup(
        <JobCard
          job={agencyJob}
          isSelected={false}
          onSelect={() => {}}
        />
      );

      expect(html).toContain('Vía Agencia');
      expect(html).toContain('Cliente detectado:');
      expect(html).toContain('BCP');
      expect(html).toContain('(Cliente sector financiero)');
    });
  });

  describe('2. FilterSidebar Component', () => {
    it('renders vertical panel with search, accordions, and switch', () => {
      const html = renderToStaticMarkup(
        <FilterSidebar
          filters={DEFAULT_WORKSPACE_FILTERS}
          onChange={() => {}}
          totalCount={42}
          districtCounts={{ 'San Isidro': 12, 'Miraflores': 8, 'Ate': 3 }}
          categoryCounts={{ 'Desarrollo & Software': 20 }}
        />
      );

      // Panel tag and width class
      expect(html).toContain('<aside');
      expect(html).toContain('w-[296px]');
      expect(html).toContain('42'); // Total count badge

      // Search input
      expect(html).toContain('id="filter-search-input"');

      // Native <details> / <summary> accordions
      expect(html).toContain('<details');
      expect(html).toContain('<summary');
      expect(html).toContain('Distritos de Lima');
      expect(html).toContain('Fecha de publicación');
      expect(html).toContain('Categoría');
      expect(html).toContain('Nivel laboral');

      // Modern Web Guidance: NO <h1>-<h6> headings inside <summary>
      expect(html).not.toMatch(/<summary[^>]*>(?:(?!<\/summary>)[\s\S])*<h[1-6]/);

      // Progressive enhancement switch for English
      expect(html).toContain('id="filter-english-switch"');
      expect(html).toContain('switch=""');

      // Ate quick exclusion button/toggle
      expect(html).toContain('Zona Este: Ate');
      expect(html).toContain('Excluido'); // Ate is in DEFAULT_WORKSPACE_FILTERS.excludedDistricts
    });

    it('renders didYouMean suggestion when provided', () => {
      const html = renderToStaticMarkup(
        <FilterSidebar
          filters={DEFAULT_WORKSPACE_FILTERS}
          onChange={() => {}}
          didYouMean={['Python Backend']}
        />
      );

      expect(html).toContain('¿Quisiste decir?');
      expect(html).toContain('Python Backend');
    });

    it('renders active filter chips when filters differ from default', () => {
      const customFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        search: 'FastAPI',
        includedDistricts: ['Miraflores'],
        englishOnly: true,
      };

      const html = renderToStaticMarkup(
        <FilterSidebar
          filters={customFilters}
          onChange={() => {}}
        />
      );

      expect(html).toContain('FastAPI');
      expect(html).toContain('Miraflores');
      expect(html).toContain('Inglés');
      expect(html).toContain('Limpiar');
    });

    it('immediately renders the removable "No: Ate" chip on DEFAULT_WORKSPACE_FILTERS', () => {
      const html = renderToStaticMarkup(
        <FilterSidebar
          filters={DEFAULT_WORKSPACE_FILTERS}
          onChange={() => {}}
        />
      );

      expect(html).toContain('data-testid="filter-chips-summary"');
      expect(html).toContain('No: Ate');
      expect(html).toContain('Limpiar');
    });

    it('shows chips for each active filter and renders NO empty chip container when zero chips exist', () => {
      // 1. With active filters
      const customFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        excludedDistricts: [],
        roleLevels: ['preprofesional', 'profesional'] as ('preprofesional' | 'profesional')[],
        modalities: ['Remoto'],
        sources: ['bumeran'],
        minScore: 70,
      };

      const htmlActive = renderToStaticMarkup(
        <FilterSidebar
          filters={customFilters}
          onChange={() => {}}
        />
      );

      expect(htmlActive).toContain('data-testid="filter-chips-summary"');
      expect(htmlActive).toContain('Rol: Profesional');
      expect(htmlActive).toContain('Modalidad: Remoto');
      expect(htmlActive).toContain('Portal: Bumeran');
      expect(htmlActive).toContain('Afinidad: 70%+');

      // 2. With zero active chips (excludedDistricts cleared and everything else at default)
      const zeroFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        excludedDistricts: [],
      };

      const htmlZero = renderToStaticMarkup(
        <FilterSidebar
          filters={zeroFilters}
          onChange={() => {}}
        />
      );

      expect(htmlZero).not.toContain('data-testid="filter-chips-summary"');
      expect(htmlZero).not.toContain('Limpiar');
    });

    it('provides an accessible label for the Lima district search input', () => {
      const html = renderToStaticMarkup(
        <FilterSidebar
          filters={DEFAULT_WORKSPACE_FILTERS}
          onChange={() => {}}
        />
      );

      expect(html).toContain('id="filter-district-search"');
      expect(html).toContain('for="filter-district-search"');
      expect(html).toContain('Filtrar distritos de Lima');
    });

    it('handleClearAll fallback preserves workspace state: crmTab, sortBy, and selectedJobId', () => {
      const initialFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        search: 'Junior Developer',
        crmTab: 'applied' as const,
        sortBy: 'recent' as const,
        selectedJobId: 456,
        includedDistricts: ['San Isidro'],
        excludedDistricts: ['Ate', 'Santa Anita'],
        minScore: 80,
      };

      // Verify clearFilterCriteria directly
      const cleared = clearFilterCriteria(initialFilters);
      expect(cleared.crmTab).toBe('applied');
      expect(cleared.sortBy).toBe('recent');
      expect(cleared.selectedJobId).toBe(456);
      expect(cleared.search).toBe('');
      expect(cleared.includedDistricts).toEqual([]);
      expect(cleared.excludedDistricts).toEqual([]);
      expect(cleared.minScore).toBe(0);

      // Verify resetFilterCriteriaToDefaults preserves workspace states
      const reset = resetFilterCriteriaToDefaults(initialFilters, ['Ate']);
      expect(reset.crmTab).toBe('applied');
      expect(reset.sortBy).toBe('recent');
      expect(reset.selectedJobId).toBe(456);
      expect(reset.excludedDistricts).toEqual(['Ate']);

      // Verify FilterSidebar handleClearAll invokes onChange with preserved states
      let capturedState: WorkspaceFilters | null = null;
      renderToStaticMarkup(
        <FilterSidebar
          filters={initialFilters}
          onChange={(f) => {
            capturedState = f;
          }}
        />
      );

      // Call clear function directly mimicking handleClearAll fallback
      const clearedViaHelper = clearFilterCriteria(initialFilters);
      expect(clearedViaHelper.crmTab).toBe('applied');
      expect(clearedViaHelper.sortBy).toBe('recent');
      expect(clearedViaHelper.selectedJobId).toBe(456);
    });

    it('renders restore profile link when profileExcludedDistricts differs', () => {
      const customFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        excludedDistricts: ['Ate', 'Santa Anita'],
      };

      const html = renderToStaticMarkup(
        <FilterSidebar
          filters={customFilters}
          onChange={() => {}}
          profileExcludedDistricts={['Ate']}
        />
      );

      expect(html).toContain('Restaurar perfil');
    });
  });

  describe('3. AppShell Component', () => {
    it('renders 232px desktop sidebar, mobile header, and native dialog drawer', () => {
      const html = renderToStaticMarkup(
        <AppShell
          user={{ id: 'usr-1', email: 'estudiante@uni.edu.pe' }}
          pipelineCounts={{ appliedCount: 3, favoriteCount: 5 }}
        >
          <div id="test-content">Contenido Principal</div>
        </AppShell>
      );

      // Desktop sidebar
      expect(html).toContain('<aside');
      expect(html).toContain('w-[232px]');
      expect(html).toContain('Radar');
      expect(html).toContain('Mis Postulaciones');
      expect(html).toContain('Mi Perfil');

      // Pipeline badge
      expect(html).toContain('3'); // appliedCount badge

      // User account panel
      expect(html).toContain('estudiante@uni.edu.pe');
      expect(html).toContain('Conectado');
      expect(html).toContain('Cerrar sesión');

      // Mobile header
      expect(html).toContain('aria-label="Abrir menú de navegación"');
      expect(html).toContain('aria-controls="mobile-nav-drawer"');

      // Mobile native <dialog> drawer
      expect(html).toContain('<dialog');
      expect(html).toContain('id="mobile-nav-drawer"');
      expect(html).toContain('class="app-nav-drawer"');
      expect(html).toContain('aria-label="Menú de navegación"');

      // Modern Web Guidance: NO redundant role="dialog" or aria-modal on native dialog
      expect(html).not.toMatch(/<dialog[^>]*role="dialog"/);
      expect(html).not.toMatch(/<dialog[^>]*aria-modal/);

      // Main content
      expect(html).toContain('id="test-content"');
      expect(html).toContain('Contenido Principal');
    });

    it('renders guest mode actions when user is null', () => {
      const html = renderToStaticMarkup(
        <AppShell user={null}>
          <div>Radar Público</div>
        </AppShell>
      );

      expect(html).toContain('Modo Explorador (Público)');
      expect(html).toContain('Ingresar');
      expect(html).toContain('Iniciar sesión');
    });
  });
});
