-- test_audit_price_age_bounds.sql
-- Proves 20260905204133_audit_price_age_bounds.sql (DB-02): chk_age_max_nonneg
-- rejects a negative age_max_enfant/age_max_junior even when the paired min is
-- NULL, which the existing chk_age_ranges_valid CHECK lets through (NULL >= x
-- is NULL, and NULL passes a CHECK). Also proves the pre-existing min/max
-- ordering CHECK (chk_age_ranges_valid) is untouched, that the migration is
-- idempotent, and that a legacy bad row keeps the constraint NOT VALID/valid
-- as appropriate.
-- Self-contained, transactional (ROLLBACK; nothing persists). Fixture range 13xx.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_obj  text := 'HOTRUN9999991311';
  v_kind uuid;
BEGIN
  SELECT id INTO v_kind FROM ref_code_price_kind LIMIT 1;
  IF v_kind IS NULL THEN RAISE EXCEPTION 'fixture: ref_code_price_kind empty (seeds not applied)'; END IF;

  INSERT INTO object (id, object_type, name, status) VALUES
    (v_obj, 'HOT', 'DB-02 fixture', 'draft');

  -- (A) NULL/NULL for both categories: still valid (no ages at all).
  INSERT INTO object_price (object_id, kind_id) VALUES (v_obj, v_kind);

  -- (B) NULL min, positive max: valid.
  INSERT INTO object_price (object_id, kind_id, age_max_enfant, age_max_junior)
    VALUES (v_obj, v_kind, 5, 12);

  -- (C) NULL min, NEGATIVE max on enfant: must now be rejected by
  -- chk_age_max_nonneg. Before this migration chk_age_ranges_valid alone
  -- let this through.
  BEGIN
    INSERT INTO object_price (object_id, kind_id, age_max_enfant) VALUES (v_obj, v_kind, -1);
    RAISE EXCEPTION 'DB-02 FAIL: negative age_max_enfant with NULL min was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- (C2) same for junior.
  BEGIN
    INSERT INTO object_price (object_id, kind_id, age_min_enfant, age_max_junior) VALUES (v_obj, v_kind, 0, -3);
    RAISE EXCEPTION 'DB-02 FAIL: negative age_max_junior with NULL min was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- (D) pre-existing ordering CHECK (chk_age_ranges_valid) still enforced:
  -- min > max is rejected even with both set and non-negative.
  BEGIN
    INSERT INTO object_price (object_id, kind_id, age_min_enfant, age_max_enfant) VALUES (v_obj, v_kind, 10, 5);
    RAISE EXCEPTION 'DB-02 FAIL: age_min_enfant > age_max_enfant was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- (E) min set, positive max: valid (unaffected non-regression case).
  INSERT INTO object_price (object_id, kind_id, age_min_junior, age_max_junior)
    VALUES (v_obj, v_kind, 6, 17);

  RAISE NOTICE 'DB-02 test_audit_price_age_bounds: PASS';
END $$;
ROLLBACK;

-- Idempotent re-apply: running the migration a second time must not error
-- (guarded by pg_constraint lookup on conrelid) and must not change the
-- constraint's validity.
\ir ../../supabase/migrations/20260905204133_audit_price_age_bounds.sql

DO $$
DECLARE
  v_valid boolean;
BEGIN
  SELECT convalidated INTO v_valid
  FROM pg_constraint
  WHERE conrelid = 'public.object_price'::regclass
    AND conname = 'chk_age_max_nonneg';

  IF v_valid IS NULL THEN
    RAISE EXCEPTION 'DB-02 FAIL: chk_age_max_nonneg missing after re-apply';
  END IF;

  RAISE NOTICE 'DB-02 idempotent re-apply: PASS (convalidated=%)', v_valid;
END $$;

-- Legacy bad row upgrade path, in a separate fixture/transaction so the
-- earlier CHECK-violation asserts above are not muddied by a row inserted
-- before the constraint existed. Simulates an operator finding a pre-existing
-- violation on an upgraded (non-fresh) database: the migration must NOTICE
-- the count and leave the constraint NOT VALID, never repair or delete rows.
BEGIN;
-- Drop the constraint (added by the earlier \i re-apply above) so a
-- violating row can be inserted, simulating data that predates this
-- migration.
ALTER TABLE object_price DROP CONSTRAINT chk_age_max_nonneg;

DO $$
DECLARE
  v_obj  text := 'HOTRUN9999991312';
  v_kind uuid;
BEGIN
  SELECT id INTO v_kind FROM ref_code_price_kind LIMIT 1;

  INSERT INTO object (id, object_type, name, status) VALUES
    (v_obj, 'HOT', 'DB-02 legacy fixture', 'draft');

  INSERT INTO object_price (object_id, kind_id, age_max_enfant) VALUES (v_obj, v_kind, -7);
END $$;

-- Re-run the real migration: it must re-add chk_age_max_nonneg NOT VALID,
-- NOTICE the violating row count, and NOT raise (no VALIDATE, no repair).
\ir ../../supabase/migrations/20260905204133_audit_price_age_bounds.sql

DO $$
DECLARE
  v_valid boolean;
BEGIN
  SELECT convalidated INTO v_valid FROM pg_constraint
  WHERE conrelid = 'public.object_price'::regclass AND conname = 'chk_age_max_nonneg';

  IF v_valid IS NULL THEN
    RAISE EXCEPTION 'DB-02 FAIL: chk_age_max_nonneg missing after legacy-row re-apply';
  END IF;
  IF v_valid THEN
    RAISE EXCEPTION 'DB-02 FAIL: constraint must stay NOT VALID with a known-bad legacy row';
  END IF;

  RAISE NOTICE 'DB-02 legacy bad row upgrade path: PASS (constraint left NOT VALID as expected)';
END $$;
ROLLBACK;
