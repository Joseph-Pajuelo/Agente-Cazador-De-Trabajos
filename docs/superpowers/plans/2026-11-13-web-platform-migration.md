# Web Platform Migration & Monorepo Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the job hunter platform from Streamlit + ephemeral SQLite to a multi-user-ready monorepo (`apps/web` on Next.js/Vercel + Supabase Auth/PostgreSQL RLS + decoupled `services/pipeline` Python worker on GitHub Actions) with zero CRM data loss and an elevated Editorial Light UI.

**Architecture:** Shared canonical job catalog (`public.job_listings`) + shared/scoped evaluations (`public.job_evaluations` with `profile_id NULL` for default) + private per-user CRM state (`public.user_job_states`) and editable profiles (`public.profiles`) enforced via Supabase RLS. `services/pipeline` runs scrapers and LangGraph+Gemini CoT asynchronously from GitHub Actions via `supabase-py` HTTPS, precomputing employer resolution (`resolved_brand_key`, `agency_clue`, `sector_hint`) and `published_date`, while `apps/web` serves instant SSR + client filtering without `raw_description` bloat and lazy-loads full descriptions on demand.

**Tech Stack:** Next.js (App Router), React, TypeScript, Tailwind CSS, `@supabase/ssr`, `@supabase/supabase-js`, Lucide React, Zod, Vitest | Python 3.11+, Pydantic V2, LangGraph, `google-genai`, `supabase>=2.0.0`, `httpx`, `beautifulsoup4`, `pytest` | PostgreSQL (Supabase RLS & FTS).

**Spec:** [`docs/superpowers/specs/2026-11-13-web-platform-migration-design.md`](../specs/2026-11-13-web-platform-migration-design.md)

## Global Constraints

- Never store `jobs.db` or CRM JSON state via automatic commits to `main`.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` or `GEMINI_API_KEY` in client/browser code (`NEXT_PUBLIC_*`).
- All multi-user tables (`profiles`, `user_job_states`, `job_evaluations`) must enforce PostgreSQL Row Level Security (`auth.uid()`), plus trigger protection preventing non-`service_role` updates to `profiles.is_admin`.
- Initial `/` load must be public read-only (no login wall blocking showcase visitors) and omit `raw_description`, capping active SSR window cleanly (`<= 600` recent rows + user's CRM listings) while supporting lazy detail fetch and paginated FTS historical queries (`> 1,000` rows).
- Preserve all existing Python scraping/AI functionality (`PracticasPe`, `Bumeran`, `LinkedInGuest`, `Computrabajo`, `CVMatcher`, LangGraph + Gemini CoT + Circuit Breaker) and strict pre-professional + 14-day default recency filtering without displaying Chain-of-Thought cards on `/`.
- Canonical Postgres CRM codes: `to_apply`, `favorite`, `applied`, `interview`, `discarded`.

## Review Focus

1. **Guest CRM interaction & protected route redirects** -> Unauthenticated clicks on CRM buttons/notes open `AuthModal` without losing selected job or mutating state; `/pipeline` and `/profile` redirect unauthenticated users cleanly -> Pinned in Task 5 & Task 6 tests.
2. **Date parsing boundary & timezone neutrality (14-day filter & `DD-MM-YYYY` vs `YYYY-MM-DD`)** -> `published_at` strings parse deterministically across Python and TypeScript so `<= 14` days stays visible and `>= 15` days hides under default filter regardless of UTC-5 local offset -> Pinned in Task 2 & Task 3 tests.
3. **Agency clues, sector fallbacks & typo correction parity** -> Query `"bcp"` matches direct BCP plus `ManpowerGroup` via precomputed/text clues with explanatory note; `"phyton"` -> `"python"` and `"sani isidro"` -> `"san isidro"` work in both client window and historical DB search -> Pinned in Task 3 & Task 4 tests.
4. **RLS cross-user isolation & `is_admin` privilege guard** -> Client mutations only target signed-in user's `user_id` and explicit non-admin profile columns; Zod schemas reject invalid statuses (`status` outside enum) -> Pinned in Task 1 & Task 4 tests.
5. **Idempotent ingestion & historical migration parity** -> Re-running `migrate_sqlite_to_supabase.py` or `run.py --backend supabase` twice deduplicates by `deduplication_hash`, normalizes missing `published_at`/`salary`, and never overwrites `user_job_states` -> Pinned in Task 2 tests.

---

### Task 1: Sync Remote State, Create Monorepo Structure & Supabase SQL Migration

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/202611130001_initial_schema.sql`
- Create: `services/pipeline/tests/test_sql_schema.py`

