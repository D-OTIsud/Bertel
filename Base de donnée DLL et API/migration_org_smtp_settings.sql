-- SMTP par office : configuration et RPCs de gestion uniquement.
-- Source 18g reconcilee sur les 8 prosrc de la base ryycrdhlkmzpxwwwwupy.
-- La file de notifications de septembre est conservee ; aucun ancien claim ici.
BEGIN;
-- 1) Table : un relais par ORG. Le mot de passe n'y est PAS — seulement son pointeur Vault.
-- =====================================================================================
CREATE TABLE IF NOT EXISTS public.org_smtp_settings (
  org_object_id      TEXT PRIMARY KEY REFERENCES object(id) ON DELETE CASCADE,
  host               TEXT    NOT NULL,
  port               INTEGER NOT NULL DEFAULT 587,
  secure             BOOLEAN NOT NULL DEFAULT FALSE,
  from_email         TEXT    NOT NULL,
  from_name          TEXT,
  username           TEXT,
  password_secret_id UUID,
  is_enabled         BOOLEAN NOT NULL DEFAULT FALSE,
  last_test_at       TIMESTAMPTZ,
  last_test_ok       BOOLEAN,
  last_test_error    TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- L'HÔTE reste libre — c'est la fonction même de cette table. Le PORT, lui, est restreint aux
  -- quatre ports de soumission SMTP réels. Sans cette borne, un admin d'ORG de rang 30 choisit
  -- librement une destination sortante hôte:port depuis le VPS, et le formulaire devient un
  -- sondeur de ports généraliste. 25 (relais), 465 (SMTPS implicite), 587 (STARTTLS), 2525 (repli
  -- courant quand 25 est filtré) couvrent tous les fournisseurs ; rien d'autre n'est un SMTP.
  CONSTRAINT chk_org_smtp_port  CHECK (port IN (25, 465, 587, 2525)),
  -- Nom d'hôte ou IPv4. Refuse au passage les saisies en URL (« smtp://… », « …:587 ») qui
  -- passeraient un simple test de non-vacuité et casseraient l'envoi à la première tentative.
  CONSTRAINT chk_org_smtp_host  CHECK (host ~ '^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?$'),
  CONSTRAINT chk_org_smtp_from  CHECK (from_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  -- 465 = TLS implicite, les trois autres = STARTTLS. Laisser les deux se contredire produirait
  -- un échec de handshake opaque, diagnostiqué comme « le fournisseur ne marche pas ».
  CONSTRAINT chk_org_smtp_secure CHECK ((port = 465) = secure)
);

COMMENT ON TABLE public.org_smtp_settings IS 'Relais SMTP par office. Secret dans Vault, lecture service_role uniquement ; configuration par administrateur de cet office.';

COMMENT ON COLUMN public.org_smtp_settings.is_enabled IS 'FALSE conserve la configuration sans autoriser les invitations du portail ; activer puis enregistrer avant le test de connexion.';

COMMENT ON COLUMN public.org_smtp_settings.from_name IS
'NULL ⇒ replie sur le brand_name de l''ORG (org_branding_settings) puis sur celui de la
plateforme (app_branding_settings) — résolu par get_org_smtp_secret, jamais figé ici.';

-- Garde type ORG — miroir de api.check_org_branding_org_type (table à part, message dédié).
CREATE OR REPLACE FUNCTION api.check_org_smtp_org_type()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, api, auth AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM object WHERE id = NEW.org_object_id AND object_type = 'ORG') THEN
    RAISE EXCEPTION 'org_smtp_settings.org_object_id doit pointer vers un objet ORG (reçu : %)', NEW.org_object_id;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_check_org_smtp_org_type ON public.org_smtp_settings;
CREATE TRIGGER trg_check_org_smtp_org_type
  BEFORE INSERT OR UPDATE ON public.org_smtp_settings
  FOR EACH ROW EXECUTE FUNCTION api.check_org_smtp_org_type();

