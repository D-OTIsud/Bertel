-- test_object_web_channel_read_gate.sql
-- Proves migration_object_web_channel.sql (§90, manifest 14m): the object_web_channel
-- table (object-scoped social_network + distribution_channel online presence), its
-- structure (composite FK to ref_code(id,domain) + domain CHECK + per-command RLS), and
-- the §49 split read gate:
--   * anon reads ZERO rows of a DRAFT object
--   * anon reads ONLY the is_public rows of a PUBLISHED object (private stay hidden)
--   * a member of the owning ORG reads ALL rows (public+private) of both statuses (extended arm)
--   * a member of an unrelated ORG behaves exactly like anon (no extended leak)
--   * the composite FK accepts BOTH domains and rejects a mismatched (id,domain); the CHECK
--     rejects an out-of-set domain.
-- Against a DB WITHOUT the migration the structural assertions fail -> red.
-- Self-contained + transactional (ROLLBACK; nothing persists). Mirrors test_contact_channel_read_gate.sql.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_orgA   text := 'ORGRUN9999990901';
  v_orgB   text := 'ORGRUN9999990902';
  v_pubA   text := 'HOTRUN9999990911';  -- published, ORG-A scoped
  v_draftA text := 'HOTRUN9999990912';  -- draft, ORG-A scoped
  v_userA  uuid := '00000000-0000-4000-a000-0000000000d1';
  v_userB  uuid := '00000000-0000-4000-a000-0000000000d2';
  v_pub_role uuid;
  v_social   uuid;
  v_distrib  uuid;
  v_pol int; v_trg int; v_ok boolean; v_distrib_id uuid;
