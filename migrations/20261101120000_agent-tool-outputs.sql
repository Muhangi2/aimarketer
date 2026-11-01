-- Structured outputs from the Research and Creator agents' tools, and one searchable record per
-- finished task occurrence. The server (admin key) writes every row; campaign owners can read them
-- (and update a draft's status), so past work is easy to find later.

-- ---- Research findings: what the Research Agent learned, with its sources ----
CREATE TABLE IF NOT EXISTS public.research_finding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaign(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id UUID REFERENCES public.agent_request(id) ON DELETE SET NULL,
  task_id UUID REFERENCES public.agent_task(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'insight' CHECK (
    kind IN ('trend', 'hashtag', 'competitor', 'audience', 'content_idea', 'news', 'platform_update', 'insight')
  ),
  -- google, youtube, instagram, tiktok, x, linkedin, facebook, reddit, pinterest, web...
  platform TEXT,
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 300),
  summary TEXT NOT NULL,
  details TEXT,
  -- [{"url": "...", "title": "..."}]
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  tags TEXT[] NOT NULL DEFAULT '{}',
  -- 'knowledge': from the model's own knowledge; 'web': checked live in the browser
  basis TEXT NOT NULL DEFAULT 'knowledge' CHECK (basis IN ('knowledge', 'web')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  search TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(details, '')), 'C')
  ) STORED
);

CREATE INDEX IF NOT EXISTS research_finding_campaign_idx ON public.research_finding (campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS research_finding_task_idx ON public.research_finding (task_id);
CREATE INDEX IF NOT EXISTS research_finding_search_idx ON public.research_finding USING GIN (search);
CREATE INDEX IF NOT EXISTS research_finding_tags_idx ON public.research_finding USING GIN (tags);

-- array_to_string isn't immutable, so generated search columns use this instead
CREATE OR REPLACE FUNCTION public.text_array_to_string(arr TEXT[])
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, public, pg_temp
AS $$ SELECT coalesce(array_to_string(arr, ' '), '') $$;

-- ---- Content drafts: posts, captions, hashtags and ideas the Creator Agent wrote ----
CREATE TABLE IF NOT EXISTS public.content_draft (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaign(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id UUID REFERENCES public.agent_request(id) ON DELETE SET NULL,
  task_id UUID REFERENCES public.agent_task(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'post' CHECK (
    format IN ('post', 'caption', 'thread', 'carousel', 'video_script', 'story', 'hashtags', 'content_idea')
  ),
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 300),
  body TEXT NOT NULL,
  hashtags TEXT[] NOT NULL DEFAULT '{}',
  call_to_action TEXT,
  -- Permanent (ImageKit) URLs of the images that go with the post
  image_urls TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'scheduled', 'published', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  search TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'B') ||
    setweight(to_tsvector('english', public.text_array_to_string(hashtags)), 'C')
  ) STORED
);

CREATE INDEX IF NOT EXISTS content_draft_campaign_idx ON public.content_draft (campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS content_draft_task_idx ON public.content_draft (task_id);
CREATE INDEX IF NOT EXISTS content_draft_status_idx ON public.content_draft (campaign_id, status);
CREATE INDEX IF NOT EXISTS content_draft_search_idx ON public.content_draft USING GIN (search);

DROP TRIGGER IF EXISTS content_draft_updated_at ON public.content_draft;
CREATE TRIGGER content_draft_updated_at BEFORE UPDATE ON public.content_draft
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---- One record per finished task occurrence: the approved output, ready to look up later ----
CREATE TABLE IF NOT EXISTS public.agent_task_result (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaign(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id UUID REFERENCES public.agent_request(id) ON DELETE SET NULL,
  task_id UUID REFERENCES public.agent_task(id) ON DELETE SET NULL,
  run_id UUID UNIQUE,
  agent_key TEXT NOT NULL CHECK (agent_key IN ('research', 'creator', 'scheduler', 'analytics')),
  task_title TEXT NOT NULL,
  request_prompt TEXT,
  summary TEXT NOT NULL,
  output TEXT NOT NULL,
  review_feedback TEXT,
  image_urls TEXT[] NOT NULL DEFAULT '{}',
  file_urls TEXT[] NOT NULL DEFAULT '{}',
  source_urls TEXT[] NOT NULL DEFAULT '{}',
  finding_ids UUID[] NOT NULL DEFAULT '{}',
  draft_ids UUID[] NOT NULL DEFAULT '{}',
  used_browser BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  search TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(task_title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(output, '')), 'C')
  ) STORED
);

CREATE INDEX IF NOT EXISTS agent_task_result_campaign_idx ON public.agent_task_result (campaign_id, agent_key, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_task_result_task_idx ON public.agent_task_result (task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_task_result_request_idx ON public.agent_task_result (request_id);
CREATE INDEX IF NOT EXISTS agent_task_result_search_idx ON public.agent_task_result USING GIN (search);

-- ---- Access: owners read their own rows; only draft status can be changed by them ----
ALTER TABLE public.research_finding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_draft ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_task_result ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.research_finding FROM anon, authenticated;
REVOKE ALL ON public.content_draft FROM anon, authenticated;
REVOKE ALL ON public.agent_task_result FROM anon, authenticated;

GRANT SELECT ON public.research_finding TO authenticated;
GRANT SELECT ON public.content_draft TO authenticated;
GRANT UPDATE (status) ON public.content_draft TO authenticated;
GRANT SELECT ON public.agent_task_result TO authenticated;

DROP POLICY IF EXISTS research_finding_owner_select ON public.research_finding;
CREATE POLICY research_finding_owner_select ON public.research_finding
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS content_draft_owner_select ON public.content_draft;
CREATE POLICY content_draft_owner_select ON public.content_draft
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS content_draft_owner_update ON public.content_draft;
CREATE POLICY content_draft_owner_update ON public.content_draft
FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS agent_task_result_owner_select ON public.agent_task_result;
CREATE POLICY agent_task_result_owner_select ON public.agent_task_result
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));
