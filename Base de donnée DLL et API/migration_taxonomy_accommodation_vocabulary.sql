-- =============================================================================
-- migration_taxonomy_accommodation_vocabulary.sql
-- §192 — Lot 1 : vocabulaire canonique de l'hébergement (DATAtourisme + Code du
--        tourisme), axes déclarés, alias Berta. AUCUNE fiche déplacée.
-- Manifest : taxo4 (après taxo3 `migration_taxonomy_camp_hpa_homestay.sql`)
-- =============================================================================
--
-- POURQUOI
--   Bertel mélangeait plusieurs notions sous « Type d'hébergement » / « Sous-
--   catégorie » : nature réglementaire, sous-type, type d'unité et positionnement
--   commercial cohabitaient dans le même arbre, à des profondeurs différentes
--   selon le domaine. Arbitrage PO 2026-07-27 :
--
--     Un axe = une signification = un filtre distinct.
--     La profondeur technique de l'arbre n'est JAMAIS montrée à l'utilisateur.
--
--   Référentiel canonique = DATAtourisme + Code du tourisme. Berta devient un
--   vocabulaire SOURCE et un jeu d'ALIAS — jamais un libellé officiel.
--   Cadrage complet : `docs/taxonomy-hebergement-vocabulaire-canonique-2026-07-27.md`.
--
-- PORTÉE — 0 ligne `object_taxonomy` touchée, 0 fiche déplacée.
--   1. Référentiel `accommodation_family` (4 codes) — porte les libellés de famille.
--   2. 3 renommages de libellés (les `code` sont inchangés ⇒ neutre partenaires).
--   3. Définitions normatives (alimentent les infobulles du filtre).
--   4. `metadata` : axis / famille / aliases / source_ref sur les nœuds hébergement.
--   5. Désactivation du référentiel orphelin `accommodation_type`.
--   6. Nettoyage des descriptions du registry (le terme « sous-catégorie » est retiré).
--
-- DÉPENDANCE DURE (garde §0 ci-dessous)
--   Retirer « / gîte » du libellé de `location_saisonniere` retire le token `git`
--   du `doc_b` de ses 376 porteurs (`api.refresh_object_filter_caches` agrège
--   `anc.name` sur les ancêtres assignables). Mesuré live : « gite » remonte 415
--   fiches HLO publiées aujourd'hui. Le renommage SANS la version alias-aware de
--   la fonction est donc une RÉGRESSION de recherche pour les utilisateurs Berta.
--   ⇒ Appliquer d'abord `api.refresh_object_filter_caches` depuis
--     `schema_unified.sql` (bloc doc_b, §192). La garde §0 échoue sinon.
--
-- NON COUVERT ICI (lots suivants)
--   L2 — interface : blocs sémantiques, infobulles, recherche par alias, bandeau
--        de correspondance, « Sous-catégorie » → « Nature d'hébergement ».
--   L3 — structure : extraction de l'axe « type d'unité » (multi-valué), fusion
--        maison/cdh_maison + bungalow/cdh_bungalow, sortie des positionnements
--        hôteliers, service « Table d'hôtes », nœud PRL.
--
-- DÉCISIONS VERROUILLÉES le 2026-07-27 (arbitrage PO)
--   - §150 AMENDÉE (pas annulée) : dans l'Explorer, les entrées vides sont
--     masquées pour les axes SOUS-TYPE et TYPE D'UNITÉ uniquement. Les NATURES et
--     les FAMILLES restent toujours visibles, même à 0 porteur. L'éditeur, lui,
--     continue d'exposer tout le modèle (sinon aucune fiche ne peut naître sur un
--     nœud neuf). Mise en œuvre en L2 ; consigné ici car c'est la règle d'axe.
--   - `TYPE_LABEL.CAMP` reste « Camping classé » : ce n'est pas un doublon du
--     filtre Classement, c'est le DISCRIMINANT de type entre CAMP et HPA sur
--     lequel repose toute la §191. Le nœud de nature s'appelle « Camping ».
--
-- IDEMPOTENT et re-jouable. NO-OP sur une base fraîche pour les UPDATE gardés.
-- APRÈS COMMIT (hors transaction) : refresh des caches des porteurs des nœuds
--   renommés + les 2 MV. Voir bas de fichier.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Garde fail-closed : la fonction de cache doit être alias-aware AVANT le
--    renommage, sinon on dégrade la recherche des 376 porteurs.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'api' AND p.proname = 'refresh_object_filter_caches'
       AND pg_get_functiondef(p.oid) LIKE '%aliases%'
  ) THEN
    RAISE EXCEPTION
      '§192: api.refresh_object_filter_caches n''est pas alias-aware. Appliquer d''abord le bloc doc_b de schema_unified.sql, sinon le renommage de location_saisonniere retire « gîte » de la recherche sur 376 fiches.';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1. Référentiel `accommodation_family` — 4 familles ontologiques
