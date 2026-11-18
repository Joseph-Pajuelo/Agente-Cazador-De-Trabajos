"""
Repositorio SQLite local ligero para ejecución offline y pruebas automatizadas (pytest).
Implementa el protocolo JobRepository manteniendo paridad de columnas con SupabaseRepository.
"""
import sqlite3
import json
import logging
from pathlib import Path
from typing import Optional, List, Tuple, Set, Dict, Any

from domain.models import JobListing, JobEvaluation
from domain.enums import JobSource, Modality
from storage.base import JobRepository, normalize_listing_enrichment

logger = logging.getLogger(__name__)


class SqliteRepository(JobRepository):
    """
    Implementación SQLite con modo WAL (Write-Ahead Logging) para desarrollo local y tests.
    """

    def __init__(self, db_path: Optional[str] = None):
        if db_path is None:
            pipeline_dir = Path(__file__).resolve().parent.parent
            self.db_path = str(pipeline_dir / "jobs.db")
        else:
            self.db_path = db_path
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=15.0)
        conn.row_factory = sqlite3.Row
        if self.db_path != ":memory:":
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("PRAGMA synchronous=NORMAL;")
        return conn

    # ========================================================================
    # 1. Inicialización del Esquema Local
    # ========================================================================
    def _init_db(self) -> None:
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
                    published_date TEXT,
                    company_logo_url TEXT,
                    resolved_brand_key TEXT,
                    resolved_via_agency INTEGER DEFAULT 0,
                    agency_clue TEXT DEFAULT '',
                    sector_hint TEXT,
                    district TEXT,
                    lima_zone TEXT,
                    category TEXT,
                    role_level TEXT DEFAULT 'unknown',
                    english_required INTEGER DEFAULT 0,
                    english_level TEXT,
                    salary_min INTEGER,
                    salary_max INTEGER,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    status TEXT DEFAULT 'PENDING_EVALUATION'
                );
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS job_evaluations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    listing_id INTEGER UNIQUE NOT NULL,
                    profile_id TEXT,
                    is_pre_professional INTEGER NOT NULL,
                    is_unrealistic_or_smoke INTEGER NOT NULL,
                    technical_match_score REAL NOT NULL,
                    modality_score REAL NOT NULL,
                    location_score REAL NOT NULL,
                    final_ranking_score REAL NOT NULL,
                    matching_skills TEXT,
                    missing_skills TEXT,
                    verdict_summary TEXT NOT NULL,
                    evaluated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    reasoning_chain TEXT,
                    engine TEXT DEFAULT 'heuristic',
                    FOREIGN KEY (listing_id) REFERENCES job_listings (id) ON DELETE CASCADE
                );
            """)
            conn.commit()

    def checkpoint(self) -> None:
        """Consolida el archivo WAL dentro de la base de datos SQLite."""
        if self.db_path == ":memory:":
            return
        try:
            with self._get_connection() as conn:
                conn.execute("PRAGMA wal_checkpoint(TRUNCATE);")
        except Exception as e:
            logger.debug(f"No se pudo ejecutar wal_checkpoint: {e}")

    # ========================================================================
    # 2. Operaciones de Ingesta y Deduplicación
    # ========================================================================
    def get_known_urls(self) -> Set[str]:
        """Retorna el conjunto de URLs ya almacenadas."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT url FROM job_listings;")
            return {row["url"] for row in cursor.fetchall()}

    def insert_listing(self, listing: JobListing) -> Tuple[Optional[int], bool]:
        """Inserta una vacante enriquecida si su hash SHA-256 no existe aún."""
        if not listing.deduplication_hash:
            listing.compute_hash()

        enrichment = normalize_listing_enrichment(listing)

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id FROM job_listings WHERE deduplication_hash = ?",
                (listing.deduplication_hash,),
            )
            row = cursor.fetchone()
            if row:
                return row["id"], False

            try:
                cursor.execute("""
                    INSERT INTO job_listings (
                        deduplication_hash, source, title, company, location,
                        modality, url, salary, raw_description, published_at,
                        published_date, company_logo_url, resolved_brand_key,
                        resolved_via_agency, agency_clue, sector_hint,
                        district, lima_zone, category, role_level,
                        english_required, english_level, salary_min, salary_max
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    listing.deduplication_hash,
                    listing.source.value if hasattr(listing.source, "value") else str(listing.source),
                    listing.title,
                    listing.company,
                    listing.location,
                    listing.modality.value if hasattr(listing.modality, "value") else str(listing.modality),
                    listing.url,
                    listing.salary,
                    listing.raw_description,
                    listing.published_at,
                    enrichment["published_date"],
                    listing.company_logo_url,
                    enrichment["resolved_brand_key"],
                    1 if enrichment["resolved_via_agency"] else 0,
                    enrichment["agency_clue"],
                    enrichment["sector_hint"],
                    enrichment["district"],
                    enrichment["lima_zone"],
                    enrichment["category"],
                    enrichment["role_level"],
                    1 if enrichment["english_required"] else 0,
                    enrichment["english_level"],
                    enrichment["salary_min"],
                    enrichment["salary_max"],
                ))
                conn.commit()
                return cursor.lastrowid, True
            except sqlite3.IntegrityError:
                cursor.execute(
                    "SELECT id FROM job_listings WHERE deduplication_hash = ?",
                    (listing.deduplication_hash,),
                )
                return cursor.fetchone()["id"], False

    # ========================================================================
    # 3. Operaciones de Evaluación y Consultas
    # ========================================================================
    def insert_evaluation(
        self,
        listing_id: int,
        evaluation: JobEvaluation,
        profile_id: Optional[str] = None,
    ) -> None:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT OR REPLACE INTO job_evaluations (
                    listing_id, profile_id, is_pre_professional, is_unrealistic_or_smoke,
                    technical_match_score, modality_score, location_score, final_ranking_score,
                    matching_skills, missing_skills, verdict_summary,
                    reasoning_chain, engine
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                listing_id,
                profile_id,
                1 if evaluation.is_pre_professional else 0,
                1 if evaluation.is_unrealistic_or_smoke else 0,
                evaluation.technical_match_score,
                evaluation.modality_score,
                evaluation.location_score,
                evaluation.final_ranking_score,
                json.dumps(evaluation.matching_skills, ensure_ascii=False),
                json.dumps(evaluation.missing_skills, ensure_ascii=False),
                evaluation.verdict_summary,
                evaluation.reasoning.model_dump_json() if evaluation.reasoning else None,
                evaluation.engine,
            ))
            cursor.execute("UPDATE job_listings SET status = 'EVALUATED' WHERE id = ?", (listing_id,))
            conn.commit()

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
                    modality=(
                        Modality(row["modality"])
                        if row["modality"] in Modality._value2member_map_
                        else Modality.DESCONOCIDO
                    ),
                    url=row["url"],
                    salary=row["salary"],
                    raw_description=row["raw_description"],
                    published_at=row["published_at"],
                    company_logo_url=row["company_logo_url"],
                    deduplication_hash=row["deduplication_hash"],
                )
                results.append((row["id"], listing))
            return results

    def reset_evaluations(self) -> None:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM job_evaluations;")
            cursor.execute("UPDATE job_listings SET status = 'PENDING_EVALUATION';")
            conn.commit()

    def get_all_evaluated_jobs(self) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT
                    j.id, j.deduplication_hash, j.title, j.company, j.location, j.modality, j.url, j.salary, j.source,
                    j.raw_description, j.published_at, j.published_date, j.created_at, j.company_logo_url,
                    j.resolved_brand_key, j.resolved_via_agency, j.agency_clue, j.sector_hint,
                    j.district, j.lima_zone, j.category, j.role_level, j.english_required, j.english_level,
                    j.salary_min, j.salary_max,
                    e.is_pre_professional, e.is_unrealistic_or_smoke,
                    e.technical_match_score, e.modality_score, e.location_score, e.final_ranking_score,
                    e.matching_skills, e.missing_skills, e.verdict_summary,
                    e.evaluated_at, e.reasoning_chain, COALESCE(e.engine, 'heuristic') AS engine
                FROM job_listings j
                INNER JOIN job_evaluations e ON j.id = e.listing_id
                ORDER BY e.final_ranking_score DESC
            """)
            return [dict(row) for row in cursor.fetchall()]
