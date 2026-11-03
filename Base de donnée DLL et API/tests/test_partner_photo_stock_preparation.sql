\set ON_ERROR_STOP on
\ir assert_partner_api_ephemeral.sql
BEGIN;
DO $test$
DECLARE v_count integer;
BEGIN
 ASSERT NOT has_function_privilege('authenticated','api.reserve_portal_photo_upload(text,uuid,uuid)','execute'), 'reservation active before cutover';
 ASSERT NOT has_function_privilege('authenticated','api.cancel_portal_photo_upload(text,uuid)','execute'), 'cancellation active before cutover';
 ASSERT NOT has_function_privilege('anon','api.save_object_gallery(text,jsonb)','execute');
 ASSERT NOT has_function_privilege('authenticated','api.complete_portal_photo_upload(uuid,uuid,text,text,integer,integer)','execute');
 ASSERT has_function_privilege('service_role','api.complete_portal_photo_upload(uuid,uuid,text,text,integer,integer)','execute');
 ASSERT NOT has_function_privilege('authenticated','internal.gallery_photo_usage(text)','execute');
 ASSERT to_regclass('internal.r5_unchanged_functions') IS NOT NULL, 'capture final R6/readers before R5';
 SELECT count(*) INTO v_count FROM internal.r5_unchanged_functions; ASSERT v_count=8,'incomplete baseline';
 ASSERT NOT EXISTS(SELECT 1 FROM internal.r5_unchanged_functions b LEFT JOIN pg_proc p ON p.oid=to_regprocedure(b.signature)
  WHERE p.oid IS NULL OR b.definition IS DISTINCT FROM replace(pg_get_functiondef(p.oid),E'\r\n',E'\n')
   OR b.metadata IS DISTINCT FROM jsonb_build_object('owner',p.proowner,'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig),'definer',p.prosecdef,
   'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,'returns',p.prorettype,'args',p.proargtypes::text)),
  'R5 changed a captured R6/realm/public-reader function';
 ASSERT position('/* actor-realm:actor */' IN (SELECT prosrc FROM pg_proc WHERE oid='api.list_pending_changes(text,text,integer,integer)'::regprocedure))>0,
  'R6 pending list lost the actor realm gate';
 ASSERT to_regprocedure('internal.pending_collection_token(text,text)') IS NOT NULL;
END;
$test$;
ROLLBACK;
