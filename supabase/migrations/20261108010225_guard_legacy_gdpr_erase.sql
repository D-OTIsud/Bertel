BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = pg_catalog, pg_temp;

DO $guard$
DECLARE
  v_erase regprocedure := to_regprocedure('api.rpc_gdpr_erase_subject(text,text,text,text)');
  v_status regprocedure := to_regprocedure('api.rpc_gdpr_get_cleanup_status(uuid)');
  v_ack regprocedure := to_regprocedure('api.rpc_gdpr_ack_cleanup_task(uuid,uuid,boolean,text)');
  v_tasks regclass := to_regclass('internal.gdpr_cleanup_task');
  v_catalog jsonb;
  v_catalog_md5 text;
  -- Canonical 19a plus actor-realm catalog, without environment OIDs.
  -- The query also verifies relation kind, durable table shape and all grants.
  v_catalog_sql CONSTANT text := $catalog$
WITH target_functions(signature) AS (VALUES
 ('api.rpc_gdpr_erase_subject(text,text,text,text)'),
 ('api.rpc_gdpr_get_cleanup_status(uuid)'),
 ('api.rpc_gdpr_ack_cleanup_task(uuid,uuid,boolean,text)')
), functions AS (
 SELECT f.signature,p.* FROM target_functions f
 LEFT JOIN pg_catalog.pg_proc p ON p.oid=pg_catalog.to_regprocedure(f.signature)
), target_table AS (
 SELECT c.* FROM pg_catalog.pg_class c
 WHERE c.oid=pg_catalog.to_regclass('internal.gdpr_cleanup_task')
)
SELECT pg_catalog.jsonb_build_object(
 'functions',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'signature',f.signature,'present',f.oid IS NOT NULL,
   'owner',pg_catalog.pg_get_userbyid(f.proowner),
   'kind',f.prokind,'language',(SELECT lanname FROM pg_catalog.pg_language WHERE oid=f.prolang),
   'arguments',pg_catalog.pg_get_function_arguments(f.oid),
   'identity_arguments',pg_catalog.pg_get_function_identity_arguments(f.oid),
   'returns',pg_catalog.pg_get_function_result(f.oid),
   'argument_count',f.pronargs,'default_count',f.pronargdefaults,
   'security_definer',f.prosecdef,'volatility',f.provolatile,'strict',f.proisstrict,
   'leakproof',f.proleakproof,'parallel',f.proparallel,'set_returning',f.proretset,
   'config',f.proconfig,'acl_is_null',f.proacl IS NULL,
   'acl',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
       'grantor',pg_catalog.pg_get_userbyid(a.grantor),
       'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,
       'privilege',a.privilege_type,'grantable',a.is_grantable)
       ORDER BY a.grantor::regrole::text COLLATE "C",
                CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END COLLATE "C",
                a.privilege_type COLLATE "C",a.is_grantable)
      FROM pg_catalog.aclexplode(coalesce(f.proacl,pg_catalog.acldefault('f',f.proowner))) a),
   'body_md5_lf',pg_catalog.md5(pg_catalog.replace(f.prosrc,pg_catalog.chr(13),'')),
   'definition_md5_lf',pg_catalog.md5(pg_catalog.replace(pg_catalog.pg_get_functiondef(f.oid),pg_catalog.chr(13),''))
 ) ORDER BY f.signature COLLATE "C") FROM functions f),
 'table',(SELECT pg_catalog.jsonb_build_object(
   'present',true,'name','internal.gdpr_cleanup_task',
   'kind',t.relkind,'persistence',t.relpersistence,'owner',pg_catalog.pg_get_userbyid(t.relowner),
   'rls',t.relrowsecurity,'forced_rls',t.relforcerowsecurity,'is_partition',t.relispartition,
   'options',t.reloptions,'acl_is_null',t.relacl IS NULL,
   'inherits',(SELECT coalesce(pg_catalog.jsonb_agg(
       pg_catalog.jsonb_build_array(pn.nspname,pc.relname) ORDER BY pn.nspname,pc.relname),'[]'::jsonb)
      FROM pg_catalog.pg_inherits i JOIN pg_catalog.pg_class pc ON pc.oid=i.inhparent
      JOIN pg_catalog.pg_namespace pn ON pn.oid=pc.relnamespace WHERE i.inhrelid=t.oid),
   'children',(SELECT coalesce(pg_catalog.jsonb_agg(
       pg_catalog.jsonb_build_array(cn.nspname,cc.relname) ORDER BY cn.nspname,cc.relname),'[]'::jsonb)
      FROM pg_catalog.pg_inherits i JOIN pg_catalog.pg_class cc ON cc.oid=i.inhrelid
      JOIN pg_catalog.pg_namespace cn ON cn.oid=cc.relnamespace WHERE i.inhparent=t.oid),
   'acl',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
       'grantor',pg_catalog.pg_get_userbyid(a.grantor),
       'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,
       'privilege',a.privilege_type,'grantable',a.is_grantable)
       ORDER BY a.grantor::regrole::text COLLATE "C",
                CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END COLLATE "C",
                a.privilege_type COLLATE "C",a.is_grantable)
      FROM pg_catalog.aclexplode(coalesce(t.relacl,pg_catalog.acldefault('r',t.relowner))) a),
   'columns',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
       'position',a.attnum,'name',a.attname,'type',pg_catalog.format_type(a.atttypid,a.atttypmod),
       'not_null',a.attnotnull,'has_default',a.atthasdef,
       'default',pg_catalog.pg_get_expr(d.adbin,d.adrelid),
       'identity',a.attidentity,'generated',a.attgenerated,
       'collation',CASE WHEN a.attcollation=0 THEN NULL ELSE
         (SELECT n.nspname||'.'||c.collname FROM pg_catalog.pg_collation c
          JOIN pg_catalog.pg_namespace n ON n.oid=c.collnamespace WHERE c.oid=a.attcollation) END,
       'acl',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'grantor',pg_catalog.pg_get_userbyid(x.grantor),
           'grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.grantee) END,
           'privilege',x.privilege_type,'grantable',x.is_grantable)
           ORDER BY x.grantor::regrole::text COLLATE "C",
             CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.grantee) END COLLATE "C",
             x.privilege_type COLLATE "C",x.is_grantable)
          FROM pg_catalog.aclexplode(a.attacl) x)
     ) ORDER BY a.attnum)
     FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
     WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped),
   'constraints',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
       'name',c.conname,'type',c.contype,'definition',pg_catalog.pg_get_constraintdef(c.oid),
       'validated',c.convalidated,'deferrable',c.condeferrable,'initially_deferred',c.condeferred,
       'local',c.conislocal,'inherit_count',c.coninhcount,'no_inherit',c.connoinherit
     ) ORDER BY c.conname COLLATE "C"),'[]'::jsonb) FROM pg_catalog.pg_constraint c WHERE c.conrelid=t.oid),
   'indexes',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
       'name',ic.relname,'definition',pg_catalog.pg_get_indexdef(i.indexrelid),
       'valid',i.indisvalid,'ready',i.indisready,'live',i.indislive,'unique',i.indisunique,
       'primary',i.indisprimary,'immediate',i.indimmediate,'nulls_not_distinct',i.indnullsnotdistinct,
       'key_count',i.indnkeyatts,'column_count',i.indnatts
     ) ORDER BY ic.relname COLLATE "C"),'[]'::jsonb) FROM pg_catalog.pg_index i
     JOIN pg_catalog.pg_class ic ON ic.oid=i.indexrelid WHERE i.indrelid=t.oid),
   'triggers',(SELECT coalesce(pg_catalog.jsonb_agg(x.descriptor ORDER BY x.descriptor::text COLLATE "C"),'[]'::jsonb)
     FROM (SELECT pg_catalog.jsonb_build_object(
       'name',CASE WHEN g.tgisinternal THEN NULL ELSE g.tgname END,
       'definition',CASE WHEN g.tgisinternal THEN NULL ELSE pg_catalog.pg_get_triggerdef(g.oid) END,
       'internal',g.tgisinternal,'type',g.tgtype,'enabled',g.tgenabled,
       'deferrable',g.tgdeferrable,'initially_deferred',g.tginitdeferred,
       'function',g.tgfoid::regprocedure::text,'arguments_hex',pg_catalog.encode(g.tgargs,'hex'),
       'condition',pg_catalog.pg_get_expr(g.tgqual,g.tgrelid)
     ) descriptor FROM pg_catalog.pg_trigger g WHERE g.tgrelid=t.oid) x),
   'policies',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
       'name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
       'roles',(SELECT pg_catalog.array_agg(CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(r) END
             ORDER BY CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(r) END COLLATE "C")
           FROM pg_catalog.unnest(p.polroles) r),
       'using',pg_catalog.pg_get_expr(p.polqual,p.polrelid),
       'with_check',pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid)
     ) ORDER BY p.polname COLLATE "C"),'[]'::jsonb) FROM pg_catalog.pg_policy p WHERE p.polrelid=t.oid),
   'rules',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.pg_get_ruledef(r.oid)
              ORDER BY r.rulename COLLATE "C"),'[]'::jsonb)
             FROM pg_catalog.pg_rewrite r WHERE r.ev_class=t.oid)
 ) FROM target_table t)
);
$catalog$;
BEGIN
  PERFORM 1 FROM pg_proc WHERE oid = v_erase;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'GDPR erasure predecessor missing';
  END IF;

  IF v_status IS NOT NULL AND v_ack IS NOT NULL AND v_tasks IS NOT NULL THEN
    EXECUTE v_catalog_sql INTO v_catalog;
    v_catalog_md5 := md5(v_catalog::text);
    IF v_catalog_md5 = '51e2bf87593ca9a5ac4ea21121e93aa0' THEN
      RETURN;
    END IF;
    IF v_catalog_md5 IS DISTINCT FROM '056535ea0dbe94feef238596a116c815' THEN
      RAISE EXCEPTION 'Unrecognized durable GDPR cleanup catalog';
    END IF;

    DECLARE
      v_oid oid;
      v_owner oid;
      v_acl aclitem[];
    BEGIN
      SELECT p.oid,p.proowner,p.proacl INTO STRICT v_oid,v_owner,v_acl
      FROM pg_catalog.pg_proc p
      WHERE p.oid = 'api.rpc_gdpr_get_cleanup_status(uuid)'::regprocedure;
      IF (SELECT md5(replace(prosrc,chr(13),'')) FROM pg_catalog.pg_proc WHERE oid=v_oid)
          IS DISTINCT FROM '85f689b8e1958a2f1ac3a742265ccb09'
         OR md5(replace(pg_catalog.pg_get_functiondef(v_oid),chr(13),''))
            IS DISTINCT FROM 'deb51cc64fbfe5bc98ef6d2b8f1a0983' THEN
        RAISE EXCEPTION 'Unexpected predecessor for durable cleanup status';
      END IF;

    EXECUTE $definition$
