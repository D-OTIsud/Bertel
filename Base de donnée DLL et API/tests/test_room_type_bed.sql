-- test_room_type_bed.sql -- §72 structured bed list (Phase 2).
-- Asserts post-state after schema_unified + rls_policies + seeds_data + migration_room_type_bed.
-- Read-only; raises on any failure, emits PASS otherwise.
DO $$
DECLARE
  v_codes   int;
  v_i18n    int;
  v_relrls  boolean;
  v_forall  int;
  v_read    int;
BEGIN
  -- (1) bed_type vocabulary seeded (10 canonical codes).
  SELECT count(*) INTO v_codes FROM public.ref_code WHERE domain = 'bed_type';
  IF v_codes < 10 THEN
    RAISE EXCEPTION 'FAIL: bed_type vocabulary incomplete (expected >=10, got %)', v_codes;
  END IF;

  -- (2) en/es i18n present on every bed_type code.
  SELECT count(*) INTO v_i18n FROM public.ref_code
    WHERE domain = 'bed_type' AND (name_i18n ? 'en') AND (name_i18n ? 'es');
  IF v_i18n <> v_codes THEN
    RAISE EXCEPTION 'FAIL: bed_type i18n incomplete (% of % codes have en+es)', v_i18n, v_codes;
  END IF;

  -- (3) object_room_type_bed has RLS enabled.
  SELECT relrowsecurity INTO v_relrls FROM pg_class WHERE relname = 'object_room_type_bed';
  IF v_relrls IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL: object_room_type_bed RLS not enabled';
  END IF;

  -- (4) NO FOR ALL write policy on the child table (per-command only -- CLAUDE.md invariant).
  SELECT count(*) INTO v_forall FROM pg_policies
    WHERE tablename = 'object_room_type_bed' AND cmd = 'ALL';
  IF v_forall <> 0 THEN
    RAISE EXCEPTION 'FAIL: object_room_type_bed has % FOR ALL write policy(ies) (expected 0)', v_forall;
  END IF;

  -- (5) the read policy exists and qualifies the outer column (§55 -- guards the deparse, not the source).
  SELECT count(*) INTO v_read FROM pg_policies
    WHERE tablename = 'object_room_type_bed' AND policyname = 'read_object_room_type_bed'
      AND qual LIKE '%object_room_type_bed.room_type_id%';
  IF v_read <> 1 THEN
    RAISE EXCEPTION 'FAIL: read_object_room_type_bed missing or outer column not qualified (§55)';
  END IF;

  RAISE NOTICE 'PASS: bed_type vocab + i18n seeded; object_room_type_bed RLS per-command + qualified.';
END $$;
