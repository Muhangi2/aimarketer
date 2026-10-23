-- Campaigns created during onboarding: name, icon (preset or uploaded) and AI agent office
CREATE TABLE IF NOT EXISTS public.campaign (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  icon_type TEXT NOT NULL CHECK (icon_type IN ('preset', 'custom')),
  -- Preset icon id, or the public URL of an uploaded icon
  icon TEXT NOT NULL,
  -- Storage key of an uploaded icon (campaign-icons bucket), needed for delete
  icon_key TEXT,
  office_image TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campaign_user_id_idx ON public.campaign (user_id);

ALTER TABLE public.campaign ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign TO authenticated;

CREATE POLICY campaign_owner_select ON public.campaign
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

CREATE POLICY campaign_owner_insert ON public.campaign
FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY campaign_owner_update ON public.campaign
FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY campaign_owner_delete ON public.campaign
FOR DELETE TO authenticated
USING (user_id = (SELECT auth.uid()));
