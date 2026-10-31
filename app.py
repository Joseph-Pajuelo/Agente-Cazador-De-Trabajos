"""
Dashboard web del Job Hunter Agent.
Ejecutar con:  streamlit run app.py
"""
import json
import os
import sys
from datetime import datetime
from pathlib import Path

import pandas as pd
import streamlit as st

root_dir = Path(__file__).resolve().parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from config.candidate_profile import CANDIDATE_PROFILE
from storage.database import DatabaseManager, APPLICATION_STATUSES
from domain.ranking import sort_by_modality_then_score, is_recommended, MODALITY_ORDER
from delivery.pdf_report import generate_pdf_report
from run import run_pipeline, get_adapters
from ai.matcher import JobMatcherAI

ENV_PATH = root_dir / ".env"

st.set_page_config(page_title="Job Hunter · Joseph Pajuelo", page_icon="🎯", layout="wide")

st.markdown(
    """
    <style>
      .block-container {padding-top: 1.5rem;}
      .pitch-box {background:#ecfdf5;border-left:4px solid #10b981;padding:12px 16px;border-radius:6px;color:#064e3b;}
      .tag {display:inline-block;background:#e0e7ff;color:#1e3a8a;padding:2px 10px;border-radius:999px;margin:2px;font-size:0.85rem;}
      .tag-miss {background:#fee2e2;color:#991b1b;}
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


@st.cache_data(ttl=10)
def load_jobs():
    return DatabaseManager().get_all_evaluated_jobs()


all_adapter_names = [a.name for a in get_adapters()]

# ---------------- Sidebar ----------------
with st.sidebar:
    st.header("🤖 Motor de IA (Gemini)")
    matcher_instance = JobMatcherAI()
    if matcher_instance.client:
        st.success(f"Activo: **{matcher_instance.MODEL_ID}**", icon="✅")
    else:
        st.warning("Modo Heurístico (sin API Key)", icon="⚠️")

    with st.expander("Configurar GEMINI_API_KEY", expanded=not bool(matcher_instance.client)):
        st.caption("Obtén tu clave gratis en [Google AI Studio](https://aistudio.google.com/app/api-keys)")
        key_input = st.text_input("Pega tu GEMINI_API_KEY", type="password", placeholder="AIzaSy...")
        if st.button("Guardar clave", width="stretch"):
            if key_input.strip():
                ENV_PATH.write_text(f"GEMINI_API_KEY={key_input.strip()}\n", encoding="utf-8")
                os.environ["GEMINI_API_KEY"] = key_input.strip()
                st.success("Clave guardada en .env. ¡Lista para evaluar!")
                st.rerun()

    st.divider()
    st.header("🔎 Búsqueda Multi-Portal")
    selected_portals = st.multiselect(
        "Portales a escanear",
        options=all_adapter_names,
        default=all_adapter_names,
    )
    limit = st.slider("Vacantes por portal", 3, 25, 10)
    reeval = st.checkbox("Re-evaluar vacantes guardadas", value=False)

    if st.button("Buscar vacantes ahora", type="primary", width="stretch"):
        progress_bar = st.progress(0.0, text="Iniciando escaneo...")

        def _update_progress(msg: str, pct: float):
            progress_bar.progress(min(max(pct, 0.0), 1.0), text=msg)

        summary = run_pipeline(
            limit_per_source=limit,
            generate_pdf=True,
            selected_adapters=selected_portals,
            reevaluate_all=reeval,
            on_progress=_update_progress,
        )
        load_jobs.clear()
        st.success(
            f"Listo: {summary['extracted']} extraídas ({summary['new']} nuevas) · "
            f"{summary['recommended']} recomendadas · Motor: {summary['ai_engine']}"
        )

    st.divider()
    st.header("🎛️ Filtros de Tabla")
    app_status_filter = st.multiselect(
        "Seguimiento de Postulación",
        options=APPLICATION_STATUSES,
        default=["📋 Por postular", "⭐ Favorita", "🚀 Postulado", "🎤 En entrevista"],
    )
    min_score = st.slider("Puntaje mínimo", 0, 100, 50)
    modalities = st.multiselect("Modalidad", list(MODALITY_ORDER.keys()), default=list(MODALITY_ORDER.keys()))
    source_options = ["practicas_pe", "bumeran", "linkedin", "computrabajo", "cvmatcher"]
    selected_sources = st.multiselect("Fuente", source_options, default=source_options)
    query = st.text_input("Buscar por puesto, empresa o distrito")
    show_discarded = st.toggle("Mostrar descartadas (egresados / humo)", value=False)
    order = st.radio("Ordenar por", ["Modalidad (Híbrido > Presencial > Remoto), luego puntaje", "Solo puntaje"])

# ---------------- Header ----------------
st.title("🎯 Radar de Prácticas Preprofesionales")
st.caption(
    f"{CANDIDATE_PROFILE['name']} · {CANDIDATE_PROFILE['headline']} · "
    f"Base: {CANDIDATE_PROFILE['location_base']['district']} · "
    f"Portales conectados: {', '.join(all_adapter_names)}"
)

jobs = load_jobs()
if not jobs:
    st.info("Aún no hay vacantes. Pulsa **Buscar vacantes ahora** en la barra lateral.")
    st.stop()

# ---------------- Filtrado ----------------
filtered = []
for j in jobs:
    if not show_discarded and not is_recommended(j, 0):
        continue
    if j.get("application_status", "📋 Por postular") not in app_status_filter:
        continue
    if float(j["final_ranking_score"]) < min_score:
        continue
    if j["modality"] not in modalities:
        continue
    if j["source"] not in selected_sources:
        continue
    if query and query.lower() not in f"{j['title']} {j['company']} {j['location']}".lower():
        continue
    filtered.append(j)

if order.startswith("Modalidad"):
    filtered = sort_by_modality_then_score(filtered)
else:
    filtered = sorted(filtered, key=lambda j: -float(j["final_ranking_score"]))

# ---------------- KPIs ----------------
c1, c2, c3, c4, c5, c6 = st.columns(6)
c1.metric("Vacantes mostradas", len(filtered))
c2.metric("Total en BD", len(jobs))
c3.metric("Puntaje promedio", f"{(sum(float(j['final_ranking_score']) for j in filtered) / len(filtered)):.1f}" if filtered else "—")
c4.metric("Híbridas", sum(1 for j in filtered if j["modality"] == "Híbrido"))
c5.metric("🚀 Postuladas", sum(1 for j in jobs if j.get("application_status") in ("🚀 Postulado", "🎤 En entrevista")))
c6.metric("⭐ Favoritas", sum(1 for j in jobs if j.get("application_status") == "⭐ Favorita"))

# ---------------- Tabla ----------------
df = pd.DataFrame(
    [
        {
            "Seguimiento": j.get("application_status", "📋 Por postular"),
            "Puesto": j["title"],
            "Empresa": j["company"],
            "Ubicación": j["location"],
            "Modalidad": j["modality"],
            "Remuneración": j.get("salary") or "No informada",
            "Fuente": j["source"].replace("_", "."),
            "Score": float(j["final_ranking_score"]),
            "Enlace": j["url"],
        }
        for j in filtered
    ]
)

st.subheader("📋 Vacantes Encontradas")
st.caption("Haz clic en cualquier fila para ver el análisis, copiar tu Elevator Pitch o **marcarla como Ya Postulado**.")
event = st.dataframe(
    df,
    width="stretch",
    hide_index=True,
    on_select="rerun",
    selection_mode="single-row",
    column_config={
        "Score": st.column_config.ProgressColumn("Score", min_value=0, max_value=100, format="%.0f"),
        "Enlace": st.column_config.LinkColumn("Enlace", display_text="Postular →"),
        "Puesto": st.column_config.TextColumn(width="large"),
    },
)

# ---------------- Exportar PDF ----------------
col_a, col_b = st.columns([1, 3])
with col_a:
    pdf_bytes = generate_pdf_report(filtered, CANDIDATE_PROFILE["name"])
    st.download_button(
        "📄 Descargar Reporte PDF",
        data=pdf_bytes,
        file_name=f"radar_practicas_{datetime.now():%Y%m%d_%H%M}.pdf",
        mime="application/pdf",
        width="stretch",
    )
with col_b:
    st.caption("El PDF exporta las vacantes filtradas actualmente en la tabla con enlaces clicables y tu pitch por cada oferta.")

# ---------------- Detalle + CRM de Postulación ----------------
st.divider()
st.subheader("📌 Detalle de Vacante y Clasificación de Postulación")

selected_rows = event.selection.rows if event and event.selection else []
default_idx = selected_rows[0] if (selected_rows and selected_rows[0] < len(filtered)) else 0

if filtered:
    job_options = [
        f"{idx + 1}. {j['title']} — {j['company']} ({j['modality']} · {float(j['final_ranking_score']):.0f} pts)"
        for idx, j in enumerate(filtered)
    ]
    chosen_label = st.selectbox(
        "Selecciona una vacante (o haz clic en la casilla ☑️ a la izquierda de cualquier fila en la tabla):",
        options=job_options,
        index=default_idx,
    )
    chosen_idx = job_options.index(chosen_label)
    job = filtered[chosen_idx]
    st.markdown(f"### {job['title']} — **{job['company']}**")

    # Botones rápidos de seguimiento de postulación
    st.markdown("#### 📌 Seguimiento de tu Postulación")
    b1, b2, b3, b4, b5 = st.columns(5)
    current_status = job.get("application_status", "📋 Por postular")

    for col, status_option in zip([b1, b2, b3, b4, b5], APPLICATION_STATUSES):
        is_current = current_status == status_option
        if col.button(
            status_option,
            key=f"btn_{job['id']}_{status_option}",
            type="primary" if is_current else "secondary",
            width="stretch",
        ):
            DatabaseManager().update_application_status(int(job["id"]), status_option)
            load_jobs.clear()
            st.toast(f"Actualizado a: {status_option}")
            st.rerun()

    with st.expander("📝 Notas personales sobre esta vacante (plataforma, fecha, contacto)", expanded=bool(job.get("user_notes"))):
        notes_val = st.text_area(
            "Tus notas",
            value=job.get("user_notes", ""),
            placeholder="Ej: Postulé hoy por Bumeran / Envié CV enfocado en Power BI y SQL...",
            key=f"notes_{job['id']}",
        )
        if st.button("Guardar nota", key=f"save_note_{job['id']}"):
            DatabaseManager().update_application_status(int(job["id"]), current_status, notes=notes_val)
            load_jobs.clear()
            st.success("Nota guardada.")
            st.rerun()

    m1, m2, m3, m4, m5 = st.columns(5)
    m1.metric("Compatibilidad", f"{float(job['final_ranking_score']):.1f}/100")
    m2.metric("Afinidad técnica", f"{float(job['technical_match_score'])*100:.0f}%")
    m3.metric("Modalidad", job["modality"])
    m4.metric("Ubicación", job["location"])
    m5.metric("Estado actual", current_status)
    st.link_button("🔗 Abrir convocatoria oficial", job["url"])

    left, right = st.columns(2)
    with left:
        st.markdown("**Análisis de la vacante**")
        st.write(job["verdict_summary"])
        st.markdown("**Tus habilidades que hacen match**")
        st.markdown(
            " ".join(f"<span class='tag'>{s}</span>" for s in as_list(job["matching_skills"])) or "—",
            unsafe_allow_html=True,
        )
        missing = as_list(job["missing_skills"])
        if missing:
            st.markdown("**Requisitos deseables a reforzar**")
            st.markdown(" ".join(f"<span class='tag tag-miss'>{s}</span>" for s in missing), unsafe_allow_html=True)
    with right:
        st.markdown("**Elevator Pitch personalizado** *(haz clic en el icono de copiar arriba a la derecha)*")
        st.code(job["pitch_recommendation"], language=None, wrap_lines=True)

    with st.expander("Ver descripción completa de la convocatoria"):
        st.text(job["raw_description"])
