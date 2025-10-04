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

-- Type média vectoriel (pour logos SVG/PDF)
INSERT INTO ref_code (domain, code, name, description)
VALUES ('media_type','vector','Vectoriel','Fichiers vectoriels (SVG, PDF)')
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

-- Types de documents: retiré au profit de ref_legal_type et de documents associés via object_legal

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

-- Organisation de test : Comité Régional de Tourisme TEST (CRT)
INSERT INTO object (
    object_type, name, region_code, status,
    created_at, updated_at
)
SELECT
    'ORG',
    'Comité Régional de Tourisme TEST',
    'TST',
    'published',
    NOW(),
    NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM object o
    WHERE o.object_type = 'ORG' AND o.region_code = 'TST' AND o.name = 'Comité Régional de Tourisme TEST'
);

-- Périodes d'ouverture régulières 9h-17h du lundi au vendredi pour OTI et CRT (idempotent)
-- 1) Créer la période annuelle "Horaires réguliers"
INSERT INTO opening_period (object_id, name, all_years, created_at, updated_at)
SELECT o.id, 'Horaires réguliers', TRUE, NOW(), NOW()
FROM object o
WHERE o.region_code = 'TST' AND o.object_type = 'ORG'
  AND o.name IN ('Office de Tourisme Intercommunal TEST','Comité Régional de Tourisme TEST')
  AND NOT EXISTS (
    SELECT 1 FROM opening_period op
    WHERE op.object_id = o.id AND op.all_years IS TRUE AND COALESCE(op.name,'') = 'Horaires réguliers'
  );

-- 2) Ajouter le schedule de type "regular"
INSERT INTO opening_schedule (period_id, schedule_type_id, name, created_at, updated_at)
SELECT op.id, rst.id, 'Semaine ouvrée 9h-17h', NOW(), NOW()
FROM opening_period op
JOIN object o ON o.id = op.object_id
JOIN ref_code_opening_schedule_type rst ON rst.code = 'regular'
WHERE o.region_code = 'TST' AND o.object_type = 'ORG'
  AND o.name IN ('Office de Tourisme Intercommunal TEST','Comité Régional de Tourisme TEST')
  AND NOT EXISTS (
    SELECT 1 FROM opening_schedule os
    WHERE os.period_id = op.id AND os.schedule_type_id = rst.id
  );

-- 3) Créer un time_period (ouvert) pour le schedule
INSERT INTO opening_time_period (schedule_id, closed, created_at, updated_at)
SELECT os.id, FALSE, NOW(), NOW()
FROM opening_schedule os
JOIN opening_period op ON op.id = os.period_id
JOIN object o ON o.id = op.object_id
JOIN ref_code_opening_schedule_type rst ON rst.id = os.schedule_type_id AND rst.code = 'regular'
WHERE o.region_code = 'TST' AND o.object_type = 'ORG'
  AND o.name IN ('Office de Tourisme Intercommunal TEST','Comité Régional de Tourisme TEST')
  AND NOT EXISTS (
    SELECT 1 FROM opening_time_period tp WHERE tp.schedule_id = os.id AND tp.closed = FALSE
  );

-- 4) Associer les weekdays (lundi → vendredi) au time_period
INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
SELECT tp.id, w.id
FROM opening_time_period tp
JOIN opening_schedule os ON os.id = tp.schedule_id
JOIN opening_period op ON op.id = os.period_id
JOIN object o ON o.id = op.object_id
JOIN ref_code_weekday w ON w.code IN ('monday','tuesday','wednesday','thursday','friday')
WHERE o.region_code = 'TST' AND o.object_type = 'ORG'
  AND o.name IN ('Office de Tourisme Intercommunal TEST','Comité Régional de Tourisme TEST')
  AND NOT EXISTS (
    SELECT 1 FROM opening_time_period_weekday tw
    WHERE tw.time_period_id = tp.id AND tw.weekday_id = w.id
  );

-- 5) Ajouter la plage horaire 09:00 → 17:00
INSERT INTO opening_time_frame (time_period_id, start_time, end_time, created_at, updated_at)
SELECT tp.id, TIME '09:00', TIME '17:00', NOW(), NOW()
FROM opening_time_period tp
JOIN opening_schedule os ON os.id = tp.schedule_id
JOIN opening_period op ON op.id = os.period_id
JOIN object o ON o.id = op.object_id
JOIN ref_code_opening_schedule_type rst ON rst.id = os.schedule_type_id AND rst.code = 'regular'
WHERE o.region_code = 'TST' AND o.object_type = 'ORG'
  AND o.name IN ('Office de Tourisme Intercommunal TEST','Comité Régional de Tourisme TEST')
  AND NOT EXISTS (
    SELECT 1 FROM opening_time_frame tf
    WHERE tf.time_period_id = tp.id AND tf.start_time = TIME '09:00' AND tf.end_time = TIME '17:00'
  );

-- =====================================================
-- HÔTEL COMPLET DE TEST (parents: OTI [primary], CRT)
-- =====================================================

-- Créer l'hôtel
INSERT INTO object (object_type, name, region_code, status, created_at, updated_at)
SELECT 'HOT','Hôtel Test Océan','TST','published',NOW(),NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM object o WHERE o.object_type='HOT' AND o.region_code='TST' AND o.name='Hôtel Test Océan'
);

-- Localisation principale
INSERT INTO object_location (object_id, address1, postcode, city, latitude, longitude, is_main_location, position, created_at, updated_at)
SELECT o.id, '10 Rue des Plages', '97430', 'Le Tampon', -21.2800, 55.5200, TRUE, 1, NOW(), NOW()
FROM object o
WHERE o.object_type='HOT' AND o.region_code='TST' AND o.name='Hôtel Test Océan'
  AND NOT EXISTS (
    SELECT 1 FROM object_location ol WHERE ol.object_id=o.id AND ol.is_main_location IS TRUE
  );

-- Lien organisations (OTI primary, CRT secondary)
-- OTI primary manager
INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary, note, created_at)
SELECT h.id, oti.id, r.id, TRUE, 'Gestion principale', NOW()
FROM object h
JOIN object oti ON oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
JOIN ref_org_role r ON r.code='manager'
WHERE h.object_type='HOT' AND h.region_code='TST' AND h.name='Hôtel Test Océan'
  AND NOT EXISTS (
    SELECT 1 FROM object_org_link x WHERE x.object_id=h.id AND x.org_object_id=oti.id
  );

-- CRT publisher
INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary, note, created_at)
SELECT h.id, crt.id, r.id, FALSE, 'Partenaire régional', NOW()
FROM object h
JOIN object crt ON crt.object_type='ORG' AND crt.region_code='TST' AND crt.name='Comité Régional de Tourisme TEST'
JOIN ref_org_role r ON r.code='publisher'
WHERE h.object_type='HOT' AND h.region_code='TST' AND h.name='Hôtel Test Océan'
  AND NOT EXISTS (
    SELECT 1 FROM object_org_link x WHERE x.object_id=h.id AND x.org_object_id=crt.id
  );

-- Descriptions spécifiques par organisation
INSERT INTO object_description (object_id, org_object_id, description, description_chapo, visibility, created_at, updated_at)
SELECT h.id, oti.id,
  'Hôtel 4* avec piscine et spa, proche du littoral. Chambres modernes, salles de réunion, restaurant intégré.',
  'Hôtel 4* – piscine, spa, restaurant',
  'public', NOW(), NOW()
FROM object h
JOIN object oti ON oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
WHERE h.object_type='HOT' AND h.region_code='TST' AND h.name='Hôtel Test Océan'
  AND NOT EXISTS (
    SELECT 1 FROM object_description d WHERE d.object_id=h.id AND d.org_object_id=oti.id
  );

INSERT INTO object_description (object_id, org_object_id, description, description_chapo, visibility, created_at, updated_at)
SELECT h.id, crt.id,
  'Établissement recommandé par le CRT : accueil multilingue, accès facile, services affaires.',
  'Recommandé par le CRT – services affaires',
  'public', NOW(), NOW()
FROM object h
JOIN object crt ON crt.object_type='ORG' AND crt.region_code='TST' AND crt.name='Comité Régional de Tourisme TEST'
WHERE h.object_type='HOT' AND h.region_code='TST' AND h.name='Hôtel Test Océan'
  AND NOT EXISTS (
    SELECT 1 FROM object_description d WHERE d.object_id=h.id AND d.org_object_id=crt.id
  );

-- Médias (logo vectoriel + photo principale)
INSERT INTO media (object_id, media_type_id, title, url, kind, is_main, is_published, created_at, updated_at)
SELECT h.id, mt.id, 'Logo Hôtel Test Océan', 'https://static.example.com/logos/hotel-test-ocean.svg', 'logo', TRUE, TRUE, NOW(), NOW()
FROM object h JOIN ref_code_media_type mt ON mt.code='vector'
WHERE h.object_type='HOT' AND h.region_code='TST' AND h.name='Hôtel Test Océan'
  AND NOT EXISTS (SELECT 1 FROM media m WHERE m.object_id=h.id AND m.kind='logo');

INSERT INTO media (object_id, media_type_id, title, url, kind, is_main, is_published, created_at, updated_at)
SELECT h.id, mt.id, 'Façade & piscine', 'https://images.example.com/hotels/test-ocean/piscine.jpg', 'illustration', TRUE, TRUE, NOW(), NOW()
FROM object h JOIN ref_code_media_type mt ON mt.code='photo'
WHERE h.object_type='HOT' AND h.region_code='TST' AND h.name='Hôtel Test Océan'
  AND NOT EXISTS (SELECT 1 FROM media m WHERE m.object_id=h.id AND m.media_type_id=mt.id AND m.is_main IS TRUE);

-- Langues (FR/EN/DE)
INSERT INTO object_language (object_id, language_id, created_at)
SELECT h.id, l.id, NOW()
FROM object h JOIN ref_language l ON l.code IN ('fr','en','de')
WHERE h.object_type='HOT' AND h.region_code='TST' AND h.name='Hôtel Test Océan'
  AND NOT EXISTS (SELECT 1 FROM object_language ol WHERE ol.object_id=h.id AND ol.language_id=l.id);
    
    -- Moyens de paiement
INSERT INTO object_payment_method (object_id, payment_method_id, created_at)
SELECT h.id, pm.id, NOW()
FROM object h JOIN ref_code_payment_method pm ON pm.code IN ('visa','mastercard','american_express','paypal','virement')
WHERE h.object_type='HOT' AND h.region_code='TST' AND h.name='Hôtel Test Océan'
  AND NOT EXISTS (SELECT 1 FROM object_payment_method x WHERE x.object_id=h.id AND x.payment_method_id=pm.id);

-- Environnement & tags
INSERT INTO object_environment_tag (object_id, environment_tag_id, created_at)
SELECT h.id, et.id, NOW()
FROM object h JOIN ref_code_environment_tag et ON et.code IN ('plage','vue_panoramique','jardin')
WHERE h.object_type='HOT' AND h.region_code='TST' AND h.name='Hôtel Test Océan'
  AND NOT EXISTS (SELECT 1 FROM object_environment_tag x WHERE x.object_id=h.id AND x.environment_tag_id=et.id);

-- Tags libres
INSERT INTO ref_tag (slug, name, description, position)
VALUES ('eco_friendly','Éco‑responsable','Politique environnementale active',1)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO ref_tag (slug, name, description, position)
VALUES ('business_ready','Business ready','Services entreprises & séminaires',2)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO tag_link (tag_id, target_table, target_pk, created_at)
SELECT t.id, 'object', h.id, NOW()
FROM ref_tag t, object h
WHERE t.slug IN ('eco_friendly','business_ready')
  AND h.object_type='HOT' AND h.region_code='TST' AND h.name='Hôtel Test Océan'
  AND NOT EXISTS (
    SELECT 1 FROM tag_link tl WHERE tl.tag_id=t.id AND tl.target_table='object' AND tl.target_pk=h.id
  );
    
    -- Équipements
INSERT INTO object_amenity (object_id, amenity_id, created_at)
SELECT h.id, a.id, NOW()
FROM object h JOIN ref_amenity a ON a.code IN (
  'wifi','air_conditioning','heating','safe','elevator',
  'swimming_pool','spa','parking','restaurant','breakfast'
)
WHERE h.object_type='HOT' AND h.region_code='TST' AND h.name='Hôtel Test Océan'
  AND NOT EXISTS (SELECT 1 FROM object_amenity oa WHERE oa.object_id=h.id AND oa.amenity_id=a.id);

-- Capacités
INSERT INTO object_capacity (object_id, metric_id, value_integer)
SELECT h.id, m.id, v.val
FROM object h
JOIN (
  SELECT 'bedrooms'::text code, 80 val UNION ALL
  SELECT 'max_capacity', 200 UNION ALL
  SELECT 'meeting_rooms', 3 UNION ALL
  SELECT 'floor_area_m2', 4500
) v(code,val) ON TRUE
JOIN ref_capacity_metric m ON m.code = v.code
WHERE h.object_type='HOT' AND h.region_code='TST' AND h.name='Hôtel Test Océan'
  AND NOT EXISTS (SELECT 1 FROM object_capacity oc WHERE oc.object_id=h.id AND oc.metric_id=m.id);

-- Salles de réunion + équipements
INSERT INTO object_meeting_room (object_id, name, area_m2, cap_theatre, cap_u, cap_classroom, created_at, updated_at)
SELECT h.id, 'Salle Conférence Océan', 120, 120, 45, 60, NOW(), NOW()
FROM object h
WHERE h.object_type='HOT' AND h.region_code='TST' AND h.name='Hôtel Test Océan'
  AND NOT EXISTS (SELECT 1 FROM object_meeting_room r WHERE r.object_id=h.id AND r.name='Salle Conférence Océan');

INSERT INTO meeting_room_equipment (room_id, equipment_id, position, created_at)
SELECT r.id, e.id, ROW_NUMBER() OVER (), NOW()
FROM object_meeting_room r
JOIN object h ON h.id=r.object_id AND h.object_type='HOT' AND h.region_code='TST' AND h.name='Hôtel Test Océan'
JOIN ref_code_meeting_equipment e ON e.code IN ('wifi','videoprojecteur','ecran','paperboard','sonorisation','micro')
WHERE NOT EXISTS (
  SELECT 1 FROM meeting_room_equipment me WHERE me.room_id=r.id AND me.equipment_id=e.id
);

-- Ouvertures: Haute saison (tous les jours 08:00–20:00) / Basse saison (lun–ven 09:00–17:00)
-- Haute saison
INSERT INTO opening_period (object_id, name, date_start, date_end, created_at, updated_at)
SELECT h.id, 'Haute saison', DATE '2025-07-01', DATE '2025-08-31', NOW(), NOW()
FROM object h
WHERE h.object_type='HOT' AND h.region_code='TST' AND h.name='Hôtel Test Océan'
  AND NOT EXISTS (SELECT 1 FROM opening_period op WHERE op.object_id=h.id AND op.name='Haute saison');

INSERT INTO opening_schedule (period_id, schedule_type_id, name, created_at, updated_at)
SELECT op.id, rst.id, 'Ouvert tous les jours 8h-20h', NOW(), NOW()
FROM opening_period op
JOIN object h ON h.id=op.object_id AND h.object_type='HOT' AND h.region_code='TST' AND h.name='Hôtel Test Océan'
JOIN ref_code_opening_schedule_type rst ON rst.code='regular'
WHERE op.name='Haute saison'
  AND NOT EXISTS (SELECT 1 FROM opening_schedule os WHERE os.period_id=op.id);

INSERT INTO opening_time_period (schedule_id, closed, created_at, updated_at)
SELECT os.id, FALSE, NOW(), NOW()
FROM opening_schedule os
JOIN opening_period op ON op.id=os.period_id AND op.name='Haute saison'
WHERE NOT EXISTS (SELECT 1 FROM opening_time_period tp WHERE tp.schedule_id=os.id AND tp.closed=FALSE);

    INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
SELECT tp.id, w.id
FROM opening_time_period tp
JOIN opening_schedule os ON os.id=tp.schedule_id
JOIN opening_period op ON op.id=os.period_id AND op.name='Haute saison'
JOIN ref_code_weekday w ON w.code IN ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')
WHERE NOT EXISTS (SELECT 1 FROM opening_time_period_weekday tw WHERE tw.time_period_id=tp.id AND tw.weekday_id=w.id);

INSERT INTO opening_time_frame (time_period_id, start_time, end_time, created_at, updated_at)
SELECT tp.id, TIME '08:00', TIME '20:00', NOW(), NOW()
FROM opening_time_period tp
JOIN opening_schedule os ON os.id=tp.schedule_id
JOIN opening_period op ON op.id=os.period_id AND op.name='Haute saison'
WHERE NOT EXISTS (
  SELECT 1 FROM opening_time_frame tf WHERE tf.time_period_id=tp.id AND tf.start_time=TIME '08:00' AND tf.end_time=TIME '20:00'
);

-- Basse saison
INSERT INTO opening_period (object_id, name, date_start, date_end, created_at, updated_at)
SELECT h.id, 'Basse saison', DATE '2025-09-01', DATE '2026-06-30', NOW(), NOW()
FROM object h
WHERE h.object_type='HOT' AND h.region_code='TST' AND h.name='Hôtel Test Océan'
  AND NOT EXISTS (SELECT 1 FROM opening_period op WHERE op.object_id=h.id AND op.name='Basse saison');

INSERT INTO opening_schedule (period_id, schedule_type_id, name, created_at, updated_at)
SELECT op.id, rst.id, 'Semaine ouvrée 9h-17h', NOW(), NOW()
FROM opening_period op
JOIN object h ON h.id=op.object_id AND h.object_type='HOT' AND h.region_code='TST' AND h.name='Hôtel Test Océan'
JOIN ref_code_opening_schedule_type rst ON rst.code='regular'
WHERE op.name='Basse saison'
  AND NOT EXISTS (SELECT 1 FROM opening_schedule os WHERE os.period_id=op.id);

INSERT INTO opening_time_period (schedule_id, closed, created_at, updated_at)
SELECT os.id, FALSE, NOW(), NOW()
FROM opening_schedule os
JOIN opening_period op ON op.id=os.period_id AND op.name='Basse saison'
WHERE NOT EXISTS (SELECT 1 FROM opening_time_period tp WHERE tp.schedule_id=os.id AND tp.closed=FALSE);

INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
SELECT tp.id, w.id
FROM opening_time_period tp
JOIN opening_schedule os ON os.id=tp.schedule_id
JOIN opening_period op ON op.id=os.period_id AND op.name='Basse saison'
JOIN ref_code_weekday w ON w.code IN ('monday','tuesday','wednesday','thursday','friday')
WHERE NOT EXISTS (SELECT 1 FROM opening_time_period_weekday tw WHERE tw.time_period_id=tp.id AND tw.weekday_id=w.id);

INSERT INTO opening_time_frame (time_period_id, start_time, end_time, created_at, updated_at)
SELECT tp.id, TIME '09:00', TIME '17:00', NOW(), NOW()
FROM opening_time_period tp
JOIN opening_schedule os ON os.id=tp.schedule_id
JOIN opening_period op ON op.id=os.period_id AND op.name='Basse saison'
WHERE NOT EXISTS (
  SELECT 1 FROM opening_time_frame tf WHERE tf.time_period_id=tp.id AND tf.start_time=TIME '09:00' AND tf.end_time=TIME '17:00'
);

-- Acteurs de l'hôtel (Directeur + Réception)
INSERT INTO actor (id, display_name, first_name, last_name, created_at, updated_at)
VALUES (gen_random_uuid(),'Alice MARTIN','Alice','MARTIN',NOW(),NOW())
ON CONFLICT DO NOTHING;
INSERT INTO actor (id, display_name, first_name, last_name, created_at, updated_at)
VALUES (gen_random_uuid(),'Marc PETIT','Marc','PETIT',NOW(),NOW())
ON CONFLICT DO NOTHING;

INSERT INTO actor_object_role (actor_id, object_id, role_id, is_primary, visibility)
SELECT a.id, h.id, r.id, TRUE, 'public'
FROM actor a, object h, ref_actor_role r
WHERE a.display_name='Alice MARTIN' AND r.code='director'
  AND h.object_type='HOT' AND h.region_code='TST' AND h.name='Hôtel Test Océan'
  AND NOT EXISTS (SELECT 1 FROM actor_object_role x WHERE x.actor_id=a.id AND x.object_id=h.id AND x.role_id=r.id);

INSERT INTO actor_object_role (actor_id, object_id, role_id, is_primary, visibility)
SELECT a.id, h.id, r.id, TRUE, 'public'
FROM actor a, object h, ref_actor_role r
WHERE a.display_name='Marc PETIT' AND r.code='receptionist'
  AND h.object_type='HOT' AND h.region_code='TST' AND h.name='Hôtel Test Océan'
  AND NOT EXISTS (SELECT 1 FROM actor_object_role x WHERE x.actor_id=a.id AND x.object_id=h.id AND x.role_id=r.id);

-- Tarifs (basse & haute saison)
INSERT INTO object_price (object_id, kind_id, unit_id, amount, currency, valid_from, valid_to, conditions, created_at, updated_at)
SELECT h.id, pk.id, pu.id, 120.00, 'EUR', DATE '2025-09-01', DATE '2026-06-30', 'Tarif basse saison – chambre double', NOW(), NOW()
FROM object h, ref_code_price_kind pk, ref_code_price_unit pu
WHERE h.object_type='HOT' AND h.region_code='TST' AND h.name='Hôtel Test Océan'
  AND pk.code='adulte' AND pu.code='par_nuit'
      AND NOT EXISTS (
    SELECT 1 FROM object_price p WHERE p.object_id=h.id AND p.kind_id=pk.id AND p.unit_id=pu.id AND p.valid_from=DATE '2025-09-01'
  );

INSERT INTO object_price (object_id, kind_id, unit_id, amount, currency, valid_from, valid_to, conditions, created_at, updated_at)
SELECT h.id, pk.id, pu.id, 180.00, 'EUR', DATE '2025-07-01', DATE '2025-08-31', 'Tarif haute saison – chambre double', NOW(), NOW()
FROM object h, ref_code_price_kind pk, ref_code_price_unit pu
WHERE h.object_type='HOT' AND h.region_code='TST' AND h.name='Hôtel Test Océan'
  AND pk.code='adulte' AND pu.code='par_nuit'
  AND NOT EXISTS (
    SELECT 1 FROM object_price p WHERE p.object_id=h.id AND p.kind_id=pk.id AND p.unit_id=pu.id AND p.valid_from=DATE '2025-07-01'
  );

-- Restaurant associé (objet RES) + relation
INSERT INTO object (object_type, name, region_code, status, created_at, updated_at)
SELECT 'RES','Restaurant Test Océan','TST','published',NOW(),NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM object o WHERE o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Test Océan'
);

INSERT INTO object_relation (source_object_id, target_object_id, relation_type_id, created_at)
SELECT res.id, hot.id, rt.id, NOW()
FROM object res, object hot, ref_object_relation_type rt
WHERE res.object_type='RES' AND res.name='Restaurant Test Océan' AND res.region_code='TST'
  AND hot.object_type='HOT' AND hot.name='Hôtel Test Océan' AND hot.region_code='TST'
  AND rt.code='part_of'
      AND NOT EXISTS (
    SELECT 1 FROM object_relation r WHERE r.source_object_id=res.id AND r.target_object_id=hot.id AND r.relation_type_id=rt.id
  );

-- Menus du restaurant
INSERT INTO object_menu (object_id, name, created_at, updated_at)
SELECT res.id, 'Menu Déjeuner', NOW(), NOW()
FROM object res WHERE res.object_type='RES' AND res.name='Restaurant Test Océan' AND res.region_code='TST'
  AND NOT EXISTS (SELECT 1 FROM object_menu m WHERE m.object_id=res.id AND m.name='Menu Déjeuner');

INSERT INTO object_menu_item (menu_id, name, price, currency, position, created_at, updated_at)
SELECT m.id, 'Curry de poisson', 22.00, 'EUR', 1, NOW(), NOW()
FROM object_menu m
JOIN object res ON res.id=m.object_id AND res.object_type='RES' AND res.name='Restaurant Test Océan' AND res.region_code='TST'
WHERE NOT EXISTS (SELECT 1 FROM object_menu_item mi WHERE mi.menu_id=m.id AND mi.name='Curry de poisson');

INSERT INTO object_menu_item (menu_id, name, price, currency, position, created_at, updated_at)
SELECT m.id, 'Salade créole', 12.00, 'EUR', 2, NOW(), NOW()
FROM object_menu m
JOIN object res ON res.id=m.object_id AND res.object_type='RES' AND res.name='Restaurant Test Océan' AND res.region_code='TST'
WHERE NOT EXISTS (SELECT 1 FROM object_menu_item mi WHERE mi.menu_id=m.id AND mi.name='Salade créole');

-- =====================================================
-- RESTAURANT AVEC FERMETURES SAISONNIÈRES & EXCEPTIONNELLES
-- =====================================================

-- Création du restaurant
INSERT INTO object (object_type, name, region_code, status, created_at, updated_at)
SELECT 'RES','Restaurant Fermeture Saisonnière','TST','published',NOW(),NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM object o WHERE o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Fermeture Saisonnière'
);

-- Localisation
INSERT INTO object_location (object_id, address1, postcode, city, is_main_location, position, created_at, updated_at)
SELECT o.id, '25 Rue des Palmiers', '97410', 'Saint-Pierre', TRUE, 1, NOW(), NOW()
FROM object o
WHERE o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Fermeture Saisonnière'
  AND NOT EXISTS (
    SELECT 1 FROM object_location ol WHERE ol.object_id=o.id AND ol.is_main_location IS TRUE
  );

-- Fermeture récurrente: juin-juillet (période 2025 comme exemple) – aucune plage horaire -> fermé
INSERT INTO opening_period (object_id, name, date_start, date_end, all_years, created_at, updated_at)
SELECT o.id, 'Fermeture juin-juillet', DATE '2025-06-01', DATE '2025-07-31', TRUE, NOW(), NOW()
FROM object o
WHERE o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Fermeture Saisonnière'
  AND NOT EXISTS (
    SELECT 1 FROM opening_period op WHERE op.object_id=o.id AND op.name='Fermeture juin-juillet'
  );

INSERT INTO opening_schedule (period_id, schedule_type_id, name, created_at, updated_at)
SELECT op.id, rst.id, 'Fermeture saisonnière', NOW(), NOW()
FROM opening_period op
JOIN object o ON o.id=op.object_id AND o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Fermeture Saisonnière'
JOIN ref_code_opening_schedule_type rst ON rst.code='seasonal'
WHERE op.name='Fermeture juin-juillet'
  AND NOT EXISTS (SELECT 1 FROM opening_schedule os WHERE os.period_id=op.id);

INSERT INTO opening_time_period (schedule_id, closed, created_at, updated_at)
SELECT os.id, TRUE, NOW(), NOW()
FROM opening_schedule os
JOIN opening_period op ON op.id=os.period_id AND op.name='Fermeture juin-juillet'
WHERE NOT EXISTS (SELECT 1 FROM opening_time_period tp WHERE tp.schedule_id=os.id AND tp.closed=TRUE);

    INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
SELECT tp.id, w.id
FROM opening_time_period tp
JOIN opening_schedule os ON os.id=tp.schedule_id
JOIN opening_period op ON op.id=os.period_id AND op.name='Fermeture juin-juillet'
JOIN ref_code_weekday w ON w.code IN ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')
WHERE NOT EXISTS (SELECT 1 FROM opening_time_period_weekday tw WHERE tw.time_period_id=tp.id AND tw.weekday_id=w.id);

-- Fermeture exceptionnelle: 10→21 octobre 2025
INSERT INTO opening_period (object_id, name, date_start, date_end, all_years, created_at, updated_at)
SELECT o.id, 'Fermeture exceptionnelle octobre', DATE '2025-10-10', DATE '2025-10-21', FALSE, NOW(), NOW()
FROM object o
WHERE o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Fermeture Saisonnière'
  AND NOT EXISTS (
    SELECT 1 FROM opening_period op WHERE op.object_id=o.id AND op.name='Fermeture exceptionnelle octobre'
  );

INSERT INTO opening_schedule (period_id, schedule_type_id, name, created_at, updated_at)
SELECT op.id, rst.id, 'Fermeture exceptionnelle', NOW(), NOW()
FROM opening_period op
JOIN object o ON o.id=op.object_id AND o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Fermeture Saisonnière'
JOIN ref_code_opening_schedule_type rst ON rst.code='exceptional'
WHERE op.name='Fermeture exceptionnelle octobre'
  AND NOT EXISTS (SELECT 1 FROM opening_schedule os WHERE os.period_id=op.id);

INSERT INTO opening_time_period (schedule_id, closed, created_at, updated_at)
SELECT os.id, TRUE, NOW(), NOW()
FROM opening_schedule os
JOIN opening_period op ON op.id=os.period_id AND op.name='Fermeture exceptionnelle octobre'
WHERE NOT EXISTS (SELECT 1 FROM opening_time_period tp WHERE tp.schedule_id=os.id AND tp.closed=TRUE);

INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
SELECT tp.id, w.id
FROM opening_time_period tp
JOIN opening_schedule os ON os.id=tp.schedule_id
JOIN opening_period op ON op.id=os.period_id AND op.name='Fermeture exceptionnelle octobre'
JOIN ref_code_weekday w ON w.code IN ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')
WHERE NOT EXISTS (SELECT 1 FROM opening_time_period_weekday tw WHERE tw.time_period_id=tp.id AND tw.weekday_id=w.id);

-- Description du restaurant
INSERT INTO object_description (object_id, org_object_id, description, description_mobile, description_edition, created_at, updated_at)
SELECT o.id, oti.id, 'Restaurant spécialisé dans la cuisine créole traditionnelle avec fermetures saisonnières.', 'Restaurant créole avec fermetures saisonnières.', 'Restaurant créole traditionnel fermé en juin-juillet et exceptionnellement en octobre.', NOW(), NOW()
FROM object o
JOIN object oti ON oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
WHERE o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Fermeture Saisonnière'
  AND NOT EXISTS (SELECT 1 FROM object_description od WHERE od.object_id=o.id AND od.org_object_id=oti.id);

-- Lien avec l'OTI (parent)
INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary, created_at, updated_at)
SELECT o.id, oti.id, ror.id, TRUE, NOW(), NOW()
FROM object o
JOIN object oti ON oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
JOIN ref_org_role ror ON ror.code='manager'
WHERE o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Fermeture Saisonnière'
  AND NOT EXISTS (SELECT 1 FROM object_org_link ool WHERE ool.object_id=o.id AND ool.org_object_id=oti.id);

-- Médias
INSERT INTO media (object_id, media_type_id, title, url, is_main, position, created_at, updated_at)
SELECT o.id, mt.id, 'Logo Restaurant Fermeture', 'https://example.com/logo-restaurant-fermeture.svg', TRUE, 1, NOW(), NOW()
FROM object o, ref_code_media_type mt
WHERE o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Fermeture Saisonnière'
  AND mt.code='vector'
  AND NOT EXISTS (SELECT 1 FROM media m WHERE m.object_id=o.id AND m.title='Logo Restaurant Fermeture');

INSERT INTO media (object_id, media_type_id, title, url, is_main, position, created_at, updated_at)
SELECT o.id, mt.id, 'Photo Restaurant Fermeture', 'https://example.com/photo-restaurant-fermeture.jpg', FALSE, 2, NOW(), NOW()
FROM object o, ref_code_media_type mt
WHERE o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Fermeture Saisonnière'
  AND mt.code='photo'
  AND NOT EXISTS (SELECT 1 FROM media m WHERE m.object_id=o.id AND m.title='Photo Restaurant Fermeture');
    
    -- Langues
INSERT INTO object_language (object_id, language_id, created_at)
SELECT o.id, l.id, NOW()
FROM object o, ref_language l
WHERE o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Fermeture Saisonnière'
  AND l.code IN ('fr', 'en', 'de')
  AND NOT EXISTS (SELECT 1 FROM object_language ol WHERE ol.object_id=o.id AND ol.language_id=l.id);

-- Méthodes de paiement
INSERT INTO object_payment_method (object_id, payment_method_id, created_at)
SELECT o.id, pm.id, NOW()
FROM object o, ref_code_payment_method pm
WHERE o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Fermeture Saisonnière'
  AND pm.code IN ('card', 'cash', 'paypal')
  AND NOT EXISTS (SELECT 1 FROM object_payment_method opm WHERE opm.object_id=o.id AND opm.payment_method_id=pm.id);

-- Tags environnementaux
INSERT INTO object_environment_tag (object_id, environment_tag_id, created_at)
SELECT o.id, et.id, NOW()
FROM object o, ref_code_environment_tag et
WHERE o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Fermeture Saisonnière'
  AND et.code IN ('mer', 'tropical', 'urbain')
  AND NOT EXISTS (SELECT 1 FROM object_environment_tag oet WHERE oet.object_id=o.id AND oet.environment_tag_id=et.id);
    
    -- Équipements
INSERT INTO object_amenity (object_id, amenity_id, created_at)
SELECT o.id, a.id, NOW()
FROM object o, ref_amenity a
WHERE o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Fermeture Saisonnière'
  AND a.code IN ('wifi', 'air_conditioning', 'parking', 'terrace', 'accessibility')
  AND NOT EXISTS (SELECT 1 FROM object_amenity oa WHERE oa.object_id=o.id AND oa.amenity_id=a.id);

-- Capacité
INSERT INTO object_capacity (object_id, metric_id, value_integer, created_at, updated_at)
SELECT o.id, cm.id, 50, NOW(), NOW()
FROM object o, ref_capacity_metric cm
WHERE o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Fermeture Saisonnière'
  AND cm.code='seats'
  AND NOT EXISTS (SELECT 1 FROM object_capacity oc WHERE oc.object_id=o.id AND oc.metric_id=cm.id);

