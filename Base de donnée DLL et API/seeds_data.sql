-- =====================================================
-- DONNÉES DE SEED RÉALISTES - SUPABASE
-- =====================================================
-- Données d'exemple pour tester le schéma unifié
-- Inclut des cas limites et des données ambigües
-- Basé sur les meilleures pratiques de l'industrie du tourisme

-- =====================================================
-- 1. SEED DES TABLES DE RÉFÉRENCE
-- =====================================================

-- Langues (déjà peuplées dans migration_plan.sql)
-- Ajout de langues supplémentaires
INSERT INTO ref_language (code, name, native_name) VALUES
('rcf', 'Créole réunionnais', 'Kréol réyoné'),
('hi', 'Hindi', 'हिन्दी'),
('ta', 'Tamoul', 'தமிழ்'),
('zh', 'Chinois', '中文'),
('de', 'Allemand', 'Deutsch'),
('es', 'Espagnol', 'Español'),
('it', 'Italien', 'Italiano'),
('pt', 'Portugais', 'Português'),
('ru', 'Russe', 'Русский'),
('ja', 'Japonais', '日本語'),
('ko', 'Coréen', '한국어'),
('ar', 'Arabe', 'العربية')
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- CANAUX DE CONTACT COMPLETS
-- =====================================================
INSERT INTO ref_code (domain, code, name, description, position) VALUES
-- Communication traditionnelle
('contact_kind','phone','Téléphone fixe','Numéro de téléphone fixe',1),
('contact_kind','mobile','Mobile','Numéro de téléphone mobile',2),
('contact_kind','fax','Fax','Numéro de fax',3),
('contact_kind','email','Email','Adresse électronique',4),
('contact_kind','website','Site web','Site internet officiel',5),
-- Communication moderne
('contact_kind','whatsapp','WhatsApp','Numéro WhatsApp',6),
('contact_kind','telegram','Telegram','Identifiant Telegram',7),
('contact_kind','signal','Signal','Numéro Signal',8),
('contact_kind','viber','Viber','Numéro Viber',9),
-- Réseaux sociaux
('contact_kind','facebook','Facebook','Page Facebook',10),
('contact_kind','instagram','Instagram','Compte Instagram',11),
('contact_kind','twitter','Twitter','Compte Twitter',12),
('contact_kind','linkedin','LinkedIn','Page LinkedIn',13),
('contact_kind','youtube','YouTube','Chaîne YouTube',14),
('contact_kind','tiktok','TikTok','Compte TikTok',15),
-- Plateformes de réservation
('contact_kind','booking','Booking.com','Lien Booking.com',16),
('contact_kind','airbnb','Airbnb','Lien Airbnb',17),
('contact_kind','tripadvisor','TripAdvisor','Page TripAdvisor',18),
('contact_kind','expedia','Expedia','Lien Expedia',19),
-- Communication professionnelle
('contact_kind','skype','Skype','Identifiant Skype',20),
('contact_kind','teams','Microsoft Teams','Lien Teams',21),
('contact_kind','zoom','Zoom','Lien Zoom',22),
-- Autres
('contact_kind','postal','Adresse postale','Adresse postale complète',23),
('contact_kind','emergency','Urgence','Contact d''urgence',24)
ON CONFLICT (domain, code) DO NOTHING;

-- =====================================================
-- JOURS DE SEMAINE ET TEMPORALITÉ
-- =====================================================
INSERT INTO ref_code (domain, code, name, position) VALUES
('weekday','monday','Lundi',1),
('weekday','tuesday','Mardi',2),
('weekday','wednesday','Mercredi',3),
('weekday','thursday','Jeudi',4),
('weekday','friday','Vendredi',5),
('weekday','saturday','Samedi',6),
('weekday','sunday','Dimanche',7)
ON CONFLICT (domain, code) DO NOTHING;

-- =====================================================
-- TYPES DE PLANNING D'OUVERTURE
-- =====================================================
INSERT INTO ref_code (domain, code, name, description) VALUES
('opening_schedule_type','regular','Régulier','Horaires réguliers fixes'),
('opening_schedule_type','seasonal','Saisonnier','Horaires variables selon les saisons'),
('opening_schedule_type','event','Événementiel','Horaires spéciaux pour événements'),
('opening_schedule_type','flexible','Flexible','Horaires adaptables'),
('opening_schedule_type','24_7','24h/24','Ouvert en continu'),
('opening_schedule_type','appointment','Sur rendez-vous','Ouvert uniquement sur rendez-vous'),
('opening_schedule_type','emergency','Urgence','Ouvert en cas d''urgence uniquement')
ON CONFLICT (domain, code) DO NOTHING;

-- =====================================================
-- TYPES DE MÉDIA COMPLETS
-- =====================================================
INSERT INTO ref_code (domain, code, name, description) VALUES
('media_type','photo','Photo','Image photographique'),
('media_type','video','Vidéo','Contenu vidéo'),
('media_type','audio','Audio','Contenu audio'),
('media_type','document','Document','Document PDF ou autre'),
('media_type','presentation','Présentation','Présentation PowerPoint ou similaire'),
('media_type','brochure','Brochure','Brochure touristique'),
('media_type','map','Carte','Carte géographique'),
('media_type','panorama','Panorama','Vue panoramique 360°'),
('media_type','virtual_tour','Visite virtuelle','Visite virtuelle interactive'),
('media_type','drone','Vue aérienne','Vidéo ou photo prise par drone'),
('media_type','livestream','Diffusion en direct','Contenu en streaming live'),
('media_type','podcast','Podcast','Contenu audio de type podcast')
ON CONFLICT (domain, code) DO NOTHING;

