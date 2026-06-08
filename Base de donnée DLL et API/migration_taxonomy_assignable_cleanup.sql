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
-- Also capitalizes four lowercase leaf names (data-entry slips).
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

-- 3) Refresh the Explorer facet cache for the affected domains: `is_assignable`
--    changed which ancestors are cached (object.cached_taxonomy_codes).
SELECT api.refresh_object_taxonomy_cache_for_domain(d)
FROM (VALUES ('taxonomy_hlo'), ('taxonomy_loi'), ('taxonomy_org'),
             ('taxonomy_psv'), ('taxonomy_res')) AS x(d);

COMMIT;
