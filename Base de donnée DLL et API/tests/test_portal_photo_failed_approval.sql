-- Disposable fixture: an UPDATE which skips one candidate cannot authorize
-- deletion of its Storage copy. The other row proves a real release still works.
BEGIN;
INSERT INTO public.ref_document (id,url,title,storage_bucket,storage_path,access_scope,extra)
SELECT id, 'storage://actor-documents/portal-photos/fixture/'||id||'.jpg', 'Fixture',
  'actor-documents', 'portal-photos/fixture/'||id||'.jpg', 'crm_private',
  '{"source":"portal_photo","approval_claim_id":"00000000-0000-4000-a000-00000000ad82","publication_ready":true}'::jsonb
FROM (VALUES ('00000000-0000-4000-a000-00000000ad83'::uuid),
             ('00000000-0000-4000-a000-00000000ad84'::uuid)) d(id);

CREATE FUNCTION pg_temp.skip_portal_photo_cleanup() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
CREATE TRIGGER test_skip_portal_photo_cleanup
BEFORE UPDATE OF extra ON public.ref_document FOR EACH ROW
WHEN (OLD.id='00000000-0000-4000-a000-00000000ad83')
EXECUTE FUNCTION pg_temp.skip_portal_photo_cleanup();

DO $test$
DECLARE paths jsonb;
BEGIN
  SET LOCAL ROLE service_role;
  paths := api.portal_photo_failed_approval('00000000-0000-4000-a000-00000000ad82');
  RESET ROLE;
  ASSERT paths = '["portal-approved/00000000-0000-4000-a000-00000000ad84/00000000-0000-4000-a000-00000000ad82.jpg"]'::jsonb,
    'Cleanup can return only a path whose claim was actually invalidated';
  ASSERT (SELECT extra->>'approval_claim_id' FROM public.ref_document
    WHERE id='00000000-0000-4000-a000-00000000ad83')='00000000-0000-4000-a000-00000000ad82';
  ASSERT (SELECT (extra->>'publication_ready')='false' AND NOT extra ? 'approval_claim_id'
    FROM public.ref_document WHERE id='00000000-0000-4000-a000-00000000ad84');
END;
$test$;
ROLLBACK;
