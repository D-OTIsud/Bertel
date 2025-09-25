-- =====================================================
-- DONNÉES DE SEED RÉALISTES - SUPABASE
-- =====================================================
-- Données d'exemple pour tester le schéma unifié
-- Inclut des cas limites et des données ambigües

-- =====================================================
-- 1. SEED DES TABLES DE RÉFÉRENCE
-- =====================================================

-- Langues (déjà peuplées dans migration_plan.sql)
-- Ajout de langues supplémentaires
INSERT INTO ref_language (code, name, native_name) VALUES
('rcf', 'Créole réunionnais', 'Kréol réyoné'),
('hi', 'Hindi', 'हिन्दी'),
('ta', 'Tamoul', 'தமிழ்'),
('zh', 'Chinois', '中文')
ON CONFLICT (code) DO NOTHING;

-- Kinds de contact
INSERT INTO ref_code (domain, code, name) VALUES
 ('contact_kind','phone','Téléphone'),
 ('contact_kind','mobile','Mobile'),
 ('contact_kind','email','Email'),
 ('contact_kind','website','Site web')
ON CONFLICT DO NOTHING;

-- Jours de semaine (pour ouvertures riches)
INSERT INTO ref_code (domain, code, name, position) VALUES
 ('weekday','monday','Lundi',1),
 ('weekday','tuesday','Mardi',2),
 ('weekday','wednesday','Mercredi',3),
 ('weekday','thursday','Jeudi',4),
 ('weekday','friday','Vendredi',5),
 ('weekday','saturday','Samedi',6),
 ('weekday','sunday','Dimanche',7)
ON CONFLICT DO NOTHING;

-- Type de planning d'ouverture
INSERT INTO ref_code (domain, code, name) VALUES
 ('opening_schedule_type','regular','Régulier')
ON CONFLICT DO NOTHING;

-- Types de média
INSERT INTO ref_code (domain, code, name) VALUES
 ('media_type','photo','Photo'),
 ('media_type','video','Vidéo')
ON CONFLICT DO NOTHING;

-- Familles d'équipements
INSERT INTO ref_code (domain, code, name) VALUES
 ('amenity_family','comforts','Conforts'),
 ('amenity_family','services','Services'),
 ('amenity_family','equipment','Équipements')
ON CONFLICT DO NOTHING;

-- Moyens de paiement supplémentaires
INSERT INTO ref_code (domain, code, name, description) VALUES
('payment_method','cheque_vacances', 'Chèques vacances', 'Chèques vacances ANCV'),
('payment_method','carte_bleue', 'Carte Bleue', 'Carte Bleue française'),
('payment_method','mastercard', 'Mastercard', 'Carte Mastercard'),
('payment_method','visa', 'Visa', 'Carte Visa'),
('payment_method','american_express', 'American Express', 'Carte American Express')
ON CONFLICT DO NOTHING;

-- Rôles de contact de base
INSERT INTO ref_contact_role (code, name, description) VALUES
('reservation', 'Réservation', 'Contact pour réservations'),
('management', 'Management', 'Direction / management'),
('press', 'Presse', 'Relations presse'),
('technical', 'Technique', 'Support technique / IT'),
('sales', 'Commercial', 'Ventes / commercial'),
('info', 'Information', 'Informations générales')
ON CONFLICT (code) DO NOTHING;

-- Tags d'environnement supplémentaires
INSERT INTO ref_code (domain, code, name, description) VALUES
('environment_tag','volcan', 'Au pied du volcan', 'Situé au pied du Piton de la Fournaise'),
('environment_tag','plage', 'Plage', 'Proche d''une plage'),

-- Types de cuisine
INSERT INTO ref_code (domain, code, name, description) VALUES
('cuisine_type','creole', 'Créole', 'Cuisine créole réunionnaise traditionnelle'),
('cuisine_type','metropolitan', 'Métropolitaine', 'Cuisine française métropolitaine'),
('cuisine_type','chinese', 'Chinoise', 'Cuisine chinoise traditionnelle'),
('cuisine_type','indian', 'Indienne', 'Cuisine indienne et tamoule'),
('cuisine_type','traditional', 'Traditionnelle', 'Cuisine traditionnelle réunionnaise'),
('cuisine_type','international', 'Internationale', 'Cuisine internationale'),
('cuisine_type','fusion', 'Fusion', 'Cuisine fusion créole-moderne'),
('cuisine_type','fast_food', 'Fast Food', 'Restauration rapide'),
('cuisine_type','street_food', 'Street Food', 'Cuisine de rue'),
('cuisine_type','gourmet', 'Gastronomique', 'Cuisine gastronomique de qualité')
ON CONFLICT DO NOTHING;

-- Catégories de menu
INSERT INTO ref_code (domain, code, name, description) VALUES
('menu_category','entree', 'Entrées', 'Entrées et apéritifs'),
('menu_category','main', 'Plats principaux', 'Plats principaux et spécialités'),
('menu_category','dessert', 'Desserts', 'Desserts et douceurs'),
('menu_category','drinks', 'Boissons', 'Boissons et cocktails'),
('menu_category','snacks', 'En-cas', 'En-cas et collations')
ON CONFLICT DO NOTHING;