**Interfaces:**
- Produces SQL schema tables: `public.profiles`, `public.job_listings`, `public.job_evaluations`, `public.user_job_states`
- Produces triggers: `on_auth_user_created` (`handle_new_user`), `protect_profile_is_admin` (`prevent_is_admin_self_escalation`)
- Produces indexes & FTS column: `job_listings.search_tsv`, `idx_job_listings_published_date`, `uq_job_eval_listing_profile UNIQUE NULLS NOT DISTINCT`

- [ ] **Step 1: Sync latest remote `origin/main` so local `jobs.db` captures all automated scrapes before migration**

Run: `git pull --rebase origin main`
Expected: Working tree contains the latest remote commits (`bf1ce6a` or newer) with spec doc preserved cleanly.

- [ ] **Step 2: Write failing schema structural verification test `services/pipeline/tests/test_sql_schema.py`**

Assert existence of `supabase/migrations/202611130001_initial_schema.sql`, presence of all 4 tables, `ENABLE ROW LEVEL SECURITY`, `WITH CHECK` policies on `profiles` and `user_job_states`, `UNIQUE NULLS NOT DISTINCT (listing_id, profile_id)`, `prevent_is_admin_self_escalation`, `search_tsv` (`to_tsvector('spanish', ...)` + GIN index), `published_date`, and CRM check constraint `('to_apply', 'favorite', 'applied', 'interview', 'discarded')`.

- [ ] **Step 3: Run test to verify failure**

Run: `pytest services/pipeline/tests/test_sql_schema.py -v`
Expected: FAIL (`FileNotFoundError` / missing migration file).

- [ ] **Step 4: Write `supabase/config.toml` and `supabase/migrations/202611130001_initial_schema.sql`**

Include exact DDL, triggers (`SECURITY DEFINER SET search_path = ''` on `handle_new_user`, `BEFORE UPDATE` `is_admin` guard checking `current_setting('request.jwt.claim.role', true)`), `GENERATED ALWAYS AS (to_tsvector('spanish', ...)) STORED` + GIN index on `search_tsv`, and RLS policies from Spec Section 5.1–5.2 (including explicit `WITH CHECK` clauses on `profiles` and `user_job_states`).

- [ ] **Step 5: Run schema test to verify pass & commit spec + migration**

Run: `pytest services/pipeline/tests/test_sql_schema.py -v`
Expected: PASS

```bash
git add docs/superpowers/specs/2026-11-13-web-platform-migration-design.md docs/superpowers/plans/2026-11-13-web-platform-migration.md supabase/ services/pipeline/tests/test_sql_schema.py
git commit -m "feat(db): add design spec, migration plan, and Supabase RLS schema"
```

---

### Task 2: Reorganize Python Pipeline (`services/pipeline/`), Implement Repository Pattern & Migrate `jobs.db` Seed

