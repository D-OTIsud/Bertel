-- FOR REVIEW ONLY: final reconstructed office writer, not a standalone deployment.
CREATE OR REPLACE FUNCTION api.save_object_gallery(p_object_id text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,auth,pg_temp AS $function$
DECLARE v_row jsonb;v_changes jsonb;v_expected jsonb;v_id uuid;v_seen uuid[]:=ARRAY[]::uuid[];
 v_current public.media%ROWTYPE;v_next public.media%ROWTYPE;v_json jsonb;v_key text;
 v_before integer;v_published integer;v_rows jsonb;v_request_id uuid;v_receipt internal.gallery_write_receipt%ROWTYPE;v_main public.media%ROWTYPE;
 v_allowed text[]:=ARRAY['media_type_id','title','title_i18n','description','description_i18n','credit','url',
   'is_main','is_published','position','rights_expires_at','visibility','width','height','kind'];
BEGIN
 IF auth.uid() IS NULL OR api.is_actor_persona() OR NOT COALESCE(api.user_can_write_object_canonical(p_object_id),false) THEN
  RAISE EXCEPTION 'Droits de gestion de galerie insuffisants' USING ERRCODE='42501';
 END IF;
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR p_payload->>'write_contract' IS DISTINCT FROM 'gallery-patch-v1'
   OR jsonb_typeof(p_payload->'rows') IS DISTINCT FROM 'array' OR jsonb_typeof(p_payload->'deleted') IS DISTINCT FROM 'array'
   OR COALESCE(p_payload->>'request_id','')!~*'^[0-9a-f-]{36}$'
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN ('write_contract','request_id','rows','deleted')) THEN
  RAISE EXCEPTION 'Rechargez la galerie avant de l’enregistrer.' USING ERRCODE='22023';
 END IF;
 PERFORM 1 FROM public.object WHERE id=p_object_id AND is_test=(SELECT api.current_user_test_realm()) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Fiche introuvable dans cet espace' USING ERRCODE='42501'; END IF;
 v_request_id:=(p_payload->>'request_id')::uuid;
 SELECT * INTO v_receipt FROM internal.gallery_write_receipt
  WHERE object_id=p_object_id AND user_id=auth.uid() AND request_id=v_request_id;
 IF FOUND THEN
  IF v_receipt.request IS DISTINCT FROM p_payload THEN
   RAISE EXCEPTION 'Identifiant de requête réutilisé avec une autre modification' USING ERRCODE='22023';
  END IF;
  -- Return CURRENT state: a delayed retry must not undo a later withdrawal/edit.
  SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.position,m.created_at,m.id),'[]') INTO v_rows
   FROM public.media m WHERE m.object_id=p_object_id AND m.place_id IS NULL;
  RETURN jsonb_build_object('success',true,'snapshot',v_rows,'replayed',true);
 END IF;
 v_before:=internal.gallery_photo_usage(p_object_id);
 v_published:=internal.gallery_published_photo_count(p_object_id);
 FOR v_row IN SELECT value FROM jsonb_array_elements(p_payload->'deleted') LOOP
  IF jsonb_typeof(v_row) IS DISTINCT FROM 'object' OR COALESCE(v_row->>'id','')!~*'^[0-9a-f-]{36}$'
    OR jsonb_typeof(v_row->'expected') IS DISTINCT FROM 'object'
    OR NOT (v_row->'expected' ?& ARRAY['id','updated_at'])
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_row) k WHERE k NOT IN ('id','expected')) THEN
   RAISE EXCEPTION 'Suppression de média invalide' USING ERRCODE='22023';
  END IF;
  v_id:=(v_row->>'id')::uuid;
  IF v_id=ANY(v_seen) THEN RAISE EXCEPTION 'Média modifié et supprimé' USING ERRCODE='22023'; END IF;
  v_seen:=array_append(v_seen,v_id);
  SELECT * INTO v_current FROM public.media WHERE id=v_id FOR UPDATE;
  IF NOT FOUND THEN CONTINUE; END IF;
  IF v_current.object_id IS DISTINCT FROM p_object_id OR v_current.place_id IS NOT NULL THEN
   RAISE EXCEPTION 'Média hors de la galerie' USING ERRCODE='42501';
  END IF;
  v_json:=to_jsonb(v_current);
  IF v_row->'expected'->>'id' IS DISTINCT FROM v_id::text OR EXISTS(
     SELECT 1 FROM jsonb_each(v_row->'expected') x WHERE v_json->x.key IS DISTINCT FROM x.value) THEN
   RAISE EXCEPTION 'La galerie a changé. Rechargez-la avant de retirer le média.' USING ERRCODE='PT409';
  END IF;
  DELETE FROM public.media WHERE id=v_id;
 END LOOP;
 -- Explicit demotions must happen before promotions, regardless of client row order.
 -- Keep the original request/receipt unchanged and preserve order within each group.
 FOR v_row IN SELECT item FROM jsonb_array_elements(p_payload->'rows') WITH ORDINALITY incoming(item,n)
  ORDER BY CASE WHEN item->'changes'->'is_main'='false'::jsonb THEN 0 ELSE 1 END,n LOOP
  IF jsonb_typeof(v_row) IS DISTINCT FROM 'object' OR COALESCE(v_row->>'id','')!~*'^[0-9a-f-]{36}$'
    OR jsonb_typeof(v_row->'changes') IS DISTINCT FROM 'object'
    OR NOT (v_row ? 'expected') OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_row) k WHERE k NOT IN ('id','expected','changes')) THEN
   RAISE EXCEPTION 'Modification de média invalide' USING ERRCODE='22023';
  END IF;
  v_id:=(v_row->>'id')::uuid;
  IF v_id=ANY(v_seen) THEN RAISE EXCEPTION 'Média répété' USING ERRCODE='22023'; END IF;
  v_seen:=array_append(v_seen,v_id);v_changes:=v_row->'changes';v_expected:=v_row->'expected';
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(v_changes) k WHERE NOT (k=ANY(v_allowed))) THEN
   RAISE EXCEPTION 'Champ média non autorisé' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_current FROM public.media WHERE id=v_id FOR UPDATE;
  IF FOUND THEN
   IF v_current.object_id IS DISTINCT FROM p_object_id OR v_current.place_id IS NOT NULL THEN
    RAISE EXCEPTION 'Média hors de la galerie' USING ERRCODE='42501';
   END IF;
   v_json:=to_jsonb(v_current);
   -- A lost acknowledgement may be retried, without touching another field changed meanwhile.
   IF NOT EXISTS(SELECT 1 FROM jsonb_each(v_changes) x WHERE v_json->x.key IS DISTINCT FROM x.value) THEN CONTINUE; END IF;
   IF v_changes ? 'url' AND v_changes->'url' IS DISTINCT FROM v_json->'url'
      AND (jsonb_typeof(v_changes->'url') IS DISTINCT FROM 'string' OR COALESCE(v_changes->>'url','')!~*'^https?://[^[:space:]/?#]+([/?#][^[:space:]]*)?$') THEN
    RAISE EXCEPTION 'Saisissez une URL HTTP ou HTTPS absolue.' USING ERRCODE='22023';
   END IF;
   IF jsonb_typeof(v_expected) IS DISTINCT FROM 'object' OR v_expected->>'id' IS DISTINCT FROM v_id::text
     OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_changes) k WHERE NOT (v_expected ? k))
     OR EXISTS(SELECT 1 FROM jsonb_each(v_expected) x WHERE v_json->x.key IS DISTINCT FROM x.value) THEN
    RAISE EXCEPTION 'La galerie a changé. Rechargez-la avant de réessayer.' USING ERRCODE='PT409';
   END IF;
   v_next:=jsonb_populate_record(v_current,v_changes);
   IF v_next.is_main AND (NOT v_current.is_main OR v_current.media_type_id IS DISTINCT FROM v_next.media_type_id) THEN
    FOR v_main IN SELECT * FROM public.media WHERE object_id=p_object_id AND place_id IS NULL
       AND media_type_id=v_next.media_type_id AND is_main AND id<>v_id LOOP
     IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'rows') x
        WHERE x->>'id'=v_main.id::text AND x->'changes'->'is_main'='false'::jsonb
        AND jsonb_typeof(x->'expected')='object' AND x->'expected'->>'id'=v_main.id::text
        AND NOT EXISTS(SELECT 1 FROM jsonb_each(x->'expected') e WHERE to_jsonb(v_main)->e.key IS DISTINCT FROM e.value)) THEN
      RAISE EXCEPTION 'Le média principal a changé. Rechargez la galerie.' USING ERRCODE='PT409';
     END IF;
    END LOOP;
   END IF;
   UPDATE public.media SET media_type_id=v_next.media_type_id,title=v_next.title,title_i18n=v_next.title_i18n,
    description=v_next.description,description_i18n=v_next.description_i18n,credit=v_next.credit,url=v_next.url,
    is_main=v_next.is_main,is_published=v_next.is_published,position=v_next.position,rights_expires_at=v_next.rights_expires_at,
    visibility=v_next.visibility,width=v_next.width,height=v_next.height,kind=v_next.kind WHERE id=v_id;
  ELSE
   IF jsonb_typeof(v_expected) IS DISTINCT FROM 'null' OR NOT (v_changes ?& ARRAY['media_type_id','url']) THEN
    RAISE EXCEPTION 'Le média a changé. Rechargez la galerie.' USING ERRCODE='PT409';
   END IF;
   IF jsonb_typeof(v_changes->'url') IS DISTINCT FROM 'string' OR COALESCE(v_changes->>'url','')!~*'^https?://[^[:space:]/?#]+([/?#][^[:space:]]*)?$' THEN
    RAISE EXCEPTION 'Saisissez une URL HTTP ou HTTPS absolue.' USING ERRCODE='22023';
   END IF;
   v_next:=jsonb_populate_record(NULL::public.media,v_changes);
   IF v_next.is_main AND EXISTS(SELECT 1 FROM public.media m WHERE m.object_id=p_object_id AND m.place_id IS NULL
       AND m.media_type_id=v_next.media_type_id AND m.is_main AND NOT EXISTS(
        SELECT 1 FROM jsonb_array_elements(p_payload->'rows') x WHERE x->>'id'=m.id::text
         AND x->'changes'->'is_main'='false'::jsonb AND jsonb_typeof(x->'expected')='object'
         AND x->'expected'->>'id'=m.id::text AND NOT EXISTS(
          SELECT 1 FROM jsonb_each(x->'expected') e WHERE to_jsonb(m)->e.key IS DISTINCT FROM e.value))) THEN
    RAISE EXCEPTION 'Le média principal a changé. Rechargez la galerie.' USING ERRCODE='PT409';
   END IF;
   INSERT INTO public.media(id,object_id,media_type_id,title,title_i18n,description,description_i18n,credit,url,
      is_main,is_published,position,rights_expires_at,visibility,width,height,kind)
    VALUES(v_id,p_object_id,v_next.media_type_id,v_next.title,v_next.title_i18n,v_next.description,v_next.description_i18n,
      v_next.credit,v_next.url,COALESCE(v_next.is_main,false),COALESCE(v_next.is_published,true),COALESCE(v_next.position,0),
      v_next.rights_expires_at,v_next.visibility,v_next.width,v_next.height,v_next.kind);
  END IF;
 END LOOP;
 PERFORM internal.gallery_assert_photo_capacity(p_object_id,v_before,v_published);
 SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.position,m.created_at,m.id),'[]') INTO v_rows
  FROM public.media m WHERE m.object_id=p_object_id AND m.place_id IS NULL;
 INSERT INTO internal.gallery_write_receipt(object_id,user_id,request_id,request)
  VALUES(p_object_id,auth.uid(),v_request_id,p_payload);
 RETURN jsonb_build_object('success',true,'snapshot',v_rows,'replayed',false);
END;
$function$;
