import { describe, it, expect } from 'vitest';
import {
  parseFiltersFromSearchParams,
  serializeFiltersToSearchParams,
  reconcileProfileExclusions,
} from '../src/lib/jobs/urlFilterParams';
import {
  DEFAULT_WORKSPACE_FILTERS,
  WorkspaceFilters,
} from '../src/lib/jobs/workspaceState';

describe('urlFilterParams: Bi-directional URL SearchParams Serializer', () => {
  describe('1. parseFiltersFromSearchParams', () => {
    it('defaults to excludedDistricts: [] for guests when excl is absent', () => {
      const parsed = parseFiltersFromSearchParams(new URLSearchParams());
      expect(parsed.filters.excludedDistricts).toEqual([]);
      expect(parsed.hasExplicitExclParam).toBe(false);
      expect(parsed.urlSelectedJobId).toBeNull();
    });

    it('uses profileExcludedDistricts when excl is absent', () => {
      const parsed = parseFiltersFromSearchParams(
        new URLSearchParams(),
        ['Santa Anita', 'San Juan de Lurigancho']
      );
      expect(parsed.filters.excludedDistricts).toEqual([
        'Santa Anita',
        'San Juan de Lurigancho',
      ]);
      expect(parsed.hasExplicitExclParam).toBe(false);
    });

    it('returns excludedDistricts: [] when excl=none (even with profileExcludedDistricts)', () => {
      const params = new URLSearchParams('excl=none');
      const parsed = parseFiltersFromSearchParams(params, ['Ate']);
      expect(parsed.filters.excludedDistricts).toEqual([]);
      expect(parsed.hasExplicitExclParam).toBe(true);
    });

    it('parses comma-separated excl districts', () => {
      const params = new URLSearchParams('excl=Ate,Santa Anita');
      const parsed = parseFiltersFromSearchParams(params);
      expect(parsed.filters.excludedDistricts).toEqual(['Ate', 'Santa Anita']);
      expect(parsed.hasExplicitExclParam).toBe(true);
    });

    it('round-trips all canonical filter params from URLSearchParams', () => {
      const params = new URLSearchParams(
        `q=react&dist=San Isidro,Miraflores&excl=Ate&drem=0&dlim=1&eng=1&engl=avanzado,intermedio&time=3&cat=${encodeURIComponent(
          'Desarrollo & Software'
        )}&lvl=trainee_junior,profesional&ai=1&mod=Remoto&sal=gte_1500&src=bumeran,linkedin&score=80&tab=favorite&sort=recent&job=42`
      );

      const parsed = parseFiltersFromSearchParams(params);
      expect(parsed.filters.search).toBe('react');
      expect(parsed.filters.includedDistricts).toEqual(['San Isidro', 'Miraflores']);
      expect(parsed.filters.excludedDistricts).toEqual(['Ate']);
      expect(parsed.filters.keepRemoteWhenDistrictFiltered).toBe(false);
      expect(parsed.filters.includeLimaUnspecifiedDistrict).toBe(true);
      expect(parsed.filters.englishOnly).toBe(true);
      expect(parsed.filters.englishLevels).toEqual(['avanzado', 'intermedio']);
      expect(parsed.filters.maxAgeDays).toBe(3);
      expect(parsed.filters.categories).toEqual(['Desarrollo & Software']);
      expect(parsed.filters.roleLevels).toEqual(['trainee_junior', 'profesional']);
      expect(parsed.filters.includeDiscardedAi).toBe(true);
      expect(parsed.filters.modalities).toEqual(['Remoto']);
      expect(parsed.filters.salaryFilter).toBe('gte_1500');
      expect(parsed.filters.sources).toEqual(['bumeran', 'linkedin']);
      expect(parsed.filters.minScore).toBe(80);
      expect(parsed.filters.crmTab).toBe('favorite');
      expect(parsed.filters.sortBy).toBe('recent');
      expect(parsed.urlSelectedJobId).toBe(42);
      expect(parsed.filters.selectedJobId).toBe(42);
    });

    it('handles Next.js plain object searchParams Record<string, string | string[] | undefined>', () => {
      const record = {
        q: 'python',
        dist: ['San Isidro'],
        time: 'all',
        sal: 'has_salary',
        job: '108',
      };

      const parsed = parseFiltersFromSearchParams(record);
      expect(parsed.filters.search).toBe('python');
      expect(parsed.filters.includedDistricts).toEqual(['San Isidro']);
      expect(parsed.filters.maxAgeDays).toBeNull(); // time=all parses to null
      expect(parsed.filters.salaryFilter).toBe('has_salary');
      expect(parsed.urlSelectedJobId).toBe(108);
    });

    it('parses lvl=all as roleLevels: [] (allowing all non-smoke levels)', () => {
      const params = new URLSearchParams('lvl=all');
      const parsed = parseFiltersFromSearchParams(params);
      expect(parsed.filters.roleLevels).toEqual([]);
    });
  });

  describe('2. serializeFiltersToSearchParams', () => {
    it('produces empty search params for DEFAULT_WORKSPACE_FILTERS without ?excl=none when no exclusions exist', () => {
      const params = serializeFiltersToSearchParams(DEFAULT_WORKSPACE_FILTERS, []);
      expect(params.toString()).toBe('');

      const guestParams = serializeFiltersToSearchParams(DEFAULT_WORKSPACE_FILTERS);
      expect(guestParams.toString()).toBe('');
    });

    it('emits excl=none when excludedDistricts is empty []', () => {
      const filters: WorkspaceFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        excludedDistricts: [],
      };
      const params = serializeFiltersToSearchParams(filters, ['Ate']);
      expect(params.get('excl')).toBe('none');
    });

    it('emits excl when excludedDistricts differs from profile defaults', () => {
      const filters: WorkspaceFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        excludedDistricts: ['Callao'],
      };
      const params = serializeFiltersToSearchParams(filters, ['Ate']);
      expect(params.get('excl')).toBe('Callao');
    });

    it('omits excl when excludedDistricts matches profile defaults', () => {
      const filters: WorkspaceFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        excludedDistricts: ['Ate', 'Santa Anita'],
      };
      const params = serializeFiltersToSearchParams(filters, ['Ate', 'Santa Anita']);
      expect(params.get('excl')).toBeNull();
    });

    it('serializes non-default filter values with canonical keys', () => {
      const filters: WorkspaceFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        search: 'fullstack',
        includedDistricts: ['San Borja', 'Surquillo'],
        excludedDistricts: [],
        keepRemoteWhenDistrictFiltered: false,
        includeLimaUnspecifiedDistrict: true,
        englishOnly: true,
        englishLevels: ['avanzado'],
        maxAgeDays: null,
        categories: ['Datos, BI & IA'],
        roleLevels: ['trainee_junior'],
        includeDiscardedAi: true,
        modalities: ['Híbrido'],
        salaryFilter: 'gte_2000',
        sources: ['computrabajo'],
        minScore: 70,
        crmTab: 'to_apply',
        sortBy: 'score',
        selectedJobId: 99,
      };

      const params = serializeFiltersToSearchParams(filters, ['Ate']);
      expect(params.get('q')).toBe('fullstack');
      expect(params.get('dist')).toBe('San Borja,Surquillo');
      expect(params.get('excl')).toBe('none');
      expect(params.get('drem')).toBe('0');
      expect(params.get('dlim')).toBe('1');
      expect(params.get('eng')).toBe('1');
      expect(params.get('engl')).toBe('avanzado');
      expect(params.get('time')).toBe('all');
      expect(params.get('cat')).toBe('Datos, BI & IA');
      expect(params.get('lvl')).toBe('trainee_junior');
      expect(params.get('ai')).toBe('1');
      expect(params.get('mod')).toBe('Híbrido');
      expect(params.get('sal')).toBe('gte_2000');
      expect(params.get('src')).toBe('computrabajo');
      expect(params.get('score')).toBe('70');
      expect(params.get('tab')).toBe('to_apply');
      expect(params.get('sort')).toBe('score');
      expect(params.get('job')).toBe('99');
    });

    it('round-trips full filter state through serialize and parse', () => {
      const original: WorkspaceFilters = {
        search: 'analista',
        crmTab: 'favorite',
        modalities: ['Remoto', 'Presencial'],
        sources: ['practicas_pe', 'linkedin'],
        minScore: 75,
        maxAgeDays: 7,
        sortBy: 'recent',
        includeDiscardedAi: true,
        includedDistricts: ['Miraflores', 'San Isidro'],
        excludedDistricts: [],
        keepRemoteWhenDistrictFiltered: false,
        includeLimaUnspecifiedDistrict: true,
        englishOnly: true,
        englishLevels: ['intermedio'],
        categories: ['Administración, Banca & Finanzas'],
        roleLevels: ['profesional'],
        salaryFilter: 'gte_1130',
        selectedJobId: 15,
      };

      const params = serializeFiltersToSearchParams(original, ['Ate']);
      const parsed = parseFiltersFromSearchParams(params, ['Ate']);

      expect(parsed.filters).toEqual(original);
    });
  });

  describe('3. reconcileProfileExclusions', () => {
    it('preserves empty exclusions if URL had explicit excl=none', () => {
      const filters: WorkspaceFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        excludedDistricts: [],
      };
      const reconciled = reconcileProfileExclusions(filters, true, ['Ate']);
      expect(reconciled.excludedDistricts).toEqual([]);
    });

    it('updates exclusions from profile when URL did not have explicit excl', () => {
      const filters: WorkspaceFilters = {
        ...DEFAULT_WORKSPACE_FILTERS,
        excludedDistricts: ['Ate'],
      };
      const reconciled = reconcileProfileExclusions(filters, false, [
        'San Juan de Lurigancho',
        'Comas',
      ]);
      expect(reconciled.excludedDistricts).toEqual([
        'San Juan de Lurigancho',
        'Comas',
      ]);
    });
  });
});