**Files:**
- Move/Create under `services/pipeline/`: `adapters/*`, `ai/*`, `config/*`, `domain/*`, `delivery/*`, `assets/*`, `run.py`, `requirements.txt`
- Create: `services/pipeline/storage/__init__.py`
- Create: `services/pipeline/storage/base.py`
- Create: `services/pipeline/storage/sqlite_repo.py` (from root `storage/database.py`)
- Create: `services/pipeline/storage/supabase_repo.py`
- Create: `services/pipeline/scripts/migrate_sqlite_to_supabase.py`
- Create: `services/pipeline/seeds/initial_catalog.json` (exported from synced `jobs.db` + `storage/crm_memory.json`)
- Create: `services/pipeline/tests/conftest.py`
- Create: `services/pipeline/tests/test_repositories.py`
- Move & Update: `tests/test_adapters.py`, `tests/test_models.py`, `tests/test_storage.py` -> `services/pipeline/tests/`

**Interfaces:**
- Consumes: `domain.models.JobListing`, `domain.models.JobEvaluation`, `domain.companies.resolve_employer`, `domain.ranking.parse_job_date`
- Produces:
  - `JobRepository` Protocol in `storage/base.py`: `get_known_urls() -> set[str]`, `insert_listing(listing: JobListing) -> tuple[int | None, bool]`, `insert_evaluation(listing_id: int, evaluation: JobEvaluation, profile_id: str | None = None) -> None`, `get_pending_listings(limit: int = 200) -> list[tuple[int, JobListing]]`, `reset_evaluations() -> None`, `get_all_evaluated_jobs() -> list[dict]`, `checkpoint() -> None`
  - `normalize_listing_enrichment(listing: JobListing) -> dict` returning `{resolved_brand_key, resolved_via_agency, agency_clue, sector_hint, published_date}`
  - `SupabaseRepository(url: str | None = None, service_role_key: str | None = None, client: Any = None)`
  - CLI `services/pipeline/run.py` accepting `--backend {auto,supabase,sqlite}` (`auto` defaults to `supabase` if `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` env vars are set, else `sqlite`), `--limit`, `--min-score`, `--no-pdf`, `--reevaluate-all`
  - Migration script `migrate_sqlite_to_supabase.py` accepting `--source-json` / `--source-db`, `--dry-run`, `--owner-email`

- [ ] **Step 1: Write failing tests in `services/pipeline/tests/test_repositories.py`**

Test:
1. `normalize_listing_enrichment` resolves `ManpowerGroup` + `"el banco más grande del Perú"` to `resolved_brand_key="bcp"`, `resolved_via_agency=True`, `sector_hint="banca"` and normalizes `"30-10-2026"` -> `"2026-10-30"` and `"2026-11-12T10:00:00Z"` -> `"2026-11-12"` while returning `None` for invalid/missing `published_at`. Also assert `domain.ranking.is_job_recent` keeps age `<= 14` and rejects age `15` deterministically.
2. `SupabaseRepository` with mocked PostgREST client: `insert_listing` executes idempotent upsert on `deduplication_hash` (returning `(id, True/False)` cleanly), `insert_evaluation` sends `profile_id=None` with conflict target `"listing_id,profile_id"` and omits `pitch_recommendation`.
3. `migrate_sqlite_to_supabase.py --dry-run` reads `initial_catalog.json`, maps legacy CRM emojis (`📋 Por postular` -> `to_apply`, `⭐ Favorita` -> `favorite`, `🚀 Postulado` -> `applied`, `🎤 En entrevista` -> `interview`, `❌ Descartada por mí` -> `discarded`), and avoids duplicate writes or overwriting existing user CRM rows.

- [ ] **Step 2: Run tests to verify failure**

Run: `pytest services/pipeline/tests/test_repositories.py -v`
Expected: FAIL (`ModuleNotFoundError`).

- [ ] **Step 3: Move pipeline modules cleanly into `services/pipeline/` and implement `storage/base.py`, `sqlite_repo.py`, `supabase_repo.py`, `run.py`, and `requirements.txt`**

Add `supabase>=2.0.0` to `services/pipeline/requirements.txt`. Ensure `run.py` resolves imports relative to `services/pipeline/` root and accepts `--backend`. Update `delivery/pdf_report.py` font path if needed relative to `services/pipeline/`. Keep existing unit tests green.

