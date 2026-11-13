'use client';

import React from 'react';
import {
  ExternalLink,
  Star,
  MapPin,
  Building2,
  Banknote,
  Bookmark,
  CheckCircle2,
  Calendar,
  XCircle,
  Loader2,
} from 'lucide-react';
import { JobSummary, CrmStatus, CRM_STATUS_META, SOURCE_LABELS } from '@/lib/domain/types';
import { getJobAgePill } from '@/lib/domain/ranking';
import { resolveJobNormalizedMeta } from '@/lib/jobs/workspaceState';
import { CompanyMonogram } from './CompanyMonogram';

export interface JobCardProps {
  job: JobSummary;
  isSelected: boolean;
  onSelect: () => void;
  onQuickCrmChange?: (job: JobSummary, status: CrmStatus) => void;
  isPendingCrm?: boolean;
  onToggleFavorite?: (job: JobSummary) => void;
}

const CRM_BUTTONS: { key: CrmStatus; label: string; icon: React.ElementType }[] = [
  { key: 'to_apply', label: 'Por postular', icon: Bookmark },
  { key: 'favorite', label: 'Destacar', icon: Star },
  { key: 'applied', label: 'Postulado', icon: CheckCircle2 },
  { key: 'interview', label: 'Entrevista', icon: Calendar },
  { key: 'discarded', label: 'Descartar', icon: XCircle },
];

