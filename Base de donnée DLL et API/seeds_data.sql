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

-- Types de contact
INSERT INTO ref_code (domain, code, name, description) VALUES
 ('contact_kind','phone','Téléphone','Numéro de téléphone fixe de l''accueil'),
 ('contact_kind','mobile','Mobile','Numéro de portable pour joindre l''établissement'),
 ('contact_kind','fax','Fax','Numéro de fax de réception'),
 ('contact_kind','email','Email','Adresse électronique principale'),
 ('contact_kind','website','Site web','URL du site officiel'),
 ('contact_kind','booking_engine','Plateforme de réservation','Lien vers un moteur de réservation en ligne'),
 ('contact_kind','whatsapp','WhatsApp','Contact WhatsApp Business'),
 ('contact_kind','messenger','Messenger','Lien Facebook Messenger'),
 ('contact_kind','sms','SMS','Numéro dédié aux SMS'),
 ('contact_kind','skype','Skype','Identifiant Skype'),
 ('contact_kind','wechat','WeChat','Identifiant WeChat pour la clientèle asiatique'),
 ('contact_kind','line','LINE','Identifiant LINE'),
 ('contact_kind','viber','Viber','Contact Viber'),
 ('contact_kind','telegram','Telegram','Compte Telegram pour les notifications')
ON CONFLICT DO NOTHING;

-- Réseaux sociaux clés pour la promotion touristique
INSERT INTO ref_code (domain, code, name, description) VALUES
 ('social_network','facebook','Facebook','Page officielle Facebook'),
 ('social_network','instagram','Instagram','Profil Instagram'),
 ('social_network','youtube','YouTube','Chaîne YouTube de destination'),
 ('social_network','tiktok','TikTok','Compte TikTok pour contenus courts'),
 ('social_network','pinterest','Pinterest','Tableaux d''inspiration Pinterest'),
 ('social_network','linkedin','LinkedIn','Page professionnelle LinkedIn'),
 ('social_network','twitter','X (Twitter)','Compte X / Twitter'),
 ('social_network','tripadvisor','Tripadvisor','Fiche Tripadvisor'),
 ('social_network','booking','Booking.com','Profil Booking.com'),
 ('social_network','google_business','Google Business Profile','Fiche Google Business Profile')
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

-- Types de planning d'ouverture
INSERT INTO ref_code (domain, code, name) VALUES
 ('opening_schedule_type','regular','Régulier'),
 ('opening_schedule_type','seasonal','Saisonnier'),
 ('opening_schedule_type','exceptional','Exceptionnel'),
 ('opening_schedule_type','by_appointment','Sur rendez-vous'),
 ('opening_schedule_type','continuous_service','Service continu')
ON CONFLICT DO NOTHING;

INSERT INTO ref_code (domain, code, name, description) VALUES
 ('media_type','photo','Photo','Photographies officielles'),
 ('media_type','video','Vidéo','Vidéos de présentation'),
 ('media_type','audio','Audio','Fichiers audio et podcasts'),
 ('media_type','brochure_pdf','Brochure PDF','Brochures téléchargeables'),
 ('media_type','brochure_print','Brochure imprimée','Brochures physiques numérisées'),
 ('media_type','plan','Plan','Plan ou carte statique'),
 ('media_type','virtual_tour','Visite virtuelle','Visites 360° ou immersives'),
 ('media_type','webcam','Webcam','Flux webcam en direct'),
 ('media_type','logo','Logo','Logotypes officiels'),
 ('media_type','press_kit','Dossier de presse','Dossiers médias et communiqués')
ON CONFLICT DO NOTHING;

-- Niveaux de langue (CECRL)
INSERT INTO ref_code (domain, code, name, description) VALUES
 ('language_level','a1','A1 - Débutant','Notions élémentaires'),
 ('language_level','a2','A2 - Pré-intermédiaire','Communication simple'),
 ('language_level','b1','B1 - Intermédiaire','Interaction quotidienne'),
 ('language_level','b2','B2 - Intermédiaire avancé','Communication professionnelle courante'),
 ('language_level','c1','C1 - Avancé','Maîtrise opérationnelle complète'),
 ('language_level','c2','C2 - Maîtrise','Maîtrise experte de la langue'),
 ('language_level','native','Langue maternelle','Langue parlée couramment par l''équipe')
ON CONFLICT DO NOTHING;

INSERT INTO ref_code (domain, code, name, description) VALUES
 ('amenity_family','comforts','Conforts','Éléments de confort dans les chambres et parties communes'),
 ('amenity_family','services','Services','Services généraux offerts aux clients'),
 ('amenity_family','equipment','Équipements','Équipements matériels disponibles'),
 ('amenity_family','wellness','Bien-être','Installations de bien-être et spa'),
 ('amenity_family','business','Affaires','Services dédiés à la clientèle affaires'),
 ('amenity_family','family','Famille','Services et équipements famille & enfants'),
 ('amenity_family','outdoor','Plein air','Équipements et activités extérieurs'),
 ('amenity_family','gastronomy','Gastronomie','Prestations de restauration et bar'),
 ('amenity_family','accessibility','Accessibilité','Dispositifs facilitant l''accès PMR'),
 ('amenity_family','sustainable','Développement durable','Initiatives et équipements responsables')
