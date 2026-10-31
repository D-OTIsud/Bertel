-- Lot 5 / décision produit du 31 octobre : seul l'ajout est relu.
-- Le dépôt réutilise la bibliothèque privée acteur. La route de validation de
-- l'office copie les octets traités vers media, puis appelle l'approbation SQL.
-- Aucun utilisateur du portail ne peut marquer une copie prête à publier.
BEGIN;
-- Colonne déjà présente en production (jsonb nullable, sans défaut). La déclarer
-- aussi pour une installation issue de l'ancien miroir schema_unified.sql.
ALTER TABLE public.media ADD COLUMN IF NOT EXISTS extra jsonb;

CREATE OR REPLACE FUNCTION internal.portal_photo_assert_actor(p_object_id text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api AS $function$
DECLARE v_actor uuid:=api.current_user_actor_id(); v_visibility jsonb;
BEGIN
  IF NOT COALESCE(api.is_actor_persona(),false) OR v_actor IS NULL
    OR NOT EXISTS(SELECT 1 FROM api.current_user_portal_object_ids() id WHERE id=p_object_id) THEN
    RAISE EXCEPTION 'Fiche inaccessible' USING ERRCODE='42501';
  END IF;
  v_visibility:=api.get_portal_section_visibility(p_object_id);
  IF COALESCE(v_visibility->'floor_modules','[]') ? 'media' OR COALESCE(v_visibility->'masked_modules','[]') ? 'media' THEN
    RAISE EXCEPTION 'Les photos sont gérées par l’office' USING ERRCODE='42501';
  END IF;
  RETURN v_actor;
END $function$;

CREATE OR REPLACE FUNCTION internal.portal_photos_json(p_object_id text)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',m.id,'url',m.url,'title',COALESCE(m.title,''),
    'credit',COALESCE(m.credit,''),'position',m.position,'isMain',COALESCE(m.is_main,false),'portalDocumentId',m.extra->>'portal_document_id') ORDER BY m.position,m.created_at,m.id),'[]')
  FROM public.media m JOIN public.ref_code_media_type t ON t.id=m.media_type_id
  WHERE m.object_id=p_object_id AND m.place_id IS NULL AND t.code='photo'
    AND m.is_published AND COALESCE(m.visibility,'public')='public';
$function$;

