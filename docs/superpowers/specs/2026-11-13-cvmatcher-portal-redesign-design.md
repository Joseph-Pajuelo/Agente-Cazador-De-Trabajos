# Diseño: Rediseño Portal Lima + Filtros Minuciosos + CRM en Tarjeta + Login Confiable

**Fecha:** 2026-11-13
**Rama:** `feat/web-platform-migration`
**Enfoque elegido:** Enfoque C — Arquitectura Full-Stack en 2 fases (Fase 1: Base de datos + backfill de catálogo + Portal rediseñado con filtros de Lima y Login operativo; Fase 2: Alineación del pipeline Python). Este documento especifica completamente la **Fase 1** y fija el contrato de datos que consumirá la **Fase 2**.

---

## 1. Propósito y Motivación

Job Hunter nació para resolver la búsqueda real de prácticas preprofesionales en Lima Metropolitana para un estudiante que vive en **Ate Vitarte**:

- **Lo que aporta la referencia visual (CVMatcher)**: barra lateral de navegación fija, columna vertical de filtros minuciosos siempre visible y sincronizada con la URL, y tarjetas limpias que muestran logo, empresa, ubicación, fecha, stack de habilidades, portal de origen y porcentaje de afinidad.
- **Lo que CVMatcher no resuelve y Job Hunter sí**:
  1. **Seguimiento CRM al postular**: CVMatcher no permite guardar estados personales (`Por postular`, `Destacada`, `Postulado`, `En entrevista`, `Descartada`) ni notas por vacante. En Job Hunter ese flujo es central y debe poderse activar con un clic **directamente desde cada tarjeta**.
  2. **Especialización en Lima Metropolitana con exclusión de distritos**: CVMatcher filtra por *Países*; Job Hunter es exclusivo para **Lima (Perú)** y necesita filtrar por **distritos y zonas de Lima**, permitiendo **excluir distritos** (en especial **Ate**, donde vive el candidato y donde anteriormente el motor asignaba puntaje `1.0` en `candidate_profile.py` y `matcher.py` en lugar de permitir excluirlo y priorizar polos corporativos como San Isidro, Miraflores, Surco, San Borja o La Molina).
  3. **Login operativo de punta a punta**: actualmente existen `2` registros en `auth.users` con `1` sin confirmar (`email_confirmed_at IS NULL`), `signUp()` no envía `emailRedirectTo`, faltan flujos de reenvío de confirmación y recuperación de clave, y el callback solo procesa PKCE `?code=` y no enlaces `token_hash`.

---

## 2. Objetivos, No-Objetivos y Anti-Objetivos

### Objetivos (Fase 1)
1. **Rediseño de pantalla en 3 zonas** (`AppShellSidebar` + `FilterSidebar` + Feed de `JobCard`s + Drawer de detalle `JobDetailDrawer`) sin romper `/pipeline`, `/profile` ni el acceso público para visitantes en `/`.
2. **Filtros minuciosos especializados en Lima sincronizados en URL** (`URLSearchParams`): búsqueda con chips, **Distrito / Zona de Lima** con listas independientes de **Inclusión** (`dist`) y **Exclusión** (`excl`, con `Ate` excluido por defecto desde el primer ingreso —incluso sin sesión— y sincronizado con `profiles.excluded_districts` al iniciar sesión) + control para conservar `Remoto` (`drem`) o incluir `Lima sin especificar distrito` (`dlim`), **Requiere inglés** (+ nivel), **Fecha de publicación** (`24h`, `3d`, `7d`, `14d`, `30d`, `Histórico DB`), **Categoría**, **Nivel laboral** (`Preprofesional`, `Profesional / Egresado`, `Trainee / Junior`), **Modalidad**, **Rango salarial (S/)**, **Portal origen** (los 5 portales incluyendo `cvmatcher`) y **Afinidad IA mínima**.
3. **Acciones CRM directas en tarjeta**: marcar `Por postular`, `Destacada`, `Postulado`, `En entrevista` o `Descartada` desde cada tarjeta con actualización optimista en `user_job_states`, abriendo `AuthModal` si el visitante aún no inicia sesión.
4. **Esquema y backfill de las 271 vacantes actuales**: agregar columnas normalizadas en `public.job_listings` y `excluded_districts` en `public.profiles`, limpiando ruido de ubicación (p. ej. `"4,3"` de Computrabajo) y poblando distrito, zona, categoría, nivel, inglés y salario mínimo/máximo sobre las 271 filas existentes.
5. **Login y gestión de sesión confiables**: envío de `emailRedirectTo`, soporte de `token_hash` y `recovery` en `/auth/callback`, mensajes claros en español cuando falta confirmar correo con botón de **Reenviar confirmación**, flujo de **"¿Olvidaste tu contraseña?"**, escucha reactiva `onAuthStateChange` y guía exacta para ajustes en el panel de Supabase.

