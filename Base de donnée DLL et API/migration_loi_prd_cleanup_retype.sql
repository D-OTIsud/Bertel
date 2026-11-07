-- =============================================================================
-- migration_loi_prd_cleanup_retype.sql — Assainissement LOI/RES → PRD/PCU/COM/SPU (§57)
-- Manifest step 13d (data fixup, APRÈS 8x + 8y ; no-op sur une base fraîche).
-- Idempotent : chaque étape ne touche que ce qui reste à migrer.
-- Live-applied 2026-06-11 (MCP migration loi_prd_cleanup_retype).
-- =============================================================================
-- POURQUOI. Application des verdicts de l'analyse typologique (§57,
-- docs/research/type-gap-analysis-2026-06-11.md) :
--   * producteurs éclatés entre 4 nœuds taxonomy_loi + taxonomy_res
--     « Distillerie - sucrerie » sans règle d'arbitrage → taxonomy_prd + type PRD ;
--   * doublon « Musée » LOI vs PCU (violation « une source de vérité ») →
--     taxonomy_pcu.museum + type PCU (inclut La Cité du Volcan) ;
--   * boutiques/souvenirs logés en LOI → taxonomy_com (souvenir_shop /
--     local_crafts) + type COM ;
--   * anomalie « Médiathèque » assignée au nœud LOI « Souvenirs » (!) →
--     taxonomy_spu.public_library + type SPU.
-- RÈGLE D'ARBITRAGE (§57, LOCKED) : production+accueil → PRD · repas → RES ·
-- revente seule → COM · prestation encadrée → ACT · accès libre non marchand → SPU.
--
-- ORDRE IMPOSÉ par trg_validate_object_taxonomy (le domaine d'une assignation
-- doit matcher le type COURANT de l'objet) : capturer → DELETE les anciens
-- liens → retyper l'objet → réinsérer sous le nouveau domaine. Un simple
-- UPDATE croisé de object_taxonomy est rejeté (23514) — appris au premier
-- apply live. Le tout dans UNE transaction (temp table ON COMMIT DROP).
-- État live au moment de l'apply : 43 assignations, aucune croisée, 0 ligne
-- facette sur les objets migrés (garde §46 OK). Résultat live vérifié :
-- PRD=34, PCU+2, COM+5, SPU+1, LOI 142→101, RES 137→136 ; anciens nœuds supprimés.
-- =============================================================================
BEGIN;

-- 1. Capture du mapping (1 assignation par objet — vérifié, aucune croisée)
CREATE TEMP TABLE _retype_map ON COMMIT DROP AS
SELECT ot.id AS ot_id, ot.object_id, ot.source, ot.note,
       m.new_domain, nc.id AS new_ref_code_id, m.new_type
FROM (VALUES
  ('taxonomy_loi','Agrotourisme','taxonomy_prd','agrotourisme','PRD'),
  ('taxonomy_loi','Plantation','taxonomy_prd','plantation','PRD'),
  ('taxonomy_loi','Exploitation agricole','taxonomy_prd','exploitation_agricole','PRD'),
  ('taxonomy_loi','Produits du terroir','taxonomy_prd','produits_terroir','PRD'),
  ('taxonomy_res','Distillerie - sucrerie','taxonomy_prd','distillerie_brasserie','PRD'),
  ('taxonomy_loi','Musée','taxonomy_pcu','museum','PCU'),
  ('taxonomy_loi','Boutique','taxonomy_com','local_crafts','COM'),
  ('taxonomy_loi','Souvenirs','taxonomy_com','souvenir_shop','COM')
) AS m(old_domain, old_name, new_domain, new_code, new_type)
JOIN ref_code oc ON oc.domain = m.old_domain AND oc.name = m.old_name
JOIN ref_code nc ON nc.domain = m.new_domain AND nc.code = m.new_code
JOIN object_taxonomy ot ON ot.ref_code_id = oc.id;

-- Exception ponctuelle : « Médiathèque » (mal assignée à « Souvenirs ») → SPU
UPDATE _retype_map rm
SET new_domain = 'taxonomy_spu',
    new_ref_code_id = (SELECT id FROM ref_code WHERE domain = 'taxonomy_spu' AND code = 'public_library'),
    new_type = 'SPU'
FROM object o WHERE o.id = rm.object_id AND o.name = 'Médiathèque';

-- 2. Suppression des anciennes assignations
DELETE FROM object_taxonomy WHERE id IN (SELECT ot_id FROM _retype_map);

-- 3. Retypage (plus aucune assignation mappée ; 0 ligne facette — garde §46 OK)
UPDATE object o SET object_type = rm.new_type::object_type
FROM (SELECT DISTINCT object_id, new_type FROM _retype_map) rm
WHERE o.id = rm.object_id AND o.object_type::text <> rm.new_type;

-- 4. Réinsertion sous le nouveau domaine (le type matche désormais)
INSERT INTO object_taxonomy (object_id, domain, ref_code_id, source, note)
SELECT object_id, new_domain, new_ref_code_id,
       coalesce(source, 'type_correction_20260611'), note
FROM _retype_map
ON CONFLICT DO NOTHING;

-- 5. Suppression des nœuds vidés (garde : plus aucune assignation ni enfant)
DELETE FROM ref_code c
WHERE ((c.domain = 'taxonomy_loi' AND c.name IN ('Agrotourisme','Plantation','Exploitation agricole','Produits du terroir','Musée','Boutique','Souvenirs'))
    OR (c.domain = 'taxonomy_res' AND c.name = 'Distillerie - sucrerie'))
  AND NOT EXISTS (SELECT 1 FROM object_taxonomy ot WHERE ot.ref_code_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM ref_code child WHERE child.parent_id = c.id);

-- 6. Rafraîchissement des caches de filtre des objets touchés
--    (object.cached_taxonomy_codes alimente mv_filtered_objects — précédent 13b).
--    Le refresh du MV lui-même : CONCURRENTLY côté exploitant ; le manifest
--    fresh-apply le fait en fin de parcours.
DO $$
DECLARE v_id text;
BEGIN
  FOR v_id IN SELECT DISTINCT object_id FROM _retype_map
  LOOP
    PERFORM api.refresh_object_filter_caches(v_id);
  END LOOP;
END $$;

COMMIT;
