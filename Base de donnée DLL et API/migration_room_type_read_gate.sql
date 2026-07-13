-- migration_room_type_read_gate.sql
-- §54 — object_room_type trio: §38 read gates + repair of the 8o link-table write bindings.
--
-- A) READ (the §49/§51 bare-flag class, room-type edition). The trio still carried the
--    ORIGINAL rls_policies.sql SELECT policies:
--      object_room_type:         "Lecture publique des types de chambre"  USING (is_published = true)
--                                "Lecture étendue des types de chambre"   USING (api.can_read_extended(object_id))
--      object_room_type_amenity: "Lecture publique amenities chambre"     USING (EXISTS rt … rt.is_published)
--      object_room_type_media:   "Lecture publique médias chambre"        USING (EXISTS rt … rt.is_published)
--    The public arms gate on the row's OWN is_published flag (which DEFAULTS TRUE,
--    schema_unified.sql) with NO parent-object publication gate ⇒ anon direct PostgREST
--    could read room types — incl. base_price — of DRAFT / hidden / archived objects.
--    The two link tables also had NO extended arm at all: an org member could not read
--    links of their own rooms with is_published = FALSE (under-exposure, §51-media analogue
--    — the editor §05 loader reads the link tables directly).
--    Replaced with ONE §38 split-form policy per table; the published arm COMPOSES the
--    field-level flag (CLAUDE.md §49: flags compose, never substitute):
--      read_object_room_type:        (is_published IS TRUE AND EXISTS(parent published))
--                                    OR object_id IN (SELECT api.current_user_extended_object_ids())
--                                    OR api.user_can_write_object_canonical(object_id)
--      read_object_room_type_amenity / _media (follow through the parent room):
--                                    EXISTS(rt: is_published flag AND parent published)   [anon arm]
--                                    OR room_type_id IN (rooms of the extended set)       [ext arm]
--                                    OR room_type_id IN (rooms writable by the caller)    [writer arm]
--    The rt probes additionally ride read_object_room_type itself (policy subqueries are
--    RLS-checked) — coherent: anon resolves exactly the flag+published rooms.
--    is_published = NULL rows are extended/writer-only (IS TRUE), same treatment as media (§51).
--
-- B) WRITE-BINDING REPAIR (deny-all bug found during this pass). 8o
--    (migration_write_policy_percommand.sql §§43–44) wrote the link-table predicates as
--    `EXISTS (SELECT 1 FROM object_room_type rt WHERE rt.id = room_type_id …)`. When 8o ran,
--    object_room_type ALREADY had its own room_type_id column (migration_room_type_ref.sql,
--    manifest step 3 — the §05 editor room-type-selector FK), so the unqualified reference
--    bound to the INNER table: the live deparse showed `rt.id = rt.room_type_id` (a row's PK
--    vs its ref-code FK — never true) ⇒ INSERT/UPDATE/DELETE on object_room_type_amenity and
--    object_room_type_media were DENY-ALL for every PostgREST role. Latent only because the
--    trio had 0 rows; the §05 room saver (object-workspace.ts link-row insert/delete) would
--    have hard-failed on first real use (insert leg) and silently deleted 0 rows (delete leg).
--    Re-created with the SAME §47 semantics (canonical OR +CREATEDBY legacy leg), outer column
--    explicitly qualified. 8o's source file is fixed in place in the same pass, so the
--    documented "re-run 8o after rls_policies.sql" caveat no longer re-breaks these.
--
-- Consumers verified (2026-06-11):
--   * api.get_object_room_types — SECURITY INVOKER and the ONLY function on live reading the
--     trio; it already filters rt.is_published itself. Under the new gate it returns [] to
--     anon for non-published parents (leak closed through the function too) and is unchanged
--     for published parents and extended callers.
--   * api.get_object_resource — SECURITY DEFINER (RLS does not apply inside). The LIVE copy
--     does not read the trio at all (pg_get_functiondef verified 2026-06-11); the SOURCE
--     gained a room_types emission the same day (§54 commit 0a6da45, live deploy of step 5
--     pending) which authorizes-once on the object (published OR extended ⇒ NULL for anon on
--     drafts) and field-gates rows on (v_can_read_extended OR rt.is_published IS TRUE) —
--     byte-consistent with this RLS gate by construction. Unaffected either way.
--   * Editor §05 loader/saver (direct PostgREST on the trio, authenticated org member) —
--     reads ride the extended arm (incl. is_published=FALSE rows, the under-exposure fix);
--     link writes are un-broken by (B).
-- No new EXECUTE grants needed (P0.3 gotcha): the SELECT arms call
-- api.current_user_extended_object_ids and api.user_can_write_object_canonical (both already
-- granted to anon/authenticated by §35/8d; the write predicate is false for anon);
-- per-command write policies never apply to SELECT (8o). §39 holds: the only auth.*()
-- reference stays wrapped as (select auth.uid()).
--
-- PREREQUISITES: rls_policies.sql (§35 set fn + grants) + migration_room_type_ref.sql
--   (step 3) + migration_write_policy_percommand.sql (8o). Manifest step 8v. Also FOLDED
--   into rls_policies.sql (8s/8t precedent: that file now creates the read_* policies
--   directly) ⇒ idempotent re-assertion on a fresh build; re-applying rls_policies.sql does
--   NOT resurrect the leak.
-- IDEMPOTENT: DROP POLICY IF EXISTS + CREATE POLICY.
-- REVERSIBLE: (A) re-create the old pair/singles (see this header / git history of
--   rls_policies.sql); (B) is a pure repair — reverting it re-installs a deny-all bug, so a
--   functional revert would instead re-create the 8o text verbatim.
-- Covered by tests/test_room_type_read_gate.sql.
BEGIN;

