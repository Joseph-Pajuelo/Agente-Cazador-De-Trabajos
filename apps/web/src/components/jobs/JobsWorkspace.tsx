'use client';

import React, { useTransition } from 'react';
import {
  AlertCircle,
  Inbox,
  Loader2,
  ArrowDown,
  Sliders,
  X,
} from 'lucide-react';
import { JobSummary, CrmStatus, ReasoningChain } from '@/lib/domain/types';
import {
  WorkspaceFilters,
  WorkspaceCrmTab,
  WorkspaceSortBy,
  computeCrmCounts,
  requiresHistoricalQuery,
  canMutateCrm,
  applyOptimisticCrmTransition,
  rollbackJobTransition,
  filterAndSortWorkspaceJobs,
  computeDistrictFacetCounts,
  computeCategoryFacetCounts,
  CrmCounts,
} from '@/lib/jobs/workspaceState';
import {
  parseFiltersFromSearchParams,
  serializeFiltersToSearchParams,
  reconcileProfileExclusions,
} from '@/lib/jobs/urlFilterParams';
import { upsertJobState } from '@/actions/crm';
import { getJobDetail, searchHistoricalJobs } from '@/actions/jobs';
import { isPointerEventOutsideRect } from '@/lib/auth/authHelpers';
import { AppShell } from '@/components/layout/AppShell';
import { FilterSidebar, clearFilterCriteria, resetFilterCriteriaToDefaults } from './FilterSidebar';
import { JobCard } from './JobCard';
import { JobDetailDrawer } from './JobDetailDrawer';
import { AuthModal } from '../auth/AuthModal';

export interface JobsWorkspaceProps {
  initialJobs: JobSummary[];
  user: { id: string; email?: string | null } | null;
  profileExcludedDistricts?: string[];
  lastUpdated: string | null;
  isConfigured: boolean;
  initialSearchParams?: Record<string, string | string[] | undefined>;
}

const CRM_WORKSPACE_TABS: { key: WorkspaceCrmTab; label: string; countKey: keyof CrmCounts }[] = [
  { key: 'activas', label: 'Activas', countKey: 'activas' },
  { key: 'to_apply', label: 'Por postular', countKey: 'to_apply' },
  { key: 'favorite', label: 'Destacadas', countKey: 'favorite' },
  { key: 'applied', label: 'Postuladas', countKey: 'applied' },
  { key: 'interview', label: 'Entrevista', countKey: 'interview' },
  { key: 'discarded', label: 'Descartadas', countKey: 'discarded' },
  { key: 'todas', label: 'Todas', countKey: 'todas' },
];

interface JobDetailCacheEntry {
  rawDescription: string | null;
  reasoningChain: ReasoningChain | null;
}