ON CONFLICT DO NOTHING;

INSERT INTO ref_code (domain, code, name, description) VALUES
('payment_method','especes', 'Espèces', 'Paiement en liquide'),
('payment_method','cheque', 'Chèque', 'Chèques bancaires'),
('payment_method','cheque_vacances', 'Chèques vacances', 'Chèques vacances ANCV'),
('payment_method','carte_bleue', 'Carte Bleue', 'Carte bancaire française'),
('payment_method','visa', 'Visa', 'Carte Visa'),
('payment_method','mastercard', 'Mastercard', 'Carte Mastercard'),
('payment_method','american_express', 'American Express', 'Carte American Express'),
('payment_method','maestro', 'Maestro', 'Carte Maestro / Débit'),
('payment_method','virement', 'Virement bancaire', 'Transfert bancaire'),
('payment_method','paypal', 'PayPal', 'Paiement via PayPal'),
('payment_method','apple_pay', 'Apple Pay', 'Paiement sans contact Apple Pay'),
('payment_method','google_pay', 'Google Pay', 'Paiement sans contact Google Pay'),
('payment_method','vacaf', 'VACAF', 'Aide VACAF acceptée'),
('payment_method','crypto', 'Cryptomonnaie', 'Paiement en cryptomonnaies acceptées')
ON CONFLICT DO NOTHING;

-- Rôles de contact de base
INSERT INTO ref_contact_role (code, name, description) VALUES
('reservation', 'Réservation', 'Contact pour réservations'),
('management', 'Management', 'Direction / management'),
('press', 'Presse', 'Relations presse'),
('technical', 'Technique', 'Support technique / IT'),
('sales', 'Commercial', 'Ventes / commercial'),
('info', 'Information', 'Informations générales');

INSERT INTO ref_code (domain, code, name, description) VALUES
('environment_tag','volcan', 'Au pied du volcan', 'Situé au pied du Piton de la Fournaise'),
('environment_tag','plage', 'Plage', 'Proche d''une plage'),
('environment_tag','lagon', 'Lagon', 'Proche du lagon'),
('environment_tag','cascade', 'Cascade', 'Proche d''une cascade'),
('environment_tag','jardin', 'Jardin', 'Avec jardin paysager'),
('environment_tag','terrasse', 'Terrasse', 'Avec terrasse aménagée'),
('environment_tag','vue_panoramique', 'Vue panoramique', 'Vue panoramique exceptionnelle'),
('environment_tag','calme', 'Calme', 'Environnement calme'),
('environment_tag','anime', 'Animé', 'Quartier animé'),
('environment_tag','bord_mer', 'Bord de mer', 'Face au littoral'),
('environment_tag','front_de_mer', 'Front de mer', 'Sur le front de mer'),
('environment_tag','ville', 'En ville', 'Coeur de ville'),
('environment_tag','centre_ville', 'Centre-ville', 'Hyper-centre urbain'),
('environment_tag','montagne', 'Montagne', 'Zone de montagne'),
('environment_tag','campagne', 'Campagne', 'Cadre campagnard'),
('environment_tag','foret', 'Forêt', 'En lisière de forêt'),
('environment_tag','parc_national', 'Parc national', 'Au sein d''un parc national'),
('environment_tag','parc_marin', 'Parc marin', 'Zone protégée marine'),
('environment_tag','rural', 'Rural', 'Village ou hameau rural'),
('environment_tag','vignoble', 'Vignoble', 'Au cœur d''un vignoble'),
('environment_tag','thermal', 'Station thermale', 'À proximité d''un établissement thermal'),
('environment_tag','port', 'Port', 'Vue ou accès portuaire'),
('environment_tag','ile', 'Île', 'Situé sur une île'),
('environment_tag','patrimoine', 'Site patrimonial', 'Quartier ou site classé UNESCO'),
('environment_tag','quartier_historique', 'Quartier historique', 'Centre ancien préservé'),
('environment_tag','urbain_creatif', 'Quartier créatif', 'Quartier artistique / créatif'),
('environment_tag','desert', 'Désert', 'Paysage désertique'),
('environment_tag','neige', 'Neige', 'Destination enneigée en hiver'),
('environment_tag','littoral_sauvage', 'Littoral sauvage', 'Côte sauvage et préservée')
ON CONFLICT DO NOTHING;

-- Types de tarifs (price_kind)
INSERT INTO ref_code (domain, code, name, description) VALUES
('price_kind','adulte', 'Adulte', 'Tarif adulte plein'),
('price_kind','enfant', 'Enfant', 'Tarif enfant'),
('price_kind','senior', 'Senior', 'Tarif senior'),
('price_kind','etudiant', 'Étudiant', 'Tarif étudiant'),
('price_kind','famille', 'Famille', 'Forfait famille'),
('price_kind','groupe', 'Groupe', 'Tarif groupe'),
('price_kind','couple', 'Couple', 'Tarif duo / couple'),
('price_kind','personne_handicapee', 'Personne en situation de handicap', 'Tarif PMR'),
('price_kind','resident', 'Résident', 'Tarif résident / local'),
('price_kind','gratuit', 'Gratuit', 'Accès gratuit')
ON CONFLICT DO NOTHING;

