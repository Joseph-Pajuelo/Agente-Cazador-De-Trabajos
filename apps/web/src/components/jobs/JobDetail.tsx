'use client';

import React from 'react';
import {
  ExternalLink,
  MapPin,
  Building2,
  Banknote,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  FileText,
  Save,
  X,
  AlertTriangle,
} from 'lucide-react';
import { JobSummary, CrmStatus, CRM_STATUS_META } from '@/lib/domain/types';
import { getJobAgePill } from '@/lib/domain/ranking';
import { CompanyMonogram } from './CompanyMonogram';

interface JobDetailProps {
  job: JobSummary;
  rawDescription?: string | null;
  isLoadingDescription?: boolean;
  onStatusChange: (status: CrmStatus) => void;
  onSaveNotes: (notes: string) => Promise<boolean>;
  onClose?: () => void;
}

const CRM_BUTTONS: { status: CrmStatus; label: string; icon: string }[] = [
  { status: 'to_apply', label: 'Por postular', icon: '📋' },
  { status: 'favorite', label: 'Destacada', icon: '⭐' },
  { status: 'applied', label: 'Postulado', icon: '🚀' },
  { status: 'interview', label: 'En entrevista', icon: '🎤' },
  { status: 'discarded', label: 'Descartada', icon: '❌' },
];

export function JobDetail({
  job,
  rawDescription,
  isLoadingDescription = false,
  onStatusChange,
  onSaveNotes,
  onClose,
}: JobDetailProps) {
  const agePill = React.useMemo(() => getJobAgePill(job), [job]);

  const [notes, setNotes] = React.useState(job.user_notes || '');
  const [isSavingNotes, setIsSavingNotes] = React.useState(false);
  const [notesSaveStatus, setNotesSaveStatus] = React.useState<
    'idle' | 'saved' | 'error'
  >('idle');

  // Keep notes state in sync when selected job changes
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
  const techScore = job.technical_match_score !== undefined
    ? Math.round(Number(job.technical_match_score) * 100)
    : null;

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* 1. Header with Monogram, Title, and Actions */}
      <div className="border-b border-slate-100 p-5 sm:p-6 bg-slate-50/50">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <CompanyMonogram
              brandKey={job.resolved_brand_key}
              companyName={job.company}
              size="lg"
            />
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className="text-xs font-semibold text-blue-900 inline-flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  {job.company}
                </span>
                <span className="text-slate-600">·</span>
                <span className="text-xs text-slate-600 inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {job.location || 'Lima, Perú'}
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">
                {job.title}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-200 hover:text-slate-800 transition-colors"
                aria-label="Cerrar panel de detalle"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {/* Metadata Badges */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-900 border border-blue-200/60">
              {job.modality || 'No especificado'}
            </span>

            {job.salary && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 border border-emerald-200/60">
                <Banknote className="h-3.5 w-3.5 text-emerald-600" />
                {job.salary}
              </span>
            )}

            {agePill && (
              <span
                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium ${agePill.bgClass}`}
              >
                <Clock className="h-3.5 w-3.5" />
                {agePill.label}
              </span>
            )}

            <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 capitalize">
              Fuente: {job.source.replace('_', ' ')}
            </span>
          </div>

          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-900 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-800 transition-colors"
          >
            <span>Abrir convocatoria oficial</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
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
                <strong className="font-bold">Agencia de Selección:</strong> Publicado por{' '}
                <span className="font-semibold text-blue-900">{job.company}</span>.
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
        <section aria-labelledby="crm-action-title">
          <h3 id="crm-action-title" className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
            Estado de tu postulación
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {CRM_BUTTONS.map((btn) => {
              const isSelected = job.user_status === btn.status;
              const meta = CRM_STATUS_META[btn.status];
              return (
                <button
                  key={btn.status}
                  type="button"
                  onClick={() => onStatusChange(btn.status)}
                  className={`flex flex-col items-center justify-center gap-1 rounded-xl border p-2.5 text-xs font-semibold transition-all ${
                    isSelected
                      ? 'shadow-xs ring-2'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 text-slate-700'
                  }`}
                  style={
                    isSelected
                      ? {
                          backgroundColor: meta.bgColor,
                          color: meta.color,
                          borderColor: meta.borderColor,
                          boxShadow: `0 0 0 2px ${meta.color}33`,
                        }
                      : undefined
                  }
                >
                  <span className="text-base">{btn.icon}</span>
                  <span className="text-[11px] text-center leading-tight">{btn.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 4. Notes Section */}
        <section aria-labelledby="personal-notes-title">
          <div className="flex items-center justify-between mb-1.5">
            <h3 id="personal-notes-title" className="text-xs font-bold uppercase tracking-wider text-slate-600">
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
              placeholder="Anota detalles para tu postulación (ej. versión de CV enviada, contacto de RRHH, fecha de seguimiento)..."
              rows={3}
              maxLength={2000}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-xs sm:text-sm text-slate-900 placeholder:text-slate-600 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSavingNotes || notes === (job.user_notes || '')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 disabled:opacity-40 transition-colors"
              >
                <Save className="h-3.5 w-3.5" />
                <span>{isSavingNotes ? 'Guardando...' : 'Guardar nota'}</span>
              </button>
            </div>
          </form>
        </section>

        {/* 5. AI Compatibility Verdict (NO CoT cards!) */}
        <section
          aria-labelledby="ai-verdict-title"
          className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5 space-y-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900 mb-1">
                <Sparkles className="h-3.5 w-3.5 text-blue-700" />
                <span>Evaluación de Afinidad IA</span>
              </div>
              <h3 id="ai-verdict-title" className="text-base font-bold text-slate-900">
                Veredicto del Perfil
              </h3>
            </div>

            <div className="text-right">
              <div className="text-2xl font-extrabold text-blue-900 font-mono">
                {Math.round(score)}
                <span className="text-sm font-normal text-slate-600">/100</span>
              </div>
              {techScore !== null && (
                <div className="text-[11px] text-slate-600">
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
            <p className="text-xs text-slate-600 italic">
              Evaluación pendiente de procesamiento o precalificación estándar.
            </p>
          )}

          {/* Matched & Missing Skills */}
          <div className="space-y-3 pt-2 border-t border-slate-200/80">
            {job.matching_skills && job.matching_skills.length > 0 && (
              <div>
                <span className="block text-[11px] font-bold text-emerald-800 uppercase tracking-wider mb-1.5 flex items-center gap-1">
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
                <span className="block text-[11px] font-bold text-amber-800 uppercase tracking-wider mb-1.5 flex items-center gap-1">
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

        {/* 6. Lazy-loaded Full Job Description */}
        <section aria-labelledby="job-description-title" className="space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-slate-600" />
            <h3 id="job-description-title" className="text-sm font-bold text-slate-900">
              Descripción completa de la vacante
            </h3>
          </div>

          {isLoadingDescription ? (
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
            <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 text-xs text-slate-600 italic">
              Sin descripción detallada disponible en este registro.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