BEGIN
  -- ---------- Structural ----------
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='public.object_web_channel'::regclass),
         'object_web_channel RLS not enabled (migration not applied)';
  SELECT count(*) INTO v_pol FROM pg_policy WHERE polrelid='public.object_web_channel'::regclass;
  ASSERT v_pol = 4, 'expected 4 policies (read + canonical ins/upd/del), got '||v_pol;
  ASSERT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.object_web_channel'::regclass AND polname='read_object_web_channel' AND polcmd='r'), 'read policy missing';
  ASSERT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.object_web_channel'::regclass AND polname='canonical_ins_object_web_channel' AND polcmd='a'), 'canonical insert policy missing';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.object_web_channel'::regclass AND polcmd='*'),
         'FOR ALL policy present (must be per-command — §47)';
  SELECT count(*) INTO v_trg FROM pg_trigger WHERE tgrelid='public.object_web_channel'::regclass AND NOT tgisinternal;
  ASSERT v_trg = 2, 'expected 2 triggers (updated_at + audit), got '||v_trg;
  ASSERT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.object_web_channel'::regclass AND contype='f'
                 AND pg_get_constraintdef(oid) ILIKE '%ref_code(id, domain)%'),
         'composite FK to ref_code(id, domain) missing';

  -- ---------- Fixture (as the connecting superuser; RLS bypassed) ----------
  SELECT id INTO v_pub_role FROM ref_org_role WHERE code = 'publisher' LIMIT 1;
  IF v_pub_role IS NULL THEN RAISE EXCEPTION 'fixture: ref_org_role[publisher] missing (seeds not applied)'; END IF;
  SELECT id INTO v_social  FROM ref_code WHERE domain='social_network'      ORDER BY code LIMIT 1;
  SELECT id INTO v_distrib FROM ref_code WHERE domain='distribution_channel' ORDER BY code LIMIT 1;
  IF v_social IS NULL OR v_distrib IS NULL THEN RAISE EXCEPTION 'fixture: ref_code social_network/distribution_channel empty (seeds not applied)'; END IF;

  INSERT INTO object (id, object_type, name, status) VALUES
    (v_orgA,   'ORG', 'Org A',   'published'),
    (v_orgB,   'ORG', 'Org B',   'published'),
    (v_pubA,   'HOT', 'Pub A',   'published'),
    (v_draftA, 'HOT', 'Draft A', 'draft');

  INSERT INTO object_org_link (object_id, org_object_id, role_id) VALUES
    (v_pubA,   v_orgA, v_pub_role),
    (v_draftA, v_orgA, v_pub_role);

  -- one public + one private SOCIAL row per object
  INSERT INTO object_web_channel (object_id, kind_id, kind_domain, value, is_public) VALUES
    (v_pubA,   v_social, 'social_network', 'pub-A-public',    TRUE),
    (v_pubA,   v_social, 'social_network', 'pub-A-private',   FALSE),
    (v_draftA, v_social, 'social_network', 'draft-A-public',  TRUE),
    (v_draftA, v_social, 'social_network', 'draft-A-private', FALSE);

  -- ---------- Composite FK + CHECK (superuser; RLS bypassed, constraints enforced) ----------
  -- distribution domain ACCEPTED (proves the table holds both domains); remove it after so
  -- it does not perturb the read-gate counts below.
  INSERT INTO object_web_channel (object_id, kind_id, kind_domain, value, is_public)
    VALUES (v_pubA, v_distrib, 'distribution_channel', 'pub-A-booking', TRUE)
    RETURNING id INTO v_distrib_id;
  DELETE FROM object_web_channel WHERE id = v_distrib_id;

  -- mismatched (social id under distribution_channel domain) REJECTED by the composite FK
  v_ok := false;
  BEGIN
    INSERT INTO object_web_channel (object_id, kind_id, kind_domain, value)
      VALUES (v_pubA, v_social, 'distribution_channel', 'mismatch'); v_ok := true;
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  ASSERT NOT v_ok, 'composite FK accepted a mismatched (kind_id, kind_domain)';

  -- out-of-set domain REJECTED by the CHECK
  v_ok := false;
  BEGIN
    INSERT INTO object_web_channel (object_id, kind_id, kind_domain, value)
      VALUES (v_pubA, v_social, 'contact_kind', 'bad-domain'); v_ok := true;
  EXCEPTION WHEN check_violation OR foreign_key_violation THEN NULL; END;
  ASSERT NOT v_ok, 'CHECK accepted an out-of-set kind_domain';

  -- ---------- Users ----------
  INSERT INTO auth.users (id, email) VALUES
    (v_userA, 'owc_a@test.local'), (v_userB, 'owc_b@test.local')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES
    (v_userA, 'tourism_agent'), (v_userB, 'tourism_agent')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES
    (v_userA, v_orgA, TRUE), (v_userB, v_orgB, TRUE);

  -- ---------- ANON: draft invisible; published = public rows only ----------
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
    ASSERT (SELECT count(*) FROM object_web_channel WHERE object_id = v_draftA) = 0,
           'LEAK: anon reads web_channel rows of a DRAFT object';
    ASSERT (SELECT count(*) FROM object_web_channel WHERE object_id = v_pubA) = 1,
           'anon MUST read exactly the public web_channel row of a published object';
    ASSERT (SELECT count(*) FROM object_web_channel WHERE object_id = v_pubA AND is_public IS NOT TRUE) = 0,
           'LEAK: anon reads a PRIVATE web_channel row of a published object';
  RESET ROLE;

  -- ---------- USER A (member of owning ORG A): all rows, both statuses ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_userA, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT (SELECT count(*) FROM object_web_channel WHERE object_id = v_draftA) = 2,
           'user A MUST read public+private web_channels of own ORG draft (extended arm)';
    ASSERT (SELECT count(*) FROM object_web_channel WHERE object_id = v_pubA) = 2,
           'user A MUST read public+private web_channels of own ORG published object';
  RESET ROLE;

  -- ---------- USER B (unrelated ORG B): same visibility as anon ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_userB, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT (SELECT count(*) FROM object_web_channel WHERE object_id = v_draftA) = 0,
           'LEAK: user B reads web_channel rows of a foreign ORG draft';
    ASSERT (SELECT count(*) FROM object_web_channel WHERE object_id = v_pubA) = 1,
           'user B MUST read only the public web_channel row of a published object';
  RESET ROLE;

  RAISE NOTICE 'object_web_channel read-gate + structure assertions passed.';
END$$;
ROLLBACK;
