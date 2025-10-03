-- =====================================================
-- DONNÉES DE SEED RÉALISTES - SUPABASE
-- =====================================================
-- Données d'exemple pour tester le schéma unifié
-- Inclut des cas limites et des données ambigües

-- =====================================================
-- 1. SEED DES TABLES DE RÉFÉRENCE
-- =====================================================

-- =====================================================
-- LANGUES - SUPPORT MULTILINGUE COMPLET
-- =====================================================

-- Langues principales du tourisme international
INSERT INTO ref_language (code, name, native_name) VALUES
-- Langues officielles de La Réunion
('fr', 'Français', 'Français'),
('rcf', 'Créole réunionnais', 'Kréol réyoné'),
-- Langues européennes majeures
('en', 'Anglais', 'English'),
('de', 'Allemand', 'Deutsch'),
('es', 'Espagnol', 'Español'),
('it', 'Italien', 'Italiano'),
('pt', 'Portugais', 'Português'),
('nl', 'Néerlandais', 'Nederlands'),
-- Langues asiatiques importantes
('zh', 'Chinois', '中文'),
('ja', 'Japonais', '日本語'),
('ko', 'Coréen', '한국어'),
('hi', 'Hindi', 'हिन्दी'),
('ta', 'Tamoul', 'தமிழ்'),
('th', 'Thaï', 'ไทย'),
-- Langues africaines et océaniennes
('ar', 'Arabe', 'العربية'),
('sw', 'Swahili', 'Kiswahili'),
('mg', 'Malgache', 'Malagasy'),
('zu', 'Zoulou', 'IsiZulu'),
-- Langues océaniennes
('ty', 'Tahitien', 'Reo Tahiti'),
('haw', 'Hawaïen', 'ʻŌlelo Hawaiʻi')
ON CONFLICT (code) DO NOTHING;

-- Domaine : contact_kind
-- Types de canaux de contact utilisés par les offices de tourisme
INSERT INTO ref_code (domain, code, name, description, position) VALUES
  ('contact_kind','phone','Téléphone','Contact par téléphone (ligne fixe ou mobile)',1),
  ('contact_kind','email','E‑mail','Contact par courrier électronique',2),
  ('contact_kind','postal','Courrier postal','Envoi ou réception de courrier/brochures',3),
  ('contact_kind','website','Site internet','Formulaire de contact ou chat intégré sur le site',4),
  ('contact_kind','social','Réseaux sociaux','Messagerie via les réseaux sociaux (Facebook, Instagram, etc.)',5),
  ('contact_kind','chat_online','Chat en ligne','Service de discussion instantanée sur le site',6),
  ('contact_kind','messaging_app','Messagerie mobile','SMS, WhatsApp et autres messageries mobiles',7),
  ('contact_kind','video_call','Appel vidéo','Visioconférence (Zoom, Teams…)',8),
  ('contact_kind','in_person','Contact en personne','Accueil physique dans les locaux',9),
  ('contact_kind','knowledge_base','Base de connaissances','Consultation d''une foire aux questions ou centre d''aide',10),
  ('contact_kind','community','Communauté en ligne','Forums et groupes communautaires',11)
ON CONFLICT (domain, code) DO NOTHING;

-- Domaine : weekday
-- Jours de la semaine en français
INSERT INTO ref_code (domain, code, name, description, position) VALUES
  ('weekday','monday','Lundi','Premier jour ouvré de la semaine',1),
  ('weekday','tuesday','Mardi','Deuxième jour ouvré de la semaine',2),
  ('weekday','wednesday','Mercredi','Troisième jour de la semaine',3),
  ('weekday','thursday','Jeudi','Quatrième jour de la semaine',4),
  ('weekday','friday','Vendredi','Cinquième jour de la semaine',5),
  ('weekday','saturday','Samedi','Sixième jour de la semaine',6),
  ('weekday','sunday','Dimanche','Septième jour de la semaine',7)
ON CONFLICT (domain, code) DO NOTHING;

-- =====================================================
-- Domaine : opening_schedule_type
-- Types d'horaires d'ouverture pour établissements touristiques
-- =====================================================
INSERT INTO ref_code (domain, code, name, description, position) VALUES
('opening_schedule_type','standard','Horaires standard','Horaires habituels appliqués toute l''année',1),
('opening_schedule_type','high_season','Haute saison','Horaires en période de forte affluence',2),
('opening_schedule_type','low_season','Basse saison','Horaires en période creuse',3),
('opening_schedule_type','vacation','Vacances scolaires','Horaires pendant les vacances scolaires',4),
('opening_schedule_type','holiday','Jours fériés','Horaires spécifiques aux jours fériés',5),
('opening_schedule_type','nocturne','Nocturne','Ouverture en soirée ou nocturne',6),
('opening_schedule_type','sur_reservation','Sur réservation','Ouverture uniquement sur demande ou réservation',7),
('opening_schedule_type','weekend','Week-end','Horaires spécifiques au week-end',8),
('opening_schedule_type','continuous','Toute l''année','Ouvert en continu toute l''année',9),
('opening_schedule_type','reduced','Horaires réduits','Horaires réduits pour travaux ou maintenance',10)
ON CONFLICT (domain, code) DO NOTHING;

