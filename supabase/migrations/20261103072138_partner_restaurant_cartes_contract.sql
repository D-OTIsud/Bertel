-- C: restaurant cartes only. New private receipt/transaction contracts; no public API shape change.
-- Actor activation remains OFF until the safe office client and targeted DML cutover are ready.
BEGIN;
CREATE SCHEMA IF NOT EXISTS internal;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('restaurant-cartes-private','restaurant-cartes-private',false,10485760,ARRAY['application/pdf','image/jpeg'])
ON CONFLICT(id) DO NOTHING;
DO $bucket$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM storage.buckets b WHERE b.id='restaurant-cartes-private' AND NOT b.public
   AND b.file_size_limit=10485760 AND b.allowed_mime_types @> ARRAY['application/pdf','image/jpeg']::text[]) THEN
   RAISE EXCEPTION 'Restaurant carte staging bucket has an incompatible contract';
 END IF;
END $bucket$;
-- Restrictive storage rules protect this new bucket/prefix even beside permissive policies.
CREATE POLICY restaurant_carte_staging_read ON storage.objects AS RESTRICTIVE FOR SELECT TO anon,authenticated
 USING(bucket_id<>'restaurant-cartes-private');
CREATE POLICY restaurant_carte_storage_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO anon,authenticated
 WITH CHECK(bucket_id<>'restaurant-cartes-private' AND NOT(bucket_id='documents' AND name ~ '^[A-Z]{3}[A-Z0-9]{13}/cartes/'));
CREATE POLICY restaurant_carte_storage_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon,authenticated
 USING(bucket_id<>'restaurant-cartes-private' AND NOT(bucket_id='documents' AND name ~ '^[A-Z]{3}[A-Z0-9]{13}/cartes/'))
 WITH CHECK(bucket_id<>'restaurant-cartes-private' AND NOT(bucket_id='documents' AND name ~ '^[A-Z]{3}[A-Z0-9]{13}/cartes/'));
CREATE POLICY restaurant_carte_storage_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO anon,authenticated
 USING(bucket_id<>'restaurant-cartes-private' AND NOT(bucket_id='documents' AND name ~ '^[A-Z]{3}[A-Z0-9]{13}/cartes/'));

CREATE TABLE internal.restaurant_carte_rollout (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  partner_enabled boolean NOT NULL DEFAULT false
);
INSERT INTO internal.restaurant_carte_rollout(singleton,partner_enabled) VALUES(true,false);

CREATE TABLE internal.restaurant_carte_upload (
  id uuid PRIMARY KEY,
  object_id text NOT NULL REFERENCES public.object(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  document_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  filename text NOT NULL CHECK(length(filename) BETWEEN 1 AND 180),
  sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
  byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 10485760),
  mime_type text NOT NULL CHECK(mime_type IN ('application/pdf','image/jpeg')),
  staging_path text NOT NULL UNIQUE,
  public_path text NOT NULL UNIQUE,
  public_url text,
  state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','staged','copied')),
  created_at timestamptz NOT NULL DEFAULT now(),
  staged_at timestamptz,
  copied_at timestamptz,
  CHECK((state='reserved' AND staged_at IS NULL AND copied_at IS NULL AND public_url IS NULL)
     OR (state='staged' AND staged_at IS NOT NULL AND copied_at IS NULL AND public_url IS NULL)
     OR (state='copied' AND staged_at IS NOT NULL AND copied_at IS NOT NULL AND public_url IS NOT NULL))
);
CREATE INDEX restaurant_carte_upload_owner ON internal.restaurant_carte_upload(created_by,object_id,created_at);

