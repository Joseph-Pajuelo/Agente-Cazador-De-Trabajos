import { describe, it, expect } from 'vitest';
import {
  CrmStatus,
  CRM_STATUS_META,
  JobSummary,
  UserProfile,
} from '@/lib/domain/types';
import {
  resolveEmployer,
  getBrand,
  BRANDS,
  SECTOR_KEYWORDS,
  STAFFING_AGENCIES,
  resolveBrandOrSectorFromQuery,
  normalize,
  containsPhrase,
} from '@/lib/domain/companies';
import {
  searchJobs,
  suggestCorrections,
  SYNONYM_MAP,
  CANONICAL_VOCABULARY,
} from '@/lib/domain/searchEngine';
import {
  parseJobDate,
  getJobAgeDays,
  isJobRecent,
  getJobAgeLabel,
  sortByModalityThenScore,
  isRecommended,
  MODALITY_ORDER,
} from '@/lib/domain/ranking';

describe('Domain Types & CRM Metadata', () => {
  it('exports valid CRM_STATUS_META with Spanish labels', () => {
    expect(CRM_STATUS_META.to_apply.label).toBe('Por postular');
    expect(CRM_STATUS_META.favorite.label).toBe('Destacada');
    expect(CRM_STATUS_META.applied.label).toBe('Postulado');
    expect(CRM_STATUS_META.interview.label).toBe('En entrevista');
    expect(CRM_STATUS_META.discarded.label).toBe('Descartada');
  });

  it('type checks JobSummary and UserProfile structures', () => {
    const sampleProfile: UserProfile = {
      id: '11111111-2222-3333-4444-555555555555',
      full_name: 'Test Student',
      headline: 'Estudiante de Ing. de Sistemas',
      university: 'UNMSM',
      current_cycle: '8vo ciclo',
      preferred_districts: ['San Isidro', 'Miraflores'],
      modality_priority: ['Híbrido', 'Presencial', 'Remoto'],
      target_areas: ['Desarrollo Web', 'Data Analytics'],
      technical_skills: { python: 'intermedio', sql: 'avanzado' },
      is_admin: false,
    };
    expect(sampleProfile.id).toBeDefined();

    const sampleJob: JobSummary = {
      id: 101,
      deduplication_hash: 'hash-101',
      source: 'computrabajo',
      title: 'Practicante de Sistemas',
      company: 'Banco de Crédito BCP',
      location: 'Lima, Perú',
      modality: 'Híbrido',
      url: 'https://ejemplo.pe/job/101',
      salary: 'S/ 1,200',
      published_at: '2026-11-10',
      published_date: '2026-11-10',
      resolved_brand_key: 'bcp',
      resolved_via_agency: false,
      agency_clue: '',
      sector_hint: 'banca',
      is_pre_professional: true,
      is_unrealistic_or_smoke: false,
      technical_match_score: 0.85,
      modality_score: 1.0,
      location_score: 0.9,
      final_ranking_score: 87.5,
      matching_skills: ['python', 'sql'],
      missing_skills: ['docker'],
      verdict_summary: 'Buena oportunidad preprofesional',
      user_status: 'to_apply',
      applied_at: null,
      user_notes: 'Revisar temario técnico',
    };
    expect(sampleJob.title).toBe('Practicante de Sistemas');
    expect(sampleJob.resolved_brand_key).toBe('bcp');
  });
});

