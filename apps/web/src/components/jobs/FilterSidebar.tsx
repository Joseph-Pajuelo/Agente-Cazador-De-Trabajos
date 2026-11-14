'use client';

import React from 'react';
import {
  Search,
  X,
  ChevronDown,
  RotateCcw,
  Sparkles,
  MapPin,
  Briefcase,
  Layers,
  Calendar,
  Banknote,
  Globe,
  Sliders,
  Check,
} from 'lucide-react';
import {
  WorkspaceFilters,
  DEFAULT_WORKSPACE_FILTERS,
  SalaryFilterKey,
} from '@/lib/jobs/workspaceState';
import {
  LIMA_DISTRICTS,
  LIMA_CATEGORIES,
  RoleLevel,
  EnglishLevel,
} from '@/lib/domain/jobNormalization';
import { SOURCE_LABELS } from '@/lib/domain/types';

export interface FilterSidebarProps {
  filters: WorkspaceFilters;
  onChange: (filters: WorkspaceFilters) => void;
  districtCounts?: Record<string, number>;
  categoryCounts?: Record<string, number>;
  totalCount?: number;
  correctedQuery?: string | null;
  didYouMean?: string[];
  profileExcludedDistricts?: string[];
  onResetToDefaults?: () => void;
  onClearAll?: () => void;
  className?: string;
}

export interface ActiveFilterChip {
  id: string;
  label: string;
  onRemove: () => void;
  colorClass: string;
}

/**
 * Clears all user-customized search and filtering criteria while strictly
 * preserving workspace-level states: crmTab, sortBy, and selectedJobId.
 */
export function clearFilterCriteria(filters: WorkspaceFilters): WorkspaceFilters {
  return {
    ...filters,
    search: '',
    includedDistricts: [],
    excludedDistricts: [],
    keepRemoteWhenDistrictFiltered: true,
    includeLimaUnspecifiedDistrict: false,
    englishOnly: false,
    englishLevels: [],
    categories: [],
    roleLevels: ['preprofesional'],
    modalities: ['Híbrido', 'Presencial', 'Remoto'],
    sources: [],
    salaryFilter: 'any',
    maxAgeDays: 14,
    minScore: 0,
    includeDiscardedAi: false,
  };
}

/**
 * Resets search and filtering criteria to system or profile defaults while strictly
 * preserving workspace-level states: crmTab, sortBy, and selectedJobId.
 */
export function resetFilterCriteriaToDefaults(
  filters: WorkspaceFilters,
  profileExcludedDistricts?: string[]
): WorkspaceFilters {
  return {
    ...filters,
    search: DEFAULT_WORKSPACE_FILTERS.search,
    includedDistricts: DEFAULT_WORKSPACE_FILTERS.includedDistricts,
    excludedDistricts:
      profileExcludedDistricts ?? DEFAULT_WORKSPACE_FILTERS.excludedDistricts,
    keepRemoteWhenDistrictFiltered:
      DEFAULT_WORKSPACE_FILTERS.keepRemoteWhenDistrictFiltered,
    includeLimaUnspecifiedDistrict:
      DEFAULT_WORKSPACE_FILTERS.includeLimaUnspecifiedDistrict,
    englishOnly: DEFAULT_WORKSPACE_FILTERS.englishOnly,
    englishLevels: DEFAULT_WORKSPACE_FILTERS.englishLevels,
    categories: DEFAULT_WORKSPACE_FILTERS.categories,
    roleLevels: DEFAULT_WORKSPACE_FILTERS.roleLevels,
    modalities: DEFAULT_WORKSPACE_FILTERS.modalities,
    sources: DEFAULT_WORKSPACE_FILTERS.sources,
    salaryFilter: DEFAULT_WORKSPACE_FILTERS.salaryFilter,
    maxAgeDays: DEFAULT_WORKSPACE_FILTERS.maxAgeDays,
    minScore: DEFAULT_WORKSPACE_FILTERS.minScore,
    includeDiscardedAi: DEFAULT_WORKSPACE_FILTERS.includeDiscardedAi,
  };
}

// Lima poles ordered by common preference for student internships
const TOP_POLES = [
  'San Isidro',
  'Miraflores',
  'Santiago de Surco',
  'San Borja',
  'La Molina',
  'Jesús María',
  'Magdalena del Mar',
  'Lince',
  'Pueblo Libre',
  'San Miguel',
  'Lima Centro',
  'Surquillo',
  'Ate',
  'Los Olivos',
  'Santa Anita',
  'San Juan de Lurigancho',
  'Chorrillos',
  'San Martín de Porres',
  'Callao',
];

