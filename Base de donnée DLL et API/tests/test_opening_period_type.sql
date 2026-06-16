-- test_opening_period_type.sql
-- Proves migration_opening_period_type.sql (§81): the ref_code_opening_period_type partition
-- (4 seeds + ref_* RLS pair + uq id/code), the opening_period.period_type_id FK, the read
-- helper emitting period_type_code, and anon read / write-deny on the catalog.
-- Run AFTER the full manifest. Self-contained + transactional (ROLLBACK; nothing persists).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_inserted boolean := false;
  v_obj text := 'OPTYPE9999999901';
  v_period uuid;
  v_json jsonb;
BEGIN
  -- ---------- Structural (catalog partition) ----------
  ASSERT (SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname='public' AND c.relname='ref_code_opening_period_type'),
         'ref_code_opening_period_type does not have RLS enabled (migration not applied)';
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ref_code_opening_period_type'
                 AND policyname='pub_ref_code_read' AND cmd='SELECT'),
         'pub_ref_code_read policy missing on the partition';
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ref_code_opening_period_type'
                 AND policyname='admin_ref_code_write' AND cmd='ALL'),
         'admin_ref_code_write policy missing on the partition';
  ASSERT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename='ref_code_opening_period_type'
                 AND indexname='uq_ref_code_opening_period_type_id'),
         'uq(id) missing — opening_period FK cannot target the partition';
  ASSERT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.opening_period'::regclass AND contype='f'
                 AND pg_get_constraintdef(oid) ILIKE '%ref_code_opening_period_type%'),
         'opening_period.period_type_id FK to ref_code_opening_period_type missing';

  -- ---------- Seed ----------
  ASSERT (SELECT count(*) FROM ref_code_opening_period_type WHERE is_active) = 4,
         'expected 4 active opening period types';
  ASSERT (SELECT name FROM ref_code_opening_period_type WHERE code='high_season') = 'Haute saison',
         'high_season must be Haute saison';
  ASSERT (SELECT metadata->>'all_year' FROM ref_code_opening_period_type WHERE code='year_round') = 'true',
         'year_round must carry metadata.all_year = true (drives the date UI)';
  ASSERT (SELECT count(*) FROM ref_code_opening_period_type WHERE COALESCE(metadata->>'color','') = '') = 0,
         'every seeded type must carry a ribbon colour';

  -- ---------- FK enforcement + read helper (superuser; RLS bypassed, FK enforced) ----------
  INSERT INTO object (id, object_type, name, status) VALUES (v_obj, 'ACT', 'period-type test', 'draft');
  v_inserted := false;
  BEGIN
    INSERT INTO opening_period (id, object_id, name, all_years, period_type_id)
      VALUES (gen_random_uuid(), v_obj, 'bogus', true, gen_random_uuid());
    v_inserted := true;  -- only reached if the FK let an unknown id through
  EXCEPTION WHEN foreign_key_violation THEN NULL;  -- expected
  END;
  ASSERT NOT v_inserted, 'period_type_id FK did not reject an unknown type id';

  INSERT INTO opening_period (id, object_id, name, all_years, period_type_id)
    VALUES (gen_random_uuid(), v_obj, 'Été', false,
            (SELECT id FROM ref_code_opening_period_type WHERE code='high_season'))
    RETURNING id INTO v_period;
  v_json := api.build_opening_period_json(v_period, v_obj, NULL, NULL, 1)::jsonb;
  ASSERT v_json ? 'period_type_code', 'build_opening_period_json must emit period_type_code';
  ASSERT v_json->>'period_type_code' = 'high_season',
         'build_opening_period_json must resolve the stored type to its code';

  -- ---------- ANON: reads the public catalog, cannot write ----------
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
    ASSERT (SELECT count(*) FROM ref_code_opening_period_type WHERE is_active) = 4,
           'anon MUST read the period-type catalog';
    v_inserted := false;
    BEGIN
      INSERT INTO ref_code (domain, code, name) VALUES ('opening_period_type', 'bogus_anon', 'Bogus');
      v_inserted := true;
    EXCEPTION WHEN insufficient_privilege THEN NULL;  -- expected (admin-write gate)
    END;
    ASSERT NOT v_inserted, 'anon MUST NOT write the period-type catalog';
  RESET ROLE;

  RAISE NOTICE 'opening_period_type assertions passed (partition/RLS/seed/FK + read-helper code + anon read / write-deny).';
END$$;
ROLLBACK;
