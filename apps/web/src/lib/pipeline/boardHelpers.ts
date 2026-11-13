import { JobSummary, CrmStatus } from '../domain/types';

export type PipelineStage = 'favorite' | 'applied' | 'interview' | 'discarded';

export interface PipelineColumnMeta {
  key: PipelineStage;
  label: string;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

export const PIPELINE_COLUMNS: readonly PipelineColumnMeta[] = [
  {
    key: 'favorite',
    label: 'Destacada',
    description: 'Vacantes prioritarias con alto interés',
    color: '#92400E', // Amber
    bgColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  {
    key: 'applied',
    label: 'Postulado',
    description: 'Postulación enviada a través del portal de empleo',
    color: '#065F46', // Emerald
    bgColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  {
    key: 'interview',
    label: 'En entrevista',
    description: 'Proceso de selección activo con contacto de RRHH',
    color: '#5B21B6', // Purple
    bgColor: '#F5F3FF',
    borderColor: '#DDD6FE',
  },
  {
    key: 'discarded',
    label: 'Descartada',
    description: 'Descartada manualmente por el usuario',
    color: '#475569', // Slate
    bgColor: '#F1F5F9',
    borderColor: '#CBD5E1',
  },
] as const;

export type PipelineGroups = Record<PipelineStage, JobSummary[]>;

/**
 * Groups jobs strictly into the 4 active curated Kanban columns:
 * 'favorite', 'applied', 'interview', 'discarded'.
 * Jobs with 'to_apply' or undefined status are cleanly excluded from the board.
 */
export function groupJobsByPipelineStage(jobs: JobSummary[]): PipelineGroups {
  const groups: PipelineGroups = {
    favorite: [],
    applied: [],
    interview: [],
    discarded: [],
  };

  for (const job of jobs) {
    const status = job.user_status;
    if (
      status === 'favorite' ||
      status === 'applied' ||
      status === 'interview' ||
      status === 'discarded'
    ) {
      groups[status].push(job);
    }
  }

  return groups;
}

/**
 * Pure helper for optimistic stage/notes transition on the pipeline board.
 * Returns a new immutable JobSummary array.
 */
export function movePipelineJob(
  jobs: JobSummary[],
  listingId: number | string,
  nextStage: CrmStatus,
  nextNotes?: string,
  appliedAt?: string | null
): JobSummary[] {
  let found = false;
  const idStr = String(listingId);

  const updated = jobs.map((job) => {
    if (String(job.id) !== idStr) {
      return job;
    }

    found = true;

    // Calculate applied_at: if moving to 'applied' and not yet set, set to now or supplied appliedAt
    let nextAppliedAt: string | null = job.applied_at ?? null;
    if (nextStage === 'applied') {
      if (appliedAt !== undefined) {
        nextAppliedAt = appliedAt;
      } else if (!job.applied_at) {
        nextAppliedAt = new Date().toISOString();
      }
    }

    const nextNotesVal = nextNotes !== undefined ? nextNotes : (job.user_notes ?? '');

    return {
      ...job,
      user_status: nextStage,
      applied_at: nextAppliedAt,
      user_notes: nextNotesVal,
    };
  });

  return found ? updated : jobs;
}

/**
 * Pure helper to rollback pipeline state to a captured snapshot.
 */
export function rollbackPipelineJobs(
  snapshotOrCurrent: JobSummary[],
  snapshot?: JobSummary[],
  targetId?: number | string
): JobSummary[] {
  if (Array.isArray(snapshot)) {
    if (targetId !== undefined) {
      const prev = snapshot.find((j) => String(j.id) === String(targetId));
      if (!prev) return snapshotOrCurrent;
      return snapshotOrCurrent.map((j) =>
        String(j.id) === String(targetId) ? { ...prev } : j
      );
    }
    return snapshot.map((j) => ({ ...j }));
  }

  return snapshotOrCurrent.map((j) => ({ ...j }));
}
