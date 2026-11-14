# Redesign Portal Lima + Filtros Minuciosos + CRM en Tarjeta + Login Confiable (Fase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Job Hunter (`apps/web/`) into a 3-zone CVMatcher-inspired portal specialized 100% in Lima Metropolitana with URL-synced granular filters (independent district include/exclude with `Ate` excluded by default), 1-click inline CRM actions on job cards, a slide-over detail drawer with lazy CoT IA disclosure, normalized schema/backfill over the 271 live Supabase listings, and reliable end-to-end Auth/Login.

**Architecture:** Extend `public.job_listings` and `public.profiles` via idempotent SQL migration, populate the 271 live listings using a pure text TypeScript extractor (`jobNormalization.ts`) compatible with future Phase 2 ingestion, synchronize bidirectional URL filters (`urlFilterParams.ts`) with client filtering (`workspaceState.ts`) and historical SQL queries (`searchHistoricalJobs`), unify navigation under a responsive `AppShell`, and repair Supabase Auth PKCE + `token_hash` verification, confirmation resend, and password recovery.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5.8, Tailwind CSS v4, Vitest 3, Zod, Supabase (`@supabase/ssr`, `@supabase/supabase-js`), Native HTML `<dialog>`, `<details>`, and `<input type="checkbox" switch>`.

**Spec:** `docs/superpowers/specs/2026-11-13-cvmatcher-portal-redesign-design.md`

---

## Global Constraints

- Do NOT modify `services/pipeline/` adapters or `matcher.py` during Fase 1 (those belong to Fase 2).
- Never invent salaries or districts when source text does not state them (`null` / `'Lima Metropolitana'` honest fallbacks).
- Never fetch `raw_description` across hundreds of listings on initial SSR load of `/`; keep `getJobDetail` lazy on drawer open.
- Never hide active exclusions silently: every active district exclusion (including default `Ate`) must appear as a removable chip and in URL query params (`excl`).
- Never break tracked CRM jobs in `/pipeline` or user CRM tabs even when a listing falls outside active district exclusions.
- Security: never expose `service_role` in client/Next.js env vars, preserve `is_admin` prohibition in `profiles` mutations, sanitize `next` redirects via `sanitizeNextPath()`, and never manually edit `auth.users` to bypass email confirmation.
- Accessibility / Modern Web Guidance: use native `<dialog>` (`showModal()`) for modal drawers/modals without redundant `role="dialog"` / `aria-modal`, keep `<dialog>` backdrop scroll contained, keep `<details>`/`<summary>` free of nested headings, and never dismiss modals on text-selection drags outside bounding box.
- Language: all visible UI copy, labels, errors, and badges in Spanish; clean institutional white/slate palette (`#F8FAFC` background, `#1E3A8A` navy accents, semantic emerald/amber/purple badges).

## Review Focus

1. **Computrabajo rating noise & Ate detection**: inputs like `location = "4,3"` or `"4,6"` must normalize cleanly (`'Lima Metropolitana'` unless district appears in `title`/`raw_description`), while `"Ate Vitarte"` or `"Carretera Central ... Ate"` in text normalizes `district = 'Ate'`, `lima_zone = 'Lima Este'`. Pinned in **Task 2**.
2. **Simultaneous Include + Exclude + `excl=none` reload persistence**: removing `[No: Ate ×]` or clicking `[Limpiar]` must write `excl=none` so `parseFiltersFromSearchParams(params, ['Ate'])` returns `excludedDistricts: []` across reloads and `onAuthStateChange`; omitting `excl` falls back to `profiles.excluded_districts` (or `['Ate']` for guests); when `dist=San Isidro`, `'Remoto'` stays visible under `drem=1` and hides under `drem=0`, while `'Lima Metropolitana'` stays hidden unless `dlim=1`. Pinned in **Task 3**.
3. **`role_level` vs `is_pre_professional` vs `ai=1` decoupling**: selecting `profesional` or `trainee_junior` returns matching jobs directly in both client filtering and `searchHistoricalJobs` without requiring `ai=1`, while `is_unrealistic_or_smoke = true` remains hidden until `ai=1`; default `preprofesional` includes `role_level = 'unknown' AND is_pre_professional = true` while excluding `role_level = 'unknown' AND is_pre_professional = false` unless `ai=1`. Pinned in **Task 3** and **Task 4**.
4. **Auth PKCE + `token_hash` + Open Redirect + Recovery**: `/auth/callback` handles both `?code=` and `?token_hash=&type=signup|email|recovery`, sanitizes malicious `next` (`/\evil.com`, `//evil.com`), maps `"Email not confirmed"` to actionable Spanish resend UI, and avoids breaking `upsertJobState`/`updateProfile` guest safety. Pinned in **Task 5**.
5. **Inline Card CRM + Optimistic Rollback + Drawer Drag-Dismiss Guard**: clicking a card CRM button (`stopPropagation`) updates state/tabs cleanly for signed-in users, reverts cleanly via `rollbackJobTransition` on server error, prompts `AuthModal` for guests, and `JobDetailDrawer` only light-dismisses when both `pointerdown` and `pointerup` occur outside dialog bounds (with `dialog.returnValue = ''` reset). Pinned in **Task 6** and **Task 7**.

---

### Task 1: Supabase Schema Migration & Cloud Validation

**Files:**
- Create: `supabase/migrations/202611140001_lima_filters_and_profile_exclusions.sql`
- Verify against: Supabase Cloud project `qirakbvvuhesjendiflu` (sa-east-1)

