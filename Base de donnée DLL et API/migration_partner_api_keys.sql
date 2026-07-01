-- migration_partner_api_keys.sql
-- Audit API — Phase 1, chantier R1a (fondation DB du modèle partenaire).
--
-- OBJECTIF : donner à l'API une AUTHENTIFICATION PARTENAIRE dédiée (clé API par
-- prestataire externe) — traçable, révocable, scopée — au lieu du rôle `anon`
-- indifférencié. C'est la fondation de la passerelle `/api/public/*` (R1b) : le
-- route Next.js recevra une clé opaque `bk_live_…`, en calculera le SHA-256 (Node)
-- et appellera `api.partner_authenticate(hash)` en service-role. La CLÉ BRUTE ne
-- quitte jamais le route ; la DB ne stocke QUE le hash (jamais la clé).
--
-- SÉCURITÉ (calqué sur app_ai_provider_config §114) : tables dans le schéma
-- `internal` (NON exposé PostgREST ; anon sans USAGE) + RLS deny-all ⇒ aucun accès
-- direct ; tout passe par des RPC `api` SECURITY DEFINER. Gestion (émettre/révoquer/
-- lister) = superuser-only. Authentification/log = service_role-only (le grant EST
-- la frontière, comme get_active_ai_provider_secret).
--
-- NON foldé dans schema_unified.sql (référence api.is_platform_superuser de
-- rls_policies.sql). Idempotent. Le rate-limit/quota est le chantier R2 (pas ici).

BEGIN;