-- ============ A) §38 split-form read gates ============

DROP POLICY IF EXISTS "Lecture publique des types de chambre" ON object_room_type;
DROP POLICY IF EXISTS "Lecture étendue des types de chambre" ON object_room_type;
DROP POLICY IF EXISTS "read_object_room_type" ON object_room_type;
CREATE POLICY "read_object_room_type" ON object_room_type FOR SELECT USING (
  (is_published IS TRUE AND EXISTS (
    SELECT 1 FROM object o
    WHERE o.id = object_room_type.object_id AND o.status = 'published'))
  OR object_id IN (SELECT api.current_user_extended_object_ids())
  OR api.user_can_write_object_canonical(object_room_type.object_id)
);

DROP POLICY IF EXISTS "Lecture publique amenities chambre" ON object_room_type_amenity;
DROP POLICY IF EXISTS "read_object_room_type_amenity" ON object_room_type_amenity;
CREATE POLICY "read_object_room_type_amenity" ON object_room_type_amenity FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM object_room_type rt
    JOIN object o ON o.id = rt.object_id
    WHERE rt.id = object_room_type_amenity.room_type_id
      AND rt.is_published IS TRUE AND o.status = 'published')
  OR room_type_id IN (
    SELECT rt.id FROM object_room_type rt
    WHERE rt.object_id IN (SELECT api.current_user_extended_object_ids()))
  OR room_type_id IN (
    SELECT rt.id FROM object_room_type rt
    WHERE api.user_can_write_object_canonical(rt.object_id))
);

DROP POLICY IF EXISTS "Lecture publique médias chambre" ON object_room_type_media;
DROP POLICY IF EXISTS "read_object_room_type_media" ON object_room_type_media;
CREATE POLICY "read_object_room_type_media" ON object_room_type_media FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM object_room_type rt
    JOIN object o ON o.id = rt.object_id
    WHERE rt.id = object_room_type_media.room_type_id
      AND rt.is_published IS TRUE AND o.status = 'published')
  OR room_type_id IN (
    SELECT rt.id FROM object_room_type rt
    WHERE rt.object_id IN (SELECT api.current_user_extended_object_ids()))
  OR room_type_id IN (
    SELECT rt.id FROM object_room_type rt
    WHERE api.user_can_write_object_canonical(rt.object_id))
);

-- ============ B) 8o §§43–44 re-created with the outer column QUALIFIED ============
-- Same §47 semantics (canonical OR +CREATEDBY); only the broken inner binding changes.