-- Domaine : media_type
-- Types de contenus multimédias
INSERT INTO ref_code (domain, code, name, description, position) VALUES
  ('media_type','photo','Photo/Visuel','Image fixe ou illustration',1),
  ('media_type','video','Vidéo','Contenu vidéo',2),
  ('media_type','text','Texte','Contenu textuel (article, description)',3),
  ('media_type','audio','Audio','Enregistrements audio ou podcasts',4),
  ('media_type','3d_model','Contenu 3D','Modèle 3D ou visite virtuelle',5),
  ('media_type','document','Document','Fichier PDF, brochure ou guide',6),
  ('media_type','gpx','GPX','Fichier GPS pour itinéraires et points d''intérêt',7)
ON CONFLICT (domain, code) DO NOTHING;

-- Domaine : amenity_family
-- Catégories d'équipements / commodités
INSERT INTO ref_code (domain, code, name, description, position) VALUES
  ('amenity_family','general','Général','Équipements de base : wifi, télévision, coffre-fort',1),
  ('amenity_family','services','Services','Services et prestations : conciergerie, navette, excursions',2),
  ('amenity_family','kitchen','Cuisine','Équipements de cuisine : condiments, ustensiles, appareils électroménagers',3),
  ('amenity_family','kids','Enfants','Équipements pour enfants : lit bébé, chaise haute, jeux',4),
  ('amenity_family','pets','Animaux','Équipements pour animaux : gamelles, paniers',5),
  ('amenity_family','bathroom','Salle de bain','Articles de salle de bain : serviettes, articles de toilette, sèche‑cheveux',6),
  ('amenity_family','bedroom','Chambre','Confort de la chambre : literie, rideaux occultants',7),
  ('amenity_family','entertainment','Divertissement','Équipements ludiques : TV, jeux, livres',8),
  ('amenity_family','sports','Sports','Équipements sportifs et activités physiques',9),
  ('amenity_family','outdoor','Extérieur','Aménagements extérieurs : piscine, barbecue, jardin',10),
  ('amenity_family','climate_control','Climatisation/Chauffage','Systèmes de climatisation ou de chauffage',11),
  ('amenity_family','accessibility','Accessibilité','Équipements pour personnes à mobilité réduite',12),
  ('amenity_family','security','Sécurité','Alarmes, détecteurs de fumée, extincteurs',13),
  ('amenity_family','parking','Parking','Emplacements de stationnement ou garage',14)
ON CONFLICT (domain, code) DO NOTHING;

-- Moyens de paiement supplémentaires
INSERT INTO ref_code (domain, code, name, description) VALUES
('payment_method','cheque_vacances', 'Chèques vacances', 'Chèques vacances ANCV'),
('payment_method','carte_bleue', 'Carte Bleue', 'Carte Bleue française'),
('payment_method','mastercard', 'Mastercard', 'Carte Mastercard'),
('payment_method','visa', 'Visa', 'Carte Visa'),
('payment_method','american_express', 'American Express', 'Carte American Express')
ON CONFLICT DO NOTHING;

-- =====================================================
-- Domaine : social_network
-- Principales plateformes sociales utilisées dans le tourisme
INSERT INTO ref_code (domain, code, name, description, position) VALUES
  ('social_network','facebook','Facebook','Réseau social généraliste',1),
  ('social_network','instagram','Instagram','Plateforme de partage de photos et stories',2),
  ('social_network','pinterest','Pinterest','Réseau de découverte visuelle',3),
  ('social_network','x_twitter','X/Twitter','Plateforme de micro‑blogging',4),
  ('social_network','linkedin','LinkedIn','Réseau professionnel',5),
  ('social_network','youtube','YouTube','Plateforme de partage de vidéos',6),
  ('social_network','tiktok','TikTok','Plateforme de vidéos courtes',7),
  ('social_network','tripadvisor','TripAdvisor','Site d''avis et recommandations de voyages',8),
  ('social_network','whatsapp','WhatsApp','Application de messagerie mobile',9),
  ('social_network','snapchat','Snapchat','Application de partage de photos et vidéos éphémères',10)
ON CONFLICT (domain, code) DO NOTHING;

-- =====================================================
-- Domaine : language_level
-- Niveaux de compétence linguistique CECRL
INSERT INTO ref_code (domain, code, name, description, position) VALUES
  ('language_level','A1','Débutant','Peut comprendre et utiliser des expressions familières et quotidiennes',1),
  ('language_level','A2','Élémentaire','Peut communiquer dans des situations simples et habituelles',2),
  ('language_level','B1','Intermédiaire','Peut comprendre les points essentiels d''un discours clair et standard',3),
  ('language_level','B2','Indépendant','Peut communiquer avec aisance et spontanéité avec des locuteurs natifs',4),
  ('language_level','C1','Avancé','Peut utiliser la langue de façon efficace et fluide',5),
  ('language_level','C2','Maîtrise','Peut comprendre pratiquement tout avec aisance et précision',6)
ON CONFLICT (domain, code) DO NOTHING;

