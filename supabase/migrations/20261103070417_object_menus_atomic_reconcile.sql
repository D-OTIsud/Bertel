-- R4 preparation: replace the office multi-request delete/reinsert saver.
-- The public reader/JSON contract is deliberately untouched. Raw table DML closes separately.
BEGIN;
SET LOCAL lock_timeout='5s';

-- A receipt belongs to one explicit intent, never to the semantic payload's hash.
-- retaining it prevents a retry from recreating a row subsequently deleted elsewhere.
CREATE TABLE IF NOT EXISTS internal.object_menu_write_receipt(
  object_id text NOT NULL REFERENCES public.object(id) ON DELETE CASCADE,
  principal text NOT NULL,
  request_id uuid NOT NULL,
  request_hash text NOT NULL,
  request jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(object_id,principal,request_id)
);
-- Preserve receipts from an earlier preparation, but never alias a later intention to them.
ALTER TABLE internal.object_menu_write_receipt ADD COLUMN IF NOT EXISTS request_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE internal.object_menu_write_receipt DROP CONSTRAINT IF EXISTS object_menu_write_receipt_pkey;
ALTER TABLE internal.object_menu_write_receipt ADD PRIMARY KEY(object_id,principal,request_id);
ALTER TABLE internal.object_menu_write_receipt ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal.object_menu_write_receipt FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION internal.object_menu_write_snapshot(p_object_id text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
  WITH menus AS (SELECT m.* FROM public.object_menu m WHERE m.object_id=p_object_id),
  items AS (SELECT i.* FROM public.object_menu_item i JOIN menus m ON m.id=i.menu_id)
  SELECT jsonb_build_object(
    'menus',COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM menus m),'[]'),
    'items',COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM items i),'[]'),
    'media',COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.menu_item_id,l.media_id) FROM public.object_menu_item_media l JOIN items i ON i.id=l.menu_item_id),'[]'),
    'dietary',COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.menu_item_id,l.dietary_tag_id) FROM public.object_menu_item_dietary_tag l JOIN items i ON i.id=l.menu_item_id),'[]'),
    'allergens',COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.menu_item_id,l.allergen_id) FROM public.object_menu_item_allergen l JOIN items i ON i.id=l.menu_item_id),'[]'),
    'cuisines',COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.menu_item_id,l.cuisine_type_id) FROM public.object_menu_item_cuisine_type l JOIN items i ON i.id=l.menu_item_id),'[]'));
$$;

CREATE OR REPLACE FUNCTION internal.object_menu_delete_bundle(p_snapshot jsonb,p_id uuid,p_menu boolean)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE v_result jsonb; v_ids jsonb; v_key text;
BEGIN
  IF p_menu THEN
    SELECT COALESCE(jsonb_agg(r ORDER BY r->>'id'),'[]') INTO v_ids
      FROM jsonb_array_elements(p_snapshot->'items') r WHERE r->>'menu_id'=p_id::text;
    SELECT jsonb_build_object('row',r,'items',v_ids) INTO v_result
      FROM jsonb_array_elements(p_snapshot->'menus') r WHERE r->>'id'=p_id::text;
  ELSE
    SELECT jsonb_build_object('row',r) INTO v_result
      FROM jsonb_array_elements(p_snapshot->'items') r WHERE r->>'id'=p_id::text;
    v_ids:=jsonb_build_array(jsonb_build_object('id',p_id));
  END IF;
  IF v_result IS NULL THEN RETURN NULL; END IF;
  FOREACH v_key IN ARRAY ARRAY['media','dietary','allergens','cuisines'] LOOP
    v_result:=v_result||jsonb_build_object(v_key,COALESCE((
      SELECT jsonb_agg(r ORDER BY r->>'menu_item_id',COALESCE(r->>'media_id',r->>'dietary_tag_id',r->>'allergen_id',r->>'cuisine_type_id'))
      FROM jsonb_array_elements(p_snapshot->v_key) r
      WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(v_ids) i WHERE i->>'id'=r->>'menu_item_id')),'[]'));
  END LOOP;
  RETURN v_result;
END;
$$;