-- ── Tables (schéma internal, verrouillé) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS internal.partner_api_key (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label       text NOT NULL,
  key_hash    text NOT NULL UNIQUE,          -- SHA-256 hex de la clé brute (64 car.)
  key_prefix  text NOT NULL,                 -- affichage seul (ex. 'bk_live_ab12cd34')
  scopes      text[] NOT NULL DEFAULT '{}',  -- périmètre (réservé pour R1b/R2)
  is_active   boolean NOT NULL DEFAULT true,
  expires_at  timestamptz,
  revoked_at  timestamptz,
  last_used_at timestamptz,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE internal.partner_api_key IS
  'Clés API partenaire (hash SHA-256 uniquement, jamais la clé brute). Accès via RPC api.* DEFINER seulement. Audit API R1a.';

-- Journal append-only des appels partenaire (traçabilité / révocation motivée).
CREATE TABLE IF NOT EXISTS internal.partner_api_call (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key_id      uuid REFERENCES internal.partner_api_key(id) ON DELETE SET NULL,
  path        text,
  status      integer,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_api_call_key_time
  ON internal.partner_api_call (key_id, occurred_at DESC);

-- RLS deny-all (défense en profondeur : le schéma internal est déjà non exposé).
ALTER TABLE internal.partner_api_key  ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal.partner_api_call ENABLE ROW LEVEL SECURITY;

-- ── Gestion : superuser-only (browser-callable via l'admin) ─────────────────────

-- Émet une clé : renvoie la clé BRUTE UNE SEULE FOIS (jamais re-consultable).
CREATE OR REPLACE FUNCTION api.rpc_issue_partner_key(
  p_label      text,
  p_scopes     text[] DEFAULT '{}',
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = api, public, internal, extensions
AS $$
DECLARE
  v_raw    text;
  v_hash   text;
  v_prefix text;
  v_id     uuid;
BEGIN
  -- fail-closed : is_platform_superuser() renvoie NULL hors contexte auth (service_role/CI) ;
  -- `IF NOT NULL` ne déclencherait PAS la garde (fail-open). `IS NOT TRUE` refuse NULL ET FALSE.
  IF api.is_platform_superuser() IS NOT TRUE THEN
    RAISE EXCEPTION 'FORBIDDEN: platform superuser required to issue a partner key'
      USING ERRCODE = '42501';
  END IF;
  IF coalesce(btrim(p_label), '') = '' THEN
    RAISE EXCEPTION 'p_label is required' USING ERRCODE = '22023';
  END IF;

  -- 192 bits d'entropie ; préfixe 'bk_live_' pour identifier le type de secret.
  v_raw    := 'bk_live_' || encode(extensions.gen_random_bytes(24), 'hex');
  v_hash   := encode(extensions.digest(v_raw, 'sha256'), 'hex');
  v_prefix := left(v_raw, 16);

  INSERT INTO internal.partner_api_key (label, key_hash, key_prefix, scopes, expires_at, created_by)
  VALUES (btrim(p_label), v_hash, v_prefix, coalesce(p_scopes, '{}'), p_expires_at, auth.uid())
  RETURNING id INTO v_id;

  -- La clé brute n'est renvoyée qu'ICI, jamais stockée ni re-affichable.
  RETURN jsonb_build_object(
    'id', v_id, 'api_key', v_raw, 'key_prefix', v_prefix,
    'label', btrim(p_label), 'scopes', to_jsonb(coalesce(p_scopes, '{}'::text[])),
    'expires_at', p_expires_at
  );
END;
$$;

-- Révoque une clé (effet immédiat : partner_authenticate la refusera).
CREATE OR REPLACE FUNCTION api.rpc_revoke_partner_key(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = api, public, internal, extensions
AS $$
DECLARE v_found boolean;
BEGIN
  -- fail-closed : is_platform_superuser() renvoie NULL hors contexte auth (service_role/CI) ;
  -- `IF NOT NULL` ne déclencherait PAS la garde (fail-open). `IS NOT TRUE` refuse NULL ET FALSE.
  IF api.is_platform_superuser() IS NOT TRUE THEN
    RAISE EXCEPTION 'FORBIDDEN: platform superuser required' USING ERRCODE = '42501';
  END IF;
  UPDATE internal.partner_api_key
     SET is_active = false, revoked_at = now(), updated_at = now()
   WHERE id = p_id
  RETURNING true INTO v_found;
  RETURN jsonb_build_object('revoked', coalesce(v_found, false));
END;
$$;

-- Liste les clés (métadonnées seulement — JAMAIS le hash ni la clé).
CREATE OR REPLACE FUNCTION api.list_partner_keys()
RETURNS TABLE(
  id uuid, label text, key_prefix text, scopes text[], is_active boolean,
  expires_at timestamptz, revoked_at timestamptz, last_used_at timestamptz, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = api, public, internal, extensions
AS $$
BEGIN
  -- fail-closed : is_platform_superuser() renvoie NULL hors contexte auth (service_role/CI) ;
  -- `IF NOT NULL` ne déclencherait PAS la garde (fail-open). `IS NOT TRUE` refuse NULL ET FALSE.
  IF api.is_platform_superuser() IS NOT TRUE THEN
    RAISE EXCEPTION 'FORBIDDEN: platform superuser required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT k.id, k.label, k.key_prefix, k.scopes, k.is_active,
           k.expires_at, k.revoked_at, k.last_used_at, k.created_at
    FROM internal.partner_api_key k
    ORDER BY k.created_at DESC;
END;
$$;

-- ── Authentification + log : service_role-only (le grant EST la frontière) ──────

-- Le route passe le SHA-256 hex (calculé en Node) — la clé brute ne touche jamais la DB.
-- Renvoie {ok, id, label, scopes} si la clé est active/non-expirée/non-révoquée, sinon {ok:false}.
-- ponytail: met à jour last_used_at à chaque appel (write par requête) — throttler si QPS élevé (R2).
CREATE OR REPLACE FUNCTION api.partner_authenticate(p_key_hash text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = api, public, internal, extensions
AS $$
DECLARE v_row internal.partner_api_key;
BEGIN
  IF coalesce(p_key_hash, '') = '' THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  SELECT * INTO v_row
  FROM internal.partner_api_key
  WHERE key_hash = p_key_hash
    AND is_active
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now());

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  UPDATE internal.partner_api_key SET last_used_at = now() WHERE id = v_row.id;

  RETURN jsonb_build_object(
    'ok', true, 'id', v_row.id, 'label', v_row.label,
    'scopes', to_jsonb(v_row.scopes)
  );
END;
$$;

CREATE OR REPLACE FUNCTION api.partner_log_call(p_key_id uuid, p_path text, p_status integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = api, public, internal, extensions
AS $$
BEGIN
  INSERT INTO internal.partner_api_call (key_id, path, status)
  VALUES (p_key_id, p_path, p_status);
END;
$$;

-- ── Grants ──────────────────────────────────────────────────────────────────────
-- Gestion : superuser-gated dans le corps, browser-callable par l'admin (pattern §114).
REVOKE EXECUTE ON FUNCTION api.rpc_issue_partner_key(text, text[], timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.rpc_issue_partner_key(text, text[], timestamptz) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION api.rpc_revoke_partner_key(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.rpc_revoke_partner_key(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION api.list_partner_keys() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.list_partner_keys() TO authenticated, service_role;

-- Auth/log : service_role SEUL (aucun utilisateur ne s'authentifie un partenaire).
REVOKE EXECUTE ON FUNCTION api.partner_authenticate(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION api.partner_authenticate(text) TO service_role;
REVOKE EXECUTE ON FUNCTION api.partner_log_call(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION api.partner_log_call(uuid, text, integer) TO service_role;

COMMIT;
