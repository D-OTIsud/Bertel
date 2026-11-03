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
  v_sub_id uuid; v_domain text; v_baseline jsonb;
BEGIN
  -- Same order as bulk approval / photo preparation: submission -> proposal -> object.
  SELECT submission_id INTO v_sub_id FROM pending_change WHERE id=p_id;
  IF v_sub_id IS NOT NULL THEN PERFORM 1 FROM fiche_submission WHERE id=v_sub_id FOR UPDATE; END IF;
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

  v_domain:=internal.pending_collection_domain(v_row.metadata);
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
ALTER FUNCTION api.approve_pending_change(uuid,text,boolean) SET lock_timeout='5s';

CREATE OR REPLACE FUNCTION api.approve_fiche_submission(
  p_submission_id  uuid,
  p_review_note    text    DEFAULT NULL,
  p_include_manual boolean DEFAULT FALSE
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, api, auth, pg_temp
AS $$
DECLARE
  v_sub fiche_submission%ROWTYPE;
  v_pc  RECORD;
  v_applied int := 0;
  v_manual  int := 0;
  v_skipped int := 0;
BEGIN
  SELECT * INTO v_sub FROM fiche_submission WHERE id = p_submission_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Soumission introuvable: %', p_submission_id USING ERRCODE = 'no_data_found';
  END IF;
  -- Garde PROPRE, et pas seulement celle d'approve_pending_change : sur une soumission dont
  -- plus aucune ligne n'est pending, la boucle ci-dessous ne s'exécute pas — sans ce contrôle,
  -- l'appel rendrait un SUCCÈS à quelqu'un qui n'a aucun droit sur la fiche.
  IF NOT api.user_can_moderate_object(v_sub.object_id) THEN
    RAISE EXCEPTION 'Droits de modération insuffisants sur cet objet' USING ERRCODE = '42501';
  END IF;

  FOR v_pc IN
    SELECT id, (metadata->>'rpc') AS rpc, internal.pending_change_needs_manual_report(id,metadata) AS needs_manual FROM pending_change
    WHERE submission_id = p_submission_id AND status = 'pending'
    ORDER BY submitted_at, id
  LOOP
    IF v_pc.needs_manual AND NOT COALESCE(p_include_manual, FALSE) THEN
      -- Reste pending, DÉLIBÉRÉMENT : le modérateur n'a pas déclaré avoir reporté ces
      -- rubriques. Tant qu'il en reste une, la soumission ne peut pas se résoudre — le
      -- verrou « une seule vérification ouverte » tient, et l'acteur ne rouvre pas la fiche
      -- pendant que l'office travaille encore.
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    -- L'attestation n'est propagée que pour les lignes SANS writer : sur une ligne auto, elle
    -- serait un mensonge d'audit (la machine écrit, personne n'atteste).
    PERFORM api.approve_pending_change(v_pc.id, p_review_note, v_pc.needs_manual);
    IF v_pc.needs_manual THEN v_manual := v_manual + 1; ELSE v_applied := v_applied + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'applied_count', v_applied, 'approved_manual_count', v_manual,
    'skipped_manual_count', v_skipped,
    -- Relu APRÈS la boucle : le trigger de résolution (§8) a pu le faire basculer pendant.
    'submission_status', (SELECT status FROM fiche_submission WHERE id = p_submission_id));
END;
$$;


