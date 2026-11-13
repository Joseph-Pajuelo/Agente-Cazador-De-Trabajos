'use client';

import React from 'react';
import {
  Search,
  X,
  SlidersHorizontal,
  RotateCcw,
  Sparkles,
  ChevronDown,
} from 'lucide-react';
import {
  WorkspaceFilters,
  WorkspaceCrmTab,
  WorkspaceSortBy,
  CrmCounts,
  DEFAULT_WORKSPACE_FILTERS,
} from '@/lib/jobs/workspaceState';

interface FilterBarProps {
  filters: WorkspaceFilters;
  onChange: (filters: WorkspaceFilters) => void;
  counts: CrmCounts;
  correctedQuery?: string | null;
  didYouMean?: string[];
  totalResultsCount: number;
  isHistoricalMode?: boolean;
}

const CRM_TABS: { key: WorkspaceCrmTab; label: string }[] = [
  { key: 'activas', label: 'Activas' },
  { key: 'to_apply', label: 'Por postular' },
  { key: 'favorite', label: 'Destacadas' },
  { key: 'applied', label: 'Postuladas' },
  { key: 'interview', label: 'En entrevista' },
  { key: 'discarded', label: 'Descartadas' },
  { key: 'todas', label: 'Todas' },
];

const MODALITIES = ['Híbrido', 'Presencial', 'Remoto'];

const SOURCES = [
  { key: 'practicas_pe', label: 'Prácticas PE' },
  { key: 'computrabajo', label: 'Computrabajo' },
  { key: 'bumeran', label: 'Bumeran' },
  { key: 'linkedin', label: 'LinkedIn' },
];

const ANTIQUITY_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'Últimos 7 días', value: 7 },
  { label: 'Últimos 14 días (Defecto)', value: 14 },
  { label: 'Últimos 30 días', value: 30 },
  { label: 'Cualquier fecha (Histórico DB)', value: null },
];

const SORT_OPTIONS: { label: string; value: WorkspaceSortBy }[] = [
  { label: 'Modalidad > Score', value: 'modality_score' },
  { label: 'Mayor score', value: 'score' },
  { label: 'Más recientes', value: 'recent' },
];

