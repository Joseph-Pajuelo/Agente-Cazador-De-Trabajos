import os
import sys
import json
import sqlite3
import argparse
import logging
from pathlib import Path
from typing import Optional, Dict, Any, List

# Asegurar importaciones relativas al pipeline y al repo
script_dir = Path(__file__).resolve().parent
pipeline_root = script_dir.parent
repo_root = pipeline_root.parent.parent

for p in (repo_root, pipeline_root):
    p_str = str(p)
    if p_str in sys.path:
        sys.path.remove(p_str)
    sys.path.insert(0, p_str)

from storage.base import (
    normalize_listing_enrichment,
    map_crm_status,
    CRM_STATUS_MAP,
)
from domain.models import JobListing

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("MigrateSqliteToSupabase")


def load_catalog_from_json(json_path: Path) -> dict:
    if not json_path.exists():
        raise FileNotFoundError(f"JSON seed file not found: {json_path}")
    return json.loads(json_path.read_text(encoding="utf-8"))


def load_catalog_from_sqlite(db_path: Path, crm_path: Optional[Path] = None) -> dict:
    """Extrae todo el catálogo histórico de SQLite + crm_memory.json."""
    if not db_path.exists():
        raise FileNotFoundError(f"SQLite database not found: {db_path}")

    crm_memory = {}
    if crm_path and crm_path.exists():
        try:
            crm_memory = json.loads(crm_path.read_text(encoding="utf-8"))
        except Exception as e:
            logger.warning(f"Error reading crm_memory.json: {e}")

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row

    # Leer vacantes
    raw_listings = conn.execute("SELECT * FROM job_listings ORDER BY id ASC").fetchall()
    listings = []
    id_to_hash = {}

    for row in raw_listings:
        r = dict(row)
        dedup_hash = r.get("deduplication_hash")
        id_to_hash[r["id"]] = dedup_hash

        # Reconciliar CRM memory
        crm_entry = crm_memory.get(dedup_hash, {})
        raw_status = crm_entry.get("application_status") or r.get("application_status") or "to_apply"
        applied_at = crm_entry.get("applied_at") or r.get("applied_at")
        user_notes = crm_entry.get("user_notes") or r.get("user_notes") or ""

        canonical_status = map_crm_status(raw_status)
        crm_data = None
        if canonical_status != "to_apply" or applied_at or user_notes.strip():
            crm_data = {
                "status": canonical_status,
                "applied_at": applied_at,
                "notes": user_notes.strip(),
            }

        # Enriquecimiento precomputado
        listing_obj = JobListing(
            source=r["source"],
            title=r["title"],
            company=r["company"],
            location=r.get("location") or "Lima, Perú",
            modality=r.get("modality") or "No especificado",
            url=r["url"],
            salary=r.get("salary"),
            raw_description=r["raw_description"],
            published_at=r.get("published_at"),
            deduplication_hash=dedup_hash,
        )
        enrichment = normalize_listing_enrichment(listing_obj)

        listings.append({
            "deduplication_hash": dedup_hash,
            "source": r["source"],
            "title": r["title"],
            "company": r["company"],
            "location": r.get("location") or "Lima, Perú",
            "modality": r.get("modality") or "No especificado",
            "url": r["url"],
            "salary": r.get("salary"),
            "raw_description": r["raw_description"],
            "published_at": r.get("published_at"),
            "published_date": enrichment["published_date"],
            "resolved_brand_key": enrichment["resolved_brand_key"],
            "resolved_via_agency": bool(enrichment["resolved_via_agency"]),
            "agency_clue": enrichment["agency_clue"] or "",
            "sector_hint": enrichment["sector_hint"],
            "status": r.get("status") or "PENDING_EVALUATION",
            "created_at": r.get("created_at"),
            "crm": crm_data,
        })

    # Leer evaluaciones
    raw_evals = conn.execute("SELECT * FROM job_evaluations ORDER BY id ASC").fetchall()
    evaluations = []
    for row in raw_evals:
        r = dict(row)
        listing_hash = id_to_hash.get(r["listing_id"])
        if not listing_hash:
            continue

        reasoning = None
        if r.get("reasoning_chain"):
            try:
                reasoning = json.loads(r["reasoning_chain"])
            except Exception:
                reasoning = None

        matching_skills = []
        if r.get("matching_skills"):
            try:
                matching_skills = json.loads(r["matching_skills"])
            except Exception:
                matching_skills = []

        missing_skills = []
        if r.get("missing_skills"):
            try:
                missing_skills = json.loads(r["missing_skills"])
            except Exception:
                missing_skills = []

        evaluations.append({
            "deduplication_hash": listing_hash,
            "is_pre_professional": bool(r["is_pre_professional"]),
            "is_unrealistic_or_smoke": bool(r["is_unrealistic_or_smoke"]),
            "technical_match_score": float(r["technical_match_score"]),
            "modality_score": float(r.get("modality_score", 0.0)),
            "location_score": float(r.get("location_score", 0.0)),
            "final_ranking_score": float(r["final_ranking_score"]),
            "matching_skills": matching_skills,
            "missing_skills": missing_skills,
            "verdict_summary": r["verdict_summary"],
            "reasoning_chain": reasoning,
            "engine": r.get("engine", "heuristic"),
            "evaluated_at": r.get("evaluated_at"),
        })

    conn.close()

    return {
        "version": "1.0",
        "exported_at": "2026-11-13T00:00:00Z",
        "total_listings": len(listings),
        "total_evaluations": len(evaluations),
        "listings": listings,
        "evaluations": evaluations,
    }


