-- migration_object_review_read_gate.sql
-- §56 — object_review: §38 read gate. The LAST member of the 8s/8t/8v bare-flag class.
--
-- object_review still carried the ORIGINAL rls_policies.sql SELECT policy:
--   "Lecture publique des avis"   USING (is_published = true)
-- The row's OWN flag (which DEFAULTS TRUE, schema_unified.sql) with NO parent-object
-- publication gate ⇒ anon direct PostgREST could read is_published reviews of DRAFT /
-- hidden / archived objects. 0 rows live today (the review import is deferred — decision
-- log §43): forward-looking like 8v, closed BEFORE the import lands. The table also had
-- NO extended arm at all: an org member could not directly read the unpublished
-- (moderated-out) reviews of their own objects (under-exposure, same class as the 8v
-- link tables).
-- Replaced with ONE §38 split-form policy; the published arm COMPOSES the field-level
-- flag (CLAUDE.md §49: flags compose, never substitute):
--   read_object_review: (is_published IS TRUE AND EXISTS(parent published))
--                       OR object_id IN (SELECT api.current_user_extended_object_ids())
-- is_published = NULL rows are extended-only (IS TRUE), same treatment as media (§51).
-- The per-command admin_ins/upd/del_object_review write family (8o) is untouched —
-- review writes stay admin/service_role/superuser-only.
--
-- Consumers verified (2026-06-11):
--   * api.get_object_reviews — SECURITY INVOKER and the ONLY api fn reading object_review
--     (FUNCTIONS.md sweep); it already filters r.is_published = TRUE itself. Under the new
--     gate it returns an empty summary / [] to anon for non-published parents (leak closed
--     through the function too) and is unchanged for published parents and extended callers.
--     (Repaired in the same pass: pre-existing 42803 nested-aggregate bug in by_source +
--     LIMIT/OFFSET-outside-aggregate pagination no-op — the fn had never worked; MCP
--     migration fix_get_object_reviews_aggregates; RPC-probed in the persona test.)
--   * public.update_object_cached_rating_metrics() (trigger on object_review DML, INVOKER) —
--     recomputes object.cached_rating/cached_review_count from is_published=TRUE rows.
--     Writes are admin-gated (8o): the import path is service_role (BYPASSRLS — sees all
--     rows, recompute exact). A platform superuser writing through `authenticated` would
--     recompute from its RLS-visible subset — the pre-existing §48 superuser-without-
--     membership latent item, not widened here (the published arm shows the same
--     is_published=TRUE rows the trigger filters on for published parents).
-- No new EXECUTE grants needed (P0.3 gotcha): the SELECT arms call only
-- api.current_user_extended_object_ids (already granted to anon/authenticated, §35/8p);
-- the write family is per-command (8o) so it never applies to SELECT. §39 holds: no raw
-- auth.*() in the predicate. The outer column in the EXISTS is table-qualified (§55
-- invariant — object_review has no same-named column today; qualified by rule anyway).
--
-- PREREQUISITES: rls_policies.sql (§35 set fn + grants) +
--   migration_write_policy_percommand.sql (8o). Manifest step 8w. Also FOLDED into
--   rls_policies.sql (8s/8t/8v precedent) ⇒ idempotent re-assertion on a fresh build;
--   re-applying rls_policies.sql does NOT resurrect the leak.
-- IDEMPOTENT: DROP POLICY IF EXISTS + CREATE POLICY.
-- REVERSIBLE: re-create the old policy —
--   CREATE POLICY "Lecture publique des avis" ON object_review
--     FOR SELECT USING (is_published = true);
-- Covered by tests/test_object_review_read_gate.sql.
BEGIN;

DROP POLICY IF EXISTS "Lecture publique des avis" ON object_review;
DROP POLICY IF EXISTS "read_object_review" ON object_review;
CREATE POLICY "read_object_review" ON object_review FOR SELECT USING (
  (is_published IS TRUE AND EXISTS (
    SELECT 1 FROM object o
    WHERE o.id = object_review.object_id AND o.status = 'published'))
  OR object_id IN (SELECT api.current_user_extended_object_ids())
);

COMMIT;
