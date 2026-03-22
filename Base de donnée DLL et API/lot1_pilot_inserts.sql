-- =============================================================================
-- lot1_pilot_inserts.sql
-- Lot 1 — pilote cross-type : 10 établissements (pilot_set: Lot1_cross_type)
-- Source     : Berta 2.0 - Berta 2.0 (1).csv + Berta 2.0 - Imported DATA Presta.csv
-- Généré le  : 2026-03-21  (régénéré : amenities · payments · meeting_room · environment_tags)
-- Filtre actif : En ligne = 'oui'  (colonne Status vide dans cet export)
-- Couverture : ACT×3 · RES×2 · HOT×1 · HLO×3 · LOI×1 · ITI×0
-- =============================================================================
--
-- PRÉREQUIS — fichiers à appliquer AVANT celui-ci :
--
--   1. schema_unified.sql
--      → object_type 'ACT' ajouté le 2026-03-21 (ALTER TYPE ... ADD VALUE IF NOT EXISTS 'ACT')
--
--   2. seeds_data.sql
--      → OTI du Sud (ORG, region_code='RUN') — lignes 942–947
--      → ref_org_role code='publisher'        — ligne 2198
--      → ref_code_contact_kind 'email','mobile','phone' — lignes 46-47,49
--      → ref_classification_scheme 'type_act' + valeurs — lignes 2421–2443
--      → ref_classification_scheme 'hot_stars','meuble_stars','gites_epics' + valeurs numériques
--      → ref_classification_scheme 'qualite_tourisme','qualite_tourisme_reunion' + valeur 'granted'
--      → ref_capacity_metric codes: 'max_capacity','seats' — lignes 2320–2333
--      → ref_actor_role code='operator' — ajouté 2026-03-21 (patch seeds §rôles complémentaires)
--      → 11 amenity_family codes manquants — ajoutés 2026-03-21 (patch seeds §ref_code)
--      → 12 nouveaux codes ref_amenity — ajoutés 2026-03-21 (sections amenity famille wellness/gastronomy etc.)
--      → ref_code_payment_method 'tickets_restaurant' — ajouté 2026-03-21
--      → environment_tag 'riviere' — ajouté 2026-03-21
--
-- HORS PÉRIMÈTRE DE CE FICHIER :
--   • object_price         — tarifs absents de cet export
--   • object_opening_period — horaires déférés (source non structurée)
--   • object_relation      — liens based_at_site/uses_itinerary (ACT) — lot ultérieur
--   • type_act Maison du Curcuma — 'visite_guidee' absent du schéma type_act
--   • LBL_ECO_LABEL_UE Dimitile Hôtel — valeur 'granted' absente des seeds
--   • tourisme_handicap Dimitile Hôtel — valeur exacte non discriminée dans la source
--   • Gîtes de France (Côté Volcan + Gîte Là-Haut) — schéma absent des seeds
--   • Certification clientèle indienne (La Cité du Volcan) — schéma absent des seeds
--
-- TABLES ÉCRITES :
--   object · object_location (+ direction) · object_origin · object_org_link
--   actor · actor_channel · actor_object_role
--   object_description · object_capacity · object_classification (type_act×2 + classement×4 + labels×6)
--   object_amenity (45 lignes) · object_payment_method (23 lignes)
--   object_meeting_room (1 ligne — Dimitile Hôtel) · object_environment_tag (7 lignes)
--
-- PATTERNS D'IDEMPOTENCE :
--   • object, actor_object_role, object_description : WHERE NOT EXISTS (...)
--   • object_location : WHERE NOT EXISTS (... is_main_location = TRUE)
--   • object_origin : ON CONFLICT (object_id) DO NOTHING
--   • object_org_link : ON CONFLICT (object_id, org_object_id, role_id) DO NOTHING
--   • actor_channel, object_classification, object_capacity : ON CONFLICT (...) DO NOTHING
--   • actor : WHERE NOT EXISTS (SELECT 1 FROM actor WHERE display_name = ...)
--   • object_amenity : ON CONFLICT (object_id, amenity_id) DO NOTHING
--   • object_payment_method : ON CONFLICT (object_id, payment_method_id) DO NOTHING
--   • object_meeting_room : WHERE NOT EXISTS (SELECT 1 FROM object_meeting_room WHERE object_id = ...)
--   • object_environment_tag : ON CONFLICT (object_id, environment_tag_id) DO NOTHING
-- =============================================================================


-- ---------------------------------------------------------------------------
-- SECTION 1 — OBJECTS (10 établissements)
-- ---------------------------------------------------------------------------

-- region_code = 'RUN'  (île de La Réunion, immuable)
-- status      = 'published'  (cohérent avec En ligne = 'oui' dans la source)
-- L'id est auto-généré par le trigger api.generate_object_id

-- 1.1  Canyon Aventure — ACT · Canyoning · Saint-Joseph / Langevin
--      source_id: recCSnhcZo4XxocjX
INSERT INTO object (object_type, name, region_code, status, created_at, updated_at)
SELECT 'ACT', 'Canyon Aventure', 'RUN', 'published', NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM object
  WHERE object_type = 'ACT' AND name = 'Canyon Aventure' AND region_code = 'RUN'
);

-- 1.2  Ascendance Parapente — ACT · Parapente · Entre-Deux
--      source_id: recdw4lpGQlrscCXF
INSERT INTO object (object_type, name, region_code, status, created_at, updated_at)
SELECT 'ACT', 'Ascendance Parapente', 'RUN', 'published', NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM object
  WHERE object_type = 'ACT' AND name = 'Ascendance Parapente' AND region_code = 'RUN'
);

-- 1.3  Maison du Curcuma — ACT · Visite guidée · Saint-Joseph
--      NOTE: type_act non assigné — 'visite_guidee' absent du schéma ; voir prérequis hors périmètre
--      source_id: recSSTvKv6Jh4BYzZ
INSERT INTO object (object_type, name, region_code, status, created_at, updated_at)
SELECT 'ACT', 'Maison du Curcuma', 'RUN', 'published', NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM object
  WHERE object_type = 'ACT' AND name = 'Maison du Curcuma' AND region_code = 'RUN'
);

-- 1.4  La Kaz — RES · Restaurant · Le Tampon / La Plaine des Cafres
--      cp 97418 = La Plaine des Cafres, commune = Le Tampon (correct d'après la source)
--      source_id: recN5bNxgghhfpEHE
INSERT INTO object (object_type, name, region_code, status, created_at, updated_at)
SELECT 'RES', 'La Kaz', 'RUN', 'published', NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM object
  WHERE object_type = 'RES' AND name = 'La Kaz' AND region_code = 'RUN'
);

-- 1.5  Le Gadjak — RES · Restaurant · Entre-Deux
--      source_id: rec7uNHsQPt5wZPCY
INSERT INTO object (object_type, name, region_code, status, created_at, updated_at)
SELECT 'RES', 'Le Gadjak', 'RUN', 'published', NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM object
  WHERE object_type = 'RES' AND name = 'Le Gadjak' AND region_code = 'RUN'
);

-- 1.6  Dimitile Hôtel — HOT · Hôtel · Entre-Deux / Bras Long
--      source_id: rec5vqdPwSdrFzsvs
INSERT INTO object (object_type, name, region_code, status, created_at, updated_at)
SELECT 'HOT', 'Dimitile Hôtel', 'RUN', 'published', NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM object
  WHERE object_type = 'HOT' AND name = 'Dimitile Hôtel' AND region_code = 'RUN'
);

-- 1.7  Domaine Paille en Queue - Sud Sauvage — HLO · Location saisonnière · Saint-Joseph
--      Nom canonique : « Domaine Paille en Queue - Sud Sauvage » — ne pas abréger
--      source_id: recr8fxU0od0bvvnh
INSERT INTO object (object_type, name, region_code, status, created_at, updated_at)
SELECT 'HLO', 'Domaine Paille en Queue - Sud Sauvage', 'RUN', 'published', NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM object
  WHERE object_type = 'HLO' AND name = 'Domaine Paille en Queue - Sud Sauvage' AND region_code = 'RUN'
);

-- 1.8  Côté Volcan — HLO · Chambre d'hôtes · Le Tampon / La Plaine des Cafres
--      source_id: recr1yhoYV0cSykCz
INSERT INTO object (object_type, name, region_code, status, created_at, updated_at)
SELECT 'HLO', 'Côté Volcan', 'RUN', 'published', NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM object
  WHERE object_type = 'HLO' AND name = 'Côté Volcan' AND region_code = 'RUN'
);

-- 1.9  Gîte Là-Haut — HLO · Gîte d'étape et de randonnée · Entre-Deux / Dimitile
--      source_id: d5c7c61d
INSERT INTO object (object_type, name, region_code, status, created_at, updated_at)
SELECT 'HLO', 'Gîte Là-Haut', 'RUN', 'published', NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM object
  WHERE object_type = 'HLO' AND name = 'Gîte Là-Haut' AND region_code = 'RUN'
);

-- 1.10  La Cité du Volcan — LOI · Musée / Patrimoine culturel · Le Tampon / La Plaine des Cafres
--      source_id: recmG8eVRN6kwvyRU
INSERT INTO object (object_type, name, region_code, status, created_at, updated_at)
SELECT 'LOI', 'La Cité du Volcan', 'RUN', 'published', NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM object
  WHERE object_type = 'LOI' AND name = 'La Cité du Volcan' AND region_code = 'RUN'
);


-- ---------------------------------------------------------------------------
-- SECTION 2 — OBJECT_LOCATION (adresse + GPS + direction)
-- ---------------------------------------------------------------------------

-- Toutes les valeurs GPS viennent du champ « Coordonnées GPS » de l'export.
-- direction : texte libre de « Descriptif du plan d'accès » — NULL si vide dans la source.

-- 1.1  Canyon Aventure
INSERT INTO object_location (object_id, address1, postcode, city, lieu_dit, latitude, longitude, direction, is_main_location, created_at, updated_at)
SELECT o.id,
       '194 Rue De La Passerelle',
       '97480', 'Saint-Joseph', 'Langevin',
       -21.36218100, 55.64763200,
       'Prendre la RN2, direction langevin, sur les berges, la personne de CA vous donnera rdv en fonction de l''état de la rivière',
       TRUE, NOW(), NOW()
FROM object o
WHERE o.object_type = 'ACT' AND o.name = 'Canyon Aventure' AND o.region_code = 'RUN'
  AND NOT EXISTS (SELECT 1 FROM object_location ol WHERE ol.object_id = o.id AND ol.is_main_location = TRUE);

-- 1.2  Ascendance Parapente
INSERT INTO object_location (object_id, address1, postcode, city, lieu_dit, latitude, longitude, direction, is_main_location, created_at, updated_at)
SELECT o.id,
       '45 Impasse des Kakis',
       '97414', 'Entre-Deux', NULL,
       -21.23182800, 55.47081900,
       'Sur la route des Tamarins, sortir en direction de la D12, sortie Colimaçons. Suivre la D12 en direction de la N1A, direction Saint-Leu. Arrivée au stop, rejoindre le parking au bord de l''océan en face de ce stop.',
       TRUE, NOW(), NOW()
FROM object o
WHERE o.object_type = 'ACT' AND o.name = 'Ascendance Parapente' AND o.region_code = 'RUN'
  AND NOT EXISTS (SELECT 1 FROM object_location ol WHERE ol.object_id = o.id AND ol.is_main_location = TRUE);

