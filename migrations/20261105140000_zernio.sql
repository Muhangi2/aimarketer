-- Zernio: the app holds one Zernio API key (ZERNIO_API_KEY) and gives each user their own Zernio
-- profile. Users connect Instagram, TikTok and YouTube through Zernio's OAuth links without a
-- Zernio account. Each profile gets two keys limited to it: read-write for the app's calls on the
-- user's behalf, read-only for the chat agents' MCP tools. Both are encrypted by the server.

CREATE TABLE IF NOT EXISTS public.zernio_profile (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL UNIQUE,
  -- [{"id": "...", "platform": "instagram", "fullname": "Jane", "username": "jane"}]
  accounts JSONB NOT NULL DEFAULT '[]'::jsonb,
  accounts_refreshed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER zernio_profile_updated_at BEFORE UPDATE ON public.zernio_profile
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Owners can read their own row; all writes go through the server (admin key)
ALTER TABLE public.zernio_profile ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zernio_profile FROM anon, authenticated;
GRANT SELECT ON public.zernio_profile TO authenticated;

DROP POLICY IF EXISTS zernio_profile_owner_select ON public.zernio_profile;
CREATE POLICY zernio_profile_owner_select ON public.zernio_profile
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

-- Server-only: the profile's scoped keys, encrypted. No client access at all
CREATE TABLE IF NOT EXISTS public.zernio_profile_secret (
  user_id UUID PRIMARY KEY REFERENCES public.zernio_profile(user_id) ON DELETE CASCADE,
  write_key_id TEXT NOT NULL,
  write_key_encrypted TEXT NOT NULL,
  read_key_id TEXT NOT NULL,
  read_key_encrypted TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.zernio_profile_secret ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zernio_profile_secret FROM anon, authenticated;
