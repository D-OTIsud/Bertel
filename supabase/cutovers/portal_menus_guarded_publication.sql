-- M activation only after isolated acceptance, converted consumers, and R4 DML closure.
-- Exact source, attributes and ACL of all nine functions are rechecked before any grant.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $m_cutover_preflight$
DECLARE r record; v_oid oid; v_table text;
BEGIN
  IF to_regclass('internal.portal_menu_write_configuration') IS NULL THEN RAISE EXCEPTION 'M preparation missing'; END IF;
  IF NOT EXISTS(SELECT 1 FROM internal.portal_menu_write_configuration WHERE singleton) THEN RAISE EXCEPTION 'M configuration missing'; END IF;
  FOR r IN SELECT * FROM (VALUES
      ('internal.apply_object_menus_patch(text,jsonb)','38f62500b36dde52dccec81ea78a4b2d',false,'v','plpgsql','jsonb',ARRAY['p_object_id','p_payload']::text[],0,ARRAY['lock_timeout=5s','search_path=pg_catalog,public,api,internal']::text[],'private'),
      ('api.save_object_menus(text,jsonb)','8f48b203e5004582232ed20659b9511c',true,'v','plpgsql','jsonb',ARRAY['p_object_id','p_payload']::text[],0,ARRAY['lock_timeout=5s','search_path=pg_catalog,public,api,internal']::text[],'office'),
      ('internal.assert_portal_menu_write(text)','958eda0135a706268a06cc707acba49e',false,'v','plpgsql','void',ARRAY['p_object_id']::text[],0,ARRAY['search_path=pg_catalog,public,api,internal']::text[],'private'),
      ('internal.portal_menu_bundle_token(jsonb)','360f21c6b9982447860dea15472ed9cb',false,'i','sql','text',ARRAY['p_bundle']::text[],0,ARRAY['search_path=pg_catalog']::text[],'private'),
      ('internal.portal_menu_write_snapshot(jsonb)','be6f41cef20de439d5d14161d57a3dce',false,'i','plpgsql','jsonb',ARRAY['p_snapshot']::text[],0,ARRAY['search_path=pg_catalog,internal']::text[],'private'),
      ('internal.prepare_portal_menu_patch(text,jsonb,jsonb)','03e0b6df0be752ecbbc92825d00085e2',false,'v','plpgsql','jsonb',ARRAY['p_object_id','p_payload','p_snapshot']::text[],0,ARRAY['search_path=pg_catalog,public,internal']::text[],'private'),
      ('api.get_portal_menus_snapshot(text)','5f250062a41065f68a454250922b46f9',true,'s','plpgsql','jsonb',ARRAY['p_object_id']::text[],0,ARRAY['lock_timeout=5s','search_path=pg_catalog,public,api,internal','timezone=utc']::text[],'actor'),
      ('api.get_portal_menu_write_receipt(text,jsonb)','404efc6e54a427f8c456c4c128c13b28',true,'s','plpgsql','jsonb',ARRAY['p_object_id','p_payload']::text[],0,ARRAY['lock_timeout=5s','search_path=pg_catalog,public,api,internal','timezone=utc']::text[],'actor'),
      ('api.publish_portal_menus(text,jsonb,uuid)','37e0aa67266209fbea31ba928454a301',true,'v','plpgsql','jsonb',ARRAY['p_object_id','p_payload','p_extraction_operation_id']::text[],1,ARRAY['lock_timeout=5s','search_path=pg_catalog,public,api,internal','timezone=utc']::text[],'actor')
  ) expected(signature,source_hash,definer,volatility,language_name,return_type,argument_names,default_count,configuration,access_kind) LOOP
    v_oid:=to_regprocedure(r.signature);
      IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang
        WHERE p.oid=v_oid AND p.proowner='postgres'::regrole AND p.prosecdef=r.definer
          AND md5(replace(p.prosrc,E'\r\n',E'\n'))=r.source_hash
          AND p.provolatile::text=r.volatility AND l.lanname::text=r.language_name
          AND p.prorettype=r.return_type::regtype AND NOT p.proretset AND p.proargnames=r.argument_names
          AND p.pronargdefaults=r.default_count
          AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM CASE WHEN r.default_count=1 THEN 'NULL::uuid'::text ELSE NULL::text END
          AND NOT p.proisstrict AND NOT p.proleakproof AND p.proparallel='u'
          AND COALESCE((SELECT array_agg(lower(replace(c,' ','')) ORDER BY lower(replace(c,' ',''))) FROM unnest(p.proconfig) c),ARRAY[]::text[])=r.configuration) THEN
        RAISE EXCEPTION 'M cutover source/attributes drift: %',r.signature;
      END IF;
      IF NOT has_function_privilege('postgres',v_oid,'EXECUTE') OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        WHERE p.oid=v_oid AND (a.privilege_type<>'EXECUTE' OR a.grantor<>'postgres'::regrole
          OR NOT (a.grantee='postgres'::regrole
            OR (r.access_kind='office' AND a.grantee IN ('authenticated'::regrole,'service_role'::regrole)) OR (r.access_kind='actor' AND a.grantee='authenticated'::regrole))
          OR (a.is_grantable AND a.grantee<>'postgres'::regrole)))
        OR (r.access_kind='office' AND (NOT has_function_privilege('authenticated',v_oid,'EXECUTE')
          OR NOT has_function_privilege('service_role',v_oid,'EXECUTE'))) THEN
        RAISE EXCEPTION 'M cutover ACL drift: %',r.signature;
      END IF;
  END LOOP;
  FOREACH v_table IN ARRAY ARRAY['object_menu','object_menu_item','object_menu_item_media','object_menu_item_dietary_tag','object_menu_item_allergen','object_menu_item_cuisine_type'] LOOP
    IF has_table_privilege('authenticated','public.'||v_table,'INSERT,UPDATE,DELETE')
      OR has_any_column_privilege('authenticated','public.'||v_table,'INSERT,UPDATE')
      OR has_table_privilege('anon','public.'||v_table,'INSERT,UPDATE,DELETE')
      OR has_any_column_privilege('anon','public.'||v_table,'INSERT,UPDATE') THEN
      RAISE EXCEPTION 'Fermer d’abord les anciens droits menus (%).',v_table USING ERRCODE='55000';
    END IF;
  END LOOP;
END;
$m_cutover_preflight$;
GRANT EXECUTE ON FUNCTION api.get_portal_menus_snapshot(text),api.get_portal_menu_write_receipt(text,jsonb),api.publish_portal_menus(text,jsonb,uuid) TO authenticated;
UPDATE internal.portal_menu_write_configuration SET enabled=true WHERE singleton;
COMMIT;
NOTIFY pgrst,'reload schema';