-- Acteurs
INSERT INTO actor (id, display_name, first_name, last_name, created_at, updated_at)
VALUES (gen_random_uuid(), 'Sophie LEROUX', 'Sophie', 'LEROUX', NOW(), NOW())
ON CONFLICT DO NOTHING;

INSERT INTO actor (id, display_name, first_name, last_name, created_at, updated_at)
VALUES (gen_random_uuid(), 'Marc DUBOIS', 'Marc', 'DUBOIS', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Contacts des acteurs
INSERT INTO actor_channel (actor_id, kind_id, value, is_primary, created_at, updated_at)
SELECT a.id, ck.id, 'sophie.leroux@restaurant-fermeture.re', TRUE, NOW(), NOW()
FROM actor a, ref_code_contact_kind ck
WHERE a.display_name='Sophie LEROUX' AND ck.code='email'
  AND NOT EXISTS (SELECT 1 FROM actor_channel ac WHERE ac.actor_id=a.id AND ac.kind_id=ck.id);

INSERT INTO actor_channel (actor_id, kind_id, value, is_primary, created_at, updated_at)
SELECT a.id, ck.id, 'marc.dubois@restaurant-fermeture.re', TRUE, NOW(), NOW()
FROM actor a, ref_code_contact_kind ck
WHERE a.display_name='Marc DUBOIS' AND ck.code='email'
  AND NOT EXISTS (SELECT 1 FROM actor_channel ac WHERE ac.actor_id=a.id AND ac.kind_id=ck.id);

-- Rôles des acteurs
INSERT INTO actor_object_role (actor_id, object_id, role_id, is_primary, visibility, created_at, updated_at)
SELECT a.id, o.id, r.id, TRUE, 'public', NOW(), NOW()
FROM actor a, object o, ref_actor_role r
WHERE a.display_name='Sophie LEROUX' AND o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Fermeture Saisonnière' AND r.code='manager'
  AND NOT EXISTS (SELECT 1 FROM actor_object_role aor WHERE aor.actor_id=a.id AND aor.object_id=o.id AND aor.role_id=r.id);

INSERT INTO actor_object_role (actor_id, object_id, role_id, is_primary, visibility, created_at, updated_at)
SELECT a.id, o.id, r.id, FALSE, 'public', NOW(), NOW()
FROM actor a, object o, ref_actor_role r
WHERE a.display_name='Marc DUBOIS' AND o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Fermeture Saisonnière' AND r.code='chef'
  AND NOT EXISTS (SELECT 1 FROM actor_object_role aor WHERE aor.actor_id=a.id AND aor.object_id=o.id AND aor.role_id=r.id);

-- Prix
INSERT INTO object_price (object_id, kind_id, amount, currency, unit_id, created_at, updated_at)
SELECT o.id, pk.id, 25.00, 'EUR', pu.id, NOW(), NOW()
FROM object o, ref_code_price_kind pk, ref_code_price_unit pu
WHERE o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Fermeture Saisonnière'
  AND pk.code='unique'
  AND pu.code='per_person'
  AND NOT EXISTS (SELECT 1 FROM object_price op WHERE op.object_id=o.id AND op.kind_id=pk.id AND op.unit_id=pu.id);

-- Menus du restaurant
INSERT INTO object_menu (object_id, name, created_at, updated_at)
SELECT o.id, 'Menu Créole Traditionnel', NOW(), NOW()
FROM object o
WHERE o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Fermeture Saisonnière'
  AND NOT EXISTS (SELECT 1 FROM object_menu m WHERE m.object_id=o.id AND m.name='Menu Créole Traditionnel');

INSERT INTO object_menu_item (menu_id, name, price, currency, position, created_at, updated_at)
SELECT m.id, 'Rougail saucisse', 18.00, 'EUR', 1, NOW(), NOW()
FROM object_menu m
JOIN object o ON o.id=m.object_id AND o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Fermeture Saisonnière'
WHERE NOT EXISTS (SELECT 1 FROM object_menu_item mi WHERE mi.menu_id=m.id AND mi.name='Rougail saucisse');

INSERT INTO object_menu_item (menu_id, name, price, currency, position, created_at, updated_at)
SELECT m.id, 'Cari poulet', 20.00, 'EUR', 2, NOW(), NOW()
FROM object_menu m
JOIN object o ON o.id=m.object_id AND o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Fermeture Saisonnière'
WHERE NOT EXISTS (SELECT 1 FROM object_menu_item mi WHERE mi.menu_id=m.id AND mi.name='Cari poulet');

INSERT INTO object_menu_item (menu_id, name, price, currency, position, created_at, updated_at)
SELECT m.id, 'Ti punch', 8.00, 'EUR', 3, NOW(), NOW()
FROM object_menu m
JOIN object o ON o.id=m.object_id AND o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Fermeture Saisonnière'
WHERE NOT EXISTS (SELECT 1 FROM object_menu_item mi WHERE mi.menu_id=m.id AND mi.name='Ti punch');

-- =====================================================
-- ENHANCEMENTS: COMPREHENSIVE DATA FOR ALL OBJECTS
-- =====================================================

-- =====================================================
-- OTI TEST - MISSING LOCATION DATA
-- =====================================================
INSERT INTO object_location (object_id, address1, postcode, city, latitude, longitude, is_main_location, position, created_at, updated_at)
SELECT o.id, '15 Avenue du Général de Gaulle', '97430', 'Le Tampon', -21.2800, 55.5200, TRUE, 1, NOW(), NOW()
FROM object o
WHERE o.object_type='ORG' AND o.region_code='TST' AND o.name='Office de Tourisme Intercommunal TEST'
  AND NOT EXISTS (SELECT 1 FROM object_location ol WHERE ol.object_id=o.id AND ol.is_main_location IS TRUE);

-- =====================================================
-- CRT TEST - MISSING LOCATION DATA
-- =====================================================
INSERT INTO object_location (object_id, address1, postcode, city, latitude, longitude, is_main_location, position, created_at, updated_at)
SELECT o.id, '8 Rue Pasteur', '97400', 'Saint-Denis', -20.8789, 55.4481, TRUE, 1, NOW(), NOW()
FROM object o
WHERE o.object_type='ORG' AND o.region_code='TST' AND o.name='Comité Régional de Tourisme TEST'
  AND NOT EXISTS (SELECT 1 FROM object_location ol WHERE ol.object_id=o.id AND ol.is_main_location IS TRUE);

-- =====================================================
-- ORGANIZATIONS - CONTACTS & SOCIAL MEDIA
-- =====================================================

-- OTI TEST - Website contact
INSERT INTO contact_channel (object_id, kind_id, value, is_primary, position, created_at, updated_at)
SELECT o.id, ck.id, 'https://www.oti-test.re', TRUE, 1, NOW(), NOW()
FROM object o, ref_code_contact_kind ck
WHERE o.object_type='ORG' AND o.region_code='TST' AND o.name='Office de Tourisme Intercommunal TEST'
  AND ck.code='website'
  AND NOT EXISTS (SELECT 1 FROM contact_channel cc WHERE cc.object_id=o.id AND cc.kind_id=ck.id);

-- OTI TEST - Facebook
INSERT INTO contact_channel (object_id, kind_id, value, is_primary, position, created_at, updated_at)
SELECT o.id, ck.id, 'https://www.facebook.com/oti.test', FALSE, 2, NOW(), NOW()
FROM object o, ref_code_contact_kind ck
WHERE o.object_type='ORG' AND o.region_code='TST' AND o.name='Office de Tourisme Intercommunal TEST'
  AND ck.code='facebook'
  AND NOT EXISTS (SELECT 1 FROM contact_channel cc WHERE cc.object_id=o.id AND cc.kind_id=ck.id);

-- CRT TEST - Website contact
INSERT INTO contact_channel (object_id, kind_id, value, is_primary, position, created_at, updated_at)
SELECT o.id, ck.id, 'https://www.crt-test.re', TRUE, 1, NOW(), NOW()
FROM object o, ref_code_contact_kind ck
WHERE o.object_type='ORG' AND o.region_code='TST' AND o.name='Comité Régional de Tourisme TEST'
  AND ck.code='website'
  AND NOT EXISTS (SELECT 1 FROM contact_channel cc WHERE cc.object_id=o.id AND cc.kind_id=ck.id);

-- CRT TEST - Instagram
INSERT INTO contact_channel (object_id, kind_id, value, is_primary, position, created_at, updated_at)
SELECT o.id, ck.id, 'https://www.instagram.com/crt.test', FALSE, 2, NOW(), NOW()
FROM object o, ref_code_contact_kind ck
WHERE o.object_type='ORG' AND o.region_code='TST' AND o.name='Comité Régional de Tourisme TEST'
  AND ck.code='instagram'
  AND NOT EXISTS (SELECT 1 FROM contact_channel cc WHERE cc.object_id=o.id AND cc.kind_id=ck.id);

-- =====================================================
-- ORGANIZATIONS - CLASSIFICATIONS & SUSTAINABILITY
-- =====================================================

-- OTI TEST - Classification (Tourisme & Handicap)
INSERT INTO object_classification (object_id, scheme_id, value_id, created_at, updated_at)
SELECT o.id, cs.id, cv.id, NOW(), NOW()
FROM object o, ref_classification_scheme cs, ref_classification_value cv
WHERE o.object_type='ORG' AND o.region_code='TST' AND o.name='Office de Tourisme Intercommunal TEST'
  AND cs.code='tourisme_handicap'
  AND cv.code='auditif'
  AND NOT EXISTS (SELECT 1 FROM object_classification oc WHERE oc.object_id=o.id AND oc.scheme_id=cs.id AND oc.value_id=cv.id);

-- CRT TEST - Sustainability action (energy)
INSERT INTO object_sustainability_action (object_id, action_id, created_at, updated_at)
SELECT o.id, sa.id, NOW(), NOW()
FROM object o, ref_sustainability_action sa
JOIN ref_sustainability_action_category sac ON sac.id=sa.category_id
WHERE o.object_type='ORG' AND o.region_code='TST' AND o.name='Comité Régional de Tourisme TEST'
  AND sac.code='energy'
  AND sa.code='solar_panels'
  AND NOT EXISTS (SELECT 1 FROM object_sustainability_action osa WHERE osa.object_id=o.id AND osa.action_id=sa.id);

-- =====================================================
-- HOTEL TEST OCÉAN - COMPREHENSIVE ENHANCEMENTS
-- =====================================================

-- Hotel - Contacts & Social Media
INSERT INTO contact_channel (object_id, kind_id, value, is_primary, position, created_at, updated_at)
SELECT o.id, ck.id, 'https://www.hotel-test-ocean.re', TRUE, 1, NOW(), NOW()
FROM object o, ref_code_contact_kind ck
WHERE o.object_type='HOT' AND o.region_code='TST' AND o.name='Hôtel Test Océan'
  AND ck.code='website'
  AND NOT EXISTS (SELECT 1 FROM contact_channel cc WHERE cc.object_id=o.id AND cc.kind_id=ck.id);

INSERT INTO contact_channel (object_id, kind_id, value, is_primary, position, created_at, updated_at)
SELECT o.id, ck.id, 'https://www.facebook.com/hotel.test.ocean', FALSE, 2, NOW(), NOW()
FROM object o, ref_code_contact_kind ck
WHERE o.object_type='HOT' AND o.region_code='TST' AND o.name='Hôtel Test Océan'
  AND ck.code='facebook'
  AND NOT EXISTS (SELECT 1 FROM contact_channel cc WHERE cc.object_id=o.id AND cc.kind_id=ck.id);

INSERT INTO contact_channel (object_id, kind_id, value, is_primary, position, created_at, updated_at)
SELECT o.id, ck.id, 'https://www.instagram.com/hotel.test.ocean', FALSE, 3, NOW(), NOW()
FROM object o, ref_code_contact_kind ck
WHERE o.object_type='HOT' AND o.region_code='TST' AND o.name='Hôtel Test Océan'
  AND ck.code='instagram'
  AND NOT EXISTS (SELECT 1 FROM contact_channel cc WHERE cc.object_id=o.id AND cc.kind_id=ck.id);

-- Hotel - Labels (ref_tag)
INSERT INTO ref_tag (slug, name, description, color, created_at, updated_at)
VALUES ('luxury', 'Luxury', 'Établissement de luxe', '#FFD700', NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;

INSERT INTO ref_tag (slug, name, description, color, created_at, updated_at)
VALUES ('family_friendly', 'Family Friendly', 'Établissement adapté aux familles', '#4CAF50', NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;

INSERT INTO tag_link (tag_id, target_table, target_pk, created_at)
SELECT t.id, 'object', o.id, NOW()
FROM object o, ref_tag t
WHERE o.object_type='HOT' AND o.region_code='TST' AND o.name='Hôtel Test Océan'
  AND t.slug IN ('luxury', 'family_friendly', 'eco_friendly', 'business_ready')
  AND NOT EXISTS (SELECT 1 FROM tag_link tl WHERE tl.tag_id=t.id AND tl.target_table='object' AND tl.target_pk=o.id);

-- Hotel - Group Policies
INSERT INTO object_group_policy (object_id, min_size, max_size, group_only, notes, created_at, updated_at)
SELECT o.id, 10, 50, TRUE, 'Politique pour groupes d''entreprise: 15% de réduction', NOW(), NOW()
FROM object o
WHERE o.object_type='HOT' AND o.region_code='TST' AND o.name='Hôtel Test Océan'
  AND NOT EXISTS (SELECT 1 FROM object_group_policy ogp WHERE ogp.object_id=o.id);

-- Hotel - Discounts
INSERT INTO object_discount (object_id, conditions, discount_percent, min_group_size, valid_from, valid_to, source, created_at, updated_at)
SELECT o.id, 'Réduction longue durée - séjour de 7 nuits minimum', 10.00, 1, CURRENT_DATE, CURRENT_DATE + INTERVAL '6 months', 'promotion', NOW(), NOW()
FROM object o
WHERE o.object_type='HOT' AND o.region_code='TST' AND o.name='Hôtel Test Océan'
  AND NOT EXISTS (SELECT 1 FROM object_discount od WHERE od.object_id=o.id AND od.conditions='Réduction longue durée - séjour de 7 nuits minimum');

-- Hotel - Classifications (Green Key, Tourisme & Handicap)
INSERT INTO object_classification (object_id, scheme_id, value_id, created_at, updated_at)
SELECT o.id, cs.id, cv.id, NOW(), NOW()
FROM object o, ref_classification_scheme cs, ref_classification_value cv
WHERE o.object_type='HOT' AND o.region_code='TST' AND o.name='Hôtel Test Océan'
  AND cs.code='green_key'
  AND cv.code='green_key'
  AND NOT EXISTS (SELECT 1 FROM object_classification oc WHERE oc.object_id=o.id AND oc.scheme_id=cs.id AND oc.value_id=cv.id);

INSERT INTO object_classification (object_id, scheme_id, value_id, created_at, updated_at)
SELECT o.id, cs.id, cv.id, NOW(), NOW()
FROM object o, ref_classification_scheme cs, ref_classification_value cv
WHERE o.object_type='HOT' AND o.region_code='TST' AND o.name='Hôtel Test Océan'
  AND cs.code='tourisme_handicap'
  AND cv.code='moteur'
  AND NOT EXISTS (SELECT 1 FROM object_classification oc WHERE oc.object_id=o.id AND oc.scheme_id=cs.id AND oc.value_id=cv.id);

-- Hotel - Sustainability Actions
INSERT INTO object_sustainability_action (object_id, action_id, created_at, updated_at)
SELECT o.id, sa.id, NOW(), NOW()
FROM object o, ref_sustainability_action sa
JOIN ref_sustainability_action_category sac ON sac.id=sa.category_id
WHERE o.object_type='HOT' AND o.region_code='TST' AND o.name='Hôtel Test Océan'
  AND sac.code='energy'
  AND sa.code='led_lighting'
  AND NOT EXISTS (SELECT 1 FROM object_sustainability_action osa WHERE osa.object_id=o.id AND osa.action_id=sa.id);

INSERT INTO object_sustainability_action (object_id, action_id, created_at, updated_at)
SELECT o.id, sa.id, NOW(), NOW()
FROM object o, ref_sustainability_action sa
JOIN ref_sustainability_action_category sac ON sac.id=sa.category_id
WHERE o.object_type='HOT' AND o.region_code='TST' AND o.name='Hôtel Test Océan'
  AND sac.code='waste'
  AND sa.code='recycling_program'
  AND NOT EXISTS (SELECT 1 FROM object_sustainability_action osa WHERE osa.object_id=o.id AND osa.action_id=sa.id);

-- =====================================================
-- RESTAURANT TEST OCÉAN - COMPREHENSIVE ENHANCEMENTS
-- =====================================================

-- Restaurant Test Océan - Contacts & Social Media
INSERT INTO contact_channel (object_id, kind_id, value, is_primary, position, created_at, updated_at)
SELECT o.id, ck.id, 'https://www.restaurant-test-ocean.re', TRUE, 1, NOW(), NOW()
FROM object o, ref_code_contact_kind ck
WHERE o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Test Océan'
  AND ck.code='website'
  AND NOT EXISTS (SELECT 1 FROM contact_channel cc WHERE cc.object_id=o.id AND cc.kind_id=ck.id);

INSERT INTO contact_channel (object_id, kind_id, value, is_primary, position, created_at, updated_at)
SELECT o.id, ck.id, 'https://www.facebook.com/restaurant.test.ocean', FALSE, 2, NOW(), NOW()
FROM object o, ref_code_contact_kind ck
WHERE o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Test Océan'
  AND ck.code='facebook'
  AND NOT EXISTS (SELECT 1 FROM contact_channel cc WHERE cc.object_id=o.id AND cc.kind_id=ck.id);

-- Restaurant Test Océan - Labels
INSERT INTO tag_link (tag_id, target_table, target_pk, created_at)
SELECT t.id, 'object', o.id, NOW()
FROM object o, ref_tag t
WHERE o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Test Océan'
  AND t.slug IN ('eco_friendly', 'business_ready')
  AND NOT EXISTS (SELECT 1 FROM tag_link tl WHERE tl.tag_id=t.id AND tl.target_table='object' AND tl.target_pk=o.id);

-- Restaurant Test Océan - Group Policies
INSERT INTO object_group_policy (object_id, min_size, max_size, group_only, notes, created_at, updated_at)
SELECT o.id, 8, 30, TRUE, 'Politique pour groupes d''entreprise: 12% de réduction', NOW(), NOW()
FROM object o
WHERE o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Test Océan'
  AND NOT EXISTS (SELECT 1 FROM object_group_policy ogp WHERE ogp.object_id=o.id);

-- Restaurant Test Océan - Discounts
INSERT INTO object_discount (object_id, conditions, discount_percent, min_group_size, valid_from, valid_to, source, created_at, updated_at)
SELECT o.id, 'Menu déjeuner groupe - minimum 8 personnes', 15.00, 8, CURRENT_DATE, CURRENT_DATE + INTERVAL '3 months', 'promotion', NOW(), NOW()
FROM object o
WHERE o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Test Océan'
  AND NOT EXISTS (SELECT 1 FROM object_discount od WHERE od.object_id=o.id AND od.conditions='Menu déjeuner groupe - minimum 8 personnes');

-- Restaurant Test Océan - Classifications
INSERT INTO object_classification (object_id, scheme_id, value_id, created_at, updated_at)
SELECT o.id, cs.id, cv.id, NOW(), NOW()
FROM object o, ref_classification_scheme cs, ref_classification_value cv
WHERE o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Test Océan'
  AND cs.code='green_key'
  AND cv.code='green_key'
  AND NOT EXISTS (SELECT 1 FROM object_classification oc WHERE oc.object_id=o.id AND oc.scheme_id=cs.id AND oc.value_id=cv.id);

-- Restaurant Test Océan - Sustainability Actions
INSERT INTO object_sustainability_action (object_id, action_id, created_at, updated_at)
SELECT o.id, sa.id, NOW(), NOW()
FROM object o, ref_sustainability_action sa
JOIN ref_sustainability_action_category sac ON sac.id=sa.category_id
WHERE o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Test Océan'
  AND sac.code='waste'
  AND sa.code='food_waste_reduction'
  AND NOT EXISTS (SELECT 1 FROM object_sustainability_action osa WHERE osa.object_id=o.id AND osa.action_id=sa.id);

-- =====================================================
-- RESTAURANT FERMETURE SAISONNIÈRE - COMPREHENSIVE ENHANCEMENTS
-- =====================================================

-- Restaurant Fermeture Saisonnière - Contacts & Social Media
INSERT INTO contact_channel (object_id, kind_id, value, is_primary, position, created_at, updated_at)
SELECT o.id, ck.id, 'https://www.restaurant-fermeture.re', TRUE, 1, NOW(), NOW()
FROM object o, ref_code_contact_kind ck
WHERE o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Fermeture Saisonnière'
  AND ck.code='website'
  AND NOT EXISTS (SELECT 1 FROM contact_channel cc WHERE cc.object_id=o.id AND cc.kind_id=ck.id);

INSERT INTO contact_channel (object_id, kind_id, value, is_primary, position, created_at, updated_at)
SELECT o.id, ck.id, 'https://www.instagram.com/restaurant.fermeture', FALSE, 2, NOW(), NOW()
FROM object o, ref_code_contact_kind ck
WHERE o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Fermeture Saisonnière'
  AND ck.code='instagram'
  AND NOT EXISTS (SELECT 1 FROM contact_channel cc WHERE cc.object_id=o.id AND cc.kind_id=ck.id);

-- Restaurant Fermeture Saisonnière - Labels
INSERT INTO ref_tag (slug, name, description, color, created_at, updated_at)
VALUES ('traditional', 'Traditional', 'Cuisine traditionnelle', '#8B4513', NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;

INSERT INTO tag_link (tag_id, target_table, target_pk, created_at)
SELECT t.id, 'object', o.id, NOW()
FROM object o, ref_tag t
WHERE o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Fermeture Saisonnière'
  AND t.slug IN ('traditional', 'eco_friendly')
  AND NOT EXISTS (SELECT 1 FROM tag_link tl WHERE tl.tag_id=t.id AND tl.target_table='object' AND tl.target_pk=o.id);

-- Restaurant Fermeture Saisonnière - Group Policies
INSERT INTO object_group_policy (object_id, min_size, max_size, group_only, notes, created_at, updated_at)
SELECT o.id, 6, 20, TRUE, 'Politique pour groupes familiaux: 10% de réduction', NOW(), NOW()
FROM object o
WHERE o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Fermeture Saisonnière'
  AND NOT EXISTS (SELECT 1 FROM object_group_policy ogp WHERE ogp.object_id=o.id);

-- Restaurant Fermeture Saisonnière - Discounts
INSERT INTO object_discount (object_id, conditions, discount_percent, min_group_size, valid_from, valid_to, source, created_at, updated_at)
SELECT o.id, 'Réduction fidélité - clients réguliers', 5.00, 1, CURRENT_DATE, CURRENT_DATE + INTERVAL '1 year', 'loyalty', NOW(), NOW()
FROM object o
WHERE o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Fermeture Saisonnière'
  AND NOT EXISTS (SELECT 1 FROM object_discount od WHERE od.object_id=o.id AND od.conditions='Réduction fidélité - clients réguliers');

-- Restaurant Fermeture Saisonnière - Classifications
INSERT INTO object_classification (object_id, scheme_id, value_id, created_at, updated_at)
SELECT o.id, cs.id, cv.id, NOW(), NOW()
FROM object o, ref_classification_scheme cs, ref_classification_value cv
WHERE o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Fermeture Saisonnière'
  AND cs.code='tourisme_handicap'
  AND cv.code='moteur'
  AND NOT EXISTS (SELECT 1 FROM object_classification oc WHERE oc.object_id=o.id AND oc.scheme_id=cs.id AND oc.value_id=cv.id);

-- Restaurant Fermeture Saisonnière - Sustainability Actions
INSERT INTO object_sustainability_action (object_id, action_id, created_at, updated_at)
SELECT o.id, sa.id, NOW(), NOW()
FROM object o, ref_sustainability_action sa
JOIN ref_sustainability_action_category sac ON sac.id=sa.category_id
WHERE o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Fermeture Saisonnière'
  AND sac.code='water'
  AND sa.code='water_saving_devices'
  AND NOT EXISTS (SELECT 1 FROM object_sustainability_action osa WHERE osa.object_id=o.id AND osa.action_id=sa.id);

-- Add sample media for menu items demonstration
INSERT INTO media (object_id, media_type_id, title, url, description, is_main, is_published, position, created_at, updated_at)
SELECT 
  res.id,
  mt.id,
  'Curry de poisson - Photo du plat',
  'https://images.example.com/restaurants/curry-poisson.jpg',
  'Photo du curry de poisson servi dans notre restaurant',
  FALSE,
  TRUE,
  1,
  NOW(),
  NOW()
FROM object res
JOIN ref_code_media_type mt ON mt.code = 'photo'
WHERE res.object_type = 'RES' AND res.region_code = 'TST' AND res.name = 'Restaurant Test Océan'
  AND NOT EXISTS (SELECT 1 FROM media m WHERE m.object_id = res.id AND m.title = 'Curry de poisson - Photo du plat');

INSERT INTO media (object_id, media_type_id, title, url, description, is_main, is_published, position, created_at, updated_at)
SELECT 
  res.id,
  mt.id,
  'Salade créole - Photo du plat',
  'https://images.example.com/restaurants/salade-creole.jpg',
  'Photo de la salade créole fraîche et colorée',
  FALSE,
  TRUE,
  2,
  NOW(),
  NOW()
FROM object res
JOIN ref_code_media_type mt ON mt.code = 'photo'
WHERE res.object_type = 'RES' AND res.region_code = 'TST' AND res.name = 'Restaurant Test Océan'
  AND NOT EXISTS (SELECT 1 FROM media m WHERE m.object_id = res.id AND m.title = 'Salade créole - Photo du plat');

-- Link media to menu items
INSERT INTO object_menu_item_media (menu_item_id, media_id, position, created_at, updated_at)
SELECT 
  mi.id,
  m.id,
  1,
  NOW(),
  NOW()
FROM object_menu_item mi
JOIN object_menu om ON om.id = mi.menu_id
JOIN object res ON res.id = om.object_id
JOIN media m ON m.object_id = res.id
WHERE res.object_type = 'RES' AND res.region_code = 'TST' AND res.name = 'Restaurant Test Océan'
  AND mi.name = 'Curry de poisson'
  AND m.title = 'Curry de poisson - Photo du plat'
  AND NOT EXISTS (SELECT 1 FROM object_menu_item_media mim WHERE mim.menu_item_id = mi.id AND mim.media_id = m.id);

INSERT INTO object_menu_item_media (menu_item_id, media_id, position, created_at, updated_at)
SELECT 
  mi.id,
  m.id,
  1,
  NOW(),
  NOW()
FROM object_menu_item mi
JOIN object_menu om ON om.id = mi.menu_id
JOIN object res ON res.id = om.object_id
JOIN media m ON m.object_id = res.id
WHERE res.object_type = 'RES' AND res.region_code = 'TST' AND res.name = 'Restaurant Test Océan'
  AND mi.name = 'Salade créole'
  AND m.title = 'Salade créole - Photo du plat'
  AND NOT EXISTS (SELECT 1 FROM object_menu_item_media mim WHERE mim.menu_item_id = mi.id AND mim.media_id = m.id);

-- ============================
-- ACTEURS CRT + CONTACTS
-- ============================
-- Directeur CRT
INSERT INTO actor (
    id, display_name, first_name, last_name,
    created_at, updated_at
) VALUES (
    gen_random_uuid(),
    'Camille DURAND',
    'Camille',
    'DURAND',
    NOW(),
    NOW()
) ON CONFLICT DO NOTHING;

INSERT INTO actor_object_role (actor_id, object_id, role_id, is_primary, visibility)
SELECT a.id, o.id, r.id, TRUE, 'public'
FROM actor a, object o, ref_actor_role r
WHERE a.display_name = 'Camille DURAND'
  AND o.name = 'Comité Régional de Tourisme TEST' AND o.region_code = 'TST'
  AND r.code = 'director'
  AND NOT EXISTS (
    SELECT 1 FROM actor_object_role x WHERE x.actor_id = a.id AND x.object_id = o.id AND x.role_id = r.id
  );

INSERT INTO actor_channel (actor_id, kind_id, value, is_primary, position)
SELECT a.id, k.id, 'camille.durand@crt-test.re', TRUE, 1
FROM actor a, ref_code_contact_kind k
WHERE a.display_name = 'Camille DURAND' AND k.code = 'email'
  AND NOT EXISTS (
    SELECT 1 FROM actor_channel ac WHERE ac.actor_id = a.id AND ac.kind_id = k.id AND ac.value = 'camille.durand@crt-test.re'
  );

-- Resp. Communication CRT
INSERT INTO actor (
    id, display_name, first_name, last_name,
    created_at, updated_at
) VALUES (
    gen_random_uuid(),
    'Sophie LEROY',
    'Sophie',
    'LEROY',
    NOW(),
    NOW()
) ON CONFLICT DO NOTHING;

INSERT INTO actor_object_role (actor_id, object_id, role_id, is_primary, visibility)
SELECT a.id, o.id, r.id, TRUE, 'public'
FROM actor a, object o, ref_actor_role r
WHERE a.display_name = 'Sophie LEROY'
  AND o.name = 'Comité Régional de Tourisme TEST' AND o.region_code = 'TST'
  AND r.code = 'communication_manager'
  AND NOT EXISTS (
    SELECT 1 FROM actor_object_role x WHERE x.actor_id = a.id AND x.object_id = o.id AND x.role_id = r.id
  );

INSERT INTO actor_channel (actor_id, kind_id, value, is_primary, position)
SELECT a.id, k.id, 'sophie.leroy@crt-test.re', TRUE, 1
FROM actor a, ref_code_contact_kind k
WHERE a.display_name = 'Sophie LEROY' AND k.code = 'email'
  AND NOT EXISTS (
    SELECT 1 FROM actor_channel ac WHERE ac.actor_id = a.id AND ac.kind_id = k.id AND ac.value = 'sophie.leroy@crt-test.re'
  );

-- ============================
-- LÉGAL (SIRET/SIREN/TVA) OTI + CRT
-- ============================
-- OTI
INSERT INTO object_legal (object_id, type_id, value, validity_mode, status, created_at, updated_at)
SELECT o.id, t.id, jsonb_build_object('number','13002526500017'), 'forever', 'active', NOW(), NOW()
FROM object o JOIN ref_legal_type t ON t.code = 'siret'
WHERE o.name = 'Office de Tourisme Intercommunal TEST' AND o.region_code = 'TST'
  AND NOT EXISTS (
    SELECT 1 FROM object_legal ol WHERE ol.object_id = o.id AND ol.type_id = t.id
  );
INSERT INTO object_legal (object_id, type_id, value, validity_mode, status, created_at, updated_at)
SELECT o.id, t.id, jsonb_build_object('number','512345678'), 'forever', 'active', NOW(), NOW()
FROM object o JOIN ref_legal_type t ON t.code = 'siren'
WHERE o.name = 'Office de Tourisme Intercommunal TEST' AND o.region_code = 'TST'
  AND NOT EXISTS (
    SELECT 1 FROM object_legal ol WHERE ol.object_id = o.id AND ol.type_id = t.id
  );
INSERT INTO object_legal (object_id, type_id, value, validity_mode, status, created_at, updated_at)
SELECT o.id, t.id, jsonb_build_object('number','FR76 1234 5678 90'), 'tacit_renewal', 'active', NOW(), NOW()
FROM object o JOIN ref_legal_type t ON t.code = 'vat_number'
WHERE o.name = 'Office de Tourisme Intercommunal TEST' AND o.region_code = 'TST'
  AND NOT EXISTS (
    SELECT 1 FROM object_legal ol WHERE ol.object_id = o.id AND ol.type_id = t.id
  );

-- CRT
INSERT INTO object_legal (object_id, type_id, value, validity_mode, status, created_at, updated_at)
SELECT o.id, t.id, jsonb_build_object('number','13009999900021'), 'forever', 'active', NOW(), NOW()
FROM object o JOIN ref_legal_type t ON t.code = 'siret'
WHERE o.name = 'Comité Régional de Tourisme TEST' AND o.region_code = 'TST'
  AND NOT EXISTS (
    SELECT 1 FROM object_legal ol WHERE ol.object_id = o.id AND ol.type_id = t.id
  );
INSERT INTO object_legal (object_id, type_id, value, validity_mode, status, created_at, updated_at)
SELECT o.id, t.id, jsonb_build_object('number','598765432'), 'forever', 'active', NOW(), NOW()
FROM object o JOIN ref_legal_type t ON t.code = 'siren'
WHERE o.name = 'Comité Régional de Tourisme TEST' AND o.region_code = 'TST'
  AND NOT EXISTS (
    SELECT 1 FROM object_legal ol WHERE ol.object_id = o.id AND ol.type_id = t.id
  );
INSERT INTO object_legal (object_id, type_id, value, validity_mode, status, created_at, updated_at)
SELECT o.id, t.id, jsonb_build_object('number','FR76 0000 1111 22'), 'tacit_renewal', 'active', NOW(), NOW()
FROM object o JOIN ref_legal_type t ON t.code = 'vat_number'
WHERE o.name = 'Comité Régional de Tourisme TEST' AND o.region_code = 'TST'
  AND NOT EXISTS (
    SELECT 1 FROM object_legal ol WHERE ol.object_id = o.id AND ol.type_id = t.id
  );

-- ============================
-- LOGOS (média vectoriel)
-- ============================
INSERT INTO media (object_id, media_type_id, title, url, kind, is_main, is_published, created_at, updated_at)
SELECT o.id, mt.id, 'Logo OTI TEST', 'https://static.example.com/logos/oti-test.svg', 'logo', TRUE, TRUE, NOW(), NOW()
FROM object o JOIN ref_code_media_type mt ON mt.code = 'vector'
WHERE o.name = 'Office de Tourisme Intercommunal TEST' AND o.region_code = 'TST'
  AND NOT EXISTS (
    SELECT 1 FROM media m WHERE m.object_id = o.id AND m.kind = 'logo'
  );

INSERT INTO media (object_id, media_type_id, title, url, kind, is_main, is_published, created_at, updated_at)
SELECT o.id, mt.id, 'Logo CRT TEST', 'https://static.example.com/logos/crt-test.svg', 'logo', TRUE, TRUE, NOW(), NOW()
FROM object o JOIN ref_code_media_type mt ON mt.code = 'vector'
WHERE o.name = 'Comité Régional de Tourisme TEST' AND o.region_code = 'TST'
  AND NOT EXISTS (
    SELECT 1 FROM media m WHERE m.object_id = o.id AND m.kind = 'logo'
  );


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
('max_capacity','Capacité max.','pax','Capacité d''accueil maximale (personnes)',3),
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

-- Rôles d'acteur complémentaires
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
('water','Eau','Gestion responsable de l''eau',2),
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
    ('waste','bulk_amenities','Produits d''accueil en vrac',3),
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

-- =====================================================
-- MISSING OBJECT TYPES - COMPREHENSIVE COVERAGE
-- =====================================================

-- =====================================================
-- PCU - POINT DE CULTURE URBAINE
-- =====================================================
INSERT INTO object (object_type, name, region_code, status, created_at, updated_at)
SELECT 'PCU','Point Culture Urbaine Test','TST','published',NOW(),NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM object o WHERE o.object_type='PCU' AND o.region_code='TST' AND o.name='Point Culture Urbaine Test'
);

-- PCU - Localisation
INSERT INTO object_location (object_id, address1, postcode, city, latitude, longitude, is_main_location, position, created_at, updated_at)
SELECT o.id, '50 Rue de la Culture', '97400', 'Saint-Denis', -20.8789, 55.4481, TRUE, 1, NOW(), NOW()
FROM object o
WHERE o.object_type='PCU' AND o.region_code='TST' AND o.name='Point Culture Urbaine Test'
  AND NOT EXISTS (SELECT 1 FROM object_location ol WHERE ol.object_id=o.id AND ol.is_main_location IS TRUE);

-- PCU - Description
INSERT INTO object_description (object_id, org_object_id, description, description_chapo, visibility, created_at, updated_at)
SELECT o.id, oti.id, 'Point de culture urbaine proposant des ateliers artistiques, expositions et événements culturels.', 'Point culture urbaine - ateliers et expositions', 'public', NOW(), NOW()
FROM object o
JOIN object oti ON oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
WHERE o.object_type='PCU' AND o.region_code='TST' AND o.name='Point Culture Urbaine Test'
  AND NOT EXISTS (SELECT 1 FROM object_description od WHERE od.object_id=o.id AND od.org_object_id=oti.id);

-- PCU - Lien organisation
INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary, created_at, updated_at)
SELECT o.id, oti.id, ror.id, TRUE, NOW(), NOW()
FROM object o
JOIN object oti ON oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
JOIN ref_org_role ror ON ror.code='manager'
WHERE o.object_type='PCU' AND o.region_code='TST' AND o.name='Point Culture Urbaine Test'
  AND ror.code='manager'
  AND NOT EXISTS (SELECT 1 FROM object_org_link ool WHERE ool.object_id=o.id AND ool.org_object_id=oti.id);

-- =====================================================
-- PNA - POINT NATURE AVENTURE
-- =====================================================
INSERT INTO object (object_type, name, region_code, status, created_at, updated_at)
SELECT 'PNA','Point Nature Aventure Test','TST','published',NOW(),NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM object o WHERE o.object_type='PNA' AND o.region_code='TST' AND o.name='Point Nature Aventure Test'
);

-- PNA - Localisation
INSERT INTO object_location (object_id, address1, postcode, city, latitude, longitude, is_main_location, position, created_at, updated_at)
SELECT o.id, 'Sentier des Hauts', '97439', 'Sainte-Rose', -21.1300, 55.7800, TRUE, 1, NOW(), NOW()
FROM object o
WHERE o.object_type='PNA' AND o.region_code='TST' AND o.name='Point Nature Aventure Test'
  AND NOT EXISTS (SELECT 1 FROM object_location ol WHERE ol.object_id=o.id AND ol.is_main_location IS TRUE);

-- PNA - Description
INSERT INTO object_description (object_id, org_object_id, description, description_chapo, visibility, created_at, updated_at)
SELECT o.id, oti.id, 'Point nature aventure proposant des activités de plein air, randonnées guidées et découverte de la biodiversité.', 'Point nature aventure - activités plein air', 'public', NOW(), NOW()
FROM object o
JOIN object oti ON oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
WHERE o.object_type='PNA' AND o.region_code='TST' AND o.name='Point Nature Aventure Test'
  AND NOT EXISTS (SELECT 1 FROM object_description od WHERE od.object_id=o.id AND od.org_object_id=oti.id);

-- PNA - Lien organisation
INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary, created_at, updated_at)
SELECT o.id, oti.id, ror.id, TRUE, NOW(), NOW()
FROM object o
JOIN object oti ON oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
JOIN ref_org_role ror ON ror.code='manager'
WHERE o.object_type='PNA' AND o.region_code='TST' AND o.name='Point Nature Aventure Test'
  AND ror.code='manager'
  AND NOT EXISTS (SELECT 1 FROM object_org_link ool WHERE ool.object_id=o.id AND ool.org_object_id=oti.id);

