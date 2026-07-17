-- =============================================================================
-- migration_act_taxonomy_recategorization.sql — §186 recatégorisation ACT (2026-07-17)
-- Manifest step 13f. Idempotent (upserts + gardes) — re-run = no-op.
-- Live-applied 2026-07-17 (MCP migration act_taxonomy_recategorization).
-- =============================================================================
-- POURQUOI. L'enrichissement d'import old_data_enrichment_20260512 a posé les
-- sous-catégories taxonomy_act en masse par heuristique défaillante : 25 des 52
-- objets ACT publiés portaient un code contredit par leur nom/description (des
-- instituts de massage en « Équitation », l'opérateur tunnels-de-lave LAVE'NTURE
-- en « Plongée sous-marine », des excursions 4x4/buggy/Segway en « Randonnée
-- guidée »/« VTT guidé »…), 3 n'avaient aucune sous-catégorie, et le catalogue
-- (12 codes projetés du scheme type_act par seeds_data.sql) ne couvrait pas les
-- métiers réels du corpus : bien-être/massage (~11 fiches), excursion motorisée
-- (4), spéléo/tunnels de lave (3), pêche (2), sortie en mer (1), ateliers (2).
-- Audit fiche par fiche : décision log §186 +
-- docs/act-taxonomy-recategorization-2026-07-17.md.
--
-- CONTRAINTE. uq_object_taxonomy_object_domain = UNIQUE (object_id, domain)
-- ⇒ UNE sous-catégorie par objet et par domaine : le code retenu est le métier
-- DOMINANT de la fiche (pas de multi-tag possible).
--
-- Fresh build : la partie catalogue (1) crée les 7 nœuds (aussi convergés par
-- migration_taxonomy_trees_seed.sql, étendu dans la même passe) ; la partie
-- données (2-3) no-op tant que les objets ACT ne sont pas importés.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Catalogue — 7 nouveaux nœuds assignables (positions 13-19),
--    « Autre activité encadrée » repoussé en fin de liste (99).
-- ---------------------------------------------------------------------------
WITH act_root AS (
  SELECT id FROM ref_code WHERE domain = 'taxonomy_act' AND code = 'root'
),
nodes(code, name, name_en, description, position) AS (VALUES
  ('wellness_massage',    'Massage / Bien-être',            'Massage / Wellness',      'Massages, soins du corps, spa, yoga, réflexologie', 13),
  ('nature_discovery',    'Découverte nature & terroir',    'Nature & farm discovery', 'Visites guidées de fermes et d''exploitations, sorties nature, sensibilisation à l''environnement, sylvothérapie', 14),
  ('motorized_excursion', 'Excursion motorisée',            'Motorized excursion',     'Excursions guidées en 4x4, buggy, Segway, quad', 15),
  ('caving',              'Spéléologie / Tunnels de lave',  'Caving / lava tubes',     'Visites guidées de tunnels de lave, spéléologie encadrée', 16),
  ('fishing',             'Pêche de loisir',                'Recreational fishing',    'Pêche de loisir encadrée (parc de pêche, fédération)', 17),
  ('boat_excursion',      'Sortie en mer / Croisière',      'Boat trip / cruise',      'Sorties en mer, croisières côtières, observation', 18),
  ('craft_workshop',      'Atelier créatif / artisanal',    'Craft workshop',          'Ateliers artisanaux ouverts au public (poterie, céramique…)', 19)
)
INSERT INTO ref_code (domain, code, name, description, position, parent_id, is_assignable, metadata, name_i18n, description_i18n)
SELECT
  'taxonomy_act', n.code, n.name, n.description, n.position, act_root.id, TRUE,
  jsonb_build_object('source', 'act_taxonomy_recat_20260717'),
  jsonb_build_object('fr', n.name, 'en', n.name_en),
  jsonb_build_object('fr', n.description)
FROM nodes n
CROSS JOIN act_root
ON CONFLICT (domain, code) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  position = EXCLUDED.position,
  parent_id = EXCLUDED.parent_id,
  is_assignable = TRUE,
  name_i18n = COALESCE(ref_code.name_i18n, '{}'::jsonb) || COALESCE(EXCLUDED.name_i18n, '{}'::jsonb),
  description_i18n = COALESCE(ref_code.description_i18n, '{}'::jsonb) || COALESCE(EXCLUDED.description_i18n, '{}'::jsonb);

