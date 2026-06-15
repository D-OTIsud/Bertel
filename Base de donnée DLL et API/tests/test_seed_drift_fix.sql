-- test_seed_drift_fix.sql — §68 ref-seeding audit seed-drift fixes.
-- Asserts the post-state after seeds_data.sql + migration_seed_drift_fix_legaltype_weekday.sql.
-- Run read-only (no writes). Raises on any failure; emits PASS notice otherwise.
DO $$
DECLARE
  v_rs       int;
  v_null_dow int;
  v_bad_dow  int;
BEGIN
  -- (1) ref_legal_type.raison_sociale present (canonical 17th legal type).
  SELECT count(*) INTO v_rs FROM public.ref_legal_type WHERE code = 'raison_sociale';
  IF v_rs <> 1 THEN
    RAISE EXCEPTION 'FAIL: ref_legal_type.raison_sociale missing (expected 1, got %)', v_rs;
  END IF;

  -- (2a) no weekday row has a NULL dow_number.
  SELECT count(*) INTO v_null_dow
  FROM public.ref_code WHERE domain = 'weekday' AND dow_number IS NULL;
  IF v_null_dow <> 0 THEN
    RAISE EXCEPTION 'FAIL: % weekday rows have NULL dow_number (expected 0)', v_null_dow;
  END IF;

  -- (2b) every weekday dow_number matches ISO Mon=1..Sun=7.
  SELECT count(*) INTO v_bad_dow
  FROM public.ref_code
  WHERE domain = 'weekday'
    AND dow_number <> CASE code
      WHEN 'monday'    THEN 1
      WHEN 'tuesday'   THEN 2
      WHEN 'wednesday' THEN 3
      WHEN 'thursday'  THEN 4
      WHEN 'friday'    THEN 5
      WHEN 'saturday'  THEN 6
      WHEN 'sunday'    THEN 7
    END;
  IF v_bad_dow <> 0 THEN
    RAISE EXCEPTION 'FAIL: % weekday rows have a non-ISO dow_number', v_bad_dow;
  END IF;

  RAISE NOTICE 'PASS: raison_sociale present; weekday dow_number complete and ISO-correct.';
END $$;
