import base64
import sqlite3
import json
import logging
import os
import sys
import threading
from pathlib import Path
from typing import Optional, List, Tuple
from domain.models import JobListing, JobEvaluation
from domain.enums import JobSource, Modality

logger = logging.getLogger(__name__)

APPLICATION_STATUSES = [
    "📋 Por postular",
    "⭐ Favorita",
    "🚀 Postulado",
    "🎤 En entrevista",
    "❌ Descartada por mí",
]

GITHUB_REPO = "Joseph-Pajuelo/Agente-Cazador-De-Trabajos"
GITHUB_CRM_PATH = "storage/crm_memory.json"


def _resolve_github_token() -> Optional[str]:
    if "streamlit" in sys.modules:
        try:
            st = sys.modules["streamlit"]
            tok = (st.secrets.get("GITHUB_TOKEN") or "").strip()
            if tok:
                return tok
        except Exception:
            pass
    tok = (os.environ.get("GITHUB_TOKEN") or "").strip()
    return tok or None


class DatabaseManager:
    """
    Gestor de base de datos SQLite con modo WAL (Write-Ahead Logging) y Memoria Persistente CRM.
    Garantiza consistencia ACID, deduplicación mediante SHA-256, seguimiento de postulaciones
    en disco + JSON espejo (y sincronización opcional en la nube vía GitHub API).
    """
    def __init__(self, db_path: Optional[str] = None):
        if db_path is None:
            base_dir = Path(__file__).resolve().parent.parent
            self.db_path = str(base_dir / "jobs.db")
            self._memory_path: Optional[Path] = Path(__file__).resolve().parent / "crm_memory.json"
            self._is_main_db = True
        else:
            self.db_path = db_path
            self._memory_path = None
            self._is_main_db = False
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=15.0)
        conn.row_factory = sqlite3.Row
        if self.db_path != ":memory:":
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("PRAGMA synchronous=NORMAL;")
        return conn

    def _load_crm_memory(self) -> dict:
        if not self._memory_path or not self._memory_path.exists():
            return {}
        try:
            return json.loads(self._memory_path.read_text(encoding="utf-8"))
        except Exception as e:
            logger.warning(f"No se pudo leer crm_memory.json: {e}")
            return {}

    def _save_crm_memory(self, memory: dict):
        if not self._memory_path:
            return
        try:
            content = json.dumps(memory, ensure_ascii=False, indent=2)
            self._memory_path.write_text(content, encoding="utf-8")
            if self._is_main_db:
                self._push_crm_to_github_async(content)
        except Exception as e:
            logger.warning(f"No se pudo guardar crm_memory.json: {e}")

    def _push_crm_to_github_async(self, content_str: str):
        """Si existe GITHUB_TOKEN en Secrets/Env, respalda crm_memory.json en GitHub sin bloquear la UI."""
        token = _resolve_github_token()
        if not token:
            return

        def _worker():
            try:
                import httpx
                url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/{GITHUB_CRM_PATH}"
                headers = {
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/vnd.github+json",
                }
                with httpx.Client(timeout=10.0) as client:
                    get_resp = client.get(url, headers=headers)
                    sha = get_resp.json().get("sha") if get_resp.status_code == 200 else None
                    payload = {
                        "message": "chore(crm): auto-sync estado de postulaciones y favoritas",
                        "content": base64.b64encode(content_str.encode("utf-8")).decode("ascii"),
                    }
                    if sha:
                        payload["sha"] = sha
                    client.put(url, headers=headers, json=payload)
            except Exception as exc:
                logger.debug(f"GitHub CRM sync omitido: {exc}")

        threading.Thread(target=_worker, daemon=True).start()

    def _init_db(self):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS job_listings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    deduplication_hash TEXT UNIQUE NOT NULL,
                    source TEXT NOT NULL,
                    title TEXT NOT NULL,
                    company TEXT NOT NULL,
                    location TEXT NOT NULL,
                    modality TEXT NOT NULL,
                    url TEXT NOT NULL,
                    salary TEXT,
                    raw_description TEXT NOT NULL,
                    published_at TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    status TEXT DEFAULT 'PENDING_EVALUATION',
                    application_status TEXT DEFAULT '📋 Por postular',
                    applied_at TIMESTAMP,
                    user_notes TEXT DEFAULT ''
                );
            """)

            # Migración automática sin pérdida de datos para bases de datos ya creadas
            existing_cols = {
                row["name"] for row in cursor.execute("PRAGMA table_info(job_listings);").fetchall()
            }
            if "application_status" not in existing_cols:
                cursor.execute("ALTER TABLE job_listings ADD COLUMN application_status TEXT DEFAULT '📋 Por postular';")
            if "applied_at" not in existing_cols:
                cursor.execute("ALTER TABLE job_listings ADD COLUMN applied_at TIMESTAMP;")
            if "user_notes" not in existing_cols:
                cursor.execute("ALTER TABLE job_listings ADD COLUMN user_notes TEXT DEFAULT '';")

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS job_evaluations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    listing_id INTEGER UNIQUE NOT NULL,
                    is_pre_professional INTEGER NOT NULL,
                    is_unrealistic_or_smoke INTEGER NOT NULL,
                    technical_match_score REAL NOT NULL,
                    modality_score REAL NOT NULL,
                    location_score REAL NOT NULL,
                    final_ranking_score REAL NOT NULL,
                    matching_skills TEXT,
                    missing_skills TEXT,
                    verdict_summary TEXT NOT NULL,
                    pitch_recommendation TEXT NOT NULL,
                    evaluated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    reasoning_chain TEXT,
                    engine TEXT DEFAULT 'heuristic',
                    FOREIGN KEY (listing_id) REFERENCES job_listings (id) ON DELETE CASCADE
                );
            """)

            eval_cols = {
                row["name"] for row in cursor.execute("PRAGMA table_info(job_evaluations);").fetchall()
            }
            if "reasoning_chain" not in eval_cols:
                cursor.execute("ALTER TABLE job_evaluations ADD COLUMN reasoning_chain TEXT;")
            if "engine" not in eval_cols:
                cursor.execute("ALTER TABLE job_evaluations ADD COLUMN engine TEXT DEFAULT 'heuristic';")

            # Reconciliar memoria CRM persistente (recupera Favoritas / Postuladas / Notas)
            if self._memory_path:
                memory = self._load_crm_memory()
                for dedup_hash, data in memory.items():
                    cursor.execute(
                        """
                        UPDATE job_listings
                        SET application_status = ?,
                            applied_at = COALESCE(?, applied_at),
                            user_notes = CASE WHEN user_notes = '' THEN ? ELSE user_notes END
                        WHERE deduplication_hash = ?
                          AND (application_status = '📋 Por postular' OR user_notes = '')
                        """,
                        (
                            data.get("application_status", "📋 Por postular"),
                            data.get("applied_at"),
                            data.get("user_notes", ""),
                            dedup_hash,
                        ),
                    )
            conn.commit()

    def checkpoint(self):
        """Vuelca el archivo WAL completamente dentro de jobs.db para que pueda subirse a Git sin pérdidas."""
        if self.db_path == ":memory:":
            return
        try:
            with self._get_connection() as conn:
                conn.execute("PRAGMA wal_checkpoint(TRUNCATE);")
        except Exception as e:
            logger.debug(f"No se pudo ejecutar wal_checkpoint: {e}")

    def exists_by_hash(self, deduplication_hash: str) -> bool:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT 1 FROM job_listings WHERE deduplication_hash = ?", (deduplication_hash,))
            return cursor.fetchone() is not None

    def get_known_urls(self) -> set[str]:
        """Retorna el conjunto de URLs ya almacenadas para no re-descargar páginas ya vistas."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT url FROM job_listings;")
            return {row["url"] for row in cursor.fetchall()}

    def insert_listing(self, listing: JobListing) -> Tuple[Optional[int], bool]:
        if not listing.deduplication_hash:
            listing.compute_hash()

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM job_listings WHERE deduplication_hash = ?", (listing.deduplication_hash,))
            row = cursor.fetchone()
            if row:
                return row["id"], False

            try:
                cursor.execute("""
                    INSERT INTO job_listings (
                        deduplication_hash, source, title, company, location, 
                        modality, url, salary, raw_description, published_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    listing.deduplication_hash,
                    listing.source.value,
                    listing.title,
                    listing.company,
                    listing.location,
                    listing.modality.value,
                    listing.url,
                    listing.salary,
                    listing.raw_description,
                    listing.published_at
                ))
                conn.commit()
                return cursor.lastrowid, True
            except sqlite3.IntegrityError:
                cursor.execute("SELECT id FROM job_listings WHERE deduplication_hash = ?", (listing.deduplication_hash,))
                return cursor.fetchone()["id"], False

    def insert_evaluation(self, listing_id: int, evaluation: JobEvaluation):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT OR REPLACE INTO job_evaluations (
                    listing_id, is_pre_professional, is_unrealistic_or_smoke,
                    technical_match_score, modality_score, location_score, final_ranking_score,
                    matching_skills, missing_skills, verdict_summary, pitch_recommendation,
                    reasoning_chain, engine
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                listing_id,
                1 if evaluation.is_pre_professional else 0,
                1 if evaluation.is_unrealistic_or_smoke else 0,
                evaluation.technical_match_score,
                evaluation.modality_score,
                evaluation.location_score,
                evaluation.final_ranking_score,
                json.dumps(evaluation.matching_skills, ensure_ascii=False),
                json.dumps(evaluation.missing_skills, ensure_ascii=False),
                evaluation.verdict_summary,
                evaluation.pitch_recommendation or "",
                evaluation.reasoning.model_dump_json() if evaluation.reasoning else None,
                evaluation.engine,
            ))
            cursor.execute("UPDATE job_listings SET status = 'EVALUATED' WHERE id = ?", (listing_id,))
            conn.commit()

    def update_application_status(self, listing_id: int, app_status: str, notes: Optional[str] = None):
        """Actualiza el estado de postulación ('🚀 Postulado', etc.), notas y sincroniza la memoria CRM."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            if app_status == "🚀 Postulado":
                cursor.execute(
                    "UPDATE job_listings SET application_status = ?, applied_at = CURRENT_TIMESTAMP WHERE id = ?",
                    (app_status, listing_id),
                )
            else:
                cursor.execute(
                    "UPDATE job_listings SET application_status = ? WHERE id = ?",
                    (app_status, listing_id),
                )
            if notes is not None:
                cursor.execute(
                    "UPDATE job_listings SET user_notes = ? WHERE id = ?",
                    (notes, listing_id),
                )
            conn.commit()
            if self.db_path != ":memory:":
                try:
                    conn.execute("PRAGMA wal_checkpoint(PASSIVE);")
                except Exception:
                    pass

            if self._memory_path:
                rows = cursor.execute(
                    """
                    SELECT deduplication_hash, application_status, applied_at, user_notes
                    FROM job_listings
                    WHERE application_status != '📋 Por postular' OR (user_notes IS NOT NULL AND user_notes != '')
                    """
                ).fetchall()
                memory = self._load_crm_memory()
                # Actualizar estado de la fila recién modificada (incluso si volvió a '📋 Por postular')
                cur_row = cursor.execute(
                    "SELECT deduplication_hash, application_status, applied_at, user_notes FROM job_listings WHERE id = ?",
                    (listing_id,),
                ).fetchone()
                if cur_row:
                    h = cur_row["deduplication_hash"]
                    if cur_row["application_status"] == "📋 Por postular" and not (cur_row["user_notes"] or "").strip():
                        memory.pop(h, None)
                    else:
                        memory[h] = {
                            "application_status": cur_row["application_status"],
                            "applied_at": cur_row["applied_at"],
                            "user_notes": cur_row["user_notes"] or "",
                        }
                for r in rows:
                    memory[r["deduplication_hash"]] = {
                        "application_status": r["application_status"],
                        "applied_at": r["applied_at"],
                        "user_notes": r["user_notes"] or "",
                    }
                self._save_crm_memory(memory)

    def get_pending_listings(self, limit: int = 200) -> List[Tuple[int, JobListing]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM job_listings 
                WHERE status = 'PENDING_EVALUATION' 
                ORDER BY created_at DESC 
                LIMIT ?
            """, (limit,))
            rows = cursor.fetchall()
            results = []
            for row in rows:
                listing = JobListing(
                    id=str(row["id"]),
                    source=JobSource(row["source"]),
                    title=row["title"],
                    company=row["company"],
                    location=row["location"],
                    modality=Modality(row["modality"]) if row["modality"] in Modality._value2member_map_ else Modality.DESCONOCIDO,
                    url=row["url"],
                    salary=row["salary"],
                    raw_description=row["raw_description"],
                    published_at=row["published_at"],
                    deduplication_hash=row["deduplication_hash"]
                )
                results.append((row["id"], listing))
            return results

    def get_listing(self, listing_id: int) -> Optional[JobListing]:
        """Recupera una vacante concreta (para re-evaluarla individualmente desde el dashboard)."""
        with self._get_connection() as conn:
            row = conn.execute("SELECT * FROM job_listings WHERE id = ?", (listing_id,)).fetchone()
            if not row:
                return None
            return JobListing(
                id=str(row["id"]),
                source=JobSource(row["source"]),
                title=row["title"],
                company=row["company"],
                location=row["location"],
                modality=Modality(row["modality"]) if row["modality"] in Modality._value2member_map_ else Modality.DESCONOCIDO,
                url=row["url"],
                salary=row["salary"],
                raw_description=row["raw_description"],
                published_at=row["published_at"],
                deduplication_hash=row["deduplication_hash"],
            )

    def reset_evaluations(self):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM job_evaluations;")
            cursor.execute("UPDATE job_listings SET status = 'PENDING_EVALUATION';")
            conn.commit()

    def get_all_evaluated_jobs(self) -> List[dict]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT 
                    j.id, j.title, j.company, j.location, j.modality, j.url, j.salary, j.source,
                    j.raw_description, j.published_at, j.created_at,
                    COALESCE(j.application_status, '📋 Por postular') AS application_status,
                    j.applied_at,
                    COALESCE(j.user_notes, '') AS user_notes,
                    e.is_pre_professional, e.is_unrealistic_or_smoke,
                    e.technical_match_score, e.modality_score, e.location_score, e.final_ranking_score,
                    e.matching_skills, e.missing_skills, e.verdict_summary, e.pitch_recommendation,
                    e.evaluated_at, e.reasoning_chain, COALESCE(e.engine, 'heuristic') AS engine
                FROM job_listings j
                INNER JOIN job_evaluations e ON j.id = e.listing_id
                ORDER BY e.final_ranking_score DESC
            """)
            return [dict(row) for row in cursor.fetchall()]

    def get_top_ranked_jobs(self, min_score: float = 50.0, limit: int = 10) -> List[dict]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT 
                    j.id, j.title, j.company, j.location, j.modality, j.url, j.salary, j.source,
                    COALESCE(j.application_status, '📋 Por postular') AS application_status,
                    j.applied_at,
                    COALESCE(j.user_notes, '') AS user_notes,
                    e.is_pre_professional, e.is_unrealistic_or_smoke,
                    e.technical_match_score, e.modality_score, e.location_score, e.final_ranking_score,
                    e.matching_skills, e.missing_skills, e.verdict_summary, e.pitch_recommendation
                FROM job_listings j
                INNER JOIN job_evaluations e ON j.id = e.listing_id
                WHERE e.is_pre_professional = 1 AND e.is_unrealistic_or_smoke = 0 AND e.final_ranking_score >= ?
                ORDER BY e.final_ranking_score DESC
                LIMIT ?
            """, (min_score, limit))
            return [dict(row) for row in cursor.fetchall()]