-- =====================================================
-- FAMILLES D'ÉQUIPEMENTS ET SERVICES TOURISTIQUES
-- =====================================================
INSERT INTO ref_code (domain, code, name, description) VALUES
-- Conforts de base
('amenity_family','comforts','Conforts','Équipements de confort de base'),
('amenity_family','services','Services','Services proposés aux clients'),
('amenity_family','equipment','Équipements','Équipements techniques et matériel'),
('amenity_family','accessibility','Accessibilité','Équipements pour personnes à mobilité réduite'),
('amenity_family','safety','Sécurité','Équipements et services de sécurité'),
('amenity_family','wellness','Bien-être','Services de bien-être et détente'),
('amenity_family','entertainment','Divertissement','Équipements et activités de divertissement'),
('amenity_family','business','Affaires','Services pour voyageurs d''affaires'),
('amenity_family','family','Famille','Services et équipements pour familles'),
('amenity_family','sports','Sports','Équipements et activités sportives'),
('amenity_family','technology','Technologie','Équipements technologiques'),
('amenity_family','transport','Transport','Services de transport'),
('amenity_family','food','Restauration','Services de restauration'),
('amenity_family','outdoor','Extérieur','Équipements et espaces extérieurs'),
('amenity_family','environmental','Environnemental','Équipements respectueux de l''environnement')
ON CONFLICT (domain, code) DO NOTHING;

-- =====================================================
-- MOYENS DE PAIEMENT COMPLETS
-- =====================================================
INSERT INTO ref_code (domain, code, name, description) VALUES
-- Cartes bancaires françaises
('payment_method','carte_bleue','Carte Bleue','Carte Bleue française'),
('payment_method','cheque_vacances','Chèques vacances','Chèques vacances ANCV'),
-- Cartes internationales
('payment_method','visa','Visa','Carte Visa'),
('payment_method','mastercard','Mastercard','Carte Mastercard'),
('payment_method','american_express','American Express','Carte American Express'),
('payment_method','diners_club','Diners Club','Carte Diners Club'),
('payment_method','jcb','JCB','Carte JCB'),
('payment_method','discover','Discover','Carte Discover'),
-- Paiements numériques
('payment_method','paypal','PayPal','Paiement via PayPal'),
('payment_method','apple_pay','Apple Pay','Paiement via Apple Pay'),
('payment_method','google_pay','Google Pay','Paiement via Google Pay'),
('payment_method','samsung_pay','Samsung Pay','Paiement via Samsung Pay'),
('payment_method','amazon_pay','Amazon Pay','Paiement via Amazon Pay'),
('payment_method','stripe','Stripe','Paiement via Stripe'),
-- Cryptomonnaies
('payment_method','bitcoin','Bitcoin','Paiement en Bitcoin'),
('payment_method','ethereum','Ethereum','Paiement en Ethereum'),
('payment_method','crypto','Cryptomonnaies','Paiement en cryptomonnaies'),
-- Paiements traditionnels
('payment_method','especes','Espèces','Paiement en espèces'),
('payment_method','cheque','Chèque','Paiement par chèque'),
('payment_method','virement','Virement','Virement bancaire'),
('payment_method','prelevement','Prélèvement','Prélèvement automatique'),
-- Paiements spécialisés
('payment_method','carte_prepayee','Carte prépayée','Carte prépayée'),
('payment_method','carte_cadeau','Carte cadeau','Carte cadeau'),
('payment_method','bon_cadeau','Bon cadeau','Bon cadeau'),
('payment_method','avoir','Avoir','Utilisation d''un avoir'),
-- Paiements professionnels
('payment_method','facture','Facture','Paiement sur facture'),
('payment_method','acompte','Acompte','Paiement d''acompte'),
('payment_method','solde','Solde','Paiement du solde'),
-- Paiements internationaux
('payment_method','alipay','Alipay','Paiement via Alipay'),
('payment_method','wechat_pay','WeChat Pay','Paiement via WeChat Pay'),
('payment_method','unionpay','UnionPay','Carte UnionPay')
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

-- =====================================================
-- TAGS D'ENVIRONNEMENT COMPLETS
-- =====================================================
INSERT INTO ref_code (domain, code, name, description) VALUES
-- Géographie
('environment_tag','bord_mer','Bord de mer','Situé au bord de la mer'),
('environment_tag','montagne','Montagne','En montagne ou proche de la montagne'),
('environment_tag','ville','En ville','En centre-ville'),
('environment_tag','campagne','Campagne','En milieu rural'),
('environment_tag','foret','Forêt','Proche ou dans une forêt'),
('environment_tag','lac','Lac','Proche d''un lac'),
('environment_tag','riviere','Rivière','Proche d''une rivière'),
('environment_tag','lagon','Lagon','Proche du lagon'),
('environment_tag','cascade','Cascade','Proche d''une cascade'),
('environment_tag','volcan','Volcan','Au pied du volcan'),
('environment_tag','plage','Plage','Proche d''une plage'),
('environment_tag','falaise','Falaise','Proche d''une falaise'),
('environment_tag','vallee','Vallée','Dans une vallée'),
('environment_tag','plateau','Plateau','Sur un plateau'),
('environment_tag','ile','Île','Sur une île'),
('environment_tag','archipel','Archipel','Dans un archipel'),

