# Design Document: Migración de Radar de Prácticas a Plataforma Web Full-Stack Multi-Usuario

**Fecha:** 2026-11-13  
**Estado:** Listo para aprobación (revisado por Builder Check)  
**Autor:** Arquitectura propuesta sobre el repositorio `Agente-Cazador-De-Trabajos`

---

## 1. Intención y Diagnóstico del Problema

El sistema actual sufre pérdida recurrente de la memoria CRM (*Destacadas, Postuladas, Descartadas y Notas*) debido a que:
1. `.github/workflows/auto_scrape.yml` ejecuta el pipeline Python dos veces al día y hace `git push` de `jobs.db` directo a la rama `main`.
2. Cada push a `main` obliga a Streamlit Community Cloud a destruir y reconstruir el contenedor desde cero (disco efímero), borrando los cambios que el usuario hizo en la sesión o en el disco temporal del contenedor.
3. El respaldo por `st.query_params` no sobrevive entre accesos desde la URL limpia ni a través del iframe de Streamlit Cloud tras un redeploy.

**Objetivo:** Migrar la capa de presentación y persistencia fuera de Streamlit hacia una **aplicación web moderna, rápida y escalable para múltiples usuarios**, manteniendo el motor Python de extracción (5 portales) y evaluación IA (LangGraph + Gemini CoT) completamente desacoplado.

---

## 2. Metas, No-Metas y Anti-Metas

### Metas (Fase 1 - Migración Completa)
1. **Persistencia definitiva y multi-usuario:** Separar el catálogo compartido de vacantes (`job_listings`) del estado privado por usuario (`user_job_states` y `profiles`) en **PostgreSQL (Supabase)** con aislamiento estricto mediante **Row Level Security (RLS)**.
2. **Cero reinicios por scraping automático:** El cron de GitHub Actions escribirá directo a Supabase vía HTTPS API (`service_role`), sin realizar commits ni pushes a `main`.
3. **Frontend web veloz y diseño editorial refinado (`apps/web`):** Construir la web en **Next.js (App Router) + TypeScript + Tailwind CSS**, alojada en **Vercel** (0 ms de *cold start*, sin pantallas de "despertando", actualizaciones optimistas en CRM sin recargar la página).
4. **Acceso híbrido amigable (Lectura pública + Cuenta personal):** Al abrir la página principal (`/`), cualquier visitante ve el catálogo público preprofesional evaluado; para guardar postulaciones, destacar, descartar, anotar o ver `/pipeline` y `/profile`, inicia sesión o crea cuenta (Email/Password + preparado para Google OAuth).
5. **Paridad funcional total del buscador y reglas de negocio:** Portar fielmente a TypeScript la resolución de empresas/agencias (`companies.py` — ej. *Manpower -> BCP*), corrección ortográfica/sugerencias (`search_engine.py`) y filtro/ranking (`ranking.py` — 14 días máx. por defecto, `Híbrido > Presencial > Remoto`).
6. **Reordenamiento limpio del repositorio ("acomodar todo"):** Estructurar un *monorepo* profesional (`apps/web`, `services/pipeline`, `supabase`, `docs`), migrar el catálogo histórico de `jobs.db` sin perder vacantes y retirar el código legado de Streamlit/keep-alive.

### No-Metas (Fuera de alcance en Fase 1, preparadas en arquitectura)
* **Re-evaluación IA personalizada por perfil en tiempo real:** En Fase 1, todos los usuarios comparten las evaluaciones base (`profile_id IS NULL`) generadas por el pipeline, aunque el esquema SQL y `/profile` quedan listos para habilitar evaluaciones por `profile_id` (Fase 2) conectando un servicio FastAPI / worker dedicado.
* **Disparo manual de scraping desde botón web en Fase 1:** El escaneo corre automáticamente en GitHub Actions a las 7:00 AM y 2:00 PM (y puede lanzarse manualmente desde la pestaña *Actions* en GitHub). Integrar un disparador web (`adminScan`) queda diferido a Fase 2 junto al worker FastAPI para evitar configurar un PAT extra de GitHub en Vercel durante Fase 1.
* **Carga y adaptación automática de CV en PDF por vacante.**
* **Notificaciones activas por Telegram o correo.**
* **Postulación automática mediante navegador headless en portales externos.**

### Anti-Metas
* Volver a guardar archivos binarios de SQLite (`jobs.db`) o estados JSON mediante commits automáticos en `main`.
* Bloquear la portada `/` tras un muro de login que impida a reclutadores o visitantes ver cómo funciona la plataforma.
* Exponer `SUPABASE_SERVICE_ROLE_KEY` o `GEMINI_API_KEY` en el bundle del navegador.

