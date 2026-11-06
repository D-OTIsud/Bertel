-- M backend preparation only. No new portal UI; actor feature and EXECUTE remain OFF.
-- Shared R4 reconciliation stays the only writer; each public façade authorizes itself.
BEGIN;
SET LOCAL lock_timeout='5s';
-- Expected R4 575c8e5: source + owner/security/ACL checked before sharing its writer.
-- Replay is allowed only while the exact preparation is still OFF, never after activation.
DO $m_preflight$
DECLARE v_oid oid; v_hash text; v_replay boolean; v_enabled boolean; r record;
BEGIN
  v_oid:=to_regprocedure('api.save_object_menus(text,jsonb)');
  SELECT md5(replace(prosrc,E'\r\n',E'\n')) INTO v_hash FROM pg_proc WHERE oid=v_oid
    AND proowner='postgres'::regrole AND prosecdef AND provolatile='v' AND prorettype='jsonb'::regtype
    AND NOT proretset AND NOT proisstrict AND NOT proleakproof AND proparallel='u' AND pronargdefaults=0
    AND pg_get_expr(proargdefaults,0) IS NULL
    AND prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql') AND proargnames=ARRAY['p_object_id','p_payload']::text[];
  IF v_hash NOT IN ('644b7f082141ec6c0cc3f0c807d67242','8f48b203e5004582232ed20659b9511c') OR v_hash IS NULL THEN
    RAISE EXCEPTION 'M refuses unexpected R4 writer source/attributes: %',v_hash;
  END IF;
  IF NOT has_function_privilege('postgres',v_oid,'EXECUTE') OR NOT has_function_privilege('authenticated',v_oid,'EXECUTE') OR NOT has_function_privilege('service_role',v_oid,'EXECUTE')
    OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      WHERE p.oid=v_oid AND (a.privilege_type<>'EXECUTE' OR a.grantor<>'postgres'::regrole
        OR a.grantee NOT IN ('postgres'::regrole,'authenticated'::regrole,'service_role'::regrole)
        OR (a.is_grantable AND a.grantee<>'postgres'::regrole)))
    OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL unnest(p.proconfig) c WHERE p.oid=v_oid
      AND replace(c,' ','') NOT IN ('search_path=pg_catalog,public,api,internal','lock_timeout=5s'))
    OR EXISTS(SELECT 1 FROM pg_proc WHERE oid=v_oid AND cardinality(proconfig) IS DISTINCT FROM 2) THEN
    RAISE EXCEPTION 'M refuses unexpected R4 writer configuration or ACL';
  END IF;
  v_replay:=v_hash='8f48b203e5004582232ed20659b9511c';
  IF v_replay THEN
    IF to_regclass('internal.portal_menu_write_configuration') IS NULL THEN RAISE EXCEPTION 'M partial preparation'; END IF;
    EXECUTE 'SELECT enabled FROM internal.portal_menu_write_configuration WHERE singleton' INTO v_enabled;
    IF v_enabled IS DISTINCT FROM false THEN RAISE EXCEPTION 'Do not replay M preparation after activation'; END IF;
  ELSIF to_regclass('internal.portal_menu_write_configuration') IS NOT NULL THEN RAISE EXCEPTION 'M configuration already exists without the expected preparation'; END IF;
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
    IF r.access_kind='office' AND NOT v_replay THEN CONTINUE; END IF;
    IF NOT v_replay THEN
      IF v_oid IS NOT NULL THEN RAISE EXCEPTION 'M function already exists: %',r.signature; END IF;
    ELSE
      IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang
        WHERE p.oid=v_oid AND p.proowner='postgres'::regrole AND p.prosecdef=r.definer
          AND md5(replace(p.prosrc,E'\r\n',E'\n'))=r.source_hash
          AND p.provolatile::text=r.volatility AND l.lanname::text=r.language_name
          AND p.prorettype=r.return_type::regtype AND NOT p.proretset AND p.proargnames=r.argument_names
          AND p.pronargdefaults=r.default_count
          AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM CASE WHEN r.default_count=1 THEN 'NULL::uuid'::text ELSE NULL::text END
          AND NOT p.proisstrict AND NOT p.proleakproof AND p.proparallel='u'
          AND COALESCE((SELECT array_agg(lower(replace(c,' ','')) ORDER BY lower(replace(c,' ',''))) FROM unnest(p.proconfig) c),ARRAY[]::text[])=r.configuration) THEN
        RAISE EXCEPTION 'M preparation source/attributes drift: %',r.signature;
      END IF;
      IF NOT has_function_privilege('postgres',v_oid,'EXECUTE') OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        WHERE p.oid=v_oid AND (a.privilege_type<>'EXECUTE' OR a.grantor<>'postgres'::regrole
          OR NOT (a.grantee='postgres'::regrole
            OR (r.access_kind='office' AND a.grantee IN ('authenticated'::regrole,'service_role'::regrole)))
          OR (a.is_grantable AND a.grantee<>'postgres'::regrole)))
        OR (r.access_kind='office' AND (NOT has_function_privilege('authenticated',v_oid,'EXECUTE')
          OR NOT has_function_privilege('service_role',v_oid,'EXECUTE'))) THEN
        RAISE EXCEPTION 'M preparation ACL drift: %',r.signature;
      END IF;
    END IF;
  END LOOP;
