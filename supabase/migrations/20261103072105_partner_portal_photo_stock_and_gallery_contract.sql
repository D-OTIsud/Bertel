-- R5 preparation. Apply after the existing photo-B migration, before gallery cutover.
-- Only private upload receipts gain slot metadata. Public object API shape is unchanged.
-- Direct-DML restrictions are a separate cutover, after office/portal clients are converted.
BEGIN;
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='15s';
SET LOCAL idle_in_transaction_session_timeout='20s';

CREATE INDEX IF NOT EXISTS idx_ref_document_portal_photo_object
 ON public.ref_document ((extra->>'object_id')) WHERE extra->>'source'='portal_photo';

CREATE TABLE IF NOT EXISTS internal.gallery_write_receipt(
 object_id text NOT NULL REFERENCES public.object(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 request jsonb NOT NULL,
 completed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(object_id,user_id,request_id)
);
ALTER TABLE internal.gallery_write_receipt ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal.gallery_write_receipt FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION internal.gallery_published_photo_count(p_object_id text)
RETURNS integer LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $function$
 SELECT count(*)::integer FROM public.media m JOIN public.ref_code_media_type t ON t.id=m.media_type_id
 WHERE m.object_id=p_object_id AND m.place_id IS NULL AND t.code='photo'
   AND m.is_published AND COALESCE(m.visibility,'public')='public';
$function$;

CREATE OR REPLACE FUNCTION internal.gallery_photo_reservations(p_object_id text)
RETURNS TABLE(document_id uuid,replace_media_id uuid)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $function$
 SELECT d.id, CASE WHEN d.extra->>'slot_replace_media_id' ~* '^[0-9a-f-]{36}$'
                  THEN (d.extra->>'slot_replace_media_id')::uuid END
 FROM public.ref_document d
 CROSS JOIN LATERAL (
   SELECT COALESCE(bool_or(pc.status='pending'),false) AS pending,
          COALESCE(bool_or(pc.status<>'pending' AND pc.submitted_at>=
            COALESCE(NULLIF(d.extra->>'slot_reserved_at','')::timestamptz,d.created_at)),false) AS resolved
   FROM public.pending_change pc
   WHERE pc.object_id=p_object_id AND pc.metadata->>'rpc'='publish_portal_photo_additions'
     AND EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(pc.payload->'additions','[]')) a
                WHERE a->>'upload_id'=d.id::text)
 ) proposal
 WHERE d.extra->>'source'='portal_photo' AND d.extra->>'object_id'=p_object_id
   AND d.extra->>'published_media_id' IS NULL
   AND COALESCE(d.extra->>'slot_state','uploaded') NOT IN ('cancelled','consumed')
   AND (proposal.pending OR (NOT proposal.resolved AND
       COALESCE(NULLIF(d.extra->>'slot_reserved_until','')::timestamptz,d.created_at+interval '24 hours')>now()));
$function$;

CREATE OR REPLACE FUNCTION internal.gallery_photo_usage(p_object_id text)
RETURNS integer LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public,internal AS $function$
 SELECT internal.gallery_published_photo_count(p_object_id)+COALESCE(sum(
   CASE WHEN r.replace_media_id IS NOT NULL AND EXISTS(
     SELECT 1 FROM public.media m JOIN public.ref_code_media_type t ON t.id=m.media_type_id
     WHERE m.id=r.replace_media_id AND m.object_id=p_object_id AND m.place_id IS NULL
       AND t.code='photo' AND m.is_published AND COALESCE(m.visibility,'public')='public')
   THEN 0 ELSE 1 END),0)::integer
 FROM internal.gallery_photo_reservations(p_object_id) r;
$function$;

CREATE OR REPLACE FUNCTION internal.gallery_assert_photo_capacity(
 p_object_id text,p_previous_usage integer,p_previous_published integer)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,internal AS $function$
