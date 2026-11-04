-- Postiz: each user can also connect their own Postiz Cloud account (API key). Used for its
-- channels list and its MCP tools in agent chat; scheduled posts still publish through Blotato.
-- Same layout as Blotato: details readable by the owner, the encrypted key server-only.

CREATE TABLE IF NOT EXISTS public.postiz_connection (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hint TEXT NOT NULL,
  plan TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invalid')),
  -- [{"id": "...", "platform": "instagram", "fullname": "Jane", "username": "jane"}]
  accounts JSONB NOT NULL DEFAULT '[]'::jsonb,
  accounts_refreshed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER postiz_connection_updated_at BEFORE UPDATE ON public.postiz_connection
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.postiz_connection ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.postiz_connection FROM anon, authenticated;
GRANT SELECT ON public.postiz_connection TO authenticated;

DROP POLICY IF EXISTS postiz_connection_owner_select ON public.postiz_connection;
CREATE POLICY postiz_connection_owner_select ON public.postiz_connection
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

-- Server-only: the encrypted API key. No client access at all
CREATE TABLE IF NOT EXISTS public.postiz_connection_secret (
  user_id UUID PRIMARY KEY REFERENCES public.postiz_connection(user_id) ON DELETE CASCADE,
  api_key_encrypted TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.postiz_connection_secret ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.postiz_connection_secret FROM anon, authenticated;