-- 1.3  Maison du Curcuma
INSERT INTO object_location (object_id, address1, postcode, city, lieu_dit, latitude, longitude, direction, is_main_location, created_at, updated_at)
SELECT o.id,
       '14 Rue du Rond',
       '97480', 'Saint-Joseph', 'La Plaine des Grègues',
       -21.32665000, 55.60780600,
       'Plaine des Grègues - chemin du rond au numéro 14',
       TRUE, NOW(), NOW()
FROM object o
WHERE o.object_type = 'ACT' AND o.name = 'Maison du Curcuma' AND o.region_code = 'RUN'
  AND NOT EXISTS (SELECT 1 FROM object_location ol WHERE ol.object_id = o.id AND ol.is_main_location = TRUE);

-- 1.4  La Kaz
INSERT INTO object_location (object_id, address1, postcode, city, lieu_dit, latitude, longitude, direction, is_main_location, created_at, updated_at)
SELECT o.id,
       '2 Rue Josemont Lauret',
       '97418', 'Le Tampon', 'La Plaine des Cafres',
       -21.20406600, 55.57798900,
       'Depuis le Sud, arrivé au Tampon, continuer sur la RN3 jusque la Plaine des Cafres, au rond-point de la Cité du Volcan, prendre à gauche et continuer tout droit pour arriver au restaurant.',
       TRUE, NOW(), NOW()
FROM object o
WHERE o.object_type = 'RES' AND o.name = 'La Kaz' AND o.region_code = 'RUN'
  AND NOT EXISTS (SELECT 1 FROM object_location ol WHERE ol.object_id = o.id AND ol.is_main_location = TRUE);

-- 1.5  Le Gadjak
INSERT INTO object_location (object_id, address1, postcode, city, lieu_dit, latitude, longitude, direction, is_main_location, created_at, updated_at)
SELECT o.id,
       '1 Rue Fortune Hoarau',
       '97414', 'Entre-Deux', NULL,
       -21.24917200, 55.47038900,
       'Centre ville de l''Entre-Deux, vieille case créole en bardeau avec des volets rouges, face à la mairie',
       TRUE, NOW(), NOW()
FROM object o
WHERE o.object_type = 'RES' AND o.name = 'Le Gadjak' AND o.region_code = 'RUN'
  AND NOT EXISTS (SELECT 1 FROM object_location ol WHERE ol.object_id = o.id AND ol.is_main_location = TRUE);

-- 1.6  Dimitile Hôtel
INSERT INTO object_location (object_id, address1, postcode, city, lieu_dit, latitude, longitude, direction, is_main_location, created_at, updated_at)
SELECT o.id,
       '30 Rue Bras Long',
       '97414', 'Entre-Deux', 'Bras Long',
       -21.24450867, 55.47037529,
       'Depuis l''aéroport de Roland Garros (Saint-Denis) : prendre la direction de Saint-Pierre par la Route des Tamarins. Arrivé à l''Etang-Salé, poursuivre sur la RN 1 jusqu''à la sortie Saint-Louis (c''est-à-dire après le pont qui enjambe la rivière Saint-Etienne). Cette sortie indique la Ravine des Cabris, l''Entre-Deux et Pierrefonds. Passer au-dessus de la 4 voies. Au rond-point, continuer tout droit sur le CD 26. Suivre les signalétiques. Compter environ une heure de route entre Saint-Denis et l''Entre-Deux.',
       TRUE, NOW(), NOW()
FROM object o
WHERE o.object_type = 'HOT' AND o.name = 'Dimitile Hôtel' AND o.region_code = 'RUN'
  AND NOT EXISTS (SELECT 1 FROM object_location ol WHERE ol.object_id = o.id AND ol.is_main_location = TRUE);

-- 1.7  Domaine Paille en Queue - Sud Sauvage
INSERT INTO object_location (object_id, address1, postcode, city, lieu_dit, latitude, longitude, direction, is_main_location, created_at, updated_at)
SELECT o.id,
       '16 Impasse Des Filaos',
       '97480', 'Saint-Joseph', NULL,
       -21.37251200, 55.62578000,
       'De l''entrée Ouest de Saint-Joseph, prendre le premier giratoire et prendre à gauche, continuer tout droit sur 1,5 km, puis tourner à droite au troisième giratoire et première à droite.',
       TRUE, NOW(), NOW()
FROM object o
WHERE o.object_type = 'HLO' AND o.name = 'Domaine Paille en Queue - Sud Sauvage' AND o.region_code = 'RUN'
  AND NOT EXISTS (SELECT 1 FROM object_location ol WHERE ol.object_id = o.id AND ol.is_main_location = TRUE);

-- 1.8  Côté Volcan
INSERT INTO object_location (object_id, address1, postcode, city, lieu_dit, latitude, longitude, direction, is_main_location, created_at, updated_at)
SELECT o.id,
       '8 Rue Josemont Lauret',
       '97418', 'Le Tampon', 'La Plaine des Cafres',
       -21.20385300, 55.57847700,
       'Depuis Saint-Pierre, au rond-point après la station de Bourg-Murat, prendre la première sortie.
Arrivée au restaurant La Kaz, prendre la rue Josemont Lauret située à gauche du restaurant. Côté Volcan est à environ 100 m sur la droite.',
       TRUE, NOW(), NOW()
FROM object o
WHERE o.object_type = 'HLO' AND o.name = 'Côté Volcan' AND o.region_code = 'RUN'
  AND NOT EXISTS (SELECT 1 FROM object_location ol WHERE ol.object_id = o.id AND ol.is_main_location = TRUE);

-- 1.9  Gîte Là-Haut
INSERT INTO object_location (object_id, address1, postcode, city, lieu_dit, latitude, longitude, direction, is_main_location, created_at, updated_at)
SELECT o.id,
       '5001 F Plateau du Dimitile',
       '97414', 'Entre-Deux', 'Dimitile',
       -21.19011200, 55.48211600,
       '3 façons possibles (voir leur site internet), la plus facile :
Depuis le Parking du Portail du Dimitile (après l''Entre-Deux), prendre le sentier Boeuf La Chapelle — 2h de montée.
Après 1h30, arriver à La Chapelle du Dimitile. Juste à gauche, le sentier Emile mène en 30 min au Gite Là-Haut.',
       TRUE, NOW(), NOW()
FROM object o
WHERE o.object_type = 'HLO' AND o.name = 'Gîte Là-Haut' AND o.region_code = 'RUN'
  AND NOT EXISTS (SELECT 1 FROM object_location ol WHERE ol.object_id = o.id AND ol.is_main_location = TRUE);

-- 1.10  La Cité du Volcan
INSERT INTO object_location (object_id, address1, postcode, city, lieu_dit, latitude, longitude, direction, is_main_location, created_at, updated_at)
SELECT o.id,
       'RN3',
       '97418', 'Le Tampon', 'La Plaine des Cafres',
       -21.20332900, 55.57390000,
       NULL,
       TRUE, NOW(), NOW()
FROM object o
WHERE o.object_type = 'LOI' AND o.name = 'La Cité du Volcan' AND o.region_code = 'RUN'
  AND NOT EXISTS (SELECT 1 FROM object_location ol WHERE ol.object_id = o.id AND ol.is_main_location = TRUE);


-- ---------------------------------------------------------------------------
-- SECTION 3 — OBJECT_ORIGIN (traçabilité source)
-- ---------------------------------------------------------------------------

-- source_system    : 'berta_v2_csv_export'
-- source_object_id : identifiant de la ligne dans l'export Berta 2.0

INSERT INTO object_origin (object_id, source_system, source_object_id, first_imported_at, created_at, updated_at)
SELECT o.id, 'berta_v2_csv_export', 'recCSnhcZo4XxocjX', NOW(), NOW(), NOW()
FROM object o
WHERE o.object_type = 'ACT' AND o.name = 'Canyon Aventure' AND o.region_code = 'RUN'
ON CONFLICT (object_id) DO NOTHING;

INSERT INTO object_origin (object_id, source_system, source_object_id, first_imported_at, created_at, updated_at)
SELECT o.id, 'berta_v2_csv_export', 'recdw4lpGQlrscCXF', NOW(), NOW(), NOW()
FROM object o
WHERE o.object_type = 'ACT' AND o.name = 'Ascendance Parapente' AND o.region_code = 'RUN'
ON CONFLICT (object_id) DO NOTHING;

INSERT INTO object_origin (object_id, source_system, source_object_id, first_imported_at, created_at, updated_at)
SELECT o.id, 'berta_v2_csv_export', 'recSSTvKv6Jh4BYzZ', NOW(), NOW(), NOW()
FROM object o
WHERE o.object_type = 'ACT' AND o.name = 'Maison du Curcuma' AND o.region_code = 'RUN'
ON CONFLICT (object_id) DO NOTHING;

INSERT INTO object_origin (object_id, source_system, source_object_id, first_imported_at, created_at, updated_at)
SELECT o.id, 'berta_v2_csv_export', 'recN5bNxgghhfpEHE', NOW(), NOW(), NOW()
FROM object o
WHERE o.object_type = 'RES' AND o.name = 'La Kaz' AND o.region_code = 'RUN'
ON CONFLICT (object_id) DO NOTHING;

INSERT INTO object_origin (object_id, source_system, source_object_id, first_imported_at, created_at, updated_at)
SELECT o.id, 'berta_v2_csv_export', 'rec7uNHsQPt5wZPCY', NOW(), NOW(), NOW()
FROM object o
WHERE o.object_type = 'RES' AND o.name = 'Le Gadjak' AND o.region_code = 'RUN'
ON CONFLICT (object_id) DO NOTHING;

INSERT INTO object_origin (object_id, source_system, source_object_id, first_imported_at, created_at, updated_at)
SELECT o.id, 'berta_v2_csv_export', 'rec5vqdPwSdrFzsvs', NOW(), NOW(), NOW()
FROM object o
WHERE o.object_type = 'HOT' AND o.name = 'Dimitile Hôtel' AND o.region_code = 'RUN'
ON CONFLICT (object_id) DO NOTHING;

INSERT INTO object_origin (object_id, source_system, source_object_id, first_imported_at, created_at, updated_at)
SELECT o.id, 'berta_v2_csv_export', 'recr8fxU0od0bvvnh', NOW(), NOW(), NOW()
FROM object o
WHERE o.object_type = 'HLO' AND o.name = 'Domaine Paille en Queue - Sud Sauvage' AND o.region_code = 'RUN'
ON CONFLICT (object_id) DO NOTHING;

INSERT INTO object_origin (object_id, source_system, source_object_id, first_imported_at, created_at, updated_at)
SELECT o.id, 'berta_v2_csv_export', 'recr1yhoYV0cSykCz', NOW(), NOW(), NOW()
FROM object o
WHERE o.object_type = 'HLO' AND o.name = 'Côté Volcan' AND o.region_code = 'RUN'
ON CONFLICT (object_id) DO NOTHING;

INSERT INTO object_origin (object_id, source_system, source_object_id, first_imported_at, created_at, updated_at)
SELECT o.id, 'berta_v2_csv_export', 'd5c7c61d', NOW(), NOW(), NOW()
FROM object o
WHERE o.object_type = 'HLO' AND o.name = 'Gîte Là-Haut' AND o.region_code = 'RUN'
ON CONFLICT (object_id) DO NOTHING;

INSERT INTO object_origin (object_id, source_system, source_object_id, first_imported_at, created_at, updated_at)
SELECT o.id, 'berta_v2_csv_export', 'recmG8eVRN6kwvyRU', NOW(), NOW(), NOW()
FROM object o
WHERE o.object_type = 'LOI' AND o.name = 'La Cité du Volcan' AND o.region_code = 'RUN'
ON CONFLICT (object_id) DO NOTHING;



-- ---------------------------------------------------------------------------
-- SECTION 4 — OBJECT_ORG_LINK : publisher → OTI du Sud
-- ---------------------------------------------------------------------------