-- Rôles de contact de base
INSERT INTO ref_contact_role (code, name, description) VALUES
('reservation', 'Réservation', 'Contact pour réservations'),
('management', 'Management', 'Direction / management'),
('press', 'Presse', 'Relations presse'),
('technical', 'Technique', 'Support technique / IT'),
('sales', 'Commercial', 'Ventes / commercial'),
('info', 'Information', 'Informations générales')
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- Domaine : environment_tag
-- Types d'environnements et paysages pour le tourisme
-- =====================================================
INSERT INTO ref_code (domain, code, name, description, position) VALUES
-- Environnements côtiers et marins
('environment_tag','mer','Bord de mer','Plages, littoral et stations balnéaires',1),
('environment_tag','plage','Plage','Plage de sable ou de galets',2),
('environment_tag','lagon','Lagon','Lagon protégé avec eaux turquoise',3),
('environment_tag','falaise','Falaise','Falaises et côtes rocheuses',4),
-- Environnements montagneux
('environment_tag','montagne','Montagne','Massifs montagneux, sommets et vallées',5),
('environment_tag','volcan','Volcan','Zones volcaniques ou géothermiques',6),
('environment_tag','piton_fournaise','Piton de la Fournaise','Au pied du volcan actif',7),
-- Environnements naturels
('environment_tag','foret','Forêt','Milieux boisés et sylvicoles',8),
('environment_tag','campagne','Campagne','Zones agricoles et villages ruraux',9),
('environment_tag','rural','Zone rurale','Environnement rural hors centre urbain',10),
('environment_tag','parc_naturel','Parc naturel','Espaces protégés et parcs nationaux',11),
-- Environnements aquatiques
('environment_tag','lac','Lac/Rivière','Plans d''eau, rivières et cascades',12),
('environment_tag','cascade','Cascade','Chutes d''eau et cascades',13),
('environment_tag','riviere','Rivière','Cours d''eau et rivières',14),
-- Environnements urbains
('environment_tag','urbain','Urbain','Villes et centres urbains',15),
('environment_tag','centre_ville','Centre-ville','Centre historique et commercial',16),
('environment_tag','quartier','Quartier','Quartier résidentiel ou commerçant',17),
-- Environnements climatiques
('environment_tag','tropical','Tropical','Forêts tropicales, climats chauds et humides',18),
('environment_tag','desert','Désert','Régions arides et désertiques',19),
('environment_tag','savane','Savane','Plaines de savane et prairies',20),
-- Environnements d'altitude
('environment_tag','altitude','Altitude','Zones de haute altitude',21),
('environment_tag','plateau','Plateau','Plateaux et hauts plateaux',22),
-- Environnements culturels
('environment_tag','historique','Historique','Sites historiques et patrimoniaux',23),
('environment_tag','culturel','Culturel','Zones d''activités culturelles',24),
('environment_tag','artisanal','Artisanal','Zones d''artisanat traditionnel',25)
ON CONFLICT (domain, code) DO NOTHING;

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


