import re
from pathlib import Path
import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
MIGRATION_PATH = REPO_ROOT / "supabase" / "migrations" / "202611130001_initial_schema.sql"
CONFIG_PATH = REPO_ROOT / "supabase" / "config.toml"


def get_migration_sql() -> str:
    if not MIGRATION_PATH.exists():
        raise FileNotFoundError(f"Migration file not found at: {MIGRATION_PATH}")
    return MIGRATION_PATH.read_text(encoding="utf-8")


def test_files_exist():
    assert CONFIG_PATH.is_file(), f"Missing Supabase config at {CONFIG_PATH}"
    assert MIGRATION_PATH.is_file(), f"Missing migration file at {MIGRATION_PATH}"
    content = get_migration_sql()
    assert len(content.strip()) > 0, "Migration file is empty"


def test_all_four_tables_created():
    sql = get_migration_sql()
    tables = [
        "public.profiles",
        "public.job_listings",
        "public.job_evaluations",
        "public.user_job_states",
    ]
    for table in tables:
        pattern = rf"CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?{re.escape(table)}"
        assert re.search(pattern, sql, re.IGNORECASE), f"Missing CREATE TABLE for {table}"


def test_row_level_security_enabled_on_all_tables():
    sql = get_migration_sql()
    tables = [
        "public.profiles",
        "public.job_listings",
        "public.job_evaluations",
        "public.user_job_states",
    ]
    for table in tables:
        pattern = rf"ALTER\s+TABLE\s+{re.escape(table)}\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY"
        assert re.search(pattern, sql, re.IGNORECASE), f"RLS not enabled on {table}"


def test_with_check_policies_on_profiles_and_user_job_states():
    sql = get_migration_sql()
    # profiles must have WITH CHECK for INSERT/UPDATE
    profiles_check = re.findall(
        r"CREATE\s+POLICY\s+[\"']?([^\"']+)[\"']?\s+ON\s+public\.profiles\s+FOR\s+(INSERT|UPDATE)[^;]+WITH\s+CHECK",
        sql,
        re.IGNORECASE | re.DOTALL,
    )
    assert len(profiles_check) >= 2, "profiles must have WITH CHECK on INSERT and UPDATE policies"

    # user_job_states must have WITH CHECK for INSERT/UPDATE
    states_check = re.findall(
        r"CREATE\s+POLICY\s+[\"']?([^\"']+)[\"']?\s+ON\s+public\.user_job_states\s+FOR\s+(INSERT|UPDATE)[^;]+WITH\s+CHECK",
        sql,
        re.IGNORECASE | re.DOTALL,
    )
    assert len(states_check) >= 2, "user_job_states must have WITH CHECK on INSERT and UPDATE policies"


def test_public_select_policies_anon_and_authenticated():
    sql = get_migration_sql()
    # job_listings public select
    assert re.search(
        r"CREATE\s+POLICY\s+[\"']?[^\"']+[\"']?\s+ON\s+public\.job_listings\s+FOR\s+SELECT\s+TO\s+[^;]*anon[^;]*authenticated",
        sql,
        re.IGNORECASE | re.DOTALL,
    ) or re.search(
        r"CREATE\s+POLICY\s+[\"']?[^\"']+[\"']?\s+ON\s+public\.job_listings\s+FOR\s+SELECT\s+TO\s+[^;]*authenticated[^;]*anon",
        sql,
        re.IGNORECASE | re.DOTALL,
    ) or re.search(
        r"CREATE\s+POLICY\s+[\"']?[^\"']+[\"']?\s+ON\s+public\.job_listings\s+FOR\s+SELECT\s+TO\s+public",
        sql,
        re.IGNORECASE | re.DOTALL,
    ), "job_listings must allow SELECT for anon and authenticated"

    # job_evaluations select for profile_id IS NULL
    assert re.search(
        r"CREATE\s+POLICY\s+[\"']?[^\"']+[\"']?\s+ON\s+public\.job_evaluations\s+FOR\s+SELECT\s+TO\s+anon\s+USING\s*\([^;]*profile_id\s+IS\s+NULL",
        sql,
        re.IGNORECASE | re.DOTALL,
    ), "job_evaluations must have anon SELECT policy for profile_id IS NULL"


def test_unique_nulls_not_distinct_constraint():
    sql = get_migration_sql()
    pattern = r"CONSTRAINT\s+uq_job_eval_listing_profile\s+UNIQUE\s+NULLS\s+NOT\s+DISTINCT\s*\(\s*listing_id\s*,\s*profile_id\s*\)"
    assert re.search(pattern, sql, re.IGNORECASE), "Missing uq_job_eval_listing_profile UNIQUE NULLS NOT DISTINCT constraint"