-- Tags alimentaires
INSERT INTO ref_code (domain, code, name, description) VALUES
('dietary_tag','vegetarian', 'Végétarien', 'Sans viande ni poisson'),
('dietary_tag','vegan', 'Végan', 'Sans produits d''origine animale'),
('dietary_tag','halal', 'Halal', 'Conforme aux règles alimentaires islamiques'),
('dietary_tag','kosher', 'Casher', 'Conforme aux règles alimentaires juives'),
('dietary_tag','gluten_free', 'Sans gluten', 'Sans gluten'),
('dietary_tag','organic', 'Bio', 'Produits biologiques'),
('dietary_tag','local', 'Local', 'Produits locaux de La Réunion')
ON CONFLICT DO NOTHING;

-- Allergènes
INSERT INTO ref_code (domain, code, name, description) VALUES
('allergen','gluten', 'Gluten', 'Contient du gluten'),
('allergen','nuts', 'Fruits à coque', 'Contient des fruits à coque'),
('allergen','dairy', 'Lait', 'Contient du lait'),
('allergen','eggs', 'Œufs', 'Contient des œufs'),
('allergen','fish', 'Poisson', 'Contient du poisson'),
('allergen','shellfish', 'Crustacés', 'Contient des crustacés'),
('allergen','soy', 'Soja', 'Contient du soja'),
('allergen','sesame', 'Sésame', 'Contient du sésame')
ON CONFLICT DO NOTHING;

-- Tags d'environnement supplémentaires (suite)
INSERT INTO ref_code (domain, code, name, description) VALUES
('environment_tag','lagon', 'Lagon', 'Proche du lagon'),
('environment_tag','cascade', 'Cascade', 'Proche d''une cascade'),
('environment_tag','jardin', 'Jardin', 'Avec jardin'),
('environment_tag','terrasse', 'Terrasse', 'Avec terrasse'),
('environment_tag','vue_panoramique', 'Vue panoramique', 'Vue panoramique'),
('environment_tag','calme', 'Calme', 'Endroit calme'),
('environment_tag','anime', 'Animé', 'Endroit animé'),
('environment_tag','bord_mer', 'Bord de mer', NULL),
('environment_tag','ville', 'En ville', NULL),
('environment_tag','montagne', 'Montagne', NULL)
ON CONFLICT DO NOTHING;

-- Équipements utilisés par les seeds (via family_id)
INSERT INTO ref_amenity (code, name, family_id, description)
SELECT v.code, v.name, fam.id, v.description
FROM (
  VALUES
    ('tv','Télévision','equipment','Télévision dans les chambres'),
    ('wifi','Wi-Fi','equipment','Accès Wi‑Fi'),
    ('piscine','Piscine','equipment','Piscine'),
    ('restaurant','Restaurant','services','Restaurant sur place'),
    ('coffre','Coffre-fort','equipment','Coffre-fort'),
    ('materiel_bebe','Matériel bébé','services','Lit bébé / chaise haute'),
    ('bar','Bar','services','Bar'),
    ('location_velo','Location de vélo','services','Location de vélos'),
    ('snorkeling','Snorkeling','equipment','Matériel de snorkeling'),
    ('barbecue','Barbecue','equipment','Barbecue à disposition')
) AS v(code,name,fam_code,description)
JOIN ref_code_amenity_family fam ON fam.code = v.fam_code
ON CONFLICT (code) DO NOTHING;

-- Types HOT via ref_classification_scheme/value
INSERT INTO ref_classification_scheme (code, name) VALUES ('type_hot','Type d''hôtel')
ON CONFLICT (code) DO NOTHING;
INSERT INTO ref_classification_value (scheme_id, code, name)
SELECT rcs.id, v.code, v.name
FROM ref_classification_scheme rcs,
     (VALUES
       ('hotel','Hôtel'),
       ('hotel_restaurant','Hôtel-restaurant'),
       ('hotel_boutique','Hôtel boutique'),
       ('hotel_ecologique','Hôtel écologique'),
       ('hotel_historique','Hôtel historique'),
       ('hotel_moderne','Hôtel moderne'),
       ('hotel_traditionnel','Hôtel traditionnel'),
       ('hotel_familial','Hôtel familial'),
       ('hotel_romantique','Hôtel romantique'),
       ('hotel_affaires','Hôtel d''affaires')
     ) AS v(code,name)
WHERE rcs.code='type_hot'
ON CONFLICT (scheme_id, code) DO NOTHING;

-- =====================================================
-- 2. SEED D'OBJETS D'EXEMPLE
-- =====================================================

-- Hôtel 1: Hôtel de test générique
DO $$
DECLARE
  hotel_id TEXT;
  v_period UUID;
  v_schedule UUID;
  v_tp UUID;
