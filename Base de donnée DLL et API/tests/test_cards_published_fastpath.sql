-- test_cards_published_fastpath.sql
-- Proves the PUBLISHED-ONLY FAST-PATH added to api.get_object_cards_batch (§38). The §36
-- authorize-once gate was `id IN (SELECT api.current_user_readable_object_ids())`
-- (= published ∪ extended), which ALWAYS computed the per-user extended scope
-- (api.current_user_extended_object_ids(): a 5-way UNION over actor_object_role / object_org_link /
-- user_org_membership — ~15 ms / ~1950 buffers even when it returns 0 rows for a user-less caller).
-- The gate is now SPLIT into
--     EXISTS(published object with that id)  OR  id IN (SELECT api.current_user_extended_object_ids())
-- which is SET-EQUIVALENT (published ∪ extended) but lets the executor evaluate the extended-scope
-- SubPlan LAZILY — i.e. NOT AT ALL when every requested id is already published (the read-only /
-- public card-deck + map page; verified via EXPLAIN: extended = "never executed", ~0.6 ms).
-- Because the set is unchanged, the §36 NO-LEAK guarantee is preserved EXACTLY — re-verified per persona.
-- Two assertion layers:
--   STRUCTURAL  — cards_batch stays SECURITY DEFINER; its body no longer references
--                 current_user_readable_object_ids (the combined gate) but still references
--                 current_user_extended_object_ids (drafts remain gated). Red before this migration.
--   BEHAVIOURAL — anon: a mixed page leaks NO draft; an all-published page returns exactly the
--                 published id; each org member sees the published object + only its OWN draft.
-- Self-contained + transactional (ROLLBACK; nothing persists). Mirrors test_cards_batch_authorize.sql.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_orgA   text := 'ORGRUN9999990001';
  v_orgB   text := 'ORGRUN9999990002';
  v_pubA   text := 'HOTRUN9999990011';  -- published, ORG-A
  v_draftA text := 'HOTRUN9999990012';  -- draft,     ORG-A
  v_draftB text := 'HOTRUN9999990013';  -- draft,     ORG-B
  v_userA  uuid := '00000000-0000-4000-a000-0000000000a1';
  v_userB  uuid := '00000000-0000-4000-a000-0000000000b2';
  v_pub_role uuid;
  v_ids    text[];
BEGIN
  -- ---------- STRUCTURAL: the published fast-path split is applied ----------
  ASSERT (SELECT p.prosecdef FROM pg_proc p
            WHERE p.proname='get_object_cards_batch' AND p.pronamespace='api'::regnamespace),
         'get_object_cards_batch MUST stay SECURITY DEFINER';
  ASSERT (SELECT p.prosrc NOT ILIKE '%current_user_readable_object_ids%' FROM pg_proc p
            WHERE p.proname='get_object_cards_batch' AND p.pronamespace='api'::regnamespace),
         'cards_batch MUST NOT call current_user_readable_object_ids (published fast-path not applied)';
  ASSERT (SELECT p.prosrc ILIKE '%current_user_extended_object_ids%' FROM pg_proc p
            WHERE p.proname='get_object_cards_batch' AND p.pronamespace='api'::regnamespace),
         'cards_batch MUST still gate non-published ids via current_user_extended_object_ids';

  -- ---------- Fixture (connecting superuser; RLS bypassed) ----------
  SELECT id INTO v_pub_role FROM ref_org_role WHERE code='publisher' LIMIT 1;
  IF v_pub_role IS NULL THEN RAISE EXCEPTION 'fixture: ref_org_role[publisher] missing (seeds not applied)'; END IF;

  INSERT INTO object (id, object_type, name, status) VALUES
    (v_orgA,  'ORG','Org A',  'published'),
    (v_orgB,  'ORG','Org B',  'published'),
    (v_pubA,  'HOT','Pub A',  'published'),
    (v_draftA,'HOT','Draft A','draft'),
    (v_draftB,'HOT','Draft B','draft');
  INSERT INTO object_org_link (object_id, org_object_id, role_id) VALUES
    (v_pubA,v_orgA,v_pub_role),(v_draftA,v_orgA,v_pub_role),(v_draftB,v_orgB,v_pub_role);
  INSERT INTO auth.users (id,email) VALUES
    (v_userA,'fp_a@test.local'),(v_userB,'fp_b@test.local') ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id,role) VALUES
    (v_userA,'tourism_agent'),(v_userB,'tourism_agent') ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role;
  INSERT INTO user_org_membership (user_id,org_object_id,is_active) VALUES
    (v_userA,v_orgA,TRUE),(v_userB,v_orgB,TRUE);

  -- ---------- ANON: mixed page must NOT leak any draft; all-published page is the fast-path ----------
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
    SELECT array_agg(e->>'id' ORDER BY e->>'id') INTO v_ids
      FROM jsonb_array_elements(api.get_object_cards_batch(ARRAY[v_pubA,v_draftA,v_draftB],ARRAY['fr'])::jsonb) e;
    ASSERT v_ids = ARRAY[v_pubA], format('LEAK: anon mixed page expected [pubA] only, got %s', v_ids);

    SELECT array_agg(e->>'id' ORDER BY e->>'id') INTO v_ids
      FROM jsonb_array_elements(api.get_object_cards_batch(ARRAY[v_pubA],ARRAY['fr'])::jsonb) e;
    ASSERT v_ids = ARRAY[v_pubA], format('anon all-published (fast-path) expected [pubA], got %s', v_ids);
  RESET ROLE;

  -- ---------- USER A (member ORG A): pub + own draft A, NOT draft B ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_userA,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    SELECT array_agg(e->>'id' ORDER BY e->>'id') INTO v_ids
      FROM jsonb_array_elements(api.get_object_cards_batch(ARRAY[v_pubA,v_draftA,v_draftB],ARRAY['fr'])::jsonb) e;
    ASSERT v_ids = ARRAY[v_pubA,v_draftA], format('user A expected [pubA,draftA], got %s', v_ids);
  RESET ROLE;

  -- ---------- USER B (member ORG B): pub + own draft B, NOT draft A ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_userB,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    SELECT array_agg(e->>'id' ORDER BY e->>'id') INTO v_ids
      FROM jsonb_array_elements(api.get_object_cards_batch(ARRAY[v_pubA,v_draftA,v_draftB],ARRAY['fr'])::jsonb) e;
    ASSERT v_ids = ARRAY[v_pubA,v_draftB], format('user B expected [pubA,draftB], got %s', v_ids);
  RESET ROLE;

  RAISE NOTICE 'cards published-fast-path assertions passed.';
END$$;
ROLLBACK;