### No-Objetivos (fuera de Fase 1; quedan para Fase 2 o descartados)
- No modificar todavía los 5 adapters ni `matcher.py` de `services/pipeline/` en esta ola (Fase 2).
- No incorporar módulos de créditos, planes pagos, referidos ni beneficios promocionales vistos en CVMatcher.
- No agregar filtros multi-país ni usar ubicación GPS del navegador.
- No inventar salarios o distritos cuando el texto no los menciona (`null` / `'Lima Metropolitana'` honestos).

### Anti-Objetivos
- Descargar `raw_description` de cientos de ofertas en la carga inicial de `/` solo para filtrar en cliente (degradaría la velocidad).
- Ocultar al usuario por qué una oferta de Ate no aparece: toda exclusión activa debe verse como chip removible en el panel de filtros y URL.
- Perder las vacantes rastreadas por el usuario en `/pipeline` al cambiar filtros o al iniciar sesión.

---

## 3. Enfoques Considerados

1. **Enfoque A — Solo rediseño Frontend sobre columnas actuales**: rápido en UI, pero obliga a deducir salario, inglés y distritos ocultos en cliente sin `raw_description` en el feed inicial, manteniendo filtros imprecisos y sin resolver `"4,3"` ni `excluded_districts` en perfil.
2. **Enfoque B — Reestructura Full-Stack atómica en 1 ola (BD + Pipeline Python + UI + Auth)**: mezcla refactors de Python/scraping con la reconstrucción visual y Auth en una sola entrega extensa antes de poder validar la UI y el login.
3. **Enfoque C — Arquitectura Full-Stack en 2 fases ordenadas *(Elegido)***: entrega primero en Fase 1 la migración SQL + backfill de las 271 vacantes, toda la nueva UI/filtros/CRM en tarjeta y el Login operativo; y deja Fase 2 para alinear la ingesta Python con las nuevas columnas.

---

## 4. Arquitectura Detallada (Fase 1)

### 4.1 Layout de Pantalla y Navegación

```text
Desktop (>= 1024px)
+--------------------+---------------------------+----------------------------------------------+
| Sidebar Izq (232px)| Panel Filtros (296px)     | Feed Principal (1fr)                         |
|--------------------|---------------------------|----------------------------------------------|
| [JH] Job Hunter    | Filtros        [Limpiar]  | Activas 137 | Por postular | ⭐ | Postuladas |
| Radar IA · Lima    | [🔍 Cargo, empresa, tech] | Mostrando X vacantes · [Ordenar ▾]           |
|                    | Chips: [python ×][No:Ate×]|----------------------------------------------|
| ● Radar            |                           | +------------------------------------------+ |
| ○ Mis Postulaciones| 📍 Distritos de Lima      | | [Logo] Título + Empresa        [Bumeran] | |
| ○ Mi Perfil        |   Excluir: [✓ Ate (12)]   | |        San Isidro · Hace 2d · S/1,500    | |
|                    |   Incluir distritos:      | |        [Python][SQL][Power BI][Inglés]   | |
|                    |   ☑ San Isidro (24)       | |                          ( 85% match )   | |
|                    |   ☐ Miraflores (5) ...    | |------------------------------------------| |
|                    |   [✓] Incluir Remoto      | | [📋 Guardar] [⭐] [🚀 Postulado] [✕ Desc] | |
|                    |   [ ] + Lima sin distrito | +------------------------------------------+ |
|--------------------| 🎚 Requiere inglés [ ○ ]  |                                              |
| [JP] Joseph        | ▾ Fecha Publicación (1)   | Al hacer clic en una tarjeta ->              |
| Mi cuenta · Salir  | ▾ Categoría               | Slide-over Drawer derecho (`JobDetailDrawer`)|
| (o [Ingresar])     | ▾ Nivel Laboral (1)       | con descripción, resumen IA + acordeón CoT y |
|                    |                           | notas CRM                                    |
+--------------------+---------------------------+----------------------------------------------+
```