END;
$m_preflight$;

CREATE TABLE IF NOT EXISTS internal.portal_menu_write_configuration(
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  enabled boolean NOT NULL DEFAULT false
);
INSERT INTO internal.portal_menu_write_configuration(singleton,enabled) VALUES(true,false) ON CONFLICT DO NOTHING;
ALTER TABLE internal.portal_menu_write_configuration ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal.portal_menu_write_configuration FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION internal.apply_object_menus_patch(p_object_id text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,api,internal SET lock_timeout='5s' AS $$
DECLARE v_entry jsonb; v_changes jsonb; v_expected jsonb; v_current jsonb; v_next jsonb;
  v_id uuid; v_menu_id uuid; v_key text; v_value jsonb; v_snapshot jsonb;
  v_hash text; v_principal text; v_request_id uuid; v_receipt internal.object_menu_write_receipt%ROWTYPE; v_result jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.object WHERE id=p_object_id AND object_type='RES') THEN
    RAISE EXCEPTION 'Les menus concernent les restaurants.' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR p_payload->>'write_contract' IS DISTINCT FROM 'menus-reconcile-v1'
    OR jsonb_typeof(p_payload->'request_id') IS DISTINCT FROM 'string'
    OR COALESCE(p_payload->>'request_id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN ('write_contract','request_id','menus','items','deleted_menus','deleted_items'))
    OR EXISTS(SELECT 1 FROM unnest(ARRAY['menus','items','deleted_menus','deleted_items']) k WHERE jsonb_typeof(p_payload->k) IS DISTINCT FROM 'array') THEN
    RAISE EXCEPTION 'Contrat de menus invalide. Rechargez les menus.' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements((p_payload->'menus')||(p_payload->'items')||(p_payload->'deleted_menus')||(p_payload->'deleted_items')) r
    GROUP BY r->>'id' HAVING count(*)>1) THEN RAISE EXCEPTION 'Identifiants de menus répétés.' USING ERRCODE='22023'; END IF;
  -- All cooperating writes serialize here, including first insert. Row locks also protect
  -- the preparation period from ordinary writes to known menus/items and their FK children.
  PERFORM 1 FROM public.object WHERE id=p_object_id FOR UPDATE;
  v_hash:=md5(p_payload::text); v_principal:=COALESCE(auth.uid()::text,'service_role'); v_request_id:=(p_payload->>'request_id')::uuid;
  SELECT * INTO v_receipt FROM internal.object_menu_write_receipt WHERE object_id=p_object_id AND principal=v_principal AND request_id=v_request_id;
  IF FOUND THEN
    IF v_receipt.request IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'Collision de requête de menus.' USING ERRCODE='22023'; END IF;
    RETURN jsonb_build_object('success',true,'replayed',true,'snapshot',internal.object_menu_write_snapshot(p_object_id));
  END IF;
  PERFORM 1 FROM public.object_menu WHERE object_id=p_object_id ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.object_menu_item WHERE menu_id IN(SELECT id FROM public.object_menu WHERE object_id=p_object_id) ORDER BY id FOR UPDATE;

  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_payload->'menus') LOOP
    v_id:=(v_entry->>'id')::uuid; v_changes:=v_entry->'changes'; v_expected:=v_entry->'expected';
    IF v_id IS NULL OR jsonb_typeof(v_entry) IS DISTINCT FROM 'object' OR NOT v_entry ? 'expected'
      OR jsonb_typeof(v_entry->'id') IS DISTINCT FROM 'string' OR jsonb_typeof(v_expected) NOT IN ('object','null')
      OR jsonb_typeof(v_changes) IS DISTINCT FROM 'object'
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_entry) k WHERE k NOT IN ('id','expected','changes'))
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_changes) k WHERE k NOT IN ('category_id','name','description','is_active','visibility','position')) THEN
      RAISE EXCEPTION 'Champs de menu invalides.' USING ERRCODE='22023';
    END IF;
    FOR v_key,v_value IN SELECT key,value FROM jsonb_each(v_changes) LOOP
      IF (v_key='name' AND jsonb_typeof(v_value)<>'string')
        OR (v_key='is_active' AND jsonb_typeof(v_value)<>'boolean')
        OR (v_key IN ('category_id','description','visibility') AND jsonb_typeof(v_value) NOT IN ('string','null'))
        OR (v_key='position' AND (jsonb_typeof(v_value) NOT IN ('number','null') OR (v_value<>'null'::jsonb AND (v_value#>>'{}') !~ '^-?[0-9]+$'))) THEN
        RAISE EXCEPTION 'Type de champ de menu invalide.' USING ERRCODE='22023';
      END IF;
    END LOOP;
    SELECT to_jsonb(m) INTO v_current FROM public.object_menu m WHERE id=v_id;
    IF v_current IS NOT NULL AND v_current->>'object_id'<>p_object_id THEN RAISE EXCEPTION 'Menu inaccessible.' USING ERRCODE='42501'; END IF;
    IF v_current IS NULL THEN
      IF v_expected<>'null'::jsonb THEN RAISE EXCEPTION 'Le menu a changé. Rechargez les menus.' USING ERRCODE='PT409'; END IF;
      INSERT INTO public.object_menu(id,object_id,category_id,name,description,is_active,visibility,position)
        VALUES(v_id,p_object_id,(v_changes->>'category_id')::uuid,v_changes->>'name',v_changes->>'description',
          COALESCE((v_changes->>'is_active')::boolean,true),v_changes->>'visibility',(v_changes->>'position')::integer);
    ELSE
      IF v_expected<>'null'::jsonb AND (v_expected->>'id' IS DISTINCT FROM v_id::text OR v_expected->>'object_id' IS DISTINCT FROM p_object_id) THEN
        RAISE EXCEPTION 'Baseline de menu invalide.' USING ERRCODE='22023';
      END IF;
      FOR v_key,v_value IN SELECT key,value FROM jsonb_each(v_changes) LOOP
        IF v_current->v_key IS DISTINCT FROM v_value AND (v_expected='null'::jsonb OR v_current->v_key IS DISTINCT FROM v_expected->v_key) THEN
          RAISE EXCEPTION 'Le menu a changé. Rechargez les menus ; votre saisie est conservée.' USING ERRCODE='PT409';
        END IF;
      END LOOP;
      v_next:=v_current||v_changes;
      IF v_next IS DISTINCT FROM v_current THEN
        UPDATE public.object_menu SET category_id=(v_next->>'category_id')::uuid,name=v_next->>'name',description=v_next->>'description',
          is_active=(v_next->>'is_active')::boolean,visibility=v_next->>'visibility',position=(v_next->>'position')::integer WHERE id=v_id;
      END IF;
    END IF;
  END LOOP;
  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
    v_id:=(v_entry->>'id')::uuid; v_menu_id:=(v_entry->>'menu_id')::uuid; v_changes:=v_entry->'changes'; v_expected:=v_entry->'expected';
    IF v_id IS NULL OR jsonb_typeof(v_entry) IS DISTINCT FROM 'object' OR NOT v_entry ? 'expected'
      OR jsonb_typeof(v_entry->'id') IS DISTINCT FROM 'string' OR jsonb_typeof(v_entry->'menu_id') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_expected) NOT IN ('object','null')
      OR jsonb_typeof(v_changes) IS DISTINCT FROM 'object' OR jsonb_typeof(v_entry->'links') IS DISTINCT FROM 'object'
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_entry) k WHERE k NOT IN ('id','menu_id','expected','changes','links'))
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_changes) k WHERE k NOT IN ('name','description','price','currency','kind_id','unit_id','media_id','is_available','position','section_id'))
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_entry->'links') k WHERE k NOT IN ('media','dietary','allergens','cuisines')) THEN
      RAISE EXCEPTION 'Champs de plat invalides.' USING ERRCODE='22023';
    END IF;
    FOR v_key,v_value IN SELECT key,value FROM jsonb_each(v_changes) LOOP
      IF (v_key IN ('name','currency') AND jsonb_typeof(v_value)<>'string')
        OR (v_key='is_available' AND jsonb_typeof(v_value)<>'boolean')
        OR (v_key IN ('kind_id','unit_id','media_id','section_id','description') AND jsonb_typeof(v_value) NOT IN ('string','null'))
        OR (v_key IN ('price','position') AND jsonb_typeof(v_value) NOT IN ('number','null'))
        OR (v_key='position' AND v_value<>'null'::jsonb AND (v_value#>>'{}') !~ '^-?[0-9]+$') THEN
        RAISE EXCEPTION 'Type de champ de plat invalide.' USING ERRCODE='22023';
      END IF;
    END LOOP;
    IF v_changes ? 'price' AND v_changes->'price'<>'null'::jsonb AND
      ((v_changes->>'price')::numeric<0 OR (v_changes->>'price')::numeric>9999999999.99 OR round((v_changes->>'price')::numeric,2)<>(v_changes->>'price')::numeric) THEN
      RAISE EXCEPTION 'Le prix doit être compris entre 0 et 9 999 999 999,99, avec deux décimales au maximum.' USING ERRCODE='22003';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.object_menu WHERE id=v_menu_id AND object_id=p_object_id)
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'deleted_menus') r WHERE r->>'id'=v_menu_id::text) THEN
      RAISE EXCEPTION 'Menu inaccessible.' USING ERRCODE='42501';
    END IF;
    IF v_changes->>'media_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.media WHERE id=(v_changes->>'media_id')::uuid AND object_id=p_object_id) THEN
      RAISE EXCEPTION 'Média du plat inaccessible.' USING ERRCODE='42501';
    END IF;
    SELECT to_jsonb(i) INTO v_current FROM public.object_menu_item i WHERE id=v_id;
    IF v_current IS NOT NULL AND v_current->>'menu_id' IS DISTINCT FROM v_menu_id::text THEN RAISE EXCEPTION 'Plat inaccessible.' USING ERRCODE='42501'; END IF;
    IF v_current IS NULL THEN
      IF v_expected<>'null'::jsonb THEN RAISE EXCEPTION 'Le plat a changé. Rechargez les menus.' USING ERRCODE='PT409'; END IF;
      INSERT INTO public.object_menu_item(id,menu_id,name,description,price,currency,kind_id,unit_id,media_id,is_available,position,section_id)
        VALUES(v_id,v_menu_id,v_changes->>'name',v_changes->>'description',(v_changes->>'price')::numeric,COALESCE(v_changes->>'currency','EUR'),
          (v_changes->>'kind_id')::uuid,(v_changes->>'unit_id')::uuid,(v_changes->>'media_id')::uuid,
          COALESCE((v_changes->>'is_available')::boolean,true),(v_changes->>'position')::integer,(v_changes->>'section_id')::uuid);
    ELSE
      IF v_expected<>'null'::jsonb AND (v_expected->>'id' IS DISTINCT FROM v_id::text OR v_expected->>'menu_id' IS DISTINCT FROM v_menu_id::text) THEN
        RAISE EXCEPTION 'Baseline de plat invalide.' USING ERRCODE='22023';
      END IF;
      FOR v_key,v_value IN SELECT key,value FROM jsonb_each(v_changes) LOOP
        IF v_current->v_key IS DISTINCT FROM v_value AND (v_expected='null'::jsonb OR v_current->v_key IS DISTINCT FROM v_expected->v_key) THEN
          RAISE EXCEPTION 'Le plat a changé. Rechargez les menus ; votre saisie est conservée.' USING ERRCODE='PT409';
        END IF;
      END LOOP;
      v_next:=v_current||v_changes;
      IF v_next IS DISTINCT FROM v_current THEN
        UPDATE public.object_menu_item SET name=v_next->>'name',description=v_next->>'description',price=(v_next->>'price')::numeric,currency=v_next->>'currency',
          kind_id=(v_next->>'kind_id')::uuid,unit_id=(v_next->>'unit_id')::uuid,media_id=(v_next->>'media_id')::uuid,
          is_available=(v_next->>'is_available')::boolean,position=(v_next->>'position')::integer,section_id=(v_next->>'section_id')::uuid WHERE id=v_id;
      END IF;
    END IF;
    FOR v_key,v_value IN SELECT key,value FROM jsonb_each(v_entry->'links') LOOP
      PERFORM internal.reconcile_menu_item_links(v_id,v_key,v_value);
    END LOOP;
  END LOOP;
  -- Only named deletions from the caller's baseline. A newly added child blocks deleting its menu.
  v_snapshot:=internal.object_menu_write_snapshot(p_object_id);
  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_payload->'deleted_items') LOOP
    v_id:=(v_entry->>'id')::uuid; v_menu_id:=(v_entry->>'menu_id')::uuid;
    IF v_id IS NULL OR v_menu_id IS NULL OR jsonb_typeof(v_entry->'id') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_entry->'menu_id') IS DISTINCT FROM 'string'
      OR NOT v_entry ? 'expected' OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_entry) k WHERE k NOT IN ('id','menu_id','expected')) THEN
      RAISE EXCEPTION 'Suppression de plat invalide.' USING ERRCODE='22023'; END IF;
    IF EXISTS(SELECT 1 FROM public.object_menu_item i JOIN public.object_menu m ON m.id=i.menu_id WHERE i.id=v_id AND (m.object_id<>p_object_id OR i.menu_id<>v_menu_id)) THEN
      RAISE EXCEPTION 'Plat inaccessible.' USING ERRCODE='42501'; END IF;
    v_current:=internal.object_menu_delete_bundle(v_snapshot,v_id,false);
    IF v_current IS NOT NULL AND v_current IS DISTINCT FROM v_entry->'expected' THEN RAISE EXCEPTION 'Le plat à supprimer a changé. Rechargez les menus.' USING ERRCODE='PT409'; END IF;
    DELETE FROM public.object_menu_item WHERE id=v_id AND menu_id=v_menu_id;
  END LOOP;
  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_payload->'deleted_menus') LOOP
    v_id:=(v_entry->>'id')::uuid;
    IF v_id IS NULL OR NOT v_entry ? 'expected' OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_entry) k WHERE k NOT IN ('id','expected')) THEN
      RAISE EXCEPTION 'Suppression de menu invalide.' USING ERRCODE='22023'; END IF;
    IF EXISTS(SELECT 1 FROM public.object_menu WHERE id=v_id AND object_id<>p_object_id) THEN RAISE EXCEPTION 'Menu inaccessible.' USING ERRCODE='42501'; END IF;
    v_current:=internal.object_menu_delete_bundle(v_snapshot,v_id,true);
    IF v_current IS NOT NULL AND v_current IS DISTINCT FROM v_entry->'expected' THEN RAISE EXCEPTION 'Le menu à supprimer a changé. Rechargez les menus.' USING ERRCODE='PT409'; END IF;
    DELETE FROM public.object_menu WHERE id=v_id AND object_id=p_object_id;
  END LOOP;
  v_result:=jsonb_build_object('success',true,'snapshot',internal.object_menu_write_snapshot(p_object_id));
  -- Empty patches only read the current state; they must not replay an old read receipt.
  IF jsonb_array_length(p_payload->'menus')+jsonb_array_length(p_payload->'items')+jsonb_array_length(p_payload->'deleted_menus')+jsonb_array_length(p_payload->'deleted_items')>0 THEN
    INSERT INTO internal.object_menu_write_receipt(object_id,principal,request_id,request_hash,request,result) VALUES(p_object_id,v_principal,v_request_id,v_hash,p_payload,v_result);
  END IF;
  RETURN v_result;