BEGIN
 -- Historical galleries above twenty are preserved, but cannot grow.
 IF internal.gallery_photo_usage(p_object_id)>greatest(20,p_previous_usage)
    OR internal.gallery_published_photo_count(p_object_id)>greatest(20,p_previous_published) THEN
  RAISE EXCEPTION 'Votre galerie peut contenir vingt photos. Retirez une photo ou choisissez un remplacement.' USING ERRCODE='PT409',DETAIL='photo_limit';
 END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION api.reserve_portal_photo_upload(
 p_object_id text,p_upload_id uuid,p_replace_media_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,auth,pg_temp AS $function$
DECLARE v_actor uuid;v_doc public.ref_document%ROWTYPE;v_before integer;v_published integer;v_path text;v_pending boolean;
BEGIN
 v_actor:=internal.portal_photo_assert_actor(p_object_id);
 IF auth.uid() IS NULL OR p_upload_id IS NULL THEN RAISE EXCEPTION 'Dépôt invalide' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM public.object WHERE id=p_object_id FOR UPDATE;
 v_before:=internal.gallery_photo_usage(p_object_id);
 v_published:=internal.gallery_published_photo_count(p_object_id);
 SELECT * INTO v_doc FROM public.ref_document WHERE id=p_upload_id FOR UPDATE;
 IF FOUND THEN
  IF v_doc.extra->>'source' IS DISTINCT FROM 'portal_photo' OR v_doc.extra->>'object_id' IS DISTINCT FROM p_object_id
    OR v_doc.extra->>'published_media_id' IS NOT NULL OR v_doc.access_scope IS DISTINCT FROM 'crm_private'
    OR v_doc.storage_bucket IS DISTINCT FROM 'actor-documents'
    OR v_doc.storage_path IS DISTINCT FROM 'portal-photos/'||v_actor::text||'/'||p_upload_id::text||'.jpg' OR NOT EXISTS(
      SELECT 1 FROM public.actor_document a WHERE a.document_id=p_upload_id AND a.actor_id=v_actor AND a.created_by=auth.uid())
    OR (v_doc.extra ? 'slot_replace_media_id' AND v_doc.extra->>'slot_replace_media_id' IS DISTINCT FROM p_replace_media_id::text) THEN
   RAISE EXCEPTION 'Dépôt inaccessible' USING ERRCODE='42501';
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.pending_change pc WHERE pc.object_id=p_object_id AND pc.status='pending'
   AND pc.metadata->>'rpc'='publish_portal_photo_additions'
   AND EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(pc.payload->'additions','[]')) a WHERE a->>'upload_id'=p_upload_id::text)) INTO v_pending;
  IF v_pending THEN
   RETURN jsonb_build_object('id',v_doc.id,'actorId',v_actor,'path',v_doc.storage_path,
     'ready',v_doc.extra->>'upload_complete'='true','title',v_doc.title,'width',v_doc.extra->'width',
     'height',v_doc.extra->'height','sha256',v_doc.extra->>'upload_sha256');
  END IF;
 ELSE
  -- Reuse the existing upload-abuse ceiling. It is not an AI budget and permits the first twenty files.
  IF (SELECT count(*) FROM public.actor_document a JOIN public.ref_document d ON d.id=a.document_id
      WHERE a.actor_id=v_actor AND a.created_at>=CURRENT_DATE AND d.extra->>'source'='portal_photo')>=30 THEN
   RAISE EXCEPTION 'Limite quotidienne de dépôts atteinte' USING ERRCODE='PT429';
  END IF;
 END IF;
 IF p_replace_media_id IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM public.media m JOIN public.ref_code_media_type t ON t.id=m.media_type_id
   WHERE m.id=p_replace_media_id AND m.object_id=p_object_id AND m.place_id IS NULL
     AND t.code='photo' AND m.is_published AND COALESCE(m.visibility,'public')='public') THEN
  RAISE EXCEPTION 'La photo à remplacer a changé. Actualisez la galerie.' USING ERRCODE='PT409';
 END IF;
 IF p_replace_media_id IS NOT NULL AND EXISTS(SELECT 1 FROM internal.gallery_photo_reservations(p_object_id) r
     WHERE r.replace_media_id=p_replace_media_id AND r.document_id<>p_upload_id) THEN
  RAISE EXCEPTION 'Un remplacement de cette photo est déjà en cours.' USING ERRCODE='PT409';
 END IF;
 v_path:='portal-photos/'||v_actor::text||'/'||p_upload_id::text||'.jpg';
 IF v_doc.id IS NULL THEN
  INSERT INTO public.ref_document(id,url,title,storage_bucket,storage_path,access_scope,extra)
   VALUES(p_upload_id,'storage://actor-documents/'||v_path,'Photo','actor-documents',v_path,'crm_private',
    jsonb_build_object('source','portal_photo','object_id',p_object_id,'rights_confirmed',true,
      'rights_confirmed_at',now(),'slot_contract','photo-stock-v1','slot_state','reserved',
      'slot_replace_media_id',p_replace_media_id,'slot_reserved_at',now(),'slot_reserved_until',now()+interval '24 hours'));
  INSERT INTO public.actor_document(actor_id,document_id,title,created_by) VALUES(v_actor,p_upload_id,'Photo',auth.uid());
 ELSE
  UPDATE public.ref_document SET extra=COALESCE(extra,'{}')||jsonb_build_object(
    'slot_contract','photo-stock-v1','slot_state',CASE WHEN extra->>'upload_complete'='true' THEN 'uploaded' ELSE 'reserved' END,
    'slot_replace_media_id',p_replace_media_id,'slot_reserved_at',now(),'slot_reserved_until',now()+interval '24 hours')
   WHERE id=p_upload_id;
 END IF;
 PERFORM internal.gallery_assert_photo_capacity(p_object_id,v_before,v_published);
 SELECT * INTO v_doc FROM public.ref_document WHERE id=p_upload_id;
 RETURN jsonb_build_object('id',v_doc.id,'actorId',v_actor,'path',v_doc.storage_path,
   'ready',v_doc.extra->>'upload_complete'='true','title',v_doc.title,'width',v_doc.extra->'width',
   'height',v_doc.extra->'height','sha256',v_doc.extra->>'upload_sha256');