describe('Companies & Employer Resolution', () => {
  it('normalizes accents, casing, and punctuation identically to Python', () => {
    expect(normalize('BANCO DE CRÉDITO (BCP)')).toBe('banco de credito bcp');
    expect(normalize('Jesús María')).toBe('jesus maria');
    expect(normalize('  Rímac   Seguros! ')).toBe('rimac seguros');
    expect(normalize('')).toBe('');
  });

  it('checks phrase boundaries correctly with containsPhrase', () => {
    expect(containsPhrase('banco de credito bcp', 'bcp')).toBe(true);
    expect(containsPhrase('consorcio abcpx s.a.', 'bcp')).toBe(false);
    expect(containsPhrase('consorcio bcp express', 'bcp', true)).toBe(true);
  });

  it('resolves direct employer publisher correctly', () => {
    const employer = resolveEmployer('Banco de Crédito BCP', 'Practicante TI', 'Funciones en Lima');
    expect(employer.brand).not.toBeNull();
    expect(employer.brand?.key).toBe('bcp');
    expect(employer.basis).toBe('publisher');
    expect(employer.via_agency).toBe(false);
  });

  it('resolves agency explicit client correctly', () => {
    const employer = resolveEmployer('ManpowerGroup', 'Practicante de Datos BCP', 'Sede en San Isidro');
    expect(employer.brand).not.toBeNull();
    expect(employer.brand?.key).toBe('bcp');
    expect(employer.basis).toBe('agency_explicit');
    expect(employer.via_agency).toBe(true);
  });

  it('resolves agency indirect clues correctly (e.g. el banco más grande del Perú)', () => {
    const employer = resolveEmployer(
      'Adecco',
      'Practicante de Sistemas',
      'Importante entidad, el banco más grande del Perú solicita talento joven'
    );
    expect(employer.brand).not.toBeNull();
    expect(employer.brand?.key).toBe('bcp');
    expect(employer.basis).toBe('agency_clue');
    expect(employer.clue).toBe('banco mas grande del peru');
    expect(employer.via_agency).toBe(true);
  });

  it('resolves sector hint for unknown client published by agency and preserves via_agency === false', () => {
    const employer = resolveEmployer(
      'Experis',
      'Practicante Backend',
      'Importante entidad financiera solicita estudiantes para sector banca'
    );
    expect(employer.brand).toBeNull();
    expect(employer.basis).toBe('unknown');
    expect(employer.sector_hint).toBe('banca');
    expect(employer.via_agency).toBe(false);
  });

  it('returns via_agency === false when basis === unknown for agency with no client clues', () => {
    const employer = resolveEmployer(
      'ManpowerGroup',
      'Practicante de Archivo',
      'Funciones administrativas generales en oficina'
    );
    expect(employer.brand).toBeNull();
    expect(employer.basis).toBe('unknown');
    expect(employer.via_agency).toBe(false);
  });

  it('exports resolveBrandOrSectorFromQuery for downstream filter builders', () => {
    const resBcp = resolveBrandOrSectorFromQuery('practicas en bcp');
    expect(resBcp.brandKey).toBe('bcp');
    expect(resBcp.sectorHint).toBe('banca');
    expect(resBcp.expandedTerms).toContain('bcp');
    expect(resBcp.expandedTerms).toContain('banco de credito');

    const resBanca = resolveBrandOrSectorFromQuery('sector financiero');
    expect(resBanca.brandKey).toBeNull();
    expect(resBanca.sectorHint).toBe('banca');
    expect(resBanca.expandedTerms.length).toBeGreaterThan(0);
  });
});