def test_prevent_is_admin_self_escalation_trigger():
    sql = get_migration_sql()
    assert "prevent_is_admin_self_escalation" in sql
    assert "protect_profile_is_admin" in sql
    assert "request.jwt.claim.role" in sql
    assert "service_role" in sql
    # Trigger must be BEFORE UPDATE on public.profiles
    pattern = r"CREATE\s+TRIGGER\s+protect_profile_is_admin\s+BEFORE\s+UPDATE\s+ON\s+public\.profiles"
    assert re.search(pattern, sql, re.IGNORECASE), "Missing BEFORE UPDATE trigger protect_profile_is_admin on public.profiles"


def test_handle_new_user_trigger():
    sql = get_migration_sql()
    assert "handle_new_user" in sql
    assert "on_auth_user_created" in sql
    # Function must have SECURITY DEFINER SET search_path = ''
    pattern = r"SECURITY\s+DEFINER\s+SET\s+search_path\s*=\s*''"
    assert re.search(pattern, sql, re.IGNORECASE), "handle_new_user must be SECURITY DEFINER SET search_path = ''"
    # Trigger must be AFTER INSERT on auth.users
    trigger_pattern = r"CREATE\s+TRIGGER\s+on_auth_user_created\s+AFTER\s+INSERT\s+ON\s+auth\.users"
    assert re.search(trigger_pattern, sql, re.IGNORECASE), "Missing AFTER INSERT trigger on_auth_user_created on auth.users"


def test_search_tsv_spanish_and_gin_index():
    sql = get_migration_sql()
    # search_tsv generated using 'spanish'
    tsv_pattern = r"search_tsv\s+tsvector\s+GENERATED\s+ALWAYS\s+AS\s*\(\s*to_tsvector\s*\(\s*'spanish'\s*,"
    assert re.search(tsv_pattern, sql, re.IGNORECASE), "search_tsv must use to_tsvector('spanish', ...)"
    # GIN index on search_tsv
    gin_pattern = r"CREATE\s+INDEX\s+idx_job_listings_search_tsv\s+ON\s+public\.job_listings\s+USING\s+GIN\s*\(\s*search_tsv\s*\)"
    assert re.search(gin_pattern, sql, re.IGNORECASE), "Missing GIN index idx_job_listings_search_tsv"
    # published_date index
    pub_pattern = r"CREATE\s+INDEX\s+idx_job_listings_published_date\s+ON\s+public\.job_listings\s*\(\s*published_date"
    assert re.search(pub_pattern, sql, re.IGNORECASE), "Missing index idx_job_listings_published_date"


def test_published_date_column_exists():
    sql = get_migration_sql()
    pattern = r"published_date\s+date"
    assert re.search(pattern, sql, re.IGNORECASE), "published_date column missing from public.job_listings"


def test_crm_check_constraint():
    sql = get_migration_sql()
    # CHECK (status IN ('to_apply', 'favorite', 'applied', 'interview', 'discarded'))
    pattern = r"CHECK\s*\(\s*status\s+IN\s*\(\s*'to_apply'\s*,\s*'favorite'\s*,\s*'applied'\s*,\s*'interview'\s*,\s*'discarded'\s*\)\s*\)"
    assert re.search(pattern, sql, re.IGNORECASE), "Missing CRM status CHECK constraint on user_job_states"


def test_no_pitch_recommendation_column():
    sql = get_migration_sql()
    assert "pitch_recommendation" not in sql, "pitch_recommendation legacy column must not be present"


def test_score_check_constraints():
    sql = get_migration_sql()
    tech_score_pattern = r"technical_match_score\s+numeric\(4,\s*3\)[^;]+CHECK\s*\(\s*technical_match_score\s*>=\s*0\s+AND\s+technical_match_score\s*<=\s*1\s*\)"
    assert re.search(tech_score_pattern, sql, re.IGNORECASE), "Missing CHECK constraint on technical_match_score"
    final_score_pattern = r"final_ranking_score\s+numeric\(5,\s*2\)[^;]+CHECK\s*\(\s*final_ranking_score\s*>=\s*0\s+AND\s+final_ranking_score\s*<=\s*100\s*\)"
    assert re.search(final_score_pattern, sql, re.IGNORECASE), "Missing CHECK constraint on final_ranking_score"
