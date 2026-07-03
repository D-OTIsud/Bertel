-- migration_org_branding.sql
-- Branding par ORG (chantier 2026-07-03, décidé PO) : chaque ORG peut surcharger l'identité
-- visuelle (nom de marque, logo, 5 couleurs) champ par champ ; NULL = hérite du singleton
-- plateforme app_branding_settings (ui_whitelabel_branding.sql). La résolution se fait dans
-- api.get_app_branding() selon le membership actif de l'appelant (invariant « un seul membership
-- actif par user » ⇒ résolution non ambiguë). get_public_branding() (login pré-auth) reste
-- INCHANGÉE : avant connexion on ne connaît pas l'ORG, on sert le thème plateforme.
--
-- markerStyles reste plateforme (les pins carte sont des PNGs statiques — per-org différé).
-- Écritures = RPCs DEFINER uniquement (aucune policy d'écriture directe sur la table).
-- Gouvernance : superadmin plateforme OU admin (rang >= 30) actif de CETTE ORG.
--
-- Apply order : APRÈS ui_whitelabel_branding.sql (app_branding_settings + get_app_branding de base)
-- ET migration_org_onboarding.sql (ORG existent). Non foldé dans schema_unified.sql (dépend de
-- api.is_platform_superuser de rls_policies.sql via user_can_manage_org_branding). Voir runbook.
\set ON_ERROR_STOP on
BEGIN;

-- -----------------------------------------------------
-- 1) Table : surcharges par ORG (tous les champs identité NULLABLE = héritent)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.org_branding_settings (
  org_object_id     TEXT PRIMARY KEY REFERENCES object(id) ON DELETE CASCADE,
  brand_name        TEXT,
  logo_storage_path TEXT,
  logo_public_url   TEXT,
  logo_mime_type    TEXT,
  primary_color     TEXT,
  accent_color      TEXT,
  text_color        TEXT,
  background_color  TEXT,
  surface_color     TEXT,
  extra             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT chk_org_branding_logo_mime CHECK (logo_mime_type IS NULL OR lower(logo_mime_type) IN ('image/png','image/jpeg','image/webp','image/svg+xml')),
  CONSTRAINT chk_org_branding_logo_url  CHECK (logo_public_url IS NULL OR logo_public_url ~* '^(https?://|/storage/v1/object/public/)'),
  CONSTRAINT chk_org_branding_primary   CHECK (primary_color    IS NULL OR primary_color    ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT chk_org_branding_accent    CHECK (accent_color     IS NULL OR accent_color     ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT chk_org_branding_text      CHECK (text_color       IS NULL OR text_color       ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT chk_org_branding_bg        CHECK (background_color IS NULL OR background_color ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT chk_org_branding_surface   CHECK (surface_color    IS NULL OR surface_color    ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT chk_org_branding_extra     CHECK (jsonb_typeof(extra) = 'object')
);

COMMENT ON TABLE public.org_branding_settings IS
'Surcharges de branding par organisation (NULL = hérite de app_branding_settings). Résolue par api.get_app_branding selon le membership actif. markerStyles reste plateforme.';

-- Garde type ORG (miroir de api.check_org_config_org_type — table à part, message dédié).
CREATE OR REPLACE FUNCTION api.check_org_branding_org_type()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, api, auth AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM object WHERE id = NEW.org_object_id AND object_type = 'ORG') THEN
    RAISE EXCEPTION 'org_branding_settings.org_object_id doit pointer vers un objet ORG (reçu : %)', NEW.org_object_id;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_check_org_branding_org_type ON public.org_branding_settings;
CREATE TRIGGER trg_check_org_branding_org_type
  BEFORE INSERT OR UPDATE ON public.org_branding_settings
  FOR EACH ROW EXECUTE FUNCTION api.check_org_branding_org_type();

DROP TRIGGER IF EXISTS update_org_branding_settings_updated_at ON public.org_branding_settings;
CREATE TRIGGER update_org_branding_settings_updated_at
  BEFORE UPDATE ON public.org_branding_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------
-- 2) RLS : lecture authenticated (branding non secret ; logo en bucket public).
--    AUCUNE policy d'écriture directe — écritures via les RPCs DEFINER ci-dessous.
--    Forme TO authenticated USING (true) : pas d'auth.*() nu (garde CI initplan §39/§146).
-- -----------------------------------------------------
ALTER TABLE public.org_branding_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_org_branding" ON public.org_branding_settings;
CREATE POLICY "read_org_branding" ON public.org_branding_settings
  FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.org_branding_settings TO authenticated;
GRANT ALL    ON public.org_branding_settings TO service_role;

-- -----------------------------------------------------
-- 3) Gouvernance : superuser plateforme OU admin (rang >= 30) actif de CETTE ORG.
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION api.user_can_manage_org_branding(p_org_object_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
  SELECT api.is_platform_superuser()
      OR EXISTS (
           SELECT 1
           FROM user_org_membership uom
           JOIN user_org_admin_role uar ON uar.membership_id = uom.id AND uar.is_active
           JOIN ref_org_admin_role  r   ON r.id = uar.role_id
           WHERE uom.user_id = (SELECT auth.uid())
             AND uom.org_object_id = p_org_object_id
             AND uom.is_active
             AND r.rank >= 30
         );
$$;
REVOKE EXECUTE ON FUNCTION api.user_can_manage_org_branding(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.user_can_manage_org_branding(text) TO authenticated, service_role;

-- -----------------------------------------------------
-- 4) Lecture admin (éditeur de branding) : ligne brute (NULL = hérite) + payload résolu.
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION api.get_org_branding(p_org_object_id text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE v_out jsonb;
BEGIN
  IF NOT api.user_can_manage_org_branding(p_org_object_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: branding réservé au superadmin plateforme ou à un admin de cette organisation'
      USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'orgObjectId', p_org_object_id,
    'raw', COALESCE((
      SELECT jsonb_build_object(
        'brandName', b.brand_name, 'logoStoragePath', b.logo_storage_path,
        'logoPublicUrl', b.logo_public_url, 'logoMimeType', b.logo_mime_type,
        'primaryColor', b.primary_color, 'accentColor', b.accent_color,
        'textColor', b.text_color, 'backgroundColor', b.background_color,
        'surfaceColor', b.surface_color)
      FROM org_branding_settings b WHERE b.org_object_id = p_org_object_id), '{}'::jsonb),
    'resolved', (
      SELECT jsonb_build_object(
        'brandName',       COALESCE(o.brand_name, s.brand_name),
        'logoPublicUrl',   COALESCE(o.logo_public_url, s.logo_public_url),
        'primaryColor',    COALESCE(o.primary_color, s.primary_color),
        'accentColor',     COALESCE(o.accent_color, s.accent_color),
        'textColor',       COALESCE(o.text_color, s.text_color),
        'backgroundColor', COALESCE(o.background_color, s.background_color),
        'surfaceColor',    COALESCE(o.surface_color, s.surface_color))
      FROM app_branding_settings s
      LEFT JOIN org_branding_settings o ON o.org_object_id = p_org_object_id
      WHERE s.setting_key = 'default')
  ) INTO v_out;
  RETURN v_out;
END; $$;
REVOKE EXECUTE ON FUNCTION api.get_org_branding(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.get_org_branding(text) TO authenticated, service_role;

-- -----------------------------------------------------
-- 5) Écriture : contrat FULL-STATE PUT — chaque appel remplace la ligne entière (NULL = hérite).
--    Le dialog recharge d'abord get_org_branding().raw et renvoie TOUS les champs.
--    p_reset = TRUE supprime la ligne (retour complet au thème plateforme).
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION api.upsert_org_branding(
  p_org_object_id    text,
  p_brand_name       text DEFAULT NULL,
  p_logo_storage_path text DEFAULT NULL,
  p_logo_public_url  text DEFAULT NULL,
  p_logo_mime_type   text DEFAULT NULL,
  p_primary_color    text DEFAULT NULL,
  p_accent_color     text DEFAULT NULL,
  p_text_color       text DEFAULT NULL,
  p_background_color text DEFAULT NULL,
  p_surface_color    text DEFAULT NULL,
  p_reset            boolean DEFAULT FALSE
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, api, auth
AS $$
BEGIN
  IF NOT api.user_can_manage_org_branding(p_org_object_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: branding réservé au superadmin plateforme ou à un admin de cette organisation'
      USING ERRCODE = '42501';
  END IF;
  IF p_reset THEN
    DELETE FROM org_branding_settings WHERE org_object_id = p_org_object_id;
    RETURN api.get_org_branding(p_org_object_id);
  END IF;
  INSERT INTO org_branding_settings (
    org_object_id, brand_name, logo_storage_path, logo_public_url, logo_mime_type,
    primary_color, accent_color, text_color, background_color, surface_color,
    created_by, updated_by)
  VALUES (
    p_org_object_id,
    NULLIF(btrim(COALESCE(p_brand_name, '')), ''),
    NULLIF(btrim(COALESCE(p_logo_storage_path, '')), ''),
    NULLIF(btrim(COALESCE(p_logo_public_url, '')), ''),
    lower(NULLIF(btrim(COALESCE(p_logo_mime_type, '')), '')),
    upper(NULLIF(btrim(COALESCE(p_primary_color, '')), '')),
    upper(NULLIF(btrim(COALESCE(p_accent_color, '')), '')),
    upper(NULLIF(btrim(COALESCE(p_text_color, '')), '')),
    upper(NULLIF(btrim(COALESCE(p_background_color, '')), '')),
    upper(NULLIF(btrim(COALESCE(p_surface_color, '')), '')),
    auth.uid(), auth.uid())
  ON CONFLICT (org_object_id) DO UPDATE SET
    brand_name        = EXCLUDED.brand_name,
    logo_storage_path = EXCLUDED.logo_storage_path,
    logo_public_url   = EXCLUDED.logo_public_url,
    logo_mime_type    = EXCLUDED.logo_mime_type,
    primary_color     = EXCLUDED.primary_color,
    accent_color      = EXCLUDED.accent_color,
    text_color        = EXCLUDED.text_color,
    background_color  = EXCLUDED.background_color,
    surface_color     = EXCLUDED.surface_color,
    updated_by        = EXCLUDED.updated_by;
  RETURN api.get_org_branding(p_org_object_id);
END; $$;
REVOKE EXECUTE ON FUNCTION api.upsert_org_branding(text, text, text, text, text, text, text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.upsert_org_branding(text, text, text, text, text, text, text, text, text, text, boolean) TO authenticated, service_role;

-- -----------------------------------------------------
-- 6) Résolution par ORG dans le payload authentifié. Signature/forme INCHANGÉES (le front ne
--    change pas) ; clé orgObjectId ajoutée ; markerStyles/extra restent plateforme ; le trio
--    logo bascule EN BLOC (un logo ORG posé ⇒ path+mime de l'ORG, jamais de mélange).
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION api.get_app_branding()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
  SELECT jsonb_build_object(
    'orgObjectId',     api.current_user_org_id(),
    'brandName',       COALESCE(o.brand_name, s.brand_name),
    'logoStoragePath', CASE WHEN o.logo_public_url IS NOT NULL THEN o.logo_storage_path ELSE s.logo_storage_path END,
    'logoPublicUrl',   COALESCE(o.logo_public_url, s.logo_public_url),
    'logoMimeType',    CASE WHEN o.logo_public_url IS NOT NULL THEN o.logo_mime_type ELSE s.logo_mime_type END,
    'primaryColor',    COALESCE(o.primary_color, s.primary_color),
    'accentColor',     COALESCE(o.accent_color, s.accent_color),
    'textColor',       COALESCE(o.text_color, s.text_color),
    'backgroundColor', COALESCE(o.background_color, s.background_color),
    'surfaceColor',    COALESCE(o.surface_color, s.surface_color),
    'markerStyles',    s.marker_styles,
    'extra',           s.extra,
    'updatedAt',       GREATEST(s.updated_at, COALESCE(o.updated_at, s.updated_at)),
    'updatedBy',       s.updated_by
  )
  FROM app_branding_settings s
  LEFT JOIN org_branding_settings o ON o.org_object_id = api.current_user_org_id()
  WHERE s.setting_key = 'default';
$$;

COMMENT ON FUNCTION api.get_app_branding() IS
'Payload branding authentifié — résout la surcharge ORG (org_branding_settings) selon le membership actif, champ par champ, avec fallback sur le singleton plateforme. markerStyles/extra restent plateforme. Clé orgObjectId = ORG résolue (NULL si aucun membership).';

GRANT EXECUTE ON FUNCTION api.get_app_branding() TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