export function FilterSidebar({
  filters,
  onChange,
  districtCounts = {},
  categoryCounts = {},
  totalCount,
  correctedQuery,
  didYouMean = [],
  profileExcludedDistricts,
  onResetToDefaults,
  onClearAll,
  className = '',
}: FilterSidebarProps) {
  const [districtQuery, setDistrictQuery] = React.useState('');

  const handleClearAll = () => {
    if (onClearAll) {
      onClearAll();
      return;
    }
    if (onResetToDefaults) {
      onResetToDefaults();
      return;
    }
    onChange(clearFilterCriteria(filters));
  };

  const handleRestoreProfile = () => {
    if (!profileExcludedDistricts) return;
    onChange({
      ...filters,
      excludedDistricts: [...profileExcludedDistricts],
    });
  };

  const isProfileDifferent = React.useMemo(() => {
    if (!profileExcludedDistricts) return false;
    const current = [...filters.excludedDistricts].sort().join(',');
    const profile = [...profileExcludedDistricts].sort().join(',');
    return current !== profile;
  }, [filters.excludedDistricts, profileExcludedDistricts]);

  // Distritos filtered by local search input
  const displayDistricts = React.useMemo(() => {
    const unique = new Set<string>();
    TOP_POLES.forEach((d) => unique.add(d));
    LIMA_DISTRICTS.forEach((d) => {
      if (d !== 'Remoto' && d !== 'Lima Metropolitana') {
        unique.add(d);
      }
    });

    const all = Array.from(unique);
    if (!districtQuery.trim()) return all;

    const q = districtQuery.toLowerCase().trim();
    return all.filter((d) => d.toLowerCase().includes(q));
  }, [districtQuery]);

  // Toggle district inclusion
  const toggleDistrictInclusion = React.useCallback(
    (district: string) => {
      const isIncluded = filters.includedDistricts.includes(district);
      const nextIncluded = isIncluded
        ? filters.includedDistricts.filter((d) => d !== district)
        : [...filters.includedDistricts, district];

      let nextExcluded = filters.excludedDistricts;
      if (!isIncluded && nextExcluded.includes(district)) {
        nextExcluded = nextExcluded.filter((d) => d !== district);
      }

      onChange({
        ...filters,
        includedDistricts: nextIncluded,
        excludedDistricts: nextExcluded,
      });
    },
    [filters, onChange]
  );

  // Toggle district exclusion
  const toggleDistrictExclusion = React.useCallback(
    (district: string) => {
      const isExcluded = filters.excludedDistricts.includes(district);
      const nextExcluded = isExcluded
        ? filters.excludedDistricts.filter((d) => d !== district)
        : [...filters.excludedDistricts, district];

      const nextIncluded = filters.includedDistricts.filter((d) => d !== district);

      onChange({
        ...filters,
        excludedDistricts: nextExcluded,
        includedDistricts: nextIncluded,
      });
    },
    [filters, onChange]
  );

  // Toggle category
  const toggleCategory = React.useCallback(
    (cat: string) => {
      const isSelected = filters.categories.includes(cat);
      const next = isSelected
        ? filters.categories.filter((c) => c !== cat)
        : [...filters.categories, cat];
      onChange({ ...filters, categories: next });
    },
    [filters, onChange]
  );

  // Toggle modality
  const toggleModality = React.useCallback(
    (modality: string) => {
      const isSelected = filters.modalities.includes(modality);
      const next = isSelected
        ? filters.modalities.filter((m) => m !== modality)
        : [...filters.modalities, modality];
      onChange({ ...filters, modalities: next });
    },
    [filters, onChange]
  );

  // Toggle source
  const toggleSource = React.useCallback(
    (sourceKey: string) => {
      const isSelected = filters.sources.includes(sourceKey);
      const next = isSelected
        ? filters.sources.filter((s) => s !== sourceKey)
        : [...filters.sources, sourceKey];
      onChange({ ...filters, sources: next });
    },
    [filters, onChange]
  );

  // Toggle role level
  const toggleRoleLevel = React.useCallback(
    (role: Exclude<RoleLevel, 'unknown'>) => {
      const isSelected = filters.roleLevels.includes(role);
      const next = isSelected
        ? filters.roleLevels.filter((r) => r !== role)
        : [...filters.roleLevels, role];
      onChange({ ...filters, roleLevels: next });
    },
    [filters, onChange]
  );

  // Toggle English level
  const toggleEnglishLevel = React.useCallback(
    (lvl: EnglishLevel) => {
      const isSelected = filters.englishLevels.includes(lvl);
      const next = isSelected
        ? filters.englishLevels.filter((l) => l !== lvl)
        : [...filters.englishLevels, lvl];
      onChange({ ...filters, englishLevels: next });
    },
    [filters, onChange]
  );

  // Compute all visible active filter chips
  const activeChips = React.useMemo<ActiveFilterChip[]>(() => {
    const list: ActiveFilterChip[] = [];

    // 1. Search text
    if (filters.search.trim().length > 0) {
      list.push({
        id: 'search',
        label: `“${filters.search.trim()}”`,
        onRemove: () => onChange({ ...filters, search: '' }),
        colorClass: 'bg-blue-50 border-blue-200/80 text-blue-900',
      });
    }

    // 2. Included districts
    filters.includedDistricts.forEach((d) => {
      list.push({
        id: `inc-${d}`,
        label: d,
        onRemove: () => toggleDistrictInclusion(d),
        colorClass: 'bg-emerald-50 border-emerald-200 text-emerald-900',
      });
    });

    // 3. Excluded districts (ALWAYS rendered including default Ate!)
    filters.excludedDistricts.forEach((d) => {
      list.push({
        id: `exc-${d}`,
        label: `No: ${d}`,
        onRemove: () => toggleDistrictExclusion(d),
        colorClass: 'bg-rose-50 border-rose-200 text-rose-900',
      });
    });

    // 4. Categories
    filters.categories.forEach((c) => {
      list.push({
        id: `cat-${c}`,
        label: c,
        onRemove: () => toggleCategory(c),
        colorClass: 'bg-purple-50 border-purple-200 text-purple-900',
      });
    });

    // 5. English
    if (filters.englishOnly) {
      if (filters.englishLevels.length > 0) {
        filters.englishLevels.forEach((lvl) => {
          const lvlNames: Record<string, string> = {
            basico: 'Básico',
            intermedio: 'Intermedio',
            avanzado: 'Avanzado',
          };
          list.push({
            id: `eng-${lvl}`,
            label: `Inglés: ${lvlNames[lvl] || lvl}`,
            onRemove: () => toggleEnglishLevel(lvl),
            colorClass: 'bg-amber-50 border-amber-200 text-amber-900',
          });
        });
      } else {
        list.push({
          id: 'eng-only',
          label: 'Inglés',
          onRemove: () =>
            onChange({ ...filters, englishOnly: false, englishLevels: [] }),
          colorClass: 'bg-amber-50 border-amber-200 text-amber-900',
        });
      }
    }

    // 6. Role Levels (non-default: profesional, trainee_junior, or omission of preprofesional)
    const isRoleDefault =
      filters.roleLevels.length === 1 && filters.roleLevels[0] === 'preprofesional';
    if (!isRoleDefault) {
      const nonDefaultRoles = filters.roleLevels.filter(
        (r) => r !== 'preprofesional'
      );
      nonDefaultRoles.forEach((r) => {
        const roleLabels: Record<string, string> = {
          profesional: 'Profesional',
          trainee_junior: 'Trainee / Junior',
        };
        list.push({
          id: `role-${r}`,
          label: `Rol: ${roleLabels[r] || r}`,
          onRemove: () => toggleRoleLevel(r as Exclude<RoleLevel, 'unknown'>),
          colorClass: 'bg-indigo-50 border-indigo-200 text-indigo-900',
        });
      });
      if (!filters.roleLevels.includes('preprofesional')) {
        list.push({
          id: 'role-no-preprof',
          label: 'Sin Preprofesional',
          onRemove: () => toggleRoleLevel('preprofesional'),
          colorClass: 'bg-slate-100 border-slate-300 text-slate-800',
        });
      }
    }

    // 7. Modalities (when non-default < 3)
    if (filters.modalities.length < 3) {
      filters.modalities.forEach((m) => {
        list.push({
          id: `mod-${m}`,
          label: `Modalidad: ${m}`,
          onRemove: () => toggleModality(m),
          colorClass: 'bg-teal-50 border-teal-200 text-teal-900',
        });
      });
    }

    // 8. Sources
    filters.sources.forEach((s) => {
      list.push({
        id: `src-${s}`,
        label: `Portal: ${SOURCE_LABELS[s] || s}`,
        onRemove: () => toggleSource(s),
        colorClass: 'bg-sky-50 border-sky-200 text-sky-900',
      });
    });

    // 9. Salary filter
    if (filters.salaryFilter !== 'any') {
      const salaryLabels: Record<SalaryFilterKey, string> = {
        any: 'Cualquiera',
        has_salary: 'Con salario explícito',
        gte_1130: 'S/ 1,130+ (RMV)',
        gte_1500: 'S/ 1,500+',
        gte_2000: 'S/ 2,000+',
      };
      list.push({
        id: `salary-${filters.salaryFilter}`,
        label: `Salario: ${salaryLabels[filters.salaryFilter] || filters.salaryFilter}`,
        onRemove: () => onChange({ ...filters, salaryFilter: 'any' }),
        colorClass: 'bg-emerald-50 border-emerald-200 text-emerald-900',
      });
    }

    // 10. Publication date / maxAgeDays
    if (filters.maxAgeDays !== 14) {
      list.push({
        id: 'max-age',
        label:
          filters.maxAgeDays === null
            ? 'Histórico DB'
            : `${filters.maxAgeDays} días`,
        onRemove: () => onChange({ ...filters, maxAgeDays: 14 }),
        colorClass: 'bg-slate-100 border-slate-300 text-slate-800',
      });
    }

    // 11. Minimum AI score
    if (filters.minScore > 0) {
      list.push({
        id: 'min-score',
        label: `Afinidad: ${filters.minScore}%+`,
        onRemove: () => onChange({ ...filters, minScore: 0 }),
        colorClass: 'bg-violet-50 border-violet-200 text-violet-900',
      });
    }

    // 12. Include AI discarded
    if (filters.includeDiscardedAi) {
      list.push({
        id: 'discarded-ai',
        label: 'Incluye descartadas IA',
        onRemove: () => onChange({ ...filters, includeDiscardedAi: false }),
        colorClass: 'bg-rose-50 border-rose-200 text-rose-800',
      });
    }

    // 13. Special Lima options
    if (!filters.keepRemoteWhenDistrictFiltered) {
      list.push({
        id: 'no-remote-district',
        label: 'Sin remoto distrital',
        onRemove: () =>
          onChange({ ...filters, keepRemoteWhenDistrictFiltered: true }),
        colorClass: 'bg-slate-100 border-slate-300 text-slate-800',
      });
    }
    if (filters.includeLimaUnspecifiedDistrict) {
      list.push({
        id: 'lima-unspecified',
        label: 'Lima sin distrito',
        onRemove: () =>
          onChange({ ...filters, includeLimaUnspecifiedDistrict: false }),
        colorClass: 'bg-slate-100 border-slate-300 text-slate-800',
      });
    }

    return list;
  }, [
    filters,
    onChange,
    toggleDistrictInclusion,
    toggleDistrictExclusion,
    toggleCategory,
    toggleModality,
    toggleSource,
    toggleRoleLevel,
    toggleEnglishLevel,
  ]);

  const hasVisibleChips = activeChips.length > 0;
  const isAteExcluded = filters.excludedDistricts.includes('Ate');

  return (
    <aside
      className={`w-[296px] shrink-0 border-r border-[#E2E8F0] bg-white flex flex-col h-full overflow-y-auto ${className}`}
      aria-label="Filtros del Radar de Convocatorias"
    >
      {/* ------------------------------------------------------------- */}
      {/* Top Header: Title, Total Count & Reset Actions                */}
      {/* ------------------------------------------------------------- */}
      <div className="p-4 border-b border-[#E2E8F0] bg-white sticky top-0 z-10 backdrop-blur-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-slate-900 text-lg tracking-tight">
              Filtros
            </span>
            {totalCount !== undefined && (
              <span className="inline-flex items-center rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-xs font-bold text-[#2563EB]">
                {totalCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {isProfileDifferent && (
              <button
                type="button"
                onClick={handleRestoreProfile}
                className="text-xs text-[#2563EB] hover:underline font-semibold"
                title="Restaurar distritos configurados en tu perfil"
              >
                Restaurar perfil
              </button>
            )}
            {hasVisibleChips && (
              <button
                type="button"
                onClick={handleClearAll}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold text-rose-700 hover:bg-rose-50 transition-colors"
                title="Restablecer todos los filtros"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Limpiar</span>
              </button>
            )}
          </div>
        </div>

        {/* Search Box */}
        <div className="mt-3 relative">
          <label htmlFor="filter-search-input" className="sr-only">
            Buscar por cargo, empresa o tecnología
          </label>
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            id="filter-search-input"
            type="text"
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            placeholder="Buscar empleo, empresa o skill..."
            className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-8 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => onChange({ ...filters, search: '' })}
              aria-label="Limpiar búsqueda"
              className="absolute right-2.5 top-3 text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Did You Mean Suggestion */}
        {(correctedQuery || didYouMean.length > 0) && (
          <div className="mt-2 text-[11px] text-blue-900 bg-blue-50/80 p-2 rounded-lg border border-blue-100 flex items-start gap-1.5">
            <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-700" />
            <div>
              <span className="font-medium text-slate-600">¿Quisiste decir? </span>
              {correctedQuery && (
                <button
                  type="button"
                  onClick={() => onChange({ ...filters, search: correctedQuery })}
                  className="font-bold underline text-[#1E3A8A] hover:text-blue-950"
                >
                  {correctedQuery}
                </button>
              )}
              {!correctedQuery && didYouMean.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange({ ...filters, search: didYouMean[0] })}
                  className="font-bold underline text-[#1E3A8A] hover:text-blue-950"
                >
                  {didYouMean[0]}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Active Filter Chips Summary (Only rendered when chips exist)  */}
      {/* ------------------------------------------------------------- */}
      {hasVisibleChips && (
        <div
          data-testid="filter-chips-summary"
          className="p-3 border-b border-slate-100 bg-slate-50/30 flex flex-wrap gap-1.5 text-xs"
        >
          {activeChips.map((chip) => (
            <span
              key={chip.id}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${chip.colorClass}`}
            >
              <span className="truncate max-w-[140px]">{chip.label}</span>
              <button
                type="button"
                onClick={chip.onRemove}
                className="hover:opacity-75"
                aria-label={`Quitar filtro ${chip.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 1. Distritos de Lima Accordion                                */}
      {/* ------------------------------------------------------------- */}
      <details open className="border-b border-slate-200 group">
        <summary className="flex items-center justify-between p-4 cursor-pointer select-none font-bold text-[15px] text-[#2563EB] hover:text-blue-700 transition-colors">
          <span className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-[#2563EB]" />
            <span>Distritos de Lima</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-xs text-[#2563EB] font-semibold">
              {filters.includedDistricts.length > 0
                ? `(${filters.includedDistricts.length})`
                : 'Lima'}
            </span>
            <ChevronDown className="h-4 w-4 text-slate-500 details-chevron" />
          </span>
        </summary>

        <div className="px-4 pb-4 space-y-3">
          {/* Quick Ate Exclusion Button / Toggle */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="block text-xs font-bold text-slate-800">
                  Zona Este: Ate
                </span>
                <span className="block text-[11px] text-slate-500">
                  {districtCounts['Ate'] !== undefined
                    ? `${districtCounts['Ate']} vacantes detectadas`
                    : 'Filtro por distancia común'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => toggleDistrictExclusion('Ate')}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                  isAteExcluded
                    ? 'bg-rose-100 text-rose-900 border border-rose-300'
                    : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                }`}
                aria-pressed={isAteExcluded}
              >
                {isAteExcluded ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-rose-700" />
                    <span>Excluido</span>
                  </>
                ) : (
                  <span>+ Excluir</span>
                )}
              </button>
            </div>
          </div>

          {/* District list search with accessible label */}
          <div className="relative">
            <label htmlFor="filter-district-search" className="sr-only">
              Filtrar distritos de Lima
            </label>
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <input
              id="filter-district-search"
              type="text"
              value={districtQuery}
              onChange={(e) => setDistrictQuery(e.target.value)}
              placeholder="Filtrar distritos..."
              className="w-full rounded-lg border border-slate-200 bg-white pl-8 pr-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#1E3A8A] focus:outline-none"
            />
          </div>

          {/* Districts Checkbox List */}
          <div className="max-h-48 overflow-y-auto space-y-1 pr-1 border border-slate-100 rounded-lg p-1.5">
            {displayDistricts.map((d) => {
              const isIncluded = filters.includedDistricts.includes(d);
              const isExcluded = filters.excludedDistricts.includes(d);
              const count = districtCounts[d];

              return (
                <div
                  key={`dist-${d}`}
                  className={`flex items-center justify-between rounded-md px-2 py-1 text-xs transition-colors ${
                    isExcluded
                      ? 'bg-rose-50/50 text-rose-800'
                      : isIncluded
                      ? 'bg-blue-50/70 text-blue-900 font-medium'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <label
                    htmlFor={`dist-cb-${d}`}
                    className="flex items-center gap-2 flex-1 cursor-pointer select-none min-w-0"
                  >
                    <input
                      id={`dist-cb-${d}`}
                      type="checkbox"
                      checked={isIncluded}
                      onChange={() => toggleDistrictInclusion(d)}
                      disabled={isExcluded}
                      className="rounded border-slate-300 text-[#1E3A8A] focus:ring-[#1E3A8A]"
                    />
                    <span className="truncate">{d}</span>
                    {count !== undefined && count > 0 && (
                      <span className="text-[10px] text-slate-600 font-mono">
                        ({count})
                      </span>
                    )}
                  </label>

                  {/* Exclusion action */}
                  <button
                    type="button"
                    onClick={() => toggleDistrictExclusion(d)}
                    className={`ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
                      isExcluded
                        ? 'bg-rose-200 text-rose-900'
                        : 'text-slate-600 hover:bg-slate-200 hover:text-slate-800'
                    }`}
                    title={
                      isExcluded
                        ? `Quitar exclusión de ${d}`
                        : `Excluir vacantes de ${d}`
                    }
                  >
                    {isExcluded ? 'No ×' : 'No'}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Special Lima options */}
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <label
              htmlFor="filter-keep-remote"
              className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none"
            >
              <input
                id="filter-keep-remote"
                type="checkbox"
                checked={filters.keepRemoteWhenDistrictFiltered}
                onChange={(e) =>
                  onChange({
                    ...filters,
                    keepRemoteWhenDistrictFiltered: e.target.checked,
                  })
                }
                className="rounded border-slate-300 text-[#1E3A8A] focus:ring-[#1E3A8A]"
              />
              <span className="font-medium">+ Incluir Remoto</span>
            </label>

            <label
              htmlFor="filter-unspecified-district"
              className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none"
            >
              <input
                id="filter-unspecified-district"
                type="checkbox"
                checked={filters.includeLimaUnspecifiedDistrict}
                onChange={(e) =>
                  onChange({
                    ...filters,
                    includeLimaUnspecifiedDistrict: e.target.checked,
                  })
                }
                className="rounded border-slate-300 text-[#1E3A8A] focus:ring-[#1E3A8A]"
              />
              <span>+ Incluir Lima sin distrito explícito</span>
            </label>
          </div>
        </div>
      </details>

      {/* ------------------------------------------------------------- */}
      {/* 2. Requiere Inglés Switch + Level Pills                       */}
      {/* ------------------------------------------------------------- */}
      <div className="p-4 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <label
            htmlFor="filter-english-switch"
            className="flex items-center gap-2 font-bold text-[15px] text-slate-900 cursor-pointer select-none"
          >
            <Globe className="h-4 w-4 text-[#2563EB]" />
            <span>Requiere inglés</span>
          </label>
          <input
            type="checkbox"
            id="filter-english-switch"
            checked={filters.englishOnly}
            onChange={(e) =>
              onChange({
                ...filters,
                englishOnly: e.target.checked,
                englishLevels: e.target.checked ? filters.englishLevels : [],
              })
            }
            {...({ switch: '' } as Record<string, unknown>)}
          />
        </div>

        {/* Level pills when English switch enabled */}
        {filters.englishOnly && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <span className="block text-xs font-medium text-slate-500 mb-1.5">
              Nivel requerido:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['basico', 'Básico'],
                  ['intermedio', 'Intermedio'],
                  ['avanzado', 'Avanzado'],
                ] as const
              ).map(([lvl, label]) => {
                const isSelected = filters.englishLevels.includes(lvl);
                return (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => toggleEnglishLevel(lvl)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold border transition-colors ${
                      isSelected
                        ? 'bg-[#2563EB] text-white border-[#2563EB]'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. Fecha de Publicación Accordion                             */}
      {/* ------------------------------------------------------------- */}
      <details open className="border-b border-slate-200 group">
        <summary className="flex items-center justify-between p-4 cursor-pointer select-none font-bold text-[15px] text-[#2563EB] hover:text-blue-700 transition-colors">
          <span className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[#2563EB]" />
            <span>Fecha de publicación</span>
            <span className="text-xs font-bold text-[#2563EB]">(1)</span>
          </span>
          <ChevronDown className="h-4 w-4 text-slate-500 details-chevron" />
        </summary>

        <div className="px-4 pb-4 space-y-1.5">
          {(
            [
              [1, 'Últimas 24 horas (24h)'],
              [3, 'Últimos 3 días (3d)'],
              [7, 'Última semana (7d)'],
              [14, 'Últimas 2 semanas (14d)'],
              [30, 'Último mes (30d)'],
              [null, 'Histórico DB (Cualquier fecha)'],
            ] as const
          ).map(([days, label]) => {
            const isSelected = filters.maxAgeDays === days;
            return (
              <label
                key={`age-${days ?? 'hist'}`}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm cursor-pointer select-none transition-colors ${
                  isSelected
                    ? 'bg-blue-50 font-bold text-[#2563EB]'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="workspace-max-age"
                  checked={isSelected}
                  onChange={() => onChange({ ...filters, maxAgeDays: days })}
                  className="h-4 w-4 text-[#2563EB] focus:ring-[#2563EB]"
                />
                <span>{label}</span>
              </label>
            );
          })}
        </div>
      </details>

      {/* ------------------------------------------------------------- */}
      {/* 4. Categoría Accordion                                        */}
      {/* ------------------------------------------------------------- */}
      <details open className="border-b border-slate-200 group">
        <summary className="flex items-center justify-between p-4 cursor-pointer select-none font-bold text-[15px] text-slate-900 hover:text-[#2563EB] transition-colors">
          <span className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-[#2563EB]" />
            <span>Categoría</span>
            {filters.categories.length > 0 && (
              <span className="text-xs font-bold text-[#2563EB]">
                ({filters.categories.length})
              </span>
            )}
          </span>
          <ChevronDown className="h-4 w-4 text-slate-500 details-chevron" />
        </summary>

        <div className="px-4 pb-4 space-y-1.5">
          {LIMA_CATEGORIES.map((cat) => {
            const isSelected = filters.categories.includes(cat);
            const count = categoryCounts[cat];

            return (
              <label
                key={cat}
                className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm cursor-pointer select-none transition-colors ${
                  isSelected
                    ? 'bg-blue-50 text-[#2563EB] font-bold'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleCategory(cat)}
                    className="h-4 w-4 rounded border-slate-300 text-[#2563EB] focus:ring-[#2563EB]"
                  />
                  <span className="truncate">{cat}</span>
                </div>
                {count !== undefined && count > 0 && (
                  <span className="text-xs text-slate-500 font-mono ml-1">
                    ({count})
                  </span>
                )}
              </label>
            );
          })}
        </div>
      </details>

      {/* ------------------------------------------------------------- */}
      {/* 5. Nivel Laboral & Descarte IA Accordion                       */}
      {/* ------------------------------------------------------------- */}
      <details open className="border-b border-slate-200 group">
        <summary className="flex items-center justify-between p-4 cursor-pointer select-none font-bold text-[15px] text-[#2563EB] hover:text-blue-700 transition-colors">
          <span className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-[#2563EB]" />
            <span>Nivel laboral</span>
            {filters.roleLevels.length > 0 && (
              <span className="text-xs font-bold text-[#2563EB]">
                ({filters.roleLevels.length})
              </span>
            )}
          </span>
          <ChevronDown className="h-4 w-4 text-slate-500 details-chevron" />
        </summary>

        <div className="px-4 pb-4 space-y-2">
          {(
            [
              ['preprofesional', 'Preprofesional (Estudiantes)'],
              ['profesional', 'Profesional / Egresado'],
              ['trainee_junior', 'Trainee / Junior'],
            ] as const
          ).map(([role, label]) => {
            const isSelected = filters.roleLevels.includes(role);
            return (
              <label
                key={role}
                className={`flex items-center gap-2.5 text-sm cursor-pointer select-none ${
                  isSelected ? 'font-bold text-[#2563EB]' : 'text-slate-700'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleRoleLevel(role)}
                  className="h-4 w-4 rounded border-slate-300 text-[#2563EB] focus:ring-[#2563EB]"
                />
                <span>{label}</span>
              </label>
            );
          })}

          <div className="pt-2 border-t border-slate-100">
            <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filters.includeDiscardedAi}
                onChange={(e) =>
                  onChange({ ...filters, includeDiscardedAi: e.target.checked })
                }
                className="mt-0.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
              />
              <div>
                <span className="font-medium text-slate-800">
                  Incluir ofertas descartadas por IA
                </span>
                <span className="block text-[11px] text-slate-500 leading-tight mt-0.5">
                  Muestra convocatorias con requisitos irreales o sospechosas
                </span>
              </div>
            </label>
          </div>
        </div>
      </details>

      {/* ------------------------------------------------------------- */}
      {/* 6. Modalidad Accordion                                        */}
      {/* ------------------------------------------------------------- */}
      <details className="border-b border-slate-200 group">
        <summary className="flex items-center justify-between p-4 cursor-pointer select-none font-bold text-[15px] text-slate-900 hover:text-[#2563EB] transition-colors">
          <span className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-[#2563EB]" />
            <span>Modalidad</span>
          </span>
          <ChevronDown className="h-4 w-4 text-slate-500 details-chevron" />
        </summary>

        <div className="px-4 pb-4 space-y-2">
          {['Híbrido', 'Presencial', 'Remoto'].map((mod) => {
            const isSelected = filters.modalities.includes(mod);
            return (
              <label
                key={mod}
                className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleModality(mod)}
                  className="h-4 w-4 rounded border-slate-300 text-[#2563EB] focus:ring-[#2563EB]"
                />
                <span>{mod}</span>
              </label>
            );
          })}
        </div>
      </details>

      {/* ------------------------------------------------------------- */}
      {/* 7. Rango Salarial (S/) Accordion                              */}
      {/* ------------------------------------------------------------- */}
      <details className="border-b border-slate-200 group">
        <summary className="flex items-center justify-between p-4 cursor-pointer select-none font-bold text-[15px] text-slate-900 hover:text-[#2563EB] transition-colors">
          <span className="flex items-center gap-2">
            <Banknote className="h-4 w-4 text-[#2563EB]" />
            <span>Rango salarial (S/)</span>
          </span>
          <ChevronDown className="h-4 w-4 text-slate-500 details-chevron" />
        </summary>

        <div className="px-4 pb-4 space-y-1.5">
          {(
            [
              ['any', 'Cualquiera (con o sin salario)'],
              ['has_salary', 'Con remuneración explícita'],
              ['gte_1130', 'Desde S/ 1,130 (RMV Perú)'],
              ['gte_1500', 'Desde S/ 1,500'],
              ['gte_2000', 'Desde S/ 2,000+'],
            ] as const
          ).map(([key, label]) => {
            const isSelected = filters.salaryFilter === key;
            return (
              <label
                key={key}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm cursor-pointer select-none transition-colors ${
                  isSelected
                    ? 'bg-blue-50 font-bold text-[#2563EB]'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="workspace-salary"
                  checked={isSelected}
                  onChange={() =>
                    onChange({ ...filters, salaryFilter: key as SalaryFilterKey })
                  }
                  className="h-4 w-4 text-[#2563EB] focus:ring-[#2563EB]"
                />
                <span>{label}</span>
              </label>
            );
          })}
        </div>
      </details>

      {/* ------------------------------------------------------------- */}
      {/* 8. Portal de Origen Accordion                                 */}
      {/* ------------------------------------------------------------- */}
      <details className="border-b border-slate-200 group">
        <summary className="flex items-center justify-between p-4 cursor-pointer select-none font-bold text-[15px] text-slate-900 hover:text-[#2563EB] transition-colors">
          <span className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-[#2563EB]" />
            <span>Portal de origen</span>
          </span>
          <ChevronDown className="h-4 w-4 text-slate-500 details-chevron" />
        </summary>

        <div className="px-4 pb-4 space-y-2">
          {Object.entries(SOURCE_LABELS).map(([key, label]) => {
            const isSelected = filters.sources.includes(key);
            return (
              <label
                key={key}
                className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSource(key)}
                  className="h-4 w-4 rounded border-slate-300 text-[#2563EB] focus:ring-[#2563EB]"
                />
                <span>{label}</span>
              </label>
            );
          })}
        </div>
      </details>

      {/* ------------------------------------------------------------- */}
      {/* 9. Afinidad IA Mínima Accordion                               */}
      {/* ------------------------------------------------------------- */}
      <details className="border-b border-slate-200 group">
        <summary className="flex items-center justify-between p-4 cursor-pointer select-none font-bold text-[15px] text-slate-900 hover:text-[#2563EB] transition-colors">
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#2563EB]" />
            <span>Afinidad IA mínima</span>
          </span>
          <ChevronDown className="h-4 w-4 text-slate-500 details-chevron" />
        </summary>

        <div className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                [0, 'Todas (0%)'],
                [50, 'Media (50%+)'],
                [70, 'Alta (70%+)'],
                [80, 'Top (80%+)'],
              ] as const
            ).map(([score, label]) => {
              const isSelected = filters.minScore === score;
              return (
                <button
                  key={`score-${score}`}
                  type="button"
                  onClick={() => onChange({ ...filters, minScore: score })}
                  className={`rounded-lg px-2 py-1.5 text-xs font-semibold border transition-colors ${
                    isSelected
                      ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </details>
    </aside>
  );
}