-- =====================================================
-- VIL - VILLAGE
-- =====================================================
INSERT INTO object (object_type, name, region_code, status, created_at, updated_at)
SELECT 'VIL','Village Test Authentique','TST','published',NOW(),NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM object o WHERE o.object_type='VIL' AND o.region_code='TST' AND o.name='Village Test Authentique'
);

-- VIL - Localisation
INSERT INTO object_location (object_id, address1, postcode, city, latitude, longitude, is_main_location, position, created_at, updated_at)
SELECT o.id, 'Place du Village', '97425', 'Les Avirons', -21.2400, 55.3500, TRUE, 1, NOW(), NOW()
FROM object o
WHERE o.object_type='VIL' AND o.region_code='TST' AND o.name='Village Test Authentique'
  AND NOT EXISTS (SELECT 1 FROM object_location ol WHERE ol.object_id=o.id AND ol.is_main_location IS TRUE);

-- VIL - Description
INSERT INTO object_description (object_id, org_object_id, description, description_chapo, visibility, created_at, updated_at)
SELECT o.id, oti.id, 'Village authentique de La Réunion avec son patrimoine créole, ses cases traditionnelles et son marché local.', 'Village authentique créole', 'public', NOW(), NOW()
FROM object o
JOIN object oti ON oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
WHERE o.object_type='VIL' AND o.region_code='TST' AND o.name='Village Test Authentique'
  AND NOT EXISTS (SELECT 1 FROM object_description od WHERE od.object_id=o.id AND od.org_object_id=oti.id);

-- VIL - Lien organisation
INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary, created_at, updated_at)
SELECT o.id, oti.id, ror.id, TRUE, NOW(), NOW()
FROM object o
JOIN object oti ON oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
JOIN ref_org_role ror ON ror.code='manager'
WHERE o.object_type='VIL' AND o.region_code='TST' AND o.name='Village Test Authentique'
  AND ror.code='manager'
  AND NOT EXISTS (SELECT 1 FROM object_org_link ool WHERE ool.object_id=o.id AND ool.org_object_id=oti.id);

-- =====================================================
-- HPA - HÉBERGEMENT PARTICULIER
-- =====================================================
INSERT INTO object (object_type, name, region_code, status, created_at, updated_at)
SELECT 'HPA','Gîte Particulier Test','TST','published',NOW(),NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM object o WHERE o.object_type='HPA' AND o.region_code='TST' AND o.name='Gîte Particulier Test'
);

-- HPA - Localisation
INSERT INTO object_location (object_id, address1, postcode, city, latitude, longitude, is_main_location, position, created_at, updated_at)
SELECT o.id, '15 Chemin des Hauts', '97418', 'La Possession', -20.9200, 55.3300, TRUE, 1, NOW(), NOW()
FROM object o
WHERE o.object_type='HPA' AND o.region_code='TST' AND o.name='Gîte Particulier Test'
  AND NOT EXISTS (SELECT 1 FROM object_location ol WHERE ol.object_id=o.id AND ol.is_main_location IS TRUE);

-- HPA - Description
INSERT INTO object_description (object_id, org_object_id, description, description_chapo, visibility, created_at, updated_at)
SELECT o.id, oti.id, 'Gîte particulier avec vue panoramique sur l''océan, jardin créole et accueil chaleureux.', 'Gîte particulier - vue océan', 'public', NOW(), NOW()
FROM object o
JOIN object oti ON oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
WHERE o.object_type='HPA' AND o.region_code='TST' AND o.name='Gîte Particulier Test'
  AND NOT EXISTS (SELECT 1 FROM object_description od WHERE od.object_id=o.id AND od.org_object_id=oti.id);

-- HPA - Lien organisation
INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary, created_at, updated_at)
SELECT o.id, oti.id, ror.id, TRUE, NOW(), NOW()
FROM object o
JOIN object oti ON oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
JOIN ref_org_role ror ON ror.code='manager'
WHERE o.object_type='HPA' AND o.region_code='TST' AND o.name='Gîte Particulier Test'
  AND ror.code='manager'
  AND NOT EXISTS (SELECT 1 FROM object_org_link ool WHERE ool.object_id=o.id AND ool.org_object_id=oti.id);

-- =====================================================
-- ASC - ASSOCIATION
-- =====================================================
INSERT INTO object (object_type, name, region_code, status, created_at, updated_at)
SELECT 'ASC','Association Culturelle Test','TST','published',NOW(),NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM object o WHERE o.object_type='ASC' AND o.region_code='TST' AND o.name='Association Culturelle Test'
);

-- ASC - Localisation
INSERT INTO object_location (object_id, address1, postcode, city, latitude, longitude, is_main_location, position, created_at, updated_at)
SELECT o.id, '25 Rue de l''Association', '97420', 'Le Port', -20.9400, 55.2900, TRUE, 1, NOW(), NOW()
FROM object o
WHERE o.object_type='ASC' AND o.region_code='TST' AND o.name='Association Culturelle Test'
  AND NOT EXISTS (SELECT 1 FROM object_location ol WHERE ol.object_id=o.id AND ol.is_main_location IS TRUE);

-- ASC - Description
INSERT INTO object_description (object_id, org_object_id, description, description_chapo, visibility, created_at, updated_at)
SELECT o.id, oti.id, 'Association culturelle promouvant le patrimoine créole et organisant des événements culturels.', 'Association culturelle créole', 'public', NOW(), NOW()
FROM object o
JOIN object oti ON oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
WHERE o.object_type='ASC' AND o.region_code='TST' AND o.name='Association Culturelle Test'
  AND NOT EXISTS (SELECT 1 FROM object_description od WHERE od.object_id=o.id AND od.org_object_id=oti.id);

-- ASC - Lien organisation
INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary, created_at, updated_at)
SELECT o.id, oti.id, ror.id, TRUE, NOW(), NOW()
FROM object o
JOIN object oti ON oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
JOIN ref_org_role ror ON ror.code='manager'
WHERE o.object_type='ASC' AND o.region_code='TST' AND o.name='Association Culturelle Test'
  AND ror.code='manager'
  AND NOT EXISTS (SELECT 1 FROM object_org_link ool WHERE ool.object_id=o.id AND ool.org_object_id=oti.id);

-- =====================================================
-- COM - COMMERCE
-- =====================================================
INSERT INTO object (object_type, name, region_code, status, created_at, updated_at)
SELECT 'COM','Boutique Artisanale Test','TST','published',NOW(),NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM object o WHERE o.object_type='COM' AND o.region_code='TST' AND o.name='Boutique Artisanale Test'
);

-- COM - Localisation
INSERT INTO object_location (object_id, address1, postcode, city, latitude, longitude, is_main_location, position, created_at, updated_at)
SELECT o.id, '30 Rue du Commerce', '97450', 'Saint-Louis', -21.2900, 55.4100, TRUE, 1, NOW(), NOW()
FROM object o
WHERE o.object_type='COM' AND o.region_code='TST' AND o.name='Boutique Artisanale Test'
  AND NOT EXISTS (SELECT 1 FROM object_location ol WHERE ol.object_id=o.id AND ol.is_main_location IS TRUE);

-- COM - Description
INSERT INTO object_description (object_id, org_object_id, description, description_chapo, visibility, created_at, updated_at)
SELECT o.id, oti.id, 'Boutique artisanale proposant des créations locales, souvenirs et produits du terroir.', 'Boutique artisanale - créations locales', 'public', NOW(), NOW()
FROM object o
JOIN object oti ON oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
WHERE o.object_type='COM' AND o.region_code='TST' AND o.name='Boutique Artisanale Test'
  AND NOT EXISTS (SELECT 1 FROM object_description od WHERE od.object_id=o.id AND od.org_object_id=oti.id);

-- COM - Lien organisation
INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary, created_at, updated_at)
SELECT o.id, oti.id, ror.id, TRUE, NOW(), NOW()
FROM object o
JOIN object oti ON oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
JOIN ref_org_role ror ON ror.code='manager'
WHERE o.object_type='COM' AND o.region_code='TST' AND o.name='Boutique Artisanale Test'
  AND ror.code='manager'
  AND NOT EXISTS (SELECT 1 FROM object_org_link ool WHERE ool.object_id=o.id AND ool.org_object_id=oti.id);

-- =====================================================
-- HLO - HÉBERGEMENT LOISIR
-- =====================================================
INSERT INTO object (object_type, name, region_code, status, created_at, updated_at)
SELECT 'HLO','Résidence Loisir Test','TST','published',NOW(),NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM object o WHERE o.object_type='HLO' AND o.region_code='TST' AND o.name='Résidence Loisir Test'
);

-- HLO - Localisation
INSERT INTO object_location (object_id, address1, postcode, city, latitude, longitude, is_main_location, position, created_at, updated_at)
SELECT o.id, '40 Avenue des Vacances', '97438', 'Sainte-Marie', -20.9000, 55.5500, TRUE, 1, NOW(), NOW()
FROM object o
WHERE o.object_type='HLO' AND o.region_code='TST' AND o.name='Résidence Loisir Test'
  AND NOT EXISTS (SELECT 1 FROM object_location ol WHERE ol.object_id=o.id AND ol.is_main_location IS TRUE);

-- HLO - Description
INSERT INTO object_description (object_id, org_object_id, description, description_chapo, visibility, created_at, updated_at)
SELECT o.id, oti.id, 'Résidence de loisirs avec piscine, activités et hébergement en appartements.', 'Résidence loisirs - piscine et activités', 'public', NOW(), NOW()
FROM object o
JOIN object oti ON oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
WHERE o.object_type='HLO' AND o.region_code='TST' AND o.name='Résidence Loisir Test'
  AND NOT EXISTS (SELECT 1 FROM object_description od WHERE od.object_id=o.id AND od.org_object_id=oti.id);

-- HLO - Lien organisation
INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary, created_at, updated_at)
SELECT o.id, oti.id, ror.id, TRUE, NOW(), NOW()
FROM object o
JOIN object oti ON oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
JOIN ref_org_role ror ON ror.code='manager'
WHERE o.object_type='HLO' AND o.region_code='TST' AND o.name='Résidence Loisir Test'
  AND ror.code='manager'
  AND NOT EXISTS (SELECT 1 FROM object_org_link ool WHERE ool.object_id=o.id AND ool.org_object_id=oti.id);

-- =====================================================
-- LOI - LOISIR
-- =====================================================
INSERT INTO object (object_type, name, region_code, status, created_at, updated_at)
SELECT 'LOI','Centre Loisirs Test','TST','published',NOW(),NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM object o WHERE o.object_type='LOI' AND o.region_code='TST' AND o.name='Centre Loisirs Test'
);

-- LOI - Localisation
INSERT INTO object_location (object_id, address1, postcode, city, latitude, longitude, is_main_location, position, created_at, updated_at)
SELECT o.id, '60 Boulevard des Loisirs', '97460', 'Saint-Paul', -21.0100, 55.2700, TRUE, 1, NOW(), NOW()
FROM object o
WHERE o.object_type='LOI' AND o.region_code='TST' AND o.name='Centre Loisirs Test'
  AND NOT EXISTS (SELECT 1 FROM object_location ol WHERE ol.object_id=o.id AND ol.is_main_location IS TRUE);

-- LOI - Description
INSERT INTO object_description (object_id, org_object_id, description, description_chapo, visibility, created_at, updated_at)
SELECT o.id, oti.id, 'Centre de loisirs proposant des activités sportives, culturelles et de détente.', 'Centre loisirs - sports et culture', 'public', NOW(), NOW()
FROM object o
JOIN object oti ON oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
WHERE o.object_type='LOI' AND o.region_code='TST' AND o.name='Centre Loisirs Test'
  AND NOT EXISTS (SELECT 1 FROM object_description od WHERE od.object_id=o.id AND od.org_object_id=oti.id);

-- LOI - Lien organisation
INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary, created_at, updated_at)
SELECT o.id, oti.id, ror.id, TRUE, NOW(), NOW()
FROM object o
JOIN object oti ON oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
JOIN ref_org_role ror ON ror.code='manager'
WHERE o.object_type='LOI' AND o.region_code='TST' AND o.name='Centre Loisirs Test'
  AND ror.code='manager'
  AND NOT EXISTS (SELECT 1 FROM object_org_link ool WHERE ool.object_id=o.id AND ool.org_object_id=oti.id);

-- =====================================================
-- FMA - FESTIVAL/MANIFESTATION
-- =====================================================
INSERT INTO object (object_type, name, region_code, status, created_at, updated_at)
SELECT 'FMA','Festival Créole Test','TST','published',NOW(),NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM object o WHERE o.object_type='FMA' AND o.region_code='TST' AND o.name='Festival Créole Test'
);

-- FMA - Localisation
INSERT INTO object_location (object_id, address1, postcode, city, latitude, longitude, is_main_location, position, created_at, updated_at)
SELECT o.id, 'Place de la Mairie', '97470', 'Saint-Benoît', -21.0300, 55.7200, TRUE, 1, NOW(), NOW()
FROM object o
WHERE o.object_type='FMA' AND o.region_code='TST' AND o.name='Festival Créole Test'
  AND NOT EXISTS (SELECT 1 FROM object_location ol WHERE ol.object_id=o.id AND ol.is_main_location IS TRUE);

-- FMA - Description
INSERT INTO object_description (object_id, org_object_id, description, description_chapo, visibility, created_at, updated_at)
SELECT o.id, oti.id, 'Festival annuel célébrant la culture créole avec musique, danse et gastronomie.', 'Festival créole - musique et culture', 'public', NOW(), NOW()
FROM object o
JOIN object oti ON oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
WHERE o.object_type='FMA' AND o.region_code='TST' AND o.name='Festival Créole Test'
  AND NOT EXISTS (SELECT 1 FROM object_description od WHERE od.object_id=o.id AND od.org_object_id=oti.id);

-- FMA - Lien organisation
INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary, created_at, updated_at)
SELECT o.id, oti.id, ror.id, TRUE, NOW(), NOW()
FROM object o
JOIN object oti ON oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
JOIN ref_org_role ror ON ror.code='manager'
WHERE o.object_type='FMA' AND o.region_code='TST' AND o.name='Festival Créole Test'
  AND ror.code='manager'
  AND NOT EXISTS (SELECT 1 FROM object_org_link ool WHERE ool.object_id=o.id AND ool.org_object_id=oti.id);

-- FMA - Event data
INSERT INTO object_fma (object_id, event_start_date, event_end_date, event_start_time, event_end_time, created_at, updated_at)
SELECT o.id, DATE '2025-12-15', DATE '2025-12-17', TIME '18:00', TIME '23:00', NOW(), NOW()
FROM object o
WHERE o.object_type='FMA' AND o.region_code='TST' AND o.name='Festival Créole Test'
  AND NOT EXISTS (SELECT 1 FROM object_fma of WHERE of.object_id=o.id);

-- FMA - Event occurrences
INSERT INTO object_fma_occurrence (object_id, start_at, end_at, state, created_at, updated_at)
SELECT o.id, TIMESTAMPTZ '2025-12-15 18:00:00+04', TIMESTAMPTZ '2025-12-15 23:00:00+04', 'confirmed', NOW(), NOW()
FROM object o
WHERE o.object_type='FMA' AND o.region_code='TST' AND o.name='Festival Créole Test'
  AND NOT EXISTS (SELECT 1 FROM object_fma_occurrence ofo WHERE ofo.object_id=o.id);

-- =====================================================
-- CAMP - CAMPING
-- =====================================================
INSERT INTO object (object_type, name, region_code, status, created_at, updated_at)
SELECT 'CAMP','Camping Nature Test','TST','published',NOW(),NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM object o WHERE o.object_type='CAMP' AND o.region_code='TST' AND o.name='Camping Nature Test'
);

-- CAMP - Localisation
INSERT INTO object_location (object_id, address1, postcode, city, latitude, longitude, is_main_location, position, created_at, updated_at)
SELECT o.id, 'Route de la Plage', '97480', 'Saint-Joseph', -21.3800, 55.6200, TRUE, 1, NOW(), NOW()
FROM object o
WHERE o.object_type='CAMP' AND o.region_code='TST' AND o.name='Camping Nature Test'
  AND NOT EXISTS (SELECT 1 FROM object_location ol WHERE ol.object_id=o.id AND ol.is_main_location IS TRUE);

-- CAMP - Description
INSERT INTO object_description (object_id, org_object_id, description, description_chapo, visibility, created_at, updated_at)
SELECT o.id, oti.id, 'Camping en pleine nature avec emplacements pour tentes et camping-cars, sanitaires et douches.', 'Camping nature - tentes et camping-cars', 'public', NOW(), NOW()
FROM object o
JOIN object oti ON oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
WHERE o.object_type='CAMP' AND o.region_code='TST' AND o.name='Camping Nature Test'
  AND NOT EXISTS (SELECT 1 FROM object_description od WHERE od.object_id=o.id AND od.org_object_id=oti.id);

-- CAMP - Lien organisation
INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary, created_at, updated_at)
SELECT o.id, oti.id, ror.id, TRUE, NOW(), NOW()
FROM object o
JOIN object oti ON oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
JOIN ref_org_role ror ON ror.code='manager'
WHERE o.object_type='CAMP' AND o.region_code='TST' AND o.name='Camping Nature Test'
  AND ror.code='manager'
  AND NOT EXISTS (SELECT 1 FROM object_org_link ool WHERE ool.object_id=o.id AND ool.org_object_id=oti.id);

-- =====================================================
-- ITI - ITINÉRAIRE
-- =====================================================
INSERT INTO object (object_type, name, region_code, status, created_at, updated_at)
SELECT 'ITI','Randonnée Piton des Neiges','TST','published',NOW(),NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM object o WHERE o.object_type='ITI' AND o.region_code='TST' AND o.name='Randonnée Piton des Neiges'
);

-- ITI - Localisation
INSERT INTO object_location (object_id, address1, postcode, city, latitude, longitude, is_main_location, position, created_at, updated_at)
SELECT o.id, 'Départ Cilaos', '97413', 'Cilaos', -21.1300, 55.4700, TRUE, 1, NOW(), NOW()
FROM object o
WHERE o.object_type='ITI' AND o.region_code='TST' AND o.name='Randonnée Piton des Neiges'
  AND NOT EXISTS (SELECT 1 FROM object_location ol WHERE ol.object_id=o.id AND ol.is_main_location IS TRUE);

-- ITI - Description
INSERT INTO object_description (object_id, org_object_id, description, description_chapo, visibility, created_at, updated_at)
SELECT o.id, oti.id, 'Randonnée mythique vers le sommet de La Réunion, le Piton des Neiges (3071m).', 'Randonnée Piton des Neiges - sommet de La Réunion', 'public', NOW(), NOW()
FROM object o
JOIN object oti ON oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
WHERE o.object_type='ITI' AND o.region_code='TST' AND o.name='Randonnée Piton des Neiges'
  AND NOT EXISTS (SELECT 1 FROM object_description od WHERE od.object_id=o.id AND od.org_object_id=oti.id);

-- ITI - Lien organisation
INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary, created_at, updated_at)
SELECT o.id, oti.id, ror.id, TRUE, NOW(), NOW()
FROM object o
JOIN object oti ON oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
JOIN ref_org_role ror ON ror.code='manager'
WHERE o.object_type='ITI' AND o.region_code='TST' AND o.name='Randonnée Piton des Neiges'
  AND ror.code='manager'
  AND NOT EXISTS (SELECT 1 FROM object_org_link ool WHERE ool.object_id=o.id AND ool.org_object_id=oti.id);

-- ITI - Itinerary data
INSERT INTO object_iti (object_id, distance_km, duration_hours, difficulty_level, elevation_gain, created_at, updated_at)
SELECT o.id, 12.5, 8.0, 4, 1200, NOW(), NOW()
FROM object o
WHERE o.object_type='ITI' AND o.region_code='TST' AND o.name='Randonnée Piton des Neiges'
  AND NOT EXISTS (SELECT 1 FROM object_iti oi WHERE oi.object_id=o.id);

-- ITI - Practices
INSERT INTO object_iti_practice (object_id, practice_id, created_at, updated_at)
SELECT o.id, p.id, NOW(), NOW()
FROM object o, ref_code_iti_practice p
WHERE o.object_type='ITI' AND o.region_code='TST' AND o.name='Randonnée Piton des Neiges'
  AND p.code = 'randonnee_pedestre'
  AND NOT EXISTS (SELECT 1 FROM object_iti_practice oip WHERE oip.object_id=o.id AND oip.practice_id=p.id);

-- =====================================================
-- COMPREHENSIVE DATA FOR ALL OBJECT TYPES
-- =====================================================

-- =====================================================
-- CRM INTERACTIONS AND TASKS
-- =====================================================

-- CRM Interactions for Hotel Test Océan
INSERT INTO crm_interaction (object_id, actor_id, interaction_type, direction, status, subject, body, occurred_at, created_at, updated_at)
SELECT h.id, a.id, 'email', 'inbound', 'done', 'Demande de réservation groupe', 'Bonjour, nous souhaiterions réserver 15 chambres pour un séminaire d''entreprise du 15 au 18 mars 2025.', TIMESTAMPTZ '2025-01-15 10:30:00+04', NOW(), NOW()
FROM object h, actor a
WHERE h.object_type='HOT' AND h.region_code='TST' AND h.name='Hôtel Test Océan'
  AND a.display_name='Alice MARTIN'
  AND NOT EXISTS (SELECT 1 FROM crm_interaction ci WHERE ci.object_id=h.id AND ci.subject='Demande de réservation groupe');

INSERT INTO crm_interaction (object_id, actor_id, interaction_type, direction, status, subject, body, occurred_at, created_at, updated_at)
SELECT h.id, a.id, 'call', 'outbound', 'done', 'Suivi réservation groupe', 'Appel de suivi pour confirmer les détails de la réservation groupe.', TIMESTAMPTZ '2025-01-15 14:00:00+04', NOW(), NOW()
FROM object h, actor a
WHERE h.object_type='HOT' AND h.region_code='TST' AND h.name='Hôtel Test Océan'
  AND a.display_name='Alice MARTIN'
  AND NOT EXISTS (SELECT 1 FROM crm_interaction ci WHERE ci.object_id=h.id AND ci.subject='Suivi réservation groupe');

-- CRM Tasks
INSERT INTO crm_task (object_id, actor_id, title, description, priority, status, due_at, created_at, updated_at)
SELECT h.id, a.id, 'Préparer devis groupe', 'Établir un devis détaillé pour la réservation de 15 chambres', 'high', 'todo', TIMESTAMPTZ '2025-01-20 17:00:00+04', NOW(), NOW()
FROM object h, actor a
WHERE h.object_type='HOT' AND h.region_code='TST' AND h.name='Hôtel Test Océan'
  AND a.display_name='Alice MARTIN'
  AND NOT EXISTS (SELECT 1 FROM crm_task ct WHERE ct.object_id=h.id AND ct.title='Préparer devis groupe');

-- =====================================================
-- LEGAL RECORDS AND DOCUMENT MANAGEMENT
-- =====================================================

-- Legal types for comprehensive testing
INSERT INTO ref_legal_type (code, name, description, category, is_required, is_public, review_interval_days, created_at, updated_at) VALUES
('siret', 'SIRET', 'Numéro SIRET de l''établissement', 'business', TRUE, TRUE, NULL, NOW(), NOW()),
('siren', 'SIREN', 'Numéro SIREN de l''entreprise', 'business', TRUE, TRUE, NULL, NOW(), NOW()),
('vat_number', 'Numéro TVA', 'Numéro de TVA intracommunautaire', 'tax', FALSE, TRUE, 365, NOW(), NOW()),
('insurance_certificate', 'Attestation d''assurance', 'Attestation d''assurance responsabilité civile', 'insurance', TRUE, FALSE, 365, NOW(), NOW()),
('fire_safety_certificate', 'Certificat sécurité incendie', 'Certificat de conformité sécurité incendie', 'safety', TRUE, TRUE, 365, NOW(), NOW()),
('food_safety_certificate', 'Certificat hygiène alimentaire', 'Certificat d''hygiène et sécurité alimentaire', 'safety', FALSE, TRUE, 365, NOW(), NOW()),
('tourism_license', 'Licence tourisme', 'Licence d''exploitation touristique', 'business', TRUE, TRUE, 365, NOW(), NOW()),
('alcohol_license', 'Licence alcool', 'Licence de vente d''alcool', 'business', FALSE, TRUE, 365, NOW(), NOW())
ON CONFLICT (code) DO NOTHING;

-- Legal records for Hotel Test Océan
INSERT INTO object_legal (object_id, type_id, value, validity_mode, status, valid_from, created_at, updated_at)
SELECT h.id, t.id, jsonb_build_object('number','13002526500017', 'address','10 Rue des Plages, 97430 Le Tampon'), 'forever', 'active', CURRENT_DATE, NOW(), NOW()
FROM object h, ref_legal_type t
WHERE h.object_type='HOT' AND h.region_code='TST' AND h.name='Hôtel Test Océan'
  AND t.code='siret'
  AND NOT EXISTS (SELECT 1 FROM object_legal ol WHERE ol.object_id=h.id AND ol.type_id=t.id);

INSERT INTO object_legal (object_id, type_id, value, validity_mode, status, valid_from, created_at, updated_at)
SELECT h.id, t.id, jsonb_build_object('number','512345678', 'company_name','Hôtel Test Océan SARL'), 'forever', 'active', CURRENT_DATE, NOW(), NOW()
FROM object h, ref_legal_type t
WHERE h.object_type='HOT' AND h.region_code='TST' AND h.name='Hôtel Test Océan'
  AND t.code='siren'
  AND NOT EXISTS (SELECT 1 FROM object_legal ol WHERE ol.object_id=h.id AND ol.type_id=t.id);

INSERT INTO object_legal (object_id, type_id, value, validity_mode, status, valid_from, created_at, updated_at)
SELECT h.id, t.id, jsonb_build_object('number','FR76 1234 5678 90', 'valid_from','2024-01-01'), 'tacit_renewal', 'active', DATE '2024-01-01', NOW(), NOW()
FROM object h, ref_legal_type t
WHERE h.object_type='HOT' AND h.region_code='TST' AND h.name='Hôtel Test Océan'
  AND t.code='vat_number'
  AND NOT EXISTS (SELECT 1 FROM object_legal ol WHERE ol.object_id=h.id AND ol.type_id=t.id);

-- Legal records for Restaurant Test Océan
INSERT INTO object_legal (object_id, type_id, value, validity_mode, status, valid_from, created_at, updated_at)
SELECT r.id, t.id, jsonb_build_object('number','13002526500018', 'address','10 Rue des Plages, 97430 Le Tampon'), 'forever', 'active', CURRENT_DATE, NOW(), NOW()
FROM object r, ref_legal_type t
WHERE r.object_type='RES' AND r.region_code='TST' AND r.name='Restaurant Test Océan'
  AND t.code='siret'
  AND NOT EXISTS (SELECT 1 FROM object_legal ol WHERE ol.object_id=r.id AND ol.type_id=t.id);

-- =====================================================
-- COMPREHENSIVE MEDIA DATA
-- =====================================================

-- Media for all new object types
INSERT INTO media (object_id, media_type_id, title, url, kind, is_main, is_published, position, created_at, updated_at)
SELECT o.id, mt.id, 'Logo ' || o.name, 'https://static.example.com/logos/' || lower(replace(o.name, ' ', '-')) || '.svg', 'logo', TRUE, TRUE, 1, NOW(), NOW()
FROM object o, ref_code_media_type mt
WHERE o.region_code='TST' AND o.object_type IN ('PCU','PNA','VIL','HPA','ASC','COM','HLO','LOI','FMA','CAMP','ITI')
  AND mt.code='vector'
  AND NOT EXISTS (SELECT 1 FROM media m WHERE m.object_id=o.id AND m.kind='logo');

INSERT INTO media (object_id, media_type_id, title, url, kind, is_main, is_published, position, created_at, updated_at)
SELECT o.id, mt.id, 'Photo principale ' || o.name, 'https://images.example.com/' || lower(replace(o.name, ' ', '-')) || '/main.jpg', 'illustration', TRUE, TRUE, 2, NOW(), NOW()
FROM object o, ref_code_media_type mt
WHERE o.region_code='TST' AND o.object_type IN ('PCU','PNA','VIL','HPA','ASC','COM','HLO','LOI','FMA','CAMP','ITI')
  AND mt.code='photo'
  AND NOT EXISTS (SELECT 1 FROM media m WHERE m.object_id=o.id AND m.media_type_id=mt.id AND m.is_main IS TRUE);

-- =====================================================
-- COMPREHENSIVE OPENING SCHEDULES
-- =====================================================