BEGIN
    -- Objet principal (ID auto-généré via trigger)
    INSERT INTO object (object_type, name, region_code, status)
    VALUES ('HOT', 'Hôtel de Test 1', 'RUN', 'published')
    RETURNING id INTO hotel_id;
    
    -- Localisation/Adresse unifiée (principale)
    INSERT INTO object_location (object_id, address1, postcode, city, code_insee, latitude, longitude, is_main_location)
    VALUES (hotel_id, '123 Rue de la Plage', '97400', 'Saint-Denis', '97400', -20.8789, 55.4481, TRUE)
    ON CONFLICT ON CONSTRAINT uq_object_location_main DO UPDATE SET
        address1 = EXCLUDED.address1,
        postcode = EXCLUDED.postcode,
        city = EXCLUDED.city,
        code_insee = EXCLUDED.code_insee,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude;
    
    -- Canaux de contact
    INSERT INTO contact_channel (object_id, kind_id, value, is_primary, position)
    SELECT hotel_id, k.id, '+262 262 12 34 56', TRUE, 1 FROM ref_code_contact_kind k WHERE k.code='phone'
    ON CONFLICT (object_id, kind_id, value) DO NOTHING;
    INSERT INTO contact_channel (object_id, kind_id, value, is_primary, position)
    SELECT hotel_id, k.id, 'https://www.hoteltest1.re', TRUE, 1 FROM ref_code_contact_kind k WHERE k.code='website'
    ON CONFLICT (object_id, kind_id, value) DO NOTHING;
    
    -- Type HOT via object_classification (upsert without unique constraint)
    UPDATE object_classification oc
    SET value_id = rcv.id
    FROM ref_classification_scheme rcs
    JOIN ref_classification_value rcv ON rcv.scheme_id = rcs.id AND rcv.code = 'hotel'
    WHERE rcs.code = 'type_hot'
      AND oc.object_id = hotel_id
      AND oc.scheme_id = rcs.id;

    INSERT INTO object_classification (object_id, scheme_id, value_id)
    SELECT hotel_id, rcs.id, rcv.id
    FROM ref_classification_scheme rcs
    JOIN ref_classification_value rcv ON rcv.scheme_id = rcs.id AND rcv.code = 'hotel'
    WHERE rcs.code = 'type_hot'
      AND NOT EXISTS (
        SELECT 1 FROM object_classification oc
        WHERE oc.object_id = hotel_id AND oc.scheme_id = rcs.id
      );
    
    -- Capacités (extensibles)
    INSERT INTO ref_capacity_metric (code, name, unit) VALUES
      ('total_rooms','Nombre total de chambres','rooms')
    ON CONFLICT (code) DO NOTHING;
    INSERT INTO ref_capacity_metric (code, name, unit) VALUES
      ('total_beds','Nombre total de lits','beds')
    ON CONFLICT (code) DO NOTHING;
    INSERT INTO object_capacity (object_id, metric_id, value_integer)
    SELECT hotel_id, id, 25 FROM ref_capacity_metric WHERE code='total_rooms'
    ON CONFLICT (object_id, metric_id) DO UPDATE SET value_integer = EXCLUDED.value_integer;
    INSERT INTO object_capacity (object_id, metric_id, value_integer)
    SELECT hotel_id, id, 50 FROM ref_capacity_metric WHERE code='total_beds'
    ON CONFLICT (object_id, metric_id) DO UPDATE SET value_integer = EXCLUDED.value_integer;
    
    -- Classification already ensured above
    
    -- Langues
    INSERT INTO object_language (object_id, language_id)
    SELECT hotel_id, id FROM ref_language WHERE code IN ('fr', 'en')
    ON CONFLICT (object_id, language_id) DO NOTHING;
    
    -- Moyens de paiement
    INSERT INTO object_payment_method (object_id, payment_method_id)
    SELECT hotel_id, id FROM ref_code_payment_method WHERE code IN ('carte_bleue','visa','mastercard')
    ON CONFLICT (object_id, payment_method_id) DO NOTHING;
    
    -- Équipements
    INSERT INTO object_amenity (object_id, amenity_id)
    SELECT hotel_id, id FROM ref_amenity WHERE code IN ('tv', 'wifi', 'piscine', 'restaurant')
    ON CONFLICT (object_id, amenity_id) DO NOTHING;
    
    -- Tags d'environnement
    INSERT INTO object_environment_tag (object_id, environment_tag_id)
    SELECT hotel_id, id FROM ref_code_environment_tag WHERE code IN ('bord_mer','ville')
    ON CONFLICT (object_id, environment_tag_id) DO NOTHING;
    
    -- Médias
    INSERT INTO media (object_id, media_type_id, title, credit, url, is_main, position)
    SELECT hotel_id, mt.id, 'Photo hôtel test 1', 'Hôtel Test', 'https://example.com/photo1.jpg', TRUE, 1
    FROM ref_code_media_type mt WHERE mt.code='photo'
    ON CONFLICT DO NOTHING;
    
    -- Informations légales
    INSERT INTO legal (object_id, siret)
    VALUES (hotel_id, '12345678901234')
    ON CONFLICT (object_id) DO UPDATE SET
        siret = EXCLUDED.siret;
    
    -- Ouvertures riches: Lun-Sam 09:00-18:00 toute l'année courante
    INSERT INTO opening_period (object_id, name, date_start, date_end)
    VALUES (hotel_id, 'Horaires annuels', DATE_TRUNC('year', CURRENT_DATE), (DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '1 year' - INTERVAL '1 day')::date)
    RETURNING id INTO v_period;

    INSERT INTO opening_schedule (period_id, schedule_type_id, name)
    SELECT v_period, t.id, 'Horaires réguliers' FROM ref_code_opening_schedule_type t WHERE t.code='regular'
    RETURNING id INTO v_schedule;

    INSERT INTO opening_time_period (schedule_id, closed, note)
    VALUES (v_schedule, FALSE, NULL)
    RETURNING id INTO v_tp;

    INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, w.id FROM ref_code_weekday w WHERE w.code IN ('monday','tuesday','wednesday','thursday','friday','saturday');
    INSERT INTO opening_time_frame (time_period_id, start_time, end_time) VALUES (v_tp, TIME '09:00', TIME '18:00');

    RAISE NOTICE 'Hôtel de test 1 créé avec ID: %', hotel_id;
