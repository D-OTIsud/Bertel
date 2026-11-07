-- migration_taxonomy_assignable_cleanup.sql
-- Editor §01 sous-catégorie review (2026-06-08).
--
-- Goal: an object can be assigned at ANY level of an arbitrary-depth taxonomy
-- (category, subcategory, deeper). The architecture already supports this; the
-- only blocker was the per-node `is_assignable` flag being set inconsistently —
-- some intermediate "group" nodes were non-selectable (and two were dead: a
-- non-selectable node with no children, so neither pickable nor expandable).
--
-- Decision (locked 2026-06-08): the ONLY non-assignable node is the technical
-- `root` of each domain (it is filtered out of breadcrumbs — that is how the
-- hidden root works). Every other node becomes selectable. This keeps the full
-- path visible (root stays hidden via its own flag) with NO code/SQL change to
-- the read/write/path logic — `is_assignable` already gates selection and the
-- closure already renders arbitrary-depth paths.
--
-- Also capitalizes four lowercase leaf names (data-entry slips), merges two
-- HLO taxonomy duplicates/misplacements, and flattens one empty PSV wrapper.
--
-- Idempotent: safe to re-run. Pure DML (no DDL).

BEGIN;

-- 1) Uniform rule: every non-root taxonomy node is selectable.
--    (4 domains already followed this; this flips the 15 stragglers in
--    taxonomy_hlo/loi/org/psv/res. The `root` of each domain is untouched.)
UPDATE ref_code
SET is_assignable = true
WHERE domain LIKE 'taxonomy_%'
  AND code <> 'root'
  AND is_assignable IS DISTINCT FROM true;

-- 2) Capitalize the four lowercase leaf names (name + name_i18n.fr).
UPDATE ref_code SET name = 'Bulle',
       name_i18n = jsonb_set(coalesce(name_i18n, '{}'::jsonb), '{fr}', '"Bulle"')
 WHERE domain = 'taxonomy_hlo' AND code = 'bulle';
UPDATE ref_code SET name = 'Chambre',
       name_i18n = jsonb_set(coalesce(name_i18n, '{}'::jsonb), '{fr}', '"Chambre"')
 WHERE domain = 'taxonomy_hlo' AND code = 'chambre';
UPDATE ref_code SET name = 'Cottage',
       name_i18n = jsonb_set(coalesce(name_i18n, '{}'::jsonb), '{fr}', '"Cottage"')
 WHERE domain = 'taxonomy_hlo' AND code = 'cottage';
UPDATE ref_code SET name = 'Atelier',
       name_i18n = jsonb_set(coalesce(name_i18n, '{}'::jsonb), '{fr}', '"Atelier"')
 WHERE domain = 'taxonomy_loi' AND code = 'atelier';

-- 3) Merge the redundant HLO singular child into the canonical plural category:
--    "Chambre d'hôte" -> "Chambre d'hôtes". The path already carries the parent;
--    the extra singular leaf created a near-duplicate category.
WITH src AS (
  SELECT id
  FROM ref_code
  WHERE domain = 'taxonomy_hlo'
    AND code = 'chambre_d_hote'
), dst AS (
  SELECT id
  FROM ref_code
  WHERE domain = 'taxonomy_hlo'
    AND code = 'chambre_d_hotes'
)
UPDATE object_taxonomy ot
SET ref_code_id = dst.id,
    note = concat_ws(' | ', nullif(ot.note, ''), 'taxonomy cleanup 2026-06-08: chambre_d_hote -> chambre_d_hotes'),
    updated_at = NOW()
FROM src, dst
WHERE ot.domain = 'taxonomy_hlo'
  AND ot.ref_code_id = src.id
  AND ot.ref_code_id IS DISTINCT FROM dst.id;

WITH src AS (
  SELECT id
  FROM ref_code
  WHERE domain = 'taxonomy_hlo'
    AND code = 'chambre_d_hote'
), dst AS (
  SELECT id
  FROM ref_code
  WHERE domain = 'taxonomy_hlo'
    AND code = 'chambre_d_hotes'
)
UPDATE ref_code child
SET parent_id = dst.id,
    updated_at = NOW()
FROM src, dst
WHERE child.domain = 'taxonomy_hlo'
  AND child.parent_id = src.id
  AND child.parent_id IS DISTINCT FROM dst.id;

WITH dst AS (
  SELECT id
  FROM ref_code
  WHERE domain = 'taxonomy_hlo'
    AND code = 'chambre_d_hotes'
)
DELETE FROM ref_code doomed
USING dst
WHERE doomed.domain = 'taxonomy_hlo'
  AND doomed.code = 'chambre_d_hote'
  AND NOT EXISTS (
    SELECT 1
    FROM object_taxonomy ot
    WHERE ot.domain = doomed.domain
      AND ot.ref_code_id = doomed.id
  );

