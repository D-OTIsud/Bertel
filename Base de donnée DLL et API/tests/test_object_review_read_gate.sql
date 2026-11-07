-- test_object_review_read_gate.sql
-- Proves the §56 object_review read gate (migration_object_review_read_gate.sql, 8w):
--   * anon reads ZERO reviews of a DRAFT object (pre-8w the bare is_published flag —
--     which DEFAULTS TRUE — leaked them: rating, content, author_name)
--   * anon reads ONLY the is_published reviews of a PUBLISHED object
--   * a member of the owning ORG reads ALL reviews of both objects — including
--     is_published=FALSE (moderated-out) rows (the table had NO extended arm before)
--   * a member of an unrelated ORG behaves exactly like anon, and still cannot write
--     (the per-command admin_ins/upd/del_object_review family, 8o, is untouched)
--   * api.get_object_reviews (SECURITY INVOKER, filters is_published itself) composes
--     with the gate: anon gets review_count=0 / reviews=[] for the draft object and
--     exactly the is_published review of the published one; a member of the owning ORG
--     still gets only is_published rows through the RPC (field filter is unconditional).
--     (These asserts were deferred while the function threw 42803 on every call —
--     COUNT/AVG nested inside jsonb_agg in the by_source leg; fixed 2026-06-11.)
-- Against a DB without 8w: the draft-leak assertions fail -> red.
-- Self-contained + transactional (ROLLBACK; nothing persists).
-- Mirrors test_room_type_read_gate.sql fixture mechanics.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_orgA    text := 'ORGRUN9999990601';
  v_orgB    text := 'ORGRUN9999990602';
  v_pubA    text := 'HOTRUN9999990611';  -- published, ORG-A scoped, created_by user A
  v_draftA  text := 'HOTRUN9999990612';  -- draft, ORG-A scoped, created_by user A
  v_userA   uuid := '00000000-0000-4000-a000-0000000000f1';
  v_userB   uuid := '00000000-0000-4000-a000-0000000000f2';
  v_pub_role uuid;
  v_src      uuid;
  v_denied   boolean;
