-- test_crm_module.sql
-- Prouve §58 (migration_crm_module.sql, 8z) :
-- A) VOCABULAIRES : domaine demand_topic = sujets OTI uniquement ; crm_demand_topic_oti vide ;
--    demand_subtopic vide ; partition crm_sentiment = 6 codes ; colonnes *_sentiment_id + FK.
-- B) ACCÈS : membre ORG publisher lit via RPC ; étranger lit zéro ; écriture refusée sans
--    write_crm_notes, acceptée avec ; PostgREST direct refusé (RLS) même pour le membre.
-- C) ÉCRITURE : save_crm_interaction résout topic/sentiment par code ; save_crm_task upsert + move ;
--    delete_crm_interaction supprime (membre autorisé) et refuse (membre sans permission).
-- Contre une base sans 8z : échec immédiat (RPCs api.* absentes / vocabulaires non fusionnés) — état rouge.
-- Auto-contenu + transactionnel (ROLLBACK ; rien ne persiste).
-- Mécanique de fixture calquée sur test_room_type_read_gate.sql / test_sp2_permission_behavior.sql.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  -- Plage de fixtures dédiée (08xx) : 06xx = test_object_review_read_gate, 07xx = test_media_visibility_gate.
  v_orgA   text := 'ORGRUN9999990801';
  v_orgB   text := 'ORGRUN9999990802';
  v_objA   text := 'HOTRUN9999990811';
  v_userA  uuid := '00000000-0000-4000-a000-000000000101'; -- membre ORG A, AVEC write_crm_notes
  v_userB  uuid := '00000000-0000-4000-a000-000000000102'; -- membre ORG B (étranger à l'objet)
  v_userC  uuid := '00000000-0000-4000-a000-000000000103'; -- membre ORG A, SANS permission
  v_pub_role uuid;
  v_perm uuid;
  v_payload jsonb;
  v_int_id uuid;
  v_task_id uuid;
  v_denied boolean;
BEGIN
  -- ---------- A. Vocabulaires / renommages (état post-migration ; superuser, RLS bypass) ----------
  ASSERT (SELECT count(*) FROM ref_code WHERE domain = 'crm_demand_topic_oti') = 0,
         'fusion: il reste des codes sous crm_demand_topic_oti';
  ASSERT (SELECT count(*) FROM ref_code WHERE domain = 'demand_topic') = 20,
         'fusion: demand_topic doit contenir exactement les 20 sujets OTI';
  ASSERT (SELECT count(*) FROM ref_code WHERE domain = 'demand_subtopic') = 0,
         'retrait: demand_subtopic doit être vide';
  ASSERT (SELECT count(*) FROM ref_code WHERE domain = 'crm_sentiment') = 6,
         'sentiment: 6 codes attendus';
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='crm_interaction' AND column_name='request_sentiment_id'),
         'renommage: request_sentiment_id absent';
  ASSERT NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='crm_interaction' AND column_name='request_mood_id'),
         'renommage: request_mood_id ne doit plus exister';
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='crm_interaction' AND column_name='response_sentiment_id'),
         'renommage: response_sentiment_id absent';
  ASSERT NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='crm_interaction' AND column_name='response_mood_id'),
         'renommage: response_mood_id ne doit plus exister';
  -- FK re-pointées vers ref_code_crm_sentiment (et plus ref_code_mood)
  ASSERT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'crm_interaction_request_sentiment_id_fkey'
                   AND confrelid = 'ref_code_crm_sentiment'::regclass),
         'FK: crm_interaction_request_sentiment_id_fkey doit cibler ref_code_crm_sentiment';
  ASSERT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'crm_interaction_response_sentiment_id_fkey'
                   AND confrelid = 'ref_code_crm_sentiment'::regclass),
         'FK: crm_interaction_response_sentiment_id_fkey doit cibler ref_code_crm_sentiment';

  -- ---------- Fixture (superuser, RLS bypass) ----------
  SELECT id INTO v_pub_role FROM ref_org_role WHERE code = 'publisher' LIMIT 1;
  IF v_pub_role IS NULL THEN RAISE EXCEPTION 'fixture: ref_org_role[publisher] manquant (seeds non appliqués)'; END IF;
  SELECT id INTO v_perm FROM ref_permission WHERE code = 'write_crm_notes' LIMIT 1;
  IF v_perm IS NULL THEN RAISE EXCEPTION 'fixture: ref_permission[write_crm_notes] manquant (seeds non appliqués)'; END IF;

  -- users d'abord : le trigger on_auth_user_created_app_user_profile auto-crée le profil ;
  -- l'UPSERT absorbe les lignes créées par le trigger ('tourism_agent' = rôle non-superuser).
  INSERT INTO auth.users (id, email) VALUES
    (v_userA, 'crm_a@test.local'), (v_userB, 'crm_b@test.local'), (v_userC, 'crm_c@test.local')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES
    (v_userA, 'tourism_agent'), (v_userB, 'tourism_agent'), (v_userC, 'tourism_agent')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO object (id, object_type, name, status) VALUES
    (v_orgA, 'ORG', 'ORG A CRM test', 'published'),
    (v_orgB, 'ORG', 'ORG B CRM test', 'published'),
    (v_objA, 'HOT', 'Hôtel CRM test', 'draft')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO object_org_link (object_id, org_object_id, role_id) VALUES
    (v_objA, v_orgA, v_pub_role)
    ON CONFLICT DO NOTHING;
  -- 1 membership actif par user (trigger « 1 tourism_agent = 1 ORG active » respecté)
  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES
    (v_userA, v_orgA, TRUE), (v_userB, v_orgB, TRUE), (v_userC, v_orgA, TRUE)
    ON CONFLICT DO NOTHING;
  INSERT INTO user_permission (user_id, permission_id, is_active, granted_by, granted_at, created_at, updated_at) VALUES
    (v_userA, v_perm, TRUE, v_userA, NOW(), NOW(), NOW())
    ON CONFLICT DO NOTHING;

  -- ---------- B/C. USER A (membre + permission) : écrit puis lit ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_userA, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_payload := api.save_crm_interaction(jsonb_build_object(
      'object_id', v_objA, 'interaction_type', 'call', 'body', 'Appel de test',
      'topic_code', 'demande_de_visite', 'sentiment_code', 'positif'));
    v_int_id := (v_payload->>'id')::uuid;
    ASSERT v_int_id IS NOT NULL, 'save_crm_interaction: pas d''id retourné';

    v_payload := api.save_crm_task(jsonb_build_object(
      'object_id', v_objA, 'title', 'Tâche de test', 'priority', 'high'));
    v_task_id := (v_payload->>'id')::uuid;
    ASSERT v_task_id IS NOT NULL, 'save_crm_task: pas d''id retourné';
    v_payload := api.save_crm_task(jsonb_build_object('id', v_task_id, 'status', 'in_progress'));
    ASSERT (v_payload->>'id')::uuid = v_task_id, 'save_crm_task: move de lane échoué';
    ASSERT (SELECT t->>'status' FROM jsonb_array_elements(api.list_crm_tasks()) AS t
            WHERE (t->>'id')::uuid = v_task_id) = 'in_progress',
           'save_crm_task: status non écrit (move de lane)';

    ASSERT jsonb_array_length(api.list_crm_timeline(p_object_id := v_objA)->'items') >= 1,
           'list_crm_timeline: le membre doit lire son interaction';
    v_payload := api.list_object_crm(v_objA);
    ASSERT jsonb_array_length(v_payload->'interactions') >= 1,
           'list_object_crm: interactions vides pour le membre';
    ASSERT jsonb_array_length(v_payload->'topics') >= 1,
           'list_object_crm: distribution sujets vide';
    -- topic/sentiment résolus par code (et pas perdus en route)
    ASSERT v_payload->'interactions'->0->>'topic_code' = 'demande_de_visite',
           'save_crm_interaction: topic_code non résolu/persisté';
    ASSERT v_payload->'interactions'->0->>'sentiment_code' = 'positif',
           'save_crm_interaction: sentiment_code non résolu/persisté';
    -- Défense en profondeur : le PostgREST direct reste refusé même pour le membre.
    ASSERT (SELECT count(*) FROM crm_interaction WHERE object_id = v_objA) = 0,
           'RLS: un membre ne doit PAS lire crm_interaction en direct (RPC-only)';
    ASSERT (SELECT count(*) FROM crm_task WHERE object_id = v_objA) = 0,
           'RLS: un membre ne doit PAS lire crm_task en direct (RPC-only)';
  RESET ROLE;

  -- ---------- USER C (membre SANS permission) : lit mais n'écrit pas ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_userC, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT jsonb_array_length(api.list_crm_timeline(p_object_id := v_objA)->'items') >= 1,
           'lecture: le membre sans permission doit voir la timeline de son ORG';
    v_denied := false;
    BEGIN
      PERFORM api.save_crm_interaction(jsonb_build_object('object_id', v_objA, 'body', 'refusé'));
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
    END;
    ASSERT v_denied, 'écriture: le membre sans write_crm_notes doit être refusé (42501)';
    v_denied := false;
    BEGIN
      PERFORM api.delete_crm_interaction(v_int_id);
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
    END;
    ASSERT v_denied, 'suppression: le membre sans write_crm_notes doit être refusé (42501)';
  RESET ROLE;

  -- ---------- USER B (autre ORG) : ne lit rien ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_userB, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT jsonb_array_length(api.list_crm_tasks()) = 0,
           'cross-ORG: l''étranger ne doit voir aucune tâche';
    ASSERT jsonb_array_length(api.list_crm_timeline()->'items') = 0,
           'cross-ORG: l''étranger ne doit voir aucune interaction (timeline org-wide)';
    v_denied := false;
    BEGIN
      PERFORM api.list_object_crm(v_objA);
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
    END;
    ASSERT v_denied, 'cross-ORG: list_object_crm doit refuser l''étranger (42501)';
  RESET ROLE;

  -- ---------- USER A : suppression autorisée (6e RPC) ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_userA, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_payload := api.delete_crm_interaction(v_int_id);
    ASSERT (v_payload->>'deleted')::boolean, 'delete_crm_interaction: deleted=true attendu';
    ASSERT jsonb_array_length(api.list_object_crm(v_objA)->'interactions') = 0,
           'delete_crm_interaction: l''interaction doit avoir disparu';
  RESET ROLE;

  RAISE NOTICE 'CRM module §58 : vocabulaires, accès/écriture/cross-ORG — assertions passées.';
END$$;
ROLLBACK;