--    Volontairement HORS `ref_code_domain_registry` : ce n'est pas une taxonomie
--    assignable à un objet, mais un axe de regroupement DÉRIVÉ. La famille d'un
--    objet se lit sur `metadata->>'famille'` de son nœud de nature (§3), ce qui
--    règle le fait que HLO chevauche deux familles et que RVA relève de
--    « collectif » — sans toucher aux `object_type`.
-- -----------------------------------------------------------------------------
INSERT INTO ref_code (domain, code, name, description, position, is_assignable,
                      name_i18n, description_i18n, metadata)
VALUES
  ('accommodation_family', 'hotellerie', 'Hôtellerie',
   'Établissements hôteliers : hôtels et hôtels-restaurants.', 1, FALSE,
   '{"fr":"Hôtellerie"}'::jsonb,
   '{"fr":"Établissements hôteliers : hôtels et hôtels-restaurants."}'::jsonb,
   '{"axis":"famille","source":"taxonomy_vocabulaire_20260727"}'::jsonb),
  ('accommodation_family', 'locatif', 'Hébergement locatif',
   'Hébergement non hôtelier loué à une clientèle de passage : chambres d''hôtes et meublés de tourisme.', 2, FALSE,
   '{"fr":"Hébergement locatif"}'::jsonb,
   '{"fr":"Hébergement non hôtelier loué à une clientèle de passage : chambres d''hôtes et meublés de tourisme."}'::jsonb,
   '{"axis":"famille","source":"taxonomy_vocabulaire_20260727"}'::jsonb),
  ('accommodation_family', 'collectif', 'Hébergement collectif',
   'Hébergement orienté vers l''accueil de groupes : auberge collective, gîte de groupe, refuge et gîte d''étape, résidence de tourisme. Sens DATAtourisme — NE PAS confondre avec « hébergement collectif touristique » au sens Insee, qui englobe hôtels et campings.', 3, FALSE,
   '{"fr":"Hébergement collectif"}'::jsonb,
   '{"fr":"Hébergement orienté vers l''accueil de groupes. Sens DATAtourisme, plus restrictif que la définition Insee."}'::jsonb,
   '{"axis":"famille","source":"taxonomy_vocabulaire_20260727"}'::jsonb),
  ('accommodation_family', 'plein_air', 'Hôtellerie de plein air',
   'Terrains et aires d''accueil de plein air : campings classés ou non, camping à la ferme, aires naturelles, aires camping-car.', 4, FALSE,
   '{"fr":"Hôtellerie de plein air"}'::jsonb,
   '{"fr":"Terrains et aires d''accueil de plein air, classés ou non."}'::jsonb,
   '{"axis":"famille","source":"taxonomy_vocabulaire_20260727"}'::jsonb)
ON CONFLICT (domain, code) DO UPDATE
  SET name = EXCLUDED.name, description = EXCLUDED.description,
      position = EXCLUDED.position, is_assignable = EXCLUDED.is_assignable,
      name_i18n = EXCLUDED.name_i18n, description_i18n = EXCLUDED.description_i18n,
      metadata = EXCLUDED.metadata;

-- -----------------------------------------------------------------------------
-- 2. Renommages — les `code` ne bougent pas ⇒ `ref_interop_crosswalk` intact.
--    Motifs :
--      hotel                : faute typographique (accent manquant).
--      location_saisonniere : « gîte » est une appellation commerciale, pas une
--                             catégorie réglementaire autonome (DGCCRF).
--      tourism_residence    : « classée » relève du filtre Classement, pas de
--                             l'identité de la nature.
-- -----------------------------------------------------------------------------
UPDATE ref_code SET name = 'Hôtel',
       name_i18n = COALESCE(name_i18n, '{}'::jsonb) || '{"fr":"Hôtel"}'::jsonb
 WHERE domain = 'taxonomy_hot' AND code = 'hotel' AND name IS DISTINCT FROM 'Hôtel';

