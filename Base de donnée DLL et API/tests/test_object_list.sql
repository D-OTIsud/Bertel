-- test_object_list.sql
-- Proves migration_object_list.sql (module « Listes & templates d'envoi ») :
--   * structure : tables object_list / object_list_item, RLS ON, read policies,
--     index unique share_token, présence des RPC + résolveur.
--   * verrouillage : anon ne peut exécuter QUE api.get_public_list_by_token ;
--     pas d'accès table directe ; helper list_effective_object_ids non exposé.
--   * liste STATIQUE depuis une sélection (3 ids) → 3 items, resolved_from='items'.
--   * reconcile items non-destructif : retire un item + pose une note.
--   * update_list : nom + recipient_label (PII) appliqués.
--   * partage + lecture PUBLIQUE : objets PUBLIÉS uniquement (item draft EXCLU),
--     AUCUNE clé recipient_label, aucune fuite du nom du destinataire.
--   * liste DYNAMIQUE : resolved_from='filters', résolution live bornée.
--   * isolation cross-org : un membre d'une AUTRE org ne peut PAS lire la liste.
-- Contre une base SANS la migration, les assertions structurelles échouent -> rouge.
-- Self-contained + transactionnel (ROLLBACK ; rien ne persiste). Style test_object_web_channel_read_gate.sql.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_orgA   text := 'ORGRUN9999990801';
  v_orgB   text := 'ORGRUN9999990802';
  v_pub1   text := 'HOTRUN9999990811';  -- published
  v_pub2   text := 'HOTRUN9999990812';  -- published
  v_draft1 text := 'HOTRUN9999990813';  -- draft (doit être exclu de la page publique)
  v_userA  uuid := '00000000-0000-4000-a000-0000000000e1';
  v_userB  uuid := '00000000-0000-4000-a000-0000000000e2';
  v_pub_role uuid;
  v_static uuid; v_dyn uuid; v_tok text;
  j jsonb; j_pub jsonb; v_n int; v_ok boolean;
BEGIN
  -- ---------- Structural ----------
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='public.object_list'::regclass),
         'object_list RLS not enabled (migration not applied)';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='public.object_list_item'::regclass),
         'object_list_item RLS not enabled';
  ASSERT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.object_list'::regclass AND polname='read_object_list' AND polcmd='r'),
         'read_object_list policy missing';
  ASSERT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='uq_object_list_share_token'),
         'unique share_token index missing';
  ASSERT to_regprocedure('api.get_public_list_by_token(text)') IS NOT NULL, 'get_public_list_by_token missing';
  ASSERT to_regprocedure('api.resolve_list_object_ids(jsonb,boolean,int)') IS NOT NULL, 'resolve_list_object_ids missing';

  -- ---------- Grants / lock ----------
  ASSERT NOT has_function_privilege('anon','api.create_list(text,text,text[],jsonb,text)','execute'),
         'LOCK: anon can execute create_list';
  ASSERT NOT has_function_privilege('anon','api.get_list(uuid)','execute'),
         'LOCK: anon can execute get_list';
  ASSERT     has_function_privilege('anon','api.get_public_list_by_token(text)','execute'),
         'anon MUST be able to execute get_public_list_by_token';
  ASSERT NOT has_function_privilege('anon','api.list_effective_object_ids(uuid,boolean)','execute'),
         'LOCK: internal helper list_effective_object_ids exposed to anon';
  ASSERT NOT has_table_privilege('anon','object_list','select'),
         'LOCK: anon has direct SELECT on object_list';

  -- ---------- Fixture (superuser ; RLS bypassed) ----------
  SELECT id INTO v_pub_role FROM ref_org_role WHERE code='publisher' LIMIT 1;
  IF v_pub_role IS NULL THEN RAISE EXCEPTION 'fixture: ref_org_role[publisher] missing (seeds not applied)'; END IF;

  INSERT INTO object (id, object_type, name, status) VALUES
    (v_orgA,   'ORG', 'Org A',   'published'),
    (v_orgB,   'ORG', 'Org B',   'published'),
    (v_pub1,   'HOT', 'Pub 1',   'published'),
    (v_pub2,   'HOT', 'Pub 2',   'published'),
    (v_draft1, 'HOT', 'Draft 1', 'draft');

  INSERT INTO auth.users (id, email) VALUES
    (v_userA, 'lists_a@test.local'), (v_userB, 'lists_b@test.local')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES
    (v_userA, 'tourism_agent'), (v_userB, 'tourism_agent')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES
    (v_userA, v_orgA, TRUE), (v_userB, v_orgB, TRUE);

  -- ---------- USER A : create static list from a "selection" ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_userA, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  v_static := api.create_list('static','Test statique', ARRAY[v_pub1, v_pub2, v_draft1], NULL, NULL);
  j := api.get_list(v_static)::jsonb;
  ASSERT jsonb_array_length(j->'items') = 3, 'static list should have 3 items, got '||jsonb_array_length(j->'items');
  ASSERT j->>'resolved_from' = 'items', 'static list resolved_from must be items';

  -- reconcile : keep pub1+pub2, drop draft1, note on pub1
  PERFORM api.set_list_items(v_static, jsonb_build_array(
    jsonb_build_object('object_id', v_pub1, 'position', 0, 'note_fr', 'Mon coup de coeur'),
    jsonb_build_object('object_id', v_pub2, 'position', 1)));
  j := api.get_list(v_static)::jsonb;
  ASSERT jsonb_array_length(j->'items') = 2, 'after reconcile: expected 2 items, got '||jsonb_array_length(j->'items');
  ASSERT (j->'items'->0->>'note_fr') = 'Mon coup de coeur', 'reconcile lost the per-item note';

  -- update metadata (name + PII recipient)
  PERFORM api.update_list(v_static, jsonb_build_object('name','Week-end dans le Sud','recipient_label','Camille & Yann'));
  j := api.get_list(v_static)::jsonb;
  ASSERT j->>'name' = 'Week-end dans le Sud', 'update_list did not apply name';
  ASSERT j->>'recipient_label' = 'Camille & Yann', 'update_list did not apply recipient_label';

  -- put draft1 BACK to exercise the published-only exclusion on the public path
  PERFORM api.set_list_items(v_static, jsonb_build_array(
    jsonb_build_object('object_id', v_pub1, 'position', 0),
    jsonb_build_object('object_id', v_pub2, 'position', 1),
    jsonb_build_object('object_id', v_draft1, 'position', 2)));

  -- share
  j := api.share_list(v_static, true, NULL)::jsonb;
  v_tok := j->>'share_token';
  ASSERT length(v_tok) >= 32, 'share token too short (weak)';
  ASSERT j->>'share_url_path' = '/l/'||v_tok, 'share_url_path malformed';

  RESET ROLE;

  -- ---------- PUBLIC (anon) : published-only + NO PII ----------
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
    j_pub := api.get_public_list_by_token(v_tok)::jsonb;
    ASSERT j_pub IS NOT NULL AND j_pub <> 'null'::jsonb, 'public read returned null for a valid enabled token';
    ASSERT jsonb_array_length(j_pub->'items') = 2, 'public list must expose ONLY the 2 published items (draft excluded), got '||jsonb_array_length(j_pub->'items');
    ASSERT NOT (j_pub ? 'recipient_label'), 'PII LEAK: recipient_label key present on public payload';
    ASSERT NOT (j_pub::text ILIKE '%camille%'), 'PII LEAK: recipient name leaked in public payload';
    ASSERT j_pub->>'name' = 'Week-end dans le Sud', 'public list name mismatch';
    -- wrong / disabled / short token => null
    ASSERT api.get_public_list_by_token('deadbeefdeadbeefdeadbeefdeadbeef') IS NULL, 'unknown token must return null';
    ASSERT api.get_public_list_by_token('short') IS NULL, 'short token must return null';
  RESET ROLE;

  -- disabled share => null
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_userA, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    PERFORM api.share_list(v_static, false, NULL);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
    ASSERT api.get_public_list_by_token(v_tok) IS NULL, 'disabled share must return null';
  RESET ROLE;

  -- ---------- DYNAMIC list : resolved_from=filters, live + bounded ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_userA, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_dyn := api.create_list('dynamic','Dyn', NULL,
               '{"buckets":[{"filters":{},"search":null}]}'::jsonb, '/explorer');
    j := api.get_list(v_dyn)::jsonb;
    ASSERT j->>'resolved_from' = 'filters', 'dynamic list resolved_from must be filters';
    SELECT count(*) INTO v_n FROM api.resolve_list_object_ids('{"buckets":[{"filters":{}}]}'::jsonb, true, 5);
    ASSERT v_n <= 5, 'resolver did not honor the bound';
    -- dynamic requires filters
    v_ok := false;
    BEGIN PERFORM api.create_list('dynamic','bad', NULL, NULL, NULL); v_ok := true; EXCEPTION WHEN others THEN NULL; END;
    ASSERT NOT v_ok, 'create_list dynamic without filters must fail';
  RESET ROLE;

  -- ---------- Cross-org isolation : user B cannot read user A's list ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_userB, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_ok := false;
    BEGIN PERFORM api.get_list(v_static); v_ok := true; EXCEPTION WHEN others THEN NULL; END;
    ASSERT NOT v_ok, 'cross-org LEAK: user B read user A''s list';
    v_ok := false;
    BEGIN PERFORM api.delete_list(v_static); v_ok := true; EXCEPTION WHEN others THEN NULL; END;
    ASSERT NOT v_ok, 'cross-org LEAK: user B deleted user A''s list';
  RESET ROLE;

  RAISE NOTICE 'object_list module assertions passed (static, dynamic, share/public no-PII, cross-org isolation, lock).';
END$$;
ROLLBACK;
