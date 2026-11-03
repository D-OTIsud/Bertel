-- E: partner-only persistent extraction. No quota value/provider/actor activation is enabled here.
BEGIN;
CREATE TABLE internal.menu_extraction_settings (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 enabled boolean NOT NULL DEFAULT false,
 daily_page_limit integer CHECK(daily_page_limit BETWEEN 1 AND 1000),
 CHECK(NOT enabled OR daily_page_limit IS NOT NULL)
);
INSERT INTO internal.menu_extraction_settings(singleton,enabled,daily_page_limit) VALUES(true,false,NULL);
CREATE TABLE internal.menu_extraction_day (
 user_id uuid NOT NULL, local_day date NOT NULL,
 reserved_pages integer NOT NULL DEFAULT 0 CHECK(reserved_pages>=0),
 consumed_pages integer NOT NULL DEFAULT 0 CHECK(consumed_pages>=0),
 PRIMARY KEY(user_id,local_day)
);
CREATE TABLE internal.menu_extraction_operation (
 id uuid PRIMARY KEY, object_id text NOT NULL REFERENCES public.object(id) ON DELETE CASCADE,
 created_by uuid NOT NULL, source_refs jsonb NOT NULL, target_menu_id uuid,
 context jsonb NOT NULL, source_stats jsonb NOT NULL, request_meta jsonb NOT NULL,
 page_count integer NOT NULL CHECK(page_count BETWEEN 1 AND 8),
 state text NOT NULL DEFAULT 'inspected' CHECK(state IN ('inspected','reserved','preparing','started','succeeded','failed','cancelled')),
 local_day date, claim_id uuid, claimed_at timestamptz, started_at timestamptz,
 result jsonb, draft jsonb, draft_version integer NOT NULL DEFAULT 0 CHECK(draft_version>=0), error_code text,
 published_result jsonb, published_menu_ids uuid[], published_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
);
CREATE INDEX menu_extraction_operation_owner ON internal.menu_extraction_operation(created_by,created_at);
CREATE INDEX menu_extraction_operation_published_object ON internal.menu_extraction_operation(object_id)
 WHERE state='succeeded' AND published_at IS NOT NULL AND published_result IS NOT NULL;
ALTER TABLE internal.menu_extraction_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal.menu_extraction_day ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal.menu_extraction_operation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal.menu_extraction_settings,internal.menu_extraction_day,internal.menu_extraction_operation FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION internal.menu_extraction_storage_snapshot(p_bucket text,p_path text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,storage,pg_temp AS $fn$
 SELECT jsonb_build_object('id',s.id,'bucket',s.bucket_id,'path',s.name,
  'updatedAt',to_jsonb(s)->'updated_at','version',to_jsonb(s)->'version','metadata',s.metadata)
 FROM storage.objects s WHERE s.bucket_id=p_bucket AND s.name=p_path;
$fn$;
CREATE FUNCTION api.menu_extraction_storage_receipt(p_bucket text,p_path text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,internal,pg_temp AS $fn$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR p_bucket NOT IN ('restaurant-cartes-private','documents') THEN
  RAISE EXCEPTION 'Serveur requis' USING ERRCODE='42501'; END IF;
 RETURN internal.menu_extraction_storage_snapshot(p_bucket,p_path);
END $fn$;

CREATE FUNCTION internal.menu_extraction_context(p_object_id text,p_sources jsonb,p_target_menu_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,pg_temp AS $fn$
DECLARE v_source jsonb; v_rows jsonb:='[]'; v_id uuid; v_upload internal.restaurant_carte_upload%ROWTYPE;
 v_link jsonb; v_doc public.ref_document%ROWTYPE; v_target jsonb; v_page jsonb;
BEGIN
 PERFORM internal.assert_portal_menu_write(p_object_id);
 IF jsonb_typeof(p_sources) IS DISTINCT FROM 'array' OR jsonb_array_length(p_sources) NOT BETWEEN 1 AND 8
   OR (SELECT count(DISTINCT (s->>'kind',s->>'id')) FROM jsonb_array_elements(p_sources) s)<>jsonb_array_length(p_sources) THEN
  RAISE EXCEPTION 'Sources invalides' USING ERRCODE='22023'; END IF;
 IF p_target_menu_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.object_menu m WHERE m.id=p_target_menu_id AND m.object_id=p_object_id AND m.visibility='public') THEN
   RAISE EXCEPTION 'Menu inaccessible' USING ERRCODE='42501'; END IF;
  v_target:=internal.object_menu_delete_bundle(internal.object_menu_write_snapshot(p_object_id),p_target_menu_id,true);
 END IF;
 FOR v_source IN SELECT value FROM jsonb_array_elements(p_sources) LOOP
  IF jsonb_typeof(v_source) IS DISTINCT FROM 'object'
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_source) k WHERE k NOT IN ('kind','id','pages','expected'))
   OR v_source->>'kind' IS NULL OR v_source->>'kind' NOT IN ('upload','carte') THEN RAISE EXCEPTION 'Source invalide' USING ERRCODE='22023'; END IF;
  BEGIN v_id:=(v_source->>'id')::uuid; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Source invalide' USING ERRCODE='22023'; END;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Source requise' USING ERRCODE='22023'; END IF;
  IF v_source ? 'pages' THEN
   IF jsonb_typeof(v_source->'pages') IS DISTINCT FROM 'array' OR jsonb_array_length(v_source->'pages') NOT BETWEEN 1 AND 8 THEN
    RAISE EXCEPTION 'Pages invalides' USING ERRCODE='22023'; END IF;
   FOR v_page IN SELECT value FROM jsonb_array_elements(v_source->'pages') LOOP
    IF jsonb_typeof(v_page) IS DISTINCT FROM 'number' OR v_page::text !~ '^[0-9]+$' OR (v_page::text)::integer NOT BETWEEN 1 AND 200 THEN
     RAISE EXCEPTION 'Page invalide' USING ERRCODE='22023'; END IF;
   END LOOP;
  END IF;
  IF v_source->>'kind'='upload' THEN
   SELECT * INTO v_upload FROM internal.restaurant_carte_upload u WHERE u.id=v_id AND u.object_id=p_object_id AND u.created_by=auth.uid() AND u.state IN ('staged','copied');
   IF NOT FOUND THEN RAISE EXCEPTION 'Dépôt inaccessible' USING ERRCODE='42501'; END IF;
   v_rows:=v_rows||jsonb_build_array(jsonb_build_object('kind','upload','id',v_id,
    'upload',internal.restaurant_carte_upload_json(v_id),'linked',internal.restaurant_carte_link_snapshot(p_object_id,v_upload.document_id)));
  ELSE
   v_link:=internal.restaurant_carte_link_snapshot(p_object_id,v_id);
   IF v_link IS NULL OR v_link->'document'->>'access_scope' IS DISTINCT FROM 'public' THEN RAISE EXCEPTION 'Carte inaccessible' USING ERRCODE='42501'; END IF;
   IF v_source->'expected' IS DISTINCT FROM v_link THEN RAISE EXCEPTION 'La carte a changé' USING ERRCODE='PT409'; END IF;
   SELECT * INTO v_doc FROM public.ref_document WHERE id=v_id;
   v_rows:=v_rows||jsonb_build_array(jsonb_build_object('kind','carte','id',v_id,'expected',v_link,
    'url',v_doc.url,'storageBucket',v_doc.storage_bucket,'storagePath',v_doc.storage_path));
  END IF;
 END LOOP;
 RETURN jsonb_build_object('sources',v_rows,'targetMenuId',p_target_menu_id,
  'targetFingerprint',CASE WHEN v_target IS NOT NULL THEN md5(v_target::text) ELSE NULL END);