CREATE OR REPLACE FUNCTION api.portal_photo_upload_context(p_object_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal AS $function$
DECLARE v_actor uuid:=internal.portal_photo_assert_actor(p_object_id);
BEGIN
  IF (SELECT count(*) FROM public.actor_document a JOIN public.ref_document d ON d.id=a.document_id
    WHERE a.actor_id=v_actor AND a.created_at>=CURRENT_DATE AND d.extra->>'source'='portal_photo')>=30 THEN
    RAISE EXCEPTION 'Limite quotidienne atteinte. Réessayez demain.' USING ERRCODE='P0001';
  END IF;
  RETURN jsonb_build_object('actorId',v_actor);
END $function$;

CREATE OR REPLACE FUNCTION api.list_my_portal_photos(p_object_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,api,internal AS $function$
BEGIN
  PERFORM internal.portal_photo_assert_actor(p_object_id);
  RETURN internal.portal_photos_json(p_object_id);
END $function$;

CREATE OR REPLACE FUNCTION api.withdraw_portal_photo(p_object_id text,p_media_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal AS $function$
DECLARE v_main boolean; v_next uuid;
BEGIN
  PERFORM internal.portal_photo_assert_actor(p_object_id);
  PERFORM 1 FROM public.object WHERE id=p_object_id FOR UPDATE;
  SELECT m.is_main INTO v_main FROM public.media m JOIN public.ref_code_media_type t ON t.id=m.media_type_id
    WHERE m.id=p_media_id AND m.object_id=p_object_id AND m.place_id IS NULL
      AND t.code='photo' AND COALESCE(m.visibility,'public')='public' FOR UPDATE OF m;
  IF NOT FOUND THEN RAISE EXCEPTION 'Photo inaccessible' USING ERRCODE='42501'; END IF;
  -- Retrait immédiat de la galerie publiée ; l'office conserve l'historique et
  -- peut restaurer le média depuis son éditeur. Aucun fichier n'est détruit.
  UPDATE public.media SET is_published=false,is_main=false WHERE id=p_media_id;
  IF v_main THEN
    SELECT m.id INTO v_next FROM public.media m JOIN public.ref_code_media_type t ON t.id=m.media_type_id
      WHERE m.object_id=p_object_id AND m.place_id IS NULL AND m.is_published
        AND t.code='photo' AND COALESCE(m.visibility,'public')='public' ORDER BY m.position,m.created_at,m.id LIMIT 1;
    IF v_next IS NOT NULL THEN UPDATE public.media SET is_main=true WHERE id=v_next; END IF;
  END IF;
  RETURN internal.portal_photos_json(p_object_id);
END $function$;

CREATE OR REPLACE FUNCTION api.reorder_portal_photos(p_object_id text,p_media_ids jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal AS $function$
DECLARE v_ids uuid[]; v_count integer; v_total integer; v_i integer;
BEGIN
  PERFORM internal.portal_photo_assert_actor(p_object_id);
  IF jsonb_typeof(p_media_ids) IS DISTINCT FROM 'array' OR jsonb_array_length(p_media_ids)>100
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_media_ids) id WHERE jsonb_typeof(id)<>'string' OR id#>>'{}'!~*'^[0-9a-f-]{36}$') THEN
    RAISE EXCEPTION 'Ordre des photos invalide' USING ERRCODE='22023';
  END IF;
  v_ids:=ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(p_media_ids));
  PERFORM 1 FROM public.object WHERE id=p_object_id FOR UPDATE;
  SELECT count(*),count(*) FILTER(WHERE m.id=ANY(v_ids)) INTO v_total,v_count
    FROM public.media m JOIN public.ref_code_media_type t ON t.id=m.media_type_id
    WHERE m.object_id=p_object_id AND m.place_id IS NULL AND m.is_published AND t.code='photo' AND COALESCE(m.visibility,'public')='public';
  IF v_count<>cardinality(v_ids) OR v_count<>v_total OR cardinality(v_ids)<>(SELECT count(DISTINCT id) FROM unnest(v_ids) id) THEN
    RAISE EXCEPTION 'Les photos ont changé. Rechargez la fiche avant de les réordonner.' USING ERRCODE='PT409';
  END IF;
  UPDATE public.media SET is_main=false WHERE id=ANY(v_ids);
  FOR v_i IN 1..COALESCE(cardinality(v_ids),0) LOOP
    UPDATE public.media SET position=v_i,is_main=(v_i=1) WHERE id=v_ids[v_i];
  END LOOP;
  RETURN internal.portal_photos_json(p_object_id);
END $function$;

CREATE OR REPLACE FUNCTION internal.validate_portal_photo_additions(p_object_id text,p_payload jsonb,p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api AS $function$
DECLARE v_item jsonb; v_id uuid; v_ids uuid[]:=ARRAY[]::uuid[]; v_replace uuid;
BEGIN
  IF p_user_id IS NULL OR jsonb_typeof(p_payload->'additions') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_payload->'additions') NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'Ajouts de photos invalides' USING ERRCODE='22023';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload->'additions') LOOP
    IF jsonb_typeof(v_item)<>'object' OR COALESCE(v_item->>'upload_id','')!~*'^[0-9a-f-]{36}$'
      OR length(COALESCE(v_item->>'credit',''))>200
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_item) k WHERE k NOT IN ('upload_id','credit','replace_media_id')) THEN
      RAISE EXCEPTION 'Photo proposée invalide' USING ERRCODE='22023';
    END IF;
    v_id:=(v_item->>'upload_id')::uuid;
    IF v_id=ANY(v_ids) THEN RAISE EXCEPTION 'Photo répétée' USING ERRCODE='22023'; END IF;
    v_ids:=array_append(v_ids,v_id);
    PERFORM 1 FROM public.ref_document d JOIN public.actor_document a ON a.document_id=d.id
      WHERE d.id=v_id AND a.created_by=p_user_id AND d.extra->>'source'='portal_photo'
        AND d.extra->>'object_id'=p_object_id AND d.extra->>'rights_confirmed'='true'
        AND d.extra->>'published_media_id' IS NULL AND d.access_scope='crm_private'
        AND d.storage_bucket='actor-documents' AND d.storage_path LIKE 'portal-photos/'||a.actor_id::text||'/%';
    IF NOT FOUND THEN RAISE EXCEPTION 'Photo privée inaccessible' USING ERRCODE='42501'; END IF;
    v_replace:=NULLIF(v_item->>'replace_media_id','')::uuid;
    IF v_replace IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.media m JOIN public.ref_code_media_type t ON t.id=m.media_type_id
      WHERE m.id=v_replace AND m.object_id=p_object_id AND m.place_id IS NULL AND t.code='photo' AND COALESCE(m.visibility,'public')='public') THEN
      RAISE EXCEPTION 'La photo à remplacer est inaccessible' USING ERRCODE='42501';
    END IF;
  END LOOP;
END $function$;

