-- migration_explorer_rls_setbased.sql
-- Explorer statement_timeout fix (2026-06-04).
--
-- SYMPTOM: the logged-in Explorer ("1 live", editor/admin) showed
--   "canceling statement due to statement timeout" — api.list_object_resources_filtered_page
--   returned 500 (authenticated role statement_timeout = 8s).
-- ROOT CAUSE: an editor requests status ['published','draft'], so the MV fast-path is bypassed
--   (the MV is published-only) and the list RPC's outer `filt` CTE scans `object` under RLS.
--   The `object` SELECT policy `extended_objects_org_actor` evaluated the SECURITY DEFINER
--   predicate api.can_read_extended(id) ONCE PER DRAFT ROW (474 drafts of 848 objects on live).
--   ~3.6s baseline + concurrent multi-bucket fan-out + the every-5-min cron storm
--   (refresh_open_status ~18-22s) routinely crossed 8s. (postgres/RLS-off = 167ms; anon/MV path
--   = 116ms — only the logged-in Explorer broke. Gradual: it crossed the threshold as drafts grew.)
-- FIX: compute the user's extended-readable object-id SET once and make the policy a hashed-set
--   membership test (`id IN (SELECT ...)`), which the planner hoists to a single InitPlan -> O(1)/row.
--   Measured on live: the object scan went from ~3.4s (per-row) to ~91ms; the editor list RPC
--   from ~3.6s to ~1.4s (the residual is per-row child-table RLS inside get_object_cards_batch —
--   the P0.3 ~40-table read gate — a separate optimization, NOT this outage). Visibility is
--   UNCHANGED: the set is byte-equivalent to can_read_extended's 4 paths (verified live: 838 == 838,
--   0 symmetric diff; anon/superuser object + object_location visibility hashes identical pre/post).
--
-- PREREQUISITES: rls_policies.sql (defines api.can_read_extended + the extended_objects_org_actor
--   policy this rewrites) and migration_rls_read_gate_p03.sql (api.can_read_object). Slotted as
--   manifest step 8i (after 8h). Also FOLDED INTO rls_policies.sql, so on a fresh build this is an
--   idempotent no-op (the canonical file already ships the set-based form).
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION; ALTER POLICY (re-runnable).
-- REVERSIBLE: ALTER POLICY "extended_objects_org_actor" ON object USING (api.can_read_extended(id));
--   and restore can_read_extended's body to the inline 4-path version (see rls_policies.sql git history).

BEGIN;

-- 1) Single source of truth: the current user's extended-readable object-id SET, computed once.
--    Set form of api.can_read_extended (same 4 paths). SECURITY DEFINER so the base-table reads
--    bypass RLS (returns only object ids). MUST stay byte-equivalent to can_read_extended below
--    (tests/test_read_gate_setbased.sql enforces it).
CREATE OR REPLACE FUNCTION api.current_user_extended_object_ids()
RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $fn$
  -- Chemin 1a : un acteur du user a un rôle directement sur l'objet
  SELECT aor.object_id FROM actor_object_role aor
  WHERE aor.actor_id IN (SELECT api.user_actor_ids())
  UNION
  -- Chemin 1b : un acteur du user a un rôle sur l'ORG publicatrice de l'objet
  SELECT ool.object_id FROM object_org_link ool
  WHERE ool.org_object_id IN (
    SELECT aor.object_id FROM actor_object_role aor
    WHERE aor.actor_id IN (SELECT api.user_actor_ids())
  )
  UNION
  -- Chemin 2A : l'objet EST l'ORG du user (membership actif)
  SELECT uom.org_object_id FROM user_org_membership uom
  WHERE uom.user_id = auth.uid() AND uom.is_active = TRUE
  UNION
  -- Chemin 2B : objet rattaché à l'ORG du user (tous rôles, publiés ou non)
  SELECT ool.object_id FROM user_org_membership uom
  JOIN object_org_link ool ON ool.org_object_id = uom.org_object_id
  WHERE uom.user_id = auth.uid() AND uom.is_active = TRUE
  UNION
  -- Chemin 2C : périmètre externe publié (org_config.access_scope = 'all_published')
  SELECT o.id FROM object o
  WHERE o.status = 'published'
    AND EXISTS (
      SELECT 1 FROM user_org_membership uom
      JOIN org_config oc ON oc.org_object_id = uom.org_object_id
      WHERE uom.user_id = auth.uid() AND uom.is_active = TRUE
        AND oc.access_scope = 'all_published'
    );
$fn$;
REVOKE EXECUTE ON FUNCTION api.current_user_extended_object_ids() FROM PUBLIC;
-- anon must EXECUTE it: the object SELECT policy (role public, incl. anon) references it; without
-- the grant a plain anon `SELECT FROM object` errors with "permission denied for function"
-- (the same P0.3 gotcha as user_can_write_object_canonical). It returns the empty set for anon.
GRANT EXECUTE ON FUNCTION api.current_user_extended_object_ids() TO anon, authenticated, service_role;

-- 2) Object SELECT policy -> hashed-set membership (planner evaluates the set fn once, InitPlan).
ALTER POLICY "extended_objects_org_actor" ON object
  USING (id IN (SELECT api.current_user_extended_object_ids()));

-- 3) Keep api.can_read_extended as the single boolean predicate (used by api.can_read_object ->
--    the ~40 object-child read policies from P0.3), now delegating to the same set function.
CREATE OR REPLACE FUNCTION api.can_read_extended(p_object_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $fn$
  SELECT p_object_id IN (SELECT api.current_user_extended_object_ids());
$fn$;

COMMIT;

-- After applying to a live database: NOTIFY pgrst, 'reload schema';