export function JobCard({
  job,
  isSelected,
  onSelect,
  onQuickCrmChange,
  isPendingCrm = false,
  onToggleFavorite,
}: JobCardProps) {
  const agePill = React.useMemo(() => getJobAgePill(job), [job]);
  const meta = React.useMemo(() => resolveJobNormalizedMeta(job), [job]);

  const score = Number(job.final_ranking_score) || 0;
  const scoreBadgeConfig = React.useMemo(() => {
    if (score >= 80) {
      return {
        bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        label: `${Math.round(score)}% afinidad`,
      };
    }
    if (score >= 60) {
      return {
        bg: 'bg-amber-50 text-amber-800 border-amber-200',
        label: `${Math.round(score)}% afinidad`,
      };
    }
    return {
      bg: 'bg-slate-100 text-slate-700 border-slate-200',
      label: `${Math.round(score)}% afinidad`,
    };
  }, [score]);

  const locationString = React.useMemo(() => {
    if (meta.district && meta.district !== 'Lima Metropolitana' && meta.district !== 'Remoto') {
      return `${meta.district}${meta.lima_zone ? ` · ${meta.lima_zone}` : ''}`;
    }
    return job.location || 'Lima, Perú';
  }, [meta.district, meta.lima_zone, job.location]);

  const { displaySkills, remainingCount } = React.useMemo(() => {
    const all = Array.isArray(job.matching_skills) ? job.matching_skills : [];
    return {
      displaySkills: all.slice(0, 4),
      remainingCount: Math.max(0, all.length - 4),
    };
  }, [job.matching_skills]);

  const handleCrmClick = (status: CrmStatus) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onQuickCrmChange) {
      onQuickCrmChange(job, status);
    } else if (status === 'favorite' && onToggleFavorite) {
      onToggleFavorite(job);
    }
  };

  const portalLabel = SOURCE_LABELS[job.source] || job.source;

  return (
    <article
      className={`group relative flex flex-col rounded-2xl border transition-all text-left bg-white ${
        isSelected
          ? 'border-[#1E3A8A] bg-blue-50/20 shadow-md ring-1 ring-[#1E3A8A]'
          : 'border-[#E2E8F0] hover:border-slate-300 hover:shadow-xs'
      }`}
    >
      {/* ------------------------------------------------------------- */}
      {/* External Link Quick Action (Absolute sibling, never nested)   */}
      {/* ------------------------------------------------------------- */}
      <a
        href={job.url}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-4 right-4 z-10 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
        title="Abrir convocatoria original en nueva pestaña"
        aria-label={`Abrir convocatoria de ${job.title} en nueva pestaña`}
      >
        <ExternalLink className="h-4 w-4" />
      </a>

      {/* ------------------------------------------------------------- */}
      {/* Main Clickable Card Selection Trigger Button                  */}
      {/* ------------------------------------------------------------- */}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={isSelected}
        className="w-full text-left p-4 sm:p-5 pb-3 flex flex-col gap-3 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-t-2xl group/trigger"
      >
        {/* Header: Monogram + Badges + Title + Company */}
        <div className="flex items-start gap-3 w-full pr-8">
          <CompanyMonogram
            brandKey={job.resolved_brand_key}
            companyName={job.company}
            size="md"
          />

          <div className="min-w-0 flex-1">
            {/* Source + Agency Pills */}
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 border border-slate-200">
                {portalLabel}
              </span>
              {job.resolved_via_agency && (
                <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-[#1E3A8A] border border-blue-200">
                  Vía Agencia
                </span>
              )}
            </div>

            {/* Job Title */}
            <h3 className="text-sm sm:text-base font-bold text-slate-900 line-clamp-2 leading-snug group-hover/trigger:text-[#1E3A8A] transition-colors">
              {job.title}
            </h3>

            {/* Company & Location */}
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600">
              <span className="font-semibold text-slate-800 inline-flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="truncate max-w-[140px] sm:max-w-[200px]">
                  {job.company}
                </span>
              </span>
              <span>·</span>
              <span className="inline-flex items-center gap-1 text-slate-600">
                <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="truncate max-w-[160px] sm:max-w-[220px]">
                  {locationString}
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Agency Resolved Detail note (if applicable) */}
        {job.resolved_via_agency && job.resolved_brand_key && (
          <div className="rounded-lg bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 border border-slate-200/80">
            <span className="font-semibold text-[#1E3A8A]">Cliente detectado:</span>{' '}
            <strong className="uppercase">{job.resolved_brand_key}</strong>
            {job.agency_clue && (
              <span className="ml-1 text-slate-500">({job.agency_clue})</span>
            )}
          </div>
        )}

        {/* Search match note */}
        {job._search_note && (
          <div className="text-[11px] font-medium text-blue-900 bg-blue-50/60 px-2 py-0.5 rounded border border-blue-100">
            💡 {job._search_note}
          </div>
        )}

        {/* Skills Pills */}
        {(displaySkills.length > 0 || meta.english_required || job.english_required) && (
          <div className="flex flex-wrap items-center gap-1 pt-0.5">
            {displaySkills.map((skill) => (
              <span
                key={skill}
                className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700 border border-slate-200/60"
              >
                {skill}
              </span>
            ))}
            {(meta.english_required || job.english_required) && (
              <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 border border-amber-200">
                Inglés{meta.english_level ? ` (${meta.english_level})` : ''}
              </span>
            )}
            {remainingCount > 0 && (
              <span className="inline-flex items-center rounded-md bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                +{remainingCount} más
              </span>
            )}
          </div>
        )}

        {/* Meta Row: Modality, Salary, Age Pill, Score Badge */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 w-full">
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Modality */}
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
              {job.modality || 'No especificado'}
            </span>

            {/* Salary */}
            {job.salary && (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 border border-emerald-200/60">
                <Banknote className="h-3 w-3 text-emerald-600" />
                <span>{job.salary}</span>
              </span>
            )}

            {/* Antiquity / Published date pill */}
            {agePill && (
              <span
                className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${agePill.bgClass}`}
              >
                {agePill.label}
              </span>
            )}
          </div>

          {/* AI Match Score Badge */}
          <span
            className={`rounded-md border px-2 py-0.5 text-[11px] font-bold font-mono ${scoreBadgeConfig.bg}`}
          >
            {scoreBadgeConfig.label}
          </span>
        </div>
      </button>

      {/* ------------------------------------------------------------- */}
      {/* Bottom 1-Click Inline CRM Action Bar (Sibling Toolbar)        */}
      {/* ------------------------------------------------------------- */}
      <div
        role="toolbar"
        aria-label="Seguimiento de postulación"
        className="px-4 pb-3 sm:px-5 sm:pb-4 pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-1"
      >
        <div className="flex flex-wrap items-center gap-1">
          {CRM_BUTTONS.map((item) => {
            const Icon = item.icon;
            const isCurrent = job.user_status === item.key;
            const metaInfo = CRM_STATUS_META[item.key];

            return (
              <button
                key={item.key}
                type="button"
                onClick={handleCrmClick(item.key)}
                disabled={isPendingCrm}
                aria-pressed={isCurrent}
                title={`${isCurrent ? 'Estado actual: ' : 'Cambiar a: '}${metaInfo.description}`}
                className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium border transition-colors disabled:opacity-50 ${
                  isCurrent
                    ? 'font-bold shadow-2xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                }`}
                style={
                  isCurrent
                    ? {
                        backgroundColor: metaInfo.bgColor,
                        color: metaInfo.color,
                        borderColor: metaInfo.borderColor,
                      }
                    : undefined
                }
              >
                {isPendingCrm && isCurrent ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Icon
                    className={`h-3 w-3 ${
                      isCurrent && item.key === 'favorite'
                        ? 'fill-current text-amber-500'
                        : ''
                    }`}
                  />
                )}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </article>
  );
}
