-- Migration: 202611130001_initial_schema.sql
-- Description: Initial schema for web platform migration (profiles, job_listings, job_evaluations, user_job_states) with RLS and FTS

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. Perfiles de usuario (1:1 con auth.users)
-- ============================================================================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  headline text NOT NULL DEFAULT '',
  university text NOT NULL DEFAULT '',
  current_cycle text NOT NULL DEFAULT '',
  preferred_districts text[] NOT NULL DEFAULT '{}',
  modality_priority text[] NOT NULL DEFAULT ARRAY['Híbrido', 'Presencial', 'Remoto'],
  target_areas text[] NOT NULL DEFAULT '{}',
  technical_skills jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger de creación automática de perfil al registrarse
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Evita auto-promoción a is_admin desde clientes autenticados (solo service_role puede cambiarlo)
CREATE OR REPLACE FUNCTION public.prevent_is_admin_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin AND coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') IS DISTINCT FROM 'service_role' THEN
    NEW.is_admin := OLD.is_admin;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_profile_is_admin
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.prevent_is_admin_self_escalation();

-- ============================================================================
-- 2. Catálogo compartido de vacantes (escrito solo por el pipeline vía service_role)
-- ============================================================================
CREATE TABLE public.job_listings (
  id bigserial PRIMARY KEY,
  deduplication_hash text UNIQUE NOT NULL,
  source text NOT NULL,
  title text NOT NULL,
  company text NOT NULL,
  location text NOT NULL DEFAULT 'Lima, Perú',
  modality text NOT NULL DEFAULT 'No especificado',
  url text NOT NULL,
  salary text,
  raw_description text NOT NULL,
  published_at text,
  published_date date,
  -- Metadatos de empleador precomputados en ingesta para filtrar/buscar en escala sin descargar raw_description
  resolved_brand_key text,
  resolved_via_agency boolean NOT NULL DEFAULT false,
  agency_clue text NOT NULL DEFAULT '',
  sector_hint text,
  search_tsv tsvector GENERATED ALWAYS AS (
    to_tsvector(
      'spanish',
      coalesce(title, '') || ' ' ||
      coalesce(company, '') || ' ' ||
      coalesce(location, '') || ' ' ||
      coalesce(modality, '') || ' ' ||
      coalesce(resolved_brand_key, '') || ' ' ||
      coalesce(agency_clue, '') || ' ' ||
      coalesce(sector_hint, '') || ' ' ||
      coalesce(raw_description, '')
    )
  ) STORED,
  status text NOT NULL DEFAULT 'PENDING_EVALUATION'
    CHECK (status IN ('PENDING_EVALUATION', 'EVALUATED')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_job_listings_status ON public.job_listings (status);
CREATE INDEX idx_job_listings_url ON public.job_listings (url);
CREATE INDEX idx_job_listings_created_at ON public.job_listings (created_at DESC);
CREATE INDEX idx_job_listings_published_date ON public.job_listings (published_date DESC NULLS LAST, created_at DESC);
CREATE INDEX idx_job_listings_brand_sector ON public.job_listings (resolved_brand_key, sector_hint);
CREATE INDEX idx_job_listings_search_tsv ON public.job_listings USING GIN (search_tsv);

-- ============================================================================
-- 3. Evaluaciones de IA/Heurística (profile_id NULL = evaluación base compartida)
-- ============================================================================
CREATE TABLE public.job_evaluations (
  id bigserial PRIMARY KEY,
  listing_id bigint NOT NULL REFERENCES public.job_listings(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_pre_professional boolean NOT NULL,
  is_unrealistic_or_smoke boolean NOT NULL,
  technical_match_score numeric(4,3) NOT NULL CHECK (technical_match_score >= 0 AND technical_match_score <= 1),
  modality_score numeric(4,3) NOT NULL DEFAULT 0,
  location_score numeric(4,3) NOT NULL DEFAULT 0,
  final_ranking_score numeric(5,2) NOT NULL CHECK (final_ranking_score >= 0 AND final_ranking_score <= 100),
  matching_skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  verdict_summary text NOT NULL,
  reasoning_chain jsonb,
  engine text NOT NULL DEFAULT 'heuristic',
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_job_eval_listing_profile UNIQUE NULLS NOT DISTINCT (listing_id, profile_id)
);

CREATE INDEX idx_job_evaluations_ranking ON public.job_evaluations (final_ranking_score DESC);
CREATE INDEX idx_job_evaluations_profile ON public.job_evaluations (profile_id);

-- ============================================================================
-- 4. Estado CRM privado por usuario (NUNCA sobreescrito por el scraper)
-- ============================================================================
CREATE TABLE public.user_job_states (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id bigint NOT NULL REFERENCES public.job_listings(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'to_apply'
    CHECK (status IN ('to_apply', 'favorite', 'applied', 'interview', 'discarded')),
  applied_at timestamptz,
  notes text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_job_state UNIQUE (user_id, listing_id)
);

CREATE INDEX idx_user_job_states_user ON public.user_job_states (user_id, status);

-- ============================================================================
-- 5. Row Level Security (RLS)
-- ============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_job_states ENABLE ROW LEVEL SECURITY;

-- 5.1 Políticas para public.job_listings
-- Acceso público de lectura (visitantes anónimos y autenticados para SSR y exploración)
CREATE POLICY "Public read access for job listings"
  ON public.job_listings
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- 5.2 Políticas para public.job_evaluations
-- Lectura anónima del catálogo compartido (profile_id IS NULL)
CREATE POLICY "Anon read access for shared job evaluations"
  ON public.job_evaluations
  FOR SELECT
  TO anon
  USING (profile_id IS NULL);

-- Lectura autenticada: catálogo compartido + evaluaciones privadas del usuario
CREATE POLICY "Authenticated read access for job evaluations"
  ON public.job_evaluations
  FOR SELECT
  TO authenticated
  USING (profile_id IS NULL OR profile_id = (select auth.uid()));

-- Inserción de evaluaciones por el propio usuario autenticado
CREATE POLICY "Authenticated insert user evaluations"
  ON public.job_evaluations
  FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = (select auth.uid()));

-- Actualización de evaluaciones por el propio usuario autenticado
CREATE POLICY "Authenticated update user evaluations"
  ON public.job_evaluations
  FOR UPDATE
  TO authenticated
  USING (profile_id = (select auth.uid()))
  WITH CHECK (profile_id = (select auth.uid()));

-- 5.3 Políticas para public.profiles
-- Lectura exclusiva del propio perfil
CREATE POLICY "Users can read own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = (select auth.uid()));

-- Inserción exclusiva del propio perfil
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = (select auth.uid()) AND is_admin = false);

-- Actualización exclusiva del propio perfil
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));

-- 5.4 Políticas para public.user_job_states
-- Lectura de estados CRM propios
CREATE POLICY "Users can read own job states"
  ON public.user_job_states
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

-- Inserción de estados CRM propios
CREATE POLICY "Users can insert own job states"
  ON public.user_job_states
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

-- Actualización de estados CRM propios
CREATE POLICY "Users can update own job states"
  ON public.user_job_states
  FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- Eliminación de estados CRM propios
CREATE POLICY "Users can delete own job states"
  ON public.user_job_states
  FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));
