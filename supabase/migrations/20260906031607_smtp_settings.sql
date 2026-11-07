-- SMTP for business mail (lists, CRM notifications), separate from Supabase Auth SMTP.
-- Singleton metadata; the password only lives encrypted in Supabase Vault.
BEGIN;

CREATE TABLE IF NOT EXISTS public.app_smtp_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT true,
  host text NOT NULL CHECK (length(host) BETWEEN 1 AND 253 AND host ~ '^[a-zA-Z0-9][a-zA-Z0-9.-]*$'),
  port integer NOT NULL CHECK (port BETWEEN 1 AND 65535),
  secure boolean NOT NULL DEFAULT false,
  from_email text NOT NULL CHECK (from_email ~ '^[^[:space:]<>@]+@[^[:space:]<>@]+[.][^[:space:]<>@]+$'),
  from_name text NOT NULL CHECK (length(btrim(from_name)) BETWEEN 1 AND 320 AND from_name !~ E'[\r\n]'),
  auth_mode text NOT NULL CHECK (auth_mode IN ('relay', 'password')),
  username text,
  password_secret_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CHECK ((auth_mode = 'relay' AND username IS NULL AND password_secret_id IS NULL)
    OR (auth_mode = 'password' AND nullif(btrim(username), '') IS NOT NULL AND password_secret_id IS NOT NULL))
);

COMMENT ON TABLE public.app_smtp_config IS
  'Configuration SMTP globale des e-mails métier. Secret Vault, aucune lecture directe client. RPCs admin sans secret; lecture déchiffrée service_role uniquement.';
ALTER TABLE public.app_smtp_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_smtp_config FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION api.get_smtp_config()
RETURNS TABLE(enabled boolean, host text, port integer, secure boolean, from_email text,
  from_name text, auth_mode text, username text, has_password boolean, updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
BEGIN
  IF auth.uid() IS NULL OR api.is_platform_superuser() IS NOT TRUE THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT c.enabled, c.host, c.port, c.secure, c.from_email, c.from_name,
    c.auth_mode, c.username, c.password_secret_id IS NOT NULL, c.updated_at
    FROM public.app_smtp_config c WHERE c.id;
END $fn$;
REVOKE ALL ON FUNCTION api.get_smtp_config() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION api.get_smtp_config() TO authenticated;

CREATE OR REPLACE FUNCTION api.upsert_smtp_config(
  p_enabled boolean, p_host text, p_port integer, p_secure boolean,
  p_from_email text, p_from_name text, p_auth_mode text, p_username text DEFAULT NULL,
  p_password text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_current public.app_smtp_config%ROWTYPE;
  v_secret uuid;
  v_password text := nullif(p_password, '');
BEGIN
  IF auth.uid() IS NULL OR api.is_platform_superuser() IS NOT TRUE THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF p_enabled IS NULL OR p_secure IS NULL OR p_port IS NULL OR p_port NOT BETWEEN 1 AND 65535
    OR nullif(btrim(p_host), '') IS NULL OR length(p_host) > 253
    OR btrim(p_host) !~ '^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$'
    OR nullif(btrim(p_from_name), '') IS NULL OR length(p_from_name) > 320 OR p_from_name ~ E'[\r\n]'
    OR p_from_email IS NULL OR length(p_from_email) > 320
    OR btrim(p_from_email) !~ '^[^[:space:]<>@]+@[^[:space:]<>@]+[.][^[:space:]<>@]+$'
    OR p_auth_mode IS NULL OR p_auth_mode NOT IN ('relay', 'password')
    OR length(coalesce(p_password, '')) > 4096 THEN
    RAISE EXCEPTION 'INVALID_SMTP_SETTINGS' USING ERRCODE = '22023';
  END IF;
  -- Serializes first creation as well as subsequent secret rotations.
  PERFORM pg_catalog.pg_advisory_xact_lock(728140026);
  SELECT * INTO v_current FROM public.app_smtp_config WHERE id FOR UPDATE;
  v_secret := v_current.password_secret_id;
  IF p_auth_mode = 'password' THEN
    IF nullif(btrim(p_username), '') IS NULL OR length(p_username) > 320 OR p_username ~ E'[\r\n]' THEN
      RAISE EXCEPTION 'SMTP_USERNAME_REQUIRED' USING ERRCODE = '22023';
    END IF;
    IF nullif(btrim(v_password), '') IS NULL THEN
      IF v_secret IS NULL OR v_current.host IS DISTINCT FROM btrim(p_host)
        OR v_current.username IS DISTINCT FROM btrim(p_username) THEN
        RAISE EXCEPTION 'SMTP_PASSWORD_REQUIRED' USING ERRCODE = '22023';
      END IF;
    ELSIF v_secret IS NULL THEN
      v_secret := vault.create_secret(v_password, 'smtp_' || gen_random_uuid()::text, 'Bertel business SMTP password');
    ELSE
      PERFORM vault.update_secret(v_secret, v_password);
    END IF;
  ELSE
    IF v_secret IS NOT NULL THEN DELETE FROM vault.secrets WHERE id = v_secret; END IF;
    v_secret := NULL;
  END IF;
  INSERT INTO public.app_smtp_config(id, enabled, host, port, secure, from_email, from_name,
    auth_mode, username, password_secret_id, updated_at, updated_by)
  VALUES (true, p_enabled, btrim(p_host), p_port, p_secure, btrim(p_from_email), btrim(p_from_name),
    p_auth_mode, CASE WHEN p_auth_mode = 'password' THEN btrim(p_username) ELSE NULL END,
    v_secret, now(), auth.uid())
  ON CONFLICT (id) DO UPDATE SET enabled = EXCLUDED.enabled, host = EXCLUDED.host,
    port = EXCLUDED.port, secure = EXCLUDED.secure, from_email = EXCLUDED.from_email,
    from_name = EXCLUDED.from_name, auth_mode = EXCLUDED.auth_mode, username = EXCLUDED.username,
    password_secret_id = EXCLUDED.password_secret_id, updated_at = EXCLUDED.updated_at,
    updated_by = EXCLUDED.updated_by;
END $fn$;
REVOKE ALL ON FUNCTION api.upsert_smtp_config(boolean,text,integer,boolean,text,text,text,text,text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION api.upsert_smtp_config(boolean,text,integer,boolean,text,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION api.get_smtp_config_secret()
RETURNS TABLE(enabled boolean, host text, port integer, secure boolean, from_email text,
  from_name text, auth_mode text, username text, password text)
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $fn$
  SELECT c.enabled, c.host, c.port, c.secure, c.from_email, c.from_name, c.auth_mode,
    c.username, ds.decrypted_secret
  FROM public.app_smtp_config c
  LEFT JOIN vault.decrypted_secrets ds ON ds.id = c.password_secret_id
  WHERE c.id;
$fn$;
REVOKE ALL ON FUNCTION api.get_smtp_config_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.get_smtp_config_secret() TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
