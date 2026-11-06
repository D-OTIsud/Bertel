-- R6: preconditions for the two existing collection redispatches only.
-- No public object projection, generic version table, or automatic capacity writer.
BEGIN;
CREATE TABLE IF NOT EXISTS internal.pending_collection_baseline(
  pending_change_id uuid PRIMARY KEY REFERENCES public.pending_change(id) ON DELETE CASCADE,
  baseline jsonb NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE internal.pending_collection_baseline ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal.pending_collection_baseline FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION internal.pending_collection_domain(p_metadata jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
  SELECT CASE p_metadata->>'rpc' WHEN 'save_object_commercial' THEN 'characteristics' WHEN 'save_object_openings' THEN 'openings' END;
$$;

CREATE OR REPLACE FUNCTION internal.pending_collection_snapshot(p_object_id text,p_domain text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$
BEGIN
  IF p_domain='characteristics' THEN
    RETURN jsonb_build_object(
      'languages',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.language_id) FROM public.object_language r WHERE r.object_id=p_object_id),'[]'),
      'payment_methods',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.payment_method_id) FROM public.object_payment_method r WHERE r.object_id=p_object_id),'[]'),
      'environment_tags',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.environment_tag_id) FROM public.object_environment_tag r WHERE r.object_id=p_object_id),'[]'),
      'amenities',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.amenity_id) FROM public.object_amenity r WHERE r.object_id=p_object_id),'[]'));
  ELSIF p_domain='openings' THEN
    RETURN (WITH periods AS (SELECT p.* FROM public.opening_period p WHERE p.object_id=p_object_id),
      schedules AS (SELECT s.* FROM public.opening_schedule s JOIN periods p ON p.id=s.period_id),
      times AS (SELECT t.* FROM public.opening_time_period t JOIN schedules s ON s.id=t.schedule_id)
      SELECT jsonb_build_object(
        'periods',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM periods r),'[]'),
        'schedules',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM schedules r),'[]'),
        'time_periods',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM times r),'[]'),
        'weekdays',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.time_period_id,r.weekday_id) FROM public.opening_time_period_weekday r JOIN times t ON t.id=r.time_period_id),'[]'),
        'frames',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.opening_time_frame r JOIN times t ON t.id=r.time_period_id),'[]')));
  END IF;
  RAISE EXCEPTION 'Collection de proposition inconnue.' USING ERRCODE='22023';
END;
$$;

