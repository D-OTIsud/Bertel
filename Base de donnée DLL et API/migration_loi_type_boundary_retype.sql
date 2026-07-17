-- =============================================================================
-- migration_loi_type_boundary_retype.sql — §187 lot B : frontières de type LOI (2026-07-17)
-- Manifest step 13h. Idempotent — re-run = no-op. Après seeds + 13f + 13g.
-- 18 fiches typées LOI sont en réalité des prestations encadrées (11 → ACT),
-- des producteurs (5 → PRD, règle d'arbitrage §57) ou des loueurs/transporteurs
-- (2 → PSV). Audit : docs/taxonomy-audit-all-domains-2026-07-17.md (§B).
-- ORDRE FORCÉ par validate_object_taxonomy_assignment (13d precedent) :
-- delete anciens liens → retype → re-insert, dans UNE transaction.
-- Les ids gardent leur préfixe LOIRUN (classe cosmétique documentée §186).
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Nouveau nœud ACT `guided_tour` (7 porteurs immédiats : guides/accompagnateurs)
-- ---------------------------------------------------------------------------
WITH act_root AS (
  SELECT id FROM ref_code WHERE domain = 'taxonomy_act' AND code = 'root'
)
INSERT INTO ref_code (domain, code, name, description, position, parent_id, is_assignable, metadata, name_i18n, description_i18n)
SELECT 'taxonomy_act', 'guided_tour',
       'Visite guidée / accompagnement touristique',
       'Guides, accompagnateurs et visites guidées (hors randonnée montagne)',
       20, act_root.id, TRUE,
       jsonb_build_object('source', 'loi_type_boundary_20260717'),
       jsonb_build_object('fr', 'Visite guidée / accompagnement touristique', 'en', 'Guided tour'),
       jsonb_build_object('fr', 'Guides, accompagnateurs et visites guidées (hors randonnée montagne)')
FROM act_root
ON CONFLICT (domain, code) DO UPDATE
SET name = EXCLUDED.name, description = EXCLUDED.description, position = EXCLUDED.position,
    parent_id = EXCLUDED.parent_id, is_assignable = TRUE,
    name_i18n = COALESCE(ref_code.name_i18n, '{}'::jsonb) || COALESCE(EXCLUDED.name_i18n, '{}'::jsonb),
    description_i18n = COALESCE(ref_code.description_i18n, '{}'::jsonb) || COALESCE(EXCLUDED.description_i18n, '{}'::jsonb);

SELECT api.refresh_ref_code_taxonomy_closure('taxonomy_act');

-- ---------------------------------------------------------------------------
-- 2. Mapping des retypes
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _retype (
  object_id  text PRIMARY KEY,
  new_type   text NOT NULL,
  new_domain text NOT NULL,
  new_code   text NOT NULL
) ON COMMIT DROP;

INSERT INTO _retype (object_id, new_type, new_domain, new_code) VALUES
  -- LOI → ACT (prestations encadrées, règle §57)
  ('LOIRUN00000001AQ','ACT','taxonomy_act','guided_hiking'), -- AGENCE AVENTURE LA REUNION (accompagnateur ARGAT)
  ('LOIRUN0000000191','ACT','taxonomy_act','guided_hiking'), -- Rando Péizaj 974 (accompagnateur moyenne montagne)
  ('LOIRUN00000001AH','ACT','taxonomy_act','caving'),        -- Ricaric (tunnels de lave)
  ('LOIRUN000000019U','ACT','taxonomy_act','guided_tour'),   -- Découvertes en Terres Signées
  ('LOIRUN0000000198','ACT','taxonomy_act','guided_tour'),   -- Ti Karé Dan Péi
  ('LOIRUN000000017M','ACT','taxonomy_act','guided_tour'),   -- Alexandre DIJOUX - Guide Conférencier
  ('LOIRUN00000000YC','ACT','taxonomy_act','guided_tour'),   -- Enis Rockel
  ('LOIRUN0000000177','ACT','taxonomy_act','guided_tour'),   -- Insel Tours
  ('LOIRUN00000000S6','ACT','taxonomy_act','guided_tour'),   -- Naturev
  ('LOIRUN000000017I','ACT','taxonomy_act','guided_tour'),   -- Dalon La Kour
  ('LOIRUN000000015J','ACT','taxonomy_act','guided_tour'),   -- Au Coeur de La Réunion
  -- LOI → PRD (production + accueil, règle §57)
  ('LOIRUN00000000U5','PRD','taxonomy_prd','produits_terroir'),      -- Papilles des Hauts
  ('LOIRUN00000000VE','PRD','taxonomy_prd','produits_terroir'),      -- Maison du Curcuma
  ('LOIRUN000000010R','PRD','taxonomy_prd','plantation'),            -- Escale Bleue - Atelier Vanille
  ('LOIRUN000000019G','PRD','taxonomy_prd','exploitation_agricole'), -- Entre Fleurs et Plantes
  ('LOIRUN00000001AZ','PRD','taxonomy_prd','exploitation_agricole'), -- Ti Kaz Épices
  -- LOI → PSV (location / transport)
  ('LOIRUN000000019P','PSV','taxonomy_psv','cycle_scooter_rental'),  -- RODBIKELOC
  ('LOIRUN00000001A0','PSV','taxonomy_psv','vtc');                   -- Au temps pour vous

-- Idempotence : retirer du mapping les objets absents (fresh) ou déjà migrés.
DELETE FROM _retype m WHERE NOT EXISTS (SELECT 1 FROM object o WHERE o.id = m.object_id);
DELETE FROM _retype m USING object o WHERE o.id = m.object_id AND o.object_type::text = m.new_type;

-- Garde fail-closed : ce qui reste DOIT être typé LOI (sinon l'audit est périmé).
DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(m.object_id || '(' || o.object_type || ')', ', ') INTO v
  FROM _retype m JOIN object o ON o.id = m.object_id
  WHERE o.object_type::text <> 'LOI';
  IF v IS NOT NULL THEN
    RAISE EXCEPTION 'lot B: objets ni LOI ni déjà migrés: %', v;
  END IF;

  SELECT string_agg(DISTINCT m.new_domain || '/' || m.new_code, ', ') INTO v
  FROM _retype m
  LEFT JOIN ref_code rc ON rc.domain = m.new_domain AND rc.code = m.new_code
  WHERE rc.id IS NULL;
  IF v IS NOT NULL THEN
    RAISE EXCEPTION 'lot B: codes cibles inconnus: %', v;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Ordre 13d : delete liens → retype → re-insert
-- ---------------------------------------------------------------------------
DELETE FROM object_taxonomy ot
USING _retype m
WHERE ot.object_id = m.object_id AND ot.domain = 'taxonomy_loi';

UPDATE object o
SET object_type = m.new_type::object_type, updated_at = NOW()
FROM _retype m
WHERE o.id = m.object_id;

INSERT INTO object_taxonomy (object_id, domain, ref_code_id, source, note)
SELECT m.object_id, m.new_domain, rc.id,
       'loi_type_boundary_20260717',
       'Retype §187 lot B — frontière de type (règle §57)'
FROM _retype m
JOIN ref_code rc ON rc.domain = m.new_domain AND rc.code = m.new_code
ON CONFLICT (object_id, domain) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Caches par objet retypé
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_id text;
BEGIN
  FOR v_id IN SELECT object_id FROM _retype
  LOOP
    PERFORM api.refresh_object_filter_caches(v_id);
  END LOOP;
END $$;

COMMIT;

-- Sur live, exécuter ensuite (hors transaction) :
--   REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_filtered_objects;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_ref_data_json;
