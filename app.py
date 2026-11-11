"""
Dashboard web del Job Hunter Agent — Estilo Editorial Limpio con Buscador Inteligente y LangGraph + CoT.
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

# Módulos internos del proyecto en orden de dependencia (hojas primero).
_PROJECT_MODULES = (
    "config.search",
    "config.candidate_profile",
    "domain.enums",
    "domain.models",
    "domain.companies",
    "domain.ranking",
    "domain.search_engine",
    "storage.database",
    "ai.prompts",
    "ai.graph",
    "ai.matcher",
    "adapters.base",
    "adapters.practicas_pe",
    "adapters.bumeran",
    "adapters.linkedin",
    "adapters.computrabajo",
    "adapters.cvmatcher",
    "delivery.pdf_report",
    "run",
)


def _hot_reload_stale_project_modules() -> None:
    """
    Streamlit Cloud aplica los nuevos commits re-ejecutando app.py, pero NO reinicia el proceso
    Python: los submódulos ya importados siguen en sys.modules con el código viejo y cualquier
    `from x import funcion_nueva` lanza ImportError. Aquí comparamos la fecha de modificación de
    cada archivo con la del momento en que se cargó y, si alguno cambió, recargamos todos los
    módulos del proyecto en orden de dependencia (así nunca quedan referencias mezcladas).
    """
    stale = False
    for name in _PROJECT_MODULES:
        mod = sys.modules.get(name)
        if mod is None or not getattr(mod, "__file__", None):
            continue
        try:
            mtime = os.path.getmtime(mod.__file__)
        except OSError:
            continue
        if getattr(mod, "__loaded_mtime__", None) != mtime:
            stale = True
            break

    for name in _PROJECT_MODULES:
        try:
            mod = sys.modules.get(name)
            mod = importlib.reload(mod) if (stale and mod is not None) else importlib.import_module(name)
            mod.__loaded_mtime__ = os.path.getmtime(mod.__file__)
        except Exception as exc:  # un módulo opcional roto no debe tumbar el dashboard
            print(f"[hot-reload] No se pudo cargar {name}: {exc}", file=sys.stderr)


_hot_reload_stale_project_modules()

from config.candidate_profile import CANDIDATE_PROFILE
from storage.database import DatabaseManager, APPLICATION_STATUSES, _resolve_github_token
from domain.ranking import (
    sort_by_modality_then_score,
    is_recommended,
    is_job_recent,
    get_job_age_pill_html,
    MODALITY_ORDER,
)
from domain.companies import resolve_employer
from domain.search_engine import search_jobs
from run import run_pipeline, get_adapters
from ai.matcher import JobMatcherAI, resolve_gemini_api_key

ENV_PATH = root_dir / ".env"

st.set_page_config(
    page_title="Radar de Prácticas · Joseph Pajuelo",
    page_icon="🎯",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# ---------------- Estilos CSS: Paleta Editorial Armónica (Slate & Navy) ----------------
st.markdown(
    """
    <style>
      .stApp {
        background-color: #F8FAFC !important;
        color: #0F172A !important;
      }
      /* Hacer transparente la barra superior de Streamlit y dar espacio real arriba para que NO corte el título */
      header[data-testid="stHeader"] {
        background: transparent !important;
        height: 2.2rem !important;
      }
      .block-container {
        padding-top: 2.8rem !important;
        padding-bottom: 2.5rem !important;
        max-width: 1420px !important;
      }
      [data-testid="collapsedControl"] {display: none;}

      /* Contenedores con borde estilo tarjeta editorial */
      div[data-testid="stVerticalBlockBorderWrapper"] {
        background-color: #FFFFFF !important;
        border: 1px solid #E2E8F0 !important;
        border-radius: 12px !important;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03) !important;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }
      div[data-testid="stVerticalBlockBorderWrapper"]:hover {
        border-color: #CBD5E1 !important;
      }

      /* Suavizar los chips de st.multiselect para que combinen con la paleta editorial */
      span[data-baseweb="tag"] {
        background-color: #EEF2FF !important;
        color: #1E3A8A !important;
        border: 1px solid #C7D2FE !important;
        border-radius: 6px !important;
        font-weight: 500 !important;
        font-size: 0.78rem !important;
      }
      span[data-baseweb="tag"] span {
        color: #1E3A8A !important;
      }

      /* Cabecera Editorial */
      .editorial-header {
        background: #FFFFFF;
        border: 1px solid #E2E8F0;
        border-radius: 14px;
        padding: 16px 22px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 14px;
        margin-bottom: 6px;
      }
      .avatar-jp {
        width: 44px;
        height: 44px;
        border-radius: 10px;
        background: #1E3A8A;
        color: #FFFFFF;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 0.98rem;
        letter-spacing: 0.02em;
        flex-shrink: 0;
      }
      .stat-chip {
        display: inline-flex;
        align-items: center;
        padding: 4px 11px;
        border-radius: 999px;
        font-size: 0.76rem;
        font-weight: 600;
        background: #F1F5F9;
        color: #334155;
        border: 1px solid #E2E8F0;
      }
      .stat-chip-active {
        background: #ECFDF5;
        color: #065F46;
        border: 1px solid #A7F3D0;
      }

      /* Tarjeta de vacante con Monograma limpio (sin iconos apilados) */
      .card-row {
        display: flex;
        align-items: flex-start;
        gap: 13px;
        margin-bottom: 8px;
      }
      .company-monogram {
        width: 42px;
        height: 42px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 0.78rem;
        letter-spacing: 0.01em;
        flex-shrink: 0;
      }
      .job-title-text {
        font-size: 0.98rem;
        font-weight: 700;
        color: #0F172A;
        line-height: 1.32;
        margin-bottom: 2px;
      }
      .job-sub-text {
        font-size: 0.83rem;
        color: #64748B;
        margin-bottom: 6px;
      }

      /* Píldoras sobrias y combinadas */
      .pill {
        display: inline-flex;
        align-items: center;
        padding: 2px 9px;
        border-radius: 6px;
        font-size: 0.74rem;
        font-weight: 600;
        margin-right: 5px;
        margin-bottom: 3px;
      }
      .pill-neutral {background: #F1F5F9; color: #475569; border: 1px solid #E2E8F0;}
      .pill-indigo  {background: #EEF2FF; color: #1E40AF; border: 1px solid #C7D2FE;}
      .pill-sage    {background: #ECFDF5; color: #065F46; border: 1px solid #A7F3D0;}
      .pill-amber   {background: #FEF3C7; color: #92400E; border: 1px solid #FDE68A;}
      .pill-navy    {background: #1E3A8A; color: #FFFFFF; border: 1px solid #1E3A8A;}

      /* Etiquetas de Skills */
      .skill-tag {
        display: inline-block;
        background: #F1F5F9;
        color: #1E293B;
        border: 1px solid #CBD5E1;
        padding: 3px 10px;
        border-radius: 6px;
        margin: 2px 5px 3px 0;
        font-size: 0.79rem;
        font-weight: 500;
      }
      .skill-tag-miss {
        background: #FFF1F2;
        color: #9F1239;
        border: 1px solid #FECDD3;
      }

      /* Paso de Chain-of-Thought (CoT) */
      .cot-box {
        background: #F8FAFC;
        border: 1px solid #E2E8F0;
        border-left: 3px solid #1E3A8A;
        border-radius: 8px;
        padding: 10px 13px;
        margin-bottom: 8px;
        font-size: 0.83rem;
        color: #334155;
        line-height: 1.42;
      }
      .cot-step-title {
        font-weight: 700;
        color: #0F172A;
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        margin-bottom: 2px;
      }
      .agency-hint {
        background: #EEF2FF;
        color: #1E3A8A;
        border: 1px solid #C7D2FE;
        border-radius: 6px;
        padding: 4px 9px;
        font-size: 0.76rem;
        font-weight: 500;
        margin-top: 4px;
        display: inline-block;
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


def parse_reasoning(raw_reasoning, job: dict) -> dict:
    """Devuelve el diccionario con los 5 pasos de Chain-of-Thought (desde BD o reconstruido)."""
    if isinstance(raw_reasoning, dict):
        return raw_reasoning
    if isinstance(raw_reasoning, str) and raw_reasoning.strip():
        try:
            return json.loads(raw_reasoning)
        except Exception:
            pass
    # Si la vacante fue evaluada antes de migrarse a CoT, construir resumen estructurado limpio
    matching = as_list(job.get("matching_skills"))
    missing = as_list(job.get("missing_skills"))
    is_pre = bool(job.get("is_pre_professional"))
    return {
        "academic_eligibility": (
            "Oferta compatible con estudiante universitario de 8vo ciclo (preprofesional)."
            if is_pre else "La convocatoria exige condición de egresado o bachiller."
        ),
        "experience_requirements": (
            "Condiciones acordes a convenio de prácticas preprofesionales."
            if not job.get("is_unrealistic_or_smoke")
            else "Se detectaron requisitos desproporcionados o ausencia de subvención."
        ),
        "tech_stack_overlap": (
            f"Coincidencias con el perfil: {', '.join(matching)}."
            if matching else "Sin coincidencias técnicas directas detectadas en el anuncio."
        ),
        "gaps_and_risks": (
            f"Requisitos adicionales mencionados: {', '.join(missing)}."
            if missing else "No se identificaron brechas tecnológicas críticas."
        ),
        "score_rationale": (
            f"Afinidad técnica {float(job.get('technical_match_score') or 0) * 100:.0f}%, "
            f"modalidad {job.get('modality')} ({float(job.get('modality_score') or 0) * 100:.0f}%) "
            f"y ubicación ({float(job.get('location_score') or 0) * 100:.0f}%)."
        ),
    }


# ---------------- Monogramas Sobrios y Armónicos (Sin saturación de emojis) ----------------
MONOCHROME_PALETTES = [
    ("#EEF2FF", "#1E3A8A", "#C7D2FE"),  # Índigo editorial
    ("#ECFDF5", "#065F46", "#A7F3D0"),  # Salvia
    ("#F1F5F9", "#334155", "#CBD5E1"),  # Pizarra
    ("#F0F9FF", "#075985", "#BAE6FD"),  # Azul acero
    ("#FAF5FF", "#5B21B6", "#DDD6FE"),  # Lavanda sobrio
]


def get_company_monogram_html(company: str, title: str = "", raw_description: str = "") -> str:
    """
    Genera un monograma tipográfico limpio de 2 a 4 letras.
    Si es una agencia (Manpower, Adecco, etc.) y se detectó la empresa cliente real (ej. BCP),
    muestra las siglas del cliente real.
    """
    employer = resolve_employer(company or "", title or "", raw_description or "")
    if employer.brand is not None:
        b = employer.brand
        return (
            f"<div class='company-monogram' style='background:{b.tint};color:{b.color};border:1px solid #CBD5E1;' "
            f"title='{html.escape(b.display)}'>{html.escape(b.code)}</div>"
        )

    clean = (company or "Empresa").strip()
    low = clean.lower()
    if "confidencial" in low or "no especificado" in low:
        return (
            "<div class='company-monogram' style='background:#F1F5F9;color:#475569;border:1px solid #CBD5E1;' "
            "title='Empresa en reserva'>CONF</div>"
        )

    words = [
        w for w in re.split(r"[\s\-\.,()]+", clean)
        if len(w) > 1 and w.lower() not in ("de", "del", "la", "el", "los", "las", "sac", "peru", "perú", "sa", "grupo")
    ]
    if len(words) >= 2:
        initials = (words[0][0] + words[1][0] + (words[2][0] if len(words) > 2 else "")).upper()
    elif words:
        initials = words[0][:3].upper()
    else:
        initials = "EMP"

    idx = int(hashlib.md5(low.encode("utf-8")).hexdigest()[:4], 16) % len(MONOCHROME_PALETTES)
    bg, fg, border = MONOCHROME_PALETTES[idx]
    return (
        f"<div class='company-monogram' style='background:{bg};color:{fg};border:1px solid {border};' "
        f"title='{html.escape(clean)}'>{html.escape(initials)}</div>"
    )


def get_modality_pill_html(modality: str) -> str:
    low = (modality or "").lower()
    if "híbrido" in low or "hibrido" in low:
        return "<span class='pill pill-sage'>Híbrido</span>"
    if "presencial" in low:
        return "<span class='pill pill-indigo'>Presencial</span>"
    if "remoto" in low:
        return "<span class='pill pill-neutral'>Remoto</span>"
    return "<span class='pill pill-neutral'>Modalidad no especificada</span>"


def get_portal_pill_html(source: str) -> str:
    names = {
        "bumeran": "Bumeran",
        "linkedin": "LinkedIn",
        "practicas_pe": "Practicas.pe",
        "computrabajo": "CompuTrabajo",
        "cvmatcher": "CVMatcher",
    }
    label = names.get((source or "").lower(), source or "Portal")
    return f"<span class='pill pill-neutral'>{html.escape(label)}</span>"


def get_score_pill_html(score: float) -> str:
    if score >= 75:
        cls = "pill-sage"
    elif score >= 60:
        cls = "pill-indigo"
    else:
        cls = "pill-neutral"
    return f"<span class='pill {cls}' style='font-size:0.78rem;padding:3px 10px;'>{score:.0f}% compatibilidad</span>"


# ---------------- Gestión de Estado y Memoria Persistente (Blindada contra F5 y Cloud Sleep) ----------------
CRM_STATUS_TO_CODE = {
    "⭐ Favorita": "F",
    "🚀 Postulado": "P",
    "🎤 En entrevista": "E",
    "❌ Descartada por mí": "D",
}
CRM_CODE_TO_STATUS = {v: k for k, v in CRM_STATUS_TO_CODE.items()}


def sync_crm_to_query_params():
    """Sincroniza los estados modificados en la URL del navegador para persistencia infalible en F5 y cloud sleep."""
    try:
        items = []
        for j in st.session_state.get("jobs_data", []):
            st_val = j.get("application_status")
            if st_val in CRM_STATUS_TO_CODE:
                code = CRM_STATUS_TO_CODE[st_val]
                items.append(f"{j['id']}:{code}")
        if items:
            st.query_params["crm"] = ",".join(items)
        else:
            if "crm" in st.query_params:
                del st.query_params["crm"]
    except Exception as e:
        logger.debug(f"sync_crm_to_query_params error: {e}")


def restore_crm_from_query_params() -> int:
    """Restaura los estados CRM desde los parámetros URL si el contenedor arrancó de cero tras un sleep o F5."""
    try:
        crm_param = st.query_params.get("crm")
        if not crm_param:
            return 0
        db = DatabaseManager()
        pairs = crm_param.split(",")
        restored = 0
        for pair in pairs:
            if ":" not in pair:
                continue
            jid_str, code = pair.split(":", 1)
            try:
                jid = int(jid_str)
            except ValueError:
                continue
            target_status = CRM_CODE_TO_STATUS.get(code)
            if not target_status:
                continue
            db.update_application_status(jid, target_status)
            for j in st.session_state.get("jobs_data", []):
                if int(j["id"]) == jid:
                    if j.get("application_status") != target_status:
                        j["application_status"] = target_status
                        restored += 1
                    break
        return restored
    except Exception as e:
        logger.debug(f"restore_crm_from_query_params error: {e}")
        return 0


def refresh_jobs_in_state():
    st.session_state["jobs_data"] = DatabaseManager().get_all_evaluated_jobs()
    restore_crm_from_query_params()
    # Si no había parámetros en URL pero sí hay postulaciones en DB/memoria, registrarlas en URL
    if not st.query_params.get("crm"):
        sync_crm_to_query_params()


if "jobs_data" not in st.session_state:
    refresh_jobs_in_state()

if "selected_job_id" not in st.session_state:
    st.session_state["selected_job_id"] = None

if "crm_quick_tab" not in st.session_state:
    st.session_state["crm_quick_tab"] = "🌐 Activas"

if "page_number" not in st.session_state:
    st.session_state["page_number"] = 0

if "search_query_text" not in st.session_state:
    st.session_state["search_query_text"] = ""


def update_job_crm(job_id: int, new_status: str, notes: str | None = None):
    db = DatabaseManager()
    db.update_application_status(int(job_id), new_status, notes=notes)

    for item in st.session_state.get("jobs_data", []):
        if int(item["id"]) == int(job_id):
            item["application_status"] = new_status
            if notes is not None:
                item["user_notes"] = notes
            break

    st.session_state["selected_job_id"] = int(job_id)
    sync_crm_to_query_params()


# --- Callbacks de widgets (se ejecutan ANTES del rerun: no requieren st.rerun manual) ---
def _set_page(page: int):
    st.session_state["page_number"] = max(0, int(page))


def _select_job(job_id: int):
    st.session_state["selected_job_id"] = int(job_id)


def _on_quick_select():
    chosen = st.session_state.get("quick_job_select")
    if chosen is not None:
        st.session_state["selected_job_id"] = int(chosen)


def _change_status(job_id: int, new_status: str, label: str = ""):
    update_job_crm(int(job_id), new_status)
    clean = new_status.encode("ascii", "ignore").decode("ascii").strip() or new_status
    st.session_state["_pending_toast"] = f"{label}: {clean}" if label else f"Estado guardado: {clean}"
    # Los contadores de la cabecera viven fuera del fragmento: pedir un rerun completo
    st.session_state["_crm_dirty"] = True


def _save_note(job_id: int, status: str):
    notes = st.session_state.get(f"notes_input_{job_id}", "")
    update_job_crm(int(job_id), status, notes=notes)
    st.session_state["_pending_toast"] = "Nota guardada en memoria."
    st.session_state["_crm_dirty"] = True


all_adapter_names = [a.name for a in get_adapters()]
active_api_key = resolve_gemini_api_key()
all_loaded_jobs = st.session_state.get("jobs_data", [])
fav_total = sum(1 for j in all_loaded_jobs if j.get("application_status") == "⭐ Favorita")
applied_total = sum(1 for j in all_loaded_jobs if j.get("application_status") in ("🚀 Postulado", "🎤 En entrevista"))
last_eval_str = max((j.get("evaluated_at") or "" for j in all_loaded_jobs), default="")[:16] or "—"

# ---------------- Cabecera Editorial Limpia ----------------
hdr_col1, hdr_col2, hdr_col3 = st.columns([3.5, 1.05, 1.05], vertical_alignment="center")

with hdr_col1:
    ai_chip = (
        "<span class='stat-chip stat-chip-active'>LangGraph + Gemini CoT activo</span>"
        if active_api_key
        else "<span class='stat-chip'>LangGraph · Modo Heurístico</span>"
    )
    st.markdown(
        f"""
        <div class='editorial-header'>
          <div style='display:flex;align-items:center;gap:14px;'>
            <div class='avatar-jp'>JP</div>
            <div>
              <div style='font-size:1.12rem;font-weight:800;color:#0F172A;line-height:1.25;'>
                Radar de Prácticas · {html.escape(CANDIDATE_PROFILE['name'])}
              </div>
              <div style='font-size:0.82rem;color:#64748B;margin-top:2px;'>
                Ingeniería de Sistemas e Informática (UTP · 8vo ciclo) &nbsp;·&nbsp; Base: Ate / La Molina / San Isidro &nbsp;·&nbsp; Últ. act.: {last_eval_str}
              </div>
            </div>
          </div>
          <div style='display:flex;gap:8px;flex-wrap:wrap;'>
            <span class='stat-chip'>Destacadas: {fav_total}</span>
            <span class='stat-chip'>Postuladas: {applied_total}</span>
            {ai_chip}
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

with hdr_col2:
    with st.popover("Buscar vacantes", use_container_width=True):
        st.markdown("#### Escaneo Multi-Portal")
        selected_portals = st.multiselect(
            "Portales a escanear",
            options=all_adapter_names,
            default=all_adapter_names,
        )
        limit = st.slider("Vacantes por portal", 3, 25, 10)
        reeval = st.checkbox("Re-evaluar vacantes guardadas con LangGraph + CoT", value=False)

        if st.button("Iniciar búsqueda ahora", type="primary", use_container_width=True):
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
                f"Listo: {summary['extracted']} extraídas ({summary['new']} nuevas) · "
                f"{summary['recommended']} recomendadas · Motor: {summary['ai_engine']}"
            )
            st.rerun()

with hdr_col3:
    with st.popover("Memoria y Motor IA", use_container_width=True):
        st.markdown("#### Memoria CRM y Respaldo")
        crm_export_data = DatabaseManager().export_crm_data()
        crm_export_json = json.dumps(crm_export_data, ensure_ascii=False, indent=2)
        st.download_button(
            "💾 Descargar Respaldo CRM (.json)",
            data=crm_export_json,
            file_name="mis_postulaciones_radar.json",
            mime="application/json",
            use_container_width=True,
            help="Descarga un archivo JSON con todas tus postuladas, favoritas, descartadas y notas personales.",
        )

        with st.expander("📥 Restaurar respaldo de postulaciones", expanded=False):
            uploaded_crm = st.file_uploader(
                "Subir archivo mis_postulaciones_radar.json",
                type=["json"],
                key="crm_file_uploader",
                help="Sube tu archivo JSON para recuperar todas tus postulaciones y notas al instante.",
            )
            if uploaded_crm is not None:
                try:
                    import_content = json.load(uploaded_crm)
                    imported_count = DatabaseManager().import_crm_data(import_content)
                    refresh_jobs_in_state()
                    st.success(f"¡Se restauraron {imported_count} registros exitosamente!")
                    st.rerun(scope="app")
                except Exception as ex:
                    st.error(f"Error al restaurar respaldo: {ex}")

        gh_token = _resolve_github_token()
        if gh_token:
            st.caption("🟢 **Nube GitHub activa:** Tus postulaciones se sincronizan automáticamente con tu repositorio.")
        else:
            st.caption("🛡️ **Persistencia en URL activa:** Tus postulaciones se guardan en la barra de direcciones (?crm=...) y resisten F5 y reinicios.")
            st.caption("💡 *Opcional:* Para sincronizar en la nube entre diferentes navegadores, añade `GITHUB_TOKEN` en Secrets de Streamlit Cloud.")

        st.divider()
        st.markdown("#### Motor LangGraph + Gemini CoT")
        if active_api_key:
            st.success(f"Clave activa ({JobMatcherAI.MODEL_ID})")
        else:
            st.warning("Sin clave API (usando evaluación heurística)")

        st.caption(
            "Para que Streamlit Cloud recuerde tu clave permanentemente, ve a "
            "**Manage app → Settings → Secrets** y añade:\n`GEMINI_API_KEY = \"tu_clave\"`"
        )
        key_input = st.text_input(
            "O pega tu GEMINI_API_KEY aquí:",
            type="password",
            placeholder="AIzaSy...",
        )
        if st.button("Guardar clave", use_container_width=True):
            if key_input.strip():
                clean_k = key_input.strip()
                st.session_state["GEMINI_API_KEY"] = clean_k
                os.environ["GEMINI_API_KEY"] = clean_k
                try:
                    ENV_PATH.write_text(f"GEMINI_API_KEY={clean_k}\n", encoding="utf-8")
                except Exception:
                    pass
                st.success("Clave guardada en memoria.")
                st.rerun(scope="app")

        st.divider()
        st.caption(
            "El escáner automático en la nube actualiza el catálogo a las 7:00 AM y 2:00 PM (hora Perú)."
        )

if not all_loaded_jobs:
    st.info("Aún no hay vacantes registradas. Haz clic en **Buscar vacantes** arriba a la derecha.")
    st.stop()


# ---------------- Workspace Reactivo (Buscador Inteligente + Master-Detail) ----------------
@st.fragment
def render_interactive_workspace():
    # Un cambio de estado CRM actualiza también la cabecera (fuera del fragmento)
    if st.session_state.pop("_crm_dirty", False):
        st.rerun(scope="app")
    pending_toast = st.session_state.pop("_pending_toast", None)
    if pending_toast:
        st.toast(pending_toast)

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

    # 2. Barra de Filtros Horizontales Limpia (Sin exceso de iconos)
    with st.container(border=True):
        tab_options = {
            "🌐 Activas": f"Activas ({active_count})",
            "📋 Por postular": f"Por postular ({counts['📋 Por postular']})",
            "⭐ Favorita": f"Destacadas ({counts['⭐ Favorita']})",
            "🚀 Postulado": f"Postuladas ({counts['🚀 Postulado']})",
            "🎤 En entrevista": f"En entrevista ({counts['🎤 En entrevista']})",
            "❌ Descartada por mí": f"Descartadas ({counts['❌ Descartada por mí']})",
            "📂 Todas": f"Todas ({len(all_jobs)})",
        }

        if "crm_quick_tab" not in st.session_state or st.session_state["crm_quick_tab"] not in tab_options:
            st.session_state["crm_quick_tab"] = "🌐 Activas"

        def _on_crm_tab_change():
            st.session_state["page_number"] = 0

        raw_selected_tab = st.segmented_control(
            "Clasificación CRM",
            options=list(tab_options.keys()),
            format_func=lambda k: tab_options.get(k, k),
            key="crm_quick_tab",
            label_visibility="collapsed",
            on_change=_on_crm_tab_change,
        )
        current_tab_key = raw_selected_tab or "🌐 Activas"

        def _on_search_change():
            st.session_state["page_number"] = 0

        def _apply_search_suggestion(term: str):
            st.session_state["search_query_text"] = term
            st.session_state["page_number"] = 0

        f_col1, f_col2, f_col3, f_col4, f_col5 = st.columns([2.25, 1.4, 1.4, 1.05, 1.4])
        with f_col1:
            query = st.text_input(
                "Buscar por empresa (ej. BCP, Movistar), puesto, tecnología o distrito",
                key="search_query_text",
                placeholder="Ej: BCP, Python, Power BI, Interbank, San Isidro...",
                on_change=_on_search_change,
            )
        with f_col2:
            modalities = st.multiselect(
                "Modalidad",
                options=list(MODALITY_ORDER.keys()),
                default=list(MODALITY_ORDER.keys()),
            )
        with f_col3:
            source_options = ["practicas_pe", "bumeran", "linkedin", "computrabajo", "cvmatcher"]
            selected_sources = st.multiselect(
                "Portales",
                options=source_options,
                default=source_options,
            )
        with f_col4:
            min_score = st.slider("Compatibilidad mín.", 0, 100, 50)
            age_filter = st.selectbox(
                "Antigüedad máx.",
                options=["Máx. 2 semanas (14d)", "Máx. 1 mes (30d)", "Cualquier fecha"],
                index=0,
            )
        with f_col5:
            order = st.selectbox(
                "Ordenar por",
                options=[
                    "Modalidad (Híbrido > Presencial > Remoto) + Match",
                    "Mayor % de compatibilidad",
                ],
            )
            show_discarded_ai = st.checkbox("Incluir descartadas por IA (egresados)", value=False)

    age_limit_days = 14 if "2 semanas" in age_filter else (30 if "1 mes" in age_filter else None)

    # 3. Filtrado base por pestaña, modalidad, portal y score
    if current_tab_key == "🌐 Activas":
        allowed_statuses = {"📋 Por postular", "⭐ Favorita", "🚀 Postulado", "🎤 En entrevista"}
    elif current_tab_key == "📂 Todas":
        allowed_statuses = set(APPLICATION_STATUSES)
    else:
        allowed_statuses = {current_tab_key}

    # Si el usuario busca una empresa específica (ej. "bcp"), no ocultar las de agencias por el filtro de score
    has_active_query = bool((query or "").strip())

    base_filtered = []
    for j in all_jobs:
        job_status = j.get("application_status") or "📋 Por postular"
        if job_status not in allowed_statuses:
            continue
        is_user_saved = job_status in ("⭐ Favorita", "🚀 Postulado", "🎤 En entrevista")

        # 1. Filtro estricto de Práctica Preprofesional:
        # A menos que el usuario marque explícitamente "Incluir descartadas por IA (egresados)",
        # NUNCA mostrar ofertas que no sean preprofesionales ni ofertas humo/engaño,
        # INCLUSO si hay una búsqueda activa por texto.
        if not show_discarded_ai and not is_user_saved:
            if not bool(j.get("is_pre_professional")) or bool(j.get("is_unrealistic_or_smoke")):
                continue

        # 2. Filtro estricto de Antigüedad (Máximo 2 semanas / 14 días por defecto):
        # Descartar ofertas antiguas (ej. vacantes de hace 1 mes en LinkedIn), a menos que sean guardadas por el usuario
        if age_limit_days is not None and not is_user_saved:
            if not is_job_recent(j, max_days=age_limit_days):
                continue

        # 3. Filtro de puntaje de compatibilidad:
        # Si el usuario busca un término específico (ej. "bcp"), relajamos el umbral del slider
        # para no esconder ofertas relevantes de agencias que tengan puntaje menor al umbral.
        if float(j.get("final_ranking_score") or 0) < min_score and not is_user_saved and not has_active_query:
            continue

        if modalities and j.get("modality") not in modalities:
            continue
        if selected_sources and j.get("source") not in selected_sources:
            continue
        base_filtered.append(j)

    # 4. Buscador Inteligente (Resolución de Agencias Manpower/Adecco -> BCP, Sinónimos y Corrección Ortográfica)
    search_outcome = search_jobs(base_filtered, query)
    filtered = search_outcome.jobs

    if not has_active_query:
        if order.startswith("Modalidad"):
            filtered = sort_by_modality_then_score(filtered)
        else:
            filtered = sorted(filtered, key=lambda j: -float(j["final_ranking_score"]))

    # Mostrar avisos inteligentes del buscador (corrección ortográfica, agencias detectadas y sugerencias clicables)
    if has_active_query:
        info_parts = []
        if search_outcome.corrected_query:
            info_parts.append(
                f"Se interpretó **«{html.escape(query)}»** como **«{html.escape(search_outcome.corrected_query)}»**."
            )
        if search_outcome.inferred_brand and search_outcome.agency_matches_count > 0:
            info_parts.append(
                f"Incluye **{search_outcome.agency_matches_count}** convocatoria(s) publicada(s) por agencias de reclutamiento "
                f"(como Manpower / consultoras) vinculadas a **{search_outcome.inferred_brand.display}** o su sector."
            )
        if info_parts:
            st.caption(" · ".join(info_parts))

        suggestions_to_show = search_outcome.did_you_mean or search_outcome.related_suggestions
        if suggestions_to_show:
            s_cols = st.columns([1.2] + [1] * len(suggestions_to_show[:4]) + [3])
            s_cols[0].caption("Sugerencias:")
            for idx_s, sug in enumerate(suggestions_to_show[:4]):
                s_cols[idx_s + 1].button(
                    sug,
                    key=f"sug_btn_{sug}",
                    use_container_width=True,
                    on_click=_apply_search_suggestion,
                    args=(sug,),
                )

    if not filtered:
        st.warning("No se encontraron vacantes con esos criterios.")
        st.button(
            "Limpiar búsqueda",
            key="clear_search_empty",
            on_click=_apply_search_suggestion,
            args=("",),
        )
        return

    # Garantizar que exista una vacante seleccionada válida en memoria
    filtered_ids = [int(j["id"]) for j in filtered]
    if st.session_state.get("selected_job_id") not in filtered_ids:
        st.session_state["selected_job_id"] = filtered_ids[0]

    active_job_id = int(st.session_state["selected_job_id"])
    active_job = next((j for j in filtered if int(j["id"]) == active_job_id), filtered[0])

    # 5. Vista Dividida (Izquierda: Tarjetas Limpias | Derecha: Análisis CoT y Seguimiento)
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
                f"##### {len(filtered)} convocatorias encontradas &nbsp;<span style='font-size:0.8rem;font-weight:500;color:#64748B;'>"
                f"({hybrid_cnt} híbridas)</span>",
                unsafe_allow_html=True,
            )
        with hdr_r:
            if total_pages > 1:
                p_prev, p_info, p_next = st.columns([1, 1.5, 1], vertical_alignment="center")
                p_prev.button(
                    "‹", disabled=(cur_page == 0), key="pg_prev", use_container_width=True,
                    on_click=_set_page, args=(cur_page - 1,),
                )
                p_info.caption(f"Pág. {cur_page + 1}/{total_pages}")
                p_next.button(
                    "›", disabled=(cur_page >= total_pages - 1), key="pg_next", use_container_width=True,
                    on_click=_set_page, args=(cur_page + 1,),
                )

        for j in page_items:
            jid = int(j["id"])
            is_selected = jid == active_job_id
            j_status = j.get("application_status") or "📋 Por postular"
            is_fav = j_status == "⭐ Favorita"
            is_applied = j_status == "🚀 Postulado"
            score_val = float(j["final_ranking_score"])

            monogram_html = get_company_monogram_html(
                j["company"], j.get("title", ""), j.get("raw_description", "")
            )
            mod_pill = get_modality_pill_html(j["modality"])
            portal_pill = get_portal_pill_html(j["source"])
            age_pill = get_job_age_pill_html(j)
            score_pill = get_score_pill_html(score_val)
            salary_str = html.escape(j.get("salary") or "Sueldo de ley")

            status_pill = ""
            if is_fav:
                status_pill = "<span class='pill pill-amber'>Destacada</span>"
            elif is_applied:
                status_pill = "<span class='pill pill-indigo'>Postulado</span>"
            elif j_status != "📋 Por postular":
                clean_st = j_status.encode("ascii", "ignore").decode("ascii").strip() or j_status
                status_pill = f"<span class='pill pill-neutral'>{html.escape(clean_st)}</span>"

            active_pill = "<span class='pill pill-navy'>Seleccionada</span>" if is_selected else ""

            search_note = j.get("_search_note")
            note_html = (
                f"<div class='agency-hint'>{html.escape(search_note)}</div>"
                if search_note
                else ""
            )

            with st.container(border=True):
                st.markdown(
                    f"""
                    <div class='card-row'>
                      {monogram_html}
                      <div style='flex:1;min-width:0;'>
                        <div style='display:flex;justify-content:space-between;align-items:flex-start;gap:8px;'>
                          <div class='job-title-text'>{html.escape(j['title'])}</div>
                          <div style='flex-shrink:0;'>{score_pill}</div>
                        </div>
                        <div class='job-sub-text'>
                          <b>{html.escape(j['company'])}</b> &nbsp;·&nbsp; {html.escape(j['location'])} &nbsp;·&nbsp; {salary_str}
                        </div>
                        <div>
                          {active_pill}{status_pill}{mod_pill}{portal_pill}{age_pill}
                        </div>
                        {note_html}
                      </div>
                    </div>
                    """,
                    unsafe_allow_html=True,
                )

                act1, act2, act3, act4 = st.columns([1.65, 1.15, 1.25, 1.0])
                act1.button(
                    "Viendo análisis" if is_selected else "Ver análisis",
                    key=f"sel_{jid}",
                    type="primary" if is_selected else "secondary",
                    use_container_width=True,
                    on_click=_select_job,
                    args=(jid,),
                )
                act2.button(
                    "★ Destacada" if is_fav else "Destacar",
                    key=f"fav_{jid}",
                    type="primary" if is_fav else "secondary",
                    use_container_width=True,
                    on_click=_change_status,
                    args=(jid, "📋 Por postular" if is_fav else "⭐ Favorita", j["company"]),
                )
                act3.button(
                    "✓ Postulado" if is_applied else "Postularé",
                    key=f"app_{jid}",
                    type="primary" if is_applied else "secondary",
                    use_container_width=True,
                    on_click=_change_status,
                    args=(jid, "📋 Por postular" if is_applied else "🚀 Postulado", j["company"]),
                )

                act4.link_button("Abrir ↗", j["url"], use_container_width=True)

    # 6. Panel Derecho: Análisis Chain-of-Thought (LangGraph) y Seguimiento (Sin Pitch)
    with detail_col:
        with st.container(border=True):
            job = active_job
            cur_status = job.get("application_status") or "📋 Por postular"
            det_monogram = get_company_monogram_html(
                job["company"], job.get("title", ""), job.get("raw_description", "")
            )
            det_score_pill = get_score_pill_html(float(job["final_ranking_score"]))
            det_mod_pill = get_modality_pill_html(job["modality"])
            det_portal_pill = get_portal_pill_html(job["source"])
            det_age_pill = get_job_age_pill_html(job)
            engine_used = job.get("engine") or "heuristic"
            engine_label = "Gemini 3.8 Flash · CoT" if engine_used == "gemini-cot" else "LangGraph · Heurístico"

            # Selector rápido superior (ligado por key: sin rebotes ni reruns manuales)
            id_to_label = {
                int(item["id"]): f"{idx + 1}. {item['title']} — {item['company']} ({float(item['final_ranking_score']):.0f}%)"
                for idx, item in enumerate(filtered)
            }
            st.session_state["quick_job_select"] = active_job_id
            st.selectbox(
                "Cambio rápido de vacante:",
                options=filtered_ids,
                format_func=lambda x: id_to_label.get(x, str(x)),
                label_visibility="collapsed",
                key="quick_job_select",
                on_change=_on_quick_select,
            )

            st.markdown(
                f"""
                <div style='display:flex;align-items:flex-start;gap:14px;margin-top:6px;margin-bottom:10px;'>
                  {det_monogram}
                  <div style='flex:1;'>
                    <div style='font-size:1.12rem;font-weight:800;color:#0F172A;line-height:1.28;'>
                      {html.escape(job['title'])}
                    </div>
                    <div style='font-size:0.86rem;color:#475569;margin-top:3px;margin-bottom:8px;'>
                      <b>{html.escape(job['company'])}</b> &nbsp;·&nbsp; {html.escape(job['location'])} &nbsp;·&nbsp;
                      {html.escape(job.get('salary') or 'Remuneración de ley')}
                    </div>
                    <div>
                      {det_score_pill}{det_mod_pill}{det_portal_pill}{det_age_pill}
                      <span class='pill pill-neutral'>Afinidad técnica: {float(job['technical_match_score']) * 100:.0f}%</span>
                      <span class='pill pill-neutral'>{html.escape(engine_label)}</span>
                    </div>
                  </div>
                </div>
                """,
                unsafe_allow_html=True,
            )

            st.link_button(
                "Abrir convocatoria oficial en el portal ↗",
                job["url"],
                type="primary",
                use_container_width=True,
            )

            st.markdown("###### Estado de la postulación")
            clean_status_labels = {
                "📋 Por postular": "Por postular",
                "⭐ Favorita": "Destacada",
                "🚀 Postulado": "Postulado",
                "🎤 En entrevista": "Entrevista",
                "❌ Descartada por mí": "Descartar",
            }
            b_cols = st.columns(len(APPLICATION_STATUSES))
            for col, status_option in zip(b_cols, APPLICATION_STATUSES):
                is_cur = cur_status == status_option
                col.button(
                    clean_status_labels.get(status_option, status_option),
                    key=f"det_status_{job['id']}_{status_option}",
                    type="primary" if is_cur else "secondary",
                    use_container_width=True,
                    on_click=_change_status,
                    args=(int(job["id"]), status_option, clean_status_labels.get(status_option, status_option)),
                )

            st.markdown("###### Veredicto de compatibilidad")
            st.info(job["verdict_summary"])

            sk_col1, sk_col2 = st.columns(2)
            with sk_col1:
                st.markdown("###### Habilidades que coinciden")
                matching_list = as_list(job.get("matching_skills"))
                st.markdown(
                    " ".join(f"<span class='skill-tag'>{html.escape(s)}</span>" for s in matching_list) or "—",
                    unsafe_allow_html=True,
                )
            with sk_col2:
                missing_list = as_list(job.get("missing_skills"))
                st.markdown("###### Requisitos a reforzar")
                st.markdown(
                    " ".join(f"<span class='skill-tag skill-tag-miss'>{html.escape(s)}</span>" for s in missing_list)
                    if missing_list
                    else "<span style='color:#065F46;font-size:0.84rem;font-weight:500;'>Sin brechas críticas detectadas</span>",
                    unsafe_allow_html=True,
                )

            st.divider()
            with st.expander("Ver descripción completa del anuncio", expanded=False):
                st.text(job.get("raw_description") or "Sin descripción adicional.")

            st.divider()
            st.markdown("###### Notas personales")
            st.text_area(
                "Notas",
                value=job.get("user_notes") or "",
                placeholder="Ej: Envié CV enfocado en Python y Power BI / Contacto de selección...",
                key=f"notes_input_{job['id']}",
                label_visibility="collapsed",
                height=70,
            )
            st.button(
                "Guardar nota",
                key=f"save_note_btn_{job['id']}",
                use_container_width=True,
                on_click=_save_note,
                args=(int(job["id"]), cur_status),
            )


render_interactive_workspace()