- [ ] **Step 4: Generate `services/pipeline/seeds/initial_catalog.json` from synced `jobs.db` and implement `migrate_sqlite_to_supabase.py`**

Export all rows of `job_listings` + `job_evaluations` + `crm_memory.json` from `jobs.db` cleanly into JSON so the full catalog scraped to date can be seeded idempotently once Supabase credentials are provided.

- [ ] **Step 5: Run full Python test suite**

Run: `pytest services/pipeline/tests -v`
Expected: All existing adapter/model/storage tests + new repository/enrichment/migration tests PASS.

- [ ] **Step 6: Commit**

```bash
git add services/pipeline/
git commit -m "feat(pipeline): reorganize Python engine into services/pipeline with Supabase repository and seed export"
```

---

### Task 3: Scaffold Next.js App (`apps/web/`) & Port Domain Logic (`companies.ts`, `searchEngine.ts`, `ranking.ts`)

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `apps/web/vitest.config.ts`, `apps/web/.env.local.example`
- Create: `apps/web/src/app/globals.css`, `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/lib/domain/types.ts`
- Create: `apps/web/src/lib/domain/companies.ts`
- Create: `apps/web/src/lib/domain/searchEngine.ts`
- Create: `apps/web/src/lib/domain/ranking.ts`
- Test: `apps/web/tests/domain.test.ts`

**Interfaces:**
- Produces Types (`types.ts`):
  - `CrmStatus = 'to_apply' | 'favorite' | 'applied' | 'interview' | 'discarded'` + `CRM_STATUS_META` (Spanish labels: `Por postular`, `Destacada`, `Postulado`, `En entrevista`, `Descartada`)
  - `JobSummary` (all listing fields EXCEPT `raw_description`, plus `resolved_brand_key`, `resolved_via_agency`, `agency_clue`, `sector_hint`, `published_date`, evaluation fields, and `user_status`, `applied_at`, `user_notes`)
  - `UserProfile` matching `public.profiles`
- Produces Functions:
  - `resolveEmployer(company, title, description): Employer` & `getBrand(key)` in `companies.ts`
  - `searchJobs(jobs: JobSummary[], rawQuery: string): SearchOutcome` in `searchEngine.ts` (uses precomputed `resolved_brand_key`/`agency_clue`/`sector_hint` + visible text + typo distance & `didYouMean`)
  - `parseJobDate(dateStr)`, `getJobAgeDays(job, now?)`, `isJobRecent(job, maxDays = 14, now?)`, `getJobAgeLabel(job, now?)`, `sortByModalityThenScore(jobs)`, `isRecommended(job, minScore?)` in `ranking.ts`

- [ ] **Step 1: Initialize `apps/web/` with Next.js App Router, TypeScript, Tailwind CSS v4, `@supabase/ssr`, `@supabase/supabase-js`, `lucide-react`, `zod`, and `vitest` (`environment: 'node'`)**

Install dependencies in `apps/web/` and configure `package.json` scripts: `dev`, `build`, `start`, `lint`, `typecheck` (`tsc --noEmit`), `test` (`vitest run`). Configure `next.config.ts`, Editorial Light CSS variables in `globals.css`, and `Plus Jakarta Sans`, `Inter`, and `JetBrains Mono` via `next/font/google` in `layout.tsx`.

- [ ] **Step 2: Write failing Vitest parity tests in `apps/web/tests/domain.test.ts`**

Test:
1. `"bcp"` query matches direct BCP AND ManpowerGroup (`resolved_brand_key: 'bcp'` or `"el banco más grande del Perú"` via agency clues) with search note, plus sector suggestions (`Interbank`, `BBVA`, etc.).
2. Typo queries: `"phyton"` corrects to `"python"`, `"sani isidro"` matches `"San Isidro"`, `"pauer bi"` matches `"Power BI"`.
3. `parseJobDate` & `isJobRecent`: handles `"YYYY-MM-DD"`, `"DD-MM-YYYY"`, `"2026-11-12T10:00:00Z"` safely in local/UTC without 1-day shift errors; accepts age `<= 14`, rejects age `15+`, includes `null` date safely.
4. `sortByModalityThenScore`: sorts `Híbrido > Presencial > Remoto > No especificado`, then descending `final_ranking_score`.