CREATE OR REPLACE FUNCTION api.portal_photo_preview(p_document_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,api AS $function$
DECLARE v_doc public.ref_document%ROWTYPE; v_owner uuid;
BEGIN
  SELECT * INTO v_doc FROM public.ref_document WHERE id=p_document_id AND extra->>'source'='portal_photo';
  SELECT created_by INTO v_owner FROM public.actor_document WHERE document_id=p_document_id;
  IF v_doc.id IS NULL OR v_doc.storage_bucket IS DISTINCT FROM 'actor-documents' OR v_doc.access_scope IS DISTINCT FROM 'crm_private'
    OR NOT COALESCE((api.is_actor_persona() AND v_owner=auth.uid()
      AND EXISTS(SELECT 1 FROM api.current_user_portal_object_ids() id WHERE id=v_doc.extra->>'object_id'))
      OR (NOT api.is_actor_persona() AND api.user_can_moderate_object(v_doc.extra->>'object_id')
        AND EXISTS(SELECT 1 FROM public.pending_change pc WHERE pc.object_id=v_doc.extra->>'object_id' AND pc.status='pending'
          AND pc.submission_id IS NOT NULL AND pc.submitted_by=v_owner AND pc.metadata->>'rpc'='publish_portal_photo_additions'
          AND EXISTS(SELECT 1 FROM jsonb_array_elements(pc.payload->'additions') item WHERE item->>'upload_id'=v_doc.id::text))),false) THEN
    RAISE EXCEPTION 'Photo privée inaccessible' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object('bucket',v_doc.storage_bucket,'path',v_doc.storage_path,'title',v_doc.title);
END $function$;

CREATE OR REPLACE FUNCTION api.prepare_portal_photo_approval(p_id uuid,p_batch boolean,p_claim_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal AS $function$
DECLARE v_object text; v_pc public.pending_change%ROWTYPE; v_item jsonb; v_doc public.ref_document%ROWTYPE; v_docs jsonb:='[]';
BEGIN
  IF p_claim_id IS NULL THEN RAISE EXCEPTION 'Réservation manquante' USING ERRCODE='22023'; END IF;
  IF p_batch THEN SELECT object_id INTO v_object FROM public.fiche_submission WHERE id=p_id;
  ELSE SELECT object_id INTO v_object FROM public.pending_change WHERE id=p_id; END IF;
  IF v_object IS NULL OR api.is_actor_persona() OR NOT COALESCE(api.user_can_moderate_object(v_object),false) THEN
    RAISE EXCEPTION 'Droits de relecture insuffisants' USING ERRCODE='42501';
  END IF;
  -- Only reserve proposal rows here, in the same order as bulk approval. Taking
  -- an object lock first would invert approve_pending_change's row-lock order.
  FOR v_pc IN SELECT * FROM public.pending_change WHERE object_id=v_object AND status='pending'
      AND ((p_batch AND submission_id=p_id) OR (NOT p_batch AND id=p_id))
      AND metadata->>'rpc'='publish_portal_photo_additions' AND submission_id IS NOT NULL ORDER BY submitted_at,id FOR UPDATE LOOP
    PERFORM internal.validate_portal_photo_additions(v_object,v_pc.payload,v_pc.submitted_by);
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_pc.payload->'additions') LOOP
      SELECT * INTO v_doc FROM public.ref_document WHERE id=(v_item->>'upload_id')::uuid FOR UPDATE;
      IF NULLIF(v_doc.extra->>'approval_claim_id','') IS NOT NULL AND (v_doc.extra->>'approval_claim_until')::timestamptz>now() THEN
        RAISE EXCEPTION 'Une validation est déjà en cours. Réessayez dans quelques minutes.' USING ERRCODE='PT409';
      END IF;
      UPDATE public.ref_document SET extra=extra||jsonb_build_object('approval_claim_id',p_claim_id,'approval_claim_by',auth.uid(),
        'approval_claim_until',now()+interval '15 minutes','publication_ready',false) WHERE id=v_doc.id;
      v_docs:=v_docs||jsonb_build_array(jsonb_build_object('id',v_doc.id,'bucket',v_doc.storage_bucket,'path',v_doc.storage_path,'publicPath','portal-approved/'||v_doc.id::text||'.jpg'));
    END LOOP;
  END LOOP;
  IF jsonb_array_length(v_docs)=0 AND NOT EXISTS(SELECT 1 FROM public.pending_change pc WHERE pc.object_id=v_object
    AND ((p_batch AND pc.submission_id=p_id) OR (NOT p_batch AND pc.id=p_id)) AND pc.metadata->>'rpc'='publish_portal_photo_additions' AND pc.status='applied') THEN
    RAISE EXCEPTION 'Aucune photo à valider' USING ERRCODE='22023';
  END IF;
  RETURN jsonb_build_object('objectId',v_object,'documents',v_docs,'alreadyApplied',jsonb_array_length(v_docs)=0);
END $function$;

CREATE OR REPLACE FUNCTION api.get_portal_photo_review(p_change_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,api AS $function$
DECLARE v_pc public.pending_change%ROWTYPE;
BEGIN
  SELECT * INTO v_pc FROM public.pending_change WHERE id=p_change_id;
  IF v_pc.object_id IS NULL OR api.is_actor_persona() OR NOT COALESCE(api.user_can_moderate_object(v_pc.object_id),false) THEN
    RAISE EXCEPTION 'Relecture inaccessible' USING ERRCODE='42501';
  END IF;
  IF v_pc.status<>'pending' OR v_pc.submission_id IS NULL OR v_pc.metadata->>'rpc' IS DISTINCT FROM 'publish_portal_photo_additions' THEN RETURN '[]'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',d.id,'title',d.title,'credit',item->>'credit','replacement',NULLIF(item->>'replace_media_id','') IS NOT NULL))
    FROM jsonb_array_elements(v_pc.payload->'additions') item JOIN public.ref_document d ON d.id=(item->>'upload_id')::uuid
    JOIN public.actor_document a ON a.document_id=d.id AND a.created_by=v_pc.submitted_by
    WHERE d.extra->>'source'='portal_photo' AND d.extra->>'object_id'=v_pc.object_id),'[]');
END $function$;

