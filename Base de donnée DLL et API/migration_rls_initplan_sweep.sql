-- migration_rls_initplan_sweep.sql
-- RLS auth-initplan sweep — object family (2026-06-04). Decision log §39.
--
-- SYMPTOM: Supabase performance advisor flags 148 `auth_rls_initplan` warnings — RLS policies whose
--   USING/WITH CHECK call auth.role()/auth.uid() DIRECTLY, so Postgres re-evaluates the function
--   ONCE PER SCANNED ROW instead of once per query. 18 of these are on the object + object-child
--   tables (the rest are tiny ref_*/RBAC/audit lookup tables — see SCOPE).
-- ROOT CAUSE: a bare `auth.uid()`/`auth.role()` in a policy qual is a per-row volatile-ish call.
--   These 18 are all `FOR ALL` write policies (which ALSO apply to SELECT — the P0.3 gotcha) or
--   SELECT/INSERT policies on tables that GROW with object count, so the per-row eval is on the
--   read path at scale. (Most object-child tables already moved to SECURITY DEFINER helper
--   predicates — is_object_owner / user_can_write_object_canonical / can_read_object — which the
--   advisor does NOT flag; these 18 are the SP-1/P0.3 stragglers still on raw auth.*.)
-- FIX: wrap each auth call as `(select auth.x())`. Postgres then hoists it to a single InitPlan
--   (computed once per query). This is Supabase's documented, SEMANTICS-IDENTICAL remedy — a scalar
--   subquery returns the same value, so every access decision is UNCHANGED (verified behaviourally
--   on `object` in tests/test_rls_initplan_sweep.sql: creator may UPDATE its own row, stranger may not).
-- SCOPE (18 policies / 13 tables): object (4), object_external_id (2), object_membership (2),
--   object_origin, object_place_description, object_private_description, object_relation,
--   object_review, object_room_type, object_room_type_amenity, object_room_type_media,
--   object_sustainability_action, object_sustainability_action_label.
--   DEFERRED (documented, low value — bounded/tiny rows, admin-only, off the hot path): object_version
--   (+4 audit partitions; partition-policy handling adds risk for zero read-path benefit), media_tag,
--   and the ~120 ref_code_*/ref_*/user_org_*/org_*/user_permission/app_user_profile/audit policies.
--   A future broad sweep can clear those for advisor-cleanliness; they carry no perf impact at scale.
-- IDEMPOTENT: ALTER POLICY (re-runnable; sets the qual each time). FOLDED INTO rls_policies.sql
--   (CREATE POLICY statements ship the wrapped form), so this is a no-op on a fresh build. Manifest 8k.
-- REVERSIBLE: ALTER POLICY ... back to the bare `auth.x()` form (see rls_policies.sql git history).

BEGIN;

-- object (the largest table; these are also on the SELECT path via the FOR ALL gotcha) ----------
ALTER POLICY "Accès admin/service_role (object)" ON object
  USING ((select auth.role()) = ANY (ARRAY['service_role'::text, 'admin'::text]));
ALTER POLICY owner_delete_object ON object
  USING (((select auth.uid()) = created_by) OR api.user_can_write_object_canonical(id));
ALTER POLICY owner_update_object ON object
  USING (((select auth.uid()) = created_by) OR api.user_can_write_object_canonical(id))
  WITH CHECK (((select auth.uid()) = created_by) OR api.user_can_write_object_canonical(id));
ALTER POLICY insert_object_create_permission ON object
  WITH CHECK (api.user_can_create_object() AND ((select auth.uid()) = created_by));

-- object_external_id ----------
ALTER POLICY "Accès admin/service_role (object_external_id)" ON object_external_id
  USING ((select auth.role()) = ANY (ARRAY['service_role'::text, 'admin'::text]));
ALTER POLICY "Lecture restreinte identifiants externes" ON object_external_id
  USING ((select auth.role()) = ANY (ARRAY['service_role'::text, 'admin'::text]));

-- object_membership ----------
ALTER POLICY owner_object_membership_write ON object_membership
  USING (((select auth.role()) = ANY (ARRAY['service_role'::text, 'admin'::text]))
         OR api.user_can_write_object_canonical(COALESCE(object_id, org_object_id)));
ALTER POLICY ext_object_membership_read ON object_membership
  USING (((select auth.role()) = ANY (ARRAY['service_role'::text, 'admin'::text]))
         OR api.can_read_extended(COALESCE(object_id, org_object_id)));

-- single-predicate admin/service_role write policies ----------
ALTER POLICY admin_origin_write ON object_origin
  USING ((select auth.role()) = ANY (ARRAY['service_role'::text, 'admin'::text]));
ALTER POLICY admin_place_description_write ON object_place_description
  USING ((select auth.role()) = ANY (ARRAY['service_role'::text, 'admin'::text]));
ALTER POLICY admin_relation_write ON object_relation
  USING ((select auth.role()) = ANY (ARRAY['service_role'::text, 'admin'::text]));

-- object_private_description (INSERT: WITH CHECK only) ----------
ALTER POLICY org_insert_private_description ON object_private_description
  WITH CHECK (api.can_write_object_private_notes(object_id)
              AND (org_object_id = api.current_user_org_id())
              AND (created_by_user_id = (select auth.uid()))
              AND (audience = 'private'::text));

-- admin/service_role OR platform-superuser ----------
ALTER POLICY "Écriture admin des avis" ON object_review
  USING (((select auth.role()) = ANY (ARRAY['service_role'::text, 'admin'::text]))
         OR api.is_platform_superuser());
ALTER POLICY "Accès admin/service_role (object_sustainability_action)" ON object_sustainability_action
  USING (((select auth.role()) = ANY (ARRAY['service_role'::text, 'admin'::text]))
         OR api.is_platform_superuser());
ALTER POLICY "Accès admin/service_role (object_sustainability_action_label)" ON object_sustainability_action_label
  USING (((select auth.role()) = ANY (ARRAY['service_role'::text, 'admin'::text]))
         OR api.is_platform_superuser());

-- room-type family: admin/service_role OR owner-via-EXISTS (wrap auth.role() AND the nested auth.uid()) ----------
ALTER POLICY "Écriture types de chambre par propriétaire" ON object_room_type
  USING (((select auth.role()) = ANY (ARRAY['service_role'::text, 'admin'::text]))
         OR (EXISTS ( SELECT 1 FROM object o
                      WHERE ((o.id = object_room_type.object_id) AND (o.created_by = (select auth.uid()))))));
ALTER POLICY "Écriture amenities chambre par propriétaire" ON object_room_type_amenity
  USING (((select auth.role()) = ANY (ARRAY['service_role'::text, 'admin'::text]))
         OR (EXISTS ( SELECT 1 FROM (object_room_type rt JOIN object o ON ((o.id = rt.object_id)))
                      WHERE ((rt.id = object_room_type_amenity.room_type_id) AND (o.created_by = (select auth.uid()))))));
ALTER POLICY "Écriture médias chambre par propriétaire" ON object_room_type_media
  USING (((select auth.role()) = ANY (ARRAY['service_role'::text, 'admin'::text]))
         OR (EXISTS ( SELECT 1 FROM (object_room_type rt JOIN object o ON ((o.id = rt.object_id)))
                      WHERE ((rt.id = object_room_type_media.room_type_id) AND (o.created_by = (select auth.uid()))))));

COMMIT;

-- No `NOTIFY pgrst`: RLS policy changes do not affect the PostgREST schema cache.