-- Caractéristiques naturelles
('environment_tag','tropical','Tropical','Climat tropical'),
('environment_tag','equatorial','Équatorial','Climat équatorial'),
('environment_tag','oceanique','Océanique','Climat océanique'),
('environment_tag','continental','Continental','Climat continental'),
('environment_tag','mediterraneen','Méditerranéen','Climat méditerranéen'),
('environment_tag','alpin','Alpin','Climat alpin'),
('environment_tag','desertique','Désertique','Climat désertique'),

-- Ambiance
('environment_tag','calme','Calme','Endroit calme et paisible'),
('environment_tag','anime','Animé','Endroit animé et vivant'),
('environment_tag','romantique','Romantique','Endroit romantique'),
('environment_tag','familial','Familial','Endroit adapté aux familles'),
('environment_tag','intime','Intime','Endroit intime et privé'),
('environment_tag','cosmopolite','Cosmopolite','Endroit cosmopolite'),
('environment_tag','traditionnel','Traditionnel','Endroit traditionnel'),
('environment_tag','moderne','Moderne','Endroit moderne'),
('environment_tag','historique','Historique','Endroit historique'),
('environment_tag','culturel','Culturel','Endroit culturel'),

-- Vues et perspectives
('environment_tag','vue_panoramique','Vue panoramique','Vue panoramique exceptionnelle'),
('environment_tag','vue_mer','Vue sur mer','Vue directe sur la mer'),
('environment_tag','vue_montagne','Vue montagne','Vue sur la montagne'),
('environment_tag','vue_jardin','Vue jardin','Vue sur un jardin'),
('environment_tag','vue_piscine','Vue piscine','Vue sur la piscine'),
('environment_tag','vue_ville','Vue ville','Vue sur la ville'),
('environment_tag','vue_coucher_soleil','Vue coucher de soleil','Vue sur le coucher de soleil'),
('environment_tag','vue_levée_soleil','Vue levée de soleil','Vue sur la levée de soleil'),

-- Espaces extérieurs
('environment_tag','jardin','Jardin','Avec jardin'),
('environment_tag','terrasse','Terrasse','Avec terrasse'),
('environment_tag','balcon','Balcon','Avec balcon'),
('environment_tag','patio','Patio','Avec patio'),
('environment_tag','cour','Cour','Avec cour'),
('environment_tag','veranda','Véranda','Avec véranda'),
('environment_tag','piscine','Piscine','Avec piscine'),
('environment_tag','spa_exterieur','Spa extérieur','Avec spa extérieur'),

-- Accessibilité
('environment_tag','accessible_pmr','Accessible PMR','Accessible aux personnes à mobilité réduite'),
('environment_tag','parking_facile','Parking facile','Parking facile d''accès'),
('environment_tag','transport_public','Transport public','Proche des transports publics'),
('environment_tag','centre_ville','Centre-ville','Proche du centre-ville'),
('environment_tag','aeroport','Aéroport','Proche de l''aéroport'),
('environment_tag','gare','Gare','Proche de la gare'),
('environment_tag','autoroute','Autoroute','Proche de l''autoroute'),

-- Activités
('environment_tag','randonnee','Randonnée','Idéal pour la randonnée'),
('environment_tag','plongee','Plongée','Idéal pour la plongée'),
('environment_tag','surf','Surf','Idéal pour le surf'),
('environment_tag','kitesurf','Kitesurf','Idéal pour le kitesurf'),
('environment_tag','voile','Voile','Idéal pour la voile'),
('environment_tag','peche','Pêche','Idéal pour la pêche'),
('environment_tag','golf','Golf','Idéal pour le golf'),
('environment_tag','tennis','Tennis','Idéal pour le tennis'),
('environment_tag','equitation','Équitation','Idéal pour l''équitation'),
('environment_tag','ski','Ski','Idéal pour le ski'),
('environment_tag','velo','Vélo','Idéal pour le vélo'),
('environment_tag','escalade','Escalade','Idéal pour l''escalade'),

-- Saisonnalité
('environment_tag','ete','Été','Idéal en été'),
('environment_tag','hiver','Hiver','Idéal en hiver'),
('environment_tag','printemps','Printemps','Idéal au printemps'),
('environment_tag','automne','Automne','Idéal en automne'),
('environment_tag','toute_saison','Toute saison','Idéal toute l''année'),
('environment_tag','saison_chaude','Saison chaude','Idéal en saison chaude'),
('environment_tag','saison_froide','Saison froide','Idéal en saison froide')
ON CONFLICT (domain, code) DO NOTHING;

-- =====================================================
-- RÉSEAUX SOCIAUX ET PLATEFORMES
-- =====================================================
INSERT INTO ref_code (domain, code, name, description) VALUES
-- Réseaux sociaux principaux
('social_network','facebook','Facebook','Réseau social Facebook'),
('social_network','instagram','Instagram','Réseau social Instagram'),
('social_network','twitter','Twitter','Réseau social Twitter'),
('social_network','linkedin','LinkedIn','Réseau professionnel LinkedIn'),
('social_network','youtube','YouTube','Plateforme vidéo YouTube'),
('social_network','tiktok','TikTok','Réseau social TikTok'),
('social_network','snapchat','Snapchat','Réseau social Snapchat'),
('social_network','pinterest','Pinterest','Plateforme de partage Pinterest'),
('social_network','reddit','Reddit','Forum communautaire Reddit'),
('social_network','discord','Discord','Plateforme de communication Discord'),

