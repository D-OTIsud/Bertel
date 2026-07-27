-- =====================================================================
-- migration_classification_scheme_applicability.sql
-- Manifest 16n — Applicabilité des distinctions par type d'objet
-- Audit filtres 2026-07-27 §3.2 ; signalement PO : « il est un peu ridicule
-- de proposer les classements hôtelier/camping et autres distinctions
-- d'hébergement quand il n'y a que la catégorie Visite de sélectionnée ».
-- =====================================================================
--
-- PROBLÈME
-- `ref_classification_scheme` ne portait AUCUNE applicabilité par type
-- d'objet. Trois surfaces listaient donc les 33 schemes `is_distinction`
-- quel que soit le contexte :
--   - filtre Explorer « Distinctions » (le signalement) ;
--   - sélecteur de l'éditeur §08 (même liste sur une fiche PNA que sur un hôtel) ;
--   - toute future surface de saisie / complétude.
--
-- MODÈLE
-- Jumeau exact de `ref_capacity_applicability` (metric_id, object_type), qui
-- résout le même problème pour les métriques de capacité, et cousin de
-- `ref_facet_applicability` (invariant CLAUDE.md « Type→facet applicability —
-- single registry »). Une seule source de vérité, consommée par le front ET
-- disponible pour un futur garde-fou serveur.
--
-- INVARIANT — L'ABSENCE DE LIGNE VAUT « APPLICABLE PARTOUT » (fail-open).
-- Un scheme sans aucune ligne d'applicabilité reste proposé sur tous les types.
-- C'est délibéré et c'est le point le plus important de ce fichier : la
-- restriction est un ACTE POSITIF de saisie. Un scheme ajouté demain sans seed
-- d'applicabilité doit rester visible (annoyance mineure) plutôt que disparaître
-- silencieusement de toutes les surfaces (bug invisible, classe §3.1 du même
-- audit). Les consommateurs DOIVENT implémenter ce défaut.
--
-- SEED = RÈGLE MÉTIER ∪ PLANCHER DE DONNÉES.
-- Le mapping ci-dessous est la lecture métier du périmètre de chaque
-- distinction. Il est ensuite UNIONNÉ avec la réalité : tout couple
-- (scheme, type) déjà porté par une ligne `object_classification` est ajouté
-- d'office. Une erreur d'appréciation de ma part ne peut donc pas rendre
-- infiltrable une fiche déjà labellisée. Un assert final le vérifie.
--
-- En cas de doute, le seed est LARGE : sur-inclure coûte une ligne de trop
-- dans une liste déroulante, sous-inclure masque un filtre légitime.
--
-- Idempotent : ON CONFLICT DO NOTHING + DELETE ciblé des couples retirés.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Table
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ref_classification_scheme_applicability (
  scheme_id   UUID NOT NULL REFERENCES ref_classification_scheme(id) ON DELETE CASCADE,
  object_type object_type NOT NULL,
  PRIMARY KEY (scheme_id, object_type)
);

COMMENT ON TABLE ref_classification_scheme_applicability IS
  'Types d''objet auxquels une distinction s''applique. AUCUNE ligne pour un scheme = applicable à TOUS les types (fail-open, cf. migration_classification_scheme_applicability.sql).';

-- Fan-out lecture : « quels schemes pour ce type ? » (chargement des références).
CREATE INDEX IF NOT EXISTS idx_ref_classification_scheme_applicability_type
  ON ref_classification_scheme_applicability (object_type);

-- ---------------------------------------------------------------------
-- 2) RLS — paire maison des ref_* (lecture publique, écriture admin)
-- ---------------------------------------------------------------------
ALTER TABLE ref_classification_scheme_applicability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture publique des applicabilités de distinction"
  ON ref_classification_scheme_applicability;
CREATE POLICY "Lecture publique des applicabilités de distinction"
  ON ref_classification_scheme_applicability
  FOR SELECT USING (true);

-- §39 — auth.role() wrappé en (select …) : un seul InitPlan par requête.
DROP POLICY IF EXISTS "Écriture admin des applicabilités de distinction"
  ON ref_classification_scheme_applicability;