- **Navegación unificada (`AppShell.tsx`)**: reemplaza el header superior actual en páginas autenticadas y públicas (`/`, `/pipeline`, `/profile`). En pantallas `< 1024px` (`md`/`sm`), usa header compacto + botón de menú para el sidebar y botón `"Filtros (N)"` para abrir `FilterSidebar` como drawer lateral sin apilar 10 acordeones encima de la primera vacante.
- **Detalle en Drawer (`JobDetailDrawer.tsx`)**: al seleccionar una vacante desde el feed, abre un panel deslizable derecho con cierre por `Esc`/botón `X`, navegación anterior/siguiente y carga bajo demanda mediante `getJobDetail(listingId)` (evolución de `getJobDescription`) que devuelve `{ rawDescription, reasoningChain, error }` sin engrosar la carga inicial SSR de 600 filas. Muestra siempre el resumen ejecutivo (`verdict_summary`), puntajes y habilidades coincidentes/faltantes, y coloca los 5 pasos del análisis IA (`reasoning_chain`: `role_check`, `experience_check`, `stack_check`, `logistics_check`, `verdict`) dentro de un bloque colapsable **"Ver análisis detallado"**.

### 4.2 Base de Datos y Backfill (`supabase/migrations/202611140001_lima_filters_and_profile_exclusions.sql`)

#### Nuevas columnas en `public.job_listings` (todas idempotentes y con valores seguros)
- `district text`: distrito normalizado de Lima o valor canónico (`'San Isidro'`, `'Miraflores'`, `'Santiago de Surco'`, `'La Molina'`, `'San Borja'`, `'Ate'`, `'La Victoria'`, `'Lince'`, `'Jesús María'`, `'Magdalena del Mar'`, `'San Miguel'`, `'Pueblo Libre'`, `'Lima Centro'`, `'Santa Anita'`, `'Chorrillos'`, `'Callao'`, `'Independencia'`, `'Los Olivos'`, `'Surquillo'`, `'Lurín / Balnearios'`, `'Remoto'`, `'Lima Metropolitana'`). Limpia valores basura como `'4,1'`–`'4,6'`.
- `lima_zone text`: macro-zona (`'Lima Moderna'`, `'Lima Centro'`, `'Lima Este'`, `'Lima Norte'`, `'Lima Sur'`, `'Callao'`, `'Remoto'`, `'Lima Metropolitana'`).
- `category text`: área funcional normalizada (`'Datos, BI & IA'`, `'Desarrollo & Software'`, `'Sistemas & TI'`, `'Administración, Banca & Finanzas'`, `'Ingeniería & Operaciones'`).
- `role_level text NOT NULL DEFAULT 'unknown' CHECK (role_level IN ('preprofesional', 'profesional', 'trainee_junior', 'unknown'))`.
- `english_required boolean NOT NULL DEFAULT false` y `english_level text CHECK (english_level IN ('basico', 'intermedio', 'avanzado') OR english_level IS NULL)`.
- `salary_min integer` y `salary_max integer` (en soles mensuales PEN; `NULL` si no consta cifra confiable).
- Índices B-tree en `(district)`, `(lima_zone)`, `(category)`, `(role_level)`, `(english_required)` y `(salary_min)` para mantener las consultas históricas de `searchHistoricalJobs` en Postgres sin escaneo de `raw_description`.
- Se conserva `search_tsv` existente sin reconstrucción costosa en la migración.

#### Nueva columna en `public.profiles`
- `excluded_districts text[] NOT NULL DEFAULT ARRAY['Ate']::text[]`: distritos que el usuario desea ocultar de forma predeterminada en el radar.
- Si el usuario ya tenía una fila en `profiles` con `excluded_districts` por defecto, se inicializa en `['Ate']` y puede editarse desde `/profile` (`ProfileForm.tsx`) y sobre-escribirse temporalmente desde el panel de filtros en `/`.