**Interfaces:**
- Produces SQL columns on `public.job_listings`: `district text`, `lima_zone text`, `category text`, `role_level text NOT NULL DEFAULT 'unknown' CHECK (role_level IN ('preprofesional', 'profesional', 'trainee_junior', 'unknown'))`, `english_required boolean NOT NULL DEFAULT false`, `english_level text CHECK (english_level IN ('basico', 'intermedio', 'avanzado') OR english_level IS NULL)`, `salary_min integer`, `salary_max integer`.
- Produces SQL B-tree indexes on `(district)`, `(lima_zone)`, `(category)`, `(role_level)`, `(english_required)`, `(salary_min)`.
- Produces SQL column on `public.profiles`: `excluded_districts text[] NOT NULL DEFAULT ARRAY['Ate']::text[]`.

- [ ] **Step 1: Author idempotent SQL migration file**

Write `supabase/migrations/202611140001_lima_filters_and_profile_exclusions.sql` adding the `job_listings` filter columns, `CHECK` constraints, B-tree indexes, and `profiles.excluded_districts` column (`DEFAULT ARRAY['Ate']::text[]`), using `ADD COLUMN IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`. Ensure no destructive changes to `search_tsv` or existing RLS policies.

- [ ] **Step 2: Apply migration to Cloud Supabase (`qirakbvvuhesjendiflu`)**

Run `supabase_mcp:apply_migration` with `name: "lima_filters_and_profile_exclusions"` and the migration SQL.

- [ ] **Step 3: Verify schema & run Supabase Advisors**

Run `supabase_mcp:execute_sql` to verify `information_schema.columns` on `job_listings` and `profiles`, confirming row count remains `271` in `job_listings` and existing `profiles` rows got `excluded_districts = '{Ate}'`.
Run `supabase_mcp:get_advisors` for `security` and `performance` to confirm zero new RLS/index regressions.

- [ ] **Step 4: Commit migration file**

```bash
git add supabase/migrations/202611140001_lima_filters_and_profile_exclusions.sql
git commit -m "feat(db): add normalized Lima filter columns and profile excluded_districts"
```

---

### Task 2: Pure Text Extractor (`jobNormalization.ts`) & Deterministic Backfill Generator

**Files:**
- Create: `apps/web/src/lib/domain/jobNormalization.ts`
- Create: `apps/web/scripts/generate-backfill-sql.ts`
- Test: `apps/web/tests/normalization.test.ts`

**Interfaces:**
- Consumes: raw listing fields `{ title: string; location?: string | null; modality?: string | null; salary?: string | null; raw_description?: string | null }`.
- Produces:
  - `LIMA_DISTRICTS: readonly string[]` (canonical ordered districts + `'Remoto'` + `'Lima Metropolitana'`)
  - `LIMA_ZONES_BY_DISTRICT: Record<string, string>`
  - `LIMA_CATEGORIES: readonly string[]` (`'Datos, BI & IA'`, `'Desarrollo & Software'`, `'Sistemas & TI'`, `'Administración, Banca & Finanzas'`, `'Ingeniería & Operaciones'`)
  - `RoleLevel = 'preprofesional' | 'profesional' | 'trainee_junior' | 'unknown'`
  - `EnglishLevel = 'basico' | 'intermedio' | 'avanzado'`
  - `NormalizedJobMetadata`: `{ district: string; lima_zone: string; category: string; role_level: RoleLevel; english_required: boolean; english_level: EnglishLevel | null; salary_min: number | null; salary_max: number | null }`
  - `normalizeJobMetadata(input: JobNormalizationInput): NormalizedJobMetadata`
  - `extractLimaDistrictAndZone(input: { title?: string | null; location?: string | null; modality?: string | null; raw_description?: string | null }): { district: string; lima_zone: string }`

- [ ] **Step 1: Write failing unit tests in `apps/web/tests/normalization.test.ts`**

Include explicit assertions covering **Review Focus #1**:
```ts
it('ignores Computrabajo rating noise like "4,3" and falls back cleanly', () => { ... });
it('detects Ate and Ate Vitarte from location or description -> Lima Este', () => { ... });
it('maps Surco / Cercado / Jesús María / Magdalena variants to canonical district and zone', () => { ... });
it('classifies Remoto when modality is Remoto or location indicates teletrabajo without Lima office', () => { ... });
it('extracts monthly PEN salary ranges (S/ 1,200 - 1,500) and rejects bogus hourly/year numbers', () => { ... });
it('detects english_required and highest accurate english_level (basico/intermedio/avanzado)', () => { ... });
it('classifies role_level purely from text without depending on job_evaluations', () => { ... });
it('categorizes Datos/BI/IA, Desarrollo/Software, Sistemas/TI, Admin/Banca and Ing/Operaciones', () => { ... });
```

- [ ] **Step 2: Run Vitest to confirm tests fail**

Run: `npm --prefix apps/web test -- tests/normalization.test.ts`
Expected: FAIL (`Cannot find module '../src/lib/domain/jobNormalization'`).

- [ ] **Step 3: Implement `apps/web/src/lib/domain/jobNormalization.ts`**