---

## 3. Enfoque Elegido y Alternativas Evaluadas

Se evaluaron 3 arquitecturas:
1. **Elegida — Opción 1: Next.js (Vercel) + Supabase (Auth + PostgreSQL RLS) + Worker Python desacoplado (`services/pipeline`):**
   - *Por qué gana:* Ofrece latencia cero y disponibilidad 24/7 gratuita en Vercel + Supabase; protege los datos de cada usuario a nivel de base de datos (RLS); reutiliza al 100% los 5 adapters y LangGraph en Python sin sufrir límites de timeout de 10s ni *cold starts* de servidores gratuitos; permite enchufar FastAPI después solo para tareas de IA bajo demanda.
   - *Trade-off asumido:* El buscador inteligente y ranking se portan a TypeScript (validados con suite de paridad) para filtrar instantáneamente en el cliente/BFF sin levantar un servidor Python 24/7.
2. *Descartada — React + FastAPI único en hosting gratuito:* Obliga a pagar servidor o tolerar 30–50s de suspensión por inactividad en planes gratuitos tipo Render.
3. *Descartada — Migración total de scrapers e IA a TypeScript:* Desecharía código ya probado (`adapters/`, `langgraph`, `pytest`) sin beneficio claro.

---

## 4. Estructura del Monorepo

```text
job_hunter_agent/
├── apps/
│   └── web/                               # Frontend Web + BFF (Next.js App Router + TS + Tailwind)
│       ├── src/
│       │   ├── app/
│       │   │   ├── layout.tsx             # Tipografía, metadata y AuthProvider
│       │   │   ├── page.tsx               # Explorar Vacantes (SSR lectura pública + hidratación CRM usuario)
│       │   │   ├── pipeline/page.tsx      # Tablero Kanban / gestión CRM (requiere sesión)
│       │   │   ├── profile/page.tsx       # Perfil profesional y preferencias (requiere sesión)
│       │   │   ├── login/page.tsx         # Acceso / Registro (Email+Password y Google OAuth)
│       │   │   └── auth/callback/route.ts # Callback OAuth/Magic Link Supabase
│       │   ├── components/
│       │   │   ├── layout/Navbar.tsx
│       │   │   ├── jobs/                  # FilterBar, JobCard, JobList, JobDetail, SkillsTags
│       │   │   ├── pipeline/              # PipelineBoard, StatusColumn
│       │   │   ├── profile/               # ProfileForm
│       │   │   └── auth/                  # AuthModal (se abre si invitado intenta guardar estado)
│       │   ├── lib/
│       │   │   ├── domain/                # companies.ts, searchEngine.ts, ranking.ts, types.ts
│       │   │   └── supabase/              # client.ts, server.ts, middleware.ts, queries.ts
│       │   └── actions/                   # Server Actions: crm.ts, profile.ts, jobs.ts (lazy detail & búsqueda histórica)
│       ├── tests/                         # Vitest: searchEngine.test.ts, ranking.test.ts
│       ├── package.json
│       ├── next.config.ts
│       └── .env.local.example
├── services/
│   └── pipeline/                          # Motor Python de Ingesta, IA y Migración
│       ├── adapters/                      # practicas_pe.py, bumeran.py, linkedin.py, computrabajo.py, cvmatcher.py, base.py
│       ├── ai/                            # graph.py, matcher.py, prompts.py
│       ├── config/                        # candidate_profile.py, search.py
│       ├── domain/                        # models.py, enums.py, ranking.py, companies.py, search_engine.py
│       ├── delivery/                      # pdf_report.py, reporter.py (CLI opcional)
│       ├── storage/
│       │   ├── base.py                    # Contrato/Protocolo JobRepository
│       │   ├── sqlite_repo.py             # Implementación SQLite local (pruebas / fallback offline)
│       │   └── supabase_repo.py           # Implementación HTTPS PostgREST oficial (supabase-py)
│       ├── scripts/
│       │   └── migrate_sqlite_to_supabase.py  # Importación idempotente de catálogo histórico + CRM inicial
│       ├── seeds/
│       │   └── initial_catalog.json       # Snapshot JSON exportado del último jobs.db antes de retirarlo
│       ├── tests/                         # pytest (adapters, models, storage sqlite/mock supabase)
│       ├── run.py                         # Orquestador CLI (--backend supabase|sqlite)
│       └── requirements.txt
├── supabase/
│   ├── config.toml
│   └── migrations/
│       └── 202611130001_initial_schema.sql
├── docs/
│   ├── DEPLOYMENT.md                      # Guía de alta en Supabase, Vercel y GitHub Secrets
│   └── superpowers/specs/
│       └── 2026-11-13-web-platform-migration-design.md
├── .github/
│   └── workflows/
│       └── auto_scrape.yml                # Actualizado: corre services/pipeline/run.py --backend supabase
├── .gitignore                             # Ignora jobs.db*, .env*, node_modules, .next
├── .env.example
└── README.md
```

