-- migration_contact_channel_read_gate.sql
-- §49 — contact_channel §38 read gate. The pre-§38 SELECT pair on contact_channel was
--   pub_contacts_public     USING (is_public IS TRUE)              -- NO publication gate
--   ext_contacts_org_actor  USING (api.can_read_extended(object_id))
-- pub_contacts_public let anon direct-PostgREST read the PUBLIC contact rows of DRAFT /
-- hidden / archived objects, diverging from the read-gate doctrine (CLAUDE.md "Read-path
-- authorization": object-child reads = parent published OR extended scope). contact_channel
-- predates the 8p sweep — it was not one of the 25 flat read_<t> policies (those were the
-- p03 `read_<t> USING can_read_object` family; contact_channel kept its older pub/ext pair).
--
-- Replaces BOTH SELECT policies with the single §38 split form:
--   (EXISTS(published parent) AND is_public IS TRUE)                      -- public arm keeps the field-level gate
--   OR object_id IN (SELECT api.current_user_extended_object_ids())      -- ext arm folded in (set-based, §35)
-- Folding ext_contacts_org_actor is semantics-preserving: api.can_read_extended DELEGATES to
-- the set fn (one source of truth, kept byte-equivalent — see rls_policies.sql) and the set
-- form hoists the per-user scope to ONE InitPlan instead of a per-row SECURITY DEFINER
-- scalar over the child scan (§35/§38). Net behavior change: anon/strangers no longer read
-- public contacts of non-published objects (the leak); extended users lose nothing (their
-- arm covers all rows of their scope, incl. private rows of published objects, as before).
-- No raw auth.*() in the predicate, so §39 (initplan wrap) is satisfied by construction.
-- Write policies untouched: the per-command canonical triple from 8o (no FOR ALL on this
-- table, so the read gate is the only SELECT predicate — the 8p prerequisite holds).
--
-- Consumers verified unaffected (2026-06-11):
--   * api.get_object_resource / api.get_object_resource_adapted — SECURITY DEFINER, bypass
--     RLS and re-apply `is_public = TRUE` + `status = 'published'` internally (adapted) /
--     editor-authorized (resource): anon output on published objects is byte-identical.
--   * api.get_organization_data / api.get_objects_with_deep_data — SECURITY INVOKER, but
--     they join contact_channel THROUGH `object`, whose own RLS already hides non-published
--     rows from anon ⇒ the rows this migration revokes were unreachable there for anon.
--   * editor §03 loader (object-workspace.ts direct PostgREST select) — reads under the
--     extended arm (org members/owner). Known §48 caveat unchanged in kind: a platform
--     superuser WITHOUT org membership is not in the extended set (deferred item).
--
-- PREREQUISITES: rls_policies.sql (api.current_user_extended_object_ids — EXECUTE already
-- granted to anon/authenticated, §35) + migration_write_policy_percommand.sql (8o).
-- Manifest step 8s. Also FOLDED into rls_policies.sql (8i precedent: that file now creates
-- read_contact_channel directly and its drop-section retires the old pair) ⇒ this file is
-- an idempotent re-assertion on a fresh build and the live/incremental form; re-applying
-- rls_policies.sql does NOT resurrect the leak (no 8o-style caveat needed for this table).
-- IDEMPOTENT: DROP POLICY IF EXISTS + CREATE POLICY.
-- REVERSIBLE: re-create the old pair —
--   CREATE POLICY "pub_contacts_public"    ON contact_channel FOR SELECT USING (is_public IS TRUE);
--   CREATE POLICY "ext_contacts_org_actor" ON contact_channel FOR SELECT USING (api.can_read_extended(object_id));
-- Covered by tests/test_contact_channel_read_gate.sql.
BEGIN;

DROP POLICY IF EXISTS "pub_contacts_public" ON contact_channel;
DROP POLICY IF EXISTS "ext_contacts_org_actor" ON contact_channel;
DROP POLICY IF EXISTS "read_contact_channel" ON contact_channel;
CREATE POLICY "read_contact_channel" ON contact_channel FOR SELECT USING (
  (EXISTS (SELECT 1 FROM object o WHERE o.id = object_id AND o.status = 'published') AND is_public IS TRUE)
  OR object_id IN (SELECT api.current_user_extended_object_ids())
);

COMMIT;
