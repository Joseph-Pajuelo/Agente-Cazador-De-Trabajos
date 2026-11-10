"""
Dashboard web del Job Hunter Agent — Estilo Otta / Wellfound Editorial Light.
Ejecutar con:  streamlit run app.py
"""
import hashlib
import html
import importlib
import json
import os
import re
import sys
from pathlib import Path

import streamlit as st

root_dir = Path(__file__).resolve().parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

import config.search as _cfg_search
import storage.database as _storage_db
import ai.matcher as _ai_matcher
import run as _run_mod

# Si Streamlit Cloud hizo hot-reload en caliente sin reiniciar el proceso Python,
# recargamos los submódulos en RAM para que tomen las nuevas funciones del último commit.
if not hasattr(_ai_matcher, "resolve_gemini_api_key") or not hasattr(_storage_db.DatabaseManager, "checkpoint"):
    importlib.reload(_cfg_search)
    importlib.reload(_storage_db)
    importlib.reload(_ai_matcher)
    importlib.reload(_run_mod)

from config.candidate_profile import CANDIDATE_PROFILE
from storage.database import DatabaseManager, APPLICATION_STATUSES
from domain.ranking import sort_by_modality_then_score, is_recommended, MODALITY_ORDER
from run import run_pipeline, get_adapters
from ai.matcher import JobMatcherAI, resolve_gemini_api_key

ENV_PATH = root_dir / ".env"