-- Opening schedules for all new object types
INSERT INTO opening_period (object_id, name, all_years, created_at, updated_at)
SELECT o.id, 'Horaires réguliers', TRUE, NOW(), NOW()
FROM object o
WHERE o.region_code='TST' AND o.object_type IN ('PCU','PNA','VIL','HPA','ASC','COM','HLO','LOI','CAMP')
  AND NOT EXISTS (SELECT 1 FROM opening_period op WHERE op.object_id=o.id AND op.all_years IS TRUE);

-- Opening schedules for each period
INSERT INTO opening_schedule (period_id, schedule_type_id, name, created_at, updated_at)
SELECT op.id, rst.id, 'Horaires d''ouverture', NOW(), NOW()
FROM opening_period op
JOIN object o ON o.id=op.object_id
JOIN ref_code_opening_schedule_type rst ON rst.code='regular'
WHERE o.region_code='TST' AND o.object_type IN ('PCU','PNA','VIL','HPA','ASC','COM','HLO','LOI','CAMP')
  AND op.all_years IS TRUE
  AND NOT EXISTS (SELECT 1 FROM opening_schedule os WHERE os.period_id=op.id);

-- Time periods for opening schedules
INSERT INTO opening_time_period (schedule_id, closed, created_at, updated_at)
SELECT os.id, FALSE, NOW(), NOW()
FROM opening_schedule os
JOIN opening_period op ON op.id=os.period_id
JOIN object o ON o.id=op.object_id
WHERE o.region_code='TST' AND o.object_type IN ('PCU','PNA','VIL','HPA','ASC','COM','HLO','LOI','CAMP')
  AND op.all_years IS TRUE
  AND NOT EXISTS (SELECT 1 FROM opening_time_period tp WHERE tp.schedule_id=os.id AND tp.closed=FALSE);

-- Weekdays for opening schedules
INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
SELECT tp.id, w.id
FROM opening_time_period tp
JOIN opening_schedule os ON os.id=tp.schedule_id
JOIN opening_period op ON op.id=os.period_id
JOIN object o ON o.id=op.object_id
JOIN ref_code_weekday w ON w.code IN ('monday','tuesday','wednesday','thursday','friday')
WHERE o.region_code='TST' AND o.object_type IN ('PCU','PNA','VIL','HPA','ASC','COM','HLO','LOI','CAMP')
  AND op.all_years IS TRUE
  AND NOT EXISTS (SELECT 1 FROM opening_time_period_weekday tw WHERE tw.time_period_id=tp.id AND tw.weekday_id=w.id);

-- Time frames for opening schedules
INSERT INTO opening_time_frame (time_period_id, start_time, end_time, created_at, updated_at)
SELECT tp.id, TIME '09:00', TIME '17:00', NOW(), NOW()
FROM opening_time_period tp
JOIN opening_schedule os ON os.id=tp.schedule_id
JOIN opening_period op ON op.id=os.period_id
JOIN object o ON o.id=op.object_id
WHERE o.region_code='TST' AND o.object_type IN ('PCU','PNA','VIL','HPA','ASC','COM','HLO','LOI','CAMP')
  AND op.all_years IS TRUE
  AND NOT EXISTS (SELECT 1 FROM opening_time_frame tf WHERE tf.time_period_id=tp.id AND tf.start_time=TIME '09:00' AND tf.end_time=TIME '17:00');

-- =====================================================
-- COMPREHENSIVE PRICING DATA
-- =====================================================

-- Pricing for commercial objects
INSERT INTO object_price (object_id, kind_id, unit_id, amount, currency, valid_from, valid_to, conditions, created_at, updated_at)
SELECT o.id, pk.id, pu.id, 25.00, 'EUR', CURRENT_DATE, CURRENT_DATE + INTERVAL '1 year', 'Tarif standard', NOW(), NOW()
FROM object o, ref_code_price_kind pk, ref_code_price_unit pu
WHERE o.region_code='TST' AND o.object_type IN ('COM','LOI')
  AND pk.code='adulte' AND pu.code='par_personne'
  AND NOT EXISTS (SELECT 1 FROM object_price p WHERE p.object_id=o.id AND p.kind_id=pk.id AND p.unit_id=pu.id);

-- Pricing for accommodation objects
INSERT INTO object_price (object_id, kind_id, unit_id, amount, currency, valid_from, valid_to, conditions, created_at, updated_at)
SELECT o.id, pk.id, pu.id, 80.00, 'EUR', CURRENT_DATE, CURRENT_DATE + INTERVAL '1 year', 'Tarif chambre double', NOW(), NOW()
FROM object o, ref_code_price_kind pk, ref_code_price_unit pu
WHERE o.region_code='TST' AND o.object_type IN ('HPA','HLO','CAMP')
  AND pk.code='adulte' AND pu.code='par_nuit'
  AND NOT EXISTS (SELECT 1 FROM object_price p WHERE p.object_id=o.id AND p.kind_id=pk.id AND p.unit_id=pu.id);

-- =====================================================
-- COMPREHENSIVE AMENITY DATA
-- =====================================================

-- Amenities for all object types
INSERT INTO object_amenity (object_id, amenity_id, created_at)
SELECT o.id, a.id, NOW()
FROM object o, ref_amenity a
WHERE o.region_code='TST' AND o.object_type IN ('PCU','PNA','VIL','HPA','ASC','COM','HLO','LOI','FMA','CAMP','ITI')
  AND a.code IN ('wifi','parking','accessibility')
  AND NOT EXISTS (SELECT 1 FROM object_amenity oa WHERE oa.object_id=o.id AND oa.amenity_id=a.id);

-- Specific amenities for accommodation objects
INSERT INTO object_amenity (object_id, amenity_id, created_at)
SELECT o.id, a.id, NOW()
FROM object o, ref_amenity a
WHERE o.region_code='TST' AND o.object_type IN ('HPA','HLO','CAMP')
  AND a.code IN ('swimming_pool','garden','bbq')
  AND NOT EXISTS (SELECT 1 FROM object_amenity oa WHERE oa.object_id=o.id AND oa.amenity_id=a.id);

-- =====================================================
-- COMPREHENSIVE CAPACITY DATA
-- =====================================================

-- Capacity data for all object types
INSERT INTO object_capacity (object_id, metric_id, value_integer, created_at, updated_at)
SELECT o.id, m.id, 
  CASE 
    WHEN o.object_type IN ('HPA','HLO') THEN 4
    WHEN o.object_type = 'CAMP' THEN 50
    WHEN o.object_type IN ('PCU','PNA','VIL','ASC','COM','LOI') THEN 30
    WHEN o.object_type = 'FMA' THEN 200
    WHEN o.object_type = 'ITI' THEN 20
    ELSE 10
  END,
  NOW(), NOW()
FROM object o, ref_capacity_metric m
WHERE o.region_code='TST' AND o.object_type IN ('PCU','PNA','VIL','HPA','ASC','COM','HLO','LOI','FMA','CAMP','ITI')
  AND m.code='max_capacity'
  AND NOT EXISTS (SELECT 1 FROM object_capacity oc WHERE oc.object_id=o.id AND oc.metric_id=m.id);

-- =====================================================
-- COMPREHENSIVE CONTACT DATA
-- =====================================================

-- Contact channels for all objects
INSERT INTO contact_channel (object_id, kind_id, value, is_primary, position, created_at, updated_at)
SELECT o.id, ck.id, 'https://www.' || lower(translate(replace(o.name, ' ', '-'), 'àáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ', 'aaaaaaaceeeeiiiidnoooooouuuuyty')) || '.re', TRUE, 1, NOW(), NOW()
FROM object o, ref_code_contact_kind ck
WHERE o.region_code='TST' AND o.object_type IN ('PCU','PNA','VIL','HPA','ASC','COM','HLO','LOI','FMA','CAMP','ITI')
  AND ck.code='website'
  AND NOT EXISTS (SELECT 1 FROM contact_channel cc WHERE cc.object_id=o.id AND cc.kind_id=ck.id);

-- Email contacts
INSERT INTO contact_channel (object_id, kind_id, value, is_primary, position, created_at, updated_at)
SELECT o.id, ck.id, 'contact@' || lower(translate(replace(o.name, ' ', '-'), 'àáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ', 'aaaaaaaceeeeiiiidnoooooouuuuyty')) || '.re', TRUE, 2, NOW(), NOW()
FROM object o, ref_code_contact_kind ck
WHERE o.region_code='TST' AND o.object_type IN ('PCU','PNA','VIL','HPA','ASC','COM','HLO','LOI','FMA','CAMP','ITI')
  AND ck.code='email'
  AND NOT EXISTS (SELECT 1 FROM contact_channel cc WHERE cc.object_id=o.id AND cc.kind_id=ck.id);

-- =====================================================
-- COMPREHENSIVE LANGUAGE DATA
-- =====================================================

-- Language support for all objects
INSERT INTO object_language (object_id, language_id, created_at)
SELECT o.id, l.id, NOW()
FROM object o, ref_language l
WHERE o.region_code='TST' AND o.object_type IN ('PCU','PNA','VIL','HPA','ASC','COM','HLO','LOI','FMA','CAMP','ITI')
  AND l.code IN ('fr','en')
  AND NOT EXISTS (SELECT 1 FROM object_language ol WHERE ol.object_id=o.id AND ol.language_id=l.id);

-- =====================================================
-- COMPREHENSIVE PAYMENT METHODS
-- =====================================================

-- Payment methods for commercial objects
INSERT INTO object_payment_method (object_id, payment_method_id, created_at)
SELECT o.id, pm.id, NOW()
FROM object o, ref_code_payment_method pm
WHERE o.region_code='TST' AND o.object_type IN ('COM','LOI','FMA')
  AND pm.code IN ('carte_bleue','visa','mastercard','especes')
  AND NOT EXISTS (SELECT 1 FROM object_payment_method opm WHERE opm.object_id=o.id AND opm.payment_method_id=pm.id);

-- =====================================================
-- COMPREHENSIVE ENVIRONMENT TAGS
-- =====================================================

-- Environment tags for all objects
INSERT INTO object_environment_tag (object_id, environment_tag_id, created_at)
SELECT o.id, et.id, NOW()
FROM object o, ref_code_environment_tag et
WHERE o.region_code='TST' AND o.object_type IN ('PCU','PNA','VIL','HPA','ASC','COM','HLO','LOI','FMA','CAMP','ITI')
  AND et.code IN ('calme','nature')
  AND NOT EXISTS (SELECT 1 FROM object_environment_tag oet WHERE oet.object_id=o.id AND oet.environment_tag_id=et.id);

-- =====================================================
-- COMPREHENSIVE PET POLICIES
-- =====================================================

-- Pet policies for accommodation objects
INSERT INTO object_pet_policy (object_id, accepted, conditions, created_at, updated_at)
SELECT o.id, TRUE, 'Animaux acceptés avec supplément de 10€/nuit', NOW(), NOW()
FROM object o
WHERE o.region_code='TST' AND o.object_type IN ('HPA','HLO','CAMP')
  AND NOT EXISTS (SELECT 1 FROM object_pet_policy opp WHERE opp.object_id=o.id);

-- =====================================================
-- COMPREHENSIVE GROUP POLICIES
-- =====================================================

-- Group policies for commercial objects
INSERT INTO object_group_policy (object_id, min_size, max_size, group_only, notes, created_at, updated_at)
SELECT o.id, 10, 50, TRUE, 'Politique groupe: 15% de réduction', NOW(), NOW()
FROM object o
WHERE o.region_code='TST' AND o.object_type IN ('COM','LOI','FMA')
  AND NOT EXISTS (SELECT 1 FROM object_group_policy ogp WHERE ogp.object_id=o.id);

-- =====================================================
-- COMPREHENSIVE DISCOUNTS
-- =====================================================

-- Discounts for commercial objects
INSERT INTO object_discount (object_id, conditions, discount_percent, min_group_size, valid_from, valid_to, source, created_at, updated_at)
SELECT o.id, 'Réduction groupe - minimum 10 personnes', 15.00, 10, CURRENT_DATE, CURRENT_DATE + INTERVAL '6 months', 'promotion', NOW(), NOW()
FROM object o
WHERE o.region_code='TST' AND o.object_type IN ('COM','LOI','FMA')
  AND NOT EXISTS (SELECT 1 FROM object_discount od WHERE od.object_id=o.id AND od.conditions='Réduction groupe - minimum 10 personnes');

-- =====================================================
-- COMPREHENSIVE CLASSIFICATION DATA
-- =====================================================

-- Classifications for all objects
INSERT INTO object_classification (object_id, scheme_id, value_id, created_at, updated_at)
SELECT o.id, cs.id, cv.id, NOW(), NOW()
FROM object o, ref_classification_scheme cs, ref_classification_value cv
WHERE o.region_code='TST' AND o.object_type IN ('PCU','PNA','VIL','HPA','ASC','COM','HLO','LOI','FMA','CAMP','ITI')
  AND cs.code='tourisme_handicap'
  AND cv.code='moteur'
  AND NOT EXISTS (SELECT 1 FROM object_classification oc WHERE oc.object_id=o.id AND oc.scheme_id=cs.id AND oc.value_id=cv.id);

-- =====================================================
-- COMPREHENSIVE SUSTAINABILITY DATA
-- =====================================================

-- Sustainability actions for all objects
INSERT INTO object_sustainability_action (object_id, action_id, created_at, updated_at)
SELECT o.id, sa.id, NOW(), NOW()
FROM object o, ref_sustainability_action sa
JOIN ref_sustainability_action_category sac ON sac.id=sa.category_id
WHERE o.region_code='TST' AND o.object_type IN ('PCU','PNA','VIL','HPA','ASC','COM','HLO','LOI','FMA','CAMP','ITI')
  AND sac.code='energy'
  AND sa.code='led_lighting'
  AND NOT EXISTS (SELECT 1 FROM object_sustainability_action osa WHERE osa.object_id=o.id AND osa.action_id=sa.id);

-- =====================================================
-- COMPREHENSIVE EXTERNAL IDS
-- =====================================================

-- External IDs for integration testing
INSERT INTO object_external_id (object_id, organization_object_id, external_id, last_synced_at, created_at, updated_at)
SELECT o.id, oti.id, 'EXT_' || o.id, NOW(), NOW(), NOW()
FROM object o
JOIN object oti ON oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
WHERE o.region_code='TST' AND o.object_type IN ('PCU','PNA','VIL','HPA','ASC','COM','HLO','LOI','FMA','CAMP','ITI')
  AND NOT EXISTS (SELECT 1 FROM object_external_id oei WHERE oei.object_id=o.id AND oei.organization_object_id=oti.id);

-- =====================================================
-- COMPREHENSIVE ORIGIN DATA
-- =====================================================

-- Origin data for all objects
INSERT INTO object_origin (object_id, source_system, source_object_id, import_batch_id, first_imported_at, created_at, updated_at)
SELECT o.id, 'test_system', 'TEST_' || o.id, uuid_generate_v4(), NOW(), NOW(), NOW()
FROM object o
WHERE o.region_code='TST' AND o.object_type IN ('PCU','PNA','VIL','HPA','ASC','COM','HLO','LOI','FMA','CAMP','ITI')
  AND NOT EXISTS (SELECT 1 FROM object_origin oo WHERE oo.object_id=o.id);

-- =====================================================
-- COMPREHENSIVE ZONE DATA
-- =====================================================

-- Zone data for all objects
INSERT INTO object_zone (object_id, insee_commune, position, created_at, updated_at)
SELECT o.id, '97430', 1, NOW(), NOW()
FROM object o
WHERE o.region_code='TST' AND o.object_type IN ('PCU','PNA','VIL','HPA','ASC','COM','HLO','LOI','FMA','CAMP','ITI')
  AND NOT EXISTS (SELECT 1 FROM object_zone oz WHERE oz.object_id=o.id);

-- =====================================================
-- COMPREHENSIVE PLACE DATA
-- =====================================================

-- Place data for all objects
INSERT INTO object_place (object_id, label, slug, is_primary, created_at, updated_at)
SELECT o.id, 'Lieu principal', lower(replace(o.name, ' ', '-')), TRUE, NOW(), NOW()
FROM object o
WHERE o.region_code='TST' AND o.object_type IN ('PCU','PNA','VIL','HPA','ASC','COM','HLO','LOI','FMA','CAMP','ITI')
  AND NOT EXISTS (SELECT 1 FROM object_place op WHERE op.object_id=o.id AND op.is_primary IS TRUE);

-- =====================================================
-- COMPREHENSIVE PRIVATE DESCRIPTIONS
-- =====================================================

-- Private descriptions for all objects
INSERT INTO object_private_description (object_id, org_object_id, body, audience, language_id, created_at, updated_at)
SELECT o.id, oti.id, 'Note privée pour ' || o.name || ' - données de test', 'private', (SELECT id FROM ref_language WHERE code = 'fr' LIMIT 1), NOW(), NOW()
FROM object o
JOIN object oti ON oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
WHERE o.region_code='TST' AND o.object_type IN ('PCU','PNA','VIL','HPA','ASC','COM','HLO','LOI','FMA','CAMP','ITI')
  AND NOT EXISTS (SELECT 1 FROM object_private_description opd WHERE opd.object_id=o.id AND opd.org_object_id=oti.id);

-- =====================================================
-- COMPREHENSIVE RELATIONSHIPS
-- =====================================================

-- Object relationships
INSERT INTO object_relation (source_object_id, target_object_id, relation_type_id, distance_m, created_at, updated_at)
SELECT res.id, hot.id, rt.id, 0.0, NOW(), NOW()
FROM object res, object hot, ref_object_relation_type rt
WHERE res.object_type='RES' AND res.region_code='TST' AND res.name='Restaurant Test Océan'
  AND hot.object_type='HOT' AND hot.region_code='TST' AND hot.name='Hôtel Test Océan'
  AND rt.code='part_of'
  AND NOT EXISTS (SELECT 1 FROM object_relation r WHERE r.source_object_id=res.id AND r.target_object_id=hot.id AND r.relation_type_id=rt.id);

-- =====================================================
-- COMPREHENSIVE ACTOR ROLES
-- =====================================================

-- Actor roles for all objects
INSERT INTO actor_object_role (actor_id, object_id, role_id, is_primary, visibility, created_at, updated_at)
SELECT a.id, o.id, r.id, TRUE, 'public', NOW(), NOW()
FROM actor a, object o, ref_actor_role r
WHERE a.display_name='Alice MARTIN'
  AND o.region_code='TST' AND o.object_type IN ('PCU','PNA','VIL','HPA','ASC','COM','HLO','LOI','FMA','CAMP','ITI')
  AND r.code='manager'
  AND NOT EXISTS (SELECT 1 FROM actor_object_role aor WHERE aor.actor_id=a.id AND aor.object_id=o.id AND aor.role_id=r.id);

-- =====================================================
-- COMPREHENSIVE PRICE PERIODS
-- =====================================================

-- Price periods for seasonal pricing
INSERT INTO object_price_period (price_id, start_date, end_date, start_time, end_time, created_at, updated_at)
SELECT p.id, DATE '2025-07-01', DATE '2025-08-31', TIME '00:00', TIME '23:59', NOW(), NOW()
FROM object_price p
JOIN object o ON o.id=p.object_id
WHERE o.region_code='TST' AND o.object_type IN ('HPA','HLO','CAMP')
  AND NOT EXISTS (SELECT 1 FROM object_price_period opp WHERE opp.price_id=p.id AND opp.start_date=DATE '2025-07-01');

-- =====================================================
-- COMPREHENSIVE ITINERARY TRACKS
-- =====================================================

-- Itinerary track data using object_iti_section with PostGIS geography
INSERT INTO object_iti_section (parent_object_id, name, position, geom, created_at, updated_at)
SELECT o.id, 'Parcours principal', 1, 
  ST_GeogFromText('LINESTRING(55.4700 -21.1300, 55.4800 -21.1200, 55.4900 -21.1100)'), 
  NOW(), NOW()
FROM object o
WHERE o.object_type='ITI' AND o.region_code='TST' AND o.name='Randonnée Piton des Neiges'
  AND NOT EXISTS (SELECT 1 FROM object_iti_section ois WHERE ois.parent_object_id=o.id AND ois.name='Parcours principal');

-- =====================================================
-- COMPREHENSIVE EVENT OCCURRENCES
-- =====================================================

-- Additional event occurrences
INSERT INTO object_fma_occurrence (object_id, start_at, end_at, state, created_at, updated_at)
SELECT o.id, TIMESTAMPTZ '2025-12-16 18:00:00+04', TIMESTAMPTZ '2025-12-16 23:00:00+04', 'confirmed', NOW(), NOW()
FROM object o
WHERE o.object_type='FMA' AND o.region_code='TST' AND o.name='Festival Créole Test'
  AND NOT EXISTS (SELECT 1 FROM object_fma_occurrence ofo WHERE ofo.object_id=o.id AND ofo.start_at=TIMESTAMPTZ '2025-12-16 18:00:00+04');

-- =====================================================
-- COMPREHENSIVE MENU DATA
-- =====================================================

-- Additional menus for Restaurant Test Océan
INSERT INTO object_menu (object_id, name, created_at, updated_at)
SELECT res.id, 'Menu Dîner', NOW(), NOW()
FROM object res WHERE res.object_type='RES' AND res.name='Restaurant Test Océan' AND res.region_code='TST'
  AND NOT EXISTS (SELECT 1 FROM object_menu m WHERE m.object_id=res.id AND m.name='Menu Dîner');

INSERT INTO object_menu (object_id, name, created_at, updated_at)
SELECT res.id, 'Menu Enfant', NOW(), NOW()
FROM object res WHERE res.object_type='RES' AND res.name='Restaurant Test Océan' AND res.region_code='TST'
  AND NOT EXISTS (SELECT 1 FROM object_menu m WHERE m.object_id=res.id AND m.name='Menu Enfant');

-- Menu items for Menu Dîner
INSERT INTO object_menu_item (menu_id, name, price, currency, position, created_at, updated_at)
SELECT m.id, 'Cari de poulet', 24.00, 'EUR', 1, NOW(), NOW()
FROM object_menu m
JOIN object res ON res.id=m.object_id AND res.object_type='RES' AND res.name='Restaurant Test Océan' AND res.region_code='TST'
WHERE m.name='Menu Dîner'
  AND NOT EXISTS (SELECT 1 FROM object_menu_item mi WHERE mi.menu_id=m.id AND mi.name='Cari de poulet');

INSERT INTO object_menu_item (menu_id, name, price, currency, position, created_at, updated_at)
SELECT m.id, 'Rougail tomates', 18.00, 'EUR', 2, NOW(), NOW()
FROM object_menu m
JOIN object res ON res.id=m.object_id AND res.object_type='RES' AND res.name='Restaurant Test Océan' AND res.region_code='TST'
WHERE m.name='Menu Dîner'
  AND NOT EXISTS (SELECT 1 FROM object_menu_item mi WHERE mi.menu_id=m.id AND mi.name='Rougail tomates');

-- Menu items for Menu Enfant
INSERT INTO object_menu_item (menu_id, name, price, currency, position, created_at, updated_at)
SELECT m.id, 'Nuggets de poulet', 12.00, 'EUR', 1, NOW(), NOW()
FROM object_menu m
JOIN object res ON res.id=m.object_id AND res.object_type='RES' AND res.name='Restaurant Test Océan' AND res.region_code='TST'
WHERE m.name='Menu Enfant'
  AND NOT EXISTS (SELECT 1 FROM object_menu_item mi WHERE mi.menu_id=m.id AND mi.name='Nuggets de poulet');

INSERT INTO object_menu_item (menu_id, name, price, currency, position, created_at, updated_at)
SELECT m.id, 'Frites', 8.00, 'EUR', 2, NOW(), NOW()
FROM object_menu m
JOIN object res ON res.id=m.object_id AND res.object_type='RES' AND res.name='Restaurant Test Océan' AND res.region_code='TST'
WHERE m.name='Menu Enfant'
  AND NOT EXISTS (SELECT 1 FROM object_menu_item mi WHERE mi.menu_id=m.id AND mi.name='Frites');

-- Note: Menu items get their category through the menu's category_id, not through a separate relationship table
-- The menu structure is: object_menu (has category_id) -> object_menu_item (belongs to menu_id)
-- Additional classifications are handled through object_menu_item_dietary_tag, object_menu_item_allergen, etc.

-- Menu item dietary tags
INSERT INTO object_menu_item_dietary_tag (menu_item_id, dietary_tag_id, created_at)
SELECT mi.id, dt.id, NOW()
FROM object_menu_item mi
JOIN object_menu m ON m.id=mi.menu_id
JOIN object res ON res.id=m.object_id AND res.object_type='RES' AND res.name='Restaurant Test Océan' AND res.region_code='TST'
JOIN ref_code_dietary_tag dt ON dt.code='local'
WHERE mi.name IN ('Cari de poulet','Rougail tomates')
  AND NOT EXISTS (SELECT 1 FROM object_menu_item_dietary_tag midt WHERE midt.menu_item_id=mi.id AND midt.dietary_tag_id=dt.id);

-- =====================================================
-- COMPREHENSIVE VALIDATION QUERIES
-- =====================================================

-- Validation query to ensure all API functions work
DO $$
DECLARE
    object_count INTEGER;
    api_test_result BOOLEAN;
    legal_test_result BOOLEAN;
    crm_test_result BOOLEAN;
BEGIN
    -- Count all test objects
    SELECT COUNT(*) INTO object_count FROM object WHERE region_code = 'TST';
    
    -- Test API functions
    SELECT api.is_object_open_now((SELECT id FROM object WHERE region_code='TST' AND object_type='HOT' LIMIT 1)) INTO api_test_result;
    
    -- Test legal functions
    SELECT COUNT(*) > 0 INTO legal_test_result FROM api.get_object_legal_records((SELECT id FROM object WHERE region_code='TST' AND object_type='HOT' LIMIT 1));
    
    -- Test CRM functions
    SELECT COUNT(*) > 0 INTO crm_test_result FROM crm_interaction WHERE object_id IN (SELECT id FROM object WHERE region_code='TST');
    
    RAISE NOTICE '=== COMPREHENSIVE SEED DATA VALIDATION ===';
    RAISE NOTICE 'Total test objects created: %', object_count;
    RAISE NOTICE 'API functions working: %', api_test_result;
    RAISE NOTICE 'Legal system working: %', legal_test_result;
    RAISE NOTICE 'CRM system working: %', crm_test_result;
    RAISE NOTICE '✓ Comprehensive seed data successfully created and validated';
END $$;

-- =====================================================
-- FINAL STATISTICS
-- =====================================================

DO $$
DECLARE
    total_objects INTEGER;
    total_media INTEGER;
    total_legal_records INTEGER;
    total_crm_interactions INTEGER;
    total_prices INTEGER;
    total_amenities INTEGER;
    total_capacities INTEGER;
    total_contacts INTEGER;
    total_languages INTEGER;
    total_payment_methods INTEGER;
    total_environment_tags INTEGER;
    total_classifications INTEGER;
    total_sustainability_actions INTEGER;
    total_relationships INTEGER;
    total_actor_roles INTEGER;
    total_menus INTEGER;
    total_menu_items INTEGER;
BEGIN
    -- Count all data
    SELECT COUNT(*) INTO total_objects FROM object WHERE region_code = 'TST';
    SELECT COUNT(*) INTO total_media FROM media WHERE object_id IN (SELECT id FROM object WHERE region_code = 'TST');
    SELECT COUNT(*) INTO total_legal_records FROM object_legal WHERE object_id IN (SELECT id FROM object WHERE region_code = 'TST');
    SELECT COUNT(*) INTO total_crm_interactions FROM crm_interaction WHERE object_id IN (SELECT id FROM object WHERE region_code = 'TST');
    SELECT COUNT(*) INTO total_prices FROM object_price WHERE object_id IN (SELECT id FROM object WHERE region_code = 'TST');
    SELECT COUNT(*) INTO total_amenities FROM object_amenity WHERE object_id IN (SELECT id FROM object WHERE region_code = 'TST');
    SELECT COUNT(*) INTO total_capacities FROM object_capacity WHERE object_id IN (SELECT id FROM object WHERE region_code = 'TST');
    SELECT COUNT(*) INTO total_contacts FROM contact_channel WHERE object_id IN (SELECT id FROM object WHERE region_code = 'TST');
    SELECT COUNT(*) INTO total_languages FROM object_language WHERE object_id IN (SELECT id FROM object WHERE region_code = 'TST');
    SELECT COUNT(*) INTO total_payment_methods FROM object_payment_method WHERE object_id IN (SELECT id FROM object WHERE region_code = 'TST');
    SELECT COUNT(*) INTO total_environment_tags FROM object_environment_tag WHERE object_id IN (SELECT id FROM object WHERE region_code = 'TST');
    SELECT COUNT(*) INTO total_classifications FROM object_classification WHERE object_id IN (SELECT id FROM object WHERE region_code = 'TST');
    SELECT COUNT(*) INTO total_sustainability_actions FROM object_sustainability_action WHERE object_id IN (SELECT id FROM object WHERE region_code = 'TST');
    SELECT COUNT(*) INTO total_relationships FROM object_relation WHERE source_object_id IN (SELECT id FROM object WHERE region_code = 'TST');
    SELECT COUNT(*) INTO total_actor_roles FROM actor_object_role WHERE object_id IN (SELECT id FROM object WHERE region_code = 'TST');
    SELECT COUNT(*) INTO total_menus FROM object_menu WHERE object_id IN (SELECT id FROM object WHERE region_code = 'TST');
    SELECT COUNT(*) INTO total_menu_items FROM object_menu_item WHERE menu_id IN (SELECT id FROM object_menu WHERE object_id IN (SELECT id FROM object WHERE region_code = 'TST'));
    
    RAISE NOTICE '=== COMPREHENSIVE SEED DATA STATISTICS ===';
    RAISE NOTICE 'Objects: %', total_objects;
    RAISE NOTICE 'Media: %', total_media;
    RAISE NOTICE 'Legal records: %', total_legal_records;
    RAISE NOTICE 'CRM interactions: %', total_crm_interactions;
    RAISE NOTICE 'Prices: %', total_prices;
    RAISE NOTICE 'Amenities: %', total_amenities;
    RAISE NOTICE 'Capacities: %', total_capacities;
    RAISE NOTICE 'Contacts: %', total_contacts;
    RAISE NOTICE 'Languages: %', total_languages;
    RAISE NOTICE 'Payment methods: %', total_payment_methods;
    RAISE NOTICE 'Environment tags: %', total_environment_tags;
    RAISE NOTICE 'Classifications: %', total_classifications;
    RAISE NOTICE 'Sustainability actions: %', total_sustainability_actions;
    RAISE NOTICE 'Relationships: %', total_relationships;
    RAISE NOTICE 'Actor roles: %', total_actor_roles;
    RAISE NOTICE 'Menus: %', total_menus;
    RAISE NOTICE 'Menu items: %', total_menu_items;
    RAISE NOTICE '✓ All use cases covered with comprehensive test data';
END $$;





-- =====================================================
-- 999. TRANSLATIONS (EN & ES)
-- =====================================================

