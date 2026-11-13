# 🚀 Guía de Despliegue en Producción — Job Hunter Platform

Esta guía detalla paso a paso cómo desplegar la plataforma completa (**Next.js Web**, **Pipeline de IA & Scraping**, y **Base de Datos Supabase con RLS**) desde cero hasta producción.

---

## 📋 Resumen de Componentes

| Componente | Plataforma / Servicio | Directorio en Repo | Variables Clave |
|---|---|---|---|
| **Base de Datos & Auth** | Supabase (PostgreSQL + RLS) | `supabase/` | `SUPABASE_URL`, keys |
| **Frontend Web** | Vercel (Next.js 15 App Router) | `apps/web/` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| **Pipeline & Scraper** | GitHub Actions (Cron 2x/día) | `services/pipeline/` | `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |

---

## Paso 1: Configurar Proyecto en Supabase

### 1.1 Crear el proyecto
1. Ve a [Supabase Dashboard](https://supabase.com/dashboard) e inicia sesión.
2. Crea una nueva organización (si no tienes una) y un nuevo proyecto (ej. `job-hunter-agent`).
3. Elige la región más cercana (ej. `sa-east-1` São Paulo o `us-east-1` N. Virginia) y define una contraseña segura para la base de datos.

### 1.2 Ejecutar la Migración del Esquema SQL
1. En el menú lateral izquierdo de Supabase, ve a **SQL Editor**.
2. Haz clic en **New query**.
3. Copia y pega el contenido completo de [`supabase/migrations/202611130001_initial_schema.sql`](file:///supabase/migrations/202611130001_initial_schema.sql).
4. Haz clic en **Run** (o presiona `Ctrl + Enter`).
5. Verifica que se crearon exitosamente:
   - Tablas: `profiles`, `job_listings`, `job_evaluations`, `user_job_states`.
   - Índices: `idx_job_listings_search_tsv`, `idx_job_listings_pub_date`, etc.
   - Políticas RLS (Row Level Security) activadas en las 4 tablas.
   - Triggers: `handle_new_user()` y `prevent_is_admin_self_escalation()`.

---

## Paso 2: Configurar Autenticación (Supabase Auth)

### 2.1 Proveedor de Correo Electrónico (Email Auth)
1. Ve a **Authentication > Providers > Email**.
2. Asegúrate de que **Enable Email provider** esté activo.
3. *(Recomendado para pruebas o uso personal)*: En **Authentication > Providers > Email**, puedes desactivar temporalmente **Confirm email** si deseas iniciar sesión inmediatamente con Magic Link o contraseña sin esperar el correo de confirmación.

### 2.2 Configurar URLs de Redirección (Redirect URLs)
1. Ve a **Authentication > URL Configuration**.
2. **Site URL:**
   - En desarrollo local: `http://localhost:3000`
   - En producción: `https://tu-proyecto.vercel.app`
3. **Redirect URLs (Allow list):** Agrega las siguientes URLs:
   - `http://localhost:3000/auth/callback`
   - `http://127.0.0.1:3000/auth/callback`
   - `https://tu-proyecto.vercel.app/auth/callback`
   - `https://*.vercel.app/auth/callback` (para vistas previas de PRs)