CREATE OR REPLACE FUNCTION api.publish_portal_photo_additions(p_object_id text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal AS $function$
DECLARE v_pc public.pending_change%ROWTYPE; v_item jsonb; v_doc public.ref_document%ROWTYPE;
  v_type uuid; v_replace uuid; v_position integer; v_main boolean; v_new uuid;
BEGIN
  IF api.is_actor_persona() OR NOT COALESCE(api.user_can_moderate_object(p_object_id),false) THEN
    RAISE EXCEPTION 'Publication réservée à l’office' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_pc FROM public.pending_change WHERE object_id=p_object_id AND status='pending' AND submission_id IS NOT NULL
    AND metadata->>'rpc'='publish_portal_photo_additions' AND metadata->>'section'='media' AND payload=p_payload LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Demande de relecture introuvable' USING ERRCODE='42501'; END IF;
  PERFORM internal.validate_portal_photo_additions(p_object_id,p_payload,v_pc.submitted_by);
  PERFORM 1 FROM public.object WHERE id=p_object_id FOR UPDATE;
  SELECT id INTO v_type FROM public.ref_code_media_type WHERE code='photo';
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload->'additions') LOOP
    SELECT * INTO v_doc FROM public.ref_document WHERE id=(v_item->>'upload_id')::uuid FOR UPDATE;
    IF v_doc.extra->>'publication_ready' IS DISTINCT FROM 'true' OR v_doc.extra->>'approval_claim_by' IS DISTINCT FROM auth.uid()::text
      OR NOT COALESCE((v_doc.extra->>'approval_claim_until')::timestamptz>now(),false) OR NULLIF(v_doc.extra->>'public_url','') IS NULL THEN
      RAISE EXCEPTION 'Ouvrez la relecture des photos pour les publier après vérification.' USING ERRCODE='22023';
    END IF;
    v_replace:=NULLIF(v_item->>'replace_media_id','')::uuid;v_main:=false;
    IF v_replace IS NOT NULL THEN
      SELECT position,is_main INTO v_position,v_main FROM public.media WHERE id=v_replace AND object_id=p_object_id;
      UPDATE public.media SET is_published=false,is_main=false WHERE id=v_replace AND object_id=p_object_id;
    ELSE SELECT COALESCE(max(position),0)+1 INTO v_position FROM public.media WHERE object_id=p_object_id AND place_id IS NULL; END IF;
    v_main:=COALESCE(v_main,false) OR NOT EXISTS(SELECT 1 FROM public.media WHERE object_id=p_object_id AND place_id IS NULL AND media_type_id=v_type AND is_published AND is_main);
    INSERT INTO public.media(object_id,media_type_id,title,credit,url,width,height,kind,visibility,position,is_main,is_published,extra)
      VALUES(p_object_id,v_type,v_doc.title,NULLIF(btrim(v_item->>'credit'),''),v_doc.extra->>'public_url',(v_doc.extra->>'width')::integer,
        (v_doc.extra->>'height')::integer,'illustration','public',COALESCE(v_position,1),v_main,true,jsonb_build_object('portal_document_id',v_doc.id,'source','portal')) RETURNING id INTO v_new;
    UPDATE public.ref_document SET extra=extra||jsonb_build_object('published_media_id',v_new,'published_at',now()) WHERE id=v_doc.id;
    -- L'original reste privé dans le dossier de l'acteur. Le statut « promoted »
    -- de cette bibliothèque concerne un transfert vers object_document, tandis
    -- qu'ici une COPIE autonome devient un média de la fiche.
  END LOOP;
  RETURN internal.portal_photos_json(p_object_id);
END $function$;