CREATE POLICY "Écriture admin des applicabilités de distinction"
  ON ref_classification_scheme_applicability
  FOR ALL
  USING ((select auth.role()) = 'service_role')
  WITH CHECK ((select auth.role()) = 'service_role');

-- ---------------------------------------------------------------------
-- 3) Seed
-- ---------------------------------------------------------------------
-- Types : RES PCU PNA ORG ITI VIL HPA ASC COM HOT HLO LOI FMA CAMP PSV RVA ACT SPU PRD
-- Buckets Explorer : HOT={HOT,HLO,HPA,CAMP,RVA} RES={RES} ACT={ACT,ASC}
--                    VIS={PCU,PNA,LOI,VIL} SRV={PSV,SPU,COM,PRD} ITI={ITI} EVT={FMA}
WITH mapping(scheme_code, object_types) AS (
  VALUES
    -- ---- Classements officiels de l'État (Atout France) : strictement type-bornés.
    ('hot_stars',                    ARRAY['HOT']),
    ('camp_stars',                   ARRAY['CAMP','HPA']),
    ('meuble_stars',                 ARRAY['HLO']),
    ('residence_tourisme_stars',     ARRAY['RVA']),
    ('village_vacances_stars',       ARRAY['RVA']),
    -- Auberge collective = hébergement collectif (branche `hebergement_collectif` §190,
    -- portée par HLO) ; les villages/résidences en relèvent aussi.
    ('auberge_collective_stars',     ARRAY['HLO','RVA']),
    ('prl_stars',                    ARRAY['HPA','CAMP']),
    -- Classement d'office de tourisme : porté par l'ORG, parfois modélisé en service public.
    ('ot_category',                  ARRAY['ORG','SPU']),

    -- ---- Labels notés de réseau (§176 `graded_label`).
    ('gites_epics',                  ARRAY['HLO','CAMP','HPA']),
    ('clevacances_keys',             ARRAY['HLO']),
    ('logis',                        ARRAY['HOT','RES']),   -- Logis = hôtel-restaurant

    -- ---- Accessibilité : transverse à tout établissement recevant du public.
    -- Volontairement large (tout sauf ORG) : T&H labellise hébergements,
    -- restaurants, sites de visite, lieux de loisir, activités, OT…
    ('LBL_TOURISME_HANDICAP',        ARRAY['HOT','HLO','HPA','CAMP','RVA','RES','ACT','ASC',
                                           'LOI','PCU','PNA','VIL','SPU','COM','PRD','PSV','ITI','FMA']),

    -- ---- Labels qualité.
    ('qualite_tourisme_reunion',     ARRAY['HOT','HLO','HPA','CAMP','RVA','RES','ACT','ASC',
                                           'LOI','PCU','PNA','PRD','PSV','COM']),
    ('LBL_QUALITE_TOURISME',         ARRAY['HOT','HLO','HPA','CAMP','RVA','RES','ACT','ASC',
                                           'LOI','PCU','PNA','PRD','PSV','COM','ORG','SPU']),
    ('maitre_restaurateur',          ARRAY['RES']),
    ('tables_auberges',              ARRAY['RES','HOT']),
    ('esprit_parc',                  ARRAY['HOT','HLO','HPA','CAMP','RVA','RES','ACT','ASC','LOI','PRD']),
    ('cte',                          ARRAY['ACT','ASC']),
    ('bienvenue_ferme',              ARRAY['HLO','RES','ACT','ASC','PRD','LOI']),
    ('accueil_paysan',               ARRAY['HLO','RES','ACT','ASC','PRD']),
    ('accueil_velo',                 ARRAY['HOT','HLO','HPA','CAMP','RVA','RES','ACT','ASC',
                                           'LOI','PCU','PNA','SPU','COM','ORG']),
    -- Patrimoine : labels d'État sur le bâti / les jardins.
    ('monument_historique',          ARRAY['PCU']),
    ('musee_de_france',              ARRAY['PCU']),
    ('maison_des_illustres',         ARRAY['PCU']),
    ('jardin_remarquable',           ARRAY['PCU','PNA']),

    -- ---- Durabilité.
    -- Écolabel européen : intitulé « hébergement touristique » ; RES conservé
    -- (des fiches RES le portent déjà — le plancher de données l'imposerait de toute façon).
    ('LBL_ECO_LABEL_UE',             ARRAY['HOT','HLO','HPA','CAMP','RVA','RES']),
    ('LBL_CLEF_VERTE',               ARRAY['HOT','HLO','HPA','CAMP','RVA','RES','LOI']),
    ('LBL_ATR',                      ARRAY['PSV','ACT','ASC','ORG']),
    ('LBL_PAVILLON_BLEU',            ARRAY['PNA','SPU','VIL','LOI']),
    ('LBL_LABEL_BAS_CARBONE',        ARRAY['PRD','PNA','PSV','ACT','ASC']),
    -- Labels de DESTINATION : ils qualifient un territoire ou son opérateur,
    -- jamais un établissement.
    ('LBL_DESTINATION_EXCELLENCE',   ARRAY['VIL','ORG','SPU']),
    ('LBL_FLOCON_VERT',              ARRAY['VIL','ORG','SPU']),
    ('LBL_GREEN_DESTINATIONS',       ARRAY['VIL','ORG','SPU'])
),
business AS (
  SELECT s.id AS scheme_id, t::object_type AS object_type
  FROM mapping m
  JOIN ref_classification_scheme s ON s.code = m.scheme_code
  CROSS JOIN LATERAL unnest(m.object_types) AS t
),
-- PLANCHER DE DONNÉES : tout couple déjà porté en base est applicable, quoi que
-- dise le mapping ci-dessus. Tous statuts d'objet et de classification confondus
-- (un brouillon ou un label expiré reste une preuve d'usage légitime).
observed AS (
  SELECT DISTINCT oc.scheme_id, o.object_type
  FROM object_classification oc
  JOIN object o ON o.id = oc.object_id
  JOIN ref_classification_scheme s ON s.id = oc.scheme_id
  WHERE s.is_distinction IS TRUE
),
final AS (
  SELECT scheme_id, object_type FROM business
  UNION
  SELECT scheme_id, object_type FROM observed
),
-- Retire les couples qui ne sont plus ni métier ni observés (re-run après
-- correction du mapping), en NE TOUCHANT QU'AUX schemes que ce seed pilote.
removed AS (
  DELETE FROM ref_classification_scheme_applicability a
  WHERE a.scheme_id IN (SELECT scheme_id FROM final)
    AND NOT EXISTS (
      SELECT 1 FROM final f
      WHERE f.scheme_id = a.scheme_id AND f.object_type = a.object_type
    )
  RETURNING 1
)
INSERT INTO ref_classification_scheme_applicability (scheme_id, object_type)
SELECT scheme_id, object_type FROM final
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 4) Asserts
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_missing INTEGER;
  v_unseeded TEXT;
BEGIN
  -- (a) Aucune fiche déjà labellisée ne peut devenir infiltrable.
  SELECT COUNT(*) INTO v_missing
  FROM (
    SELECT DISTINCT oc.scheme_id, o.object_type
    FROM object_classification oc
    JOIN object o ON o.id = oc.object_id
    JOIN ref_classification_scheme s ON s.id = oc.scheme_id
    WHERE s.is_distinction IS TRUE
  ) obs
  WHERE NOT EXISTS (
    SELECT 1 FROM ref_classification_scheme_applicability a
    WHERE a.scheme_id = obs.scheme_id AND a.object_type = obs.object_type
  );

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'Applicabilité incomplète : % couple(s) (scheme, type) existent en données mais pas dans le registre', v_missing;
  END IF;

  -- (b) Information, pas une erreur : un scheme sans ligne reste applicable
  -- partout (fail-open). On le NOMME pour que l'oubli soit visible au déploiement.
  SELECT string_agg(s.code, ', ' ORDER BY s.code) INTO v_unseeded
  FROM ref_classification_scheme s
  WHERE s.is_distinction IS TRUE
    AND NOT EXISTS (
      SELECT 1 FROM ref_classification_scheme_applicability a WHERE a.scheme_id = s.id
    );

  IF v_unseeded IS NOT NULL THEN
    RAISE NOTICE 'Distinctions sans applicabilité (proposées sur TOUS les types) : %', v_unseeded;
  END IF;
END $$;

COMMIT;