describe('Search Engine Parity', () => {
  const sampleJobs: JobSummary[] = [
    {
      id: 1,
      deduplication_hash: 'hash-1',
      source: 'computrabajo',
      title: 'Practicante Pre Profesional de Python y SQL',
      company: 'Banco de Crédito BCP',
      location: 'San Isidro, Lima',
      modality: 'Híbrido',
      url: 'https://ejemplo.pe/1',
      salary: null,
      published_at: '2026-11-10',
      published_date: '2026-11-10',
      resolved_brand_key: 'bcp',
      resolved_via_agency: false,
      agency_clue: '',
      sector_hint: 'banca',
      final_ranking_score: 90,
    },
    {
      id: 2,
      deduplication_hash: 'hash-2',
      source: 'bumeran',
      title: 'Practicante de Analítica y Power BI',
      company: 'ManpowerGroup',
      location: 'Lima, Perú',
      modality: 'Presencial',
      url: 'https://ejemplo.pe/2',
      salary: null,
      published_at: '2026-11-09',
      published_date: '2026-11-09',
      resolved_brand_key: 'bcp',
      resolved_via_agency: true,
      agency_clue: 'el banco mas grande del peru',
      sector_hint: 'banca',
      final_ranking_score: 85,
    },
    {
      id: 3,
      deduplication_hash: 'hash-3',
      source: 'linkedin',
      title: 'Practicante Frontend React',
      company: 'Interbank',
      location: 'La Victoria, Lima',
      modality: 'Híbrido',
      url: 'https://ejemplo.pe/3',
      salary: null,
      published_at: '2026-11-08',
      published_date: '2026-11-08',
      resolved_brand_key: 'interbank',
      resolved_via_agency: false,
      agency_clue: '',
      sector_hint: 'banca',
      final_ranking_score: 80,
    },
  ];

  it('matches brand "bcp" with direct and agency jobs plus related sector suggestions', () => {
    const outcome = searchJobs(sampleJobs, 'bcp');
    expect(outcome.jobs.length).toBe(2);
    expect(outcome.jobs[0].id).toBe(1); // direct BCP
    expect(outcome.jobs[1].id).toBe(2); // Manpower agency BCP
    expect(outcome.jobs[1]._search_note).toBeDefined();
    expect(outcome.agency_matches_count).toBe(1);
    expect(outcome.inferred_brand?.key).toBe('bcp');
    expect(outcome.related_suggestions).toContain('Interbank');
  });

  it('corrects typo "phyton" to "python" and returns matching jobs', () => {
    const outcome = searchJobs(sampleJobs, 'phyton');
    expect(outcome.jobs.length).toBe(1);
    expect(outcome.jobs[0].id).toBe(1);
    expect(outcome.corrected_query).toBe('python');
    expect(outcome.did_you_mean).toContain('python');
  });

  it('handles typo "sani isidro" matching "San Isidro"', () => {
    const outcome = searchJobs(sampleJobs, 'sani isidro');
    expect(outcome.jobs.length).toBe(1);
    expect(outcome.jobs[0].id).toBe(1);
    expect(outcome.jobs[0].location).toContain('San Isidro');
  });

  it('handles variant/typo "pauer bi" matching "Power BI"', () => {
    const outcome = searchJobs(sampleJobs, 'pauer bi');
    expect(outcome.jobs.length).toBe(1);
    expect(outcome.jobs[0].id).toBe(2);
    expect(outcome.jobs[0].title).toContain('Power BI');
  });

  it('provides did_you_mean suggestions when query has no direct match', () => {
    const [corrected, suggestions] = suggestCorrections('pyhton');
    expect(corrected).toBe('python');
    expect(suggestions).toContain('python');
  });

  it('safely handles prototype property queries (constructor, toString) without crashing or false synonym match', () => {
    const outcomeConstructor = searchJobs(sampleJobs, 'constructor');
    expect(outcomeConstructor.jobs.length).toBe(0);
    expect(outcomeConstructor.inferred_brand).toBeNull();

    const outcomeToString = searchJobs(sampleJobs, 'toString');
    expect(outcomeToString.jobs.length).toBe(0);
    expect(outcomeToString.inferred_brand).toBeNull();
  });
});