- [ ] **Step 3: Run Vitest to verify tests fail**

Run: `npm --prefix apps/web run test`
Expected: FAIL (missing modules).

- [ ] **Step 4: Implement `types.ts`, `companies.ts`, `searchEngine.ts`, and `ranking.ts`**

Port exact `BRANDS`, `SECTOR_KEYWORDS`, `STAFFING_AGENCIES`, `SYNONYM_MAP`, `CANONICAL_VOCABULARY`, Levenshtein/SequenceMatcher-equivalent ratio (`0.72`–`0.80` parity), and `MODALITY_ORDER` from `services/pipeline/domain/`.

- [ ] **Step 5: Run Vitest, typecheck & commit**

Run: `npm --prefix apps/web run test && npm --prefix apps/web run typecheck`
Expected: PASS (0 errors).

```bash
git add apps/web/
git commit -m "feat(web): scaffold Next.js app and port domain search and ranking engine to TypeScript"
```

---

### Task 4: Implement Supabase Auth Clients, SSR Middleware, Queries & Server Actions (`apps/web`)

**Files:**
- Create: `apps/web/src/lib/supabase/client.ts`
- Create: `apps/web/src/lib/supabase/server.ts`
- Create: `apps/web/src/lib/supabase/middleware.ts`
- Create: `apps/web/src/middleware.ts`
- Create: `apps/web/src/lib/supabase/queries.ts`
- Create: `apps/web/src/actions/crm.ts`
- Create: `apps/web/src/actions/jobs.ts`
- Create: `apps/web/src/actions/profile.ts`
- Test: `apps/web/tests/actions.test.ts`

**Interfaces:**
- Consumes: `JobSummary`, `CrmStatus`, `UserProfile` (`src/lib/domain/types.ts`), `resolveEmployer`, `resolveBrandOrSectorFromQuery` (`companies.ts`), `suggestCorrections` (`searchEngine.ts`)
- Produces:
  - `shouldRedirectToLogin(pathname: string, hasUser: boolean): string | null` in `lib/supabase/middleware.ts` (redirects `/pipeline` and `/profile` -> `/login?next=<pathname>`)
  - `buildHistoricalSearchFilters(params)` returning structured PostgREST filter descriptors (`brandKey`, `sectorHint`, `ftsQuery`, `didYouMean`, `minScore`, `includeDiscardedAi`, `modalities`, `sources`, `cutoffDate`)
  - `getInitialRadarData(): Promise<{ jobs: JobSummary[]; user: AuthUserInfo | null; lastUpdated: string | null }>` (queries lightweight columns **without** `raw_description`, recent 45d up to 600 rows using `job_evaluations` left/inner mapping + batch fetch for user's `user_job_states` listing IDs; gracefully returns empty state with config notice if env vars aren't set yet during static build)
  - `getUserPipelineJobs(): Promise<JobSummary[]>` (all listings with user CRM status != `to_apply` or non-empty notes)
  - `getUserProfile(): Promise<UserProfile | null>`
  - Server Action `upsertJobState(input: { listingId: number; status: CrmStatus; notes?: string }): Promise<{ ok: boolean; error?: string; appliedAt?: string | null }>`
  - Server Action `getJobDescription(listingId: number): Promise<{ rawDescription: string | null; error?: string }>`
  - Server Action `searchHistoricalJobs(params: { query: string; includeDiscardedAi: boolean; minScore: number; modalities: string[]; sources: string[]; maxAgeDays: number | null; offset: number; limit: number }): Promise<{ jobs: JobSummary[]; hasMore: boolean; didYouMean: string | null; note: string | null }>` (uses `job_evaluations!inner` SQL filtering before `.range(offset, offset + limit)` + separate authenticated batch `.in('listing_id', ids)` for `user_job_states`)
  - Server Action `updateProfile(input: ProfileUpdateInput): Promise<{ ok: boolean; error?: string }>` (Zod-validated, explicitly selects non-admin columns and never accepts/updates `is_admin`)

