-- The cron's claim leaves tasks of paused agents pending; they are dispatched when the agent resumes.
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