END $fn$;

-- Only the canonical publication of the SAME private upload is version-neutral.
-- Byte identity, ownership (rechecked by context), paths and target bundle stay guarded.
CREATE FUNCTION internal.menu_extraction_context_matches(p_expected jsonb,p_actual jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE l jsonb:=p_expected; r jsonb:=p_actual; a jsonb; b jsonb; x jsonb; y jsonb; i integer;
BEGIN
 IF jsonb_typeof(l->'sources') IS DISTINCT FROM 'array' OR jsonb_typeof(r->'sources') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 IF jsonb_array_length(l->'sources')<>jsonb_array_length(r->'sources') THEN RETURN false; END IF;
 FOR i IN 0..jsonb_array_length(l->'sources')-1 LOOP
  a:=l->'sources'->i;b:=r->'sources'->i;
  IF a->>'kind'='upload' AND b->>'kind'='upload' THEN
   x:=a->'upload';y:=b->'upload';
   IF x->>'state' IS NULL OR x->>'state' NOT IN('staged','copied') OR y->>'state' IS NULL OR y->>'state' NOT IN('staged','copied') THEN RETURN false; END IF;
   IF x->>'state' IS DISTINCT FROM y->>'state' AND NOT(x->>'state'='staged' AND y->>'state'='copied') THEN RETURN false; END IF;
   IF x->>'state'='copied' AND x->'publicUrl' IS DISTINCT FROM y->'publicUrl' THEN RETURN false; END IF;
   IF nullif(a->'linked','null'::jsonb) IS NULL AND nullif(b->'linked','null'::jsonb) IS NOT NULL THEN
    IF y->>'state' IS DISTINCT FROM 'copied' OR b#>>'{linked,object_id}' IS DISTINCT FROM y->>'objectId'
     OR b#>>'{linked,document_id}' IS DISTINCT FROM y->>'documentId'
     OR b#>>'{linked,document,access_scope}' IS DISTINCT FROM 'public'
     OR b#>>'{linked,document,storage_bucket}' IS DISTINCT FROM 'documents'
     OR b#>>'{linked,document,storage_path}' IS DISTINCT FROM y->>'publicPath'
     OR b#>>'{linked,document,url}' IS DISTINCT FROM y->>'publicUrl' THEN RETURN false; END IF;
    l:=jsonb_set(l,ARRAY['sources',i::text,'linked'],'null');r:=jsonb_set(r,ARRAY['sources',i::text,'linked'],'null');
   END IF;
   l:=jsonb_set(l,ARRAY['sources',i::text,'upload'],x-'state'-'publicUrl');
   r:=jsonb_set(r,ARRAY['sources',i::text,'upload'],y-'state'-'publicUrl');
  END IF;
 END LOOP;
 RETURN l=r;
END $fn$;

CREATE FUNCTION api.menu_extraction_context(p_object_id text,p_sources jsonb,p_target_menu_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,pg_temp AS $fn$
DECLARE v_context jsonb;
BEGIN
 v_context:=internal.menu_extraction_context(p_object_id,p_sources,p_target_menu_id);
 IF NOT EXISTS(SELECT 1 FROM internal.menu_extraction_settings WHERE singleton AND enabled AND daily_page_limit IS NOT NULL) THEN
  RAISE EXCEPTION 'Extraction non activée' USING ERRCODE='PT503'; END IF;
 RETURN jsonb_build_object('context',v_context,
  'allowedSections',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'code',code,'label',coalesce(name,code)) ORDER BY code)
    FROM (SELECT id,code,name FROM public.ref_code_menu_category ORDER BY code LIMIT 200) s),'[]'::jsonb),
  'allowedDietary',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'code',code,'label',coalesce(name,code)) ORDER BY code)
    FROM (SELECT id,code,name FROM public.ref_code_dietary_tag ORDER BY code LIMIT 200) s),'[]'::jsonb));
