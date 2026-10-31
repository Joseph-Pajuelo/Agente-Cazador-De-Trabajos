"""
Generador del reporte PDF de vacantes (fpdf2).
Página 1: resumen + tabla de vacantes. Páginas siguientes: detalle con análisis y pitch.
"""
import json
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional

from fpdf import FPDF
from fpdf.enums import XPos, YPos

ASSETS_FONT_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"
WINDOWS_FONT_DIR = Path("C:/Windows/Fonts")

PRIMARY = (30, 58, 138)     # azul oscuro
ACCENT = (16, 185, 129)     # verde
MUTED = (100, 116, 139)
LIGHT_ROW = (241, 245, 249)


def _sanitize(text: Any) -> str:
    """Limpia caracteres que puedan romper la codificación en PDF."""
    if not text:
        return ""
    s = str(text)
    replacements = {
        "—": "-",
        "–": "-",
        "•": "*",
        "“": '"',
        "”": '"',
        "‘": "'",
        "’": "'",
        "\u202f": " ",
        "\xa0": " ",
        "…": "...",
        "→": "->",
        "✅": "[OK]",
        "⭐": "[*]",
        "🚀": "[>]",
        "📋": "[-]",
        "🎤": "[E]",
        "❌": "[X]",
    }
    for old, new in replacements.items():
        s = s.replace(old, new)
    # Reemplazar cualquier otro carácter fuera de Latin-1/BMP si se usara core font
    return s


def _score_color(score: float):
    if score >= 75:
        return (22, 163, 74)
    if score >= 60:
        return (234, 179, 8)
    return (220, 38, 38)


def _as_list(value) -> List[str]:
    if isinstance(value, list):
        return value
    try:
        return json.loads(value) if value else []
    except (TypeError, json.JSONDecodeError):
        return []


class _ReportPDF(FPDF):
    def __init__(self, candidate_name: str):
        super().__init__(orientation="L", unit="mm", format="A4")
        self.candidate_name = _sanitize(candidate_name)
        self.font_name = "Helvetica"

        # Prioridad 1: Fuentes TrueType empaquetadas en el repositorio (funciona en Linux/Streamlit Cloud y Windows)
        bundled_regular = ASSETS_FONT_DIR / "DejaVuSans.ttf"
        bundled_bold = ASSETS_FONT_DIR / "DejaVuSans-Bold.ttf"

        # Prioridad 2: Fuentes del sistema Windows
        win_regular = WINDOWS_FONT_DIR / "arial.ttf"
        win_bold = WINDOWS_FONT_DIR / "arialbd.ttf"

        if bundled_regular.exists() and bundled_bold.exists():
            self.add_font("Body", "", str(bundled_regular))
            self.add_font("Body", "B", str(bundled_bold))
            self.font_name = "Body"
        elif win_regular.exists() and win_bold.exists():
            self.add_font("Body", "", str(win_regular))
            self.add_font("Body", "B", str(win_bold))
            self.font_name = "Body"

        self.set_auto_page_break(auto=True, margin=15)

    def multi_cell(self, *args, **kwargs):
        kwargs.setdefault("new_x", XPos.LMARGIN)
        kwargs.setdefault("new_y", YPos.NEXT)
        return super().multi_cell(*args, **kwargs)

    def header(self):
        self.set_fill_color(*PRIMARY)
        self.rect(0, 0, self.w, 18, "F")
        self.set_xy(10, 5)
        self.set_text_color(255, 255, 255)
        self.set_font(self.font_name, "B", 14)
        header_text = _sanitize(f"Radar de Prácticas Preprofesionales - {self.candidate_name}")
        self.cell(0, 8, header_text)
        self.set_text_color(0, 0, 0)
        self.set_y(24)

    def footer(self):
        self.set_y(-12)
        self.set_font(self.font_name, "", 8)
        self.set_text_color(*MUTED)
        self.cell(0, 6, f"Generado por Job Hunter Agent · {datetime.now():%d/%m/%Y %H:%M} · Página {self.page_no()}/{{nb}}",
                  align="C")