UPDATE ref_code
SET position = 99
WHERE domain = 'taxonomy_act' AND code = 'other_guided_activity' AND position <> 99;

-- Le trigger trg_refresh_ref_code_taxonomy_closure maintient déjà la closure ;
-- rappel explicite = ceinture idempotente (même forme que seeds_data.sql).
SELECT api.refresh_ref_code_taxonomy_closure('taxonomy_act');

-- ---------------------------------------------------------------------------
-- 2. Données — mapping de correction fiche par fiche (30 UPDATE + 3 INSERT).
--    Ancienne valeur documentée en commentaire ; « (aucune) » = fiche sans
--    sous-catégorie avant la passe.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _act_recat (object_id text PRIMARY KEY, new_code text NOT NULL) ON COMMIT DROP;
INSERT INTO _act_recat (object_id, new_code) VALUES
  -- Bien-être / massage (l'essentiel du dégât : équitation/rando/fitness → massage)
  ('ACTRUN00000000ON', 'wellness_massage'),     -- Une Escale enchantée — masseur Janzu           (était fitness_wellness)
  ('ACTRUN00000000U2', 'wellness_massage'),     -- L'ANNESSENCE DIVINE — réflexologie             (était guided_hiking)
  ('ACTRUN00000000U7', 'wellness_massage'),     -- Humanity Spirituality Malika — massages        (était fitness_wellness)
  ('ACTRUN00000000UU', 'wellness_massage'),     -- Natur'aissance — massages                      (était horse_riding)
  ('ACTRUN00000000VG', 'wellness_massage'),     -- Au Cocon D'Adéli — bien-être                   (était horse_riding)
  ('ACTRUN000000014X', 'wellness_massage'),     -- Janma — yoga, massages ayurvédiques            (était guided_hiking)
  ('ACTRUN0000000154', 'wellness_massage'),     -- Dimitile Hôtel - Espace Bien-Être — spa        (était guided_hiking)
  ('ACTRUN0000000185', 'wellness_massage'),     -- Kolibriz — espace bien-être                    (était guided_hiking)
  ('ACTRUN0000000187', 'wellness_massage'),     -- Emi Yogam — yoga, massage                      (était fitness_wellness)
  ('ACTRUN000000018N', 'wellness_massage'),     -- Dans Les Mains d'Emy — massage                 (était fitness_wellness)
  ('ACTRUN000000019B', 'wellness_massage'),     -- Sozen Massage                                  (était guided_hiking)
  ('ACTRUN00000001B0', 'wellness_massage'),     -- Virginie MOUSSA - Thérapie Manuelle            (aucune)
  ('ORGRUN00000000Z9', 'wellness_massage'),     -- Destination Bien Être — massages (typé ACT)    (était fitness_wellness)
  -- Découverte nature & terroir
  ('ACTRUN00000000OP', 'nature_discovery'),     -- La Ferme Péi — biodiversité, sensibilisation   (était guided_hiking)
  ('ACTRUN0000000165', 'nature_discovery'),     -- Change-écorce — découverte sensorielle forêt   (était guided_mountain_biking)
  ('ACTRUN000000019J', 'nature_discovery'),     -- Lebreton France May — visite d'exploitation    (était fitness_wellness)
  -- Excursion motorisée
  ('ACTRUN000000019K', 'motorized_excursion'),  -- Mobilboard — Segway                            (était guided_mountain_biking)
  ('ACTRUN00000001A7', 'motorized_excursion'),  -- Kréolie 4x4                                    (était guided_hiking)
  ('ACTRUN00000001AK', 'motorized_excursion'),  -- Bugg's Buggy 974                               (était guided_mountain_biking)
  ('ACTRUN00000001AN', 'motorized_excursion'),  -- Z'ile 4x4                                      (était guided_hiking)
  -- Spéléologie / tunnels de lave
  ('ACTRUN000000019X', 'caving'),               -- LAVE'NTURE — tunnelsdelave.net                 (était scuba_diving)
  ('ACTRUN00000001AB', 'caving'),               -- Kokapat Rando — tunnels de lave                (était horse_riding)
  ('ACTRUN00000001AO', 'caving'),               -- Spéléolave — spéléo tunnels de lave            (était guided_hiking)
  -- Pêche de loisir
  ('ACTRUN00000001AG', 'fishing'),              -- Parc Piscicole de Langevin — pêche truite      (était guided_hiking)
  ('ACTRUN00000001AS', 'fishing'),              -- Village Pêche Nature — fédération pêche        (était guided_hiking)
  -- Sortie en mer
  ('ACTRUN00000000RV', 'boat_excursion'),       -- Croisières Australes — catamaran moteur        (était kayaking_paddleboarding)
  -- Ateliers artisanaux
  ('ACTRUN000000019N', 'craft_workshop'),       -- Terre et feu créations — poterie               (était other_guided_activity)
  ('ACTRUN000000019O', 'craft_workshop'),       -- Mira Céramik Art — céramique                   (était other_guided_activity)
  -- Reclassements intra-catalogue existant
  ('ACTRUN000000019V', 'other_guided_activity'),-- Paintball de Saint-Joseph                      (était guided_hiking)
  ('ACTRUN000000019Y', 'kayaking_paddleboarding'), -- Aquasens — kayak de mer, paddle             (était canyoning)
  ('ACTRUN00000001A3', 'guided_hiking'),        -- A'RaNd'O — « sorties randonnées, VTTAE »       (était guided_mountain_biking)
  ('ACTRUN00000001B2', 'guided_hiking'),        -- Kozman La Montagn — guide montagne             (aucune)
  ('ACTRUN00000001B7', 'guided_hiking');        -- Rando des Z'Iles — randonnées guidées          (aucune)

-- Garde fail-closed : un objet visé PRÉSENT doit être typé ACT, et chaque code
-- cible doit exister. Un objet ABSENT ne lève pas (base fraîche sans les données
-- d'import : les UPDATE/INSERT ci-dessous no-opent naturellement — 13d precedent).
DO $$
DECLARE v_missing text;
BEGIN
  SELECT string_agg(m.object_id, ', ') INTO v_missing
  FROM _act_recat m
  JOIN object o ON o.id = m.object_id
  WHERE o.object_type <> 'ACT';
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'act_taxonomy_recat: objets non-ACT: %', v_missing;
  END IF;

  SELECT string_agg(DISTINCT m.new_code, ', ') INTO v_missing
  FROM _act_recat m
  LEFT JOIN ref_code rc ON rc.domain = 'taxonomy_act' AND rc.code = m.new_code
  WHERE rc.id IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'act_taxonomy_recat: codes taxonomy_act inconnus: %', v_missing;
  END IF;
END $$;

-- 2a. Correction des assignations existantes (préserve id/created_at ; no-op si déjà correcte).
UPDATE object_taxonomy ot
SET ref_code_id = rc.id,
    source = 'act_taxonomy_recat_20260717',
    note = 'Recatégorisation §186 — correction de old_data_enrichment_20260512',
    updated_at = NOW()
FROM _act_recat m
JOIN ref_code rc ON rc.domain = 'taxonomy_act' AND rc.code = m.new_code
WHERE ot.object_id = m.object_id
  AND ot.domain = 'taxonomy_act'
  AND ot.ref_code_id <> rc.id;

-- 2b. Les fiches sans sous-catégorie reçoivent la leur (idempotent via UNIQUE (object_id, domain)).
INSERT INTO object_taxonomy (object_id, domain, ref_code_id, source, note)
SELECT m.object_id, 'taxonomy_act', rc.id,
       'act_taxonomy_recat_20260717',
       'Recatégorisation §186 — fiche sans sous-catégorie avant la passe'
FROM _act_recat m
JOIN ref_code rc ON rc.domain = 'taxonomy_act' AND rc.code = m.new_code
WHERE NOT EXISTS (
  SELECT 1 FROM object_taxonomy ot
  WHERE ot.object_id = m.object_id AND ot.domain = 'taxonomy_act'
)
ON CONFLICT (object_id, domain) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Caches de filtre par objet touché (13b/13d precedent).
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_id text;
BEGIN
  FOR v_id IN SELECT object_id FROM _act_recat
  LOOP
    PERFORM api.refresh_object_filter_caches(v_id);
  END LOOP;
END $$;

COMMIT;

-- Sur live, rafraîchir ensuite (hors transaction) :
--   REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_filtered_objects;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_ref_data_json;
