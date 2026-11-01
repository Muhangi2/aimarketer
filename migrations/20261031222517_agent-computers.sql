-- Agent computers: the Research and Creator agents each get a cloud Linux desktop (E2B Desktop
-- sandbox) per campaign. The server (admin key) writes every row here; campaign owners can read
-- status, activity and files, never stream passwords, screenshots or saved agent runs.

-- ---- Campaigns can be ended: plans stop and the computers shut down for good ----
ALTER TABLE public.campaign
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ending', 'ended')),
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;

-- ---- Tasks can wait for the user (login, captcha, take over) and expire ----
ALTER TABLE public.agent_task DROP CONSTRAINT IF EXISTS agent_task_status_check;
ALTER TABLE public.agent_task ADD CONSTRAINT agent_task_status_check CHECK (
  status IN (
    'pending', 'queued', 'in_progress', 'in_review', 'needs_input', 'waiting_for_user',
    'completed', 'failed', 'blocked', 'cancelled', 'expired'
  )
);

ALTER TABLE public.agent_task
  -- Why the agent is waiting for the user, and the page it was on
  ADD COLUMN IF NOT EXISTS waiting_reason TEXT,
  ADD COLUMN IF NOT EXISTS waiting_url TEXT,
  -- The task expires if nobody responds by then
  ADD COLUMN IF NOT EXISTS waiting_until TIMESTAMPTZ;

-- What the agent is doing right now, e.g. "Opening instagram.com"
ALTER TABLE public.agent_state ADD COLUMN IF NOT EXISTS activity TEXT;

-- ---- One desktop per computer agent per campaign ----
CREATE TABLE IF NOT EXISTS public.agent_computer (
  campaign_id UUID NOT NULL REFERENCES public.campaign(id) ON DELETE CASCADE,
  agent_key TEXT NOT NULL CHECK (agent_key IN ('research', 'creator')),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sandbox_id TEXT,
  status TEXT NOT NULL DEFAULT 'none' CHECK (
    status IN ('none', 'starting', 'running', 'pausing', 'paused', 'shut_down', 'error')
  ),
  -- 'user' while the owner has taken over (or is logging in); the agent waits
  control TEXT NOT NULL DEFAULT 'agent' CHECK (control IN ('agent', 'user')),
  -- The one task using this computer; other tasks for the agent wait their turn
  current_task_id UUID REFERENCES public.agent_task(id) ON DELETE SET NULL,
  activity TEXT,
  -- Last agent action or user control; idle desktops are paused after 3 minutes
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- When the saved screenshot (shown while paused) was taken
  screenshot_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, agent_key)
);

CREATE INDEX IF NOT EXISTS agent_computer_running_idx ON public.agent_computer (last_active_at) WHERE status = 'running';

CREATE TRIGGER agent_computer_updated_at BEFORE UPDATE ON public.agent_computer
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.agent_computer ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_computer FROM anon, authenticated;
GRANT SELECT ON public.agent_computer TO authenticated;

CREATE POLICY agent_computer_owner_select ON public.agent_computer
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

-- Server-only: the desktop stream password and the last screenshot. No client access at all.
CREATE TABLE IF NOT EXISTS public.agent_computer_secret (
  campaign_id UUID NOT NULL REFERENCES public.campaign(id) ON DELETE CASCADE,
  agent_key TEXT NOT NULL CHECK (agent_key IN ('research', 'creator')),
  stream_key TEXT,
  -- Base64 PNG taken right before the desktop was paused
  screenshot TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, agent_key)
);

ALTER TABLE public.agent_computer_secret ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_computer_secret FROM anon, authenticated;

-- Server-only: a computer agent's saved run (OpenAI Agents SDK RunState), picked up again by the
-- next background step or after the user logs in / hands back control
CREATE TABLE IF NOT EXISTS public.agent_run_state (
  task_id UUID PRIMARY KEY REFERENCES public.agent_task(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.campaign(id) ON DELETE CASCADE,
  -- Which agent attempt of the task this run belongs to
  attempt INT NOT NULL,
  state TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_run_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_run_state FROM anon, authenticated;

-- ---- Files and links agents make, shown as task results ----
CREATE TABLE IF NOT EXISTS public.agent_artifact (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaign(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Null for files collected when the campaign ended
  task_id UUID REFERENCES public.agent_task(id) ON DELETE SET NULL,
  agent_key TEXT NOT NULL CHECK (agent_key IN ('research', 'creator', 'scheduler', 'analytics')),
  -- image/file: stored on ImageKit; link: a source the agent reported; page: a page it opened
  kind TEXT NOT NULL CHECK (kind IN ('image', 'file', 'link', 'page')),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  source TEXT NOT NULL CHECK (source IN ('generated', 'edited', 'uploaded', 'reported', 'visited', 'campaign_end')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_artifact_task_idx ON public.agent_artifact (task_id, created_at);
CREATE INDEX IF NOT EXISTS agent_artifact_campaign_idx ON public.agent_artifact (campaign_id, agent_key, created_at DESC);
-- A page visited twice in one task is listed once
CREATE UNIQUE INDEX IF NOT EXISTS agent_artifact_page_once_idx ON public.agent_artifact (task_id, url) WHERE kind = 'page';

ALTER TABLE public.agent_artifact ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_artifact FROM anon, authenticated;
GRANT SELECT ON public.agent_artifact TO authenticated;

CREATE POLICY agent_artifact_owner_select ON public.agent_artifact
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

-- ---- The cron no longer claims tasks of ended campaigns ----
CREATE OR REPLACE FUNCTION public.claim_due_agent_tasks(p_window INTERVAL, p_limit INT DEFAULT 500)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  campaign_id UUID,
  agent_key TEXT,
  scheduled_at TIMESTAMPTZ,
  queued_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH due AS (
    SELECT t.id
    FROM public.agent_task t
    JOIN public.campaign c ON c.id = t.campaign_id AND c.status = 'active'
    WHERE t.status = 'pending'
      AND t.scheduled_at <= now() + p_window
      AND NOT EXISTS (
        SELECT 1 FROM public.agent_state s
        WHERE s.campaign_id = t.campaign_id AND s.agent_key = t.agent_key AND s.status = 'paused'
      )
    ORDER BY t.scheduled_at
    LIMIT p_limit
    FOR UPDATE OF t SKIP LOCKED
  )
  UPDATE public.agent_task t
  SET status = 'queued', queued_at = date_trunc('milliseconds', now())
  FROM due
  WHERE t.id = due.id AND t.status = 'pending'
  RETURNING t.id, t.user_id, t.campaign_id, t.agent_key, t.scheduled_at, t.queued_at;
$$;

REVOKE ALL ON FUNCTION public.claim_due_agent_tasks(INTERVAL, INT) FROM PUBLIC, anon, authenticated;