-- =====================================================
-- ÉQUIPEMENTS ET SERVICES - COMPREHENSIF
-- =====================================================
INSERT INTO ref_amenity (code, name, family_id, description)
SELECT v.code, v.name, fam.id, v.description
FROM (
  VALUES
    -- Équipements généraux
    ('wifi','Wi-Fi','general','Accès Wi‑Fi gratuit'),
    ('tv','Télévision','general','Télévision dans les chambres'),
    ('air_conditioning','Climatisation','climate_control','Climatisation'),
    ('heating','Chauffage','climate_control','Système de chauffage'),
    ('safe','Coffre-fort','general','Coffre-fort sécurisé'),
    ('elevator','Ascenseur','general','Ascenseur'),
    ('laundry','Laverie','services','Service de blanchisserie'),
    ('luggage_storage','Consigne bagages','services','Consigne à bagages'),
    ('business_center','Centre d''affaires','services','Centre d''affaires'),
    ('concierge','Conciergerie','services','Service de conciergerie'),
    
    -- Services de restauration
    ('restaurant','Restaurant','services','Restaurant sur place'),
    ('bar','Bar','services','Bar'),
    ('room_service','Service en chambre','services','Service en chambre'),
    ('minibar','Minibar','general','Minibar dans les chambres'),
    ('breakfast','Petit-déjeuner','general','Petit-déjeuner inclus'),
    ('kitchenette','Kitchenette','kitchen','Kitchenette équipée'),
    ('coffee_machine','Machine à café','kitchen','Machine à café'),
    ('microwave','Micro-ondes','kitchen','Micro-ondes'),
    ('refrigerator','Réfrigérateur','kitchen','Réfrigérateur'),
    
    -- Équipements pour enfants
    ('baby_crib','Lit bébé','kids','Lit bébé disponible'),
    ('high_chair','Chaise haute','kids','Chaise haute'),
    ('baby_sitting','Garde d''enfants','services','Service de garde d''enfants'),
    ('kids_club','Club enfants','kids','Club enfants'),
    ('playground','Aire de jeux','kids','Aire de jeux pour enfants'),
    
    -- Équipements pour animaux
    ('pet_friendly','Animaux acceptés','pets','Animaux de compagnie acceptés'),
    ('pet_bowls','Gamelles animaux','pets','Gamelles pour animaux'),
    ('pet_bed','Panier animaux','pets','Panier pour animaux'),
    
    -- Équipements de salle de bain
    ('hairdryer','Sèche-cheveux','bathroom','Sèche-cheveux'),
    ('bathrobes','Peignoirs','bathroom','Peignoirs fournis'),
    ('toiletries','Articles de toilette','bathroom','Articles de toilette'),
    ('jacuzzi','Jacuzzi','bathroom','Jacuzzi privé'),
    ('bathtub','Baignoire','bathroom','Baignoire'),
    ('shower','Douche','bathroom','Douche'),
    
    -- Équipements de chambre
    ('blackout_curtains','Rideaux occultants','bedroom','Rideaux occultants'),
    ('extra_pillows','Oreillers supplémentaires','bedroom','Oreillers supplémentaires'),
    ('iron','Fer à repasser','bedroom','Fer à repasser'),
    ('desk','Bureau','bedroom','Bureau de travail'),
    ('sofa','Canapé','bedroom','Canapé'),
    ('balcony','Balcon','bedroom','Balcon privé'),
    ('terrace','Terrasse','bedroom','Terrasse privée'),
    
    -- Divertissement
    ('pool_table','Billard','entertainment','Table de billard'),
    ('games_room','Salle de jeux','entertainment','Salle de jeux'),
    ('library','Bibliothèque','entertainment','Bibliothèque'),
    ('dvd_player','Lecteur DVD','entertainment','Lecteur DVD'),
    ('board_games','Jeux de société','entertainment','Jeux de société'),
    
    -- Équipements extérieurs
    ('swimming_pool','Piscine','outdoor','Piscine'),
    ('hot_tub','Spa extérieur','outdoor','Spa extérieur'),
    ('garden','Jardin','outdoor','Jardin'),
    ('bbq','Barbecue','outdoor','Barbecue à disposition'),
    ('sunbeds','Transats','outdoor','Transats et parasols'),
    ('beach_access','Accès plage','outdoor','Accès direct à la plage'),
    ('terrace','Terrasse','outdoor','Terrasse commune'),
    
    -- Accessibilité
    ('wheelchair_access','Accès fauteuil roulant','accessibility','Accès fauteuil roulant'),
    ('accessible_bathroom','Salle de bain accessible','accessibility','Salle de bain accessible'),
    ('accessible_parking','Parking accessible','accessibility','Parking accessible'),
    ('hearing_impaired','Personnes malentendantes','accessibility','Équipements pour malentendants'),
    
    -- Sécurité
    ('security_24h','Sécurité 24h/24','security','Sécurité 24 heures sur 24'),
    ('cctv','Vidéosurveillance','security','Système de vidéosurveillance'),
    ('fire_safety','Sécurité incendie','security','Système de sécurité incendie'),
    ('emergency_exit','Sortie de secours','security','Sortie de secours'),
    
    -- Parking
    ('parking','Parking','parking','Parking disponible'),
    ('valet_parking','Parking voiturier','parking','Service de parking voiturier'),
    ('garage','Garage','parking','Garage couvert'),
    ('electric_charging','Recharge électrique','parking','Station de recharge véhicule électrique'),
    
    -- Services spécialisés
    ('spa','Spa','services','Centre de spa'),
    ('car_rental','Location voiture','services','Service de location de voiture'),
    ('airport_shuttle','Navette aéroport','services','Navette aéroport'),
    ('tour_desk','Bureau d''excursions','services','Bureau d''excursions et activités'),
    
    -- Équipements sportifs
    ('fitness_center','Salle de sport','sports','Salle de fitness'),
    ('tennis_court','Court de tennis','sports','Court de tennis'),
    ('golf_course','Golf','sports','Terrains de golf'),
    ('bike_rental','Location vélo','sports','Location de vélos'),
    ('snorkeling_gear','Équipement snorkeling','sports','Équipement de snorkeling'),
    ('diving_center','Centre de plongée','sports','Centre de plongée'),
    ('surf_rental','Location surf','sports','Location de planches de surf'),
    ('kayak_rental','Location kayak','sports','Location de kayaks'),
    ('hiking_gear','Équipement randonnée','sports','Équipement de randonnée pédestre'),
    ('climbing_gear','Équipement escalade','sports','Équipement d''escalade'),
    ('sailing_equipment','Équipement voile','sports','Équipement de voile'),
    ('fishing_gear','Équipement pêche','sports','Équipement de pêche'),
    ('yoga_mats','Tapis de yoga','sports','Tapis de yoga disponibles'),
    ('gym_equipment','Équipement gym','sports','Équipement de musculation'),
    ('swimming_equipment','Équipement natation','sports','Équipement de natation')
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

-- =====================================================
-- 27. NOUVEAUX DOMAINES TOURISTIQUES - DONNÉES COMPLÈTES
-- =====================================================

-- Types d'hébergement
INSERT INTO ref_code (domain, code, name, description, position) VALUES
('accommodation_type', 'hotel', 'Hôtel', 'Hôtel classique', 1),
('accommodation_type', 'boutique_hotel', 'Hôtel boutique', 'Hôtel boutique de charme', 2),
('accommodation_type', 'luxury_hotel', 'Hôtel de luxe', 'Hôtel haut de gamme', 3),
('accommodation_type', 'resort', 'Résort', 'Complexe hôtelier', 4),
('accommodation_type', 'guesthouse', 'Chambre d''hôtes', 'Chambre d''hôtes', 5),
('accommodation_type', 'gite', 'Gîte', 'Gîte rural ou urbain', 6),
('accommodation_type', 'camping', 'Camping', 'Camping', 7),
('accommodation_type', 'glamping', 'Glamping', 'Camping de luxe', 8),
('accommodation_type', 'villa', 'Villa', 'Villa de location', 9),
('accommodation_type', 'apartment', 'Appartement', 'Appartement de tourisme', 10)
ON CONFLICT (domain, code) DO NOTHING;

-- Types de tourisme
INSERT INTO ref_code (domain, code, name, description, position) VALUES
('tourism_type', 'leisure', 'Tourisme de loisirs', 'Tourisme de détente et loisirs', 1),
('tourism_type', 'cultural', 'Tourisme culturel', 'Tourisme axé sur la culture', 2),
('tourism_type', 'business', 'Tourisme d''affaires', 'Tourisme professionnel', 3),
('tourism_type', 'eco', 'Écotourisme', 'Tourisme respectueux de l''environnement', 4),
('tourism_type', 'adventure', 'Tourisme d''aventure', 'Tourisme d''aventure et sports extrêmes', 5),
('tourism_type', 'gastronomy', 'Tourisme gastronomique', 'Tourisme gastronomique', 6),
('tourism_type', 'wellness', 'Tourisme de bien-être', 'Tourisme spa et bien-être', 7),
('tourism_type', 'nature', 'Tourisme de nature', 'Tourisme axé sur la nature', 8),
('tourism_type', 'sports', 'Tourisme sportif', 'Tourisme sportif', 9),
('tourism_type', 'rural', 'Tourisme rural', 'Tourisme rural', 10)
ON CONFLICT (domain, code) DO NOTHING;

-- Types de transport
INSERT INTO ref_code (domain, code, name, description, position) VALUES
('transport_type', 'airplane', 'Avion', 'Transport aérien', 1),
('transport_type', 'train', 'Train', 'Transport ferroviaire', 2),
('transport_type', 'bus', 'Bus', 'Transport par bus', 3),
('transport_type', 'car', 'Voiture', 'Transport automobile', 4),
('transport_type', 'ferry', 'Ferry', 'Transport par ferry', 5),
('transport_type', 'cruise', 'Croisière', 'Transport par croisière', 6),
('transport_type', 'bicycle', 'Vélo', 'Transport à vélo', 7),
('transport_type', 'taxi', 'Taxi', 'Transport par taxi', 8),
('transport_type', 'helicopter', 'Hélicoptère', 'Transport par hélicoptère', 9),
('transport_type', 'walking', 'Marche à pied', 'Transport à pied', 10)
ON CONFLICT (domain, code) DO NOTHING;

-- Types d'activités
INSERT INTO ref_code (domain, code, name, description, position) VALUES
('activity_type', 'hiking', 'Randonnée', 'Randonnée pédestre', 1),
('activity_type', 'diving', 'Plongée', 'Plongée sous-marine', 2),
('activity_type', 'surfing', 'Surf', 'Surf', 3),
('activity_type', 'museum_visit', 'Visite de musée', 'Visite de musée', 4),
('activity_type', 'guided_tour', 'Visite guidée', 'Visite guidée', 5),
('activity_type', 'cooking_class', 'Cours de cuisine', 'Cours de cuisine', 6),
('activity_type', 'wine_tasting', 'Dégustation de vin', 'Dégustation de vin', 7),
('activity_type', 'spa_treatment', 'Soin spa', 'Soin spa', 8),
('activity_type', 'paragliding', 'Parapente', 'Parapente', 9),
('activity_type', 'bird_watching', 'Observation d\'oiseaux', 'Observation d\'oiseaux', 10)
ON CONFLICT (domain, code) DO NOTHING;

-- Types de saisons
INSERT INTO ref_code (domain, code, name, description, position) VALUES
('season_type', 'high_season', 'Haute saison', 'Période de haute affluence', 1),
('season_type', 'low_season', 'Basse saison', 'Période de faible affluence', 2),
('season_type', 'summer', 'Été', 'Saison estivale', 3),
('season_type', 'winter', 'Hiver', 'Saison hivernale', 4),
('season_type', 'cyclone_season', 'Saison cyclonique', 'Période cyclonique à La Réunion', 5),
('season_type', 'sugar_cane_harvest', 'Récolte canne à sucre', 'Période de récolte de la canne à sucre', 6),
('season_type', 'vanilla_harvest', 'Récolte vanille', 'Période de récolte de la vanille', 7),
('season_type', 'lychee_season', 'Saison des litchis', 'Période des litchis', 8),
('season_type', 'festival_season', 'Saison des festivals', 'Période des festivals', 9),
('season_type', 'holiday_season', 'Saison des vacances', 'Période des vacances', 10)
ON CONFLICT (domain, code) DO NOTHING;

-- Types de clients
INSERT INTO ref_code (domain, code, name, description, position) VALUES
('client_type', 'individual', 'Touriste individuel', 'Voyageur seul', 1),
('client_type', 'couple', 'Couple', 'Couple en voyage', 2),
('client_type', 'family', 'Famille', 'Famille avec enfants', 3),
('client_type', 'group', 'Groupe', 'Groupe de voyageurs', 4),
('client_type', 'business_traveler', 'Voyageur d''affaires', 'Voyageur professionnel', 5),
('client_type', 'senior', 'Senior', 'Voyageur senior', 6),
('client_type', 'student', 'Étudiant', 'Voyageur étudiant', 7),
('client_type', 'luxury_traveler', 'Voyageur de luxe', 'Voyageur haut de gamme', 8),
('client_type', 'budget_traveler', 'Voyageur économique', 'Voyageur économique', 9),
('client_type', 'accessible', 'Personne à mobilité réduite', 'Client avec handicap', 10)
ON CONFLICT (domain, code) DO NOTHING;

-- Types de services
INSERT INTO ref_code (domain, code, name, description, position) VALUES
('service_type', 'accommodation', 'Hébergement', 'Service d''hébergement', 1),
('service_type', 'restaurant', 'Restaurant', 'Service de restauration', 2),
('service_type', 'transport', 'Transport', 'Service de transport', 3),
('service_type', 'tour_guide', 'Guide touristique', 'Service de guide touristique', 4),
('service_type', 'spa', 'Spa', 'Service de spa', 5),
('service_type', 'concierge', 'Conciergerie', 'Service de conciergerie', 6),
('service_type', 'event_planning', 'Organisation d''événements', 'Service d''organisation d''événements', 7),
('service_type', 'translation', 'Traduction', 'Service de traduction', 8),
('service_type', 'insurance', 'Assurance', 'Service d''assurance', 9),
('service_type', 'security', 'Sécurité', 'Service de sécurité', 10)
ON CONFLICT (domain, code) DO NOTHING;

-- Statuts de réservation
INSERT INTO ref_code (domain, code, name, description, position) VALUES
('booking_status', 'pending', 'En attente', 'Réservation en attente', 1),
('booking_status', 'confirmed', 'Confirmée', 'Réservation confirmée', 2),
('booking_status', 'cancelled', 'Annulée', 'Réservation annulée', 3),
('booking_status', 'completed', 'Terminée', 'Réservation terminée', 4),
('booking_status', 'no_show', 'No-show', 'Client ne s''est pas présenté', 5),
('booking_status', 'payment_pending', 'Paiement en attente', 'En attente de paiement', 6),
('booking_status', 'payment_confirmed', 'Paiement confirmé', 'Paiement confirmé', 7),
('booking_status', 'modified', 'Modifiée', 'Réservation modifiée', 8),
('booking_status', 'checked_in', 'Enregistré', 'Client enregistré', 9),
('booking_status', 'checked_out', 'Départ', 'Client parti', 10)
ON CONFLICT (domain, code) DO NOTHING;

-- Types de promotions
INSERT INTO ref_code (domain, code, name, description, position) VALUES
('promotion_type', 'early_booking', 'Réservation anticipée', 'Réduction pour réservation anticipée', 1),
('promotion_type', 'last_minute', 'Dernière minute', 'Offre de dernière minute', 2),
('promotion_type', 'seasonal', 'Saisonnière', 'Promotion saisonnière', 3),
('promotion_type', 'group_discount', 'Réduction groupe', 'Réduction pour groupes', 4),
('promotion_type', 'loyalty', 'Fidélité', 'Promotion fidélité', 5),
('promotion_type', 'package', 'Forfait', 'Promotion forfaitaire', 6),
('promotion_type', 'flash_sale', 'Vente flash', 'Vente flash', 7),
('promotion_type', 'student', 'Étudiant', 'Promotion étudiants', 8),
('promotion_type', 'senior', 'Senior', 'Promotion seniors', 9),
('promotion_type', 'family', 'Famille', 'Promotion famille', 10)
ON CONFLICT (domain, code) DO NOTHING;

-- Types de documents
INSERT INTO ref_code (domain, code, name, description, position) VALUES
('document_type', 'passport', 'Passeport', 'Passeport', 1),
('document_type', 'visa', 'Visa', 'Visa', 2),
('document_type', 'id_card', 'Carte d''identité', 'Carte d''identité', 3),
('document_type', 'driving_license', 'Permis de conduire', 'Permis de conduire', 4),
('document_type', 'insurance', 'Assurance', 'Document d''assurance', 5),
('document_type', 'booking_confirmation', 'Confirmation de réservation', 'Confirmation de réservation', 6),
('document_type', 'ticket', 'Billet', 'Billet de transport', 7),
('document_type', 'voucher', 'Bon', 'Bon de service', 8),
('document_type', 'medical_certificate', 'Certificat médical', 'Certificat médical', 9),
('document_type', 'vaccination', 'Carnet de vaccination', 'Carnet de vaccination', 10)
ON CONFLICT (domain, code) DO NOTHING;

-- Types d'assurance
INSERT INTO ref_code (domain, code, name, description, position) VALUES
('insurance_type', 'travel', 'Assurance voyage', 'Assurance voyage', 1),
('insurance_type', 'medical', 'Assurance médicale', 'Assurance médicale', 2),
('insurance_type', 'cancellation', 'Assurance annulation', 'Assurance annulation', 3),
('insurance_type', 'luggage', 'Assurance bagages', 'Assurance bagages', 4),
('insurance_type', 'liability', 'Assurance responsabilité civile', 'Assurance responsabilité civile', 5),
('insurance_type', 'repatriation', 'Assurance rapatriement', 'Assurance rapatriement', 6),
('insurance_type', 'multi_risk', 'Assurance multirisque', 'Assurance multirisque', 7),
('insurance_type', 'adventure', 'Assurance aventure', 'Assurance pour sports d''aventure', 8),
('insurance_type', 'business', 'Assurance business', 'Assurance voyage d''affaires', 9),
('insurance_type', 'group', 'Assurance groupe', 'Assurance pour groupes', 10)
ON CONFLICT (domain, code) DO NOTHING;

-- Types de feedback
INSERT INTO ref_code (domain, code, name, description, position) VALUES
('feedback_type', 'online_review', 'Avis en ligne', 'Avis en ligne', 1),
('feedback_type', 'satisfaction_survey', 'Enquête de satisfaction', 'Enquête de satisfaction', 2),
('feedback_type', 'verbal_feedback', 'Commentaire verbal', 'Commentaire verbal', 3),
('feedback_type', 'complaint', 'Réclamation', 'Réclamation', 4),
('feedback_type', 'compliment', 'Compliment', 'Compliment', 5),
('feedback_type', 'suggestion', 'Suggestion', 'Suggestion d''amélioration', 6),
('feedback_type', 'rating', 'Note', 'Note d''évaluation', 7),
('feedback_type', 'testimonial', 'Témoignage', 'Témoignage client', 8),
('feedback_type', 'social_media', 'Réseaux sociaux', 'Retour via réseaux sociaux', 9),
('feedback_type', 'email', 'Email', 'Retour par email', 10)
ON CONFLICT (domain, code) DO NOTHING;

-- Types de partenariats
INSERT INTO ref_code (domain, code, name, description, position) VALUES
('partnership_type', 'hotel', 'Partenariat hôtelier', 'Partenariat avec hôtels', 1),
('partnership_type', 'airline', 'Compagnie aérienne', 'Partenariat avec compagnies aériennes', 2),
('partnership_type', 'travel_agency', 'Agence de voyage', 'Partenariat avec agences de voyage', 3),
('partnership_type', 'tourist_office', 'Office de tourisme', 'Partenariat avec offices de tourisme', 4),
('partnership_type', 'local_business', 'Entreprise locale', 'Partenariat avec entreprises locales', 5),
('partnership_type', 'online_platform', 'Plateforme en ligne', 'Partenariat avec plateformes en ligne', 6),
('partnership_type', 'restaurant', 'Restaurant', 'Partenariat avec restaurants', 7),
('partnership_type', 'transport', 'Transport', 'Partenariat avec entreprises de transport', 8),
('partnership_type', 'activity_provider', 'Prestataire d''activités', 'Partenariat avec prestataires d''activités', 9),
('partnership_type', 'supplier', 'Fournisseur', 'Partenariat avec fournisseurs', 10)
ON CONFLICT (domain, code) DO NOTHING;

-- Types d'assistance
INSERT INTO ref_code (domain, code, name, description, position) VALUES
('assistance_type', 'customer_service', 'Service client', 'Service client', 1),
('assistance_type', 'medical', 'Assistance médicale', 'Assistance médicale', 2),
('assistance_type', 'emergency', 'Urgence', 'Assistance d''urgence', 3),
('assistance_type', 'technical', 'Assistance technique', 'Assistance technique', 4),
('assistance_type', 'language', 'Assistance linguistique', 'Assistance linguistique', 5),
('assistance_type', 'legal', 'Assistance juridique', 'Assistance juridique', 6),
('assistance_type', 'travel', 'Assistance voyage', 'Assistance voyage', 7),
('assistance_type', 'lost_documents', 'Documents perdus', 'Assistance en cas de perte de documents', 8),
('assistance_type', 'theft', 'Vol', 'Assistance en cas de vol', 9),
('assistance_type', 'natural_disaster', 'Catastrophe naturelle', 'Assistance en cas de catastrophe naturelle', 10)
ON CONFLICT (domain, code) DO NOTHING;

-- Types de destinations
INSERT INTO ref_code (domain, code, name, description, position) VALUES
('destination_type', 'urban', 'Destination urbaine', 'Destination urbaine', 1),
('destination_type', 'coastal', 'Destination balnéaire', 'Destination balnéaire', 2),
('destination_type', 'mountain', 'Destination montagneuse', 'Destination montagneuse', 3),
('destination_type', 'rural', 'Destination rurale', 'Destination rurale', 4),
('destination_type', 'tropical', 'Destination tropicale', 'Destination tropicale', 5),
('destination_type', 'cultural', 'Destination culturelle', 'Destination culturelle', 6),
('destination_type', 'adventure', 'Destination aventure', 'Destination aventure', 7),
('destination_type', 'wellness', 'Destination bien-être', 'Destination bien-être', 8),
('destination_type', 'business', 'Destination d''affaires', 'Destination d''affaires', 9),
('destination_type', 'family', 'Destination familiale', 'Destination familiale', 10)
ON CONFLICT (domain, code) DO NOTHING;

-- Types d'événements
INSERT INTO ref_code (domain, code, name, description, position) VALUES
('event_type', 'conference', 'Conférence', 'Conférence', 1),
('event_type', 'seminar', 'Séminaire', 'Séminaire', 2),
('event_type', 'workshop', 'Atelier', 'Atelier', 3),
('event_type', 'exhibition', 'Exposition', 'Exposition', 4),
('event_type', 'festival', 'Festival', 'Festival', 5),
('event_type', 'concert', 'Concert', 'Concert', 6),
('event_type', 'wedding', 'Mariage', 'Mariage', 7),
('event_type', 'corporate_event', 'Événement d''entreprise', 'Événement d''entreprise', 8),
('event_type', 'sporting_event', 'Événement sportif', 'Événement sportif', 9),
('event_type', 'cultural_event', 'Événement culturel', 'Événement culturel', 10)
ON CONFLICT (domain, code) DO NOTHING;

-- Types de forfaits
INSERT INTO ref_code (domain, code, name, description, position) VALUES
('package_type', 'all_inclusive', 'Tout inclus', 'Forfait tout inclus', 1),
('package_type', 'half_board', 'Demi-pension', 'Forfait demi-pension', 2),
('package_type', 'full_board', 'Pension complète', 'Forfait pension complète', 3),
('package_type', 'bed_breakfast', 'Petit-déjeuner', 'Forfait petit-déjeuner', 4),
('package_type', 'flight_hotel', 'Vol + Hôtel', 'Forfait vol + hôtel', 5),
('package_type', 'circuit', 'Circuit', 'Forfait circuit', 6),
('package_type', 'cruise', 'Croisière', 'Forfait croisière', 7),
('package_type', 'wellness', 'Bien-être', 'Forfait bien-être', 8),
('package_type', 'adventure', 'Aventure', 'Forfait aventure', 9),
('package_type', 'family', 'Famille', 'Forfait famille', 10)
ON CONFLICT (domain, code) DO NOTHING;

-- Types de chambres
INSERT INTO ref_code (domain, code, name, description, position) VALUES
('room_type', 'single', 'Chambre simple', 'Chambre simple', 1),
('room_type', 'double', 'Chambre double', 'Chambre double', 2),
('room_type', 'twin', 'Chambre à lits jumeaux', 'Chambre à lits jumeaux', 3),
('room_type', 'triple', 'Chambre triple', 'Chambre triple', 4),
('room_type', 'family', 'Chambre familiale', 'Chambre familiale', 5),
('room_type', 'suite', 'Suite', 'Suite', 6),
('room_type', 'presidential', 'Suite présidentielle', 'Suite présidentielle', 7),
('room_type', 'junior_suite', 'Suite junior', 'Suite junior', 8),
('room_type', 'accessible', 'Chambre accessible', 'Chambre accessible PMR', 9),
('room_type', 'connecting', 'Chambres communicantes', 'Chambres communicantes', 10)
ON CONFLICT (domain, code) DO NOTHING;


-- =====================================================
-- 29. DOMAINES COMPLÉMENTAIRES - VERSION ENRICHIE
-- =====================================================

-- Domaine : opening_schedule_type (version enrichie)
INSERT INTO ref_code (domain, code, name, description, position) VALUES
  ('opening_schedule_type','standard','Horaires standard','Horaires habituels appliqués toute l''année',1),
  ('opening_schedule_type','high_season','Haute saison','Horaires en période de forte affluence',2),
  ('opening_schedule_type','low_season','Basse saison','Horaires en période creuse',3),
  ('opening_schedule_type','vacation','Vacances scolaires','Horaires pendant les vacances scolaires',4),
  ('opening_schedule_type','holiday','Jours fériés','Horaires spécifiques aux jours fériés',5),
  ('opening_schedule_type','nocturne','Nocturne','Ouverture en soirée ou nocturne',6),
  ('opening_schedule_type','sur_reservation','Sur réservation','Ouverture uniquement sur demande ou réservation',7),
  ('opening_schedule_type','weekend','Week‑end','Horaires spécifiques au week‑end',8),
  ('opening_schedule_type','continuous','Toute l''année','Ouvert en continu toute l''année',9),
  ('opening_schedule_type','reduced','Horaires réduits','Horaires réduits pour travaux ou maintenance',10)
ON CONFLICT (domain, code) DO NOTHING;

-- =====================================================
-- 30. STATISTIQUES FINALES COMPLÈTES
-- =====================================================

DO $$
DECLARE
    total_ref_codes INTEGER;
    new_domains_count INTEGER;
BEGIN
    -- Compter tous les ref_codes
    SELECT COUNT(*) INTO total_ref_codes FROM ref_code;
    
    -- Compter les nouveaux domaines
    SELECT COUNT(DISTINCT domain) INTO new_domains_count FROM ref_code;
    
    RAISE NOTICE '=== DONNÉES DE SEED TOURISTIQUES COMPLÈTES ===';
    RAISE NOTICE 'Total des codes de référence: %', total_ref_codes;
    RAISE NOTICE 'Nombre de domaines: %', new_domains_count;
    RAISE NOTICE 'Domaines ajoutés: accommodation_type, tourism_type, transport_type, activity_type, season_type, client_type, service_type, booking_status, promotion_type, document_type, insurance_type, feedback_type, partnership_type, assistance_type, destination_type, event_type, package_type, room_type, amenity_type';
    RAISE NOTICE '✓ Seed touristique complet réussi avec % références au total', total_ref_codes;
END $$;

-- Section legacy retirée dans ce seed pour rester compatible avec le schéma courant