CREATE TABLE internal.restaurant_carte_mutation (
  id uuid PRIMARY KEY,
  object_id text NOT NULL REFERENCES public.object(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
  state text NOT NULL DEFAULT 'prepared' CHECK(state IN ('prepared','committed')),
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz,
  CHECK((state='prepared' AND result IS NULL AND committed_at IS NULL)
     OR (state='committed' AND result IS NOT NULL AND committed_at IS NOT NULL))
);
CREATE INDEX restaurant_carte_mutation_owner ON internal.restaurant_carte_mutation(created_by,object_id,created_at);
ALTER TABLE internal.restaurant_carte_rollout ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal.restaurant_carte_upload ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal.restaurant_carte_mutation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal.restaurant_carte_rollout,internal.restaurant_carte_upload,internal.restaurant_carte_mutation FROM PUBLIC,anon,authenticated,service_role;

-- A narrow gate: staff retain their canonical right; actors get only their RES card domain.
CREATE FUNCTION internal.restaurant_carte_assert_user(p_object_id text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,pg_temp AS $fn$
DECLARE v_actor boolean:=coalesce(api.is_actor_persona(),false); v_visibility jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.object o WHERE o.id=p_object_id AND o.object_type='RES'
   AND o.is_test=(SELECT api.current_user_test_realm())) THEN
   RAISE EXCEPTION 'Restaurant inaccessible' USING ERRCODE='42501';
 END IF;
 IF v_actor THEN
   IF NOT coalesce((SELECT partner_enabled FROM internal.restaurant_carte_rollout WHERE singleton),false) THEN
     RAISE EXCEPTION 'Mise à jour des cartes non activée' USING ERRCODE='42501';
   END IF;
   IF api.current_user_actor_id() IS NULL OR NOT EXISTS(SELECT 1 FROM api.current_user_portal_object_ids() id WHERE id=p_object_id) THEN
     RAISE EXCEPTION 'Restaurant hors périmètre' USING ERRCODE='42501';
   END IF;
   v_visibility:=api.get_portal_section_visibility(p_object_id);
   IF coalesce(v_visibility->'masked_modules','[]'::jsonb) ? 'menus'
      OR coalesce(v_visibility->'floor_modules','[]'::jsonb) ? 'menus' THEN
     RAISE EXCEPTION 'Cartes gérées par l’office' USING ERRCODE='42501';
   END IF;
 ELSE
   IF NOT coalesce(api.user_can_write_object_canonical(p_object_id),false) THEN
     RAISE EXCEPTION 'Restaurant non modifiable' USING ERRCODE='42501';
   END IF;
 END IF;
 RETURN v_actor;
END $fn$;

CREATE FUNCTION internal.restaurant_carte_link_snapshot(p_object_id text,p_document_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
 SELECT jsonb_build_object('object_id',od.object_id,'document_id',od.document_id,'role_id',od.role_id,
   'title',od.title,'valid_from',od.valid_from,'valid_to',od.valid_to,'position',od.position,
   'document',jsonb_build_object('url',d.url,'title',d.title,'access_scope',d.access_scope,
     'valid_from',d.valid_from,'valid_to',d.valid_to,'storage_bucket',d.storage_bucket,'storage_path',d.storage_path))
 FROM public.object_document od JOIN public.ref_document d ON d.id=od.document_id
 JOIN public.ref_code_document_type r ON r.id=od.role_id AND r.code='carte'
 WHERE od.object_id=p_object_id AND od.document_id=p_document_id;
$fn$;

CREATE FUNCTION internal.restaurant_cartes_json(p_object_id text,p_actor boolean) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,internal,pg_temp AS $fn$
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'documentId',od.document_id,'url',d.url,'title',coalesce(od.title,d.title,''),
  'validFrom',coalesce(od.valid_from::text,''),'validTo',coalesce(od.valid_to::text,''),'position',od.position,
  'expected',internal.restaurant_carte_link_snapshot(od.object_id,od.document_id),
  'publicAvailable',o.status='published' AND d.access_scope='public' AND d.url ~ '^https?://[^/]+/'
    AND (od.valid_from IS NULL OR od.valid_from<=CURRENT_DATE) AND (od.valid_to IS NULL OR od.valid_to>=CURRENT_DATE)
    AND (d.valid_from IS NULL OR d.valid_from<=CURRENT_DATE) AND (d.valid_to IS NULL OR d.valid_to>=CURRENT_DATE)
 ) ORDER BY od.position,od.document_id),'[]'::jsonb)
 FROM public.object_document od JOIN public.ref_document d ON d.id=od.document_id
 JOIN public.ref_code_document_type r ON r.id=od.role_id AND r.code='carte'
 JOIN public.object o ON o.id=od.object_id
 WHERE od.object_id=p_object_id AND (NOT p_actor OR d.access_scope='public');
$fn$;