END $$;

-- Hôtel 2: Hôtel de test générique
DO $$
DECLARE
    hotel_id TEXT;
    v_period UUID;
    v_schedule UUID;
    v_tp UUID;
BEGIN
    -- Objet principal (ID auto-généré via trigger)
    INSERT INTO object (object_type, name, region_code, status, updated_at_source, created_at, updated_at)
    VALUES ('HOT', 'Hôtel de Test 2', 'RUN', 'published', NOW(), NOW(), NOW())
    RETURNING id INTO hotel_id;
    
    -- Localisation/Adresse unifiée (principale)
    INSERT INTO object_location (object_id, address1, postcode, city, code_insee, latitude, longitude, is_main_location)
    VALUES (hotel_id, '456 Avenue de la République', '97400', 'Saint-Denis', '97400', -20.9000, 55.4500, TRUE)
    ON CONFLICT ON CONSTRAINT uq_object_location_main DO UPDATE SET
        address1 = EXCLUDED.address1,
        postcode = EXCLUDED.postcode,
        city = EXCLUDED.city,
        code_insee = EXCLUDED.code_insee,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude;
    
    -- Canaux de contact
    INSERT INTO contact_channel (object_id, kind_id, value, is_primary, position)
    SELECT hotel_id, k.id, '+262 262 98 76 54', TRUE, 1 FROM ref_code_contact_kind k WHERE k.code='phone'
    ON CONFLICT (object_id, kind_id, value) DO NOTHING;
    INSERT INTO contact_channel (object_id, kind_id, value, is_primary, position)
    SELECT hotel_id, k.id, '+262 692 12 34 56', FALSE, 2 FROM ref_code_contact_kind k WHERE k.code='phone'
    ON CONFLICT (object_id, kind_id, value) DO NOTHING;
    INSERT INTO contact_channel (object_id, kind_id, value, is_primary, position)
    SELECT hotel_id, k.id, 'contact@hoteltest2.re', TRUE, 1 FROM ref_code_contact_kind k WHERE k.code='email'
    ON CONFLICT (object_id, kind_id, value) DO NOTHING;
    INSERT INTO contact_channel (object_id, kind_id, value, is_primary, position)
    SELECT hotel_id, k.id, 'https://www.hoteltest2.re', TRUE, 1 FROM ref_code_contact_kind k WHERE k.code='website'
    ON CONFLICT (object_id, kind_id, value) DO NOTHING;
    
    -- Classification préfectorale (2 étoiles)
    UPDATE object_classification oc
    SET value_id = rcv.id
    FROM ref_classification_scheme rcs
    JOIN ref_classification_value rcv ON rcv.scheme_id = rcs.id AND rcv.code = '2e'
    WHERE rcs.code = 'prefectoral'
      AND oc.object_id = hotel_id
      AND oc.scheme_id = rcs.id;

    INSERT INTO object_classification (object_id, scheme_id, value_id)
    SELECT hotel_id, rcs.id, rcv.id
    FROM ref_classification_scheme rcs
    JOIN ref_classification_value rcv ON rcv.scheme_id = rcs.id AND rcv.code = '2e'
    WHERE rcs.code = 'prefectoral'
      AND NOT EXISTS (
        SELECT 1 FROM object_classification oc
        WHERE oc.object_id = hotel_id AND oc.scheme_id = rcs.id
      );
    
    -- Capacités (extensibles)
    INSERT INTO ref_capacity_metric (code, name, unit) VALUES
      ('family_rooms','Chambres familiales','rooms')
    ON CONFLICT (code) DO NOTHING;
    INSERT INTO object_capacity (object_id, metric_id, value_integer)
    SELECT hotel_id, id, 15 FROM ref_capacity_metric WHERE code='total_rooms'
    ON CONFLICT (object_id, metric_id) DO UPDATE SET value_integer = EXCLUDED.value_integer;
    INSERT INTO object_capacity (object_id, metric_id, value_integer)
    SELECT hotel_id, id, 30 FROM ref_capacity_metric WHERE code='total_beds'
    ON CONFLICT (object_id, metric_id) DO UPDATE SET value_integer = EXCLUDED.value_integer;
    INSERT INTO object_capacity (object_id, metric_id, value_integer)
    SELECT hotel_id, id, 2 FROM ref_capacity_metric WHERE code='family_rooms'
    ON CONFLICT (object_id, metric_id) DO UPDATE SET value_integer = EXCLUDED.value_integer;
    
    -- Type HOT via object_classification (upsert without unique constraint)
    UPDATE object_classification oc
    SET value_id = rcv.id
    FROM ref_classification_scheme rcs
    JOIN ref_classification_value rcv ON rcv.scheme_id = rcs.id AND rcv.code = 'hotel_restaurant'
    WHERE rcs.code = 'type_hot'
      AND oc.object_id = hotel_id
      AND oc.scheme_id = rcs.id;

    INSERT INTO object_classification (object_id, scheme_id, value_id)
    SELECT hotel_id, rcs.id, rcv.id
    FROM ref_classification_scheme rcs
    JOIN ref_classification_value rcv ON rcv.scheme_id = rcs.id AND rcv.code = 'hotel_restaurant'
    WHERE rcs.code = 'type_hot'
      AND NOT EXISTS (
        SELECT 1 FROM object_classification oc
        WHERE oc.object_id = hotel_id AND oc.scheme_id = rcs.id
      );
    
    -- Langues
    INSERT INTO object_language (object_id, language_id)
    SELECT hotel_id, id FROM ref_language WHERE code IN ('fr', 'en', 'rcf')
    ON CONFLICT (object_id, language_id) DO NOTHING;
    
    -- Moyens de paiement
    INSERT INTO object_payment_method (object_id, payment_method_id)
    SELECT hotel_id, id FROM ref_code_payment_method WHERE code IN ('carte_paiement', 'cheque', 'especes')
    ON CONFLICT (object_id, payment_method_id) DO NOTHING;
    
    -- Équipements
    INSERT INTO object_amenity (object_id, amenity_id)
    SELECT hotel_id, id FROM ref_amenity WHERE code IN ('wifi', 'coffre', 'materiel_bebe', 'bar', 'piscine')
    ON CONFLICT (object_id, amenity_id) DO NOTHING;
    
    -- Tags d'environnement
    INSERT INTO object_environment_tag (object_id, environment_tag_id)
    SELECT hotel_id, id FROM ref_code_environment_tag WHERE code IN ('ville', 'calme')
    ON CONFLICT (object_id, environment_tag_id) DO NOTHING;
    
    -- Médias
    INSERT INTO media (object_id, media_type_id, title, credit, url, is_main, position)
    SELECT hotel_id, mt.id, 'Photo hôtel test 2 - Vue extérieure', 'Hôtel Test', 'https://example.com/photo2-1.jpg', TRUE, 1 FROM ref_code_media_type mt WHERE mt.code='photo'
    UNION ALL
    SELECT hotel_id, mt.id, 'Photo hôtel test 2 - Chambre', 'Hôtel Test', 'https://example.com/photo2-2.jpg', FALSE, 2 FROM ref_code_media_type mt WHERE mt.code='photo'
    ON CONFLICT DO NOTHING;
    
    -- Informations légales
    INSERT INTO legal (object_id, siret)
    VALUES (hotel_id, '23456789012345')
    ON CONFLICT (object_id) DO UPDATE SET
        siret = EXCLUDED.siret;
    
    -- Ouvertures riches: toute l'année 24/7 (pas de créneaux)
    INSERT INTO opening_period (object_id, name, all_years)
    VALUES (hotel_id, 'Ouvert en continu', TRUE)
    RETURNING id INTO v_period;
    INSERT INTO opening_schedule (period_id, schedule_type_id, name)
    SELECT v_period, t.id, '24/7' FROM ref_code_opening_schedule_type t WHERE t.code='regular'
    RETURNING id INTO v_schedule;
    INSERT INTO opening_time_period (schedule_id, closed, note) VALUES (v_schedule, FALSE, 'Ouvert en continu') RETURNING id INTO v_tp;
    INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, w.id FROM ref_code_weekday w; -- tous les jours
    
    RAISE NOTICE 'Hôtel de test 2 créé avec l''ID: %', hotel_id;
