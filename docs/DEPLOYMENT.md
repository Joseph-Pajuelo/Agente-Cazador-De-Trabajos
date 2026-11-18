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
2. Crea una organización y un nuevo proyecto (ej. `job-hunter-agent`).
3. Elige la región más cercana (ej. `sa-east-1` São Paulo o `us-east-1` N. Virginia) y define una contraseña segura.

### 1.2 Ejecutar las Migraciones del Esquema SQL
1. En el menú lateral izquierdo de Supabase, ve a **SQL Editor > New query**.
2. Ejecuta en orden los archivos SQL de `supabase/migrations/` empezando por [`supabase/migrations/202611130001_initial_schema.sql`](file:///supabase/migrations/202611130001_initial_schema.sql).
3. Verifica que se crearon exitosamente:
   - Tablas: `profiles`, `job_listings`, `job_evaluations`, `user_job_states`.
   - Índices B-tree y GIN (`idx_job_listings_search_tsv`).
   - Políticas RLS (Row Level Security) activadas en las 4 tablas.
   - Triggers: `handle_new_user()`, `prevent_is_admin_self_escalation()` y `auto_confirm_auth_user()`.

---

## Paso 2: Configurar Autenticación (Supabase Auth)

### 2.1 Proveedor de Correo Electrónico (Email Auth)
1. Ve a **Authentication > Providers > Email**.
2. Asegúrate de que **Enable Email provider** esté activo.

### 2.2 Configurar URLs de Redirección (Redirect URLs)
1. Ve a **Authentication > URL Configuration**.
2. **Site URL:**
   - En desarrollo local: `http://localhost:3000`
   - En producción: `https://tu-proyecto.vercel.app`
3. **Redirect URLs (Allow list):**
   - `http://localhost:3000/auth/callback`
   - `http://127.0.0.1:3000/auth/callback`
   - `https://tu-proyecto.vercel.app/auth/callback`
   - `https://*.vercel.app/auth/callback`

### 2.3 Proveedor Google OAuth (Opcional)
1. En [Google Cloud Console](https://console.cloud.google.com/), crea credenciales OAuth 2.0 (Web application).
2. En Authorized Redirect URIs, coloca el callback de tu Supabase:
   `https://<TU-PROJECT-REF>.supabase.co/auth/v1/callback`
3. En Supabase Dashboard > **Authentication > Providers > Google**, activa el proveedor e ingresa el **Client ID** y **Client Secret**.

---

## Paso 3: Poblar el Catálogo Inicial con el Pipeline

Desde tu máquina local (o disparando el workflow en GitHub Actions), ejecuta el pipeline apuntando a Supabase:

```bash
pip install -r services/pipeline/requirements.txt
python services/pipeline/run.py --limit 40 --backend supabase
```

---

## Paso 4: Despliegue del Frontend Web en Vercel

1. Ve a [Vercel Dashboard](https://vercel.com/dashboard) y haz clic en **Add New... > Project**.
2. Importa el repositorio `job_hunter_agent`.
3. En **Root Directory**, selecciona `apps/web`.
4. En **Environment Variables**, añade:

| Nombre | Valor | Entornos |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://tu-proyecto.supabase.co` | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOi...` (anon public key) | Production, Preview, Development |

5. Haz clic en **Deploy**.

---

## Paso 5: Automatización del Pipeline en GitHub Actions

El repositorio incluye el workflow [`.github/workflows/auto_scrape.yml`](file:///.github/workflows/auto_scrape.yml), que escanea automáticamente los 5 portales dos veces al día.

### Configurar Secretos en GitHub
En tu repositorio de GitHub, ve a **Settings > Secrets and variables > Actions** y añade:

| Secreto | Descripción |
|---|---|
| `GEMINI_API_KEY` | Clave API de Google Gemini para evaluación con IA |
| `SUPABASE_URL` | URL de tu proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave secreta `service_role` de Supabase (exclusiva para el backend/pipeline) |

> [!CAUTION]
> La `SUPABASE_SERVICE_ROLE_KEY` otorga permisos administrativos sobre la base de datos. Nunca la expongas en variables `NEXT_PUBLIC_*` del frontend.
