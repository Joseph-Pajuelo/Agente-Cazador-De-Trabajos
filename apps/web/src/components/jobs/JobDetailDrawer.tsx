'use client';

import React from 'react';
import {
  X,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Sparkles,
  MapPin,
  Building2,
  Banknote,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  Save,
  AlertTriangle,
  Globe,
  Briefcase,
  GraduationCap,
  Bookmark,
  Star,
  Calendar,
} from 'lucide-react';
import {
  JobSummary,
  CrmStatus,
  CRM_STATUS_META,
  SOURCE_LABELS,
  ReasoningChain,
} from '@/lib/domain/types';
import { getJobAgePill } from '@/lib/domain/ranking';
import { resolveJobNormalizedMeta } from '@/lib/jobs/workspaceState';
import { isPointerEventOutsideRect } from '@/lib/auth/authHelpers';
import { CompanyMonogram } from './CompanyMonogram';

export interface JobDetailDrawerProps {
  job: JobSummary | null;
  rawDescription?: string | null;
  reasoningChain?: ReasoningChain | null;
  isLoadingDetail?: boolean;
  onClose: () => void;
  onPrevJob?: () => void;
  onNextJob?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  onStatusChange: (status: CrmStatus) => void;
  onSaveNotes: (notes: string) => Promise<boolean>;
}

const CRM_BUTTONS: { status: CrmStatus; label: string; icon: React.ElementType }[] = [
  { status: 'to_apply', label: 'Por postular', icon: Bookmark },
  { status: 'favorite', label: 'Destacar', icon: Star },
  { status: 'applied', label: 'Postulado', icon: CheckCircle2 },
  { status: 'interview', label: 'Entrevista', icon: Calendar },
  { status: 'discarded', label: 'Descartar', icon: XCircle },
];

interface JobDetailDrawerContentProps {
  job: JobSummary;
  rawDescription?: string | null;
  reasoningChain?: ReasoningChain | null;
  isLoadingDetail?: boolean;
  onClose: () => void;
  onPrevJob?: () => void;
  onNextJob?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  onStatusChange: (status: CrmStatus) => void;
  onSaveNotes: (notes: string) => Promise<boolean>;
}

