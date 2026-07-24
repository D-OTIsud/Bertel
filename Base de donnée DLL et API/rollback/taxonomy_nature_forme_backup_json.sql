\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

\if :{?batch_limit}
\else
  \set batch_limit 100000
\endif

\if :{?batch_offset}
\else
  \set batch_offset 0
\endif

BEGIN;
\ir ../taxonomy_nature_forme_manifest_20260724.sql

SELECT json_build_object(
         'object_id', m.object_id,
         'domain', ot.domain,
         'old_ref_code_id', ot.ref_code_id::TEXT,
         'old_code', rc.code,
         'old_source', ot.source,
         'old_note', ot.note,
         'target_code', m.target_code
       )::TEXT
FROM _taxonomy_nature_forme_manifest m
JOIN object_taxonomy ot
  ON ot.object_id = m.object_id
 AND ot.domain = 'taxonomy_hlo'
JOIN ref_code rc
  ON rc.id = ot.ref_code_id
 AND rc.domain = ot.domain
WHERE rc.code = m.expected_old_code
ORDER BY m.object_id
LIMIT :batch_limit
OFFSET :batch_offset;

ROLLBACK;
