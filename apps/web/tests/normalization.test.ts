import { describe, it, expect } from 'vitest';
import {
  LIMA_DISTRICTS,
  LIMA_ZONES_BY_DISTRICT,
  LIMA_CATEGORIES,
  RoleLevel,
  EnglishLevel,
  normalizeJobMetadata,
  extractLimaDistrictAndZone,
  isSystemsSoftwareRelevant,
  JobNormalizationInput,
} from '../src/lib/domain/jobNormalization';

describe('Lima Job Normalization Extractor', () => {
  describe('Constants and Zone Mapping', () => {
    it('defines canonical LIMA_DISTRICTS and categories', () => {
      expect(LIMA_DISTRICTS).toContain('San Isidro');
      expect(LIMA_DISTRICTS).toContain('Ate');
      expect(LIMA_DISTRICTS).toContain('Remoto');
      expect(LIMA_DISTRICTS).toContain('Lima Metropolitana');
      expect(LIMA_DISTRICTS).toContain('Santiago de Surco');

      expect(LIMA_CATEGORIES).toEqual([
        'Datos, BI & IA',
        'Desarrollo & Software',
        'Sistemas & TI',
        'Administración, Banca & Finanzas',
        'Ingeniería & Operaciones',
      ]);
    });

    it('maps every canonical district in LIMA_DISTRICTS to a valid zone in LIMA_ZONES_BY_DISTRICT', () => {
      for (const district of LIMA_DISTRICTS) {
        expect(LIMA_ZONES_BY_DISTRICT[district]).toBeDefined();
        expect(typeof LIMA_ZONES_BY_DISTRICT[district]).toBe('string');
      }
      expect(LIMA_ZONES_BY_DISTRICT['San Isidro']).toBe('Lima Moderna');
      expect(LIMA_ZONES_BY_DISTRICT['Ate']).toBe('Lima Este');
      expect(LIMA_ZONES_BY_DISTRICT['Lima Centro']).toBe('Lima Centro');
      expect(LIMA_ZONES_BY_DISTRICT['Los Olivos']).toBe('Lima Norte');
      expect(LIMA_ZONES_BY_DISTRICT['Chorrillos']).toBe('Lima Sur');
      expect(LIMA_ZONES_BY_DISTRICT['Callao']).toBe('Callao');
      expect(LIMA_ZONES_BY_DISTRICT['Remoto']).toBe('Remoto');
      expect(LIMA_ZONES_BY_DISTRICT['Lima Metropolitana']).toBe('Lima Metropolitana');
    });
  });

  describe('District & Zone Extraction (Review Focus #1)', () => {
    it('ignores Computrabajo rating noise like "4,3" and falls back cleanly', () => {
      const noisyListing: JobNormalizationInput = {
        title: 'Practicante de Sistemas',
        location: '4,3',
        modality: 'Presencial',
        raw_description: 'Empresa líder busca practicante para trabajo presencial.',
      };

      const result = normalizeJobMetadata(noisyListing);
      expect(result.district).toBe('Lima Metropolitana');
      expect(result.lima_zone).toBe('Lima Metropolitana');
      expect(result.district).not.toBe('4,3');

      // Other rating variants: 4.1, 4,6
      expect(
        extractLimaDistrictAndZone({ location: '4,6', modality: 'Presencial' })
      ).toEqual({
        district: 'Lima Metropolitana',
        lima_zone: 'Lima Metropolitana',
      });
      expect(
        extractLimaDistrictAndZone({ location: '4.1', modality: 'Presencial' })
      ).toEqual({
        district: 'Lima Metropolitana',
        lima_zone: 'Lima Metropolitana',
      });
    });

    it('detects Ate and Ate Vitarte from location or description -> Lima Este', () => {
      // Direct location
      const res1 = normalizeJobMetadata({
        title: 'Practicante de Operaciones',
        location: 'Ate, Lima',
      });
      expect(res1.district).toBe('Ate');
      expect(res1.lima_zone).toBe('Lima Este');

      // Location variant: Ate Vitarte
      const res2 = normalizeJobMetadata({
        title: 'Practicante de Calidad',
        location: 'Ate Vitarte',
      });
      expect(res2.district).toBe('Ate');
      expect(res2.lima_zone).toBe('Lima Este');

      // Mentioned in description when location is generic Lima or rating noise
      const res3 = normalizeJobMetadata({
        title: 'Practicante de Mantenimiento',
        location: '4,4',
        raw_description: 'Planta industrial ubicada en Carretera Central km 4.5, Ate.',
      });
      expect(res3.district).toBe('Ate');
      expect(res3.lima_zone).toBe('Lima Este');

      // Mentioned in title
      const res4 = normalizeJobMetadata({
        title: 'Practicante de Almacén - Sede Ate',
        location: 'Lima, Perú',
      });
      expect(res4.district).toBe('Ate');
      expect(res4.lima_zone).toBe('Lima Este');
    });

    it('maps Surco / Cercado / Jesús María / Magdalena variants to canonical district and zone', () => {
      // Surco -> Santiago de Surco
      const surco = extractLimaDistrictAndZone({ location: 'Surco, Lima' });
      expect(surco).toEqual({
        district: 'Santiago de Surco',
        lima_zone: 'Lima Moderna',
      });

      const santiago = extractLimaDistrictAndZone({ location: 'Santiago de Surco, Perú' });
      expect(santiago).toEqual({
        district: 'Santiago de Surco',
        lima_zone: 'Lima Moderna',
      });

      // Cercado / Cercado de Lima -> Lima Centro
      const cercado = extractLimaDistrictAndZone({ location: 'Lima, Cercado De Lima' });
      expect(cercado).toEqual({
        district: 'Lima Centro',
        lima_zone: 'Lima Centro',
      });

      const cercadoDirect = extractLimaDistrictAndZone({ location: 'Cercado de Lima' });
      expect(cercadoDirect).toEqual({
        district: 'Lima Centro',
        lima_zone: 'Lima Centro',
      });

      // Jesús María
      const jm = extractLimaDistrictAndZone({ location: 'Jesus Maria, Lima' });
      expect(jm).toEqual({
        district: 'Jesús María',
        lima_zone: 'Lima Moderna',
      });

      // Magdalena / Magdalena del Mar
      const magdalena = extractLimaDistrictAndZone({ location: 'Magdalena Del Mar, Lima' });
      expect(magdalena).toEqual({
        district: 'Magdalena del Mar',
        lima_zone: 'Lima Moderna',
      });

      // Lurín & Punta Negra -> Lurín / Balnearios
      const lurin = extractLimaDistrictAndZone({ location: 'Lurin, Lima' });
      expect(lurin).toEqual({
        district: 'Lurín / Balnearios',
        lima_zone: 'Lima Sur',
      });
      const puntaNegra = extractLimaDistrictAndZone({ location: 'Punta Negra, Lima' });
      expect(puntaNegra).toEqual({
        district: 'Lurín / Balnearios',
        lima_zone: 'Lima Sur',
      });
    });

    it('classifies Remoto when modality is Remoto or location indicates teletrabajo without Lima office', () => {
      // Explicit modality Remoto with generic Lima location
      const res1 = normalizeJobMetadata({
        title: 'Junior Frontend Developer',
        location: 'Lima, Perú',
        modality: 'Remoto',
      });
      expect(res1.district).toBe('Remoto');
      expect(res1.lima_zone).toBe('Remoto');

      // Location says Remoto / Teletrabajo
      const res2 = normalizeJobMetadata({
        title: 'Data Analyst Trainee',
        location: 'Remoto - Perú',
      });
      expect(res2.district).toBe('Remoto');
      expect(res2.lima_zone).toBe('Remoto');

      // But if there is an explicit physical district, retain the physical district
      const resWithOffice = normalizeJobMetadata({
        title: 'Practicante de BI',
        location: 'San Isidro, Lima',
        modality: 'Remoto',
      });
      expect(resWithOffice.district).toBe('San Isidro');
      expect(resWithOffice.lima_zone).toBe('Lima Moderna');
    });
  });

  describe('Salary Extraction', () => {
    it('extracts monthly PEN salary ranges (S/ 1,200 - 1,500) and rejects bogus hourly/year numbers', () => {
      // Explicit range with S/
      const res1 = normalizeJobMetadata({
        title: 'Practicante',
        salary: 'S/ 1,200 - S/ 1,500',
      });
      expect(res1.salary_min).toBe(1200);
      expect(res1.salary_max).toBe(1500);

      // Single salary value with decimal format
      const res2 = normalizeJobMetadata({
        title: 'Practicante',
        salary: 'S/ 1,230.00',
      });
      expect(res2.salary_min).toBe(1230);
      expect(res2.salary_max).toBe(1230);

      // Dot thousand separator format common in Latin America
      const res3 = normalizeJobMetadata({
        title: 'Practicante',
        salary: 'S/. 1.300,00',
      });
      expect(res3.salary_min).toBe(1300);
      expect(res3.salary_max).toBe(1300);

      // From raw_description when salary field is empty
      const resDesc = normalizeJobMetadata({
        title: 'Practicante Profesional de Sistemas',
        salary: null,
        raw_description: 'Subvención económica S/.1200 mensuales acorde a ley.',
      });
      expect(resDesc.salary_min).toBe(1200);
      expect(resDesc.salary_max).toBe(1200);

      // Reject hourly rate
      const resHourly = normalizeJobMetadata({
        title: 'Tutor de Programación',
        salary: 'S/ 25 por hora',
      });
      expect(resHourly.salary_min).toBeNull();
      expect(resHourly.salary_max).toBeNull();

      // Reject annual salary
      const resAnnual = normalizeJobMetadata({
        title: 'Lead Architect',
        salary: 'S/ 90,000 al año',
      });
      expect(resAnnual.salary_min).toBeNull();
      expect(resAnnual.salary_max).toBeNull();

      // Reject out-of-range bogus values (< 800 or > 12000)
      const resBogusLow = normalizeJobMetadata({
        title: 'Voluntario',
        salary: 'S/ 4',
      });
      expect(resBogusLow.salary_min).toBeNull();
      expect(resBogusLow.salary_max).toBeNull();

      const resBogusLow2 = normalizeJobMetadata({
        title: 'Practicante',
        salary: 'S/. 500,00',
      });
      expect(resBogusLow2.salary_min).toBeNull();
      expect(resBogusLow2.salary_max).toBeNull();

      const resLawNumber = normalizeJobMetadata({
        title: 'Practicante',
        salary: null,
        raw_description: 'Convenio de prácticas según Ley 28518 y código 2026.',
      });
      expect(resLawNumber.salary_min).toBeNull();
      expect(resLawNumber.salary_max).toBeNull();
    });
  });

  describe('English Level & Requirement Detection', () => {
    it('detects english_required and highest accurate english_level (basico/intermedio/avanzado)', () => {
      // Intermediate in description
      const resIntermedio = normalizeJobMetadata({
        title: 'Practicante de BI',
        raw_description: 'Requisitos: Inglés a nivel intermedio (deseable o indispensable). Manejo de Power BI.',
      });
      expect(resIntermedio.english_required).toBe(true);
      expect(resIntermedio.english_level).toBe('intermedio');

      // Advanced in description
      const resAvanzado = normalizeJobMetadata({
        title: 'Software Engineer Intern',
        raw_description: 'Dominio de inglés avanzado o fluido (comunicación con equipo global).',
      });
      expect(resAvanzado.english_required).toBe(true);
      expect(resAvanzado.english_level).toBe('avanzado');

      // Basic
      const resBasico = normalizeJobMetadata({
        title: 'Practicante de TI',
        raw_description: 'Inglés técnico a nivel básico (lectura de manuales).',
      });
      expect(resBasico.english_required).toBe(true);
      expect(resBasico.english_level).toBe('basico');

      // Range: intermedio a avanzado -> picks highest 'avanzado'
      const resRange = normalizeJobMetadata({
        title: 'Practicante Cloud',
        raw_description: 'Requisito: inglés intermedio/avanzado indispensable.',
      });
      expect(resRange.english_required).toBe(true);
      expect(resRange.english_level).toBe('avanzado');

      // English mentioned without explicit level
      const resGeneric = normalizeJobMetadata({
        title: 'Practicante de Finanzas',
        raw_description: 'Requisitos: Excel avanzado, inglés, proactividad.',
      });
      expect(resGeneric.english_required).toBe(true);
      expect(resGeneric.english_level).toBeNull();

      // No english mentioned
      const resNone = normalizeJobMetadata({
        title: 'Practicante de Archivo',
        raw_description: 'Organización de expedientes físicos y digitales en oficina.',
      });
      expect(resNone.english_required).toBe(false);
      expect(resNone.english_level).toBeNull();
    });
  });

  describe('Role Level Classification', () => {
    it('classifies role_level purely from text without depending on job_evaluations', () => {
      // Preprofesional
      const resPre = normalizeJobMetadata({
        title: 'Practicante Pre Profesional de Sistemas',
        raw_description: 'Buscamos estudiante de 8vo o 9no ciclo de Ingeniería.',
      });
      expect(resPre.role_level).toBe('preprofesional');

      const resIntern = normalizeJobMetadata({
        title: 'Data Science Intern',
        raw_description: 'University student internship program.',
      });
      expect(resIntern.role_level).toBe('preprofesional');

      // Profesional
      const resPro = normalizeJobMetadata({
        title: 'Practicante Profesional de Sistemas',
        raw_description: 'Egresado o bachiller universitario de la carrera de Sistemas.',
      });
      expect(resPro.role_level).toBe('profesional');

      const resAnalyst = normalizeJobMetadata({
        title: 'Analista de Business Intelligence',
        raw_description: 'Experiencia previa como analista junior.',
      });
      expect(resAnalyst.role_level).toBe('profesional');

      // Trainee / Junior
      const resJr = normalizeJobMetadata({
        title: 'Junior Python Developer',
        raw_description: 'Posición entry level para jóvenes talentos.',
      });
      expect(resJr.role_level).toBe('trainee_junior');

      const resTrainee = normalizeJobMetadata({
        title: 'Trainee de Operaciones',
        raw_description: 'Programa Trainee 2026.',
      });
      expect(resTrainee.role_level).toBe('trainee_junior');

      // Unknown (generic practicante without pre or egresado markers)
      const resUnknown = normalizeJobMetadata({
        title: 'Practicante de Sistemas',
        raw_description: 'Apoyo en el área técnica y documentación.',
      });
      expect(resUnknown.role_level).toBe('unknown');

      // Discrepancy regression cases (FINANTY PRO, Software Developer Intern Profesional, Egresados + Convenio)
      const resProParen = normalizeJobMetadata({
        title: 'Practicante PRO (profesional) de Inteligencia y Automatización',
        raw_description:
          'Egresado(a) universitario(a) en Ingeniería de Sistemas. Ofrecemos Convenio de Prácticas Profesionales según ley.',
      });
      expect(resProParen.role_level).toBe('profesional');

      const resInternPro = normalizeJobMetadata({
        title: 'Software Developer - Intern - (Practicas Profesionales - 40 horas semanales)',
        raw_description: 'Egresado de Ingeniería de Software o Sistemas. Prácticas profesionales.',
      });
      expect(resInternPro.role_level).toBe('profesional');

      const resEgresadoConvenio = normalizeJobMetadata({
        title: 'Practicante de Procesamiento de Datos',
        raw_description:
          'REQUISITOS: Egresado(a) o Bachiller de Ingeniería de Software o Sistemas. BENEFICIOS: Convenio de prácticas.',
      });
      expect(resEgresadoConvenio.role_level).toBe('profesional');

      // Past preprofesional experience + practicas.pe WhatsApp footer must NOT override Profesional role level
      const resProWithFooter = normalizeJobMetadata({
        title: 'Practicante de Gestión de Proyectos',
        raw_description:
          'Modalidad de prácticas: Profesional\nFormación: Egresado de Ingeniería de Sistemas. Deseable experiencia previa como practicante preprofesional.\nTe sugerimos:\n¿Eres estudiante? Únete a nuestro canal de WhatsApp sobre prácticas PRE-PROFESIONALES',
      });
      expect(resProWithFooter.role_level).toBe('profesional');

      // Ley 29733 Datos Personales boilerplate must NOT skew category to Datos, BI & IA
      const resLeyDatos = normalizeJobMetadata({
        title: 'Practicante Pre Profesional de Sistemas',
        raw_description:
          'Estudiante de 8vo ciclo de Ingeniería de Sistemas. Soporte técnico, redes y servidores TI.\nAl postular autorizas el tratamiento de datos personales conforme a la Ley N° 29733 de Protección de Datos Personales.',
      });
      expect(resLeyDatos.role_level).toBe('preprofesional');
      expect(resLeyDatos.category).toBe('Sistemas & TI');
    });
  });

  describe('Systems & Software Career Relevance Filter', () => {
    it('keeps Sistemas/Software/Data/TI roles and rejects Marketing/GenAI media, Contabilidad, and Senior/Management roles', () => {
      expect(
        isSystemsSoftwareRelevant(
          'Practicante Pre Profesional de Desarrollo Backend',
          'Estudiante de 8vo ciclo de Ingeniería de Sistemas o Software. Python, SQL, APIs REST.',
          'computrabajo'
        )
      ).toBe(true);

      expect(
        isSystemsSoftwareRelevant(
          'PRACTICANTE DE RESILIENCIA OPERACIONAL Y RIESGO TECNOLÓGICO',
          'Estudiante de los últimos ciclos de Ingeniería de Sistemas, Informática o afines. Gestión de riesgos TI y agentes de IA.',
          'linkedin'
        )
      ).toBe(true);

      // Biznes Sac marketing digital content with GenAI tools (must reject!)
      expect(
        isSystemsSoftwareRelevant(
          'Practicante de Creación de contenidos digitales con Inteligencia Artificial',
          'Estudiante de últimos ciclos o egresado(a) de Marketing, Comunicaciones, Publicidad, Diseño, Audiovisual. ChatGPT, Claude, Canva, CapCut, Midjourney, TikTok, Reels.',
          'computrabajo'
        )
      ).toBe(false);

      // Accounting, Electrician, and Senior roles (must reject!)
      expect(
        isSystemsSoftwareRelevant(
          'Practicante de Contabilidad Tributaria',
          'Estudiante de Contabilidad. Concar, PDT y declaraciones SUNAT.',
          'bumeran'
        )
      ).toBe(false);

      expect(
        isSystemsSoftwareRelevant(
          'SUB GTE AUDITORIA DE TI Y CIBERSEGURIDAD',
          'Auditar procesos relacionados con TI y Ciberseguridad. Pentesting.',
          'linkedin'
        )
      ).toBe(false);
    });
  });

  describe('Category Classification', () => {
    it('categorizes Datos/BI/IA, Desarrollo/Software, Sistemas/TI, Admin/Banca and Ing/Operaciones', () => {
      // Datos, BI & IA
      const resData = normalizeJobMetadata({
        title: 'Practicante de Gestión e Ingeniería de Datos',
        raw_description: 'Manejo de SQL, Python, Power BI y pipelines ETL.',
      });
      expect(resData.category).toBe('Datos, BI & IA');

      // Desarrollo & Software
      const resDev = normalizeJobMetadata({
        title: 'Practicante Profesional Desarrollo de SW',
        raw_description: 'Desarrollo web en React, TypeScript y Node.js.',
      });
      expect(resDev.category).toBe('Desarrollo & Software');

      // Sistemas & TI
      const resSys = normalizeJobMetadata({
        title: 'Practicante de Soporte y Tecnologías de la Información',
        raw_description: 'Mantenimiento de infraestructura TI, redes y servidores.',
      });
      expect(resSys.category).toBe('Sistemas & TI');

      // Administración, Banca & Finanzas
      const resFinance = normalizeJobMetadata({
        title: 'Practicante de Créditos y Finanzas',
        raw_description: 'Evaluación crediticia y análisis contable de cartera bancaria.',
      });
      expect(resFinance.category).toBe('Administración, Banca & Finanzas');

      // Ingeniería & Operaciones
      const resOps = normalizeJobMetadata({
        title: 'Practicante de Operaciones y Procesos Industriales',
        raw_description: 'Control de calidad, mejora continua y logística en planta.',
      });
      expect(resOps.category).toBe('Ingeniería & Operaciones');
    });
  });
});
