import { UserProfile } from '../domain/types';
import { ProfileUpdateInput } from '../../actions/profile';

export interface ProfileFormState {
  full_name: string;
  headline: string;
  university: string;
  current_cycle: string;
  preferred_districts: string[];
  excluded_districts: string[];
  modality_priority: string[];
  target_areas: string[];
  core_skills: string;
  frameworks: string;
  tools: string;
}

/**
 * Common Lima districts for quick-pick chips in ProfileForm
 */
export const AVAILABLE_DISTRICTS: readonly string[] = [
  'San Isidro',
  'Miraflores',
  'Surco',
  'San Borja',
  'La Molina',
  'Jesús María',
  'Magdalena',
  'Lince',
  'Pueblo Libre',
  'San Miguel',
  'Barranco',
  'Cercado de Lima',
  'Los Olivos',
  'Callao',
] as const;

/**
 * Common Lima districts for exclusion chips in ProfileForm
 */
export const COMMON_EXCLUDED_DISTRICTS: readonly string[] = [
  'Ate',
  'Santa Anita',
  'San Juan de Lurigancho',
  'Lurigancho - Chosica',
  'Callao',
  'San Martín de Porres',
  'Los Olivos',
  'Independencia',
  'Villa El Salvador',
  'Villa María del Triunfo',
  'San Juan de Miraflores',
  'Chorrillos',
  'La Victoria',
  'Rímac',
  'Breña',
  'Surquillo',
  'Lima Centro',
] as const;

export const AVAILABLE_MODALITIES: readonly string[] = [
  'Híbrido',
  'Presencial',
  'Remoto',
] as const;

export const COMMON_TARGET_AREAS: readonly string[] = [
  'Desarrollo Backend',
  'Desarrollo Frontend',
  'Fullstack',
  'Datos & Analytics',
  'Cloud & DevOps',
  'QA & Testing',
  'Ciberseguridad',
  'IA & Machine Learning',
] as const;

/**
 * Parses comma-separated values into trimmed, deduplicated non-empty strings.
 */
export function parseCommaListInput(input?: string | null): string[] {
  if (!input || typeof input !== 'string') {
    return [];
  }

  const items = input
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  // Deduplicate while preserving casing of first occurrence
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }

  return result;
}

/**
 * Normalizes input skills into clean string arrays per category.
 */
export function normalizeSkillsForSubmit(
  skillsInput?: Record<string, unknown> | null
): Record<string, string[]> {
  if (!skillsInput || typeof skillsInput !== 'object') {
    return {};
  }

  const normalized: Record<string, string[]> = {};

  for (const [category, val] of Object.entries(skillsInput)) {
    if (typeof val === 'string') {
      normalized[category] = parseCommaListInput(val);
    } else if (Array.isArray(val)) {
      const items = val
        .map((x) => (typeof x === 'string' ? x.trim() : String(x).trim()))
        .filter((x) => x.length > 0);

      const seen = new Set<string>();
      const deduplicated: string[] = [];
      for (const item of items) {
        const key = item.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          deduplicated.push(item);
        }
      }
      normalized[category] = deduplicated;
    }
  }

  return normalized;
}

/**
 * Converts a UserProfile into a UI-friendly ProfileFormState.
 * Guarantees is_admin is never leaked into form state.
 */
export function toProfileFormState(profile: UserProfile | null): ProfileFormState {
  if (!profile) {
    return {
      full_name: '',
      headline: '',
      university: '',
      current_cycle: '',
      preferred_districts: [],
      excluded_districts: [],
      modality_priority: ['Híbrido', 'Presencial', 'Remoto'],
      target_areas: [],
      core_skills: '',
      frameworks: '',
      tools: '',
    };
  }

  const skills = (profile.technical_skills || {}) as Record<string, unknown>;

  const formatSkillCategory = (val: unknown): string => {
    if (Array.isArray(val)) {
      return val.join(', ');
    }
    if (typeof val === 'string') {
      return val;
    }
    return '';
  };

  return {
    full_name: profile.full_name || '',
    headline: profile.headline || '',
    university: profile.university || '',
    current_cycle: profile.current_cycle || '',
    preferred_districts: Array.isArray(profile.preferred_districts)
      ? [...profile.preferred_districts]
      : [],
    excluded_districts: Array.isArray(profile.excluded_districts)
      ? [...profile.excluded_districts]
      : [],
    modality_priority:
      Array.isArray(profile.modality_priority) && profile.modality_priority.length > 0
        ? [...profile.modality_priority]
        : ['Híbrido', 'Presencial', 'Remoto'],
    target_areas: Array.isArray(profile.target_areas)
      ? [...profile.target_areas]
      : [],
    core_skills: formatSkillCategory(skills.core),
    frameworks: formatSkillCategory(skills.frameworks),
    tools: formatSkillCategory(skills.tools),
  };
}

/**
 * Converts UI form state into a strictly validated ProfileUpdateInput payload
 * aligned with public.profiles columns.
 */
export function toProfileUpdateInput(formState: ProfileFormState): ProfileUpdateInput {
  const core = parseCommaListInput(formState.core_skills);
  const frameworks = parseCommaListInput(formState.frameworks);
  const tools = parseCommaListInput(formState.tools);

  const technical_skills: Record<string, string[]> = {};
  if (core.length > 0) technical_skills.core = core;
  if (frameworks.length > 0) technical_skills.frameworks = frameworks;
  if (tools.length > 0) technical_skills.tools = tools;

  const payload: ProfileUpdateInput = {
    full_name: formState.full_name.trim(),
    headline: formState.headline.trim(),
    university: formState.university.trim(),
    current_cycle: formState.current_cycle.trim(),
    preferred_districts: formState.preferred_districts,
    excluded_districts: formState.excluded_districts,
    modality_priority: formState.modality_priority,
    target_areas: formState.target_areas,
    technical_skills,
  };

  // Explicit safety guarantee: never include is_admin, isAdmin or min_score_pref
  const safePayload = { ...payload } as Record<string, unknown>;
  delete safePayload.is_admin;
  delete safePayload.isAdmin;
  delete safePayload.min_score_pref;

  return safePayload as ProfileUpdateInput;
}
