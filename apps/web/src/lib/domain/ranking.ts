/**
 * Reglas de ordenamiento, fechas y ranking compartidas en la plataforma web.
 * Preferencia del candidato: Híbrido > Presencial > Remoto > No especificado,
 * y dentro de cada modalidad, mayor puntaje primero.
 *
 * Port directo de services/pipeline/domain/ranking.py
 */

export const MODALITY_ORDER: Record<string, number> = {
  Híbrido: 0,
  Presencial: 1,
  Remoto: 2,
  'No especificado': 3,
};

/**
 * Parsea fechas en formatos ISO (YYYY-MM-DD), latinos (DD-MM-YYYY, DD/MM/YYYY) o con hora
 * de manera neutral a zona horaria (evita desfases de -1 día por UTC-5 en Lima).
 */
export function parseJobDate(
  dateStr: string | null | undefined
): Date | null {
  if (!dateStr) return null;
  const cleaned = String(dateStr).trim();
  if (!cleaned) return null;

  // 1. Extraer los primeros 10 caracteres (YYYY-MM-DD o DD-MM-YYYY o DD/MM/YYYY)
  const part = cleaned.slice(0, 10);

  // ISO: YYYY-MM-DD o YYYY/MM/DD
  const isoMatch = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(part);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (year > 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    }
  }

  // Latino: DD-MM-YYYY o DD/MM/YYYY
  const latinMatch = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(part);
  if (latinMatch) {
    const day = Number(latinMatch[1]);
    const month = Number(latinMatch[2]);
    const year = Number(latinMatch[3]);
    if (year > 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    }
  }

  // Fallback con Date.parse
  const parsed = Date.parse(cleaned);
  if (!isNaN(parsed)) {
    const d = new Date(parsed);
    return new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0)
    );
  }

  return null;
}

export function getJobAgeDays(
  job: {
    published_date?: string | null;
    published_at?: string | null;
    created_at?: string | null;
  },
  now?: Date
): number | null {
  const dt =
    parseJobDate(job.published_date) ||
    parseJobDate(job.published_at) ||
    parseJobDate(job.created_at);

  if (!dt) return null;

  const ref = now || new Date();
  const refUtc = Date.UTC(
    ref.getUTCFullYear(),
    ref.getUTCMonth(),
    ref.getUTCDate(),
    12,
    0,
    0
  );
  const dtUtc = Date.UTC(
    dt.getUTCFullYear(),
    dt.getUTCMonth(),
    dt.getUTCDate(),
    12,
    0,
    0
  );

  const delta = Math.floor((refUtc - dtUtc) / (1000 * 60 * 60 * 24));
  return Math.max(0, delta);
}

export function isJobRecent(
  job: {
    published_date?: string | null;
    published_at?: string | null;
    created_at?: string | null;
  },
  maxDays: number = 14,
  now?: Date
): boolean {
  const ageDays = getJobAgeDays(job, now);
  if (ageDays === null) {
    return true; // Fechas sin parsear se incluyen de forma segura
  }
  return ageDays <= maxDays;
}

export function getJobAgeLabel(
  job: {
    published_date?: string | null;
    published_at?: string | null;
    created_at?: string | null;
  },
  now?: Date
): string {
  const ageDays = getJobAgeDays(job, now);
  if (ageDays === null) return '';

  if (ageDays === 0) return 'Hoy';
  if (ageDays === 1) return 'Ayer';
  if (ageDays < 7) return `Hace ${ageDays}d`;
  if (ageDays < 14) return 'Hace 1 sem';
  if (ageDays < 21) return 'Hace 2 sem';
  if (ageDays < 30) return 'Hace 3 sem';
  if (ageDays < 60) return `Hace ${Math.floor(ageDays / 30)} mes`;
  return `Hace ${Math.floor(ageDays / 30)} meses`;
}

export interface JobAgePillInfo {
  label: string;
  variant: 'emerald' | 'navy' | 'slate';
  bgClass: string;
  textClass: string;
}

export function getJobAgePill(
  job: {
    published_date?: string | null;
    published_at?: string | null;
    created_at?: string | null;
  },
  now?: Date
): JobAgePillInfo | null {
  const ageDays = getJobAgeDays(job, now);
  if (ageDays === null) return null;
  const label = getJobAgeLabel(job, now);

  if (ageDays <= 7) {
    return {
      label,
      variant: 'emerald',
      bgClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      textClass: 'text-emerald-700',
    };
  }
  if (ageDays <= 14) {
    return {
      label,
      variant: 'navy',
      bgClass: 'bg-blue-50 text-blue-800 border-blue-200',
      textClass: 'text-blue-700',
    };
  }
  return {
    label,
    variant: 'slate',
    bgClass: 'bg-slate-100 text-slate-700 border-slate-200',
    textClass: 'text-slate-600',
  };
}

export function sortByModalityThenScore<
  T extends { modality?: string; final_ranking_score?: number }
>(jobs: readonly T[]): T[] {
  return [...jobs].sort((a, b) => {
    const modA = MODALITY_ORDER[a.modality || ''] ?? 9;
    const modB = MODALITY_ORDER[b.modality || ''] ?? 9;

    if (modA !== modB) {
      return modA - modB;
    }

    const scoreA = Number(a.final_ranking_score) || 0;
    const scoreB = Number(b.final_ranking_score) || 0;
    return scoreB - scoreA;
  });
}

export function isRecommended(
  job: {
    is_pre_professional?: boolean;
    is_unrealistic_or_smoke?: boolean;
    final_ranking_score?: number;
  },
  minScore: number = 50.0
): boolean {
  return (
    Boolean(job.is_pre_professional) &&
    !Boolean(job.is_unrealistic_or_smoke) &&
    (Number(job.final_ranking_score) || 0) >= minScore
  );
}