st.set_page_config(
    page_title="Radar de Prácticas · Joseph Pajuelo",
    page_icon="🎯",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# ---------------- Estilos CSS: Opción B (Otta / Wellfound Editorial Light) ----------------
st.markdown(
    """
    <style>
      /* Fondo general papel editorial limpio */
      .stApp {
        background-color: #F8FAFC !important;
        color: #0F172A !important;
      }
      .block-container {
        padding-top: 1.1rem !important;
        padding-bottom: 2.5rem !important;
        max-width: 1440px !important;
      }
      [data-testid="collapsedControl"] {display: none;}

      /* Contenedores con borde estilo tarjeta Otta */
      div[data-testid="stVerticalBlockBorderWrapper"] {
        background-color: #FFFFFF !important;
        border: 1px solid #E2E8F0 !important;
        border-radius: 14px !important;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04) !important;
        transition: all 0.15s ease-in-out;
      }
      div[data-testid="stVerticalBlockBorderWrapper"]:hover {
        border-color: #CBD5E1 !important;
        box-shadow: 0 4px 12px rgba(15, 23, 42, 0.06) !important;
      }

      /* Cabecera Editorial */
      .otta-header {
        background: #FFFFFF;
        border: 1px solid #E2E8F0;
        border-radius: 16px;
        padding: 16px 20px;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 12px;
        margin-bottom: 8px;
      }
      .otta-avatar-jp {
        width: 46px;
        height: 46px;
        border-radius: 12px;
        background: #EFF6FF;
        color: #2563EB;
        border: 1px solid #BFDBFE;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 800;
        font-size: 1.05rem;
        flex-shrink: 0;
      }
      .otta-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 4px 11px;
        border-radius: 999px;
        font-size: 0.78rem;
        font-weight: 600;
      }

      /* Tarjeta de vacante estilo Otta con Avatar de Empresa */
      .otta-card-row {
        display: flex;
        align-items: flex-start;
        gap: 13px;
        margin-bottom: 8px;
      }
      .company-avatar {
        width: 44px;
        height: 44px;
        border-radius: 11px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        font-weight: 800;
        font-size: 0.76rem;
        letter-spacing: -0.02em;
        flex-shrink: 0;
        line-height: 1.05;
      }
      .company-avatar-icon {
        font-size: 0.85rem;
        margin-bottom: 1px;
      }
      .job-title-text {
        font-size: 1.01rem;
        font-weight: 750;
        color: #0F172A;
        line-height: 1.3;
        margin-bottom: 2px;
      }
      .job-sub-text {
        font-size: 0.84rem;
        color: #64748B;
        margin-bottom: 7px;
      }

      /* Píldoras de metadatos y portales */
      .meta-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 9px;
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 600;
        margin-right: 5px;
        margin-bottom: 4px;
      }
      .match-pill-high {background: #DCFCE7; color: #15803D; border: 1px solid #BBF7D0;}
      .match-pill-mid  {background: #FEF9C3; color: #A16207; border: 1px solid #FDE047;}
      .match-pill-low  {background: #FEE2E2; color: #B91C1C; border: 1px solid #FECACA;}

      /* Etiquetas de Skills */
      .skill-tag {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background: #EFF6FF;
        color: #1E40AF;
        border: 1px solid #BFDBFE;
        padding: 3px 10px;
        border-radius: 8px;
        margin: 2px 5px 3px 0;
        font-size: 0.8rem;
        font-weight: 600;
      }
      .skill-tag-miss {
        background: #FFF1F2;
        color: #BE123C;
        border: 1px solid #FECDD3;
      }

      /* Caja de Elevator Pitch Editorial */
      .otta-pitch-banner {
        background: #ECFDF5;
        border-left: 4px solid #10B981;
        border-top: 1px solid #A7F3D0;
        border-right: 1px solid #A7F3D0;
        border-bottom: 1px solid #A7F3D0;
        padding: 10px 14px;
        border-radius: 0 10px 10px 0;
        color: #065F46;
        font-size: 0.85rem;
        font-weight: 600;
        margin-bottom: 6px;
      }
    </style>
    """,
    unsafe_allow_html=True,
)


def as_list(value):
    if isinstance(value, list):
        return value
    try:
        return json.loads(value) if value else []
    except (TypeError, json.JSONDecodeError):
        return []


# ---------------- Generador Inteligente de Avatares e Íconos ----------------
KNOWN_BRANDS = [
    (["bcp", "banco de credito", "banco de crédito", "credicorp"], "BCP", "🏦", "#EFF6FF", "#1D4ED8", "#BFDBFE"),
    (["interbank", "intercorp"], "IBK", "🏦", "#ECFDF5", "#047857", "#A7F3D0"),
    (["bbva"], "BBVA", "🏦", "#EFF6FF", "#1E3A8A", "#93C5FD"),
    (["scotiabank", "scotia"], "SCT", "🏦", "#FFF1F2", "#BE123C", "#FECDD3"),
    (["banbif"], "BIF", "🏦", "#F0F9FF", "#0369A1", "#BAE6FD"),
    (["pichincha"], "PCH", "🏦", "#FEFCE8", "#A16207", "#FEF08A"),
    (["alicorp"], "ALI", "🏭", "#FFF1F2", "#E11D48", "#FECDD3"),
    (["sonda"], "SND", "💻", "#EEF2FF", "#4338CA", "#C7D2FE"),
    (["ntt data", "nttdata", "everis"], "NTT", "💻", "#EFF6FF", "#0284C7", "#BAE6FD"),
    (["indra", "minsait"], "IND", "💻", "#F5F3FF", "#6D28D9", "#DDD6FE"),
    (["globant"], "GLB", "🚀", "#F0FDF4", "#15803D", "#BBF7D0"),
    (["stefanini"], "STF", "💻", "#EEF2FF", "#3730A3", "#C7D2FE"),
    (["rimac", "rímac"], "RIM", "🛡️", "#FFF1F2", "#BE123C", "#FECDD3"),
    (["pacifico", "pacífico"], "PAC", "🛡️", "#F0F9FF", "#0284C7", "#BAE6FD"),
    (["mapfre"], "MAP", "🛡️", "#FEF2F2", "#DC2626", "#FECACA"),
    (["claro", "america movil"], "CLR", "📡", "#FEF2F2", "#DC2626", "#FECACA"),
    (["entel"], "ENT", "📡", "#EFF6FF", "#1D4ED8", "#BFDBFE"),
    (["telefonica", "telefónica", "movistar"], "MOV", "📡", "#F0F9FF", "#0369A1", "#BAE6FD"),
    (["ferreyros", "ferreycorp"], "FER", "⚙️", "#FEFCE8", "#B45309", "#FDE68A"),
    (["antamina", "minsur", "buenaventura", "las bambas", "cerro verde"], "MIN", "⛏️", "#FFFBEB", "#B45309", "#FDE68A"),
    (["sunat", "minedu", "ministerio", "osinergmin", "indecopi", "bcrp", "contraloria"], "GOB", "🏛️", "#F1F5F9", "#334155", "#CBD5E1"),
    (["utp", "universidad", "pucp", "upn", "upc"], "EDU", "🎓", "#F5F3FF", "#6D28D9", "#DDD6FE"),
]

FALLBACK_PALETTES = [
    ("#EFF6FF", "#1D4ED8", "#BFDBFE"),  # Azul cobalto
    ("#ECFDF5", "#047857", "#A7F3D0"),  # Esmeralda
    ("#F5F3FF", "#6D28D9", "#DDD6FE"),  # Violeta
    ("#FFFBEB", "#B45309", "#FDE68A"),  # Ámbar
    ("#F0F9FF", "#0369A1", "#BAE6FD"),  # Cian oscuro
    ("#FDF2F8", "#BE185D", "#FBCFE8"),  # Rosa editorial
]


def get_company_avatar_html(company: str) -> str:
    """Genera un avatar cuadrado estilo Otta con siglas e ícono según la empresa."""
    clean = (company or "Empresa").strip()
    low = clean.lower()

    if "confidencial" in low or "no especificado" in low:
        return (
            "<div class='company-avatar' style='background:#F1F5F9;color:#475569;border:1px solid #CBD5E1;' "
            "title='Empresa en reserva'>"
            "<span class='company-avatar-icon'>🔒</span><span>EMP</span></div>"
        )

    for keywords, code, icon, bg, fg, border in KNOWN_BRANDS:
        if any(k in low for k in keywords):
            return (
                f"<div class='company-avatar' style='background:{bg};color:{fg};border:1px solid {border};' "
                f"title='{html.escape(clean)}'>"
                f"<span class='company-avatar-icon'>{icon}</span><span>{code}</span></div>"
            )

    # Monograma automático de 2-3 letras
    words = [w for w in re.split(r"[\s\-\.,()]+", clean) if len(w) > 1 and w.lower() not in ("de", "del", "la", "el", "los", "las", "sac", "s.a.c", "peru", "perú", "s.a", "sa")]
    if len(words) >= 2:
        initials = (words[0][0] + words[1][0] + (words[2][0] if len(words) > 2 else "")).upper()
    elif words:
        initials = words[0][:3].upper()
    else:
        initials = "EMP"

    idx = int(hashlib.md5(low.encode("utf-8")).hexdigest()[:4], 16) % len(FALLBACK_PALETTES)
    bg, fg, border = FALLBACK_PALETTES[idx]
    return (
        f"<div class='company-avatar' style='background:{bg};color:{fg};border:1px solid {border};' "
        f"title='{html.escape(clean)}'>"
        f"<span class='company-avatar-icon'>🏢</span><span>{html.escape(initials)}</span></div>"
    )


def get_role_category_icon(title: str) -> str:
    """Devuelve un ícono diferencial según la especialidad del puesto."""
    low = (title or "").lower()
    if any(k in low for k in ("inteligencia artificial", "ia", "ai", "automatiz", "rpa", "machine learning")):
        return "🤖"
    if any(k in low for k in ("datos", "data", "bi", "business intelligence", "analítica", "analytics", "power bi", "indicadores")):
        return "📊"
    if any(k in low for k in ("software", "desarrollo", "developer", "backend", "frontend", "fullstack", "programador", "web", "java", "python")):
        return "💻"
    if any(k in low for k in ("seguridad", "ciberseguridad", "redes", "infraestructura", "cloud", "soporte")):
        return "🛡️"
    if any(k in low for k in ("comercial", "finanzas", "riesgos", "operaciones", "procesos", "proyectos")):
        return "📈"
    return "🖥️"


def get_portal_badge_html(source: str) -> str:
    """Genera una píldora con ícono propio por cada portal de empleo."""
    src = (source or "").lower()
    portal_styles = {
        "bumeran": ("🅱️ Bumeran", "#FFF1F2", "#BE123C", "#FECDD3"),
        "linkedin": ("💼 LinkedIn", "#EFF6FF", "#0A66C2", "#BFDBFE"),
        "practicas_pe": ("🎓 Practicas.pe", "#F0F9FF", "#0369A1", "#BAE6FD"),
        "computrabajo": ("🧭 CompuTrabajo", "#FFFBEB", "#B45309", "#FDE68A"),
        "cvmatcher": ("⚡ CVMatcher", "#F5F3FF", "#6D28D9", "#DDD6FE"),
    }
    label, bg, fg, border = portal_styles.get(src, (f"🌐 {src}", "#F1F5F9", "#475569", "#CBD5E1"))
    return f"<span class='meta-badge' style='background:{bg};color:{fg};border:1px solid {border};'>{label}</span>"


def get_modality_badge_html(modality: str) -> str:
    """Genera una píldora con ícono claro según la modalidad."""
    low = (modality or "").lower()
    if "híbrido" in low or "hibrido" in low:
        return "<span class='meta-badge' style='background:#DCFCE7;color:#15803D;border:1px solid #86EFAC;'>🏢🏠 Híbrido</span>"
    if "presencial" in low:
        return "<span class='meta-badge' style='background:#DBEAFE;color:#1E40AF;border:1px solid #93C5FD;'>🏢 Presencial</span>"
    if "remoto" in low:
        return "<span class='meta-badge' style='background:#F3E8FF;color:#6B21A8;border:1px solid #D8B4FE;'>🏠 Remoto</span>"
    return "<span class='meta-badge' style='background:#F1F5F9;color:#475569;border:1px solid #CBD5E1;'>📍 Por definir</span>"


def get_score_pill_html(score: float) -> str:
    if score >= 75:
        cls = "match-pill-high"
        icon = "🔥"
    elif score >= 60:
        cls = "match-pill-mid"
        icon = "✨"
    else:
        cls = "match-pill-low"
        icon = "•"
    return f"<span class='meta-badge {cls}' style='font-size:0.8rem;padding:3px 10px;'>{icon} {score:.0f}% Match</span>"


# ---------------- Gestión de Estado y Memoria Persistente ----------------
def refresh_jobs_in_state():
    """Carga todas las vacantes desde SQLite + crm_memory.json hacia st.session_state."""
    st.session_state["jobs_data"] = DatabaseManager().get_all_evaluated_jobs()


if "jobs_data" not in st.session_state:
    refresh_jobs_in_state()

if "selected_job_id" not in st.session_state:
    st.session_state["selected_job_id"] = None

if "crm_quick_tab" not in st.session_state:
    st.session_state["crm_quick_tab"] = "🌐 Activas"

if "page_number" not in st.session_state:
    st.session_state["page_number"] = 0


def update_job_crm(job_id: int, new_status: str, notes: str | None = None):
    """
    Actualiza el estado CRM ('⭐ Favorita', '🚀 Postulado', etc.) y notas tanto en SQLite + crm_memory.json
    como inmediatamente en la memoria en vivo de la sesión, manteniendo seleccionada la vacante.
    """
    db = DatabaseManager()
    db.update_application_status(int(job_id), new_status, notes=notes)

    for item in st.session_state.get("jobs_data", []):
        if int(item["id"]) == int(job_id):
            item["application_status"] = new_status
            if notes is not None:
                item["user_notes"] = notes
            break

    st.session_state["selected_job_id"] = int(job_id)


all_adapter_names = [a.name for a in get_adapters()]
active_api_key = resolve_gemini_api_key()
all_loaded_jobs = st.session_state.get("jobs_data", [])
fav_total = sum(1 for j in all_loaded_jobs if j.get("application_status") == "⭐ Favorita")
applied_total = sum(1 for j in all_loaded_jobs if j.get("application_status") in ("🚀 Postulado", "🎤 En entrevista"))
last_eval_str = max((j.get("evaluated_at") or "" for j in all_loaded_jobs), default="")[:16] or "—"

# ---------------- Cabecera Editorial (Estilo Otta B) ----------------
hdr_col1, hdr_col2, hdr_col3 = st.columns([3.5, 1.05, 1.05], vertical_alignment="center")

with hdr_col1:
    ai_pill = (
        f"<span class='otta-pill' style='background:#ECFDF5;color:#047857;border:1px solid #A7F3D0;'>🟢 Gemini Activo</span>"
        if active_api_key
        else "<span class='otta-pill' style='background:#FEF9C3;color:#854D0E;border:1px solid #FDE047;'>🟡 Modo Heurístico</span>"
    )
    st.markdown(
        f"""
        <div class='otta-header'>
          <div style='display:flex;align-items:center;gap:14px;'>
            <div class='otta-avatar-jp'>JP</div>
            <div>
              <div style='font-size:1.18rem;font-weight:800;color:#0F172A;line-height:1.2;'>
                Radar de Prácticas · {html.escape(CANDIDATE_PROFILE['name'])}
              </div>
              <div style='font-size:0.83rem;color:#64748B;margin-top:2px;'>
                🎓 Ing. de Sistemas e Informática (UTP · 8vo ciclo) &nbsp;·&nbsp; 📍 Base: Ate / La Molina / San Isidro &nbsp;·&nbsp; 🕒 Últ. act.: {last_eval_str}
              </div>
            </div>
          </div>
          <div style='display:flex;gap:8px;flex-wrap:wrap;'>
            <span class='otta-pill' style='background:#FEF9C3;color:#854D0E;border:1px solid #FDE047;'>⭐ {fav_total} Favoritas</span>
            <span class='otta-pill' style='background:#EFF6FF;color:#1D4ED8;border:1px solid #BFDBFE;'>🚀 {applied_total} Postuladas</span>
            {ai_pill}
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

with hdr_col2:
    with st.popover("🔎 Buscar Vacantes", use_container_width=True):
        st.markdown("#### 🌐 Escaneo Multi-Portal")
        selected_portals = st.multiselect(
            "Portales a escanear",
            options=all_adapter_names,
            default=all_adapter_names,
        )
        limit = st.slider("Vacantes por portal", 3, 25, 10)
        reeval = st.checkbox("Re-evaluar vacantes guardadas", value=False)

        if st.button("🚀 Iniciar búsqueda ahora", type="primary", use_container_width=True):
            progress_bar = st.progress(0.0, text="Iniciando escaneo...")

            def _update_progress(msg: str, pct: float):
                progress_bar.progress(min(max(pct, 0.0), 1.0), text=msg)

            summary = run_pipeline(
                limit_per_source=limit,
                generate_pdf=False,
                selected_adapters=selected_portals,
                reevaluate_all=reeval,
                on_progress=_update_progress,
            )
            refresh_jobs_in_state()
            st.success(
                f"¡Listo! {summary['extracted']} extraídas ({summary['new']} nuevas) · "
                f"{summary['recommended']} recomendadas · Motor: {summary['ai_engine']}"
            )
            st.rerun()

with hdr_col3:
    with st.popover("⚙️ Motor IA y Memoria", use_container_width=True):
        st.markdown("#### 🤖 Clave de Google Gemini")
        if active_api_key:
            st.success(f"Clave activa ({JobMatcherAI.MODEL_ID})", icon="✅")
        else:
            st.warning("Sin clave API (usando motor heurístico)", icon="⚠️")

        st.caption(
            "💡 **Para no volver a pegarla nunca más en Streamlit Cloud:** ve a *Manage app → Settings → Secrets* "
            "y añade:\n`GEMINI_API_KEY = \"tu_clave\"`"
        )
        key_input = st.text_input(
            "O pega tu GEMINI_API_KEY aquí:",
            type="password",
            placeholder="AIzaSy...",
        )
        if st.button("💾 Guardar clave", use_container_width=True):
            if key_input.strip():
                clean_k = key_input.strip()
                st.session_state["GEMINI_API_KEY"] = clean_k
                os.environ["GEMINI_API_KEY"] = clean_k
                try:
                    ENV_PATH.write_text(f"GEMINI_API_KEY={clean_k}\n", encoding="utf-8")
                except Exception:
                    pass
                st.success("¡Clave guardada en memoria!")
                st.rerun()

        st.divider()
        st.caption(
            "☁️ **Auto-Scan Cloud activo:** El radar busca vacantes automáticamente a las **7:00 AM y 2:00 PM** "
            "y mantiene viva la app 24/7."
        )

if not all_loaded_jobs:
    st.info("Aún no hay vacantes registradas. Haz clic en **🔎 Buscar Vacantes** arriba a la derecha.")
    st.stop()


# ---------------- Workspace Reactivo (Filtros Editorial + Master-Detail con Íconos) ----------------
@st.fragment
def render_interactive_workspace():
    all_jobs = st.session_state.get("jobs_data", [])

    # 1. Contadores rápidos por estado CRM
    counts = {s: 0 for s in APPLICATION_STATUSES}
    for j in all_jobs:
        st_val = j.get("application_status") or "📋 Por postular"
        if st_val in counts:
            counts[st_val] += 1

    active_count = (
        counts["📋 Por postular"]
        + counts["⭐ Favorita"]
        + counts["🚀 Postulado"]
        + counts["🎤 En entrevista"]
    )

    # 2. Barra de Filtros Horizontales Estilo Otta (Arriba)
    with st.container(border=True):
        tab_options = {
            "🌐 Activas": f"🌐 Todas Activas ({active_count})",
            "📋 Por postular": f"📋 Por postular ({counts['📋 Por postular']})",
            "⭐ Favorita": f"⭐ Destacadas ({counts['⭐ Favorita']})",
            "🚀 Postulado": f"🚀 Postuladas ({counts['🚀 Postulado']})",
            "🎤 En entrevista": f"🎤 En entrevista ({counts['🎤 En entrevista']})",
            "❌ Descartada por mí": f"❌ Descartadas ({counts['❌ Descartada por mí']})",
            "📂 Todas": f"📂 Catálogo ({len(all_jobs)})",
        }
        reverse_tab_map = {v: k for k, v in tab_options.items()}
        current_tab_key = st.session_state.get("crm_quick_tab", "🌐 Activas")
        if current_tab_key not in tab_options:
            current_tab_key = "🌐 Activas"

        selected_tab_label = st.segmented_control(
            "Clasificación CRM",
            options=list(tab_options.values()),
            default=tab_options[current_tab_key],
            label_visibility="collapsed",
        )
        if selected_tab_label and reverse_tab_map.get(selected_tab_label) != current_tab_key:
            st.session_state["crm_quick_tab"] = reverse_tab_map[selected_tab_label]
            current_tab_key = st.session_state["crm_quick_tab"]
            st.session_state["page_number"] = 0

        f_col1, f_col2, f_col3, f_col4, f_col5 = st.columns([2.2, 1.45, 1.45, 1.05, 1.45])
        with f_col1:
            query = st.text_input(
                "🔍 Buscar por puesto, empresa, tecnología o distrito",
                placeholder="Ej: Python, BCP, Interbank, Power BI, San Isidro...",
            )
        with f_col2:
            modalities = st.multiselect(
                "🏢 Modalidad",
                options=list(MODALITY_ORDER.keys()),
                default=list(MODALITY_ORDER.keys()),
            )
        with f_col3:
            source_options = ["practicas_pe", "bumeran", "linkedin", "computrabajo", "cvmatcher"]
            selected_sources = st.multiselect(
                "🌐 Portales",
                options=source_options,
                default=source_options,
            )
        with f_col4:
            min_score = st.slider("🎯 Match mín. (%)", 0, 100, 50)
        with f_col5:
            order = st.selectbox(
                "↕️ Ordenar por",
                options=[
                    "Modalidad (Híbrido > Presencial > Remoto) + Match",
                    "Mayor % de Match",
                ],
            )
            show_discarded_ai = st.checkbox("Mostrar descartadas por IA (egresados/humo)", value=False)

    # 3. Aplicar filtrado
    if current_tab_key == "🌐 Activas":
        allowed_statuses = {"📋 Por postular", "⭐ Favorita", "🚀 Postulado", "🎤 En entrevista"}
    elif current_tab_key == "📂 Todas":
        allowed_statuses = set(APPLICATION_STATUSES)
    else:
        allowed_statuses = {current_tab_key}

    filtered = []
    for j in all_jobs:
        job_status = j.get("application_status") or "📋 Por postular"
        if job_status not in allowed_statuses:
            continue
        is_user_saved = job_status in ("⭐ Favorita", "🚀 Postulado", "🎤 En entrevista")
        if not show_discarded_ai and not is_user_saved and not is_recommended(j, 0):
            continue
        if float(j["final_ranking_score"]) < min_score and not is_user_saved:
            continue
        if modalities and j["modality"] not in modalities:
            continue
        if selected_sources and j["source"] not in selected_sources:
            continue
        if query:
            haystack = f"{j['title']} {j['company']} {j['location']} {j.get('matching_skills', '')}".lower()
            if query.lower().strip() not in haystack:
                continue
        filtered.append(j)

    if order.startswith("Modalidad"):
        filtered = sort_by_modality_then_score(filtered)
    else:
        filtered = sorted(filtered, key=lambda j: -float(j["final_ranking_score"]))

    if not filtered:
        st.warning("No se encontraron vacantes con esos filtros. Prueba reduciendo el Match mínimo o cambiando de pestaña CRM.")
        return

    # Garantizar que exista una vacante seleccionada válida en memoria
    filtered_ids = [int(j["id"]) for j in filtered]
    if st.session_state.get("selected_job_id") not in filtered_ids:
        st.session_state["selected_job_id"] = filtered_ids[0]

    active_job_id = int(st.session_state["selected_job_id"])
    active_job = next((j for j in filtered if int(j["id"]) == active_job_id), filtered[0])

    # 4. Vista Dividida Estilo Otta (Izquierda: Tarjetas con Avatar e Íconos | Derecha: Ficha Editorial)
    list_col, detail_col = st.columns([1.22, 1.18], gap="large")

    with list_col:
        PAGE_SIZE = 10
        total_pages = max(1, (len(filtered) + PAGE_SIZE - 1) // PAGE_SIZE)
        cur_page = min(max(0, st.session_state.get("page_number", 0)), total_pages - 1)
        start_idx = cur_page * PAGE_SIZE
        page_items = filtered[start_idx : start_idx + PAGE_SIZE]

        hdr_l, hdr_r = st.columns([2.2, 1], vertical_alignment="center")
        with hdr_l:
            hybrid_cnt = sum(1 for j in filtered if j["modality"] == "Híbrido")
            st.markdown(
                f"##### 🎯 {len(filtered)} Convocatorias &nbsp;<span style='font-size:0.8rem;font-weight:500;color:#64748B;'>"
                f"({hybrid_cnt} híbridas)</span>",
                unsafe_allow_html=True,
            )
        with hdr_r:
            if total_pages > 1:
                p_prev, p_info, p_next = st.columns([1, 1.5, 1], vertical_alignment="center")
                if p_prev.button("◀", disabled=(cur_page == 0), key="pg_prev", use_container_width=True):
                    st.session_state["page_number"] = cur_page - 1
                    st.rerun(scope="fragment")
                p_info.caption(f"Pág. {cur_page + 1}/{total_pages}")
                if p_next.button("▶", disabled=(cur_page >= total_pages - 1), key="pg_next", use_container_width=True):
                    st.session_state["page_number"] = cur_page + 1
                    st.rerun(scope="fragment")

        for j in page_items:
            jid = int(j["id"])
            is_selected = jid == active_job_id
            j_status = j.get("application_status") or "📋 Por postular"
            is_fav = j_status == "⭐ Favorita"
            is_applied = j_status == "🚀 Postulado"
            score_val = float(j["final_ranking_score"])

            avatar_html = get_company_avatar_html(j["company"])
            role_icon = get_role_category_icon(j["title"])
            mod_badge = get_modality_badge_html(j["modality"])
            portal_badge = get_portal_badge_html(j["source"])
            score_pill = get_score_pill_html(score_val)
            salary_str = html.escape(j.get("salary") or "Sueldo de ley")

            status_badge = ""
            if is_fav:
                status_badge = "<span class='meta-badge' style='background:#FEF9C3;color:#854D0E;border:1px solid #FDE047;'>⭐ Destacada</span>"
            elif is_applied:
                status_badge = "<span class='meta-badge' style='background:#EFF6FF;color:#1D4ED8;border:1px solid #BFDBFE;'>🚀 Postulado</span>"
            elif j_status != "📋 Por postular":
                status_badge = f"<span class='meta-badge' style='background:#F1F5F9;color:#334155;border:1px solid #CBD5E1;'>{html.escape(j_status)}</span>"

            active_indicator = (
                "<span class='meta-badge' style='background:#2563EB;color:#FFFFFF;'>👉 Viendo ahora</span>"
                if is_selected
                else ""
            )

            with st.container(border=True):
                st.markdown(
                    f"""
                    <div class='otta-card-row'>
                      {avatar_html}
                      <div style='flex:1;min-width:0;'>
                        <div style='display:flex;justify-content:space-between;align-items:flex-start;gap:8px;'>
                          <div class='job-title-text'>{role_icon} {html.escape(j['title'])}</div>
                          <div style='flex-shrink:0;'>{score_pill}</div>
                        </div>
                        <div class='job-sub-text'>
                          <b>{html.escape(j['company'])}</b> &nbsp;·&nbsp; 📍 {html.escape(j['location'])} &nbsp;·&nbsp; 💰 {salary_str}
                        </div>
                        <div>
                          {active_indicator}{status_badge}{mod_badge}{portal_badge}
                        </div>
                      </div>
                    </div>
                    """,
                    unsafe_allow_html=True,
                )

                act1, act2, act3, act4 = st.columns([1.75, 1.15, 1.2, 1.0])
                if act1.button(
                    "👁️ Viendo Detalle" if is_selected else "📄 Ver Pitch y Detalle",
                    key=f"sel_{jid}",
                    type="primary" if is_selected else "secondary",
                    use_container_width=True,
                ):
                    st.session_state["selected_job_id"] = jid
                    st.rerun(scope="fragment")

                if act2.button(
                    "⭐ Favorita" if is_fav else "☆ Destacar",
                    key=f"fav_{jid}",
                    type="primary" if is_fav else "secondary",
                    use_container_width=True,
                ):
                    new_st = "📋 Por postular" if is_fav else "⭐ Favorita"
                    update_job_crm(jid, new_st)
                    st.toast(f"{j['company']}: {new_st}")
                    st.rerun(scope="fragment")

                if act3.button(
                    "🚀 Postulado" if is_applied else "✓ Postularé",
                    key=f"app_{jid}",
                    type="primary" if is_applied else "secondary",
                    use_container_width=True,
                ):
                    new_st = "📋 Por postular" if is_applied else "🚀 Postulado"
                    update_job_crm(jid, new_st)
                    st.toast(f"{j['company']}: {new_st}")
                    st.rerun(scope="fragment")

                act4.link_button("🔗 Portal ↗", j["url"], use_container_width=True)

    # 5. Panel Derecho: Ficha Editorial de la Vacante Seleccionada
    with detail_col:
        with st.container(border=True):
            job = active_job
            cur_status = job.get("application_status") or "📋 Por postular"
            det_avatar = get_company_avatar_html(job["company"])
            det_role_icon = get_role_category_icon(job["title"])
            det_score_pill = get_score_pill_html(float(job["final_ranking_score"]))
            det_mod_badge = get_modality_badge_html(job["modality"])
            det_portal_badge = get_portal_badge_html(job["source"])

            # Selector rápido en la parte superior del panel derecho
            id_to_label = {
                int(item["id"]): f"{idx + 1}. {get_role_category_icon(item['title'])} {item['title']} — {item['company']} ({float(item['final_ranking_score']):.0f}%)"
                for idx, item in enumerate(filtered)
            }
            chosen_id = st.selectbox(
                "Cambio rápido de vacante:",
                options=filtered_ids,
                index=filtered_ids.index(active_job_id),
                format_func=lambda x: id_to_label.get(x, str(x)),
                label_visibility="collapsed",
            )
            if int(chosen_id) != active_job_id:
                st.session_state["selected_job_id"] = int(chosen_id)
                st.rerun(scope="fragment")

            # Encabezado con Avatar e Íconos de la Vacante Activa
            st.markdown(
                f"""
                <div style='display:flex;align-items:flex-start;gap:14px;margin-top:6px;margin-bottom:10px;'>
                  {det_avatar}
                  <div style='flex:1;'>
                    <div style='font-size:1.18rem;font-weight:800;color:#0F172A;line-height:1.25;'>
                      {det_role_icon} {html.escape(job['title'])}
                    </div>
                    <div style='font-size:0.9rem;color:#475569;margin-top:3px;margin-bottom:8px;'>
                      🏢 <b>{html.escape(job['company'])}</b> &nbsp;·&nbsp; 📍 {html.escape(job['location'])} &nbsp;·&nbsp;
                      💰 {html.escape(job.get('salary') or 'Remuneración de ley')}
                    </div>
                    <div>
                      {det_score_pill}{det_mod_badge}{det_portal_badge}
                      <span class='meta-badge' style='background:#F8FAFC;color:#334155;border:1px solid #CBD5E1;'>
                        Afinidad técnica: {float(job['technical_match_score']) * 100:.0f}%
                      </span>
                    </div>
                  </div>
                </div>
                """,
                unsafe_allow_html=True,
            )

            st.link_button(
                "🔗 Abrir Convocatoria Oficial para Postular ↗",
                job["url"],
                type="primary",
                use_container_width=True,
            )

            st.markdown("###### 📌 Clasificar estado *(se guarda en memoria al instante)*")
            b_cols = st.columns(len(APPLICATION_STATUSES))
            for col, status_option in zip(b_cols, APPLICATION_STATUSES):
                is_cur = cur_status == status_option
                short_label = status_option.replace("Descartada por mí", "Descartar")
                if col.button(
                    short_label,
                    key=f"det_status_{job['id']}_{status_option}",
                    type="primary" if is_cur else "secondary",
                    use_container_width=True,
                ):
                    update_job_crm(int(job["id"]), status_option)
                    st.toast(f"Estado guardado: {status_option}")
                    st.rerun(scope="fragment")

            st.markdown(
                "<div class='otta-pitch-banner'>🚀 Elevator Pitch Personalizado — Haz clic en el ícono de copiar en la esquina del recuadro:</div>",
                unsafe_allow_html=True,
            )
            st.code(job["pitch_recommendation"], language=None, wrap_lines=True)

            st.markdown("###### 💡 Veredicto y Análisis de Compatibilidad")
            st.info(job["verdict_summary"])

            sk_col1, sk_col2 = st.columns(2)
            with sk_col1:
                st.markdown("###### ✅ Habilidades que hacen match")
                matching_list = as_list(job.get("matching_skills"))
                st.markdown(
                    " ".join(f"<span class='skill-tag'>✓ {html.escape(s)}</span>" for s in matching_list) or "—",
                    unsafe_allow_html=True,
                )
            with sk_col2:
                missing_list = as_list(job.get("missing_skills"))
                st.markdown("###### 📌 Requisitos deseables a reforzar")
                st.markdown(
                    " ".join(f"<span class='skill-tag skill-tag-miss'>+ {html.escape(s)}</span>" for s in missing_list)
                    if missing_list
                    else "<span style='color:#15803D;font-size:0.85rem;font-weight:600;'>✨ Ninguna brecha crítica detectada</span>",
                    unsafe_allow_html=True,
                )

            st.divider()
            st.markdown("###### 📝 Tus notas sobre esta postulación")
            notes_val = st.text_area(
                "Notas",
                value=job.get("user_notes") or "",
                placeholder="Ej: Envié CV enfocado en Python y Power BI / Me contactaron por WhatsApp...",
                key=f"notes_input_{job['id']}",
                label_visibility="collapsed",
                height=75,
            )
            if st.button("💾 Guardar nota personal", key=f"save_note_btn_{job['id']}", use_container_width=True):
                update_job_crm(int(job["id"]), cur_status, notes=notes_val)
                st.toast("📝 Nota guardada en memoria.")
                st.rerun(scope="fragment")

            with st.expander("📄 Ver descripción completa del anuncio"):
                st.text(job.get("raw_description") or "Sin descripción adicional.")


render_interactive_workspace()