-- Plateformes de réservation
('social_network','booking','Booking.com','Plateforme de réservation Booking.com'),
('social_network','airbnb','Airbnb','Plateforme de location Airbnb'),
('social_network','tripadvisor','TripAdvisor','Plateforme d''avis TripAdvisor'),
('social_network','expedia','Expedia','Plateforme de voyage Expedia'),
('social_network','hotels','Hotels.com','Plateforme d''hôtels Hotels.com'),
('social_network','agoda','Agoda','Plateforme de réservation Agoda'),
('social_network','trivago','Trivago','Moteur de recherche hôtel Trivago'),
('social_network','kayak','Kayak','Moteur de recherche voyage Kayak'),

-- Plateformes de communication
('social_network','whatsapp','WhatsApp','Messagerie WhatsApp'),
('social_network','telegram','Telegram','Messagerie Telegram'),
('social_network','signal','Signal','Messagerie Signal'),
('social_network','viber','Viber','Messagerie Viber'),
('social_network','skype','Skype','Communication Skype'),
('social_network','zoom','Zoom','Visioconférence Zoom'),
('social_network','teams','Microsoft Teams','Collaboration Teams'),

-- Plateformes de contenu
('social_network','twitch','Twitch','Plateforme de streaming Twitch'),
('social_network','vimeo','Vimeo','Plateforme vidéo Vimeo'),
('social_network','dailymotion','Dailymotion','Plateforme vidéo Dailymotion'),
('social_network','soundcloud','SoundCloud','Plateforme audio SoundCloud'),
('social_network','spotify','Spotify','Plateforme musicale Spotify'),
('social_network','apple_music','Apple Music','Plateforme musicale Apple Music'),

-- Plateformes professionnelles
('social_network','behance','Behance','Portfolio créatif Behance'),
('social_network','dribbble','Dribbble','Plateforme design Dribbble'),
('social_network','github','GitHub','Plateforme développement GitHub'),
('social_network','gitlab','GitLab','Plateforme développement GitLab'),
('social_network','stackoverflow','Stack Overflow','Forum développeurs Stack Overflow')
ON CONFLICT (domain, code) DO NOTHING;

