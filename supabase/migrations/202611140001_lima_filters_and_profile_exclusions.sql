-- Migration: 202611140001_lima_filters_and_profile_exclusions.sql
-- Description: Add normalized Lima filter columns, check constraints, and B-tree indexes to job_listings, and excluded_districts to profiles.

-- ============================================================================
-- 1. Agregar columnas de filtrado normalizado en public.job_listings
-- ============================================================================
ALTER TABLE public.job_listings
  ADD COLUMN IF NOT EXISTS district text,
  ADD COLUMN IF NOT EXISTS lima_zone text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS role_level text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS english_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS english_level text,
  ADD COLUMN IF NOT EXISTS salary_min integer,
  ADD COLUMN IF NOT EXISTS salary_max integer;

-- ============================================================================
-- 2. Restricciones CHECK idempotentes para job_listings
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_job_listings_role_level'
      AND conrelid = 'public.job_listings'::regclass
  ) THEN
    ALTER TABLE public.job_listings
      ADD CONSTRAINT chk_job_listings_role_level
      CHECK (role_level IN ('preprofesional', 'profesional', 'trainee_junior', 'unknown'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_job_listings_english_level'
      AND conrelid = 'public.job_listings'::regclass
  ) THEN
    ALTER TABLE public.job_listings
      ADD CONSTRAINT chk_job_listings_english_level
      CHECK (english_level IN ('basico', 'intermedio', 'avanzado') OR english_level IS NULL);
  END IF;
END $$;

-- ============================================================================
-- 3. Índices B-tree para acelerar filtros de búsqueda en job_listings
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_job_listings_district
  ON public.job_listings (district);

CREATE INDEX IF NOT EXISTS idx_job_listings_lima_zone
  ON public.job_listings (lima_zone);

CREATE INDEX IF NOT EXISTS idx_job_listings_category
  ON public.job_listings (category);

CREATE INDEX IF NOT EXISTS idx_job_listings_role_level
  ON public.job_listings (role_level);

CREATE INDEX IF NOT EXISTS idx_job_listings_english_required
  ON public.job_listings (english_required);

CREATE INDEX IF NOT EXISTS idx_job_listings_salary_min
  ON public.job_listings (salary_min);

-- ============================================================================
-- 4. Exclusiones de distritos en perfil de usuario (public.profiles)
-- ============================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS excluded_districts text[] NOT NULL DEFAULT ARRAY['Ate']::text[];
