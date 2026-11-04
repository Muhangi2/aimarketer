-- Analytics: real post performance synced from each user's Zernio profile (GET /v1/analytics).
-- One row per post per platform account. Posts the app published are linked back to their
-- content_draft (and so their campaign); posts made outside the app have no campaign.
-- Metrics a platform doesn't report stay NULL, never 0, so the UI can tell "none" from "zero".

CREATE TABLE IF NOT EXISTS public.post_metric (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Zernio's id for the post (a Zernio post id, or an external post id for imported posts)
  zernio_post_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  account_id TEXT NOT NULL DEFAULT '',
  account_username TEXT,
  platform_post_id TEXT,
  platform_post_url TEXT,
  -- 'app': published through Zernio by this app; 'external': posted on the platform directly
  source TEXT NOT NULL DEFAULT 'external' CHECK (source IN ('app', 'external')),
  content TEXT NOT NULL DEFAULT '',
  thumbnail_url TEXT,
  media_type TEXT,
  published_at TIMESTAMPTZ,
  content_draft_id UUID REFERENCES public.content_draft(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaign(id) ON DELETE SET NULL,
  impressions BIGINT,
  reach BIGINT,
  views BIGINT,
  likes BIGINT,
  comments BIGINT,
  shares BIGINT,
  saves BIGINT,
  clicks BIGINT,
  engagement_rate NUMERIC(8, 2),
  -- Zernio's state for this platform: synced, pending (not collected yet) or unavailable
  sync_status TEXT NOT NULL DEFAULT 'synced',
  metrics_updated_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, zernio_post_id, platform, account_id)
);

CREATE INDEX IF NOT EXISTS post_metric_user_published_idx ON public.post_metric (user_id, published_at DESC);
CREATE INDEX IF NOT EXISTS post_metric_campaign_published_idx ON public.post_metric (campaign_id, published_at DESC) WHERE campaign_id IS NOT NULL;

CREATE TRIGGER post_metric_updated_at BEFORE UPDATE ON public.post_metric
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---- How the last sync went, per user ----
CREATE TABLE IF NOT EXISTS public.analytics_sync (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- ok | syncing (Zernio is still collecting) | addon_required | not_connected | error
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'syncing', 'addon_required', 'not_connected', 'error')),
  last_synced_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  last_error TEXT,
  posts_synced INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER analytics_sync_updated_at BEFORE UPDATE ON public.analytics_sync
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Owners read their own rows; all writes go through the server (admin key)
ALTER TABLE public.post_metric ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.post_metric FROM anon, authenticated;
GRANT SELECT ON public.post_metric TO authenticated;

DROP POLICY IF EXISTS post_metric_owner_select ON public.post_metric;
CREATE POLICY post_metric_owner_select ON public.post_metric
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

ALTER TABLE public.analytics_sync ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_sync FROM anon, authenticated;
GRANT SELECT ON public.analytics_sync TO authenticated;

DROP POLICY IF EXISTS analytics_sync_owner_select ON public.analytics_sync;
CREATE POLICY analytics_sync_owner_select ON public.analytics_sync
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));
