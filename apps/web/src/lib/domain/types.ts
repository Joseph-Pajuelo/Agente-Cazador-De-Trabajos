/**
 * Domain types matching the Python pipeline (services/pipeline/domain/)
 * and Supabase initial schema (supabase/migrations/202611130001_initial_schema.sql).
 */

import type { RoleLevel, EnglishLevel } from './jobNormalization';

export type CrmStatus =
  | 'to_apply'
  | 'favorite'
  | 'applied'
  | 'interview'
  | 'discarded';

export interface CrmStatusMeta {
  key: CrmStatus;
  label: string;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

export const CRM_STATUS_META: Record<CrmStatus, CrmStatusMeta> = {
  to_apply: {
    key: 'to_apply',
    label: 'Por postular',
    description: 'Vacantes guardadas para revisar y preparar postulación',
    color: '#1E3A8A', // Navy
    bgColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  favorite: {
    key: 'favorite',
    label: 'Destacada',
    description: 'Vacantes prioritarias con alto interés',
    color: '#92400E', // Amber
    bgColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  applied: {
    key: 'applied',
    label: 'Postulado',
    description: 'Postulación enviada a través del portal de empleo',
    color: '#065F46', // Emerald
    bgColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  interview: {
    key: 'interview',
    label: 'En entrevista',
    description: 'Proceso de selección activo con contacto de RRHH',
    color: '#5B21B6', // Purple
    bgColor: '#F5F3FF',
    borderColor: '#DDD6FE',
  },
  discarded: {
    key: 'discarded',
    label: 'Descartada',
    description: 'Descartada manualmente por el usuario',
    color: '#475569', // Slate
    bgColor: '#F1F5F9',
    borderColor: '#CBD5E1',
  },
};

export type JobSource =
  | 'practicas_pe'
  | 'bumeran'
  | 'computrabajo'
  | 'linkedin'
  | 'cvmatcher'
  | (string & {});

export const SOURCE_LABELS: Record<string, string> = {
  practicas_pe: 'Prácticas Perú',
  bumeran: 'Bumeran',
  computrabajo: 'CompuTrabajo',
  linkedin: 'LinkedIn',
  cvmatcher: 'CVMatcher',
};

export type Modality =
  | 'Híbrido'
  | 'Presencial'
  | 'Remoto'
  | 'No especificado'
  | (string & {});

export interface ReasoningChain {
  academic_eligibility: string;
  experience_requirements: string;
  tech_stack_overlap: string;
  gaps_and_risks: string;
  score_rationale: string;
}

export interface JobEvaluation {
  id?: number;
  listing_id?: number;
  profile_id?: string | null;
  is_pre_professional: boolean;
  is_unrealistic_or_smoke: boolean;
  technical_match_score: number;
  modality_score: number;
  location_score: number;
  final_ranking_score: number;
  matching_skills: string[];
  missing_skills: string[];
  verdict_summary: string;
  reasoning_chain?: ReasoningChain | null;
  engine?: string;
  evaluated_at?: string;
}

export interface JobSummary {
  id: number | string;
  deduplication_hash: string;
  source: JobSource | string;
  title: string;
  company: string;
  location: string;
  modality: Modality | string;
  url: string;
  salary: string | null;
  published_at: string | null;
  published_date: string | null;
  status?: string;
  created_at?: string;

  // Precomputed employer metadata
  resolved_brand_key: string | null;
  resolved_via_agency: boolean;
  agency_clue: string;
  sector_hint: string | null;

  // Evaluated AI metrics (optional if pending evaluation)
  is_pre_professional?: boolean;
  is_unrealistic_or_smoke?: boolean;
  technical_match_score?: number;
  modality_score?: number;
  location_score?: number;
  final_ranking_score?: number;
  matching_skills?: string[];
  missing_skills?: string[];
  verdict_summary?: string;
  reasoning_chain?: ReasoningChain | null;
  engine?: string;

  // Authenticated user CRM state (joined from public.user_job_states)
  user_status?: CrmStatus | null;
  applied_at?: string | null;
  user_notes?: string | null;

  // Normalized Lima location, category, role, English and salary metadata
  district?: string | null;
  lima_zone?: string | null;
  category?: string | null;
  role_level?: RoleLevel | null;
  english_required?: boolean;
  english_level?: EnglishLevel | null;
  salary_min?: number | null;
  salary_max?: number | null;

  // Runtime search engine annotation
  _search_note?: string | null;
}

export interface JobListing extends JobSummary {
  raw_description: string;
}

export interface UserProfile {
  id: string; // uuid from auth.users
  full_name: string;
  headline: string;
  university: string;
  current_cycle: string;
  preferred_districts: string[];
  excluded_districts?: string[];
  modality_priority: string[];
  target_areas: string[];
  technical_skills: Record<string, unknown>;
  is_admin: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface UserJobState {
  id?: number;
  user_id: string;
  listing_id: number;
  status: CrmStatus;
  applied_at?: string | null;
  notes: string;
  updated_at?: string;
}

export interface Brand {
  key: string;
  display: string;
  code: string;
  color: string;
  tint: string;
  sector: string;
  patterns: readonly string[];
  triggers?: readonly string[];
  clues?: readonly string[];
}

export interface Employer {
  brand: Brand | null;
  basis: 'publisher' | 'agency_explicit' | 'agency_clue' | 'unknown';
  publisher: string;
  clue: string;
  sector_hint: string | null;
  via_agency: boolean;
  extra?: Record<string, unknown>;
}

export interface SearchOutcome {
  jobs: JobSummary[];
  corrected_query?: string | null;
  did_you_mean: string[];
  related_suggestions: string[];
  agency_matches_count: number;
  inferred_brand?: Brand | null;
}