- [ ] **Step 1: Write failing unit tests in `apps/web/tests/actions.test.ts`**

Test:
1. `crmStateSchema` rejects invalid status strings (`'hacked'`) and non-positive IDs; accepts valid `CrmStatus` + optional notes.
2. `profileUpdateSchema` strips/forbids `is_admin` / `isAdmin` injection and validates array lengths cleanly.
3. Unauthenticated `upsertJobState` / `updateProfile` returns `{ ok: false, error: 'AUTH_REQUIRED' }` without hitting DB writes; `shouldRedirectToLogin('/pipeline', false)` -> `'/login?next=%2Fpipeline'` and `shouldRedirectToLogin('/', false)` -> `null`.
4. `buildHistoricalSearchFilters` maps `"bcp"` to `brandKey: 'bcp'`, `sectorHint: 'banca'` and typo `"phyton"` -> `ftsQuery: 'python'`, `didYouMean: 'python'`.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm --prefix apps/web run test`
Expected: FAIL.

- [ ] **Step 3: Implement Supabase SSR helpers, middleware route protection for `/pipeline` & `/profile`, queries, and Zod-validated Server Actions**

In `src/middleware.ts`: refresh Supabase auth cookies cleanly and redirect unauthenticated requests to `/pipeline` or `/profile` to `/login?next=<pathname>`. Guard missing env vars cleanly during `next build` static checks.

- [ ] **Step 4: Run tests & typecheck, then commit**

Run: `npm --prefix apps/web run test && npm --prefix apps/web run typecheck`
Expected: PASS.

```bash
git add apps/web/src/
git add apps/web/tests/
git commit -m "feat(web): add Supabase SSR auth, lightweight catalog queries, and validated CRM/profile actions"
```

---

### Task 5: Build Login Flows & Editorial Master-Detail Explorer UI (`/`, `/login`, `/auth/callback`)

**Prerequisites:** Before implementing UI components, run `npx.cmd -y modern-web-guidance@latest retrieve "dialog,autofill-sign-in-form,autofill-sign-up-form,forms,validate-input-after-interaction,css-layout,responsive-design"` and apply retrieved best practices (e.g., native `<dialog>` / `showModal()`, `autocomplete` attributes, accessible focus & `100dvh`/sticky layout, reduced-motion safety).

**Files:**
- Create: `apps/web/src/lib/jobs/workspaceState.ts`
- Create: `apps/web/src/app/login/page.tsx`
- Create: `apps/web/src/app/auth/callback/route.ts`
- Create: `apps/web/src/components/layout/Navbar.tsx`
- Create: `apps/web/src/components/auth/AuthModal.tsx`
- Create: `apps/web/src/components/jobs/CompanyMonogram.tsx`
- Create: `apps/web/src/components/jobs/FilterBar.tsx`
- Create: `apps/web/src/components/jobs/JobCard.tsx`
- Create: `apps/web/src/components/jobs/JobDetail.tsx`
- Create: `apps/web/src/components/jobs/JobsWorkspace.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Test: `apps/web/tests/workspace.test.ts`