END;
$$;

DO $m_writer_recheck$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='api.save_object_menus(text,jsonb)'::regprocedure
    AND md5(replace(prosrc,E'\r\n',E'\n')) IN ('644b7f082141ec6c0cc3f0c807d67242','8f48b203e5004582232ed20659b9511c') AND prosecdef AND proowner='postgres'::regrole) THEN
    RAISE EXCEPTION 'R4 changed while preparing M';
  END IF;
END $m_writer_recheck$;
CREATE OR REPLACE FUNCTION api.save_object_menus(p_object_id text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal SET lock_timeout='5s' AS $$
BEGIN
  IF COALESCE(api.is_actor_persona(),false) THEN RAISE EXCEPTION 'Écriture réservée à l’office.' USING ERRCODE='42501'; END IF;
  PERFORM internal.workspace_assert_can_write_object(p_object_id);
  RETURN internal.apply_object_menus_patch(p_object_id,p_payload);
END;
$$;

CREATE OR REPLACE FUNCTION internal.assert_portal_menu_write(p_object_id text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,api,internal AS $$
DECLARE v_visibility jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE(api.is_actor_persona(),false)
    OR NOT EXISTS(SELECT 1 FROM api.current_user_portal_object_ids() id WHERE id=p_object_id)
    OR NOT EXISTS(SELECT 1 FROM public.object WHERE id=p_object_id AND object_type='RES') THEN
    RAISE EXCEPTION 'Cette publication est réservée au restaurateur de la fiche.' USING ERRCODE='42501';
  END IF;
  v_visibility:=api.get_portal_section_visibility(p_object_id);
  IF COALESCE(v_visibility->'masked_modules','[]'::jsonb) ? 'menus' OR 'menus'=ANY(api.actor_portal_floor_modules()) THEN
    RAISE EXCEPTION 'Les menus sont gérés par l’office.' USING ERRCODE='42501';
  END IF;
  IF NOT COALESCE((SELECT enabled FROM internal.portal_menu_write_configuration WHERE singleton),false)
    OR NOT has_function_privilege('authenticated','api.publish_portal_menus(text,jsonb,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'La publication des menus n’est pas encore ouverte.' USING ERRCODE='42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION internal.portal_menu_bundle_token(p_bundle jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
  SELECT encode(sha256(convert_to(p_bundle::text,'UTF8')),'hex');
$$;

-- Explicit projection, not SELECT *. Unknown future metadata cannot become actor-visible.
-- Bundle tokens cover the complete raw rows/children without disclosing hidden columns.
CREATE OR REPLACE FUNCTION internal.portal_menu_write_snapshot(p_snapshot jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,internal AS $$
DECLARE v_menus jsonb; v_items jsonb; v_result jsonb; v_key text;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',r->'id','object_id',r->'object_id','category_id',r->'category_id','name',r->'name',
    'description',r->'description','is_active',r->'is_active','visibility',r->'visibility','position',r->'position',
    'write_token',internal.portal_menu_bundle_token(internal.object_menu_delete_bundle(p_snapshot,(r->>'id')::uuid,true))) ORDER BY r->>'id'),'[]')
    INTO v_menus FROM jsonb_array_elements(p_snapshot->'menus') r WHERE r->>'visibility'='public';
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',r->'id','menu_id',r->'menu_id','name',r->'name','description',r->'description',
    'price',r->'price','currency',r->'currency','kind_id',r->'kind_id','unit_id',r->'unit_id','media_id','null'::jsonb,
    'is_available',r->'is_available','position',r->'position','section_id',r->'section_id',
    'write_token',internal.portal_menu_bundle_token(internal.object_menu_delete_bundle(p_snapshot,(r->>'id')::uuid,false))) ORDER BY r->>'id'),'[]')
    INTO v_items FROM jsonb_array_elements(p_snapshot->'items') r
    WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(v_menus) m WHERE m->>'id'=r->>'menu_id');
  v_result:=jsonb_build_object('menus',v_menus,'items',v_items);
  FOREACH v_key IN ARRAY ARRAY['media','dietary','allergens','cuisines'] LOOP
    IF v_key IN ('media','cuisines') THEN
      v_result:=v_result||jsonb_build_object(v_key,'[]'::jsonb);
      CONTINUE;
    END IF;
    v_result:=v_result||jsonb_build_object(v_key,COALESCE((SELECT jsonb_agg(
      CASE v_key WHEN 'media' THEN jsonb_build_object('menu_item_id',r->'menu_item_id','media_id',r->'media_id','position',r->'position')
        WHEN 'dietary' THEN jsonb_build_object('menu_item_id',r->'menu_item_id','dietary_tag_id',r->'dietary_tag_id')
        WHEN 'allergens' THEN jsonb_build_object('menu_item_id',r->'menu_item_id','allergen_id',r->'allergen_id')
        ELSE jsonb_build_object('menu_item_id',r->'menu_item_id','cuisine_type_id',r->'cuisine_type_id') END
      ORDER BY r->>'menu_item_id',COALESCE(r->>'media_id',r->>'dietary_tag_id',r->>'allergen_id',r->>'cuisine_type_id'))
      FROM jsonb_array_elements(p_snapshot->v_key) r WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(v_items) i WHERE i->>'id'=r->>'menu_item_id')),'[]'));
  END LOOP;
  RETURN v_result;