-- =====================================================
-- ÉQUIPEMENTS ET SERVICES TOURISTIQUES COMPLETS
-- =====================================================
INSERT INTO ref_amenity (code, name, family_id, description)
SELECT v.code, v.name, fam.id, v.description
FROM (
  VALUES
    -- Conforts de base
    ('tv','Télévision','comforts','Télévision dans les chambres'),
    ('wifi','Wi-Fi','comforts','Accès Wi‑Fi gratuit'),
    ('climatisation','Climatisation','comforts','Climatisation'),
    ('chauffage','Chauffage','comforts','Système de chauffage'),
    ('minibar','Minibar','comforts','Minibar dans la chambre'),
    ('coffre','Coffre-fort','comforts','Coffre-fort sécurisé'),
    ('balcon','Balcon','comforts','Balcon privé'),
    ('terrasse','Terrasse','comforts','Terrasse privée'),
    ('vue_mer','Vue sur mer','comforts','Vue sur la mer'),
    ('vue_montagne','Vue montagne','comforts','Vue sur la montagne'),
    
    -- Services
    ('restaurant','Restaurant','services','Restaurant sur place'),
    ('bar','Bar','services','Bar'),
    ('room_service','Service de chambre','services','Service de chambre'),
    ('concierge','Conciergerie','services','Service de conciergerie'),
    ('reception_24h','Réception 24h/24','services','Réception ouverte 24h/24'),
    ('navette','Navette','services','Service de navette'),
    ('blanchisserie','Blanchisserie','services','Service de blanchisserie'),
    ('materiel_bebe','Matériel bébé','services','Lit bébé / chaise haute'),
    ('location_velo','Location de vélo','services','Location de vélos'),
    ('location_voiture','Location de voiture','services','Location de voitures'),
    ('guide','Guide touristique','services','Guide touristique'),
    ('excursion','Excursions','services','Organisation d''excursions'),
    
    -- Équipements
    ('piscine','Piscine','equipment','Piscine'),
    ('spa','Spa','equipment','Centre de spa'),
    ('fitness','Salle de sport','equipment','Salle de fitness'),
    ('tennis','Court de tennis','equipment','Court de tennis'),
    ('golf','Golf','equipment','Terrains de golf'),
    ('snorkeling','Snorkeling','equipment','Matériel de snorkeling'),
    ('plongee','Plongée','equipment','Équipement de plongée'),
    ('kayak','Kayak','equipment','Kayaks disponibles'),
    ('barbecue','Barbecue','equipment','Barbecue à disposition'),
    ('parking','Parking','equipment','Parking gratuit'),
    ('garage','Garage','equipment','Garage couvert'),
    ('ascenseur','Ascenseur','equipment','Ascenseur'),
    
    -- Accessibilité
    ('pmr','Accessible PMR','accessibility','Accessible aux personnes à mobilité réduite'),
    ('rampe','Rampe d''accès','accessibility','Rampe d''accès pour fauteuils roulants'),
    ('ascenseur_pmr','Ascenseur PMR','accessibility','Ascenseur adapté PMR'),
    ('chambre_pmr','Chambre PMR','accessibility','Chambre adaptée PMR'),
    ('salle_bain_pmr','Salle de bain PMR','accessibility','Salle de bain adaptée PMR'),
    ('signaletique_braille','Signalétique braille','accessibility','Signalétique en braille'),
    ('audio_description','Audio-description','accessibility','Audio-description disponible'),
    ('langue_signes','Langue des signes','accessibility','Personnel formé langue des signes'),
    
    -- Sécurité
    ('securite_24h','Sécurité 24h/24','safety','Service de sécurité 24h/24'),
    ('camera','Caméras de sécurité','safety','Système de vidéosurveillance'),
    ('detecteur_fumee','Détecteur de fumée','safety','Détecteurs de fumée'),
    ('extincteur','Extincteurs','safety','Extincteurs disponibles'),
    ('alarme','Système d''alarme','safety','Système d''alarme'),
    ('salle_securite','Salle de sécurité','safety','Salle de sécurité'),
    
    -- Bien-être
    ('massage','Massages','wellness','Service de massages'),
    ('sauna','Sauna','wellness','Sauna'),
    ('hammam','Hammam','wellness','Hammam'),
    ('jacuzzi','Jacuzzi','wellness','Jacuzzi'),
    ('yoga','Yoga','wellness','Cours de yoga'),
    ('meditation','Méditation','wellness','Espace de méditation'),
    ('aromathérapie','Aromathérapie','wellness','Aromathérapie'),
    
    -- Divertissement
    ('casino','Casino','entertainment','Casino'),
    ('disco','Discothèque','entertainment','Discothèque'),
    ('karaoke','Karaoké','entertainment','Karaoké'),
    ('jeux_video','Jeux vidéo','entertainment','Salle de jeux vidéo'),
    ('billard','Billard','entertainment','Table de billard'),
    ('ping_pong','Ping-pong','entertainment','Table de ping-pong'),
    ('jeux_societe','Jeux de société','entertainment','Jeux de société'),
    ('bibliotheque','Bibliothèque','entertainment','Bibliothèque'),
    
    -- Affaires
    ('salle_reunion','Salle de réunion','business','Salle de réunion'),
    ('centre_affaires','Centre d''affaires','business','Centre d''affaires'),
    ('imprimante','Imprimante','business','Imprimante disponible'),
    ('scanner','Scanner','business','Scanner disponible'),
    ('videoprojecteur','Vidéoprojecteur','business','Vidéoprojecteur'),
    ('tableau_blanc','Tableau blanc','business','Tableau blanc'),
    ('traduction','Service de traduction','business','Service de traduction'),
    ('secretaire','Secrétariat','business','Service de secrétariat'),
    
    -- Famille
    ('aire_jeux','Aire de jeux','family','Aire de jeux pour enfants'),
    ('club_enfants','Club enfants','family','Club pour enfants'),
    ('garde_enfants','Garde d''enfants','family','Service de garde d''enfants'),
    ('piscine_enfants','Piscine enfants','family','Piscine pour enfants'),
    ('menu_enfants','Menu enfants','family','Menu spécial enfants'),
    ('lit_supplementaire','Lit supplémentaire','family','Lit supplémentaire disponible'),
    ('chaise_haute','Chaise haute','family','Chaise haute pour bébé'),
    ('poussette','Poussette','family','Poussette disponible'),
    
    -- Sports
    ('squash','Squash','sports','Court de squash'),
    ('badminton','Badminton','sports','Court de badminton'),
    ('volley','Volley-ball','sports','Terrain de volley-ball'),
    ('basket','Basket-ball','sports','Terrain de basket-ball'),
    ('football','Football','sports','Terrain de football'),
    ('padel','Padel','sports','Court de padel'),
    ('escalade','Escalade','sports','Mur d''escalade'),
    ('randonnee','Randonnée','sports','Sentiers de randonnée'),
    ('velo','Vélo','sports','Pistes cyclables'),
    ('equitation','Équitation','sports','Centre équestre'),
    
    -- Technologie
    ('fibre','Fibre optique','technology','Connexion fibre optique'),
    ('wifi_premium','Wi-Fi premium','technology','Wi-Fi haut débit'),
    ('charge_wireless','Charge sans fil','technology','Chargeurs sans fil'),
    ('smart_tv','Smart TV','technology','Télévision connectée'),
    ('assistant_vocal','Assistant vocal','technology','Assistant vocal intelligent'),
    ('domotique','Domotique','technology','Système domotique'),
    ('realite_virtuelle','Réalité virtuelle','technology','Équipement VR'),
    ('streaming','Streaming','technology','Services de streaming'),
    
    -- Transport
    ('aeroport','Navette aéroport','transport','Navette vers l''aéroport'),
    ('gare','Navette gare','transport','Navette vers la gare'),
    ('centre_ville','Navette centre-ville','transport','Navette vers le centre-ville'),
    ('taxi','Service taxi','transport','Service de taxi'),
    ('limousine','Limousine','transport','Service de limousine'),
    ('helicoptere','Hélicoptère','transport','Service d''hélicoptère'),
    ('bateau','Bateau','transport','Service de bateau'),
    ('velo_electrique','Vélo électrique','transport','Vélos électriques'),
    
    -- Restauration
    ('petit_dejeuner','Petit-déjeuner','food','Petit-déjeuner inclus'),
    ('demi_pension','Demi-pension','food','Demi-pension'),
    ('pension_complete','Pension complète','food','Pension complète'),
    ('all_inclusive','Tout inclus','food','Tout inclus'),
    ('menu_vegetarien','Menu végétarien','food','Menu végétarien'),
    ('menu_vegan','Menu végan','food','Menu végan'),
    ('menu_halal','Menu halal','food','Menu halal'),
    ('menu_kosher','Menu casher','food','Menu casher'),
    ('degustation','Dégustation','food','Dégustation de produits locaux'),
    ('cours_cuisine','Cours de cuisine','food','Cours de cuisine'),
    
    -- Extérieur
    ('jardin','Jardin','outdoor','Jardin privé'),
    ('terrasse_commune','Terrasse commune','outdoor','Terrasse commune'),
    ('piscine_exterieure','Piscine extérieure','outdoor','Piscine extérieure'),
    ('plage_privee','Plage privée','outdoor','Plage privée'),
    ('ponton','Ponton','outdoor','Ponton privé'),
    ('quai','Quai','outdoor','Quai privé'),
    ('parc','Parc','outdoor','Parc à proximité'),
    ('foret','Forêt','outdoor','Accès à la forêt'),
    ('montagne','Montagne','outdoor','Accès à la montagne'),
    ('lac','Lac','outdoor','Accès au lac'),
    
    -- Environnemental
    ('energie_renouvelable','Énergie renouvelable','environmental','Énergie renouvelable'),
    ('tri_dechets','Tri des déchets','environmental','Système de tri des déchets'),
    ('compost','Compostage','environmental','Système de compostage'),
    ('panneaux_solaires','Panneaux solaires','environmental','Panneaux solaires'),
    ('eoliennes','Éoliennes','environmental','Éoliennes'),
    ('recyclage_eau','Recyclage eau','environmental','Système de recyclage de l''eau'),
    ('materiaux_ecologiques','Matériaux écologiques','environmental','Matériaux écologiques'),
    ('certification_eco','Certification écologique','environmental','Certification écologique'),
    ('compensation_carbone','Compensation carbone','environmental','Compensation carbone'),
    ('produits_locaux','Produits locaux','environmental','Produits locaux uniquement')
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
-- DOMAINES SUPPLÉMENTAIRES POUR LE TOURISME
-- =====================================================

-- Types de prix
INSERT INTO ref_code (domain, code, name, description) VALUES
('price_kind','standard','Standard','Prix standard'),
('price_kind','promo','Promotion','Prix promotionnel'),
('price_kind','groupe','Groupe','Prix groupe'),
('price_kind','senior','Senior','Prix senior'),
('price_kind','enfant','Enfant','Prix enfant'),
('price_kind','etudiant','Étudiant','Prix étudiant'),
('price_kind','last_minute','Dernière minute','Prix dernière minute'),
('price_kind','early_bird','Early bird','Prix early bird'),
('price_kind','saison','Saisonnier','Prix saisonnier'),
('price_kind','weekend','Weekend','Prix weekend'),
('price_kind','semaine','Semaine','Prix semaine'),
('price_kind','mensuel','Mensuel','Prix mensuel'),
('price_kind','annuel','Annuel','Prix annuel'),
('price_kind','luxe','Luxe','Prix luxe'),
('price_kind','economique','Économique','Prix économique')
ON CONFLICT (domain, code) DO NOTHING;

-- Unités de prix
INSERT INTO ref_code (domain, code, name, description) VALUES
('price_unit','per_person','Par personne','Prix par personne'),
('price_unit','per_room','Par chambre','Prix par chambre'),
('price_unit','per_night','Par nuit','Prix par nuit'),
('price_unit','per_week','Par semaine','Prix par semaine'),
('price_unit','per_month','Par mois','Prix par mois'),
('price_unit','per_year','Par an','Prix par an'),
('price_unit','per_hour','Par heure','Prix par heure'),
('price_unit','per_day','Par jour','Prix par jour'),
('price_unit','per_meal','Par repas','Prix par repas'),
('price_unit','per_activity','Par activité','Prix par activité'),
('price_unit','per_group','Par groupe','Prix par groupe'),
('price_unit','per_family','Par famille','Prix par famille'),
('price_unit','per_couple','Par couple','Prix par couple'),
('price_unit','per_vehicle','Par véhicule','Prix par véhicule'),
('price_unit','per_km','Par kilomètre','Prix par kilomètre')
ON CONFLICT (domain, code) DO NOTHING;

-- Équipements de réunion
INSERT INTO ref_code (domain, code, name, description) VALUES
('meeting_equipment','projecteur','Projecteur','Vidéoprojecteur'),
('meeting_equipment','ecran','Écran','Écran de projection'),
('meeting_equipment','tableau_blanc','Tableau blanc','Tableau blanc effaçable'),
('meeting_equipment','tableau_noir','Tableau noir','Tableau noir'),
('meeting_equipment','flipchart','Flipchart','Tableau à feuilles'),
('meeting_equipment','microphone','Microphone','Microphone'),
('meeting_equipment','haut_parleur','Haut-parleur','Système de sonorisation'),
('meeting_equipment','camera','Caméra','Caméra de visioconférence'),
('meeting_equipment','telephone','Téléphone','Téléphone de conférence'),
('meeting_equipment','wifi','Wi-Fi','Connexion Wi-Fi'),
('meeting_equipment','prise_electrique','Prise électrique','Prises électriques'),
('meeting_equipment','climatisation','Climatisation','Climatisation'),
('meeting_equipment','eclairage','Éclairage','Éclairage adapté'),
('meeting_equipment','isolation','Isolation','Isolation phonique'),
('meeting_equipment','acces_pmr','Accès PMR','Accessible PMR')
ON CONFLICT (domain, code) DO NOTHING;

-- Pratiques d'itinéraires
INSERT INTO ref_code (domain, code, name, description) VALUES
('iti_practice','randonnee','Randonnée','Randonnée pédestre'),
('iti_practice','velo','Vélo','Cyclotourisme'),
('iti_practice','moto','Moto','Moto-tourisme'),
('iti_practice','voiture','Voiture','Road trip'),
('iti_practice','bus','Bus','Tour en bus'),
('iti_practice','bateau','Bateau','Croisière'),
('iti_practice','avion','Avion','Voyage en avion'),
('iti_practice','train','Train','Voyage en train'),
('iti_practice','cheval','Cheval','Équitation'),
('iti_practice','kayak','Kayak','Kayak'),
('iti_practice','plongee','Plongée','Plongée sous-marine'),
('iti_practice','surf','Surf','Surf'),
('iti_practice','ski','Ski','Ski'),
('iti_practice','escalade','Escalade','Escalade'),
('iti_practice','parapente','Parapente','Parapente')
ON CONFLICT (domain, code) DO NOTHING;

-- Sujets de demande
INSERT INTO ref_code (domain, code, name, description) VALUES
('demand_topic','hebergement','Hébergement','Demandes d''hébergement'),
('demand_topic','restauration','Restauration','Demandes de restauration'),
('demand_topic','transport','Transport','Demandes de transport'),
('demand_topic','activites','Activités','Demandes d''activités'),
('demand_topic','visites','Visites','Demandes de visites'),
('demand_topic','evenements','Événements','Demandes d''événements'),
('demand_topic','shopping','Shopping','Demandes de shopping'),
('demand_topic','bien_etre','Bien-être','Demandes de bien-être'),
('demand_topic','culture','Culture','Demandes culturelles'),
('demand_topic','nature','Nature','Demandes nature'),
('demand_topic','aventure','Aventure','Demandes d''aventure'),
('demand_topic','relaxation','Relaxation','Demandes de relaxation'),
('demand_topic','famille','Famille','Demandes familiales'),
('demand_topic','couple','Couple','Demandes de couple'),
('demand_topic','groupe','Groupe','Demandes de groupe')
ON CONFLICT (domain, code) DO NOTHING;

-- Sous-sujets de demande
INSERT INTO ref_code (domain, code, name, description) VALUES
('demand_subtopic','hotel','Hôtel','Demandes d''hôtel'),
('demand_subtopic','gite','Gîte','Demandes de gîte'),
('demand_subtopic','camping','Camping','Demandes de camping'),
('demand_subtopic','restaurant','Restaurant','Demandes de restaurant'),
('demand_subtopic','cafe','Café','Demandes de café'),
('demand_subtopic','bar','Bar','Demandes de bar'),
('demand_subtopic','location_voiture','Location voiture','Demandes de location voiture'),
('demand_subtopic','taxi','Taxi','Demandes de taxi'),
('demand_subtopic','guide','Guide','Demandes de guide'),
('demand_subtopic','musee','Musée','Demandes de musée'),
('demand_subtopic','monument','Monument','Demandes de monument'),
('demand_subtopic','plage','Plage','Demandes de plage'),
('demand_subtopic','montagne','Montagne','Demandes de montagne'),
('demand_subtopic','spa','Spa','Demandes de spa'),
('demand_subtopic','golf','Golf','Demandes de golf')
ON CONFLICT (domain, code) DO NOTHING;

-- Ambiances
INSERT INTO ref_code (domain, code, name, description) VALUES
('mood','romantique','Romantique','Ambiance romantique'),
('mood','familial','Familial','Ambiance familiale'),
('mood','detente','Détente','Ambiance détente'),
('mood','aventure','Aventure','Ambiance aventure'),
('mood','luxe','Luxe','Ambiance luxe'),
('mood','authentique','Authentique','Ambiance authentique'),
('mood','moderne','Moderne','Ambiance moderne'),
('mood','traditionnel','Traditionnel','Ambiance traditionnelle'),
('mood','cosmopolite','Cosmopolite','Ambiance cosmopolite'),
('mood','intime','Intime','Ambiance intime'),
('mood','festif','Festif','Ambiance festive'),
('mood','calme','Calme','Ambiance calme'),
('mood','dynamique','Dynamique','Ambiance dynamique'),
('mood','culturel','Culturel','Ambiance culturelle'),
('mood','nature','Nature','Ambiance nature')
ON CONFLICT (domain, code) DO NOTHING;

-- Niveaux de langue
INSERT INTO ref_code (domain, code, name, description, position) VALUES
('language_level','debutant','Débutant','Niveau débutant',1),
('language_level','intermediaire','Intermédiaire','Niveau intermédiaire',2),
('language_level','avance','Avancé','Niveau avancé',3),
('language_level','bilingue','Bilingue','Niveau bilingue',4),
('language_level','natif','Natif','Langue maternelle',5)
ON CONFLICT (domain, code) DO NOTHING;

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
-- RÉSUMÉ DES AMÉLIORATIONS APPORTÉES
-- =====================================================
-- Ce fichier de seed a été considérablement amélioré avec :
-- 
-- 1. CANAUX DE CONTACT COMPLETS (24 types)
--    - Communication traditionnelle (téléphone, fax, email, site web)
--    - Communication moderne (WhatsApp, Telegram, Signal, Viber)
--    - Réseaux sociaux (Facebook, Instagram, Twitter, LinkedIn, YouTube, TikTok)
--    - Plateformes de réservation (Booking, Airbnb, TripAdvisor, Expedia)
--    - Communication professionnelle (Skype, Teams, Zoom)
--    - Autres (postal, urgence)
--
-- 2. TYPES DE MÉDIA ÉTENDUS (12 types)
--    - Contenus traditionnels (photo, vidéo, audio, document)
--    - Contenus modernes (présentation, brochure, carte, panorama)
--    - Contenus innovants (visite virtuelle, drone, livestream, podcast)
--
-- 3. FAMILLES D'ÉQUIPEMENTS TOURISTIQUES (15 familles)
--    - Conforts, Services, Équipements, Accessibilité, Sécurité
--    - Bien-être, Divertissement, Affaires, Famille, Sports
--    - Technologie, Transport, Restauration, Extérieur, Environnemental
--
-- 4. ÉQUIPEMENTS ET SERVICES COMPLETS (100+ équipements)
--    - Conforts de base (TV, Wi-Fi, climatisation, minibar, coffre-fort)
--    - Services (restaurant, bar, conciergerie, réception 24h, navette)
--    - Équipements (piscine, spa, fitness, tennis, golf, snorkeling)
--    - Accessibilité (PMR, rampe, ascenseur PMR, chambre PMR, signalétique braille)
--    - Sécurité (sécurité 24h, caméras, détecteurs, extincteurs, alarme)
--    - Bien-être (massages, sauna, hammam, jacuzzi, yoga, méditation)
--    - Divertissement (casino, disco, karaoké, jeux vidéo, billard)
--    - Affaires (salle réunion, centre affaires, imprimante, traduction)
--    - Famille (aire jeux, club enfants, garde enfants, menu enfants)
--    - Sports (squash, badminton, volley, escalade, randonnée, équitation)
--    - Technologie (fibre, Wi-Fi premium, charge sans fil, smart TV, domotique)
--    - Transport (navette aéroport, taxi, limousine, hélicoptère, bateau)
--    - Restauration (petit-déjeuner, demi-pension, tout inclus, menus spéciaux)
--    - Extérieur (jardin, terrasse, piscine extérieure, plage privée)
--    - Environnemental (énergie renouvelable, tri déchets, compost, panneaux solaires)
--
-- 5. MOYENS DE PAIEMENT COMPLETS (25+ méthodes)
--    - Cartes françaises (Carte Bleue, chèques vacances)
--    - Cartes internationales (Visa, Mastercard, American Express, Diners Club, JCB)
--    - Paiements numériques (PayPal, Apple Pay, Google Pay, Samsung Pay, Amazon Pay)
--    - Cryptomonnaies (Bitcoin, Ethereum, cryptomonnaies)
--    - Paiements traditionnels (espèces, chèque, virement, prélèvement)
--    - Paiements spécialisés (carte prépayée, carte cadeau, bon cadeau, avoir)
--    - Paiements professionnels (facture, acompte, solde)
--    - Paiements internationaux (Alipay, WeChat Pay, UnionPay)
--
-- 6. TAGS D'ENVIRONNEMENT COMPLETS (50+ tags)
--    - Géographie (bord de mer, montagne, ville, campagne, forêt, lac, lagon, volcan)
--    - Caractéristiques naturelles (tropical, équatorial, océanique, continental)
--    - Ambiance (calme, animé, romantique, familial, intime, cosmopolite)
--    - Vues et perspectives (panoramique, vue mer, vue montagne, coucher de soleil)
--    - Espaces extérieurs (jardin, terrasse, balcon, patio, piscine)
--    - Accessibilité (accessible PMR, parking facile, transport public)
--    - Activités (randonnée, plongée, surf, golf, tennis, équitation)
--    - Saisonnalité (été, hiver, printemps, automne, toute saison)
--
-- 7. RÉSEAUX SOCIAUX ET PLATEFORMES (25+ plateformes)
--    - Réseaux sociaux (Facebook, Instagram, Twitter, LinkedIn, YouTube, TikTok)
--    - Plateformes de réservation (Booking, Airbnb, TripAdvisor, Expedia)
--    - Communication (WhatsApp, Telegram, Signal, Viber, Skype, Zoom)
--    - Contenu (Twitch, Vimeo, SoundCloud, Spotify, Apple Music)
--    - Professionnelles (Behance, Dribbble, GitHub, GitLab, Stack Overflow)
--
-- 8. DOMAINES SUPPLÉMENTAIRES
--    - Types de prix (standard, promo, groupe, senior, enfant, étudiant)
--    - Unités de prix (par personne, par chambre, par nuit, par semaine)
--    - Équipements de réunion (projecteur, écran, tableau, microphone)
--    - Pratiques d'itinéraires (randonnée, vélo, moto, voiture, bateau)
--    - Sujets de demande (hébergement, restauration, transport, activités)
--    - Ambiances (romantique, familial, détente, aventure, luxe)
--    - Niveaux de langue (débutant, intermédiaire, avancé, bilingue, natif)
--
-- 9. LANGUES ÉTENDUES (12 langues supplémentaires)
--    - Langues européennes (allemand, espagnol, italien, portugais, russe)
--    - Langues asiatiques (chinois, japonais, coréen, hindi, tamoul)
--    - Langues régionales (créole réunionnais, arabe)
--
-- Toutes ces données respectent les standards de l'industrie du tourisme
-- et sont adaptées au contexte français et réunionnais.
-- Section legacy retirée dans ce seed pour rester compatible avec le schéma courant