DROP POLICY IF EXISTS "canonical_ins_object_room_type_amenity" ON object_room_type_amenity;
CREATE POLICY "canonical_ins_object_room_type_amenity" ON object_room_type_amenity FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM object_room_type rt WHERE rt.id = object_room_type_amenity.room_type_id AND api.user_can_write_object_canonical(rt.object_id)) OR EXISTS (SELECT 1 FROM object_room_type rt JOIN object o ON o.id = rt.object_id WHERE rt.id = object_room_type_amenity.room_type_id AND o.created_by = (select auth.uid())));
DROP POLICY IF EXISTS "canonical_upd_object_room_type_amenity" ON object_room_type_amenity;
CREATE POLICY "canonical_upd_object_room_type_amenity" ON object_room_type_amenity FOR UPDATE USING (EXISTS (SELECT 1 FROM object_room_type rt WHERE rt.id = object_room_type_amenity.room_type_id AND api.user_can_write_object_canonical(rt.object_id)) OR EXISTS (SELECT 1 FROM object_room_type rt JOIN object o ON o.id = rt.object_id WHERE rt.id = object_room_type_amenity.room_type_id AND o.created_by = (select auth.uid()))) WITH CHECK (EXISTS (SELECT 1 FROM object_room_type rt WHERE rt.id = object_room_type_amenity.room_type_id AND api.user_can_write_object_canonical(rt.object_id)) OR EXISTS (SELECT 1 FROM object_room_type rt JOIN object o ON o.id = rt.object_id WHERE rt.id = object_room_type_amenity.room_type_id AND o.created_by = (select auth.uid())));
DROP POLICY IF EXISTS "canonical_del_object_room_type_amenity" ON object_room_type_amenity;
CREATE POLICY "canonical_del_object_room_type_amenity" ON object_room_type_amenity FOR DELETE USING (EXISTS (SELECT 1 FROM object_room_type rt WHERE rt.id = object_room_type_amenity.room_type_id AND api.user_can_write_object_canonical(rt.object_id)) OR EXISTS (SELECT 1 FROM object_room_type rt JOIN object o ON o.id = rt.object_id WHERE rt.id = object_room_type_amenity.room_type_id AND o.created_by = (select auth.uid())));

DROP POLICY IF EXISTS "canonical_ins_object_room_type_media" ON object_room_type_media;
CREATE POLICY "canonical_ins_object_room_type_media" ON object_room_type_media FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM object_room_type rt WHERE rt.id = object_room_type_media.room_type_id AND api.user_can_write_object_canonical(rt.object_id)) OR EXISTS (SELECT 1 FROM object_room_type rt JOIN object o ON o.id = rt.object_id WHERE rt.id = object_room_type_media.room_type_id AND o.created_by = (select auth.uid())));
DROP POLICY IF EXISTS "canonical_upd_object_room_type_media" ON object_room_type_media;
CREATE POLICY "canonical_upd_object_room_type_media" ON object_room_type_media FOR UPDATE USING (EXISTS (SELECT 1 FROM object_room_type rt WHERE rt.id = object_room_type_media.room_type_id AND api.user_can_write_object_canonical(rt.object_id)) OR EXISTS (SELECT 1 FROM object_room_type rt JOIN object o ON o.id = rt.object_id WHERE rt.id = object_room_type_media.room_type_id AND o.created_by = (select auth.uid()))) WITH CHECK (EXISTS (SELECT 1 FROM object_room_type rt WHERE rt.id = object_room_type_media.room_type_id AND api.user_can_write_object_canonical(rt.object_id)) OR EXISTS (SELECT 1 FROM object_room_type rt JOIN object o ON o.id = rt.object_id WHERE rt.id = object_room_type_media.room_type_id AND o.created_by = (select auth.uid())));
DROP POLICY IF EXISTS "canonical_del_object_room_type_media" ON object_room_type_media;
CREATE POLICY "canonical_del_object_room_type_media" ON object_room_type_media FOR DELETE USING (EXISTS (SELECT 1 FROM object_room_type rt WHERE rt.id = object_room_type_media.room_type_id AND api.user_can_write_object_canonical(rt.object_id)) OR EXISTS (SELECT 1 FROM object_room_type rt JOIN object o ON o.id = rt.object_id WHERE rt.id = object_room_type_media.room_type_id AND o.created_by = (select auth.uid())));

COMMIT;
