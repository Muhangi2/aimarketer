-- Master Agent orchestration: user requests, the tasks the Master Agent plans and assigns,
-- every conversation message (user <-> agents and Master <-> agents) and each agent's live status.

-- A goal the user gave the Master Agent, and where its plan stands
CREATE TABLE IF NOT EXISTS public.agent_request (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaign(id) ON DELETE CASCADE,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL CHECK (char_length(btrim(prompt)) BETWEEN 1 AND 4000),
  status TEXT NOT NULL DEFAULT 'planning' CHECK (
    status IN ('planning', 'running', 'awaiting_clarification', 'waiting', 'completed', 'failed', 'cancelled')
  ),
  -- Question the Master Agent is waiting on the user to answer
  clarification_question TEXT,
  summary TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_request_campaign_idx ON public.agent_request (campaign_id, created_at DESC);

-- One unit of work the Master Agent assigned to a regular agent
CREATE TABLE IF NOT EXISTS public.agent_task (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.agent_request(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.campaign(id) ON DELETE CASCADE,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_key TEXT NOT NULL CHECK (agent_key IN ('research', 'creator', 'scheduler', 'analytics')),
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  instructions TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'in_progress', 'in_review', 'needs_input', 'completed', 'failed', 'blocked', 'cancelled')
  ),
  -- Tasks (same request) whose output this task needs first
  depends_on UUID[] NOT NULL DEFAULT '{}',
  position INT NOT NULL DEFAULT 0,
  -- Answers to questions the agent raised while working
  clarifications TEXT,
  output TEXT,
  review_feedback TEXT,
  attempts INT NOT NULL DEFAULT 0,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_task_request_idx ON public.agent_task (request_id, position);
CREATE INDEX IF NOT EXISTS agent_task_campaign_agent_idx ON public.agent_task (campaign_id, agent_key, created_at DESC);

-- Every chat message. thread = whose chat it appears in; sender/recipient = who talks to whom
CREATE TABLE IF NOT EXISTS public.agent_message (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaign(id) ON DELETE CASCADE,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  thread TEXT NOT NULL CHECK (thread IN ('master', 'research', 'creator', 'scheduler', 'analytics')),
  sender TEXT NOT NULL CHECK (sender IN ('user', 'master', 'research', 'creator', 'scheduler', 'analytics')),
  recipient TEXT NOT NULL CHECK (recipient IN ('user', 'master', 'research', 'creator', 'scheduler', 'analytics')),
  kind TEXT NOT NULL DEFAULT 'chat' CHECK (
    kind IN ('chat', 'plan', 'assignment', 'update', 'question', 'answer', 'result', 'review', 'clarification', 'summary', 'error')
  ),
  content TEXT NOT NULL,
  request_id UUID REFERENCES public.agent_request(id) ON DELETE SET NULL,
  task_id UUID REFERENCES public.agent_task(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_message_thread_idx ON public.agent_message (campaign_id, thread, created_at DESC);

-- Live status of each agent (including the Master Agent) per campaign
CREATE TABLE IF NOT EXISTS public.agent_state (
  campaign_id UUID NOT NULL REFERENCES public.campaign(id) ON DELETE CASCADE,
  agent_key TEXT NOT NULL CHECK (agent_key IN ('master', 'research', 'creator', 'scheduler', 'analytics')),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'working', 'paused', 'error')),
  current_task_id UUID REFERENCES public.agent_task(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, agent_key)
);

-- Keep updated_at current
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER agent_request_updated_at BEFORE UPDATE ON public.agent_request
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER agent_task_updated_at BEFORE UPDATE ON public.agent_task
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER agent_state_updated_at BEFORE UPDATE ON public.agent_state
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- True when the signed-in user owns the campaign
CREATE OR REPLACE FUNCTION public.owns_campaign(target UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.campaign c WHERE c.id = target AND c.user_id = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.owns_campaign(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owns_campaign(UUID) TO authenticated;

-- Owner-only access on every orchestration table
ALTER TABLE public.agent_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_task ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_message ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_state ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_request TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_task TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.agent_message TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_state TO authenticated;

CREATE POLICY agent_request_owner_all ON public.agent_request
FOR ALL TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()) AND public.owns_campaign(campaign_id));

CREATE POLICY agent_task_owner_all ON public.agent_task
FOR ALL TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()) AND public.owns_campaign(campaign_id));

CREATE POLICY agent_message_owner_select ON public.agent_message
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

CREATE POLICY agent_message_owner_insert ON public.agent_message
FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()) AND public.owns_campaign(campaign_id));

CREATE POLICY agent_message_owner_delete ON public.agent_message
FOR DELETE TO authenticated
USING (user_id = (SELECT auth.uid()));

CREATE POLICY agent_state_owner_all ON public.agent_state
FOR ALL TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()) AND public.owns_campaign(campaign_id));