-- Unités tarifaires (price_unit)
INSERT INTO ref_code (domain, code, name, description) VALUES
('price_unit','par_personne', 'Par personne', 'Tarif exprimé par personne'),
('price_unit','par_nuit', 'Par nuit', 'Tarif par nuitée'),
('price_unit','par_jour', 'Par jour', 'Tarif journalier'),
('price_unit','par_semaine', 'Par semaine', 'Forfait hebdomadaire'),
('price_unit','par_mois', 'Par mois', 'Forfait mensuel'),
('price_unit','par_sejour', 'Par séjour', 'Montant pour l''ensemble du séjour'),
('price_unit','par_groupe', 'Par groupe', 'Tarif pour un groupe défini'),
('price_unit','par_forfait', 'Par forfait', 'Forfait global'),
('price_unit','par_heure', 'Par heure', 'Tarif horaire'),
('price_unit','par_personne_nuit', 'Par personne et par nuit', 'Tarif combiné personne/nuit')
ON CONFLICT DO NOTHING;

-- Équipements de réunion
INSERT INTO ref_code (domain, code, name, description) VALUES
('meeting_equipment','paperboard', 'Paperboard', 'Paperboard et marqueurs'),
('meeting_equipment','ecran', 'Écran', 'Écran de projection'),
('meeting_equipment','videoprojecteur', 'Vidéoprojecteur', 'Projecteur multimédia'),
('meeting_equipment','sonorisation', 'Sonorisation', 'Système de sonorisation'),
('meeting_equipment','micro', 'Micro', 'Micros HF / filaires'),
('meeting_equipment','wifi', 'Wi-Fi', 'Connexion Wi-Fi haut débit'),
('meeting_equipment','visioconference', 'Visioconférence', 'Système de visioconférence'),
('meeting_equipment','scene', 'Scène', 'Estrade / scène'),
('meeting_equipment','lumieres', 'Lumières', 'Éclairage scénique'),
('meeting_equipment','pupitre', 'Pupitre', 'Pupitre pour orateur'),
('meeting_equipment','traduction', 'Cabine de traduction', 'Cabine d''interprétation simultanée')
ON CONFLICT DO NOTHING;

-- Pratiques d'itinéraires touristiques
INSERT INTO ref_code (domain, code, name, description) VALUES
('iti_practice','randonnee_pedestre', 'Randonnée pédestre', 'Itinéraire de randonnée classique'),
('iti_practice','trail', 'Trail', 'Parcours de trail running'),
('iti_practice','velo_route', 'Vélo route', 'Itinéraire cyclable sur route'),
('iti_practice','velo_vtt', 'VTT', 'Itinéraire VTT'),
('iti_practice','cyclotourisme', 'Cyclotourisme', 'Balade à vélo touristique'),
('iti_practice','equestre', 'Équestre', 'Parcours à cheval'),
('iti_practice','kayak', 'Kayak / canoë', 'Parcours nautique'),
('iti_practice','plongee', 'Plongée', 'Site de plongée sous-marine'),
('iti_practice','snorkeling', 'Snorkeling', 'Randonnée palmée'),
('iti_practice','voile', 'Voile', 'Navigation à la voile'),
('iti_practice','raquette', 'Raquettes', 'Itinéraire hivernal en raquettes'),
('iti_practice','ski', 'Ski', 'Domaine skiable'),
('iti_practice','escalade', 'Escalade', 'Site d''escalade'),
('iti_practice','canyoning', 'Canyoning', 'Descente de canyons'),
('iti_practice','parapente', 'Parapente', 'Zone de vol libre'),
('iti_practice','patrimoine', 'Découverte patrimoniale', 'Circuit patrimoine & culture')
ON CONFLICT DO NOTHING;

-- Thématiques de demandes clients
INSERT INTO ref_code (domain, code, name, description) VALUES
('demand_topic','information','Information touristique','Demande d''information générale'),
('demand_topic','reservation','Réservation','Demande de réservation ou disponibilité'),
('demand_topic','groupe','Groupes','Organisation de groupes'),
('demand_topic','evenement','Événementiel','Organisation ou participation à un événement'),
('demand_topic','accessibilite','Accessibilité','Questions d''accessibilité et PMR'),
('demand_topic','reclamation','Réclamation','Réclamation ou insatisfaction'),
('demand_topic','presse','Presse / influence','Demande presse ou influenceurs'),
('demand_topic','partenariat','Partenariat','Proposition de partenariat'),
('demand_topic','marketing','Marketing','Campagnes marketing et promotion'),
('demand_topic','logistique','Logistique','Transport, transferts, bagagerie'),
('demand_topic','urgence','Urgence','Assistance urgente sur place')
ON CONFLICT DO NOTHING;

