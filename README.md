# 🎯 ChambaPulse (Job Hunter Platform) — Radar Inteligente de Prácticas Preprofesionales

![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=next.js&logoColor=white)
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

**Job Hunter Platform** es una solución monorepo de nivel producción que combina un **pipeline automatizado de datos e IA** con una **plataforma web moderna (Next.js 15 + Supabase)**:
* **Extracción Multi-Portal:** Scrapers especializados para 5 portales peruanos con manejo de sesiones, APIs REST internas, endpoints de invitados y parseo SSR.
* **Deduplicación Criptográfica:** Hash `SHA-256(empresa_normalizada + título_normalizado)` y control de URLs conocidas.
* **Evaluación Inteligente y Filtros:** Pre-filtro determinista de baja latencia (0 tokens) para descartar egresados/ofertas trampa + inferencia con **Google Gemini (`gemini-3.8-flash`)** bajo esquemas estrictos Pydantic V2 (Chain-of-Thought) y protección con **Circuit Breaker**.
* **Persistencia Cloud Segura:** Base de datos PostgreSQL en Supabase con Row Level Security (RLS), búsqueda por texto completo en español (`to_tsvector('spanish', ...)`), y seguimiento de CRM multiusuario.
* **Frontend Web Reactivo:** Interfaz en Next.js 15 (App Router) con explorador de vacantes con filtros minuciosos de Lima sincronizados en la URL, tablero Kanban de seguimiento de postulaciones y gestión de perfil profesional.
* **CI/CD Automatizado:** Workflows en GitHub Actions que ejecutan escaneos 2 veces al día y sincronizan directamente con Supabase vía HTTPS sin alterar el historial Git.

---

## 🏛️ 2. Arquitectura del Monorepo

El repositorio está organizado como un **monorepo desacoplado** con tres capas principales:

```text
job_hunter_agent/
├── apps/
│   └── web/                     # Frontend Next.js 15 (App Router, Tailwind CSS v4, TypeScript)
│       ├── public/sources/      # Logos vectoriales/webp de los portales integrados
│       ├── src/
│       │   ├── actions/         # Server Actions (crm.ts, jobs.ts, profile.ts, schemas.ts)
│       │   ├── app/             # Rutas: / (radar), /pipeline (Kanban CRM), /profile, /login, /auth/callback
│       │   ├── components/      # Componentes UI (jobs, pipeline, profile, auth, brand, layout)
│       │   └── lib/             # Dominio, normalización Lima, filtros URL y clientes Supabase
│       └── tests/               # Pruebas unitarias y de componentes con Vitest
├── services/
│   └── pipeline/                # Pipeline Python de Extracción, Evaluación con IA y Persistencia
│       ├── adapters/            # Conectores: Bumeran, LinkedIn, Computrabajo, Practicas.pe, CVMatcher
│       ├── ai/                  # Grafo LangGraph, Gemini 3.8 Flash CoT, Circuit Breaker y Prompts
│       ├── config/              # Perfil base del candidato y keywords de búsqueda
│       ├── domain/              # Modelos Pydantic V2, empresas/agencias, normalización y ranking
│       ├── storage/             # Patrón Repository: JobRepository, SqliteRepository, SupabaseRepository
│       └── tests/               # Pruebas automatizadas con Pytest
├── supabase/
│   ├── config.toml              # Configuración local de Supabase CLI
│   └── migrations/              # Esquema DDL, políticas RLS, FTS en español y triggers
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
        Dedup["Deduplicador SHA-256\n+ Normalizador Lima & Marcas"]
        PreFilter["Pre-Filtro Determinista\n(0 tokens - Descarte de Egresados)"]
        CB["LangGraph + Circuit Breaker"]
        Gemini["Google Gemini 3.8 Flash\n(Chain-of-Thought + Pydantic V2)"]
        Repo["SupabaseRepository\n(services/pipeline/storage)"]
    end

    subgraph CloudDB ["3. Supabase Cloud (PostgreSQL + RLS)"]
        JobListings[("job_listings\n(Catálogo público)")]
        JobEvals[("job_evaluations\n(Scores & Análisis)")]
        Profiles[("profiles\n(Perfiles de usuario)")]
        UserJobStates[("user_job_states\n(CRM: to_apply, applied, ...)")]
    end

    subgraph Frontend ["4. Plataforma Web (apps/web - Next.js 15)"]
        Explorador["Radar de Vacantes (/)\nFiltros Lima + URL Sync + Drawer"]
        PipelineBoard["Tablero CRM (/pipeline)\nKanban por etapas + Notas"]
        ProfileForm["Perfil Profesional (/profile)\nPreferencias y exclusiones"]
        AuthSystem["Supabase Auth (SSR)\nEmail/Password + Google OAuth"]
    end

    Fuentes --> Scraper
    Scraper --> Dedup
    Dedup --> PreFilter
    PreFilter -->|Apta Preprofesional| CB
    CB <-->|Inferencia Estructurada| Gemini
    PreFilter -->|Evaluada| Repo
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
git clone https://github.com/tu-usuario/job_hunter_agent.git
cd job_hunter_agent

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
Ejecuta las migraciones SQL ubicadas en `supabase/migrations/` (comenzando por [`supabase/migrations/202611130001_initial_schema.sql`](file:///supabase/migrations/202611130001_initial_schema.sql)) desde el **SQL Editor** de tu panel de Supabase.

### Paso 3: Ejecutar el Pipeline de Extracción (Python)
```bash
pip install -r services/pipeline/requirements.txt
python services/pipeline/run.py --limit 40 --backend supabase
```

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
pytest services/pipeline/tests -v
```
*Cubre: adaptadores de scraping, contratos Pydantic V2, deduplicación SHA-256, normalización de distritos/niveles de Lima, esquemas SQL Supabase, políticas RLS y repositorios (`SqliteRepository` y `SupabaseRepository`).*

### Pruebas del Frontend Web (Next.js / Vitest & TypeScript)
```bash
cd apps/web
npm run test         # Pruebas unitarias de dominio, filtros URL, componentes y server actions
npm run lint         # Verificación de reglas ESLint
npm run typecheck    # Verificación estricta de tipos TypeScript (tsc --noEmit)
npm run build        # Compilación de producción Next.js
```

---

## ⚙️ 5. Automatización en la Nube (GitHub Actions)

El workflow [`.github/workflows/auto_scrape.yml`](file:///.github/workflows/auto_scrape.yml) se ejecuta automáticamente dos veces al día:
- **07:17 AM Hora Perú (12:17 UTC)**
- **02:23 PM Hora Perú (19:23 UTC)**
- También puede ejecutarse manualmente desde **Actions > Run workflow** en GitHub.

El workflow se conecta directamente a Supabase vía HTTPS utilizando `SUPABASE_SERVICE_ROLE_KEY` en **GitHub Secrets**, manteniendo limpio el historial Git del repositorio.

---

## 📖 6. Guía de Despliegue en Producción

Para desplegar la aplicación web en **Vercel**, configurar **Supabase Auth** y automatizar el pipeline, consulta:

👉 **[Ver Guía de Despliegue Paso a Paso (docs/DEPLOYMENT.md)](docs/DEPLOYMENT.md)**

---

## 📄 Licencia y Reconocimientos

Desarrollado con fines académicos y profesionales por **Joseph Pajuelo Cárdenas** (Universidad Tecnológica del Perú).