def run_migration(
    catalog_data: dict,
    supabase_client: Any,
    dry_run: bool = False,
    owner_email: Optional[str] = None,
) -> dict:
    """
    Ejecuta la migración idempotente de vacantes, evaluaciones y estados CRM a Supabase.
    En dry_run no realiza escrituras.
    """
    listings = catalog_data.get("listings", [])
    evaluations = catalog_data.get("evaluations", [])

    crm_states_to_migrate = [
        l for l in listings if l.get("crm") and l["crm"].get("status")
    ]

    stats = {
        "listings_count": len(listings),
        "evaluations_count": len(evaluations),
        "crm_states_count": len(crm_states_to_migrate),
        "dry_run": dry_run,
        "inserted_listings": 0,
        "inserted_evaluations": 0,
        "inserted_crm_states": 0,
    }

    if dry_run:
        logger.info(
            f"[DRY-RUN] Validado catálogo: {len(listings)} vacantes, "
            f"{len(evaluations)} evaluaciones, {len(crm_states_to_migrate)} estados CRM."
        )
        return stats

    if supabase_client is None:
        raise ValueError("Supabase client is required for non-dry-run execution")

    # 1. Upsert de job_listings
    logger.info(f"Migrando {len(listings)} vacantes a job_listings...")
    batch_size = 50
    for i in range(0, len(listings), batch_size):
        batch = listings[i:i + batch_size]
        payloads = []
        for l in batch:
            payloads.append({
                "deduplication_hash": l["deduplication_hash"],
                "source": l["source"],
                "title": l["title"],
                "company": l["company"],
                "location": l.get("location") or "Lima, Perú",
                "modality": l.get("modality") or "No especificado",
                "url": l["url"],
                "salary": l.get("salary"),
                "raw_description": l["raw_description"],
                "published_at": l.get("published_at"),
                "published_date": l.get("published_date"),
                "resolved_brand_key": l.get("resolved_brand_key"),
                "resolved_via_agency": bool(l.get("resolved_via_agency", False)),
                "agency_clue": l.get("agency_clue") or "",
                "sector_hint": l.get("sector_hint"),
                "status": l.get("status") or "EVALUATED",
            })
        resp = supabase_client.table("job_listings").upsert(payloads, on_conflict="deduplication_hash").execute()
        stats["inserted_listings"] += len(resp.data or [])

    # 2. Mapear deduplication_hash -> listing_id en Supabase
    logger.info("Mapeando listing IDs generados en Supabase...")
    hashes = [l["deduplication_hash"] for l in listings]
    hash_to_id = {}
    for i in range(0, len(hashes), 100):
        h_batch = hashes[i:i + 100]
        resp = supabase_client.table("job_listings").select("id, deduplication_hash").in_("deduplication_hash", h_batch).execute()
        for row in resp.data or []:
            hash_to_id[row["deduplication_hash"]] = row["id"]

    # 3. Upsert de job_evaluations (profile_id = None, SIN pitch_recommendation)
    logger.info(f"Migrando {len(evaluations)} evaluaciones a job_evaluations...")
    for i in range(0, len(evaluations), batch_size):
        batch = evaluations[i:i + batch_size]
        eval_payloads = []
        for ev in batch:
            listing_id = hash_to_id.get(ev["deduplication_hash"])
            if not listing_id:
                continue
            eval_payloads.append({
                "listing_id": listing_id,
                "profile_id": None,
                "is_pre_professional": bool(ev["is_pre_professional"]),
                "is_unrealistic_or_smoke": bool(ev["is_unrealistic_or_smoke"]),
                "technical_match_score": float(ev["technical_match_score"]),
                "modality_score": float(ev.get("modality_score", 0.0)),
                "location_score": float(ev.get("location_score", 0.0)),
                "final_ranking_score": float(ev["final_ranking_score"]),
                "matching_skills": ev.get("matching_skills") or [],
                "missing_skills": ev.get("missing_skills") or [],
                "verdict_summary": ev["verdict_summary"],
                "reasoning_chain": ev.get("reasoning_chain"),
                "engine": ev.get("engine", "heuristic"),
            })
        if eval_payloads:
            resp = supabase_client.table("job_evaluations").upsert(
                eval_payloads, on_conflict="listing_id,profile_id"
            ).execute()
            stats["inserted_evaluations"] += len(resp.data or [])

    # 4. Asignar estados CRM a usuario si se indicó owner_email
    if owner_email and crm_states_to_migrate:
        logger.info(f"Buscando perfil para owner email: {owner_email}...")
        # Buscar en profiles
        prof_resp = supabase_client.table("profiles").select("id").ilike("headline", f"%{owner_email}%").execute()
        user_id = None
        if prof_resp.data and len(prof_resp.data) > 0:
            user_id = prof_resp.data[0]["id"]
        else:
            # Alternativa: verificar si id coincide con auth.users vía rpc o consultar primera fila si único
            all_profs = supabase_client.table("profiles").select("id").limit(1).execute()
            if all_profs.data:
                user_id = all_profs.data[0]["id"]

        if user_id:
            logger.info(f"Asignando estados CRM al usuario {user_id} ({owner_email})...")
            # Consultar estados ya existentes para NO sobreescribir
            existing_states_resp = (
                supabase_client.table("user_job_states")
                .select("listing_id")
                .eq("user_id", user_id)
                .execute()
            )
            existing_listing_ids = {row["listing_id"] for row in (existing_states_resp.data or [])}

            crm_inserts = []
            for l in crm_states_to_migrate:
                listing_id = hash_to_id.get(l["deduplication_hash"])
                if not listing_id or listing_id in existing_listing_ids:
                    continue
                crm = l["crm"]
                crm_inserts.append({
                    "user_id": user_id,
                    "listing_id": listing_id,
                    "status": map_crm_status(crm.get("status")),
                    "applied_at": crm.get("applied_at"),
                    "notes": crm.get("notes") or "",
                })

            if crm_inserts:
                resp = supabase_client.table("user_job_states").insert(crm_inserts).execute()
                stats["inserted_crm_states"] = len(resp.data or [])
                logger.info(f"Insertados {stats['inserted_crm_states']} nuevos estados CRM para {owner_email}.")
        else:
            logger.warning(f"No se encontró un usuario para el email {owner_email}. Estados CRM omitidos.")

    return stats