END $$;

-- =====================================================
-- 3. SEED D'ACTIVITÉS (ASC)
-- =====================================================

DO $$
DECLARE
    activity_id TEXT;
BEGIN
    -- Objet principal
    INSERT INTO object (object_type, name, region_code, status)
    VALUES ('ASC', 'Activité de Test 1', 'RUN', 'published')
    RETURNING id INTO activity_id;
    
    -- Localisation/Adresse unifiée (principale)
    INSERT INTO object_location (object_id, address1, postcode, city, code_insee, latitude, longitude, is_main_location)
    VALUES (activity_id, '789 Chemin des Hauts', '97400', 'Saint-Denis', '97400', -20.8500, 55.5000, TRUE)
    ON CONFLICT ON CONSTRAINT uq_object_location_main DO UPDATE SET
        address1 = EXCLUDED.address1,
        postcode = EXCLUDED.postcode,
        city = EXCLUDED.city,
        code_insee = EXCLUDED.code_insee,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude;
    
    -- Canaux de contact
    INSERT INTO contact_channel (object_id, kind_id, value, is_primary, position)
    SELECT activity_id, k.id, '+262 262 11 22 33', TRUE, 1 FROM ref_code_contact_kind k WHERE k.code='phone'
    ON CONFLICT (object_id, kind_id, value) DO NOTHING;
    INSERT INTO contact_channel (object_id, kind_id, value, is_primary, position)
    SELECT activity_id, k.id, 'info@activitetest1.re', TRUE, 1 FROM ref_code_contact_kind k WHERE k.code='email'
    ON CONFLICT (object_id, kind_id, value) DO NOTHING;
    INSERT INTO contact_channel (object_id, kind_id, value, is_primary, position)
    SELECT activity_id, k.id, 'https://www.activitetest1.re', TRUE, 1 FROM ref_code_contact_kind k WHERE k.code='website'
    ON CONFLICT (object_id, kind_id, value) DO NOTHING;
    
    -- Langues
    INSERT INTO object_language (object_id, language_id)
    SELECT activity_id, id FROM ref_language WHERE code IN ('fr', 'en', 'rcf')
    ON CONFLICT (object_id, language_id) DO NOTHING;
    
    -- Moyens de paiement
    INSERT INTO object_payment_method (object_id, payment_method_id)
    SELECT activity_id, id FROM ref_code_payment_method WHERE code IN ('carte_paiement', 'especes', 'cheque_vacances')
    ON CONFLICT (object_id, payment_method_id) DO NOTHING;
    
    -- Équipements
    INSERT INTO object_amenity (object_id, amenity_id)
    SELECT activity_id, id FROM ref_amenity WHERE code IN ('location_velo', 'snorkeling', 'barbecue')
    ON CONFLICT (object_id, amenity_id) DO NOTHING;
    
    -- Tags d'environnement
    INSERT INTO object_environment_tag (object_id, environment_tag_id)
    SELECT activity_id, id FROM ref_code_environment_tag WHERE code IN ('montagne', 'calme', 'vue_panoramique')
    ON CONFLICT (object_id, environment_tag_id) DO NOTHING;
    
    RAISE NOTICE 'Activité de test créée avec l''ID: %', activity_id;