END;
$$;

-- Resolve only actor-visible expected tokens into the private R4 baseline, under its locks.
CREATE OR REPLACE FUNCTION internal.prepare_portal_menu_patch(p_object_id text,p_payload jsonb,p_snapshot jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,internal AS $$
DECLARE v_result jsonb:=p_payload; v_projection jsonb:=internal.portal_menu_write_snapshot(p_snapshot);
  v_key text; v_entry jsonb; v_entries jsonb; v_current jsonb; v_raw jsonb; v_expected jsonb; v_link text; v_bundle jsonb;
BEGIN
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR p_payload->>'write_contract' IS DISTINCT FROM 'menus-reconcile-v1'
    OR EXISTS(SELECT 1 FROM unnest(ARRAY['menus','items','deleted_menus','deleted_items']) k WHERE jsonb_typeof(p_payload->k) IS DISTINCT FROM 'array') THEN
    RAISE EXCEPTION 'Contrat de menus invalide.' USING ERRCODE='22023'; END IF;
  FOREACH v_key IN ARRAY ARRAY['menus','items','deleted_menus','deleted_items'] LOOP
    v_entries:='[]';
    FOR v_entry IN SELECT value FROM jsonb_array_elements(p_payload->v_key) LOOP
      IF jsonb_typeof(v_entry) IS DISTINCT FROM 'object' OR jsonb_typeof(v_entry->'id') IS DISTINCT FROM 'string' OR NOT v_entry ? 'expected' THEN
        RAISE EXCEPTION 'Ligne de menu invalide.' USING ERRCODE='22023'; END IF;
      IF v_key IN ('menus','deleted_menus') THEN
        SELECT r INTO v_raw FROM jsonb_array_elements(p_snapshot->'menus') r WHERE r->>'id'=v_entry->>'id';
        SELECT r INTO v_current FROM jsonb_array_elements(v_projection->'menus') r WHERE r->>'id'=v_entry->>'id';
      ELSE
        SELECT r INTO v_raw FROM jsonb_array_elements(p_snapshot->'items') r WHERE r->>'id'=v_entry->>'id';
        SELECT r INTO v_current FROM jsonb_array_elements(v_projection->'items') r WHERE r->>'id'=v_entry->>'id';
        IF jsonb_typeof(v_entry->'menu_id') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Menu du plat invalide.' USING ERRCODE='22023'; END IF;
        IF v_raw IS NOT NULL AND v_raw->>'menu_id' IS DISTINCT FROM v_entry->>'menu_id' THEN RAISE EXCEPTION 'Plat inaccessible.' USING ERRCODE='42501'; END IF;
        IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_snapshot->'menus') r WHERE r->>'id'=v_entry->>'menu_id' AND r->>'visibility' IS DISTINCT FROM 'public') THEN
          RAISE EXCEPTION 'Menu géré par l’office.' USING ERRCODE='42501'; END IF;
      END IF;
      IF v_raw IS NOT NULL AND v_current IS NULL THEN RAISE EXCEPTION 'Menu géré par l’office.' USING ERRCODE='42501'; END IF;
      v_expected:=CASE WHEN v_key IN ('deleted_menus','deleted_items') THEN v_entry#>'{expected,row}' ELSE v_entry->'expected' END;
      IF v_raw IS NOT NULL AND v_expected='null'::jsonb THEN
        RAISE EXCEPTION 'Cette ligne existe déjà. Rechargez les menus ; votre saisie est conservée.' USING ERRCODE='PT409'; END IF;
      IF v_expected IS DISTINCT FROM 'null'::jsonb AND v_raw IS NULL AND v_key IN ('menus','items') THEN
        RAISE EXCEPTION 'Cette ligne a changé. Rechargez les menus ; votre saisie est conservée.' USING ERRCODE='PT409'; END IF;
      IF v_raw IS NOT NULL AND v_expected IS DISTINCT FROM 'null'::jsonb THEN
        IF jsonb_typeof(v_expected) IS DISTINCT FROM 'object' OR v_expected->>'write_token' IS DISTINCT FROM v_current->>'write_token' THEN
          RAISE EXCEPTION 'Les menus ont changé. Rechargez la fiche ; votre saisie est conservée.' USING ERRCODE='PT409'; END IF;
        IF v_key IN ('deleted_menus','deleted_items') THEN
          v_bundle:=internal.object_menu_delete_bundle(p_snapshot,(v_entry->>'id')::uuid,v_key='deleted_menus');
          v_entry:=jsonb_set(v_entry,'{expected}',v_bundle);
        ELSE v_entry:=jsonb_set(v_entry,'{expected}',v_raw); END IF;
      END IF;
      IF v_key='menus' THEN
        IF jsonb_typeof(v_entry->'changes') IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_entry->'changes') k
          WHERE k NOT IN ('category_id','name','description','is_active','visibility','position'))
          OR ((v_entry->'changes') ? 'visibility' AND v_entry#>>'{changes,visibility}' IS DISTINCT FROM 'public')
          OR (v_raw IS NULL AND v_entry#>>'{changes,visibility}' IS DISTINCT FROM 'public') THEN
          RAISE EXCEPTION 'Champs de menu non ouverts au partenaire.' USING ERRCODE='42501'; END IF;
      ELSIF v_key='items' THEN
        IF jsonb_typeof(v_entry->'changes') IS DISTINCT FROM 'object' OR jsonb_typeof(v_entry->'links') IS DISTINCT FROM 'object'
          OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_entry->'changes') k WHERE k NOT IN ('name','description','price','currency','kind_id','unit_id','media_id','is_available','position','section_id'))
          OR ((v_entry->'changes') ? 'media_id' AND (v_raw IS NOT NULL OR v_entry#>'{changes,media_id}'<>'null'::jsonb)) THEN
          RAISE EXCEPTION 'Champs de plat non ouverts au partenaire.' USING ERRCODE='42501'; END IF;
        IF v_raw IS NULL AND NULLIF(btrim(v_entry#>>'{changes,name}'),'') IS NULL THEN
          RAISE EXCEPTION 'Nommez le nouveau plat avant de le publier.' USING ERRCODE='22023'; END IF;
        FOR v_link IN SELECT jsonb_object_keys(v_entry->'links') LOOP
          IF v_link NOT IN ('media','dietary','allergens','cuisines') OR (v_link IN ('media','cuisines')
            AND (v_raw IS NOT NULL OR v_entry#>ARRAY['links',v_link,'values'] IS DISTINCT FROM '[]'::jsonb)) THEN
            RAISE EXCEPTION 'Données associées gérées par l’office.' USING ERRCODE='42501'; END IF;
          IF v_raw IS NOT NULL THEN
            v_entry:=jsonb_set(v_entry,ARRAY['links',v_link,'expected'],COALESCE((SELECT jsonb_agg(r ORDER BY r->>'menu_item_id',COALESCE(r->>'media_id',r->>'dietary_tag_id',r->>'allergen_id',r->>'cuisine_type_id'))
              FROM jsonb_array_elements(p_snapshot->v_link) r WHERE r->>'menu_item_id'=v_entry->>'id'),'[]'));
          END IF;
        END LOOP;
      END IF;
      v_entries:=v_entries||jsonb_build_array(v_entry);
    END LOOP;
    v_result:=jsonb_set(v_result,ARRAY[v_key],v_entries);
  END LOOP;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION api.get_portal_menus_snapshot(p_object_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,api,internal SET TimeZone='UTC' SET lock_timeout='5s' AS $$
BEGIN
  PERFORM internal.assert_portal_menu_write(p_object_id);
  RETURN internal.portal_menu_write_snapshot(internal.object_menu_write_snapshot(p_object_id));
END;
$$;

CREATE OR REPLACE FUNCTION api.get_portal_menu_write_receipt(p_object_id text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,api,internal SET TimeZone='UTC' SET lock_timeout='5s' AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM internal.assert_portal_menu_write(p_object_id);
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR jsonb_typeof(p_payload->'request_id') IS DISTINCT FROM 'string'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k<>'request_id') THEN
    RAISE EXCEPTION 'Identifiant de demande invalide.' USING ERRCODE='22023'; END IF;
  v_id:=(p_payload->>'request_id')::uuid;
  RETURN jsonb_build_object('success',true,'known',EXISTS(SELECT 1 FROM internal.object_menu_write_receipt
    WHERE object_id=p_object_id AND principal='portal:'||auth.uid()::text AND request_id=v_id),
    'snapshot',internal.portal_menu_write_snapshot(internal.object_menu_write_snapshot(p_object_id)));
END;
$$;

CREATE OR REPLACE FUNCTION api.publish_portal_menus(p_object_id text,p_payload jsonb,p_extraction_operation_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal SET TimeZone='UTC' SET lock_timeout='5s' AS $$
DECLARE v_id uuid; v_request jsonb; v_receipt internal.object_menu_write_receipt%ROWTYPE; v_snapshot jsonb;
  v_payload jsonb; v_result jsonb; v_previous jsonb; v_menu_ids uuid[]; v_draft_version integer; v_extraction_target uuid;
BEGIN
  PERFORM internal.assert_portal_menu_write(p_object_id);
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR jsonb_typeof(p_payload->'request_id') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'Identifiant de demande requis.' USING ERRCODE='22023'; END IF;
  v_id:=(p_payload->>'request_id')::uuid;
  PERFORM 1 FROM public.object WHERE id=p_object_id FOR UPDATE;
  v_request:=jsonb_build_object('payload',p_payload,'extraction_operation_id',p_extraction_operation_id);
  SELECT * INTO v_receipt FROM internal.object_menu_write_receipt WHERE object_id=p_object_id AND principal='portal:'||auth.uid()::text AND request_id=v_id;
  IF FOUND THEN
    IF v_receipt.request IS DISTINCT FROM v_request THEN RAISE EXCEPTION 'Cette demande correspond à un autre enregistrement.' USING ERRCODE='22023'; END IF;
    RETURN jsonb_build_object('success',true,'request_id',v_id,'replayed',true,'snapshot',internal.portal_menu_write_snapshot(internal.object_menu_write_snapshot(p_object_id)));
  END IF;
  IF p_extraction_operation_id IS NOT NULL THEN
    IF jsonb_typeof(p_payload->'extraction_draft_version') IS DISTINCT FROM 'number'
      OR COALESCE(p_payload->>'extraction_draft_version','') !~ '^[0-9]+$'
      OR (p_payload->>'extraction_draft_version')::numeric>2147483647 THEN
      RAISE EXCEPTION 'Rechargez le brouillon d’extraction avant de le publier.' USING ERRCODE='22023'; END IF;
    v_draft_version:=(p_payload->>'extraction_draft_version')::integer;
    IF to_regprocedure('internal.assert_menu_extraction_publication(uuid,text,integer)') IS NULL
      OR to_regprocedure('internal.record_menu_extraction_publication(uuid,text,jsonb,uuid[])') IS NULL THEN
      RAISE EXCEPTION 'La publication de cette extraction n’est pas disponible.' USING ERRCODE='22023'; END IF;
    -- Common lock order: object -> extraction operation -> source/document -> menus.
    v_previous:=internal.assert_menu_extraction_publication(p_extraction_operation_id,p_object_id,v_draft_version);
    IF v_previous IS NOT NULL THEN
      IF v_previous->>'request_id' IS DISTINCT FROM v_id::text THEN
        RAISE EXCEPTION 'Cette extraction est déjà publiée. Rechargez les menus pour préparer une correction manuelle.' USING ERRCODE='PT409'; END IF;
      RETURN jsonb_build_object('success',true,'request_id',v_id,'replayed',true,'snapshot',internal.portal_menu_write_snapshot(internal.object_menu_write_snapshot(p_object_id)));
    END IF;
    -- E has locked its operation and target. Resolve deletion ownership from the database,
    -- never from a posted menu_id, before the shared writer can change any row.
    SELECT COALESCE(target_menu_id,(result#>>'{menu,recordId}')::uuid) INTO v_extraction_target
      FROM internal.menu_extraction_operation
      WHERE id=p_extraction_operation_id AND object_id=p_object_id AND created_by=auth.uid();
    IF v_extraction_target IS NULL OR jsonb_typeof(p_payload->'deleted_menus') IS DISTINCT FROM 'array'
      OR jsonb_array_length(p_payload->'deleted_menus')<>0
      OR jsonb_typeof(p_payload->'deleted_items') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Une extraction ne peut pas supprimer un menu.' USING ERRCODE='22023';
    END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'deleted_items') d
      LEFT JOIN public.object_menu_item i ON i.id=(d->>'id')::uuid
      WHERE i.id IS NULL OR i.menu_id<>v_extraction_target) THEN
      RAISE EXCEPTION 'Une extraction ne peut supprimer que les plats de sa cible exacte.' USING ERRCODE='22023';
    END IF;
  ELSIF p_payload ? 'extraction_draft_version' THEN
    RAISE EXCEPTION 'Une version de brouillon nécessite son opération d’extraction.' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.object_menu WHERE object_id=p_object_id ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.object_menu_item WHERE menu_id IN(SELECT id FROM public.object_menu WHERE object_id=p_object_id) ORDER BY id FOR UPDATE;
  v_snapshot:=internal.object_menu_write_snapshot(p_object_id);
  v_payload:=internal.prepare_portal_menu_patch(p_object_id,p_payload-'extraction_draft_version',v_snapshot);
  v_result:=internal.apply_object_menus_patch(p_object_id,v_payload);
  v_result:=jsonb_build_object('success',true,'request_id',v_id,'snapshot',internal.portal_menu_write_snapshot(v_result->'snapshot'));
  IF p_extraction_operation_id IS NOT NULL THEN
    SELECT COALESCE(array_agg(DISTINCT requested.id ORDER BY requested.id),'{}'::uuid[]) INTO v_menu_ids FROM (
      SELECT (r->>'id')::uuid AS id FROM jsonb_array_elements(p_payload->'menus') r
      UNION SELECT (r->>'menu_id')::uuid FROM jsonb_array_elements(p_payload->'items') r
    ) requested WHERE EXISTS(SELECT 1 FROM public.object_menu m WHERE m.id=requested.id AND m.object_id=p_object_id AND m.visibility='public');
    PERFORM internal.record_menu_extraction_publication(p_extraction_operation_id,p_object_id,v_result,v_menu_ids);
  END IF;
  INSERT INTO internal.object_menu_write_receipt(object_id,principal,request_id,request_hash,request,result)
    VALUES(p_object_id,'portal:'||auth.uid()::text,v_id,md5(v_request::text),v_request,v_result);
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION internal.apply_object_menus_patch(text,jsonb),internal.assert_portal_menu_write(text),internal.portal_menu_bundle_token(jsonb),internal.portal_menu_write_snapshot(jsonb),internal.prepare_portal_menu_patch(text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION api.get_portal_menus_snapshot(text),api.get_portal_menu_write_receipt(text,jsonb),api.publish_portal_menus(text,jsonb,uuid) FROM PUBLIC,anon,authenticated;
-- Office keeps its existing façade and canonical gate. Actor activation is a separate cutover.
REVOKE ALL ON FUNCTION api.save_object_menus(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION api.save_object_menus(text,jsonb) TO authenticated,service_role;
COMMIT;
NOTIFY pgrst,'reload schema';
