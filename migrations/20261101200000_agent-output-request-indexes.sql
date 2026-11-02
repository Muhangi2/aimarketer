-- The Creator Agent reads the research findings saved for its request, and the dashboard lists a
-- request's findings and drafts together, so both are looked up by request.
CREATE INDEX IF NOT EXISTS research_finding_request_idx ON public.research_finding (request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS content_draft_request_idx ON public.content_draft (request_id, created_at DESC);
