-- Partner API read performance: evaluate the request email once, and skip
-- extended authorization work only when both uid and email are absent.
-- Depends on actor portal + actor_test_realm_isolation; apply after both.
-- Preserve invoker/definer status, search_path and existing function ACLs.
-- Keep internal.actor_in_current_realm: joining actor here could re-enter RLS.
BEGIN;

CREATE OR REPLACE FUNCTION api.user_actor_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE
SET search_path = pg_catalog, public, api, auth, pg_temp
AS $fn$
  SELECT ac.actor_id FROM public.actor_channel ac
  JOIN public.ref_code_contact_kind ck ON ck.id=ac.kind_id AND ck.code='email'
  WHERE lower(ac.value)=(SELECT api.current_user_email())
    AND internal.actor_in_current_realm(ac.actor_id);
$fn$;

CREATE OR REPLACE FUNCTION api.current_user_extended_object_ids()
RETURNS SETOF text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, pg_temp
AS $$
BEGIN
  -- No user identity: no actor, membership or portal scope can exist.
  -- Keep email-only and uid-only sessions eligible for their existing paths.
  IF auth.uid() IS NULL
     AND NULLIF(btrim(api.current_user_email()), '') IS NULL THEN
    RETURN;
  END IF;
  IF api.is_actor_persona() THEN
    RETURN QUERY SELECT * FROM api.current_user_portal_object_ids();
    RETURN;
  END IF;
  RETURN QUERY
  SELECT s.object_id
  FROM (
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
      )
  ) AS s(object_id)
  JOIN object o ON o.id = s.object_id
  WHERE o.is_test = (SELECT api.current_user_test_realm());
END;
$$;

COMMIT;