UPDATE ref_code SET name = 'Meublé de tourisme',
       name_i18n = COALESCE(name_i18n, '{}'::jsonb) || '{"fr":"Meublé de tourisme"}'::jsonb
 WHERE domain = 'taxonomy_hlo' AND code = 'location_saisonniere'
   AND name IS DISTINCT FROM 'Meublé de tourisme';

UPDATE ref_code SET name = 'Résidence de tourisme',
       name_i18n = COALESCE(name_i18n, '{}'::jsonb) || '{"fr":"Résidence de tourisme"}'::jsonb
 WHERE domain = 'taxonomy_rva' AND code = 'tourism_residence'
   AND name IS DISTINCT FROM 'Résidence de tourisme';

-- -----------------------------------------------------------------------------
-- 3. Axes, famille, alias, source normative.
--    `axis` ∈ famille | nature | sous_type | type_unite | positionnement.
--    `famille` n'est posée QUE sur les nœuds de nature et de sous-type : c'est
--    elle qui permet au filtre de regrouper sans lire la profondeur de l'arbre.
--    `aliases` est un tableau jsonb consommé par le doc_b de
--    `api.refresh_object_filter_caches` (§0) ET par la recherche de chips (L2).
--
--    ⚠️ `source_ref` cite des articles du Code du tourisme. Ces citations
--    alimentent des infobulles utilisateur : les faire relire par le PO / le
--    juridique avant mise en production de L2.
-- -----------------------------------------------------------------------------
WITH v(domain, code, axis, famille, aliases, source_ref, descr) AS (
  VALUES
    -- Familles portées dans l'arbre HLO (les autres domaines n'en ont pas de nœud)
    ('taxonomy_hlo','hebergement_locatif','famille','locatif','[]',NULL,
     'Hébergement non hôtelier loué à une clientèle de passage.'),
    ('taxonomy_hlo','hebergement_collectif','famille','collectif','["Gîte d''étape et de randonnée"]',
     'DATAtourisme:GroupLodging',
     'Hébergement orienté vers l''accueil de groupes (sens DATAtourisme, plus restrictif que l''Insee). Regroupait chez Berta la catégorie « Gîte d''étape et de randonnée ».'),

    -- Natures
    ('taxonomy_hot','hotel','nature','hotellerie','[]','Code du tourisme art. D311-4',
     'Établissement commercial d''hébergement qui offre des chambres ou des appartements meublés en location à une clientèle de passage.'),
    ('taxonomy_hlo','chambre_d_hotes','nature','locatif','["Chambre d''hôte"]',
     'Code du tourisme art. D324-13 · DATAtourisme:Guesthouse',
     'Chambre meublée située chez l''habitant, louée à la nuitée avec petit-déjeuner, l''accueil étant assuré par l''habitant.'),
    ('taxonomy_hlo','location_saisonniere','nature','locatif','["Location saisonnière","Gîte","Gîte rural","Meublé"]',
     'Code du tourisme art. D324-1 · DATAtourisme:SelfCateringAccommodation',
     'Villa, appartement ou studio meublé, à l''usage exclusif du locataire, offert en location à une clientèle de passage qui n''y élit pas domicile. Anciennement « Location saisonnière » chez Berta ; « gîte » est une appellation commerciale, pas une catégorie réglementaire (DGCCRF).'),
    ('taxonomy_camp','camping','nature','plein_air','["Camping"]',NULL,
     'Terrain aménagé pour l''accueil de tentes, caravanes ou résidences mobiles de loisirs. Le niveau de classement se filtre séparément.'),
    ('taxonomy_hpa','natural_camp_area','nature','plein_air','[]',NULL,
     'Aire naturelle de camping, hors classement de terrain aménagé.'),
    ('taxonomy_hpa','farm_camping','nature','plein_air','[]','DATAtourisme:FarmCamping',
     'Camping situé sur une exploitation agricole en activité.'),
    ('taxonomy_hpa','outdoor_glamping','nature','plein_air','[]',NULL,
     'Hébergement insolite de plein air : bulles, tipis, lodges toilés, cabanes.'),
    ('taxonomy_hpa','motorhome_area','nature','plein_air','[]',NULL,
     'Aire de stationnement et de nuitée pour camping-cars.'),
    ('taxonomy_hpa','homestay_camping','nature','plein_air','["Camping chez l''habitant"]',NULL,
     'Emplacements de camping chez un particulier, hors classement officiel. Appellation locale : à requalifier au cas par cas en camping à la ferme (si exploitation agricole) ou en aire naturelle — arbitrage L3.'),
    ('taxonomy_rva','tourism_residence','nature','collectif','[]','Code du tourisme art. D321-1',
     'Établissement commercial d''hébergement constitué d''un ensemble homogène de locaux meublés, doté de services. Le niveau de classement se filtre séparément.'),
    ('taxonomy_rva','holiday_village','nature','collectif','[]','DATAtourisme:HolidayVillage',
     'Village de vacances : ensemble d''hébergements avec services et animations collectives.'),
    ('taxonomy_rva','aparthotel','nature','collectif','["Apparthôtel"]',NULL,
     'Résidence hôtelière : logements équipés loués avec services para-hôteliers.'),

    -- Sous-types
    ('taxonomy_hot','hotel_with_restaurant','sous_type','hotellerie','[]','DATAtourisme:HotelRestaurant',
     'Hôtel disposant d''un restaurant ouvert à la clientèle.'),
    ('taxonomy_hlo','gite_de_randonnee','sous_type','collectif','["Gîte de randonnée","Gîte d''étape"]',
     'DATAtourisme:StopOverOrGroupLodge',
     'Hébergement collectif situé sur un itinéraire de randonnée, accueillant les marcheurs à l''étape.'),
    ('taxonomy_hlo','gite_de_groupe','sous_type','collectif','["Gîte de groupe"]','DATAtourisme:GroupLodging',
     'Hébergement collectif destiné à l''accueil de groupes constitués.'),
    ('taxonomy_hlo','auberge_collective','sous_type','collectif','[]',NULL,
     'Auberge à vocation d''hébergement collectif.'),
    -- `gite_rural` reste dans l''arbre en L1 : sa retraite en alias de
    -- `location_saisonniere` demande de déplacer ses 4 porteurs ⇒ L3.
    ('taxonomy_hlo','gite_rural','sous_type','locatif','["Gîte rural"]',NULL,
     'Appellation commerciale d''un meublé de tourisme en milieu rural. Candidat à la fusion dans « Meublé de tourisme » — arbitrage L3.'),

    -- Types d'unité (restent dans l'arbre en L1 ; extraits en L3)
    ('taxonomy_hlo','maison','type_unite','locatif','["Gîte & Villa","Maison","Villa","Rez de chaussée d''une maison"]',NULL,
     'Logement individuel entier : maison ou villa.'),
    ('taxonomy_hlo','appartement','type_unite','locatif','["Appartement"]',NULL,'Logement en immeuble collectif.'),
    ('taxonomy_hlo','studio','type_unite','locatif','["Studio"]',NULL,'Logement d''une pièce principale.'),
    ('taxonomy_hlo','chalet','type_unite','locatif','["Bungalow & Chalet","Chalet"]',NULL,'Construction en bois de type chalet.'),
    ('taxonomy_hlo','bungalow','type_unite','locatif','["Bungalow & Chalet","Bungalow"]',NULL,'Bungalow ou mobil-home.'),
    ('taxonomy_hlo','roulotte','type_unite','locatif','["Roulotte"]',NULL,'Roulotte aménagée.'),
    ('taxonomy_hlo','bulle','type_unite','locatif','["bulle"]',NULL,'Bulle transparente d''hébergement insolite.'),
    ('taxonomy_hlo','lodges','type_unite','locatif','["Lodges"]',NULL,'Lodge.'),
    ('taxonomy_hlo','hebergement_insolite','type_unite','locatif','["Hébergement Insolite"]',NULL,
     'Hébergement insolite non couvert par une forme plus précise.'),
    ('taxonomy_hlo','cdh_maison','type_unite','locatif','["Maison"]',NULL,
     'Maison exploitée en chambre d''hôtes. Doublon structurel de `maison` dû au parent unique — fusionné en L3.'),
    ('taxonomy_hlo','cdh_bungalow','type_unite','locatif','["Bungalow & Chalet"]',NULL,
     'Bungalow exploité en chambre d''hôtes. Doublon structurel de `bungalow` — fusionné en L3.'),

    -- Positionnements : 0 porteur, sortis de l'axe nature (rendus sous
    -- « Positionnement » en L2). Ce n'est PAS un masquage sur données (§150) :
    -- le motif est un axe erroné, pas une absence de fiches.
    ('taxonomy_hot','boutique_hotel','positionnement','hotellerie','[]',NULL,'Positionnement boutique.'),
    ('taxonomy_hot','business_hotel','positionnement','hotellerie','[]',NULL,'Positionnement affaires.'),
    ('taxonomy_hot','eco_hotel','positionnement','hotellerie','[]',NULL,'Positionnement écologique.'),
    ('taxonomy_hot','family_hotel','positionnement','hotellerie','[]',NULL,'Positionnement familial.'),
    ('taxonomy_hot','heritage_hotel','positionnement','hotellerie','[]',NULL,'Positionnement patrimonial.'),
    ('taxonomy_hot','modern_hotel','positionnement','hotellerie','[]',NULL,'Positionnement contemporain.'),
    ('taxonomy_hot','romantic_hotel','positionnement','hotellerie','[]',NULL,'Positionnement romantique.'),
    ('taxonomy_hot','traditional_hotel','positionnement','hotellerie','[]',NULL,'Positionnement traditionnel.')
)
UPDATE ref_code rc
   SET metadata = COALESCE(rc.metadata, '{}'::jsonb)
                  - 'level'                       -- marqueur d'import périmé (§190)
                  || jsonb_strip_nulls(jsonb_build_object(
                       'axis',       v.axis,
                       'famille',    v.famille,
                       'aliases',    v.aliases::jsonb,
                       'source_ref', v.source_ref,
                       'source',     'taxonomy_vocabulaire_20260727')),
       description = v.descr,
       description_i18n = COALESCE(rc.description_i18n, '{}'::jsonb)
                          || jsonb_build_object('fr', v.descr)
  FROM v
 WHERE rc.domain = v.domain AND rc.code = v.code;