export function JobsWorkspace({
  initialJobs,
  user,
  profileExcludedDistricts,
  lastUpdated,
  isConfigured,
  initialSearchParams,
}: JobsWorkspaceProps) {
  const [, startTransition] = useTransition();

  const [activeUser, setActiveUser] = React.useState<{
    id: string;
    email?: string | null;
  } | null>(user);

  React.useEffect(() => {
    setActiveUser(user);
  }, [user]);

  // 1. URL & Filter Hydration
  const initialParsed = React.useMemo(
    () => parseFiltersFromSearchParams(initialSearchParams ?? {}, profileExcludedDistricts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const [filters, setFilters] = React.useState<WorkspaceFilters>(initialParsed.filters);
  const [hasExplicitExclParam, setHasExplicitExclParam] = React.useState<boolean>(
    initialParsed.hasExplicitExclParam
  );
  const [selectedJobId, setSelectedJobId] = React.useState<number | string | null>(
    initialParsed.urlSelectedJobId ?? null
  );

  // 2. Primary jobs pool
  const [jobs, setJobs] = React.useState<JobSummary[]>(initialJobs);

  React.useEffect(() => {
    setJobs(initialJobs);
  }, [initialJobs]);

  // Reconcile profile exclusions when profileExcludedDistricts changes
  React.useEffect(() => {
    if (profileExcludedDistricts) {
      setFilters((prev) =>
        reconcileProfileExclusions(prev, hasExplicitExclParam, profileExcludedDistricts)
      );
    }
  }, [profileExcludedDistricts, hasExplicitExclParam]);

  // URL Synchronization via replaceState (skip initial mount to avoid hydration mismatch)
  const isInitialMount = React.useRef(true);
  React.useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (typeof window === 'undefined') return;

    const params = serializeFiltersToSearchParams(
      filters,
      profileExcludedDistricts,
      selectedJobId
    );
    const qs = params.toString();
    const nextUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, '', nextUrl);
  }, [filters, profileExcludedDistricts, selectedJobId]);

  // 3. Historical query pagination state (Task 4 nextOffset integration)
  const isHistorical = requiresHistoricalQuery(filters);
  const [historicalJobs, setHistoricalJobs] = React.useState<JobSummary[]>([]);
  const [historicalNextOffset, setHistoricalNextOffset] = React.useState<number>(0);
  const [historicalHasMore, setHistoricalHasMore] = React.useState<boolean>(false);
  const [isLoadingHistorical, setIsLoadingHistorical] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (!isHistorical) {
      setHistoricalJobs([]);
      setHistoricalNextOffset(0);
      setHistoricalHasMore(false);
      return;
    }

    let isMounted = true;
    setIsLoadingHistorical(true);

    searchHistoricalJobs({
      query: filters.search,
      includeDiscardedAi: filters.includeDiscardedAi,
      minScore: filters.minScore,
      modalities: filters.modalities,
      sources: filters.sources,
      maxAgeDays: null,
      offset: 0,
      limit: 20,
      includedDistricts: filters.includedDistricts,
      excludedDistricts: filters.excludedDistricts,
      keepRemoteWhenDistrictFiltered: filters.keepRemoteWhenDistrictFiltered,
      includeLimaUnspecifiedDistrict: filters.includeLimaUnspecifiedDistrict,
      categories: filters.categories,
      roleLevels: filters.roleLevels,
      englishOnly: filters.englishOnly,
      englishLevels: filters.englishLevels,
      salaryFilter: filters.salaryFilter,
    })
      .then((res) => {
        if (!isMounted) return;
        setHistoricalJobs(res.jobs);
        setHistoricalNextOffset(res.nextOffset ?? res.jobs.length);
        setHistoricalHasMore(res.hasMore);
      })
      .catch((err) => {
        console.error('Historical search failed:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingHistorical(false);
      });

    return () => {
      isMounted = false;
    };
  }, [
    isHistorical,
    filters.search,
    filters.includeDiscardedAi,
    filters.minScore,
    filters.modalities,
    filters.sources,
    filters.includedDistricts,
    filters.excludedDistricts,
    filters.keepRemoteWhenDistrictFiltered,
    filters.includeLimaUnspecifiedDistrict,
    filters.categories,
    filters.roleLevels,
    filters.englishOnly,
    filters.englishLevels,
    filters.salaryFilter,
  ]);

  const handleLoadMoreHistorical = async () => {
    if (isLoadingHistorical || !historicalHasMore) return;
    setIsLoadingHistorical(true);

    try {
      const currentOffset = historicalNextOffset;
      const res = await searchHistoricalJobs({
        query: filters.search,
        includeDiscardedAi: filters.includeDiscardedAi,
        minScore: filters.minScore,
        modalities: filters.modalities,
        sources: filters.sources,
        maxAgeDays: null,
        offset: currentOffset,
        limit: 20,
        includedDistricts: filters.includedDistricts,
        excludedDistricts: filters.excludedDistricts,
        keepRemoteWhenDistrictFiltered: filters.keepRemoteWhenDistrictFiltered,
        includeLimaUnspecifiedDistrict: filters.includeLimaUnspecifiedDistrict,
        categories: filters.categories,
        roleLevels: filters.roleLevels,
        englishOnly: filters.englishOnly,
        englishLevels: filters.englishLevels,
        salaryFilter: filters.salaryFilter,
      });

      setHistoricalJobs((prev) => [...prev, ...res.jobs]);
      setHistoricalNextOffset(res.nextOffset ?? (currentOffset + res.jobs.length));
      setHistoricalHasMore(res.hasMore);
    } catch (err) {
      console.error('Error loading more historical jobs:', err);
    } finally {
      setIsLoadingHistorical(false);
    }
  };

  // 4. Effective Pool, Facets, Filtering & Sorting
  const effectivePool = React.useMemo(() => {
    if (isHistorical && historicalJobs.length > 0) {
      const seen = new Set<string>();
      const combined: JobSummary[] = [];

      for (const j of [...jobs, ...historicalJobs]) {
        const key = j.deduplication_hash || String(j.id);
        if (!seen.has(key)) {
          seen.add(key);
          combined.push(j);
        }
      }
      return combined;
    }
    return jobs;
  }, [jobs, historicalJobs, isHistorical]);

  const counts = React.useMemo(
    () =>
      computeCrmCounts(effectivePool, {
        includeDiscardedAi: filters.includeDiscardedAi,
      }),
    [effectivePool, filters.includeDiscardedAi]
  );

  const districtCounts = React.useMemo(
    () => computeDistrictFacetCounts(effectivePool, filters),
    [effectivePool, filters]
  );

  const categoryCounts = React.useMemo(
    () => computeCategoryFacetCounts(effectivePool, filters),
    [effectivePool, filters]
  );

  const { jobs: filteredJobs, didYouMean, correctedQuery } = React.useMemo(
    () => filterAndSortWorkspaceJobs(effectivePool, filters),
    [effectivePool, filters]
  );

  // 5. Selected Job & Navigation in Drawer
  const selectedJob = React.useMemo(() => {
    if (!selectedJobId) return null;
    return filteredJobs.find((j) => String(j.id) === String(selectedJobId)) || null;
  }, [filteredJobs, selectedJobId]);

  const selectedJobIndex = React.useMemo(() => {
    if (!selectedJob) return -1;
    return filteredJobs.findIndex((j) => String(j.id) === String(selectedJob.id));
  }, [filteredJobs, selectedJob]);

  const hasPrev = selectedJobIndex > 0;
  const hasNext = selectedJobIndex >= 0 && selectedJobIndex < filteredJobs.length - 1;

  const handlePrevJob = () => {
    if (hasPrev) {
      setSelectedJobId(filteredJobs[selectedJobIndex - 1].id);
    }
  };

  const handleNextJob = () => {
    if (hasNext) {
      setSelectedJobId(filteredJobs[selectedJobIndex + 1].id);
    }
  };

  const handleCloseDetail = () => {
    setSelectedJobId(null);
  };

  // 6. In-Memory Cache & Race-Condition Safe getJobDetail
  const detailCacheRef = React.useRef<Map<number, JobDetailCacheEntry>>(new Map());
  const [currentDetail, setCurrentDetail] = React.useState<JobDetailCacheEntry | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (!selectedJob) {
      setCurrentDetail(null);
      setIsLoadingDetail(false);
      return;
    }

    const numericId = Number(selectedJob.id);
    if (!numericId || numericId <= 0) {
      setCurrentDetail({
        rawDescription:
          'raw_description' in selectedJob &&
          typeof (selectedJob as { raw_description?: unknown }).raw_description === 'string'
            ? (selectedJob as { raw_description?: string }).raw_description ?? null
            : null,
        reasoningChain: selectedJob.reasoning_chain ?? null,
      });
      setIsLoadingDetail(false);
      return;
    }

    const cached = detailCacheRef.current.get(numericId);
    if (cached) {
      setCurrentDetail(cached);
      setIsLoadingDetail(false);
      return;
    }

    let isMounted = true;
    setIsLoadingDetail(true);

    getJobDetail(numericId)
      .then((res) => {
        const entry: JobDetailCacheEntry = {
          rawDescription: res.rawDescription,
          reasoningChain: res.reasoningChain,
        };
        detailCacheRef.current.set(numericId, entry);

        // Guard against race conditions
        if (isMounted && String(selectedJob.id) === String(numericId)) {
          setCurrentDetail(entry);
          setIsLoadingDetail(false);
        }
      })
      .catch((err) => {
        console.error('getJobDetail failed:', err);
        if (isMounted && String(selectedJob.id) === String(numericId)) {
          setIsLoadingDetail(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedJob]);

  // 7. CRM State Mutations & Optimistic Rollback
  const [pendingCrmJobId, setPendingCrmJobId] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = React.useState<boolean>(false);
  const [authPrompt, setAuthPrompt] = React.useState<string>(
    'Inicia sesión o crea una cuenta gratis para clasificar y dar seguimiento a esta postulación en tu radar personal.'
  );

  const handleQuickCrmChange = (job: JobSummary, status: CrmStatus) => {
    if (!canMutateCrm(activeUser)) {
      setAuthPrompt(
        'Inicia sesión o crea tu cuenta para guardar y clasificar vacantes en tu radar personal.'
      );
      setIsAuthModalOpen(true);
      return;
    }

    const prevJobState = {
      user_status: job.user_status,
      applied_at: job.applied_at,
      user_notes: job.user_notes,
    };
    const targetId = job.id;

    setPendingCrmJobId(String(targetId));

    startTransition(() => {
      setJobs((prev) => applyOptimisticCrmTransition(prev, targetId, status));
      if (historicalJobs.length > 0) {
        setHistoricalJobs((prev) => applyOptimisticCrmTransition(prev, targetId, status));
      }
    });

    const numericId = Number(targetId);
    if (numericId > 0) {
      upsertJobState({
        listingId: numericId,
        status,
        notes: job.user_notes || undefined,
      })
        .then((res) => {
          if (!res.ok) {
            console.error('Failed to update CRM status:', res.error);
            setJobs((prev) => rollbackJobTransition(prev, targetId, prevJobState));
            if (historicalJobs.length > 0) {
              setHistoricalJobs((prev) =>
                rollbackJobTransition(prev, targetId, prevJobState)
              );
            }
            setActionError('No se pudo guardar el estado de la postulación. Intenta nuevamente.');
            setTimeout(() => setActionError(null), 4000);
          }
        })
        .catch((err) => {
          console.error('Error updating CRM status:', err);
          setJobs((prev) => rollbackJobTransition(prev, targetId, prevJobState));
          if (historicalJobs.length > 0) {
            setHistoricalJobs((prev) =>
              rollbackJobTransition(prev, targetId, prevJobState)
            );
          }
          setActionError('Error de red al sincronizar el estado.');
          setTimeout(() => setActionError(null), 4000);
        })
        .finally(() => {
          setPendingCrmJobId(null);
        });
    } else {
      setPendingCrmJobId(null);
    }
  };

  const handleSaveNotes = async (notes: string): Promise<boolean> => {
    if (!selectedJob) return false;

    if (!canMutateCrm(activeUser)) {
      setAuthPrompt(
        'Inicia sesión para guardar notas personales sobre esta convocatoria.'
      );
      setIsAuthModalOpen(true);
      return false;
    }

    const prevJobState = {
      user_status: selectedJob.user_status,
      applied_at: selectedJob.applied_at,
      user_notes: selectedJob.user_notes,
    };
    const targetId = selectedJob.id;
    const currentStatus = selectedJob.user_status || 'to_apply';

    startTransition(() => {
      setJobs((prev) =>
        applyOptimisticCrmTransition(prev, targetId, currentStatus, notes)
      );
      if (historicalJobs.length > 0) {
        setHistoricalJobs((prev) =>
          applyOptimisticCrmTransition(prev, targetId, currentStatus, notes)
        );
      }
    });

    const numericId = Number(targetId);
    if (numericId > 0) {
      try {
        const res = await upsertJobState({
          listingId: numericId,
          status: currentStatus,
          notes,
        });

        if (!res.ok) {
          setJobs((prev) => rollbackJobTransition(prev, targetId, prevJobState));
          if (historicalJobs.length > 0) {
            setHistoricalJobs((prev) =>
              rollbackJobTransition(prev, targetId, prevJobState)
            );
          }
          setActionError('No se pudo guardar la nota en el servidor.');
          setTimeout(() => setActionError(null), 4000);
          return false;
        }
        return true;
      } catch {
        setJobs((prev) => rollbackJobTransition(prev, targetId, prevJobState));
        if (historicalJobs.length > 0) {
          setHistoricalJobs((prev) =>
            rollbackJobTransition(prev, targetId, prevJobState)
          );
        }
        setActionError('Error de red al guardar la nota.');
        setTimeout(() => setActionError(null), 4000);
        return false;
      }
    }
    return false;
  };

  // 8. Filter sidebar handlers
  const handleClearAll = () => {
    setHasExplicitExclParam(true);
    setFilters((prev) => clearFilterCriteria(prev));
  };

  const handleResetToDefaults = React.useCallback(() => {
    setHasExplicitExclParam(false);
    setFilters((prev) => resetFilterCriteriaToDefaults(prev, profileExcludedDistricts));
  }, [profileExcludedDistricts]);

  const handleResetHome = React.useCallback(() => {
    setSelectedJobId(null);
    setHasExplicitExclParam(false);
    setFilters((prev) => ({
      ...resetFilterCriteriaToDefaults(prev, profileExcludedDistricts),
      crmTab: 'activas',
    }));
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', '/');
    }
  }, [profileExcludedDistricts]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResetEvent = () => handleResetHome();
    window.addEventListener('jobhunter:reset-home', onResetEvent);
    return () => {
      window.removeEventListener('jobhunter:reset-home', onResetEvent);
    };
  }, [handleResetHome]);

  // 9. Mobile Filter Dialog (< 1024px)
  const mobileFilterDialogRef = React.useRef<HTMLDialogElement | null>(null);
  const mobileFilterPointerDownOutsideRef = React.useRef<boolean>(false);

  const openMobileFilters = () => {
    const dialog = mobileFilterDialogRef.current;
    if (dialog && !dialog.open) {
      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else {
        dialog.setAttribute('open', '');
      }
    }
  };

  const closeMobileFilters = () => {
    const dialog = mobileFilterDialogRef.current;
    if (dialog && dialog.open) {
      dialog.returnValue = '';
      if (typeof dialog.close === 'function') {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
    }
  };

  const handleMobileFilterPointerDown = (e: React.PointerEvent<HTMLDialogElement>) => {
    const dialog = mobileFilterDialogRef.current;
    if (!dialog || e.target !== dialog) {
      mobileFilterPointerDownOutsideRef.current = false;
      return;
    }
    const rect = dialog.getBoundingClientRect();
    mobileFilterPointerDownOutsideRef.current = isPointerEventOutsideRect(
      rect,
      e.clientX,
      e.clientY
    );
  };

  const handleMobileFilterPointerUp = (e: React.PointerEvent<HTMLDialogElement>) => {
    const dialog = mobileFilterDialogRef.current;
    if (!dialog || e.target !== dialog) {
      mobileFilterPointerDownOutsideRef.current = false;
      return;
    }
    const rect = dialog.getBoundingClientRect();
    const isOutside = isPointerEventOutsideRect(rect, e.clientX, e.clientY);
    if (mobileFilterPointerDownOutsideRef.current && isOutside) {
      closeMobileFilters();
    }
    mobileFilterPointerDownOutsideRef.current = false;
  };

  const handleMobileFilterCancel = (e: React.SyntheticEvent<HTMLDialogElement, Event>) => {
    e.preventDefault();
    closeMobileFilters();
  };

  // Calculate active filter count for the mobile button badge
  const activeFilterCount = React.useMemo(() => {
    let count = 0;
    if (filters.search.trim().length > 0) count++;
    count += filters.includedDistricts.length;

    const defaultExcl = profileExcludedDistricts ?? [];
    const isDefaultExcl =
      filters.excludedDistricts.length === defaultExcl.length &&
      filters.excludedDistricts.every((d, i) => d === defaultExcl[i]);
    if (!isDefaultExcl) {
      count += filters.excludedDistricts.length === 0 ? 1 : filters.excludedDistricts.length;
    }

    if (filters.englishOnly) count++;
    count += filters.englishLevels.length;
    count += filters.categories.length;

    const isDefaultRoles =
      filters.roleLevels.length === 1 && filters.roleLevels[0] === 'preprofesional';
    if (!isDefaultRoles) {
      count += filters.roleLevels.length;
    }

    if (filters.salaryFilter !== 'any') count++;

    const defaultMods = ['Híbrido', 'Presencial', 'Remoto'];
    const isDefaultMods =
      filters.modalities.length === defaultMods.length &&
      defaultMods.every((m) => filters.modalities.includes(m));
    if (!isDefaultMods) count += filters.modalities.length;

    count += filters.sources.length;
    if (filters.includeDiscardedAi) count++;
    if (filters.maxAgeDays !== 14) count++;

    return count;
  }, [filters, profileExcludedDistricts]);

  const mobileFilterTrigger = (
    <button
      type="button"
      onClick={openMobileFilters}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors"
      aria-label="Abrir filtros de búsqueda"
    >
      <Sliders className="h-3.5 w-3.5 text-slate-500" />
      <span>Filtros</span>
      {activeFilterCount > 0 && (
        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#1E3A8A] px-1 text-[10px] font-bold text-white">
          {activeFilterCount}
        </span>
      )}
    </button>
  );

  const filterFeedAnimationKey = React.useMemo(
    () =>
      [
        filters.crmTab,
        filters.sortBy,
        filters.includedDistricts.join(','),
        filters.excludedDistricts.join(','),
        filters.categories.join(','),
        filters.roleLevels.join(','),
        filters.modalities.join(','),
        filters.sources.join(','),
        filters.salaryFilter,
        String(filters.maxAgeDays),
        String(filters.minScore),
        String(filters.englishOnly),
        filters.englishLevels.join(','),
        String(filters.includeDiscardedAi),
        String(filters.keepRemoteWhenDistrictFiltered),
        String(filters.includeLimaUnspecifiedDistrict),
        filters.search.trim().length > 0 ? 'has-search' : 'no-search',
      ].join('|'),
    [filters]
  );

  return (
    <AppShell
      user={activeUser}
      pipelineCounts={{
        favoriteCount: counts.favorite,
        appliedCount: counts.applied,
        interviewCount: counts.interview,
        discardedCount: counts.discarded,
        totalTracked: counts.todas,
      }}
      lastUpdated={lastUpdated}
      mobileFilterTrigger={mobileFilterTrigger}
      onLogoClick={handleResetHome}
      onOpenAuthModal={() => {
        setAuthPrompt(
          'Inicia sesión o crea una cuenta gratis para clasificar y dar seguimiento a tus postulaciones.'
        );
        setIsAuthModalOpen(true);
      }}
    >
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="space-y-5">
          {/* 1. Supabase unconfigured notice banner */}
          {!isConfigured && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-4 text-xs sm:text-sm text-amber-900 shadow-2xs flex items-start gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold text-amber-950">
                  Modo Demostración / Catálogo Público Activo
                </div>
                <p className="text-amber-800 leading-relaxed">
                  Supabase aún no está enlazado a las variables de entorno de producción. Estás
                  visualizando el radar público de convocatorias preprofesionales con búsqueda
                  inteligente y filtros en vivo. Para guardar postulaciones y sincronizar estados CRM,
                  agrega las credenciales de tu proyecto Supabase en{' '}
                  <code className="bg-amber-100 font-mono text-xs px-1.5 py-0.5 rounded font-bold">
                    apps/web/.env.local
                  </code>.
                </p>
              </div>
            </div>
          )}

          {/* Action error banner on failed mutations */}
          {actionError && (
            <div
              role="alert"
              aria-live="polite"
              className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 flex items-center justify-between"
            >
              <span>{actionError}</span>
              <button
                type="button"
                onClick={() => setActionError(null)}
                className="text-red-600 hover:text-red-800 font-bold px-2 py-0.5"
                aria-label="Cerrar aviso"
              >
                ✕
              </button>
            </div>
          )}

          {/* 2. Responsive 2-column workspace */}
          <div className="grid grid-cols-1 lg:grid-cols-[296px_1fr] gap-6 items-start">
            {/* Desktop Sticky Left FilterSidebar */}
            <div className="hidden lg:block sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto">
              <FilterSidebar
                filters={filters}
                onChange={setFilters}
                districtCounts={districtCounts}
                categoryCounts={categoryCounts}
                totalCount={filteredJobs.length}
                correctedQuery={correctedQuery}
                didYouMean={didYouMean}
                profileExcludedDistricts={profileExcludedDistricts}
                onClearAll={handleClearAll}
                onResetToDefaults={handleResetToDefaults}
              />
            </div>

            {/* Right Feed (1fr) */}
            <div className="space-y-4 min-w-0">
              {/* CRM Tabs bar */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-[#E2E8F0]">
                {CRM_WORKSPACE_TABS.map((tab) => {
                  const isActive = filters.crmTab === tab.key;
                  const tabCount = counts[tab.countKey];
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setFilters((prev) => ({ ...prev, crmTab: tab.key }))}
                      className={`interactive-pill inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold transition-all cursor-pointer ${
                        isActive
                          ? 'bg-[#2563EB] text-white shadow-sm'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-blue-50/60 hover:text-[#2563EB] hover:border-blue-200'
                      }`}
                      aria-pressed={isActive}
                    >
                      <span>{tab.label}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-extrabold ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {tabCount}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Result summary and sort dropdown */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <span className="font-bold text-slate-900 text-base">
                    {filteredJobs.length === 1
                      ? '1 vacante encontrada'
                      : `${filteredJobs.length} vacantes encontradas`}
                  </span>
                  {isHistorical && (
                    <span className="rounded-lg bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-800 border border-amber-200">
                      Histórico DB
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <label
                    htmlFor="workspace-sort-select"
                    className="text-sm text-slate-600 font-semibold"
                  >
                    Ordenar por:
                  </label>
                  <select
                    id="workspace-sort-select"
                    value={filters.sortBy}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        sortBy: e.target.value as WorkspaceSortBy,
                      }))
                    }
                    className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 shadow-2xs focus:border-[#2563EB] focus:outline-none"
                  >
                    <option value="recent">Más recientes</option>
                    <option value="modality_score">Prioridad por modalidad</option>
                  </select>
                </div>
              </div>

              {/* Job Cards list */}
              {filteredJobs.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-xs">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-600 mb-3">
                    <Inbox className="h-6 w-6" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900">
                    No se encontraron vacantes con los filtros seleccionados
                  </h3>
                  <p className="mt-1 max-w-sm text-xs sm:text-sm text-slate-600">
                    Prueba ajustando los términos de búsqueda, ampliando la fecha a «Cualquier fecha»
                    o restableciendo los filtros.
                  </p>
                  <button
                    type="button"
                    onClick={handleResetToDefaults}
                    className="mt-4 rounded-xl bg-[#1E3A8A] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-800 transition-colors"
                  >
                    Restaurar perfil
                  </button>
                </div>
              ) : (
                <div key={filterFeedAnimationKey} className="space-y-3 feed-filter-enter feed-stagger-cards">
                  {filteredJobs.map((job) => (
                    <JobCard
                      key={job.deduplication_hash || job.id}
                      job={job}
                      isSelected={selectedJob ? String(selectedJob.id) === String(job.id) : false}
                      onSelect={() => setSelectedJobId(job.id)}
                      onQuickCrmChange={handleQuickCrmChange}
                      isPendingCrm={pendingCrmJobId === String(job.id)}
                    />
                  ))}

                  {/* Historical Load More */}
                  {isHistorical && (
                    <div className="pt-2 text-center">
                      {historicalHasMore ? (
                        <button
                          type="button"
                          onClick={handleLoadMoreHistorical}
                          disabled={isLoadingHistorical}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50 transition-colors"
                        >
                          {isLoadingHistorical ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#1E3A8A]" />
                              <span>Cargando más vacantes históricas...</span>
                            </>
                          ) : (
                            <>
                              <ArrowDown className="h-3.5 w-3.5 text-slate-500" />
                              <span>Cargar más vacantes históricas</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <p className="text-xs text-slate-500 italic">
                          Has llegado al final de las convocatorias históricas.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* 3. Slide-Over JobDetailDrawer */}
      <JobDetailDrawer
        job={selectedJob}
        rawDescription={currentDetail?.rawDescription ?? null}
        reasoningChain={currentDetail?.reasoningChain ?? null}
        isLoadingDetail={isLoadingDetail}
        onClose={handleCloseDetail}
        onPrevJob={handlePrevJob}
        onNextJob={handleNextJob}
        hasPrev={hasPrev}
        hasNext={hasNext}
        onStatusChange={(status) => {
          if (selectedJob) handleQuickCrmChange(selectedJob, status);
        }}
        onSaveNotes={handleSaveNotes}
      />

      {/* 4. Mobile Filter Sidebar Drawer (< 1024px) */}
      <dialog
        ref={mobileFilterDialogRef}
        id="mobile-filter-drawer"
        aria-labelledby="mobile-filter-title"
        className="mobile-filter-drawer overscroll-contain"
        onPointerDown={handleMobileFilterPointerDown}
        onPointerUp={handleMobileFilterPointerUp}
        onCancel={handleMobileFilterCancel}
      >
        <div className="flex h-full flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 p-4 bg-slate-50">
            <span id="mobile-filter-title" className="font-bold text-slate-900 text-sm">
              Filtros de Búsqueda
            </span>
            <button
              type="button"
              onClick={closeMobileFilters}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200 transition-colors"
              aria-label="Cerrar filtros"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <FilterSidebar
              filters={filters}
              onChange={setFilters}
              districtCounts={districtCounts}
              categoryCounts={categoryCounts}
              totalCount={filteredJobs.length}
              correctedQuery={correctedQuery}
              didYouMean={didYouMean}
              profileExcludedDistricts={profileExcludedDistricts}
              onClearAll={handleClearAll}
              onResetToDefaults={handleResetToDefaults}
            />
          </div>
        </div>
      </dialog>

      {/* 5. Guest Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        actionPrompt={authPrompt}
        onAuthSuccess={(authedUser) => {
          setActiveUser(authedUser);
          setIsAuthModalOpen(false);
        }}
      />
    </AppShell>
  );
}