-- Invariant : OTI du Sud est l'ORG diffuseur (role='publisher'), pas opérateur.
-- is_primary = TRUE : seul diffuseur pour chaque fiche dans ce pilote.

INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary, created_at, updated_at)
SELECT o.id, org.id, r.id, TRUE, NOW(), NOW()
FROM object o, object org, ref_org_role r
WHERE o.object_type = 'ACT' AND o.name = 'Canyon Aventure' AND o.region_code = 'RUN'
  AND org.object_type = 'ORG' AND org.name = 'OTI du Sud' AND org.region_code = 'RUN'
  AND r.code = 'publisher'
ON CONFLICT (object_id, org_object_id, role_id) DO NOTHING;

INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary, created_at, updated_at)
SELECT o.id, org.id, r.id, TRUE, NOW(), NOW()
FROM object o, object org, ref_org_role r
WHERE o.object_type = 'ACT' AND o.name = 'Ascendance Parapente' AND o.region_code = 'RUN'
  AND org.object_type = 'ORG' AND org.name = 'OTI du Sud' AND org.region_code = 'RUN'
  AND r.code = 'publisher'
ON CONFLICT (object_id, org_object_id, role_id) DO NOTHING;

INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary, created_at, updated_at)
SELECT o.id, org.id, r.id, TRUE, NOW(), NOW()
FROM object o, object org, ref_org_role r
WHERE o.object_type = 'ACT' AND o.name = 'Maison du Curcuma' AND o.region_code = 'RUN'
  AND org.object_type = 'ORG' AND org.name = 'OTI du Sud' AND org.region_code = 'RUN'
  AND r.code = 'publisher'
ON CONFLICT (object_id, org_object_id, role_id) DO NOTHING;

INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary, created_at, updated_at)
SELECT o.id, org.id, r.id, TRUE, NOW(), NOW()
FROM object o, object org, ref_org_role r
WHERE o.object_type = 'RES' AND o.name = 'La Kaz' AND o.region_code = 'RUN'
  AND org.object_type = 'ORG' AND org.name = 'OTI du Sud' AND org.region_code = 'RUN'
  AND r.code = 'publisher'
ON CONFLICT (object_id, org_object_id, role_id) DO NOTHING;

INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary, created_at, updated_at)
SELECT o.id, org.id, r.id, TRUE, NOW(), NOW()
FROM object o, object org, ref_org_role r
WHERE o.object_type = 'RES' AND o.name = 'Le Gadjak' AND o.region_code = 'RUN'
  AND org.object_type = 'ORG' AND org.name = 'OTI du Sud' AND org.region_code = 'RUN'
  AND r.code = 'publisher'
ON CONFLICT (object_id, org_object_id, role_id) DO NOTHING;

INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary, created_at, updated_at)
SELECT o.id, org.id, r.id, TRUE, NOW(), NOW()
FROM object o, object org, ref_org_role r
WHERE o.object_type = 'HOT' AND o.name = 'Dimitile Hôtel' AND o.region_code = 'RUN'
  AND org.object_type = 'ORG' AND org.name = 'OTI du Sud' AND org.region_code = 'RUN'
  AND r.code = 'publisher'
ON CONFLICT (object_id, org_object_id, role_id) DO NOTHING;

INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary, created_at, updated_at)
SELECT o.id, org.id, r.id, TRUE, NOW(), NOW()
FROM object o, object org, ref_org_role r
WHERE o.object_type = 'HLO' AND o.name = 'Domaine Paille en Queue - Sud Sauvage' AND o.region_code = 'RUN'
  AND org.object_type = 'ORG' AND org.name = 'OTI du Sud' AND org.region_code = 'RUN'
  AND r.code = 'publisher'
ON CONFLICT (object_id, org_object_id, role_id) DO NOTHING;

INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary, created_at, updated_at)
SELECT o.id, org.id, r.id, TRUE, NOW(), NOW()
FROM object o, object org, ref_org_role r
WHERE o.object_type = 'HLO' AND o.name = 'Côté Volcan' AND o.region_code = 'RUN'
  AND org.object_type = 'ORG' AND org.name = 'OTI du Sud' AND org.region_code = 'RUN'
  AND r.code = 'publisher'
ON CONFLICT (object_id, org_object_id, role_id) DO NOTHING;

INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary, created_at, updated_at)
SELECT o.id, org.id, r.id, TRUE, NOW(), NOW()
FROM object o, object org, ref_org_role r
WHERE o.object_type = 'HLO' AND o.name = 'Gîte Là-Haut' AND o.region_code = 'RUN'
  AND org.object_type = 'ORG' AND org.name = 'OTI du Sud' AND org.region_code = 'RUN'
  AND r.code = 'publisher'
ON CONFLICT (object_id, org_object_id, role_id) DO NOTHING;

INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary, created_at, updated_at)
SELECT o.id, org.id, r.id, TRUE, NOW(), NOW()
FROM object o, object org, ref_org_role r
WHERE o.object_type = 'LOI' AND o.name = 'La Cité du Volcan' AND o.region_code = 'RUN'
  AND org.object_type = 'ORG' AND org.name = 'OTI du Sud' AND org.region_code = 'RUN'
  AND r.code = 'publisher'
ON CONFLICT (object_id, org_object_id, role_id) DO NOTHING;



-- ---------------------------------------------------------------------------
-- SECTION 5 — ACTORS (exploitants / fournisseurs)
-- ---------------------------------------------------------------------------

-- Invariant : ACTOR = exploitant opérationnel, jamais une structure institutionnelle.
-- display_name = prénom + nom ; gender d'après civilité source (Mr/Mme)
-- extra = SIRET (faute de table dédiée dans ce périmètre)

-- 5.1  Rémi Janisset — Canyon Aventure
INSERT INTO actor (display_name, first_name, last_name, gender, extra, created_at, updated_at)
SELECT 'Rémi Janisset', 'Rémi', 'Janisset', 'M',
       '{"siret": "50316983100032"}'::jsonb,
       NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM actor WHERE display_name = 'Rémi Janisset');

-- 5.2  Alexis Marcadal — Ascendance Parapente
INSERT INTO actor (display_name, first_name, last_name, gender, extra, created_at, updated_at)
SELECT 'Alexis Marcadal', 'Alexis', 'Marcadal', 'M',
       '{"siret": "81332682400030"}'::jsonb,
       NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM actor WHERE display_name = 'Alexis Marcadal');

-- 5.3  Aimé Rivière — Maison du Curcuma
INSERT INTO actor (display_name, first_name, last_name, gender, extra, created_at, updated_at)
SELECT 'Aimé Rivière', 'Aimé', 'Rivière', 'M',
       '{"siret": "89159957300013"}'::jsonb,
       NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM actor WHERE display_name = 'Aimé Rivière');

-- 5.4  Murielle Técher — La Kaz
INSERT INTO actor (display_name, first_name, last_name, gender, extra, created_at, updated_at)
SELECT 'Murielle Técher', 'Murielle', 'Técher', 'F',
       '{"siret": "81859571200014"}'::jsonb,
       NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM actor WHERE display_name = 'Murielle Técher');

-- 5.5  Raphaël Thebault — Le Gadjak
INSERT INTO actor (display_name, first_name, last_name, gender, extra, created_at, updated_at)
SELECT 'Raphaël Thebault', 'Raphaël', 'Thebault', 'M',
       '{"siret": "51032265400029"}'::jsonb,
       NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM actor WHERE display_name = 'Raphaël Thebault');

-- 5.6  Stéphane Calçada — Dimitile Hôtel
INSERT INTO actor (display_name, first_name, last_name, gender, extra, created_at, updated_at)
SELECT 'Stéphane Calçada', 'Stéphane', 'Calçada', 'M',
       '{"siret": "84051265100026"}'::jsonb,
       NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM actor WHERE display_name = 'Stéphane Calçada');

-- 5.7  Marie-Nadège Maulat — Domaine Paille en Queue - Sud Sauvage
INSERT INTO actor (display_name, first_name, last_name, gender, extra, created_at, updated_at)
SELECT 'Marie-Nadège Maulat', 'Marie-Nadège', 'Maulat', 'F',
       '{"siret": "82843905900027"}'::jsonb,
       NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM actor WHERE display_name = 'Marie-Nadège Maulat');

-- 5.8  Laurie Perrault — Côté Volcan
INSERT INTO actor (display_name, first_name, last_name, gender, extra, created_at, updated_at)
SELECT 'Laurie Perrault', 'Laurie', 'Perrault', 'F',
       '{"siret": "84054615400013"}'::jsonb,
       NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM actor WHERE display_name = 'Laurie Perrault');

-- 5.9  Laure LE QUERE — Gîte Là-Haut
INSERT INTO actor (display_name, first_name, last_name, gender, extra, created_at, updated_at)
SELECT 'Laure LE QUERE', 'Laure', 'LE QUERE', 'F',
       '{"siret": "90235089100013"}'::jsonb,
       NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM actor WHERE display_name = 'Laure LE QUERE');

-- 5.10  Jean-François Sita — La Cité du Volcan
INSERT INTO actor (display_name, first_name, last_name, gender, extra, created_at, updated_at)
SELECT 'Jean-François Sita', 'Jean-François', 'Sita', 'M',
       '{"siret": "78897940900018"}'::jsonb,
       NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM actor WHERE display_name = 'Jean-François Sita');



-- ---------------------------------------------------------------------------
-- SECTION 6 — ACTOR_CHANNEL (email + téléphone)
-- ---------------------------------------------------------------------------

-- 026x → fixe (kind='phone') · 069x/062x → mobile (kind='mobile')

-- 6.1  Rémi Janisset
INSERT INTO actor_channel (actor_id, kind_id, value, is_primary, position, created_at, updated_at)
SELECT a.id, k.id, 'canyonaventure@gmail.com', TRUE, 1, NOW(), NOW()
FROM actor a, ref_code_contact_kind k
WHERE a.display_name = 'Rémi Janisset' AND k.code = 'email'
ON CONFLICT (actor_id, kind_id, value) DO NOTHING;

INSERT INTO actor_channel (actor_id, kind_id, value, is_primary, position, created_at, updated_at)
SELECT a.id, k.id, '0693402408', TRUE, 1, NOW(), NOW()
FROM actor a, ref_code_contact_kind k
WHERE a.display_name = 'Rémi Janisset' AND k.code = 'mobile'
ON CONFLICT (actor_id, kind_id, value) DO NOTHING;

-- 6.2  Alexis Marcadal
INSERT INTO actor_channel (actor_id, kind_id, value, is_primary, position, created_at, updated_at)
SELECT a.id, k.id, 'alex@ascendance-parapente.re', TRUE, 1, NOW(), NOW()
FROM actor a, ref_code_contact_kind k
WHERE a.display_name = 'Alexis Marcadal' AND k.code = 'email'
ON CONFLICT (actor_id, kind_id, value) DO NOTHING;

INSERT INTO actor_channel (actor_id, kind_id, value, is_primary, position, created_at, updated_at)
SELECT a.id, k.id, '0692933210', TRUE, 1, NOW(), NOW()
FROM actor a, ref_code_contact_kind k
WHERE a.display_name = 'Alexis Marcadal' AND k.code = 'mobile'
ON CONFLICT (actor_id, kind_id, value) DO NOTHING;

-- 6.3  Aimé Rivière
INSERT INTO actor_channel (actor_id, kind_id, value, is_primary, position, created_at, updated_at)
SELECT a.id, k.id, 'memeriviere@orange.fr', TRUE, 1, NOW(), NOW()
FROM actor a, ref_code_contact_kind k
WHERE a.display_name = 'Aimé Rivière' AND k.code = 'email'
ON CONFLICT (actor_id, kind_id, value) DO NOTHING;