BEGIN
  -- ---------- Fixture (as the connecting superuser/owner; RLS bypassed) ----------
  SELECT id INTO v_pub_role FROM ref_org_role WHERE code = 'publisher' LIMIT 1;
  IF v_pub_role IS NULL THEN RAISE EXCEPTION 'fixture: ref_org_role[publisher] missing (seeds not applied)'; END IF;
  SELECT id INTO v_src FROM ref_review_source ORDER BY code LIMIT 1;
  IF v_src IS NULL THEN RAISE EXCEPTION 'fixture: ref_review_source empty (seeds not applied)'; END IF;

  -- users first: object.created_by has an FK to auth.users
  INSERT INTO auth.users (id, email) VALUES
    (v_userA, 'rvgate_a@test.local'), (v_userB, 'rvgate_b@test.local')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES
    (v_userA, 'tourism_agent'), (v_userB, 'tourism_agent')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO object (id, object_type, name, status, created_by) VALUES
    (v_orgA,   'ORG', 'Org A',   'published', NULL),
    (v_orgB,   'ORG', 'Org B',   'published', NULL),
    (v_pubA,   'HOT', 'Pub A',   'published', v_userA),
    (v_draftA, 'HOT', 'Draft A', 'draft',     v_userA);

  INSERT INTO object_org_link (object_id, org_object_id, role_id) VALUES
    (v_pubA,   v_orgA, v_pub_role),
    (v_draftA, v_orgA, v_pub_role);

  -- one published-flag + one moderated-out review per object; the draft-object
  -- published-flag row is the pre-8w leak row
  INSERT INTO object_review (object_id, source_id, rating, title, author_name, is_published) VALUES
    (v_pubA,   v_src, 4.5, 'Pub on',    'Reviewer 1', TRUE),
    (v_pubA,   v_src, 1.0, 'Pub off',   'Reviewer 2', FALSE),
    (v_draftA, v_src, 5.0, 'Draft on',  'Reviewer 3', TRUE),
    (v_draftA, v_src, 2.0, 'Draft off', 'Reviewer 4', FALSE);

  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES
    (v_userA, v_orgA, TRUE), (v_userB, v_orgB, TRUE);

  -- ---------- Structural: the bare-flag policy is gone, ONE SELECT policy remains ----------
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'object_review'
      AND policyname = 'Lecture publique des avis'
  ), 'bare-flag policy "Lecture publique des avis" still present (8w not applied?)';
  ASSERT (SELECT count(*) FROM pg_policies WHERE schemaname='public'
          AND tablename='object_review' AND cmd='SELECT') = 1,
         'object_review must carry exactly ONE SELECT policy (read_object_review)';

  -- ---------- ANON: draft reviews invisible; published = is_published reviews only ----------
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
    ASSERT (SELECT count(*) FROM object_review WHERE object_id = v_draftA) = 0,
           'LEAK: anon reads reviews of a DRAFT object (bare is_published flag not replaced?)';
    ASSERT (SELECT count(*) FROM object_review WHERE object_id = v_pubA) = 1,
           'anon MUST read exactly the is_published review of a published object';
    ASSERT (SELECT count(*) FROM object_review WHERE object_id = v_pubA AND is_published IS NOT TRUE) = 0,
           'LEAK: anon reads an UNPUBLISHED review of a published object';
    -- RPC probe: SECURITY INVOKER + internal is_published filter must compose with RLS
    ASSERT ((api.get_object_reviews(v_draftA)::jsonb #>> '{summary,review_count}')::int) = 0,
           'RPC LEAK: anon get_object_reviews counts reviews of a DRAFT object';
    ASSERT (api.get_object_reviews(v_draftA)::jsonb -> 'reviews') = '[]'::jsonb,
           'RPC LEAK: anon get_object_reviews returns reviews of a DRAFT object';
    ASSERT ((api.get_object_reviews(v_pubA)::jsonb #>> '{summary,review_count}')::int) = 1,
           'RPC: anon must get exactly the is_published review of a published object';
    ASSERT (api.get_object_reviews(v_pubA)::jsonb #>> '{reviews,0,title}') = 'Pub on',
           'RPC: anon reviews[0] must be the is_published review';
    ASSERT ((api.get_object_reviews(v_pubA)::jsonb #>> '{summary,by_source,0,count}')::int) = 1,
           'RPC: by_source must aggregate the single is_published review';
  RESET ROLE;

  -- ---------- USER A (member of owning ORG A): everything, incl. moderated-out rows ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_userA, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT (SELECT count(*) FROM object_review WHERE object_id = v_draftA) = 2,
           'user A MUST read both reviews of own ORG draft (extended arm)';
    ASSERT (SELECT count(*) FROM object_review WHERE object_id = v_pubA) = 2,
           'user A MUST read both reviews of own ORG published object (incl. is_published=FALSE)';
    -- RPC keeps its is_published filter even for the owning ORG (RLS opens the row,
    -- the function's field filter still hides moderated-out reviews from the API shape)
    ASSERT ((api.get_object_reviews(v_draftA)::jsonb #>> '{summary,review_count}')::int) = 1,
           'RPC: member must get only the is_published review of own draft';
  RESET ROLE;

  -- ---------- USER B (unrelated ORG B): same visibility as anon; no writes ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_userB, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT (SELECT count(*) FROM object_review WHERE object_id = v_draftA) = 0,
           'LEAK: user B reads reviews of a foreign ORG draft';
    ASSERT (SELECT count(*) FROM object_review WHERE object_id = v_pubA) = 1,
           'user B MUST read only the is_published review of a published object';
    -- write probes: the admin-only per-command family (8o) must be intact
    v_denied := false;
    BEGIN
      INSERT INTO object_review (object_id, source_id, rating, title, is_published)
        VALUES (v_pubA, v_src, 3.0, 'Intrusion', TRUE);
    EXCEPTION WHEN insufficient_privilege THEN
      v_denied := true;
    END;
    ASSERT v_denied, 'HOLE: user B inserted a review (admin_ins_object_review weakened?)';
    -- deny-all DELETE manifests as a silent 0-row no-op — assert the row survives
    DELETE FROM object_review WHERE object_id = v_pubA;
    ASSERT (SELECT count(*) FROM object_review WHERE object_id = v_pubA) = 1,
           'HOLE: user B deleted a review (admin_del_object_review weakened?)';
  RESET ROLE;

  RAISE NOTICE 'object_review read-gate assertions passed.';
END$$;
ROLLBACK;