CREATE OR REPLACE FUNCTION api.portal_photo_failed_approval(p_claim_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE v_paths jsonb;
BEGIN
  -- Service-only compensation. Never remove a public copy if SQL committed, even
  -- when the HTTP response was lost and the route initially believed it failed.
  SELECT COALESCE(jsonb_agg('portal-approved/'||d.id::text||'.jpg'),'[]') INTO v_paths FROM public.ref_document d
    WHERE d.extra->>'approval_claim_id'=p_claim_id::text AND d.extra->>'source'='portal_photo'
      AND d.extra->>'published_media_id' IS NULL AND NOT EXISTS(SELECT 1 FROM public.media m WHERE m.extra->>'portal_document_id'=d.id::text);
  UPDATE public.ref_document d SET extra=extra-ARRAY['approval_claim_id','approval_claim_by','approval_claim_until','public_url']::text[]||'{"publication_ready":false}'::jsonb
    WHERE d.extra->>'approval_claim_id'=p_claim_id::text AND d.extra->>'source'='portal_photo' AND d.extra->>'published_media_id' IS NULL
      AND NOT EXISTS(SELECT 1 FROM public.media m WHERE m.extra->>'portal_document_id'=d.id::text);
  RETURN v_paths;
END $function$;

REVOKE ALL ON FUNCTION internal.portal_photo_assert_actor(text),internal.portal_photos_json(text),internal.validate_portal_photo_additions(text,jsonb,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION api.portal_photo_upload_context(text),api.list_my_portal_photos(text),api.withdraw_portal_photo(text,uuid),api.reorder_portal_photos(text,jsonb),
  api.portal_photo_preview(uuid),api.get_portal_photo_review(uuid),api.prepare_portal_photo_approval(uuid,boolean,uuid),api.publish_portal_photo_additions(text,jsonb),api.portal_photo_failed_approval(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.portal_photo_upload_context(text),api.list_my_portal_photos(text),api.withdraw_portal_photo(text,uuid),api.reorder_portal_photos(text,jsonb),
  api.portal_photo_preview(uuid),api.get_portal_photo_review(uuid),api.prepare_portal_photo_approval(uuid,boolean,uuid) TO authenticated;
-- Le writer d'ajout n'est invoqué que par l'approbation DEFINER whitelistée,
-- qui garde auth.uid(). Aucun rôle client ne peut le lancer directement.
GRANT EXECUTE ON FUNCTION api.portal_photo_failed_approval(uuid) TO service_role;

-- Source-aligned changes to the floor, submission validator and approval whitelist follow.
DO $preflight$ BEGIN
  IF (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid='api.actor_portal_floor_modules()'::regprocedure) <> '2bbe58646c2d56dc402bbede946e1511' THEN RAISE EXCEPTION 'Source vive divergente : actor_portal_floor_modules. Comparer avant de poursuivre.'; END IF;
  IF (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid='api.submit_actor_fiche(text,jsonb,text)'::regprocedure) <> '0861011392137effc9c7cb97bef6beab' THEN RAISE EXCEPTION 'Source vive divergente : submit_actor_fiche. Comparer avant de poursuivre.'; END IF;
  IF (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid='api.approve_pending_change(uuid,text,boolean)'::regprocedure) <> '78b171f997cd630da118ecc81382448d' THEN RAISE EXCEPTION 'Source vive divergente : approve_pending_change. Comparer avant de poursuivre.'; END IF;
END $preflight$;
CREATE OR REPLACE FUNCTION api.actor_portal_floor_modules()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT ARRAY['legal','provider-follow-up','publication','sync-identifiers','distribution','provider',
               'relationships','places'];
$function$;
CREATE OR REPLACE FUNCTION api.submit_actor_fiche(p_object_id text, p_changes jsonb, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'api', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_actor     uuid;
  v_masked    text[];
  v_floor     text[] := api.actor_portal_floor_modules();
  -- CORRECTION CONTRÔLEUR (revue task-5) : le brief listait HUIT writers (avec
  -- save_object_rooms). Le prosrc VIF de api.approve_pending_change (§120) —
  -- re-vérifié en base juste avant cette écriture, md5(prosrc)=3cf2a45631df18e22e0b4c5cd81d9e2e,
  -- IDENTIQUE à l'archive .superpowers/sdd/2026-09-01-portail-acteur/live/approve_pending_change.LIVE.sql —
  -- n'en porte que SEPT : SANS save_object_rooms. Cette liste DOIT rester un
  -- SOUS-ENSEMBLE (depuis la revue du 2026-09-04 : STRICT — voir plus bas) de celle
  -- d'approve_pending_change, JAMAIS un
  -- sur-ensemble : si submit_actor_fiche acceptait un writer qu'approve_pending_change
  -- refuse, ce changement entrerait en base à la soumission puis ne pourrait plus
  -- JAMAIS être approuvé (22023 côté approve) — et comme uq_fiche_submission_open
  -- n'autorise qu'UNE vérification ouverte par fiche, celle-ci resterait bloquée
  -- POUR TOUJOURS (aucun mécanisme ne libère le verrou sans résolution). N'AJOUTE
  -- JAMAIS une entrée ici sans l'avoir d'abord ajoutée, vérifiée et déployée côté
  -- approve_pending_change — et sans mettre à jour l'assertion miroir de
  -- tests/test_actor_portal.sql (bloc D2, « épinglé save_object_rooms ») qui
  -- proteste explicitement contre cette divergence.
  --
  -- RÉDUCTION (revue sécurité 2026-09-04) — le défaut que ces DEUX entrées ferment :
  -- le plancher dur est contrôlé sur `metadata.section`, le ré-dispatch d'écriture est
  -- décidé sur `metadata.rpc`, et RIEN dans cette fonction ne COUPLE les deux clés. Une
  -- enveloppe qui déclare une section anodine ('contacts', ni plancher ni masquée) et un
  -- writer de la liste franchissait donc le plancher, entrait en base, puis se faisait
  -- ré-dispatcher pour de bon à l'approbation. Trois des sept entrées étaient par ailleurs
  -- explicitement interdites AILLEURS dans ce même fichier : `relationships`, `places` et
  -- `media` sont dans api.actor_portal_floor_modules() (§4.1), dont le commentaire dit
  -- pourquoi — save_object_relations « réécrit object_org_link ET actor_object_role, le
  -- périmètre même de l'acteur », save_object_places « supprime les médias des sous-lieux
  -- absents du payload ». Le plancher les fermait par la section ; la whitelist les
  -- rouvrait par le rpc.
  -- La liste est donc ramenée aux SEULS writers que le portail ÉMET réellement. Les cinq
  -- autres n'ont aucun émetteur : les retirer ne retire aucune capacité existante.
  -- L'invariant du §7 tient toujours, et plus largement qu'avant : cette liste reste un
  -- SOUS-ENSEMBLE (ici STRICT) de celle d'api.approve_pending_change — donc aucun
  -- changement accepté ici ne peut être refusé là-bas, et aucune fiche ne peut rester
  -- bloquée à vie sur uq_fiche_submission_open. C'est le sens de l'inclusion qui compte :
  -- rétrécir est TOUJOURS sûr, élargir ne l'est jamais.
  -- Épinglé au test, bloc D2 : les cinq writers retirés y sont refusés UN PAR UN, et
  -- save_object_commercial y a son contrôle positif (une whitelist vidée serait sinon
  -- verte partout et le portail muet).
  v_allowed   text[] := ARRAY['save_object_commercial','save_object_openings','publish_portal_photo_additions'];
  v_change    jsonb;
  v_section   text;
  v_rpc       text;
  v_action    text;
  v_count     int := 0;
  v_sub_id    uuid;
  v_task_id   uuid;
  v_name      text;
  v_sections  text[] := ARRAY[]::text[];
  v_assignees uuid[];
BEGIN
  IF v_uid IS NULL OR NOT api.is_actor_persona() THEN
    RAISE EXCEPTION 'Réservé aux comptes du portail acteur' USING ERRCODE = '42501';
  END IF;
  IF p_object_id IS NULL OR p_object_id NOT IN (SELECT api.current_user_portal_object_ids()) THEN
    RAISE EXCEPTION 'Fiche hors de votre périmètre' USING ERRCODE = '42501';
  END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'array'
     OR jsonb_array_length(p_changes) = 0 OR jsonb_array_length(p_changes) > 40 THEN
    RAISE EXCEPTION 'p_changes doit être un tableau de 1 à 40 changements' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM fiche_submission fs
              WHERE fs.object_id = p_object_id AND fs.status = 'pending') THEN
    -- PT409 (PostgREST ⇒ HTTP 409, SQLSTATE exposé dans error.code) et PAS 23505 : le front
    -- traduit 23505 en « Cette valeur existe déjà (doublon). » (db-error-message.ts) et
    -- mapDatabaseError applique le SQLSTATE AVANT le message — le prestataire lirait « doublon ».
    RAISE EXCEPTION USING ERRCODE = 'PT409',
      MESSAGE = 'Une vérification est déjà en cours pour cette fiche';
  END IF;

  v_actor := api.current_user_actor_id();
  v_masked := ARRAY(SELECT jsonb_array_elements_text(
    api.get_portal_section_visibility(p_object_id)->'masked_modules'));

  -- Validation de CHAQUE enveloppe avant la moindre écriture.
  FOR v_change IN SELECT * FROM jsonb_array_elements(p_changes) LOOP
    v_section := v_change->'metadata'->>'section';
    v_rpc     := v_change->'metadata'->>'rpc';
    v_action  := v_change->>'action';
    IF v_section IS NULL OR btrim(v_section) = '' THEN
      RAISE EXCEPTION 'metadata.section requis sur chaque changement' USING ERRCODE = '22023';
    END IF;
    IF v_section = ANY (v_floor) THEN
      RAISE EXCEPTION 'La section « % » n''est pas ouverte aux acteurs', v_section USING ERRCODE = '22023';
    END IF;
    IF v_section = ANY (v_masked) THEN
      RAISE EXCEPTION 'La section « % » est masquée par votre organisation', v_section USING ERRCODE = '22023';
    END IF;
    IF v_rpc IS NOT NULL AND NOT (v_rpc = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'Writer non autorisé: %', v_rpc USING ERRCODE = '22023';
    END IF;
    IF COALESCE(v_action, '') NOT IN ('insert','update','delete') THEN
      RAISE EXCEPTION 'action invalide: %', v_action USING ERRCODE = '22023';
    END IF;
    IF v_change->'payload' IS NULL OR (v_change->>'target_table') IS NULL
       OR btrim(v_change->>'target_table') = '' THEN
      RAISE EXCEPTION 'payload et target_table requis' USING ERRCODE = '22023';
    END IF;
    IF v_section = 'media' THEN
      IF v_rpc IS DISTINCT FROM 'publish_portal_photo_additions' OR v_action <> 'update'
        OR v_change->>'target_table' IS DISTINCT FROM 'media' THEN
        RAISE EXCEPTION 'Les photos se transmettent uniquement comme ajouts à relire' USING ERRCODE='22023';
      END IF;
      PERFORM internal.validate_portal_photo_additions(p_object_id,v_change->'payload',v_uid);
    ELSIF v_rpc = 'publish_portal_photo_additions' THEN
      RAISE EXCEPTION 'Writer de photos hors de sa rubrique' USING ERRCODE='22023';
    END IF;
    v_sections := array_append(v_sections, v_change->'metadata'->>'field');
  END LOOP;

  -- La soumission. Le pré-check EXISTS plus haut n'est qu'un check-then-act : il rend
  -- le cas courant lisible sans lever d'exception coûteuse, mais entre lui et CET
  -- INSERT, rien ne l'empêche d'être doublé (double-clic avant que le bouton se
  -- désactive côté front, deux onglets) — les deux appels peuvent lire EXISTS=FALSE
  -- et arriver ici ensemble ; uq_fiche_submission_open (index unique partiel)
  -- départage alors les deux à l'ÉCRITURE, pas au pré-check. Sans ce blindage, le
  -- perdant de la course remonterait un 23505 NU — exactement le message
  -- « doublon » (db-error-message.ts) que le pré-check ci-dessus prétend déjà
  -- fermer, et le piège nommé par le PO pour ce chantier. Le code d'erreur est la
  -- SEULE chose que voit le prestataire : on rattrape donc ICI, à l'écriture réelle,
  -- avec le MÊME message et le MÊME SQLSTATE que le pré-check — le front n'a
  -- jamais qu'un seul cas PT409 à traiter. Motif identique à 4 précédents du dépôt
  -- (SELECT optimiste + écriture blindée) : api.create_tag et
  -- api.create_membership_campaign (api_views_functions.sql), et leur miroir dans
  -- migration_tags_create_and_order.sql.
  BEGIN
    INSERT INTO fiche_submission (object_id, actor_id, submitted_by, note)
    VALUES (p_object_id, v_actor, v_uid, NULLIF(btrim(COALESCE(p_note, '')), ''))
    RETURNING id INTO v_sub_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409',
      MESSAGE = 'Une vérification est déjà en cours pour cette fiche';
  END;

  -- Les changements (mêmes colonnes que submit_pending_change + submission_id ;
  -- le trigger after-insert flippe object.is_editing).
  FOR v_change IN SELECT * FROM jsonb_array_elements(p_changes) LOOP
    INSERT INTO pending_change (object_id, target_table, target_pk, action, payload,
                                submitted_by, status, metadata, submission_id)
    VALUES (p_object_id, v_change->>'target_table', v_change->>'target_pk',
            v_change->>'action', v_change->'payload', v_uid, 'pending',
            -- Les trois clés d'ATTESTATION sont retirées de l'enveloppe : elles n'appartiennent
            -- qu'à api.approve_pending_change (§7), qui seule les écrit, et seulement sur sa
            -- branche attestée. Sans ce filtre, un acteur les poserait lui-même — au nom du
            -- modérateur de son choix — et elles survivraient sur les deux issues que §7 ne
            -- réécrit pas : un REFUS (reject_pending_change ne touche pas metadata) et la voie
            -- AUTO (`applied`, aucune réécriture). La ligne porterait alors « untel déclare
            -- l'avoir reportée à la main » sans que personne n'ait rien signé. `-` sur jsonb est
            -- NULL-safe, et metadata est nécessairement un objet ici (un scalaire est abattu par
            -- le contrôle d'enveloppe plus haut). Les clés déclaratives — section, rpc,
            -- manual_apply, field, before, after — passent intactes.
            (v_change->'metadata') - ARRAY['applied_manually','attested_by','attested_at']::text[],
            v_sub_id);
    v_count := v_count + 1;
  END LOOP;

  -- La tâche de vérification, typée par extra (crm_task n'a pas de colonne kind).
  SELECT o.name INTO v_name FROM object o WHERE o.id = p_object_id;
  v_task_id := gen_random_uuid();
  INSERT INTO crm_task (id, object_id, actor_id, title, description, status, priority, created_by, extra)
  VALUES (v_task_id, p_object_id, v_actor,
          'Vérifier la fiche « ' || COALESCE(v_name, p_object_id) || ' »',
          COALESCE('Message du prestataire : ' || NULLIF(btrim(COALESCE(p_note, '')), '') || E'\n', '')
            -- array_to_string (forme à 2 arguments) ignore silencieusement les NULL : si
            -- tous les metadata.field valent NULL, la liste serait vide et la phrase
            -- finirait tronquée (« Sections modifiées : » suivi de rien) — l'office lit
            -- cette description, un repli lisible vaut mieux qu'une phrase coupée.
            || 'Sections modifiées : ' || COALESCE(NULLIF(array_to_string(v_sections, ', '), ''), '(non précisées)'),
          'todo', 'medium', v_uid,
          jsonb_build_object('kind', 'fiche_verification', 'submission_id', v_sub_id));
  UPDATE fiche_submission SET task_id = v_task_id WHERE id = v_sub_id;

  -- Assignation multi (D3) + notifications (kind crm_task_assigned réutilisé — l'outbox
  -- e-mail existante part sans aucun nouveau rail).
  v_assignees := ARRAY(SELECT api.list_object_verifier_ids(p_object_id));
  IF COALESCE(array_length(v_assignees, 1), 0) > 0 THEN
    INSERT INTO crm_task_assignee (task_id, user_id, assigned_by)
    SELECT v_task_id, u.u, v_uid FROM unnest(v_assignees) AS u(u)
    ON CONFLICT (task_id, user_id) DO NOTHING;
    -- owner de compat = plus petit uuid (même règle que save_crm_task, migration_crm_task_
    -- multi_assignee_notifications.sql L378). PAS min(u.u) : uuid n'a pas d'agrégat MIN/MAX
    -- sur cette version de Postgres (constaté à l'exécution : « function min(uuid) does not
    -- exist ») — uuid n'a qu'un opclass btree (ORDER BY fonctionne), pas d'agrégat dédié.
    UPDATE crm_task SET owner = (SELECT u.u FROM unnest(v_assignees) u(u) ORDER BY u.u LIMIT 1)
      WHERE id = v_task_id;
    PERFORM api.notify_task_assignees(v_task_id, v_assignees, v_uid);
  END IF;

  RETURN jsonb_build_object(
    'submission_id', v_sub_id, 'task_id', v_task_id,
    'change_count', v_count,
    'assignee_count', COALESCE(array_length(v_assignees, 1), 0));
END;
$function$;
CREATE OR REPLACE FUNCTION api.approve_pending_change(p_id uuid, p_review_note text DEFAULT NULL::text, p_applied_manually boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'api', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_row pending_change%ROWTYPE;
  v_rpc text;
  v_uid uuid := auth.uid();
  -- SEPT entrées — cf. l'avertissement ci-dessus. Miroir exact de api.submit_actor_fiche.
  v_allowed text[] := ARRAY[
    'publish_portal_photo_additions',
    'save_object_commercial',
    'save_object_workspace_sustainability',
    'save_object_workspace_tags',
    'save_object_itinerary_nested',
    'save_object_openings',
    'save_object_places',
    'save_object_relations'
  ];
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_row FROM pending_change WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Suggestion introuvable: %', p_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'Suggestion déjà résolue (statut=%)', v_row.status USING ERRCODE = '22023';
  END IF;
  -- La garde d'autorisation reste AVANT toute branche : l'attestation est un geste de
  -- modération de plus, pas un chemin parallèle. Elle s'évalue sur auth.uid() — SECURITY
  -- DEFINER change le propriétaire des droits Postgres, jamais l'identité applicative.
  -- Le bras `object_id IS NULL` est EXPLICITE, et il est indispensable :
  -- user_can_moderate_object rend NULL (et non FALSE) sur un object_id NULL, parce que
  -- `NULL IN (<ensemble non vide>)` vaut NULL — `IF NOT NULL THEN` n'est alors pas pris, et
  -- la garde laisse passer. pending_change.object_id EST nullable, et api.submit_pending_change
  -- (exécutable par tout `authenticated`) accepte p_object_id NULL en sautant son propre
  -- contrôle de lisibilité : une ligne orpheline est donc fabricable. Tant que rpc NULL était
  -- refusé avant toute écriture, ce trou était inerte ; la branche attestée est la PREMIÈRE
  -- écriture atteignable derrière cette garde — un agent sans aucun droit sur la ligne y
  -- signerait une attestation nominative. La fonction sœur list_pending_changes filtre déjà
  -- `pc.object_id IS NOT NULL` : l'asymétrie était un oubli. Les gardes jumelles de §7.2
  -- n'en ont pas besoin — elles portent sur fiche_submission.object_id, déclaré NOT NULL.
  IF v_row.object_id IS NULL OR NOT api.user_can_moderate_object(v_row.object_id) THEN
    RAISE EXCEPTION 'Droits de modération insuffisants sur cet objet' USING ERRCODE = '42501';
  END IF;

  v_rpc := v_row.metadata->>'rpc';

  IF v_rpc IS NULL THEN
    -- 18a/D9 : un changement manual_apply devient APPROUVABLE — à la seule condition que le
    -- modérateur ATTESTE l'avoir reporté à la main dans l'éditeur. Aucun SQL ne peut vérifier
    -- ce report ; ce que la base peut faire, et fait ici, c'est le rendre ATTESTABLE.
    IF NOT COALESCE(p_applied_manually, FALSE) THEN
      -- Message ADRESSÉ au conseiller, pas au développeur : c'est le refus le plus courant du
      -- nouveau flux (5 rubriques sur 7 sont manual_apply), et il doit dire le REMÈDE. Le
      -- jargon précédent (« RPC de re-dispatch absent… ») n'indiquait rien : le conseiller
      -- appelait le support, ou refusait la soumission par dépit — et le prestataire recevait
      -- un refus injustifié. Il doit surtout être DISTINCT de celui du writer non autorisé
      -- ci-dessous, qui demande l'action INVERSE (ne surtout pas valider).
      RAISE EXCEPTION 'Cette rubrique n''a pas de report automatique : reportez la modification dans l''éditeur, puis cochez « j''ai reporté ces modifications » pour la valider'
        USING ERRCODE = '22023';
    END IF;
    UPDATE pending_change
       SET status      = 'approved',   -- approved ≠ applied : attesté par un humain, pas écrit par la machine
           reviewed_by = v_uid,
           reviewed_at = v_now,
           review_note = p_review_note,
           -- Trace EXPLICITE, et non dérivée. « status='approved' AND applied_at IS NULL »
           -- dit la même chose aujourd'hui, mais c'est une inférence : le premier remaniement
           -- des statuts l'efface sans bruit. reviewed_by seul ne suffit pas non plus — un
           -- REJET en pose un aussi. On écrit donc le fait lui-même, avec son auteur et sa
           -- date. Clé distincte de metadata.manual_apply, qui est la DÉCLARATION du
           -- soumetteur (« cette rubrique n'a pas de writer ») : ici c'est l'ATTESTATION du
           -- modérateur (« je l'ai reportée »). Deux faits, deux clés, deux responsables.
           metadata    = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                           'applied_manually', TRUE,
                           'attested_by', v_uid,
                           'attested_at', v_now),
           updated_at  = v_now
     WHERE id = p_id;
    RETURN jsonb_build_object('success', true, 'id', p_id, 'status', 'approved', 'reviewed_at', v_now);
  END IF;

  -- Un writer PRÉSENT mais hors whitelist reste refusé, attestation ou pas : l'attestation
  -- ne couvre que l'ABSENCE de route automatique. Sans cette branche distincte du bras
  -- « v_rpc IS NULL », p_applied_manually deviendrait un interrupteur d'approbation
  -- universel, capable d'ouvrir n'importe quelle enveloppe déposée par un autre chemin.
  IF NOT (v_rpc = ANY(v_allowed)) THEN
    -- Ici l'enveloppe porte un writer RÉEL hors whitelist : ce n'est pas une rubrique à
    -- reporter, c'est une anomalie. Le conseiller ne doit surtout pas « valider quand même ».
    RAISE EXCEPTION 'Anomalie sur cette suggestion (writer « % » non autorisé) : ne la validez pas, signalez-la à l''administrateur', v_rpc
      USING ERRCODE = '22023';
  END IF;

  -- Re-dispatch vers le writer structuré (signature uniforme (p_object_id, p_payload)).
  -- %I quote l'identifiant ; le nom est en outre whitelisté ci-dessus. AS THE CALLER : le
  -- writer re-vérifie ses propres gates d'écriture canonique contre auth.uid().
  EXECUTE format('SELECT api.%I($1, $2)', v_rpc) USING v_row.object_id, v_row.payload;

  UPDATE pending_change
     SET status      = 'applied',
         reviewed_by = v_uid,
         reviewed_at = v_now,
         applied_at  = v_now,
         review_note = p_review_note,
         updated_at  = v_now
   WHERE id = p_id;

  RETURN jsonb_build_object('success', true, 'id', p_id, 'status', 'applied', 'applied_at', v_now);
END;
$function$;
REVOKE ALL ON FUNCTION api.actor_portal_floor_modules() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.actor_portal_floor_modules() TO authenticated,service_role;


COMMIT;
NOTIFY pgrst,'reload schema';