function JobDetailDrawerContent({
  job,
  rawDescription,
  reasoningChain,
  isLoadingDetail = false,
  onClose,
  onPrevJob,
  onNextJob,
  hasPrev = false,
  hasNext = false,
  onStatusChange,
  onSaveNotes,
}: JobDetailDrawerContentProps) {
  const agePill = React.useMemo(() => getJobAgePill(job), [job]);
  const meta = React.useMemo(() => resolveJobNormalizedMeta(job), [job]);

  const [notes, setNotes] = React.useState(job.user_notes || '');
  const [isSavingNotes, setIsSavingNotes] = React.useState(false);
  const [notesSaveStatus, setNotesSaveStatus] = React.useState<
    'idle' | 'saved' | 'error'
  >('idle');

  React.useEffect(() => {
    setNotes(job.user_notes || '');
    setNotesSaveStatus('idle');
  }, [job.id, job.user_notes]);

  const handleNotesSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingNotes(true);
    setNotesSaveStatus('idle');

    try {
      const ok = await onSaveNotes(notes);
      if (ok) {
        setNotesSaveStatus('saved');
        setTimeout(() => setNotesSaveStatus('idle'), 3000);
      } else {
        setNotesSaveStatus('error');
      }
    } catch {
      setNotesSaveStatus('error');
    } finally {
      setIsSavingNotes(false);
    }
  };

  const score = Number(job.final_ranking_score) || 0;
  const techScore =
    job.technical_match_score !== undefined && job.technical_match_score !== null
      ? Math.round(Number(job.technical_match_score) * 100)
      : null;

  return (
    <div
      key={String(job.id)}
      className="flex h-full flex-col overflow-hidden bg-white text-slate-900 drawer-content-enter"
    >
      {/* 1. Header with Monogram, Title, Nav and Close */}
      <div className="border-b border-[#E2E8F0] p-5 sm:p-6 bg-slate-50/70 shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <CompanyMonogram
              brandKey={job.resolved_brand_key}
              companyName={job.company}
              size="lg"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-1.5 text-xs">
                <span className="font-semibold text-[#1E3A8A] inline-flex items-center gap-1 truncate">
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-[#1E3A8A]" />
                  <span className="truncate">{job.company}</span>
                </span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-600 inline-flex items-center gap-1 truncate">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  <span className="truncate">{job.location || 'Lima, Perú'}</span>
                </span>
              </div>
              <h2
                id="job-drawer-title"
                className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 leading-snug"
              >
                {job.title}
              </h2>
            </div>
          </div>

          {/* Action buttons: Prev, Next, External Link, Close */}
          <div className="flex items-center gap-1.5 shrink-0">
            {onPrevJob && (
              <button
                type="button"
                onClick={onPrevJob}
                disabled={!hasPrev}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors border border-slate-200 bg-white"
                aria-label="Vacante anterior"
                title="Vacante anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}

            {onNextJob && (
              <button
                type="button"
                onClick={onNextJob}
                disabled={!hasNext}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors border border-slate-200 bg-white"
                aria-label="Siguiente vacante"
                title="Siguiente vacante"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            )}

            {job.url && (
              <a
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#1E3A8A] px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-blue-800 transition-colors"
                title="Abrir convocatoria oficial en pestaña nueva"
              >
                <span className="hidden sm:inline">Postular</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors border border-transparent hover:border-slate-200"
              aria-label="Cerrar detalle"
              title="Cerrar (Esc)"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Metadata Badges */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {/* Modality */}
          <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-900 border border-blue-200/60">
            {job.modality || 'No especificado'}
          </span>

          {/* District / Zone */}
          {meta.district && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-200/60">
              <MapPin className="h-3 w-3 text-slate-500" />
              <span>
                {meta.district}
                {meta.lima_zone ? ` · ${meta.lima_zone}` : ''}
              </span>
            </span>
          )}

          {/* Role Level */}
          {meta.role_level && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-200/60">
              <GraduationCap className="h-3 w-3 text-slate-500" />
              <span>
                {meta.role_level === 'preprofesional'
                  ? 'Preprofesional'
                  : meta.role_level === 'profesional'
                  ? 'Profesional'
                  : meta.role_level === 'trainee_junior'
                  ? 'Trainee / Junior'
                  : meta.role_level}
              </span>
            </span>
          )}

          {/* Category */}
          {meta.category && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-200/60">
              <Briefcase className="h-3 w-3 text-slate-500" />
              <span>{meta.category}</span>
            </span>
          )}

          {/* English */}
          {meta.english_required ? (
            <span className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-800 border border-indigo-200/60">
              <Globe className="h-3 w-3 text-indigo-600" />
              <span>Inglés ({meta.english_level || 'requerido'})</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 border border-slate-200/60">
              <Globe className="h-3 w-3 text-slate-400" />
              <span>Inglés no requerido</span>
            </span>
          )}

          {/* Salary */}
          {job.salary ? (
            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 border border-emerald-200/60">
              <Banknote className="h-3.5 w-3.5 text-emerald-600" />
              <span>{job.salary}</span>
            </span>
          ) : meta.salary_min || meta.salary_max ? (
            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 border border-emerald-200/60">
              <Banknote className="h-3.5 w-3.5 text-emerald-600" />
              <span>
                S/ {meta.salary_min || '—'}
                {meta.salary_max ? ` - S/ ${meta.salary_max}` : ''}
              </span>
            </span>
          ) : null}

          {/* Recency Age Pill */}
          {agePill && (
            <span
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium ${agePill.bgClass}`}
            >
              <Clock className="h-3 w-3" />
              <span>{agePill.label}</span>
            </span>
          )}

          {/* Source */}
          <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 capitalize border border-slate-200/60">
            Fuente: {SOURCE_LABELS[job.source] || job.source}
          </span>
        </div>
      </div>

      {/* Scrollable Content Body */}
      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
        {/* 2. Agency Clue Notice (when resolved via agency) */}
        {job.resolved_via_agency && (
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 text-xs text-blue-950">
            <div className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 shrink-0 text-blue-700 mt-0.5" />
              <div>
                <strong className="font-bold">Agencia de Selección:</strong> Publicado
                por <span className="font-semibold text-blue-900">{job.company}</span>.
                {job.resolved_brand_key && (
                  <span className="ml-1">
                    Nuestro motor asoció esta oferta a{' '}
                    <strong className="uppercase">{job.resolved_brand_key}</strong>.
                  </span>
                )}
                {job.agency_clue && (
                  <p className="mt-1 text-slate-700 italic">«{job.agency_clue}»</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 3. 5-Button CRM Action Bar */}
        <section aria-labelledby="drawer-crm-action-title">
          <h3
            id="drawer-crm-action-title"
            className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2"
          >
            Estado de tu postulación
          </h3>
          <div
            role="toolbar"
            aria-label="Seguimiento de postulación"
            className="grid grid-cols-2 sm:grid-cols-5 gap-2"
          >
            {CRM_BUTTONS.map((btn) => {
              const isSelected = job.user_status === btn.status;
              const statusMeta = CRM_STATUS_META[btn.status];
              const Icon = btn.icon;

              return (
                <button
                  key={btn.status}
                  type="button"
                  onClick={() => onStatusChange(btn.status)}
                  aria-pressed={isSelected}
                  className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-2.5 text-xs font-semibold transition-all ${
                    isSelected
                      ? 'shadow-xs ring-2'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 text-slate-700'
                  }`}
                  style={
                    isSelected
                      ? {
                          backgroundColor: statusMeta.bgColor,
                          color: statusMeta.color,
                          borderColor: statusMeta.borderColor,
                          boxShadow: `0 0 0 2px ${statusMeta.color}33`,
                        }
                      : undefined
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="text-[11px] text-center leading-tight">
                    {btn.label}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 4. Always-visible AI Compatibility Verdict */}
        <section
          aria-labelledby="drawer-ai-verdict-title"
          className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4 sm:p-5 space-y-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#1E3A8A] mb-1">
                <Sparkles className="h-3.5 w-3.5 text-blue-700" />
                <span>Evaluación de Afinidad IA</span>
              </div>
              <h3
                id="drawer-ai-verdict-title"
                className="text-base font-bold text-slate-900"
              >
                Veredicto del Perfil
              </h3>
            </div>

            <div className="text-right">
              <div className="text-2xl font-extrabold text-[#1E3A8A] font-mono">
                {Math.round(score)}
                <span className="text-sm font-normal text-slate-500">/100</span>
              </div>
              {techScore !== null && (
                <div className="text-[11px] text-slate-500 font-medium">
                  Match técnico: <strong>{techScore}%</strong>
                </div>
              )}
            </div>
          </div>

          {/* Editorial Summary */}
          {job.verdict_summary ? (
            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
              {job.verdict_summary}
            </p>
          ) : (
            <p className="text-xs text-slate-500 italic">
              Evaluación pendiente de procesamiento o precalificación estándar.
            </p>
          )}

          {/* Matched & Missing Skills */}
          <div className="space-y-3 pt-2 border-t border-blue-100/80">
            {job.matching_skills && job.matching_skills.length > 0 && (
              <div>
                <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                  Habilidades y requisitos que cumples
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {job.matching_skills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 border border-emerald-200"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {job.missing_skills && job.missing_skills.length > 0 && (
              <div>
                <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <XCircle className="h-3 w-3 text-amber-600" />
                  Requisitos a reforzar o validar en entrevista
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {job.missing_skills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 border border-amber-200"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* 5. Collapsible Native <details> / <summary> "Ver análisis detallado" (CoT) */}
        <details className="group rounded-2xl border border-slate-200 bg-white p-4 transition-colors">
          <summary className="flex cursor-pointer items-center justify-between font-semibold text-slate-800 select-none">
            <span className="flex items-center gap-2 text-sm text-[#1E3A8A]">
              <Sparkles className="h-4 w-4 text-blue-700" />
              <span>Ver análisis detallado</span>
            </span>
            <ChevronDown className="h-4 w-4 text-slate-500 details-chevron transition-transform duration-200" />
          </summary>

          <div className="mt-4 pt-3 border-t border-slate-100 space-y-4 text-xs text-slate-700">
            {isLoadingDetail ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-4 w-2/5 rounded bg-slate-200" />
                <div className="h-10 w-full rounded bg-slate-100" />
                <div className="h-4 w-2/5 rounded bg-slate-200" />
                <div className="h-10 w-full rounded bg-slate-100" />
              </div>
            ) : reasoningChain ? (
              <>
                {reasoningChain.academic_eligibility && (
                  <div className="space-y-1">
                    <span className="font-bold text-slate-900 block">
                      Elegibilidad académica
                    </span>
                    <p className="leading-relaxed text-slate-700">
                      {reasoningChain.academic_eligibility}
                    </p>
                  </div>
                )}
                {reasoningChain.experience_requirements && (
                  <div className="space-y-1">
                    <span className="font-bold text-slate-900 block">
                      Requisitos de experiencia
                    </span>
                    <p className="leading-relaxed text-slate-700">
                      {reasoningChain.experience_requirements}
                    </p>
                  </div>
                )}
                {reasoningChain.tech_stack_overlap && (
                  <div className="space-y-1">
                    <span className="font-bold text-slate-900 block">
                      Coincidencia técnica / Stack
                    </span>
                    <p className="leading-relaxed text-slate-700">
                      {reasoningChain.tech_stack_overlap}
                    </p>
                  </div>
                )}
                {reasoningChain.gaps_and_risks && (
                  <div className="space-y-1">
                    <span className="font-bold text-slate-900 block">
                      Brechas y riesgos identificados
                    </span>
                    <p className="leading-relaxed text-slate-700">
                      {reasoningChain.gaps_and_risks}
                    </p>
                  </div>
                )}
                {reasoningChain.score_rationale && (
                  <div className="space-y-1">
                    <span className="font-bold text-slate-900 block">
                      Fundamento de la puntuación
                    </span>
                    <p className="leading-relaxed text-slate-700">
                      {reasoningChain.score_rationale}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-slate-500 italic">
                Análisis detallado de razonamiento no disponible para esta vacante.
              </p>
            )}
          </div>
        </details>

        {/* 6. Personal Notes Form */}
        <section aria-labelledby="drawer-personal-notes-title" className="space-y-2">
          <div className="flex items-center justify-between">
            <h3
              id="drawer-personal-notes-title"
              className="text-xs font-bold uppercase tracking-wider text-slate-600"
            >
              Notas personales
            </h3>
            {notesSaveStatus === 'saved' && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Guardado
              </span>
            )}
            {notesSaveStatus === 'error' && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
                <AlertTriangle className="h-3.5 w-3.5" />
                Error al guardar
              </span>
            )}
          </div>
          <form onSubmit={handleNotesSubmit} className="space-y-2">
            <label htmlFor="job-personal-notes" className="sr-only">
              Notas personales para esta vacante
            </label>
            <textarea
              id="job-personal-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anota detalles para tu postulación (ej. versión de CV enviada, fecha de entrevista, contacto)..."
              rows={3}
              maxLength={2000}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSavingNotes || notes === (job.user_notes || '')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-slate-800 disabled:opacity-40 transition-colors"
              >
                <Save className="h-3.5 w-3.5" />
                <span>{isSavingNotes ? 'Guardando...' : 'Guardar nota'}</span>
              </button>
            </div>
          </form>
        </section>

        {/* 7. Full Job Description */}
        <section aria-labelledby="drawer-job-description-title" className="space-y-2">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-slate-600" />
            <h3
              id="drawer-job-description-title"
              className="text-sm font-bold text-slate-900"
            >
              Descripción completa de la vacante
            </h3>
          </div>

          {isLoadingDetail ? (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/50 p-4 animate-pulse">
              <div className="h-4 w-3/4 rounded bg-slate-200" />
              <div className="h-4 w-5/6 rounded bg-slate-200" />
              <div className="h-4 w-2/3 rounded bg-slate-200" />
              <div className="h-4 w-4/5 rounded bg-slate-200" />
            </div>
          ) : rawDescription ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 text-xs sm:text-sm text-slate-800 whitespace-pre-line leading-relaxed max-h-96 overflow-y-auto">
              {rawDescription}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 text-xs text-slate-500 italic">
              Sin descripción detallada disponible en este registro.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export function JobDetailDrawer({
  job,
  rawDescription,
  reasoningChain,
  isLoadingDetail = false,
  onClose,
  onPrevJob,
  onNextJob,
  hasPrev = false,
  hasNext = false,
  onStatusChange,
  onSaveNotes,
}: JobDetailDrawerProps) {
  const dialogRef = React.useRef<HTMLDialogElement | null>(null);
  const pointerDownOutsideRef = React.useRef<boolean>(false);

  const handleClose = React.useCallback(() => {
    const dialog = dialogRef.current;
    if (dialog) {
      dialog.returnValue = '';
      if (dialog.open) {
        if (typeof dialog.close === 'function') {
          dialog.close();
        } else {
          dialog.removeAttribute('open');
        }
      }
    }
    onClose();
  }, [onClose]);

  // Synchronize dialog open/close with job state
  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (job !== null) {
      if (!dialog.open) {
        if (typeof dialog.showModal === 'function') {
          dialog.showModal();
        } else {
          dialog.setAttribute('open', '');
        }
      }
    } else {
      if (dialog.open) {
        dialog.returnValue = '';
        if (typeof dialog.close === 'function') {
          dialog.close();
        } else {
          dialog.removeAttribute('open');
        }
      }
    }
  }, [job]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDialogElement>) => {
    const dialog = dialogRef.current;
    if (!dialog || e.target !== dialog) {
      pointerDownOutsideRef.current = false;
      return;
    }
    const rect = dialog.getBoundingClientRect();
    pointerDownOutsideRef.current = isPointerEventOutsideRect(
      rect,
      e.clientX,
      e.clientY
    );
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDialogElement>) => {
    const dialog = dialogRef.current;
    if (!dialog || e.target !== dialog) {
      pointerDownOutsideRef.current = false;
      return;
    }
    const rect = dialog.getBoundingClientRect();
    const pointerUpOutside = isPointerEventOutsideRect(
      rect,
      e.clientX,
      e.clientY
    );

    if (pointerDownOutsideRef.current && pointerUpOutside) {
      handleClose();
    }
    pointerDownOutsideRef.current = false;
  };

  const handleCancel = (e: React.SyntheticEvent<HTMLDialogElement, Event>) => {
    e.preventDefault();
    handleClose();
  };

  return (
    <dialog
      ref={dialogRef}
      id="job-detail-drawer"
      aria-labelledby="job-drawer-title"
      className="job-detail-drawer overscroll-contain"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onCancel={handleCancel}
    >
      {job && (
        <JobDetailDrawerContent
          job={job}
          rawDescription={rawDescription}
          reasoningChain={reasoningChain}
          isLoadingDetail={isLoadingDetail}
          onClose={handleClose}
          onPrevJob={onPrevJob}
          onNextJob={onNextJob}
          hasPrev={hasPrev}
          hasNext={hasNext}
          onStatusChange={onStatusChange}
          onSaveNotes={onSaveNotes}
        />
      )}
    </dialog>
  );
}