-- ref_code translations (contact, social, schedule, media)
WITH ref_code_translations(domain, code, name_en, name_es, description_en, description_es) AS (
  VALUES
    ('contact_kind','phone','Phone','Teléfono','Front desk landline number','Número de teléfono fijo de recepción'),
    ('contact_kind','mobile','Mobile','Móvil','Mobile number for contacting the property','Número de móvil para contactar el establecimiento'),
    ('contact_kind','fax','Fax','Fax','Reception fax number','Número de fax de recepción'),
    ('contact_kind','email','Email','Correo electrónico','Primary email address','Dirección de correo electrónico principal'),
    ('contact_kind','website','Website','Sitio web','Official website URL','URL del sitio oficial'),
    ('contact_kind','booking_engine','Booking engine','Motor de reservas','Link to an online booking engine','Enlace a un motor de reservas en línea'),
    ('contact_kind','whatsapp','WhatsApp','WhatsApp','WhatsApp Business contact','Contacto de WhatsApp Business'),
    ('contact_kind','messenger','Messenger','Messenger','Facebook Messenger link','Enlace de Facebook Messenger'),
    ('contact_kind','sms','SMS','SMS','Number dedicated to SMS','Número dedicado a SMS'),
    ('contact_kind','skype','Skype','Skype','Skype ID','Identificador de Skype'),
    ('contact_kind','wechat','WeChat','WeChat','WeChat ID for Asian clientele','Identificador de WeChat para la clientela asiática'),
    ('contact_kind','line','LINE','LINE','LINE ID','Identificador de LINE'),
    ('contact_kind','viber','Viber','Viber','Viber contact','Contacto de Viber'),
    ('contact_kind','telegram','Telegram','Telegram','Telegram account for notifications','Cuenta de Telegram para notificaciones'),
    ('social_network','facebook','Facebook','Facebook','Official Facebook page','Página oficial de Facebook'),
    ('social_network','instagram','Instagram','Instagram','Instagram profile','Perfil de Instagram'),
    ('social_network','youtube','YouTube','YouTube','Destination YouTube channel','Canal de YouTube del destino'),
    ('social_network','tiktok','TikTok','TikTok','TikTok account for short-form content','Cuenta de TikTok para contenidos cortos'),
    ('social_network','pinterest','Pinterest','Pinterest','Pinterest inspiration boards','Tableros de inspiración en Pinterest'),
    ('social_network','linkedin','LinkedIn','LinkedIn','Professional LinkedIn page','Página profesional de LinkedIn'),
    ('social_network','twitter','X (Twitter)','X (Twitter)','X / Twitter account','Cuenta de X / Twitter'),
    ('social_network','tripadvisor','Tripadvisor','Tripadvisor','Tripadvisor listing','Ficha de Tripadvisor'),
    ('social_network','booking','Booking.com','Booking.com','Booking.com profile','Perfil en Booking.com'),
    ('social_network','google_business','Google Business Profile','Google Business Profile','Google Business Profile listing','Ficha de Google Business Profile'),
    ('social_network','wechat','WeChat','WeChat','Messaging and social network','Mensajería y red social'),
    ('social_network','line','LINE','LINE','Messaging and social network','Mensajería y red social'),
    ('weekday','monday','Monday','Lunes',NULL,NULL),
    ('weekday','tuesday','Tuesday','Martes',NULL,NULL),
    ('weekday','wednesday','Wednesday','Miércoles',NULL,NULL),
    ('weekday','thursday','Thursday','Jueves',NULL,NULL),
    ('weekday','friday','Friday','Viernes',NULL,NULL),
    ('weekday','saturday','Saturday','Sábado',NULL,NULL),
    ('weekday','sunday','Sunday','Domingo',NULL,NULL),
    ('opening_schedule_type','regular','Regular','Regular','Standard recurring schedule','Horario recurrente estándar'),
    ('opening_schedule_type','seasonal','Seasonal','Estacional','Schedule for seasonal periods','Horario para períodos estacionales'),
    ('opening_schedule_type','exceptional','Exceptional','Excepcional','Exceptional or special opening schedule','Horario excepcional o especial'),
    ('opening_schedule_type','by_appointment','By appointment','Con cita previa','Open only by appointment','Apertura solo con cita previa'),
    ('opening_schedule_type','continuous_service','Continuous service','Servicio continuo','Open continuously without closing','Abierto de forma continua sin cierre'),
    ('media_type','photo','Photo','Foto','Official photographs','Fotografías oficiales'),
    ('media_type','video','Video','Vídeo','Presentation videos','Vídeos de presentación'),
    ('media_type','audio','Audio','Audio','Audio files and podcasts','Archivos de audio y pódcasts'),
    ('media_type','brochure_pdf','PDF brochure','Folleto PDF','Downloadable brochures','Folletos descargables'),
    ('media_type','brochure_print','Printed brochure','Folleto impreso','Digitised printed brochures','Folletos impresos digitalizados'),
    ('media_type','plan','Map','Plano','Static map or plan','Plano o mapa estático'),
    ('media_type','virtual_tour','Virtual tour','Visita virtual','360° or immersive virtual tours','Visitas virtuales 360° o inmersivas'),
    ('media_type','webcam','Webcam','Webcam','Live webcam feed','Transmisión en vivo de webcam'),
    ('media_type','logo','Logo','Logotipo','Official logos','Logotipos oficiales'),
    ('media_type','press_kit','Press kit','Dossier de prensa','Media kits and press releases','Dossiers de prensa y comunicados'),
    ('media_type','vector','Vector','Vectorial','Vector files (SVG, PDF)','Archivos vectoriales (SVG, PDF)')
)
UPDATE ref_code rc
SET name_i18n = COALESCE(rc.name_i18n, '{}'::jsonb) || jsonb_build_object('en', rct.name_en, 'es', rct.name_es),
    description_i18n = CASE
      WHEN rct.description_en IS NULL AND rct.description_es IS NULL THEN rc.description_i18n
      ELSE COALESCE(rc.description_i18n, '{}'::jsonb) || COALESCE(jsonb_strip_nulls(jsonb_build_object('en', rct.description_en, 'es', rct.description_es)), '{}'::jsonb)
    END
FROM ref_code_translations rct
WHERE rc.domain = rct.domain AND rc.code = rct.code;

-- ref_code translations (language, family, payment, environment)
WITH ref_code_translations(domain, code, name_en, name_es, description_en, description_es) AS (
  VALUES
    ('language_level','a1','A1 - Beginner','A1 - Principiante','Basic notions','Nociones básicas'),
    ('language_level','a2','A2 - Elementary','A2 - Elemental','Simple communication','Comunicación sencilla'),
    ('language_level','b1','B1 - Intermediate','B1 - Intermedio','Everyday interaction','Interacción cotidiana'),
    ('language_level','b2','B2 - Upper intermediate','B2 - Intermedio avanzado','Advanced everyday communication','Comunicación profesional habitual'),
    ('language_level','c1','C1 - Advanced','C1 - Avanzado','Full operational proficiency','Dominio operativo completo'),
    ('language_level','c2','C2 - Proficient','C2 - Experto','Expert mastery of the language','Dominio experto de la lengua'),
    ('language_level','native','Native language','Lengua materna','Language spoken fluently by the team','Lengua hablada con fluidez por el equipo'),
    ('amenity_family','comforts','Comforts','Confort','Comfort items in rooms and shared areas','Elementos de confort en habitaciones y zonas comunes'),
    ('amenity_family','services','Services','Servicios','General services offered to guests','Servicios generales ofrecidos a los clientes'),
    ('amenity_family','equipment','Equipment','Equipamiento','Available equipment and appliances','Equipos y dispositivos disponibles'),
    ('amenity_family','wellness','Wellness','Bienestar','Wellness and spa facilities','Instalaciones de bienestar y spa'),
    ('amenity_family','business','Business','Negocios','Business-oriented services','Servicios para clientes corporativos'),
    ('amenity_family','family','Family','Familia','Family and children services','Servicios y equipamientos para familias y niños'),
    ('amenity_family','outdoor','Outdoor','Exterior','Outdoor equipment and activities','Equipamientos y actividades al aire libre'),
    ('amenity_family','gastronomy','Gastronomy','Gastronomía','Food and beverage offerings','Prestaciones de restauración y bar'),
    ('amenity_family','accessibility','Accessibility','Accesibilidad','Accessibility features for reduced mobility','Dispositivos que facilitan el acceso PMR'),
    ('amenity_family','sustainable','Sustainable development','Desarrollo sostenible','Responsible initiatives and equipment','Iniciativas y equipamientos responsables'),
    ('payment_method','especes','Cash','Efectivo','Cash payment','Pago en efectivo'),
    ('payment_method','cheque','Cheque','Cheque','Cheque payment','Pago con cheque'),
    ('payment_method','cheque_vacances','Holiday vouchers','Cheques vacaciones','ANCV holiday vouchers accepted','Cheques vacaciones ANCV aceptados'),
    ('payment_method','carte_bleue','Carte Bleue','Carte Bleue','French Carte Bleue card','Tarjeta francesa Carte Bleue'),
    ('payment_method','visa','Visa','Visa','Visa card accepted','Tarjeta Visa aceptada'),
    ('payment_method','mastercard','Mastercard','Mastercard','Mastercard accepted','Tarjeta Mastercard aceptada'),
    ('payment_method','american_express','American Express','American Express','American Express accepted','Tarjeta American Express aceptada'),
    ('payment_method','maestro','Maestro','Maestro','Maestro / debit card accepted','Tarjeta Maestro / débito aceptada'),
    ('payment_method','virement','Bank transfer','Transferencia bancaria','Bank transfer payment','Pago por transferencia bancaria'),
    ('payment_method','paypal','PayPal','PayPal','PayPal payment','Pago vía PayPal'),
    ('payment_method','apple_pay','Apple Pay','Apple Pay','Apple Pay contactless payment','Pago sin contacto con Apple Pay'),
    ('payment_method','google_pay','Google Pay','Google Pay','Google Pay contactless payment','Pago sin contacto con Google Pay'),
    ('payment_method','vacaf','VACAF','VACAF','VACAF aid accepted','Ayuda VACAF aceptada'),
    ('payment_method','crypto','Cryptocurrency','Criptomonedas','Payment in accepted cryptocurrencies','Pago con criptomonedas aceptadas'),
    ('environment_tag','volcan','At the foot of the volcano','Al pie del volcán','Located at the foot of Piton de la Fournaise','Situado al pie del Piton de la Fournaise'),
    ('environment_tag','plage','Beach','Playa','Near a beach','Cerca de una playa'),
    ('environment_tag','lagon','Lagoon','Laguna','Near the lagoon','Cerca de la laguna'),
    ('environment_tag','cascade','Waterfall','Cascada','Near a waterfall','Cerca de una cascada'),
    ('environment_tag','jardin','Garden','Jardín','With landscaped garden','Con jardín paisajístico'),
    ('environment_tag','terrasse','Terrace','Terraza','With furnished terrace','Con terraza amueblada'),
    ('environment_tag','vue_panoramique','Panoramic view','Vista panorámica','Exceptional panoramic view','Vista panorámica excepcional'),
    ('environment_tag','calme','Quiet','Tranquilo','Peaceful environment','Entorno tranquilo'),
    ('environment_tag','anime','Lively','Animado','Lively neighbourhood','Barrio animado'),
    ('environment_tag','bord_mer','Seafront','Frente al mar','Facing the shoreline','Frente al litoral'),
    ('environment_tag','front_de_mer','Waterfront','Paseo marítimo','Located on the waterfront','Situado en el paseo marítimo'),
    ('environment_tag','ville','In town','En la ciudad','Town centre location','Ubicación en la ciudad'),
    ('environment_tag','centre_ville','City centre','Centro de la ciudad','Historic city centre','Centro urbano histórico'),
    ('environment_tag','montagne','Mountain','Montaña','Mountain area','Zona montañosa'),
    ('environment_tag','campagne','Countryside','Campo','Rural countryside setting','Entorno campestre'),
    ('environment_tag','foret','Forest','Bosque','At the edge of a forest','En las afueras de un bosque'),
    ('environment_tag','parc_national','National park','Parque nacional','Within a national park','Dentro de un parque nacional'),
    ('environment_tag','parc_marin','Marine park','Parque marino','Protected marine area','Zona marina protegida'),
    ('environment_tag','rural','Rural','Rural','Village or rural hamlet','Pueblo o caserío rural'),
    ('environment_tag','vignoble','Vineyard','Viñedo','In the heart of a vineyard','En el corazón de un viñedo'),
    ('environment_tag','thermal','Thermal resort','Balneario','Near a thermal spa','Cerca de un balneario'),
    ('environment_tag','port','Harbour','Puerto','Harbour view or access','Vista o acceso al puerto'),
    ('environment_tag','ile','Island','Isla','Located on an island','Situado en una isla'),
    ('environment_tag','patrimoine','Heritage site','Sitio patrimonial','UNESCO listed area or heritage site','Zona clasificada o sitio patrimonial'),
    ('environment_tag','quartier_historique','Historic district','Barrio histórico','Preserved historic centre','Centro histórico preservado'),
    ('environment_tag','urbain_creatif','Creative district','Barrio creativo','Artistic or creative district','Barrio artístico o creativo'),
    ('environment_tag','desert','Desert','Desierto','Desert landscape','Paisaje desértico'),
    ('environment_tag','neige','Snow','Nieve','Snow destination in winter','Destino nevado en invierno'),
    ('environment_tag','littoral_sauvage','Wild coastline','Litoral salvaje','Wild, unspoiled coastline','Costa salvaje y preservada')
)
UPDATE ref_code rc
SET name_i18n = COALESCE(rc.name_i18n, '{}'::jsonb) || jsonb_build_object('en', rct.name_en, 'es', rct.name_es),
    description_i18n = CASE
      WHEN rct.description_en IS NULL AND rct.description_es IS NULL THEN rc.description_i18n
      ELSE COALESCE(rc.description_i18n, '{}'::jsonb) || COALESCE(jsonb_strip_nulls(jsonb_build_object('en', rct.description_en, 'es', rct.description_es)), '{}'::jsonb)
    END
FROM ref_code_translations rct
WHERE rc.domain = rct.domain AND rc.code = rct.code;

-- ref_code translations (pricing, equipment, itinerary)
WITH ref_code_translations(domain, code, name_en, name_es, description_en, description_es) AS (
  VALUES
    ('price_kind','adulte','Adult','Adulto','Full adult rate','Tarifa completa adulto'),
    ('price_kind','enfant','Child','Niño','Child rate','Tarifa infantil'),
    ('price_kind','senior','Senior','Senior','Senior rate','Tarifa senior'),
    ('price_kind','etudiant','Student','Estudiante','Student rate','Tarifa estudiante'),
    ('price_kind','famille','Family','Familia','Family package','Paquete familiar'),
    ('price_kind','groupe','Group','Grupo','Group rate','Tarifa para grupos'),
    ('price_kind','couple','Couple','Pareja','Rate for two guests','Tarifa para dos personas'),
    ('price_kind','personne_handicapee','Guest with disabilities','Persona con discapacidad','Reduced rate for guests with disabilities','Tarifa reducida para PMR'),
    ('price_kind','resident','Resident','Residente','Local resident rate','Tarifa para residentes'),
    ('price_kind','gratuit','Free','Gratuito','Free access','Acceso gratuito'),
    ('price_unit','par_personne','Per person','Por persona','Price expressed per person','Precio expresado por persona'),
    ('price_unit','par_nuit','Per night','Por noche','Nightly rate','Tarifa por noche'),
    ('price_unit','par_jour','Per day','Por día','Daily rate','Tarifa diaria'),
    ('price_unit','par_semaine','Per week','Por semana','Weekly package','Paquete semanal'),
    ('price_unit','par_mois','Per month','Por mes','Monthly package','Paquete mensual'),
    ('price_unit','par_sejour','Per stay','Por estancia','Rate for the entire stay','Tarifa para toda la estancia'),
    ('price_unit','par_groupe','Per group','Por grupo','Rate for a defined group','Tarifa para un grupo definido'),
    ('price_unit','par_forfait','Per package','Por paquete','Flat package rate','Tarifa forfait'),
    ('price_unit','par_heure','Per hour','Por hora','Hourly rate','Tarifa por hora'),
    ('price_unit','par_personne_nuit','Per person per night','Por persona y noche','Combined person/night rate','Tarifa combinada persona/noche'),
    ('meeting_equipment','paperboard','Flipchart','Papelógrafo','Flipchart with markers','Papelógrafo con rotuladores'),
    ('meeting_equipment','ecran','Screen','Pantalla','Projection screen','Pantalla de proyección'),
    ('meeting_equipment','videoprojecteur','Video projector','Proyector','Multimedia projector','Proyector multimedia'),
    ('meeting_equipment','sonorisation','Sound system','Sonorización','Audio sound system','Sistema de sonido'),
    ('meeting_equipment','micro','Microphone','Micrófono','Wireless or wired microphones','Micrófonos inalámbricos o con cable'),
    ('meeting_equipment','wifi','Wi-Fi','Wi-Fi','High-speed Wi-Fi connection','Conexión Wi-Fi de alta velocidad'),
    ('meeting_equipment','visioconference','Video conferencing','Videoconferencia','Video conferencing system','Sistema de videoconferencia'),
    ('meeting_equipment','scene','Stage','Escenario','Stage or platform','Escenario o tarima'),
    ('meeting_equipment','lumieres','Lighting','Iluminación','Stage lighting','Iluminación escénica'),
    ('meeting_equipment','pupitre','Lectern','Atril','Speaker lectern','Atril para oradores'),
    ('meeting_equipment','traduction','Interpretation booth','Cabina de traducción','Simultaneous interpretation booth','Cabina de interpretación simultánea'),
    ('iti_practice','randonnee_pedestre','Hiking','Senderismo','Classic hiking route','Itinerario de senderismo clásico'),
    ('iti_practice','trail','Trail running','Trail running','Trail running course','Recorrido de trail running'),
    ('iti_practice','velo_route','Road cycling','Ciclismo de ruta','Road cycling itinerary','Itinerario de ciclismo en carretera'),
    ('iti_practice','velo_vtt','Mountain biking','BTT','Mountain bike trail','Ruta de bicicleta de montaña'),
    ('iti_practice','cyclotourisme','Cyclotourism','Cicloturismo','Leisure cycling tour','Paseo cicloturista'),
    ('iti_practice','equestre','Horseback riding','Ecuestre','Horse riding route','Recorrido a caballo'),
    ('iti_practice','kayak','Kayak / canoe','Kayak / canoa','Water itinerary by kayak or canoe','Recorrido acuático en kayak o canoa'),
    ('iti_practice','plongee','Scuba diving','Buceo','Scuba diving site','Sitio de buceo'),
    ('iti_practice','snorkeling','Snorkelling','Snorkel','Snorkelling route','Recorrido de snorkel'),
    ('iti_practice','voile','Sailing','Vela','Sailing itinerary','Itinerario de navegación a vela'),
    ('iti_practice','raquette','Snowshoeing','Raquetas de nieve','Winter snowshoe route','Ruta invernal con raquetas'),
    ('iti_practice','ski','Skiing','Esquí','Ski area','Dominio esquiable'),
    ('iti_practice','escalade','Climbing','Escalada','Climbing site','Zona de escalada'),
    ('iti_practice','canyoning','Canyoning','Barranquismo','Canyon descent itinerary','Itinerario de descenso de barrancos'),
    ('iti_practice','parapente','Paragliding','Parapente','Free-flight zone','Zona de vuelo libre'),
    ('iti_practice','patrimoine','Heritage discovery','Descubrimiento patrimonial','Heritage and culture circuit','Circuito de patrimonio y cultura')
)
UPDATE ref_code rc
SET name_i18n = COALESCE(rc.name_i18n, '{}'::jsonb) || jsonb_build_object('en', rct.name_en, 'es', rct.name_es),
    description_i18n = CASE
      WHEN rct.description_en IS NULL AND rct.description_es IS NULL THEN rc.description_i18n
      ELSE COALESCE(rc.description_i18n, '{}'::jsonb) || COALESCE(jsonb_strip_nulls(jsonb_build_object('en', rct.description_en, 'es', rct.description_es)), '{}'::jsonb)
    END
FROM ref_code_translations rct
WHERE rc.domain = rct.domain AND rc.code = rct.code;

-- ref_code translations (CRM topics, moods, cuisines, menus)
WITH ref_code_translations(domain, code, name_en, name_es, description_en, description_es) AS (
  VALUES
    ('demand_topic','information','Tourist information','Información turística','General information request','Solicitud de información general'),
    ('demand_topic','reservation','Reservation','Reserva','Availability or booking request','Solicitud de reserva o disponibilidad'),
    ('demand_topic','groupe','Groups','Grupos','Group organisation request','Solicitud para organización de grupos'),
    ('demand_topic','evenement','Events','Eventos','Event organisation or participation','Organización o participación en un evento'),
    ('demand_topic','accessibilite','Accessibility','Accesibilidad','Accessibility and reduced mobility questions','Preguntas sobre accesibilidad y PMR'),
    ('demand_topic','reclamation','Complaint','Reclamación','Complaint or dissatisfaction','Reclamación o insatisfacción'),
    ('demand_topic','presse','Press / influencer','Prensa / influencia','Press or influencer request','Solicitud de prensa o influencers'),
    ('demand_topic','partenariat','Partnership','Colaboración','Partnership proposal','Propuesta de colaboración'),
    ('demand_topic','marketing','Marketing','Marketing','Marketing and promotion campaigns','Campañas de marketing y promoción'),
    ('demand_topic','logistique','Logistics','Logística','Transport, transfers, luggage','Transporte, traslados, equipaje'),
    ('demand_topic','urgence','Emergency','Urgencia','On-site urgent assistance','Asistencia urgente in situ'),
    ('demand_subtopic','information_hebergement','Accommodation information','Información de alojamiento','Accommodation details (topic information)','Información sobre alojamiento (tema información)'),
    ('demand_subtopic','information_restaurants','Dining information','Información de restauración','Restaurant information (topic information)','Información sobre restauración (tema información)'),
    ('demand_subtopic','information_activites','Activities information','Información de actividades','Activities & leisure information (topic information)','Información sobre actividades y ocio (tema información)'),
    ('demand_subtopic','reservation_directe','Direct reservation','Reserva directa','Direct reservation request (topic reservation)','Solicitud de reserva directa (tema reserva)'),
    ('demand_subtopic','reservation_agence','Agency / OTA','Agencia / OTA','Reservation via agency (topic reservation)','Reserva vía agencia (tema reserva)'),
    ('demand_subtopic','groupe_scolaire','School group','Grupo escolar','School group request (topic group)','Solicitud de grupo escolar (tema grupo)'),
    ('demand_subtopic','groupe_affaires','Business seminar','Seminario empresarial','Business group request (topic group)','Solicitud de grupo empresarial (tema grupo)'),
    ('demand_subtopic','evenement_prive','Private event','Evento privado','Private event (topic event)','Evento privado (tema evento)'),
    ('demand_subtopic','evenement_corporate','Corporate event','Evento corporativo','Corporate event (topic event)','Evento corporativo (tema evento)'),
    ('demand_subtopic','accessibilite_moteur','Mobility','Movilidad reducida','Mobility accessibility (topic accessibility)','Accesibilidad motriz (tema accesibilidad)'),
    ('demand_subtopic','accessibilite_sensoriel','Sensory','Sensorial','Sensory accessibility (topic accessibility)','Accesibilidad sensorial (tema accesibilidad)'),
    ('demand_subtopic','reclamation_service','Service quality','Servicio','Service quality complaint (topic complaint)','Queja sobre el servicio (tema reclamación)'),
    ('demand_subtopic','reclamation_facturation','Billing','Facturación','Billing issue (topic complaint)','Problema de facturación (tema reclamación)'),
    ('demand_subtopic','presse_reportage','Press reportage','Reportaje de prensa','Press reportage request (topic press)','Solicitud de reportaje de prensa (tema prensa)'),
    ('demand_subtopic','presse_influence','Influencer collaboration','Colaboración influencer','Influencer collaboration (topic press)','Colaboración con influencer (tema prensa)'),
    ('demand_subtopic','partenariat_office','Institutional partnership','Partenariado institucional','Tourist office partnership (topic partnership)','Colaboración con oficina de turismo (tema colaboración)'),
    ('demand_subtopic','marketing_package','Marketing package','Paquete de marketing','Marketing offer creation (topic marketing)','Creación de oferta de marketing (tema marketing)'),
    ('demand_subtopic','marketing_contenu','Content request','Solicitud de contenido','Visuals or copy request (topic marketing)','Solicitud de recursos gráficos o textos (tema marketing)'),
    ('demand_subtopic','logistique_transport','Transport','Transporte','Shuttle or transfer (topic logistics)','Transporte o traslado (tema logística)'),
    ('demand_subtopic','logistique_bagagerie','Luggage','Equipaje','Luggage handling (topic logistics)','Gestión de equipaje (tema logística)'),
    ('demand_subtopic','urgence_perte','Lost item','Objeto perdido','Lost item assistance (topic emergency)','Asistencia por objeto perdido (tema urgencia)'),
    ('demand_subtopic','urgence_sante','Health emergency','Urgencia sanitaria','Medical assistance (topic emergency)','Asistencia médica (tema urgencia)'),
    ('mood','detente','Relaxation','Relajación','Relaxation and wellness ambiance','Ambiente de relajación y bienestar'),
    ('mood','aventure','Adventure','Aventura','Adventure and thrills ambiance','Ambiente de aventura y sensaciones'),
    ('mood','romantique','Romantic','Romántico','Romantic ambiance','Ambiente romántico'),
    ('mood','famille','Family','Familiar','Family-friendly ambiance','Ambiente familiar'),
    ('mood','festif','Festive','Festivo','Festive or nightlife ambiance','Ambiente festivo o nocturno'),
    ('mood','gourmand','Foodie','Gastronómico','Gastronomic ambiance','Ambiente gastronómico'),
    ('mood','culturel','Cultural','Cultural','Cultural and heritage ambiance','Ambiente cultural y patrimonial'),
    ('mood','bien_etre','Wellness','Bienestar','Wellness and spa ambiance','Ambiente de bienestar y spa'),
    ('mood','sportif','Sporty','Deportivo','Sports and active ambiance','Ambiente deportivo y activo'),
    ('mood','nature','Nature','Naturaleza','Nature and outdoors ambiance','Ambiente de naturaleza y aire libre'),
    ('cuisine_type','creole','Creole','Criolla','Traditional Réunion Creole cuisine','Cocina criolla tradicional de Reunión'),
    ('cuisine_type','metropolitan','Metropolitan French','Francesa metropolitana','French metropolitan cuisine','Cocina francesa metropolitana'),
    ('cuisine_type','traditional','Traditional','Tradicional','Local traditional cuisine','Cocina tradicional de terroir'),
    ('cuisine_type','gourmet','Fine dining','Gastronómica','Gastronomic fine dining','Cocina gastronómica de alta gama'),
    ('cuisine_type','fusion','Fusion','Fusión','Modern Creole fusion cuisine','Cocina fusión créole-moderna'),
    ('cuisine_type','international','International','Internacional','International cuisine','Cocina internacional'),
    ('cuisine_type','fast_food','Fast food','Comida rápida','Fast food options','Opciones de comida rápida'),
    ('cuisine_type','street_food','Street food','Comida callejera','Street food specialties','Especialidades de comida callejera'),
    ('cuisine_type','brasserie','Brasserie','Brasserie','Brasserie and bistronomic cuisine','Cocina brasserie y bistronómica'),
    ('cuisine_type','vegetarienne','Vegetarian','Vegetariana','Vegetarian cuisine','Cocina vegetariana'),
    ('cuisine_type','vegan','Vegan','Vegana','Vegan cuisine','Cocina vegana'),
    ('cuisine_type','italienne','Italian','Italiana','Italian cuisine','Cocina italiana'),
    ('cuisine_type','espagnole','Spanish','Española','Spanish tapas and cuisine','Tapas y cocina española'),
    ('cuisine_type','portugaise','Portuguese','Portuguesa','Portuguese cuisine','Cocina portuguesa'),
    ('cuisine_type','mediterraneenne','Mediterranean','Mediterránea','Mediterranean cuisine','Cocina mediterránea'),
    ('cuisine_type','japonaise','Japanese','Japonesa','Japanese cuisine and sushi','Cocina japonesa y sushi'),
    ('cuisine_type','thai','Thai','Tailandesa','Thai cuisine','Cocina tailandesa'),
    ('cuisine_type','libanaise','Lebanese','Libanesa','Lebanese and Middle Eastern cuisine','Cocina libanesa y de Oriente Medio'),
    ('cuisine_type','marocaine','Moroccan','Marroquí','Cuisine from the Maghreb','Cocina del Magreb'),
    ('cuisine_type','africaine','African','Africana','African cuisine','Cocina africana'),
    ('cuisine_type','antillaise','Caribbean','Antillana','Caribbean cuisine','Cocina caribeña'),
    ('cuisine_type','amerique_latine','Latin American','Latinoamericana','Latin American cuisine','Cocina latinoamericana'),
    ('cuisine_type','bbq','Barbecue','Barbacoa','Barbecue and grilled specialties','Especialidades de parrilla y barbacoa'),
    ('cuisine_type','burger','Burger','Hamburguesas','Burger specialties','Especialidades de hamburguesas'),
    ('cuisine_type','patisserie','Pastry','Pastelería','Tea room and pastries','Salón de té y pastelería'),
    ('cuisine_type','glacier','Ice cream parlor','Heladería','Artisanal ice cream','Helados artesanales'),
    ('cuisine_type','seafood','Seafood','Mariscos','Seafood and fish cuisine','Cocina de mariscos y pescado'),
    ('cuisine_type','indian','Indian','India','Indian and Tamil cuisine','Cocina india y tamil'),
    ('cuisine_type','chinese','Chinese','China','Traditional Chinese cuisine','Cocina china tradicional'),
    ('menu_category','entree','Starters','Entrantes','Starters and appetisers','Entrantes y aperitivos'),
    ('menu_category','main','Main courses','Platos principales','Main courses and specialties','Platos principales y especialidades'),
    ('menu_category','dessert','Desserts','Postres','Desserts and sweets','Postres y dulces'),
    ('menu_category','drinks','Drinks','Bebidas','Beverages and cocktails','Bebidas y cócteles'),
    ('menu_category','snacks','Snacks','Tentempiés','Snacks and light bites','Tentempiés y aperitivos'),
    ('menu_category','petit_dejeuner','Breakfast','Desayuno','Breakfast formulas','Formulas de desayuno'),
    ('menu_category','brunch','Brunch','Brunch','Brunch offers','Ofertas de brunch'),
    ('menu_category','menu_enfant','Kids menu','Menú infantil','Menus for children','Menús para niños'),
    ('menu_category','menu_groupe','Group menu','Menú para grupos','Menus for groups','Menús para grupos'),
    ('menu_category','menu_degustation','Tasting menu','Menú degustación','Gastronomic tasting menus','Menús gastronómicos de degustación')
)
UPDATE ref_code rc
SET name_i18n = COALESCE(rc.name_i18n, '{}'::jsonb) || jsonb_build_object('en', rct.name_en, 'es', rct.name_es),
    description_i18n = CASE
      WHEN rct.description_en IS NULL AND rct.description_es IS NULL THEN rc.description_i18n
      ELSE COALESCE(rc.description_i18n, '{}'::jsonb) || COALESCE(jsonb_strip_nulls(jsonb_build_object('en', rct.description_en, 'es', rct.description_es)), '{}'::jsonb)
    END
FROM ref_code_translations rct
WHERE rc.domain = rct.domain AND rc.code = rct.code;