**Limpieza de archivos legados:**
- Antes de retirar `jobs.db` del control de versiones, extraer el snapshot actualizado desde `origin/main` hacia `services/pipeline/seeds/initial_catalog.json` (y conservar compatibilidad en `migrate_sqlite_to_supabase.py` para leer tanto `.json` como un `.db` local si existiera).
- Eliminar `app.py`, `.streamlit/config.toml`, `Iniciar_Radar.bat`, `.github/workflows/keep_alive.yml` (Vercel no se duerme y el cron de las 7 AM / 2 PM mantiene Supabase activo evitando la pausa por 7 días de inactividad) y `reports/` binarios generados en el repo.

---

## 5. Modelo de Datos y Seguridad (PostgreSQL + Supabase RLS)

### 5.1 Esquema SQL (`supabase/migrations/202611130001_initial_schema.sql`)

```sql
-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Perfiles de usuario (1:1 con auth.users)
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
AS $$
BEGIN
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin AND current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    NEW.is_admin := OLD.is_admin;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_profile_is_admin
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.prevent_is_admin_self_escalation();

-- 2. Catálogo compartido de vacantes (escrito solo por el pipeline vía service_role)
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
      'simple',
      coalesce(title, '') || ' ' ||
      coalesce(company, '') || ' ' ||
      coalesce(location, '') || ' ' ||
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

-- 3. Evaluaciones de IA/Heurística (profile_id NULL = evaluación base compartida)
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

-- 4. Estado CRM privado por usuario (NUNCA sobreescrito por el scraper)
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
```

### 5.2 Políticas Row Level Security (RLS)
Todas las tablas tienen `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`:
* **`job_listings`**: `SELECT` habilitado para `anon` y `authenticated` (`USING (true)`). Sin políticas de escritura cliente (solo `service_role` escribe).
* **`job_evaluations`**: `SELECT` habilitado para `anon` donde `profile_id IS NULL`; `SELECT` para `authenticated` donde `profile_id IS NULL OR profile_id = auth.uid()`. Sin escritura de `anon`; futuras evaluaciones de usuario restringidas a `profile_id = auth.uid()`.
* **`profiles`**: `SELECT`, `INSERT`, `UPDATE` exclusivamente donde `id = auth.uid()` (el campo `is_admin` se protege evitando que el usuario se auto-promueva mediante un `BEFORE UPDATE` trigger o limitando las columnas modificables desde la Server Action / política `WITH CHECK`).
* **`user_job_states`**: `SELECT`, `INSERT`, `UPDATE`, `DELETE` exclusivamente donde `user_id = auth.uid()`.

### 5.3 Mapeo canónico de estados CRM
Para desacoplar almacenamiento e idioma/UI, Postgres usa códigos estables:
* `to_apply` ↔ `Por postular` (equivale a `📋 Por postular` en SQLite legado)
* `favorite` ↔ `Destacada` (`⭐ Favorita`)
* `applied` ↔ `Postulado` (`🚀 Postulado`)
* `interview` ↔ `En entrevista` (`🎤 En entrevista`)
* `discarded` ↔ `Descartada` (`❌ Descartada por mí`)

---

## 6. Arquitectura del Frontend Web (`apps/web`)

### 6.1 Stack y Estética
* **Framework:** Next.js App Router (React + TypeScript estrictos), Tailwind CSS, iconos Lucide usados de forma sobria (sin saturación visual).
* **Paleta Editorial Light (Otta-inspired):** Fondo `#F8FAFC`, tarjetas `#FFFFFF` con borde `#E2E8F0`, acento primario `#1E3A8A` (Navy), verde `#065F46`/`#ECFDF5` para compatibilidad alta (>=70%) y fechas recientes (<=7d), ámbar `#92400E`/`#FEF3C7` para destacadas, tipografía `Plus Jakarta Sans` + `JetBrains Mono` para puntajes.

