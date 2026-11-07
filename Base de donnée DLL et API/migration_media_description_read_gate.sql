-- migration_media_description_read_gate.sql
-- §51 — media + object_description §38 read gates (the §49 deferred siblings).
-- Both tables predate the 8p sweep and kept pre-§38 SELECT pairs whose public arm is a
-- FIELD-LEVEL flag with NO parent-publication gate:
--   media:               pub_media_published      USING (is_published IS TRUE)
--                        ext_media_org_actor      USING (api.can_read_extended(object_id))
--   object_description:  pub_descriptions_public  USING (visibility = 'public')
--                        ext_descriptions_org_actor USING (api.can_read_extended(object_id))
-- So anon direct PostgREST could read the "published"/"public" rows of DRAFT / hidden /
-- archived objects (same class as the §49 contact_channel leak), diverging from the
-- CLAUDE.md read-path doctrine (object-child reads = parent published OR extended scope).
--
-- Replaces each pair with ONE §38 split-form policy (read_media / read_object_description):
-- published arm keeps the existing field-level gate; extended arm folds the per-row
-- can_read_extended in set-based (one InitPlan, §35; can_read_extended delegates to the
-- same set fn — one source of truth). No raw auth.*() ⇒ §39 holds by construction.
--
-- media is NOT flat-keyed: chk_media_target_present enforces object_id XOR place_id, so
-- BOTH arms need a place leg (probed through object_place, mirroring canonical_*_media):
--   * published arm: is_published AND (parent-by-object published OR parent-by-place published)
--   * extended arm:  object_id IN (set) OR place_id IN (places of the set)
-- The old ext arm was NULL-dead on place rows (can_read_extended(NULL)), so place-keyed
-- media was readable ONLY via the bare is_published flag — the editor §16 sub-place media
-- loader (object-workspace.ts .in('place_id', …)) silently missed unpublished place media
-- and would have LOST draft-object place media under a gate without the place legs. The
-- ext place leg both prevents that regression and fixes the under-exposure (an org member
-- now reads ALL place media of their scope, incl. is_published=FALSE — the read mirror of
-- the canonical write policy's place leg). The place probes ride read_object_place's own
-- §38 gate (8p): anon resolves places of published parents, members their extended scope.
--
-- Net behavior change: anon/strangers no longer read flagged-public rows of non-published
-- objects (the leak); extended users lose nothing and gain their own unpublished place
-- media (above). object_description rows with visibility NULL/'private'/'partners' stay
-- extended-only as before ('public' is the only anon value, unchanged).
--
-- SCOPE NOTE — media.visibility is NOT folded into the gate: anon may still read
-- visibility='private'/'partners' media rows of PUBLISHED objects when is_published=TRUE,
-- exactly as before (api.get_media_for_web already excludes them for web rendering).
-- Tightening that field gate needs its own consumer sweep — deferred, see decision log §51.
-- DPIA: the published-media EXIF action concerns the WRITE pipeline (single-writer
-- /api/media/upload invariant) — untouched here; read-tightening is privacy-positive.
--
-- Consumers verified unaffected (2026-06-11):
--   * api.get_object_resource / get_object_resource_adapted / get_object_cards_batch (§36)
--     — SECURITY DEFINER: bypass RLS and re-apply published/field gates internally; anon
--     output on published objects is byte-identical by construction.
--   * api.get_media_for_web — SECURITY INVOKER with NO parent-status check (filters
--     is_published + visibility only): it leaked draft-object media to anon through the old
--     policy; now returns [] for parents the caller cannot read. Published-object output
--     unchanged (parent published ⇒ same rows pass).
--   * api.get_filtered_object_ids media EXISTS (media-type facet) — anon only ever sees
--     published objects in the Explorer; editors' drafts ride the extended arm.
--   * export_publication_indesign / get_object_map_item / export_itinerary_gpx /
--     get_object_room_types — SECURITY INVOKER but reach media/object_description through
--     `object` (or room types gated on it), whose RLS already hides non-published rows from
--     anon ⇒ the revoked rows were unreachable there.
--   * read_media_tag probes through media ⇒ tags of draft-object media close consistently.
--   * Editor loaders (object-workspace.ts: media by object_id, media by place_id,
--     object_description) — extended arm; §48 superuser-without-membership caveat unchanged
--     in kind (that persona loses the flagged-public rows of drafts, same as §49; same
--     deferred fix — superuser arm in current_user_extended_object_ids).
--
-- PREREQUISITES: rls_policies.sql (api.current_user_extended_object_ids + anon/authenticated
-- EXECUTE, §35) + migration_write_policy_percommand.sql (8o: per-command writes, nothing else
-- pollutes SELECT) + migration_child_read_gate_setbased.sql (8p: read_object_place §38 form,
-- ridden by the place probes).
-- Manifest step 8t. Also FOLDED into rls_policies.sql (8i/8s precedent: that file now creates
-- read_media / read_object_description directly and its drop-section retires the old pairs)
-- ⇒ idempotent re-assertion on a fresh build; re-applying rls_policies.sql does NOT
-- resurrect the leak (no 8o-style incremental caveat for these tables).
-- IDEMPOTENT: DROP POLICY IF EXISTS + CREATE POLICY.
-- REVERSIBLE: re-create the old pairs —
--   CREATE POLICY "pub_media_published"        ON media FOR SELECT USING (is_published IS TRUE);
--   CREATE POLICY "ext_media_org_actor"        ON media FOR SELECT USING (api.can_read_extended(object_id));
--   CREATE POLICY "pub_descriptions_public"    ON object_description FOR SELECT USING (visibility = 'public');
--   CREATE POLICY "ext_descriptions_org_actor" ON object_description FOR SELECT USING (api.can_read_extended(object_id));
-- Covered by tests/test_media_description_read_gate.sql.
BEGIN;

DROP POLICY IF EXISTS "pub_media_published" ON media;
DROP POLICY IF EXISTS "ext_media_org_actor" ON media;
DROP POLICY IF EXISTS "read_media" ON media;
CREATE POLICY "read_media" ON media FOR SELECT USING (
  (
    is_published IS TRUE
    AND (
      (object_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM object o WHERE o.id = media.object_id AND o.status = 'published'))
      OR
      (place_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM object_place p JOIN object o ON o.id = p.object_id
        WHERE p.id = media.place_id AND o.status = 'published'))
    )
  )
  OR (object_id IS NOT NULL AND object_id IN (SELECT api.current_user_extended_object_ids()))
  OR (place_id IS NOT NULL AND place_id IN (
    SELECT p.id FROM object_place p
    WHERE p.object_id IN (SELECT api.current_user_extended_object_ids())))
);

DROP POLICY IF EXISTS "pub_descriptions_public" ON object_description;
DROP POLICY IF EXISTS "ext_descriptions_org_actor" ON object_description;
DROP POLICY IF EXISTS "read_object_description" ON object_description;
CREATE POLICY "read_object_description" ON object_description FOR SELECT USING (
  (EXISTS (SELECT 1 FROM object o WHERE o.id = object_id AND o.status = 'published') AND visibility = 'public')
  OR object_id IN (SELECT api.current_user_extended_object_ids())
);

COMMIT;
