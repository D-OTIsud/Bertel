-- SELECT ONLY. Run after the separately coordinated activation, never as an
-- activation substitute. Public JSON/source comparison is public-snapshot.sql.
WITH writers(signature,expected_role) AS (VALUES
 ('api.update_portal_photo_texts(text,uuid,jsonb,text,text)','authenticated'),
 ('api.update_portal_photo_proposal_texts(text,uuid,jsonb,text,text)','authenticated'),
 ('api.reconcile_portal_photo_order(text,jsonb,jsonb)','authenticated'),
 ('api.appeal_portal_photo_review(text,uuid,uuid,text,uuid)','authenticated'),
 ('api.withdraw_portal_photo(text,uuid)','authenticated'),
 ('api.reserve_portal_photo_upload(text,uuid,uuid)','authenticated'),
 ('api.cancel_portal_photo_upload(text,uuid)','authenticated'),
 ('api.complete_portal_photo_upload(uuid,uuid,text,text,integer,integer)','service_role')
), grants AS (
 SELECT w.signature,w.expected_role,p.oid IS NOT NULL AS exists,
  has_function_privilege(w.expected_role,p.oid,'EXECUTE') AS expected_role_execute,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
  pg_get_userbyid(p.proowner) AS owner,p.prosecdef AS security_definer,p.proconfig AS config
 FROM writers w LEFT JOIN pg_proc p ON p.oid=to_regprocedure(w.signature)
), policies AS (
 SELECT c.relname AS table_name,p.polname AS name,p.polcmd AS command,
  p.polpermissive AS permissive,c.relrowsecurity AS rls_enabled,
  (SELECT array_agg(r.rolname ORDER BY r.rolname) FROM pg_roles r WHERE r.oid=ANY(p.polroles)) AS roles,
  pg_get_expr(p.polqual,p.polrelid) AS using_expression,
  pg_get_expr(p.polwithcheck,p.polrelid) AS check_expression
 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
 WHERE p.polrelid IN ('public.media'::regclass,'public.ref_document'::regclass)
  AND p.polname IN ('gallery_photo_no_direct_insert','gallery_photo_no_direct_update','gallery_photo_no_direct_delete',
   'portal_photo_receipt_no_direct_insert','portal_photo_receipt_no_direct_update','portal_photo_receipt_no_direct_delete')
)
SELECT now() AS observed_at,
 internal.portal_photo_actor_writes_enabled() AS actor_writes_enabled,
 (SELECT enabled FROM internal.portal_photo_analysis_settings WHERE singleton) AS analysis_enabled,
 (SELECT bool_and(g.exists AND g.expected_role_execute AND NOT g.anon_execute AND g.owner='postgres' AND g.security_definer) FROM grants g) AS writer_grants_ok,
 (SELECT jsonb_agg(to_jsonb(g) ORDER BY g.signature) FROM grants g) AS writer_grants,
 NOT has_function_privilege('authenticated',to_regprocedure('api.reorder_portal_photos(text,jsonb)'),'EXECUTE') AS obsolete_reorder_closed,
 (SELECT bool_and(NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT has_function_privilege('anon',p.oid,'EXECUTE'))
  FROM pg_proc p WHERE p.pronamespace='api'::regnamespace AND p.proname='send_portal_message') AS generic_message_closed,
 (SELECT count(*)=6 AND bool_and(NOT p.permissive AND p.rls_enabled AND p.roles=ARRAY['anon','authenticated']::name[]) FROM policies p) AS six_targeted_restrictions_ok,
 (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.table_name,p.name) FROM policies p) AS policies,
 (SELECT md5(replace(prosrc,E'\r\n',E'\n'))='408ea171ef9ec6c76e0afaaddbb23495' FROM pg_proc WHERE oid=to_regprocedure('api.save_object_gallery(text,jsonb)')) AS office_writer_hash_ok,
 (SELECT count(*) FROM public.app_user_profile WHERE role='actor') AS actor_profile_count;
