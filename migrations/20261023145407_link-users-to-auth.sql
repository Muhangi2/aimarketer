-- App-owned profile row for every InsForge auth user, filled automatically on sign-up
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

GRANT SELECT, UPDATE ON public.profiles TO authenticated;

CREATE POLICY profiles_owner_select ON public.profiles
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

CREATE POLICY profiles_owner_update ON public.profiles
FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.profile->>'name',
    NEW.profile->>'avatar_url'
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();