END $fn$;

CREATE FUNCTION api.seal_menu_extraction(p_request_id uuid,p_user_id uuid,p_object_id text,p_sources jsonb,p_target_menu_id uuid,p_context jsonb,p_source_stats jsonb,p_page_count integer,p_request_meta jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,pg_temp SET lock_timeout='5s' AS $fn$
DECLARE v_op internal.menu_extraction_operation%ROWTYPE;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Serveur requis' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_user_id IS NULL OR p_page_count IS NULL OR p_page_count NOT BETWEEN 1 AND 8
  OR jsonb_typeof(p_context) IS DISTINCT FROM 'object' OR jsonb_typeof(p_source_stats) IS DISTINCT FROM 'array'
  OR jsonb_array_length(p_source_stats)<>jsonb_array_length(p_sources)
  OR (SELECT coalesce(sum(jsonb_array_length(s->'selectedPages')),0) FROM jsonb_array_elements(p_source_stats) s)<>p_page_count
  OR length(p_context::text)>131072 OR length(p_source_stats::text)>131072 OR jsonb_typeof(p_request_meta) IS DISTINCT FROM 'object' OR length(p_request_meta::text)>2048 THEN
  RAISE EXCEPTION 'Inspection invalide' USING ERRCODE='22023'; END IF;
 INSERT INTO internal.menu_extraction_operation(id,object_id,created_by,source_refs,target_menu_id,context,source_stats,page_count,request_meta)
 VALUES(p_request_id,p_object_id,p_user_id,p_sources,p_target_menu_id,p_context,p_source_stats,p_page_count,p_request_meta) ON CONFLICT(id) DO NOTHING;
 SELECT * INTO v_op FROM internal.menu_extraction_operation WHERE id=p_request_id FOR UPDATE;
 IF v_op.created_by IS DISTINCT FROM p_user_id OR v_op.object_id IS DISTINCT FROM p_object_id THEN RAISE EXCEPTION 'Opération inaccessible' USING ERRCODE='42501'; END IF;
 IF (v_op.source_refs,v_op.target_menu_id,v_op.context,v_op.source_stats,v_op.page_count,v_op.request_meta)
   IS DISTINCT FROM (p_sources,p_target_menu_id,p_context,p_source_stats,p_page_count,p_request_meta) THEN
  RAISE EXCEPTION 'Identifiant déjà utilisé' USING ERRCODE='PT409'; END IF;
 RETURN jsonb_build_object('state',v_op.state);
END $fn$;

CREATE FUNCTION internal.menu_extraction_quota_json(p_user_id uuid,p_day date) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,internal,pg_temp AS $fn$
 SELECT jsonb_build_object('limit',s.daily_page_limit,'reserved',coalesce(d.reserved_pages,0),'consumed',coalesce(d.consumed_pages,0),
  'remaining',greatest(0,coalesce(s.daily_page_limit,0)-coalesce(d.reserved_pages,0)-coalesce(d.consumed_pages,0)),
  'resetAt',((p_day+1)::timestamp AT TIME ZONE 'Indian/Reunion'))
 FROM internal.menu_extraction_settings s LEFT JOIN internal.menu_extraction_day d ON d.user_id=p_user_id AND d.local_day=p_day WHERE s.singleton;
$fn$;
CREATE FUNCTION api.get_menu_extraction(p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,pg_temp AS $fn$
DECLARE v_op internal.menu_extraction_operation%ROWTYPE; v_day date:=(now() AT TIME ZONE 'Indian/Reunion')::date;
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(api.is_actor_persona(),false) THEN RAISE EXCEPTION 'Partenaire requis' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_op FROM internal.menu_extraction_operation WHERE id=p_request_id AND created_by=auth.uid();
 IF NOT FOUND THEN RETURN jsonb_build_object('state','absent'); END IF;
 PERFORM internal.assert_portal_menu_write(v_op.object_id);
 RETURN jsonb_build_object('id',v_op.id,'objectId',v_op.object_id,'state',
  CASE WHEN v_op.state='started' AND v_op.started_at<now()-interval '2 minutes' THEN 'uncertain' ELSE v_op.state END,
  'result',v_op.result,'draft',v_op.draft,'draftVersion',v_op.draft_version,'error',v_op.error_code,'publishedResult',v_op.published_result,
  'pages',v_op.page_count,'sourceRefs',v_op.source_refs,'targetMenuId',v_op.target_menu_id,'requestMeta',v_op.request_meta,'quota',internal.menu_extraction_quota_json(auth.uid(),v_day));
END $fn$;

-- Recovery does not depend on keeping an operation UUID in browser storage.
CREATE FUNCTION api.list_menu_extractions(p_object_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,pg_temp AS $fn$
BEGIN
 PERFORM internal.assert_portal_menu_write(p_object_id);
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',o.id,'state',o.state,'pages',o.page_count,
  'createdAt',o.created_at,'draftVersion',o.draft_version,'published',o.published_at IS NOT NULL) ORDER BY o.created_at DESC,o.id)
  FROM (SELECT * FROM internal.menu_extraction_operation WHERE object_id=p_object_id AND created_by=auth.uid()
   ORDER BY created_at DESC,id LIMIT 30) o),'[]'::jsonb);
