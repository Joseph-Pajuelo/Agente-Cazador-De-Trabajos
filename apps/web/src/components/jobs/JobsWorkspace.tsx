'use client';

import React, { useTransition } from 'react';
import { AlertCircle, Inbox, Loader2, ArrowDown } from 'lucide-react';
import { JobSummary, CrmStatus } from '@/lib/domain/types';
import {
  WorkspaceFilters,
  DEFAULT_WORKSPACE_FILTERS,
  computeCrmCounts,
  requiresHistoricalQuery,
  canMutateCrm,
  applyOptimisticCrmTransition,
  filterAndSortWorkspaceJobs,
} from '@/lib/jobs/workspaceState';
import { upsertJobState } from '@/actions/crm';
import { getJobDescription, searchHistoricalJobs } from '@/actions/jobs';
import { FilterBar } from './FilterBar';
import { JobCard } from './JobCard';
import { JobDetail } from './JobDetail';
import { AuthModal } from '../auth/AuthModal';

interface JobsWorkspaceProps {
  initialJobs: JobSummary[];
  user: { id: string; email?: string | null } | null;
  lastUpdated: string | null;
  isConfigured: boolean;
  onOpenAuthModal?: () => void;
}

export function JobsWorkspace({
  initialJobs,
  user,
  isConfigured,
}: JobsWorkspaceProps) {
  const [, startTransition] = useTransition();

  // Primary workspace state
  const [jobs, setJobs] = React.useState<JobSummary[]>(initialJobs);
  const [filters, setFilters] = React.useState<WorkspaceFilters>(
    DEFAULT_WORKSPACE_FILTERS
  );

  // Synchronize initialJobs when props change (e.g., after router.refresh() upon login)
  React.useEffect(() => {
    setJobs(initialJobs);
  }, [initialJobs]);

  // Selected job
  const [selectedJobId, setSelectedJobId] = React.useState<number | string | null>(
    initialJobs.length > 0 ? initialJobs[0].id : null
  );

  // Explicit mobile drawer visibility (starts closed on mobile to prevent full-screen lock)
  const [isMobileDetailOpen, setIsMobileDetailOpen] = React.useState<boolean>(false);

  // Description cache: listingId -> text
  const [descriptions, setDescriptions] = React.useState<Record<string, string>>({});
  const descriptionsRef = React.useRef<Record<string, string>>({});
  descriptionsRef.current = descriptions;

  // Track the exact job ID currently being loaded to eliminate race conditions
  const [loadingDescriptionJobId, setLoadingDescriptionJobId] = React.useState<string | null>(null);

  // Guest AuthModal
  const [isAuthModalOpen, setIsAuthModalOpen] = React.useState(false);
  const [authPrompt, setAuthPrompt] = React.useState<string>(
    'Inicia sesión o crea una cuenta gratis para guardar y gestionar vacantes en tu radar personal.'
  );

  // Transient error message for failed mutations
  const [actionError, setActionError] = React.useState<string | null>(null);

  // Historical query pagination state
  const [historicalJobs, setHistoricalJobs] = React.useState<JobSummary[]>([]);
  const [historicalOffset, setHistoricalOffset] = React.useState<number>(0);
  const [historicalHasMore, setHistoricalHasMore] = React.useState<boolean>(false);
  const [isLoadingHistorical, setIsLoadingHistorical] = React.useState<boolean>(false);

  const isHistorical = requiresHistoricalQuery(filters);

  // Handle Escape key to close mobile drawer
  React.useEffect(() => {
    if (!isMobileDetailOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMobileDetailOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileDetailOpen]);

  // Pool of jobs for filtering
  const effectivePool = React.useMemo(() => {
    if (isHistorical && historicalJobs.length > 0) {
      // Merge unique by deduplication_hash or id
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

  // Compute live counts
  const counts = React.useMemo(
    () =>
      computeCrmCounts(effectivePool, {
        includeDiscardedAi: filters.includeDiscardedAi,
      }),
    [effectivePool, filters.includeDiscardedAi]
  );

  // Filter and sort
  const { jobs: filteredJobs, didYouMean, correctedQuery } = React.useMemo(
    () => filterAndSortWorkspaceJobs(effectivePool, filters),
    [effectivePool, filters]
  );

  // Currently selected job object
  const selectedJob = React.useMemo(() => {
    if (!selectedJobId) return filteredJobs[0] || null;
    return (
      filteredJobs.find((j) => String(j.id) === String(selectedJobId)) ||
      filteredJobs[0] ||
      null
    );
  }, [filteredJobs, selectedJobId]);

  // Derived loading state comparing against currently selected job
  const isLoadingDescription = Boolean(
    selectedJob && loadingDescriptionJobId === String(selectedJob.id)
  );

  // Fetch description when selected job changes
  const selectedListingId = selectedJob ? selectedJob.id : null;
  React.useEffect(() => {
    if (!selectedListingId) {
      setLoadingDescriptionJobId(null);
      return;
    }

    const idKey = String(selectedListingId);
    if (descriptionsRef.current[idKey] !== undefined) {
      setLoadingDescriptionJobId(null);
      return; // Already loaded or cached
    }

    const numericId = Number(selectedListingId);
    if (!numericId || numericId <= 0) {
      setLoadingDescriptionJobId(null);
      return;
    }

    let isMounted = true;
    setLoadingDescriptionJobId(idKey);

    getJobDescription(numericId)
      .then((res) => {
        if (!isMounted) return;
        setDescriptions((prev) => ({
          ...prev,
          [idKey]: res.rawDescription || '',
        }));
      })
      .catch((err) => {
        console.error('Failed to fetch job description:', err);
      })
      .finally(() => {
        if (isMounted) {
          setLoadingDescriptionJobId((current) =>
            current === idKey ? null : current
          );
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedListingId]);

  // Trigger historical search when "Cualquier fecha" is selected
  const filterSearch = filters.search;
  const filterMinScore = filters.minScore;
  const filterIncludeAi = filters.includeDiscardedAi;
  const modalitiesStr = filters.modalities.join(',');
  const sourcesStr = filters.sources.join(',');

  React.useEffect(() => {
    if (!isHistorical) {
      setHistoricalJobs([]);
      setHistoricalOffset(0);
      setHistoricalHasMore(false);
      return;
    }

    let isMounted = true;
    setIsLoadingHistorical(true);

    const activeModalities = modalitiesStr ? modalitiesStr.split(',') : [];
    const activeSources = sourcesStr ? sourcesStr.split(',') : [];

    searchHistoricalJobs({
      query: filterSearch,
      includeDiscardedAi: filterIncludeAi,
      minScore: filterMinScore,
      modalities: activeModalities,
      sources: activeSources,
      maxAgeDays: null,
      offset: 0,
      limit: 20,
    })
      .then((res) => {
        if (!isMounted) return;
        setHistoricalJobs(res.jobs);
        setHistoricalOffset(res.jobs.length);
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
    filterSearch,
    filterMinScore,
    filterIncludeAi,
    modalitiesStr,
    sourcesStr,
  ]);

  const handleLoadMoreHistorical = async () => {
    if (isLoadingHistorical || !historicalHasMore) return;
    setIsLoadingHistorical(true);

    try {
      const activeModalities = modalitiesStr ? modalitiesStr.split(',') : [];
      const activeSources = sourcesStr ? sourcesStr.split(',') : [];

      const res = await searchHistoricalJobs({
        query: filterSearch,
        includeDiscardedAi: filterIncludeAi,
        minScore: filterMinScore,
        modalities: activeModalities,
        sources: activeSources,
        maxAgeDays: null,
        offset: historicalOffset,
        limit: 20,
      });

      setHistoricalJobs((prev) => [...prev, ...res.jobs]);
      setHistoricalOffset((prev) => prev + res.jobs.length);
      setHistoricalHasMore(res.hasMore);
    } catch (err) {
      console.error('Error loading more historical jobs:', err);
    } finally {
      setIsLoadingHistorical(false);
    }
  };

  // Intercept guest CRM mutations with robust rollback on server failure
  const handleCrmStatusChange = (status: CrmStatus) => {
    if (!selectedJob) return;

    if (!canMutateCrm(user)) {
      setAuthPrompt(
        'Inicia sesión o crea tu cuenta para guardar y clasificar vacantes en tu radar personal.'
      );
      setIsAuthModalOpen(true);
      return;
    }

    // Capture snapshots for rollback
    const prevJobs = jobs;
    const prevHistorical = historicalJobs;
    const targetId = selectedJob.id;

    startTransition(() => {
      setJobs((prev) =>
        applyOptimisticCrmTransition(prev, targetId, status)
      );
      if (historicalJobs.length > 0) {
        setHistoricalJobs((prev) =>
          applyOptimisticCrmTransition(prev, targetId, status)
        );
      }
    });

    const numericId = Number(targetId);
    if (numericId > 0) {
      upsertJobState({
        listingId: numericId,
        status,
        notes: selectedJob.user_notes || undefined,
      })
        .then((res) => {
          if (!res.ok) {
            console.error('Failed to persist CRM status:', res.error);
            // Rollback optimistic update
            setJobs(prevJobs);
            setHistoricalJobs(prevHistorical);
            setActionError('No se pudo guardar el estado de la postulación. Intenta nuevamente.');
            setTimeout(() => setActionError(null), 4000);
          }
        })
        .catch((err) => {
          console.error('Exception persisting CRM status:', err);
          // Rollback optimistic update
          setJobs(prevJobs);
          setHistoricalJobs(prevHistorical);
          setActionError('Error de red al sincronizar el estado.');
          setTimeout(() => setActionError(null), 4000);
        });
    }
  };

  const handleToggleFavorite = (job: JobSummary) => {
    if (!canMutateCrm(user)) {
      setAuthPrompt(
        'Inicia sesión para marcar vacantes como destacadas en tu radar personal.'
      );
      setIsAuthModalOpen(true);
      return;
    }

    const prevJobs = jobs;
    const prevHistorical = historicalJobs;
    const nextStatus: CrmStatus =
      job.user_status === 'favorite' ? 'to_apply' : 'favorite';

    startTransition(() => {
      setJobs((prev) =>
        applyOptimisticCrmTransition(prev, job.id, nextStatus)
      );
      if (historicalJobs.length > 0) {
        setHistoricalJobs((prev) =>
          applyOptimisticCrmTransition(prev, job.id, nextStatus)
        );
      }
    });

    const numericId = Number(job.id);
    if (numericId > 0) {
      upsertJobState({
        listingId: numericId,
        status: nextStatus,
        notes: job.user_notes || undefined,
      })
        .then((res) => {
          if (!res.ok) {
            console.error('Failed to toggle favorite:', res.error);
            setJobs(prevJobs);
            setHistoricalJobs(prevHistorical);
            setActionError('No se pudo actualizar la vacante destacada.');
            setTimeout(() => setActionError(null), 4000);
          }
        })
        .catch(() => {
          setJobs(prevJobs);
          setHistoricalJobs(prevHistorical);
          setActionError('Error de red al actualizar vacante destacada.');
          setTimeout(() => setActionError(null), 4000);
        });
    }
  };

  const handleSaveNotes = async (notes: string): Promise<boolean> => {
    if (!selectedJob) return false;

    if (!canMutateCrm(user)) {
      setAuthPrompt(
        'Inicia sesión para guardar notas personales sobre esta convocatoria.'
      );
      setIsAuthModalOpen(true);
      return false;
    }

    const prevJobs = jobs;
    const prevHistorical = historicalJobs;
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
          setJobs(prevJobs);
          setHistoricalJobs(prevHistorical);
          setActionError('No se pudo guardar la nota en el servidor.');
          setTimeout(() => setActionError(null), 4000);
          return false;
        }
        return true;
      } catch {
        setJobs(prevJobs);
        setHistoricalJobs(prevHistorical);
        setActionError('Error de red al guardar la nota.');
        setTimeout(() => setActionError(null), 4000);
        return false;
      }
    }
    return false;
  };

  const handleCardSelect = (jobId: number | string) => {
    setSelectedJobId(jobId);
    setIsMobileDetailOpen(true);
  };

  return (
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

      {/* Error alert on failed mutations */}
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

      {/* 2. Top Filter and Search Bar */}
      <FilterBar
        filters={filters}
        onChange={setFilters}
        counts={counts}
        correctedQuery={correctedQuery}
        didYouMean={didYouMean}
        totalResultsCount={filteredJobs.length}
        isHistoricalMode={isHistorical}
      />

      {/* 3. Master-Detail Layout */}
      {filteredJobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-xs">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-600 mb-3">
            <Inbox className="h-6 w-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900">
            No se encontraron vacantes con los filtros seleccionados
          </h3>
          <p className="mt-1 max-w-sm text-xs sm:text-sm text-slate-600">
            Prueba ajustando los términos de búsqueda, ampliando la antigüedad a «Cualquier
            fecha» o restableciendo los filtros.
          </p>
          <button
            type="button"
            onClick={() => setFilters(DEFAULT_WORKSPACE_FILTERS)}
            className="mt-4 rounded-xl bg-blue-900 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-800 transition-colors"
          >
            Restablecer todos los filtros
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Master List (5 columns on desktop) */}
          <div className="lg:col-span-5 xl:col-span-5 space-y-3">
            {filteredJobs.map((job) => (
              <JobCard
                key={job.deduplication_hash || job.id}
                job={job}
                isSelected={selectedJob ? String(selectedJob.id) === String(job.id) : false}
                onSelect={() => handleCardSelect(job.id)}
                onToggleFavorite={handleToggleFavorite}
              />
            ))}

            {/* Pagination / Load more for historical query */}
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
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Cargando más vacantes históricas...</span>
                      </>
                    ) : (
                      <>
                        <ArrowDown className="h-3.5 w-3.5" />
                        <span>Cargar más vacantes históricas</span>
                      </>
                    )}
                  </button>
                ) : (
                  <p className="text-xs text-slate-600 italic">
                    Has llegado al final de las convocatorias históricas.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Detail Panel (7 columns on desktop - sticky) */}
          <div className="hidden lg:block lg:col-span-7 xl:col-span-7 sticky top-20 h-[calc(100vh-6rem)]">
            {selectedJob ? (
              <JobDetail
                job={selectedJob}
                rawDescription={descriptions[String(selectedJob.id)] ?? null}
                isLoadingDescription={isLoadingDescription}
                onStatusChange={handleCrmStatusChange}
                onSaveNotes={handleSaveNotes}
              />
            ) : (
              <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-8 text-center text-xs text-slate-600">
                Selecciona una vacante del radar para ver su análisis detallado.
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. Mobile Drawer / Modal when a job is explicitly clicked on small screens */}
      {isMobileDetailOpen && selectedJob && (
        <div className="block lg:hidden">
          <div
            className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setIsMobileDetailOpen(false)}
          >
            <div
              className="h-[88vh] sm:h-[82vh] w-full max-w-2xl bg-white rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <JobDetail
                job={selectedJob}
                rawDescription={descriptions[String(selectedJob.id)] ?? null}
                isLoadingDescription={isLoadingDescription}
                onStatusChange={handleCrmStatusChange}
                onSaveNotes={handleSaveNotes}
                onClose={() => setIsMobileDetailOpen(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* 5. Guest Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        actionPrompt={authPrompt}
      />
    </div>
  );
}