Pure deterministic accent-insensitive extractor:
- Strip rating patterns (`/^\d+([.,]\d+)?$/`, `"Lima, Perú"`, `"Lima, Lima"`) before district lookup.
- Ordered district patterns (prioritize `location`, then `title`, then explicit address/district mentions in `raw_description`, matching `"Santiago de Surco"`/`"Surco"`, `"Ate Vitarte"`/`"Ate"`, `"San Isidro"`, `"Miraflores"`, `"La Molina"`, `"San Borja"`, `"La Victoria"`, `"Lince"`, `"Jesús María"`, `"Magdalena del Mar"`, `"San Miguel"`, `"Pueblo Libre"`, `"Cercado de Lima"`/`"Lima Centro"`, `"Santa Anita"`, `"Chorrillos"`, `"Callao"`, `"Independencia"`, `"Los Olivos"`, `"Surquillo"`, `"Barranco"`, `"Lurín"`->`'Lurín / Balnearios'`). Fall back to `'Remoto'` if remote modality/text and no physical Lima district, else `'Lima Metropolitana'`.
- Extract `salary_min` / `salary_max` from explicit `salary` first, then explicit `"S/"` / `"soles"` / `"subvención"` mentions in `raw_description`, bounded to plausible monthly internship/junior PEN range `[800, 12000]`.
- Extract `role_level`, `english_required`, `english_level`, and `category` purely from listing fields.

- [ ] **Step 4: Run tests to verify green**

Run: `npm --prefix apps/web test -- tests/normalization.test.ts`
Expected: PASS (all cases pass).

- [ ] **Step 5: Implement `apps/web/scripts/generate-backfill-sql.ts` & validate against live seed/DB**

Node 24 TS script reading `.env.local` (`NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`) via `supabase-js` read-only `SELECT` across all `job_listings`, computing `normalizeJobMetadata()` per row, printing summary stats per `district`/`role_level`/`english_required`/`salary_min`, and emitting idempotent batched `UPDATE public.job_listings` SQL statements cleanly (`UPDATE ... FROM (VALUES ...) AS v(...) WHERE job_listings.id = v.id;`). Also support `--dry-run` and `--out` flags so CI/tests never mutate unintended state.

- [ ] **Step 6: Commit normalization module and backfill generator**

```bash
git add apps/web/src/lib/domain/jobNormalization.ts apps/web/scripts/generate-backfill-sql.ts apps/web/tests/normalization.test.ts
git commit -m "feat(domain): add deterministic Lima job normalization extractor and backfill generator"
```

---

### Task 3: Domain Types, URL Filter Serializer (`urlFilterParams.ts`) & Filter State (`workspaceState.ts`)

**Files:**
- Modify: `apps/web/src/lib/domain/types.ts:65-167`
- Create: `apps/web/src/lib/jobs/urlFilterParams.ts`
- Modify: `apps/web/src/lib/jobs/workspaceState.ts:1-284`
- Test: `apps/web/tests/urlFilters.test.ts`
- Modify/Extend: `apps/web/tests/workspace.test.ts`

**Interfaces:**
- Consumes: `jobNormalization.ts` (`LIMA_DISTRICTS`, `LIMA_ZONES_BY_DISTRICT`, `RoleLevel`, `EnglishLevel`, `normalizeJobMetadata`)
- Produces in `types.ts`:
  - Normalized fields on `JobSummary`: `district?: string | null`, `lima_zone?: string | null`, `category?: string | null`, `role_level?: RoleLevel | null`, `english_required?: boolean`, `english_level?: EnglishLevel | null`, `salary_min?: number | null`, `salary_max?: number | null`
  - `UserProfile.excluded_districts?: string[]`
  - `SOURCE_LABELS: Record<string, string>` (including `cvmatcher: 'CVMatcher'`)
- Produces in `workspaceState.ts`:
  - `SalaryFilterKey = 'any' | 'has_salary' | 'gte_1130' | 'gte_1500' | 'gte_2000'`
  - Extended `WorkspaceFilters`: keeps existing fields (`search`, `crmTab`, `maxAgeDays`, `minScore`, `modalities`, `sources`, `includeDiscardedAi`, `sortBy`) + adds `includedDistricts: string[]`, `excludedDistricts: string[]`, `keepRemoteWhenDistrictFiltered: boolean`, `includeLimaUnspecifiedDistrict: boolean`, `englishOnly: boolean`, `englishLevels: EnglishLevel[]`, `categories: string[]`, `roleLevels: Exclude<RoleLevel, 'unknown'>[]`, `salaryFilter: SalaryFilterKey`, plus `selectedJobId?: number | string | null`.
  - `DEFAULT_WORKSPACE_FILTERS` (`excludedDistricts: ['Ate']`, `keepRemoteWhenDistrictFiltered: true`, `includeLimaUnspecifiedDistrict: false`, `roleLevels: ['preprofesional']`, `maxAgeDays: 14`, `modalities: []`? Wait: check existing tests! Keep `modalities: ['Híbrido', 'Presencial', 'Remoto']` or keep `'No especificado'` compatible — preserve existing `workspace.test.ts` behavior where default includes `'No especificado'` & `null`!).
  - `computeDistrictFacetCounts(jobs, filters, now?): Record<string, number>` (computed over filtered pool *before* district inclusion filter so user sees real counts per district!)
  - `computeCategoryFacetCounts(jobs, filters, now?): Record<string, number>`
  - `isJobEligibleForRoleLevels(job, roleLevels, includeDiscardedAi): boolean`
  - Updated `filterAndSortWorkspaceJobs` supporting all Lima/English/Category/RoleLevel/Salary filters + existing tests.