-- ref_code translations (dietary, allergens, tourism typologies)
WITH ref_code_translations(domain, code, name_en, name_es, description_en, description_es) AS (
  VALUES
    ('dietary_tag','vegetarian','Vegetarian','Vegetariano','No meat or fish','Sin carne ni pescado'),
    ('dietary_tag','vegan','Vegan','Vegano','No animal products','Sin productos de origen animal'),
    ('dietary_tag','halal','Halal','Halal','Complies with Islamic dietary rules','Cumple las normas alimentarias islámicas'),
    ('dietary_tag','kosher','Kosher','Kosher','Complies with Jewish dietary rules','Cumple las normas alimentarias judías'),
    ('dietary_tag','gluten_free','Gluten-free','Sin gluten','Gluten-free preparation','Preparación sin gluten'),
    ('dietary_tag','lactose_free','Lactose-free','Sin lactosa','No dairy products','Sin productos lácteos'),
    ('dietary_tag','sugar_free','No added sugar','Sin azúcar añadido','Low or no added sugar','Poco o nada de azúcar añadido'),
    ('dietary_tag','low_carb','Low carb','Bajo en carbohidratos','Reduced carbohydrate content','Contenido reducido de carbohidratos'),
    ('dietary_tag','pescatarian','Pescatarian','Pescetariano','Includes fish but no meat','Incluye pescado pero no carne'),
    ('dietary_tag','flexitarian','Flexitarian','Flexitariano','Moderate meat consumption','Consumo moderado de carne'),
    ('dietary_tag','organic','Organic','Ecológico','Organic products','Productos ecológicos'),
    ('dietary_tag','local','Local','Local','Local products from La Réunion','Productos locales de La Reunión'),
    ('allergen','gluten','Gluten','Gluten','Contains gluten','Contiene gluten'),
    ('allergen','crustaceans','Crustaceans','Crustáceos','Contains crustaceans','Contiene crustáceos'),
    ('allergen','eggs','Eggs','Huevos','Contains eggs','Contiene huevos'),
    ('allergen','fish','Fish','Pescado','Contains fish','Contiene pescado'),
    ('allergen','peanuts','Peanuts','Cacahuetes','Contains peanuts','Contiene cacahuetes'),
    ('allergen','soy','Soy','Soja','Contains soy','Contiene soja'),
    ('allergen','dairy','Milk','Lácteos','Contains milk','Contiene leche'),
    ('allergen','nuts','Tree nuts','Frutos secos','Contains tree nuts','Contiene frutos secos'),
    ('allergen','celery','Celery','Apio','Contains celery','Contiene apio'),
    ('allergen','mustard','Mustard','Mostaza','Contains mustard','Contiene mostaza'),
    ('allergen','sesame','Sesame','Sésamo','Contains sesame','Contiene sésamo'),
    ('allergen','sulphites','Sulphites','Sulfitos','Contains sulphites','Contiene sulfitos'),
    ('allergen','lupin','Lupin','Altramuces','Contains lupin','Contiene altramuces'),
    ('allergen','molluscs','Molluscs','Moluscos','Contains molluscs','Contiene moluscos'),
    ('accommodation_type','hotel','Hotel','Hotel','Classic hotel','Hotel clásico'),
    ('accommodation_type','boutique_hotel','Boutique hotel','Hotel boutique','Charming boutique hotel','Hotel boutique con encanto'),
    ('accommodation_type','luxury_hotel','Luxury hotel','Hotel de lujo','High-end hotel','Hotel de alta gama'),
    ('accommodation_type','resort','Resort','Resort','Hotel resort complex','Complejo hotelero resort'),
    ('accommodation_type','guesthouse','Bed and breakfast','Casa de huéspedes','Guesthouse accommodation','Casa de huéspedes'),
    ('accommodation_type','gite','Holiday cottage','Gîte','Rural or urban holiday cottage','Gîte rural o urbano'),
    ('accommodation_type','camping','Camping','Camping','Campground','Camping'),
    ('accommodation_type','glamping','Glamping','Glamping','Luxury camping','Camping de lujo'),
    ('accommodation_type','villa','Villa','Villa','Rental villa','Villa de alquiler'),
    ('accommodation_type','apartment','Apartment','Apartamento','Tourist apartment','Apartamento turístico'),
    ('tourism_type','leisure','Leisure tourism','Turismo de ocio','Relaxation and leisure tourism','Turismo de descanso y ocio'),
    ('tourism_type','cultural','Cultural tourism','Turismo cultural','Culture-focused tourism','Turismo enfocado en la cultura'),
    ('tourism_type','business','Business tourism','Turismo de negocios','Professional business travel','Turismo profesional'),
    ('tourism_type','eco','Ecotourism','Ecoturismo','Environmentally responsible tourism','Turismo respetuoso con el medio ambiente'),
    ('tourism_type','adventure','Adventure tourism','Turismo de aventura','Adventure and extreme sports tourism','Turismo de aventura y deportes extremos'),
    ('tourism_type','gastronomy','Gastronomy tourism','Turismo gastronómico','Gastronomy tourism','Turismo gastronómico'),
    ('tourism_type','wellness','Wellness tourism','Turismo de bienestar','Spa and wellness tourism','Turismo de spa y bienestar'),
    ('tourism_type','nature','Nature tourism','Turismo de naturaleza','Nature-focused tourism','Turismo centrado en la naturaleza'),
    ('tourism_type','sports','Sports tourism','Turismo deportivo','Sports tourism','Turismo deportivo'),
    ('tourism_type','rural','Rural tourism','Turismo rural','Rural tourism','Turismo rural'),
    ('transport_type','airplane','Airplane','Avión','Air transportation','Transporte aéreo'),
    ('transport_type','train','Train','Tren','Rail transportation','Transporte ferroviario'),
    ('transport_type','bus','Bus','Autobús','Bus transportation','Transporte en autobús'),
    ('transport_type','car','Car','Coche','Car transportation','Transporte por coche'),
    ('transport_type','ferry','Ferry','Ferri','Ferry transportation','Transporte en ferri'),
    ('transport_type','cruise','Cruise','Crucero','Cruise transportation','Transporte en crucero'),
    ('transport_type','bicycle','Bicycle','Bicicleta','Bicycle transportation','Transporte en bicicleta'),
    ('transport_type','taxi','Taxi','Taxi','Taxi transportation','Transporte en taxi'),
    ('transport_type','helicopter','Helicopter','Helicóptero','Helicopter transportation','Transporte en helicóptero'),
    ('transport_type','walking','On foot','A pie','Walking transportation','Desplazamiento a pie'),
    ('activity_type','hiking','Hiking','Senderismo','Hiking activity','Actividad de senderismo'),
    ('activity_type','diving','Diving','Buceo','Scuba diving activity','Actividad de buceo'),
    ('activity_type','surfing','Surfing','Surf','Surfing activity','Actividad de surf'),
    ('activity_type','museum_visit','Museum visit','Visita a museo','Museum visit activity','Actividad de visita a museos'),
    ('activity_type','guided_tour','Guided tour','Visita guiada','Guided tour activity','Actividad de visita guiada'),
    ('activity_type','cooking_class','Cooking class','Clase de cocina','Cooking workshop','Taller de cocina'),
    ('activity_type','wine_tasting','Wine tasting','Cata de vinos','Wine tasting activity','Actividad de cata de vinos'),
    ('activity_type','spa_treatment','Spa treatment','Tratamiento de spa','Spa treatment activity','Actividad de tratamientos de spa'),
    ('activity_type','paragliding','Paragliding','Parapente','Paragliding activity','Actividad de parapente'),
    ('activity_type','bird_watching','Bird watching','Observación de aves','Bird watching activity','Actividad de observación de aves'),
    ('season_type','high_season','High season','Temporada alta','Peak demand period','Periodo de alta afluencia'),
    ('season_type','low_season','Low season','Temporada baja','Low demand period','Periodo de baja afluencia'),
    ('season_type','summer','Summer','Verano','Summer season','Temporada estival'),
    ('season_type','winter','Winter','Invierno','Winter season','Temporada invernal'),
    ('season_type','cyclone_season','Cyclone season','Temporada ciclónica','Cyclone period in La Réunion','Periodo ciclónico en La Reunión'),
    ('season_type','sugar_cane_harvest','Sugar cane harvest','Cosecha de caña de azúcar','Sugar cane harvest period','Periodo de cosecha de caña de azúcar'),
    ('season_type','vanilla_harvest','Vanilla harvest','Cosecha de vainilla','Vanilla harvest period','Periodo de cosecha de vainilla'),
    ('season_type','lychee_season','Lychee season','Temporada de litchis','Lychee season','Temporada de litchis'),
    ('season_type','festival_season','Festival season','Temporada de festivales','Festival period','Periodo de festivales'),
    ('season_type','holiday_season','Holiday season','Temporada de vacaciones','School or public holiday period','Periodo de vacaciones escolares o públicas'),
    ('client_type','individual','Solo traveller','Viajero individual','Solo traveller','Viajero en solitario'),
    ('client_type','couple','Couple','Pareja','Travelling couple','Pareja de viaje'),
    ('client_type','family','Family','Familia','Family with children','Familia con niños'),
    ('client_type','group','Group','Grupo','Group of travellers','Grupo de viajeros'),
    ('client_type','business_traveler','Business traveller','Viajero de negocios','Professional traveller','Viajero profesional'),
    ('client_type','senior','Senior','Senior','Senior traveller','Viajero senior'),
    ('client_type','student','Student','Estudiante','Student traveller','Viajero estudiante'),
    ('client_type','luxury_traveler','Luxury traveller','Viajero de lujo','High-end traveller','Viajero de alta gama'),
    ('client_type','budget_traveler','Budget traveller','Viajero económico','Budget-conscious traveller','Viajero con presupuesto ajustado'),
    ('client_type','accessible','Guest with reduced mobility','Persona con movilidad reducida','Guest with disabilities','Cliente con discapacidad'),
    ('service_type','accommodation','Accommodation','Alojamiento','Accommodation service','Servicio de alojamiento'),
    ('service_type','restaurant','Restaurant','Restaurante','Food service','Servicio de restauración'),
    ('service_type','transport','Transport','Transporte','Transport service','Servicio de transporte'),
    ('service_type','tour_guide','Tour guide','Guía turístico','Tour guiding service','Servicio de guía turístico'),
    ('service_type','spa','Spa','Spa','Spa service','Servicio de spa'),
    ('service_type','concierge','Concierge','Conserjería','Concierge service','Servicio de conserjería'),
    ('service_type','event_planning','Event planning','Organización de eventos','Event planning service','Servicio de organización de eventos'),
    ('service_type','translation','Translation','Traducción','Translation service','Servicio de traducción'),
    ('service_type','insurance','Insurance','Seguro','Insurance service','Servicio de seguros'),
    ('service_type','security','Security','Seguridad','Security service','Servicio de seguridad'),
    ('booking_status','pending','Pending','Pendiente','Reservation pending','Reserva pendiente'),
    ('booking_status','confirmed','Confirmed','Confirmada','Reservation confirmed','Reserva confirmada'),
    ('booking_status','cancelled','Cancelled','Cancelada','Reservation cancelled','Reserva cancelada'),
    ('booking_status','completed','Completed','Terminada','Reservation completed','Reserva finalizada'),
    ('booking_status','no_show','No-show','No presentado','Guest did not show up','Cliente no se presentó'),
    ('booking_status','payment_pending','Payment pending','Pago pendiente','Awaiting payment','Pago en espera'),
    ('booking_status','payment_confirmed','Payment confirmed','Pago confirmado','Payment received','Pago recibido'),
    ('booking_status','modified','Modified','Modificada','Reservation modified','Reserva modificada'),
    ('booking_status','checked_in','Checked in','Registrado','Guest checked in','Cliente registrado'),
    ('booking_status','checked_out','Checked out','Salida','Guest checked out','Cliente salió'),
    ('promotion_type','early_booking','Early booking','Reserva anticipada','Early booking discount','Descuento por reserva anticipada'),
    ('promotion_type','last_minute','Last minute','Última hora','Last-minute offer','Oferta de última hora'),
    ('promotion_type','seasonal','Seasonal','Estacional','Seasonal promotion','Promoción estacional'),
    ('promotion_type','group_discount','Group discount','Descuento para grupos','Group discount','Descuento para grupos'),
    ('promotion_type','loyalty','Loyalty','Fidelidad','Loyalty promotion','Promoción de fidelidad'),
    ('promotion_type','package','Package','Paquete','Package promotion','Promoción en paquete'),
    ('promotion_type','flash_sale','Flash sale','Venta flash','Flash sale offer','Oferta flash'),
    ('promotion_type','student','Student','Estudiante','Student promotion','Promoción para estudiantes'),
    ('promotion_type','senior','Senior','Senior','Senior promotion','Promoción para seniors'),
    ('promotion_type','family','Family','Familia','Family promotion','Promoción para familias'),
    ('insurance_type','travel','Travel insurance','Seguro de viaje','Travel insurance','Seguro de viaje'),
    ('insurance_type','medical','Medical insurance','Seguro médico','Medical insurance','Seguro médico'),
    ('insurance_type','cancellation','Cancellation insurance','Seguro de cancelación','Cancellation insurance','Seguro de cancelación'),
    ('insurance_type','luggage','Luggage insurance','Seguro de equipaje','Baggage insurance','Seguro de equipaje'),
    ('insurance_type','liability','Liability insurance','Seguro de responsabilidad civil','Liability insurance','Seguro de responsabilidad civil'),
    ('insurance_type','repatriation','Repatriation insurance','Seguro de repatriación','Repatriation insurance','Seguro de repatriación'),
    ('insurance_type','multi_risk','Multi-risk insurance','Seguro multirriesgo','Comprehensive multi-risk insurance','Seguro integral multirriesgo'),
    ('insurance_type','adventure','Adventure insurance','Seguro de aventura','Adventure sports insurance','Seguro para deportes de aventura'),
    ('insurance_type','business','Business insurance','Seguro de negocios','Business travel insurance','Seguro de viaje de negocios'),
    ('insurance_type','group','Group insurance','Seguro de grupo','Group travel insurance','Seguro para grupos'),
    ('feedback_type','online_review','Online review','Reseña en línea','Online customer review','Opinión en línea'),
    ('feedback_type','satisfaction_survey','Satisfaction survey','Encuesta de satisfacción','Customer satisfaction survey','Encuesta de satisfacción de clientes'),
    ('feedback_type','verbal_feedback','Verbal feedback','Comentario verbal','In-person comment','Comentario verbal'),
    ('feedback_type','complaint','Complaint','Reclamación','Customer complaint','Reclamación de cliente'),
    ('feedback_type','compliment','Compliment','Felicitación','Compliment','Felicitación'),
    ('feedback_type','suggestion','Suggestion','Sugerencia','Improvement suggestion','Sugerencia de mejora'),
    ('feedback_type','rating','Rating','Calificación','Rating score','Puntuación'),
    ('feedback_type','testimonial','Testimonial','Testimonio','Customer testimonial','Testimonio de cliente'),
    ('feedback_type','social_media','Social media','Redes sociales','Feedback via social media','Comentario en redes sociales'),
    ('feedback_type','email','Email','Correo electrónico','Feedback via email','Comentario por correo electrónico'),
    ('partnership_type','hotel','Hotel partnership','Colaboración hotelera','Partnership with hotels','Colaboración con hoteles'),
    ('partnership_type','airline','Airline partnership','Colaboración con aerolíneas','Partnership with airlines','Colaboración con aerolíneas'),
    ('partnership_type','travel_agency','Travel agency partnership','Colaboración con agencias de viaje','Partnership with travel agencies','Colaboración con agencias de viaje'),
    ('partnership_type','tourist_office','Tourist office partnership','Colaboración con oficinas de turismo','Partnership with tourist offices','Colaboración con oficinas de turismo'),
    ('partnership_type','local_business','Local business partnership','Colaboración con negocios locales','Partnership with local businesses','Colaboración con empresas locales'),
    ('partnership_type','online_platform','Online platform partnership','Colaboración con plataformas en línea','Partnership with online platforms','Colaboración con plataformas digitales'),
    ('partnership_type','restaurant','Restaurant partnership','Colaboración con restaurantes','Partnership with restaurants','Colaboración con restaurantes'),
    ('partnership_type','transport','Transport partnership','Colaboración con transporte','Partnership with transport companies','Colaboración con empresas de transporte'),
    ('partnership_type','activity_provider','Activity provider partnership','Colaboración con proveedores de actividades','Partnership with activity providers','Colaboración con prestadores de actividades'),
    ('partnership_type','supplier','Supplier partnership','Colaboración con proveedores','Partnership with suppliers','Colaboración con proveedores'),
    ('assistance_type','customer_service','Customer service','Atención al cliente','Customer service assistance','Asistencia de atención al cliente'),
    ('assistance_type','medical','Medical assistance','Asistencia médica','Medical assistance','Asistencia médica'),
    ('assistance_type','emergency','Emergency','Emergencia','Emergency assistance','Asistencia de emergencia'),
    ('assistance_type','technical','Technical assistance','Asistencia técnica','Technical assistance','Asistencia técnica'),
    ('assistance_type','language','Language assistance','Asistencia lingüística','Language assistance','Asistencia lingüística'),
    ('assistance_type','legal','Legal assistance','Asistencia legal','Legal assistance','Asistencia legal'),
    ('assistance_type','travel','Travel assistance','Asistencia en viaje','Travel assistance','Asistencia en viaje'),
    ('assistance_type','lost_documents','Lost documents','Documentos perdidos','Lost documents assistance','Asistencia por documentos perdidos'),
    ('assistance_type','theft','Theft','Robo','Theft assistance','Asistencia en caso de robo'),
    ('assistance_type','natural_disaster','Natural disaster','Desastre natural','Assistance for natural disasters','Asistencia ante catástrofes naturales'),
    ('destination_type','urban','Urban destination','Destino urbano','Urban destination','Destino urbano'),
    ('destination_type','coastal','Coastal destination','Destino costero','Beach or seaside destination','Destino de playa o litoral'),
    ('destination_type','mountain','Mountain destination','Destino de montaña','Mountain destination','Destino de montaña'),
    ('destination_type','rural','Rural destination','Destino rural','Rural destination','Destino rural'),
    ('destination_type','tropical','Tropical destination','Destino tropical','Tropical destination','Destino tropical'),
    ('destination_type','cultural','Cultural destination','Destino cultural','Cultural destination','Destino cultural'),
    ('destination_type','adventure','Adventure destination','Destino de aventura','Adventure destination','Destino de aventura'),
    ('destination_type','wellness','Wellness destination','Destino de bienestar','Wellness destination','Destino de bienestar'),
    ('destination_type','business','Business destination','Destino de negocios','Business destination','Destino de negocios'),
    ('destination_type','family','Family destination','Destino familiar','Family-friendly destination','Destino apto para familias'),
    ('event_type','conference','Conference','Conferencia','Conference event','Evento de conferencia'),
    ('event_type','seminar','Seminar','Seminario','Seminar event','Evento de seminario'),
    ('event_type','workshop','Workshop','Taller','Workshop event','Evento de taller'),
    ('event_type','exhibition','Exhibition','Exposición','Exhibition event','Evento de exposición'),
    ('event_type','festival','Festival','Festival','Festival event','Evento de festival'),
    ('event_type','concert','Concert','Concierto','Concert event','Evento de concierto'),
    ('event_type','wedding','Wedding','Boda','Wedding event','Evento de boda'),
    ('event_type','corporate_event','Corporate event','Evento corporativo','Corporate event','Evento corporativo'),
    ('event_type','sporting_event','Sporting event','Evento deportivo','Sporting event','Evento deportivo'),
    ('event_type','cultural_event','Cultural event','Evento cultural','Cultural event','Evento cultural'),
    ('package_type','all_inclusive','All-inclusive','Todo incluido','All-inclusive package','Paquete todo incluido'),
    ('package_type','half_board','Half board','Media pensión','Half-board package','Paquete de media pensión'),
    ('package_type','full_board','Full board','Pensión completa','Full-board package','Paquete de pensión completa'),
    ('package_type','bed_breakfast','Bed and breakfast','Alojamiento y desayuno','Bed and breakfast package','Paquete de alojamiento y desayuno'),
    ('package_type','flight_hotel','Flight + hotel','Vuelo + hotel','Flight and hotel package','Paquete de vuelo y hotel'),
    ('package_type','circuit','Tour','Circuito','Tour package','Paquete de circuito'),
    ('package_type','cruise','Cruise','Crucero','Cruise package','Paquete de crucero'),
    ('package_type','wellness','Wellness','Bienestar','Wellness package','Paquete de bienestar'),
    ('package_type','adventure','Adventure','Aventura','Adventure package','Paquete de aventura'),
    ('package_type','family','Family','Familia','Family package','Paquete familiar'),
    ('room_type','single','Single room','Habitación individual','Single room','Habitación individual'),
    ('room_type','double','Double room','Habitación doble','Double room','Habitación doble'),
    ('room_type','twin','Twin room','Habitación twin','Room with twin beds','Habitación con camas gemelas'),
    ('room_type','triple','Triple room','Habitación triple','Triple room','Habitación triple'),
    ('room_type','family','Family room','Habitación familiar','Family room','Habitación familiar'),
    ('room_type','suite','Suite','Suite','Suite','Suite'),
    ('room_type','presidential','Presidential suite','Suite presidencial','Presidential suite','Suite presidencial'),
    ('room_type','junior_suite','Junior suite','Junior suite','Junior suite','Junior suite'),
    ('room_type','accessible','Accessible room','Habitación accesible','Accessible room for PRM','Habitación accesible para PMR'),
    ('room_type','connecting','Connecting rooms','Habitaciones comunicadas','Connecting rooms','Habitaciones comunicadas')
)
UPDATE ref_code rc
SET name_i18n = COALESCE(rc.name_i18n, '{}'::jsonb) || jsonb_build_object('en', rct.name_en, 'es', rct.name_es),
    description_i18n = CASE
      WHEN rct.description_en IS NULL AND rct.description_es IS NULL THEN rc.description_i18n
      ELSE COALESCE(rc.description_i18n, '{}'::jsonb) || COALESCE(jsonb_strip_nulls(jsonb_build_object('en', rct.description_en, 'es', rct.description_es)), '{}'::jsonb)
    END
FROM ref_code_translations rct
WHERE rc.domain = rct.domain AND rc.code = rct.code;

-- ref_amenity translations
WITH amenity_translations(code, name_en, name_es, description_en, description_es) AS (
  VALUES
    ('wifi','Wi-Fi','Wi-Fi','Complimentary Wi-Fi access','Acceso Wi-Fi gratuito'),
    ('tv','Television','Televisión','Television in the rooms','Televisión en las habitaciones'),
    ('air_conditioning','Air conditioning','Aire acondicionado','Air conditioning','Aire acondicionado'),
    ('heating','Heating','Calefacción','Heating system','Sistema de calefacción'),
    ('safe','Safe','Caja fuerte','Secure safe','Caja fuerte segura'),
    ('elevator','Elevator','Ascensor','Elevator','Ascensor'),
    ('laundry','Laundry service','Servicio de lavandería','Laundry service','Servicio de lavandería'),
    ('luggage_storage','Luggage storage','Consigna de equipaje','Luggage storage service','Servicio de consigna de equipaje'),
    ('business_center','Business centre','Centro de negocios','Business centre','Centro de negocios'),
    ('concierge','Concierge','Conserjería','Concierge service','Servicio de conserjería'),
    ('restaurant','Restaurant','Restaurante','On-site restaurant','Restaurante en el establecimiento'),
    ('bar','Bar','Bar','Bar','Bar'),
    ('room_service','Room service','Servicio de habitaciones','In-room dining service','Servicio de comidas en la habitación'),
    ('minibar','Minibar','Minibar','In-room minibar','Minibar en la habitación'),
    ('breakfast','Breakfast','Desayuno','Breakfast included','Desayuno incluido'),
    ('kitchenette','Kitchenette','Cocineta','Equipped kitchenette','Cocineta equipada'),
    ('coffee_machine','Coffee machine','Cafetera','Coffee machine','Cafetera'),
    ('microwave','Microwave','Microondas','Microwave oven','Horno microondas'),
    ('refrigerator','Refrigerator','Refrigerador','Refrigerator','Refrigerador'),
    ('baby_crib','Baby crib','Cuna para bebés','Baby crib available','Cuna disponible'),
    ('high_chair','High chair','Trona','High chair','Trona para bebés'),
    ('baby_sitting','Babysitting','Servicio de canguro','Babysitting service','Servicio de niñera'),
    ('kids_club','Kids club','Club infantil','Kids club','Club para niños'),
    ('playground','Playground','Zona de juegos','Children''s playground','Zona de juegos infantil'),
    ('pet_friendly','Pet friendly','Admite mascotas','Pets allowed','Se admiten mascotas'),
    ('pet_bowls','Pet bowls','Cuencos para mascotas','Pet bowls provided','Cuencos para mascotas disponibles'),
    ('pet_bed','Pet bed','Cama para mascotas','Pet bed available','Cama para mascotas disponible'),
    ('hairdryer','Hairdryer','Secador de pelo','Hairdryer','Secador de pelo'),
    ('bathrobes','Bathrobes','Albornoces','Bathrobes provided','Albornoces disponibles'),
    ('toiletries','Toiletries','Artículos de tocador','Toiletries provided','Artículos de tocador disponibles'),
    ('jacuzzi','Jacuzzi','Jacuzzi','Private jacuzzi','Jacuzzi privado'),
    ('bathtub','Bathtub','Bañera','Bathtub','Bañera'),
    ('shower','Shower','Ducha','Shower','Ducha'),
    ('blackout_curtains','Blackout curtains','Cortinas opacas','Blackout curtains','Cortinas opacas'),
    ('extra_pillows','Extra pillows','Almohadas adicionales','Additional pillows','Almohadas adicionales'),
    ('iron','Iron','Plancha','Iron','Plancha'),
    ('desk','Desk','Escritorio','Work desk','Escritorio de trabajo'),
    ('sofa','Sofa','Sofá','Sofa','Sofá'),
    ('balcony','Balcony','Balcón','Private balcony','Balcón privado'),
    ('private_terrace','Private terrace','Terraza privada','Private terrace','Terraza privada'),
    ('pool_table','Pool table','Mesa de billar','Pool table','Mesa de billar'),
    ('games_room','Games room','Sala de juegos','Games room','Sala de juegos'),
    ('library','Library','Biblioteca','Library','Biblioteca'),
    ('dvd_player','DVD player','Reproductor de DVD','DVD player','Reproductor de DVD'),
    ('board_games','Board games','Juegos de mesa','Board games','Juegos de mesa'),
    ('swimming_pool','Swimming pool','Piscina','Swimming pool','Piscina'),
    ('hot_tub','Outdoor spa','Spa exterior','Outdoor hot tub','Spa exterior'),
    ('garden','Garden','Jardín','Garden','Jardín'),
    ('bbq','Barbecue','Barbacoa','Barbecue area available','Zona de barbacoa disponible'),
    ('sunbeds','Sunbeds','Tumbonas','Sun loungers and umbrellas','Tumbonas y sombrillas'),
    ('beach_access','Beach access','Acceso a la playa','Direct beach access','Acceso directo a la playa'),
    ('common_terrace','Shared terrace','Terraza común','Shared terrace','Terraza común'),
    ('wheelchair_access','Wheelchair access','Acceso para sillas de ruedas','Wheelchair access','Acceso para sillas de ruedas'),
    ('accessible_bathroom','Accessible bathroom','Baño accesible','Accessible bathroom','Baño accesible'),
    ('accessible_parking','Accessible parking','Estacionamiento accesible','Accessible parking','Estacionamiento accesible'),
    ('hearing_impaired','Hearing support','Soporte para personas con discapacidad auditiva','Equipment for hearing-impaired guests','Equipamiento para personas con discapacidad auditiva'),
    ('security_24h','24/7 security','Seguridad 24 h','24-hour security','Seguridad 24 horas'),
    ('cctv','CCTV','CCTV','Video surveillance system','Sistema de videovigilancia'),
    ('fire_safety','Fire safety','Seguridad contra incendios','Fire safety system','Sistema de seguridad contra incendios'),
    ('emergency_exit','Emergency exit','Salida de emergencia','Emergency exit','Salida de emergencia'),
    ('parking','Parking','Aparcamiento','Parking available','Aparcamiento disponible'),
    ('valet_parking','Valet parking','Servicio de aparcacoches','Valet parking service','Servicio de aparcacoches'),
    ('garage','Garage','Garaje','Covered garage','Garaje cubierto'),
    ('electric_charging','EV charging station','Carga eléctrica','Electric vehicle charging station','Punto de carga para vehículos eléctricos'),
    ('spa','Spa','Spa','Spa centre','Centro de spa'),
    ('car_rental','Car rental','Alquiler de coches','Car rental service','Servicio de alquiler de coches'),
    ('airport_shuttle','Airport shuttle','Traslado al aeropuerto','Airport shuttle service','Servicio de traslado al aeropuerto'),
    ('tour_desk','Tour desk','Mostrador de excursiones','Excursions and activities desk','Mostrador de excursiones y actividades'),
    ('fitness_center','Fitness centre','Gimnasio','Fitness centre','Gimnasio'),
    ('tennis_court','Tennis court','Pista de tenis','Tennis court','Pista de tenis'),
    ('golf_course','Golf course','Campo de golf','Golf course access','Acceso a campo de golf'),
    ('bike_rental','Bike rental','Alquiler de bicicletas','Bike rental service','Servicio de alquiler de bicicletas'),
    ('snorkeling_gear','Snorkelling gear','Equipo de snorkel','Snorkelling equipment','Equipo de snorkel'),
    ('diving_center','Diving centre','Centro de buceo','Diving centre','Centro de buceo'),
    ('surf_rental','Surfboard rental','Alquiler de tablas de surf','Surfboard rental','Alquiler de tablas de surf'),
    ('kayak_rental','Kayak rental','Alquiler de kayaks','Kayak rental service','Servicio de alquiler de kayaks'),
    ('hiking_gear','Hiking gear','Equipo de senderismo','Hiking equipment','Equipo de senderismo'),
    ('climbing_gear','Climbing gear','Equipo de escalada','Climbing equipment','Equipo de escalada'),
    ('sailing_equipment','Sailing equipment','Equipo de vela','Sailing equipment','Equipo de vela'),
    ('fishing_gear','Fishing gear','Equipo de pesca','Fishing equipment','Equipo de pesca'),
    ('yoga_mats','Yoga mats','Esterillas de yoga','Yoga mats available','Esterillas de yoga disponibles'),
    ('gym_equipment','Gym equipment','Equipo de gimnasio','Strength training equipment','Equipamiento de musculación'),
    ('swimming_equipment','Swimming equipment','Equipo de natación','Swimming equipment','Equipo de natación')
)
UPDATE ref_amenity a
SET name_i18n = COALESCE(a.name_i18n, '{}'::jsonb) || jsonb_build_object('en', at.name_en, 'es', at.name_es),
    description_i18n = CASE
      WHEN at.description_en IS NULL AND at.description_es IS NULL THEN a.description_i18n
      ELSE COALESCE(a.description_i18n, '{}'::jsonb) || COALESCE(jsonb_strip_nulls(jsonb_build_object('en', at.description_en, 'es', at.description_es)), '{}'::jsonb)
    END
FROM amenity_translations at
WHERE a.code = at.code;

-- ref_classification_value translations
WITH scheme_ids AS (
  SELECT id, code FROM ref_classification_scheme
), value_translations(scheme_code, value_code, name_en, name_es) AS (
  VALUES
    ('type_hot','hotel','Hotel','Hotel'),
    ('type_hot','hotel_restaurant','Hotel with restaurant','Hotel con restaurante'),
    ('type_hot','hotel_boutique','Boutique hotel','Hotel boutique'),
    ('type_hot','hotel_ecologique','Eco hotel','Hotel ecológico'),
    ('type_hot','hotel_historique','Heritage hotel','Hotel histórico'),
    ('type_hot','hotel_moderne','Modern hotel','Hotel moderno'),
    ('type_hot','hotel_traditionnel','Traditional hotel','Hotel tradicional'),
    ('type_hot','hotel_familial','Family hotel','Hotel familiar'),
    ('type_hot','hotel_romantique','Romantic hotel','Hotel romántico'),
    ('type_hot','hotel_affaires','Business hotel','Hotel de negocios'),
    ('hot_stars','1','1 star','1 estrella'),
    ('hot_stars','2','2 stars','2 estrellas'),
    ('hot_stars','3','3 stars','3 estrellas'),
    ('hot_stars','4','4 stars','4 estrellas'),
    ('hot_stars','5','5 stars','5 estrellas'),
    ('camp_stars','1','1 star','1 estrella'),
    ('camp_stars','2','2 stars','2 estrellas'),
    ('camp_stars','3','3 stars','3 estrellas'),
    ('camp_stars','4','4 stars','4 estrellas'),
    ('camp_stars','5','5 stars','5 estrellas'),
    ('meuble_stars','1','1 star','1 estrella'),
    ('meuble_stars','2','2 stars','2 estrellas'),
    ('meuble_stars','3','3 stars','3 estrellas'),
    ('meuble_stars','4','4 stars','4 estrellas'),
    ('meuble_stars','5','5 stars','5 estrellas'),
    ('gites_epics','1','1 ear of wheat','1 espiga'),
    ('gites_epics','2','2 ears of wheat','2 espigas'),
    ('gites_epics','3','3 ears of wheat','3 espigas'),
    ('gites_epics','4','4 ears of wheat','4 espigas'),
    ('gites_epics','5','5 ears of wheat','5 espigas'),
    ('clevacances_keys','1','1 key','1 llave'),
    ('clevacances_keys','2','2 keys','2 llaves'),
    ('clevacances_keys','3','3 keys','3 llaves'),
    ('clevacances_keys','4','4 keys','4 llaves'),
    ('clevacances_keys','5','5 keys','5 llaves'),
    ('tourisme_handicap','auditive','Hearing impairment','Discapacidad auditiva'),
    ('tourisme_handicap','mental','Cognitive impairment','Discapacidad intelectual'),
    ('tourisme_handicap','motor','Mobility impairment','Discapacidad motriz'),
    ('tourisme_handicap','visual','Visual impairment','Discapacidad visual')
)
UPDATE ref_classification_value cv
SET name_i18n = COALESCE(cv.name_i18n, '{}'::jsonb) || jsonb_build_object('en', vt.name_en, 'es', vt.name_es)
FROM scheme_ids s
JOIN value_translations vt ON vt.scheme_code = s.code
WHERE cv.scheme_id = s.id AND cv.code = vt.value_code;

-- ref_sustainability_action_category translations
WITH category_translations(code, name_en, name_es, description_en, description_es) AS (
  VALUES
    ('energy','Energy','Energía','Reducing and managing energy consumption','Reducción y gestión del consumo energético'),
    ('water','Water','Agua','Responsible water management','Gestión responsable del agua'),
    ('waste','Waste','Residuos','Reducing, sorting and recovering waste','Reducción, clasificación y valorización de residuos'),
    ('mobility','Soft mobility','Movilidad sostenible','Sustainable and low-impact mobility','Movilidad sostenible y de bajo impacto'),
    ('biodiversity','Biodiversity','Biodiversidad','Biodiversity preservation','Preservación de la biodiversidad')
)
UPDATE ref_sustainability_action_category sac
SET name_i18n = COALESCE(sac.name_i18n, '{}'::jsonb) || jsonb_build_object('en', ct.name_en, 'es', ct.name_es),
    description_i18n = CASE
      WHEN ct.description_en IS NULL AND ct.description_es IS NULL THEN sac.description_i18n
      ELSE COALESCE(sac.description_i18n, '{}'::jsonb) || COALESCE(jsonb_strip_nulls(jsonb_build_object('en', ct.description_en, 'es', ct.description_es)), '{}'::jsonb)
    END
FROM category_translations ct
WHERE sac.code = ct.code;

-- ref_sustainability_action translations
WITH action_translations(category_code, code, label_en, label_es, description_en, description_es) AS (
  VALUES
    ('energy','led_lighting','LED lighting','Iluminación LED',NULL,NULL),
    ('energy','smart_thermostats','Smart thermostats','Termostatos inteligentes',NULL,NULL),
    ('energy','solar_water_heating','Solar water heating','Calentamiento solar de agua',NULL,NULL),
    ('energy','renewable_electricity','Renewable electricity','Electricidad renovable',NULL,NULL),
    ('water','low_flow_devices','Low-flow devices','Dispositivos de bajo consumo',NULL,NULL),
    ('water','rainwater_harvesting','Rainwater harvesting','Recogida de agua de lluvia',NULL,NULL),
    ('water','greywater_reuse','Greywater reuse','Reutilización de aguas grises',NULL,NULL),
    ('water','water_saving_devices','Water-saving devices','Dispositivos de ahorro de agua',NULL,NULL),
    ('waste','sorting_points','Sorting stations','Puntos de reciclaje',NULL,NULL),
    ('waste','composting','Composting','Compostaje',NULL,NULL),
    ('waste','bulk_amenities','Bulk amenities','Amenidades a granel',NULL,NULL),
    ('waste','recycling_program','Recycling programme','Programa de reciclaje',NULL,NULL),
    ('mobility','bike_parking','Bike parking','Aparcamiento para bicicletas',NULL,NULL),
    ('mobility','ev_charging','Electric charging points','Puntos de carga eléctrica',NULL,NULL),
    ('mobility','public_transport_info','Public transport information','Información sobre transporte público',NULL,NULL),
    ('biodiversity','native_plants','Native plants','Plantas autóctonas',NULL,NULL),
    ('biodiversity','no_pesticides','No pesticides','Sin pesticidas',NULL,NULL),
    ('biodiversity','wildlife_corridors','Wildlife corridors','Corredores de fauna',NULL,NULL),
    ('waste','food_waste_reduction','Food waste reduction','Reducción del desperdicio alimentario',NULL,NULL)
)
UPDATE ref_sustainability_action sa
SET label_i18n = COALESCE(sa.label_i18n, '{}'::jsonb) || jsonb_build_object('en', at.label_en, 'es', at.label_es),
    description_i18n = CASE
      WHEN at.description_en IS NULL AND at.description_es IS NULL THEN sa.description_i18n
      ELSE COALESCE(sa.description_i18n, '{}'::jsonb) || COALESCE(jsonb_strip_nulls(jsonb_build_object('en', at.description_en, 'es', at.description_es)), '{}'::jsonb)
    END
FROM ref_sustainability_action_category sac
JOIN action_translations at ON at.category_code = sac.code
WHERE sa.category_id = sac.id AND sa.code = at.code;

-- =====================================================
-- OBJECT CONTENT TRANSLATIONS (EN & ES)
-- =====================================================

