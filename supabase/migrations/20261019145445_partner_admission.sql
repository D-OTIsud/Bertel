-- One short admission transaction; resource reads remain separate RPCs.
BEGIN;

CREATE OR REPLACE FUNCTION api.partner_admit(
  p_key_hash text,
  p_limit integer DEFAULT 120,
  p_window_seconds integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_identity jsonb;
  v_rate jsonb;
BEGIN
  -- Authentication failures propagate: they must never reach the limiter fallback.
  v_identity := api.partner_authenticate(p_key_hash);
  IF v_identity->>'ok' IS DISTINCT FROM 'true'
     OR nullif(v_identity->>'id', '') IS NULL THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  BEGIN
    v_rate := api.partner_rate_check((v_identity->>'id')::uuid, p_limit, p_window_seconds);
    v_rate := jsonb_build_object(
      'allowed', (v_rate->>'allowed')::boolean,
      'retry_after', coalesce((v_rate->>'retry_after')::integer, p_window_seconds),
      'limit', p_limit,
      'remaining', coalesce((v_rate->>'remaining')::integer,
        CASE WHEN (v_rate->>'allowed')::boolean THEN p_limit ELSE 0 END)
    );
  EXCEPTION WHEN query_canceled OR OTHERS THEN
    -- Only quota errors fail open, after authentication has succeeded.
    v_rate := jsonb_build_object('allowed', true, 'retry_after', 0,
      'limit', p_limit, 'remaining', p_limit);
  END;

  RETURN v_identity || jsonb_build_object('rate', v_rate);
END;
$$;

REVOKE ALL ON FUNCTION api.partner_admit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.partner_admit(text, integer, integer) TO service_role;
COMMENT ON FUNCTION api.partner_admit(text, integer, integer) IS
  'Service-role partner authentication and fixed-window quota in one RPC. Auth fails closed; quota errors alone fail open. No identity cache.';

COMMIT;