### 6.2 Rutas y Flujos de Usuario
1. **`/` — Explorar Vacantes (Pública en lectura / Interactiva al loguearse):**
   - **Carga escalable y sin tope de 1,000 filas (Decisión de arquitectura):**
     - **Carga inicial SSR (`queries.ts`):** Consulta una **proyección ligera SIN `raw_description`** (incluye `published_date`, `resolved_brand_key`, `resolved_via_agency`, `agency_clue`, `sector_hint`, `matching_skills`, `verdict_summary`, evaluación y `user_job_states`) acotada a los últimos 45 días (`published_date >= hoy - 45d` o `published_date IS NULL`, hasta 600 registros) más un fetch separado por los `listing_id` donde el usuario autenticado tenga estado en `user_job_states` (así sus postuladas históricas siempre aparecen aunque pasen 45 días). Esto mantiene el payload inicial liviano (<200 KB) aunque existan miles de ofertas en Supabase.
     - **Lazy loading del detalle:** Al seleccionar una vacante en la tarjeta derecha, la Server Action `getJobDescription(listingId)` (cacheada en cliente) obtiene `raw_description` bajo demanda.
     - **Modo histórico (`"Cualquier fecha"`) y paginación ilimitada:** Cuando el usuario elige `"Cualquier fecha"` (o busca sobre el catálogo completo), `actions/jobs.ts` consulta Supabase usando filtros de `job_evaluations` (`is_pre_professional`, puntaje mínimo), `resolved_brand_key` / `sector_hint` (cuando `searchEngine.ts` detecta una marca/agencia) + `textSearch('search_tsv', ...)` + `.range(offset, offset + limit)` para recorrer miles de registros sin chocar con el límite de 1,000 filas de PostgREST.
   - **Banner discreto para invitados:** Si no hay sesión, muestra arriba una banda sutil con botón *Iniciar sesión / Crear cuenta* explicando que el catálogo es público y el seguimiento personal requiere cuenta.
   - **Motor cliente instantáneo (`src/lib/domain/`):**
     - `searchEngine.ts` + `companies.ts`: Port exacto de resolución de marcas (`BRANDS`, `STAFFING_AGENCIES`, pistas indirectas como *"el banco más grande del Perú"* -> BCP utilizando los campos precomputados `resolved_brand_key`/`agency_clue`/`sector_hint` más los textos visibles), expansión de sinónimos (`phyton` -> `python`, `sani isidro` -> `san isidro`), distancia difusa para *"¿Quisiste decir...?"* y chips relacionados por sector.
     - `ranking.ts`: Parseo de `published_at` / `created_at`, filtro estricto de antigüedad máxima (por defecto **14 días / 2 semanas**), filtro estricto de preprofesional (salvo toggle explícito *"Incluir descartadas por IA"* o que el usuario ya la haya marcado en su CRM), ordenamiento (`Modalidad > Match`, `Mayor Match`, `Más recientes`).
   - **Vista Master-Detail (Desktop 2 columnas / Móvil lista + slide-over drawer):**
     - Tarjeta izquierda: Monograma de empresa real (o detectada vía agencia), título, empresa/distrito/sueldo, píldora de compatibilidad, píldoras de modalidad + portal + antigüedad (`Hoy`, `Hace 3d`, etc.), nota de agencia si aplica, y botones rápidos (`Destacar`, `Postularé`, `Abrir ↗`).
     - Panel derecho sticky: Encabezado, 5 botones de estado CRM (`useOptimistic` + Server Action `upsertJobState` con validación Zod y guardado real en `user_job_states`), **Veredicto de compatibilidad**, chips de **Habilidades coincidentes vs Requisitos a reforzar**, acordeón **Descripción completa**, y cuadro de **Notas personales** (botón guardar + indicador de guardado). *Sin mostrar tarjetas extensas de Chain-of-Thought en la vista principal, manteniendo limpia la lectura.*
   - Si un visitante sin sesión hace clic en cualquier acción CRM o nota, se abre `AuthModal` en el acto sin perder la vacante seleccionada.
2. **`/pipeline` — Tablero de Postulaciones (Protegida por sesión):**
   - Vista por columnas/estados (`Destacada`, `Postulado`, `En entrevista`, `Descartada`) con buscador rápido, fecha `applied_at`, edición directa de notas y transición de estado en 1 clic.
3. **`/profile` — Mi Perfil y Preferencias (Protegida por sesión):**
   - Formulario conectado a `public.profiles` (nombre, carrera, ciclo actual, distritos preferidos, prioridad de modalidad, áreas objetivo y skills).
   - Nota transparente en UI indicando que las preferencias de distrito/modalidad/skills se guardan en cuenta y quedarán conectadas al re-scoring IA personalizado en la próxima fase.