**Interfaces:**
- Consumes: `getInitialRadarData` (`queries.ts`), `searchJobs`, `isJobRecent`, `sortByModalityThenScore`, `isRecommended` (`lib/domain/`), `upsertJobState`, `getJobDescription`, `searchHistoricalJobs` (`actions/`)
- Produces:
  - Pure workspace reducer & selector helpers in `src/lib/jobs/workspaceState.ts`: `computeCrmCounts(jobs)`, `filterAndSortWorkspaceJobs(jobs, filters)`, `applyOptimisticCrmTransition(jobs, listingId, nextStatus, nextNotes)`, `canMutateCrm(user)`
  - Complete responsive Master-Detail Explorer UI with Otta-inspired Editorial Light design (`#F8FAFC` / `#FFFFFF` / `#1E3A8A` Navy / Sage & Amber pills), 0ms optimistic CRM actions, guest `AuthModal` interception, lazy description loader, `"¿Quisiste decir: '...'?"` typo chip, `"Vía <Agencia> · Marca: <Empresa>"` agency clue badge, historical search trigger (`"Cualquier fecha"`), empty states, and zero Chain-of-Thought clutter.

- [ ] **Step 1: Retrieve `modern-web-guidance` guides & write failing state/filter tests in `apps/web/tests/workspace.test.ts`**

Test pure helpers from `src/lib/jobs/workspaceState.ts`:
1. `computeCrmCounts` & `filterAndSortWorkspaceJobs` match active/to_apply/favorite/applied/interview/discarded tabs accurately and exclude AI-discarded unless explicitly included.
2. `"Cualquier fecha"` (`maxAgeDays: null`) flags `requiresHistoricalQuery(filters)` cleanly.
3. `applyOptimisticCrmTransition` updates status, `applied_at`, and notes without mutating unrelated jobs; `canMutateCrm(null)` triggers guest `AuthModal` gate cleanly without altering state.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm --prefix apps/web run test`
Expected: FAIL.

- [ ] **Step 3: Build `Navbar`, `AuthModal` (using semantic accessible `<dialog>`), `/login` & `/auth/callback` (Email/Password + Google OAuth button + proper `autocomplete` attributes)**

- [ ] **Step 4: Build `CompanyMonogram`, `FilterBar`, `JobCard`, `JobDetail` (lazy-loads `raw_description`, notes form with saved indicator, NO CoT cards), `JobsWorkspace` (Master-Detail desktop split + mobile slide-over/drawer), and wire `app/page.tsx`**

- [ ] **Step 5: Run tests, lint, typecheck & commit**

Run: `npm --prefix apps/web run test && npm --prefix apps/web run lint && npm --prefix apps/web run typecheck`
Expected: PASS.

```bash
git add apps/web/
git commit -m "feat(web): build Editorial Light Master-Detail explorer, smart search UI, and Auth flows"
```

---

### Task 6: Build Protected `/pipeline` CRM Board & `/profile` Preferences Pages

**Files:**
- Create: `apps/web/src/lib/pipeline/boardHelpers.ts`
- Create: `apps/web/src/lib/profile/profileFormHelpers.ts`
- Create: `apps/web/src/components/pipeline/PipelineBoard.tsx`
- Create: `apps/web/src/app/pipeline/page.tsx`
- Create: `apps/web/src/components/profile/ProfileForm.tsx`
- Create: `apps/web/src/app/profile/page.tsx`
- Test: `apps/web/tests/pipelineProfile.test.ts`

**Interfaces:**
- Consumes: `getUserPipelineJobs`, `getUserProfile` (`queries.ts`), `upsertJobState` (`actions/crm.ts`), `updateProfile` (`actions/profile.ts`)
- Produces:
  - `groupJobsByPipelineStage(jobs)` & `movePipelineJob(jobs, listingId, nextStage, nextNotes)` (`boardHelpers.ts`)
  - `toProfileFormState(profile)` & `toProfileUpdateInput(formState)` (`profileFormHelpers.ts`)
  - `/pipeline` Kanban/columns workspace (`Destacada`, `Postulado`, `En entrevista`, `Descartada`) with inline note editing and stage changes; `/profile` editable form persisted to `public.profiles`.

- [ ] **Step 1: Write failing tests in `apps/web/tests/pipelineProfile.test.ts`**

Test pure helpers from `boardHelpers.ts` and `profileFormHelpers.ts`: grouping jobs by CRM columns (`favorite`, `applied`, `interview`, `discarded`), inline stage transitions updating `applied_at`, and profile form payload serialization (districts, modality priority, skills array).

- [ ] **Step 2: Run tests to verify failure**

Run: `npm --prefix apps/web run test`
Expected: FAIL.

- [ ] **Step 3: Implement `PipelineBoard.tsx`, `/pipeline/page.tsx`, `ProfileForm.tsx`, and `/profile/page.tsx`**

Ensure `/profile` pre-populates existing profile or sensible defaults cleanly, allows editing cycle/university/districts/modalities/skills, displays inline save feedback, and notes transparently that personalized per-profile AI re-scoring activates in Phase 2.

- [ ] **Step 4: Run tests, lint, typecheck, production build & commit**

Run: `npm --prefix apps/web run test && npm --prefix apps/web run lint && npm --prefix apps/web run typecheck && npm --prefix apps/web run build`
Expected: All pass and Next.js production build succeeds cleanly!

```bash
git add apps/web/
git commit -m "feat(web): add /pipeline CRM board and /profile preferences editor"
```

---

### Task 7: Final Repo Cleanup ("Acomodar Todo"), GitHub Actions Update, Docs & End-to-End Verification

**Files:**
- Remove legacy Streamlit files: `app.py`, `.streamlit/config.toml`, `Iniciar_Radar.bat`, `.github/workflows/keep_alive.yml`, old root copies of `adapters/`, `ai/`, `config/`, `delivery/`, `domain/`, `storage/`, `tests/`, `run.py`, `requirements.txt`, `reports/`, `jobs.db` (after confirming `services/pipeline/seeds/initial_catalog.json` holds all migrated data!)
- Modify: `.gitignore`
- Modify: `.env.example`
- Modify: `.github/workflows/auto_scrape.yml`
- Create: `docs/DEPLOYMENT.md`
- Modify: `README.md`

**Interfaces:**
- `.github/workflows/auto_scrape.yml` executes `python services/pipeline/run.py --limit 10 --no-pdf --backend supabase` with `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and performs **no** `git commit` / `git push`.