INSERT INTO actor_channel (actor_id, kind_id, value, is_primary, position, created_at, updated_at)
SELECT a.id, k.id, '0692935757', TRUE, 1, NOW(), NOW()
FROM actor a, ref_code_contact_kind k
WHERE a.display_name = 'Aimé Rivière' AND k.code = 'mobile'
ON CONFLICT (actor_id, kind_id, value) DO NOTHING;

-- 6.4  Murielle Técher
INSERT INTO actor_channel (actor_id, kind_id, value, is_primary, position, created_at, updated_at)
SELECT a.id, k.id, 'mu.techer@laposte.net', TRUE, 1, NOW(), NOW()
FROM actor a, ref_code_contact_kind k
WHERE a.display_name = 'Murielle Técher' AND k.code = 'email'
ON CONFLICT (actor_id, kind_id, value) DO NOTHING;

INSERT INTO actor_channel (actor_id, kind_id, value, is_primary, position, created_at, updated_at)
SELECT a.id, k.id, '0693603776', TRUE, 1, NOW(), NOW()
FROM actor a, ref_code_contact_kind k
WHERE a.display_name = 'Murielle Técher' AND k.code = 'mobile'
ON CONFLICT (actor_id, kind_id, value) DO NOTHING;

-- 6.5  Raphaël Thebault
INSERT INTO actor_channel (actor_id, kind_id, value, is_primary, position, created_at, updated_at)
SELECT a.id, k.id, 'tboram@hotmail.fr', TRUE, 1, NOW(), NOW()
FROM actor a, ref_code_contact_kind k
WHERE a.display_name = 'Raphaël Thebault' AND k.code = 'email'
ON CONFLICT (actor_id, kind_id, value) DO NOTHING;

INSERT INTO actor_channel (actor_id, kind_id, value, is_primary, position, created_at, updated_at)
SELECT a.id, k.id, '0692410369', TRUE, 1, NOW(), NOW()
FROM actor a, ref_code_contact_kind k
WHERE a.display_name = 'Raphaël Thebault' AND k.code = 'mobile'
ON CONFLICT (actor_id, kind_id, value) DO NOTHING;

-- 6.6  Stéphane Calçada
INSERT INTO actor_channel (actor_id, kind_id, value, is_primary, position, created_at, updated_at)
SELECT a.id, k.id, 'direction@hotel-ledimitile.com', TRUE, 1, NOW(), NOW()
FROM actor a, ref_code_contact_kind k
WHERE a.display_name = 'Stéphane Calçada' AND k.code = 'email'
ON CONFLICT (actor_id, kind_id, value) DO NOTHING;

INSERT INTO actor_channel (actor_id, kind_id, value, is_primary, position, created_at, updated_at)
SELECT a.id, k.id, '0262392000', TRUE, 1, NOW(), NOW()
FROM actor a, ref_code_contact_kind k
WHERE a.display_name = 'Stéphane Calçada' AND k.code = 'phone'
ON CONFLICT (actor_id, kind_id, value) DO NOTHING;

-- 6.7  Marie-Nadège Maulat
INSERT INTO actor_channel (actor_id, kind_id, value, is_primary, position, created_at, updated_at)
SELECT a.id, k.id, 'marie.hangard@gmail.com', TRUE, 1, NOW(), NOW()
FROM actor a, ref_code_contact_kind k
WHERE a.display_name = 'Marie-Nadège Maulat' AND k.code = 'email'
ON CONFLICT (actor_id, kind_id, value) DO NOTHING;

INSERT INTO actor_channel (actor_id, kind_id, value, is_primary, position, created_at, updated_at)
SELECT a.id, k.id, '0625790833', TRUE, 1, NOW(), NOW()
FROM actor a, ref_code_contact_kind k
WHERE a.display_name = 'Marie-Nadège Maulat' AND k.code = 'mobile'
ON CONFLICT (actor_id, kind_id, value) DO NOTHING;

-- 6.8  Laurie Perrault
INSERT INTO actor_channel (actor_id, kind_id, value, is_primary, position, created_at, updated_at)
SELECT a.id, k.id, 'contact@cote-volcan.fr', TRUE, 1, NOW(), NOW()
FROM actor a, ref_code_contact_kind k
WHERE a.display_name = 'Laurie Perrault' AND k.code = 'email'
ON CONFLICT (actor_id, kind_id, value) DO NOTHING;

INSERT INTO actor_channel (actor_id, kind_id, value, is_primary, position, created_at, updated_at)
SELECT a.id, k.id, '0262704053', TRUE, 1, NOW(), NOW()
FROM actor a, ref_code_contact_kind k
WHERE a.display_name = 'Laurie Perrault' AND k.code = 'phone'
ON CONFLICT (actor_id, kind_id, value) DO NOTHING;

-- 6.9  Laure LE QUERE
INSERT INTO actor_channel (actor_id, kind_id, value, is_primary, position, created_at, updated_at)
SELECT a.id, k.id, 'laureprojet974@hotmail.com', TRUE, 1, NOW(), NOW()
FROM actor a, ref_code_contact_kind k
WHERE a.display_name = 'Laure LE QUERE' AND k.code = 'email'
ON CONFLICT (actor_id, kind_id, value) DO NOTHING;

INSERT INTO actor_channel (actor_id, kind_id, value, is_primary, position, created_at, updated_at)
SELECT a.id, k.id, '0692717668', TRUE, 1, NOW(), NOW()
FROM actor a, ref_code_contact_kind k
WHERE a.display_name = 'Laure LE QUERE' AND k.code = 'mobile'
ON CONFLICT (actor_id, kind_id, value) DO NOTHING;

-- 6.10  Jean-François Sita
INSERT INTO actor_channel (actor_id, kind_id, value, is_primary, position, created_at, updated_at)
SELECT a.id, k.id, 'cdv.reservations@museesreunion.re', TRUE, 1, NOW(), NOW()
FROM actor a, ref_code_contact_kind k
WHERE a.display_name = 'Jean-François Sita' AND k.code = 'email'
ON CONFLICT (actor_id, kind_id, value) DO NOTHING;

INSERT INTO actor_channel (actor_id, kind_id, value, is_primary, position, created_at, updated_at)
SELECT a.id, k.id, '0262590026', TRUE, 1, NOW(), NOW()
FROM actor a, ref_code_contact_kind k
WHERE a.display_name = 'Jean-François Sita' AND k.code = 'phone'
ON CONFLICT (actor_id, kind_id, value) DO NOTHING;



-- ---------------------------------------------------------------------------
-- SECTION 7 — ACTOR_OBJECT_ROLE : exploitant opérationnel (role='operator')
-- ---------------------------------------------------------------------------

-- DÉPEND DU PRÉREQUIS : ref_actor_role code='operator' doit exister (voir header).
-- is_primary = TRUE car un seul exploitant par fiche dans ce pilote.

INSERT INTO actor_object_role (actor_id, object_id, role_id, is_primary, visibility, created_at, updated_at)
SELECT a.id, o.id, r.id, TRUE, 'public', NOW(), NOW()
FROM actor a, object o, ref_actor_role r
WHERE a.display_name = 'Rémi Janisset'
  AND o.object_type = 'ACT' AND o.name = 'Canyon Aventure' AND o.region_code = 'RUN'
  AND r.code = 'operator'
  AND NOT EXISTS (SELECT 1 FROM actor_object_role x WHERE x.actor_id = a.id AND x.object_id = o.id AND x.role_id = r.id);

INSERT INTO actor_object_role (actor_id, object_id, role_id, is_primary, visibility, created_at, updated_at)
SELECT a.id, o.id, r.id, TRUE, 'public', NOW(), NOW()
FROM actor a, object o, ref_actor_role r
WHERE a.display_name = 'Alexis Marcadal'
  AND o.object_type = 'ACT' AND o.name = 'Ascendance Parapente' AND o.region_code = 'RUN'
  AND r.code = 'operator'
  AND NOT EXISTS (SELECT 1 FROM actor_object_role x WHERE x.actor_id = a.id AND x.object_id = o.id AND x.role_id = r.id);

INSERT INTO actor_object_role (actor_id, object_id, role_id, is_primary, visibility, created_at, updated_at)
SELECT a.id, o.id, r.id, TRUE, 'public', NOW(), NOW()
FROM actor a, object o, ref_actor_role r
WHERE a.display_name = 'Aimé Rivière'
  AND o.object_type = 'ACT' AND o.name = 'Maison du Curcuma' AND o.region_code = 'RUN'
  AND r.code = 'operator'
  AND NOT EXISTS (SELECT 1 FROM actor_object_role x WHERE x.actor_id = a.id AND x.object_id = o.id AND x.role_id = r.id);

INSERT INTO actor_object_role (actor_id, object_id, role_id, is_primary, visibility, created_at, updated_at)
SELECT a.id, o.id, r.id, TRUE, 'public', NOW(), NOW()
FROM actor a, object o, ref_actor_role r
WHERE a.display_name = 'Murielle Técher'
  AND o.object_type = 'RES' AND o.name = 'La Kaz' AND o.region_code = 'RUN'
  AND r.code = 'operator'
  AND NOT EXISTS (SELECT 1 FROM actor_object_role x WHERE x.actor_id = a.id AND x.object_id = o.id AND x.role_id = r.id);

INSERT INTO actor_object_role (actor_id, object_id, role_id, is_primary, visibility, created_at, updated_at)
SELECT a.id, o.id, r.id, TRUE, 'public', NOW(), NOW()
FROM actor a, object o, ref_actor_role r
WHERE a.display_name = 'Raphaël Thebault'
  AND o.object_type = 'RES' AND o.name = 'Le Gadjak' AND o.region_code = 'RUN'
  AND r.code = 'operator'
  AND NOT EXISTS (SELECT 1 FROM actor_object_role x WHERE x.actor_id = a.id AND x.object_id = o.id AND x.role_id = r.id);

INSERT INTO actor_object_role (actor_id, object_id, role_id, is_primary, visibility, created_at, updated_at)
SELECT a.id, o.id, r.id, TRUE, 'public', NOW(), NOW()
FROM actor a, object o, ref_actor_role r
WHERE a.display_name = 'Stéphane Calçada'
  AND o.object_type = 'HOT' AND o.name = 'Dimitile Hôtel' AND o.region_code = 'RUN'
  AND r.code = 'operator'
  AND NOT EXISTS (SELECT 1 FROM actor_object_role x WHERE x.actor_id = a.id AND x.object_id = o.id AND x.role_id = r.id);

INSERT INTO actor_object_role (actor_id, object_id, role_id, is_primary, visibility, created_at, updated_at)
SELECT a.id, o.id, r.id, TRUE, 'public', NOW(), NOW()
FROM actor a, object o, ref_actor_role r
WHERE a.display_name = 'Marie-Nadège Maulat'
  AND o.object_type = 'HLO' AND o.name = 'Domaine Paille en Queue - Sud Sauvage' AND o.region_code = 'RUN'
  AND r.code = 'operator'
  AND NOT EXISTS (SELECT 1 FROM actor_object_role x WHERE x.actor_id = a.id AND x.object_id = o.id AND x.role_id = r.id);

