'use client';

import React from 'react';
import { ExternalLink, Star, MapPin, Building2, Banknote } from 'lucide-react';
import { JobSummary, CRM_STATUS_META } from '@/lib/domain/types';
import { getJobAgePill } from '@/lib/domain/ranking';
import { CompanyMonogram } from './CompanyMonogram';

interface JobCardProps {
  job: JobSummary;
  isSelected: boolean;
  onSelect: () => void;
  onToggleFavorite?: (job: JobSummary) => void;
}

export function JobCard({
  job,
  isSelected,
  onSelect,
  onToggleFavorite,
}: JobCardProps) {
  const agePill = React.useMemo(() => getJobAgePill(job), [job]);

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

  const isFavorited = job.user_status === 'favorite';
  const crmMeta = job.user_status ? CRM_STATUS_META[job.user_status] : null;

  return (
    <article
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      tabIndex={0}
      role="button"
      aria-pressed={isSelected}
      className={`group relative flex cursor-pointer flex-col gap-3 rounded-2xl border p-4 sm:p-5 transition-all text-left focus:outline-none focus:ring-2 focus:ring-blue-600 ${
        isSelected
          ? 'border-blue-900 bg-blue-50/20 shadow-md ring-1 ring-blue-900'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs'
      }`}
    >
      {/* Header: Monogram + Title + Quick Actions */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <CompanyMonogram
            brandKey={job.resolved_brand_key}
            companyName={job.company}
            size="md"
          />
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 line-clamp-2 leading-snug group-hover:text-blue-950 transition-colors">
              {job.title}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-600">
              <span className="font-semibold text-slate-800 inline-flex items-center gap-1">
                <Building2 className="h-3 w-3 text-slate-600" />
                {job.company}
              </span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3 text-slate-600" />
                {job.location || 'Lima, Perú'}
              </span>
            </div>
          </div>
        </div>

        {/* Favorite quick toggle & External link */}
        <div className="flex items-center gap-1 shrink-0">
          {onToggleFavorite && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(job);
              }}
              className={`rounded-lg p-1.5 transition-colors ${
                isFavorited
                  ? 'text-amber-500 hover:text-amber-600'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-600'
              }`}
              title={isFavorited ? 'Quitar de destacadas' : 'Marcar como destacada'}
              aria-label={isFavorited ? 'Quitar de destacadas' : 'Marcar como destacada'}
            >
              <Star
                className={`h-4 w-4 ${isFavorited ? 'fill-amber-400 text-amber-500' : ''}`}
              />
            </button>
          )}

          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            title="Abrir convocatoria original en nueva pestaña"
            aria-label="Abrir convocatoria original"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>

      {/* Agency Clue Pill (when resolved via agency) */}
      {job.resolved_via_agency && (
        <div className="rounded-lg bg-slate-100/80 px-2.5 py-1 text-[11px] font-medium text-slate-700 border border-slate-200">
          <span className="font-semibold text-blue-900">Vía Agencia:</span> {job.company}
          {job.resolved_brand_key && (
            <span className="ml-1 text-slate-800">
              · Cliente detectado: <strong className="uppercase">{job.resolved_brand_key}</strong>
            </span>
          )}
          {job.agency_clue && !job.resolved_brand_key && (
            <span className="ml-1 text-slate-600">({job.agency_clue})</span>
          )}
        </div>
      )}

      {/* Search match note */}
      {job._search_note && (
        <div className="text-[11px] font-medium text-blue-800">
          💡 {job._search_note}
        </div>
      )}

      {/* Footer Pills: Salary, Modality, Age, Score, CRM status */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Modality pill */}
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
            {job.modality || 'No especificado'}
          </span>

          {/* Salary if available */}
          {job.salary && (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 border border-emerald-200/60">
              <Banknote className="h-3 w-3 text-emerald-600" />
              {job.salary}
            </span>
          )}

          {/* Antiquity pill */}
          {agePill && (
            <span
              className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${agePill.bgClass}`}
            >
              {agePill.label}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* User CRM status badge if set */}
          {crmMeta && (
            <span
              className="rounded-md border px-2 py-0.5 text-[11px] font-semibold"
              style={{
                backgroundColor: crmMeta.bgColor,
                color: crmMeta.color,
                borderColor: crmMeta.borderColor,
              }}
            >
              {crmMeta.label}
            </span>
          )}

          {/* AI Score pill */}
          <span
            className={`rounded-md border px-2 py-0.5 text-[11px] font-bold font-mono ${scoreBadgeConfig.bg}`}
          >
            {scoreBadgeConfig.label}
          </span>
        </div>
      </div>
    </article>
  );
}
