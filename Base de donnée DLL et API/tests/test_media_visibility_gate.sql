-- test_media_visibility_gate.sql
-- Proves the §59 media visibility gate (migration_media_visibility_gate.sql, 14a):
--   * anon reads ONLY (visibility NULL or 'public') AND is_published media of a
--     PUBLISHED object (pre-14a, 'private'/'partners' rows of published objects were
--     anon-readable via direct PostgREST — the §51-deferred field gate)
--   * NULL visibility stays anon-readable (media NULL ≈ public — RPC contract +
--     4014 NULL live rows; deliberately unlike object_description)
--   * anon reads ZERO media of a DRAFT object (8t arm intact)
--   * a member of the owning ORG reads ALL rows (extended arm intact, incl.
--     private/partners/unpublished — the §05 editor loads them)
--   * a member of an unrelated ORG behaves exactly like anon
--   * the cover cache (trg_update_cached_main_image) never picks a private/partners
--     media as object.cached_main_image_url — the public card image source
-- Against a DB without 14a: the private-leak and cover assertions fail -> red.
-- Self-contained + transactional (ROLLBACK; nothing persists).
-- Mirrors test_object_review_read_gate.sql fixture mechanics.
\set ON_ERROR_STOP on
BEGIN;
-- The current canonical database includes the actor-photo correction reader.
-- This temporary assertion rejects every other SELECT or FOR ALL policy.
SET LOCAL search_path=pg_catalog,public;
CREATE FUNCTION pg_temp.assert_media_visibility_policies() RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $policy_contract$
BEGIN
  ASSERT (SELECT count(*) FROM pg_policy WHERE polrelid='public.media'::regclass
    AND polcmd IN ('r','*'))=2, 'media must have exactly the two reviewed SELECT policies and no FOR ALL bypass';
  ASSERT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.media'::regclass
    AND polname='read_media' AND polcmd='r' AND polpermissive AND polroles=ARRAY[0]::oid[]
    AND polwithcheck IS NULL
    AND regexp_replace(pg_get_expr(polqual,polrelid),'[[:space:]]','','g')=
      regexp_replace($public_reader$(((is_published IS TRUE) AND ((visibility IS NULL) OR (visibility = 'public'::text)) AND (((object_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM object o
  WHERE ((o.id = media.object_id) AND ((o.status = 'published'::object_status) AND (o.is_test = ( SELECT api.current_user_test_realm() AS current_user_test_realm))))))) OR ((place_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (object_place p
     JOIN object o ON ((o.id = p.object_id)))
  WHERE ((p.id = media.place_id) AND ((o.status = 'published'::object_status) AND (o.is_test = ( SELECT api.current_user_test_realm() AS current_user_test_realm))))))))) OR ((object_id IS NOT NULL) AND (object_id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_ids))) OR ((place_id IS NOT NULL) AND (place_id IN ( SELECT p.id
   FROM object_place p
  WHERE (p.object_id IN ( SELECT api.current_user_extended_object_ids() AS current_user_extended_object_ids))))))$public_reader$,'[[:space:]]','','g')),
    'read_media must retain the exact public visibility/extended-scope/test-realm predicate';
  ASSERT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.media'::regclass
    AND polname='correction_read_root_gallery' AND polcmd='r' AND polpermissive
    AND polroles=ARRAY['authenticated'::regrole::oid] AND polwithcheck IS NULL
    AND regexp_replace(pg_get_expr(polqual,polrelid),'[[:space:]]','','g')=
      '((place_idISNULL)ANDapi.can_read_object_for_correction(object_id))'),
    'correction reader must remain root-gallery-only and authenticated-only';
  ASSERT (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc
    WHERE oid=to_regprocedure('api.can_read_object_for_correction(text)'))='5f3aad478764f2ac4f92a43a40853f8e',
    'correction helper must retain actor denial, object realm and canonical-writer scope';
END;
$policy_contract$;
DO $$
DECLARE
  v_orgA    text := 'ORGRUN9999990701';
  v_orgB    text := 'ORGRUN9999990702';
  v_pubA    text := 'HOTRUN9999990711';  -- published, ORG-A scoped
  v_draftA  text := 'HOTRUN9999990712';  -- draft, ORG-A scoped
  v_userA   uuid := '00000000-0000-4000-a000-0000000000f3';
  v_userB   uuid := '00000000-0000-4000-a000-0000000000f4';
  v_pub_role uuid;
  v_photo    uuid;
  v_m_private uuid;
  v_m_public  uuid;
  v_rejected boolean;
