-- test_iti_section06_vocab.sql
-- Section 06 ITI editor vocabularies (migration_iti_section06_vocab.sql):
--   * ref_iti_assoc_role seeded (was 0 rows live -> object_iti_associated_object FK 23503)
--   * three new ref_code domains with DEDICATED partitions + house RLS pair:
--       iti_difficulty (1-5), iti_open_status (matches object_iti.open_status CHECK), iti_stage_kind
-- Run AFTER the manifest (migration_iti_section06_vocab.sql is \ir'd at 14z).
-- Self-contained + transactional (ROLLBACK; pure read asserts, nothing persists).
\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
  -- ---------- Association roles (objets liés) ----------
  ASSERT (SELECT count(*) FROM ref_iti_assoc_role) >= 8,
    'ref_iti_assoc_role must be seeded (>=8 roles) — unseeded would FK-23503 object_iti_associated_object';
  ASSERT EXISTS (SELECT 1 FROM ref_iti_assoc_role WHERE code = 'sur_le_parcours'),
    'ref_iti_assoc_role.sur_le_parcours missing';

  -- ---------- ref_code domains ----------
  ASSERT (SELECT count(*) FROM ref_code WHERE domain = 'iti_difficulty') = 5,
    'iti_difficulty must have exactly 5 levels (1-5)';
  ASSERT (SELECT count(*) FROM ref_code WHERE domain = 'iti_open_status') = 4,
    'iti_open_status must have exactly 4 codes';
  ASSERT (SELECT count(*) FROM ref_code WHERE domain = 'iti_stage_kind') = 8,
    'iti_stage_kind must have exactly 8 codes';

  -- open_status vocabulary must align with the object_iti.open_status CHECK constraint
  ASSERT (SELECT array_agg(code ORDER BY code) FROM ref_code WHERE domain = 'iti_open_status')
         = ARRAY['closed','open','partially_closed','warning'],
    'iti_open_status codes must match the object_iti.open_status CHECK domain';

  -- difficulty codes are the integers 1..5 (the column is INTEGER CHECK 1..5)
  ASSERT (SELECT array_agg(code ORDER BY code) FROM ref_code WHERE domain = 'iti_difficulty')
         = ARRAY['1','2','3','4','5'],
    'iti_difficulty codes must be 1..5';

  -- ---------- Dedicated partitions + house RLS (not the ref_code_other default) ----------
  ASSERT EXISTS (SELECT 1 FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
                 WHERE i.inhparent = 'public.ref_code'::regclass AND c.relname = 'ref_code_iti_difficulty'),
    'ref_code_iti_difficulty dedicated partition missing';
  ASSERT EXISTS (SELECT 1 FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
                 WHERE i.inhparent = 'public.ref_code'::regclass AND c.relname = 'ref_code_iti_stage_kind'),
    'ref_code_iti_stage_kind dedicated partition missing';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.ref_code_iti_stage_kind'::regclass),
    'ref_code_iti_stage_kind must have RLS enabled (house pair)';

  RAISE NOTICE 'Section 06 ITI vocab assertions passed.';
END$$;
ROLLBACK;
