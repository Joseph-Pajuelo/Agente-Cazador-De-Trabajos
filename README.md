# 🎯 Job Hunter Platform — Radar Inteligente de Prácticas Preprofesionales

![Next.js](https://img.shields.io/badge/Next.js-15.5-000000?logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL%20%2B%20RLS-3ECF8E?logo=supabase&logoColor=white)
![Google Gemini](https://img.shields.io/badge/AI-Gemini%203.8%20Flash-4285F4?logo=google&logoColor=white)
![Pydantic](https://img.shields.io/badge/Pydantic-V2-E92063?logo=pydantic&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind-CSS%20v4-06B6D4?logo=tailwindcss&logoColor=white)

> **Autor:** Joseph Pajuelo Cárdenas — *Ingeniería de Sistemas e Informática (UTP)*  
> **Enfoque:** Arquitectura de Software Monorepo · Ingeniería de IA · Plataforma Web Full-Stack Cloud-Native

---

## 📌 1. Problema y Propuesta de Valor

Buscar prácticas preprofesionales en tecnología, datos y desarrollo de software en Lima suele ser ineficiente por tres factores críticos:
1. **Alta duplicidad:** Las convocatorias se replican en múltiples plataformas (Bumeran, LinkedIn, CompuTrabajo, Practicas.pe, CVMatcher).
2. **Ofertas trampa y filtros engañosos:** Convocatorias tituladas *"Practicante"* que exigen ser egresado/titulado (*Practicante Profesional*) o requerir 2+ años de experiencia previa.
3. **Pérdida de trazabilidad:** Dificultad para recordar a qué ofertas se postuló, las notas personales y el estado en el embudo de contratación.

**Job Hunter Platform** es una solución monorepo completa de nivel producción que combina un **pipeline automatizado de datos e IA** con una **plataforma web moderna (Next.js 15 + Supabase)**:
* **Extracción Multi-Portal:** Scrapers especializados para 5 portales peruanos con manejo de sesiones, APIs REST internas, endpoints de invitados y parseo SSR.
* **Deduplicación Criptográfica:** Hash `SHA-256(empresa + título_normalizado)` y control de URLs ya conocidas.
* **Evaluación Inteligente y Filtros:** Pre-filtro determinista de baja latencia (0 tokens) para descartar egresados/ofertas trampa + inferencia con **Google Gemini (`gemini-3.8-flash`)** con esquemas estrictos Pydantic V2 y protección con **Circuit Breaker**.
* **Persistencia Cloud Segura:** Base de datos PostgreSQL en Supabase con Row Level Security (RLS), búsqueda por texto completo en español (`to_tsvector('spanish', ...)`), y seguimiento de CRM multiusuario.
* **Frontend Web Reactivo:** Interfaz moderna en Next.js 15 (App Router) con explorador de vacantes con filtros instantáneos, tablero Kanban de seguimiento de postulaciones y gestión de perfil profesional.
* **CI/CD Automatizado:** Workflows en GitHub Actions que ejecutan escaneos 2 veces al día y sincronizan directamente con Supabase vía HTTPS sin alterar el historial Git.

---

## 🏛️ 2. Arquitectura del Monorepo

El repositorio está organizado como un **monorepo desacoplado** con tres capas principales:

```
job_hunter_agent/
├── apps/
│   └── web/                     # Frontend Next.js 15 (App Router, Tailwind CSS, TypeScript)
│       ├── src/
│       │   ├── actions/         # Server Actions (crm.ts, jobs.ts, profile.ts) con revalidatePath
│       │   ├── app/             # Rutas: / (explorador), /pipeline (Kanban CRM), /profile, /login, /auth/callback
│       │   ├── components/      # Componentes UI (jobs, pipeline, profile, auth, layout)
│       │   └── lib/             # Dominio, ranking, clientes Supabase (browser, server, middleware)
│       └── tests/               # Pruebas unitarias con Vitest (dominio, workspace, pipeline, actions)
├── services/
│   └── pipeline/                # Pipeline de Extracción, Evaluación con IA y Persistencia
│       ├── adapters/            # Conectores para Bumeran, LinkedIn, Computrabajo, Practicas.pe, CVMatcher
│       ├── ai/                  # Orquestador Gemini 3.8 Flash, Circuit Breaker y Prompts
│       ├── config/              # Perfil del candidato (default) y keywords de búsqueda
│       ├── domain/              # Modelos Pydantic V2, normalización de marcas y ranking
│       ├── scripts/             # Scripts de migración (migrate_sqlite_to_supabase.py)
│       ├── seeds/               # initial_catalog.json (catálogo histórico verificado)
│       ├── storage/             # Repositorios desacoplados: BaseRepository, SqliteRepository, SupabaseRepository
│       └── tests/               # Pruebas con Pytest (adaptadores, modelos, esquemas SQL, repositorios)
├── supabase/
│   ├── config.toml              # Configuración local de Supabase CLI
│   └── migrations/              # 202611130001_initial_schema.sql (DDL completo + RLS + Triggers)
├── docs/
│   └── DEPLOYMENT.md            # Guía detallada de despliegue paso a paso en producción
└── .github/
    └── workflows/
        └── auto_scrape.yml      # Workflow de escaneo automático 2x/día hacia Supabase
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
        Dedup["Deduplicador SHA-256\n+ Normalizador de Marcas"]
        PreFilter["Pre-Filtro Determinista\n(0ms - Descarte de Egresados)"]
        CB["Circuit Breaker & Fallback"]
        Gemini["Google Gemini 3.8 Flash\n(Interactions API + Pydantic V2)"]
        Repo["SupabaseRepository\n(services/pipeline/storage)"]
    end

    subgraph CloudDB ["3. Supabase Cloud (PostgreSQL 15+)"]
        JobListings[("job_listings\n(Catálogo público)")]
        JobEvals[("job_evaluations\n(Scores & Análisis)")]
        Profiles[("profiles\n(Perfiles de usuario)")]
        UserJobStates[("user_job_states\n(CRM: to_apply, applied, ...)")]
    end

    subgraph Frontend ["4. Plataforma Web (apps/web - Next.js 15)"]
        Explorador["Explorador de Vacantes (/)\nFiltros en tiempo real + Búsqueda"]
        PipelineBoard["Tablero CRM (/pipeline)\nKanban por etapas + Notas"]
        ProfileForm["Perfil Profesional (/profile)\nPersonalización de matching"]
        AuthSystem["Supabase Auth (SSR)\nEmail Magic Links + Google OAuth"]
    end

    Fuentes --> Scraper
    Scraper --> Dedup
    Dedup --> PreFilter
    PreFilter -->|Apta Preprofesional| CB
    CB <-->|Inferencia Estructurada| Gemini
    PreFilter -->|Evaluada| Repo
    CB -->|Evaluada| Repo
    Repo -->|HTTPS REST / Service Role| CloudDB

    CloudDB <-->|Server Actions & SSR (RLS)| Frontend
    CloudDB <-->|Auth Session Cookies| AuthSystem
```

---

## 🚀 3. Inicio Rápido (Desarrollo Local)

### Prerrequisitos
- **Python 3.11+**
- **Node.js 20+** y **npm**
- Cuenta gratuita en [Supabase](https://supabase.com) y clave API en [Google AI Studio](https://aistudio.google.com/app/api-keys)

### Paso 1: Clonar y configurar variables de entorno
```bash
git clone https://github.com/tu-usuario/job_hunter_agent.git
cd job_hunter_agent

# Copiar plantilla de variables
cp .env.example .env
cp .env.example apps/web/.env.local
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
Aplica la migración SQL [`supabase/migrations/202611130001_initial_schema.sql`](file:///supabase/migrations/202611130001_initial_schema.sql) en el **SQL Editor** de tu panel de Supabase.

Para importar el catálogo histórico verificado (271 vacantes):
```bash
# Probar primero en modo dry-run
python services/pipeline/scripts/migrate_sqlite_to_supabase.py --dry-run

# Ejecutar migración activa
python services/pipeline/scripts/migrate_sqlite_to_supabase.py
```

### Paso 3: Ejecutar el Pipeline de Extracción (Python)
```bash
# Instalar dependencias del pipeline
pip install -r services/pipeline/requirements.txt

# Ejecutar escaneo conectando directamente a Supabase
python services/pipeline/run.py --limit 40 --no-pdf --backend supabase
```

### Paso 4: Ejecutar la Aplicación Web (Next.js)
```bash
# Instalar dependencias e iniciar servidor de desarrollo
cd apps/web
npm install
npm run dev
```
Abre tu navegador en `http://localhost:3000`.

---

## 🧪 4. Pruebas y Verificación de Calidad

El proyecto cuenta con suites de pruebas completas en ambas capas del stack:

### Pruebas del Pipeline (Python / Pytest)
```bash
pytest services/pipeline/tests -v
```
*Cubre: adaptadores de scraping, contratos Pydantic V2, deduplicación SHA-256, motor de ranking, compatibilidad de esquemas SQL Supabase, políticas RLS, repositorios y migración idempotente.*

### Pruebas del Frontend Web (Next.js / Vitest & TypeScript)
```bash
cd apps/web
npm run test         # Pruebas unitarias de dominio, workspace y server actions (Vitest)
npm run lint         # Verificación de reglas ESLint
npm run typecheck    # Verificación estricta de tipos TypeScript (tsc --noEmit)
npm run build        # Compilación de producción Next.js (SSG + SSR)
```

---

## ⚙️ 5. Automatización en la Nube (GitHub Actions)

El workflow [`.github/workflows/auto_scrape.yml`](file:///.github/workflows/auto_scrape.yml) está configurado para ejecutarse automáticamente dos veces al día:
- **07:00 AM Hora Perú (12:00 UTC)**
- **02:00 PM Hora Perú (19:00 UTC)**
- También puede ejecutarse manualmente desde la pestaña **Actions > Run workflow** en GitHub.

El workflow se conecta directamente a Supabase a través de HTTPS utilizando la clave secreta `SUPABASE_SERVICE_ROLE_KEY` almacenada en **GitHub Secrets**, evitando cualquier modificación o commit en el historial Git del repositorio.

---

## 📖 6. Guía de Despliegue en Producción

Para desplegar la aplicación web en **Vercel**, configurar los proveedores de autenticación en **Supabase Auth** (Email Magic Links + Google OAuth) y automatizar el pipeline, consulta la guía completa:

👉 **[Ver Guía de Despliegue Paso a Paso (docs/DEPLOYMENT.md)](docs/DEPLOYMENT.md)**

---

## 📄 Licencia y Reconocimientos

Desarrollado con fines académicos y profesionales por **Joseph Pajuelo Cárdenas** (Universidad Tecnológica del Perú).
Diseñado para impulsar la inserción laboral temprana en roles de tecnología e inteligencia artificial.
