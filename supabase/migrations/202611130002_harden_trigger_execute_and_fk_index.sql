-- Migration: 202611130002_harden_trigger_execute_and_fk_index.sql
-- Description: Revoke RPC/public EXECUTE on SECURITY DEFINER trigger functions and cover user_job_states.listing_id FK.

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_is_admin_self_escalation() FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_user_job_states_listing_id
  ON public.user_job_states (listing_id);