def generate_pdf_report(
    jobs: List[Dict],
    candidate_name: str,
    output_path: Optional[str] = None,
) -> bytes:
    """Genera el PDF. Si se indica output_path, también lo guarda en disco. Retorna los bytes."""
    pdf = _ReportPDF(candidate_name)
    f = pdf.font_name
    pdf.alias_nb_pages()
    pdf.add_page()

    # --- Resumen ---
    pdf.set_font(f, "", 10)
    pdf.set_text_color(*MUTED)
    pdf.multi_cell(0, 5, "Filtros: Practicante preprofesional (8vo ciclo) · Sistemas, Datos, IA, Software, Finanzas TI, RR.HH. · "
                         "Lima Este/Centro · Orden: Híbrido > Presencial > Remoto, luego puntaje.")
    pdf.ln(2)

    total = len(jobs)
    avg = round(sum(float(j["final_ranking_score"]) for j in jobs) / total, 1) if total else 0
    best = max(jobs, key=lambda j: float(j["final_ranking_score"]))["company"] if jobs else "—"
    kpis = [("Vacantes recomendadas", str(total)), ("Puntaje promedio", f"{avg}/100"), ("Mejor match", best[:28])]
    box_w = (pdf.w - 20 - 10) / 3
    y = pdf.get_y()
    for i, (label, value) in enumerate(kpis):
        x = 10 + i * (box_w + 5)
        pdf.set_fill_color(*LIGHT_ROW)
        pdf.rect(x, y, box_w, 18, "F")
        pdf.set_xy(x + 4, y + 2)
        pdf.set_font(f, "", 8)
        pdf.set_text_color(*MUTED)
        pdf.cell(box_w - 8, 5, label)
        pdf.set_xy(x + 4, y + 8)
        pdf.set_font(f, "B", 13)
        pdf.set_text_color(*PRIMARY)
        pdf.cell(box_w - 8, 8, value)
    pdf.set_y(y + 24)

    # --- Tabla ---
    cols = [("#", 8), ("Puesto", 82), ("Empresa", 55), ("Modalidad", 26), ("Remuneración", 30), ("Fuente", 26), ("Score", 18), ("Enlace", 32)]
    pdf.set_font(f, "B", 9)
    pdf.set_fill_color(*PRIMARY)
    pdf.set_text_color(255, 255, 255)
    for name, w in cols:
        pdf.cell(w, 8, name, border=0, fill=True, align="C")
    pdf.ln()

    pdf.set_font(f, "", 8.5)
    for idx, job in enumerate(jobs, 1):
        fill = idx % 2 == 0
        pdf.set_fill_color(*LIGHT_ROW)
        pdf.set_text_color(0, 0, 0)
        score = float(job["final_ranking_score"])
        def clip(text: str, n: int) -> str:
            return text if len(text) <= n else text[: n - 1] + "…"

        values = [
            str(idx),
            clip(job["title"], 52),
            clip(job["company"], 30),
            job["modality"],
            (job.get("salary") or "No informada")[:18],
            job["source"].replace("_", "."),
        ]
        for (name, w), val in zip(cols[:6], values):
            pdf.cell(w, 7, val, fill=fill, align="C" if name in ("#", "Modalidad", "Fuente") else "L")
        pdf.set_text_color(*_score_color(score))
        pdf.set_font(f, "B", 8.5)
        pdf.cell(cols[6][1], 7, f"{score:.0f}", fill=fill, align="C")
        pdf.set_font(f, "", 8.5)
        pdf.set_text_color(37, 99, 235)
        pdf.cell(cols[7][1], 7, "Postular →", fill=fill, align="C", link=job["url"])
        pdf.ln()

    if not jobs:
        pdf.set_text_color(*MUTED)
        pdf.cell(0, 10, "No se encontraron vacantes que superen el umbral de afinidad.")

    # --- Detalle por vacante ---
    for idx, job in enumerate(jobs, 1):
        pdf.add_page()
        pdf.set_text_color(*PRIMARY)
        pdf.set_font(f, "B", 15)
        pdf.multi_cell(0, 8, _sanitize(f"{idx}. {job['title']}"))
        pdf.set_font(f, "", 11)
        pdf.set_text_color(*MUTED)
        pdf.multi_cell(0, 6, _sanitize(f"{job['company']}  |  {job['modality']}  |  {job['location']}  |  "
                                       f"{job.get('salary') or 'Remuneración no informada'}"))
        pdf.ln(1)

        score = float(job["final_ranking_score"])
        pdf.set_font(f, "B", 11)
        pdf.set_text_color(*_score_color(score))
        pdf.cell(0, 7, _sanitize(f"Compatibilidad: {score:.1f}/100   (técnico {float(job['technical_match_score']):.2f} · "
                                 f"modalidad {float(job['modality_score']):.2f} · ubicación {float(job['location_score']):.2f})"),
                 new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.set_text_color(37, 99, 235)
        pdf.set_font(f, "", 10)
        pdf.cell(0, 6, "Abrir convocatoria oficial ->", link=job["url"], new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.ln(3)

        def section(title: str, body: str):
            pdf.set_font(f, "B", 11)
            pdf.set_text_color(0, 0, 0)
            pdf.cell(0, 7, _sanitize(title), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            pdf.set_font(f, "", 10)
            pdf.set_text_color(40, 40, 40)
            pdf.multi_cell(0, 5.5, _sanitize(body))
            pdf.ln(2)

        section("Análisis", job["verdict_summary"])
        matching = _as_list(job.get("matching_skills"))
        missing = _as_list(job.get("missing_skills"))
        section("Habilidades que hacen match", " · ".join(matching) if matching else "—")
        if missing:
            section("Brechas a reforzar", " · ".join(missing))

        pdf.set_font(f, "B", 11)
        pdf.set_text_color(0, 0, 0)
        pdf.cell(0, 7, "Elevator pitch para tu postulación", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.set_fill_color(236, 253, 245)
        pdf.set_draw_color(*ACCENT)
        pdf.set_font(f, "", 10)
        pdf.set_text_color(6, 78, 59)
        pdf.multi_cell(0, 5.5, _sanitize(job["pitch_recommendation"]), border=1, fill=True, padding=3)

    data = bytes(pdf.output())
    if output_path:
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        Path(output_path).write_bytes(data)
    return data