CREATE OR REPLACE FUNCTION internal.pending_collection_token(p_object_id text,p_domain text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,internal AS $$
  SELECT jsonb_build_object('contract','actor-collection-baseline-v1','object_id',p_object_id,'domain',p_domain,
    'digest',encode(sha256(convert_to(internal.pending_collection_snapshot(p_object_id,p_domain)::text,'UTF8')),'hex'));
$$;

-- Parent FOR UPDATE locks block new FK children; row locks block ordinary edits/deletes.
-- This includes writers that do not themselves take the object lock. Locks stay until commit.
CREATE OR REPLACE FUNCTION internal.lock_pending_collection(p_object_id text,p_domain text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
  PERFORM 1 FROM public.object WHERE id=p_object_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fiche inaccessible.' USING ERRCODE='42501'; END IF;
  IF p_domain='characteristics' THEN
    PERFORM 1 FROM public.object_language WHERE object_id=p_object_id ORDER BY language_id FOR UPDATE;
    PERFORM 1 FROM public.object_payment_method WHERE object_id=p_object_id ORDER BY payment_method_id FOR UPDATE;
    PERFORM 1 FROM public.object_environment_tag WHERE object_id=p_object_id ORDER BY environment_tag_id FOR UPDATE;
    PERFORM 1 FROM public.object_amenity WHERE object_id=p_object_id ORDER BY amenity_id FOR UPDATE;
  ELSIF p_domain='openings' THEN
    PERFORM 1 FROM public.opening_period WHERE object_id=p_object_id ORDER BY id FOR UPDATE;
    PERFORM 1 FROM public.opening_schedule WHERE period_id IN(SELECT id FROM public.opening_period WHERE object_id=p_object_id) ORDER BY id FOR UPDATE;
    PERFORM 1 FROM public.opening_time_period WHERE schedule_id IN(SELECT s.id FROM public.opening_schedule s JOIN public.opening_period p ON p.id=s.period_id WHERE p.object_id=p_object_id) ORDER BY id FOR UPDATE;
    PERFORM 1 FROM public.opening_time_period_weekday WHERE time_period_id IN(SELECT t.id FROM public.opening_time_period t JOIN public.opening_schedule s ON s.id=t.schedule_id JOIN public.opening_period p ON p.id=s.period_id WHERE p.object_id=p_object_id) ORDER BY time_period_id,weekday_id FOR UPDATE;
    PERFORM 1 FROM public.opening_time_frame WHERE time_period_id IN(SELECT t.id FROM public.opening_time_period t JOIN public.opening_schedule s ON s.id=t.schedule_id JOIN public.opening_period p ON p.id=s.period_id WHERE p.object_id=p_object_id) ORDER BY id FOR UPDATE;
  ELSE RAISE EXCEPTION 'Collection de proposition inconnue.' USING ERRCODE='22023'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION api.get_object_proposal_baseline(p_object_id text,p_domain text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,api,internal AS $$
DECLARE v_visibility jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE(api.can_read_object(p_object_id),false) THEN RAISE EXCEPTION 'Fiche inaccessible.' USING ERRCODE='42501'; END IF;
  IF COALESCE(api.is_actor_persona(),false) THEN
    IF NOT EXISTS(SELECT 1 FROM api.current_user_portal_object_ids() id WHERE id=p_object_id) THEN RAISE EXCEPTION 'Fiche inaccessible.' USING ERRCODE='42501'; END IF;
    v_visibility:=api.get_portal_section_visibility(p_object_id);
    IF COALESCE(v_visibility->'masked_modules','[]'::jsonb) ? p_domain OR COALESCE(v_visibility->'floor_modules','[]'::jsonb) ? p_domain THEN
      RAISE EXCEPTION 'Cette rubrique est gérée par l’office.' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN internal.pending_collection_token(p_object_id,p_domain);
END;
$$;

-- Every API path inserting one of these two automatic proposals uses this same check.
-- A separate private row is the proof of validation; free-form metadata cannot forge it.
CREATE OR REPLACE FUNCTION internal.capture_pending_collection_baseline()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal SET lock_timeout='5s' AS $$
DECLARE v_domain text; v_baseline jsonb; v_current jsonb;
BEGIN
  v_domain:=internal.pending_collection_domain(NEW.metadata);
  IF v_domain IS NULL THEN RETURN NEW; END IF;
  IF NEW.object_id IS NULL OR NEW.metadata->>'section' IS DISTINCT FROM v_domain OR NEW.action<>'update'
    OR jsonb_typeof(NEW.payload) IS DISTINCT FROM 'object'
    OR (v_domain='characteristics' AND (EXISTS(SELECT 1 FROM jsonb_object_keys(NEW.payload) k WHERE k NOT IN ('languages','payment_methods','environment_tags','amenities'))
      OR EXISTS(SELECT 1 FROM jsonb_each(NEW.payload) e WHERE jsonb_typeof(e.value)<>'array')))
    OR (v_domain='openings' AND (jsonb_typeof(NEW.payload->'periods') IS DISTINCT FROM 'array' OR EXISTS(SELECT 1 FROM jsonb_object_keys(NEW.payload) k WHERE k<>'periods'))) THEN
    RAISE EXCEPTION 'La proposition ne correspond pas à sa rubrique.' USING ERRCODE='22023';
  END IF;
  v_baseline:=NEW.metadata->'collection_baseline';
  IF jsonb_typeof(v_baseline) IS DISTINCT FROM 'object' OR v_baseline->>'contract' IS DISTINCT FROM 'actor-collection-baseline-v1'
    OR v_baseline->>'object_id' IS DISTINCT FROM NEW.object_id OR v_baseline->>'domain' IS DISTINCT FROM v_domain
    OR COALESCE(v_baseline->>'digest','') !~ '^[0-9a-f]{64}$'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_baseline) k WHERE k NOT IN ('contract','object_id','domain','digest')) THEN
    RAISE EXCEPTION 'Rechargez cette rubrique avant de l’envoyer ; votre saisie est conservée.' USING ERRCODE='PT428';
  END IF;
  PERFORM internal.lock_pending_collection(NEW.object_id,v_domain);
  v_current:=internal.pending_collection_token(NEW.object_id,v_domain);
  IF v_baseline IS DISTINCT FROM v_current THEN
    RAISE EXCEPTION 'Cette rubrique a changé depuis votre lecture. Rechargez-la pour vérifier votre saisie ; rien n’a été envoyé.' USING ERRCODE='PT412';
  END IF;
  INSERT INTO internal.pending_collection_baseline(pending_change_id,baseline) VALUES(NEW.id,v_current);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS capture_pending_collection_baseline ON public.pending_change;
CREATE TRIGGER capture_pending_collection_baseline AFTER INSERT ON public.pending_change FOR EACH ROW EXECUTE FUNCTION internal.capture_pending_collection_baseline();

CREATE OR REPLACE FUNCTION internal.pending_change_needs_manual_report(p_id uuid,p_metadata jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,internal AS $$
  SELECT (p_metadata->>'rpc') IS NULL OR (internal.pending_collection_domain(p_metadata) IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM internal.pending_collection_baseline WHERE pending_change_id=p_id));
$$;

REVOKE ALL ON FUNCTION internal.pending_collection_domain(jsonb),internal.pending_collection_snapshot(text,text),internal.pending_collection_token(text,text),internal.lock_pending_collection(text,text),internal.capture_pending_collection_baseline(),internal.pending_change_needs_manual_report(uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION api.get_object_proposal_baseline(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.get_object_proposal_baseline(text,text) TO authenticated,service_role;


-- Preserve the current complete definitions (including the September actor-realm reader).
-- Pins cover the read-only live catalogue and the explicitly identified fresh preparations:
-- approval-with-photos, declared reject, and declared recurrence writer. Unknown drift aborts.
DO $targeted_patches$
DECLARE r record; v_oid oid; v_raw text; v_source text; v_original text; v_new text; v_definition text;
  v_pairs jsonb; v_pair jsonb; v_before text; v_after text; v_hash text; v_done boolean;
BEGIN
  FOR r IN SELECT * FROM (VALUES
('api.approve_pending_change(uuid,text,boolean)',
  ARRAY['78b171f997cd630da118ecc81382448d','e6130617c05459dccd63d23814160f60']::text[],
  'r6-collection-approve',
  jsonb_build_array(jsonb_build_object('before',$patch$  v_now timestamptz := now();$patch$,'after',$patch$  v_now timestamptz := now();
  v_sub_id uuid; v_domain text; v_baseline jsonb;$patch$),jsonb_build_object('before',$patch$  SELECT * INTO v_row FROM pending_change WHERE id = p_id FOR UPDATE;$patch$,'after',$patch$  -- /* r6-collection-approve */ Same lock order as the batch: submission -> proposal -> object.
  SELECT submission_id INTO v_sub_id FROM pending_change WHERE id=p_id;
  IF v_sub_id IS NOT NULL THEN PERFORM 1 FROM fiche_submission WHERE id=v_sub_id FOR UPDATE; END IF;
  SELECT * INTO v_row FROM pending_change WHERE id = p_id FOR UPDATE;$patch$),jsonb_build_object('before',$patch$  EXECUTE format('SELECT api.%I($1, $2)', v_rpc) USING v_row.object_id, v_row.payload;$patch$,'after',$patch$  v_domain:=internal.pending_collection_domain(v_row.metadata);
  IF v_domain IS NOT NULL THEN
    SELECT baseline INTO v_baseline FROM internal.pending_collection_baseline WHERE pending_change_id=p_id;
    IF NOT FOUND THEN
      -- Keep the historical envelope verbatim: no synthetic baseline, no RPC erasure.
      IF NOT COALESCE(p_applied_manually,false) THEN
        RAISE EXCEPTION 'Proposition historique sans précondition : reportez les changements dans l’éditeur, puis attestez ce report avec un motif.' USING ERRCODE='PT428';
      END IF;
      IF NULLIF(btrim(p_review_note),'') IS NULL THEN
        RAISE EXCEPTION 'Décrivez le report manuel de cette proposition historique avant de l’attester.' USING ERRCODE='P0001';
      END IF;
      UPDATE pending_change SET status='approved',reviewed_by=v_uid,reviewed_at=v_now,review_note=p_review_note,
        metadata=COALESCE(metadata,'{}'::jsonb)||jsonb_build_object('applied_manually',true,'historical_manual_report',true,'attested_by',v_uid,'attested_at',v_now),updated_at=v_now WHERE id=p_id;
      RETURN jsonb_build_object('success',true,'id',p_id,'status','approved','reviewed_at',v_now);
    END IF;
    PERFORM internal.lock_pending_collection(v_row.object_id,v_domain);
    IF v_baseline IS DISTINCT FROM internal.pending_collection_token(v_row.object_id,v_domain) THEN
      RAISE EXCEPTION 'La fiche a changé depuis cette proposition. Vérifiez les différences et demandez une nouvelle proposition ; rien n’a été appliqué.' USING ERRCODE='PT412';
    END IF;
  END IF;

  EXECUTE format('SELECT api.%I($1, $2)', v_rpc) USING v_row.object_id, v_row.payload;$patch$)),
  true),
('api.approve_fiche_submission(uuid,text,boolean)',
  ARRAY['3cec67930cf677455e933ddafbf0739b']::text[],
  'r6-manual-history-bulk',
  jsonb_build_array(jsonb_build_object('before',$patch$SELECT id, (metadata->>'rpc') AS rpc FROM pending_change$patch$,'after',$patch$SELECT id, (metadata->>'rpc') AS rpc, internal.pending_change_needs_manual_report(id,metadata) AS needs_manual /* r6-manual-history-bulk */ FROM pending_change$patch$),jsonb_build_object('before',$patch$IF v_pc.rpc IS NULL AND NOT COALESCE(p_include_manual, FALSE) THEN$patch$,'after',$patch$IF v_pc.needs_manual AND NOT COALESCE(p_include_manual, FALSE) THEN$patch$),jsonb_build_object('before',$patch$PERFORM api.approve_pending_change(v_pc.id, p_review_note, v_pc.rpc IS NULL);$patch$,'after',$patch$PERFORM api.approve_pending_change(v_pc.id, p_review_note, v_pc.needs_manual);$patch$),jsonb_build_object('before',$patch$IF v_pc.rpc IS NULL THEN v_manual := v_manual + 1; ELSE v_applied := v_applied + 1; END IF;$patch$,'after',$patch$IF v_pc.needs_manual THEN v_manual := v_manual + 1; ELSE v_applied := v_applied + 1; END IF;$patch$)),
  true),
('api.list_pending_changes(text,text,integer,integer)',
  ARRAY['91417b2391fd136e76f75895265a1b37']::text[],
  'r6-manual-history-list',
  jsonb_build_array(jsonb_build_object('before',$patch$((pc.metadata->>'rpc') IS NULL) AS manual_apply$patch$,'after',$patch$internal.pending_change_needs_manual_report(pc.id,pc.metadata) /* r6-manual-history-list */ AS manual_apply$patch$)),
  true),
('api.reject_pending_change(uuid,text)',
  ARRAY['c125ebd25849243cf45f1b7a114960ed','5b328414dc0e0551504ab0b5aa2f7b6e']::text[],
  'r6-collection-reject',
  jsonb_build_array(jsonb_build_object('before',$patch$  v_now timestamptz := now();$patch$,'after',$patch$  v_now timestamptz := now();
  v_sub_id uuid;$patch$),jsonb_build_object('before',$patch$  SELECT * INTO v_row FROM pending_change WHERE id = p_id FOR UPDATE;$patch$,'after',$patch$  -- /* r6-collection-reject */ Same lock order as the batch: submission -> proposal -> object.
  SELECT submission_id INTO v_sub_id FROM pending_change WHERE id=p_id;
  IF v_sub_id IS NOT NULL THEN PERFORM 1 FROM fiche_submission WHERE id=v_sub_id FOR UPDATE; END IF;
  SELECT * INTO v_row FROM pending_change WHERE id = p_id FOR UPDATE;$patch$)),
  true),
('api.save_object_commercial(text,jsonb)',
  ARRAY['25d01e673bc3d478512ce6c1c7ae40bd']::text[],
  'r6-object-before-children',
  jsonb_build_array(jsonb_build_object('before',$patch$  PERFORM internal.workspace_assert_can_write_object(p_object_id);$patch$,'after',$patch$  PERFORM internal.workspace_assert_can_write_object(p_object_id);
  -- /* r6-object-before-children */ Serialize before DELETE/INSERT of any collection child.
  PERFORM 1 FROM public.object WHERE id=p_object_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fiche inaccessible.' USING ERRCODE='42501'; END IF;$patch$)),
  false),
('api.save_object_openings(text,jsonb)',
  ARRAY['7f1665faf55856c0c3b867a243d999e3','a6967f74a8959360215207b1c0d65d6e']::text[],
  'r6-object-before-children',
  jsonb_build_array(jsonb_build_object('before',$patch$  PERFORM internal.workspace_assert_can_write_object(p_object_id);$patch$,'after',$patch$  PERFORM internal.workspace_assert_can_write_object(p_object_id);
  -- /* r6-object-before-children */ Serialize before DELETE/INSERT of any collection child.
  PERFORM 1 FROM public.object WHERE id=p_object_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fiche inaccessible.' USING ERRCODE='42501'; END IF;$patch$)),
  false)
  ) inventory(signature,allowed_sources,marker,pairs,expected_definer) LOOP
    v_oid:=to_regprocedure(r.signature);
    IF v_oid IS NULL THEN RAISE EXCEPTION 'R6 function missing: %',r.signature; END IF;
    SELECT prosrc INTO v_raw FROM pg_proc WHERE oid=v_oid AND prosecdef=r.expected_definer;
    IF v_raw IS NULL THEN RAISE EXCEPTION 'R6 unexpected security mode: %',r.signature; END IF;
    v_source:=replace(v_raw,E'\r\n',E'\n');
    v_pairs:=r.pairs;
    -- Preserve an existing null-object guard; add only the missing guard on the fresh declaration.
    IF r.signature='api.reject_pending_change(uuid,text)' AND
      (position('/* r6-null-object */' IN v_source)>0 OR position('IF NOT api.user_can_moderate_object(v_row.object_id) THEN' IN v_source)>0) THEN
      v_pairs:=v_pairs||jsonb_build_array(jsonb_build_object(
        'before','IF NOT api.user_can_moderate_object(v_row.object_id) THEN',
        'after','IF v_row.object_id IS NULL OR NOT api.user_can_moderate_object(v_row.object_id) /* r6-null-object */ THEN'));
    END IF;
    v_done:=position(r.marker IN v_source)>0;
    v_original:=v_source;
    IF v_done THEN
      FOR v_pair IN SELECT value FROM jsonb_array_elements(v_pairs) LOOP
        v_after:=v_pair->>'after';
        IF (length(v_original)-length(replace(v_original,v_after,'')))/length(v_after)<>1 THEN RAISE EXCEPTION 'R6 replay anchor drift: %',r.signature; END IF;
        v_original:=replace(v_original,v_after,v_pair->>'before');
      END LOOP;
    END IF;
    v_hash:=md5(v_original);
    IF NOT v_hash=ANY(r.allowed_sources) THEN RAISE EXCEPTION 'R6 unexpected source %: %',r.signature,v_hash; END IF;
    IF r.signature LIKE 'api.list_pending_changes%' AND position('/* actor-realm:actor */' IN v_original)=0 THEN
      RAISE EXCEPTION 'R6 refuses to lose the actor realm scope';
    END IF;
    IF v_done THEN CONTINUE; END IF;
    v_new:=v_source;
    FOR v_pair IN SELECT value FROM jsonb_array_elements(v_pairs) LOOP
      v_before:=v_pair->>'before';
      IF (length(v_new)-length(replace(v_new,v_before,'')))/length(v_before)<>1 THEN RAISE EXCEPTION 'R6 source anchor drift: %',r.signature; END IF;
      v_new:=replace(v_new,v_before,v_pair->>'after');
    END LOOP;
    v_definition:=pg_get_functiondef(v_oid);
    IF (length(v_definition)-length(replace(v_definition,v_raw,'')))/length(v_raw)<>1 THEN RAISE EXCEPTION 'R6 function definition drift: %',r.signature; END IF;
    EXECUTE replace(v_definition,v_raw,v_new);
    RAISE NOTICE 'R6 % source % -> %',r.signature,v_hash,md5(v_new);
  END LOOP;
END;
$targeted_patches$;
ALTER FUNCTION api.approve_pending_change(uuid,text,boolean) SET lock_timeout='5s';
ALTER FUNCTION api.reject_pending_change(uuid,text) SET lock_timeout='5s';
ALTER FUNCTION api.approve_fiche_submission(uuid,text,boolean) SET lock_timeout='5s';
ALTER FUNCTION api.reject_fiche_submission(uuid,text) SET lock_timeout='5s';
ALTER FUNCTION api.save_object_commercial(text,jsonb) SET lock_timeout='5s';
ALTER FUNCTION api.save_object_openings(text,jsonb) SET lock_timeout='5s';
COMMIT;
NOTIFY pgrst,'reload schema';
