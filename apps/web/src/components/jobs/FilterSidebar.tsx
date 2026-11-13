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

  // Count active non-default filters
  const hasActiveFilters = React.useMemo(() => {
    return (
      filters.search.trim().length > 0 ||
      filters.includedDistricts.length > 0 ||
      filters.excludedDistricts.length !== 1 ||
      filters.excludedDistricts[0] !== 'Ate' ||
      !filters.keepRemoteWhenDistrictFiltered ||
      filters.includeLimaUnspecifiedDistrict ||
      filters.englishOnly ||
      filters.englishLevels.length > 0 ||
      filters.categories.length > 0 ||
      filters.roleLevels.length !== 1 ||
      filters.roleLevels[0] !== 'preprofesional' ||
      filters.modalities.length !== 3 ||
      filters.sources.length > 0 ||
      filters.salaryFilter !== 'any' ||
      filters.maxAgeDays !== 14 ||
      filters.minScore > 0 ||
      filters.includeDiscardedAi
    );
  }, [filters]);

  const handleClearAll = () => {
    if (onClearAll) {
      onClearAll();
      return;
    }
    if (onResetToDefaults) {
      onResetToDefaults();
      return;
    }
    onChange({
      ...DEFAULT_WORKSPACE_FILTERS,
      excludedDistricts:
        profileExcludedDistricts ?? DEFAULT_WORKSPACE_FILTERS.excludedDistricts,
    });
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
    // Unique list keeping top poles first, then remaining canonical districts
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
  const toggleDistrictInclusion = (district: string) => {
    const isIncluded = filters.includedDistricts.includes(district);
    const nextIncluded = isIncluded
      ? filters.includedDistricts.filter((d) => d !== district)
      : [...filters.includedDistricts, district];

    // If including, ensure it's not also excluded
    let nextExcluded = filters.excludedDistricts;
    if (!isIncluded && nextExcluded.includes(district)) {
      nextExcluded = nextExcluded.filter((d) => d !== district);
    }

    onChange({
      ...filters,
      includedDistricts: nextIncluded,
      excludedDistricts: nextExcluded,
    });
  };

  // Toggle district exclusion
  const toggleDistrictExclusion = (district: string) => {
    const isExcluded = filters.excludedDistricts.includes(district);
    const nextExcluded = isExcluded
      ? filters.excludedDistricts.filter((d) => d !== district)
      : [...filters.excludedDistricts, district];

    // If excluding, ensure it's removed from included
    const nextIncluded = filters.includedDistricts.filter((d) => d !== district);

    onChange({
      ...filters,
      excludedDistricts: nextExcluded,
      includedDistricts: nextIncluded,
    });
  };

  // Toggle category
  const toggleCategory = (cat: string) => {
    const isSelected = filters.categories.includes(cat);
    const next = isSelected
      ? filters.categories.filter((c) => c !== cat)
      : [...filters.categories, cat];
    onChange({ ...filters, categories: next });
  };

  // Toggle modality
  const toggleModality = (modality: string) => {
    const isSelected = filters.modalities.includes(modality);
    const next = isSelected
      ? filters.modalities.filter((m) => m !== modality)
      : [...filters.modalities, modality];
    onChange({ ...filters, modalities: next });
  };

  // Toggle source
  const toggleSource = (sourceKey: string) => {
    const isSelected = filters.sources.includes(sourceKey);
    const next = isSelected
      ? filters.sources.filter((s) => s !== sourceKey)
      : [...filters.sources, sourceKey];
    onChange({ ...filters, sources: next });
  };

  // Toggle role level
  const toggleRoleLevel = (role: Exclude<RoleLevel, 'unknown'>) => {
    const isSelected = filters.roleLevels.includes(role);
    const next = isSelected
      ? filters.roleLevels.filter((r) => r !== role)
      : [...filters.roleLevels, role];
    onChange({ ...filters, roleLevels: next });
  };

  // Toggle English level
  const toggleEnglishLevel = (lvl: EnglishLevel) => {
    const isSelected = filters.englishLevels.includes(lvl);
    const next = isSelected
      ? filters.englishLevels.filter((l) => l !== lvl)
      : [...filters.englishLevels, lvl];
    onChange({ ...filters, englishLevels: next });
  };

  const isAteExcluded = filters.excludedDistricts.includes('Ate');

  return (
    <aside
      className={`w-[296px] shrink-0 border-r border-[#E2E8F0] bg-white flex flex-col h-full overflow-y-auto ${className}`}
      aria-label="Filtros del Radar de Convocatorias"
    >
      {/* ------------------------------------------------------------- */}
      {/* Top Header: Title, Total Count & Reset Actions                */}
      {/* ------------------------------------------------------------- */}
      <div className="p-4 border-b border-[#E2E8F0] bg-slate-50/50 sticky top-0 z-10 backdrop-blur-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900 text-sm tracking-tight">
              Filtros
            </span>
            {totalCount !== undefined && (
              <span className="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                {totalCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {isProfileDifferent && (
              <button
                type="button"
                onClick={handleRestoreProfile}
                className="text-[11px] text-[#1E3A8A] hover:underline font-medium"
                title="Restaurar distritos configurados en tu perfil"
              >
                Restaurar perfil
              </button>
            )}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearAll}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 transition-colors"
                title="Restablecer todos los filtros"
              >
                <RotateCcw className="h-3 w-3" />
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
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            id="filter-search-input"
            type="text"
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            placeholder="Cargo, empresa, tecnología..."
            className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-8 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#1E3A8A] focus:outline-none focus:ring-1 focus:ring-[#1E3A8A]"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => onChange({ ...filters, search: '' })}
              aria-label="Limpiar búsqueda"
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
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
      {/* Active Filter Chips Summary                                   */}
      {/* ------------------------------------------------------------- */}
      {hasActiveFilters && (
        <div className="p-3 border-b border-slate-100 bg-slate-50/30 flex flex-wrap gap-1.5 text-xs">
          {filters.search && (
            <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 border border-blue-200/80 px-2 py-0.5 text-[11px] font-medium text-blue-900">
              <span className="truncate max-w-[120px]">
                &ldquo;{filters.search}&rdquo;
              </span>
              <button
                type="button"
                onClick={() => onChange({ ...filters, search: '' })}
                className="hover:text-blue-950"
                aria-label={`Quitar filtro de búsqueda ${filters.search}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}

          {filters.includedDistricts.map((d) => (
            <span
              key={`chip-inc-${d}`}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-medium text-emerald-900"
            >
              <span>{d}</span>
              <button
                type="button"
                onClick={() => toggleDistrictInclusion(d)}
                className="hover:text-emerald-950"
                aria-label={`Quitar distrito ${d}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}

          {filters.excludedDistricts.map((d) => (
            <span
              key={`chip-exc-${d}`}
              className="inline-flex items-center gap-1 rounded-md bg-rose-50 border border-rose-200 px-2 py-0.5 text-[11px] font-medium text-rose-900"
            >
              <span>No: {d}</span>
              <button
                type="button"
                onClick={() => toggleDistrictExclusion(d)}
                className="hover:text-rose-950"
                aria-label={`Quitar exclusión de ${d}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}

          {filters.categories.map((c) => (
            <span
              key={`chip-cat-${c}`}
              className="inline-flex items-center gap-1 rounded-md bg-purple-50 border border-purple-200 px-2 py-0.5 text-[11px] font-medium text-purple-900"
            >
              <span className="truncate max-w-[110px]">{c}</span>
              <button
                type="button"
                onClick={() => toggleCategory(c)}
                className="hover:text-purple-950"
                aria-label={`Quitar categoría ${c}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}

          {filters.englishOnly && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-medium text-amber-900">
              <span>
                Inglés
                {filters.englishLevels.length > 0
                  ? ` (${filters.englishLevels.join(', ')})`
                  : ''}
              </span>
              <button
                type="button"
                onClick={() =>
                  onChange({ ...filters, englishOnly: false, englishLevels: [] })
                }
                className="hover:text-amber-950"
                aria-label="Quitar filtro de inglés"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}

          {filters.salaryFilter !== 'any' && (
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-800">
              <span>Salario filtrado</span>
              <button
                type="button"
                onClick={() => onChange({ ...filters, salaryFilter: 'any' })}
                className="hover:text-slate-950"
                aria-label="Quitar filtro salarial"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}

          {filters.maxAgeDays !== 14 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-800">
              <span>
                {filters.maxAgeDays === null
                  ? 'Histórico DB'
                  : `${filters.maxAgeDays} días`}
              </span>
              <button
                type="button"
                onClick={() => onChange({ ...filters, maxAgeDays: 14 })}
                className="hover:text-slate-950"
                aria-label="Restablecer antigüedad"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}

          {filters.includeDiscardedAi && (
            <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 border border-rose-200 px-2 py-0.5 text-[11px] font-medium text-rose-800">
              <span>Incluye descartadas IA</span>
              <button
                type="button"
                onClick={() => onChange({ ...filters, includeDiscardedAi: false })}
                className="hover:text-rose-950"
                aria-label="Quitar descartadas por IA"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 1. Distritos de Lima Accordion                                */}
      {/* ------------------------------------------------------------- */}
      <details open className="border-b border-slate-200 group">
        <summary className="flex items-center justify-between p-4 cursor-pointer select-none font-semibold text-xs tracking-wider uppercase text-slate-700 hover:text-slate-900 transition-colors">
          <span className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 text-[#1E3A8A]" />
            <span>Distritos de Lima</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-500 font-normal">
              {filters.includedDistricts.length > 0
                ? `${filters.includedDistricts.length} sel.`
                : 'Todos'}
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

          {/* District list search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <input
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
            className="flex items-center gap-2 font-semibold text-xs tracking-wider uppercase text-slate-700 cursor-pointer select-none"
          >
            <Globe className="h-3.5 w-3.5 text-[#1E3A8A]" />
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
            <span className="block text-[11px] font-medium text-slate-500 mb-1.5">
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
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. Fecha de Publicación Accordion                             */}
      {/* ------------------------------------------------------------- */}
      <details open className="border-b border-slate-200 group">
        <summary className="flex items-center justify-between p-4 cursor-pointer select-none font-semibold text-xs tracking-wider uppercase text-slate-700 hover:text-slate-900 transition-colors">
          <span className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5 text-[#1E3A8A]" />
            <span>Fecha de publicación</span>
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
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs cursor-pointer select-none transition-colors ${
                  isSelected
                    ? 'bg-blue-50 font-semibold text-[#1E3A8A]'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="workspace-max-age"
                  checked={isSelected}
                  onChange={() => onChange({ ...filters, maxAgeDays: days })}
                  className="text-[#1E3A8A] focus:ring-[#1E3A8A]"
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
        <summary className="flex items-center justify-between p-4 cursor-pointer select-none font-semibold text-xs tracking-wider uppercase text-slate-700 hover:text-slate-900 transition-colors">
          <span className="flex items-center gap-2">
            <Layers className="h-3.5 w-3.5 text-[#1E3A8A]" />
            <span>Categoría</span>
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
                className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs cursor-pointer select-none transition-colors ${
                  isSelected
                    ? 'bg-blue-50 text-blue-900 font-semibold'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleCategory(cat)}
                    className="rounded border-slate-300 text-[#1E3A8A] focus:ring-[#1E3A8A]"
                  />
                  <span className="truncate">{cat}</span>
                </div>
                {count !== undefined && count > 0 && (
                  <span className="text-[10px] text-slate-600 font-mono ml-1">
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
        <summary className="flex items-center justify-between p-4 cursor-pointer select-none font-semibold text-xs tracking-wider uppercase text-slate-700 hover:text-slate-900 transition-colors">
          <span className="flex items-center gap-2">
            <Briefcase className="h-3.5 w-3.5 text-[#1E3A8A]" />
            <span>Nivel laboral</span>
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
                className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleRoleLevel(role)}
                  className="rounded border-slate-300 text-[#1E3A8A] focus:ring-[#1E3A8A]"
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
        <summary className="flex items-center justify-between p-4 cursor-pointer select-none font-semibold text-xs tracking-wider uppercase text-slate-700 hover:text-slate-900 transition-colors">
          <span className="flex items-center gap-2">
            <Sliders className="h-3.5 w-3.5 text-[#1E3A8A]" />
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
                className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleModality(mod)}
                  className="rounded border-slate-300 text-[#1E3A8A] focus:ring-[#1E3A8A]"
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
        <summary className="flex items-center justify-between p-4 cursor-pointer select-none font-semibold text-xs tracking-wider uppercase text-slate-700 hover:text-slate-900 transition-colors">
          <span className="flex items-center gap-2">
            <Banknote className="h-3.5 w-3.5 text-[#1E3A8A]" />
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
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs cursor-pointer select-none transition-colors ${
                  isSelected
                    ? 'bg-blue-50 font-semibold text-[#1E3A8A]'
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
                  className="text-[#1E3A8A] focus:ring-[#1E3A8A]"
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
        <summary className="flex items-center justify-between p-4 cursor-pointer select-none font-semibold text-xs tracking-wider uppercase text-slate-700 hover:text-slate-900 transition-colors">
          <span className="flex items-center gap-2">
            <Globe className="h-3.5 w-3.5 text-[#1E3A8A]" />
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
                className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSource(key)}
                  className="rounded border-slate-300 text-[#1E3A8A] focus:ring-[#1E3A8A]"
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
        <summary className="flex items-center justify-between p-4 cursor-pointer select-none font-semibold text-xs tracking-wider uppercase text-slate-700 hover:text-slate-900 transition-colors">
          <span className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-[#1E3A8A]" />
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
