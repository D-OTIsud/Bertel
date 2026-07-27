-- migration_unblock_team_legal_access.sql
-- Section A — dedicated legal permission, private-document metadata and auth hardening.
-- Idempotent and safe to apply after the complete existing manifest.

BEGIN;

ALTER TABLE ref_document ADD COLUMN IF NOT EXISTS storage_bucket TEXT;
ALTER TABLE ref_document ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE ref_document ADD COLUMN IF NOT EXISTS access_scope TEXT NOT NULL DEFAULT 'public';

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_ref_document_access_scope'
  ) THEN
    ALTER TABLE ref_document
      ADD CONSTRAINT chk_ref_document_access_scope
      CHECK (access_scope IN ('public', 'legal_private'));
  END IF;
END
$migration$;

-- The original catalogue constraint predates the legal permission category.
ALTER TABLE ref_permission DROP CONSTRAINT IF EXISTS ref_permission_category_check;
ALTER TABLE ref_permission DROP CONSTRAINT IF EXISTS chk_ref_permission_category;
ALTER TABLE ref_permission
  ADD CONSTRAINT chk_ref_permission_category
  CHECK (category IN ('content', 'crm', 'team', 'media', 'legal'));

INSERT INTO ref_permission (code, name, category, description, is_active)
VALUES (
  'manage_legal_compliance',
  'Gérer la conformité juridique',
  'legal',
  'Permet de gérer le SIRET, le SIREN, la raison sociale, les licences, assurances, certificats et justificatifs administratifs',
  TRUE
)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    category = EXCLUDED.category,
    description = EXCLUDED.description,
    is_active = TRUE,
    updated_at = NOW();

-- Preserve the product contract during rollout: every currently active editor
-- receives the new explicit permission before object_legal policies switch to
-- the dedicated predicate. Future editors receive it from the UI role preset.
INSERT INTO user_permission (user_id, permission_id, is_active)
SELECT DISTINCT membership.user_id, permission.id, TRUE
FROM user_org_membership membership
JOIN user_org_business_role business_role
  ON business_role.membership_id = membership.id
 AND business_role.is_active IS TRUE
JOIN ref_org_business_role role_ref
  ON role_ref.id = business_role.role_id
 AND role_ref.code = 'editor'
CROSS JOIN LATERAL (
  SELECT id FROM ref_permission WHERE code = 'manage_legal_compliance'
) permission
WHERE membership.is_active IS TRUE
ON CONFLICT (user_id, permission_id) DO UPDATE
SET is_active = TRUE,
    updated_at = NOW();