DROP TRIGGER IF EXISTS update_org_smtp_settings_updated_at ON public.org_smtp_settings;
CREATE TRIGGER update_org_smtp_settings_updated_at
  BEFORE UPDATE ON public.org_smtp_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS activée SANS aucune policy ⇒ anon/authenticated lisent zéro ligne et toute écriture
-- leur est refusée. Chaque chemin d'accès est un RPC SECURITY DEFINER (propriétaire postgres,
-- hors RLS) ; service_role contourne également la RLS.
--
-- ⚠ Le REVOKE ci-dessous n'est PAS décoratif, et ne pas écrire de GRANT ne suffit PAS.
-- Cette base porte un `pg_default_acl` qui accorde `arwdDxtm` (ALL) sur TOUTE table créée
-- dans `public` à anon, authenticated ET service_role : une table naît donc avec les droits
-- complets pour les deux rôles publics, sans qu'aucun GRANT n'ait été écrit. Le commentaire
-- « no policy + no GRANT => deny-all » de migration_ai_provider_config.sql (16a), décalqué
-- ici à l'origine, était FAUX pour cette raison — vérifié en production le 2026-09-05.
-- Rien ne fuyait (la RLS tient seule), mais la seconde serrure annoncée n'existait pas, et
-- il suffirait qu'une policy permissive soit ajoutée un jour pour que le droit de table,
-- lui, soit déjà là.
ALTER TABLE public.org_smtp_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.org_smtp_settings FROM anon, authenticated;
GRANT ALL ON public.org_smtp_settings TO service_role;