END;
$function$;

CREATE OR REPLACE FUNCTION api.complete_portal_photo_upload(
 p_user_id uuid,p_document_id uuid,p_sha256 text,p_title text,p_width integer,p_height integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,auth,pg_temp AS $function$
DECLARE v_object text;v_doc public.ref_document%ROWTYPE;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR p_user_id IS NULL OR p_sha256 IS NULL OR p_title IS NULL
   OR p_width IS NULL OR p_height IS NULL OR p_sha256!~'^[0-9a-f]{64}$' OR p_width<1 OR p_height<1 OR length(p_title)>180 THEN
  RAISE EXCEPTION 'Dépôt invalide' USING ERRCODE='42501';
 END IF;
 SELECT extra->>'object_id' INTO v_object FROM public.ref_document WHERE id=p_document_id;
 IF v_object IS NULL THEN RAISE EXCEPTION 'Dépôt inaccessible' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.object WHERE id=v_object FOR UPDATE;
 SELECT * INTO v_doc FROM public.ref_document WHERE id=p_document_id FOR UPDATE;
 IF v_doc.extra->>'source' IS DISTINCT FROM 'portal_photo' OR v_doc.access_scope IS DISTINCT FROM 'crm_private'
  OR v_doc.extra->>'published_media_id' IS NOT NULL OR v_doc.extra->>'slot_state'='cancelled'
  OR NOT EXISTS(SELECT 1 FROM public.actor_document a WHERE a.document_id=p_document_id AND a.created_by=p_user_id) THEN
  RAISE EXCEPTION 'Dépôt inaccessible' USING ERRCODE='42501';
 END IF;
 -- Recheck the registered account/link/realm and module mask at finalization.
 -- A service key is trusted transport, never a substitute for the partner's rights.
 IF NOT EXISTS(SELECT 1 FROM public.app_user_profile u JOIN public.actor a ON a.id=u.actor_id
    JOIN public.actor_object_role aor ON aor.actor_id=a.id JOIN public.object o ON o.id=aor.object_id
    WHERE u.id=p_user_id AND u.role='actor' AND o.id=v_object AND o.object_type<>'ORG'
      AND a.is_test=o.is_test AND (aor.valid_from IS NULL OR aor.valid_from<=CURRENT_DATE)
      AND (aor.valid_to IS NULL OR aor.valid_to>=CURRENT_DATE))
   OR 'media'=ANY(api.actor_portal_floor_modules())
   OR EXISTS(SELECT 1 FROM public.org_actor_module_visibility v JOIN public.object o ON o.id=v_object
     WHERE v.object_type=o.object_type::text AND v.module_id='media' AND NOT v.is_visible
      AND v.org_object_id=(SELECT l.org_object_id FROM public.object_org_link l JOIN public.ref_org_role r ON r.id=l.role_id
        WHERE l.object_id=v_object AND r.code='publisher' ORDER BY l.is_primary DESC NULLS LAST,l.org_object_id LIMIT 1)) THEN
  RAISE EXCEPTION 'La fiche n’est plus disponible dans votre espace.' USING ERRCODE='42501';
 END IF;
 IF v_doc.extra->>'upload_complete'='true' AND v_doc.extra->>'upload_sha256' IS DISTINCT FROM p_sha256 THEN
  RAISE EXCEPTION 'Identifiant de dépôt réutilisé avec un autre fichier' USING ERRCODE='PT409';
 END IF;
 UPDATE public.ref_document SET title=p_title,extra=extra||jsonb_build_object(
   'upload_complete',true,'upload_sha256',p_sha256,'slot_state','uploaded','width',p_width,'height',p_height)
  WHERE id=p_document_id;
 UPDATE public.actor_document SET title=p_title WHERE document_id=p_document_id AND created_by=p_user_id;
 RETURN jsonb_build_object('id',p_document_id,'title',p_title,'width',p_width,'height',p_height);
END;
$function$;

CREATE OR REPLACE FUNCTION api.cancel_portal_photo_upload(p_object_id text,p_document_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,auth,pg_temp AS $function$
DECLARE v_doc public.ref_document%ROWTYPE;
BEGIN
 PERFORM internal.portal_photo_assert_actor(p_object_id);
 PERFORM 1 FROM public.object WHERE id=p_object_id FOR UPDATE;
 SELECT * INTO v_doc FROM public.ref_document WHERE id=p_document_id FOR UPDATE;
 -- Cancelling a queued file which never reached reservation is an idempotent no-op.
 IF v_doc.id IS NULL THEN RETURN jsonb_build_object('cancelled',true,'canRemovePrivate',false); END IF;
 IF v_doc.extra->>'source' IS DISTINCT FROM 'portal_photo'
  OR v_doc.extra->>'object_id' IS DISTINCT FROM p_object_id OR NOT EXISTS(
    SELECT 1 FROM public.actor_document a WHERE a.document_id=p_document_id AND a.created_by=auth.uid()) THEN
  RAISE EXCEPTION 'Dépôt inaccessible' USING ERRCODE='42501';
 END IF;
 IF v_doc.extra->>'published_media_id' IS NOT NULL OR EXISTS(
   SELECT 1 FROM public.pending_change pc WHERE pc.object_id=p_object_id AND pc.status='pending'
     AND pc.metadata->>'rpc'='publish_portal_photo_additions' AND EXISTS(
       SELECT 1 FROM jsonb_array_elements(COALESCE(pc.payload->'additions','[]')) a WHERE a->>'upload_id'=p_document_id::text)) THEN
  RETURN jsonb_build_object('cancelled',false);
 END IF;
 UPDATE public.ref_document SET extra=extra||'{"slot_state":"cancelled"}'::jsonb WHERE id=p_document_id;
 RETURN jsonb_build_object('cancelled',true,'canRemovePrivate',v_doc.extra->>'upload_complete' IS DISTINCT FROM 'true',
   'path',v_doc.storage_path);
END;
$function$;

REVOKE ALL ON FUNCTION internal.gallery_published_photo_count(text),internal.gallery_photo_reservations(text),
 internal.gallery_photo_usage(text),internal.gallery_assert_photo_capacity(text,integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION api.reserve_portal_photo_upload(text,uuid,uuid),
 api.complete_portal_photo_upload(uuid,uuid,text,text,integer,integer),api.cancel_portal_photo_upload(text,uuid) FROM PUBLIC,anon,authenticated;
-- reserve/cancel remain unavailable to ordinary clients until the targeted gallery cutover.
GRANT EXECUTE ON FUNCTION api.complete_portal_photo_upload(uuid,uuid,text,text,integer,integer) TO service_role;

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
 FOR v_row IN SELECT value FROM jsonb_array_elements(p_payload->'rows') LOOP
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
 PERFORM internal.gallery_assert_photo_capacity(p_object_id,v_before,v_published);
 SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.position,m.created_at,m.id),'[]') INTO v_rows
  FROM public.media m WHERE m.object_id=p_object_id AND m.place_id IS NULL;
 INSERT INTO internal.gallery_write_receipt(object_id,user_id,request_id,request)
  VALUES(p_object_id,auth.uid(),v_request_id,p_payload);
 RETURN jsonb_build_object('success',true,'snapshot',v_rows,'replayed',false);
END;
$function$;
REVOKE ALL ON FUNCTION api.save_object_gallery(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.save_object_gallery(text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION api.get_gallery_write_receipt(p_object_id text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,auth,pg_temp AS $function$
DECLARE v_rows jsonb;
BEGIN
 IF auth.uid() IS NULL OR api.is_actor_persona() OR NOT COALESCE(api.user_can_write_object_canonical(p_object_id),false)
   OR NOT EXISTS(SELECT 1 FROM public.object WHERE id=p_object_id AND is_test=(SELECT api.current_user_test_realm())) THEN
  RAISE EXCEPTION 'Droits de gestion de galerie insuffisants' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM internal.gallery_write_receipt WHERE object_id=p_object_id AND user_id=auth.uid() AND request_id=p_request_id) THEN RETURN NULL; END IF;
 SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.position,m.created_at,m.id),'[]') INTO v_rows
  FROM public.media m WHERE m.object_id=p_object_id AND m.place_id IS NULL;
 RETURN jsonb_build_object('success',true,'snapshot',v_rows,'replayed',true);
END;
$function$;
REVOKE ALL ON FUNCTION api.get_gallery_write_receipt(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.get_gallery_write_receipt(text,uuid) TO authenticated;

-- The photo-B source-aligned guard patches follow below before COMMIT.
-- BEGIN REVIEWED PHOTO-B PATCHES

DO $validate_portal_photo_additions_stock$
DECLARE v_function regprocedure:='internal.validate_portal_photo_additions(text,jsonb,uuid)'::regprocedure;v_md5 text;v_definition text;v_meta jsonb;v_before text;v_after text;
BEGIN
 SELECT md5(replace(p.prosrc,E'\r\n',E'\n')),pg_get_functiondef(p.oid),jsonb_build_object('owner',p.proowner,'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig),'definer',p.prosecdef,'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,'returns',p.prorettype,'set',p.proretset,'args',p.proargtypes::text)
 INTO v_md5,v_definition,v_meta FROM pg_proc p WHERE p.oid=v_function;
 IF v_md5='0a5d60aeb43d8625e8aeb331b0e784ef' THEN RETURN; END IF;
 IF v_md5 IS DISTINCT FROM 'b30da0642a74f33f2625eb7d38d3a239' THEN RAISE EXCEPTION 'R5: unreviewed internal.validate_portal_photo_additions source %',v_md5; END IF;
 v_definition:=replace(v_definition,E'\r\n',E'\n');
 v_before:=$r5_before_1$v_replace uuid;$r5_before_1$;
 v_after:=$r5_after_1$v_replace uuid; v_previous_usage integer; v_previous_published integer;$r5_after_1$;
 IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN RAISE EXCEPTION 'R5: internal.validate_portal_photo_additions anchor 1 differs'; END IF;
 v_definition:=replace(v_definition,v_before,v_after);
 v_before:=$r5_before_2$  FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload->'additions') LOOP$r5_before_2$;
 v_after:=$r5_after_2$  -- Submission/approval callers already hold any submission/proposal locks.
  -- Upload and office paths never acquire a proposal after this object lock.
  PERFORM 1 FROM public.object WHERE id=p_object_id FOR UPDATE;
  v_previous_usage:=internal.gallery_photo_usage(p_object_id);
  v_previous_published:=internal.gallery_published_photo_count(p_object_id);
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload->'additions') LOOP$r5_after_2$;
 IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN RAISE EXCEPTION 'R5: internal.validate_portal_photo_additions anchor 2 differs'; END IF;
 v_definition:=replace(v_definition,v_before,v_after);
 v_before:=$r5_before_3$AND d.storage_bucket='actor-documents' AND d.storage_path LIKE 'portal-photos/'||a.actor_id::text||'/%';$r5_before_3$;
 v_after:=$r5_after_3$AND (d.extra->>'slot_contract' IS DISTINCT FROM 'photo-stock-v1' OR d.extra->>'upload_complete'='true')
        AND d.storage_bucket='actor-documents' AND d.storage_path LIKE 'portal-photos/'||a.actor_id::text||'/%' FOR UPDATE OF d;$r5_after_3$;
 IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN RAISE EXCEPTION 'R5: internal.validate_portal_photo_additions anchor 3 differs'; END IF;
 v_definition:=replace(v_definition,v_before,v_after);
 v_before:=$r5_before_4$    v_replace:=NULLIF(v_item->>'replace_media_id','')::uuid;$r5_before_4$;
 v_after:=$r5_after_4$    v_replace:=NULLIF(v_item->>'replace_media_id','')::uuid;
    IF EXISTS(SELECT 1 FROM public.ref_document d WHERE d.id=v_id AND (d.extra->>'slot_state'='cancelled'
      OR (d.extra ? 'slot_replace_media_id' AND d.extra->>'slot_replace_media_id' IS DISTINCT FROM v_replace::text))) THEN
      RAISE EXCEPTION 'La réservation de remplacement a changé.' USING ERRCODE='PT409';
    END IF;
    IF v_replace IS NOT NULL AND EXISTS(SELECT 1 FROM internal.gallery_photo_reservations(p_object_id) r
      WHERE r.replace_media_id=v_replace AND r.document_id<>v_id) THEN
      RAISE EXCEPTION 'Un remplacement de cette photo est déjà en cours.' USING ERRCODE='PT409';
    END IF;$r5_after_4$;
 IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN RAISE EXCEPTION 'R5: internal.validate_portal_photo_additions anchor 4 differs'; END IF;
 v_definition:=replace(v_definition,v_before,v_after);
 v_before:=$r5_before_5$    END IF;
  END LOOP;
