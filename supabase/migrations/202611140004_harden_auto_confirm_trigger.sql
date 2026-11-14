-- Harden trigger function permissions: prevent RPC invocation via PostgREST by anon/authenticated roles
REVOKE ALL ON FUNCTION public.auto_confirm_auth_user() FROM PUBLIC, anon, authenticated;
