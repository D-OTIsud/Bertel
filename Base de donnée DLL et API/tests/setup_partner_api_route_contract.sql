-- Persistent fixture ONLY for the disposable Supabase CI database. The known
-- credential is intentionally not secret and must never be installed in PROD.
\ir assert_partner_api_ephemeral.sql
DO $ephemeral_only$
BEGIN
  IF current_setting('bertel.ephemeral_ci', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'This fixture requires bertel.ephemeral_ci=on in a disposable database';
  END IF;
END;
$ephemeral_only$;

INSERT INTO internal.partner_api_key(label, key_hash, key_prefix, scopes)
VALUES ('__ephemeral_route_contract__',
        encode(extensions.digest('bk_live_' || repeat('a',48),'sha256'),'hex'),
        'bk_live_aaaaaaaa', ARRAY['read'])
ON CONFLICT (key_hash) DO UPDATE
  SET is_active=true, revoked_at=NULL, expires_at=NULL;

NOTIFY pgrst, 'reload schema';