END $fn$;

CREATE FUNCTION api.reserve_menu_extraction(p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,pg_temp SET lock_timeout='5s' AS $fn$
DECLARE v_op internal.menu_extraction_operation%ROWTYPE; v_day date:=(now() AT TIME ZONE 'Indian/Reunion')::date;
 v_limit integer; v_used internal.menu_extraction_day%ROWTYPE;
BEGIN
 SELECT * INTO v_op FROM internal.menu_extraction_operation WHERE id=p_request_id AND created_by=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'Opération inaccessible' USING ERRCODE='42501'; END IF;
 PERFORM internal.assert_portal_menu_write(v_op.object_id);
 PERFORM 1 FROM public.object WHERE id=v_op.object_id FOR UPDATE;
 SELECT * INTO v_op FROM internal.menu_extraction_operation WHERE id=p_request_id FOR UPDATE;
 IF v_op.state<>'inspected' THEN RETURN api.get_menu_extraction(p_request_id); END IF;
 SELECT daily_page_limit INTO v_limit FROM internal.menu_extraction_settings WHERE singleton AND enabled;
 IF v_limit IS NULL THEN RAISE EXCEPTION 'Extraction non activée' USING ERRCODE='PT503'; END IF;
 IF v_op.target_menu_id IS NOT NULL THEN
  PERFORM 1 FROM public.object_menu WHERE id=v_op.target_menu_id FOR UPDATE;
  PERFORM 1 FROM public.object_menu_item WHERE menu_id=v_op.target_menu_id ORDER BY id FOR UPDATE;
 END IF;
 IF NOT internal.menu_extraction_context_matches(v_op.context,internal.menu_extraction_context(v_op.object_id,v_op.source_refs,v_op.target_menu_id)) THEN
  RAISE EXCEPTION 'Source ou menu modifié' USING ERRCODE='PT409'; END IF;
 INSERT INTO internal.menu_extraction_day(user_id,local_day) VALUES(auth.uid(),v_day) ON CONFLICT DO NOTHING;
 SELECT * INTO v_used FROM internal.menu_extraction_day WHERE user_id=auth.uid() AND local_day=v_day FOR UPDATE;
 IF v_used.reserved_pages+v_used.consumed_pages+v_op.page_count>v_limit THEN RAISE EXCEPTION 'Quota atteint' USING ERRCODE='PT429'; END IF;
 UPDATE internal.menu_extraction_day SET reserved_pages=reserved_pages+v_op.page_count WHERE user_id=auth.uid() AND local_day=v_day;
 UPDATE internal.menu_extraction_operation SET state='reserved',local_day=v_day WHERE id=p_request_id;
 RETURN api.get_menu_extraction(p_request_id);
END $fn$;

CREATE FUNCTION api.claim_menu_extraction(p_request_id uuid,p_claim_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,pg_temp SET lock_timeout='5s' AS $fn$
DECLARE v_op internal.menu_extraction_operation%ROWTYPE;
BEGIN
 SELECT * INTO v_op FROM internal.menu_extraction_operation WHERE id=p_request_id AND created_by=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'Opération inaccessible' USING ERRCODE='42501'; END IF;
 PERFORM internal.assert_portal_menu_write(v_op.object_id);
 PERFORM 1 FROM public.object WHERE id=v_op.object_id FOR UPDATE;
 SELECT * INTO v_op FROM internal.menu_extraction_operation WHERE id=p_request_id FOR UPDATE;
 IF p_claim_id IS NULL THEN RAISE EXCEPTION 'Claim requis' USING ERRCODE='22023'; END IF;
 IF v_op.state='reserved' OR (v_op.state='preparing' AND v_op.claimed_at<now()-interval '2 minutes') THEN
  UPDATE internal.menu_extraction_operation SET state='preparing',claim_id=p_claim_id,claimed_at=now() WHERE id=p_request_id;
  RETURN jsonb_build_object('claimed',true,'pageCount',v_op.page_count,'context',v_op.context,'sourceStats',v_op.source_stats);
 END IF;
 RETURN jsonb_build_object('claimed',false,'operation',api.get_menu_extraction(p_request_id));
END $fn$;

CREATE FUNCTION api.assert_menu_extraction_dispatch(p_request_id uuid,p_claim_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,pg_temp SET lock_timeout='5s' AS $fn$
DECLARE v_op internal.menu_extraction_operation%ROWTYPE; v_stat jsonb;
BEGIN
 SELECT * INTO v_op FROM internal.menu_extraction_operation WHERE id=p_request_id AND created_by=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'Opération inaccessible' USING ERRCODE='42501'; END IF;
 PERFORM internal.assert_portal_menu_write(v_op.object_id);
 IF NOT EXISTS(SELECT 1 FROM internal.menu_extraction_settings WHERE singleton AND enabled AND daily_page_limit IS NOT NULL) THEN
  RAISE EXCEPTION 'Extraction non activée' USING ERRCODE='PT503'; END IF;
 PERFORM 1 FROM public.object WHERE id=v_op.object_id FOR UPDATE;
 SELECT * INTO v_op FROM internal.menu_extraction_operation WHERE id=p_request_id FOR UPDATE;
 IF v_op.state<>'preparing' OR v_op.claim_id IS DISTINCT FROM p_claim_id THEN RAISE EXCEPTION 'Traitement déjà pris en charge' USING ERRCODE='PT409'; END IF;
 IF NOT internal.menu_extraction_context_matches(v_op.context,internal.menu_extraction_context(v_op.object_id,v_op.source_refs,v_op.target_menu_id)) THEN
  RAISE EXCEPTION 'Source ou menu modifié' USING ERRCODE='PT409'; END IF;
 FOR v_stat IN SELECT value FROM jsonb_array_elements(v_op.source_stats) LOOP
  IF internal.menu_extraction_storage_snapshot(v_stat->>'bucket',v_stat->>'path') IS DISTINCT FROM v_stat->'storageExpected' THEN
   RAISE EXCEPTION 'Fichier modifié' USING ERRCODE='PT409'; END IF;
 END LOOP;
 RETURN jsonb_build_object('ready',true);
END $fn$;

CREATE FUNCTION api.mark_menu_extraction_started(p_request_id uuid,p_claim_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,internal,pg_temp SET lock_timeout='5s' AS $fn$
DECLARE v_op internal.menu_extraction_operation%ROWTYPE; v_stat jsonb; v_today date:=(now() AT TIME ZONE 'Indian/Reunion')::date;
BEGIN
 SELECT * INTO v_op FROM internal.menu_extraction_operation WHERE id=p_request_id AND created_by=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'Opération inaccessible' USING ERRCODE='42501'; END IF;
 PERFORM internal.assert_portal_menu_write(v_op.object_id);
 PERFORM 1 FROM public.object WHERE id=v_op.object_id FOR UPDATE;
 SELECT * INTO v_op FROM internal.menu_extraction_operation WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND OR v_op.state<>'preparing' OR v_op.claim_id IS DISTINCT FROM p_claim_id THEN RAISE EXCEPTION 'Claim invalide' USING ERRCODE='PT409'; END IF;
 IF v_op.local_day<>v_today OR NOT EXISTS(SELECT 1 FROM internal.menu_extraction_settings WHERE singleton AND enabled AND daily_page_limit IS NOT NULL) THEN
  UPDATE internal.menu_extraction_day SET reserved_pages=reserved_pages-v_op.page_count WHERE user_id=v_op.created_by AND local_day=v_op.local_day;
  UPDATE internal.menu_extraction_operation SET state='cancelled',error_code=CASE WHEN v_op.local_day<>v_today THEN 'day_changed' ELSE 'disabled' END,finished_at=now() WHERE id=p_request_id;
  RETURN jsonb_build_object('started',false,'error',CASE WHEN v_op.local_day<>v_today THEN 'day_changed' ELSE 'disabled' END);
 END IF;
 IF NOT internal.menu_extraction_context_matches(v_op.context,internal.menu_extraction_context(v_op.object_id,v_op.source_refs,v_op.target_menu_id)) THEN
  RAISE EXCEPTION 'Source ou menu modifié' USING ERRCODE='PT409'; END IF;
 FOR v_stat IN SELECT value FROM jsonb_array_elements(v_op.source_stats) LOOP
  IF internal.menu_extraction_storage_snapshot(v_stat->>'bucket',v_stat->>'path') IS DISTINCT FROM v_stat->'storageExpected' THEN
   RAISE EXCEPTION 'Fichier modifié' USING ERRCODE='PT409'; END IF;
 END LOOP;
 UPDATE internal.menu_extraction_day SET reserved_pages=reserved_pages-v_op.page_count,consumed_pages=consumed_pages+v_op.page_count
 WHERE user_id=v_op.created_by AND local_day=v_op.local_day;
 UPDATE internal.menu_extraction_operation SET state='started',started_at=now() WHERE id=p_request_id;
 RETURN jsonb_build_object('started',true);
END $fn$;

CREATE FUNCTION api.finish_menu_extraction(p_request_id uuid,p_claim_id uuid,p_result jsonb,p_error text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,internal,pg_temp SET lock_timeout='5s' AS $fn$
DECLARE v_op internal.menu_extraction_operation%ROWTYPE;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Serveur requis' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_op FROM internal.menu_extraction_operation WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND OR v_op.claim_id IS DISTINCT FROM p_claim_id THEN RAISE EXCEPTION 'Claim invalide' USING ERRCODE='PT409'; END IF;
 IF v_op.state IN ('succeeded','failed') THEN RETURN jsonb_build_object('state',v_op.state); END IF;
 IF v_op.state<>'started' OR (p_result IS NOT NULL AND (jsonb_typeof(p_result) IS DISTINCT FROM 'object' OR length(p_result::text)>1048576))
  OR (p_result IS NULL AND nullif(p_error,'') IS NULL) THEN RAISE EXCEPTION 'Résultat invalide' USING ERRCODE='22023'; END IF;
 UPDATE internal.menu_extraction_operation SET state=CASE WHEN p_result IS NULL THEN 'failed' ELSE 'succeeded' END,
  result=p_result,draft=p_result,error_code=left(p_error,80),finished_at=now() WHERE id=p_request_id;
 RETURN jsonb_build_object('state',CASE WHEN p_result IS NULL THEN 'failed' ELSE 'succeeded' END);
END $fn$;

CREATE FUNCTION api.cancel_menu_extraction_before_dispatch(p_request_id uuid,p_claim_id uuid,p_error text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,internal,pg_temp SET lock_timeout='5s' AS $fn$
DECLARE v_op internal.menu_extraction_operation%ROWTYPE;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Serveur requis' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_op FROM internal.menu_extraction_operation WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Opération inaccessible' USING ERRCODE='42501'; END IF;
 IF v_op.state='reserved' OR (v_op.state='preparing' AND v_op.claim_id=p_claim_id) THEN
  UPDATE internal.menu_extraction_day SET reserved_pages=reserved_pages-v_op.page_count WHERE user_id=v_op.created_by AND local_day=v_op.local_day;
  UPDATE internal.menu_extraction_operation SET state='cancelled',error_code=left(p_error,80),finished_at=now() WHERE id=p_request_id;
 END IF;
 RETURN jsonb_build_object('state',(SELECT state FROM internal.menu_extraction_operation WHERE id=p_request_id));
END $fn$;

-- Called only from the narrow M wrapper under its object lock. Replay returns the committed
-- receipt before checking a source changed by the publication itself.
CREATE FUNCTION internal.assert_menu_extraction_publication(p_operation_id uuid,p_object_id text,p_expected_draft_version integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,storage,pg_temp SET lock_timeout='5s' AS $fn$
DECLARE v_op internal.menu_extraction_operation%ROWTYPE; v_source jsonb; v_stat jsonb;
BEGIN
 PERFORM internal.assert_portal_menu_write(p_object_id);
 PERFORM 1 FROM public.object WHERE id=p_object_id FOR UPDATE;
 SELECT * INTO v_op FROM internal.menu_extraction_operation WHERE id=p_operation_id FOR UPDATE;
 IF NOT FOUND OR v_op.created_by IS DISTINCT FROM auth.uid() OR v_op.object_id IS DISTINCT FROM p_object_id THEN RAISE EXCEPTION 'Opération inaccessible' USING ERRCODE='42501'; END IF;
 IF v_op.published_result IS NOT NULL THEN RETURN v_op.published_result; END IF;
 IF v_op.state<>'succeeded' OR v_op.result IS NULL THEN RAISE EXCEPTION 'Brouillon indisponible' USING ERRCODE='PT409'; END IF;
 IF p_expected_draft_version IS DISTINCT FROM v_op.draft_version THEN
  RAISE EXCEPTION 'Le brouillon a changé. Vérifiez la correction avant de publier.' USING ERRCODE='PT409'; END IF;
 FOR v_source IN SELECT value FROM jsonb_array_elements(v_op.context->'sources') ORDER BY value->>'id' LOOP
  IF v_source->>'kind'='upload' THEN
   PERFORM 1 FROM internal.restaurant_carte_upload WHERE id=(v_source->>'id')::uuid FOR UPDATE;
  ELSE
   PERFORM 1 FROM public.object_document WHERE object_id=p_object_id AND document_id=(v_source->>'id')::uuid FOR UPDATE;
   PERFORM 1 FROM public.ref_document WHERE id=(v_source->>'id')::uuid FOR UPDATE;
  END IF;
 END LOOP;
 FOR v_stat IN SELECT value FROM jsonb_array_elements(v_op.source_stats) ORDER BY value->>'bucket',value->>'path' LOOP
  PERFORM 1 FROM storage.objects WHERE bucket_id=v_stat->>'bucket' AND name=v_stat->>'path' FOR SHARE;
  IF internal.menu_extraction_storage_snapshot(v_stat->>'bucket',v_stat->>'path') IS DISTINCT FROM v_stat->'storageExpected' THEN
   RAISE EXCEPTION 'Fichier modifié' USING ERRCODE='PT409'; END IF;
 END LOOP;
 IF v_op.target_menu_id IS NOT NULL THEN
  -- Lock the target and FK parents before hashing its bundle; this also blocks
  -- a privileged concurrent insertion of items/links until M reconciles it.
  PERFORM 1 FROM public.object_menu WHERE id=v_op.target_menu_id FOR UPDATE;
  PERFORM 1 FROM public.object_menu_item WHERE menu_id=v_op.target_menu_id ORDER BY id FOR UPDATE;
 END IF;
 IF NOT internal.menu_extraction_context_matches(v_op.context,internal.menu_extraction_context(v_op.object_id,v_op.source_refs,v_op.target_menu_id)) THEN
  RAISE EXCEPTION 'Source ou menu modifié' USING ERRCODE='PT409'; END IF;
 RETURN NULL;
END $fn$;

CREATE FUNCTION internal.record_menu_extraction_publication(p_operation_id uuid,p_object_id text,p_result jsonb,p_menu_ids uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,pg_temp SET lock_timeout='5s' AS $fn$
DECLARE v_op internal.menu_extraction_operation%ROWTYPE; v_target uuid;
BEGIN
 PERFORM internal.assert_portal_menu_write(p_object_id);
 SELECT * INTO v_op FROM internal.menu_extraction_operation WHERE id=p_operation_id FOR UPDATE;
 IF NOT FOUND OR v_op.created_by IS DISTINCT FROM auth.uid() OR v_op.object_id IS DISTINCT FROM p_object_id OR v_op.state<>'succeeded'
  OR jsonb_typeof(p_result) IS DISTINCT FROM 'object' OR coalesce(cardinality(p_menu_ids),0)<>1
  OR EXISTS(SELECT 1 FROM unnest(p_menu_ids) id WHERE NOT EXISTS(SELECT 1 FROM public.object_menu m WHERE m.id=id AND m.object_id=p_object_id AND m.visibility='public')) THEN
  RAISE EXCEPTION 'Publication invalide' USING ERRCODE='22023'; END IF;
 v_target:=v_op.target_menu_id;
 IF v_target IS NULL THEN
  BEGIN v_target:=(v_op.result#>>'{menu,recordId}')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Identifiant extrait invalide' USING ERRCODE='22023'; END;
 END IF;
 IF v_target IS NULL OR p_menu_ids[1] IS DISTINCT FROM v_target THEN
  RAISE EXCEPTION 'La publication ne correspond pas au menu extrait' USING ERRCODE='22023'; END IF;
 IF v_op.published_result IS NOT NULL THEN RETURN; END IF;
 UPDATE internal.menu_extraction_operation SET published_result=p_result,published_menu_ids=p_menu_ids,published_at=now() WHERE id=p_operation_id;
END $fn$;

CREATE FUNCTION api.save_menu_extraction_draft(p_request_id uuid,p_expected_version integer,p_draft jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,pg_temp SET lock_timeout='5s' AS $fn$
DECLARE v_op internal.menu_extraction_operation%ROWTYPE;
BEGIN
 SELECT * INTO v_op FROM internal.menu_extraction_operation WHERE id=p_request_id AND created_by=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'Brouillon inaccessible' USING ERRCODE='42501'; END IF;
 PERFORM internal.assert_portal_menu_write(v_op.object_id);
 PERFORM 1 FROM public.object WHERE id=v_op.object_id FOR UPDATE;
 SELECT * INTO v_op FROM internal.menu_extraction_operation WHERE id=p_request_id FOR UPDATE;
 IF v_op.published_result IS NOT NULL THEN RAISE EXCEPTION 'Brouillon déjà publié. Rechargez les menus.' USING ERRCODE='PT409'; END IF;
 IF v_op.state<>'succeeded' OR jsonb_typeof(p_draft) IS DISTINCT FROM 'object'
   OR length(p_draft::text)>1048576 OR p_expected_version IS NULL OR p_expected_version<0 THEN
  RAISE EXCEPTION 'Brouillon invalide' USING ERRCODE='22023'; END IF;
 IF v_op.draft_version=p_expected_version+1 AND v_op.draft=p_draft THEN
  RETURN jsonb_build_object('draft',v_op.draft,'draftVersion',v_op.draft_version);
 END IF;
 IF v_op.draft_version<>p_expected_version THEN RAISE EXCEPTION 'Brouillon modifié ailleurs' USING ERRCODE='PT409'; END IF;
 UPDATE internal.menu_extraction_operation SET draft=p_draft,draft_version=draft_version+1 WHERE id=p_request_id;
 RETURN jsonb_build_object('draft',p_draft,'draftVersion',p_expected_version+1);
END $fn$;

-- Read-only impact of a card change. History is not limited to a browser/user's
-- recent jobs. Only surviving associated menus of this object are projected.
CREATE FUNCTION api.get_menu_extraction_source_impact(p_object_id text,p_source_kind text,p_source_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,pg_temp AS $fn$
DECLARE v_actor boolean:=coalesce(api.is_actor_persona(),false); v_document uuid; v_upload internal.restaurant_carte_upload%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR p_source_kind IS NULL OR p_source_kind NOT IN('carte','upload') OR p_source_id IS NULL THEN
  RAISE EXCEPTION 'Source inaccessible' USING ERRCODE='42501'; END IF;
 IF v_actor THEN PERFORM internal.restaurant_carte_assert_user(p_object_id);
 ELSIF NOT coalesce(api.can_read_object_for_correction(p_object_id),false)
  OR NOT EXISTS(SELECT 1 FROM public.object WHERE id=p_object_id AND object_type='RES') THEN
  RAISE EXCEPTION 'Fiche inaccessible' USING ERRCODE='42501'; END IF;
 IF p_source_kind='upload' THEN
  SELECT * INTO v_upload FROM internal.restaurant_carte_upload WHERE id=p_source_id AND object_id=p_object_id;
  IF NOT FOUND OR (v_actor AND v_upload.created_by IS DISTINCT FROM auth.uid()) THEN RAISE EXCEPTION 'Dépôt inaccessible' USING ERRCODE='42501'; END IF;
  v_document:=v_upload.document_id;
 ELSE
  v_document:=p_source_id;
  IF v_actor AND NOT EXISTS(SELECT 1 FROM public.ref_document WHERE id=v_document AND access_scope='public') THEN
   RAISE EXCEPTION 'Carte inaccessible' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN jsonb_build_object('menus',coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id,'name',m.name) ORDER BY m.name,m.id)
  FROM public.object_menu m WHERE m.object_id=p_object_id AND (NOT v_actor OR m.visibility='public') AND EXISTS(
   SELECT 1 FROM internal.menu_extraction_operation o WHERE o.object_id=p_object_id AND o.state='succeeded'
    AND o.published_at IS NOT NULL AND o.published_result IS NOT NULL AND m.id=ANY(o.published_menu_ids)
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(o.source_refs) s WHERE
     (s->>'kind'='carte' AND s->>'id'=v_document::text) OR
     (s->>'kind'='upload' AND EXISTS(SELECT 1 FROM internal.restaurant_carte_upload u
       WHERE u.id::text=s->>'id' AND u.object_id=p_object_id AND u.document_id=v_document)))
  )),'[]'::jsonb));
END $fn$;

REVOKE ALL ON FUNCTION api.get_menu_extraction_source_impact(text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION api.get_menu_extraction_source_impact(text,text,uuid) TO authenticated;
REVOKE ALL ON FUNCTION internal.menu_extraction_storage_snapshot(text,text),internal.menu_extraction_context(text,jsonb,uuid),
 internal.menu_extraction_context_matches(jsonb,jsonb),
 internal.menu_extraction_quota_json(uuid,date),internal.assert_menu_extraction_publication(uuid,text,integer),
 internal.record_menu_extraction_publication(uuid,text,jsonb,uuid[]) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION api.menu_extraction_storage_receipt(text,text),api.menu_extraction_context(text,jsonb,uuid),
 api.seal_menu_extraction(uuid,uuid,text,jsonb,uuid,jsonb,jsonb,integer,jsonb),api.get_menu_extraction(uuid),api.list_menu_extractions(text),api.reserve_menu_extraction(uuid),
 api.claim_menu_extraction(uuid,uuid),api.assert_menu_extraction_dispatch(uuid,uuid),api.save_menu_extraction_draft(uuid,integer,jsonb),api.mark_menu_extraction_started(uuid,uuid),
 api.finish_menu_extraction(uuid,uuid,jsonb,text),api.cancel_menu_extraction_before_dispatch(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION api.menu_extraction_context(text,jsonb,uuid),api.get_menu_extraction(uuid),api.list_menu_extractions(text),api.reserve_menu_extraction(uuid),
 api.claim_menu_extraction(uuid,uuid),api.assert_menu_extraction_dispatch(uuid,uuid),api.save_menu_extraction_draft(uuid,integer,jsonb),api.mark_menu_extraction_started(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION api.menu_extraction_storage_receipt(text,text),api.seal_menu_extraction(uuid,uuid,text,jsonb,uuid,jsonb,jsonb,integer,jsonb),
 api.finish_menu_extraction(uuid,uuid,jsonb,text),api.cancel_menu_extraction_before_dispatch(uuid,uuid,text) TO service_role;
COMMIT;
NOTIFY pgrst,'reload schema';