INSERT INTO actor_object_role (actor_id, object_id, role_id, is_primary, visibility, created_at, updated_at)
SELECT a.id, o.id, r.id, TRUE, 'public', NOW(), NOW()
FROM actor a, object o, ref_actor_role r
WHERE a.display_name = 'Laurie Perrault'
  AND o.object_type = 'HLO' AND o.name = 'Côté Volcan' AND o.region_code = 'RUN'
  AND r.code = 'operator'
  AND NOT EXISTS (SELECT 1 FROM actor_object_role x WHERE x.actor_id = a.id AND x.object_id = o.id AND x.role_id = r.id);

INSERT INTO actor_object_role (actor_id, object_id, role_id, is_primary, visibility, created_at, updated_at)
SELECT a.id, o.id, r.id, TRUE, 'public', NOW(), NOW()
FROM actor a, object o, ref_actor_role r
WHERE a.display_name = 'Laure LE QUERE'
  AND o.object_type = 'HLO' AND o.name = 'Gîte Là-Haut' AND o.region_code = 'RUN'
  AND r.code = 'operator'
  AND NOT EXISTS (SELECT 1 FROM actor_object_role x WHERE x.actor_id = a.id AND x.object_id = o.id AND x.role_id = r.id);

INSERT INTO actor_object_role (actor_id, object_id, role_id, is_primary, visibility, created_at, updated_at)
SELECT a.id, o.id, r.id, TRUE, 'public', NOW(), NOW()
FROM actor a, object o, ref_actor_role r
WHERE a.display_name = 'Jean-François Sita'
  AND o.object_type = 'LOI' AND o.name = 'La Cité du Volcan' AND o.region_code = 'RUN'
  AND r.code = 'operator'
  AND NOT EXISTS (SELECT 1 FROM actor_object_role x WHERE x.actor_id = a.id AND x.object_id = o.id AND x.role_id = r.id);



-- ---------------------------------------------------------------------------
-- SECTION 8 — OBJECT_CLASSIFICATION : sous-type ACT (scheme 'type_act')
-- ---------------------------------------------------------------------------

-- Canyon Aventure      → canyoning
-- Ascendance Parapente → parapente
-- Maison du Curcuma    → OMIS ('visite_guidee' absent du schéma type_act)

INSERT INTO object_classification (object_id, scheme_id, value_id, created_at, updated_at)
SELECT o.id, s.id, v.id, NOW(), NOW()
FROM object o
JOIN ref_classification_scheme s ON s.code = 'type_act'
JOIN ref_classification_value  v ON v.scheme_id = s.id AND v.code = 'canyoning'
WHERE o.object_type = 'ACT' AND o.name = 'Canyon Aventure' AND o.region_code = 'RUN'
  AND NOT EXISTS (
    SELECT 1 FROM object_classification oc
    WHERE oc.object_id = o.id AND oc.scheme_id = s.id AND oc.value_id = v.id
  );

INSERT INTO object_classification (object_id, scheme_id, value_id, created_at, updated_at)
SELECT o.id, s.id, v.id, NOW(), NOW()
FROM object o
JOIN ref_classification_scheme s ON s.code = 'type_act'
JOIN ref_classification_value  v ON v.scheme_id = s.id AND v.code = 'parapente'
WHERE o.object_type = 'ACT' AND o.name = 'Ascendance Parapente' AND o.region_code = 'RUN'
  AND NOT EXISTS (
    SELECT 1 FROM object_classification oc
    WHERE oc.object_id = o.id AND oc.scheme_id = s.id AND oc.value_id = v.id
  );



-- ---------------------------------------------------------------------------
-- SECTION 9 — OBJECT_DESCRIPTION (accroche + descriptif) — 10 lignes
-- ---------------------------------------------------------------------------

-- description_chapo : champ « Accroche » de la source
-- description       : champ « Descriptif » de la source
-- org_object_id     : id de l'ORG OTI du Sud (type TEXT dans le schéma)
-- Idempotence       : WHERE NOT EXISTS sur (object_id, org_object_id)

-- Canyon Aventure
INSERT INTO object_description (object_id, org_object_id, description_chapo, description, created_at, updated_at)
SELECT o.id, org.id, 'La Réunion est le spot idéal pour le canyoning!
Découverte des plus beaux canyons de l''île avec Canyon Aventure!', 'Aquatiques ou aériens, en famille ou entre amis, il y en a pour tous les goûts!
Accessible aux enfants à partir de 7 ans, l''expérience canyoning restera un des meilleurs souvenirs de vos vacances.
Découvrir La Réunion autrement', NOW(), NOW()
FROM object o, object org
WHERE o.object_type = 'ACT' AND o.name = 'Canyon Aventure' AND o.region_code = 'RUN'
  AND org.object_type = 'ORG' AND org.name = 'OTI du Sud' AND org.region_code = 'RUN'
  AND NOT EXISTS (
    SELECT 1 FROM object_description od
    WHERE od.object_id = o.id AND od.org_object_id = org.id
  );

-- Ascendance Parapente
INSERT INTO object_description (object_id, org_object_id, description_chapo, description, created_at, updated_at)
SELECT o.id, org.id, 'A Saint-Leu, Ascendance Parapente propose des baptêmes de parapente sur l''île de La Réunion et permettra à chacun de découvrir le site de Saint-Leu sous différentes façons.', 'Pour les amoureux inconditionnels de haute montagne, Ascendance Parapente propose également de prendre de la hauteur en partant des plus hauts sommets de l''île.', NOW(), NOW()
FROM object o, object org
WHERE o.object_type = 'ACT' AND o.name = 'Ascendance Parapente' AND o.region_code = 'RUN'
  AND org.object_type = 'ORG' AND org.name = 'OTI du Sud' AND org.region_code = 'RUN'
  AND NOT EXISTS (
    SELECT 1 FROM object_description od
    WHERE od.object_id = o.id AND od.org_object_id = org.id
  );

-- Maison du Curcuma
INSERT INTO object_description (object_id, org_object_id, description_chapo, description, created_at, updated_at)
SELECT o.id, org.id, 'Agriculteur actif, producteur sélectif', 'Au cœur du Sud Sauvage, dans le mini-cirque de la Plaine des Grègues, Mémé Rivière et sa famille invitent à la découverte du "safran pays" dans leur Maison du Curcuma. Des explications seront données sur le processus de transformation de la racine du curcuma, une épice qui occupe une place de choix dans la cuisine réunionnaise. 

Une visite du jardin privé, une petite balade d''environ 45 minutes ainsi qu''un petit détour dans la grotte à parfums, où se trouvent différentes épices utilisées par les Réunionnais, sont proposées. 

Petit film explicatif sur le safran et dégustation de produits en vente à la boutique.

Un pack de visite est disponible :
Circuit avec visite de l''exploitation + repas le midi au tarif de 39€ par personne', NOW(), NOW()
FROM object o, object org
WHERE o.object_type = 'ACT' AND o.name = 'Maison du Curcuma' AND o.region_code = 'RUN'
  AND org.object_type = 'ORG' AND org.name = 'OTI du Sud' AND org.region_code = 'RUN'
  AND NOT EXISTS (
    SELECT 1 FROM object_description od
    WHERE od.object_id = o.id AND od.org_object_id = org.id
  );

-- La Kaz
INSERT INTO object_description (object_id, org_object_id, description_chapo, description, created_at, updated_at)
SELECT o.id, org.id, 'A La Plaine des Cafres, le restaurant La Kaz propose une cuisine traditionnelle au feu de bois.', 'Il propose également des spécialités sénégalaises le week-end.
Restaurant ouvert tous les jours ainsi que les jours fériés de 11h à 22h.', NOW(), NOW()
FROM object o, object org
WHERE o.object_type = 'RES' AND o.name = 'La Kaz' AND o.region_code = 'RUN'
  AND org.object_type = 'ORG' AND org.name = 'OTI du Sud' AND org.region_code = 'RUN'
  AND NOT EXISTS (
    SELECT 1 FROM object_description od
    WHERE od.object_id = o.id AND od.org_object_id = org.id
  );

-- Le Gadjak
INSERT INTO object_description (object_id, org_object_id, description_chapo, description, created_at, updated_at)
SELECT o.id, org.id, 'Cuisine traditionnelle créole, grillades, viandes et poissons frais situé à l''Entre-Deux dans une charmante bâtisse créole classée au patrimoine de France', 'Restaurant situé au centre ville de l''Entre-Deux dans une vieille case créole qui a plus d''un siècle et demi. 
Le Gadjak propose des plats du jour de cuisine traditionnelle créole, des grillades poissons frais et suggestions de plats du monde.
Ouvert du lundi au vendredi de 11h30 à 14h et du lundi au jeudi de 18h30 à 20h30. Fermé vendredi soir samedi et dimanche', NOW(), NOW()
FROM object o, object org
WHERE o.object_type = 'RES' AND o.name = 'Le Gadjak' AND o.region_code = 'RUN'
  AND org.object_type = 'ORG' AND org.name = 'OTI du Sud' AND org.region_code = 'RUN'
  AND NOT EXISTS (
    SELECT 1 FROM object_description od
    WHERE od.object_id = o.id AND od.org_object_id = org.id
  );

-- Dimitile Hôtel
INSERT INTO object_description (object_id, org_object_id, description_chapo, description, created_at, updated_at)
SELECT o.id, org.id, 'Au cœur du village de l''Entre-Deux, Le Dimitile Hôtel & Spa est un condensé de confort et de charme au pied du massif du Dimitile.', 'Entièrement rénové, l''établissement propose 38 chambres dont 4 suites :
- Chambres doubles
- Chambre supérieure avec vue piscine ou avec vue panoramique
- Suite junior
- Chambre supérieure triple vue piscine

** Piscine **
Détendez-vous autour de notre piscine chauffée et équipée de jets hydromassants.
Réservée aux clients de l''hôtel, la piscine est ouverte de 8h à 19h.

** Événements **
Pour organiser vos réunions de travail, vos séminaires ou autres événements privés.
Un espace événementiel modulable de 80 m² avec 3 configurations possibles, pouvant accueillir 40 personnes assises et jusqu''à 60 personnes en cocktail vous accueille.

Il existe aussi des formules à la journée:
- Journée détente à partir de 45€/pax
- Pool and Breakfast à partir de 65€/pax', NOW(), NOW()
FROM object o, object org
WHERE o.object_type = 'HOT' AND o.name = 'Dimitile Hôtel' AND o.region_code = 'RUN'
  AND org.object_type = 'ORG' AND org.name = 'OTI du Sud' AND org.region_code = 'RUN'
  AND NOT EXISTS (
    SELECT 1 FROM object_description od
    WHERE od.object_id = o.id AND od.org_object_id = org.id
  );

-- Domaine Paille en Queue - Sud Sauvage
INSERT INTO object_description (object_id, org_object_id, description_chapo, description, created_at, updated_at)
SELECT o.id, org.id, 'Situé à Saint-Joseph, le Domaine Paille en Queue propose 3 maisonnettes, toutes les 3 décorées différemment. Sud Sauvage peut accueillir jusqu''à 7 personnes.', 'Ambiance tropical à travers une décoration à tendance jungle toute en délicatesse, Sud Sauvage est composée d''une chambre avec d''un lit double au rez de chaussée, deux lits doubles et un lit simple à l''étage, un canapé convertible, un salon, une salle de bain / douche, des toilettes séparés, une cuisine équipée, un accès à un grand jardin avec vue sur la mer. A l''extérieur il y a une chaise et une table sur la terrasse.', NOW(), NOW()
FROM object o, object org
WHERE o.object_type = 'HLO' AND o.name = 'Domaine Paille en Queue - Sud Sauvage' AND o.region_code = 'RUN'
  AND org.object_type = 'ORG' AND org.name = 'OTI du Sud' AND org.region_code = 'RUN'
  AND NOT EXISTS (
    SELECT 1 FROM object_description od
    WHERE od.object_id = o.id AND od.org_object_id = org.id
  );