END $$;

-- =====================================================
-- 4. SEED DE MANIFESTATIONS (FMA)
-- =====================================================

DO $$
DECLARE
    event_id TEXT := 'FMATEST001';
BEGIN
    -- Objet principal
    INSERT INTO object (object_type, name, region_code, status)
    VALUES ('FMA', 'Manifestation de Test 1', 'RUN', 'published')
    RETURNING id INTO event_id;
    
    -- Localisation/Adresse unifiée (principale)
    INSERT INTO object_location (object_id, address1, postcode, city, code_insee, latitude, longitude, is_main_location)
    VALUES (event_id, 'Place de la Mairie', '97400', 'Saint-Denis', '97400', -20.8789, 55.4481, TRUE)
    ON CONFLICT ON CONSTRAINT uq_object_location_main DO UPDATE SET
        address1 = EXCLUDED.address1,
        postcode = EXCLUDED.postcode,
        city = EXCLUDED.city,
        code_insee = EXCLUDED.code_insee,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude;
    
    -- Objet FMA spécifique
    INSERT INTO object_fma (object_id, event_start_date, event_end_date, event_start_time, event_end_time, is_recurring)
    VALUES (event_id, '2025-07-15'::date, '2025-07-20'::date, '18:00'::time, '23:00'::time, true)
    ON CONFLICT (object_id) DO UPDATE SET
        event_start_date = EXCLUDED.event_start_date,
        event_end_date = EXCLUDED.event_end_date,
        event_start_time = EXCLUDED.event_start_time,
        event_end_time = EXCLUDED.event_end_time;
    
    -- Canaux de contact
    INSERT INTO contact_channel (object_id, kind_id, value, is_primary, position)
    SELECT event_id, k.id, '+262 262 33 44 55', TRUE, 1 FROM ref_code_contact_kind k WHERE k.code='phone'
    ON CONFLICT (object_id, kind_id, value) DO NOTHING;
    INSERT INTO contact_channel (object_id, kind_id, value, is_primary, position)
    SELECT event_id, k.id, 'contact@manifestationtest1.re', TRUE, 1 FROM ref_code_contact_kind k WHERE k.code='email'
    ON CONFLICT (object_id, kind_id, value) DO NOTHING;
    INSERT INTO contact_channel (object_id, kind_id, value, is_primary, position)
    SELECT event_id, k.id, 'https://www.manifestationtest1.re', TRUE, 1 FROM ref_code_contact_kind k WHERE k.code='website'
    ON CONFLICT (object_id, kind_id, value) DO NOTHING;
    
    -- Langues
    INSERT INTO object_language (object_id, language_id)
    SELECT event_id, id FROM ref_language WHERE code IN ('fr', 'en', 'rcf', 'hi', 'ta')
    ON CONFLICT (object_id, language_id) DO NOTHING;
    
    -- Moyens de paiement
    INSERT INTO object_payment_method (object_id, payment_method_id)
    SELECT event_id, id FROM ref_code_payment_method WHERE code IN ('carte_paiement', 'especes', 'cheque_vacances')
    ON CONFLICT (object_id, payment_method_id) DO NOTHING;
    
    -- Tags d'environnement
    INSERT INTO object_environment_tag (object_id, environment_tag_id)
    SELECT event_id, id FROM ref_code_environment_tag WHERE code IN ('ville', 'anime', 'jardin')
    ON CONFLICT (object_id, environment_tag_id) DO NOTHING;
    
    RAISE NOTICE 'Manifestation créée avec l''ID: %', event_id;