-- Sous-thématiques détaillées
INSERT INTO ref_code (domain, code, name, description) VALUES
('demand_subtopic','information_hebergement','Hébergement', 'Infos hébergement (topic information)'),
('demand_subtopic','information_restaurants','Restauration', 'Infos restauration (topic information)'),
('demand_subtopic','information_activites','Activités', 'Infos activités & loisirs (topic information)'),
('demand_subtopic','reservation_directe','Réservation directe', 'Demande de réservation directe (topic reservation)'),
('demand_subtopic','reservation_agence','Agence / OTA', 'Réservation via agence (topic reservation)'),
('demand_subtopic','groupe_scolaire','Groupe scolaire', 'Accueil groupes scolaires (topic groupe)'),
('demand_subtopic','groupe_affaires','Séminaire / affaires', 'Groupes affaires (topic groupe)'),
('demand_subtopic','evenement_prive','Événement privé', 'Mariage, baptême... (topic evenement)'),
('demand_subtopic','evenement_corporate','Événement corporate', 'Séminaire, incentive (topic evenement)'),
('demand_subtopic','accessibilite_moteur','Mobilité réduite', 'Accessibilité PMR (topic accessibilite)'),
('demand_subtopic','accessibilite_sensoriel','Handicap sensoriel', 'Accessibilité sensorielle (topic accessibilite)'),
('demand_subtopic','reclamation_service','Service', 'Plainte sur la qualité de service (topic reclamation)'),
('demand_subtopic','reclamation_facturation','Facturation', 'Problème de facturation (topic reclamation)'),
('demand_subtopic','presse_reportage','Reportage', 'Demande de reportage presse (topic presse)'),
('demand_subtopic','presse_influence','Influenceur', 'Collaboration influenceur (topic presse)'),
('demand_subtopic','partenariat_office','Partenariat institutionnel', 'Partenariat office de tourisme (topic partenariat)'),
('demand_subtopic','marketing_package','Package / offre', 'Création d''offre marketing (topic marketing)'),
('demand_subtopic','marketing_contenu','Contenu', 'Demande de visuels, textes (topic marketing)'),
('demand_subtopic','logistique_transport','Transport', 'Navette, transfert (topic logistique)'),
('demand_subtopic','logistique_bagagerie','Bagagerie', 'Gestion des bagages (topic logistique)'),
('demand_subtopic','urgence_perte','Objet perdu', 'Perte de document ou objet (topic urgence)'),
('demand_subtopic','urgence_sante','Urgence santé', 'Assistance médicale (topic urgence)')
ON CONFLICT DO NOTHING;

-- Ambiances recherchées (mood)
INSERT INTO ref_code (domain, code, name, description) VALUES
('mood','detente', 'Détente', 'Ambiance détente & bien-être'),
('mood','aventure', 'Aventure', 'Ambiance aventure & sensations'),
('mood','romantique', 'Romantique', 'Ambiance romantique'),
('mood','famille', 'Famille', 'Ambiance familiale'),
('mood','festif', 'Festif', 'Ambiance festive / nocturne'),
('mood','gourmand', 'Gourmand', 'Ambiance gastronomique'),
('mood','culturel', 'Culturel', 'Ambiance culturelle et patrimoniale'),
('mood','bien_etre', 'Bien-être', 'Ambiance détente & spa'),
('mood','sportif', 'Sportif', 'Ambiance sportive et active'),
('mood','nature', 'Nature', 'Ambiance nature & grand air')
ON CONFLICT DO NOTHING;

-- Types de cuisine
INSERT INTO ref_code (domain, code, name, description) VALUES
('cuisine_type','creole', 'Créole', 'Cuisine créole réunionnaise traditionnelle'),
('cuisine_type','metropolitan', 'Métropolitaine', 'Cuisine française métropolitaine'),
('cuisine_type','traditional', 'Traditionnelle', 'Cuisine terroir et traditionnelle'),
('cuisine_type','gourmet', 'Gastronomique', 'Cuisine gastronomique de qualité'),
('cuisine_type','fusion', 'Fusion', 'Cuisine fusion créole-moderne'),
('cuisine_type','international', 'Internationale', 'Cuisine internationale'),
('cuisine_type','fast_food', 'Fast Food', 'Restauration rapide'),
('cuisine_type','street_food', 'Street Food', 'Cuisine de rue'),
('cuisine_type','brasserie', 'Brasserie', 'Cuisine brasserie et bistronomique'),
('cuisine_type','vegetarienne', 'Végétarienne', 'Cuisine végétarienne'),
('cuisine_type','vegan', 'Végan', 'Cuisine végane'),
('cuisine_type','italienne', 'Italienne', 'Cuisine italienne'),
('cuisine_type','espagnole', 'Espagnole', 'Tapas et cuisine espagnole'),
('cuisine_type','portugaise', 'Portugaise', 'Cuisine portugaise'),
('cuisine_type','mediterraneenne', 'Méditerranéenne', 'Cuisine méditerranéenne'),
('cuisine_type','japonaise', 'Japonaise', 'Cuisine japonaise et sushi'),
('cuisine_type','thai', 'Thaïlandaise', 'Cuisine thaïlandaise'),
('cuisine_type','libanaise', 'Libanaise', 'Cuisine libanaise et moyen-orientale'),
('cuisine_type','marocaine', 'Marocaine', 'Cuisine du Maghreb'),
('cuisine_type','africaine', 'Africaine', 'Cuisine africaine'),
('cuisine_type','antillaise', 'Antillaise', 'Cuisine des Antilles'),
('cuisine_type','amerique_latine', 'Amérique latine', 'Cuisine latino-américaine'),
('cuisine_type','bbq', 'Barbecue', 'Cuisine grillades & barbecue'),
('cuisine_type','burger', 'Burger', 'Spécialités de burgers'),
('cuisine_type','patisserie', 'Pâtisserie', 'Salon de thé et pâtisseries'),
('cuisine_type','glacier', 'Glacier', 'Glaces artisanales'),
('cuisine_type','seafood', 'Fruits de mer', 'Cuisine fruits de mer et poisson'),
('cuisine_type','indian', 'Indienne', 'Cuisine indienne et tamoule'),
('cuisine_type','chinese', 'Chinoise', 'Cuisine chinoise traditionnelle')
ON CONFLICT DO NOTHING;

