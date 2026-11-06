-- Preserve the existing per-route 12 requests / sliding 60 seconds rule across
-- replicas/restarts. Identity is verified by the server before this service-only
-- RPC; callers cannot choose a limit, window, or a third budget namespace.
BEGIN;

CREATE SCHEMA IF NOT EXISTS internal;
CREATE TABLE IF NOT EXISTS internal.ai_request_rate_state (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  route text NOT NULL CHECK (route IN ('translate', 'menu_extract')),
  hits timestamptz[] NOT NULL DEFAULT ARRAY[]::timestamptz[],
  PRIMARY KEY (user_id, route),
  CONSTRAINT ai_request_rate_state_bounded CHECK (
    cardinality(hits) <= 12 AND array_position(hits, NULL) IS NULL
  )
);
ALTER TABLE internal.ai_request_rate_state ENABLE ROW LEVEL SECURITY;
-- Override inherited default table grants too; the RPC does not need DELETE.
REVOKE ALL ON TABLE internal.ai_request_rate_state FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA internal TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE internal.ai_request_rate_state TO service_role;

CREATE OR REPLACE FUNCTION api.admit_ai_request(p_user_id uuid, p_route text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE
  v_now timestamptz;
  v_hits timestamptz[];
  v_count integer;
  v_retry integer;
BEGIN
  IF p_user_id IS NULL OR p_route IS NULL OR p_route NOT IN ('translate', 'menu_extract') THEN
    RAISE EXCEPTION 'Invalid AI admission identity or route' USING ERRCODE = '22023';
  END IF;

  INSERT INTO internal.ai_request_rate_state (user_id, route)
  VALUES (p_user_id, p_route)
  ON CONFLICT (user_id, route) DO NOTHING;

  SELECT s.hits INTO v_hits
  FROM internal.ai_request_rate_state AS s
  WHERE s.user_id = p_user_id AND s.route = p_route
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI admission identity unavailable' USING ERRCODE = '42501';
  END IF;

  -- Take time after obtaining the key's lock, not before waiting for a competing
  -- admission. Equality at 60s expires, matching both former JS predicates.
  v_now := clock_timestamp();
  SELECT COALESCE(array_agg(h.at ORDER BY h.at), ARRAY[]::timestamptz[])
  INTO v_hits FROM unnest(v_hits) AS h(at)
  WHERE h.at > v_now - interval '60 seconds';
  v_count := cardinality(v_hits);
  IF v_count >= 12 THEN
    v_retry := LEAST(60, GREATEST(1, ceil(extract(epoch FROM (v_hits[1] + interval '60 seconds' - v_now)))::integer));
    RETURN jsonb_build_object('allowed', false, 'remaining', 0, 'retry_after', v_retry);
  END IF;

  UPDATE internal.ai_request_rate_state
  SET hits = array_append(v_hits, v_now)
  WHERE user_id = p_user_id AND route = p_route;
  RETURN jsonb_build_object('allowed', true, 'remaining', 11 - v_count, 'retry_after', 0);
END;
$fn$;
REVOKE ALL ON FUNCTION api.admit_ai_request(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.admit_ai_request(uuid, text) TO service_role;
COMMENT ON FUNCTION api.admit_ai_request(uuid, text) IS
  'Service-only atomic 12/60s sliding AI request admission per verified user and route. No provider text/key stored. Local CPU leases remain separate.';

NOTIFY pgrst, 'reload schema';
COMMIT;
