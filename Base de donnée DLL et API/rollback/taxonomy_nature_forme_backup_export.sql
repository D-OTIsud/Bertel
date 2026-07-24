\set ON_ERROR_STOP on

\if :{?batch_limit}
\else
  \set batch_limit 100000
\endif

\if :{?batch_offset}
\else
  \set batch_offset 0
\endif

-- Read-only logical backup generator for §190.
-- Usage from the repository root:
--   psql -X -f "Base de donnée DLL et API/rollback/taxonomy_nature_forme_backup_export.sql"
-- Redirect COPY stdout to a reviewed file only after checking the 242-row gate.
-- The only writes are transaction-local TEMP rows; ROLLBACK leaves cloud unchanged.

BEGIN;

\ir ../taxonomy_nature_forme_manifest_20260724.sql

DO $backup_gate$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count
  FROM _taxonomy_nature_forme_manifest m
  JOIN object o ON o.id = m.object_id
  JOIN object_taxonomy ot
    ON ot.object_id = m.object_id
   AND ot.domain = 'taxonomy_hlo'
  JOIN ref_code rc
    ON rc.id = ot.ref_code_id
   AND rc.domain = ot.domain
  WHERE rc.code = m.expected_old_code;

  IF v_count <> 243 THEN
    RAISE EXCEPTION
      'before-state backup incomplete: % rows match expected_old_code (expected 243)',
      v_count;
  END IF;
END
$backup_gate$;

COPY (
  SELECT m.object_id,
         ot.domain,
         ot.ref_code_id::TEXT AS old_ref_code_id,
         rc.code AS old_code,
         ot.source AS old_source,
         ot.note AS old_note,
         m.target_code
  FROM _taxonomy_nature_forme_manifest m
  JOIN object_taxonomy ot
    ON ot.object_id = m.object_id
   AND ot.domain = 'taxonomy_hlo'
  JOIN ref_code rc
    ON rc.id = ot.ref_code_id
   AND rc.domain = ot.domain
  ORDER BY m.object_id
  LIMIT :batch_limit
  OFFSET :batch_offset
) TO STDOUT WITH (FORMAT CSV, HEADER TRUE);

ROLLBACK;