-- Côté Volcan
INSERT INTO object_description (object_id, org_object_id, description_chapo, description, created_at, updated_at)
SELECT o.id, org.id, 'Située à la Plaine des Cafres, à Bourg Murat, Côté Volcan propose 2 chambres doubles et une chambre familiale labellisées Gîtes de France.', '- Chambre double standard lit 140x190
- Chambre double/twin standard (lit séparable Queen)
- Chambre double confort lit King
Elles sont toutes équipées de salle de bain privative, de chauffage et d''une literie de qualité avec des matelas à mémoire de forme.

Situé à moins de 15 minutes à pieds de la Cité du Volcan et à proximité des GR tel que le Piton des Neiges et le Piton de la Fournaise.

Au delà de sa superficie plus importante, la chambre supérieure offre notamment une belle vue sur le Piton des Neiges!

La structure propose, sur réservation uniquement, un service de table d''hôtes. Au menu : beignets de légumes, suivi d''une entrée, d''un plat créole accompagné de riz, grains et rougail, ainsi qu''un dessert. 30€/personnes hors boissons. Petit déjeuner inclus dans le tarif de 7h à 8h30.', NOW(), NOW()
FROM object o, object org
WHERE o.object_type = 'HLO' AND o.name = 'Côté Volcan' AND o.region_code = 'RUN'
  AND org.object_type = 'ORG' AND org.name = 'OTI du Sud' AND org.region_code = 'RUN'
  AND NOT EXISTS (
    SELECT 1 FROM object_description od
    WHERE od.object_id = o.id AND od.org_object_id = org.id
  );

-- Gîte Là-Haut
INSERT INTO object_description (object_id, org_object_id, description_chapo, description, created_at, updated_at)
SELECT o.id, org.id, 'Un gîte charmant et éco responsable dans les hauts de l''Entre deux !
Le Gite Là-Haut propose deux chambres privatives (équipées d''un lit double et d''un lit simple) et un dortoir qui peut recevoir jusqu''à 10 personnes. Nous pouvons également accueillir des randonneurs en tente. Le gite est équipé de deux salles de douche et de deux WC séparés.
Le Petit-Déjeuner est toujours compris dans le prix de la nuitée.', 'Au Gite Là-Haut, nous tenons à respecter l''Espace Naturel Sensible qu''est le Dimitile et à vous le faire découvrir.

A votre arrivée, vous serez accueillis par une tisane préparée avec les plantes du jardin : Géranium, Sauge, Fleurs Jaunes, Ambaville, Romarin, Thym, …

Au repas, nous proposons des produits locaux et de saison. Tout est fait maison. Des options végétarienne et sans gluten sont possibles sur demande.

Le Petit-Déjeuner se compose généralement de granolas et de fruits de saison ainsi que de baguettes de pain au levain accompagnées de beurre et 2 à 3 confitures maison.

Au Dimitile, vous découvrirez des panoramas incroyables. Les différents points de vue sur le Cirque de Cilaos sont à couper le souffle.
Depuis le Gite Là-Haut, vous contemplerez le massif du Volcan, le Piton de la Fournaise, ainsi qu''une vue à 360 sur les reliefs de la Plaine des Cafres au littoral de Saint Pierre.

Il existe ici un paradis pour les oiseaux. Sur le chemin, vous croiserez de nombreux tec-tec mais aussi des oiseaux blancs, des oiseaux verts à lunettes, des bulbuls (ou merle péï) et de magnifiques oiseaux la vierge.

L''environnement autour du Gite regorge également de nombreuses plantes endémiques comme le tamarin des hauts, les mahots blancs et rouge, de nombreux change écorce, quelques bois d''osto, du faux bois de fer, des zambavilles, ainsi que nombre d''espèces médicinales.', NOW(), NOW()
FROM object o, object org
WHERE o.object_type = 'HLO' AND o.name = 'Gîte Là-Haut' AND o.region_code = 'RUN'
  AND org.object_type = 'ORG' AND org.name = 'OTI du Sud' AND org.region_code = 'RUN'
  AND NOT EXISTS (
    SELECT 1 FROM object_description od
    WHERE od.object_id = o.id AND od.org_object_id = org.id
  );

-- La Cité du Volcan
INSERT INTO object_description (object_id, org_object_id, description_chapo, description, created_at, updated_at)
SELECT o.id, org.id, 'Rénovée par la Région Réunion de 2010 à 2014, la Cité du Volcan a ouvert ses portes au public le 5 août 2014. Ce pôle d''attraction touristique de premier plan est également un centre pédagogique et scientifique international.
Cet équipement de 6 000 m² propose une muséographie innovante qui intègre de nombreux dispositifs et maquettes interactives pour une visite ludique, attractive et pédagogique : salle de spectacle à 270°, cinéma 4D, tunnel de lave multisensoriel, effets sonores, etc.
Billet valable pendant 12 mois à partir de la date d''achat.', 'Cette muséographie d''immersion est obtenue par l''utilisation de nombreux dispositifs innovants et interactifs tels que la projection holographique, la réalité augmentée, les surfaces multitouch grand format, les ambiances sonores et visuelles.
L''ensemble de ces procédés technologiques place le visiteur dans des conditions reproduisant certaines caractéristiques des volcans et lui permet d''éprouver des sensations et de vivre pleinement le propos de l''exposition.
La découverte de La Réunion à la Cité du Volcan se décline en 3 niveaux :
- Niveau 1 : tunnel de lave, le hall, le film panoramique
- Niveau 2 : la salle aux trésors (lithothèque), le Piton de la Fournaise au cœur des mythes, l''observatoire volcanique
- Niveau 3 : le centre de documentation, l''auditorium
Fermé les 25 décembre, 1er janvier et 1er mai.
Musée ouvert de 13h à 17h le lundi et de 9h30 à 17h du mardi au dimanche. Durée de visite : environ 2h.', NOW(), NOW()
FROM object o, object org
WHERE o.object_type = 'LOI' AND o.name = 'La Cité du Volcan' AND o.region_code = 'RUN'
  AND org.object_type = 'ORG' AND org.name = 'OTI du Sud' AND org.region_code = 'RUN'
  AND NOT EXISTS (
    SELECT 1 FROM object_description od
    WHERE od.object_id = o.id AND od.org_object_id = org.id
  );



-- ---------------------------------------------------------------------------
-- SECTION 10 — OBJECT_CAPACITY — 8 lignes (skip Maison du Curcuma + La Cité du Volcan)
-- ---------------------------------------------------------------------------

-- ACT → max_capacity · RES → seats · HOT → max_capacity · HLO → max_capacity
-- unit synchronisé depuis ref_capacity_metric via trigger.

-- Canyon Aventure : 12 → max_capacity
INSERT INTO object_capacity (object_id, metric_id, value_integer, created_at, updated_at)
SELECT o.id, m.id, 12, NOW(), NOW()
FROM object o
JOIN ref_capacity_metric m ON m.code = 'max_capacity'
WHERE o.object_type = 'ACT' AND o.name = 'Canyon Aventure' AND o.region_code = 'RUN'
ON CONFLICT (object_id, metric_id) DO NOTHING;

-- Ascendance Parapente : 4 → max_capacity
INSERT INTO object_capacity (object_id, metric_id, value_integer, created_at, updated_at)
SELECT o.id, m.id, 4, NOW(), NOW()
FROM object o
JOIN ref_capacity_metric m ON m.code = 'max_capacity'
WHERE o.object_type = 'ACT' AND o.name = 'Ascendance Parapente' AND o.region_code = 'RUN'
ON CONFLICT (object_id, metric_id) DO NOTHING;

-- Maison du Curcuma : Capacité vide dans la source — omis.

-- La Kaz : 60 → seats
INSERT INTO object_capacity (object_id, metric_id, value_integer, created_at, updated_at)
SELECT o.id, m.id, 60, NOW(), NOW()
FROM object o
JOIN ref_capacity_metric m ON m.code = 'seats'
WHERE o.object_type = 'RES' AND o.name = 'La Kaz' AND o.region_code = 'RUN'
ON CONFLICT (object_id, metric_id) DO NOTHING;

-- Le Gadjak : 30 → seats
INSERT INTO object_capacity (object_id, metric_id, value_integer, created_at, updated_at)
SELECT o.id, m.id, 30, NOW(), NOW()
FROM object o
JOIN ref_capacity_metric m ON m.code = 'seats'
WHERE o.object_type = 'RES' AND o.name = 'Le Gadjak' AND o.region_code = 'RUN'
ON CONFLICT (object_id, metric_id) DO NOTHING;

-- Dimitile Hôtel : 87 → max_capacity
INSERT INTO object_capacity (object_id, metric_id, value_integer, created_at, updated_at)
SELECT o.id, m.id, 87, NOW(), NOW()
FROM object o
JOIN ref_capacity_metric m ON m.code = 'max_capacity'
WHERE o.object_type = 'HOT' AND o.name = 'Dimitile Hôtel' AND o.region_code = 'RUN'
ON CONFLICT (object_id, metric_id) DO NOTHING;

-- Domaine Paille en Queue - Sud Sauvage : 6 → max_capacity
INSERT INTO object_capacity (object_id, metric_id, value_integer, created_at, updated_at)
SELECT o.id, m.id, 6, NOW(), NOW()
FROM object o
JOIN ref_capacity_metric m ON m.code = 'max_capacity'
WHERE o.object_type = 'HLO' AND o.name = 'Domaine Paille en Queue - Sud Sauvage' AND o.region_code = 'RUN'
ON CONFLICT (object_id, metric_id) DO NOTHING;

-- Côté Volcan : 10 → max_capacity
INSERT INTO object_capacity (object_id, metric_id, value_integer, created_at, updated_at)
SELECT o.id, m.id, 10, NOW(), NOW()
FROM object o
JOIN ref_capacity_metric m ON m.code = 'max_capacity'
WHERE o.object_type = 'HLO' AND o.name = 'Côté Volcan' AND o.region_code = 'RUN'
ON CONFLICT (object_id, metric_id) DO NOTHING;

-- Gîte Là-Haut : 14 → max_capacity
INSERT INTO object_capacity (object_id, metric_id, value_integer, created_at, updated_at)
SELECT o.id, m.id, 14, NOW(), NOW()
FROM object o
JOIN ref_capacity_metric m ON m.code = 'max_capacity'
WHERE o.object_type = 'HLO' AND o.name = 'Gîte Là-Haut' AND o.region_code = 'RUN'
ON CONFLICT (object_id, metric_id) DO NOTHING;

-- La Cité du Volcan : Capacité vide dans la source — omis.



-- ---------------------------------------------------------------------------
-- SECTION 11 — OBJECT_CLASSIFICATION : classements officiels + labels qualité
-- ---------------------------------------------------------------------------