CREATE OR REPLACE FUNCTION api.user_can_manage_object_legal(p_object_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, api, auth
AS $function$
  SELECT
    (select auth.uid()) IS NOT NULL
    AND (
      api.is_object_owner(p_object_id)
      OR api.is_platform_superuser()
      OR (
        api.user_has_permission('manage_legal_compliance')
        AND EXISTS (
          SELECT 1
          FROM object_org_link ool
          JOIN ref_org_role ror ON ror.id = ool.role_id AND ror.code = 'publisher'
          WHERE ool.object_id = p_object_id
            AND ool.org_object_id = api.current_user_org_id()
        )
      )
    );
$function$;

CREATE OR REPLACE FUNCTION api.user_can_attach_object_document(p_object_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, api, auth
AS $function$
  SELECT
    (select auth.uid()) IS NOT NULL
    AND (
      api.is_object_owner(p_object_id)
      OR api.is_platform_superuser()
      OR (
        api.user_has_permission('attach_documents')
        AND EXISTS (
          SELECT 1
          FROM object_org_link ool
          JOIN ref_org_role ror ON ror.id = ool.role_id AND ror.code = 'publisher'
          WHERE ool.object_id = p_object_id
            AND ool.org_object_id = api.current_user_org_id()
        )
      )
    );
$function$;

REVOKE ALL ON FUNCTION api.user_can_manage_object_legal(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.user_can_manage_object_legal(TEXT) TO authenticated, service_role;
REVOKE ALL ON FUNCTION api.user_can_attach_object_document(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.user_can_attach_object_document(TEXT) TO authenticated, service_role;

DROP POLICY IF EXISTS "owner_write_legal" ON object_legal;
DROP POLICY IF EXISTS "canonical_ins_object_legal" ON object_legal;
DROP POLICY IF EXISTS "canonical_upd_object_legal" ON object_legal;
DROP POLICY IF EXISTS "canonical_del_object_legal" ON object_legal;
DROP POLICY IF EXISTS "legal_insert_authorized" ON object_legal;
DROP POLICY IF EXISTS "legal_update_authorized" ON object_legal;
DROP POLICY IF EXISTS "legal_delete_authorized" ON object_legal;

CREATE POLICY "legal_insert_authorized" ON object_legal
  FOR INSERT TO authenticated
  WITH CHECK ((select api.user_can_manage_object_legal(object_id)));

CREATE POLICY "legal_update_authorized" ON object_legal
  FOR UPDATE TO authenticated
  USING ((select api.user_can_manage_object_legal(object_id)))
  WITH CHECK ((select api.user_can_manage_object_legal(object_id)));

CREATE POLICY "legal_delete_authorized" ON object_legal
  FOR DELETE TO authenticated
  USING ((select api.user_can_manage_object_legal(object_id)));

CREATE INDEX IF NOT EXISTS idx_object_legal_document_id
  ON object_legal(document_id)
  WHERE document_id IS NOT NULL;

-- Public reference documents stay public. Private legal document metadata is
-- visible only to a caller who can manage at least one linked legal object.
DROP POLICY IF EXISTS "Lecture publique des documents de référence" ON ref_document;
DROP POLICY IF EXISTS "legal_document_metadata_read" ON ref_document;
CREATE POLICY "Lecture publique des documents de référence" ON ref_document
  FOR SELECT TO anon, authenticated
  USING (access_scope = 'public');
CREATE POLICY "legal_document_metadata_read" ON ref_document
  FOR SELECT TO authenticated
  USING (
    access_scope = 'legal_private'
    AND EXISTS (
      SELECT 1
      FROM object_legal ol
      WHERE ol.document_id = ref_document.id
        AND (select api.user_can_manage_object_legal(ol.object_id))
    )
  );

-- Never trust raw_user_meta_data for authorization. A signed-in user may edit
-- it, so only service/admin or an existing platform owner may change roles.
CREATE OR REPLACE FUNCTION api.enforce_app_user_profile_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, api, auth
AS $function$
DECLARE
  requester_uid UUID := auth.uid();
  requester_is_service BOOLEAN := false;
  requester_is_owner BOOLEAN := false;
BEGIN
  IF current_setting('request.jwt.claims', true) IS NULL THEN
    RETURN NEW;
  END IF;

  requester_is_service := auth.role() IN ('service_role', 'admin');
  requester_is_owner := EXISTS (
      SELECT 1 FROM app_user_profile me
      WHERE me.id = requester_uid AND me.role = 'owner'
    );

  IF TG_OP = 'INSERT'
     AND NEW.role IS NOT NULL
     AND NOT requester_is_service
     AND NOT (requester_is_owner AND NEW.id IS DISTINCT FROM requester_uid)
  THEN
    RAISE EXCEPTION 'Le rôle applicatif est attribué par un administrateur, jamais par le profil utilisateur.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.role IS DISTINCT FROM OLD.role
     AND NOT requester_is_service
     AND NOT (requester_is_owner AND NEW.id IS DISTINCT FROM requester_uid)
  THEN
    RAISE EXCEPTION 'Le rôle applicatif est attribué par un administrateur, jamais par le profil utilisateur.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION api.sync_app_user_profile_from_auth_user(
  p_user_id UUID,
  p_email TEXT,
  p_raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
  p_raw_app_meta_data JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth
AS $function$
DECLARE
  v_user_meta JSONB := COALESCE(p_raw_user_meta_data, '{}'::jsonb);
  v_app_meta JSONB := COALESCE(p_raw_app_meta_data, '{}'::jsonb);
  v_display_name TEXT;
  v_avatar_url TEXT;
  v_locale TEXT;
  v_timezone TEXT;
  v_role TEXT;
  v_lang_source JSONB;
  v_lang_prefs TEXT[] := ARRAY['fr','en'];
  v_preferences JSONB := '{}'::jsonb;
BEGIN
  v_display_name := NULLIF(COALESCE(
    v_user_meta->>'display_name', v_user_meta->>'full_name', v_user_meta->>'name',
    v_app_meta->>'display_name', v_app_meta->>'full_name', p_email, p_user_id::TEXT
  ), '');
  v_avatar_url := NULLIF(COALESCE(
    v_user_meta->>'avatar_url', v_user_meta->>'picture',
    v_app_meta->>'avatar_url', v_app_meta->>'picture'
  ), '');
  v_locale := NULLIF(COALESCE(v_user_meta->>'locale', v_app_meta->>'locale'), '');
  v_timezone := NULLIF(COALESCE(v_user_meta->>'timezone', v_app_meta->>'timezone'), '');
  v_role := NULLIF(v_app_meta->>'role', '');
  IF v_role IS NULL OR v_role NOT IN ('owner', 'super_admin', 'tourism_agent') THEN
    v_role := 'tourism_agent';
  END IF;

  v_lang_source := COALESCE(
    v_user_meta->'lang_prefs', v_user_meta->'langPrefs',
    v_app_meta->'lang_prefs', v_app_meta->'langPrefs'
  );
  IF jsonb_typeof(v_lang_source) = 'array' THEN
    SELECT COALESCE(array_agg(NULLIF(BTRIM(i.value), '') ORDER BY i.ord), ARRAY[]::TEXT[])
      INTO v_lang_prefs
    FROM jsonb_array_elements_text(v_lang_source) WITH ORDINALITY AS i(value, ord)
    WHERE NULLIF(BTRIM(i.value), '') IS NOT NULL;
  END IF;
  IF COALESCE(array_length(v_lang_prefs, 1), 0) = 0 THEN v_lang_prefs := ARRAY['fr','en']; END IF;

  IF jsonb_typeof(v_user_meta->'preferences') = 'object' THEN
    v_preferences := v_user_meta->'preferences';
  ELSIF jsonb_typeof(v_app_meta->'preferences') = 'object' THEN
    v_preferences := v_app_meta->'preferences';
  END IF;

  INSERT INTO app_user_profile (
    id, display_name, avatar_url, locale, timezone, role, lang_prefs, preferences
  ) VALUES (
    p_user_id, v_display_name, v_avatar_url, COALESCE(v_locale, 'fr'),
    COALESCE(v_timezone, 'Indian/Reunion'), v_role, v_lang_prefs, v_preferences
  )
  ON CONFLICT (id) DO UPDATE
  SET display_name = COALESCE(app_user_profile.display_name, EXCLUDED.display_name),
      avatar_url = COALESCE(app_user_profile.avatar_url, EXCLUDED.avatar_url),
      locale = COALESCE(app_user_profile.locale, EXCLUDED.locale),
      timezone = COALESCE(app_user_profile.timezone, EXCLUDED.timezone),
      role = COALESCE(app_user_profile.role, EXCLUDED.role),
      lang_prefs = CASE
        WHEN COALESCE(array_length(app_user_profile.lang_prefs, 1), 0) = 0 THEN EXCLUDED.lang_prefs
        ELSE app_user_profile.lang_prefs
      END,
      preferences = CASE
        WHEN app_user_profile.preferences = '{}'::jsonb THEN EXCLUDED.preferences
        ELSE app_user_profile.preferences
      END;
END;
$function$;

REVOKE ALL ON FUNCTION api.enforce_app_user_profile_role_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION api.sync_app_user_profile_from_auth_user(UUID, TEXT, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.sync_app_user_profile_from_auth_user(UUID, TEXT, JSONB, JSONB) TO service_role;

COMMIT;
