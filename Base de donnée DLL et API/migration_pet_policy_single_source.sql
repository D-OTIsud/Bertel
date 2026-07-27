-- =====================================================================
-- migration_pet_policy_single_source.sql  (manifest step pets1)
-- §196 — « Animaux acceptés » : une seule source de vérité.
--
-- SYMPTÔME : le filtre Explorer « Animaux acceptés » ne remonte jamais rien.
--
-- CAUSE RACINE (deux couches) :
--  1. MODÈLE — le concept existait DEUX FOIS : la table dédiée `object_pet_policy`
--     (lue par le filtre, cf. api_views_functions.sql, prédicat `pet_accepted`) ET
--     l'équipement `ref_amenity.pet_friendly` « Animaux acceptés » (famille `pets`),
--     offert dans le sélecteur d'équipements de l'éditeur — lequel n'écarte que la
--     famille `accessibility` (filterEstablishmentAmenityGroups). Cocher l'équipement
--     n'avait donc AUCUN effet sur le filtre. Violation de « une seule source de
--     vérité par concept » (CLAUDE.md).
--  2. DONNÉE — l'import berta_v2_csv_export a rangé le signal positif dans
--     l'équipement (4 fiches) et n'a écrit `object_pet_policy` que pour 2 refus.
--     Le CSV Berta n'avait aucune colonne « animaux » : l'information vit en texte
--     libre dans les descriptions.
--
-- CE QUE FAIT CETTE MIGRATION :
--  1. Backfill `object_pet_policy` depuis tout `object_amenity[pet_friendly]` (règle
--     générique — couvre les 4 fiches connues et toute ligne ajoutée entre-temps).
--  2. Backfill depuis la revue MANUELLE des descriptions publiées (28 fiches classées
--     une par une, verbatim conservé en `conditions` quand la formulation est
--     conditionnelle). Les cas ambigus sont volontairement EXCLUS — voir le bloc
--     « NON TRAITÉS » plus bas : ils relèvent d'un arbitrage OTI, on n'invente pas.
--  3. Supprime les lignes `object_amenity[pet_friendly]` (le trigger
--     trg_refresh_object_filter_caches_object_amenity rafraîchit les caches).
--  4. Retire `pet_friendly` de `ref_amenity` ⇒ le sélecteur d'équipements ne l'offre
--     plus, sans une ligne de code front. `pet_bed` / `pet_bowls` (panier, gamelles)
--     RESTENT : ce sont de vrais équipements, pas la politique d'accueil.
--     `acc_guide_dog_welcome` (chien guide, famille accessibility) n'est pas touché :
--     concept réglementaire distinct de la politique animaux.
--
-- Idempotente, auto-assertive, fresh-safe (les fiches ciblées n'existent pas sur une
-- base neuve : les backfills sont des INSERT…SELECT joints sur `object`).
-- Réversible : réintroduire la ligne `pet_friendly` dans seeds_data.sql. Les lignes
-- `object_pet_policy` créées ici sont, elles, la donnée qu'on voulait — pas un artefact.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Backfill depuis l'équipement (règle générique)
-- ---------------------------------------------------------------------
INSERT INTO public.object_pet_policy (object_id, accepted)
SELECT oa.object_id, true
FROM public.object_amenity oa
JOIN public.ref_amenity ra ON ra.id = oa.amenity_id
WHERE ra.code = 'pet_friendly'
ON CONFLICT (object_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Backfill depuis la revue manuelle des descriptions publiées
--    (33 fiches mentionnaient les animaux ; 28 classées sans équivoque)
--
--    NON TRAITÉS — arbitrage OTI requis, aucune écriture :
--      HLORUN00000000S7  LES HIBISCUS       « Si animal de compagnie, à voir avec le propriétaire »
--      HLORUN00000000RE  Meublé des Neiges  « Caution pour animaux (à voir avec le propriétaire) »
--      HLORUN00000000ZA  Vanille & Goyavier « Réception selon le type d'animal (à voir avec le prestataire) »
--    HORS SUJET — la mention ne porte pas sur la politique d'accueil :
--      HLORUN00000000XN  Lannmariah         « animaux de la ferme » (décor du musée)
--      HLORUN00000000UN  Ti'Kratèr          animaux DES HÔTES (chien Evie, chats Olaf et Luna)
-- ---------------------------------------------------------------------
INSERT INTO public.object_pet_policy (object_id, accepted, conditions)
SELECT v.object_id, v.accepted, v.conditions
FROM (VALUES
  -- ACCEPTÉS -----------------------------------------------------------
  ('CAMRUN00000000PH', true,  NULL),                                                            -- L'Eden du Randonneur (camping)
  ('HLORUN00000000WU', true,  NULL),                                                            -- Case Bel Air
  ('HLORUN0000000169', true,  'Accepté si l''animal est sociable.'),                            -- Douceur du Sud
  ('HLORUN00000000YF', true,  NULL),                                                            -- La Ferme des Pitayas
  ('HLORUN00000000QU', true,  NULL),                                                            -- La Tomie
  ('HLORUN00000000W8', true,  'Accepté en fonction de la taille de l''animal.'),                -- Le Beaucarnea
  ('HLORUN000000012S', true,  NULL),                                                            -- Le Rougail Mangue
  ('HLORUN000000019A', true,  'Acceptés dans le jardin et sur la terrasse, mais pas à l''intérieur du chalet.'), -- Ô Chalet
  ('HLORUN000000016A', true,  NULL),                                                            -- Villa Baril Sucré
  ('ORGRUN00000000VL', true,  'Acceptés à bord à condition de disposer d''une cage de transport.'), -- VTC POININ COULIN
  ('LOIRUN000000015J', true,  'Acceptés sous conditions : animal calme, tenu en laisse, surveillé par son propriétaire. Le guide se réserve le droit de refuser l''animal avant le départ.'), -- Au Coeur de La Réunion
  -- REFUSÉS ------------------------------------------------------------
  ('CAMRUN000000013J', false, 'Chiens interdits, même en laisse.'),                             -- Le Verger de la Chapelle
  ('HLORUN000000015X', false, NULL),                                                            -- Domaine du KM Zéro
  ('HLORUN00000000VA', false, NULL),                                                            -- Ferme Lebon Papillon
  ('HLORUN0000000113', false, NULL),                                                            -- Gîte de la Rivière des Remparts
  ('HLORUN00000000PT', false, NULL),                                                            -- Jardins De Lé Ô
  ('HLORUN00000000NS', false, NULL),                                                            -- Ka Hema
  ('HLORUN00000000SD', false, NULL),                                                            -- LA CASE BOUISSEAU
  ('HLORUN00000000SO', false, NULL),                                                            -- La Villa JoLi
  ('HLORUN00000000NR', false, NULL),                                                            -- Le Cyprès
  ('HLORUN0000000151', false, NULL),                                                            -- Le Zirondelle
  ('HLORUN00000000RT', false, NULL),                                                            -- Les Chalets à l'Orée du Bois - Le grand chalet
  ('HLORUN00000000R7', false, NULL),                                                            -- Rev'Horizon
  ('HLORUN000000015F', false, NULL),                                                            -- Ti Caz Désir
  ('HLORUN0000000171', false, NULL),                                                            -- Ti Kaz Fond D'or
  ('HLORUN000000010M', false, NULL),                                                            -- Villa Isis
  ('HLORUN00000000TZ', false, NULL),                                                            -- Villa Letchi
  ('HLORUN00000000SX', false, NULL)                                                             -- Villa Ti Kaz Do Miel
) AS v(object_id, accepted, conditions)
JOIN public.object o ON o.id = v.object_id
ON CONFLICT (object_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 3. Retrait de l'équipement doublon (données puis catalogue)
-- ---------------------------------------------------------------------
DELETE FROM public.object_amenity oa
USING public.ref_amenity ra
WHERE ra.id = oa.amenity_id AND ra.code = 'pet_friendly';

DELETE FROM public.ref_amenity WHERE code = 'pet_friendly';

-- ---------------------------------------------------------------------
-- 4. Assertions (fail-closed)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_ref     int;
  v_kept    int;
  v_orphans int;
BEGIN
  SELECT count(*) INTO v_ref FROM public.ref_amenity WHERE code = 'pet_friendly';
  IF v_ref <> 0 THEN
    RAISE EXCEPTION 'pets1: ref_amenity.pet_friendly subsiste (% ligne(s)) — le doublon de saisie n''est pas retiré', v_ref;
  END IF;

  -- Les vrais équipements animaliers doivent survivre (on ne supprime pas la famille).
  SELECT count(*) INTO v_kept FROM public.ref_amenity WHERE code IN ('pet_bed', 'pet_bowls');
  IF v_kept <> 2 THEN
    RAISE EXCEPTION 'pets1: pet_bed/pet_bowls attendus (2), trouvés % — suppression trop large', v_kept;
  END IF;

  -- Aucune fiche ne doit rester avec le signal « animaux » uniquement dans les équipements.
  SELECT count(*) INTO v_orphans
  FROM public.object_amenity oa
  JOIN public.ref_amenity ra ON ra.id = oa.amenity_id
  WHERE ra.code = 'pet_friendly';
  IF v_orphans <> 0 THEN
    RAISE EXCEPTION 'pets1: % ligne(s) object_amenity[pet_friendly] résiduelle(s)', v_orphans;
  END IF;
END $$;

COMMIT;
