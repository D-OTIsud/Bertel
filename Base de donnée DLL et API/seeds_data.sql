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
  ('contact_kind','community','Communauté en ligne','Forums et groupes communautaires',11);

-- Domaine : weekday
-- Jours de la semaine en français
INSERT INTO ref_code (domain, code, name, description, position) VALUES
  ('weekday','monday','Lundi','Premier jour ouvré de la semaine',1),
  ('weekday','tuesday','Mardi','Deuxième jour ouvré de la semaine',2),
  ('weekday','wednesday','Mercredi','Troisième jour de la semaine',3),
  ('weekday','thursday','Jeudi','Quatrième jour de la semaine',4),
  ('weekday','friday','Vendredi','Cinquième jour de la semaine',5),
  ('weekday','saturday','Samedi','Sixième jour de la semaine',6),
  ('weekday','sunday','Dimanche','Septième jour de la semaine',7);

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
('opening_schedule_type','reduced','Horaires réduits','Horaires réduits pour travaux ou maintenance',10);

-- Domaine : media_type
-- Types de contenus multimédias
INSERT INTO ref_code (domain, code, name, description, position) VALUES
  ('media_type','photo','Photo/Visuel','Image fixe ou illustration',1),
  ('media_type','video','Vidéo','Contenu vidéo',2),
  ('media_type','text','Texte','Contenu textuel (article, description)',3),
  ('media_type','audio','Audio','Enregistrements audio ou podcasts',4),
  ('media_type','3d_model','Contenu 3D','Modèle 3D ou visite virtuelle',5),
  ('media_type','document','Document','Fichier PDF, brochure ou guide',6),
  ('media_type','gpx','GPX','Fichier GPS pour itinéraires et points d''intérêt',7);

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
  ('amenity_family','parking','Parking','Emplacements de stationnement ou garage',14);

-- Moyens de paiement supplémentaires
INSERT INTO ref_code (domain, code, name, description) VALUES
('payment_method','cheque_vacances', 'Chèques vacances', 'Chèques vacances ANCV'),
('payment_method','carte_bleue', 'Carte Bleue', 'Carte Bleue française'),
('payment_method','mastercard', 'Mastercard', 'Carte Mastercard'),
('payment_method','visa', 'Visa', 'Carte Visa'),
('payment_method','american_express', 'American Express', 'Carte American Express');

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
  ('social_network','snapchat','Snapchat','Application de partage de photos et vidéos éphémères',10);

-- =====================================================
-- Domaine : language_level
-- Niveaux de compétence linguistique CECRL
INSERT INTO ref_code (domain, code, name, description, position) VALUES
  ('language_level','a1','Débutant','Peut comprendre et utiliser des expressions familières et quotidiennes',1),
  ('language_level','a2','Élémentaire','Peut communiquer dans des situations simples et habituelles',2),
  ('language_level','b1','Intermédiaire','Peut comprendre les points essentiels d''un discours clair et standard',3),
  ('language_level','b2','Indépendant','Peut communiquer avec aisance et spontanéité avec des locuteurs natifs',4),
  ('language_level','c1','Avancé','Peut utiliser la langue de façon efficace et fluide',5),
  ('language_level','c2','Maîtrise','Peut comprendre pratiquement tout avec aisance et précision',6);

-- Rôles de contact de base
INSERT INTO ref_contact_role (code, name, description) VALUES
('reservation', 'Réservation', 'Contact pour réservations'),
('management', 'Management', 'Direction / management'),
('press', 'Presse', 'Relations presse'),
('technical', 'Technique', 'Support technique / IT'),
('sales', 'Commercial', 'Ventes / commercial'),
('info', 'Information', 'Informations générales');

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
('environment_tag','artisanal','Artisanal','Zones d''artisanat traditionnel',25);

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
('cuisine_type','gourmet', 'Gastronomique', 'Cuisine gastronomique de qualité');

