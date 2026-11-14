'use client';

import React from 'react';
import {
  User,
  Sparkles,
  MapPin,
  GraduationCap,
  CheckCircle2,
  AlertCircle,
  Save,
  Code2,
} from 'lucide-react';
import { UserProfile } from '@/lib/domain/types';
import {
  ProfileFormState,
  AVAILABLE_DISTRICTS,
  COMMON_EXCLUDED_DISTRICTS,
  COMMON_TARGET_AREAS,
  toProfileFormState,
  toProfileUpdateInput,
} from '@/lib/profile/profileFormHelpers';
import { updateProfile } from '@/actions/profile';

interface ProfileFormProps {
  initialProfile: UserProfile | null;
  userEmail?: string | null;
}

export function ProfileForm({ initialProfile, userEmail }: ProfileFormProps) {
  const [formState, setFormState] = React.useState<ProfileFormState>(() =>
    toProfileFormState(initialProfile)
  );

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const toggleDistrict = (district: string) => {
    setFormState((prev) => {
      const exists = prev.preferred_districts.includes(district);
      const nextDistricts = exists
        ? prev.preferred_districts.filter((d) => d !== district)
        : [...prev.preferred_districts, district];
      return { ...prev, preferred_districts: nextDistricts };
    });
  };

  const toggleExcludedDistrict = (district: string) => {
    setFormState((prev) => {
      const exists = prev.excluded_districts.includes(district);
      const nextExcluded = exists
        ? prev.excluded_districts.filter((d) => d !== district)
        : [...prev.excluded_districts, district];
      return { ...prev, excluded_districts: nextExcluded };
    });
  };

  const moveModality = (index: number, direction: 'up' | 'down') => {
    setFormState((prev) => {
      const list = [...prev.modality_priority];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= list.length) return prev;

      const temp = list[index];
      list[index] = list[targetIndex];
      list[targetIndex] = temp;
      return { ...prev, modality_priority: list };
    });
  };

  const toggleTargetArea = (area: string) => {
    setFormState((prev) => {
      const exists = prev.target_areas.includes(area);
      const nextAreas = exists
        ? prev.target_areas.filter((a) => a !== area)
        : [...prev.target_areas, area];
      return { ...prev, target_areas: nextAreas };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!formState.full_name.trim()) {
      setErrorMessage('Por favor ingresa tu nombre completo.');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = toProfileUpdateInput(formState);
      const res = await updateProfile(payload);

      if (!res.ok) {
        throw new Error(res.error || 'ERROR_SAVING_PROFILE');
      }

      setSuccessMessage('¡Perfil y preferencias actualizados correctamente!');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: unknown) {
      console.error('Error submitting profile:', err);
      const msg = err instanceof Error ? err.message : 'Error desconocido al guardar';
      setErrorMessage(`No se pudo actualizar el perfil: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Header */}
      <div className="border-b border-slate-200 pb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-900 text-white shadow-xs">
            <User className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Mi Perfil y Preferencias
            </h1>
            <p className="text-sm text-slate-600">
              Personaliza tus datos académicos, distritos de interés y habilidades técnicas.
            </p>
          </div>
        </div>
      </div>

      {/* Transparent Editorial Callout (Phase 2 Note) */}
      <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-sm text-blue-950 shadow-2xs">
        <Sparkles className="h-5 w-5 shrink-0 text-blue-800 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-blue-900">
            Evaluación personalizada en camino (Fase 2)
          </p>
          <p className="text-xs text-blue-900/80 leading-relaxed">
            Tus preferencias de distrito, modalidad y tecnologías se guardan de forma permanente en tu cuenta. En la próxima fase, el motor de IA re-evaluará automáticamente todas las vacantes del radar ponderando específicamente tu perfil y ciclo académico. Por ahora, se aplica la evaluación base global compartida.
          </p>
        </div>
      </div>

      {/* Accessible Notifications */}
      {errorMessage && (
        <div
          role="alert"
          aria-live="assertive"
          className="auth-feedback-enter flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
        >
          <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          aria-live="polite"
          className="auth-feedback-enter flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-8" noValidate>
        {/* Section 1: Personal & Academic Info */}
        <div className="section-enter rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-2xs space-y-6">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <GraduationCap className="h-5 w-5 text-blue-900" />
            <h2 className="text-base font-bold text-slate-900">
              Información Personal y Académica
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Full Name */}
            <div>
              <label
                htmlFor="full_name"
                className="block text-xs font-semibold text-slate-800 mb-1"
              >
                Nombre completo <span className="text-rose-600">*</span>
              </label>
              <input
                id="full_name"
                type="text"
                required
                autoComplete="name"
                value={formState.full_name}
                onChange={(e) =>
                  setFormState((prev) => ({ ...prev, full_name: e.target.value }))
                }
                placeholder="Ej: Joseph Thorne"
                className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-2xs focus:border-blue-900 focus:outline-hidden focus:ring-1 focus:ring-blue-900"
              />
            </div>

            {/* Email (read-only indicator) */}
            <div>
              <label
                htmlFor="profile_email"
                className="block text-xs font-semibold text-slate-800 mb-1"
              >
                Correo electrónico
              </label>
              <input
                id="profile_email"
                type="email"
                disabled
                value={userEmail || 'Conectado'}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-500 shadow-2xs cursor-not-allowed"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Vinculado a tu cuenta de autenticación
              </p>
            </div>

            {/* Headline */}
            <div className="sm:col-span-2">
              <label
                htmlFor="headline"
                className="block text-xs font-semibold text-slate-800 mb-1"
              >
                Titular profesional / Headline
              </label>
              <input
                id="headline"
                type="text"
                value={formState.headline}
                onChange={(e) =>
                  setFormState((prev) => ({ ...prev, headline: e.target.value }))
                }
                placeholder="Ej: Estudiante de Ingeniería de Sistemas | Backend Developer & Data"
                className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-2xs focus:border-blue-900 focus:outline-hidden focus:ring-1 focus:ring-blue-900"
              />
            </div>

            {/* University */}
            <div>
              <label
                htmlFor="university"
                className="block text-xs font-semibold text-slate-800 mb-1"
              >
                Universidad o Instituto
              </label>
              <input
                id="university"
                type="text"
                value={formState.university}
                onChange={(e) =>
                  setFormState((prev) => ({ ...prev, university: e.target.value }))
                }
                placeholder="Ej: Universidad Nacional de Ingeniería"
                className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-2xs focus:border-blue-900 focus:outline-hidden focus:ring-1 focus:ring-blue-900"
              />
            </div>

            {/* Academic Cycle */}
            <div>
              <label
                htmlFor="current_cycle"
                className="block text-xs font-semibold text-slate-800 mb-1"
              >
                Ciclo académico actual
              </label>
              <input
                id="current_cycle"
                type="text"
                value={formState.current_cycle}
                onChange={(e) =>
                  setFormState((prev) => ({ ...prev, current_cycle: e.target.value }))
                }
                placeholder="Ej: 8vo ciclo, 9no ciclo, Egresado"
                className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-2xs focus:border-blue-900 focus:outline-hidden focus:ring-1 focus:ring-blue-900"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Preferences (Districts & Modality) */}
        <div className="section-enter rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-2xs space-y-6">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <MapPin className="h-5 w-5 text-blue-900" />
            <h2 className="text-base font-bold text-slate-900">
              Distritos y Prioridad de Modalidad
            </h2>
          </div>

          {/* Preferred Districts */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">
                Distritos preferidos en Lima
              </label>
              <p className="text-xs text-slate-500">
                Selecciona los distritos donde te gustaría realizar tus prácticas:
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {AVAILABLE_DISTRICTS.map((district) => {
                const isSelected = formState.preferred_districts.includes(district);
                return (
                  <button
                    key={district}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => toggleDistrict(district)}
                    className={`interactive-pill inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      isSelected
                        ? 'bg-blue-900 text-white font-semibold shadow-2xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
                    }`}
                  >
                    <span>{district}</span>
                    {isSelected && <span className="ml-1.5 text-blue-200">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Excluded Districts (Radar Exclusions) */}
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <label className="block text-xs font-semibold text-slate-800">
                  Distritos a ocultar por defecto (Exclusiones del Radar)
                </label>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  Opcional
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Las ofertas de los distritos que elijas aquí se ocultarán de tu radar personal (ninguno bloqueado por defecto):
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {COMMON_EXCLUDED_DISTRICTS.map((district) => {
                const isExcluded = formState.excluded_districts.includes(district);
                return (
                  <button
                    key={district}
                    type="button"
                    aria-pressed={isExcluded}
                    onClick={() => toggleExcludedDistrict(district)}
                    className={`interactive-pill inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      isExcluded
                        ? 'bg-rose-900 text-white font-semibold shadow-2xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
                    }`}
                  >
                    <span>{district}</span>
                    {isExcluded && <span className="ml-1.5 text-rose-200">✕</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Modality Priority */}
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">
                Prioridad de modalidad de trabajo
              </label>
              <p className="text-xs text-slate-500">
                Ordena las modalidades según tu preferencia (de mayor a menor prioridad):
              </p>
            </div>

            <div className="space-y-2 max-w-md">
              {formState.modality_priority.map((modality, idx) => (
                <div
                  key={modality}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-2.5 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-900 text-white text-xs font-bold">
                      {idx + 1}
                    </span>
                    <span className="font-semibold text-slate-800">{modality}</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveModality(idx, 'up')}
                      aria-label={`Subir prioridad de ${modality}`}
                      className="rounded p-1 text-slate-500 hover:bg-slate-200 disabled:opacity-30"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      disabled={idx === formState.modality_priority.length - 1}
                      onClick={() => moveModality(idx, 'down')}
                      aria-label={`Bajar prioridad de ${modality}`}
                      className="rounded p-1 text-slate-500 hover:bg-slate-200 disabled:opacity-30"
                    >
                      ▼
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Target Areas */}
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">
                Áreas de especialidad objetivo
              </label>
              <p className="text-xs text-slate-500">
                Áreas de la industria o ingeniería que buscas priorizar:
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {COMMON_TARGET_AREAS.map((area) => {
                const isSelected = formState.target_areas.includes(area);
                return (
                  <button
                    key={area}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => toggleTargetArea(area)}
                    className={`interactive-pill inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      isSelected
                        ? 'bg-blue-900 text-white font-semibold shadow-2xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
                    }`}
                  >
                    <span>{area}</span>
                    {isSelected && <span className="ml-1.5 text-blue-200">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Section 3: Technical Skills */}
        <div className="section-enter rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-2xs space-y-6">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Code2 className="h-5 w-5 text-blue-900" />
            <h2 className="text-base font-bold text-slate-900">
              Habilidades Técnicas y Herramientas
            </h2>
          </div>

          <div className="space-y-5">
            {/* Core Skills */}
            <div>
              <label
                htmlFor="core_skills"
                className="block text-xs font-semibold text-slate-800 mb-1"
              >
                Lenguajes y Tecnologías Principales (separados por coma)
              </label>
              <input
                id="core_skills"
                type="text"
                value={formState.core_skills}
                onChange={(e) =>
                  setFormState((prev) => ({ ...prev, core_skills: e.target.value }))
                }
                placeholder="Ej: Python, SQL, TypeScript, Java, C++"
                className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-2xs focus:border-blue-900 focus:outline-hidden focus:ring-1 focus:ring-blue-900"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Se contrastarán directamente con los requisitos de las vacantes en el radar.
              </p>
            </div>

            {/* Frameworks */}
            <div>
              <label
                htmlFor="frameworks"
                className="block text-xs font-semibold text-slate-800 mb-1"
              >
                Frameworks y Librerías (separados por coma)
              </label>
              <input
                id="frameworks"
                type="text"
                value={formState.frameworks}
                onChange={(e) =>
                  setFormState((prev) => ({ ...prev, frameworks: e.target.value }))
                }
                placeholder="Ej: FastAPI, React, Next.js, Django, Pandas, Express"
                className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-2xs focus:border-blue-900 focus:outline-hidden focus:ring-1 focus:ring-blue-900"
              />
            </div>

            {/* Tools & DevOps */}
            <div>
              <label
                htmlFor="tools"
                className="block text-xs font-semibold text-slate-800 mb-1"
              >
                Herramientas, Cloud & Bases de Datos (separados por coma)
              </label>
              <input
                id="tools"
                type="text"
                value={formState.tools}
                onChange={(e) =>
                  setFormState((prev) => ({ ...prev, tools: e.target.value }))
                }
                placeholder="Ej: Git, Docker, PostgreSQL, AWS, Linux, Power BI"
                className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-2xs focus:border-blue-900 focus:outline-hidden focus:ring-1 focus:ring-blue-900"
              />
            </div>
          </div>
        </div>

        {/* Submit Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="interactive-pill inline-flex items-center gap-2 rounded-xl bg-blue-900 px-6 py-3 text-sm font-semibold text-white shadow-xs hover:bg-blue-800 focus:outline-hidden focus:ring-2 focus:ring-blue-900 focus:ring-offset-2 disabled:opacity-50 transition-colors"
          >
            <Save className="h-4 w-4" />
            <span>{isSubmitting ? 'Guardando cambios...' : 'Guardar preferencias de perfil'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