CREATE FUNCTION api.read_restaurant_cartes(p_object_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,pg_temp AS $fn$
DECLARE v_actor boolean:=internal.restaurant_carte_assert_user(p_object_id);
BEGIN RETURN internal.restaurant_cartes_json(p_object_id,v_actor); END $fn$;

CREATE FUNCTION internal.restaurant_carte_upload_json(p_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,internal,pg_temp AS $fn$
 SELECT jsonb_build_object('id',u.id,'objectId',u.object_id,'documentId',u.document_id,'filename',u.filename,
  'sha256',u.sha256,'byteSize',u.byte_size,'mimeType',u.mime_type,'state',u.state,
  'stagingBucket','restaurant-cartes-private','stagingPath',u.staging_path,
  'publicBucket','documents','publicPath',u.public_path,'publicUrl',u.public_url)
 FROM internal.restaurant_carte_upload u WHERE u.id=p_id;
$fn$;

CREATE FUNCTION api.prepare_restaurant_carte_upload(p_object_id text,p_request_id uuid,p_filename text,p_sha256 text,p_byte_size integer,p_mime_type text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,pg_temp SET lock_timeout='5s' AS $fn$
DECLARE v_actor boolean:=internal.restaurant_carte_assert_user(p_object_id); v_upload internal.restaurant_carte_upload%ROWTYPE; v_ext text;
BEGIN
 IF p_request_id IS NULL OR p_filename IS NULL OR length(p_filename) NOT BETWEEN 1 AND 180
  OR p_sha256 IS NULL OR p_sha256 !~ '^[0-9a-f]{64}$' OR p_byte_size IS NULL OR p_byte_size NOT BETWEEN 1 AND 10485760
  OR p_mime_type IS NULL OR p_mime_type NOT IN ('application/pdf','image/jpeg') THEN
  RAISE EXCEPTION 'Fichier invalide' USING ERRCODE='22023'; END IF;
 v_ext:=CASE p_mime_type WHEN 'application/pdf' THEN 'pdf' ELSE 'jpg' END;
 INSERT INTO internal.restaurant_carte_upload(id,object_id,created_by,filename,sha256,byte_size,mime_type,staging_path,public_path)
 VALUES(p_request_id,p_object_id,auth.uid(),p_filename,p_sha256,p_byte_size,p_mime_type,
   'restaurant-cartes/'||p_object_id||'/'||p_request_id||'.'||v_ext,
   p_object_id||'/cartes/'||p_request_id||'.'||v_ext)
 ON CONFLICT(id) DO NOTHING;
 SELECT * INTO v_upload FROM internal.restaurant_carte_upload WHERE id=p_request_id FOR UPDATE;
 IF v_upload.created_by IS DISTINCT FROM auth.uid() OR v_upload.object_id IS DISTINCT FROM p_object_id THEN
   RAISE EXCEPTION 'Dépôt inaccessible' USING ERRCODE='42501'; END IF;
 IF (v_upload.filename,v_upload.sha256,v_upload.byte_size,v_upload.mime_type)
     IS DISTINCT FROM (p_filename,p_sha256,p_byte_size,p_mime_type) THEN
   RAISE EXCEPTION 'Identifiant de dépôt déjà utilisé' USING ERRCODE='PT409'; END IF;
 RETURN internal.restaurant_carte_upload_json(p_request_id);
END $fn$;

CREATE FUNCTION api.get_restaurant_carte_upload(p_upload_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,pg_temp AS $fn$
DECLARE v_upload internal.restaurant_carte_upload%ROWTYPE;
BEGIN
 SELECT * INTO v_upload FROM internal.restaurant_carte_upload WHERE id=p_upload_id;
 IF NOT FOUND OR v_upload.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Dépôt inaccessible' USING ERRCODE='42501'; END IF;
 PERFORM internal.restaurant_carte_assert_user(v_upload.object_id);
 RETURN internal.restaurant_carte_upload_json(p_upload_id);
END $fn$;

-- Trusted route receipts only. Client metadata never proves that bytes exist or were copied.
CREATE FUNCTION api.record_restaurant_carte_staged(p_upload_id uuid,p_sha256 text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,storage,pg_temp SET lock_timeout='5s' AS $fn$
DECLARE v_upload internal.restaurant_carte_upload%ROWTYPE;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Serveur requis' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_upload FROM internal.restaurant_carte_upload WHERE id=p_upload_id FOR UPDATE;
 IF NOT FOUND OR v_upload.sha256 IS DISTINCT FROM p_sha256 OR NOT EXISTS(
   SELECT 1 FROM storage.objects s WHERE s.bucket_id='restaurant-cartes-private' AND s.name=v_upload.staging_path) THEN
   RAISE EXCEPTION 'Dépôt non confirmé' USING ERRCODE='PT409'; END IF;
 UPDATE internal.restaurant_carte_upload SET state='staged',staged_at=now() WHERE id=p_upload_id AND state='reserved';
 RETURN internal.restaurant_carte_upload_json(p_upload_id);
END $fn$;

CREATE FUNCTION api.record_restaurant_carte_copied(p_upload_id uuid,p_sha256 text,p_public_url text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,storage,pg_temp SET lock_timeout='5s' AS $fn$
DECLARE v_upload internal.restaurant_carte_upload%ROWTYPE;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Serveur requis' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_upload FROM internal.restaurant_carte_upload WHERE id=p_upload_id FOR UPDATE;
 IF NOT FOUND OR v_upload.state='reserved' OR v_upload.sha256 IS DISTINCT FROM p_sha256
   OR p_public_url IS NULL OR p_public_url !~ '^https://[^/]+/storage/v1/object/public/documents/'
   OR right(p_public_url,length('/storage/v1/object/public/documents/'||v_upload.public_path))
      IS DISTINCT FROM '/storage/v1/object/public/documents/'||v_upload.public_path
   OR NOT EXISTS(SELECT 1 FROM storage.objects s WHERE s.bucket_id='documents' AND s.name=v_upload.public_path) THEN
   RAISE EXCEPTION 'Copie non confirmée' USING ERRCODE='PT409'; END IF;
 IF v_upload.state='copied' AND v_upload.public_url IS DISTINCT FROM p_public_url THEN
   RAISE EXCEPTION 'Copie incompatible' USING ERRCODE='PT409'; END IF;
 UPDATE internal.restaurant_carte_upload SET state='copied',public_url=p_public_url,copied_at=coalesce(copied_at,now()) WHERE id=p_upload_id;
 RETURN internal.restaurant_carte_upload_json(p_upload_id);
END $fn$;

CREATE FUNCTION api.prepare_restaurant_carte_mutation(p_object_id text,p_request_id uuid,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,pg_temp SET lock_timeout='5s' AS $fn$
DECLARE v_actor boolean:=internal.restaurant_carte_assert_user(p_object_id); v_mutation internal.restaurant_carte_mutation%ROWTYPE;
 v_action text:=p_payload->>'action'; v_document uuid; v_upload uuid; v_snapshot jsonb; v_patch jsonb:=coalesce(p_payload->'patch','{}');
BEGIN
 IF p_request_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
  OR p_payload->>'write_contract' IS DISTINCT FROM 'restaurant-carte-v1'
  OR v_action IS NULL OR v_action NOT IN ('publish','metadata','remove','link-existing')
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN ('write_contract','action','document_id','upload_id','expected','patch'))
  OR jsonb_typeof(v_patch) IS DISTINCT FROM 'object'
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_patch) k WHERE k NOT IN ('title','valid_from','valid_to','position')) THEN
   RAISE EXCEPTION 'Mutation carte invalide' USING ERRCODE='22023'; END IF;
 IF v_actor AND v_action='link-existing' THEN RAISE EXCEPTION 'Dépôt personnel requis' USING ERRCODE='42501'; END IF;
 BEGIN
  v_document:=nullif(p_payload->>'document_id','')::uuid; v_upload:=nullif(p_payload->>'upload_id','')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Identifiant invalide' USING ERRCODE='22023'; END;
 IF v_action='publish' THEN
  IF v_upload IS NULL OR NOT EXISTS(SELECT 1 FROM internal.restaurant_carte_upload u
    WHERE u.id=v_upload AND u.object_id=p_object_id AND u.created_by=auth.uid() AND u.state IN ('staged','copied')) THEN
   RAISE EXCEPTION 'Dépôt indisponible' USING ERRCODE='42501'; END IF;
 ELSIF v_upload IS NOT NULL THEN RAISE EXCEPTION 'Dépôt inattendu' USING ERRCODE='22023'; END IF;
 IF v_action IN ('metadata','remove','link-existing') AND v_document IS NULL THEN
   RAISE EXCEPTION 'Carte cible requise' USING ERRCODE='22023'; END IF;
 IF v_action='remove' AND v_patch<>'{}'::jsonb THEN RAISE EXCEPTION 'Champs inattendus' USING ERRCODE='22023'; END IF;
 IF v_patch ? 'title' AND jsonb_typeof(v_patch->'title') NOT IN ('string','null') THEN RAISE EXCEPTION 'Titre invalide' USING ERRCODE='22023'; END IF;
 IF length(coalesce(v_patch->>'title',''))>180 THEN RAISE EXCEPTION 'Titre trop long' USING ERRCODE='22023'; END IF;
 IF (v_patch ? 'valid_from' AND jsonb_typeof(v_patch->'valid_from') NOT IN ('string','null'))
  OR (v_patch ? 'valid_to' AND jsonb_typeof(v_patch->'valid_to') NOT IN ('string','null')) THEN
   RAISE EXCEPTION 'Dates invalides' USING ERRCODE='22023'; END IF;
 BEGIN
  IF nullif(v_patch->>'valid_from','') IS NOT NULL AND v_patch->>'valid_from' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Date ISO requise' USING ERRCODE='22023'; END IF;
  IF nullif(v_patch->>'valid_to','') IS NOT NULL AND v_patch->>'valid_to' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Date ISO requise' USING ERRCODE='22023'; END IF;
  IF v_patch ? 'valid_from' THEN PERFORM nullif(v_patch->>'valid_from','')::date; END IF;
  IF v_patch ? 'valid_to' THEN PERFORM nullif(v_patch->>'valid_to','')::date; END IF;
  IF v_patch ? 'position' THEN
   IF jsonb_typeof(v_patch->'position') IS DISTINCT FROM 'number' OR v_patch->>'position' !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Position entière requise' USING ERRCODE='22023'; END IF;
   IF (v_patch->>'position')::integer NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Position invalide' USING ERRCODE='22023'; END IF;
  END IF;
 EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN
  RAISE EXCEPTION 'Valeur invalide' USING ERRCODE='22023'; END;
 INSERT INTO internal.restaurant_carte_mutation(id,object_id,created_by,payload)
 VALUES(p_request_id,p_object_id,auth.uid(),p_payload) ON CONFLICT(id) DO NOTHING;
 SELECT * INTO v_mutation FROM internal.restaurant_carte_mutation WHERE id=p_request_id FOR UPDATE;
 IF v_mutation.created_by IS DISTINCT FROM auth.uid() OR v_mutation.object_id IS DISTINCT FROM p_object_id THEN
   RAISE EXCEPTION 'Opération inaccessible' USING ERRCODE='42501'; END IF;
 IF v_mutation.payload IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'Identifiant déjà utilisé' USING ERRCODE='PT409'; END IF;
 IF v_mutation.state='committed' THEN RETURN jsonb_build_object('state','committed','result',v_mutation.result); END IF;
 IF v_action<>'link-existing' AND v_document IS NOT NULL THEN
  v_snapshot:=internal.restaurant_carte_link_snapshot(p_object_id,v_document);
  IF v_snapshot IS NULL OR (v_actor AND v_snapshot->'document'->>'access_scope'<>'public') THEN
    RAISE EXCEPTION 'Carte inaccessible' USING ERRCODE='42501'; END IF;
  IF p_payload->'expected' IS DISTINCT FROM v_snapshot THEN RAISE EXCEPTION 'La carte a changé' USING ERRCODE='PT409'; END IF;
 ELSIF coalesce(p_payload->'expected','null')<>'null'::jsonb THEN
   RAISE EXCEPTION 'Précondition invalide' USING ERRCODE='22023';
 END IF;
 RETURN jsonb_build_object('state','prepared','upload',CASE WHEN v_upload IS NOT NULL THEN internal.restaurant_carte_upload_json(v_upload) ELSE NULL END);
END $fn$;

CREATE FUNCTION api.finalize_restaurant_carte_mutation(p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,pg_temp SET lock_timeout='5s' AS $fn$
DECLARE v_mutation internal.restaurant_carte_mutation%ROWTYPE; v_upload internal.restaurant_carte_upload%ROWTYPE;
 v_actor boolean; v_action text; v_target uuid; v_new uuid; v_role uuid; v_snapshot jsonb; v_patch jsonb;
 v_title text; v_from date; v_to date; v_position integer; v_result jsonb;
BEGIN
 -- Lock order for this domain is object -> mutation -> targeted link/document -> upload.
 SELECT * INTO v_mutation FROM internal.restaurant_carte_mutation WHERE id=p_request_id;
 IF NOT FOUND OR v_mutation.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Opération inaccessible' USING ERRCODE='42501'; END IF;
 v_actor:=internal.restaurant_carte_assert_user(v_mutation.object_id);
 PERFORM 1 FROM public.object WHERE id=v_mutation.object_id FOR UPDATE;
 v_actor:=internal.restaurant_carte_assert_user(v_mutation.object_id);
 SELECT * INTO v_mutation FROM internal.restaurant_carte_mutation WHERE id=p_request_id FOR UPDATE;
 IF v_mutation.state='committed' THEN RETURN v_mutation.result; END IF;
 v_action:=v_mutation.payload->>'action'; v_target:=nullif(v_mutation.payload->>'document_id','')::uuid;
 v_patch:=coalesce(v_mutation.payload->'patch','{}');
 IF v_action<>'link-existing' AND v_target IS NOT NULL THEN
   PERFORM 1 FROM public.object_document WHERE object_id=v_mutation.object_id AND document_id=v_target FOR UPDATE;
   PERFORM 1 FROM public.ref_document WHERE id=v_target FOR UPDATE;
   v_snapshot:=internal.restaurant_carte_link_snapshot(v_mutation.object_id,v_target);
   IF v_snapshot IS NULL OR (v_actor AND v_snapshot->'document'->>'access_scope'<>'public') THEN
     RAISE EXCEPTION 'Carte inaccessible' USING ERRCODE='42501'; END IF;
   IF v_mutation.payload->'expected' IS DISTINCT FROM v_snapshot THEN RAISE EXCEPTION 'La carte a changé' USING ERRCODE='PT409'; END IF;
 END IF;
 SELECT id INTO v_role FROM public.ref_code_document_type WHERE code='carte';
 IF v_role IS NULL THEN RAISE EXCEPTION 'Rôle carte absent' USING ERRCODE='22023'; END IF;
 IF v_action='remove' THEN
   DELETE FROM public.object_document WHERE object_id=v_mutation.object_id AND document_id=v_target AND role_id=v_role;
 ELSE
   v_title:=CASE WHEN v_patch ? 'title' THEN nullif(btrim(v_patch->>'title'),'') ELSE v_snapshot->>'title' END;
   v_from:=CASE WHEN v_patch ? 'valid_from' THEN nullif(v_patch->>'valid_from','')::date ELSE (v_snapshot->>'valid_from')::date END;
   v_to:=CASE WHEN v_patch ? 'valid_to' THEN nullif(v_patch->>'valid_to','')::date ELSE (v_snapshot->>'valid_to')::date END;
   v_position:=CASE WHEN v_patch ? 'position' THEN (v_patch->>'position')::integer ELSE (v_snapshot->>'position')::integer END;
   IF v_from IS NOT NULL AND v_to IS NOT NULL AND v_to<v_from THEN RAISE EXCEPTION 'Période invalide' USING ERRCODE='22023'; END IF;
   IF v_position IS NULL THEN SELECT coalesce(max(position),0)+1 INTO v_position FROM public.object_document WHERE object_id=v_mutation.object_id AND role_id=v_role; END IF;
   IF v_action='publish' THEN
     SELECT * INTO v_upload FROM internal.restaurant_carte_upload WHERE id=(v_mutation.payload->>'upload_id')::uuid FOR UPDATE;
     IF NOT FOUND OR v_upload.created_by IS DISTINCT FROM auth.uid() OR v_upload.object_id IS DISTINCT FROM v_mutation.object_id
       OR v_upload.state<>'copied' OR v_upload.public_url IS NULL OR NOT EXISTS(SELECT 1 FROM storage.objects s WHERE s.bucket_id='documents' AND s.name=v_upload.public_path) THEN
       RAISE EXCEPTION 'Copie non prête' USING ERRCODE='PT409'; END IF;
     v_new:=v_upload.document_id;
     IF EXISTS(SELECT 1 FROM public.ref_document d WHERE d.id=v_new AND
       (d.url IS DISTINCT FROM v_upload.public_url OR d.storage_bucket IS DISTINCT FROM 'documents' OR d.storage_path IS DISTINCT FROM v_upload.public_path OR d.access_scope<>'public')) THEN
       RAISE EXCEPTION 'Document incompatible' USING ERRCODE='PT409'; END IF;
     INSERT INTO public.ref_document(id,url,title,storage_bucket,storage_path,access_scope,extra)
     VALUES(v_new,v_upload.public_url,coalesce(v_title,v_upload.filename),'documents',v_upload.public_path,'public',
       jsonb_build_object('source','restaurant_carte','upload_id',v_upload.id))
     ON CONFLICT(id) DO NOTHING;
     IF EXISTS(SELECT 1 FROM public.object_document WHERE object_id=v_mutation.object_id AND document_id=v_new) THEN
       RAISE EXCEPTION 'Dépôt déjà lié à la fiche' USING ERRCODE='PT409'; END IF;
     INSERT INTO public.object_document(object_id,document_id,role_id,title,valid_from,valid_to,position)
     VALUES(v_mutation.object_id,v_new,v_role,v_title,v_from,v_to,v_position);
     IF v_target IS NOT NULL THEN DELETE FROM public.object_document WHERE object_id=v_mutation.object_id AND document_id=v_target AND role_id=v_role; END IF;
   ELSIF v_action='link-existing' THEN
     IF v_actor THEN RAISE EXCEPTION 'Réservé à l’office' USING ERRCODE='42501'; END IF;
     PERFORM 1 FROM public.ref_document d WHERE d.id=v_target AND d.access_scope='public' AND d.url ~ '^https?://[^/]+/' FOR UPDATE;
     IF NOT FOUND THEN RAISE EXCEPTION 'Document public requis' USING ERRCODE='42501'; END IF;
     INSERT INTO public.object_document(object_id,document_id,role_id,title,valid_from,valid_to,position)
     VALUES(v_mutation.object_id,v_target,v_role,v_title,v_from,v_to,v_position);
   ELSE
     UPDATE public.object_document SET title=v_title,valid_from=v_from,valid_to=v_to,position=v_position
     WHERE object_id=v_mutation.object_id AND document_id=v_target AND role_id=v_role;
   END IF;
 END IF;
 UPDATE public.object SET updated_at=now() WHERE id=v_mutation.object_id;
 v_result:=jsonb_build_object('requestId',p_request_id,'cartes',internal.restaurant_cartes_json(v_mutation.object_id,v_actor));
 UPDATE internal.restaurant_carte_mutation SET state='committed',result=v_result,committed_at=now() WHERE id=p_request_id;
 RETURN v_result;
END $fn$;

CREATE FUNCTION api.get_restaurant_carte_mutation(p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,pg_temp AS $fn$
DECLARE v_mutation internal.restaurant_carte_mutation%ROWTYPE;
BEGIN
 SELECT * INTO v_mutation FROM internal.restaurant_carte_mutation WHERE id=p_request_id;
 IF NOT FOUND OR v_mutation.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Opération inaccessible' USING ERRCODE='42501'; END IF;
 PERFORM internal.restaurant_carte_assert_user(v_mutation.object_id);
 RETURN jsonb_build_object('state',v_mutation.state,'result',v_mutation.result);
END $fn$;

REVOKE ALL ON FUNCTION internal.restaurant_carte_assert_user(text),internal.restaurant_carte_link_snapshot(text,uuid),
 internal.restaurant_cartes_json(text,boolean),internal.restaurant_carte_upload_json(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION api.read_restaurant_cartes(text),api.prepare_restaurant_carte_upload(text,uuid,text,text,integer,text),
 api.get_restaurant_carte_upload(uuid),api.prepare_restaurant_carte_mutation(text,uuid,jsonb),
 api.finalize_restaurant_carte_mutation(uuid),api.get_restaurant_carte_mutation(uuid),
 api.record_restaurant_carte_staged(uuid,text),api.record_restaurant_carte_copied(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.read_restaurant_cartes(text),api.prepare_restaurant_carte_upload(text,uuid,text,text,integer,text),
 api.get_restaurant_carte_upload(uuid),api.prepare_restaurant_carte_mutation(text,uuid,jsonb),
 api.finalize_restaurant_carte_mutation(uuid),api.get_restaurant_carte_mutation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION api.record_restaurant_carte_staged(uuid,text),api.record_restaurant_carte_copied(uuid,text,text) TO service_role;
COMMENT ON TABLE internal.restaurant_carte_rollout IS 'C only: actor activation is OFF until safe office conversion and role-carte DML cutover are verified.';
COMMENT ON TABLE internal.restaurant_carte_upload IS 'Private durable proof of a staged and copied restaurant card; storage bytes are never deleted on an uncertain result.';
COMMENT ON TABLE internal.restaurant_carte_mutation IS 'One targeted card mutation, immutable request payload, compare-and-swap, stable IDs and durable replay result.';
COMMIT;
NOTIFY pgrst,'reload schema';