- Produces in `urlFilterParams.ts`:
  - `parseFiltersFromSearchParams(params: URLSearchParams | Record<string, string | string[] | undefined>, profileExcludedDistricts?: string[] | null): { filters: WorkspaceFilters; hasExplicitExclParam: boolean; urlSelectedJobId: number | null }`
  - `serializeFiltersToSearchParams(filters: WorkspaceFilters, profileExcludedDistricts?: string[] | null, selectedJobId?: number | string | null): URLSearchParams`
  - `reconcileProfileExclusions(currentFilters: WorkspaceFilters, hasExplicitExclParam: boolean, profileExcludedDistricts: string[]): WorkspaceFilters`

- [ ] **Step 1: Write failing tests in `apps/web/tests/urlFilters.test.ts` and extend `apps/web/tests/workspace.test.ts`**

Cover **Review Focus #2 and #3**:
- `parseFiltersFromSearchParams`: defaults to `excludedDistricts: ['Ate']` for guests when `excl` absent; uses `profileExcludedDistricts` when passed and `excl` absent; returns `excludedDistricts: []` when `excl=none` (even if `profileExcludedDistricts` is `['Ate']`); round-trips `q`, `dist`, `excl`, `drem`, `dlim`, `eng`, `engl`, `time=all|1|3|7|14|30`, `cat`, `lvl`, `ai`, `mod`, `sal`, `src`, `score`, `tab`, `sort`, `job`.
- `filterAndSortWorkspaceJobs` & `isJobEligibleForRoleLevels`:
  - Default excludes `'Ate'` while allowing CRM-tracked `'Ate'` jobs inside their CRM tab (`to_apply`, `favorite`, `applied`, `interview`).
  - Simultaneous `includedDistricts: ['San Isidro']` + `excludedDistricts: ['Ate']`: retains `'Remoto'` when `keepRemoteWhenDistrictFiltered: true`, drops `'Remoto'` when `false`, drops `'Lima Metropolitana'` unless `includeLimaUnspecifiedDistrict: true`.
  - Selecting `roleLevels: ['trainee_junior']` or `['profesional']` returns those jobs even when `includeDiscardedAi: false`, while still hiding `is_unrealistic_or_smoke: true` unless `includeDiscardedAi: true`.
  - Default `roleLevels: ['preprofesional']` includes `role_level: 'unknown'` when `is_pre_professional: true`, excludes when `is_pre_professional: false` unless `ai=1`.
  - Salary filter (`has_salary`, `gte_1130`, `gte_1500`, `gte_2000`) & English level filter work accurately.

- [ ] **Step 2: Run Vitest to confirm new tests fail**

Run: `npm --prefix apps/web test -- tests/urlFilters.test.ts tests/workspace.test.ts`
Expected: FAIL.

- [ ] **Step 3: Update `types.ts`, create `urlFilterParams.ts`, and update `workspaceState.ts`**

Implement strictly typed filters, fallback normalization for mock fixtures lacking normalized fields (`resolveJobNormalizedMeta(job)`), `computeDistrictFacetCounts`, `computeCategoryFacetCounts`, and bidirectional URL serialization with explicit `excl=none` handling.

- [ ] **Step 4: Run Vitest to confirm all unit tests pass (new + existing 83)**

Run: `npm --prefix apps/web test`
Expected: PASS (0 failures across all test files).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/domain/types.ts apps/web/src/lib/jobs/urlFilterParams.ts apps/web/src/lib/jobs/workspaceState.ts apps/web/tests/urlFilters.test.ts apps/web/tests/workspace.test.ts
git commit -m "feat(filters): add Lima district URL params and role-level filter engine"
```

---

### Task 4: Server Queries, Historical Search Filters, Lazy `getJobDetail` & Profile Exclusions

**Files:**
- Modify: `apps/web/src/lib/supabase/queries.ts:1-489`
- Modify: `apps/web/src/actions/jobs.ts:1-244`
- Modify: `apps/web/src/actions/schemas.ts:1-28`
- Modify: `apps/web/src/actions/profile.ts:1-92`
- Modify: `apps/web/src/lib/profile/profileFormHelpers.ts:1-202`
- Modify: `apps/web/src/components/profile/ProfileForm.tsx:220-489`
- Modify/Extend: `apps/web/tests/actions.test.ts`, `apps/web/tests/pipelineProfile.test.ts`

**Interfaces:**
- Consumes: `urlFilterParams.ts` / `workspaceState.ts` (`RoleLevel`, `EnglishLevel`, `SalaryFilterKey`), `types.ts`
- Produces in `queries.ts`:
  - `LIGHTWEIGHT_JOB_SELECT` & `JOB_WITH_EVALUATION_SELECT` updated with `district, lima_zone, category, role_level, english_required, english_level, salary_min, salary_max` (NO `raw_description`, NO `reasoning_chain`)
  - `mapRowToJobSummary(row, userState?)` mapping those new fields cleanly
  - `getInitialRadarData()` returning `{ jobs, user, profileExcludedDistricts, lastUpdated, isConfigured }`
  - `getUserProfile()` returning `UserProfile` including `excluded_districts`
  - Extended `HistoricalSearchParams` and `buildHistoricalSearchFilters()` handling `includedDistricts`, `excludedDistricts`, `keepRemoteWhenDistrictFiltered`, `includeLimaUnspecifiedDistrict`, `categories`, `roleLevels`, `englishOnly`, `englishLevels`, `salaryFilter`
- Produces in `actions/jobs.ts`:
  - `getJobDetail(listingId: number): Promise<{ rawDescription: string | null; reasoningChain: ReasoningChain | null; error?: string }>` (keep `getJobDescription` exporting wrapper for backwards safety)
  - Updated `searchHistoricalJobs(params)` applying SQL filters on normalized `job_listings` columns and decoupled `roleLevels` / `is_unrealistic_or_smoke`
- Produces in `actions/schemas.ts` & `actions/profile.ts`:
  - `excluded_districts?: string[]` accepted and persisted cleanly; `is_admin` still strictly forbidden

- [ ] **Step 1: Write failing tests in `apps/web/tests/actions.test.ts` and `apps/web/tests/pipelineProfile.test.ts`**

Assert:
- `buildHistoricalSearchFilters` parses `includedDistricts`, `excludedDistricts`, `keepRemoteWhenDistrictFiltered`, `includeLimaUnspecifiedDistrict`, `roleLevels`, `categories`, `englishOnly`, `englishLevels`, `salaryFilter`.
- `profileUpdateSchema` & `validateProfileUpdatePayload` accept `excluded_districts: ['Ate', 'Santa Anita']`, reject overly long lists, and still reject `is_admin`.
- `toProfileFormState` / `toProfileUpdateInput` default `excluded_districts` to `['Ate']` when null/absent on empty profile and preserve edits cleanly.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm --prefix apps/web test -- tests/actions.test.ts tests/pipelineProfile.test.ts`
Expected: FAIL.

