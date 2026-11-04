-- Blotato: each user connects their own Blotato account (API key) to publish to Instagram, TikTok
-- and YouTube. The key is encrypted by the server (AES-256-GCM, INTEGRATIONS_ENCRYPTION_KEY)
-- before it is stored, and lives in a table clients can't read at all.

-- ---- What the user sees: connection details and their connected social accounts ----
CREATE TABLE IF NOT EXISTS public.blotato_connection (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Last 4 characters of the key, so the user can tell which key is saved
  key_hint TEXT NOT NULL,
  blotato_user_id TEXT,
  plan TEXT,
  -- 'invalid' once Blotato rejects the key (revoked or plan ended)
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invalid')),
  -- [{"id": "98432", "platform": "instagram", "fullname": "Jane", "username": "jane"}]
  accounts JSONB NOT NULL DEFAULT '[]'::jsonb,
  accounts_refreshed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER blotato_connection_updated_at BEFORE UPDATE ON public.blotato_connection
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Owners can read their own row; all writes go through the server (admin key)
ALTER TABLE public.blotato_connection ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.blotato_connection FROM anon, authenticated;
GRANT SELECT ON public.blotato_connection TO authenticated;

DROP POLICY IF EXISTS blotato_connection_owner_select ON public.blotato_connection;
CREATE POLICY blotato_connection_owner_select ON public.blotato_connection
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

-- ---- Server-only: the encrypted API key. No client access at all ----
CREATE TABLE IF NOT EXISTS public.blotato_connection_secret (
  user_id UUID PRIMARY KEY REFERENCES public.blotato_connection(user_id) ON DELETE CASCADE,
  -- "v1:<iv>:<tag>:<ciphertext>", base64 parts
  api_key_encrypted TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.blotato_connection_secret ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.blotato_connection_secret FROM anon, authenticated;

-- ---- Posts: which account each platform goes to, and how publishing went ----
ALTER TABLE public.content_draft
  -- {"instagram": "<blotato account id>", "youtube": "..."}
  ADD COLUMN IF NOT EXISTS target_accounts JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- [{"platform": "instagram", "accountId": "...", "submissionId": "...", "status": "published", "publicUrl": "...", "error": null}]
  ADD COLUMN IF NOT EXISTS publish_results JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS publish_error TEXT;

-- 'publishing': the background job has picked the post up and is sending it to Blotato
ALTER TABLE public.content_draft DROP CONSTRAINT IF EXISTS content_draft_status_check;
ALTER TABLE public.content_draft ADD CONSTRAINT content_draft_status_check
  CHECK (status IN ('draft', 'approved', 'pending', 'scheduled', 'publishing', 'published', 'failed', 'archived'));

GRANT UPDATE (target_accounts) ON public.content_draft TO authenticated;

-- Owners can't change a post while it's going out or after, nor mark it publishing/published themselves
DROP POLICY IF EXISTS content_draft_owner_update ON public.content_draft;
CREATE POLICY content_draft_owner_update ON public.content_draft
FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid()) AND status NOT IN ('publishing', 'published'))
WITH CHECK (user_id = (SELECT auth.uid()) AND status NOT IN ('publishing', 'published'));