END $$;

-- =====================================================
-- 5. SEED D'ITINÉRAIRES (ITI)
-- =====================================================

DO $$
DECLARE
    itinerary_id TEXT;
BEGIN
    -- Objet principal
    INSERT INTO object (object_type, name, region_code, status)
    VALUES ('ITI', 'Itinéraire de Test 1', 'RUN', 'published')
    RETURNING id INTO itinerary_id;
    
    -- Adresse de départ
    INSERT INTO object_location (object_id, address1, postcode, city, code_insee, latitude, longitude, is_main_location)
    VALUES (itinerary_id, 'Point de départ test', '97400', 'Saint-Denis', '97400', -20.9000, 55.5000, TRUE)
    ON CONFLICT ON CONSTRAINT uq_object_location_main DO UPDATE SET
        address1 = EXCLUDED.address1,
        postcode = EXCLUDED.postcode,
        city = EXCLUDED.city,
        code_insee = EXCLUDED.code_insee,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude;
    
    -- Objet ITI spécifique
    INSERT INTO object_iti (object_id, distance_km, duration_hours, difficulty_level, elevation_gain, is_loop)
    VALUES (itinerary_id, 8.5, 4.0, 3, 500, true)
    ON CONFLICT (object_id) DO UPDATE SET
        distance_km = EXCLUDED.distance_km,
        duration_hours = EXCLUDED.duration_hours,
        difficulty_level = EXCLUDED.difficulty_level,
        elevation_gain = EXCLUDED.elevation_gain;
    
    -- Canaux de contact
    INSERT INTO contact_channel (object_id, kind_id, value, is_primary, position)
    SELECT itinerary_id, k.id, '+262 262 55 66 77', TRUE, 1 FROM ref_code_contact_kind k WHERE k.code='phone'
    ON CONFLICT (object_id, kind_id, value) DO NOTHING;
    INSERT INTO contact_channel (object_id, kind_id, value, is_primary, position)
    SELECT itinerary_id, k.id, 'info@itinerarytest1.re', TRUE, 1 FROM ref_code_contact_kind k WHERE k.code='email'
    ON CONFLICT (object_id, kind_id, value) DO NOTHING;
    INSERT INTO contact_channel (object_id, kind_id, value, is_primary, position)
    SELECT itinerary_id, k.id, 'https://www.itinerarytest1.re', TRUE, 1 FROM ref_code_contact_kind k WHERE k.code='website'
    ON CONFLICT (object_id, kind_id, value) DO NOTHING;
    
    -- Langues
    INSERT INTO object_language (object_id, language_id)
    SELECT itinerary_id, id FROM ref_language WHERE code IN ('fr', 'en', 'rcf')
    ON CONFLICT (object_id, language_id) DO NOTHING;
    
    -- Moyens de paiement
    INSERT INTO object_payment_method (object_id, payment_method_id)
    SELECT itinerary_id, id FROM ref_code_payment_method WHERE code IN ('carte_paiement', 'especes', 'cheque_vacances')
    ON CONFLICT (object_id, payment_method_id) DO NOTHING;
    
    -- Équipements
    INSERT INTO object_amenity (object_id, amenity_id)
    SELECT itinerary_id, id FROM ref_amenity WHERE code IN ('location_velo', 'snorkeling', 'barbecue')
    ON CONFLICT (object_id, amenity_id) DO NOTHING;
    
    -- Tags d'environnement
    INSERT INTO object_environment_tag (object_id, environment_tag_id)
    SELECT itinerary_id, id FROM ref_code_environment_tag WHERE code IN ('montagne', 'volcan', 'calme', 'vue_panoramique')
    ON CONFLICT (object_id, environment_tag_id) DO NOTHING;
    
    RAISE NOTICE 'Itinéraire créé avec l''ID: %', itinerary_id;
END $$;

-- =====================================================
-- 7. VÉRIFICATIONS POST-SEED
-- =====================================================

