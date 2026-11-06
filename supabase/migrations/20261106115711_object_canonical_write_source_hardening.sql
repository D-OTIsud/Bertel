-- Separate bounded dependency hardening exposed by the unchanged DB03 shadow.
-- Four application functions only; no policy, grant or managed auth definition changes.
BEGIN;
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='15s';
DO $guarded_authority$
DECLARE
  v_targets jsonb:=jsonb_build_array(
    jsonb_build_object('signature','api.current_user_org_id()','old_hashes',to_jsonb(ARRAY['27b3967cd75148d6b23e6246ab48a647']), 'new_hash','2624dd905dda43aa5132e71b02241f5d','result','text','argnames','null'::jsonb,'ddl',$definition0$
CREATE OR REPLACE FUNCTION api.current_user_org_id()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,api,auth,pg_temp
AS $authority$
  SELECT uom.org_object_id
  FROM public.user_org_membership uom
  WHERE uom.user_id = auth.uid()
    AND uom.is_active = TRUE
  LIMIT 1;
$authority$;
$definition0$),
    jsonb_build_object('signature','api.user_has_permission(text)','old_hashes',to_jsonb(ARRAY['457a1ec4c990414f5be2a569bd99e644']), 'new_hash','24781c630e3faddcc44d759f3c6b219a','result','boolean','argnames',to_jsonb(ARRAY['p_permission_code']::text[]),'ddl',$definition1$
CREATE OR REPLACE FUNCTION api.user_has_permission(p_permission_code text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,api,auth,pg_temp
AS $authority$
  WITH perm AS (
    SELECT id
    FROM public.ref_permission
    WHERE code = p_permission_code
      AND is_active = TRUE
    LIMIT 1
  )
  SELECT
    -- Chemin 1 : droit accordé INDIVIDUELLEMENT — une exception, assumée comme telle.
    EXISTS (
      SELECT 1
      FROM public.user_permission up
      JOIN perm p ON p.id = up.permission_id
      WHERE up.user_id   = (SELECT auth.uid())
        AND up.is_active = TRUE
    )
    OR
    -- Chemin 2 : droit CONFÉRÉ par le rôle métier du membre, dans SON ORG (§227).
    -- La jointure sur `ubr.role_id = orp.role_id` est ce qui distingue cette couche de celle
    -- qu'elle remplace : l'ancienne accordait à tout membre de l'ORG, celle-ci n'accorde qu'aux
    -- membres qui portent le rôle visé.
    EXISTS (
      SELECT 1
      FROM public.org_role_permission orp
      JOIN perm p ON p.id = orp.permission_id
      JOIN public.user_org_membership     uom ON uom.org_object_id = orp.org_object_id
      JOIN public.user_org_business_role  ubr ON ubr.membership_id = uom.id
      WHERE uom.user_id   = (SELECT auth.uid())
        AND uom.is_active = TRUE
        AND ubr.is_active = TRUE
        AND ubr.role_id   = orp.role_id
        AND orp.is_active = TRUE
    );
$authority$;
$definition1$),
    jsonb_build_object('signature','api.is_platform_superuser()','old_hashes',to_jsonb(ARRAY['b0b568270f3ed0141a3d1d5a75100aa4','4468aebcbd2358cb551dd08c0a0e8e7c']), 'new_hash','918a248912c00b15d4d980848a6aa744','result','boolean','argnames','null'::jsonb,'ddl',$definition2$
CREATE OR REPLACE FUNCTION api.is_platform_superuser()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,api,auth,pg_temp
AS $authority$
  SELECT
    auth.role() IN ('service_role', 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.app_user_profile p
      WHERE p.id = auth.uid()
        AND p.role IN ('owner', 'super_admin')
    );
$authority$;
$definition2$),
    jsonb_build_object('signature','api.user_can_write_canonical(text)','old_hashes',to_jsonb(ARRAY['64c5c51ab594314b77d25a489f606bf0']), 'new_hash','10752e3941b8905d3b066a57d919c590','result','boolean','argnames',to_jsonb(ARRAY['p_object_id']::text[]),'ddl',$definition3$
CREATE OR REPLACE FUNCTION api.user_can_write_canonical(p_object_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,api,auth,pg_temp
AS $authority$
  SELECT
    api.user_has_permission('edit_canonical_when_publisher')
    AND EXISTS (
      SELECT 1
      FROM public.object_org_link ool
      JOIN public.ref_org_role    ror ON ror.id = ool.role_id AND ror.code = 'publisher'
      WHERE ool.object_id     = p_object_id
        AND ool.org_object_id = api.current_user_org_id()
    )
$authority$;
$definition3$)
  );
  v_target jsonb;
  v_before jsonb:='{}'::jsonb;
  v_proc pg_catalog.pg_proc%ROWTYPE;
  v_oid oid;
  v_hash text;
  v_argnames text[];
BEGIN
  -- Validate every predecessor before replacing any definition.
  FOR v_target IN SELECT value FROM pg_catalog.jsonb_array_elements(v_targets) LOOP
    v_oid:=pg_catalog.to_regprocedure(v_target->>'signature');
    IF v_oid IS NULL THEN RAISE EXCEPTION 'Authority source function missing: %',v_target->>'signature' USING ERRCODE='55000'; END IF;
    SELECT * INTO STRICT v_proc FROM pg_catalog.pg_proc WHERE oid=v_oid;
    v_hash:=pg_catalog.md5(pg_catalog.replace(v_proc.prosrc,pg_catalog.chr(13),''));
    v_argnames:=CASE WHEN v_target->'argnames'='null'::jsonb THEN NULL
      ELSE ARRAY(SELECT pg_catalog.jsonb_array_elements_text(v_target->'argnames')) END;
    IF v_proc.prokind<>'f' OR v_proc.proretset
       OR v_proc.prorettype<>pg_catalog.to_regtype(v_target->>'result')
       OR v_proc.prolang<>(SELECT oid FROM pg_catalog.pg_language WHERE lanname='sql')
       OR NOT v_proc.prosecdef OR v_proc.provolatile<>'s'
       OR v_proc.proisstrict OR v_proc.proleakproof OR v_proc.proparallel<>'u'
       OR v_proc.procost<>100 OR v_proc.pronargdefaults<>0
       OR v_proc.proargnames IS DISTINCT FROM v_argnames
       OR NOT (
         (v_target->'old_hashes' ? v_hash AND (v_proc.proconfig IS NOT DISTINCT FROM ARRAY['search_path=public, api, auth']::text[]))
         OR
         (v_hash=v_target->>'new_hash' AND (v_proc.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, public, api, auth, pg_temp']::text[]))
       )
    THEN RAISE EXCEPTION 'Unexpected authority predecessor: %; review drift before applying',v_target->>'signature'
         USING ERRCODE='55000'; END IF;
    v_before:=pg_catalog.jsonb_set(v_before,ARRAY[v_target->>'signature'],pg_catalog.to_jsonb(v_proc),true);
  END LOOP;
  FOR v_target IN SELECT value FROM pg_catalog.jsonb_array_elements(v_targets) LOOP
    EXECUTE v_target->>'ddl';
  END LOOP;
  -- Only body and proconfig may change. OID, owner, ACL and every other
  -- pg_proc attribute must equal the exact preflight tuple.
  FOR v_target IN SELECT value FROM pg_catalog.jsonb_array_elements(v_targets) LOOP
    SELECT * INTO STRICT v_proc FROM pg_catalog.pg_proc
      WHERE oid=pg_catalog.to_regprocedure(v_target->>'signature');
    IF pg_catalog.md5(pg_catalog.replace(v_proc.prosrc,pg_catalog.chr(13),''))<>v_target->>'new_hash'
       OR v_proc.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public, api, auth, pg_temp']::text[]
       OR (pg_catalog.to_jsonb(v_proc)-ARRAY['prosrc','proconfig'])
           IS DISTINCT FROM ((v_before->(v_target->>'signature'))-ARRAY['prosrc','proconfig'])
    THEN RAISE EXCEPTION 'Authority postflight changed an unrelated attribute: %',v_target->>'signature' USING ERRCODE='55000'; END IF;
  END LOOP;
END;
$guarded_authority$;
NOTIFY pgrst,'reload schema';
COMMIT;