BEGIN
  -- ---------- Fixture (as the connecting superuser/owner; RLS bypassed) ----------
  SELECT id INTO v_pub_role FROM ref_org_role WHERE code = 'publisher' LIMIT 1;
  IF v_pub_role IS NULL THEN RAISE EXCEPTION 'fixture: ref_org_role[publisher] missing (seeds not applied)'; END IF;
  SELECT id INTO v_photo FROM ref_code WHERE domain = 'media_type' AND code = 'photo' LIMIT 1;
  IF v_photo IS NULL THEN RAISE EXCEPTION 'fixture: ref_code media_type[photo] missing (seeds not applied)'; END IF;

  -- users first: object.created_by has an FK to auth.users
  INSERT INTO auth.users (id, email) VALUES
    (v_userA, 'mvgate_a@test.local'), (v_userB, 'mvgate_b@test.local')
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

  -- media matrix on the PUBLISHED object: NULL / public / private / partners /
  -- unpublished-public; plus one public media on the DRAFT object.
  -- All is_main FALSE for now — the cover assertions flip them deliberately below.
  INSERT INTO media (id, object_id, media_type_id, url, title, visibility, is_published, is_main) VALUES
    (gen_random_uuid(), v_pubA,   v_photo, 'https://test.local/null.jpg',     'Vis NULL',    NULL,       TRUE,  FALSE),
    (gen_random_uuid(), v_pubA,   v_photo, 'https://test.local/public.jpg',   'Vis public',  'public',   TRUE,  FALSE),
    (gen_random_uuid(), v_pubA,   v_photo, 'https://test.local/private.jpg',  'Vis private', 'private',  TRUE,  FALSE),
    (gen_random_uuid(), v_pubA,   v_photo, 'https://test.local/partners.jpg', 'Vis partner', 'partners', TRUE,  FALSE),
    (gen_random_uuid(), v_pubA,   v_photo, 'https://test.local/unpub.jpg',    'Unpublished', 'public',   FALSE, FALSE),
    (gen_random_uuid(), v_draftA, v_photo, 'https://test.local/draft.jpg',    'Draft media', 'public',   TRUE,  FALSE);
  SELECT id INTO v_m_private FROM media WHERE object_id = v_pubA AND title = 'Vis private';
  SELECT id INTO v_m_public  FROM media WHERE object_id = v_pubA AND title = 'Vis public';

  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES
    (v_userA, v_orgA, TRUE), (v_userB, v_orgB, TRUE);

  -- ---------- Exact SELECT contracts, including adversarial policy witnesses ----------
  PERFORM pg_temp.assert_media_visibility_policies();
  v_rejected:=false;
  BEGIN
    CREATE POLICY album_test_for_all_bypass ON public.media FOR ALL TO anon USING(true) WITH CHECK(true);
    PERFORM pg_temp.assert_media_visibility_policies();
  EXCEPTION WHEN assert_failure THEN v_rejected:=true; END;
  ASSERT v_rejected, 'A third FOR ALL read bypass was not rejected';
  v_rejected:=false;
  BEGIN
    ALTER POLICY correction_read_root_gallery ON public.media TO PUBLIC;
    PERFORM pg_temp.assert_media_visibility_policies();
  EXCEPTION WHEN assert_failure THEN v_rejected:=true; END;
  ASSERT v_rejected, 'A publicly broadened correction reader was not rejected';
  v_rejected:=false;
  BEGIN
    ALTER POLICY read_media ON public.media USING(true);
    PERFORM pg_temp.assert_media_visibility_policies();
  EXCEPTION WHEN assert_failure THEN v_rejected:=true; END;
  ASSERT v_rejected, 'A weakened public visibility predicate was not rejected';
  PERFORM pg_temp.assert_media_visibility_policies();

  -- ---------- ANON: published parent -> NULL+public only; draft parent -> nothing ----------
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
    ASSERT (SELECT count(*) FROM media WHERE object_id = v_pubA) = 2,
           'anon MUST read exactly the NULL + public visibility media of a published object';
    ASSERT (SELECT count(*) FROM media WHERE object_id = v_pubA
            AND visibility IN ('private','partners')) = 0,
           'LEAK: anon reads private/partners media of a published object (§51 gap not closed?)';
    ASSERT (SELECT count(*) FROM media WHERE object_id = v_pubA AND is_published IS NOT TRUE) = 0,
           'LEAK: anon reads an UNPUBLISHED media of a published object (8t arm broken?)';
    ASSERT (SELECT count(*) FROM media WHERE object_id = v_draftA) = 0,
           'LEAK: anon reads media of a DRAFT object (8t arm broken?)';
  RESET ROLE;

  -- ---------- USER A (member of owning ORG A): everything (extended arm) ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_userA, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT (SELECT count(*) FROM media WHERE object_id = v_pubA) = 5,
           'user A MUST read all 5 media of own ORG published object (incl. private/partners/unpublished)';
    ASSERT (SELECT count(*) FROM media WHERE object_id = v_draftA) = 1,
           'user A MUST read the media of own ORG draft (extended arm)';
  RESET ROLE;

  -- ---------- USER B (unrelated ORG B): same visibility as anon ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_userB, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT (SELECT count(*) FROM media WHERE object_id = v_pubA) = 2,
           'user B MUST see exactly what anon sees on a foreign published object';
    ASSERT (SELECT count(*) FROM media WHERE object_id = v_draftA) = 0,
           'LEAK: user B reads media of a foreign ORG draft';
  RESET ROLE;

  -- ---------- Cover cache: a private is_main must never feed the public card image ----------
  UPDATE media SET is_main = TRUE WHERE id = v_m_private;
  ASSERT (SELECT cached_main_image_url FROM object WHERE id = v_pubA) IS NULL,
         'LEAK: a PRIVATE is_main media became object.cached_main_image_url (public card image)';
  -- a public is_main IS picked (trg_enforce_single_main_media demotes the private one)
  UPDATE media SET is_main = TRUE WHERE id = v_m_public;
  ASSERT (SELECT cached_main_image_url FROM object WHERE id = v_pubA) = 'https://test.local/public.jpg',
         'cover cache must pick the public is_main media';

  RAISE NOTICE 'media visibility-gate assertions passed.';
END$$;
ROLLBACK;
