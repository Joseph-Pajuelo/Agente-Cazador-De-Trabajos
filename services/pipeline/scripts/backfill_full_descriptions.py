"""Backfill truncated or fallback job descriptions from live public job URLs."""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
from bs4 import BeautifulSoup

PIPELINE_ROOT = Path(__file__).resolve().parent.parent
if str(PIPELINE_ROOT) not in sys.path:
    sys.path.insert(0, str(PIPELINE_ROOT))

from adapters.practicas_pe import PracticasPeAdapter  # noqa: E402

logger = logging.getLogger(__name__)

BUMERAN_SEARCH_URL = "https://www.bumeran.com.pe/api/avisos/searchV2"
DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "es-PE,es;q=0.9,en;q=0.8",
}
BUMERAN_HEADERS = {
    **DEFAULT_HEADERS,
    "Accept": "application/json, text/plain, */*",
    "Content-Type": "application/json",
    "Origin": "https://www.bumeran.com.pe",
    "Referer": "https://www.bumeran.com.pe/",
    "x-site-id": "BMPE",
}


def parse_mcp_output_rows(raw_text: str) -> List[Dict[str, Any]]:
    """Extract row dicts from either a raw JSON array file or an MCP execute_sql envelope."""
    stripped = raw_text.strip()
    if stripped.startswith("["):
        return json.loads(stripped)

    envelope = json.loads(stripped)
    if isinstance(envelope, dict) and isinstance(envelope.get("result"), str):
        match = re.search(r"<untrusted-data-[^>]+>\s*(\[.*\])\s*</untrusted-data-", envelope["result"], re.S)
        if match:
            return json.loads(match.group(1))
    raise ValueError("Could not locate JSON row array inside input file.")


def _normalize_clean_text(text: str) -> str:
    lines = [line.strip() for line in text.splitlines()]
    compact = "\n".join(line for line in lines if line)
    return compact[:4000]


def _get_with_retry(
    client: httpx.Client,
    url: str,
    *,
    headers: Optional[Dict[str, str]] = None,
    attempts: int = 3,
    base_delay: float = 1.0,
) -> Optional[httpx.Response]:
    for attempt in range(attempts):
        try:
            resp = client.get(url, headers=headers)
            if resp.status_code == 200:
                return resp
            if resp.status_code in (429, 503, 502):
                time.sleep(base_delay * (attempt + 1))
                continue
            return resp
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            logger.debug(f"Retry {attempt + 1}/{attempts} failed for {url}: {exc}")
            time.sleep(base_delay * (attempt + 1))
    return None


def fetch_bumeran_full_description(client: httpx.Client, title: str, url: str) -> Optional[str]:
    """Query Bumeran searchV2 by title to recover full HTML `detalle` matching the aviso ID."""
    id_match = re.search(r"/empleos/(\d+)\.html", url or "")
    target_id = id_match.group(1) if id_match else None

    candidate_queries: List[str] = []
    if title:
        candidate_queries.append(title.strip())
        short_core = re.split(r"\s*[-–/:|(]\s*", title.strip())[0].strip()
        if short_core and short_core not in candidate_queries:
            candidate_queries.append(short_core)

    for query in candidate_queries:
        try:
            resp = client.post(
                BUMERAN_SEARCH_URL,
                params={"pageSize": 25, "page": 0, "sort": "RECIENTES"},
                json={"query": query},
                headers=BUMERAN_HEADERS,
            )
            if resp.status_code != 200:
                continue
            items = resp.json().get("content", []) or []
            matched_item = None
            if target_id:
                for it in items:
                    if str(it.get("id", "")) == target_id:
                        matched_item = it
                        break
            if matched_item is None:
                norm_title = " ".join(title.lower().split())
                for it in items:
                    if " ".join(str(it.get("titulo", "")).lower().split()) == norm_title:
                        matched_item = it
                        break
            if matched_item and matched_item.get("detalle"):
                text = BeautifulSoup(str(matched_item["detalle"]), "html.parser").get_text("\n", strip=True)
                return _normalize_clean_text(text)
        except Exception as exc:
            logger.debug(f"Bumeran query failed ({query}): {exc}")
    return None


def fetch_computrabajo_full_description(client: httpx.Client, url: str) -> Optional[str]:
    resp = _get_with_retry(client, url, headers=DEFAULT_HEADERS, attempts=3, base_delay=1.2)
    if not resp or resp.status_code != 200:
        return None
    soup = BeautifulSoup(resp.text, "html.parser")
    for sel in ("p.mbB", "div[div-link='offer'] p.mbB", "div.box_detail p", "article p"):
        nodes = soup.select(sel)
        if nodes:
            best = max((n.get_text("\n", strip=True) for n in nodes), key=len, default="")
            if len(best) > 250:
                return _normalize_clean_text(best)
    return None