### 2.3 Proveedor Google OAuth (Opcional)
1. Ve a [Google Cloud Console](https://console.cloud.google.com/) y crea credenciales OAuth 2.0 (Web application).
2. En Authorized Redirect URIs, coloca el callback de tu Supabase:
   `https://<TU-PROJECT-REF>.supabase.co/auth/v1/callback`
3. En Supabase Dashboard > **Authentication > Providers > Google**:
   - Activa el toggle **Enable Google provider**.
   - Ingresa el **Client ID** y **Client Secret** generados en Google Cloud.

---

## Paso 3: Migración Idempotente del Catálogo Histórico (Seed)

El repositorio incluye un archivo seed con el historial completo verificado (271 vacantes, 271 evaluaciones y estados de seguimiento CRM): `services/pipeline/seeds/initial_catalog.json`.

### 3.1 Migración inicial de vacantes públicas (sin vincular a usuario)
Ejecuta el script desde tu máquina local usando la `SUPABASE_SERVICE_ROLE_KEY`:

```bash
# Variables de entorno requeridas
export SUPABASE_URL="https://tu-proyecto.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="tu-service-role-key-secreta"

# Ejecución en Windows PowerShell:
# $env:SUPABASE_URL="https://tu-proyecto.supabase.co"
# $env:SUPABASE_SERVICE_ROLE_KEY="tu-service-role-key-secreta"

# 1. Probar primero en modo dry-run (no escribe en Supabase)
python services/pipeline/scripts/migrate_sqlite_to_supabase.py --dry-run

# 2. Ejecutar la migración activa
python services/pipeline/scripts/migrate_sqlite_to_supabase.py
```

### 3.2 Asignar los estados CRM a tu cuenta de usuario
Una vez que hayas creado tu usuario e iniciado sesión por primera vez en la aplicación web con tu correo (ej. `joseph@ejemplo.com`), ejecuta:

```bash
python services/pipeline/scripts/migrate_sqlite_to_supabase.py --owner-email joseph@ejemplo.com
```

> [!NOTE]
> El script es **100% idempotente**. Las vacantes existentes nunca se sobreescriben ni duplican gracias a la restricción `ON CONFLICT (deduplication_hash) DO NOTHING`. Los estados CRM se asignan de forma segura al UUID del usuario resuelto.

---

## Paso 4: Despliegue del Frontend Web en Vercel

### 4.1 Importar el Repositorio
1. Ve a [Vercel Dashboard](https://vercel.com/dashboard) y haz clic en **Add New... > Project**.
2. Conecta tu cuenta de GitHub e importa el repositorio `job_hunter_agent`.

### 4.2 Configurar el Directorio Raíz (Root Directory)
> [!IMPORTANT]
> En la sección **Root Directory**, haz clic en **Edit** y selecciona:
> `apps/web`

### 4.3 Variables de Entorno en Vercel
En la sección **Environment Variables**, añade:

| Nombre | Valor | Tipo |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://tu-proyecto.supabase.co` | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOi...` (anon public key) | Production, Preview, Development |

*(Ambas claves se obtienen en Supabase Dashboard > Project Settings > API).*

### 4.4 Desplegar
Haz clic en **Deploy**. Vercel compilará automáticamente Next.js 15 (`next build`), optimizará las páginas y publicará la aplicación en un dominio HTTPS (ej. `https://job-hunter-agent.vercel.app`).

---

## Paso 5: Automatización del Pipeline en GitHub Actions

El repositorio incluye el workflow [`.github/workflows/auto_scrape.yml`](file:///.github/workflows/auto_scrape.yml), el cual escanea automáticamente los 5 portales a las **7:00 AM y 2:00 PM (hora Perú / UTC-5)**.

### 5.1 Configurar Secretos del Repositorio en GitHub
1. En tu repositorio de GitHub, ve a **Settings > Secrets and variables > Actions**.
2. Haz clic en **New repository secret** y añade los siguientes 3 secretos:

| Secreto | Descripción | Dónde obtenerlo |
|---|---|---|
| `GEMINI_API_KEY` | Clave API de Google Gemini para evaluación con IA | [Google AI Studio](https://aistudio.google.com/app/api-keys) |
| `SUPABASE_URL` | URL de tu proyecto Supabase | Supabase > Project Settings > API > URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de rol de servicio (secreta, bypass RLS para pipeline) | Supabase > Project Settings > API > `service_role` (secret) |

> [!CAUTION]
> La `SUPABASE_SERVICE_ROLE_KEY` otorga permisos de administrador a la base de datos. NUNCA la expongas en el frontend (`apps/web`) ni la incluyas en commits públicos. Sólo debe vivir en GitHub Actions Secrets y entornos seguros de backend.

### 5.2 Probar la Automatización Manualmente
1. En GitHub, ve a la pestaña **Actions**.
2. Selecciona **Auto-Scan Job Portals (7 AM & 2 PM Peru)** en la barra lateral.
3. Haz clic en el botón desplegable **Run workflow** y confirma **Run workflow**.
4. El pipeline ejecutará:
   - Extracción de Bumeran, LinkedIn, CompuTrabajo, Practicas.pe y CVMatcher.
   - Evaluación estructurada con Gemini 3.8 Flash (`--limit 10`).
   - Inserción directa en Supabase vía HTTPS sin alterar el historial Git del repositorio.
