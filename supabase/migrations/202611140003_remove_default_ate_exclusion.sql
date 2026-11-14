-- Remove automatic Ate district exclusion default so the main Radar shows all Lima districts unless user customizes exclusions.

ALTER TABLE public.profiles
  ALTER COLUMN excluded_districts SET DEFAULT '{}'::text[];

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
    '{}'::text[]
  )
  ON CONFLICT (id) DO UPDATE
  SET
    full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
    excluded_districts = COALESCE(public.profiles.excluded_districts, '{}'::text[]);
  RETURN NEW;
END;
$$;

UPDATE public.profiles
SET excluded_districts = '{}'::text[]
WHERE excluded_districts = ARRAY['Ate']::text[];