END $r5_before_5$;
 v_after:=$r5_after_5$    END IF;
    -- Preserve pre-R5 pending receipts; bind their replacement under the same lock.
    UPDATE public.ref_document SET extra=COALESCE(extra,'{}')||jsonb_build_object(
      'slot_contract','photo-stock-v1','slot_state','uploaded',
      'upload_complete',COALESCE(extra->'upload_complete','true'::jsonb),'slot_replace_media_id',v_replace,
      'slot_reserved_at',COALESCE(extra->'slot_reserved_at',to_jsonb(now())),
      'slot_reserved_until',now()+interval '24 hours') WHERE id=v_id;
  END LOOP;
  PERFORM internal.gallery_assert_photo_capacity(p_object_id,v_previous_usage,v_previous_published);
END $r5_after_5$;
 IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN RAISE EXCEPTION 'R5: internal.validate_portal_photo_additions anchor 5 differs'; END IF;
 v_definition:=replace(v_definition,v_before,v_after);
 EXECUTE v_definition;
 IF (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid=v_function) IS DISTINCT FROM '0a5d60aeb43d8625e8aeb331b0e784ef' OR (SELECT jsonb_build_object('owner',p.proowner,'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig),'definer',p.prosecdef,'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,'returns',p.prorettype,'set',p.proretset,'args',p.proargtypes::text) FROM pg_proc p WHERE p.oid=v_function) IS DISTINCT FROM v_meta THEN RAISE EXCEPTION 'R5: internal.validate_portal_photo_additions target or attributes differ'; END IF;