-- 11a — Classements : 4 établissements
--   Dimitile Hôtel                          → hot_stars    = 4
--   Domaine Paille en Queue - Sud Sauvage   → meuble_stars = 4
--   Côté Volcan (chambre d'hôtes)           → gites_epics  = 3
--   Gîte Là-Haut (gîte d'étape)            → gites_epics  = 3
--
-- 11b — Labels qualité : 3 établissements × 2 labels = 6 lignes
--   Canyon Aventure, Dimitile Hôtel, La Cité du Volcan
--   → qualite_tourisme/granted + qualite_tourisme_reunion/granted
--
-- LABELS BLOQUÉS (non insérés) :
--   Dimitile Hôtel    : tourisme_handicap — valeur exacte indéterminée dans la source
--   Dimitile Hôtel    : LBL_ECO_LABEL_UE — valeur 'granted' absente de ref_classification_value
--   Côté Volcan       : Gîtes de France — schéma 'gites_de_france_member' absent des seeds
--   Gîte Là-Haut      : Gîtes de France — schéma 'gites_de_france_member' absent des seeds
--   La Cité du Volcan : Certification clientèle indienne — schéma absent des seeds

-- 11a — Classements

-- Dimitile Hôtel → hot_stars = 4
INSERT INTO object_classification (object_id, scheme_id, value_id, created_at, updated_at)
SELECT o.id, s.id, v.id, NOW(), NOW()
FROM object o
JOIN ref_classification_scheme s ON s.code = 'hot_stars'
JOIN ref_classification_value  v ON v.scheme_id = s.id AND v.code = '4'
WHERE o.object_type = 'HOT' AND o.name = 'Dimitile Hôtel' AND o.region_code = 'RUN'
  AND NOT EXISTS (
    SELECT 1 FROM object_classification oc
    WHERE oc.object_id = o.id AND oc.scheme_id = s.id AND oc.value_id = v.id
  );

-- Domaine Paille en Queue - Sud Sauvage → meuble_stars = 4
INSERT INTO object_classification (object_id, scheme_id, value_id, created_at, updated_at)
SELECT o.id, s.id, v.id, NOW(), NOW()
FROM object o
JOIN ref_classification_scheme s ON s.code = 'meuble_stars'
JOIN ref_classification_value  v ON v.scheme_id = s.id AND v.code = '4'
WHERE o.object_type = 'HLO' AND o.name = 'Domaine Paille en Queue - Sud Sauvage' AND o.region_code = 'RUN'
  AND NOT EXISTS (
    SELECT 1 FROM object_classification oc
    WHERE oc.object_id = o.id AND oc.scheme_id = s.id AND oc.value_id = v.id
  );

-- Côté Volcan → gites_epics = 3
INSERT INTO object_classification (object_id, scheme_id, value_id, created_at, updated_at)
SELECT o.id, s.id, v.id, NOW(), NOW()
FROM object o
JOIN ref_classification_scheme s ON s.code = 'gites_epics'
JOIN ref_classification_value  v ON v.scheme_id = s.id AND v.code = '3'
WHERE o.object_type = 'HLO' AND o.name = 'Côté Volcan' AND o.region_code = 'RUN'
  AND NOT EXISTS (
    SELECT 1 FROM object_classification oc
    WHERE oc.object_id = o.id AND oc.scheme_id = s.id AND oc.value_id = v.id
  );

-- Gîte Là-Haut → gites_epics = 3
INSERT INTO object_classification (object_id, scheme_id, value_id, created_at, updated_at)
SELECT o.id, s.id, v.id, NOW(), NOW()
FROM object o
JOIN ref_classification_scheme s ON s.code = 'gites_epics'
JOIN ref_classification_value  v ON v.scheme_id = s.id AND v.code = '3'
WHERE o.object_type = 'HLO' AND o.name = 'Gîte Là-Haut' AND o.region_code = 'RUN'
  AND NOT EXISTS (
    SELECT 1 FROM object_classification oc
    WHERE oc.object_id = o.id AND oc.scheme_id = s.id AND oc.value_id = v.id
  );


-- 11b — Labels qualité

-- Canyon Aventure → LBL_QUALITE_TOURISME (V5 canonical; replaces retired code qualite_tourisme)
INSERT INTO object_classification (object_id, scheme_id, value_id, created_at, updated_at)
SELECT o.id, s.id, v.id, NOW(), NOW()
FROM object o
JOIN ref_classification_scheme s ON s.code = 'LBL_QUALITE_TOURISME'
JOIN ref_classification_value  v ON v.scheme_id = s.id AND v.code = 'granted'
WHERE o.object_type = 'ACT' AND o.name = 'Canyon Aventure' AND o.region_code = 'RUN'
  AND NOT EXISTS (
    SELECT 1 FROM object_classification oc
    WHERE oc.object_id = o.id AND oc.scheme_id = s.id AND oc.value_id = v.id
  );

-- Canyon Aventure → qualite_tourisme_reunion
INSERT INTO object_classification (object_id, scheme_id, value_id, created_at, updated_at)
SELECT o.id, s.id, v.id, NOW(), NOW()
FROM object o
JOIN ref_classification_scheme s ON s.code = 'qualite_tourisme_reunion'
JOIN ref_classification_value  v ON v.scheme_id = s.id AND v.code = 'granted'
WHERE o.object_type = 'ACT' AND o.name = 'Canyon Aventure' AND o.region_code = 'RUN'
  AND NOT EXISTS (
    SELECT 1 FROM object_classification oc
    WHERE oc.object_id = o.id AND oc.scheme_id = s.id AND oc.value_id = v.id
  );

-- Dimitile Hôtel → LBL_QUALITE_TOURISME (V5 canonical; replaces retired code qualite_tourisme)
INSERT INTO object_classification (object_id, scheme_id, value_id, created_at, updated_at)
SELECT o.id, s.id, v.id, NOW(), NOW()
FROM object o
JOIN ref_classification_scheme s ON s.code = 'LBL_QUALITE_TOURISME'
JOIN ref_classification_value  v ON v.scheme_id = s.id AND v.code = 'granted'
WHERE o.object_type = 'HOT' AND o.name = 'Dimitile Hôtel' AND o.region_code = 'RUN'
  AND NOT EXISTS (
    SELECT 1 FROM object_classification oc
    WHERE oc.object_id = o.id AND oc.scheme_id = s.id AND oc.value_id = v.id
  );

-- Dimitile Hôtel → qualite_tourisme_reunion
INSERT INTO object_classification (object_id, scheme_id, value_id, created_at, updated_at)
SELECT o.id, s.id, v.id, NOW(), NOW()
FROM object o
JOIN ref_classification_scheme s ON s.code = 'qualite_tourisme_reunion'
JOIN ref_classification_value  v ON v.scheme_id = s.id AND v.code = 'granted'
WHERE o.object_type = 'HOT' AND o.name = 'Dimitile Hôtel' AND o.region_code = 'RUN'
  AND NOT EXISTS (
    SELECT 1 FROM object_classification oc
    WHERE oc.object_id = o.id AND oc.scheme_id = s.id AND oc.value_id = v.id
  );

-- La Cité du Volcan → LBL_QUALITE_TOURISME (V5 canonical; replaces retired code qualite_tourisme)
INSERT INTO object_classification (object_id, scheme_id, value_id, created_at, updated_at)
SELECT o.id, s.id, v.id, NOW(), NOW()
FROM object o
JOIN ref_classification_scheme s ON s.code = 'LBL_QUALITE_TOURISME'
JOIN ref_classification_value  v ON v.scheme_id = s.id AND v.code = 'granted'
WHERE o.object_type = 'LOI' AND o.name = 'La Cité du Volcan' AND o.region_code = 'RUN'
  AND NOT EXISTS (
    SELECT 1 FROM object_classification oc
    WHERE oc.object_id = o.id AND oc.scheme_id = s.id AND oc.value_id = v.id
  );

-- La Cité du Volcan → qualite_tourisme_reunion
INSERT INTO object_classification (object_id, scheme_id, value_id, created_at, updated_at)
SELECT o.id, s.id, v.id, NOW(), NOW()
FROM object o
JOIN ref_classification_scheme s ON s.code = 'qualite_tourisme_reunion'
JOIN ref_classification_value  v ON v.scheme_id = s.id AND v.code = 'granted'
WHERE o.object_type = 'LOI' AND o.name = 'La Cité du Volcan' AND o.region_code = 'RUN'
  AND NOT EXISTS (
    SELECT 1 FROM object_classification oc
    WHERE oc.object_id = o.id AND oc.scheme_id = s.id AND oc.value_id = v.id
  );


-- ---------------------------------------------------------------------------
-- SECTION 12 — OBJECT_AMENITY (45 lignes)
-- Source : Prestations sur place — prétraitement token-by-token validé dans lot1_mapping_decisions.md §8
-- Tokens déférés non insérés : grand espace, espace de restauration/restauration (ambigus),
--   vue montagne (env tag), matériel pour l'activité, visites pédagogiques, parking autocar,
--   bouilloire, cuisine au bois, sur réservation, Cuisine de produits frais locaux
-- ---------------------------------------------------------------------------

-- La Kaz (RES) — parking
INSERT INTO object_amenity (object_id, amenity_id, created_at)
SELECT o.id, a.id, NOW()
FROM object o JOIN ref_amenity a ON a.code IN ('parking')
WHERE o.name = 'La Kaz' AND o.object_type = 'RES' AND o.region_code = 'RUN'
ON CONFLICT (object_id, amenity_id) DO NOTHING;

-- Le Gadjak (RES) — terrasse, ventilateur
INSERT INTO object_amenity (object_id, amenity_id, created_at)
SELECT o.id, a.id, NOW()
FROM object o JOIN ref_amenity a ON a.code IN ('common_terrace','fan')
WHERE o.name = 'Le Gadjak' AND o.object_type = 'RES' AND o.region_code = 'RUN'
ON CONFLICT (object_id, amenity_id) DO NOTHING;

-- Côté Volcan (HLO) — chauffage, sanitaires privés
INSERT INTO object_amenity (object_id, amenity_id, created_at)
SELECT o.id, a.id, NOW()
FROM object o JOIN ref_amenity a ON a.code IN ('heating','private_bathroom')
WHERE o.name = 'Côté Volcan' AND o.object_type = 'HLO' AND o.region_code = 'RUN'
ON CONFLICT (object_id, amenity_id) DO NOTHING;

-- Domaine Paille en Queue - Sud Sauvage (HLO) — climatisation, parking, TV satellite, wifi, piscine
INSERT INTO object_amenity (object_id, amenity_id, created_at)
SELECT o.id, a.id, NOW()
FROM object o JOIN ref_amenity a ON a.code IN ('air_conditioning','parking','tv','wifi','swimming_pool')
WHERE o.name = 'Domaine Paille en Queue - Sud Sauvage' AND o.object_type = 'HLO' AND o.region_code = 'RUN'
ON CONFLICT (object_id, amenity_id) DO NOTHING;

-- Gîte Là-Haut (HLO) — barbecue, chauffage, parking, sanitaires privés
-- Tokens déférés : espace de restauration / restauration (ambigus), parking autocar (pas de code),
--   grand espace (qualitatif), vue montagne (env tag domain), cuisine au bois, sur réservation
INSERT INTO object_amenity (object_id, amenity_id, created_at)
SELECT o.id, a.id, NOW()
FROM object o JOIN ref_amenity a ON a.code IN ('bbq','heating','parking','private_bathroom')
WHERE o.name = 'Gîte Là-Haut' AND o.object_type = 'HLO' AND o.region_code = 'RUN'
ON CONFLICT (object_id, amenity_id) DO NOTHING;

-- Ascendance Parapente (ACT) — sanitaires communs
-- Token déféré : matériel pour l'activité (équipement ACT-spécifique, pas un amenity générique)
INSERT INTO object_amenity (object_id, amenity_id, created_at)
SELECT o.id, a.id, NOW()
FROM object o JOIN ref_amenity a ON a.code IN ('shared_bathroom')
WHERE o.name = 'Ascendance Parapente' AND o.object_type = 'ACT' AND o.region_code = 'RUN'
ON CONFLICT (object_id, amenity_id) DO NOTHING;

-- Canyon Aventure (ACT) — aucun amenity insertable (seul token = grand espace, déféré)

-- Maison du Curcuma (ACT) — boutique
-- Token déféré : visites pédagogiques (offre de service, pas un amenity)
INSERT INTO object_amenity (object_id, amenity_id, created_at)
SELECT o.id, a.id, NOW()
FROM object o JOIN ref_amenity a ON a.code IN ('boutique')
WHERE o.name = 'Maison du Curcuma' AND o.object_type = 'ACT' AND o.region_code = 'RUN'
ON CONFLICT (object_id, amenity_id) DO NOTHING;

-- Dimitile Hôtel (HOT) — 29 amenities
-- Tokens déférés : bouilloire (pas de code), espace de restauration / restauration (ambigus),
--   vue montagne (env tag domain), SPA dédupliqué sur spa (même code qu'espace spa - bien être)
INSERT INTO object_amenity (object_id, amenity_id, created_at)
SELECT o.id, a.id, NOW()
FROM object o JOIN ref_amenity a ON a.code IN (
  'breakfast','coffee_machine','shower','bathtub',
  'fan','massage','dining_room','common_terrace','outdoor_furniture','balcony',
  'toiletries','bed_linen','towels','board_games',
  'spa','swimming_pool','bar',
  'air_conditioning','garden','parking','telephone','tv','wifi',
  'safe','minibar','pressing','laundry','luggage_storage','reception'
)
WHERE o.name = 'Dimitile Hôtel' AND o.object_type = 'HOT' AND o.region_code = 'RUN'
ON CONFLICT (object_id, amenity_id) DO NOTHING;

-- La Cité du Volcan (LOI) — Prestations sur place vide, aucun amenity inséré

-- ---------------------------------------------------------------------------
-- SECTION 13 — OBJECT_PAYMENT_METHOD (23 lignes)
-- Source : Mode de paiement — mapping validé dans lot1_mapping_decisions.md §7
-- Normalisation : Eurocard → mastercard (réseau fusionné)
--                 Chèques vacances → cheque_vacances (ANCV)
--                 Tickets restaurant → tickets_restaurant (Sodexo/Edenred/Up)
-- La Cité du Volcan : champ vide — aucune ligne insérée
-- ---------------------------------------------------------------------------

-- La Kaz (RES) — Carte Bancaire, Eurocard→mastercard, Chèque, Tickets restaurant, Espèces
INSERT INTO object_payment_method (object_id, payment_method_id, created_at)
SELECT o.id, pm.id, NOW()
FROM object o
JOIN ref_code_payment_method pm ON pm.code IN ('carte_bleue','mastercard','cheque','tickets_restaurant','especes')
WHERE o.name = 'La Kaz' AND o.object_type = 'RES' AND o.region_code = 'RUN'
ON CONFLICT (object_id, payment_method_id) DO NOTHING;

-- Le Gadjak (RES) — Carte Bancaire, Chèque, Tickets restaurant, Espèces
INSERT INTO object_payment_method (object_id, payment_method_id, created_at)
SELECT o.id, pm.id, NOW()
FROM object o
JOIN ref_code_payment_method pm ON pm.code IN ('carte_bleue','cheque','tickets_restaurant','especes')
WHERE o.name = 'Le Gadjak' AND o.object_type = 'RES' AND o.region_code = 'RUN'
ON CONFLICT (object_id, payment_method_id) DO NOTHING;

-- Côté Volcan (HLO) — Chèque, Espèces
INSERT INTO object_payment_method (object_id, payment_method_id, created_at)
SELECT o.id, pm.id, NOW()
FROM object o
JOIN ref_code_payment_method pm ON pm.code IN ('cheque','especes')
WHERE o.name = 'Côté Volcan' AND o.object_type = 'HLO' AND o.region_code = 'RUN'
ON CONFLICT (object_id, payment_method_id) DO NOTHING;

-- Domaine Paille en Queue - Sud Sauvage (HLO) — Virement bancaire
INSERT INTO object_payment_method (object_id, payment_method_id, created_at)
SELECT o.id, pm.id, NOW()
FROM object o
JOIN ref_code_payment_method pm ON pm.code IN ('virement')
WHERE o.name = 'Domaine Paille en Queue - Sud Sauvage' AND o.object_type = 'HLO' AND o.region_code = 'RUN'
ON CONFLICT (object_id, payment_method_id) DO NOTHING;

-- Gîte Là-Haut (HLO) — Espèces
INSERT INTO object_payment_method (object_id, payment_method_id, created_at)
SELECT o.id, pm.id, NOW()
FROM object o
JOIN ref_code_payment_method pm ON pm.code IN ('especes')
WHERE o.name = 'Gîte Là-Haut' AND o.object_type = 'HLO' AND o.region_code = 'RUN'
ON CONFLICT (object_id, payment_method_id) DO NOTHING;

-- Ascendance Parapente (ACT) — Chèque, Espèces
INSERT INTO object_payment_method (object_id, payment_method_id, created_at)
SELECT o.id, pm.id, NOW()
FROM object o
JOIN ref_code_payment_method pm ON pm.code IN ('cheque','especes')
WHERE o.name = 'Ascendance Parapente' AND o.object_type = 'ACT' AND o.region_code = 'RUN'
ON CONFLICT (object_id, payment_method_id) DO NOTHING;

-- Canyon Aventure (ACT) — Chèque, Chèques vacances, Espèces
INSERT INTO object_payment_method (object_id, payment_method_id, created_at)
SELECT o.id, pm.id, NOW()
FROM object o
JOIN ref_code_payment_method pm ON pm.code IN ('cheque','cheque_vacances','especes')
WHERE o.name = 'Canyon Aventure' AND o.object_type = 'ACT' AND o.region_code = 'RUN'
ON CONFLICT (object_id, payment_method_id) DO NOTHING;

-- Maison du Curcuma (ACT) — Chèque, Espèces
INSERT INTO object_payment_method (object_id, payment_method_id, created_at)
SELECT o.id, pm.id, NOW()
FROM object o
JOIN ref_code_payment_method pm ON pm.code IN ('cheque','especes')
WHERE o.name = 'Maison du Curcuma' AND o.object_type = 'ACT' AND o.region_code = 'RUN'
ON CONFLICT (object_id, payment_method_id) DO NOTHING;

-- Dimitile Hôtel (HOT) — Carte Bancaire, Chèque, Espèces
INSERT INTO object_payment_method (object_id, payment_method_id, created_at)
SELECT o.id, pm.id, NOW()
FROM object o
JOIN ref_code_payment_method pm ON pm.code IN ('carte_bleue','cheque','especes')
WHERE o.name = 'Dimitile Hôtel' AND o.object_type = 'HOT' AND o.region_code = 'RUN'
ON CONFLICT (object_id, payment_method_id) DO NOTHING;

-- La Cité du Volcan (LOI) — champ Mode de paiement vide, aucune ligne insérée

-- ---------------------------------------------------------------------------
-- SECTION 14 — OBJECT_MEETING_ROOM (1 ligne — Dimitile Hôtel)
-- Source : Prestations sur place token 'salle de réunion - séminaire'
-- Décision : object_meeting_room est la destination canonique (pas object_amenity).
-- Aucune donnée de capacité disponible dans la source CSV — présence signalée uniquement.
-- Les champs cap_theatre / cap_u / cap_classroom / cap_boardroom / area_m2 restent NULL.
-- ---------------------------------------------------------------------------

INSERT INTO object_meeting_room (object_id, name, created_at, updated_at)
SELECT o.id, 'Salle de réunion / Séminaire', NOW(), NOW()
FROM object o
WHERE o.name = 'Dimitile Hôtel' AND o.object_type = 'HOT' AND o.region_code = 'RUN'
AND NOT EXISTS (
  SELECT 1 FROM object_meeting_room mr WHERE mr.object_id = o.id
);

-- ---------------------------------------------------------------------------
-- SECTION 15 — OBJECT_ENVIRONMENT_TAG (7 lignes — 5 établissements)
-- Source : Prestations à proximité — destination 1 validée dans lot1_mapping_decisions.md §9.2
-- 5 codes utilisés : centre_ville · vue_panoramique · foret · riviere (nouveau 2026-03-21) · plage
-- 'plage' : non présent dans les données source des 10 fiches pilotes
-- Tokens déférés (object_relation [nearby]) : sentier de randonnée, équitation, VTT, pêche,
--   sites touristiques, site / lieu culturel — cibles ITI/PNA/LOI absentes à ce stade
-- Tokens exclus (POI externe/géospatial) : commerce alimentaire, parking public, arrêt bus,
--   poste, station service, boulangerie
-- Bassin de Manapany (Canyon Aventure) : site nommé, déféré vers object_relation [nearby] → PNA
-- point chaud : ambigu, déféré
-- ---------------------------------------------------------------------------

-- Le Gadjak (RES) — Centre - Ville → centre_ville
INSERT INTO object_environment_tag (object_id, environment_tag_id, created_at)
SELECT o.id, et.id, NOW()
FROM object o
JOIN ref_code_environment_tag et ON et.code = 'centre_ville'
WHERE o.name = 'Le Gadjak' AND o.object_type = 'RES' AND o.region_code = 'RUN'
ON CONFLICT (object_id, environment_tag_id) DO NOTHING;

-- Gîte Là-Haut (HLO) — point de vue panoramique → vue_panoramique ; forêt → foret
INSERT INTO object_environment_tag (object_id, environment_tag_id, created_at)
SELECT o.id, et.id, NOW()
FROM object o
JOIN ref_code_environment_tag et ON et.code IN ('vue_panoramique','foret')
WHERE o.name = 'Gîte Là-Haut' AND o.object_type = 'HLO' AND o.region_code = 'RUN'
ON CONFLICT (object_id, environment_tag_id) DO NOTHING;

-- Canyon Aventure (ACT) — riviere (token source = 'riviere', déjà sans accent)
INSERT INTO object_environment_tag (object_id, environment_tag_id, created_at)
SELECT o.id, et.id, NOW()
FROM object o
JOIN ref_code_environment_tag et ON et.code = 'riviere'
WHERE o.name = 'Canyon Aventure' AND o.object_type = 'ACT' AND o.region_code = 'RUN'
ON CONFLICT (object_id, environment_tag_id) DO NOTHING;

-- Maison du Curcuma (ACT) — point de vue panoramique → vue_panoramique
INSERT INTO object_environment_tag (object_id, environment_tag_id, created_at)
SELECT o.id, et.id, NOW()
FROM object o
JOIN ref_code_environment_tag et ON et.code = 'vue_panoramique'
WHERE o.name = 'Maison du Curcuma' AND o.object_type = 'ACT' AND o.region_code = 'RUN'
ON CONFLICT (object_id, environment_tag_id) DO NOTHING;

-- Dimitile Hôtel (HOT) — point de vue panoramique → vue_panoramique ; Centre - Ville → centre_ville
INSERT INTO object_environment_tag (object_id, environment_tag_id, created_at)
SELECT o.id, et.id, NOW()
FROM object o
JOIN ref_code_environment_tag et ON et.code IN ('vue_panoramique','centre_ville')
WHERE o.name = 'Dimitile Hôtel' AND o.object_type = 'HOT' AND o.region_code = 'RUN'
ON CONFLICT (object_id, environment_tag_id) DO NOTHING;

-- =============================================================================
-- FIN DU FICHIER lot1_pilot_inserts.sql
-- Prochaines étapes :
--   1. Ajouter ref_classification_value 'granted' pour LBL_ECO_LABEL_UE dans seeds_data.sql
--   2. Décider du schéma 'gites_de_france_member' (Côté Volcan, Gîte Là-Haut)
--   3. Valider en staging avant exécution production.
--   4. Lot suivant : object_relation [nearby] pour les tokens Prestations à proximité
--      une fois les objets ITI / PNA / LOI cibles chargés.
-- =============================================================================