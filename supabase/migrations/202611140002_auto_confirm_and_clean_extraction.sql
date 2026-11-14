-- Auto-confirm email/password signups for personal portal & ensure profile rows exist
CREATE OR REPLACE FUNCTION public.auto_confirm_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NULL THEN
    NEW.email_confirmed_at := now();
  END IF;
  NEW.raw_user_meta_data := jsonb_set(
    COALESCE(NEW.raw_user_meta_data, '{}'::jsonb),
    '{email_verified}',
    'true'::jsonb,
    true
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_auto_confirm
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_confirm_auth_user();

-- Confirm any existing unconfirmed users so they can sign in immediately
UPDATE auth.users
SET
  email_confirmed_at = COALESCE(email_confirmed_at, now()),
  raw_user_meta_data = jsonb_set(
    COALESCE(raw_user_meta_data, '{}'::jsonb),
    '{email_verified}',
    'true'::jsonb,
    true
  )
WHERE email_confirmed_at IS NULL;

-- Ensure handle_new_user trigger populates profiles with default Ate exclusion
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, excluded_districts)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(COALESCE(NEW.email, 'Usuario'), '@', 1)
    ),
    ARRAY['Ate']::text[]
  )
  ON CONFLICT (id) DO UPDATE
  SET
    full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
    excluded_districts = COALESCE(public.profiles.excluded_districts, ARRAY['Ate']::text[]);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Backfill profiles for any existing auth.users rows
INSERT INTO public.profiles (id, full_name, excluded_districts)
SELECT
  u.id,
  COALESCE(
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'name',
    split_part(COALESCE(u.email, 'Usuario'), '@', 1)
  ),
  ARRAY['Ate']::text[]
FROM auth.users u
ON CONFLICT (id) DO UPDATE
SET
  full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
  excluded_districts = COALESCE(public.profiles.excluded_districts, ARRAY['Ate']::text[]);