describe('Date Parsing, Ranking & Modality Ordering', () => {
  it('parses dates timezone-neutrally without 1-day shifts across formats', () => {
    const d1 = parseJobDate('2026-11-12');
    expect(d1).not.toBeNull();
    expect(d1?.getUTCFullYear()).toBe(2026);
    expect(d1?.getUTCMonth()).toBe(10); // 0-indexed November is 10
    expect(d1?.getUTCDate()).toBe(12);

    const d2 = parseJobDate('12-11-2026');
    expect(d2?.getUTCDate()).toBe(12);
    expect(d2?.getUTCMonth()).toBe(10);

    const d3 = parseJobDate('12/11/2026');
    expect(d3?.getUTCDate()).toBe(12);

    const d4 = parseJobDate('2026-11-12T10:00:00Z');
    expect(d4?.getUTCDate()).toBe(12);

    expect(parseJobDate(null)).toBeNull();
    expect(parseJobDate('')).toBeNull();
  });

  it('accurately computes getJobAgeDays and evaluates isJobRecent (<=14d vs 15d+)', () => {
    const referenceNow = new Date(Date.UTC(2026, 10, 15, 12, 0, 0)); // Nov 15, 2026

    // Exactly 14 days ago: Nov 1, 2026
    const jobDay14 = { published_date: '2026-11-01' };
    expect(getJobAgeDays(jobDay14, referenceNow)).toBe(14);
    expect(isJobRecent(jobDay14, 14, referenceNow)).toBe(true);

    // 15 days ago: Oct 31, 2026
    const jobDay15 = { published_date: '2026-10-31' };
    expect(getJobAgeDays(jobDay15, referenceNow)).toBe(15);
    expect(isJobRecent(jobDay15, 14, referenceNow)).toBe(false);

    // Today: Nov 15, 2026
    const jobToday = { published_date: '2026-11-15' };
    expect(getJobAgeDays(jobToday, referenceNow)).toBe(0);
    expect(getJobAgeLabel(jobToday, referenceNow)).toBe('Hoy');

    // Yesterday: Nov 14, 2026
    const jobYesterday = { published_date: '2026-11-14' };
    expect(getJobAgeDays(jobYesterday, referenceNow)).toBe(1);
    expect(getJobAgeLabel(jobYesterday, referenceNow)).toBe('Ayer');

    // 4 days ago: Nov 11, 2026
    const job4d = { published_date: '2026-11-11' };
    expect(getJobAgeLabel(job4d, referenceNow)).toBe('Hace 4d');

    // Null date stays recent safely matching Python domain rule
    const jobNullDate = { published_date: null };
    expect(getJobAgeDays(jobNullDate, referenceNow)).toBeNull();
    expect(isJobRecent(jobNullDate, 14, referenceNow)).toBe(true);
    expect(getJobAgeLabel(jobNullDate, referenceNow)).toBe('');
  });

  it('sorts by Modality priority (Híbrido > Presencial > Remoto > No especificado) then score descending', () => {
    const jobs = [
      { id: 1, modality: 'Remoto', final_ranking_score: 95 },
      { id: 2, modality: 'Híbrido', final_ranking_score: 70 },
      { id: 3, modality: 'Híbrido', final_ranking_score: 90 },
      { id: 4, modality: 'Presencial', final_ranking_score: 85 },
      { id: 5, modality: 'No especificado', final_ranking_score: 99 },
    ];

    const sorted = sortByModalityThenScore(jobs);
    expect(sorted.map((j) => j.id)).toEqual([3, 2, 4, 1, 5]);
  });

  it('evaluates isRecommended correctly based on preprofessional and smoke checks', () => {
    expect(
      isRecommended({
        is_pre_professional: true,
        is_unrealistic_or_smoke: false,
        final_ranking_score: 65,
      })
    ).toBe(true);

    // Below minScore (default 50)
    expect(
      isRecommended({
        is_pre_professional: true,
        is_unrealistic_or_smoke: false,
        final_ranking_score: 40,
      })
    ).toBe(false);

    // Smoke offer
    expect(
      isRecommended({
        is_pre_professional: true,
        is_unrealistic_or_smoke: true,
        final_ranking_score: 80,
      })
    ).toBe(false);

    // Not pre-professional
    expect(
      isRecommended({
        is_pre_professional: false,
        is_unrealistic_or_smoke: false,
        final_ranking_score: 90,
      })
    ).toBe(false);
  });
});