-- Catégories de menu
INSERT INTO ref_code (domain, code, name, description) VALUES
('menu_category','entree', 'Entrées', 'Entrées et apéritifs'),
('menu_category','main', 'Plats principaux', 'Plats principaux et spécialités'),
('menu_category','dessert', 'Desserts', 'Desserts et douceurs'),
('menu_category','drinks', 'Boissons', 'Boissons et cocktails'),
<<<<<<< HEAD
('menu_category','snacks', 'En-cas', 'En-cas et collations'),
('menu_category','petit_dejeuner','Petit-déjeuner','Formules petit-déjeuner'),
('menu_category','brunch','Brunch','Offres brunch'),
('menu_category','menu_enfant','Menu enfant','Menus dédiés aux enfants'),
('menu_category','menu_groupe','Menu groupe','Menus pour groupes'),
('menu_category','menu_degustation','Menu dégustation','Menus gastronomiques dégustation')
ON CONFLICT DO NOTHING;

-- Tags alimentaires
INSERT INTO ref_code (domain, code, name, description) VALUES
('dietary_tag','vegetarian', 'Végétarien', 'Sans viande ni poisson'),
('dietary_tag','vegan', 'Végan', 'Sans produits d''origine animale'),
('dietary_tag','halal', 'Halal', 'Conforme aux règles alimentaires islamiques'),
('dietary_tag','kosher', 'Casher', 'Conforme aux règles alimentaires juives'),
('dietary_tag','gluten_free', 'Sans gluten', 'Sans gluten'),
('dietary_tag','lactose_free', 'Sans lactose', 'Sans produits laitiers'),
('dietary_tag','sugar_free', 'Sans sucre ajouté', 'Faible en sucres'),
('dietary_tag','low_carb', 'Faible en glucides', 'Réduit en glucides'),
('dietary_tag','pescatarian', 'Pescétarien', 'Avec poisson mais sans viande'),
('dietary_tag','flexitarian', 'Flexitarien', 'Consommation modérée de viande'),
('dietary_tag','organic', 'Bio', 'Produits biologiques'),
('dietary_tag','local', 'Local', 'Produits locaux de La Réunion');

-- Allergènes
INSERT INTO ref_code (domain, code, name, description) VALUES
('allergen','gluten', 'Gluten', 'Contient du gluten'),
('allergen','crustaceans', 'Crustacés', 'Contient des crustacés'),
('allergen','eggs', 'Œufs', 'Contient des œufs'),
('allergen','fish', 'Poisson', 'Contient du poisson'),
('allergen','peanuts', 'Arachides', 'Contient des arachides'),
('allergen','soy', 'Soja', 'Contient du soja'),
('allergen','dairy', 'Lait', 'Contient du lait'),
('allergen','nuts', 'Fruits à coque', 'Contient des fruits à coque'),
('allergen','celery', 'Céleri', 'Contient du céleri'),
('allergen','mustard', 'Moutarde', 'Contient de la moutarde'),
('allergen','sesame', 'Sésame', 'Contient du sésame'),
('allergen','sulphites', 'Sulfites', 'Contient des sulfites'),
('allergen','lupin', 'Lupin', 'Contient du lupin'),
('allergen','molluscs', 'Mollusques', 'Contient des mollusques')
ON CONFLICT DO NOTHING;