CREATE OR REPLACE FUNCTION api.list_pending_changes(
  p_status    text DEFAULT 'pending',
  p_object_id text DEFAULT NULL,
  p_limit     int  DEFAULT 50,
  p_offset    int  DEFAULT 0
)
RETURNS TABLE (
  id             uuid,
  object_id      text,
  object_name    text,
  target_table   text,
  target_pk      text,
  action         text,
  status         text,
  field_label    text,
  before_value   text,
  after_value    text,
  submitted_by   uuid,
  submitter_label text,
  submitted_at   timestamptz,
  reviewed_by    uuid,
  reviewer_label text,
  reviewed_at    timestamptz,
  review_note    text,
  applied_at     timestamptz,
  submission_id  uuid,
  submission_note text,
  actor_label    text,
  manual_apply   boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, api, auth, pg_temp
AS $$
DECLARE
  v_is_super boolean := api.is_platform_superuser();
  v_scope    text[]  := ARRAY(SELECT api.current_user_crm_object_ids());
  v_can_validate boolean := api.user_has_permission('validate_changes');
  v_limit    int := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset   int := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  RETURN QUERY
  SELECT
    pc.id, pc.object_id, o.name, pc.target_table, pc.target_pk, pc.action, pc.status,
    pc.metadata->>'field'  AS field_label,
    pc.metadata->>'before' AS before_value,
    pc.metadata->>'after'  AS after_value,
    pc.submitted_by,
    COALESCE(sp.display_name, 'Utilisateur ' || left(pc.submitted_by::text, 8)) AS submitter_label,
    pc.submitted_at,
    pc.reviewed_by,
    CASE WHEN pc.reviewed_by IS NULL THEN NULL
         ELSE COALESCE(rp.display_name, 'Utilisateur ' || left(pc.reviewed_by::text, 8)) END AS reviewer_label,
    pc.reviewed_at, pc.review_note, pc.applied_at,
    -- 18a/D9 : le groupage par soumission + le libellé acteur (joint à la lecture, RGPD).
    pc.submission_id,
    fs.note AS submission_note,
    a.display_name AS actor_label,
    -- UNE seule source de vérité : le prédicat exact sur lequel la MACHINE décide
    -- (approve_pending_change et approve_fiche_submission branchent tous deux sur
    -- `metadata->>'rpc' IS NULL`). metadata.manual_apply est une DÉCLARATION du soumetteur,
    -- recopiée depuis le corps de requête et jamais confrontée à rpc : s'en servir pour peindre
    -- le bouton du modérateur rouvrait la panne même que D9 ferme — la file annonce
    -- « application automatique » sur une rubrique sans writer, le conseiller clique Approuver,
    -- prend un refus, et il ne lui reste que le rejet ; la soumission ne se résout pas, le
    -- verrou tient, le prestataire reste en PT409. Symétrie inverse tout aussi fausse :
    -- {rpc: save_object_openings, manual_apply: true} faisait cocher une attestation sur une
    -- ligne que la machine applique elle-même. `->>` ne caste rien : le rationale anti-22P02
    -- sur jsonb libre (classe §17m) est préservé, y compris face à une valeur aberrante.
    internal.pending_change_needs_manual_report(pc.id,pc.metadata) AS manual_apply
  FROM pending_change pc
  LEFT JOIN object o            ON o.id = pc.object_id
  LEFT JOIN app_user_profile sp ON sp.id = pc.submitted_by
  LEFT JOIN app_user_profile rp ON rp.id = pc.reviewed_by
  LEFT JOIN fiche_submission fs ON fs.id = pc.submission_id
  LEFT JOIN actor a             ON a.id = fs.actor_id
  WHERE (p_status IS NULL OR pc.status = p_status)
    AND (p_object_id IS NULL OR pc.object_id = p_object_id)
    AND (
      v_is_super
      OR (v_can_validate AND pc.object_id IS NOT NULL AND pc.object_id = ANY(v_scope))
    )
  ORDER BY pc.submitted_at DESC, pc.id
  LIMIT v_limit OFFSET v_offset;
END;
$$;
CREATE OR REPLACE FUNCTION api.reject_pending_change(
  p_id          uuid,
  p_review_note text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_row pending_change%ROWTYPE;
  v_now timestamptz := now();
  v_sub_id uuid;
BEGIN
  IF p_review_note IS NULL OR btrim(p_review_note) = '' THEN
    RAISE EXCEPTION 'Un motif de refus est obligatoire' USING ERRCODE = '22023';
  END IF;

  SELECT submission_id INTO v_sub_id FROM pending_change WHERE id=p_id;
  IF v_sub_id IS NOT NULL THEN PERFORM 1 FROM fiche_submission WHERE id=v_sub_id FOR UPDATE; END IF;
  SELECT * INTO v_row FROM pending_change WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Suggestion introuvable: %', p_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'Suggestion déjà résolue (statut=%)', v_row.status USING ERRCODE = '22023';
  END IF;
  IF v_row.object_id IS NULL OR NOT api.user_can_moderate_object(v_row.object_id) THEN
    RAISE EXCEPTION 'Droits de modération insuffisants sur cet objet' USING ERRCODE = '42501';
  END IF;

  UPDATE pending_change
     SET status      = 'rejected',
         reviewed_by = auth.uid(),
         reviewed_at = v_now,
         review_note = p_review_note,
         updated_at  = v_now
   WHERE id = p_id;

  RETURN jsonb_build_object('success', true, 'id', p_id, 'status', 'rejected', 'reviewed_at', v_now);
END;
$$;

ALTER FUNCTION api.reject_pending_change(uuid,text) SET lock_timeout='5s';
ALTER FUNCTION api.approve_fiche_submission(uuid,text,boolean) SET lock_timeout='5s';
ALTER FUNCTION api.reject_fiche_submission(uuid,text) SET lock_timeout='5s';
COMMIT;
NOTIFY pgrst,'reload schema';
