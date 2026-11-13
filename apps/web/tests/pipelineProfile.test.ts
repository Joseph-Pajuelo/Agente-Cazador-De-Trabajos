import { describe, it, expect } from 'vitest';
import {
  groupJobsByPipelineStage,
  movePipelineJob,
  rollbackPipelineJobs,
  PipelineStage,
  PIPELINE_COLUMNS,
} from '../src/lib/pipeline/boardHelpers';
import {
  parseCommaListInput,
  normalizeSkillsForSubmit,
  toProfileFormState,
  toProfileUpdateInput,
  ProfileFormState,
} from '../src/lib/profile/profileFormHelpers';
import { validateProfileUpdatePayload } from '../src/actions/profile';
import { JobSummary, UserProfile } from '../src/lib/domain/types';
import { calculatePipelineCounts } from '../src/lib/supabase/queries';

describe('Task 6: Pipeline Board & Profile Form Helpers', () => {
  const sampleJobs: JobSummary[] = [
    {
      id: 1,
      deduplication_hash: 'hash-1',
      source: 'linkedin',
      title: 'Practicante de Sistemas',
      company: 'BCP',
      location: 'La Molina, Lima',
      modality: 'Híbrido',
      url: 'https://bcp.pe/jobs/1',
      salary: 'S/ 1,500',
      published_at: '2026-11-10T10:00:00Z',
      published_date: '2026-11-10',
      resolved_brand_key: 'bcp',
      resolved_via_agency: false,
      agency_clue: '',
      sector_hint: 'Banca y Finanzas',
      final_ranking_score: 88,
      user_status: 'favorite',
      user_notes: 'Interesante vacante en sede central',
    },
    {
      id: 2,
      deduplication_hash: 'hash-2',
      source: 'bumeran',
      title: 'Practicante Pre-Profesional Backend Python',
      company: 'Interbank',
      location: 'San Isidro, Lima',
      modality: 'Híbrido',
      url: 'https://interbank.pe/jobs/2',
      salary: null,
      published_at: '2026-11-09T10:00:00Z',
      published_date: '2026-11-09',
      resolved_brand_key: 'interbank',
      resolved_via_agency: false,
      agency_clue: '',
      sector_hint: 'Banca y Finanzas',
      final_ranking_score: 92,
      user_status: 'applied',
      applied_at: '2026-11-10T12:00:00Z',
      user_notes: 'Postulado por portal con CV versión datos',
    },
    {
      id: 3,
      deduplication_hash: 'hash-3',
      source: 'computrabajo',
      title: 'Practicante de Datos y BI',
      company: 'BBVA',
      location: 'San Isidro, Lima',
      modality: 'Presencial',
      url: 'https://bbva.pe/jobs/3',
      salary: null,
      published_at: '2026-11-08T10:00:00Z',
      published_date: '2026-11-08',
      resolved_brand_key: 'bbva',
      resolved_via_agency: false,
      agency_clue: '',
      sector_hint: 'Banca y Finanzas',
      final_ranking_score: 85,
      user_status: 'interview',
      applied_at: '2026-11-09T08:00:00Z',
      user_notes: 'Entrevista técnica el viernes 14',
    },
    {
      id: 4,
      deduplication_hash: 'hash-4',
      source: 'practicas_pe',
      title: 'Practicante QA',
      company: 'Empresa X',
      location: 'Callao',
      modality: 'Presencial',
      url: 'https://example.com/jobs/4',
      salary: null,
      published_at: '2026-11-05T10:00:00Z',
      published_date: '2026-11-05',
      resolved_brand_key: null,
      resolved_via_agency: false,
      agency_clue: '',
      sector_hint: null,
      final_ranking_score: 55,
      user_status: 'discarded',
      user_notes: 'Horario incompatible',
    },
    {
      id: 5,
      deduplication_hash: 'hash-5',
      source: 'linkedin',
      title: 'Practicante Cloud DevOps',
      company: 'Alicorp',
      location: 'Miraflores, Lima',
      modality: 'Remoto',
      url: 'https://alicorp.pe/jobs/5',
      salary: null,
      published_at: '2026-11-11T10:00:00Z',
      published_date: '2026-11-11',
      resolved_brand_key: 'alicorp',
      resolved_via_agency: false,
      agency_clue: '',
      sector_hint: 'Consumo Masivo',
      final_ranking_score: 80,
      user_status: 'to_apply', // Saved in radar but not in curated Kanban pipeline
      user_notes: '',
    },
  ];

  describe('1. boardHelpers', () => {
    describe('groupJobsByPipelineStage', () => {
      it('groups jobs strictly into the 4 curated pipeline columns', () => {
        const groups = groupJobsByPipelineStage(sampleJobs);

        expect(groups).toBeDefined();
        expect(groups.favorite.length).toBe(1);
        expect(groups.favorite[0].id).toBe(1);

        expect(groups.applied.length).toBe(1);
        expect(groups.applied[0].id).toBe(2);

        expect(groups.interview.length).toBe(1);
        expect(groups.interview[0].id).toBe(3);

        expect(groups.discarded.length).toBe(1);
        expect(groups.discarded[0].id).toBe(4);
      });

      it('omits jobs with status "to_apply" or undefined from the 4 curated columns', () => {
        const groups = groupJobsByPipelineStage(sampleJobs);
        const allBoardJobIds = [
          ...groups.favorite,
          ...groups.applied,
          ...groups.interview,
          ...groups.discarded,
        ].map((j) => j.id);

        expect(allBoardJobIds).not.toContain(5); // id 5 is 'to_apply'
      });

      it('returns empty arrays for all 4 stages when jobs list is empty', () => {
        const emptyGroups = groupJobsByPipelineStage([]);
        expect(emptyGroups.favorite).toEqual([]);
        expect(emptyGroups.applied).toEqual([]);
        expect(emptyGroups.interview).toEqual([]);
        expect(emptyGroups.discarded).toEqual([]);
      });

      it('exposes PIPELINE_COLUMNS with correct metadata in intended order', () => {
        expect(PIPELINE_COLUMNS).toHaveLength(4);
        const keys = PIPELINE_COLUMNS.map((c) => c.key);
        expect(keys).toEqual(['favorite', 'applied', 'interview', 'discarded']);
      });
    });

    describe('movePipelineJob', () => {
      it('transitions stage to "applied" and updates applied_at with timestamp', () => {
        const updated = movePipelineJob(sampleJobs, 1, 'applied');
        const movedJob = updated.find((j) => j.id === 1);

        expect(movedJob?.user_status).toBe('applied');
        expect(movedJob?.applied_at).toBeDefined();
        expect(typeof movedJob?.applied_at).toBe('string');
        // Ensure immutability
        expect(sampleJobs.find((j) => j.id === 1)?.user_status).toBe('favorite');
      });

      it('transitions from "applied" to "interview" while preserving original applied_at', () => {
        const originalAppliedAt = sampleJobs.find((j) => j.id === 2)?.applied_at;
        const updated = movePipelineJob(sampleJobs, 2, 'interview');
        const movedJob = updated.find((j) => j.id === 2);

        expect(movedJob?.user_status).toBe('interview');
        expect(movedJob?.applied_at).toBe(originalAppliedAt);
      });

      it('allows updating notes alongside stage transition', () => {
        const updated = movePipelineJob(sampleJobs, 1, 'favorite', 'Nota actualizada');
        const movedJob = updated.find((j) => j.id === 1);

        expect(movedJob?.user_status).toBe('favorite');
        expect(movedJob?.user_notes).toBe('Nota actualizada');
      });

      it('allows moving a job back to "to_apply" (which removes it from Kanban view)', () => {
        const updated = movePipelineJob(sampleJobs, 1, 'to_apply');
        const movedJob = updated.find((j) => j.id === 1);

        expect(movedJob?.user_status).toBe('to_apply');
        const groups = groupJobsByPipelineStage(updated);
        expect(groups.favorite.find((j) => j.id === 1)).toBeUndefined();
      });

      it('returns unchanged list if listingId is not found', () => {
        const updated = movePipelineJob(sampleJobs, 999, 'applied');
        expect(updated).toEqual(sampleJobs);
      });
    });

    describe('rollbackPipelineJobs', () => {
      it('restores previous snapshot on failure', () => {
        const snapshot = [...sampleJobs];
        const optimisticallyMoved = movePipelineJob(sampleJobs, 1, 'applied');
        expect(optimisticallyMoved.find((j) => j.id === 1)?.user_status).toBe('applied');

        const rolledBack = rollbackPipelineJobs(snapshot);
        expect(rolledBack.find((j) => j.id === 1)?.user_status).toBe('favorite');
      });
    });

    describe('calculatePipelineCounts (Navbar badge support)', () => {
      it('returns zero counts for empty user job states', () => {
        const counts = calculatePipelineCounts([]);
        expect(counts).toEqual({
          favoriteCount: 0,
          appliedCount: 0,
          interviewCount: 0,
          discardedCount: 0,
          totalTracked: 0,
        });
      });

      it('accurately calculates favoriteCount, appliedCount, and totalTracked for Navbar badges', () => {
        const mockStates = [
          { status: 'favorite' },
          { status: 'favorite' },
          { status: 'applied' },
          { status: 'applied' },
          { status: 'applied' },
          { status: 'interview' },
          { status: 'discarded' },
          { status: 'to_apply' }, // uncurated radar listing
        ];

        const counts = calculatePipelineCounts(mockStates);

        expect(counts.favoriteCount).toBe(2);
        expect(counts.appliedCount).toBe(3);
        expect(counts.interviewCount).toBe(1);
        expect(counts.discardedCount).toBe(1);
        expect(counts.totalTracked).toBe(7); // excludes to_apply from active pipeline
      });

      it('handles null/undefined status entries without error', () => {
        const counts = calculatePipelineCounts([
          { status: null },
          { status: undefined },
          { status: 'applied' },
        ]);
        expect(counts.appliedCount).toBe(1);
        expect(counts.totalTracked).toBe(1);
      });
    });
  });

  describe('2. profileFormHelpers', () => {
    describe('parseCommaListInput', () => {
      it('parses comma-separated values into trimmed, deduplicated non-empty strings', () => {
        const input = ' San Isidro, Miraflores, Surco,  San Isidro ,  ';
        const parsed = parseCommaListInput(input);
        expect(parsed).toEqual(['San Isidro', 'Miraflores', 'Surco']);
      });

      it('returns empty array on empty or whitespace string', () => {
        expect(parseCommaListInput('')).toEqual([]);
        expect(parseCommaListInput('   ')).toEqual([]);
      });
    });

    describe('normalizeSkillsForSubmit', () => {
      it('normalizes category strings or arrays into clean string arrays', () => {
        const input = {
          core: 'Python, SQL, Python, TypeScript',
          frameworks: ['FastAPI', 'Next.js', 'FastAPI'],
          tools: 'Git, Docker, Linux',
        };
        const normalized = normalizeSkillsForSubmit(input);

        expect(normalized.core).toEqual(['Python', 'SQL', 'TypeScript']);
        expect(normalized.frameworks).toEqual(['FastAPI', 'Next.js']);
        expect(normalized.tools).toEqual(['Git', 'Docker', 'Linux']);
      });

      it('handles empty input gracefully', () => {
        const normalized = normalizeSkillsForSubmit({});
        expect(normalized).toBeDefined();
        expect(typeof normalized).toBe('object');
      });
    });

    describe('toProfileFormState', () => {
      const mockProfile: UserProfile = {
        id: 'usr-123',
        full_name: 'Joseph Thorne',
        headline: 'Estudiante de Ing. de Sistemas',
        university: 'Universidad Nacional de Ingeniería',
        current_cycle: '8vo ciclo',
        preferred_districts: ['San Isidro', 'Miraflores'],
        modality_priority: ['Híbrido', 'Presencial', 'Remoto'],
        target_areas: ['Desarrollo Backend', 'Datos'],
        technical_skills: {
          core: ['Python', 'SQL'],
          frameworks: ['FastAPI'],
          tools: ['Git', 'Docker'],
        },
        is_admin: false,
      };

      it('converts UserProfile to UI-friendly ProfileFormState', () => {
        const state = toProfileFormState(mockProfile);

        expect(state.full_name).toBe('Joseph Thorne');
        expect(state.headline).toBe('Estudiante de Ing. de Sistemas');
        expect(state.university).toBe('Universidad Nacional de Ingeniería');
        expect(state.current_cycle).toBe('8vo ciclo');
        expect(state.preferred_districts).toEqual(['San Isidro', 'Miraflores']);
        expect(state.modality_priority).toEqual(['Híbrido', 'Presencial', 'Remoto']);
        expect(state.target_areas).toEqual(['Desarrollo Backend', 'Datos']);
        expect(state.core_skills).toBe('Python, SQL');
        expect(state.frameworks).toBe('FastAPI');
        expect(state.tools).toBe('Git, Docker');

        // Security check: is_admin MUST NOT be present
        expect((state as unknown as Record<string, unknown>).is_admin).toBeUndefined();
      });

      it('provides sensible defaults when profile is null', () => {
        const state = toProfileFormState(null);

        expect(state.full_name).toBe('');
        expect(state.university).toBe('');
        expect(state.current_cycle).toBe('');
        expect(state.preferred_districts).toEqual([]);
        expect(state.modality_priority).toEqual(['Híbrido', 'Presencial', 'Remoto']);
        expect(state.target_areas).toEqual([]);
        expect(state.core_skills).toBe('');
      });
    });

    describe('toProfileUpdateInput', () => {
      it('converts form state to a validated ProfileUpdateInput payload', async () => {
        const formState: ProfileFormState = {
          full_name: ' Joseph Thorne ',
          headline: ' Estudiante de Sistemas ',
          university: ' UNI ',
          current_cycle: ' 8vo ciclo ',
          preferred_districts: ['San Isidro', 'Surco'],
          modality_priority: ['Híbrido', 'Presencial', 'Remoto'],
          target_areas: ['Backend', 'Datos'],
          core_skills: 'Python, SQL',
          frameworks: 'FastAPI, Django',
          tools: 'Git, Docker',
        };

        const updateInput = toProfileUpdateInput(formState);

        expect(updateInput.full_name).toBe('Joseph Thorne');
        expect(updateInput.headline).toBe('Estudiante de Sistemas');
        expect(updateInput.university).toBe('UNI');
        expect(updateInput.current_cycle).toBe('8vo ciclo');
        expect(updateInput.preferred_districts).toEqual(['San Isidro', 'Surco']);
        expect(updateInput.modality_priority).toEqual(['Híbrido', 'Presencial', 'Remoto']);
        expect(updateInput.target_areas).toEqual(['Backend', 'Datos']);
        expect(updateInput.technical_skills).toEqual({
          core: ['Python', 'SQL'],
          frameworks: ['FastAPI', 'Django'],
          tools: ['Git', 'Docker'],
        });

        // Ensure payload is valid against server validation
        const validation = await validateProfileUpdatePayload(updateInput);
        expect(validation.ok).toBe(true);

        // Security guarantees: no is_admin, no min_score_pref
        expect((updateInput as Record<string, unknown>).is_admin).toBeUndefined();
        expect((updateInput as Record<string, unknown>).min_score_pref).toBeUndefined();
      });
    });
  });
});