-- object_description translations
WITH object_descriptions AS (
  SELECT 
    od.object_id,
    od.description,
    od.description_chapo,
    od.description_mobile,
    od.description_edition,
    od.description_offre_hors_zone,
    od.sanitary_measures,
    o.name as object_name,
    o.object_type
  FROM object_description od
  JOIN object o ON o.id = od.object_id
  WHERE o.region_code = 'TST'
), description_translations AS (
  SELECT 
    object_id,
    CASE object_name
      WHEN 'Office de Tourisme Intercommunal TEST' THEN 
        jsonb_build_object(
          'en', 'Test tourism office to validate Bertel 3.0 system functionalities. This organization serves as parent for all test objects and allows testing the complete unified system features.',
          'es', 'Oficina de turismo de prueba para validar las funcionalidades del sistema Bertel 3.0. Esta organización sirve como padre para todos los objetos de prueba y permite probar todas las características del sistema unificado.'
        )
      WHEN 'Hôtel Test Océan' THEN 
        jsonb_build_object(
          'en', 'Boutique hotel located on the west coast of Reunion Island, offering direct beach access and panoramic ocean views. Modern facilities with Creole charm.',
          'es', 'Hotel boutique ubicado en la costa oeste de la isla de Reunión, con acceso directo a la playa y vistas panorámicas al océano. Instalaciones modernas con encanto criollo.'
        )
      WHEN 'Restaurant Test Océan' THEN 
        jsonb_build_object(
          'en', 'Restaurant specializing in Creole cuisine with fresh local products. Traditional recipes with a modern twist, overlooking the ocean.',
          'es', 'Restaurante especializado en cocina criolla con productos locales frescos. Recetas tradicionales con un toque moderno, con vista al océano.'
        )
      WHEN 'Restaurant Fermeture Saisonnière' THEN 
        jsonb_build_object(
          'en', 'Seasonal restaurant open only during high season. Traditional Creole cuisine with local ingredients.',
          'es', 'Restaurante estacional abierto solo durante la temporada alta. Cocina criolla tradicional con ingredientes locales.'
        )
      WHEN 'Itinéraire Test Côte Ouest' THEN 
        jsonb_build_object(
          'en', 'Discovery itinerary along the west coast of Reunion Island, from Saint-Paul to Saint-Leu. Panoramic views, beaches, and Creole villages.',
          'es', 'Itinerario de descubrimiento a lo largo de la costa oeste de la isla de Reunión, desde Saint-Paul hasta Saint-Leu. Vistas panorámicas, playas y pueblos criollos.'
        )
      WHEN 'Salle de Réunion Test' THEN 
        jsonb_build_object(
          'en', 'Modern meeting room with ocean view, equipped with video conferencing and presentation facilities.',
          'es', 'Sala de reuniones moderna con vista al océano, equipada con videoconferencia e instalaciones de presentación.'
        )
      WHEN 'Événement Test Festival' THEN 
        jsonb_build_object(
          'en', 'Annual cultural festival celebrating Creole traditions, music, and gastronomy. Free admission.',
          'es', 'Festival cultural anual que celebra las tradiciones criollas, música y gastronomía. Entrada gratuita.'
        )
      WHEN 'Parc National Test' THEN 
        jsonb_build_object(
          'en', 'National park covering the central massif of Reunion Island. UNESCO World Heritage site with exceptional biodiversity.',
          'es', 'Parque nacional que cubre el macizo central de la isla de Reunión. Sitio del Patrimonio Mundial de la UNESCO con biodiversidad excepcional.'
        )
      WHEN 'Musée Test Histoire' THEN 
        jsonb_build_object(
          'en', 'History museum retracing the settlement of Reunion Island and the development of Creole culture.',
          'es', 'Museo de historia que rastrea el asentamiento de la isla de Reunión y el desarrollo de la cultura criolla.'
        )
      WHEN 'Plage Test Public' THEN 
        jsonb_build_object(
          'en', 'Public beach with white sand and turquoise waters. Ideal for families with children.',
          'es', 'Playa pública con arena blanca y aguas turquesas. Ideal para familias con niños.'
        )
      WHEN 'Transport Test Navette' THEN 
        jsonb_build_object(
          'en', 'Shuttle service connecting the airport to major hotels on the west coast. Regular departures every 30 minutes.',
          'es', 'Servicio de lanzadera que conecta el aeropuerto con los principales hoteles de la costa oeste. Salidas regulares cada 30 minutos.'
        )
      WHEN 'Activité Test Randonnée' THEN 
        jsonb_build_object(
          'en', 'Guided hiking tour in the national park with a certified guide. Discovery of endemic flora and fauna.',
          'es', 'Tour de senderismo guiado en el parque nacional con guía certificado. Descubrimiento de flora y fauna endémicas.'
        )
      WHEN 'Prestataire Test Guide' THEN 
        jsonb_build_object(
          'en', 'Professional guide service specializing in hiking and cultural tours. Licensed and experienced.',
          'es', 'Servicio de guía profesional especializado en senderismo y tours culturales. Licenciado y experimentado.'
        )
      WHEN 'Comité Régional de Tourisme TEST' THEN 
        jsonb_build_object(
          'en', 'Regional tourism committee coordinating tourism development across Reunion Island.',
          'es', 'Comité regional de turismo que coordina el desarrollo turístico en toda la isla de Reunión.'
        )
      ELSE jsonb_build_object('en', description, 'es', description)
    END as description_i18n,
    CASE object_name
      WHEN 'Office de Tourisme Intercommunal TEST' THEN 
        jsonb_build_object('en', 'Test tourism office', 'es', 'Oficina de turismo de prueba')
      WHEN 'Hôtel Test Océan' THEN 
        jsonb_build_object('en', 'Boutique hotel with ocean view', 'es', 'Hotel boutique con vista al océano')
      WHEN 'Restaurant Test Océan' THEN 
        jsonb_build_object('en', 'Creole cuisine restaurant', 'es', 'Restaurante de cocina criolla')
      WHEN 'Restaurant Fermeture Saisonnière' THEN 
        jsonb_build_object('en', 'Seasonal restaurant', 'es', 'Restaurante estacional')
      WHEN 'Itinéraire Test Côte Ouest' THEN 
        jsonb_build_object('en', 'West coast discovery route', 'es', 'Ruta de descubrimiento de la costa oeste')
      WHEN 'Salle de Réunion Test' THEN 
        jsonb_build_object('en', 'Meeting room with ocean view', 'es', 'Sala de reuniones con vista al océano')
      WHEN 'Événement Test Festival' THEN 
        jsonb_build_object('en', 'Annual cultural festival', 'es', 'Festival cultural anual')
      WHEN 'Parc National Test' THEN 
        jsonb_build_object('en', 'UNESCO World Heritage national park', 'es', 'Parque nacional Patrimonio Mundial de la UNESCO')
      WHEN 'Musée Test Histoire' THEN 
        jsonb_build_object('en', 'History and culture museum', 'es', 'Museo de historia y cultura')
      WHEN 'Plage Test Public' THEN 
        jsonb_build_object('en', 'Family-friendly public beach', 'es', 'Playa pública familiar')
      WHEN 'Transport Test Navette' THEN 
        jsonb_build_object('en', 'Airport shuttle service', 'es', 'Servicio de lanzadera al aeropuerto')
      WHEN 'Activité Test Randonnée' THEN 
        jsonb_build_object('en', 'Guided hiking tour', 'es', 'Tour de senderismo guiado')
      WHEN 'Prestataire Test Guide' THEN 
        jsonb_build_object('en', 'Professional guide service', 'es', 'Servicio de guía profesional')
      WHEN 'Comité Régional de Tourisme TEST' THEN 
        jsonb_build_object('en', 'Regional tourism committee', 'es', 'Comité regional de turismo')
      ELSE jsonb_build_object('en', description_chapo, 'es', description_chapo)
    END as description_chapo_i18n,
    CASE object_name
      WHEN 'Office de Tourisme Intercommunal TEST' THEN 
        jsonb_build_object('en', 'OTI TEST — essential information and contacts. Le Tampon (97430).', 'es', 'OTI TEST — información esencial y contactos. Le Tampon (97430).')
      WHEN 'Hôtel Test Océan' THEN 
        jsonb_build_object('en', 'Boutique hotel with direct beach access. Modern comfort in Creole setting.', 'es', 'Hotel boutique con acceso directo a la playa. Comodidad moderna en entorno criollo.')
      WHEN 'Restaurant Test Océan' THEN 
        jsonb_build_object('en', 'Creole cuisine with fresh local products. Ocean view terrace.', 'es', 'Cocina criolla con productos locales frescos. Terraza con vista al océano.')
      WHEN 'Restaurant Fermeture Saisonnière' THEN 
        jsonb_build_object('en', 'Open during high season only. Traditional Creole specialties.', 'es', 'Abierto solo en temporada alta. Especialidades criollas tradicionales.')
      WHEN 'Itinéraire Test Côte Ouest' THEN 
        jsonb_build_object('en', 'Discovery route from Saint-Paul to Saint-Leu. Beaches and Creole villages.', 'es', 'Ruta de descubrimiento de Saint-Paul a Saint-Leu. Playas y pueblos criollos.')
      WHEN 'Salle de Réunion Test' THEN 
        jsonb_build_object('en', 'Modern meeting room with video conferencing. Ocean view.', 'es', 'Sala de reuniones moderna con videoconferencia. Vista al océano.')
      WHEN 'Événement Test Festival' THEN 
        jsonb_build_object('en', 'Annual cultural festival. Free admission. Music and gastronomy.', 'es', 'Festival cultural anual. Entrada gratuita. Música y gastronomía.')
      WHEN 'Parc National Test' THEN 
        jsonb_build_object('en', 'UNESCO World Heritage site. Exceptional biodiversity and landscapes.', 'es', 'Sitio del Patrimonio Mundial de la UNESCO. Biodiversidad y paisajes excepcionales.')
      WHEN 'Musée Test Histoire' THEN 
        jsonb_build_object('en', 'History museum. Settlement and Creole culture development.', 'es', 'Museo de historia. Asentamiento y desarrollo de la cultura criolla.')
      WHEN 'Plage Test Public' THEN 
        jsonb_build_object('en', 'Public beach with white sand. Family-friendly with facilities.', 'es', 'Playa pública con arena blanca. Familiar con instalaciones.')
      WHEN 'Transport Test Navette' THEN 
        jsonb_build_object('en', 'Airport shuttle. Regular departures every 30 minutes.', 'es', 'Lanzadera al aeropuerto. Salidas regulares cada 30 minutos.')
      WHEN 'Activité Test Randonnée' THEN 
        jsonb_build_object('en', 'Guided hiking with certified guide. Endemic flora and fauna.', 'es', 'Senderismo guiado con guía certificado. Flora y fauna endémicas.')
      WHEN 'Prestataire Test Guide' THEN 
        jsonb_build_object('en', 'Professional guide service. Licensed and experienced.', 'es', 'Servicio de guía profesional. Licenciado y experimentado.')
      WHEN 'Comité Régional de Tourisme TEST' THEN 
        jsonb_build_object('en', 'Regional tourism coordination. Island-wide development.', 'es', 'Coordinación turística regional. Desarrollo en toda la isla.')
      ELSE jsonb_build_object('en', description_mobile, 'es', description_mobile)
    END as description_mobile_i18n,
    CASE object_name
      WHEN 'Office de Tourisme Intercommunal TEST' THEN 
        jsonb_build_object('en', 'Editorial sheet: test organization for validation scenarios, content and workflows.', 'es', 'Ficha editorial: organización de prueba para escenarios de validación, contenido y flujos de trabajo.')
      WHEN 'Hôtel Test Océan' THEN 
        jsonb_build_object('en', 'Editorial sheet: boutique hotel with ocean view, modern facilities and Creole charm.', 'es', 'Ficha editorial: hotel boutique con vista al océano, instalaciones modernas y encanto criollo.')
      WHEN 'Restaurant Test Océan' THEN 
        jsonb_build_object('en', 'Editorial sheet: Creole cuisine restaurant with fresh local products and ocean view.', 'es', 'Ficha editorial: restaurante de cocina criolla con productos locales frescos y vista al océano.')
      WHEN 'Restaurant Fermeture Saisonnière' THEN 
        jsonb_build_object('en', 'Editorial sheet: seasonal restaurant with traditional Creole specialties.', 'es', 'Ficha editorial: restaurante estacional con especialidades criollas tradicionales.')
      WHEN 'Itinéraire Test Côte Ouest' THEN 
        jsonb_build_object('en', 'Editorial sheet: discovery route along the west coast with beaches and villages.', 'es', 'Ficha editorial: ruta de descubrimiento a lo largo de la costa oeste con playas y pueblos.')
      WHEN 'Salle de Réunion Test' THEN 
        jsonb_build_object('en', 'Editorial sheet: modern meeting room with video conferencing and ocean view.', 'es', 'Ficha editorial: sala de reuniones moderna con videoconferencia y vista al océano.')
      WHEN 'Événement Test Festival' THEN 
        jsonb_build_object('en', 'Editorial sheet: annual cultural festival celebrating Creole traditions.', 'es', 'Ficha editorial: festival cultural anual que celebra las tradiciones criollas.')
      WHEN 'Parc National Test' THEN 
        jsonb_build_object('en', 'Editorial sheet: UNESCO World Heritage national park with exceptional biodiversity.', 'es', 'Ficha editorial: parque nacional Patrimonio Mundial de la UNESCO con biodiversidad excepcional.')
      WHEN 'Musée Test Histoire' THEN 
        jsonb_build_object('en', 'Editorial sheet: history museum tracing settlement and Creole culture.', 'es', 'Ficha editorial: museo de historia que rastrea el asentamiento y la cultura criolla.')
      WHEN 'Plage Test Public' THEN 
        jsonb_build_object('en', 'Editorial sheet: family-friendly public beach with white sand.', 'es', 'Ficha editorial: playa pública familiar con arena blanca.')
      WHEN 'Transport Test Navette' THEN 
        jsonb_build_object('en', 'Editorial sheet: airport shuttle service with regular departures.', 'es', 'Ficha editorial: servicio de lanzadera al aeropuerto con salidas regulares.')
      WHEN 'Activité Test Randonnée' THEN 
        jsonb_build_object('en', 'Editorial sheet: guided hiking tour with certified guide.', 'es', 'Ficha editorial: tour de senderismo guiado con guía certificado.')
      WHEN 'Prestataire Test Guide' THEN 
        jsonb_build_object('en', 'Editorial sheet: professional guide service licensed and experienced.', 'es', 'Ficha editorial: servicio de guía profesional licenciado y experimentado.')
      WHEN 'Comité Régional de Tourisme TEST' THEN 
        jsonb_build_object('en', 'Editorial sheet: regional tourism committee coordinating island development.', 'es', 'Ficha editorial: comité regional de turismo que coordina el desarrollo de la isla.')
      ELSE jsonb_build_object('en', description_edition, 'es', description_edition)
    END as description_edition_i18n
  FROM object_descriptions
)
UPDATE object_description od
SET 
  description_i18n = dt.description_i18n,
  description_chapo_i18n = dt.description_chapo_i18n,
  description_mobile_i18n = dt.description_mobile_i18n,
  description_edition_i18n = dt.description_edition_i18n
FROM description_translations dt
WHERE od.object_id = dt.object_id;

-- media translations
WITH media_translations AS (
  SELECT 
    m.id as media_id,
    m.title,
    m.description,
    o.name as object_name,
    o.object_type,
    CASE m.title
      WHEN 'Logo Hôtel Test Océan' THEN 
        jsonb_build_object('en', 'Hotel Test Ocean Logo', 'es', 'Logotipo Hotel Test Ocean')
      WHEN 'Façade & piscine' THEN 
        jsonb_build_object('en', 'Facade & swimming pool', 'es', 'Fachada y piscina')
      WHEN 'Curry de poisson - Photo du plat' THEN 
        jsonb_build_object('en', 'Fish curry - Dish photo', 'es', 'Curry de pescado - Foto del plato')
      WHEN 'Salade créole - Photo du plat' THEN 
        jsonb_build_object('en', 'Creole salad - Dish photo', 'es', 'Ensalada criolla - Foto del plato')
      WHEN 'Vue panoramique restaurant' THEN 
        jsonb_build_object('en', 'Restaurant panoramic view', 'es', 'Vista panorámica del restaurante')
      WHEN 'Plat signature - Rougail saucisse' THEN 
        jsonb_build_object('en', 'Signature dish - Sausage rougail', 'es', 'Plato estrella - Rougail de salchicha')
      WHEN 'Vue aérienne itinéraire' THEN 
        jsonb_build_object('en', 'Aerial view of the route', 'es', 'Vista aérea del itinerario')
      WHEN 'Plage de Boucan Canot' THEN 
        jsonb_build_object('en', 'Boucan Canot Beach', 'es', 'Playa de Boucan Canot')
      WHEN 'Village de l''Étang-Salé' THEN 
        jsonb_build_object('en', 'Étang-Salé Village', 'es', 'Pueblo de Étang-Salé')
      WHEN 'Salle de réunion moderne' THEN 
        jsonb_build_object('en', 'Modern meeting room', 'es', 'Sala de reuniones moderna')
      WHEN 'Vue océan depuis la salle' THEN 
        jsonb_build_object('en', 'Ocean view from the room', 'es', 'Vista al océano desde la sala')
      WHEN 'Affiche Festival Test' THEN 
        jsonb_build_object('en', 'Test Festival Poster', 'es', 'Cartel del Festival Test')
      WHEN 'Groupe de musique créole' THEN 
        jsonb_build_object('en', 'Creole music group', 'es', 'Grupo de música criolla')
      WHEN 'Piton des Neiges' THEN 
        jsonb_build_object('en', 'Piton des Neiges', 'es', 'Piton des Neiges')
      WHEN 'Cirque de Mafate' THEN 
        jsonb_build_object('en', 'Cirque de Mafate', 'es', 'Circo de Mafate')
      WHEN 'Exposition permanente' THEN 
        jsonb_build_object('en', 'Permanent exhibition', 'es', 'Exposición permanente')
      WHEN 'Objets historiques créoles' THEN 
        jsonb_build_object('en', 'Historical Creole objects', 'es', 'Objetos históricos criollos')
      WHEN 'Plage vue générale' THEN 
        jsonb_build_object('en', 'General beach view', 'es', 'Vista general de la playa')
      WHEN 'Famille sur la plage' THEN 
        jsonb_build_object('en', 'Family on the beach', 'es', 'Familia en la playa')
      WHEN 'Navette aéroport' THEN 
        jsonb_build_object('en', 'Airport shuttle', 'es', 'Lanzadera al aeropuerto')
      WHEN 'Intérieur navette' THEN 
        jsonb_build_object('en', 'Shuttle interior', 'es', 'Interior de la lanzadera')
      WHEN 'Sentier de randonnée' THEN 
        jsonb_build_object('en', 'Hiking trail', 'es', 'Sendero de senderismo')
      WHEN 'Guide et randonneurs' THEN 
        jsonb_build_object('en', 'Guide and hikers', 'es', 'Guía y senderistas')
      WHEN 'Photo de profil guide' THEN 
        jsonb_build_object('en', 'Guide profile photo', 'es', 'Foto de perfil del guía')
      WHEN 'Certificat guide' THEN 
        jsonb_build_object('en', 'Guide certificate', 'es', 'Certificado de guía')
      ELSE jsonb_build_object('en', m.title, 'es', m.title)
    END as title_i18n,
    CASE m.description
      WHEN 'Photo du curry de poisson servi dans notre restaurant' THEN 
        jsonb_build_object('en', 'Photo of fish curry served in our restaurant', 'es', 'Foto del curry de pescado servido en nuestro restaurante')
      WHEN 'Photo de la salade créole fraîche et colorée' THEN 
        jsonb_build_object('en', 'Photo of fresh and colorful Creole salad', 'es', 'Foto de la ensalada criolla fresca y colorida')
      WHEN 'Vue panoramique du restaurant avec terrasse océan' THEN 
        jsonb_build_object('en', 'Panoramic view of the restaurant with ocean terrace', 'es', 'Vista panorámica del restaurante con terraza al océano')
      WHEN 'Notre plat signature : rougail saucisse traditionnel' THEN 
        jsonb_build_object('en', 'Our signature dish: traditional sausage rougail', 'es', 'Nuestro plato estrella: rougail de salchicha tradicional')
      WHEN 'Vue aérienne de l''itinéraire de découverte' THEN 
        jsonb_build_object('en', 'Aerial view of the discovery route', 'es', 'Vista aérea de la ruta de descubrimiento')
      WHEN 'Plage de Boucan Canot, une des plus belles de l''île' THEN 
        jsonb_build_object('en', 'Boucan Canot Beach, one of the most beautiful on the island', 'es', 'Playa de Boucan Canot, una de las más hermosas de la isla')
      WHEN 'Village traditionnel de l''Étang-Salé' THEN 
        jsonb_build_object('en', 'Traditional village of Étang-Salé', 'es', 'Pueblo tradicional de Étang-Salé')
      WHEN 'Salle de réunion moderne avec vue océan' THEN 
        jsonb_build_object('en', 'Modern meeting room with ocean view', 'es', 'Sala de reuniones moderna con vista al océano')
      WHEN 'Vue panoramique océan depuis la salle' THEN 
        jsonb_build_object('en', 'Panoramic ocean view from the room', 'es', 'Vista panorámica al océano desde la sala')
      WHEN 'Affiche officielle du Festival Test 2024' THEN 
        jsonb_build_object('en', 'Official poster for Test Festival 2024', 'es', 'Cartel oficial del Festival Test 2024')
      WHEN 'Groupe de musique créole en concert' THEN 
        jsonb_build_object('en', 'Creole music group in concert', 'es', 'Grupo de música criolla en concierto')
      WHEN 'Piton des Neiges, point culminant de l''île' THEN 
        jsonb_build_object('en', 'Piton des Neiges, highest point of the island', 'es', 'Piton des Neiges, punto más alto de la isla')
      WHEN 'Cirque de Mafate, site classé UNESCO' THEN 
        jsonb_build_object('en', 'Cirque de Mafate, UNESCO World Heritage site', 'es', 'Circo de Mafate, sitio del Patrimonio Mundial de la UNESCO')
      WHEN 'Exposition permanente sur l''histoire de l''île' THEN 
        jsonb_build_object('en', 'Permanent exhibition on the history of the island', 'es', 'Exposición permanente sobre la historia de la isla')
      WHEN 'Objets historiques de la culture créole' THEN 
        jsonb_build_object('en', 'Historical objects of Creole culture', 'es', 'Objetos históricos de la cultura criolla')
      WHEN 'Vue générale de la plage publique' THEN 
        jsonb_build_object('en', 'General view of the public beach', 'es', 'Vista general de la playa pública')
      WHEN 'Famille profitant de la plage' THEN 
        jsonb_build_object('en', 'Family enjoying the beach', 'es', 'Familia disfrutando de la playa')
      WHEN 'Navette moderne pour l''aéroport' THEN 
        jsonb_build_object('en', 'Modern shuttle to the airport', 'es', 'Lanzadera moderna al aeropuerto')
      WHEN 'Intérieur confortable de la navette' THEN 
        jsonb_build_object('en', 'Comfortable shuttle interior', 'es', 'Interior cómodo de la lanzadera')
      WHEN 'Sentier de randonnée dans le parc national' THEN 
        jsonb_build_object('en', 'Hiking trail in the national park', 'es', 'Sendero de senderismo en el parque nacional')
      WHEN 'Guide accompagnant un groupe de randonneurs' THEN 
        jsonb_build_object('en', 'Guide accompanying a group of hikers', 'es', 'Guía acompañando a un grupo de senderistas')
      WHEN 'Photo de profil du guide professionnel' THEN 
        jsonb_build_object('en', 'Professional guide profile photo', 'es', 'Foto de perfil del guía profesional')
      WHEN 'Certificat de qualification du guide' THEN 
        jsonb_build_object('en', 'Guide qualification certificate', 'es', 'Certificado de calificación del guía')
      ELSE jsonb_build_object('en', m.description, 'es', m.description)
    END as description_i18n
  FROM media m
  JOIN object o ON o.id = m.object_id
  WHERE o.region_code = 'TST'
)
UPDATE media m
SET 
  title_i18n = mt.title_i18n,
  description_i18n = mt.description_i18n
FROM media_translations mt
WHERE m.id = mt.media_id;

-- Supplemental explicit object translations (missing earlier)
UPDATE object_description od
SET 
  description_i18n = COALESCE(od.description_i18n, '{}'::jsonb) || jsonb_build_object(
    'en','Cultural association promoting Creole heritage and organizing cultural events.',
    'es','Asociación cultural que promueve el patrimonio criollo y organiza eventos culturales.'
  ),
  description_chapo_i18n = COALESCE(od.description_chapo_i18n, '{}'::jsonb) || jsonb_build_object(
    'en','Creole cultural association',
    'es','Asociación cultural criolla'
  )
FROM object o
WHERE od.object_id = o.id AND o.region_code = 'TST' AND o.name = 'Association Culturelle Test';

UPDATE object_description od
SET 
  description_i18n = COALESCE(od.description_i18n, '{}'::jsonb) || jsonb_build_object(
    'en','Nature campground with pitches for tents and campervans, restrooms and showers.',
    'es','Camping en plena naturaleza con parcelas para tiendas y autocaravanas, sanitarios y duchas.'
  ),
  description_chapo_i18n = COALESCE(od.description_chapo_i18n, '{}'::jsonb) || jsonb_build_object(
    'en','Nature camping - tents and campervans',
    'es','Camping de naturaleza - tiendas y autocaravanas'
  )
FROM object o
WHERE od.object_id = o.id AND o.region_code = 'TST' AND o.name = 'Camping Nature Test';

-- Media title i18n for generic logo/photo titles created from object name
UPDATE media m
SET title_i18n = COALESCE(m.title_i18n,'{}'::jsonb) || jsonb_build_object(
  'en', 'Logo ' || o.name,
  'es', 'Logotipo ' || o.name
)
FROM object o, ref_code_media_type mt
WHERE m.object_id = o.id
  AND m.media_type_id = mt.id
  AND mt.code = 'vector'
  AND (m.kind = 'logo' OR m.title LIKE 'Logo %');

UPDATE media m
SET title_i18n = COALESCE(m.title_i18n,'{}'::jsonb) || jsonb_build_object(
  'en', 'Main photo ' || o.name,
  'es', 'Foto principal ' || o.name
)
FROM object o, ref_code_media_type mt
WHERE m.object_id = o.id
  AND m.media_type_id = mt.id
  AND mt.code = 'photo'
  AND (m.is_main IS TRUE OR m.title LIKE 'Photo principale %');

-- EAV translations for capacity metrics (name/description)
WITH cap AS (
  SELECT id, code FROM ref_capacity_metric
), t(name_code, name_en, name_es, desc_en, desc_es) AS (
  VALUES
    ('beds','Beds','Camas','Number of beds','Número de camas'),
    ('bedrooms','Bedrooms','Habitaciones','Number of bedrooms','Número de habitaciones'),
    ('max_capacity','Maximum capacity','Capacidad máxima','Maximum guest capacity (people)','Capacidad máxima de acogida (personas)'),
    ('seats','Seats','Asientos','Number of seated places','Número de plazas sentadas'),
    ('standing_places','Standing places','Plazas de pie','Number of standing places','Número de plazas de pie'),
    ('pitches','Pitches','Parcelas','Number of camping pitches','Número de parcelas de camping'),
    ('campers','Campervans','Autocaravanas','Campervan capacity','Capacidad de autocaravanas'),
    ('tents','Tents','Tiendas','Tent capacity','Capacidad de tiendas'),
    ('vehicles','Vehicles','Vehículos','Vehicle capacity','Capacidad de vehículos'),
    ('bikes','Bikes','Bicicletas','Bike capacity','Capacidad de bicicletas'),
    ('meeting_rooms','Meeting rooms','Salas de reuniones','Number of meeting rooms','Número de salas de reuniones'),
    ('floor_area_m2','Floor area (m²)','Superficie (m²)','Usable floor area in square metres','Superficie útil en metros cuadrados')
)
INSERT INTO i18n_translation (target_table, target_pk, target_column, language_id, value_text)
SELECT 'ref_capacity_metric', cap.id::text, 'name', rl.id, CASE rl.code WHEN 'en' THEN t.name_en WHEN 'es' THEN t.name_es END
FROM cap
JOIN t ON t.name_code = cap.code
JOIN ref_language rl ON rl.code IN ('en','es')
ON CONFLICT (target_table, target_pk, target_column, language_id) DO UPDATE
SET value_text = EXCLUDED.value_text;

-- =====================================================
-- FURTHER ENHANCEMENTS FOR REMAINING OBJECT TYPES
-- =====================================================

-- =====================================================
-- RES – attach cuisine types to menu items (enables cuisine search)
-- =====================================================
INSERT INTO object_menu_item_cuisine_type (menu_item_id, cuisine_type_id)
SELECT mi.id, ct.id
FROM object_menu_item mi
JOIN object_menu m ON m.id = mi.menu_id
JOIN object o ON o.id = m.object_id AND o.object_type = 'RES' AND o.region_code = 'TST' AND o.name = 'Restaurant Test Océan'
JOIN ref_code_cuisine_type ct ON ct.code IN (
  CASE WHEN mi.name = 'Curry de poisson' THEN 'seafood' ELSE NULL END,
  CASE WHEN mi.name = 'Curry de poisson' THEN 'creole' ELSE NULL END,
  CASE WHEN mi.name = 'Salade créole' THEN 'creole' ELSE NULL END,
  CASE WHEN mi.name = 'Salade créole' THEN 'vegetarienne' ELSE NULL END
)
WHERE mi.is_available IS TRUE
  AND NOT EXISTS (
    SELECT 1 FROM object_menu_item_cuisine_type x WHERE x.menu_item_id = mi.id AND x.cuisine_type_id = ct.id
  );

-- =====================================================
-- FMA – link events to a partner restaurant (for cuisine-based event queries)
-- =====================================================
INSERT INTO object_relation (source_object_id, target_object_id, relation_type_id, created_at)
SELECT fma.id, res.id, rt.id, NOW()
FROM object fma, object res, ref_object_relation_type rt
WHERE fma.object_type = 'FMA' AND fma.region_code = 'TST' AND fma.name = 'Festival Créole Test'
  AND res.object_type = 'RES' AND res.region_code = 'TST' AND res.name = 'Restaurant Test Océan'
  AND rt.code = 'partner_of'
  AND NOT EXISTS (
    SELECT 1 FROM object_relation r WHERE r.source_object_id = fma.id AND r.target_object_id = res.id AND r.relation_type_id = rt.id
  );

-- =====================================================
-- CAMP – classification and capacities
-- =====================================================
-- Camp stars = 4
INSERT INTO object_classification (object_id, scheme_id, value_id, created_at, updated_at)
SELECT o.id, cs.id, cv.id, NOW(), NOW()
FROM object o, ref_classification_scheme cs, ref_classification_value cv
WHERE o.object_type = 'CAMP' AND o.region_code = 'TST' AND o.name = 'Camping Nature Test'
  AND cs.code = 'camp_stars' AND cv.scheme_id = cs.id AND cv.code = '4'
  AND NOT EXISTS (
    SELECT 1 FROM object_classification oc WHERE oc.object_id = o.id AND oc.scheme_id = cs.id AND oc.value_id = cv.id
  );

-- Capacities: pitches, tents, campers
INSERT INTO object_capacity (object_id, metric_id, value_integer)
SELECT o.id, m.id, v.val
FROM object o
JOIN (
  VALUES
    ('pitches'::text, 80),
    ('tents',         50),
    ('campers',       20)
) v(code, val) ON TRUE
JOIN ref_capacity_metric m ON m.code = v.code
WHERE o.object_type = 'CAMP' AND o.region_code = 'TST' AND o.name = 'Camping Nature Test'
  AND NOT EXISTS (
    SELECT 1 FROM object_capacity oc WHERE oc.object_id = o.id AND oc.metric_id = m.id
  );

-- =====================================================
-- HPA (gîte) – classification and capacities
-- =====================================================
-- Gîtes de France: 3 épis
INSERT INTO object_classification (object_id, scheme_id, value_id, created_at, updated_at)
SELECT o.id, cs.id, cv.id, NOW(), NOW()
FROM object o, ref_classification_scheme cs, ref_classification_value cv
WHERE o.object_type = 'HPA' AND o.region_code = 'TST' AND o.name = 'Gîte Particulier Test'
  AND cs.code = 'gites_epics' AND cv.scheme_id = cs.id AND cv.code = '3'
  AND NOT EXISTS (
    SELECT 1 FROM object_classification oc WHERE oc.object_id = o.id AND oc.scheme_id = cs.id AND oc.value_id = cv.id
  );

-- Capacity: bedrooms, max_capacity
INSERT INTO object_capacity (object_id, metric_id, value_integer)
SELECT o.id, m.id, v.val
FROM object o
JOIN (
  VALUES
    ('bedrooms'::text,   3),
    ('max_capacity',     6)
) v(code, val) ON TRUE
JOIN ref_capacity_metric m ON m.code = v.code
WHERE o.object_type = 'HPA' AND o.region_code = 'TST' AND o.name = 'Gîte Particulier Test'
  AND NOT EXISTS (
    SELECT 1 FROM object_capacity oc WHERE oc.object_id = o.id AND oc.metric_id = m.id
  );

-- =====================================================
-- HLO (hébergement loisir) – eco label & amenities
-- =====================================================
-- Label green_key
INSERT INTO object_classification (object_id, scheme_id, value_id, created_at, updated_at)
SELECT o.id, cs.id, cv.id, NOW(), NOW()
FROM object o, ref_classification_scheme cs, ref_classification_value cv
WHERE o.object_type = 'HLO' AND o.region_code = 'TST' AND o.name = 'Résidence Loisir Test'
  AND cs.code = 'green_key' AND cv.scheme_id = cs.id AND cv.code = 'green_key'
  AND NOT EXISTS (
    SELECT 1 FROM object_classification oc WHERE oc.object_id = o.id AND oc.scheme_id = cs.id AND oc.value_id = cv.id
  );