END;
$validate_portal_photo_additions_stock$;

DO $prepare_portal_photo_approval_stock$
DECLARE v_function regprocedure:='api.prepare_portal_photo_approval(uuid,boolean,uuid)'::regprocedure;v_md5 text;v_definition text;v_meta jsonb;v_before text;v_after text;
BEGIN
 SELECT md5(replace(p.prosrc,E'\r\n',E'\n')),pg_get_functiondef(p.oid),jsonb_build_object('owner',p.proowner,'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig),'definer',p.prosecdef,'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,'returns',p.prorettype,'set',p.proretset,'args',p.proargtypes::text)
 INTO v_md5,v_definition,v_meta FROM pg_proc p WHERE p.oid=v_function;
 IF v_md5='34b7086ba27afbf3e3b4249c8204cadd' THEN RETURN; END IF;
 IF v_md5 IS DISTINCT FROM '34ac0036562489d2231c6e1e9fb79532' THEN RAISE EXCEPTION 'R5: unreviewed api.prepare_portal_photo_approval source %',v_md5; END IF;
 v_definition:=replace(v_definition,E'\r\n',E'\n');
 v_before:=$r5_before_1$DECLARE v_object text;$r5_before_1$;
 v_after:=$r5_after_1$DECLARE v_object text; v_submission uuid;$r5_after_1$;
 IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN RAISE EXCEPTION 'R5: api.prepare_portal_photo_approval anchor 1 differs'; END IF;
 v_definition:=replace(v_definition,v_before,v_after);
 v_before:=$r5_before_2$  -- Only reserve proposal rows here, in the same order as bulk approval. Taking
  -- an object lock first would invert approve_pending_change's row-lock order.$r5_before_2$;
 v_after:=$r5_after_2$  -- Submission -> all selected proposal rows -> object -> receipts.
  -- Never take another proposal lock after the object, including a batch.
  IF p_batch THEN
    PERFORM 1 FROM public.fiche_submission WHERE id=p_id FOR UPDATE;
  ELSE
    SELECT submission_id INTO v_submission FROM public.pending_change WHERE id=p_id;
    IF v_submission IS NOT NULL THEN PERFORM 1 FROM public.fiche_submission WHERE id=v_submission FOR UPDATE; END IF;
  END IF;
  PERFORM 1 FROM public.pending_change WHERE object_id=v_object AND status='pending'
    AND ((p_batch AND submission_id=p_id) OR (NOT p_batch AND id=p_id))
    AND metadata->>'rpc'='publish_portal_photo_additions' AND submission_id IS NOT NULL ORDER BY submitted_at,id FOR UPDATE;
  PERFORM 1 FROM public.object WHERE id=v_object FOR UPDATE;$r5_after_2$;
 IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN RAISE EXCEPTION 'R5: api.prepare_portal_photo_approval anchor 2 differs'; END IF;
 v_definition:=replace(v_definition,v_before,v_after);
 v_before:=$r5_before_3$AND metadata->>'rpc'='publish_portal_photo_additions' AND submission_id IS NOT NULL ORDER BY submitted_at,id FOR UPDATE LOOP$r5_before_3$;
 v_after:=$r5_after_3$AND metadata->>'rpc'='publish_portal_photo_additions' AND submission_id IS NOT NULL ORDER BY submitted_at,id LOOP$r5_after_3$;
 IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN RAISE EXCEPTION 'R5: api.prepare_portal_photo_approval anchor 3 differs'; END IF;
 v_definition:=replace(v_definition,v_before,v_after);
 EXECUTE v_definition;
 IF (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid=v_function) IS DISTINCT FROM '34b7086ba27afbf3e3b4249c8204cadd' OR (SELECT jsonb_build_object('owner',p.proowner,'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig),'definer',p.prosecdef,'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,'returns',p.prorettype,'set',p.proretset,'args',p.proargtypes::text) FROM pg_proc p WHERE p.oid=v_function) IS DISTINCT FROM v_meta THEN RAISE EXCEPTION 'R5: api.prepare_portal_photo_approval target or attributes differ'; END IF;
