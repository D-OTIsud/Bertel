-- Separate activation after the six closed GDPR migrations and compatible app delivery.
-- Deliberately absent from ci_fresh_apply.sql: the default installation stays closed.
-- This file changes EXECUTE ACLs only; it never invokes an erasure or provider.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('bertel:gdpr:activation', 0));

DO $guard$
DECLARE
  expected jsonb;
  actual jsonb;
  function_id oid;
  function_owner oid;
  function_acl jsonb;
  private_table text;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'GDPR activation requires the reviewed postgres operator' USING ERRCODE='42501';
  END IF;
  -- Pins come from the composed post-six catalog, not from the pre-upgrade ledger205.
  FOR expected IN SELECT value FROM pg_catalog.jsonb_array_elements($pins$
[{"signature":"api.rpc_gdpr_ack_cleanup_attempt(uuid,uuid,uuid,boolean,boolean,text)","owner":"postgres","kind":"f","config":["search_path=pg_catalog, pg_temp"],"strict":false,"returns":"jsonb","language":"plpgsql","parallel":"u","leakproof":false,"volatility":"v","default_count":1,"set_returning":false,"argument_count":6,"security_definer":true,"body_md5_lf":"cf2ff95167f734c8c1c807f365a32f78"},{"signature":"api.rpc_gdpr_ack_cleanup_task(uuid,uuid,boolean,text)","owner":"postgres","kind":"f","config":["search_path=pg_catalog, pg_temp"],"strict":false,"returns":"jsonb","language":"plpgsql","parallel":"u","leakproof":false,"volatility":"v","default_count":1,"set_returning":false,"argument_count":4,"security_definer":true,"body_md5_lf":"0dd960f4c2229276466a6eb903349433"},{"signature":"api.rpc_gdpr_claim_cleanup_task(uuid,uuid,uuid,text,jsonb,text)","owner":"postgres","kind":"f","config":["search_path=pg_catalog, pg_temp"],"strict":false,"returns":"jsonb","language":"plpgsql","parallel":"u","leakproof":false,"volatility":"v","default_count":0,"set_returning":false,"argument_count":6,"security_definer":true,"body_md5_lf":"8de47a73555d5d8fb8b88d9849dab88d"},{"signature":"api.rpc_gdpr_erase_subject(text,text,text,text)","owner":"postgres","kind":"f","config":["search_path=pg_catalog, public, api, auth, audit, internal, pg_temp"],"strict":false,"returns":"jsonb","language":"plpgsql","parallel":"u","leakproof":false,"volatility":"v","default_count":2,"set_returning":false,"argument_count":4,"security_definer":true,"body_md5_lf":"d67b20a6d3b634ee01397008a4b6a2e3"},{"signature":"api.rpc_gdpr_find_start_request(uuid)","owner":"postgres","kind":"f","config":["search_path=pg_catalog, pg_temp"],"strict":false,"returns":"jsonb","language":"plpgsql","parallel":"u","leakproof":false,"volatility":"s","default_count":0,"set_returning":false,"argument_count":1,"security_definer":true,"body_md5_lf":"b8f281c7744321ea6316a04f83622d97"},{"signature":"api.rpc_gdpr_get_cleanup_status(uuid)","owner":"postgres","kind":"f","config":["search_path=pg_catalog, public, api, auth, internal, pg_temp"],"strict":false,"returns":"jsonb","language":"plpgsql","parallel":"u","leakproof":false,"volatility":"s","default_count":0,"set_returning":false,"argument_count":1,"security_definer":true,"body_md5_lf":"78c52d53e6a63d2f31ac9dd4e7aac45e"},{"signature":"api.rpc_gdpr_refuse_cleanup_task(uuid,uuid,text,jsonb,text)","owner":"postgres","kind":"f","config":["search_path=pg_catalog, pg_temp"],"strict":false,"returns":"jsonb","language":"plpgsql","parallel":"u","leakproof":false,"volatility":"v","default_count":0,"set_returning":false,"argument_count":5,"security_definer":true,"body_md5_lf":"da70a938127a5a0400d860106e351e23"},{"signature":"api.rpc_gdpr_start_erasure(uuid,text,text,text,text)","owner":"postgres","kind":"f","config":["search_path=pg_catalog, pg_temp"],"strict":false,"returns":"jsonb","language":"plpgsql","parallel":"u","leakproof":false,"volatility":"v","default_count":2,"set_returning":false,"argument_count":5,"security_definer":true,"body_md5_lf":"6461ae74f55819be4c11d5b27087db95"},{"signature":"internal.gdpr_assert_no_avatar_upload(uuid)","owner":"postgres","kind":"f","config":["search_path=pg_catalog, pg_temp"],"strict":false,"returns":"void","language":"plpgsql","parallel":"u","leakproof":false,"volatility":"v","default_count":0,"set_returning":false,"argument_count":1,"security_definer":true,"body_md5_lf":"1f9da831a057db1a545f7763ec8145db"},{"signature":"internal.gdpr_cleanup_lock_target(text)","owner":"postgres","kind":"f","config":["search_path=pg_catalog, pg_temp"],"strict":false,"returns":"void","language":"plpgsql","parallel":"u","leakproof":false,"volatility":"v","default_count":0,"set_returning":false,"argument_count":1,"security_definer":false,"body_md5_lf":"7fbb322949649a93fbbb6fdabf1e0bf1"},{"signature":"internal.gdpr_document_is_referenced(uuid)","owner":"postgres","kind":"f","config":["search_path=pg_catalog, pg_temp"],"strict":false,"returns":"boolean","language":"sql","parallel":"u","leakproof":false,"volatility":"v","default_count":0,"set_returning":false,"argument_count":1,"security_definer":false,"body_md5_lf":"2916aadcc7602518bdb3481ca19394d8"},{"signature":"internal.gdpr_enqueue_avatar_inventory(uuid,uuid)","owner":"postgres","kind":"f","config":["search_path=pg_catalog, pg_temp"],"strict":false,"returns":"integer","language":"plpgsql","parallel":"u","leakproof":false,"volatility":"v","default_count":0,"set_returning":false,"argument_count":2,"security_definer":true,"body_md5_lf":"db93cdc34c6b2d05bab4b21632a04668"},{"signature":"internal.gdpr_start_actor_identity()","owner":"postgres","kind":"f","config":["search_path=pg_catalog, pg_temp"],"strict":false,"returns":"text","language":"plpgsql","parallel":"u","leakproof":false,"volatility":"s","default_count":0,"set_returning":false,"argument_count":0,"security_definer":true,"body_md5_lf":"86a73771a3b092ae7045e5b365ba845b"}]
$pins$::jsonb) LOOP
    function_id := pg_catalog.to_regprocedure(expected->>'signature');
    SELECT p.proowner, pg_catalog.jsonb_build_object(
      'owner',pg_catalog.pg_get_userbyid(p.proowner),'kind',p.prokind,
      'config',p.proconfig,'strict',p.proisstrict,'returns',pg_catalog.pg_get_function_result(p.oid),
      'language',l.lanname,'parallel',p.proparallel,'leakproof',p.proleakproof,
      'volatility',p.provolatile,'default_count',p.pronargdefaults,
      'set_returning',p.proretset,'argument_count',p.pronargs,'security_definer',p.prosecdef,
      'body_md5_lf',pg_catalog.md5(pg_catalog.replace(p.prosrc,pg_catalog.chr(13),'')))
    INTO function_owner,actual
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang
    WHERE p.oid=function_id;
    IF actual IS DISTINCT FROM expected-'signature' THEN
      RAISE EXCEPTION 'GDPR activation function drift: %',expected->>'signature' USING ERRCODE='55000';
    END IF;
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,
      'grantor',pg_catalog.pg_get_userbyid(a.grantor),'privilege',a.privilege_type,
      'grantable',a.is_grantable) ORDER BY a.grantee,a.grantor,a.privilege_type)
    INTO function_acl FROM pg_catalog.pg_proc p,
      LATERAL pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
    WHERE p.oid=function_id;
    IF function_acl IS DISTINCT FROM '[{"grantee":"postgres","grantor":"postgres","privilege":"EXECUTE","grantable":false}]'::jsonb THEN
      RAISE EXCEPTION 'GDPR activation requires the exact closed ACL: %',expected->>'signature' USING ERRCODE='55000';
    END IF;
  END LOOP;
  FOREACH private_table IN ARRAY ARRAY['internal.gdpr_cleanup_task','internal.avatar_upload_intent',
      'internal.crm_document_detachment','internal.crm_document_upload'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c WHERE c.oid=pg_catalog.to_regclass(private_table)
       AND c.relowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='postgres') AND c.relrowsecurity)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid=pg_catalog.to_regclass(private_table))
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c,
         LATERAL pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a
         WHERE c.oid=pg_catalog.to_regclass(private_table) AND a.grantee<>c.relowner) THEN
      RAISE EXCEPTION 'GDPR private relation drift: %',private_table USING ERRCODE='55000';
    END IF;
  END LOOP;