-- =====================================================================================
-- 2) Gouvernance — superadmin plateforme OU admin actif de rang >= 30 de CETTE ORG.
--    Forme identique à api.user_can_manage_org_branding : même seuil, même invariant.
-- =====================================================================================
CREATE OR REPLACE FUNCTION api.user_can_manage_org_smtp(p_org_object_id text)
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
REVOKE EXECUTE ON FUNCTION api.user_can_manage_org_smtp(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.user_can_manage_org_smtp(text) TO authenticated, service_role;

COMMENT ON FUNCTION api.user_can_manage_org_smtp(text) IS
'Qui règle le relais SMTP d''une ORG : superadmin plateforme, ou admin ACTIF de rang >= 30 de
CETTE ORG. Même seuil que le branding et le portail acteurs — proposer la section plus bas
offrirait un écran dont chaque enregistrement échouerait en 42501.';

-- =====================================================================================
-- 3) Lecture admin — la configuration SANS le mot de passe (hasPassword, jamais la valeur).
-- =====================================================================================
CREATE OR REPLACE FUNCTION api.get_org_smtp(p_org_object_id text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE v_out jsonb;
BEGIN
  IF NOT api.user_can_manage_org_smtp(p_org_object_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: relais SMTP réservé au superadmin plateforme ou à un admin de cette organisation'
      USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'orgObjectId',  p_org_object_id,
    'configured',   (s.org_object_id IS NOT NULL),
    'host',         s.host,
    'port',         s.port,
    'secure',       s.secure,
    'fromEmail',    s.from_email,
    'fromName',     s.from_name,
    'username',     s.username,
    'hasPassword',  (s.password_secret_id IS NOT NULL),
    'isEnabled',    COALESCE(s.is_enabled, false),
    'lastTestAt',   s.last_test_at,
    'lastTestOk',   s.last_test_ok,
    'lastTestError', s.last_test_error,
    'fromNameFallback', COALESCE(ob.brand_name, pb.brand_name)
  )
  INTO v_out
  FROM (SELECT p_org_object_id AS org) k
  LEFT JOIN org_smtp_settings    s  ON s.org_object_id  = k.org
  LEFT JOIN org_branding_settings ob ON ob.org_object_id = k.org
  LEFT JOIN app_branding_settings pb ON pb.setting_key   = 'default';
  RETURN v_out;
END; $$;
REVOKE EXECUTE ON FUNCTION api.get_org_smtp(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.get_org_smtp(text) TO authenticated, service_role;

-- =====================================================================================
-- 4) Écriture — contrat FULL-STATE. Le mot de passe est le SEUL champ partiel : vide ⇒ conservé
--    (le formulaire ne le relit jamais), p_clear_password ⇒ retiré.
-- =====================================================================================
CREATE OR REPLACE FUNCTION api.upsert_org_smtp(
  p_org_object_id  text,
  p_host           text,
  p_port           integer,
  p_secure         boolean,
  p_from_email     text,
  p_from_name      text    DEFAULT NULL,
  p_username       text    DEFAULT NULL,
  p_password       text    DEFAULT NULL,
  p_is_enabled     boolean DEFAULT FALSE,
  p_clear_password boolean DEFAULT FALSE
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, vault, extensions
AS $$
DECLARE
  v_secret_id uuid;
  v_host      text := nullif(btrim(coalesce(p_host, '')), '');
  v_from      text := lower(nullif(btrim(coalesce(p_from_email, '')), ''));
  v_password  text := nullif(p_password, '');
BEGIN
  IF NOT api.user_can_manage_org_smtp(p_org_object_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: relais SMTP réservé au superadmin plateforme ou à un admin de cette organisation'
      USING ERRCODE = '42501';
  END IF;
  IF v_host IS NULL OR v_from IS NULL THEN
    RAISE EXCEPTION 'host et from_email sont requis' USING ERRCODE = '22000';
  END IF;

  SELECT password_secret_id INTO v_secret_id
  FROM org_smtp_settings WHERE org_object_id = p_org_object_id;

  IF p_clear_password THEN
    -- Retrait explicite : la ligne Vault part avec le pointeur, sinon le secret survivrait
    -- à la configuration qui le désignait, sans plus aucune voie de lecture ni de suppression.
    IF v_secret_id IS NOT NULL THEN
      DELETE FROM vault.secrets WHERE id = v_secret_id;
      v_secret_id := NULL;
    END IF;
  ELSIF v_password IS NOT NULL THEN
    IF v_secret_id IS NULL THEN
      v_secret_id := vault.create_secret(
        v_password,
        'org_smtp_' || gen_random_uuid()::text,
        'SMTP password (' || p_org_object_id || ')',
        NULL
      );
    ELSE
      PERFORM vault.update_secret(v_secret_id, v_password, NULL, NULL, NULL);
    END IF;
  END IF;
  -- p_password vide ET p_clear_password faux ⇒ v_secret_id reste tel quel : le mot de passe
  -- déjà posé est CONSERVÉ. C'est l'invariant qui permet au formulaire de ne jamais le relire.

  INSERT INTO org_smtp_settings (
    org_object_id, host, port, secure, from_email, from_name, username,
    password_secret_id, is_enabled, created_by, updated_by)
  VALUES (
    p_org_object_id, v_host, coalesce(p_port, 587), coalesce(p_secure, false), v_from,
    nullif(btrim(coalesce(p_from_name, '')), ''),
    nullif(btrim(coalesce(p_username, '')), ''),
    v_secret_id, coalesce(p_is_enabled, false), auth.uid(), auth.uid())
  ON CONFLICT (org_object_id) DO UPDATE SET
    host               = EXCLUDED.host,
    port               = EXCLUDED.port,
    secure             = EXCLUDED.secure,
    from_email         = EXCLUDED.from_email,
    from_name          = EXCLUDED.from_name,
    username           = EXCLUDED.username,
    password_secret_id = EXCLUDED.password_secret_id,
    is_enabled         = EXCLUDED.is_enabled,
    updated_by         = EXCLUDED.updated_by;

  RETURN api.get_org_smtp(p_org_object_id);
END; $$;
REVOKE EXECUTE ON FUNCTION api.upsert_org_smtp(text,text,integer,boolean,text,text,text,text,boolean,boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.upsert_org_smtp(text,text,integer,boolean,text,text,text,text,boolean,boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION api.delete_org_smtp(p_org_object_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, vault
AS $$
DECLARE v_secret_id uuid;
BEGIN
  IF NOT api.user_can_manage_org_smtp(p_org_object_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: relais SMTP réservé au superadmin plateforme ou à un admin de cette organisation'
      USING ERRCODE = '42501';
  END IF;
  SELECT password_secret_id INTO v_secret_id
  FROM org_smtp_settings WHERE org_object_id = p_org_object_id;
  DELETE FROM org_smtp_settings WHERE org_object_id = p_org_object_id;
  IF v_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_secret_id;
  END IF;
END; $$;
REVOKE EXECUTE ON FUNCTION api.delete_org_smtp(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.delete_org_smtp(text) TO authenticated, service_role;

-- =====================================================================================
-- 5) Lecteur d'exécution — rend le mot de passe DÉCHIFFRÉ. service_role SEUL.
--    Le grant EST la frontière : aucun utilisateur connecté ne peut l'exécuter, seules les
--    routes serveur (envoi de liste, drain de l'outbox, test de connexion) le peuvent.
--    Ne rend RIEN si le relais n'est pas activé — is_enabled est la bascule d'envoi.
-- =====================================================================================
CREATE OR REPLACE FUNCTION api.get_org_smtp_secret(p_org_object_id text)
RETURNS TABLE(
  host text, port integer, secure boolean,
  from_email text, from_name text, username text, password text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, vault, extensions
AS $$
BEGIN
  RETURN QUERY
    SELECT s.host, s.port, s.secure, s.from_email,
           -- from_name vide ⇒ marque de l'ORG, puis marque plateforme. Résolu ICI et non figé
           -- en base : un renommage de marque doit changer l'expéditeur sans réenregistrement.
           COALESCE(s.from_name, ob.brand_name, pb.brand_name),
           s.username,
           ds.decrypted_secret
    FROM public.org_smtp_settings s
    LEFT JOIN vault.decrypted_secrets ds  ON ds.id = s.password_secret_id
    LEFT JOIN public.org_branding_settings ob ON ob.org_object_id = s.org_object_id
    LEFT JOIN public.app_branding_settings pb ON pb.setting_key = 'default'
    WHERE s.org_object_id = p_org_object_id
      AND s.is_enabled
    LIMIT 1;
END; $$;
REVOKE ALL ON FUNCTION api.get_org_smtp_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.get_org_smtp_secret(text) TO service_role;

-- Issue du bouton « Tester la connexion », consignée pour que l'admin suivant la voie.
CREATE OR REPLACE FUNCTION api.record_org_smtp_test(p_org_object_id text, p_ok boolean, p_error text)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, api
AS $$
  UPDATE public.org_smtp_settings
     SET last_test_at = now(), last_test_ok = p_ok,
         last_test_error = CASE WHEN p_ok THEN NULL ELSE left(coalesce(p_error, ''), 500) END
   WHERE org_object_id = p_org_object_id;
$$;
REVOKE ALL ON FUNCTION api.record_org_smtp_test(text, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.record_org_smtp_test(text, boolean, text) TO service_role;

-- Vue superadmin : quelles ORG ont un relais, activé, testé quand. Aucun secret, aucun identifiant.
CREATE OR REPLACE FUNCTION api.list_org_smtp_status()
RETURNS TABLE(
  org_object_id text, org_name text, host text, port integer,
  from_email text, is_enabled boolean, has_password boolean,
  last_test_at timestamptz, last_test_ok boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth
AS $$
BEGIN
  IF NOT api.is_platform_superuser() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT o.id, o.name, s.host, s.port, s.from_email, s.is_enabled,
           (s.password_secret_id IS NOT NULL), s.last_test_at, s.last_test_ok
    FROM public.object o
    LEFT JOIN public.org_smtp_settings s ON s.org_object_id = o.id
    WHERE o.object_type = 'ORG'
    ORDER BY o.name;
END; $$;
REVOKE ALL ON FUNCTION api.list_org_smtp_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.list_org_smtp_status() TO authenticated, service_role;


COMMIT;
NOTIFY pgrst, 'reload schema';