#### Backfill sobre las `271` vacantes existentes
- Se implementa un extractor determinista único en TypeScript (`apps/web/src/lib/domain/jobNormalization.ts`) compartido como fuente de verdad de reglas en Fase 1 y ejecutado mediante un script idempotente que lee `raw_description`, `title`, `location` y `salary` de las `271` filas y puebla las columnas normalizadas en `public.job_listings`.
- **Contrato puro de texto (compatible con Fase 2):** `normalizeJobMetadata()` deduce `district`, `lima_zone`, `category`, `role_level`, `english_required`, `english_level`, `salary_min` y `salary_max` **exclusivamente a partir de los campos de texto del aviso** (sin depender de `job_evaluations`), de modo que Fase 2 pueda llamarlo en la ingesta antes de evaluar con IA:
  - `'preprofesional'`: títulos/descripciones de *practicante preprofesional / pre-profesional / prácticas pre / pasante / intern / estudiante universitario* sin marcador de egresado/profesional.
  - `'profesional'`: *practicante profesional / egresado / bachiller / asistente / analista / coordinador*.
  - `'trainee_junior'`: *trainee / junior / jr / entry level / joven talento*.
  - `'unknown'`: avisos genéricos sin nivel explícito (p. ej. `"Practicante de Sistemas"` sin *pre* ni *egresado*); la capa de consultas trata `'unknown'` con `is_pre_professional = true` como elegible dentro del filtro por defecto `Preprofesional`.
- Cuando la Fase 2 actualice `services/pipeline/`, los scrapers y `matcher.py` poblarán estas mismas columnas al ingestar nuevas vacantes.

### 4.3 Filtros Minuciosos de Lima y Sincronización URL (`workspaceState.ts` + `urlFilterParams.ts`)

| Bloque en `FilterSidebar` | Comportamiento exacto | Parámetro URL |
|---|---|---|
| **Búsqueda** | Texto libre (cargo, empresa, agencia, tech) + chips removibles por token + sugerencia `"¿Quisiste decir?"` | `q` |
| **Distritos de Lima** | Dos listas independientes (`includedDistricts` + `excludedDistricts`) + buscador de distritos + conteos en vivo.<br>• **Exclusiones (`excl`)**: por defecto `['Ate']` **tanto para visitantes sin sesión como al iniciar sesión** (tomando `profiles.excluded_districts` si la URL no especifica `excl`). Quitar el chip `[No: Ate ×]` o pulsar `[Limpiar]` fija `excl=none` en la URL para no re-aplicar el perfil al recargar.<br>• **Inclusiones (`dist`)**: opcional; al marcar distritos (ej. `San Isidro`, `Miraflores`) filtra a esos distritos, pero mantiene visibles `Remoto` (`drem=1`, activado por defecto) y ofrece switch opcional `+ Incluir Lima sin distrito` (`dlim=1`, desactivado por defecto) para avisos genéricos (`'Lima Metropolitana'`). Las exclusiones (`excl`) siempre mandan al final. | `dist`, `excl`, `drem`, `dlim` |
| **Requiere inglés** | Switch booleano (`Todas` vs `Requiere inglés`) + pills opcionales de nivel (`Básico`, `Intermedio`, `Avanzado`) cuando está activo | `eng`, `engl` |
| **Fecha de publicación** | Radio buttons: `Últimas 24 horas` (`1`), `Últimos 3 días` (`3`), `Última semana` (`7`), `Últimas 2 semanas` (`14`, defecto), `Último mes` (`30`), `Histórico DB` (`all`) | `time` |
| **Categoría** | Checkboxes multi-selección con conteo por área | `cat` |
| **Nivel laboral** | Checkboxes multi-selección `lvl` (`preprofesional` activo por defecto, `profesional`, `trainee_junior`) + toggle `Incluir ofertas descartadas por IA` (`ai=1`).<br>• Solo `preprofesional` (defecto): muestra `(role_level = 'preprofesional' OR (role_level = 'unknown' AND is_pre_professional = true))` excluyendo `is_unrealistic_or_smoke = true`.<br>• Al marcar `profesional` o `trainee_junior`: desbloquea directamente esos niveles en el feed y en `searchHistoricalJobs` **sin requerir `ai=1`**, manteniendo ocultas únicamente las ofertas con `is_unrealistic_or_smoke = true`.<br>• `ai=1`: muestra también ofertas con `is_unrealistic_or_smoke = true` y registros `is_pre_professional = false` cuando no hay restricción estricta de nivel. Desmarcar todos los `lvl` equivale a cualquier nivel no-smoke. | `lvl`, `ai=1` |
| **Modalidad** | Checkboxes: `Híbrido`, `Presencial`, `Remoto`, `No especificado` | `mod` |
| **Rango salarial (S/)** | Radio/chips: `Cualquiera`, `Con sueldo visible`, `≥ S/ 1,130`, `≥ S/ 1,500`, `≥ S/ 2,000` | `sal` |
| **Portal de origen** | Checkboxes para los 5 adapters: `Prácticas PE`, `Bumeran`, `LinkedIn`, `Computrabajo`, `CVMatcher` | `src` |
| **Afinidad mínima & Orden** | Afinidad (`Todas`, `60+`, `75+`, `85+`), pestaña CRM (`tab`) y orden (`sort`) | `score`, `tab`, `sort` |