4. **`/login` y `/auth/callback`:**
   - Soporte de Email + Contraseña (registro/login) y botón "Continuar con Google" (cuando Google OAuth esté habilitado en el proyecto Supabase).
   - Protección automática vía `middleware.ts` de `@supabase/ssr` para refrescar cookies de sesión sin parpadeos.

---

## 7. Arquitectura del Pipeline Python (`services/pipeline`) y CI/CD

1. **Transporte seguro hacia Supabase (`storage/supabase_repo.py`):**
   - Se utiliza el cliente oficial **`supabase` (`supabase-py`) sobre HTTPS (PostgREST)** usando `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`.
   - *Motivo crítico de infraestructura:* Los runners de GitHub Actions operan sobre IPv4; la conexión directa Postgres de Supabase por puerto 5432 usa IPv6 por defecto y fallaría sin pooler. La API HTTPS funciona de forma uniforme en IPv4/IPv6 y simplifica los `upsert` idempotentes por `deduplication_hash`.
2. **Interfaz compartida (`storage/base.py`):**
   - `run.py` recibe un repositorio inyectado (`SupabaseRepository` en producción/CI, `SqliteRepository` en tests o ejecución offline `--backend sqlite`).
   - En cada inserción/migración, Python ejecuta `domain.companies.resolve_employer(...)` para poblar `resolved_brand_key`, `resolved_via_agency`, `agency_clue` y `sector_hint` directamente en `job_listings`.
   - Las evaluaciones del cron se insertan con `profile_id = None` (catálogo compartido).
   - El pre-filtro determinista + grafo LangGraph (`ai/graph.py`) y Gemini (`ai/matcher.py`) conservan el Circuit Breaker y timeout duro sin cambios de comportamiento.
3. **Actualización de `.github/workflows/auto_scrape.yml`:**
   - Ejecuta a las 7:00 AM y 2:00 PM hora Perú (`0 12 * * *` y `0 19 * * *` UTC).
   - Invoca `python services/pipeline/run.py --limit 10 --no-pdf --backend supabase` usando secrets `GEMINI_API_KEY`, `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`.
   - **Beneficio adicional:** Escribir dos veces al día en Supabase mantiene la base de datos activa de forma automática, evitando la pausa por 7 días de inactividad del plan gratuito.
4. **Script de migración de datos existentes (`services/pipeline/scripts/migrate_sqlite_to_supabase.py`):**
   - Lee `services/pipeline/seeds/initial_catalog.json` (generado desde el `jobs.db` actualizado de `origin/main`) o un `jobs.db` local, realiza upsert de todas las vacantes y evaluaciones (`profile_id = NULL`) hacia Supabase, y opcionalmente importa un archivo `crm_memory.json` para un `user_id` destino (`--owner-email`) una vez que Joseph cree su usuario en la nueva web.

---

## 8. Estrategia de Verificación y Pruebas

1. **Paridad Python ↔ TypeScript:**
   - Suite **Vitest** en `apps/web/tests/` que reutiliza los casos clave de `tests/test_models.py` (ej. búsqueda `"bcp"` detectando `ManpowerGroup`, `"phyton"` corrigiendo a `"python"`, `"sani isidro"`, filtro estricto <= 14 días, ordenamiento `Híbrido > Presencial > Remoto`).
2. **Tests Python (`services/pipeline/tests/`):**
   - Reorganizar y mantener pasando al 100% los tests de `adapters`, `models`, `ai` y `storage` (SQLite + mock de `SupabaseRepository` verificando payloads de upsert y deduplicación).
3. **Validación Frontend y Build:**
   - `npm run lint`, `npm run typecheck`, `npm run test` y `npm run build` en `apps/web` sin errores.
   - Prueba E2E local contra dev server (o Playwright) comprobando renderizado de `/` sin errores de consola, buscador, filtros, apertura de `AuthModal` para invitado, y vista responsive móvil/desktop.

---

## 9. Lo que queda en manos del constructor / configuración externa

* Detalles finos de espaciado, micro-transiciones CSS y selección de componentes base (ej. utilidades Tailwind limpias o primitivas accesibles sin dependencias pesadas innecesarias).
* Creación del proyecto real en Supabase y Vercel por parte del propietario siguiendo `docs/DEPLOYMENT.md` (los SQL, scripts de migración/seed, archivos `.env.example` y configuraciones quedarán listos para conectar credenciales y desplegar).