def fetch_linkedin_full_description(client: httpx.Client, url: str) -> Optional[str]:
    match = re.search(r"(\d{6,})(?:\?|$|/)", url or "")
    if not match:
        return None
    job_id = match.group(1)
    guest_url = f"https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{job_id}"
    resp = _get_with_retry(client, guest_url, headers=DEFAULT_HEADERS, attempts=3, base_delay=1.8)
    if not resp or resp.status_code != 200:
        return None
    soup = BeautifulSoup(resp.text, "html.parser")
    markup = soup.select_one(".show-more-less-html__markup") or soup.select_one(".description__text")
    if not markup:
        return None
    return _normalize_clean_text(markup.get_text("\n", strip=True))


def fetch_practicas_pe_full_description(client: httpx.Client, url: str) -> Optional[str]:
    resp = _get_with_retry(client, url, headers=DEFAULT_HEADERS, attempts=2, base_delay=1.0)
    if not resp or resp.status_code != 200:
        return None
    soup = BeautifulSoup(resp.text, "html.parser")
    extracted = PracticasPeAdapter.extract_description(soup)
    cleaned = _normalize_clean_text(extracted)
    lower = cleaned.lower()
    if lower.startswith("alerta\ninformativa") or lower.startswith("alerta informativa"):
        return None
    return cleaned


def recover_row_description(client: httpx.Client, row: Dict[str, Any]) -> Optional[str]:
    source = str(row.get("source", "")).lower()
    url = str(row.get("url", ""))
    title = str(row.get("title", ""))
    cur_len = int(row.get("cur_len") or len(row.get("raw_description") or ""))

    recovered: Optional[str] = None
    if source == "bumeran":
        recovered = fetch_bumeran_full_description(client, title, url)
    elif source == "computrabajo":
        recovered = fetch_computrabajo_full_description(client, url)
    elif source == "linkedin":
        recovered = fetch_linkedin_full_description(client, url)
    elif source == "practicas_pe":
        recovered = fetch_practicas_pe_full_description(client, url)

    if not recovered:
        return None
    if recovered.rstrip().endswith("..."):
        return None
    if len(recovered) <= cur_len + 40:
        return None
    return recovered


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill full vacancy descriptions from live portal URLs.")
    parser.add_argument("--input-json", help="Path to MCP SQL output JSON or JSON array of candidate rows.")
    parser.add_argument("--output-json", help="Path to write recovered {id, raw_description} updates.")
    parser.add_argument("--apply-supabase", action="store_true", help="Apply recovered updates directly via SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    rows: List[Dict[str, Any]] = []
    if args.input_json:
        raw_text = Path(args.input_json).read_text(encoding="utf-8")
        rows = parse_mcp_output_rows(raw_text)
    elif args.apply_supabase:
        from supabase import create_client

        sb_url = os.environ["SUPABASE_URL"]
        sb_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        client_sb = create_client(sb_url, sb_key)
        resp = (
            client_sb.table("job_listings")
            .select("id,source,title,url,raw_description")
            .neq("source", "cvmatcher")
            .execute()
        )
        rows = [
            {
                "id": r["id"],
                "source": r["source"],
                "title": r["title"],
                "url": r["url"],
                "cur_len": len(r.get("raw_description") or ""),
            }
            for r in (resp.data or [])
            if (r.get("raw_description") or "").rstrip().endswith("...") or len(r.get("raw_description") or "") < 360
        ]
    else:
        parser.error("Provide --input-json or --apply-supabase")

    logger.info(f"Target candidate rows to inspect: {len(rows)}")
    updates: List[Dict[str, Any]] = []
    stats: Dict[str, Dict[str, int]] = {}

    with httpx.Client(headers=DEFAULT_HEADERS, timeout=20.0, follow_redirects=True) as http_client:
        for idx, row in enumerate(rows, start=1):
            src = str(row.get("source", "unknown"))
            bucket = stats.setdefault(src, {"total": 0, "recovered": 0})
            bucket["total"] += 1

            recovered = recover_row_description(http_client, row)
            if recovered:
                bucket["recovered"] += 1
                updates.append({"id": int(row["id"]), "raw_description": recovered})

            if idx % 20 == 0 or idx == len(rows):
                logger.info(f"Progress {idx}/{len(rows)} — recovered {len(updates)}")

            time.sleep(0.35 if src == "linkedin" else 0.15)

    logger.info(f"Summary by source: {json.dumps(stats, ensure_ascii=False)}")

    if args.output_json:
        out_path = Path(args.output_json)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(updates, ensure_ascii=False, indent=2), encoding="utf-8")
        logger.info(f"Wrote {len(updates)} updates to {out_path}")

    if args.apply_supabase and updates:
        from supabase import create_client

        client_sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
        for upd in updates:
            client_sb.table("job_listings").update({"raw_description": upd["raw_description"]}).eq("id", upd["id"]).execute()
        logger.info(f"Applied {len(updates)} updates to Supabase")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
