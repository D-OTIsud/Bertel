-- migration_ai_provider_config.sql — AI provider configuration (platform-level, admin-configurable)
-- Manifest 16a. Spec: docs/superpowers/specs/2026-06-22-ai-menu-extraction-design.md §4.
--
-- Stores provider PROFILES (OpenAI-compatible / anthropic) with exactly ONE active. The API key
-- lives in Supabase Vault (key_secret_id -> vault.secrets) — NEVER in this table, NEVER returned to
-- the client. All access goes through SECURITY DEFINER RPCs:
--   · api.upsert_ai_provider / list_ai_providers / set_active_ai_provider / delete_ai_provider
--       — super-admin gated (api.is_platform_superuser), browser-callable.
--   · api.get_active_ai_provider_secret — returns the DECRYPTED key, GRANTed to service_role ONLY
--       (the server extraction/test routes); REVOKEd from anon/authenticated. This grant IS the
--       trust boundary: even SECURITY DEFINER, a logged-in user cannot execute it.
-- Depends on: api.is_platform_superuser (rls_policies.sql) + supabase_vault extension.
-- Folded into schema_unified.sql (table + RLS) + listed in ci_fresh_apply.sql / runbook.
-- gen_random_uuid() (pg_catalog) — restricted-search_path safe (CLAUDE.md UUID rule).
BEGIN;