-- A bounded helper for the four existing link tables, never a caller-supplied SQL identifier.
CREATE OR REPLACE FUNCTION internal.reconcile_menu_item_links(p_item_id uuid,p_key text,p_patch jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE v_table text; v_column text; v_current jsonb; v_desired jsonb; v_projection jsonb; v_row jsonb;
BEGIN
  SELECT t,c INTO v_table,v_column FROM (VALUES
    ('media','object_menu_item_media','media_id'),('dietary','object_menu_item_dietary_tag','dietary_tag_id'),
    ('allergens','object_menu_item_allergen','allergen_id'),('cuisines','object_menu_item_cuisine_type','cuisine_type_id')) x(k,t,c) WHERE k=p_key;
  IF v_table IS NULL OR jsonb_typeof(p_patch) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_patch->'expected') IS DISTINCT FROM 'array' OR jsonb_typeof(p_patch->'values') IS DISTINCT FROM 'array'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE k NOT IN ('expected','values')) THEN
    RAISE EXCEPTION 'Contrat de liens de menu invalide.' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_patch->'values') r
      WHERE jsonb_typeof(r) IS DISTINCT FROM 'object' OR jsonb_typeof(r->v_column) IS DISTINCT FROM 'string'
        OR (r->>v_column) !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        OR (p_key='media' AND (jsonb_typeof(r->'position') IS DISTINCT FROM 'number' OR (r->>'position') !~ '^[0-9]+$'))
        OR EXISTS(SELECT 1 FROM jsonb_object_keys(r) k WHERE k<>v_column AND NOT(p_key='media' AND k='position')))
    OR (SELECT count(*) FROM jsonb_array_elements(p_patch->'values'))<>(SELECT count(DISTINCT r->>v_column) FROM jsonb_array_elements(p_patch->'values') r) THEN
    RAISE EXCEPTION 'Références de menu invalides ou répétées.' USING ERRCODE='22023';
  END IF;
  IF p_key='media' AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_patch->'values') r
      WHERE NOT EXISTS(SELECT 1 FROM public.media md JOIN public.object_menu_item i ON i.id=p_item_id
        JOIN public.object_menu m ON m.id=i.menu_id WHERE md.id=(r->>'media_id')::uuid AND md.object_id=m.object_id)) THEN
    RAISE EXCEPTION 'Média du plat inaccessible.' USING ERRCODE='42501';
  END IF;
  EXECUTE format('SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY %I),''[]'') FROM public.%I l WHERE menu_item_id=$1',v_column,v_table)
    INTO v_current USING p_item_id;
  SELECT COALESCE(jsonb_agg(r ORDER BY r->>v_column),'[]') INTO v_desired FROM jsonb_array_elements(p_patch->'values') r;
  SELECT COALESCE(jsonb_agg((jsonb_build_object(v_column,r->v_column)||CASE WHEN p_key='media' THEN jsonb_build_object('position',r->'position') ELSE '{}'::jsonb END) ORDER BY r->>v_column),'[]')
    INTO v_projection FROM jsonb_array_elements(v_current) r;
  -- Desired projection confirms a lost response without recreating links or timestamps.
  IF v_projection=v_desired THEN RETURN; END IF;
  IF v_current IS DISTINCT FROM p_patch->'expected' THEN
    RAISE EXCEPTION 'Les liens du plat ont changé. Rechargez les menus ; votre saisie est conservée.' USING ERRCODE='PT409';
  END IF;
  EXECUTE format('DELETE FROM public.%I l WHERE menu_item_id=$1 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements($2) r WHERE (r->>%L)::uuid=l.%I)',v_table,v_column,v_column)
    USING p_item_id,v_desired;
  FOR v_row IN SELECT value FROM jsonb_array_elements(v_desired) LOOP
    IF p_key='media' THEN
      EXECUTE format('INSERT INTO public.%I(menu_item_id,%I,position) VALUES($1,$2,$3) ON CONFLICT(menu_item_id,%I) DO UPDATE SET position=EXCLUDED.position WHERE %I.position IS DISTINCT FROM EXCLUDED.position',v_table,v_column,v_column,v_table)
        USING p_item_id,(v_row->>v_column)::uuid,(v_row->>'position')::integer;
    ELSE
      EXECUTE format('INSERT INTO public.%I(menu_item_id,%I) VALUES($1,$2) ON CONFLICT DO NOTHING',v_table,v_column)
        USING p_item_id,(v_row->>v_column)::uuid;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION api.save_object_menus(p_object_id text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal SET lock_timeout='5s' AS $$
DECLARE v_entry jsonb; v_changes jsonb; v_expected jsonb; v_current jsonb; v_next jsonb;
  v_id uuid; v_menu_id uuid; v_key text; v_value jsonb; v_snapshot jsonb;
  v_hash text; v_principal text; v_request_id uuid; v_receipt internal.object_menu_write_receipt%ROWTYPE; v_result jsonb;
BEGIN
  IF COALESCE(api.is_actor_persona(),false) THEN RAISE EXCEPTION 'Écriture réservée à l’office.' USING ERRCODE='42501'; END IF;
  PERFORM internal.workspace_assert_can_write_object(p_object_id);
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

-- A delayed client resolves a receipt without replaying its old write intention.
CREATE OR REPLACE FUNCTION api.get_object_menu_write_receipt(p_object_id text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,api,internal SET lock_timeout='5s' AS $$
DECLARE v_id uuid;
BEGIN
  IF COALESCE(api.is_actor_persona(),false) THEN RAISE EXCEPTION 'Lecture réservée à l’office.' USING ERRCODE='42501'; END IF;
  PERFORM internal.workspace_assert_can_write_object(p_object_id);
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR jsonb_typeof(p_payload->'request_id') IS DISTINCT FROM 'string'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k<>'request_id') THEN
    RAISE EXCEPTION 'Identifiant de demande invalide.' USING ERRCODE='22023'; END IF;
  v_id:=(p_payload->>'request_id')::uuid;
  RETURN jsonb_build_object('success',true,'known',EXISTS(SELECT 1 FROM internal.object_menu_write_receipt
    WHERE object_id=p_object_id AND principal=COALESCE(auth.uid()::text,'service_role') AND request_id=v_id),
    'snapshot',internal.object_menu_write_snapshot(p_object_id));
END;
$$;

REVOKE ALL ON FUNCTION internal.object_menu_write_snapshot(text),internal.object_menu_delete_bundle(jsonb,uuid,boolean),internal.reconcile_menu_item_links(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION api.save_object_menus(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.save_object_menus(text,jsonb) TO authenticated,service_role;
REVOKE ALL ON FUNCTION api.get_object_menu_write_receipt(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.get_object_menu_write_receipt(text,jsonb) TO authenticated,service_role;
COMMIT;
NOTIFY pgrst,'reload schema';
