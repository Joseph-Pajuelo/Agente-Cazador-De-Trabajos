'use client';

import React from 'react';
import {
  X,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
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
import { collectDetectedSkills } from '@/lib/domain/jobNormalization';
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

  const detectedSkills = React.useMemo(() => collectDetectedSkills(job), [job]);

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
              logoUrl={job.company_logo_url}
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

        {/* 4. Neutral Detected Skills & Requirements */}
        {detectedSkills.length > 0 && (
          <section
            aria-labelledby="drawer-detected-skills-title"
            className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5 space-y-3"
          >
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-[#2563EB]" />
              <h3
                id="drawer-detected-skills-title"
                className="text-sm font-bold text-slate-900"
              >
                Tecnologías y requisitos detectados
              </h3>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {detectedSkills.map((skill) => (
                <span
                  key={skill}
                  className="rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-200/90 shadow-[0_1px_1px_rgba(15,23,42,0.03)]"
                >
                  {skill}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* 5. Personal Notes Form */}
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
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 text-xs sm:text-sm text-slate-800 whitespace-pre-line leading-relaxed">
                {rawDescription}
              </div>
              {(job.source === 'cvmatcher' ||
                rawDescription.trim().endsWith('...') ||
                rawDescription.includes('CVMatcher solo expone el resumen')) &&
                job.url && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-xs text-amber-900">
                    <span>
                      {job.source === 'cvmatcher'
                        ? 'Este portal requiere sesión propia para ver toda la ficha; aquí ves el resumen disponible.'
                        : 'Este registro solo incluye un extracto preliminar; puedes revisar la ficha original en el portal.'}
                    </span>
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-[#1E3A8A] border border-amber-300 hover:bg-amber-100/60 transition-colors"
                    >
                      <span>Abrir vacante original</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
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