-- -----------------------------------------------------------------------------
-- 4. Désactivation du référentiel orphelin `accommodation_type`.
--    10 codes, 0 usage live, absent du registry, et il mélange trois axes
--    (nature : hotel/camping ; positionnement : boutique/luxury/resort ;
--    type d'unité : villa/apartment). À désactiver, jamais à recycler.
--    Garde : on ne désactive que s'il n'a effectivement aucun porteur.
-- -----------------------------------------------------------------------------
UPDATE ref_code rc
   SET is_active = FALSE, is_assignable = FALSE,
       metadata = COALESCE(rc.metadata, '{}'::jsonb)
                  || '{"retired":"taxonomy_vocabulaire_20260727","reason":"referentiel orphelin, 3 axes melanges, 0 usage"}'::jsonb
 WHERE rc.domain = 'accommodation_type'
   AND rc.is_active
   AND NOT EXISTS (SELECT 1 FROM object_taxonomy ot WHERE ot.ref_code_id = rc.id);

-- -----------------------------------------------------------------------------
-- 5. Registry : le terme « sous-catégorie » est retiré du vocabulaire.
-- -----------------------------------------------------------------------------
UPDATE ref_code_domain_registry SET
  name = CASE domain
           WHEN 'taxonomy_hot'  THEN 'Nature d''hébergement — hôtellerie'
           WHEN 'taxonomy_hlo'  THEN 'Nature d''hébergement — locatif et collectif'
           WHEN 'taxonomy_hpa'  THEN 'Nature d''hébergement — plein air'
           WHEN 'taxonomy_camp' THEN 'Nature d''hébergement — camping classé'
           WHEN 'taxonomy_rva'  THEN 'Nature d''hébergement — résidences'
         END,
  description = 'Natures et sous-types d''hébergement. Axe déclaré par ref_code.metadata->>''axis''.'
 WHERE domain IN ('taxonomy_hot','taxonomy_hlo','taxonomy_hpa','taxonomy_camp','taxonomy_rva');

-- -----------------------------------------------------------------------------
-- 6. Asserts fail-closed
-- -----------------------------------------------------------------------------
DO $$
DECLARE v_n INT;
BEGIN
  -- 6a. Les 4 familles existent.
  SELECT count(*) INTO v_n FROM ref_code WHERE domain = 'accommodation_family';
  IF v_n <> 4 THEN
    RAISE EXCEPTION '§192: accommodation_family attendu 4 codes, trouvé %', v_n;
  END IF;

  -- 6b. Les 3 renommages sont posés.
  IF NOT EXISTS (SELECT 1 FROM ref_code WHERE domain='taxonomy_hot' AND code='hotel' AND name='Hôtel')
     OR NOT EXISTS (SELECT 1 FROM ref_code WHERE domain='taxonomy_hlo' AND code='location_saisonniere' AND name='Meublé de tourisme')
     OR NOT EXISTS (SELECT 1 FROM ref_code WHERE domain='taxonomy_rva' AND code='tourism_residence' AND name='Résidence de tourisme') THEN
    RAISE EXCEPTION '§192: un des 3 renommages canoniques n''est pas appliqué';
  END IF;

  -- 6c. Plus aucun nœud hébergement ACTIF sans axe déclaré.
  SELECT count(*) INTO v_n
    FROM ref_code
   WHERE domain IN ('taxonomy_hlo','taxonomy_hot','taxonomy_camp','taxonomy_hpa','taxonomy_rva')
     AND is_active AND parent_id IS NOT NULL
     AND metadata->>'axis' IS NULL;
  IF v_n > 0 THEN
    RAISE EXCEPTION '§192: % nœud(s) hébergement actif(s) sans metadata.axis', v_n;
  END IF;

  -- 6d. Le marqueur d'import périmé a disparu du périmètre hébergement.
  SELECT count(*) INTO v_n
    FROM ref_code
   WHERE domain IN ('taxonomy_hlo','taxonomy_hot','taxonomy_camp','taxonomy_hpa','taxonomy_rva')
     AND is_active AND metadata ? 'level';
  IF v_n > 0 THEN
    RAISE EXCEPTION '§192: % nœud(s) portent encore le marqueur d''import perime « level »', v_n;
  END IF;

  -- 6e. Toute nature ou sous-type porte une famille (sinon le filtre L2 ne peut
  --     pas regrouper sans lire la profondeur — c'est l'invariant du lot).
  SELECT count(*) INTO v_n
    FROM ref_code
   WHERE domain IN ('taxonomy_hlo','taxonomy_hot','taxonomy_camp','taxonomy_hpa','taxonomy_rva')
     AND is_active AND metadata->>'axis' IN ('nature','sous_type')
     AND metadata->>'famille' IS NULL;
  IF v_n > 0 THEN
    RAISE EXCEPTION '§192: % nature(s)/sous-type(s) sans metadata.famille', v_n;
  END IF;

  -- 6f. Aucun objet ne pointe sur le référentiel retiré.
  SELECT count(*) INTO v_n
    FROM object_taxonomy ot JOIN ref_code rc ON rc.id = ot.ref_code_id
   WHERE rc.domain = 'accommodation_type';
  IF v_n > 0 THEN
    RAISE EXCEPTION '§192: % objet(s) pointent sur accommodation_type — ne pas desactiver', v_n;
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- APRÈS COMMIT — obligatoire, à exécuter séparément.
-- Les 3 renommages changent le `doc_b` de TOUS les descendants des nœuds
-- renommés (le doc_b agrège les libellés d'ancêtres). Aucun trigger ne couvre un
-- renommage de `ref_code` : seul `object_taxonomy` déclenche le refresh.
-- Périmètre mesuré le 2026-07-27 : 8 porteurs sous `hotel`, 376 sous
-- `location_saisonniere`, 0 sous `tourism_residence` = 384 fiches.
--
--   SELECT api.refresh_object_filter_caches(o.id)
--     FROM object o
--     JOIN object_taxonomy ot ON ot.object_id = o.id
--     JOIN ref_code_taxonomy_closure cl
--       ON cl.domain = ot.domain AND cl.descendant_id = ot.ref_code_id
--     JOIN ref_code anc ON anc.id = cl.ancestor_id AND anc.domain = cl.domain
--    WHERE (anc.domain, anc.code) IN
--          (('taxonomy_hot','hotel'),
--           ('taxonomy_hlo','location_saisonniere'),
--           ('taxonomy_rva','tourism_residence'));
--
--   REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_filtered_objects;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_ref_data_json;
--   NOTIFY pgrst, 'reload schema';
--
-- VÉRIFICATION DE NON-RÉGRESSION (avant / après doivent être identiques) :
--   SELECT count(*) FROM object
--    WHERE object_type='HLO' AND status='published'
--      AND search_document @@ plainto_tsquery('french','gite');
--   -- attendu : 415 (mesuré le 2026-07-27 avant migration)
-- =============================================================================
