-- migration_taxonomy_label_hygiene.sql
-- Taxonomy label hygiene (2026-07-03).
--
-- Two data-quality fixes on the `ref_code` taxonomy catalog, both surfaced by a
-- full-catalog audit (a raw type-code acronym showing as a selectable sub-category
-- in the editor §01 picker — "je ne veux plus voir ça"):
--
--   A) Remove the junk `taxonomy_loi/loi` node. It reused the domain's own type
--      code as a child category (name = 'LOI'). It was a dead, non-selectable,
--      childless node until migration_taxonomy_assignable_cleanup.sql (2026-06-08)
--      blanket-flipped every non-root node to is_assignable=true, which surfaced it
--      as a pickable "LOI" at the top level of the Loisir sub-category tree
--      (buildTaxonomyNodeOptions re-parents root's children to top-level).
--      One object carried it (LOIRUN00000001A0, draft) — the tag = the type code
--      echoed, so it carries zero information; the object is simply untagged.
--
--   B) Humanize the 19 technical `root` labels. Each taxonomy_<t>/root node was
--      named with the raw type acronym (LOI, PCU, PNA...). Roots are
--      is_assignable=false and filtered out of the picker (buildTaxonomyNodeOptions
--      drops code='root'), so this is not visible in the editor, but the raw
--      acronym must not leak to any ref_code/admin surface. Labels mirror
--      TYPE_LABEL (bertel-tourism-ui/src/features/object-editor/archetypes.ts).
--
-- Idempotent, pure DML. This file is the LIVE remediation for an already-deployed
-- DB; the source-of-truth snapshot migration_taxonomy_trees_seed.sql (manifest step
-- `taxo`, runs LAST) is edited to the same end-state so a fresh build converges
-- identically without this file. Safe to re-run.
--
-- See CLAUDE.md / lot1_mapping_decisions.md (taxonomy hygiene 2026-07-03).

BEGIN;

-- A) Untag the one object carrying the junk node, then delete the node.
--    The ref_code_taxonomy_closure rows cascade via FK (ON DELETE CASCADE).
DELETE FROM object_taxonomy ot
USING ref_code rc
WHERE ot.ref_code_id = rc.id
  AND rc.domain = 'taxonomy_loi'
  AND rc.code = 'loi';

DELETE FROM ref_code
WHERE domain = 'taxonomy_loi'
  AND code = 'loi';

-- B) Humanize the 19 technical roots: raw type acronym -> canonical FR label.
--    Fully normalizes name / name_i18n / description / description_i18n so live and
--    the trees-seed snapshot are byte-identical (drops any stale acronym, incl. the
--    lone `name_i18n.en:"ACT"` on taxonomy_act). Description stays a clean technical
--    line (roots are never displayed; they are the hidden container of each tree).
UPDATE ref_code AS r
SET name = v.label,
    description = 'Racine technique — ' || v.label,
    name_i18n = jsonb_build_object('fr', v.label),
    description_i18n = jsonb_build_object('fr', 'Racine technique — ' || v.label)
FROM (VALUES
  ('taxonomy_act', 'Activité encadrée'),
  ('taxonomy_asc', 'Activité'),
  ('taxonomy_camp', 'Camping'),
  ('taxonomy_com', 'Commerce'),
  ('taxonomy_fma', 'Fête / manifestation'),
  ('taxonomy_hlo', 'Gîte & meublé'),
  ('taxonomy_hot', 'Hôtel'),
  ('taxonomy_hpa', 'Hôtellerie de plein air'),
  ('taxonomy_iti', 'Itinéraire'),
  ('taxonomy_loi', 'Loisir'),
  ('taxonomy_org', 'Organisation'),
  ('taxonomy_pcu', 'Patrimoine'),
  ('taxonomy_pna', 'Site naturel'),
  ('taxonomy_prd', 'Producteur'),
  ('taxonomy_psv', 'Prestataire'),
  ('taxonomy_res', 'Restaurant'),
  ('taxonomy_rva', 'Résidence de vacances'),
  ('taxonomy_spu', 'Service public'),
  ('taxonomy_vil', 'Ville')
) AS v(domain, label)
WHERE r.domain = v.domain
  AND r.code = 'root'
  AND (r.name IS DISTINCT FROM v.label
       OR r.name_i18n IS DISTINCT FROM jsonb_build_object('fr', v.label)
       OR r.description_i18n IS DISTINCT FROM jsonb_build_object('fr', 'Racine technique — ' || v.label));

-- Refresh the Explorer facet cache for taxonomy_loi (untag changed cached ancestors).
SELECT api.refresh_object_taxonomy_cache_for_domain('taxonomy_loi');

COMMIT;