- **Regla de filtrado con `Histórico DB` o búsqueda profunda**: cuando `maxAgeDays === null` (`time=all`), `searchHistoricalJobs` en [`actions/jobs.ts`](file:///c:/Users/josep/OneDrive/Desktop/job_hunter_agent/apps/web/src/actions/jobs.ts) aplica exactamente las mismas reglas (`dist`, `excl`, `drem`, `dlim`, `category`, `lvl` + `ai`, `english_required`, `salary_min`, `modality` y `source`) directamente en SQL contra Supabase.
- **Estado CRM + exclusión**: si una vacante ya tiene estado CRM guardado por el usuario (`Postulado`, `Por postular`, `Destacada`, `En entrevista`), sigue visible en su pestaña CRM y en `/pipeline` incluso si cae fuera del filtro de exclusión por distrito al cambiar preferencias.
- **Sincronización al iniciar sesión sin recarga brusca**: al iniciar sesión desde `AuthModal` (escuchado vía `onAuthStateChange`), si el usuario no fijó `excl=...` en la URL, el cliente adopta `profiles.excluded_districts` junto con su mapa CRM personal. Si la URL sí tiene `excl=none` u otra lista explícita, la URL prevalece.

### 4.4 Tarjetas Enriquecidas y CRM Inline (`JobCard.tsx`)

Cada tarjeta muestra:
1. Logo/monograma de empresa o cliente detectado (`resolved_brand_key`), título completo legible y pill discreto de origen (`Bumeran`, `LinkedIn`, `Prácticas PE`, `Computrabajo`, `CVMatcher`) + badge `Vía Agencia` si aplica.
2. Línea meta limpia: **Distrito normalizado** (`San Isidro · Lima Moderna`), modalidad, sueldo (`S/ ...` si existe) y antigüedad (`Hoy`, `Ayer`, `Hace 2d`).
3. Fila de pills de stack: hasta `4` habilidades de `matching_skills` + indicador `Inglés` (si `english_required`) + `+N más`.
4. Anillo o pill de afinidad IA (`85%`).
5. **Barra inferior de seguimiento CRM en 1 clic**: botones compactos `Por postular`, `Destacar ⭐`, `Postulado`, `Entrevista`, `Descartar`.
   - Usuario autenticado: transición optimista + `upsertJobState()` + actualización inmediata de contadores y badge en sidebar. Si falla el servidor, revierte (`rollbackJobTransition`) y muestra error claro.
   - Visitante sin sesión: abre `AuthModal` explicando que al iniciar sesión podrá guardar la vacante.

### 4.5 Login y Autenticación Confiables

1. **Correcciones de código en `apps/web/src/`**:
   - [`login/page.tsx`](file:///c:/Users/josep/OneDrive/Desktop/job_hunter_agent/apps/web/src/app/login/page.tsx) y [`AuthModal.tsx`](file:///c:/Users/josep/OneDrive/Desktop/job_hunter_agent/apps/web/src/components/auth/AuthModal.tsx):
     - Pasar `options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=...`, data: { full_name } }` en `signUp()`.
     - Traducir y manejar `"Email not confirmed"` mostrando botón inline **"Reenviar correo de confirmación"** (`supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo } })`).
     - Agregar modo **"Recuperar contraseña"** (`supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=/login%3Fmode%3Dupdate-password` })`) y vista `update-password` (`supabase.auth.updateUser({ password })`).
     - Mostrar errores claros si Google OAuth no está habilitado o falla en `/auth/callback`.
   - [`route.ts` (`/auth/callback`)](file:///c:/Users/josep/OneDrive/Desktop/job_hunter_agent/apps/web/src/app/auth/callback/route.ts):
     - Soportar tanto `?code=...` (`exchangeCodeForSession`) como `?token_hash=...&type=...` (`verifyOtp({ type, token_hash })`), además de propagar mensajes legibles en `?error=...` si expira el enlace.
   - Listener global de sesión en el layout/shell cliente (`supabase.auth.onAuthStateChange`) para refrescar (`router.refresh()`) al completar login/signup/logout y mantener actualizado el bloque de usuario en la sidebar (`nombre/email + avatar`).
2. **Checklist obligatorio en Supabase Dashboard (proyecto `qirakbvvuhesjendiflu`)**:
   - **Authentication → URL Configuration**: `Site URL = http://localhost:3000` (o dominio de producción en Vercel) y `Redirect URLs = http://localhost:3000/auth/callback` (y `http://localhost:3000/**` en desarrollo).
   - **Authentication → Sign In / Providers → Email**: desactivar **Confirm email** si deseas registro instantáneo con correo y contraseña sin límite SMTP del tier gratuito; si prefieres mantener confirmación por correo, el nuevo flujo con `emailRedirectTo` + `token_hash` + botón de reenvío ya lo soporta al 100%. (En cuanto al usuario actualmente pendiente en `auth.users`, podrá reconfirmarse o volver a registrarse una vez configurado esto.)
   - **Google OAuth (opcional)**: habilitar **Google** en **Providers** con `Client ID` y `Client Secret` de Google Cloud apuntando a `https://qirakbvvuhesjendiflu.supabase.co/auth/v1/callback`.

---

## 5. Contrato con Fase 2 (Pipeline Python)

Cuando se ejecute la Fase 2 en `services/pipeline/`:
- [`candidate_profile.py`](file:///c:/Users/josep/OneDrive/Desktop/job_hunter_agent/services/pipeline/config/candidate_profile.py) y [`matcher.py`](file:///c:/Users/josep/OneDrive/Desktop/job_hunter_agent/services/pipeline/ai/matcher.py) separarán `home_district` (`"Ate"`) de `excluded_districts` / `preferred_districts` para que la evaluación compartida refleje la preferencia real.
- `SupabaseRepository` y los adapters (`bumeran.py`, `computrabajo.py`, `linkedin.py`, `practicas_pe.py`, `cvmatcher.py`) completarán `district`, `lima_zone`, `category`, `role_level`, `english_required`, `english_level`, `salary_min`, `salary_max` desde la ingesta y limpiarán ratings numéricos (`"4,3"`) antes de guardar en `public.job_listings`.

---

## 6. Decisiones Tomadas y Lo que Queda a Criterio del Implementador (Builder)

### Decisiones cerradas tras revisión técnica y confirmación de producto
- **Listas independientes en Distritos (`dist` + `excl`) con `Remoto` conservado**: se pueden combinar inclusiones (ej. `San Isidro`) con exclusiones (`No: Ate`) sin sobrescribirse; `Remoto` queda visible por defecto cuando hay distritos incluidos (`drem=1`) y `Lima Metropolitana` sin distrito tiene switch aparte (`dlim=0`).
- **`Ate` excluido desde la carga inicial incluso sin sesión**: `DEFAULT_WORKSPACE_FILTERS` arranca con `excludedDistricts: ['Ate']` visible como chip removible `[No: Ate ×]`; al iniciar sesión toma `profiles.excluded_districts`, salvo que la URL fije explícitamente `excl=none` o una lista distinta.
- **Desacoplamiento de `Nivel laboral` respecto a `ai=1`**: marcar `Profesional / Egresado` o `Trainee / Junior` muestra esas vacantes directamente sin exigir `Incluir ofertas descartadas por IA`, reservando `ai=1` para revelar ofertas marcadas como irreales/smoke (`is_unrealistic_or_smoke = true`) o descartadas ambiguas.
- **Normalización pura de texto en `jobNormalization.ts`**: no depende de `job_evaluations` para mantener compatibilidad limpia con la ingesta de Fase 2; las filas genéricas con `role_level = 'unknown'` se muestran en el defecto `Preprofesional` mientras `is_pre_professional = true`.
- **Detalle IA en `JobDetailDrawer` bajo demanda (`getJobDetail`)**: mantiene el payload inicial SSR liviano y muestra en el drawer resumen + skills siempre visibles y los 5 pasos de `reasoning_chain` dentro de un acordeón colapsable `"Ver análisis detallado"`.

### Criterio del Implementador (Builder)
- Paleta exacta, espaciados y micro-interacciones manteniendo el lenguaje limpio actual de Job Hunter (blanco/slate `#F8FAFC` con acento azul institucional y acentos semánticos de match).
- Descomposición interna de los subcomponentes de acordeón y drawer en `apps/web/src/components/`.
- Estrategia de batching del backfill inicial sobre las 271 filas en Supabase sin superar límites de payload.
- Estructura de los nuevos tests unitarios en Vitest para normalización de Lima, serialización URL, filtros con exclusión de distritos (`excl=none`, `drem`, `dlim`), `role_level` vs `ai=1`, CRM inline y callback auth.
