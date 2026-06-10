-- test_media_description_read_gate.sql
-- Proves the §51 media + object_description read gates (migration_media_description_read_gate.sql, 8t):
--   * anon reads ZERO media / description rows of a DRAFT object — object-keyed AND
--     place-keyed (the pre-§51 pub_media_published / pub_descriptions_public leaked their
--     flagged rows regardless of object status)
--   * anon reads ONLY is_published media and ONLY visibility='public' descriptions of a
--     PUBLISHED object (unpublished media / private+NULL-visibility descriptions stay hidden;
--     the org-overlay public description row stays anon-readable, as before)
--   * a member of the owning ORG reads ALL rows of both objects — including UNPUBLISHED
--     place-keyed media (the old ext arm was NULL-dead on place rows: §16 sub-place media
--     loader regression guard / under-exposure fix)
--   * a member of an unrelated ORG behaves exactly like anon (no extended leak)
-- Against a DB WITHOUT the migration the draft-leak assertions fail -> red.
-- Self-contained + transactional (ROLLBACK; nothing persists).
-- Mirrors test_contact_channel_read_gate.sql fixture mechanics.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_orgA   text := 'ORGRUN9999990401';
  v_orgB   text := 'ORGRUN9999990402';
  v_pubA   text := 'HOTRUN9999990411';  -- published, ORG-A scoped
  v_draftA text := 'HOTRUN9999990412';  -- draft, ORG-A scoped
  v_userA  uuid := '00000000-0000-4000-a000-0000000000d1';
  v_userB  uuid := '00000000-0000-4000-a000-0000000000d2';
  v_pub_role    uuid;
  v_mt          uuid;
  v_placePub    uuid;
  v_placeDraft  uuid;