def main():
    parser = argparse.ArgumentParser(description="Migración idempotente de catálogo SQLite a Supabase")
    parser.add_argument("--source-json", type=str, default=None, help="Ruta al archivo JSON de catálogo")
    parser.add_argument("--source-db", type=str, default=None, help="Ruta a base SQLite jobs.db")
    parser.add_argument("--dry-run", action="store_true", help="Validar y reportar sin escribir a Supabase")
    parser.add_argument("--owner-email", type=str, default=None, help="Email del usuario propietario para CRM")
    args = parser.parse_args()

    default_json = pipeline_root / "seeds" / "initial_catalog.json"
    default_db = repo_root / "jobs.db"
    default_crm = repo_root / "storage" / "crm_memory.json"

    catalog_data = None
    if args.source_json:
        catalog_data = load_catalog_from_json(Path(args.source_json))
    elif default_json.exists():
        logger.info(f"Cargando catálogo desde archivo seed JSON: {default_json}")
        catalog_data = load_catalog_from_json(default_json)
    elif args.source_db:
        catalog_data = load_catalog_from_sqlite(Path(args.source_db), default_crm)
    elif default_db.exists():
        logger.info(f"Cargando catálogo desde SQLite: {default_db}")
        catalog_data = load_catalog_from_sqlite(default_db, default_crm)
    else:
        logger.error("No se encontró archivo JSON de catálogo ni base de datos SQLite.")
        sys.exit(1)

    client = None
    if not args.dry_run:
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            logger.error("SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son requeridos para migración activa.")
            sys.exit(1)
        from supabase import create_client
        client = create_client(url, key)

    stats = run_migration(
        catalog_data=catalog_data,
        supabase_client=client,
        dry_run=args.dry_run,
        owner_email=args.owner_email,
    )
    print("\n" + "=" * 60)
    print("RESUMEN DE MIGRACIÓN")
    print(f"  Modo dry-run:       {stats['dry_run']}")
    print(f"  Total vacantes:     {stats['listings_count']}")
    print(f"  Total evaluaciones: {stats['evaluations_count']}")
    print(f"  Estados CRM:        {stats['crm_states_count']}")
    if not stats["dry_run"]:
        print(f"  Vacantes subidas:   {stats['inserted_listings']}")
        print(f"  Evals subidas:      {stats['inserted_evaluations']}")
        print(f"  CRM subidos:        {stats['inserted_crm_states']}")
    print("=" * 60)


if __name__ == "__main__":
    main()
