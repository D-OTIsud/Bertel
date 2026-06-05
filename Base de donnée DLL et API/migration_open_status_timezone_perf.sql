-- migration_open_status_timezone_perf.sql
-- refresh_open_status performance fix (2026-06-04). Decision log §37.
--
-- SYMPTOM: api.refresh_open_status() = 92.4% of ALL database exec time (pg_stat_statements since
--   2026-03-04): 22,493 calls, ~8.65 s mean (a single EXPLAIN ANALYZE measured 21.9 s). It runs
--   every 15 min (cron job 2: '3,18,33,48 * * * *') over only 848 objects / 373 published.
-- ROOT CAUSE: the query is ALREADY set-based (one UPDATE ... FROM (WITH open_state ...)). The cost
--   is the leaf function api.get_local_now_for_timezone(text), CROSS JOIN LATERAL'd once per
--   published object that has opening hours (~85-373×). Its body validated the zone with
--   `EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = ...)`. pg_timezone_names is a set-
--   returning catalog view that ENUMERATES + computes the offset for ~1200 zones on every scan
--   (~253 ms/call measured as the only non-trivial EXPLAIN node). It is STABLE but, being a
--   set-returning fn in a correlated LATERAL, is re-executed per outer row. All 848 objects use
--   exactly one zone ('Indian/Reunion'), so it recomputed the identical value dozens of times.
-- FIX: validate the zone CHEAPLY instead of scanning the catalog — `CURRENT_TIMESTAMP AT TIME ZONE z`
--   raises 22023 (invalid_parameter_value) on an unknown zone, caught to fall back to 'Indian/Reunion'.
--   Identical contract (valid->that zone; empty/blank/NULL->Indian/Reunion; invalid->Indian/Reunion),
--   ~µs instead of ~253 ms. Benefits the only other caller too (api.get_object_local_now).
--   Measured on live: refresh open-state computation 21.9 s -> <100 ms; open_state byte-equivalent
--   (md5 of {id:is_open_now} over all 373 published = 4b339ad77ebf505bead6c2fcfcc25f2e, unchanged).
-- BLAST RADIUS: api.refresh_open_status (cron) + api.get_object_local_now. Signature unchanged
--   (no PostgREST reload needed — not a directly-exposed RPC; both callers are internal).
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION (re-runnable). FOLDED INTO schema_unified.sql, so a fresh
--   build already ships this form (idempotent no-op on replay). Manifest step 4c.
-- REVERSIBLE: restore the pg_timezone_names-EXISTS body (see schema_unified.sql git history / the
--   original LANGUAGE sql STABLE definition).

BEGIN;

CREATE OR REPLACE FUNCTION api.get_local_now_for_timezone(p_business_timezone text)
 RETURNS TABLE(local_date date, local_time time without time zone, local_isodow integer, business_timezone text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'api', 'extensions', 'auth', 'audit', 'crm', 'ref'
AS $function$
DECLARE
  v_zone text := COALESCE(NULLIF(btrim(p_business_timezone), ''), 'Indian/Reunion');
  v_now  timestamp;
BEGIN
  -- Cheap validation: AT TIME ZONE raises 22023 (invalid_parameter_value) on an unknown zone.
  -- Replaces `EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = v_zone)`, which enumerated
  -- ~1200 zones (~253 ms) on EVERY call (see header / decision log §37).
  BEGIN
    v_now := CURRENT_TIMESTAMP AT TIME ZONE v_zone;
  EXCEPTION WHEN invalid_parameter_value THEN
    v_zone := 'Indian/Reunion';
    v_now  := CURRENT_TIMESTAMP AT TIME ZONE v_zone;
  END;

  RETURN QUERY SELECT
    v_now::date                       AS local_date,
    v_now::time                       AS local_time,
    EXTRACT(ISODOW FROM v_now)::int   AS local_isodow,
    v_zone                            AS business_timezone;
END;
$function$;

COMMIT;

-- No `NOTIFY pgrst, 'reload schema'` required: signature unchanged, not a directly-exposed RPC.