-- Amenities: swimming_pool, spa
INSERT INTO object_amenity (object_id, amenity_id, created_at)
SELECT o.id, a.id, NOW()
FROM object o
JOIN ref_amenity a ON a.code IN ('swimming_pool','spa')
WHERE o.object_type = 'HLO' AND o.region_code = 'TST' AND o.name = 'Résidence Loisir Test'
  AND NOT EXISTS (
    SELECT 1 FROM object_amenity oa WHERE oa.object_id = o.id AND oa.amenity_id = a.id
  );

-- =====================================================
-- LOI (loisir) – weekend opening hours and capacity
-- =====================================================
INSERT INTO opening_period (object_id, name, all_years, created_at, updated_at)
SELECT o.id, 'Week-ends uniquement', TRUE, NOW(), NOW()
FROM object o
WHERE o.object_type = 'LOI' AND o.region_code = 'TST' AND o.name = 'Centre Loisirs Test'
  AND NOT EXISTS (
    SELECT 1 FROM opening_period op WHERE op.object_id = o.id AND COALESCE(op.name,'') = 'Week-ends uniquement'
  );

INSERT INTO opening_schedule (period_id, schedule_type_id, name, created_at, updated_at)
SELECT op.id, rst.id, 'Samedi & dimanche', NOW(), NOW()
FROM opening_period op
JOIN object o ON o.id = op.object_id
JOIN ref_code_opening_schedule_type rst ON rst.code = 'regular'
WHERE o.object_type = 'LOI' AND o.region_code = 'TST' AND o.name = 'Centre Loisirs Test'
  AND NOT EXISTS (
    SELECT 1 FROM opening_schedule os WHERE os.period_id = op.id AND os.schedule_type_id = rst.id
  );

INSERT INTO opening_time_period (schedule_id, closed, created_at, updated_at)
SELECT os.id, FALSE, NOW(), NOW()
FROM opening_schedule os
JOIN opening_period op ON op.id = os.period_id
JOIN object o ON o.id = op.object_id
JOIN ref_code_opening_schedule_type rst ON rst.id = os.schedule_type_id AND rst.code = 'regular'
WHERE o.object_type = 'LOI' AND o.region_code = 'TST' AND o.name = 'Centre Loisirs Test'
  AND NOT EXISTS (
    SELECT 1 FROM opening_time_period tp WHERE tp.schedule_id = os.id AND tp.closed = FALSE
  );

INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
SELECT tp.id, w.id
FROM opening_time_period tp
JOIN opening_schedule os ON os.id = tp.schedule_id
JOIN opening_period op ON op.id = os.period_id
JOIN object o ON o.id = op.object_id
JOIN ref_code_weekday w ON w.code IN ('saturday','sunday')
WHERE o.object_type = 'LOI' AND o.region_code = 'TST' AND o.name = 'Centre Loisirs Test'
  AND NOT EXISTS (
    SELECT 1 FROM opening_time_period_weekday tw WHERE tw.time_period_id = tp.id AND tw.weekday_id = w.id
  );

INSERT INTO opening_time_frame (time_period_id, start_time, end_time, created_at, updated_at)
SELECT tp.id, TIME '09:00', TIME '18:00', NOW(), NOW()
FROM opening_time_period tp
JOIN opening_schedule os ON os.id = tp.schedule_id
JOIN opening_period op ON op.id = os.period_id
JOIN object o ON o.id = op.object_id
JOIN ref_code_opening_schedule_type rst ON rst.id = os.schedule_type_id AND rst.code = 'regular'
WHERE o.object_type = 'LOI' AND o.region_code = 'TST' AND o.name = 'Centre Loisirs Test'
  AND NOT EXISTS (
    SELECT 1 FROM opening_time_frame tf WHERE tf.time_period_id = tp.id AND tf.start_time = TIME '09:00' AND tf.end_time = TIME '18:00'
  );

-- Capacity: seats
INSERT INTO object_capacity (object_id, metric_id, value_integer)
SELECT o.id, m.id, 120
FROM object o
JOIN ref_capacity_metric m ON m.code = 'seats'
WHERE o.object_type = 'LOI' AND o.region_code = 'TST' AND o.name = 'Centre Loisirs Test'
  AND NOT EXISTS (
    SELECT 1 FROM object_capacity oc WHERE oc.object_id = o.id AND oc.metric_id = m.id
  );

-- =====================================================
-- PCU, PNA, VIL, ASC – add environment tags and basic media
-- =====================================================
-- PCU tags & media
INSERT INTO object_environment_tag (object_id, environment_tag_id, created_at)
SELECT o.id, et.id, NOW()
FROM object o JOIN ref_code_environment_tag et ON et.code IN ('urbain_creatif','centre_ville')
WHERE o.object_type = 'PCU' AND o.region_code = 'TST' AND o.name = 'Point Culture Urbaine Test'
  AND NOT EXISTS (
    SELECT 1 FROM object_environment_tag x WHERE x.object_id = o.id AND x.environment_tag_id = et.id
  );

INSERT INTO media (object_id, media_type_id, title, url, kind, is_main, is_published, position, created_at, updated_at)
SELECT o.id, mt.id, 'Photo culture urbaine', 'https://images.example.com/pcu/point-culture-urbaine.jpg', 'illustration', TRUE, TRUE, 1, NOW(), NOW()
FROM object o JOIN ref_code_media_type mt ON mt.code = 'photo'
WHERE o.object_type = 'PCU' AND o.region_code = 'TST' AND o.name = 'Point Culture Urbaine Test'
  AND NOT EXISTS (
    SELECT 1 FROM media m WHERE m.object_id = o.id AND m.media_type_id = mt.id AND m.is_main IS TRUE
  );

-- PNA tags
INSERT INTO object_environment_tag (object_id, environment_tag_id, created_at)
SELECT o.id, et.id, NOW()
FROM object o JOIN ref_code_environment_tag et ON et.code IN ('montagne','foret','parc_national')
WHERE o.object_type = 'PNA' AND o.region_code = 'TST' AND o.name = 'Point Nature Aventure Test'
  AND NOT EXISTS (
    SELECT 1 FROM object_environment_tag x WHERE x.object_id = o.id AND x.environment_tag_id = et.id
  );

-- VIL tags
INSERT INTO object_environment_tag (object_id, environment_tag_id, created_at)
SELECT o.id, et.id, NOW()
FROM object o JOIN ref_code_environment_tag et ON et.code IN ('patrimoine','quartier_historique')
WHERE o.object_type = 'VIL' AND o.region_code = 'TST' AND o.name = 'Village Test Authentique'
  AND NOT EXISTS (
    SELECT 1 FROM object_environment_tag x WHERE x.object_id = o.id AND x.environment_tag_id = et.id
  );

-- ASC tags (use ref_tag)
INSERT INTO ref_tag (slug, name, description, position)
VALUES ('association','Association','Association locale',30)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO tag_link (tag_id, target_table, target_pk, created_at)
SELECT t.id, 'object', o.id, NOW()
FROM object o, ref_tag t
WHERE o.object_type = 'ASC' AND o.region_code = 'TST' AND o.name = 'Association Culturelle Test'
  AND t.slug = 'association'
  AND NOT EXISTS (
    SELECT 1 FROM tag_link tl WHERE tl.tag_id = t.id AND tl.target_table = 'object' AND tl.target_pk = o.id
  );

-- =====================================================
-- ITI – sections and stages with basic geometry (enables KML/GPX)
-- =====================================================
-- Sections (simple line)
INSERT INTO object_iti_section (parent_object_id, name, position, geom, created_at, updated_at)
SELECT o.id, 'Tronçon principal', 1,
       ST_GeogFromText('SRID=4326;LINESTRING(55.4700 -21.1300, 55.4900 -21.1400, 55.5100 -21.1550)'),
       NOW(), NOW()
FROM object o
WHERE o.object_type = 'ITI' AND o.region_code = 'TST' AND o.name = 'Randonnée Piton des Neiges'
  AND NOT EXISTS (
    SELECT 1 FROM object_iti_section s WHERE s.parent_object_id = o.id
  );

-- Stages (start & summit points)
INSERT INTO object_iti_stage (object_id, name, description, position, geom, created_at, updated_at)
SELECT o.id, 'Départ Cilaos', 'Point de départ', 1,
       ST_GeogFromText('SRID=4326;POINT(55.4700 -21.1300)'), NOW(), NOW()
FROM object o
WHERE o.object_type = 'ITI' AND o.region_code = 'TST' AND o.name = 'Randonnée Piton des Neiges'
  AND NOT EXISTS (
    SELECT 1 FROM object_iti_stage st WHERE st.object_id = o.id AND st.position = 1
  );

INSERT INTO object_iti_stage (object_id, name, description, position, geom, created_at, updated_at)
SELECT o.id, 'Sommet', 'Point sommital', 2,
       ST_GeogFromText('SRID=4326;POINT(55.5100 -21.1550)'), NOW(), NOW()
FROM object o
WHERE o.object_type = 'ITI' AND o.region_code = 'TST' AND o.name = 'Randonnée Piton des Neiges'
  AND NOT EXISTS (
    SELECT 1 FROM object_iti_stage st WHERE st.object_id = o.id AND st.position = 2
  );

-- =====================================================
-- ITI – elevation profile and info (exposed in API) 
-- =====================================================
-- Basic profile points (m position vs elevation)
INSERT INTO object_iti_profile (object_id, position_m, elevation_m, created_at, updated_at)
SELECT o.id, v.pos, v.elev, NOW(), NOW()
FROM object o
JOIN (
  VALUES (0.0,   1200.0),
         (1000.0,1300.0),
         (3000.0,1550.0),
         (6000.0,1850.0),
         (9000.0,2300.0),
         (12500.0,2500.0)
) AS v(pos, elev) ON TRUE
WHERE o.object_type='ITI' AND o.region_code='TST' AND o.name='Randonnée Piton des Neiges'
  AND NOT EXISTS (
    SELECT 1 FROM object_iti_profile p WHERE p.object_id=o.id
  );

-- Info texts
INSERT INTO object_iti_info (object_id, access, ambiance, recommended_parking, required_equipment, info_places, is_child_friendly, created_at, updated_at)
SELECT o.id,
  'Accès par la route de Cilaos, départ au parking officiel indiqué.',
  'Ambiance haute montagne, sentiers pierreux et vues dégagées.',
  'Parking de départ à Cilaos, places limitées en haute saison.',
  'Chaussures de randonnée, vêtements chauds, eau et lampe frontale.',
  'Balisage standard, certaines portions techniques.',
  FALSE, NOW(), NOW()
FROM object o
WHERE o.object_type='ITI' AND o.region_code='TST' AND o.name='Randonnée Piton des Neiges'
  AND NOT EXISTS (
    SELECT 1 FROM object_iti_info i WHERE i.object_id=o.id
  );

-- =====================================================
-- HOT – hotel stars classification and extra media
-- =====================================================
-- 4 stars
INSERT INTO object_classification (object_id, scheme_id, value_id, created_at, updated_at)
SELECT o.id, cs.id, cv.id, NOW(), NOW()
FROM object o, ref_classification_scheme cs, ref_classification_value cv
WHERE o.object_type='HOT' AND o.region_code='TST' AND o.name='Hôtel Test Océan'
  AND cs.code='hot_stars' AND cv.scheme_id=cs.id AND cv.code='4'
  AND NOT EXISTS (
    SELECT 1 FROM object_classification oc WHERE oc.object_id=o.id AND oc.scheme_id=cs.id AND oc.value_id=cv.id
  );

-- Add brochure and video
INSERT INTO media (object_id, media_type_id, title, url, kind, is_main, is_published, position, created_at, updated_at)
SELECT o.id, mt.id, 'Brochure Hôtel Test Océan', 'https://docs.example.com/hotels/test-ocean/brochure.pdf', 'asset', FALSE, TRUE, 10, NOW(), NOW()
FROM object o JOIN ref_code_media_type mt ON mt.code='brochure_pdf'
WHERE o.object_type='HOT' AND o.region_code='TST' AND o.name='Hôtel Test Océan'
  AND NOT EXISTS (
    SELECT 1 FROM media m WHERE m.object_id=o.id AND m.media_type_id=mt.id
  );

INSERT INTO media (object_id, media_type_id, title, url, kind, is_main, is_published, position, created_at, updated_at)
SELECT o.id, mt.id, 'Vidéo présentation Hôtel Test Océan', 'https://videos.example.com/hotels/test-ocean/presentation.mp4', 'asset', FALSE, TRUE, 11, NOW(), NOW()
FROM object o JOIN ref_code_media_type mt ON mt.code='video'
WHERE o.object_type='HOT' AND o.region_code='TST' AND o.name='Hôtel Test Océan'
  AND NOT EXISTS (
    SELECT 1 FROM media m WHERE m.object_id=o.id AND m.media_type_id=mt.id
  );

-- =====================================================
-- RES – dietary tags and allergens for menu items
-- =====================================================
-- Curry de poisson: seafood, contains fish
INSERT INTO object_menu_item_dietary_tag (menu_item_id, dietary_tag_id)
SELECT mi.id, dt.id
FROM object_menu_item mi
JOIN object_menu m ON m.id = mi.menu_id
JOIN object o ON o.id = m.object_id AND o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Test Océan'
JOIN ref_code_dietary_tag dt ON dt.code IN ('seafood')
WHERE mi.name='Curry de poisson'
  AND NOT EXISTS (
    SELECT 1 FROM object_menu_item_dietary_tag x WHERE x.menu_item_id=mi.id AND x.dietary_tag_id=dt.id
  );

INSERT INTO object_menu_item_allergen (menu_item_id, allergen_id)
SELECT mi.id, a.id
FROM object_menu_item mi
JOIN object_menu m ON m.id = mi.menu_id
JOIN object o ON o.id = m.object_id AND o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Test Océan'
JOIN ref_code_allergen a ON a.code IN ('fish')
WHERE mi.name='Curry de poisson'
  AND NOT EXISTS (
    SELECT 1 FROM object_menu_item_allergen x WHERE x.menu_item_id=mi.id AND x.allergen_id=a.id
  );

-- Salade créole: vegetarian
INSERT INTO object_menu_item_dietary_tag (menu_item_id, dietary_tag_id)
SELECT mi.id, dt.id
FROM object_menu_item mi
JOIN object_menu m ON m.id = mi.menu_id
JOIN object o ON o.id = m.object_id AND o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Test Océan'
JOIN ref_code_dietary_tag dt ON dt.code IN ('vegetarian')
WHERE mi.name='Salade créole'
  AND NOT EXISTS (
    SELECT 1 FROM object_menu_item_dietary_tag x WHERE x.menu_item_id=mi.id AND x.dietary_tag_id=dt.id
  );

-- =====================================================
-- Additional legal records for COM/HPA/HLO/CAMP
-- =====================================================
INSERT INTO object_legal (object_id, type_id, value, validity_mode, status, valid_from, created_at, updated_at)
SELECT o.id, t.id, jsonb_build_object('number','COM-TST-0001'), 'forever', 'active', CURRENT_DATE, NOW(), NOW()
FROM object o JOIN ref_legal_type t ON t.code='siret'
WHERE o.object_type='COM' AND o.region_code='TST' AND o.name='Boutique Artisanale Test'
  AND NOT EXISTS (SELECT 1 FROM object_legal x WHERE x.object_id=o.id AND x.type_id=t.id);

INSERT INTO object_legal (object_id, type_id, value, validity_mode, status, valid_from, created_at, updated_at)
SELECT o.id, t.id, jsonb_build_object('number','HPA-TST-0001'), 'forever', 'active', CURRENT_DATE, NOW(), NOW()
FROM object o JOIN ref_legal_type t ON t.code='siret'
WHERE o.object_type='HPA' AND o.region_code='TST' AND o.name='Gîte Particulier Test'
  AND NOT EXISTS (SELECT 1 FROM object_legal x WHERE x.object_id=o.id AND x.type_id=t.id);

INSERT INTO object_legal (object_id, type_id, value, validity_mode, status, valid_from, created_at, updated_at)
SELECT o.id, t.id, jsonb_build_object('number','HLO-TST-0001'), 'forever', 'active', CURRENT_DATE, NOW(), NOW()
FROM object o JOIN ref_legal_type t ON t.code='siret'
WHERE o.object_type='HLO' AND o.region_code='TST' AND o.name='Résidence Loisir Test'
  AND NOT EXISTS (SELECT 1 FROM object_legal x WHERE x.object_id=o.id AND x.type_id=t.id);

INSERT INTO object_legal (object_id, type_id, value, validity_mode, status, valid_from, created_at, updated_at)
SELECT o.id, t.id, jsonb_build_object('number','CAMP-TST-0001'), 'forever', 'active', CURRENT_DATE, NOW(), NOW()
FROM object o JOIN ref_legal_type t ON t.code='siret'
WHERE o.object_type='CAMP' AND o.region_code='TST' AND o.name='Camping Nature Test'
  AND NOT EXISTS (SELECT 1 FROM object_legal x WHERE x.object_id=o.id AND x.type_id=t.id);

-- =====================================================
-- Payments & languages for additional objects
-- =====================================================
INSERT INTO object_language (object_id, language_id, created_at)
SELECT o.id, l.id, NOW()
FROM object o JOIN ref_language l ON l.code IN ('fr','en')
WHERE o.object_type IN ('RES','CAMP','HPA','HLO') AND o.region_code='TST'
  AND NOT EXISTS (SELECT 1 FROM object_language ol WHERE ol.object_id=o.id AND ol.language_id=l.id);

INSERT INTO object_payment_method (object_id, payment_method_id, created_at)
SELECT o.id, pm.id, NOW()
FROM object o JOIN ref_code_payment_method pm ON pm.code IN ('visa','mastercard','carte_bleue','paypal')
WHERE o.object_type IN ('RES','CAMP','HPA','HLO') AND o.region_code='TST'
  AND NOT EXISTS (SELECT 1 FROM object_payment_method x WHERE x.object_id=o.id AND x.payment_method_id=pm.id);

-- =====================================================
-- Relations: COM/PCU/CAMP part_of VIL
-- =====================================================
INSERT INTO object_relation (source_object_id, target_object_id, relation_type_id, created_at)
SELECT c.id, v.id, rt.id, NOW()
FROM object c, object v, ref_object_relation_type rt
WHERE c.object_type='COM' AND c.region_code='TST' AND c.name='Boutique Artisanale Test'
  AND v.object_type='VIL' AND v.region_code='TST' AND v.name='Village Test Authentique'
  AND rt.code='part_of'
  AND NOT EXISTS (
    SELECT 1 FROM object_relation r WHERE r.source_object_id=c.id AND r.target_object_id=v.id AND r.relation_type_id=rt.id
  );

INSERT INTO object_relation (source_object_id, target_object_id, relation_type_id, created_at)
SELECT p.id, v.id, rt.id, NOW()
FROM object p, object v, ref_object_relation_type rt
WHERE p.object_type='PCU' AND p.region_code='TST' AND p.name='Point Culture Urbaine Test'
  AND v.object_type='VIL' AND v.region_code='TST' AND v.name='Village Test Authentique'
  AND rt.code='part_of'
  AND NOT EXISTS (
    SELECT 1 FROM object_relation r WHERE r.source_object_id=p.id AND r.target_object_id=v.id AND r.relation_type_id=rt.id
  );

INSERT INTO object_relation (source_object_id, target_object_id, relation_type_id, created_at)
SELECT c.id, v.id, rt.id, NOW()
FROM object c, object v, ref_object_relation_type rt
WHERE c.object_type='CAMP' AND c.region_code='TST' AND c.name='Camping Nature Test'
  AND v.object_type='VIL' AND v.region_code='TST' AND v.name='Village Test Authentique'
  AND rt.code='part_of'
  AND NOT EXISTS (
    SELECT 1 FROM object_relation r WHERE r.source_object_id=c.id AND r.target_object_id=v.id AND r.relation_type_id=rt.id
  );

-- =====================================================
-- FMA – add more occurrences (multi-day)
-- =====================================================
INSERT INTO object_fma_occurrence (object_id, start_at, end_at, state, created_at, updated_at)
SELECT o.id, TIMESTAMPTZ '2025-12-16 18:00:00+04', TIMESTAMPTZ '2025-12-16 23:00:00+04', 'confirmed', NOW(), NOW()
FROM object o
WHERE o.object_type='FMA' AND o.region_code='TST' AND o.name='Festival Créole Test'
  AND NOT EXISTS (
    SELECT 1 FROM object_fma_occurrence ofo WHERE ofo.object_id=o.id AND ofo.start_at=TIMESTAMPTZ '2025-12-16 18:00:00+04'
  );

INSERT INTO object_fma_occurrence (object_id, start_at, end_at, state, created_at, updated_at)
SELECT o.id, TIMESTAMPTZ '2025-12-17 18:00:00+04', TIMESTAMPTZ '2025-12-17 23:00:00+04', 'confirmed', NOW(), NOW()
FROM object o
WHERE o.object_type='FMA' AND o.region_code='TST' AND o.name='Festival Créole Test'
  AND NOT EXISTS (
    SELECT 1 FROM object_fma_occurrence ofo WHERE ofo.object_id=o.id AND ofo.start_at=TIMESTAMPTZ '2025-12-17 18:00:00+04'
  );

-- =====================================================
-- Status variety: demo draft and archived objects
-- =====================================================
INSERT INTO object (object_type, name, region_code, status, created_at, updated_at)
SELECT 'RES','Restaurant Brouillon Test','TST','draft',NOW(),NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM object o WHERE o.object_type='RES' AND o.region_code='TST' AND o.name='Restaurant Brouillon Test'
);

INSERT INTO object (object_type, name, region_code, status, created_at, updated_at)
SELECT 'ASC','Association Archivée Test','TST','archived',NOW(),NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM object o WHERE o.object_type='ASC' AND o.region_code='TST' AND o.name='Association Archivée Test'
);

-- Minimal locations for those demo objects
INSERT INTO object_location (object_id, address1, postcode, city, is_main_location, position, created_at, updated_at)
SELECT o.id, 'Adresse inconnue', '97400', 'Saint-Denis', TRUE, 1, NOW(), NOW()
FROM object o
WHERE o.region_code='TST' AND o.name IN ('Restaurant Brouillon Test','Association Archivée Test')
  AND NOT EXISTS (
    SELECT 1 FROM object_location ol WHERE ol.object_id=o.id AND ol.is_main_location IS TRUE
  );

-- =====================================================
-- Org preference: add OTI descriptions for HPA and HLO
-- =====================================================
INSERT INTO object_description (object_id, org_object_id, description, description_chapo, visibility, created_at, updated_at)
SELECT o.id, oti.id,
  'Gîte confortable géré localement. Idéal pour familles.',
  'Gîte familial – vue océan', 'public', NOW(), NOW()
FROM object o
JOIN object oti ON oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
WHERE o.object_type='HPA' AND o.region_code='TST' AND o.name='Gîte Particulier Test'
  AND NOT EXISTS (
    SELECT 1 FROM object_description d WHERE d.object_id=o.id AND d.org_object_id=oti.id
  );

INSERT INTO object_description (object_id, org_object_id, description, description_chapo, visibility, created_at, updated_at)
SELECT o.id, oti.id,
  'Résidence de loisirs avec équipements bien-être et animations.',
  'Résidence loisirs – bien-être', 'public', NOW(), NOW()
FROM object o
JOIN object oti ON oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
WHERE o.object_type='HLO' AND o.region_code='TST' AND o.name='Résidence Loisir Test'
  AND NOT EXISTS (
    SELECT 1 FROM object_description d WHERE d.object_id=o.id AND d.org_object_id=oti.id
  );

-- =====================================================
-- ENHANCEMENTS: COM (Commerce) – richer shop scenarios
-- =====================================================

-- 1) Classification scheme for retail categories
INSERT INTO ref_classification_scheme (code, name, description, selection, position)
SELECT 'retail_category','Catégories de commerce','Catégorisation des commerces de détail','single', 50
WHERE NOT EXISTS (
  SELECT 1 FROM ref_classification_scheme s WHERE s.code='retail_category'
);

WITH s AS (
  SELECT id FROM ref_classification_scheme WHERE code='retail_category'
)
INSERT INTO ref_classification_value (scheme_id, code, name, ordinal)
SELECT s.id, v.code, v.name, v.ord
FROM s, (VALUES
  ('souvenir','Boutique de souvenirs',1),
  ('artisanal','Artisanat / produits locaux',2),
  ('bakery','Boulangerie / pâtisserie',3),
  ('pharmacy','Pharmacie',4),
  ('supermarket','Supermarché',5)
) AS v(code,name,ord)
WHERE NOT EXISTS (
  SELECT 1 FROM ref_classification_value cv
  WHERE cv.scheme_id = s.id AND cv.code = v.code
);

-- 2) Tags useful for retail use-cases
INSERT INTO ref_tag (slug, name, description, position)
VALUES ('shopping','Shopping','Commerces et boutiques',10)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO ref_tag (slug, name, description, position)
VALUES ('local_products','Produits locaux','Produits du terroir, artisanat',11)
ON CONFLICT (slug) DO NOTHING;

-- 3) Enhance existing COM object: "Boutique Artisanale Test"
--    Add languages, payments, opening hours, media, tags, classification, discount

-- Languages (FR/EN)
INSERT INTO object_language (object_id, language_id, created_at)
SELECT o.id, l.id, NOW()
FROM object o JOIN ref_language l ON l.code IN ('fr','en')
WHERE o.object_type='COM' AND o.region_code='TST' AND o.name='Boutique Artisanale Test'
  AND NOT EXISTS (SELECT 1 FROM object_language ol WHERE ol.object_id=o.id AND ol.language_id=l.id);

-- Payments
INSERT INTO object_payment_method (object_id, payment_method_id, created_at)
SELECT o.id, pm.id, NOW()
FROM object o JOIN ref_code_payment_method pm ON pm.code IN ('especes','carte_bleue','visa','mastercard')
WHERE o.object_type='COM' AND o.region_code='TST' AND o.name='Boutique Artisanale Test'
  AND NOT EXISTS (SELECT 1 FROM object_payment_method x WHERE x.object_id=o.id AND x.payment_method_id=pm.id);

-- Opening: daily 10:00–19:00 (regular)
INSERT INTO opening_period (object_id, name, all_years, created_at, updated_at)
SELECT o.id, 'Ouverture boutique', TRUE, NOW(), NOW()
FROM object o
WHERE o.object_type='COM' AND o.region_code='TST' AND o.name='Boutique Artisanale Test'
  AND NOT EXISTS (
    SELECT 1 FROM opening_period op WHERE op.object_id=o.id AND op.all_years IS TRUE AND COALESCE(op.name,'')='Ouverture boutique'
  );

INSERT INTO opening_schedule (period_id, schedule_type_id, name, created_at, updated_at)
SELECT op.id, rst.id, 'Tous les jours', NOW(), NOW()
FROM opening_period op
JOIN object o ON o.id=op.object_id
JOIN ref_code_opening_schedule_type rst ON rst.code='regular'
WHERE o.object_type='COM' AND o.region_code='TST' AND o.name='Boutique Artisanale Test'
  AND NOT EXISTS (
    SELECT 1 FROM opening_schedule os WHERE os.period_id=op.id AND os.schedule_type_id=rst.id
  );

INSERT INTO opening_time_period (schedule_id, closed, created_at, updated_at)
SELECT os.id, FALSE, NOW(), NOW()
FROM opening_schedule os
JOIN opening_period op ON op.id=os.period_id
JOIN object o ON o.id=op.object_id
JOIN ref_code_opening_schedule_type rst ON rst.id=os.schedule_type_id AND rst.code='regular'
WHERE o.object_type='COM' AND o.region_code='TST' AND o.name='Boutique Artisanale Test'
  AND NOT EXISTS (
    SELECT 1 FROM opening_time_period tp WHERE tp.schedule_id=os.id AND tp.closed=FALSE
  );

INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
SELECT tp.id, w.id
FROM opening_time_period tp
JOIN opening_schedule os ON os.id=tp.schedule_id
JOIN opening_period op ON op.id=os.period_id
JOIN object o ON o.id=op.object_id
JOIN ref_code_weekday w ON w.code IN ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')
WHERE o.object_type='COM' AND o.region_code='TST' AND o.name='Boutique Artisanale Test'
  AND NOT EXISTS (
    SELECT 1 FROM opening_time_period_weekday tw WHERE tw.time_period_id=tp.id AND tw.weekday_id=w.id
  );

INSERT INTO opening_time_frame (time_period_id, start_time, end_time, created_at, updated_at)
SELECT tp.id, TIME '10:00', TIME '19:00', NOW(), NOW()
FROM opening_time_period tp
JOIN opening_schedule os ON os.id=tp.schedule_id
JOIN opening_period op ON op.id=os.period_id
JOIN object o ON o.id=op.object_id
JOIN ref_code_opening_schedule_type rst ON rst.id=os.schedule_type_id AND rst.code='regular'
WHERE o.object_type='COM' AND o.region_code='TST' AND o.name='Boutique Artisanale Test'
  AND NOT EXISTS (
    SELECT 1 FROM opening_time_frame tf WHERE tf.time_period_id=tp.id AND tf.start_time=TIME '10:00' AND tf.end_time=TIME '19:00'
  );

-- Media
INSERT INTO media (object_id, media_type_id, title, url, kind, is_main, is_published, position, created_at, updated_at)
SELECT o.id, mt.id, 'Logo Boutique Artisanale', 'https://static.example.com/logos/boutique-artisanale.svg', 'logo', TRUE, TRUE, 1, NOW(), NOW()
FROM object o JOIN ref_code_media_type mt ON mt.code='vector'
WHERE o.object_type='COM' AND o.region_code='TST' AND o.name='Boutique Artisanale Test'
  AND NOT EXISTS (
    SELECT 1 FROM media m WHERE m.object_id=o.id AND m.kind='logo'
  );

INSERT INTO media (object_id, media_type_id, title, url, kind, is_main, is_published, position, created_at, updated_at)
SELECT o.id, mt.id, 'Devanture boutique artisanale', 'https://images.example.com/commerces/boutique-artisanale.jpg', 'illustration', TRUE, TRUE, 2, NOW(), NOW()
FROM object o JOIN ref_code_media_type mt ON mt.code='photo'
WHERE o.object_type='COM' AND o.region_code='TST' AND o.name='Boutique Artisanale Test'
  AND NOT EXISTS (
    SELECT 1 FROM media m WHERE m.object_id=o.id AND m.media_type_id=mt.id AND m.is_main IS TRUE
  );

-- Tags
INSERT INTO tag_link (tag_id, target_table, target_pk, created_at)
SELECT t.id, 'object', o.id, NOW()
FROM object o, ref_tag t
WHERE o.object_type='COM' AND o.region_code='TST' AND o.name='Boutique Artisanale Test'
  AND t.slug IN ('shopping','local_products')
  AND NOT EXISTS (
    SELECT 1 FROM tag_link tl WHERE tl.tag_id=t.id AND tl.target_table='object' AND tl.target_pk=o.id
  );

-- Classification: retail_category=artisanal
INSERT INTO object_classification (object_id, scheme_id, value_id, created_at, updated_at)
SELECT o.id, cs.id, cv.id, NOW(), NOW()
FROM object o, ref_classification_scheme cs, ref_classification_value cv
WHERE o.object_type='COM' AND o.region_code='TST' AND o.name='Boutique Artisanale Test'
  AND cs.code='retail_category' AND cv.scheme_id=cs.id AND cv.code='artisanal'
  AND NOT EXISTS (
    SELECT 1 FROM object_classification oc WHERE oc.object_id=o.id AND oc.scheme_id=cs.id AND oc.value_id=cv.id
  );

-- Discount example
INSERT INTO object_discount (object_id, conditions, discount_percent, valid_from, valid_to, source, created_at, updated_at)
SELECT o.id, 'Offre découverte – 10% sur produits du terroir', 10.00, CURRENT_DATE, CURRENT_DATE + INTERVAL '1 month', 'promotion', NOW(), NOW()
FROM object o
WHERE o.object_type='COM' AND o.region_code='TST' AND o.name='Boutique Artisanale Test'
  AND NOT EXISTS (
    SELECT 1 FROM object_discount od WHERE od.object_id=o.id AND od.conditions='Offre découverte – 10% sur produits du terroir'
  );


WITH cap AS (
  SELECT id, code FROM ref_capacity_metric
), t(name_code, name_en, name_es, desc_en, desc_es) AS (
  VALUES
    ('beds','Beds','Camas','Number of beds','Número de camas'),
    ('bedrooms','Bedrooms','Habitaciones','Number of bedrooms','Número de habitaciones'),
    ('max_capacity','Maximum capacity','Capacidad máxima','Maximum guest capacity (people)','Capacidad máxima de acogida (personas)'),
    ('seats','Seats','Asientos','Number of seated places','Número de plazas sentadas'),
    ('standing_places','Standing places','Plazas de pie','Number of standing places','Número de plazas de pie'),
    ('pitches','Pitches','Parcelas','Number of camping pitches','Número de parcelas de camping'),
    ('campers','Campervans','Autocaravanas','Campervan capacity','Capacidad de autocaravanas'),
    ('tents','Tents','Tiendas','Tent capacity','Capacidad de tiendas'),
    ('vehicles','Vehicles','Vehículos','Vehicle capacity','Capacidad de vehículos'),
    ('bikes','Bikes','Bicicletas','Bike capacity','Capacidad de bicicletas'),
    ('meeting_rooms','Meeting rooms','Salas de reuniones','Number of meeting rooms','Número de salas de reuniones'),
    ('floor_area_m2','Floor area (m²)','Superficie (m²)','Usable floor area in square metres','Superficie útil en metros cuadrados')
)
INSERT INTO i18n_translation (target_table, target_pk, target_column, language_id, value_text)
SELECT 'ref_capacity_metric', cap.id::text, 'description', rl.id, CASE rl.code WHEN 'en' THEN t.desc_en WHEN 'es' THEN t.desc_es END
FROM cap
JOIN t ON t.name_code = cap.code
JOIN ref_language rl ON rl.code IN ('en','es')
ON CONFLICT (target_table, target_pk, target_column, language_id) DO UPDATE
SET value_text = EXCLUDED.value_text;