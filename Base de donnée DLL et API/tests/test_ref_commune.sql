-- test_ref_commune.sql
-- Proves migration_ref_commune.sql: ref_commune seeded with the 24 La Reunion communes,
-- the ref_* pub-read / admin-write RLS pair, and the object_zone.insee_commune FK.
-- Run AFTER the full manifest. Self-contained + transactional (ROLLBACK; nothing persists).
-- Inserts run as the connecting superuser (RLS bypassed but FK enforced); SET LOCAL ROLE
-- drives the per-role checks. Against a DB WITHOUT the migration, every assertion goes red.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_inserted boolean := false;
BEGIN
  -- ---------- Structural (catalog) ----------
  ASSERT (SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = 'ref_commune'),
         'ref_commune does not have RLS enabled (migration_ref_commune.sql not applied)';
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ref_commune'
                 AND policyname='pub_ref_commune_read' AND cmd='SELECT'),
         'pub_ref_commune_read policy missing';
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ref_commune'
                 AND policyname='admin_write_ref_commune' AND cmd='ALL'),
         'admin_write_ref_commune policy missing';
  ASSERT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='object_zone_insee_commune_fkey' AND contype='f'),
         'object_zone.insee_commune FK to ref_commune missing';

  -- ---------- Seed ----------
  ASSERT (SELECT count(*) FROM ref_commune WHERE is_active) = 24, 'expected 24 active La Reunion communes';
  ASSERT (SELECT name FROM ref_commune WHERE insee_code = '97422') = 'Le Tampon', '97422 must be Le Tampon';
  ASSERT (SELECT count(*) FROM ref_commune WHERE insee_code !~ '^974[0-9][0-9]$') = 0, 'all commune codes must be 974xx';

  -- ---------- FK enforcement (superuser; RLS bypassed, FK enforced) ----------
  INSERT INTO object (id, object_type, name, status)
    VALUES ('ZONEFK9999999901', 'ACT', 'ref_commune FK test', 'draft');
  BEGIN
    INSERT INTO object_zone (object_id, insee_commune, position) VALUES ('ZONEFK9999999901', '99999', 0);
    v_inserted := true;  -- only reached if the FK let an unknown code through
  EXCEPTION WHEN foreign_key_violation THEN NULL;  -- expected
  END;
  ASSERT NOT v_inserted, 'FK did not reject an unknown commune code';
  INSERT INTO object_zone (object_id, insee_commune, position) VALUES ('ZONEFK9999999901', '97422', 0);
  ASSERT (SELECT count(*) FROM object_zone WHERE object_id = 'ZONEFK9999999901') = 1, 'valid-commune zone insert failed';

  -- ---------- ANON: reads the public catalog, cannot write ----------
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
    ASSERT (SELECT count(*) FROM ref_commune WHERE is_active) = 24, 'anon MUST read the commune catalog';
    v_inserted := false;
    BEGIN
      INSERT INTO ref_commune (insee_code, name) VALUES ('97499', 'Bogus');
      v_inserted := true;
    EXCEPTION WHEN insufficient_privilege THEN NULL;  -- expected (admin-write gate)
    END;
    ASSERT NOT v_inserted, 'anon MUST NOT write ref_commune';
  RESET ROLE;

  RAISE NOTICE 'ref_commune assertions passed (structural + 24-seed + FK enforce + anon read / write-deny).';
END$$;
ROLLBACK;
