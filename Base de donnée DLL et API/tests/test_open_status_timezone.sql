-- test_open_status_timezone.sql
-- Proves api.get_local_now_for_timezone no longer scans pg_timezone_names — the ~253 ms/call
-- catalog enumeration (~1200 zones) that made api.refresh_open_status ~92% of ALL DB exec time:
-- the leaf function is CROSS JOIN LATERAL'd once per published object every 15 min (cron job 2),
-- so a 253 ms validation scan × ~85-373 objects = the entire ~22 s runtime (see decision log §37).
-- The function's CONTRACT is preserved exactly:
--   * a valid IANA zone        -> that zone, local fields == (CURRENT_TIMESTAMP AT TIME ZONE zone);
--   * empty / blank / NULL     -> 'Indian/Reunion';
--   * an unrecognized zone     -> 'Indian/Reunion' fallback
--     (old: EXISTS(pg_timezone_names); new: AT TIME ZONE raises 22023 invalid_parameter_value -> caught).
-- Two assertion layers:
--   * STRUCTURAL  — the function body MUST NOT reference pg_timezone_names. Against a DB WITHOUT
--                   this migration the ASSERT is FALSE -> red.
--   * BEHAVIOURAL — resolved zone + local_date/local_time/local_isodow for each input class.
-- Self-contained + transactional (ROLLBACK; nothing persists). Mirrors test_cards_batch_authorize.sql.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_zone text;
  r      record;
  v_ts   timestamp;
BEGIN
  -- ---------- STRUCTURAL: the pg_timezone_names scan is gone (migration applied) ----------
  ASSERT (
    SELECT p.prosrc NOT ILIKE '%pg_timezone_names%'
    FROM pg_proc p
    WHERE p.proname = 'get_local_now_for_timezone' AND p.pronamespace = 'api'::regnamespace
  ), 'get_local_now_for_timezone MUST NOT scan pg_timezone_names (timezone-perf migration not applied)';

  -- ---------- BEHAVIOURAL: contract preserved ----------
  -- valid zone -> that zone; local fields match a direct (CURRENT_TIMESTAMP AT TIME ZONE) computation
  SELECT * INTO r FROM api.get_local_now_for_timezone('America/New_York');
  v_ts := CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York';
  ASSERT r.business_timezone = 'America/New_York', format('valid zone not preserved: %s', r.business_timezone);
  ASSERT r.local_date    = v_ts::date,                  'valid zone local_date mismatch';
  ASSERT r.local_time    = v_ts::time,                  'valid zone local_time mismatch';
  ASSERT r.local_isodow  = EXTRACT(ISODOW FROM v_ts)::int, 'valid zone local_isodow mismatch';

  -- the platform default zone (every object on live uses this) matches a direct computation
  SELECT * INTO r FROM api.get_local_now_for_timezone('Indian/Reunion');
  v_ts := CURRENT_TIMESTAMP AT TIME ZONE 'Indian/Reunion';
  ASSERT r.business_timezone = 'Indian/Reunion',        'Indian/Reunion not preserved';
  ASSERT r.local_date = v_ts::date AND r.local_time = v_ts::time, 'Indian/Reunion fields mismatch';

  -- empty / blank / NULL -> Indian/Reunion fallback
  SELECT business_timezone INTO v_zone FROM api.get_local_now_for_timezone('');
  ASSERT v_zone = 'Indian/Reunion', format('empty -> expected Indian/Reunion, got %s', v_zone);
  SELECT business_timezone INTO v_zone FROM api.get_local_now_for_timezone('   ');
  ASSERT v_zone = 'Indian/Reunion', format('blank -> expected Indian/Reunion, got %s', v_zone);
  SELECT business_timezone INTO v_zone FROM api.get_local_now_for_timezone(NULL);
  ASSERT v_zone = 'Indian/Reunion', format('NULL -> expected Indian/Reunion, got %s', v_zone);

  -- unrecognized zone -> Indian/Reunion fallback (the 22023 path that replaces the catalog scan)
  SELECT business_timezone INTO v_zone FROM api.get_local_now_for_timezone('Definitely/NotARealZone');
  ASSERT v_zone = 'Indian/Reunion', format('invalid zone -> expected Indian/Reunion fallback, got %s', v_zone);

  RAISE NOTICE 'get_local_now_for_timezone timezone-perf assertions passed.';
END$$;
ROLLBACK;