-- (Les tags d'environnement ont été complétés ci-dessus)

-- Équipements utilisés par les seeds (via family_id)
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

-- =====================================================
-- SECTION TEST OBJECTS - region_code = 'TEST'
-- =====================================================

-- Organisation de test : Office de Tourisme Intercommunal TEST
INSERT INTO object (
    object_type, name, region_code, status,
    created_at, updated_at
) VALUES (
    'ORG',
    'Office de Tourisme Intercommunal TEST',
    'TST',
    'published',
    NOW(),
    NOW()
);

-- Description de l'organisation
INSERT INTO object_description (
    object_id, org_object_id, description, description_chapo, description_mobile, description_edition, visibility,
    created_at, updated_at
)
SELECT 
    o.id,
    o.id,
    'Office de tourisme de test pour valider les fonctionnalités du système Bertel 3.0. Cette organisation sert de parent pour tous les objets de test et permet de tester l''ensemble des fonctionnalités du système unifié.',
    'Office de tourisme de test',
    'OTI TEST — informations essentielles et contacts. Le Tampon (97430).',
    'Fiche d''édition: organisation de test servant aux scénarios de validation, contenus et workflows.',
    'public',
    NOW(),
    NOW()
FROM object o
WHERE o.name = 'Office de Tourisme Intercommunal TEST' AND o.region_code = 'TST'
  AND NOT EXISTS (
    SELECT 1 FROM object_description d
    WHERE d.object_id = o.id AND d.org_object_id IS NOT DISTINCT FROM o.id
  );

-- Note privée de test associée à l'organisation (org_object_id)
INSERT INTO object_private_description (
    object_id, org_object_id, body, audience, language_id, created_at, updated_at
)
SELECT 
    o.id,
    o.id,
    'Note privée de test associée à l''organisation OTI TEST. Utilisée pour valider la gestion des notes privées multi-organisation.',
    'private',
    (SELECT id FROM ref_language WHERE code = 'fr' LIMIT 1),
    NOW(),
    NOW()
FROM object o
WHERE o.name = 'Office de Tourisme Intercommunal TEST' AND o.region_code = 'TST'
  AND NOT EXISTS (
    SELECT 1 FROM object_private_description opd
    WHERE opd.object_id = o.id AND opd.org_object_id IS NOT DISTINCT FROM o.id AND opd.audience = 'private'
  );


-- Localisation de l'organisation
INSERT INTO object_location (
    object_id, address1, address2, postcode, city, 
    latitude, longitude, is_main_location, position,
    created_at, updated_at
)
SELECT 
    o.id,
    '1 Rue de la Test',
    'Bâtiment Test',
    '97430',
    'Le Tampon',
    -21.2833,
    55.5167,
    TRUE,
    1,
    NOW(),
    NOW()
FROM object o
WHERE o.name = 'Office de Tourisme Intercommunal TEST' AND o.region_code = 'TST';

-- Acteurs associés à l'OTI TEST
-- Directeur de l'OTI
INSERT INTO actor (
    id, display_name, first_name, last_name,
    created_at, updated_at
) VALUES (
    gen_random_uuid(),
    'Jean-Pierre DUPONT',
    'Jean-Pierre',
    'DUPONT',
    NOW(),
    NOW()
);

-- Responsable Communication
INSERT INTO actor (
    id, display_name, first_name, last_name,
    created_at, updated_at
) VALUES (
    gen_random_uuid(),
    'Marie MARTIN',
    'Marie',
    'MARTIN',
    NOW(),
    NOW()
);

-- Chargé de mission Tourisme
INSERT INTO actor (
    id, display_name, first_name, last_name,
    created_at, updated_at
) VALUES (
    gen_random_uuid(),
    'Paul BERNARD',
    'Paul',
    'BERNARD',
    NOW(),
    NOW()
);

-- Ajout des rôles d'acteurs de référence nécessaires
INSERT INTO ref_actor_role (code, name, description, position) VALUES
('director', 'Directeur', 'Directeur de l''organisation', 1),
('communication_manager', 'Responsable Communication', 'Responsable de la communication', 2),
('tourism_officer', 'Chargé de mission Tourisme', 'Chargé de mission tourisme', 3)
ON CONFLICT (code) DO NOTHING;

-- Ajout des rôles d'organisation de référence et flags
INSERT INTO ref_org_role (code, name, description, position) VALUES
('owner', 'Propriétaire', 'Organisation propriétaire principale de l''objet', 1),
('manager', 'Gestionnaire', 'Organisation qui gère l''objet au quotidien', 2),
('publisher', 'Diffuseur', 'Organisation qui diffuse les informations de l''objet', 3)
ON CONFLICT (code) DO NOTHING;

-- Canaux de contact pour les acteurs (simplifiés)
-- Directeur - Email
INSERT INTO actor_channel (
    actor_id, kind_id, value, is_primary, position
)
SELECT 
    a.id,
    k.id,
    'jp.dupont@oti-test.re',
    TRUE,
    1
FROM actor a, ref_code_contact_kind k
WHERE a.display_name = 'Jean-Pierre DUPONT'
  AND k.code = 'email';

-- Responsable Communication - Email
INSERT INTO actor_channel (
    actor_id, kind_id, value, is_primary, position
)
SELECT 
    a.id,
    k.id,
    'm.martin@oti-test.re',
    TRUE,
    1
FROM actor a, ref_code_contact_kind k
WHERE a.display_name = 'Marie MARTIN'
  AND k.code = 'email';

-- Chargé de mission - Email
INSERT INTO actor_channel (
    actor_id, kind_id, value, is_primary, position
)
SELECT 
    a.id,
    k.id,
    'p.bernard@oti-test.re',
    TRUE,
    1
FROM actor a, ref_code_contact_kind k
WHERE a.display_name = 'Paul BERNARD'
  AND k.code = 'email';

-- Rôles des acteurs dans l'organisation
-- Directeur
INSERT INTO actor_object_role (
    actor_id, object_id, role_id, is_primary, visibility
)
SELECT 
    a.id,
    o.id,
    r.id,
    TRUE,
    'public'
FROM actor a, ref_actor_role r, object o
WHERE a.display_name = 'Jean-Pierre DUPONT'
  AND r.code = 'director'
  AND o.name = 'Office de Tourisme Intercommunal TEST'
  AND o.region_code = 'TST';

-- Responsable Communication
INSERT INTO actor_object_role (
    actor_id, object_id, role_id, is_primary, visibility
)
SELECT 
    a.id,
    o.id,
    r.id,
    TRUE,
    'public'
FROM actor a, ref_actor_role r, object o
WHERE a.display_name = 'Marie MARTIN'
  AND r.code = 'communication_manager'
  AND o.name = 'Office de Tourisme Intercommunal TEST'
  AND o.region_code = 'TST';

-- Chargé de mission
INSERT INTO actor_object_role (
    actor_id, object_id, role_id, is_primary, visibility
)
SELECT 
    a.id,
    o.id,
    r.id,
    TRUE,
    'public'
FROM actor a, ref_actor_role r, object o
WHERE a.display_name = 'Paul BERNARD'
  AND r.code = 'tourism_officer'
  AND o.name = 'Office de Tourisme Intercommunal TEST'
  AND o.region_code = 'TST';

-- Affichage des résultats
DO $$
DECLARE
    test_org_count INTEGER;
    test_actors_count INTEGER;
    test_roles_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO test_org_count FROM object WHERE region_code = 'TST' AND object_type = 'ORG';
    SELECT COUNT(*) INTO test_actors_count FROM actor WHERE display_name IN ('Jean-Pierre DUPONT', 'Marie MARTIN', 'Paul BERNARD');
    SELECT COUNT(*) INTO test_roles_count FROM actor_object_role aor
    JOIN object o ON aor.object_id = o.id 
    WHERE o.region_code = 'TST';
    
    RAISE NOTICE '=== OBJETS DE TEST CRÉÉS ===';
    RAISE NOTICE 'Organisations de test: %', test_org_count;
    RAISE NOTICE 'Acteurs de test: %', test_actors_count;
    RAISE NOTICE 'Rôles assignés: %', test_roles_count;
    RAISE NOTICE '✓ OTI TEST créée avec ses acteurs et rôles';
END $$;

-- Section legacy retirée dans ce seed pour rester compatible avec le schéma courant

-- =====================================================
-- SEED COMPLÉMENTAIRES (idempotents)
-- =====================================================

-- Capacités: métriques standard
INSERT INTO ref_capacity_metric (code, name, unit, description, position) VALUES
('beds','Lits','bed','Nombre de lits',1),
('bedrooms','Chambres','room','Nombre de chambres',2),
('max_capacity','Capacité max.','pax','Capacité d\'accueil maximale (personnes)',3),
('seats','Places assises','seat','Nombre de sièges assis',4),
('standing_places','Places debout','place','Nombre de places debout',5),
('pitches','Emplacements','pitch','Emplacements de camping',6),
('campers','Camping‑cars','campervan','Capacité en camping‑cars',7),
('tents','Tentes','tent','Capacité en tentes',8),
('vehicles','Véhicules','vehicle','Capacité véhicules (parking)',9),
('bikes','Vélos','bike','Capacité vélos (parking/locations)',10),
('meeting_rooms','Salles de réunion','room','Nombre de salles de réunion',11),
('floor_area_m2','Surface (m²)','m2','Surface utile en mètres carrés',12)
ON CONFLICT (code) DO NOTHING;

-- Rôles d\'acteur complémentaires
INSERT INTO ref_actor_role (code, name, description, position) VALUES
('guide','Guide','Guide conférencier ou accompagnateur',10),
('sales_manager','Responsable commercial','Responsable des ventes/partenariats',11),
('receptionist','Réceptionniste','Accueil et réception',12),
('content_editor','Éditeur de contenu','Rédaction et mise à jour des contenus',13)
ON CONFLICT (code) DO NOTHING;

-- Réseaux sociaux additionnels (idempotent via LEFT JOIN)
INSERT INTO ref_code (domain, code, name, description, position)
SELECT v.domain, v.code, v.name, v.description, v.position
FROM (
  VALUES
    ('social_network','wechat','WeChat','Messagerie et réseau social',11),
    ('social_network','line','LINE','Messagerie et réseau social Asie',12)
) AS v(domain,code,name,description,position)
LEFT JOIN ref_code rc ON rc.domain = v.domain AND rc.code = v.code
WHERE rc.id IS NULL;

-- Types de relation entre objets
INSERT INTO ref_object_relation_type (code, name, description, position) VALUES
('parent_of','Parent de','Relation hiérarchique: A est parent de B',1),
('part_of','Fait partie de','Relation de composition: A fait partie de B',2),
('nearby','À proximité de','Objets proches géographiquement',3),
('managed_by','Géré par','Objet géré par une organisation',4),
('partner_of','Partenaire de','Relation de partenariat',5),
('sister','Objet associé','Objets de même famille',6),
('recommended_with','Recommandé avec','Suggestion de co‑consommation',7)
ON CONFLICT (code) DO NOTHING;

-- Schémas de classification (étoiles/labels)
INSERT INTO ref_classification_scheme (code, name, description, selection, position) VALUES
('hot_stars','Classement hôtelier','Classement officiel hôtels (étoiles)','single',1),
('camp_stars','Classement camping','Classement officiel campings (étoiles)','single',2),
('meuble_stars','Classement meublés','Classement officiel meublés de tourisme','single',3),
('gites_epics','Gîtes de France (épis)','Niveau Gîtes de France (épis)','single',4),
('clevacances_keys','Clévacances (clés)','Niveau Clévacances (clés)','single',5),
('green_key','La Clef Verte','Label environnemental La Clef Verte','single',6),
('eu_ecolabel','Écolabel Européen','Label environnemental européen','single',7),
('tourisme_handicap','Tourisme & Handicap','Handicaps reconnus (multi‑sélection)','multiple',8)
ON CONFLICT (code) DO NOTHING;

-- Valeurs: étoiles 1→5 (hôtel/camping/meublés)
INSERT INTO ref_classification_value (scheme_id, code, name, ordinal)
SELECT s.id, v.code, v.name, v.ordinal
FROM ref_classification_scheme s
JOIN (
  VALUES
    ('1','1 étoile',1),
    ('2','2 étoiles',2),
    ('3','3 étoiles',3),
    ('4','4 étoiles',4),
    ('5','5 étoiles',5)
) AS v(code,name,ordinal) ON TRUE
WHERE s.code IN ('hot_stars','camp_stars','meuble_stars')
  AND NOT EXISTS (
    SELECT 1 FROM ref_classification_value cv
    WHERE cv.scheme_id = s.id AND cv.code = v.code
  );

-- Valeurs: Gîtes (1–5 épis)
INSERT INTO ref_classification_value (scheme_id, code, name, ordinal)
SELECT s.id, v.code, v.name, v.ordinal
FROM ref_classification_scheme s
JOIN (
  VALUES ('1','1 épi',1),('2','2 épis',2),('3','3 épis',3),('4','4 épis',4),('5','5 épis',5)
) AS v(code,name,ordinal) ON TRUE
WHERE s.code = 'gites_epics'
  AND NOT EXISTS (SELECT 1 FROM ref_classification_value cv WHERE cv.scheme_id = s.id AND cv.code = v.code);

-- Valeurs: Clévacances (1–5 clés)
INSERT INTO ref_classification_value (scheme_id, code, name, ordinal)
SELECT s.id, v.code, v.name, v.ordinal
FROM ref_classification_scheme s
JOIN (
  VALUES ('1','1 clé',1),('2','2 clés',2),('3','3 clés',3),('4','4 clés',4),('5','5 clés',5)
) AS v(code,name,ordinal) ON TRUE
WHERE s.code = 'clevacances_keys'
  AND NOT EXISTS (SELECT 1 FROM ref_classification_value cv WHERE cv.scheme_id = s.id AND cv.code = v.code);

-- Valeurs: Tourisme & Handicap (multi)
INSERT INTO ref_classification_value (scheme_id, code, name, ordinal)
SELECT s.id, v.code, v.name, v.ordinal
FROM ref_classification_scheme s
JOIN (
  VALUES ('auditive','Handicap auditif',1),('mental','Handicap mental',2),('motor','Handicap moteur',3),('visual','Handicap visuel',4)
) AS v(code,name,ordinal) ON TRUE
WHERE s.code = 'tourisme_handicap'
  AND NOT EXISTS (SELECT 1 FROM ref_classification_value cv WHERE cv.scheme_id = s.id AND cv.code = v.code);

-- Développement durable: catégories
INSERT INTO ref_sustainability_action_category (code, name, description, position) VALUES
('energy','Énergie','Réduction et maîtrise des consommations énergétiques',1),
('water','Eau','Gestion responsable de l\'eau',2),
('waste','Déchets','Réduction, tri et valorisation des déchets',3),
('mobility','Mobilité douce','Transports doux et écomobilité',4),
('biodiversity','Biodiversité','Préservation de la biodiversité',5)
ON CONFLICT (code) DO NOTHING;

-- Développement durable: actions (idempotent)
INSERT INTO ref_sustainability_action (category_id, code, label, position)
SELECT c.id, v.code, v.label, v.position
FROM ref_sustainability_action_category c
JOIN (
  VALUES
    -- Énergie
    ('energy','led_lighting','Éclairage LED',1),
    ('energy','smart_thermostats','Thermostats intelligents',2),
    ('energy','solar_water_heating','Chauffe‑eau solaire',3),
    ('energy','renewable_electricity','Électricité verte souscrite',4),
    -- Eau
    ('water','low_flow_devices','Mousseurs/robinets à faible débit',1),
    ('water','rainwater_harvesting','Récupération des eaux de pluie',2),
    ('water','greywater_reuse','Réutilisation des eaux grises',3),
    -- Déchets
    ('waste','sorting_points','Points de tri à disposition',1),
    ('waste','composting','Compostage des biodéchets',2),
    ('waste','bulk_amenities','Produits d\'accueil en vrac',3),
    -- Mobilité
    ('mobility','bike_parking','Parking vélos sécurisé',1),
    ('mobility','ev_charging','Bornes de recharge électrique',2),
    ('mobility','public_transport_info','Infos transports en commun',3),
    -- Biodiversité
    ('biodiversity','native_plants','Plantes locales et adaptées',1),
    ('biodiversity','no_pesticides','Zéro pesticide',2),
    ('biodiversity','wildlife_corridors','Aménagements favorables à la faune',3)
) AS v(cat_code,code,label,position) ON TRUE
WHERE c.code = v.cat_code
  AND NOT EXISTS (
    SELECT 1 FROM ref_sustainability_action a
    WHERE a.category_id = c.id AND a.code = v.code
  );