BEGIN
  -- ---------- Fixture (as the connecting superuser; RLS bypassed) ----------
  SELECT id INTO v_pub_role FROM ref_org_role WHERE code = 'publisher' LIMIT 1;
  IF v_pub_role IS NULL THEN RAISE EXCEPTION 'fixture: ref_org_role[publisher] missing (seeds not applied)'; END IF;
  SELECT id INTO v_mt FROM ref_code_media_type ORDER BY code LIMIT 1;
  IF v_mt IS NULL THEN RAISE EXCEPTION 'fixture: ref_code_media_type empty (seeds not applied)'; END IF;

  INSERT INTO object (id, object_type, name, status) VALUES
    (v_orgA,   'ORG', 'Org A',   'published'),
    (v_orgB,   'ORG', 'Org B',   'published'),
    (v_pubA,   'HOT', 'Pub A',   'published'),
    (v_draftA, 'HOT', 'Draft A', 'draft');

  INSERT INTO object_org_link (object_id, org_object_id, role_id) VALUES
    (v_pubA,   v_orgA, v_pub_role),
    (v_draftA, v_orgA, v_pub_role);

  INSERT INTO object_place (object_id, label) VALUES (v_pubA,   'Place pub A')   RETURNING id INTO v_placePub;
  INSERT INTO object_place (object_id, label) VALUES (v_draftA, 'Place draft A') RETURNING id INTO v_placeDraft;

  -- object-keyed media: one published + one unpublished flag per object
  INSERT INTO media (object_id, media_type_id, url, title, is_published) VALUES
    (v_pubA,   v_mt, 'https://test.local/pub-a-pub.jpg',     'pub-A-pub',     TRUE),
    (v_pubA,   v_mt, 'https://test.local/pub-a-unpub.jpg',   'pub-A-unpub',   FALSE),
    (v_draftA, v_mt, 'https://test.local/draft-a-pub.jpg',   'draft-A-pub',   TRUE),
    (v_draftA, v_mt, 'https://test.local/draft-a-unpub.jpg', 'draft-A-unpub', FALSE);
  -- place-keyed media (object_id NULL — the chk_media_target_present XOR leg)
  INSERT INTO media (place_id, media_type_id, url, title, is_published) VALUES
    (v_placePub,   v_mt, 'https://test.local/plpub-pub.jpg',     'plpub-pub',     TRUE),
    (v_placePub,   v_mt, 'https://test.local/plpub-unpub.jpg',   'plpub-unpub',   FALSE),
    (v_placeDraft, v_mt, 'https://test.local/pldraft-pub.jpg',   'pldraft-pub',   TRUE),
    (v_placeDraft, v_mt, 'https://test.local/pldraft-unpub.jpg', 'pldraft-unpub', FALSE);

  -- descriptions: ONE canonical row per object (uq_object_description_canonical_one);
  -- the visibility variants ride org-overlay rows (unique per org). Published object:
  -- canonical public + public overlay (anon keeps overlay access, as before) + a
  -- NULL-visibility overlay (must stay extended-only). Draft: canonical public (the
  -- leak row) + a private overlay.
  INSERT INTO object_description (object_id, description, visibility) VALUES
    (v_pubA,   'pub-A canonical public',  'public'),
    (v_draftA, 'draft-A canonical public', 'public');
  INSERT INTO object_description (object_id, org_object_id, description, visibility) VALUES
    (v_pubA,   v_orgA, 'pub-A overlay public',    'public'),
    (v_pubA,   v_orgB, 'pub-A overlay nullvis',   NULL),
    (v_draftA, v_orgA, 'draft-A overlay private', 'private');

  INSERT INTO auth.users (id, email) VALUES
    (v_userA, 'mdgate_a@test.local'), (v_userB, 'mdgate_b@test.local')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES
    (v_userA, 'tourism_agent'), (v_userB, 'tourism_agent')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES
    (v_userA, v_orgA, TRUE), (v_userB, v_orgB, TRUE);

  -- ---------- ANON: draft rows invisible (both keys); published = flagged rows only ----------
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
    ASSERT (SELECT count(*) FROM media WHERE object_id = v_draftA) = 0,
           'LEAK: anon reads object-keyed media of a DRAFT object (pub_media_published not replaced?)';
    ASSERT (SELECT count(*) FROM media WHERE place_id = v_placeDraft) = 0,
           'LEAK: anon reads place-keyed media of a DRAFT object';
    ASSERT (SELECT count(*) FROM media WHERE object_id = v_pubA) = 1,
           'anon MUST read exactly the is_published media row of a published object';
    ASSERT (SELECT count(*) FROM media WHERE object_id = v_pubA AND is_published IS NOT TRUE) = 0,
           'LEAK: anon reads an UNPUBLISHED media row of a published object';
    ASSERT (SELECT count(*) FROM media WHERE place_id = v_placePub) = 1,
           'anon MUST read exactly the is_published place-keyed media row of a published object';
    ASSERT (SELECT count(*) FROM object_description WHERE object_id = v_draftA) = 0,
           'LEAK: anon reads description rows of a DRAFT object (pub_descriptions_public not replaced?)';
    ASSERT (SELECT count(*) FROM object_description WHERE object_id = v_pubA) = 2,
           'anon MUST read exactly the visibility=public descriptions of a published object (canonical + org overlay)';
    ASSERT (SELECT count(*) FROM object_description WHERE object_id = v_pubA AND visibility IS DISTINCT FROM 'public') = 0,
           'LEAK: anon reads a non-public (private/NULL) description row of a published object';
  RESET ROLE;

  -- ---------- USER A (member of owning ORG A): all rows, both statuses, both media keys ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_userA, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT (SELECT count(*) FROM media WHERE object_id = v_draftA) = 2,
           'user A MUST read published+unpublished media of own ORG draft (extended arm)';
    ASSERT (SELECT count(*) FROM media WHERE place_id = v_placeDraft) = 2,
           'user A MUST read place-keyed media of own ORG draft incl. unpublished (ext place leg — §16 loader)';
    ASSERT (SELECT count(*) FROM media WHERE object_id = v_pubA) = 2,
           'user A MUST read published+unpublished media of own ORG published object';
    ASSERT (SELECT count(*) FROM media WHERE place_id = v_placePub) = 2,
           'user A MUST read place-keyed media of own ORG published object incl. unpublished';
    ASSERT (SELECT count(*) FROM object_description WHERE object_id = v_draftA) = 2,
           'user A MUST read public+private descriptions of own ORG draft (extended arm)';
    ASSERT (SELECT count(*) FROM object_description WHERE object_id = v_pubA) = 3,
           'user A MUST read all description rows of own ORG published object (canonical + both overlays)';
  RESET ROLE;

  -- ---------- USER B (unrelated ORG B): same visibility as anon ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_userB, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT (SELECT count(*) FROM media WHERE object_id = v_draftA) = 0,
           'LEAK: user B reads media of a foreign ORG draft';
    ASSERT (SELECT count(*) FROM media WHERE place_id = v_placeDraft) = 0,
           'LEAK: user B reads place-keyed media of a foreign ORG draft';
    ASSERT (SELECT count(*) FROM media WHERE object_id = v_pubA) = 1,
           'user B MUST read only the is_published media row of a published object';
    ASSERT (SELECT count(*) FROM object_description WHERE object_id = v_draftA) = 0,
           'LEAK: user B reads description rows of a foreign ORG draft';
    ASSERT (SELECT count(*) FROM object_description WHERE object_id = v_pubA) = 2,
           'user B MUST read only the visibility=public descriptions of a published object';
  RESET ROLE;

  RAISE NOTICE 'media + object_description read-gate assertions passed.';
END$$;
ROLLBACK;
