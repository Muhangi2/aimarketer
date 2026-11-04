-- Owners can edit and reschedule their posts only until they're published. Publishing itself is
-- done by the server (admin key, which bypasses RLS), so owners can't mark a post published either.

DROP POLICY IF EXISTS content_draft_owner_update ON public.content_draft;
CREATE POLICY content_draft_owner_update ON public.content_draft
FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid()) AND status <> 'published')
WITH CHECK (user_id = (SELECT auth.uid()) AND status <> 'published');
