\set ON_ERROR_STOP on
\ir assert_partner_api_ephemeral.sql
-- Execute after the final R6 migration, immediately BEFORE R5, in disposable CI only.
CREATE TABLE internal.r5_unchanged_functions AS
 SELECT p.oid::regprocedure::text AS signature,replace(pg_get_functiondef(p.oid),E'\r\n',E'\n') AS definition,
 jsonb_build_object('owner',p.proowner,'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig),'definer',p.prosecdef,
   'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,'returns',p.prorettype,'args',p.proargtypes::text) AS metadata
 FROM pg_proc p WHERE p.oid IN(
 'api.submit_actor_fiche(text,jsonb,text)'::regprocedure,
 'api.approve_pending_change(uuid,text,boolean)'::regprocedure,
 'api.reject_pending_change(uuid,text)'::regprocedure,
 'api.approve_fiche_submission(uuid,text,boolean)'::regprocedure,
 'api.reject_fiche_submission(uuid,text)'::regprocedure,
 'api.list_pending_changes(text,text,integer,integer)'::regprocedure,
 'api.current_user_portal_object_ids()'::regprocedure,
 'api.get_object_resource(text,text[],text,jsonb)'::regprocedure);
ALTER TABLE internal.r5_unchanged_functions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal.r5_unchanged_functions FROM PUBLIC,anon,authenticated;
