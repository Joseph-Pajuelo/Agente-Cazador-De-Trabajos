'use client';

import React from 'react';
import Link from 'next/link';
import {
  Briefcase,
  Search,
  ExternalLink,
  Calendar,
  AlertCircle,
  CheckCircle2,
  FileText,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { JobSummary, CrmStatus, CRM_STATUS_META } from '@/lib/domain/types';
import {
  PIPELINE_COLUMNS,
  groupJobsByPipelineStage,
  movePipelineJob,
  rollbackPipelineJobs,
} from '@/lib/pipeline/boardHelpers';
import { upsertJobState } from '@/actions/crm';
import { CompanyMonogram } from '@/components/jobs/CompanyMonogram';

interface PipelineBoardProps {
  initialJobs: JobSummary[];
  user: { id: string; email?: string | null };
}

export function PipelineBoard({ initialJobs, user }: PipelineBoardProps) {
  const [jobs, setJobs] = React.useState<JobSummary[]>(initialJobs);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [activeNotesJobId, setActiveNotesJobId] = React.useState<string | number | null>(null);
  const [notesDraft, setNotesDraft] = React.useState<Record<string, string>>({});
  const [savingJobId, setSavingJobId] = React.useState<string | number | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [successNotice, setSuccessNotice] = React.useState<string | null>(null);

  // Filter jobs by search query
  const filteredJobs = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return jobs;

    return jobs.filter((job) => {
      const titleMatch = job.title?.toLowerCase().includes(q);
      const companyMatch = job.company?.toLowerCase().includes(q);
      const locationMatch = job.location?.toLowerCase().includes(q);
      const notesMatch = job.user_notes?.toLowerCase().includes(q);
      const skillsMatch = job.matching_skills?.some((s) => s.toLowerCase().includes(q));
      return titleMatch || companyMatch || locationMatch || notesMatch || skillsMatch;
    });
  }, [jobs, searchQuery]);

  const groups = React.useMemo(
    () => groupJobsByPipelineStage(filteredJobs),
    [filteredJobs]
  );

  const totalTrackedJobs = React.useMemo(() => {
    return jobs.filter(
      (j) => j.user_status && j.user_status !== 'to_apply'
    ).length;
  }, [jobs]);

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return null;
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('es-PE', {
        day: 'numeric',
        month: 'short',
      });
    } catch {
      return null;
    }
  };

  const handleStageChange = async (job: JobSummary, nextStage: CrmStatus) => {
    if (job.user_status === nextStage) return;

    setErrorMessage(null);
    setSuccessNotice(null);
    setSavingJobId(job.id);

    // 1. Snapshot current state for rollback
    const snapshot = [...jobs];

    // 2. Optimistic update
    const nextList = movePipelineJob(jobs, job.id, nextStage);
    setJobs(nextList);

    try {
      const res = await upsertJobState({
        listingId: Number(job.id),
        status: nextStage,
        notes: job.user_notes ?? '',
      });

      if (!res.ok) {
        throw new Error(res.error || 'ERROR_UPDATING_STAGE');
      }

      // If backend returned explicit appliedAt, update it
      if (res.appliedAt !== undefined) {
        setJobs((current) =>
          current.map((j) =>
            String(j.id) === String(job.id) ? { ...j, applied_at: res.appliedAt } : j
          )
        );
      }

      const stageMeta = CRM_STATUS_META[nextStage];
      setSuccessNotice(`Vacante movida a "${stageMeta.label}"`);
      setTimeout(() => setSuccessNotice(null), 3000);
    } catch (err) {
      console.error('Error changing stage:', err);
      // Rollback
      setJobs(rollbackPipelineJobs(snapshot));
      setErrorMessage(
        'No se pudo actualizar el estado de la postulación. Se restauró el estado anterior.'
      );
    } finally {
      setSavingJobId(null);
    }
  };

  const handleSaveNotes = async (job: JobSummary) => {
    const draft = notesDraft[String(job.id)] ?? job.user_notes ?? '';
    setErrorMessage(null);
    setSuccessNotice(null);
    setSavingJobId(job.id);

    const snapshot = [...jobs];

    // Optimistic notes update
    const currentStatus = job.user_status || 'to_apply';
    const nextList = movePipelineJob(jobs, job.id, currentStatus, draft);
    setJobs(nextList);

    try {
      const res = await upsertJobState({
        listingId: Number(job.id),
        status: currentStatus,
        notes: draft,
      });

      if (!res.ok) {
        throw new Error(res.error || 'ERROR_SAVING_NOTES');
      }

      setSuccessNotice('Notas guardadas correctamente');
      setNotesDraft((prev) => {
        const next = { ...prev };
        delete next[String(job.id)];
        return next;
      });
      setActiveNotesJobId(null);
      setTimeout(() => setSuccessNotice(null), 3000);
    } catch (err) {
      console.error('Error saving notes:', err);
      setJobs(rollbackPipelineJobs(snapshot));
      setErrorMessage(
        'No se pudieron guardar las notas personales. Se restauró el contenido previo.'
      );
    } finally {
      setSavingJobId(null);
    }
  };

  const handleCancelNotes = (jobId: string | number) => {
    setNotesDraft((prev) => {
      const next = { ...prev };
      delete next[String(jobId)];
      return next;
    });
    setActiveNotesJobId(null);
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Mi Pipeline de Postulaciones
            </h1>
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-900 border border-blue-200">
              {totalTrackedJobs} {totalTrackedJobs === 1 ? 'vacante' : 'vacantes'}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Tablero personal {user.email ? `(${user.email})` : ''} para organizar tus procesos de postulación, entrevistas y notas privadas.
          </p>
        </div>

        {/* Search bar */}
        <div className="relative w-full md:w-80">
          <label htmlFor="pipeline-search" className="sr-only">
            Buscar en mi pipeline
          </label>
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            id="pipeline-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por cargo, empresa o nota..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-2xs focus:border-blue-900 focus:outline-hidden focus:ring-1 focus:ring-blue-900"
          />
        </div>
      </div>

      {/* Accessible Notifications (role="alert" / role="status") */}
      {errorMessage && (
        <div
          role="alert"
          aria-live="assertive"
          className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-xs font-medium text-rose-700 underline hover:text-rose-900"
          >
            Cerrar
          </button>
        </div>
      )}

      {successNotice && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{successNotice}</span>
        </div>
      )}

      {/* Empty State when no jobs tracked at all */}
      {totalTrackedJobs === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-xs">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-900 border border-blue-200/60 mb-4">
            <Briefcase className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Tu pipeline aún está vacío</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
            Aún no has guardado postulaciones en tu tablero personal. Explora las vacantes en el
            Radar y márcalas como <strong>Destacada</strong>, <strong>Postulado</strong> o{' '}
            <strong>En entrevista</strong> para gestionarlas aquí.
          </p>
          <div className="mt-6">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-900 px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-blue-800 transition-colors"
            >
              <Sparkles className="h-4 w-4" />
              <span>Explorar Radar de Vacantes</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      ) : (
        /* Kanban Columns Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 items-start">
          {PIPELINE_COLUMNS.map((column) => {
            const columnJobs = groups[column.key];
            const isColumnEmpty = columnJobs.length === 0;

            return (
              <section
                key={column.key}
                aria-label={`Columna ${column.label}`}
                className="pipeline-col-enter flex flex-col rounded-2xl border border-slate-200 bg-slate-100/60 p-3.5 shadow-2xs min-h-[480px]"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200/80">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: column.color }}
                      aria-hidden="true"
                    />
                    <h2 className="text-sm font-bold text-slate-900">
                      {column.label}
                    </h2>
                  </div>
                  <span
                    className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold"
                    style={{
                      backgroundColor: column.bgColor,
                      color: column.color,
                      border: `1px solid ${column.borderColor}`,
                    }}
                  >
                    {columnJobs.length}
                  </span>
                </div>

                {/* Empty column placeholder */}
                {isColumnEmpty ? (
                  <div className="flex-1 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/60 p-6 text-center text-xs text-slate-500 min-h-[160px]">
                    <p className="font-medium">Sin vacantes</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Mueve vacantes a esta etapa cuando corresponda
                    </p>
                  </div>
                ) : (
                  /* Cards List */
                  <div className="flex flex-col gap-3">
                    {columnJobs.map((job) => {
                      const isSaving = savingJobId === job.id;
                      const isEditingNotes = activeNotesJobId === job.id;
                      const formattedApplied = formatDate(job.applied_at);
                      const currentNotes =
                        notesDraft[String(job.id)] ?? (job.user_notes || '');

                      return (
                        <article
                          key={job.id}
                          className="pipeline-card-surface flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-2xs hover:shadow-xs transition-shadow"
                        >
                          {/* Card Top: Monogram + Company + External Link */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <CompanyMonogram
                                brandKey={job.resolved_brand_key}
                                companyName={job.company}
                                size="sm"
                              />
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-slate-700 truncate">
                                  {job.company}
                                </p>
                                <p className="text-[11px] text-slate-500 truncate">
                                  {job.location}
                                </p>
                              </div>
                            </div>

                            <a
                              href={job.url}
                              target="_blank"
                              rel="noreferrer"
                              title="Abrir vacante en portal original"
                              className="text-slate-400 hover:text-blue-900 transition-colors p-1"
                              aria-label={`Ver oferta de ${job.title} en portal original`}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </div>

                          {/* Title */}
                          <div className="mt-2.5">
                            <h3 className="text-xs sm:text-sm font-bold text-slate-900 leading-snug line-clamp-2">
                              {job.title}
                            </h3>
                          </div>

                          {/* Meta Pills (Modality, Score, Date) */}
                          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                              {job.modality || 'No especificado'}
                            </span>

                            {typeof job.final_ranking_score === 'number' && (
                              <span
                                className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold border ${
                                  job.final_ranking_score >= 70
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : 'bg-amber-50 text-amber-800 border-amber-200'
                                }`}
                                title={`Puntaje de afinidad IA: ${job.final_ranking_score}/100`}
                              >
                                {job.final_ranking_score}% match
                              </span>
                            )}

                            {formattedApplied && (
                              <span
                                className="inline-flex items-center gap-1 text-[10px] text-slate-500 font-medium"
                                title={`Fecha registrada: ${job.applied_at}`}
                              >
                                <Calendar className="h-3 w-3 text-slate-400" />
                                {formattedApplied}
                              </span>
                            )}
                          </div>

                          {/* Stage Transition Selector */}
                          <div className="mt-3 pt-3 border-t border-slate-100">
                            <label
                              htmlFor={`stage-select-${job.id}`}
                              className="block text-[11px] font-medium text-slate-500 mb-1"
                            >
                              Etapa actual:
                            </label>
                            <select
                              id={`stage-select-${job.id}`}
                              value={job.user_status || 'to_apply'}
                              disabled={isSaving}
                              onChange={(e) =>
                                handleStageChange(job, e.target.value as CrmStatus)
                              }
                              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 px-2.5 text-xs font-semibold text-slate-800 shadow-2xs focus:border-blue-900 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-900 disabled:opacity-50"
                              aria-label={`Cambiar etapa de postulación para ${job.title}`}
                            >
                              <option value="favorite">⭐ Destacada</option>
                              <option value="applied">🚀 Postulado</option>
                              <option value="interview">🎤 En entrevista</option>
                              <option value="discarded">❌ Descartada</option>
                              <option value="to_apply">📋 Mover a &apos;Por postular&apos; (quitar)</option>
                            </select>
                          </div>

                          {/* Notes preview or editor */}
                          <div className="mt-2.5">
                            {isEditingNotes ? (
                              <div className="filter-details-body space-y-2 rounded-lg bg-slate-50 p-2.5 border border-slate-200">
                                <label
                                  htmlFor={`notes-area-${job.id}`}
                                  className="block text-[11px] font-medium text-slate-700"
                                >
                                  Notas privadas:
                                </label>
                                <textarea
                                  id={`notes-area-${job.id}`}
                                  rows={3}
                                  value={currentNotes}
                                  disabled={isSaving}
                                  onChange={(e) =>
                                    setNotesDraft((prev) => ({
                                      ...prev,
                                      [String(job.id)]: e.target.value,
                                    }))
                                  }
                                  placeholder="Ej: Contacto de RRHH, enlace de prueba técnica, seguimiento..."
                                  className="w-full rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-900 focus:outline-hidden focus:ring-1 focus:ring-blue-900"
                                />
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    disabled={isSaving}
                                    onClick={() => handleCancelNotes(job.id)}
                                    className="interactive-pill rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-200/60"
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isSaving}
                                    onClick={() => handleSaveNotes(job)}
                                    className="interactive-pill rounded-md bg-blue-900 px-2.5 py-1 text-xs font-semibold text-white shadow-2xs hover:bg-blue-800 disabled:opacity-50"
                                  >
                                    {isSaving ? 'Guardando...' : 'Guardar'}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between text-[11px]">
                                {job.user_notes ? (
                                  <button
                                    type="button"
                                    onClick={() => setActiveNotesJobId(job.id)}
                                    className="flex items-center gap-1 text-slate-600 hover:text-blue-900 max-w-[200px] truncate text-left"
                                    title={job.user_notes}
                                  >
                                    <FileText className="h-3 w-3 shrink-0 text-slate-400" />
                                    <span className="truncate">{job.user_notes}</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setActiveNotesJobId(job.id)}
                                    className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-700"
                                  >
                                    <FileText className="h-3 w-3" />
                                    <span>Agregar nota</span>
                                  </button>
                                )}

                                {job.user_notes && (
                                  <button
                                    type="button"
                                    onClick={() => setActiveNotesJobId(job.id)}
                                    className="text-[10px] text-blue-900 font-medium hover:underline"
                                  >
                                    Editar
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
