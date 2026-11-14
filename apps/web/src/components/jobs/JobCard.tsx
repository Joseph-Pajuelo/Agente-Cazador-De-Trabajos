'use client';

import React from 'react';
import {
  ExternalLink,
  Star,
  MapPin,
  Banknote,
  Bookmark,
  CheckCircle2,
  Calendar,
  XCircle,
  Loader2,
  Clock,
  BadgeCheck,
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

function renderPortalSourceBadge(source: string, label: string) {
  const norm = (source || '').toLowerCase();

  if (norm.includes('bumeran')) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-xs font-extrabold text-[#1E3A8A] border border-slate-200 shadow-2xs">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/sources/bumeran.webp"
          alt=""
          className="h-3.5 w-auto object-contain"
        />
        <span className="sr-only">{label}</span>
      </span>
    );
  }

  if (norm.includes('linkedin')) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-xs font-extrabold text-[#0A66C2] border border-blue-200/80 shadow-2xs">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/sources/linkedin.webp"
          alt=""
          className="h-3.5 w-auto object-contain"
        />
        <span className="sr-only">{label}</span>
      </span>
    );
  }

  if (norm.includes('computrabajo')) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-xs font-extrabold text-[#0039A6] border border-orange-200/80 shadow-2xs">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/sources/computrabajo.webp"
          alt=""
          className="h-3.5 w-auto object-contain"
        />
        <span className="sr-only">{label}</span>
      </span>
    );
  }

  if (norm.includes('practicas')) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50/90 px-2.5 py-1 text-xs font-extrabold text-emerald-900 border border-emerald-200 shadow-2xs">
        <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-emerald-600 text-[10px] font-black text-white leading-none">
          P
        </span>
        <span>{label}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-xs font-extrabold text-[#2563EB] border border-blue-200 shadow-2xs">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/sources/cvmatcher.webp"
        alt=""
        className="h-3.5 w-auto object-contain"
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}

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
  const roundedScore = Math.round(score);
  const scoreBadgeConfig = React.useMemo(() => {
    if (score >= 80) {
      return {
        bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        ringStroke: '#10B981',
        ringTrack: '#D1FAE5',
        ringText: 'text-emerald-700',
        label: `${roundedScore}% afinidad`,
      };
    }
    if (score >= 60) {
      return {
        bg: 'bg-blue-50 text-blue-800 border-blue-200',
        ringStroke: '#2563EB',
        ringTrack: '#DBEAFE',
        ringText: 'text-[#2563EB]',
        label: `${roundedScore}% afinidad`,
      };
    }
    return {
      bg: 'bg-amber-50 text-amber-800 border-amber-200',
      ringStroke: '#F59E0B',
      ringTrack: '#FEF3C7',
      ringText: 'text-amber-700',
      label: `${roundedScore}% afinidad`,
    };
  }, [score, roundedScore]);

  const locationString = React.useMemo(() => {
    if (meta.district && meta.district !== 'Lima Metropolitana' && meta.district !== 'Remoto') {
      return `Lima, ${meta.district}${meta.lima_zone ? ` · ${meta.lima_zone}` : ''}`;
    }
    if (meta.district === 'Remoto') {
      return 'Remoto · Lima, Perú';
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
  const ringRadius = 18;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringDashoffset =
    ringCircumference - (Math.min(100, Math.max(15, roundedScore)) / 100) * ringCircumference;

  return (
    <article
      className={`group relative flex flex-col rounded-2xl border transition-[transform,box-shadow,border-color,background-color] duration-200 ease-[var(--ease-out)] text-left bg-white ${
        isSelected
          ? 'border-[#2563EB] bg-blue-50/20 shadow-md ring-2 ring-[#2563EB]/25 -translate-y-[1px]'
          : 'border-slate-200/90 hover:border-blue-300 hover:shadow-md hover:-translate-y-[1px]'
      }`}
    >
      {/* ------------------------------------------------------------- */}
      {/* External Link Quick Action (Absolute sibling, never nested)   */}
      {/* ------------------------------------------------------------- */}
      <a
        href={job.url}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-3.5 right-3.5 z-10 rounded-xl p-2 text-slate-400 hover:bg-blue-50 hover:text-[#2563EB] transition-colors"
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
        className="w-full text-left p-5 sm:p-6 pb-4 flex flex-col gap-3.5 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-t-2xl group/trigger"
      >
        {/* Top Row: Portal Badge on top-right (CVMatcher style) + Agency Pill */}
        <div className="flex items-center justify-between gap-2 pr-8">
          <div className="flex items-center gap-2 flex-wrap">
            {renderPortalSourceBadge(job.source, portalLabel)}
            {job.resolved_via_agency && (
              <span className="inline-flex items-center rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 border border-indigo-200">
                Vía Agencia
              </span>
            )}
            <span
              className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold border ${
                job.modality === 'Remoto'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : job.modality === 'Híbrido'
                  ? 'bg-blue-50 text-[#2563EB] border-blue-200'
                  : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              {job.modality || 'No especificado'}
            </span>
          </div>
        </div>

        {/* Main Body: Left Company Logo + Center Info + Right Affinity Ring */}
        <div className="flex items-center gap-4 w-full">
          <CompanyMonogram
            brandKey={job.resolved_brand_key}
            companyName={job.company}
            logoUrl={job.company_logo_url}
            size="lg"
          />

          <div className="min-w-0 flex-1 space-y-1">
            {/* Job Title (Larger, bolder like CVMatcher) */}
            <h3 className="text-[17px] sm:text-[19px] font-bold text-slate-900 line-clamp-2 leading-snug group-hover/trigger:text-[#2563EB] transition-colors">
              {job.title}
            </h3>

            {/* Company Name + Blue Verified Checkmark */}
            <div className="flex items-center gap-1.5 text-[15px] font-semibold text-slate-800">
              <span className="truncate max-w-[240px] sm:max-w-[340px]">
                {job.company}
              </span>
              <BadgeCheck
                className="h-4 w-4 shrink-0 fill-[#2563EB] text-white"
                aria-hidden="true"
              />
            </div>

            {/* District / Location */}
            <div className="flex items-center gap-1.5 text-sm text-slate-600 font-medium">
              <MapPin className="h-3.5 w-3.5 text-[#2563EB] shrink-0" />
              <span className="truncate">{locationString}</span>
            </div>

            {/* Publication Date with Blue Clock Icon + Salary */}
            <div className="flex flex-wrap items-center gap-3 pt-0.5 text-xs text-slate-500 font-medium">
              {agePill && (
                <span className="inline-flex items-center gap-1.5 text-slate-600">
                  <Clock className="h-3.5 w-3.5 text-[#2563EB] shrink-0" />
                  <span>{agePill.label}</span>
                </span>
              )}
              {job.salary && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800 border border-emerald-200">
                  <Banknote className="h-3.5 w-3.5 text-emerald-600" />
                  <span>{job.salary}</span>
                </span>
              )}
            </div>
          </div>

          {/* Right Circular Affinity Ring (CVMatcher style) */}
          <div className="shrink-0 flex flex-col items-center justify-center pl-1">
            <div className="relative flex h-12 w-12 items-center justify-center">
              <svg className="h-12 w-12 -rotate-90" viewBox="0 0 44 44" aria-hidden="true">
                <circle
                  cx="22"
                  cy="22"
                  r={ringRadius}
                  fill="none"
                  stroke={scoreBadgeConfig.ringTrack}
                  strokeWidth="3.5"
                />
                <circle
                  cx="22"
                  cy="22"
                  r={ringRadius}
                  fill="none"
                  stroke={scoreBadgeConfig.ringStroke}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringDashoffset}
                />
              </svg>
              <span className={`absolute text-xs font-extrabold ${scoreBadgeConfig.ringText}`}>
                {roundedScore}%
              </span>
            </div>
            <span
              className={`mt-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${scoreBadgeConfig.bg}`}
            >
              {scoreBadgeConfig.label}
            </span>
          </div>
        </div>

        {/* Agency Resolved Detail note (if applicable) */}
        {job.resolved_via_agency && job.resolved_brand_key && (
          <div className="rounded-xl bg-blue-50/60 px-3 py-1.5 text-xs font-medium text-slate-700 border border-blue-200/80">
            <span className="font-bold text-[#2563EB]">Cliente detectado:</span>{' '}
            <strong className="uppercase">{job.resolved_brand_key.toUpperCase()}</strong>
            {job.agency_clue && (
              <span className="ml-1 text-slate-500">({job.agency_clue})</span>
            )}
          </div>
        )}

        {/* Search match note */}
        {job._search_note && (
          <div className="text-xs font-semibold text-blue-900 bg-blue-50/80 px-3 py-1 rounded-lg border border-blue-200">
            💡 {job._search_note}
          </div>
        )}

        {/* Skills & English Pills (Rounded full pills like CVMatcher) */}
        {(displaySkills.length > 0 || meta.english_required || job.english_required) && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {(meta.english_required || job.english_required) && (
              <span className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900 border border-amber-200">
                Inglés{meta.english_level ? ` (${meta.english_level})` : ''}
              </span>
            )}
            {displaySkills.map((skill) => (
              <span
                key={skill}
                className="inline-flex items-center rounded-full bg-slate-100/90 px-3 py-1 text-xs font-semibold text-slate-700 border border-slate-200/90"
              >
                {skill}
              </span>
            ))}
            {remainingCount > 0 && (
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-[#2563EB]">
                +{remainingCount} más
              </span>
            )}
          </div>
        )}
      </button>

      {/* ------------------------------------------------------------- */}
      {/* Bottom 1-Click Inline CRM Action Bar (Sibling Toolbar)        */}
      {/* ------------------------------------------------------------- */}
      <div
        role="toolbar"
        aria-label="Seguimiento de postulación"
        className="px-5 pb-4 pt-2.5 border-t border-slate-100 bg-slate-50/40 rounded-b-2xl flex flex-wrap items-center justify-between gap-1.5"
      >
        <div className="flex flex-wrap items-center gap-1.5">
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
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold border transition-all disabled:opacity-50 ${
                  isCurrent
                    ? 'font-bold shadow-xs scale-[1.02]'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-blue-50/50 hover:text-[#2563EB] hover:border-blue-200'
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
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Icon
                    className={`h-3.5 w-3.5 ${
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