- [ ] **Step 1: Update `.github/workflows/auto_scrape.yml`, `.gitignore`, and `.env.example`, and remove legacy root Streamlit files cleanly**

Verify `services/pipeline/seeds/initial_catalog.json` contains all historical rows from `jobs.db` before untracking/removing root `jobs.db` and `storage/crm_memory.json` (ensure `initial_catalog.json` preserves those CRM records cleanly too for `--owner-email` import!).

- [ ] **Step 2: Write `docs/DEPLOYMENT.md` & update `README.md`**

`docs/DEPLOYMENT.md` covers:
1. Creating Supabase project -> running `supabase/migrations/202611130001_initial_schema.sql` (via SQL Editor or Supabase CLI).
2. Enabling Email Auth (and optional Google OAuth + `/auth/callback` redirect URL).
3. Seeding all historical jobs via `python services/pipeline/scripts/migrate_sqlite_to_supabase.py` (plus `--owner-email` once Joseph creates his account!).
4. Setting Vercel Root Directory = `apps/web` + env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
5. Setting GitHub Repository Secrets (`GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).

- [ ] **Step 3: Run full cross-stack verification (Python + Web + Live Dev Server smoke check)**

Run:
1. `pytest services/pipeline/tests -v`
2. `npm --prefix apps/web run lint && npm --prefix apps/web run typecheck && npm --prefix apps/web run test && npm --prefix apps/web run build`
3. Start `apps/web` dev server cleanly (`npm --prefix apps/web run dev`) and inspect rendered pages (`/`, `/login`) in headless browser (`browser` subagent or Playwright script) for zero console/runtime errors, desktop + mobile layout integrity, search + filters, and `AuthModal` trigger -> shut down server cleanly!

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore(repo): finalize monorepo cleanup, Supabase CI workflow, and deployment guide"
```