END;
$guard$;

GRANT EXECUTE ON FUNCTION
  api.rpc_gdpr_start_erasure(uuid,text,text,text,text),
  api.rpc_gdpr_find_start_request(uuid)
TO authenticated;

GRANT EXECUTE ON FUNCTION
  api.rpc_gdpr_get_cleanup_status(uuid),
  api.rpc_gdpr_claim_cleanup_task(uuid,uuid,uuid,text,jsonb,text),
  api.rpc_gdpr_ack_cleanup_attempt(uuid,uuid,uuid,boolean,boolean,text),
  api.rpc_gdpr_refuse_cleanup_task(uuid,uuid,text,jsonb,text)
TO service_role;

DO $postcheck$
DECLARE f text; expected_role text; actual_acl jsonb;
BEGIN
  FOR f,expected_role IN SELECT * FROM (VALUES
    ('api.rpc_gdpr_start_erasure(uuid,text,text,text,text)','authenticated'),
    ('api.rpc_gdpr_find_start_request(uuid)','authenticated'),
    ('api.rpc_gdpr_get_cleanup_status(uuid)','service_role'),
    ('api.rpc_gdpr_claim_cleanup_task(uuid,uuid,uuid,text,jsonb,text)','service_role'),
    ('api.rpc_gdpr_ack_cleanup_attempt(uuid,uuid,uuid,boolean,boolean,text)','service_role'),
    ('api.rpc_gdpr_refuse_cleanup_task(uuid,uuid,text,jsonb,text)','service_role')
  ) AS required(signature,executor) LOOP
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
        pg_catalog.pg_get_userbyid(a.grantee),pg_catalog.pg_get_userbyid(a.grantor),a.privilege_type,a.is_grantable)
        ORDER BY pg_catalog.pg_get_userbyid(a.grantee)) INTO actual_acl
    FROM pg_catalog.pg_proc p,LATERAL pg_catalog.aclexplode(p.proacl) a
    WHERE p.oid=pg_catalog.to_regprocedure(f);
    IF actual_acl IS DISTINCT FROM (SELECT pg_catalog.jsonb_agg(value ORDER BY value->>0)
      FROM pg_catalog.jsonb_array_elements(pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_array('postgres','postgres','EXECUTE',false),
        pg_catalog.jsonb_build_array(expected_role,'postgres','EXECUTE',false))))
      OR pg_catalog.has_function_privilege('anon',f,'EXECUTE')
      OR pg_catalog.has_function_privilege(CASE WHEN expected_role='authenticated' THEN 'service_role' ELSE 'authenticated' END,f,'EXECUTE') THEN
      RAISE EXCEPTION 'GDPR activation ACL postcheck failed: %',f USING ERRCODE='55000';
    END IF;
  END LOOP;
END;
$postcheck$;
NOTIFY pgrst, 'reload schema';
COMMIT;
