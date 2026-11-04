-- Posts page: content_draft now holds both the Creator Agent's drafts and posts the user writes
-- by hand, plus the scheduling details. Publishing comes later; a scheduled post waits with
-- status 'scheduled' (pending publish) until then.

ALTER TABLE public.content_draft
  -- Who wrote it: the Creator Agent or the user
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'agent' CHECK (source IN ('agent', 'manual')),
  -- Every platform the post goes to (platform keeps the first, for older readers)
  ADD COLUMN IF NOT EXISTS platforms TEXT[] NOT NULL DEFAULT '{}',
  -- When to publish (UTC) and the time zone the user picked it in
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS timezone TEXT,
  -- [{"url": "...", "originalUrl": "...", "edits": ["remove_background", ...]}]: final media and how it was made
  ADD COLUMN IF NOT EXISTS media JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.content_draft SET platforms = ARRAY[platform] WHERE platforms = '{}';

ALTER TABLE public.content_draft DROP CONSTRAINT IF EXISTS content_draft_status_check;
ALTER TABLE public.content_draft ADD CONSTRAINT content_draft_status_check
  CHECK (status IN ('draft', 'approved', 'pending', 'scheduled', 'published', 'failed', 'archived'));

ALTER TABLE public.content_draft DROP CONSTRAINT IF EXISTS content_draft_scheduled_check;
ALTER TABLE public.content_draft ADD CONSTRAINT content_draft_scheduled_check
  CHECK (status <> 'scheduled' OR scheduled_at IS NOT NULL);

CREATE INDEX IF NOT EXISTS content_draft_scheduled_idx
  ON public.content_draft (scheduled_at) WHERE status = 'scheduled';

-- ---- Access: owners can now write their own posts into their own campaigns ----
GRANT INSERT, DELETE ON public.content_draft TO authenticated;
GRANT UPDATE (status, title, body, hashtags, platform, platforms, image_urls, media, scheduled_at, timezone)
  ON public.content_draft TO authenticated;

DROP POLICY IF EXISTS content_draft_owner_insert ON public.content_draft;
CREATE POLICY content_draft_owner_insert ON public.content_draft
FOR INSERT TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND source = 'manual'
  AND EXISTS (SELECT 1 FROM public.campaign c WHERE c.id = campaign_id AND c.user_id = (SELECT auth.uid()))
);

DROP POLICY IF EXISTS content_draft_owner_delete ON public.content_draft;
CREATE POLICY content_draft_owner_delete ON public.content_draft
FOR DELETE TO authenticated
USING (user_id = (SELECT auth.uid()));