- [ ] **Step 3: Update `queries.ts`, `actions/jobs.ts`, `actions/schemas.ts`, `actions/profile.ts`, `profileFormHelpers.ts`, and `ProfileForm.tsx`**

- Update `queries.ts` selects + `getInitialRadarData` + `getUserProfile` + `buildHistoricalSearchFilters`.
- Update `actions/jobs.ts`: add `getJobDetail` fetching `raw_description` and shared `job_evaluations(reasoning_chain)` by `listing_id`, update `HISTORICAL_SEARCH_SELECT` and `searchHistoricalJobs` Supabase filters (matching **Review Focus #3** exact SQL predicates: e.g. for `roleLevels = ['preprofesional']` + `!includeDiscardedAi`, use `.eq('job_evaluations.is_unrealistic_or_smoke', false).or('role_level.eq.preprofesional,and(role_level.eq.unknown,job_evaluations.is_pre_professional.eq.true)')` — verify PostgREST embedded filter syntax or safely filter/query via Postgres SQL/clean predicates!). *(Note for executor: verify PostgREST cross-table `.or()` syntax vs fetching/filtering carefully when `job_evaluations` inner join is used — if PostgREST cross-resource `.or()` isn't supported across foreign tables in `.or()`, fetch matching `role_level IN ('preprofesional', 'unknown')` + `.eq('job_evaluations.is_unrealistic_or_smoke', false)` and refine `role_level === 'unknown' && !is_pre_professional` cleanly on server right before returning, or handle via `is_unrealistic_or_smoke` SQL filter + level `in`! This avoids runtime PostgREST syntax errors while staying index-backed!)*
- Update `ProfileForm.tsx` with a dedicated chip selector section **"Distritos a ocultar por defecto (Exclusiones del Radar)"** (pre-loaded with `'Ate'`, allowing adding/removing districts).

- [ ] **Step 4: Run Vitest + Typecheck**

Run: `npm --prefix apps/web test; npm --prefix apps/web run typecheck`
Expected: PASS on all tests and TypeScript check.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/supabase/queries.ts apps/web/src/actions/jobs.ts apps/web/src/actions/schemas.ts apps/web/src/actions/profile.ts apps/web/src/lib/profile/profileFormHelpers.ts apps/web/src/components/profile/ProfileForm.tsx apps/web/tests/actions.test.ts apps/web/tests/pipelineProfile.test.ts
git commit -m "feat(server): wire normalized Lima queries, lazy getJobDetail, and profile district exclusions"
```

---

### Task 5: End-to-End Reliable Login, Auth Helpers, Callback Route & Session Sync

**Files:**
- Create: `apps/web/src/lib/auth/authHelpers.ts`
- Modify: `apps/web/src/app/auth/callback/route.ts:1-35`
- Modify: `apps/web/src/app/login/page.tsx:1-250`
- Modify: `apps/web/src/components/auth/AuthModal.tsx:1-220`
- Create: `apps/web/src/components/auth/AuthSessionSync.tsx`
- Test: `apps/web/tests/auth.test.ts`

**Interfaces:**
- Consumes: `sanitizeNextPath` from `apps/web/src/lib/auth/safeRedirect.ts`
- Produces in `authHelpers.ts`:
  - `buildCallbackRedirectUrl(origin: string, nextPath?: string | null): string`
  - `buildPasswordRecoveryUrl(origin: string): string`
  - `mapSupabaseAuthErrorToSpanish(rawMessage?: string | null): { message: string; code: 'EMAIL_NOT_CONFIRMED' | 'INVALID_CREDENTIALS' | 'RATE_LIMITED' | 'OAUTH_DISABLED' | 'GENERIC' }`
  - `parseCallbackParams(searchParams: URLSearchParams): { mode: 'pkce' | 'otp' | 'error' | 'empty'; code: string | null; tokenHash: string | null; type: EmailOtpType | null; next: string; errorMessage: string | null }`

- [ ] **Step 1: Write failing tests in `apps/web/tests/auth.test.ts`**

Cover **Review Focus #4**:
- `buildCallbackRedirectUrl` produces `${origin}/auth/callback?next=%2F...` using `sanitizeNextPath`.
- `mapSupabaseAuthErrorToSpanish` classifies `'Email not confirmed'` -> `'EMAIL_NOT_CONFIRMED'`, `'Invalid login credentials'` -> `'INVALID_CREDENTIALS'`, `'rate limit'` -> `'RATE_LIMITED'`, `'provider is not enabled'` -> `'OAUTH_DISABLED'`.
- `parseCallbackParams` prioritizes `error_description`, supports PKCE `code`, supports OTP `token_hash` + `type` (`email`, `signup`, `recovery`, `magiclink`), and sanitizes unsafe `next` paths like `/\\evil.com`.

- [ ] **Step 2: Run Vitest to confirm tests fail**

Run: `npm --prefix apps/web test -- tests/auth.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `authHelpers.ts`, update `/auth/callback/route.ts`, `/login/page.tsx`, `AuthModal.tsx`, and create `AuthSessionSync.tsx`**

Key details:
- `/auth/callback/route.ts`: handle `code` via `supabase.auth.exchangeCodeForSession(code)` AND `token_hash` + `type` via `supabase.auth.verifyOtp({ type, token_hash })`, redirecting to `next` on success or `/login?error=...` cleanly on failure.
- `/login/page.tsx` & `AuthModal.tsx`:
  - Pass `options: { emailRedirectTo: buildCallbackRedirectUrl(window.location.origin, next), data: { full_name } }` on `signUp()`.
  - Handle `"Email not confirmed"` with inline **"Reenviar correo de confirmación"** button (`supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo } })`).
  - Add `"¿Olvidaste tu contraseña?"` recovery mode (`resetPasswordForEmail`) and `mode=update-password` (`updateUser({ password })`) in `/login/page.tsx`.
  - Use native `<dialog>` (`showModal()`, light-dismiss pointerdown/pointerup fallback, no `role="dialog"` / `aria-modal`) inside `AuthModal.tsx`.
- `AuthSessionSync.tsx`: subtle client listener mounted in root layout or shell using `supabase.auth.onAuthStateChange` (`SIGNED_IN`, `SIGNED_OUT`, `USER_UPDATED`) calling `router.refresh()`.

- [ ] **Step 4: Run Vitest + Typecheck**

Run: `npm --prefix apps/web test; npm --prefix apps/web run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/auth/authHelpers.ts apps/web/src/app/auth/callback/route.ts apps/web/src/app/login/page.tsx apps/web/src/components/auth/AuthModal.tsx apps/web/src/components/auth/AuthSessionSync.tsx apps/web/tests/auth.test.ts
git commit -m "feat(auth): support emailRedirectTo, token_hash callback, resend confirmation, password recovery, and session sync"
```

---

### Task 6: Unified `AppShell` Sidebar, Vertical `FilterSidebar` & Enriched Inline-CRM `JobCard`

**Files:**
- Create: `apps/web/src/components/layout/AppShell.tsx`
- Create: `apps/web/src/components/jobs/FilterSidebar.tsx`
- Modify: `apps/web/src/components/jobs/JobCard.tsx:1-205`
- Modify: `apps/web/src/app/globals.css:1-45`
- Modify: `apps/web/src/app/layout.tsx:1-43`
- Modify: `apps/web/src/app/pipeline/page.tsx:1-74`
- Modify: `apps/web/src/app/profile/page.tsx:1-71`
- Modify/Clean: `apps/web/src/components/layout/Navbar.tsx` (re-export `AppShell` or retire horizontal header cleanly if unused; check imports first)

**Interfaces:**
- Consumes: `WorkspaceFilters`, `DEFAULT_WORKSPACE_FILTERS`, `LIMA_DISTRICTS`, `LIMA_CATEGORIES`, `CRM_STATUS_META`, `SOURCE_LABELS`, `JobSummary`, `CrmStatus`
- Produces:
  - `AppShell({ user, pipelineCounts?, lastUpdated?, mobileFilterTrigger?, children })`: fixed desktop `232px` left sidebar (`Radar`, `Mis Postulaciones` with active count badge, `Mi Perfil`, `aria-current="page"`, bottom user account panel + `Ingresar`/`Salir`), mobile `< 1024px` header bar with native `<dialog>` drawer navigation per `navigation-drawer` guidance + `mobileFilterTrigger` slot.
  - `FilterSidebar({ filters, onChange, districtCounts, categoryCounts, totalCount, correctedQuery, didYouMean, profileExcludedDistricts, onResetToDefaults, onClearAll, className? })`: scrollable `296px` vertical panel matching CVMatcher clarity with Lima specialization:
    - Search box + token chips (`×`) + `"¿Quisiste decir?"` clickable button
    - Active filter chips summary (`[No: Ate ×]`, `[San Isidro ×]`, etc.) + **`[Limpiar]`** button + optional **`Restaurar perfil`** link
    - **Distritos de Lima**: quick `[✓ Excluir Ate (N)]` toggle, search input inside districts list, checkboxes to include districts (sorted with top poles first + live counts), toggleable/chip exclusion badges (`No: ...`), `+ Incluir Remoto` (`drem`) & `+ Incluir Lima sin distrito` (`dlim`)
    - **Requiere inglés**: accessible switch `<input type="checkbox" {...({ switch: '' } as Record<string, unknown>)} />` + optional level pills (`Básico`, `Intermedio`, `Avanzado`) when enabled
    - Adjacent non-exclusive `<details>` / `<summary>` accordions (NO headings inside `<summary>`!) for: `Fecha de publicación` (`24h`, `3d`, `7d`, `14d`, `30d`, `Histórico DB`), `Categoría`, `Nivel laboral` (`Preprofesional`, `Profesional / Egresado`, `Trainee / Junior`, + `Incluir ofertas descartadas por IA`), `Modalidad`, `Rango salarial (S/)`, `Portal de origen` (5 sources incl. `CVMatcher`), and `Afinidad IA mínima`.
  - `JobCard({ job, isSelected, onSelect, onQuickCrmChange, isPendingCrm? })`: displays CompanyMonogram, title, company + verified/agency pill, portal source pill (`CVMatcher`, `Bumeran`, etc.), `district · lima_zone · modality · salary · relativeDate`, up to `4` skill pills + `Inglés` pill + `+N más`, AI match score ring/badge, AND bottom 1-click CRM action bar (`Por postular`, `Destacar ⭐`, `Postulado`, `Entrevista`, `Descartar`) calling `e.stopPropagation()` + `onQuickCrmChange(job, status)`.

- [ ] **Step 1: Add Modern Web CSS primitives to `apps/web/src/app/globals.css` & mount `AuthSessionSync` in `layout.tsx`**

Include styles for `<dialog>` right-side drawer + navigation drawer (scoping layout to `dialog[open]`), subtle `<details>` disclosure marker rotation (`summary::-webkit-details-marker { display: none }`, `list-style: none`), and styled `<input type="checkbox" switch>` progressive toggle track with `@media (prefers-reduced-motion: no-preference)`.

- [ ] **Step 2: Build `AppShell.tsx` and update `/pipeline/page.tsx` and `/profile/page.tsx`**

Verify navigation links use `aria-current="page"`, accessible `<dialog>` mobile menu drawer (closed on navigation, `Esc`, and backdrop click outside bounding rect), and `Salir` calls `supabase.auth.signOut()` + `router.refresh()`.

- [ ] **Step 3: Build `FilterSidebar.tsx` and update `JobCard.tsx`**

Keep components modular, accessible (proper `<label>`/`id`, `button type="button"`, no interactive button nested inside clickable card wrapper if avoidable — use card heading button/overlay trigger or separate clickable body vs CRM action toolbar with `e.stopPropagation()`).

- [ ] **Step 4: Run `npm --prefix apps/web run typecheck` and `npm --prefix apps/web run lint`**

Expected: PASS with zero TypeScript or ESLint errors.

- [ ] **Step 5: Commit UI shell, sidebar filters, and inline CRM cards**

```bash
git add apps/web/src/app/globals.css apps/web/src/app/layout.tsx apps/web/src/components/layout/AppShell.tsx apps/web/src/components/jobs/FilterSidebar.tsx apps/web/src/components/jobs/JobCard.tsx apps/web/src/app/pipeline/page.tsx apps/web/src/app/profile/page.tsx
git commit -m "feat(ui): add AppShell left navigation, vertical Lima FilterSidebar, and inline CRM cards"
```

---

### Task 7: Slide-Over `JobDetailDrawer.tsx`, Rewired `JobsWorkspace.tsx` & `/` SSR URL Hydration

**Files:**
- Create: `apps/web/src/components/jobs/JobDetailDrawer.tsx`
- Modify: `apps/web/src/components/jobs/JobsWorkspace.tsx:1-610`
- Modify: `apps/web/src/app/page.tsx:1-32`
- Modify/Clean: `apps/web/src/components/jobs/FilterBar.tsx` & `apps/web/src/components/jobs/JobDetail.tsx` (deprecate/remove or wrap cleanly after migrating all references)

**Interfaces:**
- Consumes: `AppShell`, `FilterSidebar`, `JobCard`, `AuthModal`, `urlFilterParams.ts`, `workspaceState.ts`, `getJobDetail`, `searchHistoricalJobs`, `upsertJobState`
- Produces:
  - `JobDetailDrawer({ job, rawDescription, reasoningChain, isLoadingDetail, onClose, onPrevJob, onNextJob, hasPrev, hasNext, onStatusChange, onSaveNotes })`:
    - Native `<dialog>` opened via `showModal()` whenever `job !== null`, closed cleanly via `X` button, `Esc` (`cancel` event synced to React state), and backdrop click fallback (`pointerdown` + `pointerup` outside `getBoundingClientRect()`). Resets `dialog.returnValue = ''` on close. No `role="dialog"` / `aria-modal`.
    - Renders header (CompanyMonogram, title, company, source URL button, Prev/Next buttons, Close button), 5-state CRM status toolbar, metadata badges (`district`, `lima_zone`, `category`, `role_level`, `modality`, `salary`, `english_required`/`english_level`), always-visible AI summary (`verdict_summary` + matching/missing skills + scores), collapsible native `<details>` **"Ver análisis detallado"** displaying the 5 `ReasoningChain` fields (`academic_eligibility`, `experience_requirements`, `tech_stack_overlap`, `gaps_and_risks`, `score_rationale`), personal notes form, and `rawDescription` block.
  - Updated `JobsWorkspace`:
    - Hydrates `WorkspaceFilters` on mount/SSR from `initialSearchParams` + `profileExcludedDistricts` via `parseFiltersFromSearchParams`.
    - Keeps URL synced via `window.history.replaceState` (`serializeFiltersToSearchParams`), triggers `searchHistoricalJobs` with all Lima/English/Category/RoleLevel/Salary parameters when `maxAgeDays === null`, handles `onQuickCrmChange(job, status)` optimistically with `rollbackJobTransition` and guest `AuthModal`, opens `FilterSidebar` inside native `<dialog>` on `< 1024px` (`"Filtros (N)"` button), and reconciles `profileExcludedDistricts` when signed in cleanly (`excl=none` respected!).
  - Updated `app/page.tsx`: accepts `searchParams: Promise<Record<string, string | string[] | undefined>>`, loads `getInitialRadarData()`, wraps `<JobsWorkspace>` cleanly with `AppShell` (or lets `JobsWorkspace` integrate seamlessly inside `AppShell` slot cleanly!).

- [ ] **Step 1: Build `JobDetailDrawer.tsx` following native `<dialog>` & collapsible `<details>` best practices**

Double-check **Review Focus #5**: pointerdown + pointerup coordinate check outside `getBoundingClientRect()`, `dialog.returnValue = ''`, `cancel` event synchronization with `onClose()`, and NO headings inside `<summary>` of `"Ver análisis detallado"`.

- [ ] **Step 2: Rewire `JobsWorkspace.tsx` and `app/page.tsx`**

Ensure:
- Desktop renders 2-column inner workspace inside `AppShell`'s `<main>` (`FilterSidebar` `296px` sticky left + CRM tabs / sort bar / `JobCard` feed `1fr`), keeping the feed full-width until clicking a card opens `JobDetailDrawer` on the right!
- Clicking `Limpiar` sets `excl=none` (via `onClearAll`) so `Ate` shows up when requested, while `Restaurar perfil` restores `profileExcludedDistricts ?? ['Ate']`.
- Check all imports across `apps/web/src` and remove unused legacy `FilterBar.tsx` / `JobDetail.tsx` / `Navbar.tsx` if nothing imports them (keeps repo clean and lint-free!).

- [ ] **Step 3: Run tests, typecheck, lint & production build**

Run:
```powershell
npm --prefix apps/web test; if ($?) { npm --prefix apps/web run typecheck }; if ($?) { npm --prefix apps/web run lint }; if ($?) { npm --prefix apps/web run build }
```
Expected: ALL pass (`test`, `typecheck`, `lint`, `build`) with 0 errors and 0 warnings.

- [ ] **Step 4: Commit complete Phase 1 UI workspace**

```bash
git add apps/web/src
git commit -m "feat(web): launch CVMatcher-inspired Lima portal layout with drawer and URL-synced filters"
```

---

### Task 8: Live Database Backfill Execution, Interactive Browser QA & Whole-Branch Review

**Files:**
- Run script against live Supabase (`qirakbvvuhesjendiflu`) via `generate-backfill-sql.ts` + `supabase_mcp:execute_sql`
- Verify in live Next.js browser session

- [ ] **Step 1: Generate deterministic backfill SQL from live `job_listings` (271 rows) and inspect summary stats**

Run `node apps/web/scripts/generate-backfill-sql.ts --out /tmp/backfill_lima.sql` (or scratch path under artifacts `.gemini` -> `/scratch/backfill_lima.sql` — never commit temp artifacts to workspace!). Inspect district, category, role_level, english_required, and salary_min counts, ensuring 0 rows have numeric garbage like `'4,3'`.

- [ ] **Step 2: Apply backfill SQL batches to Cloud Supabase via `supabase_mcp:execute_sql` and verify live counts**

Run `SELECT district, COUNT(*) FROM public.job_listings GROUP BY district ORDER BY COUNT(*) DESC;` and `SELECT role_level, COUNT(*) FROM public.job_listings GROUP BY role_level;` on `qirakbvvuhesjendiflu` confirming all 271 rows are populated (`district IS NOT NULL`, `role_level` properly distributed, `Ate` isolated accurately).

- [ ] **Step 3: Start Next.js dev server and verify live UI via `browser` subagent**

Launch `npm --prefix apps/web run dev` (`IsDaemon: true`), dispatch `browser` subagent against `http://localhost:3000`:
1. Confirm 3-zone desktop layout renders cleanly (`AppShell` sidebar + `FilterSidebar` + feed cards, with `[No: Ate ×]` active and zero Ate cards shown by default).
2. Filter `San Isidro`, `Requiere inglés`, `Trainee / Junior`, and `Histórico DB` -> verify URL query updates and results match cleanly.
3. Click inline CRM button `Postulado` as guest -> verify `AuthModal` opens smoothly cleanly with Spanish copy, close via `Esc`.
4. Click a job card -> verify `JobDetailDrawer` opens, raw description loads, expandable `"Ver análisis detallado"` reveals 5 steps, drag text inside drawer does not dismiss, clicking backdrop / `Esc` closes cleanly.
5. Check `/login` page -> verify tabs (`Iniciar sesión` / `Crear cuenta`), `"¿Olvidaste tu contraseña?"` recovery mode, no broken assets or console errors.
6. Check responsive `390px` viewport -> verify compact header + `"Filtros (N)"` drawer open/close cleanly without horizontal overflow.

- [ ] **Step 4: Dispatch fresh Whole-Branch Reviewer & fix any findings before final report**

Run `npm --prefix apps/web test; npm --prefix apps/web run typecheck; npm --prefix apps/web run lint; npm --prefix apps/web run build` after any final adjustment, report verified deliverables + exact Supabase Dashboard Auth checklist to user in Spanish.