-- 4) Remove the misplaced HLO "Table d'hôte" node. HLO objects cannot be assigned
--    to the RES taxonomy, so keep the lodging object under "Chambre d'hôtes" and
--    remove only the bad lodging copy.
WITH src AS (
  SELECT id
  FROM ref_code
  WHERE domain = 'taxonomy_hlo'
    AND code = 'table_d_hote'
), dst AS (
  SELECT id
  FROM ref_code
  WHERE domain = 'taxonomy_hlo'
    AND code = 'chambre_d_hotes'
)
UPDATE object_taxonomy ot
SET ref_code_id = dst.id,
    note = concat_ws(' | ', nullif(ot.note, ''), 'taxonomy cleanup 2026-06-08: removed misplaced HLO table_d_hote'),
    updated_at = NOW()
FROM src, dst
WHERE ot.domain = 'taxonomy_hlo'
  AND ot.ref_code_id = src.id
  AND ot.ref_code_id IS DISTINCT FROM dst.id;

WITH src AS (
  SELECT id
  FROM ref_code
  WHERE domain = 'taxonomy_hlo'
    AND code = 'table_d_hote'
), dst AS (
  SELECT id
  FROM ref_code
  WHERE domain = 'taxonomy_hlo'
    AND code = 'chambre_d_hotes'
)
UPDATE ref_code child
SET parent_id = dst.id,
    updated_at = NOW()
FROM src, dst
WHERE child.domain = 'taxonomy_hlo'
  AND child.parent_id = src.id
  AND child.parent_id IS DISTINCT FROM dst.id;

WITH dst AS (
  SELECT id
  FROM ref_code
  WHERE domain = 'taxonomy_hlo'
    AND code = 'chambre_d_hotes'
)
DELETE FROM ref_code doomed
USING dst
WHERE doomed.domain = 'taxonomy_hlo'
  AND doomed.code = 'table_d_hote'
  AND NOT EXISTS (
    SELECT 1
    FROM object_taxonomy ot
    WHERE ot.domain = doomed.domain
      AND ot.ref_code_id = doomed.id
  );

-- 5) Flatten the empty PSV wrapper "Location de matériel de loisirs": its only
--    useful child becomes a direct child of the wrapper's parent/root. If someone
--    assigns the generic wrapper later, stop instead of silently narrowing it to
--    cycle/scooter rental.
DO $$
DECLARE
  assigned_wrapper_n integer;
BEGIN
  SELECT COUNT(*)
  INTO assigned_wrapper_n
  FROM object_taxonomy ot
  JOIN ref_code wrapper
    ON wrapper.id = ot.ref_code_id
   AND wrapper.domain = ot.domain
  WHERE wrapper.domain = 'taxonomy_psv'
    AND wrapper.code = 'leisure_equipment_rental';

  IF assigned_wrapper_n > 0 THEN
    RAISE EXCEPTION 'Taxonomy cleanup refused: taxonomy_psv/leisure_equipment_rental has % direct assignment(s)', assigned_wrapper_n
      USING HINT = 'Review those objects before flattening the wrapper; do not silently narrow them to cycle/scooter rental.';
  END IF;
END $$;

WITH wrapper AS (
  SELECT id, parent_id, position
  FROM ref_code
  WHERE domain = 'taxonomy_psv'
    AND code = 'leisure_equipment_rental'
), leaf AS (
  SELECT id
  FROM ref_code
  WHERE domain = 'taxonomy_psv'
    AND code = 'cycle_scooter_rental'
)
UPDATE ref_code rc
SET parent_id = wrapper.parent_id,
    position = COALESCE(wrapper.position, rc.position),
    metadata = COALESCE(rc.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'taxonomy_cleanup_20260608',
        jsonb_build_object('flattened_from', 'leisure_equipment_rental')
      ),
    updated_at = NOW()
FROM wrapper, leaf
WHERE rc.domain = 'taxonomy_psv'
  AND rc.id = leaf.id
  AND (
    rc.parent_id IS DISTINCT FROM wrapper.parent_id
    OR rc.position IS DISTINCT FROM COALESCE(wrapper.position, rc.position)
    OR NOT (COALESCE(rc.metadata, '{}'::jsonb) ? 'taxonomy_cleanup_20260608')
  );

WITH wrapper AS (
  SELECT id
  FROM ref_code
  WHERE domain = 'taxonomy_psv'
    AND code = 'leisure_equipment_rental'
)
DELETE FROM ref_code doomed
USING wrapper
WHERE doomed.domain = 'taxonomy_psv'
  AND doomed.id = wrapper.id
  AND NOT EXISTS (
    SELECT 1
    FROM object_taxonomy ot
    WHERE ot.domain = doomed.domain
      AND ot.ref_code_id = doomed.id
  );

-- 6) Refresh the Explorer facet cache for the affected domains: `is_assignable`
--    and structural cleanup changed which ancestors are cached
--    (object.cached_taxonomy_codes).
SELECT api.refresh_object_taxonomy_cache_for_domain(d)
FROM (VALUES ('taxonomy_hlo'), ('taxonomy_loi'), ('taxonomy_org'),
             ('taxonomy_psv'), ('taxonomy_res')) AS x(d);

COMMIT;
