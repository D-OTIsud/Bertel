-- Final declarative overlay: current ORG or explicit portal rights, no historical grant.
-- Apply after actor portal, realm, identity optimization and album bootstrap.
-- Public readers, creation integrity and publication rules are not redefined.
BEGIN;

-- Current table state is the authority for every private object access path.
-- Creator identity and email matches are audit/contact data, not grants.
CREATE OR REPLACE FUNCTION api.current_user_actor_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog, public, api, auth, pg_temp
AS $fn$
  SELECT p.actor_id FROM public.app_user_profile p
  JOIN public.actor a ON a.id=p.actor_id
  WHERE p.id=(SELECT auth.uid()) AND p.role='actor'
    AND a.is_test=(SELECT api.current_user_test_realm());
$fn$;

CREATE OR REPLACE FUNCTION api.user_actor_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE
SET search_path=pg_catalog, public, api, auth, pg_temp
AS $fn$
  SELECT p.actor_id
  FROM public.app_user_profile p
  WHERE p.id=(SELECT auth.uid()) AND p.role='actor' AND p.actor_id IS NOT NULL
    AND internal.actor_in_current_realm(p.actor_id);
$fn$;

CREATE OR REPLACE FUNCTION api.is_object_owner(p_object_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog, public, api, auth, pg_temp
AS $fn$
  SELECT COALESCE((SELECT auth.role()) IN ('service_role','admin')
    OR api.is_platform_superuser(), false);
$fn$;

CREATE OR REPLACE FUNCTION api.user_can_write_object_canonical(p_object_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog, public, api, auth, pg_temp
AS $fn$
  SELECT COALESCE(api.is_object_owner(p_object_id)
    OR api.user_can_write_canonical(p_object_id), false);
$fn$;

CREATE OR REPLACE FUNCTION api.current_user_extended_object_ids()
RETURNS SETOF text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog, public, api, auth, pg_temp
AS $fn$
BEGIN
  -- Only a current authenticated identity can carry private scope.
  IF (SELECT auth.uid()) IS NULL THEN RETURN; END IF;
  IF api.is_actor_persona() THEN
    RETURN QUERY SELECT * FROM api.current_user_portal_object_ids();
    RETURN;
  END IF;
  RETURN QUERY
  SELECT s.object_id
  FROM (
    SELECT m.org_object_id FROM public.user_org_membership m
      WHERE m.user_id=(SELECT auth.uid()) AND m.is_active IS TRUE
    UNION
    SELECT l.object_id FROM public.user_org_membership m
      JOIN public.object_org_link l ON l.org_object_id=m.org_object_id
      WHERE m.user_id=(SELECT auth.uid()) AND m.is_active IS TRUE
    UNION
    SELECT o.id FROM public.object o WHERE o.status='published'
      AND EXISTS(SELECT 1 FROM public.user_org_membership m
        JOIN public.org_config c ON c.org_object_id=m.org_object_id
        WHERE m.user_id=(SELECT auth.uid()) AND m.is_active IS TRUE
          AND c.access_scope='all_published')
  ) s(object_id)
  JOIN public.object o ON o.id=s.object_id
  WHERE o.is_test=(SELECT api.current_user_test_realm());
END;
$fn$;

COMMENT ON FUNCTION api.user_actor_ids() IS 'Compatibility identity helper: current actor profile binding only; email never grants scope.';
COMMENT ON FUNCTION api.current_user_actor_id() IS 'Current authenticated actor profile binding; demotion or unlink removes portal identity immediately.';
COMMENT ON FUNCTION api.is_object_owner(text) IS 'Legacy name retained for technical/platform authority only. Canonical staff writes use current explicit publisher permissions.';

-- Alter only the reviewed DML clauses: keep policy identity, command, roles and mode.
ALTER POLICY "owner_update_object" ON public.object
  USING (api.user_can_write_object_canonical(id))
  WITH CHECK (api.user_can_write_object_canonical(id));
ALTER POLICY "owner_delete_object" ON public.object
  USING (api.user_can_write_object_canonical(id));
ALTER POLICY "canonical_ins_object_room_type" ON public.object_room_type
  WITH CHECK (api.user_can_write_object_canonical(object_id));
ALTER POLICY "canonical_upd_object_room_type" ON public.object_room_type
  USING (api.user_can_write_object_canonical(object_id))
  WITH CHECK (api.user_can_write_object_canonical(object_id));
ALTER POLICY "canonical_del_object_room_type" ON public.object_room_type
  USING (api.user_can_write_object_canonical(object_id));
ALTER POLICY "canonical_ins_object_room_type_amenity" ON public.object_room_type_amenity
  WITH CHECK (EXISTS(SELECT 1 FROM public.object_room_type rt WHERE rt.id=object_room_type_amenity.room_type_id AND api.user_can_write_object_canonical(rt.object_id)));
ALTER POLICY "canonical_upd_object_room_type_amenity" ON public.object_room_type_amenity
  USING (EXISTS(SELECT 1 FROM public.object_room_type rt WHERE rt.id=object_room_type_amenity.room_type_id AND api.user_can_write_object_canonical(rt.object_id)))
  WITH CHECK (EXISTS(SELECT 1 FROM public.object_room_type rt WHERE rt.id=object_room_type_amenity.room_type_id AND api.user_can_write_object_canonical(rt.object_id)));
ALTER POLICY "canonical_del_object_room_type_amenity" ON public.object_room_type_amenity
  USING (EXISTS(SELECT 1 FROM public.object_room_type rt WHERE rt.id=object_room_type_amenity.room_type_id AND api.user_can_write_object_canonical(rt.object_id)));
ALTER POLICY "canonical_ins_object_room_type_bed" ON public.object_room_type_bed
  WITH CHECK (EXISTS(SELECT 1 FROM public.object_room_type rt WHERE rt.id=object_room_type_bed.room_type_id AND api.user_can_write_object_canonical(rt.object_id)));
ALTER POLICY "canonical_upd_object_room_type_bed" ON public.object_room_type_bed
  USING (EXISTS(SELECT 1 FROM public.object_room_type rt WHERE rt.id=object_room_type_bed.room_type_id AND api.user_can_write_object_canonical(rt.object_id)))
  WITH CHECK (EXISTS(SELECT 1 FROM public.object_room_type rt WHERE rt.id=object_room_type_bed.room_type_id AND api.user_can_write_object_canonical(rt.object_id)));
ALTER POLICY "canonical_del_object_room_type_bed" ON public.object_room_type_bed
  USING (EXISTS(SELECT 1 FROM public.object_room_type rt WHERE rt.id=object_room_type_bed.room_type_id AND api.user_can_write_object_canonical(rt.object_id)));
ALTER POLICY "canonical_ins_object_room_type_media" ON public.object_room_type_media
  WITH CHECK (EXISTS(SELECT 1 FROM public.object_room_type rt WHERE rt.id=object_room_type_media.room_type_id AND api.user_can_write_object_canonical(rt.object_id)));
ALTER POLICY "canonical_upd_object_room_type_media" ON public.object_room_type_media
  USING (EXISTS(SELECT 1 FROM public.object_room_type rt WHERE rt.id=object_room_type_media.room_type_id AND api.user_can_write_object_canonical(rt.object_id)))
  WITH CHECK (EXISTS(SELECT 1 FROM public.object_room_type rt WHERE rt.id=object_room_type_media.room_type_id AND api.user_can_write_object_canonical(rt.object_id)));
ALTER POLICY "canonical_del_object_room_type_media" ON public.object_room_type_media
  USING (EXISTS(SELECT 1 FROM public.object_room_type rt WHERE rt.id=object_room_type_media.room_type_id AND api.user_can_write_object_canonical(rt.object_id)));
ALTER POLICY "canonical_ins_media_tag" ON public.media_tag
  WITH CHECK (EXISTS(SELECT 1 FROM public.media m WHERE m.id=media_tag.media_id AND ((m.object_id IS NOT NULL AND api.user_can_write_object_canonical(m.object_id)) OR (m.place_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.object_place p WHERE p.id=m.place_id AND api.user_can_write_object_canonical(p.object_id))))));
ALTER POLICY "canonical_upd_media_tag" ON public.media_tag
  USING (EXISTS(SELECT 1 FROM public.media m WHERE m.id=media_tag.media_id AND ((m.object_id IS NOT NULL AND api.user_can_write_object_canonical(m.object_id)) OR (m.place_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.object_place p WHERE p.id=m.place_id AND api.user_can_write_object_canonical(p.object_id))))))
  WITH CHECK (EXISTS(SELECT 1 FROM public.media m WHERE m.id=media_tag.media_id AND ((m.object_id IS NOT NULL AND api.user_can_write_object_canonical(m.object_id)) OR (m.place_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.object_place p WHERE p.id=m.place_id AND api.user_can_write_object_canonical(p.object_id))))));
ALTER POLICY "canonical_del_media_tag" ON public.media_tag
  USING (EXISTS(SELECT 1 FROM public.media m WHERE m.id=media_tag.media_id AND ((m.object_id IS NOT NULL AND api.user_can_write_object_canonical(m.object_id)) OR (m.place_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.object_place p WHERE p.id=m.place_id AND api.user_can_write_object_canonical(p.object_id))))));

NOTIFY pgrst,'reload schema';
COMMIT;
