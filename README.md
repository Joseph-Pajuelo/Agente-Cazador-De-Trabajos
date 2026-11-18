# 🎯 ChambaPulse (`Agente-Cazador-De-Trabajos`) — Radar Inteligente de Prácticas Preprofesionales

![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind-CSS%20v4-06B6D4?logo=tailwindcss&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-3-6E9F18?logo=vitest&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white)
![LangGraph](https://img.shields.io/badge/LangGraph-1.0%2B-1C3C3C?logo=langchain&logoColor=white)
![Google Gemini](https://img.shields.io/badge/AI-Gemini%203.8%20Flash-4285F4?logo=google&logoColor=white)
![Pydantic](https://img.shields.io/badge/Pydantic-V2-E92063?logo=pydantic&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL%20%2B%20RLS-3ECF8E?logo=supabase&logoColor=white)

> **Autor:** Joseph Pajuelo Cárdenas — *Ingeniería de Sistemas e Informática (UTP)*  
> **Enfoque:** Arquitectura Monorepo Desacoplada · Pipeline de Ingesta & IA · Plataforma Web Full-Stack Cloud-Native

---

## 📌 1. Problema y Propuesta de Valor

Buscar prácticas preprofesionales en tecnología, datos y desarrollo de software en Lima suele ser ineficiente por tres factores críticos:
1. **Alta duplicidad:** Las convocatorias se replican entre múltiples plataformas (`Bumeran`, `LinkedIn`, `CompuTrabajo`, `Practicas.pe`, `CVMatcher`).
2. **Ofertas trampa y filtros engañosos:** Convocatorias tituladas *"Practicante"* que exigen egresados/titulados (*Practicante Profesional*) o años de experiencia previa, además de vacantes expiradas que siguen circulando.
3. **Pérdida de trazabilidad:** Dificultad para llevar control de a qué ofertas se postuló, notas personales y avances en el proceso de selección.

**ChambaPulse** combina un **pipeline automatizado de datos e IA (Python)** con una **plataforma web moderna (Next.js 15 + Supabase)**:
* **Extracción Multi-Portal:** 5 adaptadores especializados para portales peruanos (`Bumeran`, `LinkedIn Guest API`, `CompuTrabajo`, `Practicas.pe`, `CVMatcher`) con manejo de sesiones HTTPX, APIs REST internas y parseo SSR.
* **Deduplicación Criptográfica & Normalización:** Hash `SHA-256(empresa_normalizada + título_normalizado)`, control de URLs conocidas, detección de clientes detrás de agencias de reclutamiento y clasificación geográfica por distritos de Lima.
* **Evaluación Inteligente con LangGraph + Gemini:** Filtro determinista de relevancia TI/Sistemas + pre-filtro de 0 tokens para descartar egresados/ofertas trampa + inferencia con **Google Gemini (`gemini-3.8-flash`)** bajo esquemas estrictos **Pydantic V2** (Chain-of-Thought) y protección mediante **Circuit Breaker** con degradación heurística.
* **Vigencia Estricta de 21 Días (3 Semanas):** El radar web limita el catálogo a vacantes de los últimos 21 días (`24h`, `3d`, `7d`, `14d`, `21d`, más etiqueta y filtro **Nuevas de hoy**), mientras el pipeline purga automáticamente ofertas expiradas protegiendo aquellas con seguimiento CRM activo.
* **Flujo CRM Reactivo y Reversible:** Las vacantes marcadas como **Postulado** o **Descartado** salen automáticamente de la pestaña **Activas**; las pestañas de seguimiento ordenan por orden de selección (`status_updated_at`), cuentan con acciones rápidas (**Regresar a Activas** / barra **Deshacer**), transiciones fluidas en tarjetas y tablero Kanban en `/pipeline`.
* **Persistencia Cloud Segura:** PostgreSQL en **Supabase** con Row Level Security (RLS), búsqueda por texto completo en español (`to_tsvector('spanish', ...)`), perfiles personalizados y autenticación SSR (Email/Password + Google OAuth).

---

## 🏛️ 2. Arquitectura del Monorepo

El repositorio está organizado como un **monorepo desacoplado** en tres bloques principales (100% web y cloud-native, sin dependencias legadas de escritorio/PDF):

```text
Agente-Cazador-De-Trabajos/
├── apps/
│   └── web/                         # Frontend Next.js 15 (App Router, React 19, Tailwind CSS v4, TypeScript)
│       ├── public/sources/          # Logos WebP de portales (bumeran, computrabajo, cvmatcher, linkedin)
│       ├── src/
│       │   ├── actions/             # Server Actions validadas con Zod (crm.ts, jobs.ts, profile.ts, schemas.ts)
│       │   ├── app/                 # Rutas SSR/App: /, /pipeline, /profile, /login, /auth/callback
│       │   ├── components/          # UI modular (jobs, pipeline, profile, auth, brand, layout)
│       │   ├── lib/                 # Dominio, normalización Lima, filtros URL, ranking y clientes Supabase
│       │   └── middleware.ts        # Sincronización de sesión SSR y protección de rutas autenticadas
│       └── tests/                   # 10 suites de pruebas con Vitest (223 tests)
├── services/
│   └── pipeline/                    # Pipeline Python de Ingesta, Evaluación IA y Persistencia
│       ├── run.py                   # Orquestador CLI (--limit, --backend auto|supabase|sqlite)
│       ├── adapters/                # Conectores: bumeran, linkedin, computrabajo, practicas_pe, cvmatcher
│       ├── ai/                      # Grafo LangGraph, Gemini 3.8 Flash CoT, Circuit Breaker y Prompts
│       ├── config/                  # Perfil base del candidato y 20 keywords de búsqueda en Lima
│       ├── domain/                  # Modelos Pydantic V2, marcas/agencias, normalización y ranking
│       ├── storage/                 # Patrón Repository: JobRepository, SqliteRepository, SupabaseRepository
│       └── tests/                   # 6 suites de pruebas automatizadas con Pytest (41 tests)
├── supabase/
│   ├── config.toml                  # Configuración de Supabase CLI
│   └── migrations/                  # 7 migraciones SQL: esquema, índices GIN/B-tree, RLS, triggers y logo_url
├── docs/
│   └── DEPLOYMENT.md                # Guía detallada de despliegue en producción (Supabase + Vercel + Actions)
└── .github/
    └── workflows/
        └── auto_scrape.yml          # Cron automático 2x/día (7:17 AM y 2:23 PM Perú) + workflow_dispatch
```

### Diagrama de Flujo del Sistema

```mermaid
flowchart TD
    subgraph Fuentes ["1. Portales de Empleo (Perú)"]
        P1["Practicas.pe"]
        P2["Bumeran (API)"]
        P3["LinkedIn (Guest API)"]
        P4["CompuTrabajo"]
        P5["CVMatcher"]
    end

    subgraph Pipeline ["2. Pipeline de Ingesta & IA (Python 3.11+)"]
        Scraper["Adaptadores Multi-Portal\n(services/pipeline/adapters)"]
        Dedup["Relevancia TI + Deduplicador SHA-256\n+ Normalizador Lima & Marcas"]
        PreFilter["Pre-Filtro Determinista\n(0 tokens - Descarte de Egresados)"]
        CB["LangGraph + Circuit Breaker"]
        Gemini["Google Gemini 3.8 Flash\n(Chain-of-Thought + Pydantic V2)"]
        Repo["SupabaseRepository\n+ Purga > 21 días"]
    end

    subgraph CloudDB ["3. Supabase Cloud (PostgreSQL + RLS)"]
        JobListings[("job_listings\n(Catálogo público)")]
        JobEvals[("job_evaluations\n(Scores & Análisis)")]
        Profiles[("profiles\n(Perfiles de usuario)")]
        UserJobStates[("user_job_states\n(CRM + status_updated_at)")]
    end

    subgraph Frontend ["4. Plataforma Web (apps/web - Next.js 15)"]
        Explorador["Radar de Vacantes (/)\nFiltros 21d + URL Sync + Drawer"]
        PipelineBoard["Mis Postulaciones (/pipeline)\nKanban CRM por etapas + Notas"]
        ProfileForm["Mi Perfil (/profile)\nPreferencias y exclusiones"]
        AuthSystem["Supabase Auth (SSR)\nEmail/Password + Google OAuth"]
    end

    Fuentes --> Scraper
    Scraper --> Dedup
    Dedup --> PreFilter
    PreFilter -->|Apta Preprofesional| CB
    CB <-->|Inferencia Estructurada| Gemini
    PreFilter -->|Evaluada / Descartada| Repo
    CB -->|Evaluada| Repo
    Repo -->|HTTPS PostgREST / service_role| CloudDB

    CloudDB <-->|Server Actions & SSR (RLS)| Frontend
    CloudDB <-->|Auth Session Cookies| AuthSystem
```

---

## 🚀 3. Inicio Rápido (Desarrollo Local)

### Prerrequisitos
- **Python 3.11+**
- **Node.js 20+** y **npm**
- Proyecto en [Supabase](https://supabase.com) y clave API en [Google AI Studio](https://aistudio.google.com/app/api-keys)

### Paso 1: Clonar y configurar variables de entorno
```bash
git clone https://github.com/Joseph-Pajuelo/Agente-Cazador-De-Trabajos.git
cd Agente-Cazador-De-Trabajos

cp .env.example .env
cp apps/web/.env.local.example apps/web/.env.local
```

Configura tus credenciales en `.env` (para el pipeline) y en `apps/web/.env.local` (para la app web):
```ini
# En .env (raíz)
GEMINI_API_KEY=tu_api_key_de_gemini
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key

# En apps/web/.env.local
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_public_key
```

### Paso 2: Base de Datos Supabase
Ejecuta en orden cronológico las 7 migraciones SQL ubicadas en [`supabase/migrations/`](supabase/migrations), comenzando por [`supabase/migrations/202611130001_initial_schema.sql`](supabase/migrations/202611130001_initial_schema.sql), desde el **SQL Editor** de tu panel de Supabase.

### Paso 3: Ejecutar el Pipeline de Extracción (Python)
```bash
pip install -r services/pipeline/requirements.txt
python services/pipeline/run.py --limit 40 --backend supabase
```
*(Si omites `--backend` y no hay credenciales de Supabase configuradas, `--backend auto` utiliza SQLite local automáticamente para pruebas).*

### Paso 4: Ejecutar la Aplicación Web (Next.js)
```bash
cd apps/web
npm install
npm run dev
```
Abre tu navegador en `http://localhost:3000`.

---

## 🧪 4. Pruebas y Verificación de Calidad

### Pruebas del Pipeline (Python / Pytest)
```bash
python -m pytest services/pipeline/tests -v
```
*41 pruebas repartidas en 6 suites (`test_adapters.py`, `test_models.py`, `test_normalization.py`, `test_sql_schema.py`, `test_sqlite_repository.py`, `test_supabase_repository.py`) que cubren scrapers, contratos Pydantic V2, deduplicación SHA-256, normalización de Lima, esquema SQL/RLS y repositorios.*

### Pruebas del Frontend Web (Next.js / Vitest & TypeScript)
```bash
cd apps/web
npm run test         # 10 archivos / 223 pruebas unitarias y de componentes (Vitest)
npm run typecheck    # Verificación estricta de tipos TypeScript (tsc --noEmit)
npm run lint         # Verificación de reglas ESLint (next lint)
npm run build        # Compilación de producción Next.js
```

---

## ⚙️ 5. Automatización en la Nube (GitHub Actions)

El workflow [`.github/workflows/auto_scrape.yml`](.github/workflows/auto_scrape.yml) se ejecuta automáticamente dos veces al día:
- **07:17 AM Hora Perú (`12:17 UTC`)**
- **02:23 PM Hora Perú (`19:23 UTC`)**
- Ejecución manual bajo demanda desde **Actions > Run workflow** en GitHub (`workflow_dispatch`).

El workflow valida la presencia de secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, y `GEMINI_API_KEY` opcional con fallback heurístico) y sincroniza las vacantes directamente con Supabase vía HTTPS manteniendo limpio el historial Git.

---

## 📖 6. Guía de Despliegue en Producción

Para desplegar la aplicación web en **Vercel**, configurar **Supabase Auth** (Email y Google OAuth) y automatizar el pipeline, consulta:

👉 **[Ver Guía de Despliegue Paso a Paso (`docs/DEPLOYMENT.md`)](docs/DEPLOYMENT.md)**

---

## 📄 Licencia y Reconocimientos

Desarrollado con fines académicos y profesionales por **Joseph Pajuelo Cárdenas** (Universidad Tecnológica del Perú).