CREATE TABLE IF NOT EXISTS public.app_ai_provider_config (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label             text NOT NULL,
  api_kind          text NOT NULL DEFAULT 'openai_compatible'
                      CHECK (api_kind IN ('openai_compatible','anthropic')),
  base_url          text NOT NULL,
  model             text NOT NULL,
  key_secret_id     uuid,            -- pointer into vault.secrets (NULL = keyless local provider, e.g. Ollama)
  max_output_tokens integer NOT NULL DEFAULT 4096 CHECK (max_output_tokens BETWEEN 256 AND 32768),
  is_active         boolean NOT NULL DEFAULT false,
  extra             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- At most one active provider (partial unique index).
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_provider_active
  ON public.app_ai_provider_config (is_active) WHERE is_active;

COMMENT ON TABLE public.app_ai_provider_config IS
'Configuration plateforme du fournisseur IA (extraction de carte -> menu structuré, §06). Plusieurs
profils, UN seul actif (uq_ai_provider_active). La clé API vit dans Supabase Vault (key_secret_id ->
vault.secrets) — JAMAIS dans cette table, JAMAIS renvoyée au client. Accès uniquement via les RPCs
DEFINER api.upsert_ai_provider / list_ai_providers / set_active_ai_provider / delete_ai_provider
(super-admin) + api.get_active_ai_provider_secret (service_role only). RLS: aucun accès PostgREST direct.';

ALTER TABLE public.app_ai_provider_config ENABLE ROW LEVEL SECURITY;
-- No policy + no GRANT to anon/authenticated => deny-all for direct PostgREST. Every access path is a
-- SECURITY DEFINER RPC (owner = postgres, bypasses RLS); service_role also bypasses RLS.

-- ====================================================================================
-- Management RPCs — super-admin gated, browser-callable. They NEVER return the key.
-- ====================================================================================

CREATE OR REPLACE FUNCTION api.upsert_ai_provider(
  p_id                uuid,
  p_label             text,
  p_api_kind          text,
  p_base_url          text,
  p_model             text,
  p_max_output_tokens integer,
  p_is_active         boolean,
  p_extra             jsonb DEFAULT '{}'::jsonb,
  p_api_key           text  DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, vault, extensions
AS $fn$
DECLARE
  v_id        uuid := p_id;
  v_secret_id uuid;
  v_label     text := nullif(btrim(p_label), '');
BEGIN
  IF NOT api.is_platform_superuser() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING errcode = '42501';
  END IF;
  IF v_label IS NULL THEN
    RAISE EXCEPTION 'label required' USING errcode = '22000';
  END IF;
  IF coalesce(p_api_kind, '') NOT IN ('openai_compatible', 'anthropic') THEN
    RAISE EXCEPTION 'invalid api_kind: %', p_api_kind USING errcode = '22000';
  END IF;
  IF coalesce(btrim(p_base_url), '') = '' OR coalesce(btrim(p_model), '') = '' THEN
    RAISE EXCEPTION 'base_url and model are required' USING errcode = '22000';
  END IF;

  IF v_id IS NOT NULL THEN
    SELECT key_secret_id INTO v_secret_id FROM public.app_ai_provider_config WHERE id = v_id;
  END IF;

  -- Create or rotate the Vault secret only when a non-empty key is provided.
  -- An empty/NULL key on update keeps the existing pointer (UI never reads the key back).
  IF nullif(btrim(p_api_key), '') IS NOT NULL THEN
    IF v_secret_id IS NULL THEN
      v_secret_id := vault.create_secret(
        p_api_key,
        'ai_provider_' || gen_random_uuid()::text,
        'AI provider API key (' || v_label || ')',
        NULL
      );
    ELSE
      PERFORM vault.update_secret(v_secret_id, p_api_key, NULL, NULL, NULL);
    END IF;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.app_ai_provider_config(
      label, api_kind, base_url, model, key_secret_id, max_output_tokens, is_active, extra)
    VALUES (v_label, p_api_kind, btrim(p_base_url), btrim(p_model), v_secret_id,
            coalesce(p_max_output_tokens, 4096), false, coalesce(p_extra, '{}'::jsonb))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.app_ai_provider_config
       SET label = v_label, api_kind = p_api_kind, base_url = btrim(p_base_url),
           model = btrim(p_model), key_secret_id = v_secret_id,
           max_output_tokens = coalesce(p_max_output_tokens, 4096),
           extra = coalesce(p_extra, '{}'::jsonb), updated_at = now()
     WHERE id = v_id;
  END IF;

  -- Activation: single-active invariant. Deactivate others FIRST, then activate the target —
  -- a single SET is_active=(id=…) over all rows can transiently leave two TRUE rows and trip the
  -- non-deferrable partial unique index uq_ai_provider_active (caught by test_ai_provider_config).
  IF coalesce(p_is_active, false) THEN
    UPDATE public.app_ai_provider_config SET is_active = false, updated_at = now()
     WHERE is_active AND id <> v_id;
    UPDATE public.app_ai_provider_config SET is_active = true, updated_at = now()
     WHERE id = v_id AND NOT is_active;
  END IF;

  RETURN v_id;
END$fn$;

REVOKE ALL ON FUNCTION api.upsert_ai_provider(uuid,text,text,text,text,integer,boolean,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.upsert_ai_provider(uuid,text,text,text,text,integer,boolean,jsonb,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION api.list_ai_providers()
RETURNS TABLE(
  id uuid, label text, api_kind text, base_url text, model text,
  max_output_tokens integer, is_active boolean, extra jsonb,
  has_key boolean, created_at timestamptz, updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth
AS $fn$
BEGIN
  IF NOT api.is_platform_superuser() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING errcode = '42501';
  END IF;
  RETURN QUERY
    SELECT c.id, c.label, c.api_kind, c.base_url, c.model, c.max_output_tokens,
           c.is_active, c.extra, (c.key_secret_id IS NOT NULL) AS has_key,
           c.created_at, c.updated_at
    FROM public.app_ai_provider_config c
    ORDER BY c.is_active DESC, c.label;
END$fn$;

REVOKE ALL ON FUNCTION api.list_ai_providers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.list_ai_providers() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION api.set_active_ai_provider(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth
AS $fn$
BEGIN
  IF NOT api.is_platform_superuser() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING errcode = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.app_ai_provider_config WHERE id = p_id) THEN
    RAISE EXCEPTION 'unknown provider' USING errcode = '22000';
  END IF;
  -- Deactivate others FIRST, then activate the target (see upsert_ai_provider note: avoids a
  -- transient two-TRUE state against the non-deferrable partial unique index).
  UPDATE public.app_ai_provider_config SET is_active = false, updated_at = now()
   WHERE is_active AND id <> p_id;
  UPDATE public.app_ai_provider_config SET is_active = true, updated_at = now()
   WHERE id = p_id AND NOT is_active;
END$fn$;

REVOKE ALL ON FUNCTION api.set_active_ai_provider(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.set_active_ai_provider(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION api.delete_ai_provider(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, vault
AS $fn$
DECLARE v_secret_id uuid;
BEGIN
  IF NOT api.is_platform_superuser() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING errcode = '42501';
  END IF;
  SELECT key_secret_id INTO v_secret_id FROM public.app_ai_provider_config WHERE id = p_id;
  DELETE FROM public.app_ai_provider_config WHERE id = p_id;
  IF v_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_secret_id;
  END IF;
END$fn$;

REVOKE ALL ON FUNCTION api.delete_ai_provider(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.delete_ai_provider(uuid) TO authenticated, service_role;

-- ====================================================================================
-- Server-execution reader — returns the DECRYPTED key. service_role ONLY.
-- The grant is the boundary: no logged-in user can execute it; only the server routes
-- (extraction + test-connection), which hold the service-role key, can.
-- ====================================================================================

CREATE OR REPLACE FUNCTION api.get_active_ai_provider_secret()
RETURNS TABLE(
  id uuid, label text, api_kind text, base_url text, model text,
  max_output_tokens integer, extra jsonb, api_key text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, vault, extensions
AS $fn$
BEGIN
  RETURN QUERY
    SELECT c.id, c.label, c.api_kind, c.base_url, c.model, c.max_output_tokens, c.extra,
           ds.decrypted_secret
    FROM public.app_ai_provider_config c
    LEFT JOIN vault.decrypted_secrets ds ON ds.id = c.key_secret_id
    WHERE c.is_active
    LIMIT 1;
END$fn$;

REVOKE ALL ON FUNCTION api.get_active_ai_provider_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.get_active_ai_provider_secret() TO service_role;

COMMIT;
