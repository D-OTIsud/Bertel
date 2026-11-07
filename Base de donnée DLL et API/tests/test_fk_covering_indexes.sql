-- test_fk_covering_indexes.sql
-- Proves migration_fk_covering_indexes.sql (16g, §146): on the audit's worthwhile tables, EVERY
-- foreign key has a covering index (an index whose leading columns are exactly the FK's column
-- set). Set-based: robust to index naming, catches regressions when a new FK is added to these
-- tables without an index.
-- Run AFTER the full manifest. Self-contained + transactional (ROLLBACK; nothing persists).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE v_missing TEXT;
BEGIN
  SELECT string_agg(DISTINCT t.tbl || '(' || array_to_string(t.cols, ',') || ')', ', ')
  INTO v_missing
  FROM (
    SELECT c.conrelid::regclass::text AS tbl,
           (SELECT array_agg(a.attname ORDER BY k.ord)
            FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
            JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS cols
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.conrelid::regclass::text IN ('object_taxonomy','object_web_channel','object_relation',
           'crm_interaction','object_membership','object_menu_item','object_private_description')
      AND NOT EXISTS (
        SELECT 1 FROM pg_index i
        WHERE i.indrelid = c.conrelid AND i.indpred IS NULL
          AND (SELECT array_agg(x) FROM unnest((string_to_array(i.indkey::text,' ')::int2[])[1:array_length(c.conkey,1)]) x) @> c.conkey
          AND (SELECT array_agg(x) FROM unnest((string_to_array(i.indkey::text,' ')::int2[])[1:array_length(c.conkey,1)]) x) <@ c.conkey
      )
  ) t;

  ASSERT v_missing IS NULL,
         format('FK column sets without a covering index: %s', v_missing);

  -- Spot-check the two fan-out composites (53 pg_constraint clones each collapse onto these)
  ASSERT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename='object_taxonomy'
                 AND indexname='idx_object_taxonomy_ref_code_domain'),
         'idx_object_taxonomy_ref_code_domain missing';
  ASSERT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename='object_web_channel'
                 AND indexname='idx_object_web_channel_kind'),
         'idx_object_web_channel_kind missing';

  RAISE NOTICE 'FK covering-index assertions passed (7 tables fully covered).';
END$$;
ROLLBACK;
