import os
from datetime import datetime
from pathlib import Path
from typing import List, Dict

class JobReporter:
    """
    Genera reportes de inteligencia laboral estructurados en Markdown y consola.
    """
    def __init__(self, output_dir: str | None = None):
        if output_dir is None:
            base_dir = Path(__file__).resolve().parent.parent
            self.output_dir = base_dir / "reports"
        else:
            self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def generate_markdown_report(self, jobs: List[Dict], candidate_name: str = "Joseph Pajuelo") -> str:
        date_str = datetime.now().strftime("%Y-%m-%d %H:%M")
        filename = f"reporte_vacantes_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
        filepath = self.output_dir / filename

        md = []
        md.append(f"# 🎯 Radar de Prácticas Preprofesionales: {candidate_name}")
        md.append(f"**Generado el:** {date_str}  ")
        md.append(f"**Filtros aplicados:** UTP 8vo ciclo | Sistemas, Datos, IA, Software | Lima Este/Centro | Híbrido > Presencial > Remoto\n")
        md.append(f"Total de vacantes destacadas analizadas: **{len(jobs)}**\n")
        md.append("---\n")

        if not jobs:
            md.append("⚠️ *No se encontraron vacantes nuevas que superen el umbral mínimo de afinidad hoy.*")
        else:
            for idx, job in enumerate(jobs, 1):
                md.append(f"## {idx}. {job['title']} — **{job['company']}**")
                md.append(f"- **Puntuación de Compatibilidad (Ranking):** `{job['final_ranking_score']}/100`")
                md.append(f"- **Modalidad:** `{job['modality']}`")
                md.append(f"- **Ubicación:** `{job['location']}`")
                md.append(f"- **Remuneración:** `{job['salary'] or 'Remuneración de ley / No informada'}`")
                md.append(f"- **Fuente:** `{job['source']}`")
                md.append(f"- **Enlace de postulación:** [Abrir Convocatoria Oficial]({job['url']})\n")

                md.append(f"### 💡 Análisis del Asistente")
                md.append(f"> {job['verdict_summary']}\n")

                import json
                matching = json.loads(job['matching_skills']) if isinstance(job['matching_skills'], str) else job['matching_skills']
                if matching:
                    md.append(f"**Tus habilidades que hacen match:**")
                    for s in matching:
                        md.append(f"- ✅ {s}")
                    md.append("")

                md.append(f"### 🚀 Elevator Pitch Personalizado (Listo para copiar y pegar en tu postulación):")
                md.append(f"```text\n{job['pitch_recommendation']}\n```")
                md.append("\n---\n")

        content = "\n".join(md)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)

        return str(filepath)