-- Vérifier que les données ont été créées
DO $$
DECLARE
    object_count INTEGER;
    address_count INTEGER;
    contact_count INTEGER;
    legacy_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO object_count FROM object;
    SELECT COUNT(*) INTO address_count FROM address;
    SELECT COUNT(*) INTO contact_count FROM contact_channel;
    legacy_count := 0;
    
    RAISE NOTICE '=== VÉRIFICATION POST-SEED ===';
    RAISE NOTICE 'Objets créés: %', object_count;
    RAISE NOTICE 'Adresses créées: %', address_count;
    RAISE NOTICE 'Canaux de contact créés: %', contact_count;
    RAISE NOTICE 'Enregistrements legacy: %', legacy_count;
    
    IF object_count >= 5 THEN
        RAISE NOTICE '✓ Seed réussi: % objets créés', object_count;
    ELSE
        RAISE NOTICE '✗ Seed échoué: seulement % objets créés', object_count;
    END IF;
END $$;

-- =====================================================
-- 7. EXEMPLES DE MENUS AVEC TYPES DE CUISINE
-- =====================================================

DO $$
DECLARE
    restaurant_id TEXT;
    menu_id UUID;
    menu_item_id UUID;
    category_id UUID;
    unit_id UUID;
    creole_type_id UUID;
    metropolitan_type_id UUID;
    chinese_type_id UUID;
    vegetarian_tag_id UUID;
    vegan_tag_id UUID;
    gluten_allergen_id UUID;
    dairy_allergen_id UUID;
BEGIN
    -- Créer un restaurant pour les exemples de menu
    SELECT api.generate_object_id('RES', 'RUN') INTO restaurant_id;
    
    INSERT INTO object (id, object_type, name, status, region_code)
    VALUES (restaurant_id, 'RES', 'Restaurant Test Cuisine', 'published', 'RUN')
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
    
    -- Créer un menu principal
    INSERT INTO object_menu (object_id, name, description, position, is_active)
    VALUES (restaurant_id, 'Menu Principal', 'Menu traditionnel créole et métropolitain', 1, TRUE)
    RETURNING id INTO menu_id;
    
    -- Récupérer les IDs des références
    SELECT id INTO category_id FROM ref_code_menu_category WHERE code = 'main';
    SELECT id INTO unit_id FROM ref_code_price_unit WHERE code = 'per_person';
    SELECT id INTO creole_type_id FROM ref_code_cuisine_type WHERE code = 'creole';
    SELECT id INTO metropolitan_type_id FROM ref_code_cuisine_type WHERE code = 'metropolitan';
    SELECT id INTO vegetarian_tag_id FROM ref_code_dietary_tag WHERE code = 'vegetarian';
    SELECT id INTO gluten_allergen_id FROM ref_code_allergen WHERE code = 'gluten';
    
    -- Plat 1: Rougail saucisse (créole)
    INSERT INTO object_menu_item (menu_id, name, description, category_id, price_amount, currency, unit_id, position, is_available)
    VALUES (menu_id, 'Rougail saucisse', 'Saucisse créole avec rougail de tomates et épices', category_id, 15.50, 'EUR', unit_id, 1, TRUE)
    RETURNING id INTO menu_item_id;
    
    -- Associer le type de cuisine créole
    INSERT INTO object_menu_item_cuisine_type (menu_item_id, cuisine_type_id)
    VALUES (menu_item_id, creole_type_id);
    
    -- Plat 2: Magret de canard (métropolitain)
    INSERT INTO object_menu_item (menu_id, name, description, category_id, price_amount, currency, unit_id, position, is_available)
    VALUES (menu_id, 'Magret de canard aux fruits', 'Magret de canard aux fruits de saison', category_id, 24.00, 'EUR', unit_id, 2, TRUE)
    RETURNING id INTO menu_item_id;
    
    -- Associer le type de cuisine métropolitaine
    INSERT INTO object_menu_item_cuisine_type (menu_item_id, cuisine_type_id)
    VALUES (menu_item_id, metropolitan_type_id);
    
    -- Plat 3: Curry de légumes (végétarien, créole)
    INSERT INTO object_menu_item (menu_id, name, description, category_id, price_amount, currency, unit_id, position, is_available)
    VALUES (menu_id, 'Curry de légumes créole', 'Curry de légumes du jardin aux épices créoles', category_id, 14.00, 'EUR', unit_id, 3, TRUE)
    RETURNING id INTO menu_item_id;
    
    -- Associer le type de cuisine créole et le tag végétarien
    INSERT INTO object_menu_item_cuisine_type (menu_item_id, cuisine_type_id)
    VALUES (menu_item_id, creole_type_id);
    
    INSERT INTO object_menu_item_dietary_tag (menu_item_id, dietary_tag_id)
    VALUES (menu_item_id, vegetarian_tag_id);
    
    RAISE NOTICE '✓ Menus créés avec types de cuisine pour restaurant %', restaurant_id;
END $$;

-- =====================================================
-- 8. COMMENTAIRES POUR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE object IS 'Table maître contenant tous les objets de la nomenclature avec données de seed réalistes';
-- Section legacy retirée dans ce seed pour rester compatible avec le schéma courant
