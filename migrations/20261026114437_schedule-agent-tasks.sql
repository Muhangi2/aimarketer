-- Scheduled and repeating agent tasks, run by Inngest.
-- Lifecycle: pending -> queued (claimed for dispatch) -> in_progress -> completed / failed.
-- Repeating tasks go back to pending with their next scheduled_at after each run.
-- Timestamps the app compares for equality are kept at millisecond precision (JavaScript's).

ALTER TABLE public.agent_task DROP CONSTRAINT IF EXISTS agent_task_status_check;
ALTER TABLE public.agent_task ADD CONSTRAINT agent_task_status_check CHECK (
  status IN ('pending', 'queued', 'in_progress', 'in_review', 'needs_input', 'completed', 'failed', 'blocked', 'cancelled')
);

ALTER TABLE public.agent_task
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ NOT NULL DEFAULT date_trunc('milliseconds', now()),
  -- {"every": 1, "unit": "hour" | "day" | "week" | "month", "count"?: 5, "until"?: ISO date}
  ADD COLUMN IF NOT EXISTS repeat_rule JSONB CHECK (repeat_rule IS NULL OR jsonb_typeof(repeat_rule) = 'object'),
  -- The occurrence after scheduled_at, for repeating tasks
  ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS run_count INT NOT NULL DEFAULT 0,
  -- When the task was claimed for dispatch; identifies one dispatch of one occurrence
  ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ;

-- Cron lookups: due pending tasks, and queued tasks whose event may have been lost
CREATE INDEX IF NOT EXISTS agent_task_due_idx ON public.agent_task (scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS agent_task_queued_idx ON public.agent_task (queued_at) WHERE status = 'queued';

-- One row per execution of a task occurrence. The unique key is the database-level guarantee
-- that an occurrence never runs twice.
CREATE TABLE IF NOT EXISTS public.agent_task_run (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.agent_task(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.campaign(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_key TEXT NOT NULL CHECK (agent_key IN ('research', 'creator', 'scheduler', 'analytics')),
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'needs_input')),
  output TEXT,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  UNIQUE (task_id, scheduled_for)
);

CREATE INDEX IF NOT EXISTS agent_task_run_task_idx ON public.agent_task_run (task_id, scheduled_for DESC);

-- Users can read their run history; only the server (admin key) writes it
ALTER TABLE public.agent_task_run ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_task_run FROM anon, authenticated;
GRANT SELECT ON public.agent_task_run TO authenticated;

CREATE POLICY agent_task_run_owner_select ON public.agent_task_run
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

-- Atomically claims pending tasks due within the window: pending -> queued in one statement.
-- SKIP LOCKED keeps overlapping cron runs from claiming the same row.
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
    WHERE t.status = 'pending' AND t.scheduled_at <= now() + p_window
    ORDER BY t.scheduled_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.agent_task t
  SET status = 'queued', queued_at = date_trunc('milliseconds', now())
  FROM due
  WHERE t.id = due.id AND t.status = 'pending'
  RETURNING t.id, t.user_id, t.campaign_id, t.agent_key, t.scheduled_at, t.queued_at;
$$;

-- Server-only: never callable by signed-in users or anonymous visitors
REVOKE ALL ON FUNCTION public.claim_due_agent_tasks(INTERVAL, INT) FROM PUBLIC, anon, authenticated;
