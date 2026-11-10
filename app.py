"""
Dashboard web del Job Hunter Agent.
Ejecutar con:  streamlit run app.py
"""
import importlib
import json
import os
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
    page_title="Job Hunter · Joseph Pajuelo",
    page_icon="🎯",
    layout="wide",
    initial_sidebar_state="collapsed",
)

st.markdown(
    """
    <style>
      .block-container {padding-top: 1.2rem; padding-bottom: 2rem; max-width: 1440px;}
      /* Ocultar barra lateral innecesaria */
      [data-testid="collapsedControl"] {display: none;}
      .tag {
        display: inline-block;
        background: #e0e7ff;
        color: #1e3a8a;
        padding: 3px 10px;
        border-radius: 999px;
        margin: 2px 4px 2px 0;
        font-size: 0.82rem;
        font-weight: 500;
      }
      .tag-miss {
        background: #fee2e2;
        color: #991b1b;
      }
      .badge {
        display: inline-block;
        padding: 2px 9px;
        border-radius: 6px;
        font-size: 0.78rem;
        font-weight: 600;
        margin-right: 6px;
      }
      .badge-hibrido {background: #dcfce7; color: #166534; border: 1px solid #86efac;}
      .badge-presencial {background: #dbeafe; color: #1e40af; border: 1px solid #93c5fd;}
      .badge-remoto {background: #f3e8ff; color: #6b21a8; border: 1px solid #d8b4fe;}
      .badge-otro {background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1;}
      .badge-source {background: #f8fafc; color: #334155; border: 1px solid #e2e8f0;}
      .job-card-title {
        font-size: 1.02rem;
        font-weight: 700;
        margin-bottom: 2px;
        line-height: 1.3;
      }
      .job-card-sub {
        font-size: 0.86rem;
        opacity: 0.82;
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


def modality_badge_html(modality: str) -> str:
    low = (modality or "").lower()
    if "híbrido" in low or "hibrido" in low:
        cls = "badge-hibrido"
    elif "presencial" in low:
        cls = "badge-presencial"
    elif "remoto" in low:
        cls = "badge-remoto"
    else:
        cls = "badge-otro"
    return f"<span class='badge {cls}'>{modality}</span>"


def score_color_hex(score: float) -> str:
    if score >= 75:
        return "#16a34a"
    if score >= 60:
        return "#ca8a04"
    return "#dc2626"


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

# ---------------- Cabecera Principal + Acciones Rápidas ----------------
head_left, head_right1, head_right2 = st.columns([3.2, 1.1, 1.1], vertical_alignment="center")

with head_left:
    st.markdown("## 🎯 Radar de Prácticas Preprofesionales")
    ai_badge = (
        f"🟢 **Gemini ({JobMatcherAI.MODEL_ID}) Activo**"
        if active_api_key
        else "🟡 **Modo Heurístico** *(Configura tu API Key a la derecha)*"
    )
    all_loaded = st.session_state.get("jobs_data", [])
    last_eval = max((j.get("evaluated_at") or "" for j in all_loaded), default="")[:16] or "—"
    st.caption(
        f"{CANDIDATE_PROFILE['name']} · {CANDIDATE_PROFILE['headline']} · "
        f"Base: {CANDIDATE_PROFILE['location_base']['district']} · {ai_badge} · "
        f"☁️ **Auto-Scan Cloud:** 7:00 AM / 2:00 PM *(Últ. act.: {last_eval})*"
    )

with head_right1:
    with st.popover("🔎 Buscar Vacantes", use_container_width=True):
        st.markdown("#### Escaneo Multi-Portal")
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

with head_right2:
    with st.popover("⚙️ Motor IA y Memoria", use_container_width=True):
        st.markdown("#### 🤖 Clave de Google Gemini")
        if active_api_key:
            st.success(f"Clave activa y cargada ({JobMatcherAI.MODEL_ID})", icon="✅")
        else:
            st.warning("Sin clave API (usando motor heurístico)", icon="⚠️")

        st.caption(
            "💡 **Para que Streamlit Cloud nunca olvide tu clave:** ve a *Manage app → Settings → Secrets* "
            "en Streamlit Cloud y pega:\n`GEMINI_API_KEY = \"tu_clave\"`"
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
                st.success("¡Clave guardada en memoria y .env!")
                st.rerun()

        st.divider()
        st.caption(
            "🧠 **Memoria CRM activa:** Tus vacantes marcadas como *⭐ Favorita*, *🚀 Postulado* "
            "y tus notas se guardan automáticamente en `jobs.db` y `storage/crm_memory.json`."
        )

jobs = st.session_state.get("jobs_data", [])
if not jobs:
    st.info("Aún no hay vacantes registradas. Haz clic en **🔎 Buscar Vacantes** arriba a la derecha.")
    st.stop()


# ---------------- Workspace Reactivo (Filtros Superiores + Master-Detail) ----------------
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

    # 2. Barra de Filtros Horizontales (Arriba, ya no en la barra lateral izquierda)
    with st.container(border=True):
        tab_options = {
            "🌐 Activas": f"🌐 Activas ({active_count})",
            "📋 Por postular": f"📋 Por postular ({counts['📋 Por postular']})",
            "⭐ Favorita": f"⭐ Destacadas ({counts['⭐ Favorita']})",
            "🚀 Postulado": f"🚀 Postuladas ({counts['🚀 Postulado']})",
            "🎤 En entrevista": f"🎤 En entrevista ({counts['🎤 En entrevista']})",
            "❌ Descartada por mí": f"❌ Descartadas ({counts['❌ Descartada por mí']})",
            "📂 Todas": f"📂 Todas ({len(all_jobs)})",
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

        f_col1, f_col2, f_col3, f_col4, f_col5 = st.columns([2.2, 1.5, 1.5, 1.1, 1.5])
        with f_col1:
            query = st.text_input(
                "🔍 Buscar puesto, empresa, skill o distrito",
                placeholder="Ej: Python, BCP, San Isidro, Datos, IA...",
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
            min_score = st.slider("🎯 Score mín.", 0, 100, 50)
        with f_col5:
            order = st.selectbox(
                "↕️ Ordenar por",
                options=[
                    "Modalidad (Híbrido > Presencial > Remoto) + Score",
                    "Mayor puntaje de compatibilidad",
                ],
            )
            show_discarded_ai = st.checkbox("Incluir descartadas por IA (egresados/humo)", value=False)

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
        # Si es Favorita o Postulado, mostrarla siempre aunque la IA haya sido estricta
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

    # 4. KPIs compactos
    k1, k2, k3, k4, k5 = st.columns(5)
    k1.metric("Vacantes filtradas", len(filtered))
    k2.metric(
        "Compatibilidad media",
        f"{(sum(float(j['final_ranking_score']) for j in filtered) / len(filtered)):.1f} pts" if filtered else "—",
    )
    k3.metric("🏢 Híbridas en vista", sum(1 for j in filtered if j["modality"] == "Híbrido"))
    k4.metric("⭐ Destacadas / Favoritas", counts["⭐ Favorita"])
    k5.metric("🚀 Postuladas / Entrevista", counts["🚀 Postulado"] + counts["🎤 En entrevista"])

    if not filtered:
        st.warning("No hay vacantes que coincidan con los filtros actuales. Prueba bajando el Score mínimo o cambiando de pestaña CRM.")
        return

    # Garantizar que exista una vacante seleccionada válida en memoria
    filtered_ids = [int(j["id"]) for j in filtered]
    if st.session_state.get("selected_job_id") not in filtered_ids:
        st.session_state["selected_job_id"] = filtered_ids[0]

    active_job_id = int(st.session_state["selected_job_id"])
    active_job = next((j for j in filtered if int(j["id"]) == active_job_id), filtered[0])

    # 5. Layout Master-Detail (Izquierda: Tarjetas con clic directo | Derecha: Detalle instantáneo)
    list_col, detail_col = st.columns([1.25, 1.15], gap="large")

    with list_col:
        PAGE_SIZE = 10
        total_pages = max(1, (len(filtered) + PAGE_SIZE - 1) // PAGE_SIZE)
        cur_page = min(max(0, st.session_state.get("page_number", 0)), total_pages - 1)
        start_idx = cur_page * PAGE_SIZE
        page_items = filtered[start_idx : start_idx + PAGE_SIZE]

        hdr_l, hdr_r = st.columns([2, 1], vertical_alignment="center")
        with hdr_l:
            st.markdown(f"#### 📋 Convocatorias ({len(filtered)})")
            st.caption("Haz clic en **Ver Pitch y Detalle** o destaca con **⭐** directamente sin usar checkboxes.")
        with hdr_r:
            if total_pages > 1:
                p_prev, p_info, p_next = st.columns([1, 1.4, 1], vertical_alignment="center")
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
            s_color = score_color_hex(score_val)

            with st.container(border=True):
                top_c1, top_c2 = st.columns([3.6, 1.1], vertical_alignment="top")
                with top_c1:
                    prefix = "👉 " if is_selected else ""
                    fav_icon = "⭐ " if is_fav else ("🚀 " if is_applied else "")
                    st.markdown(
                        f"<div class='job-card-title'>{prefix}{fav_icon}{j['title']}</div>"
                        f"<div class='job-card-sub'>🏢 <b>{j['company']}</b> · 📍 {j['location']}</div>",
                        unsafe_allow_html=True,
                    )
                    salary_txt = j.get("salary") or "Sueldo no especificado"
                    st.markdown(
                        f"{modality_badge_html(j['modality'])}"
                        f"<span class='badge badge-source'>🌐 {j['source'].replace('_', '.')}</span>"
                        f"<span class='badge badge-source'>💰 {salary_txt}</span>"
                        f"<span class='badge badge-source'>{j_status}</span>",
                        unsafe_allow_html=True,
                    )
                with top_c2:
                    st.markdown(
                        f"<div style='text-align:right;font-weight:800;font-size:1.15rem;color:{s_color};'>"
                        f"{score_val:.0f}<span style='font-size:0.75rem;color:#64748b;'>/100</span></div>",
                        unsafe_allow_html=True,
                    )

                act1, act2, act3, act4 = st.columns([1.8, 1.15, 1.25, 1.1])
                if act1.button(
                    "✅ Viendo detalle" if is_selected else "👁️ Ver Pitch y Detalle",
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
                    help="Guardar/quitar de Destacadas",
                ):
                    new_st = "📋 Por postular" if is_fav else "⭐ Favorita"
                    update_job_crm(jid, new_st)
                    st.toast(f"{j['title'][:35]}... → {new_st}")
                    st.rerun(scope="fragment")

                if act3.button(
                    "🚀 Postulado" if is_applied else "✓ Postularé",
                    key=f"app_{jid}",
                    type="primary" if is_applied else "secondary",
                    use_container_width=True,
                    help="Marcar como ya postulado",
                ):
                    new_st = "📋 Por postular" if is_applied else "🚀 Postulado"
                    update_job_crm(jid, new_st)
                    st.toast(f"{j['title'][:35]}... → {new_st}")
                    st.rerun(scope="fragment")

                act4.link_button("🔗 Ir ↗", j["url"], use_container_width=True)

    # 6. Panel Derecho: Detalle Instantáneo de la Vacante Seleccionada
    with detail_col:
        with st.container(border=True):
            st.markdown("#### 📌 Detalle, Pitch y Seguimiento")

            # Selector rápido adicional por si desea buscar directamente en la lista
            id_to_label = {
                int(item["id"]): f"{idx + 1}. {item['title']} — {item['company']} ({float(item['final_ranking_score']):.0f} pts)"
                for idx, item in enumerate(filtered)
            }
            chosen_id = st.selectbox(
                "Vacante activa:",
                options=filtered_ids,
                index=filtered_ids.index(active_job_id),
                format_func=lambda x: id_to_label.get(x, str(x)),
                label_visibility="collapsed",
            )
            if int(chosen_id) != active_job_id:
                st.session_state["selected_job_id"] = int(chosen_id)
                st.rerun(scope="fragment")

            job = active_job
            cur_status = job.get("application_status") or "📋 Por postular"

            st.markdown(f"### {job['title']}")
            st.markdown(f"**🏢 {job['company']}** · 📍 {job['location']} · 🌐 Fuente: `{job['source']}`")

            m1, m2, m3, m4 = st.columns(4)
            m1.metric("Compatibilidad", f"{float(job['final_ranking_score']):.0f}/100")
            m2.metric("Match Técnico", f"{float(job['technical_match_score']) * 100:.0f}%")
            m3.metric("Modalidad", job["modality"])
            m4.metric("Remuneración", job.get("salary") or "No informada")

            st.link_button("🔗 Abrir Convocatoria Oficial en el Portal ↗", job["url"], type="primary", use_container_width=True)

            st.markdown("##### 📌 Estado de esta postulación *(se guarda automáticamente en memoria)*")
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
                    st.toast(f"Guardado en memoria: {status_option}")
                    st.rerun(scope="fragment")

            st.divider()
            st.markdown("##### 🚀 Elevator Pitch Personalizado *(clic en el ícono de copiar arriba a la derecha)*")
            st.code(job["pitch_recommendation"], language=None, wrap_lines=True)

            st.markdown("##### 💡 Análisis del Asistente")
            st.info(job["verdict_summary"])

            sk_col1, sk_col2 = st.columns(2)
            with sk_col1:
                st.markdown("**✅ Tus habilidades que hacen match**")
                matching_list = as_list(job.get("matching_skills"))
                st.markdown(
                    " ".join(f"<span class='tag'>{s}</span>" for s in matching_list) or "—",
                    unsafe_allow_html=True,
                )
            with sk_col2:
                missing_list = as_list(job.get("missing_skills"))
                st.markdown("**📌 Requisitos deseables a reforzar**")
                st.markdown(
                    " ".join(f"<span class='tag tag-miss'>{s}</span>" for s in missing_list)
                    if missing_list
                    else "<span style='color:#16a34a;font-size:0.88rem;'>Ninguna brecha crítica detectada</span>",
                    unsafe_allow_html=True,
                )

            st.divider()
            st.markdown("##### 📝 Notas personales sobre esta vacante")
            notes_val = st.text_area(
                "Notas",
                value=job.get("user_notes") or "",
                placeholder="Ej: Envié CV adaptado con énfasis en SQL y Power BI / Contacto de RRHH...",
                key=f"notes_input_{job['id']}",
                label_visibility="collapsed",
                height=80,
            )
            if st.button("💾 Guardar nota", key=f"save_note_btn_{job['id']}", use_container_width=True):
                update_job_crm(int(job["id"]), cur_status, notes=notes_val)
                st.toast("📝 Nota guardada en memoria.")
                st.rerun(scope="fragment")

            with st.expander("📄 Ver descripción completa de la convocatoria"):
                st.text(job.get("raw_description") or "Sin descripción adicional.")


render_interactive_workspace()