END;
$prepare_portal_photo_approval_stock$;

DO $publish_portal_photo_additions_stock$
DECLARE v_function regprocedure:='api.publish_portal_photo_additions(text,jsonb)'::regprocedure;v_md5 text;v_definition text;v_meta jsonb;v_before text;v_after text;
BEGIN
 SELECT md5(replace(p.prosrc,E'\r\n',E'\n')),pg_get_functiondef(p.oid),jsonb_build_object('owner',p.proowner,'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig),'definer',p.prosecdef,'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,'returns',p.prorettype,'set',p.proretset,'args',p.proargtypes::text)
 INTO v_md5,v_definition,v_meta FROM pg_proc p WHERE p.oid=v_function;
 IF v_md5='6f678c3f978cb836d0521c1727fe2846' THEN RETURN; END IF;
 IF v_md5 IS DISTINCT FROM '7445fdf5da38ded3bcfedbf0b6c9e47e' THEN RAISE EXCEPTION 'R5: unreviewed api.publish_portal_photo_additions source %',v_md5; END IF;
 v_definition:=replace(v_definition,E'\r\n',E'\n');
 v_before:=$r5_before_1$v_type uuid; v_replace uuid; v_position integer; v_main boolean; v_new uuid;$r5_before_1$;
 v_after:=$r5_after_1$v_type uuid; v_replace uuid; v_position integer; v_main boolean; v_new uuid; v_previous_usage integer; v_previous_published integer;$r5_after_1$;
 IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN RAISE EXCEPTION 'R5: api.publish_portal_photo_additions anchor 1 differs'; END IF;
 v_definition:=replace(v_definition,v_before,v_after);
 v_before:=$r5_before_2$  PERFORM 1 FROM public.object WHERE id=p_object_id FOR UPDATE;$r5_before_2$;
 v_after:=$r5_after_2$  PERFORM 1 FROM public.object WHERE id=p_object_id FOR UPDATE;
  v_previous_usage:=internal.gallery_photo_usage(p_object_id);
  v_previous_published:=internal.gallery_published_photo_count(p_object_id);$r5_after_2$;
 IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN RAISE EXCEPTION 'R5: api.publish_portal_photo_additions anchor 2 differs'; END IF;
 v_definition:=replace(v_definition,v_before,v_after);
 v_before:=$r5_before_3$jsonb_build_object('published_media_id',v_new,'published_at',now())$r5_before_3$;
 v_after:=$r5_after_3$jsonb_build_object('published_media_id',v_new,'published_at',now(),'slot_state','consumed')$r5_after_3$;
 IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN RAISE EXCEPTION 'R5: api.publish_portal_photo_additions anchor 3 differs'; END IF;
 v_definition:=replace(v_definition,v_before,v_after);
 v_before:=$r5_before_4$  RETURN internal.portal_photos_json(p_object_id);$r5_before_4$;
 v_after:=$r5_after_4$  PERFORM internal.gallery_assert_photo_capacity(p_object_id,v_previous_usage,v_previous_published);
  RETURN internal.portal_photos_json(p_object_id);$r5_after_4$;
 IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN RAISE EXCEPTION 'R5: api.publish_portal_photo_additions anchor 4 differs'; END IF;
 v_definition:=replace(v_definition,v_before,v_after);
 EXECUTE v_definition;
 IF (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid=v_function) IS DISTINCT FROM '6f678c3f978cb836d0521c1727fe2846' OR (SELECT jsonb_build_object('owner',p.proowner,'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig),'definer',p.prosecdef,'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,'returns',p.prorettype,'set',p.proretset,'args',p.proargtypes::text) FROM pg_proc p WHERE p.oid=v_function) IS DISTINCT FROM v_meta THEN RAISE EXCEPTION 'R5: api.publish_portal_photo_additions target or attributes differ'; END IF;
END;
$publish_portal_photo_additions_stock$;

NOTIFY pgrst,'reload schema';
COMMIT;