CREATE OR REPLACE FUNCTION api.rpc_gdpr_get_cleanup_status(p_operation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, internal, pg_temp
AS $function$
DECLARE
  v_log   gdpr_erasure_log;
  v_tasks JSONB;
BEGIN
  SELECT * INTO v_log FROM gdpr_erasure_log WHERE id = p_operation_id
    AND report->'operationId' = to_jsonb(p_operation_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Opération RGPD introuvable: %', p_operation_id USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', t.id, 'action', t.action, 'metadata', t.metadata,
           'status', t.status, 'attempts', t.attempts, 'lastError', t.last_error
         ) ORDER BY t.created_at), '[]'::jsonb)
    INTO v_tasks
    FROM internal.gdpr_cleanup_task t
   WHERE t.operation_id = p_operation_id;

  RETURN jsonb_build_object(
    'operationId', v_log.id,
    'subjectKind', v_log.subject_kind,
    'subjectId', v_log.subject_id,
    'mode', v_log.mode,
    'reason', v_log.reason,
    'performedBy', v_log.performed_by,
    'performedAt', v_log.performed_at,
    'report', v_log.report,
    'tasks', v_tasks
  );
END;
$function$;
    $definition$;


      IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
        WHERE p.oid=v_oid AND p.proowner=v_owner AND p.proacl IS NOT DISTINCT FROM v_acl) THEN
        RAISE EXCEPTION 'Cleanup status identity or grants changed';
      END IF;
    END;

    EXECUTE v_catalog_sql INTO v_catalog;
    IF md5(v_catalog::text) IS DISTINCT FROM '51e2bf87593ca9a5ac4ea21121e93aa0' THEN
      RAISE EXCEPTION 'Durable GDPR cleanup catalog changed unexpectedly';
    END IF;
    RETURN;
  END IF;

  IF v_status IS NOT NULL OR v_ack IS NOT NULL OR v_tasks IS NOT NULL THEN
    RAISE EXCEPTION 'GDPR durable cleanup contract is partially installed';
  END IF;

  -- The installed legacy body can commit an erasure without a durable cleanup receipt.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
     WHERE oid = v_erase
       AND proowner = 'postgres'::regrole
       AND prosecdef
       AND proconfig = ARRAY['search_path=pg_catalog, public, api, auth, audit']
       AND md5(prosrc) = 'e2105031945db1ef4efd383e6493a9b0'
  ) THEN
    RAISE EXCEPTION 'Unrecognized legacy GDPR erasure predecessor';
  END IF;

  REVOKE EXECUTE ON FUNCTION api.rpc_gdpr_erase_subject(text,text,text,text)
    FROM PUBLIC, anon, authenticated, service_role;

  -- Reject a changed predecessor before committing the privilege update.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
     WHERE oid = v_erase
       AND oid = to_regprocedure('api.rpc_gdpr_erase_subject(text,text,text,text)')
       AND proowner = 'postgres'::regrole
       AND prosecdef
       AND proconfig = ARRAY['search_path=pg_catalog, public, api, auth, audit']
       AND md5(prosrc) = 'e2105031945db1ef4efd383e6493a9b0'
  ) THEN
    RAISE EXCEPTION 'Legacy GDPR erasure predecessor changed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
     WHERE p.oid = v_erase AND a.grantee <> p.proowner
  ) THEN
    RAISE EXCEPTION 'Legacy GDPR erasure retains a non-owner grant';
  END IF;

  IF has_function_privilege('anon', v_erase::oid, 'EXECUTE')
     OR has_function_privilege('authenticated', v_erase::oid, 'EXECUTE')
     OR has_function_privilege('service_role', v_erase::oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'Legacy GDPR erasure still grants API execution';
  END IF;
END
$guard$;

NOTIFY pgrst, 'reload schema';
COMMIT;