-- Catégories de menu
INSERT INTO ref_code (domain, code, name, description) VALUES
('menu_category','entree', 'Entrées', 'Entrées et apéritifs'),
('menu_category','main', 'Plats principaux', 'Plats principaux et spécialités'),
('menu_category','dessert', 'Desserts', 'Desserts et douceurs'),
('menu_category','drinks', 'Boissons', 'Boissons et cocktails'),
('menu_category','snacks', 'En-cas', 'En-cas et collations');

-- Tags alimentaires
INSERT INTO ref_code (domain, code, name, description) VALUES
('dietary_tag','vegetarian', 'Végétarien', 'Sans viande ni poisson'),
('dietary_tag','vegan', 'Végan', 'Sans produits d''origine animale'),
('dietary_tag','halal', 'Halal', 'Conforme aux règles alimentaires islamiques'),
('dietary_tag','kosher', 'Casher', 'Conforme aux règles alimentaires juives'),
('dietary_tag','gluten_free', 'Sans gluten', 'Sans gluten'),
('dietary_tag','organic', 'Bio', 'Produits biologiques'),
('dietary_tag','local', 'Local', 'Produits locaux de La Réunion');

-- Allergènes
INSERT INTO ref_code (domain, code, name, description) VALUES
('allergen','gluten', 'Gluten', 'Contient du gluten'),
('allergen','nuts', 'Fruits à coque', 'Contient des fruits à coque'),
('allergen','dairy', 'Lait', 'Contient du lait'),
('allergen','eggs', 'Œufs', 'Contient des œufs'),
('allergen','fish', 'Poisson', 'Contient du poisson'),
('allergen','shellfish', 'Crustacés', 'Contient des crustacés'),
('allergen','soy', 'Soja', 'Contient du soja'),
('allergen','sesame', 'Sésame', 'Contient du sésame');


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
    ('private_terrace','Terrasse privée','bedroom','Terrasse privée'),
    
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
    ('common_terrace','Terrasse commune','outdoor','Terrasse commune'),
    
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
JOIN ref_code_amenity_family fam ON fam.code = v.fam_code;

-- Types HOT via ref_classification_scheme/value
INSERT INTO ref_classification_scheme (code, name) VALUES ('type_hot','Type d''hôtel');
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
WHERE rcs.code='type_hot';


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
('accommodation_type', 'apartment', 'Appartement', 'Appartement de tourisme', 10);

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
('tourism_type', 'rural', 'Tourisme rural', 'Tourisme rural', 10);

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
('transport_type', 'walking', 'Marche à pied', 'Transport à pied', 10);

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
('activity_type', 'bird_watching', 'Observation d''oiseaux', 'Observation d''oiseaux', 10);

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
('season_type', 'holiday_season', 'Saison des vacances', 'Période des vacances', 10);

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
('client_type', 'accessible', 'Personne à mobilité réduite', 'Client avec handicap', 10);

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
('service_type', 'security', 'Sécurité', 'Service de sécurité', 10);

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
('booking_status', 'checked_out', 'Départ', 'Client parti', 10);

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
('promotion_type', 'family', 'Famille', 'Promotion famille', 10);

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
('document_type', 'vaccination', 'Carnet de vaccination', 'Carnet de vaccination', 10);

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
('insurance_type', 'group', 'Assurance groupe', 'Assurance pour groupes', 10);

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
('feedback_type', 'email', 'Email', 'Retour par email', 10);

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
('partnership_type', 'supplier', 'Fournisseur', 'Partenariat avec fournisseurs', 10);

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
('assistance_type', 'natural_disaster', 'Catastrophe naturelle', 'Assistance en cas de catastrophe naturelle', 10);

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
('destination_type', 'family', 'Destination familiale', 'Destination familiale', 10);

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
('event_type', 'cultural_event', 'Événement culturel', 'Événement culturel', 10);

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
('package_type', 'family', 'Famille', 'Forfait famille', 10);

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
('room_type', 'connecting', 'Chambres communicantes', 'Chambres communicantes', 10);


-- =====================================================
-- 2. STATISTIQUES FINALES COMPLÈTES
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