export function FilterBar({
  filters,
  onChange,
  counts,
  correctedQuery,
  didYouMean = [],
  totalResultsCount,
  isHistoricalMode = false,
}: FilterBarProps) {
  const [showAdvanced, setShowAdvanced] = React.useState(false);

  const handleSearchChange = (value: string) => {
    onChange({ ...filters, search: value });
  };

  const handleTabChange = (crmTab: WorkspaceCrmTab) => {
    onChange({ ...filters, crmTab });
  };

  const handleModalityToggle = (modality: string) => {
    const current = new Set(filters.modalities);
    if (current.has(modality)) {
      current.delete(modality);
    } else {
      current.add(modality);
    }
    onChange({ ...filters, modalities: Array.from(current) });
  };

  const handleSourceToggle = (source: string) => {
    const current = new Set(filters.sources);
    if (current.has(source)) {
      current.delete(source);
    } else {
      current.add(source);
    }
    onChange({ ...filters, sources: Array.from(current) });
  };

  const handleResetFilters = () => {
    onChange(DEFAULT_WORKSPACE_FILTERS);
  };

  const isFiltered =
    filters.search !== '' ||
    filters.crmTab !== 'activas' ||
    filters.modalities.length !== 3 ||
    filters.sources.length > 0 ||
    filters.minScore > 0 ||
    filters.maxAgeDays !== 14 ||
    filters.sortBy !== 'modality_score' ||
    filters.includeDiscardedAi;

  return (
    <div className="w-full space-y-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
      {/* 1. Search Bar */}
      <div className="relative flex items-center">
        <label htmlFor="job-search-input" className="sr-only">
          Buscar vacantes
        </label>
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
          <Search className="h-4 w-4 text-slate-600" />
        </div>
        <input
          id="job-search-input"
          type="search"
          value={filters.search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Buscar por empresa, agencia, cargo, tecnología (Python, SQL...) o distrito..."
          className="w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-10 pr-24 py-2.5 text-sm text-slate-900 placeholder:text-slate-600 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600 transition-colors"
          enterKeyHint="search"
        />
        <div className="absolute right-2 flex items-center gap-1">
          {filters.search && (
            <button
              type="button"
              onClick={() => handleSearchChange('')}
              className="rounded-lg p-1 text-slate-600 hover:bg-slate-200 hover:text-slate-700"
              aria-label="Limpiar búsqueda"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
              showAdvanced || isFiltered
                ? 'bg-blue-50 text-blue-900 border border-blue-200'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
            }`}
            aria-expanded={showAdvanced}
            aria-label="Filtros avanzados"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Filtros</span>
            <ChevronDown
              className={`h-3 w-3 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
      </div>

      {/* 2. Typo suggestions & Agency clue hints */}
      {(correctedQuery || (didYouMean && didYouMean.length > 0)) && (
        <div className="flex flex-wrap items-center gap-2 text-xs pt-1">
          {correctedQuery && (
            <button
              type="button"
              onClick={() => handleSearchChange(correctedQuery)}
              className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 font-semibold text-blue-900 border border-blue-200 hover:bg-blue-100 transition-colors"
            >
              <Sparkles className="h-3 w-3 text-blue-700" />
              <span>¿Quisiste decir: «{correctedQuery}»?</span>
            </button>
          )}

          {didYouMean.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-slate-600">
              <span className="font-medium text-[11px]">Sugerencias:</span>
              {didYouMean.slice(0, 5).map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => handleSearchChange(term)}
                  className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-200 hover:text-slate-900 transition-colors"
                >
                  {term}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. CRM Horizontal Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 scrollbar-none" role="tablist">
        {CRM_TABS.map((tab) => {
          const isActive = filters.crmTab === tab.key;
          const count = counts[tab.key];
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => handleTabChange(tab.key)}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-blue-900 text-white shadow-xs'
                  : 'bg-slate-100/80 text-slate-700 hover:bg-slate-200/80 hover:text-slate-900'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 4. Advanced Filter Drawer / Section */}
      {showAdvanced && (
        <div className="space-y-4 rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 sm:p-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Modalities */}
            <div>
              <span className="block font-semibold text-slate-700 mb-1.5">
                Modalidad de trabajo
              </span>
              <div className="flex flex-wrap gap-1.5">
                {MODALITIES.map((mod) => {
                  const selected = filters.modalities.includes(mod);
                  return (
                    <button
                      key={mod}
                      type="button"
                      onClick={() => handleModalityToggle(mod)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium border transition-colors ${
                        selected
                          ? 'bg-blue-900 text-white border-blue-900 font-semibold'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {mod}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Antiquity */}
            <div>
              <label
                htmlFor="filter-antiquity"
                className="block font-semibold text-slate-700 mb-1.5"
              >
                Antigüedad de publicación
              </label>
              <select
                id="filter-antiquity"
                value={filters.maxAgeDays === null ? 'null' : String(filters.maxAgeDays)}
                onChange={(e) => {
                  const val = e.target.value === 'null' ? null : Number(e.target.value);
                  onChange({ ...filters, maxAgeDays: val });
                }}
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              >
                {ANTIQUITY_OPTIONS.map((opt) => (
                  <option
                    key={String(opt.value)}
                    value={opt.value === null ? 'null' : String(opt.value)}
                  >
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Minimum Score */}
            <div>
              <label
                htmlFor="filter-score"
                className="block font-semibold text-slate-700 mb-1.5"
              >
                Puntaje mínimo de afinidad
              </label>
              <select
                id="filter-score"
                value={String(filters.minScore)}
                onChange={(e) =>
                  onChange({ ...filters, minScore: Number(e.target.value) })
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              >
                <option value="0">Todos los puntajes</option>
                <option value="60">60+ pts (Buena compatibilidad)</option>
                <option value="75">75+ pts (Alta compatibilidad)</option>
                <option value="85">85+ pts (Top recomendado)</option>
              </select>
            </div>

            {/* Sort By */}
            <div>
              <label
                htmlFor="filter-sort"
                className="block font-semibold text-slate-700 mb-1.5"
              >
                Criterio de ordenamiento
              </label>
              <select
                id="filter-sort"
                value={filters.sortBy}
                onChange={(e) =>
                  onChange({ ...filters, sortBy: e.target.value as WorkspaceSortBy })
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Source pills + AI toggle */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200/80">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-slate-700 mr-1">Portales:</span>
              {SOURCES.map((src) => {
                const selected = filters.sources.includes(src.key);
                return (
                  <button
                    key={src.key}
                    type="button"
                    onClick={() => handleSourceToggle(src.key)}
                    className={`rounded-md px-2 py-0.5 text-[11px] font-medium border transition-colors ${
                      selected
                        ? 'bg-slate-800 text-white border-slate-800'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {src.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-4">
              {/* Include AI discarded checkbox */}
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={filters.includeDiscardedAi}
                  onChange={(e) =>
                    onChange({ ...filters, includeDiscardedAi: e.target.checked })
                  }
                  className="rounded border-slate-300 text-blue-900 focus:ring-blue-600 h-3.5 w-3.5"
                />
                <span className="text-slate-700 font-medium">
                  Incluir descartadas por IA (no preprofesionales)
                </span>
              </label>

              {/* Reset button */}
              {isFiltered && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 underline"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Restablecer</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. Active search info indicator */}
      <div className="flex items-center justify-between text-xs text-slate-600 pt-0.5">
        <div>
          Mostrando <strong className="text-slate-900">{totalResultsCount}</strong> vacantes
          {filters.search && (
            <span>
              {' '}
              para «<span className="font-semibold text-slate-800">{filters.search}</span>»
            </span>
          )}
          {isHistoricalMode && (
            <span className="ml-2 inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">
              Histórico DB
            </span>
          )}
        </div>
        {isFiltered && !showAdvanced && (
          <button
            type="button"
            onClick={handleResetFilters}
            className="text-[11px] text-blue-900 font-medium hover:underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>
    </div>
  );
}
