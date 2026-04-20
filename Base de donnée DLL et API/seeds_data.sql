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
 -- booking.com retiré de social_network — voir domaine distribution_channel (Lot 1, 2026-03-20)
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

-- Tags de médias (catégorisation multi-dimensionnelle)
INSERT INTO ref_code (domain, code, name, description, position, icon_url) VALUES
-- 1. Contenu / Sujet (position 100-199)
 ('media_tag','facade','Façade / Extérieur','Vue extérieure du bâtiment', 100, NULL),
 ('media_tag','interieur','Intérieur','Vues intérieures générales', 110, NULL),
 ('media_tag','chambre','Chambre','Chambres d''hébergement', 120, NULL),
 ('media_tag','salle_bain','Salle de bain','Salles de bain', 130, NULL),
 ('media_tag','cuisine','Cuisine / Plats','Photos culinaires et gastronomiques', 140, NULL),
 ('media_tag','equipement','Équipements','Installations et équipements', 150, NULL),
 ('media_tag','paysage','Paysage','Vue panoramique et environnement', 160, NULL),
 ('media_tag','activite','Activités','Sports, loisirs, animations', 170, NULL),
 ('media_tag','evenement','Événement','Événements spéciaux et manifestations', 180, NULL),
 ('media_tag','parking','Parking','Zone de stationnement', 190, NULL),
 ('media_tag','piscine','Piscine / Spa','Piscine, spa, espace wellness', 200, NULL),
 ('media_tag','restaurant','Restaurant','Salle de restaurant et espace repas', 210, NULL),
 ('media_tag','reunion','Salle de réunion','Espaces professionnels et salles de conférence', 220, NULL),
 ('media_tag','plan_carte','Plan / Carte','Plans, schémas, cartes', 230, NULL),
-- 2. Source / Qualité (position 300-399)
 ('media_tag','officiel','Officiel','Photo officielle validée', 300, NULL),
 ('media_tag','professionnel','Professionnel','Photographe professionnel', 310, NULL),
 ('media_tag','contributeur','Contributeur','Contribution utilisateur ou partenaire', 320, NULL),
 ('media_tag','prefere','Préférée','Photo à mettre en avant en priorité', 330, NULL),
-- 3. Usage / Sensibilité (position 400-499) - EXCLUSION WEB
 ('media_tag','interne','Usage interne','Réservé à un usage interne uniquement', 400, NULL),
 ('media_tag','personnel','Personnel','Photo du personnel (sensible)', 410, NULL),
 ('media_tag','document','Document administratif','Document administratif ou certificat', 420, NULL),
 ('media_tag','archive','Archive','Ancienne photo obsolète à ne plus afficher', 430, NULL),
 ('media_tag','brouillon','Brouillon','Photo non validée ou en attente de validation', 440, NULL)
ON CONFLICT DO NOTHING;

-- Type média vectoriel (pour logos SVG/PDF)
INSERT INTO ref_code (domain, code, name, description)
VALUES ('media_type','vector','Vectoriel','Fichiers vectoriels (SVG, PDF)')
ON CONFLICT DO NOTHING;

-- Sources d'avis externes
INSERT INTO ref_review_source (code, name, icon_url, base_url) VALUES
('tripadvisor', 'TripAdvisor', 'https://static.tacdn.com/img2/brand_refresh/Tripadvisor_logomark.svg', 'https://www.tripadvisor.com'),
('google', 'Google', 'https://www.google.com/images/branding/googlelogo.svg', 'https://www.google.com/maps'),
('booking', 'Booking.com', 'https://cf.bstatic.com/static/img/favicon.ico', 'https://www.booking.com'),
('expedia', 'Expedia', NULL, 'https://www.expedia.com'),
('hotels_com', 'Hotels.com', NULL, 'https://www.hotels.com'),
('airbnb', 'Airbnb', NULL, 'https://www.airbnb.com'),
('internal', 'Avis interne', NULL, NULL)
ON CONFLICT (code) DO NOTHING;

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
 ('amenity_family','sustainable','Développement durable','Initiatives et équipements responsables'),
 -- Les 11 familles ci-dessous sont référencées par le bloc ref_amenity (VALUES fam_code)
 -- mais étaient absentes de ce bloc, ce qui faisait échouer silencieusement la majorité
 -- des insertions dans ref_amenity (JOIN sans correspondance). Ajout correctif 2026-03-21.
 ('amenity_family','general','Général','Équipements généraux transversaux (WiFi, TV, coffre-fort, etc.)'),
 ('amenity_family','climate_control','Climatisation & chauffage','Systèmes de régulation thermique'),
 ('amenity_family','kitchen','Cuisine','Équipements de cuisine et coin repas'),
 ('amenity_family','kids','Enfants','Équipements et services dédiés aux enfants'),
 ('amenity_family','pets','Animaux','Services et équipements pour animaux de compagnie'),
 ('amenity_family','bathroom','Salle de bain','Équipements de salle de bain'),
 ('amenity_family','bedroom','Chambre','Équipements et mobilier de chambre'),
 ('amenity_family','entertainment','Divertissement','Équipements de loisirs et divertissement'),
 ('amenity_family','security','Sécurité','Dispositifs de sécurité et surveillance'),
 ('amenity_family','parking','Parking','Équipements de stationnement'),
 ('amenity_family','sports','Sports & loisirs','Équipements sportifs et de loisirs extérieurs')
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
('payment_method','crypto', 'Cryptomonnaie', 'Paiement en cryptomonnaies acceptées'),
-- Ticket Restaurant (Sodexo / Edenred / Up) : titre-restaurant accepté comme moyen de paiement.
-- Distinct de cheque_vacances (ANCV). Ajout 2026-03-21 — requis par import Berta 2.0 (La Kaz, Le Gadjak).
-- Source CSV : 'Tickets restaurant'. Eurocard normalisé vers 'mastercard' (réseau fusionné).
('payment_method','tickets_restaurant', 'Tickets restaurant', 'Titres-restaurant (Sodexo, Edenred, Up) acceptés')
ON CONFLICT DO NOTHING;

-- Rôles de contact de base
INSERT INTO ref_contact_role (code, name, description) VALUES
('reservation', 'Réservation', 'Contact pour réservations'),
('management', 'Management', 'Direction / management'),
('press', 'Presse', 'Relations presse'),
('technical', 'Technique', 'Support technique / IT'),
('sales', 'Commercial', 'Ventes / commercial'),
('info', 'Information', 'Informations générales')
ON CONFLICT DO NOTHING;

INSERT INTO ref_code (domain, code, name, description) VALUES
('environment_tag','volcan', 'Au pied du volcan', 'Situé au pied du Piton de la Fournaise'),
('environment_tag','plage', 'Plage', 'Proche d''une plage'),
('environment_tag','lagon', 'Lagon', 'Proche du lagon'),
('environment_tag','cascade', 'Cascade', 'Proche d''une cascade'),
-- Rivière : cours d'eau à proximité — distinct de cascade (chute) et lagon (zone marine). Ajout 2026-03-21 — requis par import Berta 2.0 (Prestations à proximité).
('environment_tag','riviere', 'Rivière', 'Proche d''un cours d''eau ou d''une rivière'),
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

-- ─── Lot 1 — 2026-03-20 ──────────────────────────────────────────────────────

-- Canaux de diffusion OTA / plateformes de réservation.
-- Booking.com est UNIQUEMENT ici — ne pas l'ajouter dans social_network.
-- Règle de migration future : toute donnée historique classant Booking comme
-- réseau social doit être remappée vers distribution_channel.booking.
INSERT INTO ref_code (domain, code, name, description, position) VALUES
 ('distribution_channel','airbnb',   'Airbnb',        'Plateforme de location courte durée Airbnb',           1),
 ('distribution_channel','booking',  'Booking.com',   'Plateforme de réservation hôtelière Booking.com',      2),
 ('distribution_channel','abritel',  'Abritel',       'Plateforme de location de vacances Abritel / Vrbo',    3),
 ('distribution_channel','leboncoin','Leboncoin',      'Annonces de location sur Leboncoin',                   4)
ON CONFLICT DO NOTHING;

-- Sujets CRM réels de l'OTI Sud — 20 valeurs normalisées depuis l'Excel source.
-- "Accompagnement taxe de séjour" (casse minuscule, 5 occ.) normalisé sur
-- "Accompagnement Taxe de séjour" (casse canonique, 636 occ.).
-- "Promotion  Explore" (double espace) normalisé sur "Promotion Explore".
-- "Problème  juridique, Sirene" (double espace) normalisé sur "Problème juridique, Sirene".
-- Ce domaine est additif : demand_topic générique est conservé intact.
INSERT INTO ref_code (domain, code, name, position) VALUES
 ('crm_demand_topic_oti','accompagnement_taxe_sejour',  'Accompagnement Taxe de séjour',      1),
 ('crm_demand_topic_oti','promotion_sit',               'Promotion SIT (reunion.fr)',           2),
 ('crm_demand_topic_oti','demande_signaletique',        'Demande signalétique',                3),
 ('crm_demand_topic_oti','promotion_explore',           'Promotion Explore',                   4),
 ('crm_demand_topic_oti','partenaire_b2c',              'Partenaire d''une action B To C',     5),
 ('crm_demand_topic_oti','promotion_facebook',          'Promotion Facebook',                  6),
 ('crm_demand_topic_oti','fermeture_definitive',        'Fermeture définitive',                7),
 ('crm_demand_topic_oti','labels_classements_etoiles',  'Labels et classements étoiles',       8),
 ('crm_demand_topic_oti','autres',                      'Autres',                              9),
 ('crm_demand_topic_oti','modification_infos_bdd',      'Modification infos BDD',              10),
 ('crm_demand_topic_oti','fermeture_provisoire',        'Fermeture provisoire',                11),
 ('crm_demand_topic_oti','porteur_de_projet',           'Porteur de projet(s)',                12),
 ('crm_demand_topic_oti','demande_de_visite',           'Demande de visite',                   13),
 ('crm_demand_topic_oti','participants_atelier_presta', 'Participants d''un atelier presta',   14),
 ('crm_demand_topic_oti','ousaile',                     'Ousailé',                             15),
 ('crm_demand_topic_oti','demande_attestation_oti',     'Demande d''attestation OTI',          16),
 ('crm_demand_topic_oti','probleme_juridique_sirene',   'Problème juridique, Sirene',          17),
 ('crm_demand_topic_oti','plainte_client',              'Plainte client',                      18),
 ('crm_demand_topic_oti','boutique',                    'Boutique',                            19),
 ('crm_demand_topic_oti','dispositifs_financiers',      'Dispositifs financiers',              20)
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
('dietary_tag','local', 'Local', 'Produits locaux de La Réunion')
ON CONFLICT DO NOTHING;

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
    -- Ventilateur : distinct de la climatisation — courant à La Réunion. Ajout 2026-03-21.
    ('fan','Ventilateur','climate_control','Ventilateur (plafond ou mobile)'),
    ('safe','Coffre-fort','general','Coffre-fort sécurisé'),
    ('elevator','Ascenseur','general','Ascenseur'),
    -- Téléphone en chambre ou espace commun. Ajout 2026-03-21.
    ('telephone','Téléphone','general','Téléphone en chambre ou en espace commun'),
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
    -- Linge de toilette : serviettes fournies — distinct des peignoirs (bathrobes). Ajout 2026-03-21.
    ('towels','Linge de toilette','bathroom','Serviettes de toilette fournies'),
    -- Sanitaires privatifs en-suite : clé pour hébergements HLO/gîte. Ajout 2026-03-21.
    ('private_bathroom','Sanitaires privés','bathroom','Salle de bain / WC privatifs (en-suite)'),
    -- Bloc sanitaire commun : signal opposé à private_bathroom. Ajout 2026-03-21.
    ('shared_bathroom','Sanitaires communs','bathroom','Bloc sanitaire commun (douches / WC partagés)'),

    -- Équipements de chambre
    ('blackout_curtains','Rideaux occultants','bedroom','Rideaux occultants'),
    ('extra_pillows','Oreillers supplémentaires','bedroom','Oreillers supplémentaires'),
    ('iron','Fer à repasser','bedroom','Fer à repasser'),
    ('desk','Bureau','bedroom','Bureau de travail'),
    ('sofa','Canapé','bedroom','Canapé'),
    ('balcony','Balcon','bedroom','Balcon privé'),
    ('private_terrace','Terrasse privée','bedroom','Terrasse privée'),
    -- Linge de maison : draps, housses, taies fournis — distinct du linge de toilette. Ajout 2026-03-21.
    ('bed_linen','Linge de maison','bedroom','Linge de lit fourni (draps, housses, taies)'),

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
    -- Mobilier d'extérieur : tables/chaises/salon de jardin — distinct des transats (sunbeds, usage balnéaire). Ajout 2026-03-21.
    ('outdoor_furniture','Mobilier d''extérieur','outdoor','Tables, chaises et salon de jardin en extérieur'),

    -- Accessibilité — codes canoniques acc_* uniquement (V5, seeded in Accessibilité V5 section below).
    -- Legacy non-acc_* codes removed 2026-03-22: wheelchair_access, accessible_bathroom,
    -- accessible_parking, hearing_impaired, braille_signage, tactile_flooring, audio_description,
    -- large_print, guide_dog_welcome, induction_loop, sign_language, visual_alerts,
    -- subtitles_available, written_communication, easy_read, pictograms, quiet_space,
    -- sensory_room, staff_trained_cognitive, staff_trained_mental, flexible_visit, low_stimulation.
    -- 10 new canonical acc_* codes for previously no-equiv concepts also seeded in V5 section below.

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
    ('public_toilets','Toilettes publiques','services','Toilettes publiques accessibles'),
    ('drinking_water','Point d''eau potable','services','Fontaine / robinet eau potable en libre service'),
    
    -- Services spécialisés
    ('spa','Spa','services','Centre de spa'),
    ('car_rental','Location voiture','services','Service de location de voiture'),
    ('airport_shuttle','Navette aéroport','services','Navette aéroport'),
    ('tour_desk','Bureau d''excursions','services','Bureau d''excursions et activités'),
    -- Pressing : nettoyage à sec / repassage — distinct de la blanchisserie (laundry). Ajout 2026-03-21.
    ('pressing','Pressing','services','Service de pressing / nettoyage à sec'),
    -- Boutique : espace de vente sur place. Ajout 2026-03-21.
    ('boutique','Boutique','services','Boutique / espace de vente sur place'),
    -- Réception : présence d''un accueil physique — distinct de la conciergerie (service premium). Ajout 2026-03-21.
    ('reception','Réception','services','Réception / accueil avec personnel sur place'),

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
    ('swimming_equipment','Équipement natation','sports','Équipement de natation'),

    -- Bien-être (wellness family : 0 codes avant ce patch)
    -- Massage : soin sur place — distinct de spa (centre spa). Wellness est la famille canonique. Ajout 2026-03-21.
    ('massage','Massages / Bien-être','wellness','Soins et massages sur place'),

    -- Gastronomie (gastronomy family : 0 codes avant ce patch)
    -- Salle à manger commune (non commerciale) : partagée dans un gîte/HLO — distinct de restaurant (établissement commercial). Ajout 2026-03-21.
    ('dining_room','Salle à manger','gastronomy','Salle à manger commune (usage non commercial, gîte / HLO)')
) AS v(code,name,fam_code,description)
JOIN ref_code_amenity_family fam ON fam.code = v.fam_code
WHERE NOT EXISTS (SELECT 1 FROM ref_amenity ra WHERE ra.code = v.code);

-- Types HOT via ref_classification_scheme/value
INSERT INTO ref_classification_scheme (code, name) VALUES ('type_hot','Type d''hôtel')
ON CONFLICT (code) DO NOTHING;
INSERT INTO ref_classification_value (scheme_id, code, name)
SELECT rcs.id, v.code, v.name
FROM ref_classification_scheme rcs,
     (VALUES
       ('hotel','Hôtel'),
       ('hotel_with_restaurant','Hôtel-restaurant'),
       ('boutique_hotel','Hôtel boutique'),
       ('eco_hotel','Hôtel écologique'),
       ('heritage_hotel','Hôtel historique'),
       ('modern_hotel','Hôtel moderne'),
       ('traditional_hotel','Hôtel traditionnel'),
       ('family_hotel','Hôtel familial'),
       ('romantic_hotel','Hôtel romantique'),
       ('business_hotel','Hôtel d''affaires')
     ) AS v(code,name)
WHERE rcs.code='type_hot'
  AND NOT EXISTS (
    SELECT 1 FROM ref_classification_value cv
    WHERE cv.scheme_id = rcs.id AND cv.code = v.code
  );


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
ON CONFLICT DO NOTHING;

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
ON CONFLICT DO NOTHING;

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
ON CONFLICT DO NOTHING;

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
('activity_type', 'bird_watching', 'Observation d''oiseaux', 'Observation d''oiseaux', 10)
ON CONFLICT DO NOTHING;

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
ON CONFLICT DO NOTHING;

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
ON CONFLICT DO NOTHING;

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
ON CONFLICT DO NOTHING;

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
ON CONFLICT DO NOTHING;

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
ON CONFLICT DO NOTHING;

-- Types de promotions additionnels
INSERT INTO ref_code (domain, code, name, description, position) VALUES
('promotion_type', 'partner', 'Partenaire', 'Offre partenaire', 11),
('promotion_type', 'weekend', 'Week-end', 'Offre week-end', 12),
('promotion_type', 'long_stay', 'Long séjour', 'Réduction pour séjours longs', 13),
('promotion_type', 'holiday', 'Vacances', 'Offre vacances et jours fériés', 14)
ON CONFLICT DO NOTHING;

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
('insurance_type', 'group', 'Assurance groupe', 'Assurance pour groupes', 10)
ON CONFLICT DO NOTHING;

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
ON CONFLICT DO NOTHING;

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
ON CONFLICT DO NOTHING;

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
ON CONFLICT DO NOTHING;

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
ON CONFLICT DO NOTHING;

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
ON CONFLICT DO NOTHING;

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
ON CONFLICT DO NOTHING;

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
ON CONFLICT DO NOTHING;

-- Types de vue (chambres)
INSERT INTO ref_code (domain, code, name, description, position) VALUES
('view_type', 'sea', 'Vue mer', 'Vue sur la mer ou l''océan', 1),
('view_type', 'ocean', 'Vue océan', 'Vue panoramique sur l''océan', 2),
('view_type', 'mountain', 'Vue montagne', 'Vue sur les montagnes', 3),
('view_type', 'garden', 'Vue jardin', 'Vue sur le jardin', 4),
('view_type', 'pool', 'Vue piscine', 'Vue sur la piscine', 5),
('view_type', 'city', 'Vue ville', 'Vue sur la ville', 6),
('view_type', 'courtyard', 'Vue cour', 'Vue sur la cour intérieure', 7),
('view_type', 'street', 'Vue rue', 'Vue sur la rue', 8),
('view_type', 'park', 'Vue parc', 'Vue sur le parc', 9),
('view_type', 'lake', 'Vue lac', 'Vue sur le lac', 10),
('view_type', 'river', 'Vue rivière', 'Vue sur la rivière', 11),
('view_type', 'forest', 'Vue forêt', 'Vue sur la forêt', 12),
('view_type', 'none', 'Sans vue particulière', 'Pas de vue spécifique', 99)
ON CONFLICT DO NOTHING;


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
-- SECTION PRODUCTION ORGANIZATIONS
-- =====================================================

-- OTI du Sud — organisation de référence pour le portage des fiches dans le SIT.
-- Prérequis au pilote d'import — voir lot1_mapping_plan.md §7.F
-- region_code='RUN' : île de La Réunion. Immuable une fois posé.
INSERT INTO object (object_type, name, region_code, status, created_at, updated_at)
SELECT 'ORG', 'OTI du Sud', 'RUN', 'published', NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM object
  WHERE object_type = 'ORG' AND name = 'OTI du Sud' AND region_code = 'RUN'
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
FROM object o, object oti
WHERE o.object_type='PCU' AND o.region_code='TST' AND o.name='Point Culture Urbaine Test'
  AND oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
  AND NOT EXISTS (SELECT 1 FROM object_description od WHERE od.object_id=o.id AND od.org_object_id=oti.id);

-- PCU - Lien organisation
INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary, created_at, updated_at)
SELECT o.id, oti.id, ror.id, TRUE, NOW(), NOW()
FROM object o, object oti, ref_org_role ror
WHERE o.object_type='PCU' AND o.region_code='TST' AND o.name='Point Culture Urbaine Test'
  AND oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
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
FROM object o, object oti
WHERE o.object_type='PNA' AND o.region_code='TST' AND o.name='Point Nature Aventure Test'
  AND oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
  AND NOT EXISTS (SELECT 1 FROM object_description od WHERE od.object_id=o.id AND od.org_object_id=oti.id);

-- PNA - Lien organisation
INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary, created_at, updated_at)
SELECT o.id, oti.id, ror.id, TRUE, NOW(), NOW()
FROM object o, object oti, ref_org_role ror
WHERE o.object_type='PNA' AND o.region_code='TST' AND o.name='Point Nature Aventure Test'
  AND oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
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
FROM object o, object oti
WHERE o.object_type='VIL' AND o.region_code='TST' AND o.name='Village Test Authentique'
  AND oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
  AND NOT EXISTS (SELECT 1 FROM object_description od WHERE od.object_id=o.id AND od.org_object_id=oti.id);

-- VIL - Lien organisation
INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary, created_at, updated_at)
SELECT o.id, oti.id, ror.id, TRUE, NOW(), NOW()
FROM object o, object oti, ref_org_role ror
WHERE o.object_type='VIL' AND o.region_code='TST' AND o.name='Village Test Authentique'
  AND oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
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
FROM object o, object oti
WHERE o.object_type='HPA' AND o.region_code='TST' AND o.name='Gîte Particulier Test'
  AND oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
  AND NOT EXISTS (SELECT 1 FROM object_description od WHERE od.object_id=o.id AND od.org_object_id=oti.id);

-- HPA - Lien organisation
INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary, created_at, updated_at)
SELECT o.id, oti.id, ror.id, TRUE, NOW(), NOW()
FROM object o, object oti, ref_org_role ror
WHERE o.object_type='HPA' AND o.region_code='TST' AND o.name='Gîte Particulier Test'
  AND oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
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
FROM object o, object oti
WHERE o.object_type='ASC' AND o.region_code='TST' AND o.name='Association Culturelle Test'
  AND oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
  AND NOT EXISTS (SELECT 1 FROM object_description od WHERE od.object_id=o.id AND od.org_object_id=oti.id);

-- ASC - Lien organisation
INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary, created_at, updated_at)
SELECT o.id, oti.id, ror.id, TRUE, NOW(), NOW()
FROM object o, object oti, ref_org_role ror
WHERE o.object_type='ASC' AND o.region_code='TST' AND o.name='Association Culturelle Test'
  AND oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
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
FROM object o, object oti
WHERE o.object_type='COM' AND o.region_code='TST' AND o.name='Boutique Artisanale Test'
  AND oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
  AND NOT EXISTS (SELECT 1 FROM object_description od WHERE od.object_id=o.id AND od.org_object_id=oti.id);

-- COM - Lien organisation
INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary, created_at, updated_at)
SELECT o.id, oti.id, ror.id, TRUE, NOW(), NOW()
FROM object o, object oti, ref_org_role ror
WHERE o.object_type='COM' AND o.region_code='TST' AND o.name='Boutique Artisanale Test'
  AND oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
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
FROM object o, object oti
WHERE o.object_type='HLO' AND o.region_code='TST' AND o.name='Résidence Loisir Test'
  AND oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
  AND NOT EXISTS (SELECT 1 FROM object_description od WHERE od.object_id=o.id AND od.org_object_id=oti.id);

-- HLO - Lien organisation
INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary, created_at, updated_at)
SELECT o.id, oti.id, ror.id, TRUE, NOW(), NOW()
FROM object o, object oti, ref_org_role ror
WHERE o.object_type='HLO' AND o.region_code='TST' AND o.name='Résidence Loisir Test'
  AND oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
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
FROM object o, object oti
WHERE o.object_type='LOI' AND o.region_code='TST' AND o.name='Centre Loisirs Test'
  AND oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
  AND NOT EXISTS (SELECT 1 FROM object_description od WHERE od.object_id=o.id AND od.org_object_id=oti.id);

-- LOI - Lien organisation
INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary, created_at, updated_at)
SELECT o.id, oti.id, ror.id, TRUE, NOW(), NOW()
FROM object o, object oti, ref_org_role ror
WHERE o.object_type='LOI' AND o.region_code='TST' AND o.name='Centre Loisirs Test'
  AND oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
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
FROM object o, object oti
WHERE o.object_type='FMA' AND o.region_code='TST' AND o.name='Festival Créole Test'
  AND oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
  AND NOT EXISTS (SELECT 1 FROM object_description od WHERE od.object_id=o.id AND od.org_object_id=oti.id);

-- FMA - Lien organisation
INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary, created_at, updated_at)
SELECT o.id, oti.id, ror.id, TRUE, NOW(), NOW()
FROM object o, object oti, ref_org_role ror
WHERE o.object_type='FMA' AND o.region_code='TST' AND o.name='Festival Créole Test'
  AND oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
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
FROM object o, object oti
WHERE o.object_type='CAMP' AND o.region_code='TST' AND o.name='Camping Nature Test'
  AND oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
  AND NOT EXISTS (SELECT 1 FROM object_description od WHERE od.object_id=o.id AND od.org_object_id=oti.id);

-- CAMP - Lien organisation
INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary, created_at, updated_at)
SELECT o.id, oti.id, ror.id, TRUE, NOW(), NOW()
FROM object o, object oti, ref_org_role ror
WHERE o.object_type='CAMP' AND o.region_code='TST' AND o.name='Camping Nature Test'
  AND oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
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
FROM object o, object oti
WHERE o.object_type='ITI' AND o.region_code='TST' AND o.name='Randonnée Piton des Neiges'
  AND oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
  AND NOT EXISTS (SELECT 1 FROM object_description od WHERE od.object_id=o.id AND od.org_object_id=oti.id);

-- ITI - Lien organisation
INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary, created_at, updated_at)
SELECT o.id, oti.id, ror.id, TRUE, NOW(), NOW()
FROM object o, object oti, ref_org_role ror
WHERE o.object_type='ITI' AND o.region_code='TST' AND o.name='Randonnée Piton des Neiges'
  AND oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
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
INSERT INTO crm_interaction (object_id, actor_id, interaction_type, direction, status, subject, body, scheduled_at, created_at, updated_at)
SELECT h.id, a.id, 'email', 'inbound', 'done', 'Demande de réservation groupe', 'Bonjour, nous souhaiterions réserver 15 chambres pour un séminaire d''entreprise du 15 au 18 mars 2025.', TIMESTAMPTZ '2025-01-15 10:30:00+04', NOW(), NOW()
FROM object h, actor a
WHERE h.object_type='HOT' AND h.region_code='TST' AND h.name='Hôtel Test Océan'
  AND a.display_name='Alice MARTIN'
  AND NOT EXISTS (SELECT 1 FROM crm_interaction ci WHERE ci.object_id=h.id AND ci.subject='Demande de réservation groupe');

INSERT INTO crm_interaction (object_id, actor_id, interaction_type, direction, status, subject, body, scheduled_at, created_at, updated_at)
SELECT h.id, a.id, 'call', 'outbound', 'done', 'Suivi réservation groupe', 'Appel de suivi pour confirmer les détails de la réservation groupe.', TIMESTAMPTZ '2025-01-15 14:00:00+04', NOW(), NOW()
FROM object h, actor a
WHERE h.object_type='HOT' AND h.region_code='TST' AND h.name='Hôtel Test Océan'
  AND a.display_name='Alice MARTIN'
  AND NOT EXISTS (SELECT 1 FROM crm_interaction ci WHERE ci.object_id=h.id AND ci.subject='Suivi réservation groupe');

-- CRM Tasks
INSERT INTO crm_task (object_id, actor_id, title, description, priority, status, due_date, created_at, updated_at)
SELECT h.id, a.id, 'Préparer devis groupe', 'Établir un devis détaillé pour la réservation de 15 chambres', 'high', 'todo', DATE '2025-01-20', NOW(), NOW()
FROM object h, actor a
WHERE h.object_type='HOT' AND h.region_code='TST' AND h.name='Hôtel Test Océan'
  AND a.display_name='Alice MARTIN'
  AND NOT EXISTS (SELECT 1 FROM crm_task ct WHERE ct.object_id=h.id AND ct.title='Préparer devis groupe');

-- =====================================================
-- LEGAL RECORDS AND DOCUMENT MANAGEMENT
-- =====================================================

-- Legal types for comprehensive testing
INSERT INTO ref_legal_type (code, name, description, is_required, validity_mode, created_at, updated_at) VALUES
('siret', 'SIRET', 'Numéro SIRET de l''établissement', TRUE, 'forever', NOW(), NOW()),
('siren', 'SIREN', 'Numéro SIREN de l''entreprise', TRUE, 'forever', NOW(), NOW()),
('vat_number', 'Numéro TVA', 'Numéro de TVA intracommunautaire', FALSE, 'tacit_renewal', NOW(), NOW()),
('insurance_certificate', 'Attestation d''assurance', 'Attestation d''assurance responsabilité civile', TRUE, 'annual', NOW(), NOW()),
('fire_safety_certificate', 'Certificat sécurité incendie', 'Certificat de conformité sécurité incendie', TRUE, 'annual', NOW(), NOW()),
('food_safety_certificate', 'Certificat hygiène alimentaire', 'Certificat d''hygiène et sécurité alimentaire', FALSE, 'annual', NOW(), NOW()),
('tourism_license', 'Licence tourisme', 'Licence d''exploitation touristique', TRUE, 'annual', NOW(), NOW()),
('alcohol_license', 'Licence alcool', 'Licence de vente d''alcool', FALSE, 'annual', NOW(), NOW())
ON CONFLICT (code) DO NOTHING;

-- Legal records for Hotel Test Océan
INSERT INTO object_legal (object_id, type_id, value, validity_mode, status, is_public, created_at, updated_at)
SELECT h.id, t.id, jsonb_build_object('number','13002526500017', 'address','10 Rue des Plages, 97430 Le Tampon'), 'forever', 'active', TRUE, NOW(), NOW()
FROM object h, ref_legal_type t
WHERE h.object_type='HOT' AND h.region_code='TST' AND h.name='Hôtel Test Océan'
  AND t.code='siret'
  AND NOT EXISTS (SELECT 1 FROM object_legal ol WHERE ol.object_id=h.id AND ol.type_id=t.id);

INSERT INTO object_legal (object_id, type_id, value, validity_mode, status, is_public, created_at, updated_at)
SELECT h.id, t.id, jsonb_build_object('number','512345678', 'company_name','Hôtel Test Océan SARL'), 'forever', 'active', TRUE, NOW(), NOW()
FROM object h, ref_legal_type t
WHERE h.object_type='HOT' AND h.region_code='TST' AND h.name='Hôtel Test Océan'
  AND t.code='siren'
  AND NOT EXISTS (SELECT 1 FROM object_legal ol WHERE ol.object_id=h.id AND ol.type_id=t.id);

INSERT INTO object_legal (object_id, type_id, value, validity_mode, status, is_public, created_at, updated_at)
SELECT h.id, t.id, jsonb_build_object('number','FR76 1234 5678 90', 'valid_from','2024-01-01'), 'tacit_renewal', 'active', TRUE, NOW(), NOW()
FROM object h, ref_legal_type t
WHERE h.object_type='HOT' AND h.region_code='TST' AND h.name='Hôtel Test Océan'
  AND t.code='vat_number'
  AND NOT EXISTS (SELECT 1 FROM object_legal ol WHERE ol.object_id=h.id AND ol.type_id=t.id);

-- Legal records for Restaurant Test Océan
INSERT INTO object_legal (object_id, type_id, value, validity_mode, status, is_public, created_at, updated_at)
SELECT r.id, t.id, jsonb_build_object('number','13002526500018', 'address','10 Rue des Plages, 97430 Le Tampon'), 'forever', 'active', TRUE, NOW(), NOW()
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
SELECT o.id, ck.id, 'https://www.' || lower(replace(o.name, ' ', '-')) || '.re', TRUE, 1, NOW(), NOW()
FROM object o, ref_code_contact_kind ck
WHERE o.region_code='TST' AND o.object_type IN ('PCU','PNA','VIL','HPA','ASC','COM','HLO','LOI','FMA','CAMP','ITI')
  AND ck.code='website'
  AND NOT EXISTS (SELECT 1 FROM contact_channel cc WHERE cc.object_id=o.id AND cc.kind_id=ck.id);

-- Email contacts
INSERT INTO contact_channel (object_id, kind_id, value, is_primary, position, created_at, updated_at)
SELECT o.id, ck.id, 'contact@' || lower(replace(o.name, ' ', '-')) || '.re', TRUE, 2, NOW(), NOW()
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
FROM object o, object oti
WHERE o.region_code='TST' AND o.object_type IN ('PCU','PNA','VIL','HPA','ASC','COM','HLO','LOI','FMA','CAMP','ITI')
  AND oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
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
FROM object o, object oti
WHERE o.region_code='TST' AND o.object_type IN ('PCU','PNA','VIL','HPA','ASC','COM','HLO','LOI','FMA','CAMP','ITI')
  AND oti.object_type='ORG' AND oti.region_code='TST' AND oti.name='Office de Tourisme Intercommunal TEST'
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

-- Itinerary track data
INSERT INTO object_iti_track (object_id, track_format, track_data, created_at, updated_at)
SELECT o.id, 'gpx', '<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1"><trk><name>Randonnée Piton des Neiges</name><trkseg><trkpt lat="-21.1300" lon="55.4700"><ele>1200</ele></trkpt><trkpt lat="-21.1200" lon="55.4800"><ele>1400</ele></trkpt><trkpt lat="-21.1100" lon="55.4900"><ele>1600</ele></trkpt></trkseg></trk></gpx>', NOW(), NOW()
FROM object o
WHERE o.object_type='ITI' AND o.region_code='TST' AND o.name='Randonnée Piton des Neiges'
  AND NOT EXISTS (SELECT 1 FROM object_iti_track oit WHERE oit.object_id=o.id);

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

-- Menu categories for menu items
INSERT INTO object_menu_item_category (menu_item_id, category_id, created_at, updated_at)
SELECT mi.id, c.id, NOW(), NOW()
FROM object_menu_item mi
JOIN object_menu m ON m.id=mi.menu_id
JOIN object res ON res.id=m.object_id AND res.object_type='RES' AND res.name='Restaurant Test Océan' AND res.region_code='TST'
JOIN ref_code_menu_category c ON c.code='main'
WHERE mi.name IN ('Cari de poulet','Rougail tomates','Nuggets de poulet')
  AND NOT EXISTS (SELECT 1 FROM object_menu_item_category mic WHERE mic.menu_item_id=mi.id AND mic.category_id=c.id);

-- Menu item dietary tags
INSERT INTO object_menu_item_dietary_tag (menu_item_id, dietary_tag_id, created_at, updated_at)
SELECT mi.id, dt.id, NOW(), NOW()
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
-- operator : exploitant commercial ou gestionnaire opérationnel d'un objet ACT/HOT/HLO/RES.
-- Rôle canonique pour actor_object_role sur les objets ACT — défini dans CLAUDE.md et lot_act_plan.md §0.
-- Ajout 2026-03-21 — requis par lot1_pilot_inserts.sql (actor_object_role section).
('operator','Exploitant','Exploitant commercial ou gestionnaire opérationnel de l''établissement',5),
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
('recommended_with','Recommandé avec','Suggestion de co‑consommation',7),
-- ─── Lot ACT — 2026-03-21 ────────────────────────────────────────────────────
('uses_itinerary','Suit l''itinéraire','Une ACT emprunte un tracé ITI (randonnée guidée, VTT guidé)',8),
('based_at_site','Se pratique sur le site','Une ACT se déroule sur un PNA (canyoning, plongée, parapente)',9)
ON CONFLICT (code) DO NOTHING;

-- Schémas de classification (étoiles/labels)
INSERT INTO ref_classification_scheme (code, name, description, selection, position) VALUES
('hot_stars','Classement hôtelier','Classement officiel hôtels (étoiles)','single',1),
('camp_stars','Classement camping','Classement officiel campings (étoiles)','single',2),
('meuble_stars','Classement meublés','Classement officiel meublés de tourisme','single',3),
('gites_epics','Gîtes de France (épis)','Niveau Gîtes de France (épis)','single',4),
('clevacances_keys','Clévacances (clés)','Niveau Clévacances (clés)','single',5)
-- green_key, eu_ecolabel, tourisme_handicap retired from this seed block.
-- V5 canonical replacements: LBL_CLEF_VERTE, LBL_ECO_LABEL_UE, LBL_TOURISME_HANDICAP
-- seeded in the DÉVELOPPEMENT DURABLE V5 and ACCESSIBILITÉ V5 sections below.
ON CONFLICT (code) DO NOTHING;

-- Marquer les schemes reconnus comme distinctions métier (idempotent)
-- green_key, eu_ecolabel, tourisme_handicap removed — retired from canonical seed path.
UPDATE ref_classification_scheme
SET is_distinction = TRUE
WHERE code IN (
  'hot_stars', 'camp_stars', 'meuble_stars',
  'gites_epics', 'clevacances_keys'
);

-- Affecter le groupe d'affichage dashboard aux schemes existants (idempotent)
UPDATE ref_classification_scheme
SET display_group = 'official_classification'
WHERE code IN ('hot_stars', 'camp_stars', 'meuble_stars', 'gites_epics', 'clevacances_keys');

-- display_group UPDATEs for green_key/eu_ecolabel (environmental_label) and tourisme_handicap
-- (accessibility_label) removed — these schemes are retired from the canonical seed path.
-- LBL_CLEF_VERTE, LBL_ECO_LABEL_UE, LBL_TOURISME_HANDICAP carry display_group inline in V5 seeds.

-- ─── Nouveaux schemes — lot 1 validé ─────────────────────────────────────────

-- qualite_tourisme retired — V5 canonical: LBL_QUALITE_TOURISME (seeded in V5 section below).
-- destination_excellence retired — V5 canonical: LBL_DESTINATION_EXCELLENCE (seeded in V5 section below).
INSERT INTO ref_classification_scheme (code, name, description, selection, is_distinction, display_group, position) VALUES
('qualite_tourisme_reunion','Qualité Tourisme Île de La Réunion',    'Marque régionale Qualité Tourisme portée par le CRT Réunion',         'single',   TRUE, 'quality_label', 12),
('maitre_restaurateur',     'Maîtres Restaurateurs',                 'Titre d''État accordé au chef, attaché à l''établissement dans le SIT', 'single', TRUE, 'quality_label', 13),
('esprit_parc',             'Esprit Parc National',                  'Marque du réseau des Parcs Nationaux de France (non réglementaire)',   'single',   TRUE, 'quality_label', 14),
('cte',                     'Centre de Tourisme Équestre',           'Label FFE pour les centres de tourisme équestre',                     'single',   TRUE, 'quality_label', 15),
('bienvenue_ferme',         'Bienvenue à la Ferme',                  'Label Chambres d''Agriculture — prestations à la ferme',              'multiple', TRUE, 'quality_label', 16),
('accueil_paysan',          'Accueil Paysan',                        'Label réseau Accueil Paysan — formes d''accueil paysan',               'multiple', TRUE, 'quality_label', 17)
ON CONFLICT (code) DO NOTHING;

-- ─── Lot ACT — 2026-03-21 ────────────────────────────────────────────────────
-- Scheme de sous-type pour les activités commerciales encadrées (ACT).
-- is_distinction=FALSE : c'est un sous-type métier, pas un label/certification.
-- display_group=NULL : non affiché dans le dashboard distinctions.
-- Voir : bertel-tourism-ui/claude_brief/lot_act_plan.md §3.1
INSERT INTO ref_classification_scheme (code, name, description, selection, is_distinction, position)
SELECT 'type_act', 'Type d''activité encadrée', 'Sous-type métier pour les prestations ACT — canyoning, plongée, parapente, etc.', 'single', FALSE, 50
WHERE NOT EXISTS (
  SELECT 1 FROM ref_classification_scheme WHERE code = 'type_act'
);

INSERT INTO ref_classification_value (scheme_id, code, name, ordinal)
SELECT s.id, v.code, v.name, v.ordinal
FROM ref_classification_scheme s
JOIN (VALUES
  ('canyoning',                'Canyoning',                   1),
  ('scuba_diving',             'Plongée sous-marine',         2),
  ('paragliding',              'Parapente',                   3),
  ('kayaking_paddleboarding',  'Kayak / Paddle',              4),
  ('guided_hiking',            'Randonnée guidée',            5),
  ('guided_climbing',          'Escalade encadrée',           6),
  ('guided_snorkeling',        'Snorkeling encadré',          7),
  ('surf_lessons',             'Cours de surf',               8),
  ('guided_mountain_biking',   'VTT guidé',                   9),
  ('horse_riding',             'Équitation',                 10),
  ('fitness_wellness',         'Remise en forme / Fitness',  11),
  ('other_guided_activity',    'Autre activité encadrée',    12)
) AS v(code, name, ordinal) ON TRUE
WHERE s.code = 'type_act'
  AND NOT EXISTS (
    SELECT 1 FROM ref_classification_value cv
    WHERE cv.scheme_id = s.id AND cv.code = v.code
  );

-- Valeur unique (binaire) pour les schemes single sans niveau
INSERT INTO ref_classification_value (scheme_id, code, name, ordinal)
SELECT s.id, 'granted', 'Obtenu', 1
FROM ref_classification_scheme s
-- qualite_tourisme and destination_excellence removed — retired from canonical seed path.
WHERE s.code IN (
  'qualite_tourisme_reunion',
  'maitre_restaurateur', 'esprit_parc', 'cte'
)
AND NOT EXISTS (
  SELECT 1 FROM ref_classification_value cv WHERE cv.scheme_id = s.id AND cv.code = 'granted'
);

-- Valeurs : Bienvenue à la Ferme (prestations cumulables)
INSERT INTO ref_classification_value (scheme_id, code, name, ordinal)
SELECT s.id, v.code, v.name, v.ordinal
FROM ref_classification_scheme s
JOIN (VALUES
  ('ferme_sejour',      'Ferme de séjour',      1),
  ('camping_ferme',     'Camping à la ferme',   2),
  ('gite_rural',        'Gîte rural',           3),
  ('table_hote',        'Table d''hôte',        4),
  ('ferme_pedagogique', 'Ferme pédagogique',    5),
  ('vente_directe',     'Vente directe',        6)
) AS v(code, name, ordinal) ON TRUE
WHERE s.code = 'bienvenue_ferme'
  AND NOT EXISTS (
    SELECT 1 FROM ref_classification_value cv WHERE cv.scheme_id = s.id AND cv.code = v.code
  );

-- Valeurs : Accueil Paysan (formes d'accueil cumulables)
INSERT INTO ref_classification_value (scheme_id, code, name, ordinal)
SELECT s.id, v.code, v.name, v.ordinal
FROM ref_classification_scheme s
JOIN (VALUES
  ('hebergement',  'Hébergement paysan',         1),
  ('restauration', 'Restauration paysanne',      2),
  ('loisirs',      'Loisirs et activités',       3),
  ('decouverte',   'Découverte et pédagogie',    4),
  ('vente',        'Vente de produits fermiers', 5)
) AS v(code, name, ordinal) ON TRUE
WHERE s.code = 'accueil_paysan'
  AND NOT EXISTS (
    SELECT 1 FROM ref_classification_value cv WHERE cv.scheme_id = s.id AND cv.code = v.code
  );

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

-- Valeurs: Tourisme & Handicap (multi) — removed.
-- tourisme_handicap scheme retired. V5 canonical: LBL_TOURISME_HANDICAP with singleton
-- value 'granted' (seeded in ACCESSIBILITÉ V5 section below).

-- Développement durable: pré-V5 categories et actions supprimées (2026-03-22).
-- Vocabulaire canonique V5 (CAT_*, SA_*, MA_*) seeded in SECTION A: Développement Durable V5 below.
-- DB-level cleanup: removes any pre-V5 rows that may exist from a prior seed run.
DO $$
BEGIN
  -- Remove pre-V5 actions (under legacy category codes; V5 actions have external_code set)
  DELETE FROM ref_sustainability_action
  WHERE category_id IN (
    SELECT id FROM ref_sustainability_action_category
    WHERE code IN ('energy','water','waste','mobility','biodiversity')
  );
  -- Remove pre-V5 categories
  DELETE FROM ref_sustainability_action_category
  WHERE code IN ('energy','water','waste','mobility','biodiversity');
  -- Validation: pre-V5 category codes must be absent
  IF EXISTS (
    SELECT 1 FROM ref_sustainability_action_category
    WHERE code IN ('energy','water','waste','mobility','biodiversity')
  ) THEN
    RAISE EXCEPTION 'sustainability normalization failed: pre-V5 category codes still present after cleanup';
  END IF;
END;
$$;

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
    -- booking.com retiré de social_network — voir domaine distribution_channel (Lot 1, 2026-03-20)
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
    ('environment_tag','riviere','River','Río','Near a river or stream','Cerca de un río o arroyo'),
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
    -- wheelchair_access, accessible_bathroom, accessible_parking, hearing_impaired i18n rows removed 2026-03-22 (legacy amenity codes deleted).
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
    ('type_hot','hotel_with_restaurant','Hotel with restaurant','Hotel con restaurante'),
    ('type_hot','boutique_hotel','Boutique hotel','Hotel boutique'),
    ('type_hot','eco_hotel','Eco hotel','Hotel ecológico'),
    ('type_hot','heritage_hotel','Heritage hotel','Hotel histórico'),
    ('type_hot','modern_hotel','Modern hotel','Hotel moderno'),
    ('type_hot','traditional_hotel','Traditional hotel','Hotel tradicional'),
    ('type_hot','family_hotel','Family hotel','Hotel familiar'),
    ('type_hot','romantic_hotel','Romantic hotel','Hotel romántico'),
    ('type_hot','business_hotel','Business hotel','Hotel de negocios'),
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
    ('clevacances_keys','5','5 keys','5 llaves')
    -- tourisme_handicap i18n rows removed 2026-03-22 (scheme retired; V5 canonical: LBL_TOURISME_HANDICAP with singleton value 'granted').
)
UPDATE ref_classification_value cv
SET name_i18n = COALESCE(cv.name_i18n, '{}'::jsonb) || jsonb_build_object('en', vt.name_en, 'es', vt.name_es)
FROM scheme_ids s
JOIN value_translations vt ON vt.scheme_code = s.code
WHERE cv.scheme_id = s.id AND cv.code = vt.value_code;

WITH taxonomy_translations(domain_code, node_code, name_en, name_es) AS (
  VALUES
    ('taxonomy_hot','hotel','Hotel','Hotel'),
    ('taxonomy_hot','hotel_with_restaurant','Hotel with restaurant','Hotel con restaurante'),
    ('taxonomy_hot','boutique_hotel','Boutique hotel','Hotel boutique'),
    ('taxonomy_hot','eco_hotel','Eco hotel','Hotel ecológico'),
    ('taxonomy_hot','heritage_hotel','Heritage hotel','Hotel histórico'),
    ('taxonomy_hot','modern_hotel','Modern hotel','Hotel moderno'),
    ('taxonomy_hot','traditional_hotel','Traditional hotel','Hotel tradicional'),
    ('taxonomy_hot','family_hotel','Family hotel','Hotel familiar'),
    ('taxonomy_hot','romantic_hotel','Romantic hotel','Hotel romántico'),
    ('taxonomy_hot','business_hotel','Business hotel','Hotel de negocios')
)
UPDATE ref_code rc
SET name_i18n = COALESCE(rc.name_i18n, '{}'::jsonb) || jsonb_build_object('en', tt.name_en, 'es', tt.name_es)
FROM taxonomy_translations tt
WHERE rc.domain = tt.domain_code
  AND rc.code = tt.node_code;

-- ref_sustainability_action_category translations: pre-V5 block removed 2026-03-22.
-- V5 categories (CAT_*) have name_i18n and description_i18n set inline in SECTION A.

-- ref_sustainability_action translations: pre-V5 block removed 2026-03-22.
-- V5 micro-actions (MA_*) have label_i18n and description_i18n set inline in SECTION A.

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
  ('souvenir_shop','Boutique de souvenirs',1),
  ('local_crafts','Artisanat / produits locaux',2),
  ('bakery','Boulangerie / pâtisserie',3),
  ('pharmacy','Pharmacie',4),
  ('supermarket','Supermarché',5)
) AS v(code,name,ord)
WHERE NOT EXISTS (
  SELECT 1 FROM ref_classification_value cv
  WHERE cv.scheme_id = s.id AND cv.code = v.code
);

-- 1b) Hierarchical taxonomy backed by ref_code
INSERT INTO ref_code_domain_registry (
  domain,
  name,
  description,
  object_type,
  is_hierarchical,
  is_taxonomy,
  position,
  is_active,
  name_i18n,
  description_i18n
)
VALUES
  (
    'taxonomy_hot',
    'Taxonomie HOT',
    'Sous-categories metier hierarchiques pour les objets HOT.',
    'HOT',
    TRUE,
    TRUE,
    10,
    TRUE,
    jsonb_build_object('fr', 'Taxonomie HOT', 'en', 'HOT taxonomy'),
    jsonb_build_object('fr', 'Sous-categories metier hierarchiques pour les objets HOT.', 'en', 'Hierarchical business subcategories for HOT objects.')
  ),
  (
    'taxonomy_act',
    'Taxonomie ACT',
    'Sous-categories metier hierarchiques pour les objets ACT.',
    'ACT',
    TRUE,
    TRUE,
    20,
    TRUE,
    jsonb_build_object('fr', 'Taxonomie ACT', 'en', 'ACT taxonomy'),
    jsonb_build_object('fr', 'Sous-categories metier hierarchiques pour les objets ACT.', 'en', 'Hierarchical business subcategories for ACT objects.')
  ),
  (
    'taxonomy_com',
    'Taxonomie COM',
    'Sous-categories metier hierarchiques pour les objets COM.',
    'COM',
    TRUE,
    TRUE,
    30,
    TRUE,
    jsonb_build_object('fr', 'Taxonomie COM', 'en', 'COM taxonomy'),
    jsonb_build_object('fr', 'Sous-categories metier hierarchiques pour les objets COM.', 'en', 'Hierarchical business subcategories for COM objects.')
  )
ON CONFLICT (domain) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  object_type = EXCLUDED.object_type,
  is_hierarchical = EXCLUDED.is_hierarchical,
  is_taxonomy = EXCLUDED.is_taxonomy,
  position = EXCLUDED.position,
  is_active = EXCLUDED.is_active,
  name_i18n = COALESCE(ref_code_domain_registry.name_i18n, '{}'::jsonb) || COALESCE(EXCLUDED.name_i18n, '{}'::jsonb),
  description_i18n = COALESCE(ref_code_domain_registry.description_i18n, '{}'::jsonb) || COALESCE(EXCLUDED.description_i18n, '{}'::jsonb);

WITH taxonomy_roots(domain, code, name, description, position, parent_id, is_assignable, name_i18n, description_i18n) AS (
  VALUES
    (
      'taxonomy_hot',
      'root',
      'HOT',
      'Racine technique de la taxonomie HOT',
      0,
      NULL::uuid,
      FALSE,
      jsonb_build_object('fr', 'HOT', 'en', 'HOT'),
      jsonb_build_object('fr', 'Racine technique de la taxonomie HOT', 'en', 'Technical root for the HOT taxonomy')
    ),
    (
      'taxonomy_act',
      'root',
      'ACT',
      'Racine technique de la taxonomie ACT',
      0,
      NULL::uuid,
      FALSE,
      jsonb_build_object('fr', 'ACT', 'en', 'ACT'),
      jsonb_build_object('fr', 'Racine technique de la taxonomie ACT', 'en', 'Technical root for the ACT taxonomy')
    ),
    (
      'taxonomy_com',
      'root',
      'COM',
      'Racine technique de la taxonomie COM',
      0,
      NULL::uuid,
      FALSE,
      jsonb_build_object('fr', 'COM', 'en', 'COM'),
      jsonb_build_object('fr', 'Racine technique de la taxonomie COM', 'en', 'Technical root for the COM taxonomy')
    )
)
INSERT INTO ref_code (domain, code, name, description, position, parent_id, is_assignable, name_i18n, description_i18n)
SELECT tr.domain, tr.code, tr.name, tr.description, tr.position, tr.parent_id, tr.is_assignable, tr.name_i18n, tr.description_i18n
FROM taxonomy_roots tr
ON CONFLICT (domain, code) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  position = EXCLUDED.position,
  parent_id = EXCLUDED.parent_id,
  is_assignable = EXCLUDED.is_assignable,
  name_i18n = COALESCE(ref_code.name_i18n, '{}'::jsonb) || COALESCE(EXCLUDED.name_i18n, '{}'::jsonb),
  description_i18n = COALESCE(ref_code.description_i18n, '{}'::jsonb) || COALESCE(EXCLUDED.description_i18n, '{}'::jsonb);

WITH hot_root AS (
  SELECT id
  FROM ref_code
  WHERE domain = 'taxonomy_hot'
    AND code = 'root'
)
INSERT INTO ref_code (domain, code, name, description, position, parent_id, is_assignable, name_i18n)
SELECT
  'taxonomy_hot',
  'hotel',
  'Hotel',
  'Noeud parent visible pour les sous-categories hotelieres',
  1,
  hot_root.id,
  TRUE,
  jsonb_build_object('fr', 'Hotel', 'en', 'Hotel')
FROM hot_root
ON CONFLICT (domain, code) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  position = EXCLUDED.position,
  parent_id = EXCLUDED.parent_id,
  is_assignable = EXCLUDED.is_assignable,
  name_i18n = COALESCE(ref_code.name_i18n, '{}'::jsonb) || COALESCE(EXCLUDED.name_i18n, '{}'::jsonb);

WITH type_hot_values AS (
  SELECT
    cv.code,
    cv.name,
    ROW_NUMBER() OVER (
      ORDER BY
        COALESCE(cv.ordinal, 999999),
        COALESCE(cv.position, 999999),
        cv.name,
        cv.code
    ) + 1 AS display_position
  FROM ref_classification_value cv
  JOIN ref_classification_scheme s
    ON s.id = cv.scheme_id
  WHERE s.code = 'type_hot'
    AND cv.code <> 'hotel'
),
hot_parent AS (
  SELECT id
  FROM ref_code
  WHERE domain = 'taxonomy_hot'
    AND code = 'hotel'
)
INSERT INTO ref_code (domain, code, name, description, position, parent_id, is_assignable, name_i18n)
SELECT
  'taxonomy_hot',
  thv.code,
  thv.name,
  thv.name,
  thv.display_position,
  hot_parent.id,
  TRUE,
  jsonb_build_object('fr', thv.name)
FROM type_hot_values thv
CROSS JOIN hot_parent
ON CONFLICT (domain, code) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  position = EXCLUDED.position,
  parent_id = EXCLUDED.parent_id,
  is_assignable = EXCLUDED.is_assignable,
  name_i18n = COALESCE(ref_code.name_i18n, '{}'::jsonb) || COALESCE(EXCLUDED.name_i18n, '{}'::jsonb);

WITH act_root AS (
  SELECT id
  FROM ref_code
  WHERE domain = 'taxonomy_act'
    AND code = 'root'
),
type_act_values AS (
  SELECT
    cv.code,
    cv.name,
    ROW_NUMBER() OVER (
      ORDER BY
        COALESCE(cv.ordinal, 999999),
        COALESCE(cv.position, 999999),
        cv.name,
        cv.code
    ) AS display_position
  FROM ref_classification_value cv
  JOIN ref_classification_scheme s
    ON s.id = cv.scheme_id
  WHERE s.code = 'type_act'
)
INSERT INTO ref_code (domain, code, name, description, position, parent_id, is_assignable, name_i18n)
SELECT
  'taxonomy_act',
  tav.code,
  tav.name,
  tav.name,
  tav.display_position,
  act_root.id,
  TRUE,
  jsonb_build_object('fr', tav.name)
FROM type_act_values tav
CROSS JOIN act_root
ON CONFLICT (domain, code) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  position = EXCLUDED.position,
  parent_id = EXCLUDED.parent_id,
  is_assignable = EXCLUDED.is_assignable,
  name_i18n = COALESCE(ref_code.name_i18n, '{}'::jsonb) || COALESCE(EXCLUDED.name_i18n, '{}'::jsonb);

WITH com_root AS (
  SELECT id
  FROM ref_code
  WHERE domain = 'taxonomy_com'
    AND code = 'root'
),
retail_values AS (
  SELECT
    cv.code,
    cv.name,
    ROW_NUMBER() OVER (
      ORDER BY
        COALESCE(cv.ordinal, 999999),
        COALESCE(cv.position, 999999),
        cv.name,
        cv.code
    ) AS display_position
  FROM ref_classification_value cv
  JOIN ref_classification_scheme s
    ON s.id = cv.scheme_id
  WHERE s.code = 'retail_category'
)
INSERT INTO ref_code (domain, code, name, description, position, parent_id, is_assignable, name_i18n)
SELECT
  'taxonomy_com',
  rv.code,
  rv.name,
  rv.name,
  rv.display_position,
  com_root.id,
  TRUE,
  jsonb_build_object('fr', rv.name)
FROM retail_values rv
CROSS JOIN com_root
ON CONFLICT (domain, code) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  position = EXCLUDED.position,
  parent_id = EXCLUDED.parent_id,
  is_assignable = EXCLUDED.is_assignable,
  name_i18n = COALESCE(ref_code.name_i18n, '{}'::jsonb) || COALESCE(EXCLUDED.name_i18n, '{}'::jsonb);

SELECT api.refresh_ref_code_taxonomy_closure('taxonomy_hot');
SELECT api.refresh_ref_code_taxonomy_closure('taxonomy_act');
SELECT api.refresh_ref_code_taxonomy_closure('taxonomy_com');

WITH migration_source AS (
  SELECT DISTINCT ON (oc.object_id, mapped.target_domain)
    oc.object_id,
    mapped.target_domain AS domain,
    rc.id AS ref_code_id,
    oc.source,
    oc.note,
    oc.created_at,
    oc.updated_at
  FROM object_classification oc
  JOIN ref_classification_scheme s
    ON s.id = oc.scheme_id
  JOIN ref_classification_value cv
    ON cv.id = oc.value_id
  JOIN LATERAL (
    SELECT CASE s.code
      WHEN 'type_hot' THEN 'taxonomy_hot'
      WHEN 'type_act' THEN 'taxonomy_act'
      WHEN 'retail_category' THEN 'taxonomy_com'
      ELSE NULL
    END AS target_domain
  ) mapped
    ON mapped.target_domain IS NOT NULL
  JOIN ref_code rc
    ON rc.domain = mapped.target_domain
   AND rc.code = cv.code
  ORDER BY
    oc.object_id,
    mapped.target_domain,
    oc.awarded_at DESC NULLS LAST,
    oc.updated_at DESC NULLS LAST,
    oc.created_at DESC,
    oc.id DESC
)
INSERT INTO object_taxonomy (object_id, domain, ref_code_id, source, note, created_at, updated_at)
SELECT
  ms.object_id,
  ms.domain,
  ms.ref_code_id,
  ms.source,
  ms.note,
  ms.created_at,
  ms.updated_at
FROM migration_source ms
ON CONFLICT (object_id, domain) DO UPDATE
SET
  ref_code_id = EXCLUDED.ref_code_id,
  source = COALESCE(EXCLUDED.source, object_taxonomy.source),
  note = COALESCE(EXCLUDED.note, object_taxonomy.note),
  updated_at = GREATEST(object_taxonomy.updated_at, EXCLUDED.updated_at);

DELETE FROM object_classification oc
USING ref_classification_scheme s
WHERE s.id = oc.scheme_id
  AND s.code IN ('type_hot', 'type_act', 'retail_category');

-- 2) Tags useful for retail use-cases
INSERT INTO ref_tag (slug, name, description, position)
VALUES ('shopping','Shopping','Commerces et boutiques',10)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO ref_tag (slug, name, description, position)
VALUES ('local_products','Produits locaux','Produits du terroir, artisanat',11)
ON CONFLICT (slug) DO NOTHING;

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
-- ============================================================
-- SECTION A: Développement Durable V5
-- Source: seeds_sustainability_v5.sql
-- Aligned to schema_unified.sql
-- DROP NOTE: The original source contained a second UPDATE block
-- on ref_classification_scheme attempting to set a "metadata"
-- column that does NOT exist on that table. That block is
-- intentionally omitted here. The metadata column exists only
-- on ref_classification_value (kept in section 2 below).
-- ============================================================

-- 1) Classification schemes for sustainability-related labels
WITH src(code, name, description, selection, display_group, is_distinction, name_i18n) AS (
VALUES
  ('LBL_ATR', 'ATR - Agir pour un Tourisme Responsable', 'Référentiel structuré en 3 axes, 16 critères et 42 indicateurs.', 'single', 'sustainability_labels', TRUE, '{"fr": "ATR - Agir pour un Tourisme Responsable"}'::jsonb),
  ('LBL_CLEF_VERTE', 'Clef Verte', 'Référentiel par typologie, environ 120 critères en 7 catégories avec impératifs et conseillés.', 'single', 'sustainability_labels', TRUE, '{"fr": "Clef Verte"}'::jsonb),
  ('LBL_DESTINATION_EXCELLENCE', 'Destination d''excellence', 'Label d''État remplaçant Qualité Tourisme, avec pilier Qualité et pilier Écoresponsable.', 'single', 'sustainability_labels', TRUE, '{"fr": "Destination d''excellence"}'::jsonb),
  ('LBL_ECO_LABEL_UE', 'Écolabel européen - hébergement touristique', 'Critères obligatoires et critères optionnels à points, minimum de 20 points.', 'single', 'sustainability_labels', TRUE, '{"fr": "Écolabel européen - hébergement touristique"}'::jsonb),
  ('LBL_FLOCON_VERT', 'Flocon Vert', 'Label et démarche de progrès pour les destinations de montagne engagées dans la transition écologique et sociale.', 'single', 'sustainability_labels', TRUE, '{"fr": "Flocon Vert"}'::jsonb),
  ('LBL_GREEN_DESTINATIONS', 'Green Destinations', 'Programme international de certification et d''awards pour les destinations touristiques durables.', 'single', 'sustainability_labels', TRUE, '{"fr": "Green Destinations"}'::jsonb),
  ('LBL_LABEL_BAS_CARBONE', 'Label bas-carbone', 'Cadre national de certification de projets de réduction ou séquestration d''émissions.', 'single', 'sustainability_labels', TRUE, '{"fr": "Label bas-carbone"}'::jsonb),
  ('LBL_PAVILLON_BLEU', 'Pavillon Bleu', 'Label international de tourisme durable pour les plages et les ports de plaisance ; critères eau, déchets, biodiversité, sécurité, sensibilisation.', 'single', 'sustainability_labels', TRUE, '{"fr": "Pavillon Bleu"}'::jsonb),
  ('LBL_QUALITE_TOURISME', 'Qualité Tourisme', 'Label en gestion extinctive jusqu''au 31 décembre 2026, inclus uniquement pour reprise historique.', 'single', 'sustainability_labels', TRUE, '{"fr": "Qualité Tourisme"}'::jsonb)
)
INSERT INTO ref_classification_scheme (code, name, description, selection, display_group, is_distinction, name_i18n)
SELECT code, name, description, selection, display_group, is_distinction, name_i18n
FROM src
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  selection = EXCLUDED.selection,
  display_group = EXCLUDED.display_group,
  is_distinction = EXCLUDED.is_distinction,
  name_i18n = EXCLUDED.name_i18n,
  updated_at = NOW();

-- 2) Singleton values per scheme, required by object_classification(value_id)
-- NOTE: metadata column exists on ref_classification_value — kept here.
WITH src(scheme_code, code, name, position, name_i18n, metadata) AS (
VALUES
  ('LBL_ATR', 'granted', 'Titulaire ATR - Agir pour un Tourisme Responsable', 1, '{"fr": "Titulaire ATR - Agir pour un Tourisme Responsable"}'::jsonb, '{"kind": "label_status", "label_code": "LBL_ATR"}'::jsonb),
  ('LBL_CLEF_VERTE', 'granted', 'Titulaire Clef Verte', 1, '{"fr": "Titulaire Clef Verte"}'::jsonb, '{"kind": "label_status", "label_code": "LBL_CLEF_VERTE"}'::jsonb),
  ('LBL_DESTINATION_EXCELLENCE', 'granted', 'Titulaire Destination d''excellence', 1, '{"fr": "Titulaire Destination d''excellence"}'::jsonb, '{"kind": "label_status", "label_code": "LBL_DESTINATION_EXCELLENCE"}'::jsonb),
  ('LBL_ECO_LABEL_UE', 'granted', 'Titulaire Écolabel européen - hébergement touristique', 1, '{"fr": "Titulaire Écolabel européen - hébergement touristique"}'::jsonb, '{"kind": "label_status", "label_code": "LBL_ECO_LABEL_UE"}'::jsonb),
  ('LBL_FLOCON_VERT', 'granted', 'Titulaire Flocon Vert', 1, '{"fr": "Titulaire Flocon Vert"}'::jsonb, '{"kind": "label_status", "label_code": "LBL_FLOCON_VERT"}'::jsonb),
  ('LBL_GREEN_DESTINATIONS', 'granted', 'Titulaire Green Destinations', 1, '{"fr": "Titulaire Green Destinations"}'::jsonb, '{"kind": "label_status", "label_code": "LBL_GREEN_DESTINATIONS"}'::jsonb),
  ('LBL_LABEL_BAS_CARBONE', 'granted', 'Titulaire Label bas-carbone', 1, '{"fr": "Titulaire Label bas-carbone"}'::jsonb, '{"kind": "label_status", "label_code": "LBL_LABEL_BAS_CARBONE"}'::jsonb),
  ('LBL_PAVILLON_BLEU', 'granted', 'Titulaire Pavillon Bleu', 1, '{"fr": "Titulaire Pavillon Bleu"}'::jsonb, '{"kind": "label_status", "label_code": "LBL_PAVILLON_BLEU"}'::jsonb),
  ('LBL_QUALITE_TOURISME', 'granted', 'Titulaire Qualité Tourisme', 1, '{"fr": "Titulaire Qualité Tourisme"}'::jsonb, '{"kind": "label_status", "label_code": "LBL_QUALITE_TOURISME"}'::jsonb)
)
INSERT INTO ref_classification_value (scheme_id, code, name, position, name_i18n, metadata)
SELECT s.id, src.code, src.name, src.position, src.name_i18n, src.metadata
FROM src
JOIN ref_classification_scheme s ON s.code = src.scheme_code
ON CONFLICT (scheme_id, code) DO UPDATE SET
  name = EXCLUDED.name,
  position = EXCLUDED.position,
  name_i18n = EXCLUDED.name_i18n,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

-- 3) Sustainability categories (excluding CAT_ACCESS)
WITH src(code, name, description, position, name_i18n, description_i18n, extra) AS (
VALUES
  ('CAT_BIO', 'Biodiversité & milieux naturels', 'Protection des milieux, biodiversité, qualité de l''eau et réduction des pollutions.', 20, '{"fr": "Biodiversité & milieux naturels"}'::jsonb, '{"fr": "Protection des milieux, biodiversité, qualité de l''eau et réduction des pollutions."}'::jsonb, '{"category_key": "biodiversite_milieux", "label_ui_fr": "Biodiversité"}'::jsonb),
  ('CAT_ENERGY', 'Énergie & climat', 'Mesure, réduction et décarbonation de l''énergie et des impacts climatiques.', 30, '{"fr": "Énergie & climat"}'::jsonb, '{"fr": "Mesure, réduction et décarbonation de l''énergie et des impacts climatiques."}'::jsonb, '{"category_key": "energie_climat", "label_ui_fr": "Énergie"}'::jsonb),
  ('CAT_PROC', 'Achats & restauration durable', 'Achats responsables, restauration durable, local, bio et saison.', 40, '{"fr": "Achats & restauration durable"}'::jsonb, '{"fr": "Achats responsables, restauration durable, local, bio et saison."}'::jsonb, '{"category_key": "achats_restauration", "label_ui_fr": "Achats"}'::jsonb),
  ('CAT_GOV', 'Gouvernance & pilotage', 'Pilotage, conformité, transparence, stratégie et dialogue.', 50, '{"fr": "Gouvernance & pilotage"}'::jsonb, '{"fr": "Pilotage, conformité, transparence, stratégie et dialogue."}'::jsonb, '{"category_key": "gouvernance_pilotage", "label_ui_fr": "Gouvernance"}'::jsonb),
  ('CAT_MOBILITY', 'Mobilité durable', 'Accès sans voiture, vélo, recharge électrique et mobilités durables.', 60, '{"fr": "Mobilité durable"}'::jsonb, '{"fr": "Accès sans voiture, vélo, recharge électrique et mobilités durables."}'::jsonb, '{"category_key": "mobilite_durable", "label_ui_fr": "Mobilité"}'::jsonb),
  ('CAT_SOCIAL', 'Social & qualité de service', 'Conditions de travail, formation, satisfaction client et inclusion.', 70, '{"fr": "Social & qualité de service"}'::jsonb, '{"fr": "Conditions de travail, formation, satisfaction client et inclusion."}'::jsonb, '{"category_key": "social_qualite_service", "label_ui_fr": "Social"}'::jsonb),
  ('CAT_TERR', 'Territoire & destination', 'Ancrage territorial, retombées locales, indicateurs de destination et gouvernance territoriale.', 80, '{"fr": "Territoire & destination"}'::jsonb, '{"fr": "Ancrage territorial, retombées locales, indicateurs de destination et gouvernance territoriale."}'::jsonb, '{"category_key": "territoire_destination", "label_ui_fr": "Territoire"}'::jsonb),
  ('CAT_WASTE', 'Déchets & circularité', 'Prévention, tri, valorisation et économie circulaire.', 90, '{"fr": "Déchets & circularité"}'::jsonb, '{"fr": "Prévention, tri, valorisation et économie circulaire."}'::jsonb, '{"category_key": "dechets_circularite", "label_ui_fr": "Déchets"}'::jsonb),
  ('CAT_WATER', 'Eau & assainissement', 'Sobriété, suivi, équipements économes et gestion de l''eau.', 100, '{"fr": "Eau & assainissement"}'::jsonb, '{"fr": "Sobriété, suivi, équipements économes et gestion de l''eau."}'::jsonb, '{"category_key": "eau_assainissement", "label_ui_fr": "Eau"}'::jsonb)
)
INSERT INTO ref_sustainability_action_category (code, name, description, position, name_i18n, description_i18n, extra)
SELECT code, name, description, position, name_i18n, description_i18n, extra
FROM src
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  position = EXCLUDED.position,
  name_i18n = EXCLUDED.name_i18n,
  description_i18n = EXCLUDED.description_i18n,
  extra = EXCLUDED.extra,
  updated_at = NOW();

-- 4) Sustainability groups
WITH src(category_code, code, name, description, position, name_i18n, description_i18n, extra) AS (
VALUES
  ('CAT_BIO', 'SA_BIODIVERSITY_PROTECTION', 'Protection de la biodiversité', 'Mesures de protection des milieux, de la faune, de la flore et des espaces naturels proches.', 1, '{"fr": "Protection de la biodiversité"}'::jsonb, '{"fr": "Mesures de protection des milieux, de la faune, de la flore et des espaces naturels proches."}'::jsonb, '{"group_key": "protection_de_la_biodiversite", "label_ui_fr": "Protection biodiversité", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://www.flocon-vert.org/"}'::jsonb),
  ('CAT_BIO', 'SA_NATIVE_PLANTING', 'Plantations locales ou non invasives', 'Choix d''espèces locales ou non invasives dans les aménagements extérieurs.', 2, '{"fr": "Plantations locales ou non invasives"}'::jsonb, '{"fr": "Choix d''espèces locales ou non invasives dans les aménagements extérieurs."}'::jsonb, '{"group_key": "plantations_locales_ou_non_invasives", "label_ui_fr": "Plantations locales", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://www.flocon-vert.org/"}'::jsonb),
  ('CAT_BIO', 'SA_PESTICIDE_AVOIDANCE', 'Évitement des pesticides', 'Absence ou forte réduction des pesticides, herbicides ou produits assimilés.', 3, '{"fr": "Évitement des pesticides"}'::jsonb, '{"fr": "Absence ou forte réduction des pesticides, herbicides ou produits assimilés."}'::jsonb, '{"group_key": "evitement_des_pesticides", "label_ui_fr": "Zéro pesticide", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://www.flocon-vert.org/"}'::jsonb),
  ('CAT_BIO', 'SA_CONCENTRATED_CLEANERS', 'Produits d''entretien concentrés', 'Utilisation de produits concentrés avec dosage maîtrisé pour limiter emballages et surconsommation.', 4, '{"fr": "Produits d''entretien concentrés"}'::jsonb, '{"fr": "Utilisation de produits concentrés avec dosage maîtrisé pour limiter emballages et surconsommation."}'::jsonb, '{"group_key": "produits_d_entretien_concentres", "label_ui_fr": "Produits concentrés", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/"}'::jsonb),
  ('CAT_BIO', 'SA_ECOLABEL_CLEANERS', 'Produits d''entretien écolabellisés', 'Utilisation de produits d''entretien porteurs d''un écolabel ou d''une certification reconnue.', 5, '{"fr": "Produits d''entretien écolabellisés"}'::jsonb, '{"fr": "Utilisation de produits d''entretien porteurs d''un écolabel ou d''une certification reconnue."}'::jsonb, '{"group_key": "produits_d_entretien_ecolabellises", "label_ui_fr": "Nettoyants écolabellisés", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/"}'::jsonb),
  ('CAT_BIO', 'SA_LOW_CHEMICAL_DISINFECTION', 'Réduction des produits chimiques de désinfection', 'Recours à des méthodes ou produits limitant les impacts des opérations de désinfection.', 6, '{"fr": "Réduction des produits chimiques de désinfection"}'::jsonb, '{"fr": "Recours à des méthodes ou produits limitant les impacts des opérations de désinfection."}'::jsonb, '{"group_key": "reduction_des_produits_chimiques_de_desinfection", "label_ui_fr": "Moins de chimie", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/"}'::jsonb),
  ('CAT_ENERGY', 'SA_CARBON_FOOTPRINT', 'Bilan carbone et trajectoire', 'Calcul des émissions de GES, au moins scopes 1 et 2, et si possible scope 3, puis définition d''une trajectoire de réduction et de financement bas-carbone.', 1, '{"fr": "Bilan carbone et trajectoire"}'::jsonb, '{"fr": "Calcul des émissions de GES, au moins scopes 1 et 2, et si possible scope 3, puis définition d''une trajectoire de réduction et de financement bas-carbone."}'::jsonb, '{"group_key": "bilan_carbone_et_trajectoire", "label_ui_fr": "Bilan carbone", "source_basis": "Apports utilisateur consolidés", "source_url": "https://label-bas-carbone.ecologie.gouv.fr/"}'::jsonb),
  ('CAT_ENERGY', 'SA_CLIMATE_ADAPTATION', 'Plan d''adaptation climatique', 'Mesures d''adaptation aux risques climatiques, chaleur, eau, événements extrêmes, continuité d''activité.', 2, '{"fr": "Plan d''adaptation climatique"}'::jsonb, '{"fr": "Mesures d''adaptation aux risques climatiques, chaleur, eau, événements extrêmes, continuité d''activité."}'::jsonb, '{"group_key": "plan_d_adaptation_climatique", "label_ui_fr": "Adaptation climatique", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://label-bas-carbone.ecologie.gouv.fr/"}'::jsonb),
  ('CAT_ENERGY', 'SA_AUTO_SWITCH_OFF', 'Extinction automatique des équipements', 'Coupure automatique des éclairages ou équipements quand les espaces sont inoccupés.', 3, '{"fr": "Extinction automatique des équipements"}'::jsonb, '{"fr": "Coupure automatique des éclairages ou équipements quand les espaces sont inoccupés."}'::jsonb, '{"group_key": "extinction_automatique_des_equipements", "label_ui_fr": "Extinction auto", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://environment.ec.europa.eu/topics/circular-economy/eu-ecolabel-home/eu-ecolabel-tourist-accommodation_en"}'::jsonb),
  ('CAT_ENERGY', 'SA_EFFICIENT_LIGHTING', 'Éclairage basse consommation', 'Équipement majoritaire en LED ou solutions à haute efficacité énergétique.', 4, '{"fr": "Éclairage basse consommation"}'::jsonb, '{"fr": "Équipement majoritaire en LED ou solutions à haute efficacité énergétique."}'::jsonb, '{"group_key": "eclairage_basse_consommation", "label_ui_fr": "Éclairage performant", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://environment.ec.europa.eu/topics/circular-economy/eu-ecolabel-home/eu-ecolabel-tourist-accommodation_en"}'::jsonb),
  ('CAT_ENERGY', 'SA_ENERGY_AUDIT', 'Audit énergétique', 'Audit ou pré-audit énergétique réalisé par un expert ou via une méthode structurée.', 5, '{"fr": "Audit énergétique"}'::jsonb, '{"fr": "Audit ou pré-audit énergétique réalisé par un expert ou via une méthode structurée."}'::jsonb, '{"group_key": "audit_energetique", "label_ui_fr": "Audit énergétique", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://environment.ec.europa.eu/topics/circular-economy/eu-ecolabel-home/eu-ecolabel-tourist-accommodation_en"}'::jsonb),
  ('CAT_ENERGY', 'SA_ENERGY_MONITORING', 'Suivi des consommations d''énergie', 'Mesure régulière des consommations d''énergie avec historique et indicateurs de suivi.', 6, '{"fr": "Suivi des consommations d''énergie"}'::jsonb, '{"fr": "Mesure régulière des consommations d''énergie avec historique et indicateurs de suivi."}'::jsonb, '{"group_key": "suivi_des_consommations_d_energie", "label_ui_fr": "Suivi énergie", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://environment.ec.europa.eu/topics/circular-economy/eu-ecolabel-home/eu-ecolabel-tourist-accommodation_en"}'::jsonb),
  ('CAT_ENERGY', 'SA_HOT_WATER_EFFICIENCY', 'Production d''eau chaude performante', 'Systèmes de production d''eau chaude efficaces et réglés pour limiter les pertes.', 7, '{"fr": "Production d''eau chaude performante"}'::jsonb, '{"fr": "Systèmes de production d''eau chaude efficaces et réglés pour limiter les pertes."}'::jsonb, '{"group_key": "production_d_eau_chaude_performante", "label_ui_fr": "ECS performante", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://environment.ec.europa.eu/topics/circular-economy/eu-ecolabel-home/eu-ecolabel-tourist-accommodation_en"}'::jsonb),
  ('CAT_ENERGY', 'SA_HVAC_EFFICIENCY', 'Chauffage et climatisation performants', 'Équipements de chauffage ou de climatisation performants et entretenus.', 8, '{"fr": "Chauffage et climatisation performants"}'::jsonb, '{"fr": "Équipements de chauffage ou de climatisation performants et entretenus."}'::jsonb, '{"group_key": "chauffage_et_climatisation_performants", "label_ui_fr": "CVC performant", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://environment.ec.europa.eu/topics/circular-economy/eu-ecolabel-home/eu-ecolabel-tourist-accommodation_en"}'::jsonb),
  ('CAT_ENERGY', 'SA_ONSITE_RENEWABLE_ENERGY', 'Production d''énergie renouvelable sur site', 'Production sur site d''énergie renouvelable, par exemple photovoltaïque ou solaire thermique.', 9, '{"fr": "Production d''énergie renouvelable sur site"}'::jsonb, '{"fr": "Production sur site d''énergie renouvelable, par exemple photovoltaïque ou solaire thermique."}'::jsonb, '{"group_key": "production_d_energie_renouvelable_sur_site", "label_ui_fr": "ENR sur site", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://environment.ec.europa.eu/topics/circular-economy/eu-ecolabel-home/eu-ecolabel-tourist-accommodation_en"}'::jsonb),
  ('CAT_ENERGY', 'SA_RENEWABLE_ELECTRICITY', 'Achat d''électricité renouvelable', 'Contrat d''approvisionnement en électricité d''origine renouvelable ou équivalente.', 10, '{"fr": "Achat d''électricité renouvelable"}'::jsonb, '{"fr": "Contrat d''approvisionnement en électricité d''origine renouvelable ou équivalente."}'::jsonb, '{"group_key": "achat_d_electricite_renouvelable", "label_ui_fr": "Électricité verte", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://environment.ec.europa.eu/topics/circular-economy/eu-ecolabel-home/eu-ecolabel-tourist-accommodation_en"}'::jsonb),
  ('CAT_ENERGY', 'SA_RENEWABLE_HEAT', 'Chaleur renouvelable', 'Recours à une chaleur d''origine renouvelable, biomasse, solaire thermique, géothermie ou équivalent.', 11, '{"fr": "Chaleur renouvelable"}'::jsonb, '{"fr": "Recours à une chaleur d''origine renouvelable, biomasse, solaire thermique, géothermie ou équivalent."}'::jsonb, '{"group_key": "chaleur_renouvelable", "label_ui_fr": "Chaleur renouvelable", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://environment.ec.europa.eu/topics/circular-economy/eu-ecolabel-home/eu-ecolabel-tourist-accommodation_en"}'::jsonb),
  ('CAT_ENERGY', 'SA_SUBMETERING', 'Sous-comptage énergie et eau', 'Sous-comptage par usage ou zone pour identifier les postes les plus consommateurs.', 12, '{"fr": "Sous-comptage énergie et eau"}'::jsonb, '{"fr": "Sous-comptage par usage ou zone pour identifier les postes les plus consommateurs."}'::jsonb, '{"group_key": "sous_comptage_energie_et_eau", "label_ui_fr": "Sous-comptage", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://environment.ec.europa.eu/topics/circular-economy/eu-ecolabel-home/eu-ecolabel-tourist-accommodation_en"}'::jsonb),
  ('CAT_ENERGY', 'SA_THERMOREGULATION', 'Régulation des températures', 'Consignes et dispositifs de régulation pour le chauffage, la climatisation ou les plages de température.', 13, '{"fr": "Régulation des températures"}'::jsonb, '{"fr": "Consignes et dispositifs de régulation pour le chauffage, la climatisation ou les plages de température."}'::jsonb, '{"group_key": "regulation_des_temperatures", "label_ui_fr": "Régulation thermique", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://environment.ec.europa.eu/topics/circular-economy/eu-ecolabel-home/eu-ecolabel-tourist-accommodation_en"}'::jsonb),
  ('CAT_GOV', 'SA_ACTION_PLAN_ANNUAL', 'Plan d''action annuel', 'Plan d''action annuel ou pluriannuel avec actions, responsables, échéances et indicateurs.', 1, '{"fr": "Plan d''action annuel"}'::jsonb, '{"fr": "Plan d''action annuel ou pluriannuel avec actions, responsables, échéances et indicateurs."}'::jsonb, '{"group_key": "plan_d_action_annuel", "label_ui_fr": "Plan d''action", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "multi-source"}'::jsonb),
  ('CAT_GOV', 'SA_ANNUAL_REVIEW', 'Revue annuelle de performance', 'Revue périodique des résultats, écarts, non-conformités et actions correctives.', 2, '{"fr": "Revue annuelle de performance"}'::jsonb, '{"fr": "Revue périodique des résultats, écarts, non-conformités et actions correctives."}'::jsonb, '{"group_key": "revue_annuelle_de_performance", "label_ui_fr": "Revue annuelle", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "multi-source"}'::jsonb),
  ('CAT_GOV', 'SA_CUSTOMER_FEEDBACK', 'Collecte de satisfaction client', 'Dispositif de collecte de la satisfaction, des remarques et des réclamations clients.', 3, '{"fr": "Collecte de satisfaction client"}'::jsonb, '{"fr": "Dispositif de collecte de la satisfaction, des remarques et des réclamations clients."}'::jsonb, '{"group_key": "collecte_de_satisfaction_client", "label_ui_fr": "Retours clients", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "multi-source"}'::jsonb),
  ('CAT_GOV', 'SA_DIGITAL_SOBRIETY', 'Sobriété numérique', 'Réduction de l''impact environnemental du numérique : site éco-conçu, hébergement responsable, limitation du poids des contenus, allongement de la durée de vie du matériel.', 4, '{"fr": "Sobriété numérique"}'::jsonb, '{"fr": "Réduction de l''impact environnemental du numérique : site éco-conçu, hébergement responsable, limitation du poids des contenus, allongement de la durée de vie du matériel."}'::jsonb, '{"group_key": "sobriete_numerique", "label_ui_fr": "Sobriété numérique", "source_basis": "Apports utilisateur consolidés", "source_url": "multi-source"}'::jsonb),
  ('CAT_GOV', 'SA_FEEDBACK_ANALYSIS', 'Analyse des retours clients', 'Analyse structurée des retours clients et intégration dans l''amélioration continue.', 5, '{"fr": "Analyse des retours clients"}'::jsonb, '{"fr": "Analyse structurée des retours clients et intégration dans l''amélioration continue."}'::jsonb, '{"group_key": "analyse_des_retours_clients", "label_ui_fr": "Analyse des retours", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "multi-source"}'::jsonb),
  ('CAT_GOV', 'SA_GUEST_INFO_SUST', 'Information client sur les écogestes', 'Information donnée aux clients sur les écogestes attendus et sur les pratiques durables de l''établissement.', 6, '{"fr": "Information client sur les écogestes"}'::jsonb, '{"fr": "Information donnée aux clients sur les écogestes attendus et sur les pratiques durables de l''établissement."}'::jsonb, '{"group_key": "information_client_sur_les_ecogestes", "label_ui_fr": "Écogestes clients", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "multi-source"}'::jsonb),
  ('CAT_GOV', 'SA_IMPACT_REPORTING', 'Mesure et reporting des impacts', 'Suivi et restitution d''indicateurs d''impact environnemental, social ou territorial.', 7, '{"fr": "Mesure et reporting des impacts"}'::jsonb, '{"fr": "Suivi et restitution d''indicateurs d''impact environnemental, social ou territorial."}'::jsonb, '{"group_key": "mesure_et_reporting_des_impacts", "label_ui_fr": "Reporting impacts", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "multi-source"}'::jsonb),
  ('CAT_GOV', 'SA_POLICY_SUSTAINABILITY', 'Politique de durabilité formalisée', 'Document formalisé qui fixe les engagements de durabilité, le périmètre, les objectifs et les responsabilités.', 8, '{"fr": "Politique de durabilité formalisée"}'::jsonb, '{"fr": "Document formalisé qui fixe les engagements de durabilité, le périmètre, les objectifs et les responsabilités."}'::jsonb, '{"group_key": "politique_de_durabilite_formalisee", "label_ui_fr": "Politique DD/RSE", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "multi-source"}'::jsonb),
  ('CAT_GOV', 'SA_PUBLIC_COMMUNICATION', 'Communication publique sur les engagements', 'Page web, affichage ou support public décrivant les engagements, résultats ou dispositifs de durabilité.', 9, '{"fr": "Communication publique sur les engagements"}'::jsonb, '{"fr": "Page web, affichage ou support public décrivant les engagements, résultats ou dispositifs de durabilité."}'::jsonb, '{"group_key": "communication_publique_sur_les_engagements", "label_ui_fr": "Communication durable", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "multi-source"}'::jsonb),
  ('CAT_GOV', 'SA_REGULATORY_COMPLIANCE', 'Suivi de conformité réglementaire', 'Registre de conformité et preuves à jour sur les obligations applicables, sécurité, accessibilité, déchets, eau, travail.', 10, '{"fr": "Suivi de conformité réglementaire"}'::jsonb, '{"fr": "Registre de conformité et preuves à jour sur les obligations applicables, sécurité, accessibilité, déchets, eau, travail."}'::jsonb, '{"group_key": "suivi_de_conformite_reglementaire", "label_ui_fr": "Conformité réglementaire", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "multi-source"}'::jsonb),
  ('CAT_GOV', 'SA_RSE_STRATEGY_ALIGNMENT', 'Alignement stratégique RSE', 'Alignement de la stratégie d''entreprise, des offres et du modèle économique avec les principes de responsabilité sociétale et de tourisme responsable.', 11, '{"fr": "Alignement stratégique RSE"}'::jsonb, '{"fr": "Alignement de la stratégie d''entreprise, des offres et du modèle économique avec les principes de responsabilité sociétale et de tourisme responsable."}'::jsonb, '{"group_key": "alignement_strategique_rse", "label_ui_fr": "Stratégie RSE", "source_basis": "Apports utilisateur consolidés", "source_url": "multi-source"}'::jsonb),
  ('CAT_GOV', 'SA_STAFF_TRAINING_SUST', 'Formation du personnel aux écogestes', 'Formation des équipes aux pratiques de durabilité, énergie, eau, déchets, achats, accueil responsable.', 12, '{"fr": "Formation du personnel aux écogestes"}'::jsonb, '{"fr": "Formation des équipes aux pratiques de durabilité, énergie, eau, déchets, achats, accueil responsable."}'::jsonb, '{"group_key": "formation_du_personnel_aux_ecogestes", "label_ui_fr": "Formation écogestes", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "multi-source"}'::jsonb),
  ('CAT_GOV', 'SA_STAKEHOLDER_DIALOGUE', 'Dialogue parties prenantes', 'Échanges structurés avec salariés, partenaires, collectivités, associations, habitants ou clients.', 13, '{"fr": "Dialogue parties prenantes"}'::jsonb, '{"fr": "Échanges structurés avec salariés, partenaires, collectivités, associations, habitants ou clients."}'::jsonb, '{"group_key": "dialogue_parties_prenantes", "label_ui_fr": "Parties prenantes", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "multi-source"}'::jsonb),
  ('CAT_MOBILITY', 'SA_LOW_IMPACT_TRANSPORT_INFO', 'Information sur les mobilités à faible impact', 'Information sur les transports en commun, le vélo, la marche, le covoiturage ou l''arrivée sans voiture.', 1, '{"fr": "Information sur les mobilités à faible impact"}'::jsonb, '{"fr": "Information sur les transports en commun, le vélo, la marche, le covoiturage ou l''arrivée sans voiture."}'::jsonb, '{"group_key": "information_sur_les_mobilites_a_faible_impact", "label_ui_fr": "Info mobilité douce", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://www.flocon-vert.org/"}'::jsonb),
  ('CAT_MOBILITY', 'SA_LOW_IMPACT_TRANSPORT_SERVICES', 'Services de mobilité à faible impact', 'Services ou équipements facilitant les mobilités à faible impact, stationnement vélo, recharge, navette.', 2, '{"fr": "Services de mobilité à faible impact"}'::jsonb, '{"fr": "Services ou équipements facilitant les mobilités à faible impact, stationnement vélo, recharge, navette."}'::jsonb, '{"group_key": "services_de_mobilite_a_faible_impact", "label_ui_fr": "Services mobilité", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://www.flocon-vert.org/"}'::jsonb),
  ('CAT_MOBILITY', 'SA_MOUNTAIN_MOBILITY_PLAN', 'Mobilité durable en montagne', 'Plan de mobilité douce pour destination de montagne : navettes, réduction de la voiture individuelle, intermodalité, services vélo et marche.', 3, '{"fr": "Mobilité durable en montagne"}'::jsonb, '{"fr": "Plan de mobilité douce pour destination de montagne : navettes, réduction de la voiture individuelle, intermodalité, services vélo et marche."}'::jsonb, '{"group_key": "plan_de_mobilite_de_montagne", "label_ui_fr": "Mobilité montagne", "source_basis": "Apports utilisateur consolidés", "source_url": "https://www.laclefverte.org/ ; https://www.flocon-vert.org/"}'::jsonb),
  ('CAT_PROC', 'SA_LOCAL_ORGANIC_FAIRTRADE_FOOD', 'Produits locaux, bio ou équitables', 'Part d''offre alimentaire issue du local, du bio, de l''écolabellisé ou du commerce équitable.', 1, '{"fr": "Produits locaux, bio ou équitables"}'::jsonb, '{"fr": "Part d''offre alimentaire issue du local, du bio, de l''écolabellisé ou du commerce équitable."}'::jsonb, '{"group_key": "produits_locaux_bio_ou_equitables", "label_ui_fr": "Alimentation durable", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://www.tourisme-responsable.org/"}'::jsonb),
  ('CAT_PROC', 'SA_NO_ENDANGERED_SPECIES', 'Exclusion des espèces menacées', 'Absence de produits issus d''espèces menacées ou de filières non durables.', 2, '{"fr": "Exclusion des espèces menacées"}'::jsonb, '{"fr": "Absence de produits issus d''espèces menacées ou de filières non durables."}'::jsonb, '{"group_key": "exclusion_des_especes_menacees", "label_ui_fr": "Sans espèces menacées", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://www.tourisme-responsable.org/"}'::jsonb),
  ('CAT_PROC', 'SA_TAP_WATER_SERVICE', 'Proposition d''eau du robinet ou en carafe', 'Mise à disposition d''eau en carafe lorsque la qualité locale le permet.', 3, '{"fr": "Proposition d''eau du robinet ou en carafe"}'::jsonb, '{"fr": "Mise à disposition d''eau en carafe lorsque la qualité locale le permet."}'::jsonb, '{"group_key": "proposition_d_eau_du_robinet_ou_en_carafe", "label_ui_fr": "Eau du robinet", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://www.tourisme-responsable.org/"}'::jsonb),
  ('CAT_PROC', 'SA_VEGETARIAN_OFFER', 'Offre végétarienne', 'Présence d''au moins une offre végétarienne ou végétale identifiable.', 4, '{"fr": "Offre végétarienne"}'::jsonb, '{"fr": "Présence d''au moins une offre végétarienne ou végétale identifiable."}'::jsonb, '{"group_key": "offre_vegetarienne", "label_ui_fr": "Offre végétarienne", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://www.tourisme-responsable.org/"}'::jsonb),
  ('CAT_PROC', 'SA_FAIR_LOCAL_CONTRACTS', 'Contrats équitables avec les partenaires locaux', 'Relations contractuelles transparentes, durables et équitables avec les partenaires ou prestataires locaux.', 5, '{"fr": "Contrats équitables avec les partenaires locaux"}'::jsonb, '{"fr": "Relations contractuelles transparentes, durables et équitables avec les partenaires ou prestataires locaux."}'::jsonb, '{"group_key": "contrats_equitables_avec_les_partenaires_locaux", "label_ui_fr": "Contrats équitables", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "multi-source"}'::jsonb),
  ('CAT_PROC', 'SA_LOCAL_SUPPLIERS', 'Priorité aux fournisseurs locaux', 'Choix prioritaire de fournisseurs locaux, de proximité ou en circuits courts.', 6, '{"fr": "Priorité aux fournisseurs locaux"}'::jsonb, '{"fr": "Choix prioritaire de fournisseurs locaux, de proximité ou en circuits courts."}'::jsonb, '{"group_key": "priorite_aux_fournisseurs_locaux", "label_ui_fr": "Fournisseurs locaux", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "multi-source"}'::jsonb),
  ('CAT_PROC', 'SA_RESPONSIBLE_PROCUREMENT_POLICY', 'Politique d''achats responsables', 'Politique achats intégrant des critères environnementaux, sociaux, éthiques et de cycle de vie.', 7, '{"fr": "Politique d''achats responsables"}'::jsonb, '{"fr": "Politique achats intégrant des critères environnementaux, sociaux, éthiques et de cycle de vie."}'::jsonb, '{"group_key": "politique_d_achats_responsables", "label_ui_fr": "Achats responsables", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "multi-source"}'::jsonb),
  ('CAT_PROC', 'SA_SUPPLIER_EVALUATION', 'Évaluation RSE des fournisseurs', 'Qualification ou évaluation des fournisseurs selon des critères de conformité, environnement et responsabilité sociale.', 8, '{"fr": "Évaluation RSE des fournisseurs"}'::jsonb, '{"fr": "Qualification ou évaluation des fournisseurs selon des critères de conformité, environnement et responsabilité sociale."}'::jsonb, '{"group_key": "evaluation_rse_des_fournisseurs", "label_ui_fr": "Évaluation fournisseurs", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "multi-source"}'::jsonb),
  ('CAT_SOCIAL', 'SA_CLIENT_SENSITIZATION', 'Sensibilisation du voyageur avant et pendant le séjour', 'Information donnée au voyageur sur les impacts, comportements responsables et spécificités locales.', 1, '{"fr": "Sensibilisation du voyageur avant et pendant le séjour"}'::jsonb, '{"fr": "Information donnée au voyageur sur les impacts, comportements responsables et spécificités locales."}'::jsonb, '{"group_key": "sensibilisation_du_voyageur_avant_et_pendant_le_sejour", "label_ui_fr": "Sensibilisation voyageur", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.tourisme-responsable.org/"}'::jsonb),
  ('CAT_SOCIAL', 'SA_DESTINATION_PARTNER_AUDIT', 'Audit ou contrôle des partenaires de destination', 'Pré-audit, audit ou contrôle des partenaires ou réceptifs selon des critères responsables.', 2, '{"fr": "Audit ou contrôle des partenaires de destination"}'::jsonb, '{"fr": "Pré-audit, audit ou contrôle des partenaires ou réceptifs selon des critères responsables."}'::jsonb, '{"group_key": "audit_ou_controle_des_partenaires_de_destination", "label_ui_fr": "Audit partenaires", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.tourisme-responsable.org/"}'::jsonb),
  ('CAT_SOCIAL', 'SA_HUMAN_RIGHTS_DECENT_WORK', 'Engagement droits humains et travail décent', 'Engagement formalisé contre les atteintes aux droits humains et en faveur de conditions de travail décentes.', 3, '{"fr": "Engagement droits humains et travail décent"}'::jsonb, '{"fr": "Engagement formalisé contre les atteintes aux droits humains et en faveur de conditions de travail décentes."}'::jsonb, '{"group_key": "engagement_droits_humains_et_travail_decent", "label_ui_fr": "Droits humains", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.tourisme-responsable.org/"}'::jsonb),
  ('CAT_SOCIAL', 'SA_LOCAL_POPULATION_INVOLVEMENT', 'Implication des populations locales', 'Participation des populations locales à la conception, à l''accueil ou à la mise en œuvre de l''offre.', 4, '{"fr": "Implication des populations locales"}'::jsonb, '{"fr": "Participation des populations locales à la conception, à l''accueil ou à la mise en œuvre de l''offre."}'::jsonb, '{"group_key": "implication_des_populations_locales", "label_ui_fr": "Implication locale", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.tourisme-responsable.org/"}'::jsonb),
  ('CAT_SOCIAL', 'SA_TRANSPARENT_SALES_INFO', 'Information transparente sur l''offre et ses impacts', 'Information claire sur le contenu de l''offre, ses impacts, ses limites et ses conditions.', 5, '{"fr": "Information transparente sur l''offre et ses impacts"}'::jsonb, '{"fr": "Information claire sur le contenu de l''offre, ses impacts, ses limites et ses conditions."}'::jsonb, '{"group_key": "information_transparente_sur_l_offre_et_ses_impacts", "label_ui_fr": "Info impacts voyage", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.tourisme-responsable.org/"}'::jsonb),
  ('CAT_TERR', 'SA_DESTINATION_SUST_INDICATORS', 'Indicateurs de destination durable', 'Suivi structuré des indicateurs de durabilité à l''échelle de la destination : eau, déchets, énergie, emplois locaux, satisfaction, fréquentation.', 1, '{"fr": "Indicateurs de destination durable"}'::jsonb, '{"fr": "Suivi structuré des indicateurs de durabilité à l''échelle de la destination : eau, déchets, énergie, emplois locaux, satisfaction, fréquentation."}'::jsonb, '{"group_key": "indicateurs_de_destination_durable", "label_ui_fr": "Indicateurs destination", "source_basis": "Apports utilisateur consolidés", "source_url": "https://www.greendestinations.org/ ; https://www.economie.gouv.fr/entreprises/developper-son-entreprise/labels-qualite-et-valorisation-du-savoir-faire/destination"}'::jsonb),
  ('CAT_TERR', 'SA_LABELLED_LOCAL_OFFERS', 'Mise en avant des offres locales engagées', 'Valorisation des offres, produits ou prestataires locaux engagés ou labellisés.', 2, '{"fr": "Mise en avant des offres locales engagées"}'::jsonb, '{"fr": "Valorisation des offres, produits ou prestataires locaux engagés ou labellisés."}'::jsonb, '{"group_key": "mise_en_avant_des_offres_locales_engagees", "label_ui_fr": "Offres locales engagées", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.greendestinations.org/ ; https://www.economie.gouv.fr/entreprises/developper-son-entreprise/labels-qualite-et-valorisation-du-savoir-faire/destination"}'::jsonb),
  ('CAT_TERR', 'SA_LOCAL_COMMUNITY_SUPPORT', 'Soutien à l''économie et à la communauté locale', 'Actions qui renforcent les retombées locales, les partenariats et le développement local.', 3, '{"fr": "Soutien à l''économie et à la communauté locale"}'::jsonb, '{"fr": "Actions qui renforcent les retombées locales, les partenariats et le développement local."}'::jsonb, '{"group_key": "soutien_a_l_economie_et_a_la_communaute_locale", "label_ui_fr": "Soutien local", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.greendestinations.org/ ; https://www.economie.gouv.fr/entreprises/developper-son-entreprise/labels-qualite-et-valorisation-du-savoir-faire/destination"}'::jsonb),
  ('CAT_TERR', 'SA_PRO_TRANSITION_SUPPORT', 'Accompagnement des professionnels dans leur transition', 'Aide apportée aux professionnels pour progresser vers des pratiques ou labels plus durables.', 4, '{"fr": "Accompagnement des professionnels dans leur transition"}'::jsonb, '{"fr": "Aide apportée aux professionnels pour progresser vers des pratiques ou labels plus durables."}'::jsonb, '{"group_key": "accompagnement_des_professionnels_dans_leur_transition", "label_ui_fr": "Accompagnement pros", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.greendestinations.org/ ; https://www.economie.gouv.fr/entreprises/developper-son-entreprise/labels-qualite-et-valorisation-du-savoir-faire/destination"}'::jsonb),
  ('CAT_TERR', 'SA_TERRITORY_SUST_INFO', 'Information sur la durabilité du territoire', 'Information donnée aux visiteurs sur les engagements du territoire, ressources, transport, accessibilité.', 5, '{"fr": "Information sur la durabilité du territoire"}'::jsonb, '{"fr": "Information donnée aux visiteurs sur les engagements du territoire, ressources, transport, accessibilité."}'::jsonb, '{"group_key": "information_sur_la_durabilite_du_territoire", "label_ui_fr": "Info durabilité territoire", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.greendestinations.org/ ; https://www.economie.gouv.fr/entreprises/developper-son-entreprise/labels-qualite-et-valorisation-du-savoir-faire/destination"}'::jsonb),
  ('CAT_TERR', 'SA_VISITOR_FLOW_MANAGEMENT', 'Gestion des flux touristiques', 'Actions de gestion des flux, de désaisonnalisation ou d''orientation des visiteurs.', 6, '{"fr": "Gestion des flux touristiques"}'::jsonb, '{"fr": "Actions de gestion des flux, de désaisonnalisation ou d''orientation des visiteurs."}'::jsonb, '{"group_key": "gestion_des_flux_touristiques", "label_ui_fr": "Gestion des flux", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.greendestinations.org/ ; https://www.economie.gouv.fr/entreprises/developper-son-entreprise/labels-qualite-et-valorisation-du-savoir-faire/destination"}'::jsonb),
  ('CAT_WASTE', 'SA_BULK_OR_REFILL', 'Produits en vrac ou rechargeables', 'Remplacement des petits conditionnements par du vrac, du rechargeable ou du grand format.', 1, '{"fr": "Produits en vrac ou rechargeables"}'::jsonb, '{"fr": "Remplacement des petits conditionnements par du vrac, du rechargeable ou du grand format."}'::jsonb, '{"group_key": "produits_en_vrac_ou_rechargeables", "label_ui_fr": "Vrac & recharge", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://pavillonbleu.org/"}'::jsonb),
  ('CAT_WASTE', 'SA_COASTAL_WASTE_MANAGEMENT', 'Gestion des déchets littoraux', 'Prévention des déchets sauvages, organisation du nettoyage raisonné des plages, ports ou abords aquatiques, et dispositifs de tri adaptés.', 2, '{"fr": "Gestion des déchets littoraux"}'::jsonb, '{"fr": "Prévention des déchets sauvages, organisation du nettoyage raisonné des plages, ports ou abords aquatiques, et dispositifs de tri adaptés."}'::jsonb, '{"group_key": "gestion_des_dechets_littoraux", "label_ui_fr": "Déchets littoraux", "source_basis": "Apports utilisateur consolidés", "source_url": "https://www.laclefverte.org/ ; https://pavillonbleu.org/"}'::jsonb),
  ('CAT_WASTE', 'SA_COMPOSTING', 'Compostage des biodéchets', 'Compostage sur site ou recours à une filière de compostage/valorisation organique.', 3, '{"fr": "Compostage des biodéchets"}'::jsonb, '{"fr": "Compostage sur site ou recours à une filière de compostage/valorisation organique."}'::jsonb, '{"group_key": "compostage_des_biodechets", "label_ui_fr": "Compostage", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://pavillonbleu.org/"}'::jsonb),
  ('CAT_WASTE', 'SA_DISPOSABLE_REDUCTION', 'Réduction des produits jetables', 'Suppression ou forte limitation des articles à usage unique.', 4, '{"fr": "Réduction des produits jetables"}'::jsonb, '{"fr": "Suppression ou forte limitation des articles à usage unique."}'::jsonb, '{"group_key": "reduction_des_produits_jetables", "label_ui_fr": "Moins de jetables", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://pavillonbleu.org/"}'::jsonb),
  ('CAT_WASTE', 'SA_DURABLE_GOODS_REUSE', 'Biens durables, réparation et réemploi', 'Choix de biens durables et recours à la réparation, au réemploi ou au don.', 5, '{"fr": "Biens durables, réparation et réemploi"}'::jsonb, '{"fr": "Choix de biens durables et recours à la réparation, au réemploi ou au don."}'::jsonb, '{"group_key": "biens_durables_reparation_et_reemploi", "label_ui_fr": "Réemploi & réparation", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://pavillonbleu.org/"}'::jsonb),
  ('CAT_WASTE', 'SA_FOOD_WASTE_REDUCTION', 'Réduction du gaspillage alimentaire', 'Mesures pour prévenir, mesurer et réduire le gaspillage alimentaire.', 6, '{"fr": "Réduction du gaspillage alimentaire"}'::jsonb, '{"fr": "Mesures pour prévenir, mesurer et réduire le gaspillage alimentaire."}'::jsonb, '{"group_key": "reduction_du_gaspillage_alimentaire", "label_ui_fr": "Anti-gaspillage", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://pavillonbleu.org/"}'::jsonb),
  ('CAT_WASTE', 'SA_HAZARDOUS_WASTE', 'Gestion des déchets dangereux', 'Tri, stockage et élimination sécurisés des piles, lampes, produits chimiques ou équivalents.', 7, '{"fr": "Gestion des déchets dangereux"}'::jsonb, '{"fr": "Tri, stockage et élimination sécurisés des piles, lampes, produits chimiques ou équivalents."}'::jsonb, '{"group_key": "gestion_des_dechets_dangereux", "label_ui_fr": "Déchets dangereux", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://pavillonbleu.org/"}'::jsonb),
  ('CAT_WASTE', 'SA_ORGANIC_WASTE_SORTING', 'Tri des biodéchets', 'Tri à la source des biodéchets pour collecte ou valorisation adaptée.', 8, '{"fr": "Tri des biodéchets"}'::jsonb, '{"fr": "Tri à la source des biodéchets pour collecte ou valorisation adaptée."}'::jsonb, '{"group_key": "tri_des_biodechets", "label_ui_fr": "Tri biodéchets", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://pavillonbleu.org/"}'::jsonb),
  ('CAT_WASTE', 'SA_PAPER_REDUCTION', 'Réduction du papier', 'Réduction des impressions, brochures ou supports papier non indispensables.', 9, '{"fr": "Réduction du papier"}'::jsonb, '{"fr": "Réduction des impressions, brochures ou supports papier non indispensables."}'::jsonb, '{"group_key": "reduction_du_papier", "label_ui_fr": "Moins de papier", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://pavillonbleu.org/"}'::jsonb),
  ('CAT_WASTE', 'SA_WASTE_SORTING_GUESTS', 'Tri des déchets pour les clients', 'Mise à disposition de bacs et consignes de tri claires pour les clients.', 10, '{"fr": "Tri des déchets pour les clients"}'::jsonb, '{"fr": "Mise à disposition de bacs et consignes de tri claires pour les clients."}'::jsonb, '{"group_key": "tri_des_dechets_pour_les_clients", "label_ui_fr": "Tri clients", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://pavillonbleu.org/"}'::jsonb),
  ('CAT_WASTE', 'SA_WASTE_SORTING_STAFF', 'Tri des déchets pour le personnel', 'Consignes, bacs et organisation permettant le tri des déchets dans les zones internes.', 11, '{"fr": "Tri des déchets pour le personnel"}'::jsonb, '{"fr": "Consignes, bacs et organisation permettant le tri des déchets dans les zones internes."}'::jsonb, '{"group_key": "tri_des_dechets_pour_le_personnel", "label_ui_fr": "Tri équipe", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://pavillonbleu.org/"}'::jsonb),
  ('CAT_WATER', 'SA_BEACH_WATER_QUALITY', 'Qualité de l''eau de baignade', 'Surveillance, affichage et gestion de la qualité de l''eau de baignade ou d''usage récréatif, avec prévention des pollutions.', 1, '{"fr": "Qualité de l''eau de baignade"}'::jsonb, '{"fr": "Surveillance, affichage et gestion de la qualité de l''eau de baignade ou d''usage récréatif, avec prévention des pollutions."}'::jsonb, '{"group_key": "qualite_de_l_eau_de_baignade", "label_ui_fr": "Qualité eau baignade", "source_basis": "Apports utilisateur consolidés", "source_url": "https://www.laclefverte.org/ ; https://pavillonbleu.org/"}'::jsonb),
  ('CAT_WATER', 'SA_DISHWASHER_WATER_EFF', 'Lave-vaisselle sobre en eau', 'Choix ou réglage de lave-vaisselle optimisés pour limiter la consommation d''eau.', 2, '{"fr": "Lave-vaisselle sobre en eau"}'::jsonb, '{"fr": "Choix ou réglage de lave-vaisselle optimisés pour limiter la consommation d''eau."}'::jsonb, '{"group_key": "lave_vaisselle_sobre_en_eau", "label_ui_fr": "Lave-vaisselle économe", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://pavillonbleu.org/"}'::jsonb),
  ('CAT_WATER', 'SA_EFFICIENT_IRRIGATION', 'Arrosage économe', 'Systèmes d''irrigation économes et pilotés selon les besoins.', 3, '{"fr": "Arrosage économe"}'::jsonb, '{"fr": "Systèmes d''irrigation économes et pilotés selon les besoins."}'::jsonb, '{"group_key": "arrosage_econome", "label_ui_fr": "Arrosage économe", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://pavillonbleu.org/"}'::jsonb),
  ('CAT_WATER', 'SA_EFFICIENT_TAPS_SHOWERS', 'Robinets et douches économes', 'Mousseurs, réducteurs de débit ou équipements sobres sur les robinets et douches.', 4, '{"fr": "Robinets et douches économes"}'::jsonb, '{"fr": "Mousseurs, réducteurs de débit ou équipements sobres sur les robinets et douches."}'::jsonb, '{"group_key": "robinets_et_douches_economes", "label_ui_fr": "Robinets économes", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://pavillonbleu.org/"}'::jsonb),
  ('CAT_WATER', 'SA_EFFICIENT_TOILETS', 'Toilettes et urinoirs économes', 'Double chasse, systèmes économes ou équipements limitant la consommation d''eau des sanitaires.', 5, '{"fr": "Toilettes et urinoirs économes"}'::jsonb, '{"fr": "Double chasse, systèmes économes ou équipements limitant la consommation d''eau des sanitaires."}'::jsonb, '{"group_key": "toilettes_et_urinoirs_economes", "label_ui_fr": "Toilettes économes", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://pavillonbleu.org/"}'::jsonb),
  ('CAT_WATER', 'SA_LAUNDRY_WATER_EFF', 'Lave-linge sobre en eau', 'Choix ou réglage de lave-linge optimisés pour limiter la consommation d''eau.', 6, '{"fr": "Lave-linge sobre en eau"}'::jsonb, '{"fr": "Choix ou réglage de lave-linge optimisés pour limiter la consommation d''eau."}'::jsonb, '{"group_key": "lave_linge_sobre_en_eau", "label_ui_fr": "Lave-linge économe", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://pavillonbleu.org/"}'::jsonb),
  ('CAT_WATER', 'SA_LEAK_DETECTION', 'Détection des fuites', 'Routine de contrôle ou système permettant d''identifier rapidement les fuites et surconsommations.', 7, '{"fr": "Détection des fuites"}'::jsonb, '{"fr": "Routine de contrôle ou système permettant d''identifier rapidement les fuites et surconsommations."}'::jsonb, '{"group_key": "detection_des_fuites", "label_ui_fr": "Détection fuites", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://pavillonbleu.org/"}'::jsonb),
  ('CAT_WATER', 'SA_RAINWATER_REUSE', 'Réutilisation des eaux de pluie ou eaux grises', 'Dispositifs de récupération ou de réutilisation de l''eau pour des usages adaptés.', 8, '{"fr": "Réutilisation des eaux de pluie ou eaux grises"}'::jsonb, '{"fr": "Dispositifs de récupération ou de réutilisation de l''eau pour des usages adaptés."}'::jsonb, '{"group_key": "reutilisation_des_eaux_de_pluie_ou_eaux_grises", "label_ui_fr": "Réutilisation eau", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://pavillonbleu.org/"}'::jsonb),
  ('CAT_WATER', 'SA_TOWEL_LINEN_REUSE', 'Réutilisation des serviettes et du linge', 'Changement du linge et des serviettes à fréquence maîtrisée ou sur demande.', 9, '{"fr": "Réutilisation des serviettes et du linge"}'::jsonb, '{"fr": "Changement du linge et des serviettes à fréquence maîtrisée ou sur demande."}'::jsonb, '{"group_key": "reutilisation_des_serviettes_et_du_linge", "label_ui_fr": "Linge sur demande", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://pavillonbleu.org/"}'::jsonb),
  ('CAT_WATER', 'SA_WASTEWATER_TREATMENT', 'Traitement maîtrisé des eaux usées', 'Gestion conforme du traitement ou du raccordement des eaux usées et suivi associé.', 10, '{"fr": "Traitement maîtrisé des eaux usées"}'::jsonb, '{"fr": "Gestion conforme du traitement ou du raccordement des eaux usées et suivi associé."}'::jsonb, '{"group_key": "traitement_maitrise_des_eaux_usees", "label_ui_fr": "Eaux usées", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://pavillonbleu.org/"}'::jsonb),
  ('CAT_WATER', 'SA_WATER_MONITORING', 'Suivi des consommations d''eau', 'Mesure régulière des consommations d''eau et détection des dérives.', 11, '{"fr": "Suivi des consommations d''eau"}'::jsonb, '{"fr": "Mesure régulière des consommations d''eau et détection des dérives."}'::jsonb, '{"group_key": "suivi_des_consommations_d_eau", "label_ui_fr": "Suivi eau", "source_basis": "Catalogue consolidé OpenAI + apports utilisateur", "source_url": "https://www.laclefverte.org/ ; https://pavillonbleu.org/"}'::jsonb)
)
INSERT INTO ref_sustainability_action_group (category_id, code, name, description, position, name_i18n, description_i18n, extra)
SELECT c.id, src.code, src.name, src.description, src.position, src.name_i18n, src.description_i18n, src.extra
FROM src
JOIN ref_sustainability_action_category c ON c.code = src.category_code
ON CONFLICT (code) DO UPDATE SET
  category_id = EXCLUDED.category_id,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  position = EXCLUDED.position,
  name_i18n = EXCLUDED.name_i18n,
  description_i18n = EXCLUDED.description_i18n,
  extra = EXCLUDED.extra,
  updated_at = NOW();

-- 5) Sustainability micro-actions (part 1/4: CAT_BIO + CAT_ENERGY)
WITH src(category_code, group_code, code, external_code, label, description, position, action_ui_priority, label_i18n, description_i18n, extra) AS (
VALUES
  ('CAT_BIO', 'SA_BIODIVERSITY_PROTECTION', 'MA_HABITAT_PROTECTION', 'MA_HABITAT_PROTECTION', 'Habitat protégé', 'Mesures de protection des habitats mises en place.', 20211, 3, '{"fr": "Habitat protégé"}'::jsonb, '{"fr": "Mesures de protection des habitats mises en place."}'::jsonb, '{"action_key": "ma_habitat_protection", "label_ui_fr": "Habitat protégé"}'::jsonb),
  ('CAT_BIO', 'SA_BIODIVERSITY_PROTECTION', 'MA_BIODIV_INVENTORY', 'MA_BIODIV_INVENTORY', 'Inventaire biodiversité', 'Inventaire simplifié de la biodiversité locale ou des habitats présents sur le site.', 20212, 3, '{"fr": "Inventaire biodiversité"}'::jsonb, '{"fr": "Inventaire simplifié de la biodiversité locale ou des habitats présents sur le site."}'::jsonb, '{"action_key": "ma_biodiv_inventory", "label_ui_fr": "Inventaire biodiversité"}'::jsonb),
  ('CAT_BIO', 'SA_BIODIVERSITY_PROTECTION', 'MA_BIODIVERSITY_AWARENESS', 'MA_BIODIVERSITY_AWARENESS', 'Sensibilisation biodiversité', 'Information visiteurs sur la biodiversité.', 20213, 3, '{"fr": "Sensibilisation biodiversité"}'::jsonb, '{"fr": "Information visiteurs sur la biodiversité."}'::jsonb, '{"action_key": "ma_biodiversity_awareness", "label_ui_fr": "Sensibilisation biodiversité"}'::jsonb),
  ('CAT_BIO', 'SA_BIODIVERSITY_PROTECTION', 'MA_REFUGE_ZONE', 'MA_REFUGE_ZONE', 'Zone refuge', 'Zones refuges ou quiétude créées.', 20214, 3, '{"fr": "Zone refuge"}'::jsonb, '{"fr": "Zones refuges ou quiétude créées."}'::jsonb, '{"action_key": "ma_refuge_zone", "label_ui_fr": "Zone refuge"}'::jsonb),
  -- MA_WILDLIFE_CORRIDORS added 2026-03-22: V5 canonical replacement for pre-V5 'wildlife_corridors' code.
  ('CAT_BIO', 'SA_BIODIVERSITY_PROTECTION', 'MA_WILDLIFE_CORRIDORS', 'MA_WILDLIFE_CORRIDORS', 'Corridors biologiques', 'Aménagement ou préservation de corridors écologiques permettant le passage de la faune locale.', 20215, 3, '{"fr": "Corridors biologiques"}'::jsonb, '{"fr": "Aménagement ou préservation de corridors écologiques permettant le passage de la faune locale."}'::jsonb, '{"action_key": "ma_wildlife_corridors", "label_ui_fr": "Corridors biologiques"}'::jsonb),
  ('CAT_BIO', 'SA_COASTAL_WASTE_MANAGEMENT', 'MA_BEACH_ASH_TRAYS', 'MA_BEACH_ASH_TRAYS', 'Cendriers de plage', 'Mise à disposition de cendriers de plage ou actions spécifiques contre la pollution des mégots.', 20761, 3, '{"fr": "Cendriers de plage"}'::jsonb, '{"fr": "Mise à disposition de cendriers de plage ou actions spécifiques contre la pollution des mégots."}'::jsonb, '{"action_key": "ma_beach_ash_trays", "label_ui_fr": "Cendriers de plage"}'::jsonb),
  ('CAT_BIO', 'SA_COASTAL_WASTE_MANAGEMENT', 'MA_MANUAL_BEACH_CLEANING', 'MA_MANUAL_BEACH_CLEANING', 'Nettoyage manuel plage', 'Nettoyage manuel ou raisonné des plages pour limiter l''impact sur les milieux littoraux.', 20762, 3, '{"fr": "Nettoyage manuel plage"}'::jsonb, '{"fr": "Nettoyage manuel ou raisonné des plages pour limiter l''impact sur les milieux littoraux."}'::jsonb, '{"action_key": "ma_manual_beach_cleaning", "label_ui_fr": "Nettoyage manuel"}'::jsonb),
  ('CAT_BIO', 'SA_CONCENTRATED_CLEANERS', 'MA_CONCENTRATED_FORMAT', 'MA_CONCENTRATED_FORMAT', 'Formats concentrés', 'Usage de produits concentrés.', 20221, 4, '{"fr": "Formats concentrés"}'::jsonb, '{"fr": "Usage de produits concentrés."}'::jsonb, '{"action_key": "ma_concentrated_format", "label_ui_fr": "Formats concentrés"}'::jsonb),
  ('CAT_BIO', 'SA_CONCENTRATED_CLEANERS', 'MA_LESS_PACKAGING', 'MA_LESS_PACKAGING', 'Moins d''emballages', 'Réduction des emballages par format concentré.', 20222, 4, '{"fr": "Moins d''emballages"}'::jsonb, '{"fr": "Réduction des emballages par format concentré."}'::jsonb, '{"action_key": "ma_less_packaging", "label_ui_fr": "Moins d''emballages"}'::jsonb),
  ('CAT_BIO', 'SA_CONCENTRATED_CLEANERS', 'MA_DOSING_STATION', 'MA_DOSING_STATION', 'Station de dilution', 'Station de dilution ou dosage installée.', 20223, 4, '{"fr": "Station de dilution"}'::jsonb, '{"fr": "Station de dilution ou dosage installée."}'::jsonb, '{"action_key": "ma_dosing_station", "label_ui_fr": "Station de dilution"}'::jsonb),
  ('CAT_BIO', 'SA_ECOLABEL_CLEANERS', 'MA_ECOLABEL_LIST', 'MA_ECOLABEL_LIST', 'Liste produits suivie', 'Liste des références écolabellisées tenue à jour.', 20231, 4, '{"fr": "Liste produits suivie"}'::jsonb, '{"fr": "Liste des références écolabellisées tenue à jour."}'::jsonb, '{"action_key": "ma_ecolabel_list", "label_ui_fr": "Liste produits suivie"}'::jsonb),
  ('CAT_BIO', 'SA_ECOLABEL_CLEANERS', 'MA_SUPPLIER_PROOF', 'MA_SUPPLIER_PROOF', 'Preuves fournisseurs', 'Preuves ou fiches produits conservées.', 20232, 4, '{"fr": "Preuves fournisseurs"}'::jsonb, '{"fr": "Preuves ou fiches produits conservées."}'::jsonb, '{"action_key": "ma_supplier_proof", "label_ui_fr": "Preuves fournisseurs"}'::jsonb),
  ('CAT_BIO', 'SA_ECOLABEL_CLEANERS', 'MA_ECOLABEL_PRODUCTS', 'MA_ECOLABEL_PRODUCTS', 'Produits certifiés', 'Produits d''entretien écolabellisés utilisés.', 20233, 4, '{"fr": "Produits certifiés"}'::jsonb, '{"fr": "Produits d''entretien écolabellisés utilisés."}'::jsonb, '{"action_key": "ma_ecolabel_products", "label_ui_fr": "Produits certifiés"}'::jsonb),
  ('CAT_BIO', 'SA_LOW_CHEMICAL_DISINFECTION', 'MA_TARGETED_DISINFECTION', 'MA_TARGETED_DISINFECTION', 'Désinfection ciblée', 'Désinfection ciblée plutôt que systématique.', 20241, 4, '{"fr": "Désinfection ciblée"}'::jsonb, '{"fr": "Désinfection ciblée plutôt que systématique."}'::jsonb, '{"action_key": "ma_targeted_disinfection", "label_ui_fr": "Désinfection ciblée"}'::jsonb),
  ('CAT_BIO', 'SA_LOW_CHEMICAL_DISINFECTION', 'MA_ALT_METHODS', 'MA_ALT_METHODS', 'Méthodes alternatives', 'Méthodes ou produits moins impactants privilégiés.', 20242, 4, '{"fr": "Méthodes alternatives"}'::jsonb, '{"fr": "Méthodes ou produits moins impactants privilégiés."}'::jsonb, '{"action_key": "ma_alt_methods", "label_ui_fr": "Méthodes alternatives"}'::jsonb),
  ('CAT_BIO', 'SA_LOW_CHEMICAL_DISINFECTION', 'MA_CHEMICAL_REVIEW', 'MA_CHEMICAL_REVIEW', 'Revue des usages', 'Revue des usages de désinfection réalisée.', 20243, 4, '{"fr": "Revue des usages"}'::jsonb, '{"fr": "Revue des usages de désinfection réalisée."}'::jsonb, '{"action_key": "ma_chemical_review", "label_ui_fr": "Revue des usages"}'::jsonb),
  ('CAT_BIO', 'SA_NATIVE_PLANTING', 'MA_NATIVE_SPECIES', 'MA_NATIVE_SPECIES', 'Espèces locales', 'Plantations d''espèces locales ou adaptées.', 20251, 4, '{"fr": "Espèces locales"}'::jsonb, '{"fr": "Plantations d''espèces locales ou adaptées."}'::jsonb, '{"action_key": "ma_native_species", "label_ui_fr": "Espèces locales"}'::jsonb),
  ('CAT_BIO', 'SA_NATIVE_PLANTING', 'MA_INVASIVE_SPECIES_AVOIDED', 'MA_INVASIVE_SPECIES_AVOIDED', 'Pas d''invasives', 'Évitement des espèces invasives.', 20252, 4, '{"fr": "Pas d''invasives"}'::jsonb, '{"fr": "Évitement des espèces invasives."}'::jsonb, '{"action_key": "ma_invasive_species_avoided", "label_ui_fr": "Pas d''invasives"}'::jsonb),
  ('CAT_BIO', 'SA_NATIVE_PLANTING', 'MA_POLLINATOR_PLANTS', 'MA_POLLINATOR_PLANTS', 'Plantes mellifères', 'Plantes favorables aux pollinisateurs implantées.', 20253, 4, '{"fr": "Plantes mellifères"}'::jsonb, '{"fr": "Plantes favorables aux pollinisateurs implantées."}'::jsonb, '{"action_key": "ma_pollinator_plants", "label_ui_fr": "Plantes mellifères"}'::jsonb),
  ('CAT_BIO', 'SA_PESTICIDE_AVOIDANCE', 'MA_MECHANICAL_WEEDING', 'MA_MECHANICAL_WEEDING', 'Désherbage alternatif', 'Désherbage mécanique ou manuel privilégié.', 20261, 4, '{"fr": "Désherbage alternatif"}'::jsonb, '{"fr": "Désherbage mécanique ou manuel privilégié."}'::jsonb, '{"action_key": "ma_mechanical_weeding", "label_ui_fr": "Désherbage alternatif"}'::jsonb),
  ('CAT_BIO', 'SA_PESTICIDE_AVOIDANCE', 'MA_NATURAL_PRODUCTS', 'MA_NATURAL_PRODUCTS', 'Produits naturels', 'Solutions naturelles utilisées si besoin.', 20262, 4, '{"fr": "Produits naturels"}'::jsonb, '{"fr": "Solutions naturelles utilisées si besoin."}'::jsonb, '{"action_key": "ma_natural_products", "label_ui_fr": "Produits naturels"}'::jsonb),
  ('CAT_BIO', 'SA_PESTICIDE_AVOIDANCE', 'MA_ZERO_PESTICIDE', 'MA_ZERO_PESTICIDE', 'Zéro pesticide', 'Aucun pesticide chimique utilisé.', 20263, 4, '{"fr": "Zéro pesticide"}'::jsonb, '{"fr": "Aucun pesticide chimique utilisé."}'::jsonb, '{"action_key": "ma_zero_pesticide", "label_ui_fr": "Zéro pesticide"}'::jsonb),
  ('CAT_ENERGY', 'SA_AUTO_SWITCH_OFF', 'MA_KEYCARD_SWITCH', 'MA_KEYCARD_SWITCH', 'Coupure par badge', 'Coupure énergie par badge ou détecteur.', 30271, 4, '{"fr": "Coupure par badge"}'::jsonb, '{"fr": "Coupure énergie par badge ou détecteur."}'::jsonb, '{"action_key": "ma_keycard_switch", "label_ui_fr": "Coupure par badge"}'::jsonb),
  ('CAT_ENERGY', 'SA_AUTO_SWITCH_OFF', 'MA_AUTO_LIGHT_OFF', 'MA_AUTO_LIGHT_OFF', 'Extinction auto éclairage', 'Extinction automatique de l''éclairage.', 30272, 4, '{"fr": "Extinction auto éclairage"}'::jsonb, '{"fr": "Extinction automatique de l''éclairage."}'::jsonb, '{"action_key": "ma_auto_light_off", "label_ui_fr": "Extinction auto éclairage"}'::jsonb),
  ('CAT_ENERGY', 'SA_AUTO_SWITCH_OFF', 'MA_STANDBY_POLICY', 'MA_STANDBY_POLICY', 'Veilles réduites', 'Réduction des équipements en veille.', 30273, 4, '{"fr": "Veilles réduites"}'::jsonb, '{"fr": "Réduction des équipements en veille."}'::jsonb, '{"action_key": "ma_standby_policy", "label_ui_fr": "Veilles réduites"}'::jsonb),
  ('CAT_ENERGY', 'SA_CARBON_FOOTPRINT', 'MA_GHG_ACCOUNTING', 'MA_GHG_ACCOUNTING', 'Calcul GES', 'Bilan GES réalisé.', 30281, 4, '{"fr": "Calcul GES"}'::jsonb, '{"fr": "Bilan GES réalisé."}'::jsonb, '{"action_key": "ma_ghg_accounting", "label_ui_fr": "Calcul GES"}'::jsonb),
  ('CAT_ENERGY', 'SA_CARBON_FOOTPRINT', 'MA_LOW_CARBON_PROJECTS', 'MA_LOW_CARBON_PROJECTS', 'Projets bas-carbone', 'Financement ou soutien de projets bas-carbone.', 30282, 4, '{"fr": "Projets bas-carbone"}'::jsonb, '{"fr": "Financement ou soutien de projets bas-carbone."}'::jsonb, '{"action_key": "ma_low_carbon_projects", "label_ui_fr": "Projets bas-carbone"}'::jsonb),
  ('CAT_ENERGY', 'SA_CARBON_FOOTPRINT', 'MA_REDUCTION_TRAJECTORY', 'MA_REDUCTION_TRAJECTORY', 'Trajectoire de réduction', 'Objectif et trajectoire de réduction définis.', 30283, 4, '{"fr": "Trajectoire de réduction"}'::jsonb, '{"fr": "Objectif et trajectoire de réduction définis."}'::jsonb, '{"action_key": "ma_reduction_trajectory", "label_ui_fr": "Trajectoire de réduction"}'::jsonb),
  ('CAT_ENERGY', 'SA_CLIMATE_ADAPTATION', 'MA_CLIMATE_RISK_MAP', 'MA_CLIMATE_RISK_MAP', 'Cartographie des risques', 'Cartographie des risques climatiques réalisée.', 30291, 4, '{"fr": "Cartographie des risques"}'::jsonb, '{"fr": "Cartographie des risques climatiques réalisée."}'::jsonb, '{"action_key": "ma_climate_risk_map", "label_ui_fr": "Cartographie des risques"}'::jsonb),
  ('CAT_ENERGY', 'SA_CLIMATE_ADAPTATION', 'MA_HEATWAVE_PLAN', 'MA_HEATWAVE_PLAN', 'Plan canicule', 'Plan canicule ou fortes chaleurs formalisé.', 30292, 4, '{"fr": "Plan canicule"}'::jsonb, '{"fr": "Plan canicule ou fortes chaleurs formalisé."}'::jsonb, '{"action_key": "ma_heatwave_plan", "label_ui_fr": "Plan canicule"}'::jsonb),
  ('CAT_ENERGY', 'SA_CLIMATE_ADAPTATION', 'MA_NATURE_BASED_SOLUTIONS', 'MA_NATURE_BASED_SOLUTIONS', 'Solutions fondées nature', 'Végétalisation ou solutions de confort d''été mises en place.', 30293, 4, '{"fr": "Solutions fondées nature"}'::jsonb, '{"fr": "Végétalisation ou solutions de confort d''été mises en place."}'::jsonb, '{"action_key": "ma_nature_based_solutions", "label_ui_fr": "Solutions fondées nature"}'::jsonb),
  ('CAT_ENERGY', 'SA_EFFICIENT_LIGHTING', 'MA_MOTION_SENSORS', 'MA_MOTION_SENSORS', 'Détecteurs présence', 'Détecteurs ou minuteries installés.', 30301, 4, '{"fr": "Détecteurs présence"}'::jsonb, '{"fr": "Détecteurs ou minuteries installés."}'::jsonb, '{"action_key": "ma_motion_sensors", "label_ui_fr": "Détecteurs présence"}'::jsonb),
  ('CAT_ENERGY', 'SA_EFFICIENT_LIGHTING', 'MA_LIGHTING_INVENTORY', 'MA_LIGHTING_INVENTORY', 'Inventaire éclairage', 'Inventaire et remplacement planifié.', 30302, 4, '{"fr": "Inventaire éclairage"}'::jsonb, '{"fr": "Inventaire et remplacement planifié."}'::jsonb, '{"action_key": "ma_lighting_inventory", "label_ui_fr": "Inventaire éclairage"}'::jsonb),
  ('CAT_ENERGY', 'SA_EFFICIENT_LIGHTING', 'MA_LED_BULBS', 'MA_LED_BULBS', 'LED généralisées', 'Éclairage LED installé.', 30303, 4, '{"fr": "LED généralisées"}'::jsonb, '{"fr": "Éclairage LED installé."}'::jsonb, '{"action_key": "ma_led_bulbs", "label_ui_fr": "LED généralisées"}'::jsonb),
  ('CAT_ENERGY', 'SA_ENERGY_AUDIT', 'MA_AUDIT_DONE', 'MA_AUDIT_DONE', 'Audit réalisé', 'Audit énergétique réalisé.', 30311, 4, '{"fr": "Audit réalisé"}'::jsonb, '{"fr": "Audit énergétique réalisé."}'::jsonb, '{"action_key": "ma_audit_done", "label_ui_fr": "Audit réalisé"}'::jsonb),
  ('CAT_ENERGY', 'SA_ENERGY_AUDIT', 'MA_AUDIT_ACTIONS_PRIORITIZED', 'MA_AUDIT_ACTIONS_PRIORITIZED', 'Plan d''actions audit', 'Actions issues de l''audit priorisées.', 30312, 4, '{"fr": "Plan d''actions audit"}'::jsonb, '{"fr": "Actions issues de l''audit priorisées."}'::jsonb, '{"action_key": "ma_audit_actions_prioritized", "label_ui_fr": "Plan d''actions audit"}'::jsonb),
  ('CAT_ENERGY', 'SA_ENERGY_AUDIT', 'MA_ROI_TRACKING', 'MA_ROI_TRACKING', 'ROI suivi', 'Suivi des gains ou du retour sur investissement.', 30313, 4, '{"fr": "ROI suivi"}'::jsonb, '{"fr": "Suivi des gains ou du retour sur investissement."}'::jsonb, '{"action_key": "ma_roi_tracking", "label_ui_fr": "ROI suivi"}'::jsonb),
  ('CAT_ENERGY', 'SA_ENERGY_MONITORING', 'MA_ENERGY_ALERT', 'MA_ENERGY_ALERT', 'Alerte dérive', 'Alerte en cas de dérive de consommation.', 30321, 2, '{"fr": "Alerte dérive"}'::jsonb, '{"fr": "Alerte en cas de dérive de consommation."}'::jsonb, '{"action_key": "ma_energy_alert", "label_ui_fr": "Alerte dérive"}'::jsonb),
  ('CAT_ENERGY', 'SA_ENERGY_MONITORING', 'MA_ENERGY_KPI', 'MA_ENERGY_KPI', 'KPI énergie', 'Suivi kWh/nuitée ou kWh/m².', 30322, 2, '{"fr": "KPI énergie"}'::jsonb, '{"fr": "Suivi kWh/nuitée ou kWh/m²."}'::jsonb, '{"action_key": "ma_energy_kpi", "label_ui_fr": "KPI énergie"}'::jsonb),
  ('CAT_ENERGY', 'SA_ENERGY_MONITORING', 'MA_MONTHLY_ENERGY_READING', 'MA_MONTHLY_ENERGY_READING', 'Relevé mensuel', 'Relevé mensuel des consommations d''énergie.', 30323, 1, '{"fr": "Relevé mensuel"}'::jsonb, '{"fr": "Relevé mensuel des consommations d''énergie."}'::jsonb, '{"action_key": "ma_monthly_energy_reading", "label_ui_fr": "Relevé mensuel"}'::jsonb),
  ('CAT_ENERGY', 'SA_ENERGY_MONITORING', 'MA_ENERGY_THRESHOLD', 'MA_ENERGY_THRESHOLD', 'Seuil énergétique mesuré', 'Consommation énergétique mesurée inférieure à 80 kWh par nuitée, avec suivi documenté.', 30324, 1, '{"fr": "Seuil énergétique mesuré"}'::jsonb, '{"fr": "Consommation énergétique mesurée inférieure à 80 kWh par nuitée, avec suivi documenté."}'::jsonb, '{"action_key": "ma_energy_threshold", "label_ui_fr": "Seuil <80 kWh/nuitée"}'::jsonb),
  ('CAT_ENERGY', 'SA_HOT_WATER_EFFICIENCY', 'MA_DHW_SETPOINTS', 'MA_DHW_SETPOINTS', 'Réglages ECS', 'Réglages ECS optimisés.', 30331, 4, '{"fr": "Réglages ECS"}'::jsonb, '{"fr": "Réglages ECS optimisés."}'::jsonb, '{"action_key": "ma_dhw_setpoints", "label_ui_fr": "Réglages ECS"}'::jsonb),
  ('CAT_ENERGY', 'SA_HOT_WATER_EFFICIENCY', 'MA_PIPE_INSULATION', 'MA_PIPE_INSULATION', 'Réseaux isolés', 'Réseaux ECS isolés.', 30332, 4, '{"fr": "Réseaux isolés"}'::jsonb, '{"fr": "Réseaux ECS isolés."}'::jsonb, '{"action_key": "ma_pipe_insulation", "label_ui_fr": "Réseaux isolés"}'::jsonb),
  ('CAT_ENERGY', 'SA_HOT_WATER_EFFICIENCY', 'MA_DHW_EFFICIENT_SYSTEM', 'MA_DHW_EFFICIENT_SYSTEM', 'Système ECS performant', 'Système de production ECS performant installé.', 30333, 4, '{"fr": "Système ECS performant"}'::jsonb, '{"fr": "Système de production ECS performant installé."}'::jsonb, '{"action_key": "ma_dhw_efficient_system", "label_ui_fr": "Système ECS performant"}'::jsonb),
  ('CAT_ENERGY', 'SA_HVAC_EFFICIENCY', 'MA_FILTERS_CLEANED', 'MA_FILTERS_CLEANED', 'Filtres entretenus', 'Filtres et organes de ventilation entretenus.', 30341, 4, '{"fr": "Filtres entretenus"}'::jsonb, '{"fr": "Filtres et organes de ventilation entretenus."}'::jsonb, '{"action_key": "ma_filters_cleaned", "label_ui_fr": "Filtres entretenus"}'::jsonb),
  ('CAT_ENERGY', 'SA_HVAC_EFFICIENCY', 'MA_HVAC_MAINTENANCE', 'MA_HVAC_MAINTENANCE', 'Maintenance CVC', 'Maintenance préventive CVC réalisée.', 30342, 4, '{"fr": "Maintenance CVC"}'::jsonb, '{"fr": "Maintenance préventive CVC réalisée."}'::jsonb, '{"action_key": "ma_hvac_maintenance", "label_ui_fr": "Maintenance CVC"}'::jsonb),
  ('CAT_ENERGY', 'SA_HVAC_EFFICIENCY', 'MA_HVAC_RENEWAL_PLAN', 'MA_HVAC_RENEWAL_PLAN', 'Plan de renouvellement', 'Plan de renouvellement des équipements CVC.', 30343, 4, '{"fr": "Plan de renouvellement"}'::jsonb, '{"fr": "Plan de renouvellement des équipements CVC."}'::jsonb, '{"action_key": "ma_hvac_renewal_plan", "label_ui_fr": "Plan de renouvellement"}'::jsonb),
  ('CAT_ENERGY', 'SA_ONSITE_RENEWABLE_ENERGY', 'MA_SOLAR_PV', 'MA_SOLAR_PV', 'Panneaux photovoltaïques', 'Panneaux photovoltaïques installés.', 30351, 4, '{"fr": "Panneaux photovoltaïques"}'::jsonb, '{"fr": "Panneaux photovoltaïques installés."}'::jsonb, '{"action_key": "ma_solar_pv", "label_ui_fr": "Panneaux photovoltaïques"}'::jsonb),
  ('CAT_ENERGY', 'SA_ONSITE_RENEWABLE_ENERGY', 'MA_PRODUCTION_MONITORING', 'MA_PRODUCTION_MONITORING', 'Production suivie', 'Production sur site mesurée.', 30352, 4, '{"fr": "Production suivie"}'::jsonb, '{"fr": "Production sur site mesurée."}'::jsonb, '{"action_key": "ma_production_monitoring", "label_ui_fr": "Production suivie"}'::jsonb),
  ('CAT_ENERGY', 'SA_ONSITE_RENEWABLE_ENERGY', 'MA_SOLAR_THERMAL', 'MA_SOLAR_THERMAL', 'Solaire thermique', 'Solaire thermique ou équivalent installé.', 30353, 4, '{"fr": "Solaire thermique"}'::jsonb, '{"fr": "Solaire thermique ou équivalent installé."}'::jsonb, '{"action_key": "ma_solar_thermal", "label_ui_fr": "Solaire thermique"}'::jsonb),
  ('CAT_ENERGY', 'SA_RENEWABLE_ELECTRICITY', 'MA_GREEN_CONTRACT', 'MA_GREEN_CONTRACT', 'Contrat vert', 'Contrat d''électricité renouvelable.', 30361, 4, '{"fr": "Contrat vert"}'::jsonb, '{"fr": "Contrat d''électricité renouvelable."}'::jsonb, '{"action_key": "ma_green_contract", "label_ui_fr": "Contrat vert"}'::jsonb),
  ('CAT_ENERGY', 'SA_RENEWABLE_ELECTRICITY', 'MA_GO_CERTIFICATES', 'MA_GO_CERTIFICATES', 'Garanties d''origine', 'Garanties d''origine conservées.', 30362, 4, '{"fr": "Garanties d''origine"}'::jsonb, '{"fr": "Garanties d''origine conservées."}'::jsonb, '{"action_key": "ma_go_certificates", "label_ui_fr": "Garanties d''origine"}'::jsonb),
  ('CAT_ENERGY', 'SA_RENEWABLE_ELECTRICITY', 'MA_GREEN_SHARE_TRACKED', 'MA_GREEN_SHARE_TRACKED', 'Part ENR suivie', 'Part d''électricité verte suivie.', 30363, 4, '{"fr": "Part ENR suivie"}'::jsonb, '{"fr": "Part d''électricité verte suivie."}'::jsonb, '{"action_key": "ma_green_share_tracked", "label_ui_fr": "Part ENR suivie"}'::jsonb),
  ('CAT_ENERGY', 'SA_RENEWABLE_HEAT', 'MA_BIOMASS_SYSTEM', 'MA_BIOMASS_SYSTEM', 'Biomasse', 'Chaufferie biomasse ou solution équivalente.', 30371, 4, '{"fr": "Biomasse"}'::jsonb, '{"fr": "Chaufferie biomasse ou solution équivalente."}'::jsonb, '{"action_key": "ma_biomass_system", "label_ui_fr": "Biomasse"}'::jsonb),
  ('CAT_ENERGY', 'SA_RENEWABLE_HEAT', 'MA_RENEWABLE_HEAT_SHARE', 'MA_RENEWABLE_HEAT_SHARE', 'Part chaleur ENR', 'Part de chaleur renouvelable suivie.', 30372, 4, '{"fr": "Part chaleur ENR"}'::jsonb, '{"fr": "Part de chaleur renouvelable suivie."}'::jsonb, '{"action_key": "ma_renewable_heat_share", "label_ui_fr": "Part chaleur ENR"}'::jsonb),
  ('CAT_ENERGY', 'SA_RENEWABLE_HEAT', 'MA_HEAT_PUMP', 'MA_HEAT_PUMP', 'Pompe à chaleur', 'Pompe à chaleur ou autre chaleur renouvelable.', 30373, 4, '{"fr": "Pompe à chaleur"}'::jsonb, '{"fr": "Pompe à chaleur ou autre chaleur renouvelable."}'::jsonb, '{"action_key": "ma_heat_pump", "label_ui_fr": "Pompe à chaleur"}'::jsonb),
  ('CAT_ENERGY', 'SA_SUBMETERING', 'MA_USE_BREAKDOWN', 'MA_USE_BREAKDOWN', 'Répartition par usage', 'Consommations ventilées par poste.', 30381, 4, '{"fr": "Répartition par usage"}'::jsonb, '{"fr": "Consommations ventilées par poste."}'::jsonb, '{"action_key": "ma_use_breakdown", "label_ui_fr": "Répartition par usage"}'::jsonb),
  ('CAT_ENERGY', 'SA_SUBMETERING', 'MA_WATER_SUBMETERS', 'MA_WATER_SUBMETERS', 'Sous-comptage eau', 'Sous-comptage eau lorsque pertinent.', 30382, 4, '{"fr": "Sous-comptage eau"}'::jsonb, '{"fr": "Sous-comptage eau lorsque pertinent."}'::jsonb, '{"action_key": "ma_water_submeters", "label_ui_fr": "Sous-comptage eau"}'::jsonb),
  ('CAT_ENERGY', 'SA_SUBMETERING', 'MA_ELEC_SUBMETERS', 'MA_ELEC_SUBMETERS', 'Sous-compteurs installés', 'Sous-compteurs installés par usage ou zone.', 30383, 4, '{"fr": "Sous-compteurs installés"}'::jsonb, '{"fr": "Sous-compteurs installés par usage ou zone."}'::jsonb, '{"action_key": "ma_elec_submeters", "label_ui_fr": "Sous-compteurs installés"}'::jsonb),
  ('CAT_ENERGY', 'SA_THERMOREGULATION', 'MA_SETPOINT_POLICY', 'MA_SETPOINT_POLICY', 'Consignes définies', 'Consignes de température formalisées.', 30391, 4, '{"fr": "Consignes définies"}'::jsonb, '{"fr": "Consignes de température formalisées."}'::jsonb, '{"action_key": "ma_setpoint_policy", "label_ui_fr": "Consignes définies"}'::jsonb),
  ('CAT_ENERGY', 'SA_THERMOREGULATION', 'MA_ROOM_CONTROL', 'MA_ROOM_CONTROL', 'Pilotage par zone', 'Pilotage par zone ou par chambre en place.', 30392, 4, '{"fr": "Pilotage par zone"}'::jsonb, '{"fr": "Pilotage par zone ou par chambre en place."}'::jsonb, '{"action_key": "ma_room_control", "label_ui_fr": "Pilotage par zone"}'::jsonb),
  ('CAT_ENERGY', 'SA_THERMOREGULATION', 'MA_THERMOSTATS_INSTALLED', 'MA_THERMOSTATS_INSTALLED', 'Thermostats installés', 'Thermostats ou régulation installés.', 30393, 4, '{"fr": "Thermostats installés"}'::jsonb, '{"fr": "Thermostats ou régulation installés."}'::jsonb, '{"action_key": "ma_thermostats_installed", "label_ui_fr": "Thermostats installés"}'::jsonb)
)
INSERT INTO ref_sustainability_action (
  category_id, group_id, code, external_code, label, description, position, sort_order,
  action_ui_priority, label_i18n, description_i18n, extra
)
SELECT c.id, g.id, src.code, src.external_code, src.label, src.description,
       src.position, src.position, src.action_ui_priority, src.label_i18n, src.description_i18n, src.extra
FROM src
JOIN ref_sustainability_action_category c ON c.code = src.category_code
JOIN ref_sustainability_action_group g ON g.code = src.group_code
ON CONFLICT (category_id, code) DO UPDATE SET
  group_id = EXCLUDED.group_id,
  external_code = EXCLUDED.external_code,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  position = EXCLUDED.position,
  sort_order = EXCLUDED.sort_order,
  action_ui_priority = EXCLUDED.action_ui_priority,
  label_i18n = EXCLUDED.label_i18n,
  description_i18n = EXCLUDED.description_i18n,
  extra = EXCLUDED.extra,
  updated_at = NOW();

-- 5) Sustainability micro-actions (part 2/4: CAT_GOV + CAT_MOBILITY + CAT_PROC)
WITH src(category_code, group_code, code, external_code, label, description, position, action_ui_priority, label_i18n, description_i18n, extra) AS (
VALUES
  ('CAT_GOV', 'SA_ACTION_PLAN_ANNUAL', 'MA_OBJECTIVES_DEFINED', 'MA_OBJECTIVES_DEFINED', 'Objectifs chiffrés', 'Objectifs annuels ou pluriannuels chiffrés.', 50401, 4, '{"fr": "Objectifs chiffrés"}'::jsonb, '{"fr": "Objectifs annuels ou pluriannuels chiffrés."}'::jsonb, '{"action_key": "ma_objectives_defined", "label_ui_fr": "Objectifs chiffrés"}'::jsonb),
  ('CAT_GOV', 'SA_ACTION_PLAN_ANNUAL', 'MA_ACTION_OWNERS', 'MA_ACTION_OWNERS', 'Responsables désignés', 'Chaque action a un responsable identifié.', 50402, 4, '{"fr": "Responsables désignés"}'::jsonb, '{"fr": "Chaque action a un responsable identifié."}'::jsonb, '{"action_key": "ma_action_owners", "label_ui_fr": "Responsables désignés"}'::jsonb),
  ('CAT_GOV', 'SA_ACTION_PLAN_ANNUAL', 'MA_ACTION_DEADLINES', 'MA_ACTION_DEADLINES', 'Échéances planifiées', 'Échéances et calendrier de suivi définis.', 50403, 4, '{"fr": "Échéances planifiées"}'::jsonb, '{"fr": "Échéances et calendrier de suivi définis."}'::jsonb, '{"action_key": "ma_action_deadlines", "label_ui_fr": "Échéances planifiées"}'::jsonb),
  ('CAT_GOV', 'SA_ANNUAL_REVIEW', 'MA_CORRECTIVE_TRACKING', 'MA_CORRECTIVE_TRACKING', 'Actions correctives suivies', 'Plan d''actions correctives suivi jusqu''à clôture.', 50411, 4, '{"fr": "Actions correctives suivies"}'::jsonb, '{"fr": "Plan d''actions correctives suivi jusqu''à clôture."}'::jsonb, '{"action_key": "ma_corrective_tracking", "label_ui_fr": "Actions correctives suivies"}'::jsonb),
  ('CAT_GOV', 'SA_ANNUAL_REVIEW', 'MA_ANNUAL_REVIEW_HELD', 'MA_ANNUAL_REVIEW_HELD', 'Revue annuelle tenue', 'Revue annuelle formalisée avec compte rendu.', 50412, 4, '{"fr": "Revue annuelle tenue"}'::jsonb, '{"fr": "Revue annuelle formalisée avec compte rendu."}'::jsonb, '{"action_key": "ma_annual_review_held", "label_ui_fr": "Revue annuelle tenue"}'::jsonb),
  ('CAT_GOV', 'SA_ANNUAL_REVIEW', 'MA_GAPS_ANALYZED', 'MA_GAPS_ANALYZED', 'Écarts analysés', 'Écarts et causes racines documentés.', 50413, 4, '{"fr": "Écarts analysés"}'::jsonb, '{"fr": "Écarts et causes racines documentés."}'::jsonb, '{"action_key": "ma_gaps_analyzed", "label_ui_fr": "Écarts analysés"}'::jsonb),
  ('CAT_GOV', 'SA_CUSTOMER_FEEDBACK', 'MA_QR_REVIEW', 'MA_QR_REVIEW', 'QR code retours', 'QR code ou lien direct pour recueillir les retours.', 50421, 4, '{"fr": "QR code retours"}'::jsonb, '{"fr": "QR code ou lien direct pour recueillir les retours."}'::jsonb, '{"action_key": "ma_qr_review", "label_ui_fr": "QR code retours"}'::jsonb),
  ('CAT_GOV', 'SA_CUSTOMER_FEEDBACK', 'MA_SURVEY_DEPLOYED', 'MA_SURVEY_DEPLOYED', 'Questionnaire diffusé', 'Questionnaire de satisfaction diffusé.', 50422, 4, '{"fr": "Questionnaire diffusé"}'::jsonb, '{"fr": "Questionnaire de satisfaction diffusé."}'::jsonb, '{"action_key": "ma_survey_deployed", "label_ui_fr": "Questionnaire diffusé"}'::jsonb),
  ('CAT_GOV', 'SA_CUSTOMER_FEEDBACK', 'MA_COMPLAINT_LOG', 'MA_COMPLAINT_LOG', 'Registre réclamations', 'Réclamations et avis suivis dans un registre.', 50423, 4, '{"fr": "Registre réclamations"}'::jsonb, '{"fr": "Réclamations et avis suivis dans un registre."}'::jsonb, '{"action_key": "ma_complaint_log", "label_ui_fr": "Registre réclamations"}'::jsonb),
  ('CAT_GOV', 'SA_DIGITAL_SOBRIETY', 'MA_DEVICE_LIFESPAN', 'MA_DEVICE_LIFESPAN', 'Durée de vie matériel', 'Allongement de la durée de vie du matériel.', 50431, 4, '{"fr": "Durée de vie matériel"}'::jsonb, '{"fr": "Allongement de la durée de vie du matériel."}'::jsonb, '{"action_key": "ma_device_lifespan", "label_ui_fr": "Durée de vie matériel"}'::jsonb),
  ('CAT_GOV', 'SA_DIGITAL_SOBRIETY', 'MA_RESPONSIBLE_HOSTING', 'MA_RESPONSIBLE_HOSTING', 'Hébergement responsable', 'Hébergement web responsable ou mutualisé.', 50432, 4, '{"fr": "Hébergement responsable"}'::jsonb, '{"fr": "Hébergement web responsable ou mutualisé."}'::jsonb, '{"action_key": "ma_responsible_hosting", "label_ui_fr": "Hébergement responsable"}'::jsonb),
  ('CAT_GOV', 'SA_DIGITAL_SOBRIETY', 'MA_LIGHTWEIGHT_WEBSITE', 'MA_LIGHTWEIGHT_WEBSITE', 'Site léger', 'Site ou services numériques allégés.', 50433, 4, '{"fr": "Site léger"}'::jsonb, '{"fr": "Site ou services numériques allégés."}'::jsonb, '{"action_key": "ma_lightweight_website", "label_ui_fr": "Site léger"}'::jsonb),
  ('CAT_GOV', 'SA_FEEDBACK_ANALYSIS', 'MA_IMPROVEMENT_ACTIONS', 'MA_IMPROVEMENT_ACTIONS', 'Actions d''amélioration', 'Actions d''amélioration issues des retours.', 50441, 4, '{"fr": "Actions d''amélioration"}'::jsonb, '{"fr": "Actions d''amélioration issues des retours."}'::jsonb, '{"action_key": "ma_improvement_actions", "label_ui_fr": "Actions d''amélioration"}'::jsonb),
  ('CAT_GOV', 'SA_FEEDBACK_ANALYSIS', 'MA_MONTHLY_REVIEW_FEEDBACK', 'MA_MONTHLY_REVIEW_FEEDBACK', 'Analyse périodique', 'Analyse périodique des retours réalisée.', 50442, 4, '{"fr": "Analyse périodique"}'::jsonb, '{"fr": "Analyse périodique des retours réalisée."}'::jsonb, '{"action_key": "ma_monthly_review_feedback", "label_ui_fr": "Analyse périodique"}'::jsonb),
  ('CAT_GOV', 'SA_FEEDBACK_ANALYSIS', 'MA_TEAM_FEEDBACK_LOOP', 'MA_TEAM_FEEDBACK_LOOP', 'Retour aux équipes', 'Résultats et actions partagés aux équipes.', 50443, 4, '{"fr": "Retour aux équipes"}'::jsonb, '{"fr": "Résultats et actions partagés aux équipes."}'::jsonb, '{"action_key": "ma_team_feedback_loop", "label_ui_fr": "Retour aux équipes"}'::jsonb),
  ('CAT_GOV', 'SA_GUEST_INFO_SUST', 'MA_ROOM_SIGNAGE', 'MA_ROOM_SIGNAGE', 'Affichage en chambre', 'Affichage écogestes en chambre ou hébergement.', 50451, 4, '{"fr": "Affichage en chambre"}'::jsonb, '{"fr": "Affichage écogestes en chambre ou hébergement."}'::jsonb, '{"action_key": "ma_room_signage", "label_ui_fr": "Affichage en chambre"}'::jsonb),
  ('CAT_GOV', 'SA_GUEST_INFO_SUST', 'MA_COMMONS_SIGNAGE', 'MA_COMMONS_SIGNAGE', 'Affichage espaces communs', 'Supports de sensibilisation dans les espaces communs.', 50452, 4, '{"fr": "Affichage espaces communs"}'::jsonb, '{"fr": "Supports de sensibilisation dans les espaces communs."}'::jsonb, '{"action_key": "ma_commons_signage", "label_ui_fr": "Affichage espaces communs"}'::jsonb),
  ('CAT_GOV', 'SA_GUEST_INFO_SUST', 'MA_WEB_SUST_PAGE', 'MA_WEB_SUST_PAGE', 'Page web écogestes', 'Page web ou livret d''accueil durable.', 50453, 4, '{"fr": "Page web écogestes"}'::jsonb, '{"fr": "Page web ou livret d''accueil durable."}'::jsonb, '{"action_key": "ma_web_sust_page", "label_ui_fr": "Page web écogestes"}'::jsonb),
  ('CAT_GOV', 'SA_IMPACT_REPORTING', 'MA_ANNUAL_IMPACT_REPORT', 'MA_ANNUAL_IMPACT_REPORT', 'Bilan annuel', 'Bilan annuel des impacts publié ou formalisé.', 50461, 4, '{"fr": "Bilan annuel"}'::jsonb, '{"fr": "Bilan annuel des impacts publié ou formalisé."}'::jsonb, '{"action_key": "ma_annual_impact_report", "label_ui_fr": "Bilan annuel"}'::jsonb),
  ('CAT_GOV', 'SA_IMPACT_REPORTING', 'MA_DATA_QUALITY_CHECK', 'MA_DATA_QUALITY_CHECK', 'Contrôle des données', 'Vérification de qualité des données réalisées.', 50462, 4, '{"fr": "Contrôle des données"}'::jsonb, '{"fr": "Vérification de qualité des données réalisées."}'::jsonb, '{"action_key": "ma_data_quality_check", "label_ui_fr": "Contrôle des données"}'::jsonb),
  ('CAT_GOV', 'SA_IMPACT_REPORTING', 'MA_KPI_DASHBOARD', 'MA_KPI_DASHBOARD', 'Tableau de bord', 'Tableau de bord impacts tenu à jour.', 50463, 4, '{"fr": "Tableau de bord"}'::jsonb, '{"fr": "Tableau de bord impacts tenu à jour."}'::jsonb, '{"action_key": "ma_kpi_dashboard", "label_ui_fr": "Tableau de bord"}'::jsonb),
  ('CAT_GOV', 'SA_POLICY_SUSTAINABILITY', 'MA_RSE_CHARTER', 'MA_RSE_CHARTER', 'Charte DD/RSE', 'Charte ou politique DD/RSE rédigée et validée.', 50471, 1, '{"fr": "Charte DD/RSE"}'::jsonb, '{"fr": "Charte ou politique DD/RSE rédigée et validée."}'::jsonb, '{"action_key": "ma_rse_charter", "label_ui_fr": "Charte DD/RSE"}'::jsonb),
  ('CAT_GOV', 'SA_POLICY_SUSTAINABILITY', 'MA_RSE_SCOPE_DEFINED', 'MA_RSE_SCOPE_DEFINED', 'Périmètre défini', 'Périmètre, impacts prioritaires et responsabilités formalisés.', 50472, 2, '{"fr": "Périmètre défini"}'::jsonb, '{"fr": "Périmètre, impacts prioritaires et responsabilités formalisés."}'::jsonb, '{"action_key": "ma_rse_scope_defined", "label_ui_fr": "Périmètre défini"}'::jsonb),
  ('CAT_GOV', 'SA_POLICY_SUSTAINABILITY', 'MA_RSE_REFERENT', 'MA_RSE_REFERENT', 'Référent nommé', 'Référent ou pilote durabilité désigné.', 50473, 1, '{"fr": "Référent nommé"}'::jsonb, '{"fr": "Référent ou pilote durabilité désigné."}'::jsonb, '{"action_key": "ma_rse_referent", "label_ui_fr": "Référent nommé"}'::jsonb),
  ('CAT_GOV', 'SA_PUBLIC_COMMUNICATION', 'MA_DURABILITY_PAGE', 'MA_DURABILITY_PAGE', 'Page durabilité', 'Page publique dédiée aux engagements durables.', 50481, 4, '{"fr": "Page durabilité"}'::jsonb, '{"fr": "Page publique dédiée aux engagements durables."}'::jsonb, '{"action_key": "ma_durability_page", "label_ui_fr": "Page durabilité"}'::jsonb),
  ('CAT_GOV', 'SA_PUBLIC_COMMUNICATION', 'MA_PROOFS_ONLINE', 'MA_PROOFS_ONLINE', 'Preuves publiées', 'Preuves, chiffres ou photos publiés.', 50482, 4, '{"fr": "Preuves publiées"}'::jsonb, '{"fr": "Preuves, chiffres ou photos publiés."}'::jsonb, '{"action_key": "ma_proofs_online", "label_ui_fr": "Preuves publiées"}'::jsonb),
  ('CAT_GOV', 'SA_PUBLIC_COMMUNICATION', 'MA_SCOPE_EXPLAINED', 'MA_SCOPE_EXPLAINED', 'Périmètre expliqué', 'Périmètre des engagements clairement expliqué.', 50483, 4, '{"fr": "Périmètre expliqué"}'::jsonb, '{"fr": "Périmètre des engagements clairement expliqué."}'::jsonb, '{"action_key": "ma_scope_explained", "label_ui_fr": "Périmètre expliqué"}'::jsonb),
  ('CAT_GOV', 'SA_REGULATORY_COMPLIANCE', 'MA_CONTROL_CALENDAR', 'MA_CONTROL_CALENDAR', 'Calendrier de contrôles', 'Contrôles obligatoires planifiés et tracés.', 50491, 4, '{"fr": "Calendrier de contrôles"}'::jsonb, '{"fr": "Contrôles obligatoires planifiés et tracés."}'::jsonb, '{"action_key": "ma_control_calendar", "label_ui_fr": "Calendrier de contrôles"}'::jsonb),
  ('CAT_GOV', 'SA_REGULATORY_COMPLIANCE', 'MA_PROOF_ARCHIVE', 'MA_PROOF_ARCHIVE', 'Preuves archivées', 'Attestations, contrats et rapports archivés.', 50492, 4, '{"fr": "Preuves archivées"}'::jsonb, '{"fr": "Attestations, contrats et rapports archivés."}'::jsonb, '{"action_key": "ma_proof_archive", "label_ui_fr": "Preuves archivées"}'::jsonb),
  ('CAT_GOV', 'SA_REGULATORY_COMPLIANCE', 'MA_REGULATORY_REGISTER', 'MA_REGULATORY_REGISTER', 'Registre réglementaire', 'Registre de conformité réglementaire tenu à jour.', 50493, 4, '{"fr": "Registre réglementaire"}'::jsonb, '{"fr": "Registre de conformité réglementaire tenu à jour."}'::jsonb, '{"action_key": "ma_regulatory_register", "label_ui_fr": "Registre réglementaire"}'::jsonb),
  ('CAT_GOV', 'SA_RSE_STRATEGY_ALIGNMENT', 'MA_EXECUTIVE_GOVERNANCE', 'MA_EXECUTIVE_GOVERNANCE', 'Gouvernance de direction', 'Pilotage de la stratégie au niveau direction.', 50501, 4, '{"fr": "Gouvernance de direction"}'::jsonb, '{"fr": "Pilotage de la stratégie au niveau direction."}'::jsonb, '{"action_key": "ma_executive_governance", "label_ui_fr": "Gouvernance de direction"}'::jsonb),
  ('CAT_GOV', 'SA_RSE_STRATEGY_ALIGNMENT', 'MA_PRODUCT_ALIGNMENT', 'MA_PRODUCT_ALIGNMENT', 'Offres alignées', 'Offres ou produits alignés avec la stratégie.', 50502, 4, '{"fr": "Offres alignées"}'::jsonb, '{"fr": "Offres ou produits alignés avec la stratégie."}'::jsonb, '{"action_key": "ma_product_alignment", "label_ui_fr": "Offres alignées"}'::jsonb),
  ('CAT_GOV', 'SA_RSE_STRATEGY_ALIGNMENT', 'MA_RSE_STRATEGY_DOC', 'MA_RSE_STRATEGY_DOC', 'Stratégie formalisée', 'Stratégie RSE formalisée.', 50503, 4, '{"fr": "Stratégie formalisée"}'::jsonb, '{"fr": "Stratégie RSE formalisée."}'::jsonb, '{"action_key": "ma_rse_strategy_doc", "label_ui_fr": "Stratégie formalisée"}'::jsonb),
  ('CAT_GOV', 'SA_STAFF_TRAINING_SUST', 'MA_WASTE_TRAINING', 'MA_WASTE_TRAINING', 'Formation tri', 'Formation au tri et à la réduction des déchets.', 50511, 4, '{"fr": "Formation tri"}'::jsonb, '{"fr": "Formation au tri et à la réduction des déchets."}'::jsonb, '{"action_key": "ma_waste_training", "label_ui_fr": "Formation tri"}'::jsonb),
  ('CAT_GOV', 'SA_STAFF_TRAINING_SUST', 'MA_ECOGESTURES_TRAINING', 'MA_ECOGESTURES_TRAINING', 'Formation écogestes', 'Formation des équipes aux écogestes.', 50512, 4, '{"fr": "Formation écogestes"}'::jsonb, '{"fr": "Formation des équipes aux écogestes."}'::jsonb, '{"action_key": "ma_ecogestures_training", "label_ui_fr": "Formation écogestes"}'::jsonb),
  ('CAT_GOV', 'SA_STAFF_TRAINING_SUST', 'MA_REFRESHER_TRAINING', 'MA_REFRESHER_TRAINING', 'Rappel annuel', 'Mise à jour ou recyclage annuel des formations.', 50513, 4, '{"fr": "Rappel annuel"}'::jsonb, '{"fr": "Mise à jour ou recyclage annuel des formations."}'::jsonb, '{"action_key": "ma_refresher_training", "label_ui_fr": "Rappel annuel"}'::jsonb),
  ('CAT_GOV', 'SA_STAKEHOLDER_DIALOGUE', 'MA_FEEDBACK_CHANNEL', 'MA_FEEDBACK_CHANNEL', 'Canal de dialogue', 'Canal dédié aux remarques et contributions.', 50521, 4, '{"fr": "Canal de dialogue"}'::jsonb, '{"fr": "Canal dédié aux remarques et contributions."}'::jsonb, '{"action_key": "ma_feedback_channel", "label_ui_fr": "Canal de dialogue"}'::jsonb),
  ('CAT_GOV', 'SA_STAKEHOLDER_DIALOGUE', 'MA_STAKEHOLDER_MAP', 'MA_STAKEHOLDER_MAP', 'Cartographie parties prenantes', 'Cartographie des parties prenantes tenue à jour.', 50522, 4, '{"fr": "Cartographie parties prenantes"}'::jsonb, '{"fr": "Cartographie des parties prenantes tenue à jour."}'::jsonb, '{"action_key": "ma_stakeholder_map", "label_ui_fr": "Cartographie parties prenantes"}'::jsonb),
  ('CAT_GOV', 'SA_STAKEHOLDER_DIALOGUE', 'MA_STAKEHOLDER_MEETING', 'MA_STAKEHOLDER_MEETING', 'Réunion parties prenantes', 'Réunion ou atelier annuel organisé.', 50523, 4, '{"fr": "Réunion parties prenantes"}'::jsonb, '{"fr": "Réunion ou atelier annuel organisé."}'::jsonb, '{"action_key": "ma_stakeholder_meeting", "label_ui_fr": "Réunion parties prenantes"}'::jsonb),
  ('CAT_MOBILITY', 'SA_LOW_IMPACT_TRANSPORT_INFO', 'MA_ACCESSIBLE_TRANSPORT_INFO', 'MA_ACCESSIBLE_TRANSPORT_INFO', 'Infos PMR transport', 'Informations sur les transports accessibles.', 60531, 4, '{"fr": "Infos PMR transport"}'::jsonb, '{"fr": "Informations sur les transports accessibles."}'::jsonb, '{"action_key": "ma_accessible_transport_info", "label_ui_fr": "Infos PMR transport"}'::jsonb),
  ('CAT_MOBILITY', 'SA_LOW_IMPACT_TRANSPORT_INFO', 'MA_PUBLIC_TRANSPORT_INFO', 'MA_PUBLIC_TRANSPORT_INFO', 'Infos transports publics', 'Informations train, bus, navettes.', 60532, 4, '{"fr": "Infos transports publics"}'::jsonb, '{"fr": "Informations train, bus, navettes."}'::jsonb, '{"action_key": "ma_public_transport_info", "label_ui_fr": "Infos transports publics"}'::jsonb),
  ('CAT_MOBILITY', 'SA_LOW_IMPACT_TRANSPORT_INFO', 'MA_WITHOUT_CAR_PAGE', 'MA_WITHOUT_CAR_PAGE', 'Venir sans voiture', 'Page ou fiche "venir sans voiture".', 60533, 4, '{"fr": "Venir sans voiture"}'::jsonb, '{"fr": "Page ou fiche \"venir sans voiture\"."}'::jsonb, '{"action_key": "ma_without_car_page", "label_ui_fr": "Venir sans voiture"}'::jsonb),
  ('CAT_MOBILITY', 'SA_LOW_IMPACT_TRANSPORT_SERVICES', 'MA_EV_CHARGING', 'MA_EV_CHARGING', 'Borne VE', 'Borne de recharge véhicule électrique.', 60541, 4, '{"fr": "Borne VE"}'::jsonb, '{"fr": "Borne de recharge véhicule électrique."}'::jsonb, '{"action_key": "ma_ev_charging", "label_ui_fr": "Borne VE"}'::jsonb),
  ('CAT_MOBILITY', 'SA_LOW_IMPACT_TRANSPORT_SERVICES', 'MA_BIKE_REPAIR_KIT', 'MA_BIKE_REPAIR_KIT', 'Kit vélo', 'Kit de réparation ou service vélo.', 60542, 4, '{"fr": "Kit vélo"}'::jsonb, '{"fr": "Kit de réparation ou service vélo."}'::jsonb, '{"action_key": "ma_bike_repair_kit", "label_ui_fr": "Kit vélo"}'::jsonb),
  ('CAT_MOBILITY', 'SA_LOW_IMPACT_TRANSPORT_SERVICES', 'MA_BIKE_PARKING', 'MA_BIKE_PARKING', 'Parking vélos', 'Stationnement vélo sécurisé.', 60543, 4, '{"fr": "Parking vélos"}'::jsonb, '{"fr": "Stationnement vélo sécurisé."}'::jsonb, '{"action_key": "ma_bike_parking", "label_ui_fr": "Parking vélos"}'::jsonb),
  ('CAT_MOBILITY', 'SA_MOUNTAIN_MOBILITY_PLAN', 'MA_INTERMODAL_INFO', 'MA_INTERMODAL_INFO', 'Info intermodalité', 'Information intermodale vers la destination.', 60551, 2, '{"fr": "Info intermodalité"}'::jsonb, '{"fr": "Information intermodale vers la destination."}'::jsonb, '{"action_key": "ma_intermodal_info", "label_ui_fr": "Info intermodalité"}'::jsonb),
  ('CAT_MOBILITY', 'SA_MOUNTAIN_MOBILITY_PLAN', 'MA_MOUNTAIN_SHUTTLES', 'MA_MOUNTAIN_SHUTTLES', 'Navettes station', 'Navettes ou mobilité collective en station.', 60552, 2, '{"fr": "Navettes station"}'::jsonb, '{"fr": "Navettes ou mobilité collective en station."}'::jsonb, '{"action_key": "ma_mountain_shuttles", "label_ui_fr": "Navettes station"}'::jsonb),
  ('CAT_MOBILITY', 'SA_MOUNTAIN_MOBILITY_PLAN', 'MA_PARK_AND_RIDE', 'MA_PARK_AND_RIDE', 'Parking-relais montagne', 'Dispositif de parking-relais ou rabattement pour limiter l''usage individuel de la voiture en station.', 60553, 2, '{"fr": "Parking-relais montagne"}'::jsonb, '{"fr": "Dispositif de parking-relais ou rabattement pour limiter l''usage individuel de la voiture en station."}'::jsonb, '{"action_key": "ma_park_and_ride", "label_ui_fr": "Parking-relais"}'::jsonb),
  ('CAT_MOBILITY', 'SA_MOUNTAIN_MOBILITY_PLAN', 'MA_CAR_REDUCTION', 'MA_CAR_REDUCTION', 'Réduction voiture', 'Mesures de réduction de la voiture individuelle.', 60554, 2, '{"fr": "Réduction voiture"}'::jsonb, '{"fr": "Mesures de réduction de la voiture individuelle."}'::jsonb, '{"action_key": "ma_car_reduction", "label_ui_fr": "Réduction voiture"}'::jsonb),
  ('CAT_PROC', 'SA_FAIR_LOCAL_CONTRACTS', 'MA_FAIR_TERMS', 'MA_FAIR_TERMS', 'Clauses équitables', 'Clauses contractuelles équilibrées avec partenaires locaux.', 40561, 4, '{"fr": "Clauses équitables"}'::jsonb, '{"fr": "Clauses contractuelles équilibrées avec partenaires locaux."}'::jsonb, '{"action_key": "ma_fair_terms", "label_ui_fr": "Clauses équitables"}'::jsonb),
  ('CAT_PROC', 'SA_FAIR_LOCAL_CONTRACTS', 'MA_PAYMENT_TIMELINESS', 'MA_PAYMENT_TIMELINESS', 'Paiement dans les délais', 'Délais de paiement suivis.', 40562, 4, '{"fr": "Paiement dans les délais"}'::jsonb, '{"fr": "Délais de paiement suivis."}'::jsonb, '{"action_key": "ma_payment_timeliness", "label_ui_fr": "Paiement dans les délais"}'::jsonb),
  ('CAT_PROC', 'SA_FAIR_LOCAL_CONTRACTS', 'MA_LOCAL_VALUE_SHARE', 'MA_LOCAL_VALUE_SHARE', 'Répartition de valeur', 'Répartition équitable de la valeur explicitée.', 40563, 4, '{"fr": "Répartition de valeur"}'::jsonb, '{"fr": "Répartition équitable de la valeur explicitée."}'::jsonb, '{"action_key": "ma_local_value_share", "label_ui_fr": "Répartition de valeur"}'::jsonb),
  ('CAT_PROC', 'SA_LOCAL_ORGANIC_FAIRTRADE_FOOD', 'MA_LOCAL_FOOD_SHARE', 'MA_LOCAL_FOOD_SHARE', 'Part locale suivie', 'Part de produits locaux suivie.', 40571, 4, '{"fr": "Part locale suivie"}'::jsonb, '{"fr": "Part de produits locaux suivie."}'::jsonb, '{"action_key": "ma_local_food_share", "label_ui_fr": "Part locale suivie"}'::jsonb),
  ('CAT_PROC', 'SA_LOCAL_ORGANIC_FAIRTRADE_FOOD', 'MA_ORGANIC_PRODUCTS', 'MA_ORGANIC_PRODUCTS', 'Produits bio', 'Produits bio sélectionnés.', 40572, 4, '{"fr": "Produits bio"}'::jsonb, '{"fr": "Produits bio sélectionnés."}'::jsonb, '{"action_key": "ma_organic_products", "label_ui_fr": "Produits bio"}'::jsonb),
  ('CAT_PROC', 'SA_LOCAL_ORGANIC_FAIRTRADE_FOOD', 'MA_FAIRTRADE_PRODUCTS', 'MA_FAIRTRADE_PRODUCTS', 'Produits équitables', 'Produits équitables référencés.', 40573, 4, '{"fr": "Produits équitables"}'::jsonb, '{"fr": "Produits équitables référencés."}'::jsonb, '{"action_key": "ma_fairtrade_products", "label_ui_fr": "Produits équitables"}'::jsonb),
  ('CAT_PROC', 'SA_LOCAL_SUPPLIERS', 'MA_LOCAL_SUPPLIER_LIST', 'MA_LOCAL_SUPPLIER_LIST', 'Liste fournisseurs locaux', 'Répertoire ou panel de fournisseurs locaux.', 40581, 4, '{"fr": "Liste fournisseurs locaux"}'::jsonb, '{"fr": "Répertoire ou panel de fournisseurs locaux."}'::jsonb, '{"action_key": "ma_local_supplier_list", "label_ui_fr": "Liste fournisseurs locaux"}'::jsonb),
  ('CAT_PROC', 'SA_LOCAL_SUPPLIERS', 'MA_LOCAL_PURCHASE_SHARE', 'MA_LOCAL_PURCHASE_SHARE', 'Part locale suivie', 'Part des achats locaux mesurée.', 40582, 4, '{"fr": "Part locale suivie"}'::jsonb, '{"fr": "Part des achats locaux mesurée."}'::jsonb, '{"action_key": "ma_local_purchase_share", "label_ui_fr": "Part locale suivie"}'::jsonb),
  ('CAT_PROC', 'SA_LOCAL_SUPPLIERS', 'MA_LOCAL_PARTNER_VISIBILITY', 'MA_LOCAL_PARTNER_VISIBILITY', 'Partenaires locaux valorisés', 'Partenaires locaux valorisés dans l''offre.', 40583, 4, '{"fr": "Partenaires locaux valorisés"}'::jsonb, '{"fr": "Partenaires locaux valorisés dans l''offre."}'::jsonb, '{"action_key": "ma_local_partner_visibility", "label_ui_fr": "Partenaires locaux valorisés"}'::jsonb),
  ('CAT_PROC', 'SA_NO_ENDANGERED_SPECIES', 'MA_MENU_CONTROL', 'MA_MENU_CONTROL', 'Contrôle des cartes', 'Contrôle des cartes et achats.', 40591, 4, '{"fr": "Contrôle des cartes"}'::jsonb, '{"fr": "Contrôle des cartes et achats."}'::jsonb, '{"action_key": "ma_menu_control", "label_ui_fr": "Contrôle des cartes"}'::jsonb),
  ('CAT_PROC', 'SA_NO_ENDANGERED_SPECIES', 'MA_SPECIES_POLICY', 'MA_SPECIES_POLICY', 'Politique espèces menacées', 'Politique excluant les espèces menacées.', 40592, 4, '{"fr": "Politique espèces menacées"}'::jsonb, '{"fr": "Politique excluant les espèces menacées."}'::jsonb, '{"action_key": "ma_species_policy", "label_ui_fr": "Politique espèces menacées"}'::jsonb),
  ('CAT_PROC', 'SA_NO_ENDANGERED_SPECIES', 'MA_SUPPLIER_CHECK_SPECIES', 'MA_SUPPLIER_CHECK_SPECIES', 'Vérification fournisseurs', 'Vérification fournisseur sur espèces sensibles.', 40593, 4, '{"fr": "Vérification fournisseurs"}'::jsonb, '{"fr": "Vérification fournisseur sur espèces sensibles."}'::jsonb, '{"action_key": "ma_supplier_check_species", "label_ui_fr": "Vérification fournisseurs"}'::jsonb),
  ('CAT_PROC', 'SA_RESPONSIBLE_PROCUREMENT_POLICY', 'MA_PROCUREMENT_CHARTER', 'MA_PROCUREMENT_CHARTER', 'Charte achats', 'Charte ou politique achats responsables.', 40601, 4, '{"fr": "Charte achats"}'::jsonb, '{"fr": "Charte ou politique achats responsables."}'::jsonb, '{"action_key": "ma_procurement_charter", "label_ui_fr": "Charte achats"}'::jsonb),
  ('CAT_PROC', 'SA_RESPONSIBLE_PROCUREMENT_POLICY', 'MA_RSE_CRITERIA_RFQ', 'MA_RSE_CRITERIA_RFQ', 'Critères RSE intégrés', 'Critères RSE intégrés aux consultations.', 40602, 4, '{"fr": "Critères RSE intégrés"}'::jsonb, '{"fr": "Critères RSE intégrés aux consultations."}'::jsonb, '{"action_key": "ma_rse_criteria_rfq", "label_ui_fr": "Critères RSE intégrés"}'::jsonb),
  ('CAT_PROC', 'SA_RESPONSIBLE_PROCUREMENT_POLICY', 'MA_PROCUREMENT_TRACEABILITY', 'MA_PROCUREMENT_TRACEABILITY', 'Traçabilité achats', 'Choix fournisseurs et arbitrages tracés.', 40603, 4, '{"fr": "Traçabilité achats"}'::jsonb, '{"fr": "Choix fournisseurs et arbitrages tracés."}'::jsonb, '{"action_key": "ma_procurement_traceability", "label_ui_fr": "Traçabilité achats"}'::jsonb),
  ('CAT_PROC', 'SA_SUPPLIER_EVALUATION', 'MA_SUPPLIER_GRID', 'MA_SUPPLIER_GRID', 'Grille fournisseurs', 'Grille d''évaluation fournisseurs utilisée.', 40611, 4, '{"fr": "Grille fournisseurs"}'::jsonb, '{"fr": "Grille d''évaluation fournisseurs utilisée."}'::jsonb, '{"action_key": "ma_supplier_grid", "label_ui_fr": "Grille fournisseurs"}'::jsonb),
  ('CAT_PROC', 'SA_SUPPLIER_EVALUATION', 'MA_SUPPLIER_PROGRESS_PLAN', 'MA_SUPPLIER_PROGRESS_PLAN', 'Plan progrès fournisseur', 'Plan de progrès ou actions correctives fournisseur.', 40612, 4, '{"fr": "Plan progrès fournisseur"}'::jsonb, '{"fr": "Plan de progrès ou actions correctives fournisseur."}'::jsonb, '{"action_key": "ma_supplier_progress_plan", "label_ui_fr": "Plan progrès fournisseur"}'::jsonb),
  ('CAT_PROC', 'SA_SUPPLIER_EVALUATION', 'MA_SUPPLIER_ANNUAL_REVIEW', 'MA_SUPPLIER_ANNUAL_REVIEW', 'Revue annuelle fournisseur', 'Évaluation annuelle des fournisseurs clés.', 40613, 4, '{"fr": "Revue annuelle fournisseur"}'::jsonb, '{"fr": "Évaluation annuelle des fournisseurs clés."}'::jsonb, '{"action_key": "ma_supplier_annual_review", "label_ui_fr": "Revue annuelle fournisseur"}'::jsonb),
  ('CAT_PROC', 'SA_TAP_WATER_SERVICE', 'MA_CARAFE_AVAILABLE', 'MA_CARAFE_AVAILABLE', 'Carafe disponible', 'Carafe ou fontaine disponible.', 40621, 4, '{"fr": "Carafe disponible"}'::jsonb, '{"fr": "Carafe ou fontaine disponible."}'::jsonb, '{"action_key": "ma_carafe_available", "label_ui_fr": "Carafe disponible"}'::jsonb),
  ('CAT_PROC', 'SA_TAP_WATER_SERVICE', 'MA_TAP_WATER_INFO', 'MA_TAP_WATER_INFO', 'Info eau du robinet', 'Information sur l''eau du robinet donnée.', 40622, 4, '{"fr": "Info eau du robinet"}'::jsonb, '{"fr": "Information sur l''eau du robinet donnée."}'::jsonb, '{"action_key": "ma_tap_water_info", "label_ui_fr": "Info eau du robinet"}'::jsonb),
  ('CAT_PROC', 'SA_TAP_WATER_SERVICE', 'MA_BOTTLED_WATER_REDUCED', 'MA_BOTTLED_WATER_REDUCED', 'Moins d''eau embouteillée', 'Réduction de l''eau embouteillée.', 40623, 4, '{"fr": "Moins d''eau embouteillée"}'::jsonb, '{"fr": "Réduction de l''eau embouteillée."}'::jsonb, '{"action_key": "ma_bottled_water_reduced", "label_ui_fr": "Moins d''eau embouteillée"}'::jsonb),
  ('CAT_PROC', 'SA_VEGETARIAN_OFFER', 'MA_PROTEIN_DIVERSIFICATION', 'MA_PROTEIN_DIVERSIFICATION', 'Diversification protéines', 'Diversification des protéines engagée.', 40631, 4, '{"fr": "Diversification protéines"}'::jsonb, '{"fr": "Diversification des protéines engagée."}'::jsonb, '{"action_key": "ma_protein_diversification", "label_ui_fr": "Diversification protéines"}'::jsonb),
  ('CAT_PROC', 'SA_VEGETARIAN_OFFER', 'MA_MENU_HIGHLIGHT_VEG', 'MA_MENU_HIGHLIGHT_VEG', 'Mise en avant végé', 'Offre végétarienne mise en avant.', 40632, 4, '{"fr": "Mise en avant végé"}'::jsonb, '{"fr": "Offre végétarienne mise en avant."}'::jsonb, '{"action_key": "ma_menu_highlight_veg", "label_ui_fr": "Mise en avant végé"}'::jsonb),
  ('CAT_PROC', 'SA_VEGETARIAN_OFFER', 'MA_DAILY_VEG_OPTION', 'MA_DAILY_VEG_OPTION', 'Option végé quotidienne', 'Option végétarienne disponible.', 40633, 4, '{"fr": "Option végé quotidienne"}'::jsonb, '{"fr": "Option végétarienne disponible."}'::jsonb, '{"action_key": "ma_daily_veg_option", "label_ui_fr": "Option végé quotidienne"}'::jsonb)
)
INSERT INTO ref_sustainability_action (
  category_id, group_id, code, external_code, label, description, position, sort_order,
  action_ui_priority, label_i18n, description_i18n, extra
)
SELECT c.id, g.id, src.code, src.external_code, src.label, src.description,
       src.position, src.position, src.action_ui_priority, src.label_i18n, src.description_i18n, src.extra
FROM src
JOIN ref_sustainability_action_category c ON c.code = src.category_code
JOIN ref_sustainability_action_group g ON g.code = src.group_code
ON CONFLICT (category_id, code) DO UPDATE SET
  group_id = EXCLUDED.group_id,
  external_code = EXCLUDED.external_code,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  position = EXCLUDED.position,
  sort_order = EXCLUDED.sort_order,
  action_ui_priority = EXCLUDED.action_ui_priority,
  label_i18n = EXCLUDED.label_i18n,
  description_i18n = EXCLUDED.description_i18n,
  extra = EXCLUDED.extra,
  updated_at = NOW();

-- 5) Sustainability micro-actions (part 3/4: CAT_SOCIAL + CAT_TERR)
WITH src(category_code, group_code, code, external_code, label, description, position, action_ui_priority, label_i18n, description_i18n, extra) AS (
VALUES
  ('CAT_SOCIAL', 'SA_CLIENT_SENSITIZATION', 'MA_RESPONSIBLE_BEHAVIOUR_TIPS', 'MA_RESPONSIBLE_BEHAVIOUR_TIPS', 'Conseils comportement', 'Conseils de comportements responsables.', 70641, 4, '{"fr": "Conseils comportement"}'::jsonb, '{"fr": "Conseils de comportements responsables."}'::jsonb, '{"action_key": "ma_responsible_behaviour_tips", "label_ui_fr": "Conseils comportement"}'::jsonb),
  ('CAT_SOCIAL', 'SA_CLIENT_SENSITIZATION', 'MA_PRETRIP_INFO', 'MA_PRETRIP_INFO', 'Info avant séjour', 'Sensibilisation avant le séjour.', 70642, 4, '{"fr": "Info avant séjour"}'::jsonb, '{"fr": "Sensibilisation avant le séjour."}'::jsonb, '{"action_key": "ma_pretrip_info", "label_ui_fr": "Info avant séjour"}'::jsonb),
  ('CAT_SOCIAL', 'SA_CLIENT_SENSITIZATION', 'MA_ONTRIP_BRIEFING', 'MA_ONTRIP_BRIEFING', 'Info pendant séjour', 'Sensibilisation pendant le séjour.', 70643, 4, '{"fr": "Info pendant séjour"}'::jsonb, '{"fr": "Sensibilisation pendant le séjour."}'::jsonb, '{"action_key": "ma_ontrip_briefing", "label_ui_fr": "Info pendant séjour"}'::jsonb),
  ('CAT_SOCIAL', 'SA_DESTINATION_PARTNER_AUDIT', 'MA_FIELD_CHECKS', 'MA_FIELD_CHECKS', 'Contrôles terrain', 'Contrôles terrain ou vérifications ponctuelles.', 70651, 4, '{"fr": "Contrôles terrain"}'::jsonb, '{"fr": "Contrôles terrain ou vérifications ponctuelles."}'::jsonb, '{"action_key": "ma_field_checks", "label_ui_fr": "Contrôles terrain"}'::jsonb),
  ('CAT_SOCIAL', 'SA_DESTINATION_PARTNER_AUDIT', 'MA_PARTNER_AUDIT_GRID', 'MA_PARTNER_AUDIT_GRID', 'Grille audit partenaire', 'Grille d''audit partenaires utilisée.', 70652, 4, '{"fr": "Grille audit partenaire"}'::jsonb, '{"fr": "Grille d''audit partenaires utilisée."}'::jsonb, '{"action_key": "ma_partner_audit_grid", "label_ui_fr": "Grille audit partenaire"}'::jsonb),
  ('CAT_SOCIAL', 'SA_DESTINATION_PARTNER_AUDIT', 'MA_NONCONFORMITY_FOLLOWUP', 'MA_NONCONFORMITY_FOLLOWUP', 'Suivi non-conformités', 'Suivi des non-conformités partenaires.', 70653, 4, '{"fr": "Suivi non-conformités"}'::jsonb, '{"fr": "Suivi des non-conformités partenaires."}'::jsonb, '{"action_key": "ma_nonconformity_followup", "label_ui_fr": "Suivi non-conformités"}'::jsonb),
  ('CAT_SOCIAL', 'SA_HUMAN_RIGHTS_DECENT_WORK', 'MA_ALERT_CHANNEL', 'MA_ALERT_CHANNEL', 'Canal d''alerte', 'Canal d''alerte ou remontée des incidents.', 70661, 4, '{"fr": "Canal d''alerte"}'::jsonb, '{"fr": "Canal d''alerte ou remontée des incidents."}'::jsonb, '{"action_key": "ma_alert_channel", "label_ui_fr": "Canal d''alerte"}'::jsonb),
  ('CAT_SOCIAL', 'SA_HUMAN_RIGHTS_DECENT_WORK', 'MA_HR_POLICY', 'MA_HR_POLICY', 'Politique droits humains', 'Politique droits humains ou clauses sociales.', 70662, 4, '{"fr": "Politique droits humains"}'::jsonb, '{"fr": "Politique droits humains ou clauses sociales."}'::jsonb, '{"action_key": "ma_hr_policy", "label_ui_fr": "Politique droits humains"}'::jsonb),
  ('CAT_SOCIAL', 'SA_HUMAN_RIGHTS_DECENT_WORK', 'MA_DECENT_WORK_CLAUSES', 'MA_DECENT_WORK_CLAUSES', 'Travail décent', 'Clauses de travail décent exigées.', 70663, 4, '{"fr": "Travail décent"}'::jsonb, '{"fr": "Clauses de travail décent exigées."}'::jsonb, '{"action_key": "ma_decent_work_clauses", "label_ui_fr": "Travail décent"}'::jsonb),
  ('CAT_SOCIAL', 'SA_LOCAL_POPULATION_INVOLVEMENT', 'MA_LOCAL_BENEFIT_TRACKING', 'MA_LOCAL_BENEFIT_TRACKING', 'Bénéfices locaux suivis', 'Retombées locales suivies.', 70671, 4, '{"fr": "Bénéfices locaux suivis"}'::jsonb, '{"fr": "Retombées locales suivies."}'::jsonb, '{"action_key": "ma_local_benefit_tracking", "label_ui_fr": "Bénéfices locaux suivis"}'::jsonb),
  ('CAT_SOCIAL', 'SA_LOCAL_POPULATION_INVOLVEMENT', 'MA_LOCAL_CONSULTATION', 'MA_LOCAL_CONSULTATION', 'Consultation locale', 'Consultation locale avant projets ou offres.', 70672, 4, '{"fr": "Consultation locale"}'::jsonb, '{"fr": "Consultation locale avant projets ou offres."}'::jsonb, '{"action_key": "ma_local_consultation", "label_ui_fr": "Consultation locale"}'::jsonb),
  ('CAT_SOCIAL', 'SA_LOCAL_POPULATION_INVOLVEMENT', 'MA_CO_DESIGN_OFFERS', 'MA_CO_DESIGN_OFFERS', 'Offres co-construites', 'Offres co-construites avec les populations locales.', 70673, 4, '{"fr": "Offres co-construites"}'::jsonb, '{"fr": "Offres co-construites avec les populations locales."}'::jsonb, '{"action_key": "ma_co_design_offers", "label_ui_fr": "Offres co-construites"}'::jsonb),
  ('CAT_SOCIAL', 'SA_TRANSPARENT_SALES_INFO', 'MA_IMPACT_SHEET', 'MA_IMPACT_SHEET', 'Fiche impact', 'Fiche impact social/environnemental fournie.', 70681, 4, '{"fr": "Fiche impact"}'::jsonb, '{"fr": "Fiche impact social/environnemental fournie."}'::jsonb, '{"action_key": "ma_impact_sheet", "label_ui_fr": "Fiche impact"}'::jsonb),
  ('CAT_SOCIAL', 'SA_TRANSPARENT_SALES_INFO', 'MA_CLEAR_SCOPE_OF_COMMITMENT', 'MA_CLEAR_SCOPE_OF_COMMITMENT', 'Périmètre engagement clair', 'Périmètre des engagements clairement expliqué.', 70682, 4, '{"fr": "Périmètre engagement clair"}'::jsonb, '{"fr": "Périmètre des engagements clairement expliqué."}'::jsonb, '{"action_key": "ma_clear_scope_of_commitment", "label_ui_fr": "Périmètre engagement clair"}'::jsonb),
  ('CAT_SOCIAL', 'SA_TRANSPARENT_SALES_INFO', 'MA_PRICE_TRANSPARENCY', 'MA_PRICE_TRANSPARENCY', 'Transparence prix', 'Information claire sur le prix et le contenu.', 70683, 4, '{"fr": "Transparence prix"}'::jsonb, '{"fr": "Information claire sur le prix et le contenu."}'::jsonb, '{"action_key": "ma_price_transparency", "label_ui_fr": "Transparence prix"}'::jsonb),
  ('CAT_TERR', 'SA_DESTINATION_SUST_INDICATORS', 'MA_LOCAL_DATA_COLLECTION', 'MA_LOCAL_DATA_COLLECTION', 'Collecte de données', 'Collecte de données locales structurée.', 80691, 4, '{"fr": "Collecte de données"}'::jsonb, '{"fr": "Collecte de données locales structurée."}'::jsonb, '{"action_key": "ma_local_data_collection", "label_ui_fr": "Collecte de données"}'::jsonb),
  ('CAT_TERR', 'SA_DESTINATION_SUST_INDICATORS', 'MA_PUBLIC_REPORTING_DEST', 'MA_PUBLIC_REPORTING_DEST', 'Restitution publique', 'Restitution publique ou partagée des indicateurs.', 80692, 4, '{"fr": "Restitution publique"}'::jsonb, '{"fr": "Restitution publique ou partagée des indicateurs."}'::jsonb, '{"action_key": "ma_public_reporting_dest", "label_ui_fr": "Restitution publique"}'::jsonb),
  ('CAT_TERR', 'SA_DESTINATION_SUST_INDICATORS', 'MA_DESTINATION_DASHBOARD', 'MA_DESTINATION_DASHBOARD', 'Tableau de bord destination', 'Tableau de bord destination en place.', 80693, 4, '{"fr": "Tableau de bord destination"}'::jsonb, '{"fr": "Tableau de bord destination en place."}'::jsonb, '{"action_key": "ma_destination_dashboard", "label_ui_fr": "Tableau de bord destination"}'::jsonb),
  ('CAT_TERR', 'SA_LABELLED_LOCAL_OFFERS', 'MA_LOCAL_LABEL_FILTER', 'MA_LOCAL_LABEL_FILTER', 'Filtre offre locale', 'Repérage des offres locales labellisées.', 80701, 4, '{"fr": "Filtre offre locale"}'::jsonb, '{"fr": "Repérage des offres locales labellisées."}'::jsonb, '{"action_key": "ma_local_label_filter", "label_ui_fr": "Filtre offre locale"}'::jsonb),
  ('CAT_TERR', 'SA_LABELLED_LOCAL_OFFERS', 'MA_LABELLED_OFFERS_HIGHLIGHT', 'MA_LABELLED_OFFERS_HIGHLIGHT', 'Offres mises en avant', 'Mise en avant des offres locales engagées.', 80702, 4, '{"fr": "Offres mises en avant"}'::jsonb, '{"fr": "Mise en avant des offres locales engagées."}'::jsonb, '{"action_key": "ma_labelled_offers_highlight", "label_ui_fr": "Offres mises en avant"}'::jsonb),
  ('CAT_TERR', 'SA_LABELLED_LOCAL_OFFERS', 'MA_LABELLED_PARTNER_SELECTION', 'MA_LABELLED_PARTNER_SELECTION', 'Partenaires labellisés', 'Sélection de partenaires locaux engagés.', 80703, 4, '{"fr": "Partenaires labellisés"}'::jsonb, '{"fr": "Sélection de partenaires locaux engagés."}'::jsonb, '{"action_key": "ma_labelled_partner_selection", "label_ui_fr": "Partenaires labellisés"}'::jsonb),
  ('CAT_TERR', 'SA_LOCAL_COMMUNITY_SUPPORT', 'MA_LOCAL_SPEND_TRACKING', 'MA_LOCAL_SPEND_TRACKING', 'Dépense locale suivie', 'Part locale des dépenses suivie.', 80711, 4, '{"fr": "Dépense locale suivie"}'::jsonb, '{"fr": "Part locale des dépenses suivie."}'::jsonb, '{"action_key": "ma_local_spend_tracking", "label_ui_fr": "Dépense locale suivie"}'::jsonb),
  ('CAT_TERR', 'SA_LOCAL_COMMUNITY_SUPPORT', 'MA_LOCAL_JOBS', 'MA_LOCAL_JOBS', 'Emploi local', 'Priorité à l''emploi local.', 80712, 4, '{"fr": "Emploi local"}'::jsonb, '{"fr": "Priorité à l''emploi local."}'::jsonb, '{"action_key": "ma_local_jobs", "label_ui_fr": "Emploi local"}'::jsonb),
  ('CAT_TERR', 'SA_LOCAL_COMMUNITY_SUPPORT', 'MA_COMMUNITY_PROJECTS', 'MA_COMMUNITY_PROJECTS', 'Projets locaux soutenus', 'Soutien à des projets locaux.', 80713, 4, '{"fr": "Projets locaux soutenus"}'::jsonb, '{"fr": "Soutien à des projets locaux."}'::jsonb, '{"action_key": "ma_community_projects", "label_ui_fr": "Projets locaux soutenus"}'::jsonb),
  ('CAT_TERR', 'SA_PRO_TRANSITION_SUPPORT', 'MA_TECHNICAL_SUPPORT', 'MA_TECHNICAL_SUPPORT', 'Appui technique', 'Accompagnement technique individualisé proposé.', 80721, 4, '{"fr": "Appui technique"}'::jsonb, '{"fr": "Accompagnement technique individualisé proposé."}'::jsonb, '{"action_key": "ma_technical_support", "label_ui_fr": "Appui technique"}'::jsonb),
  ('CAT_TERR', 'SA_PRO_TRANSITION_SUPPORT', 'MA_TRANSITION_WORKSHOP', 'MA_TRANSITION_WORKSHOP', 'Atelier pro', 'Atelier ou formation pour professionnels du territoire.', 80722, 4, '{"fr": "Atelier pro"}'::jsonb, '{"fr": "Atelier ou formation pour professionnels du territoire."}'::jsonb, '{"action_key": "ma_transition_workshop", "label_ui_fr": "Atelier pro"}'::jsonb),
  ('CAT_TERR', 'SA_PRO_TRANSITION_SUPPORT', 'MA_GUIDE_FOR_PARTNERS', 'MA_GUIDE_FOR_PARTNERS', 'Guide partenaires', 'Guide ou kit transition transmis aux partenaires.', 80723, 4, '{"fr": "Guide partenaires"}'::jsonb, '{"fr": "Guide ou kit transition transmis aux partenaires."}'::jsonb, '{"action_key": "ma_guide_for_partners", "label_ui_fr": "Guide partenaires"}'::jsonb),
  ('CAT_TERR', 'SA_TERRITORY_SUST_INFO', 'MA_LOCAL_ENGAGED_ACTORS', 'MA_LOCAL_ENGAGED_ACTORS', 'Acteurs engagés valorisés', 'Acteurs locaux engagés mis en avant.', 80731, 4, '{"fr": "Acteurs engagés valorisés"}'::jsonb, '{"fr": "Acteurs locaux engagés mis en avant."}'::jsonb, '{"action_key": "ma_local_engaged_actors", "label_ui_fr": "Acteurs engagés valorisés"}'::jsonb),
  ('CAT_TERR', 'SA_TERRITORY_SUST_INFO', 'MA_LOCAL_CHARTER_INFO', 'MA_LOCAL_CHARTER_INFO', 'Charte locale affichée', 'Information sur les engagements du territoire.', 80732, 4, '{"fr": "Charte locale affichée"}'::jsonb, '{"fr": "Information sur les engagements du territoire."}'::jsonb, '{"action_key": "ma_local_charter_info", "label_ui_fr": "Charte locale affichée"}'::jsonb),
  ('CAT_TERR', 'SA_TERRITORY_SUST_INFO', 'MA_RESPONSIBLE_VISIT_TIPS', 'MA_RESPONSIBLE_VISIT_TIPS', 'Conseils visite responsable', 'Conseils de visite responsable fournis.', 80733, 4, '{"fr": "Conseils visite responsable"}'::jsonb, '{"fr": "Conseils de visite responsable fournis."}'::jsonb, '{"action_key": "ma_responsible_visit_tips", "label_ui_fr": "Conseils visite responsable"}'::jsonb),
  ('CAT_TERR', 'SA_VISITOR_FLOW_MANAGEMENT', 'MA_VISITOR_COUNTING', 'MA_VISITOR_COUNTING', 'Comptage visiteurs', 'Mesure de la fréquentation ou comptage des visiteurs pour piloter les flux et les périodes de pointe.', 80741, 3, '{"fr": "Comptage visiteurs"}'::jsonb, '{"fr": "Mesure de la fréquentation ou comptage des visiteurs pour piloter les flux et les périodes de pointe."}'::jsonb, '{"action_key": "ma_visitor_counting", "label_ui_fr": "Comptage visiteurs"}'::jsonb),
  ('CAT_TERR', 'SA_VISITOR_FLOW_MANAGEMENT', 'MA_PEAK_INFO', 'MA_PEAK_INFO', 'Info périodes de pointe', 'Information sur les périodes de pointe.', 80742, 3, '{"fr": "Info périodes de pointe"}'::jsonb, '{"fr": "Information sur les périodes de pointe."}'::jsonb, '{"action_key": "ma_peak_info", "label_ui_fr": "Info périodes de pointe"}'::jsonb),
  ('CAT_TERR', 'SA_VISITOR_FLOW_MANAGEMENT', 'MA_ALT_ROUTE_SIGNAGE', 'MA_ALT_ROUTE_SIGNAGE', 'Itinéraires alternatifs', 'Signalisation ou information d''itinéraires alternatifs pour répartir les flux de visiteurs.', 80743, 3, '{"fr": "Itinéraires alternatifs"}'::jsonb, '{"fr": "Signalisation ou information d''itinéraires alternatifs pour répartir les flux de visiteurs."}'::jsonb, '{"action_key": "ma_alt_route_signage", "label_ui_fr": "Itinéraires alternatifs"}'::jsonb),
  ('CAT_TERR', 'SA_VISITOR_FLOW_MANAGEMENT', 'MA_RESERVATION_SLOTS', 'MA_RESERVATION_SLOTS', 'Jauges ou créneaux', 'Gestion par créneaux ou jauges.', 80744, 3, '{"fr": "Jauges ou créneaux"}'::jsonb, '{"fr": "Gestion par créneaux ou jauges."}'::jsonb, '{"action_key": "ma_reservation_slots", "label_ui_fr": "Jauges ou créneaux"}'::jsonb),
  ('CAT_TERR', 'SA_VISITOR_FLOW_MANAGEMENT', 'MA_FLOW_REDIRECTION', 'MA_FLOW_REDIRECTION', 'Répartition des flux', 'Mesures de répartition ou déviation des flux.', 80745, 3, '{"fr": "Répartition des flux"}'::jsonb, '{"fr": "Mesures de répartition ou déviation des flux."}'::jsonb, '{"action_key": "ma_flow_redirection", "label_ui_fr": "Répartition des flux"}'::jsonb)
)
INSERT INTO ref_sustainability_action (
  category_id, group_id, code, external_code, label, description, position, sort_order,
  action_ui_priority, label_i18n, description_i18n, extra
)
SELECT c.id, g.id, src.code, src.external_code, src.label, src.description,
       src.position, src.position, src.action_ui_priority, src.label_i18n, src.description_i18n, src.extra
FROM src
JOIN ref_sustainability_action_category c ON c.code = src.category_code
JOIN ref_sustainability_action_group g ON g.code = src.group_code
ON CONFLICT (category_id, code) DO UPDATE SET
  group_id = EXCLUDED.group_id,
  external_code = EXCLUDED.external_code,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  position = EXCLUDED.position,
  sort_order = EXCLUDED.sort_order,
  action_ui_priority = EXCLUDED.action_ui_priority,
  label_i18n = EXCLUDED.label_i18n,
  description_i18n = EXCLUDED.description_i18n,
  extra = EXCLUDED.extra,
  updated_at = NOW();

-- 5) Sustainability micro-actions (part 4/4: CAT_WASTE + CAT_WATER)
WITH src(category_code, group_code, code, external_code, label, description, position, action_ui_priority, label_i18n, description_i18n, extra) AS (
VALUES
  ('CAT_WASTE', 'SA_BULK_OR_REFILL', 'MA_BULK_BUYING', 'MA_BULK_BUYING', 'Achat en vrac', 'Achats en vrac privilégiés.', 90751, 4, '{"fr": "Achat en vrac"}'::jsonb, '{"fr": "Achats en vrac privilégiés."}'::jsonb, '{"action_key": "ma_bulk_buying", "label_ui_fr": "Achat en vrac"}'::jsonb),
  ('CAT_WASTE', 'SA_BULK_OR_REFILL', 'MA_REFILLABLE_AMENITIES', 'MA_REFILLABLE_AMENITIES', 'Amenities rechargeables', 'Produits d''accueil rechargeables.', 90752, 4, '{"fr": "Amenities rechargeables"}'::jsonb, '{"fr": "Produits d''accueil rechargeables."}'::jsonb, '{"action_key": "ma_refillable_amenities", "label_ui_fr": "Amenities rechargeables"}'::jsonb),
  ('CAT_WASTE', 'SA_BULK_OR_REFILL', 'MA_REFILL_STATIONS', 'MA_REFILL_STATIONS', 'Stations recharge', 'Systèmes de recharge ou remplissage.', 90753, 4, '{"fr": "Stations recharge"}'::jsonb, '{"fr": "Systèmes de recharge ou remplissage."}'::jsonb, '{"action_key": "ma_refill_stations", "label_ui_fr": "Stations recharge"}'::jsonb),
  ('CAT_WASTE', 'SA_COASTAL_WASTE_MANAGEMENT', 'MA_BEACH_CLEANUP', 'MA_BEACH_CLEANUP', 'Nettoyage raisonné', 'Nettoyage raisonné du littoral ou port.', 90763, 3, '{"fr": "Nettoyage raisonné"}'::jsonb, '{"fr": "Nettoyage raisonné du littoral ou port."}'::jsonb, '{"action_key": "ma_beach_cleanup", "label_ui_fr": "Nettoyage raisonné"}'::jsonb),
  ('CAT_WASTE', 'SA_COASTAL_WASTE_MANAGEMENT', 'MA_LITTER_PREVENTION', 'MA_LITTER_PREVENTION', 'Prévention déchets sauvages', 'Prévention des déchets abandonnés.', 90764, 3, '{"fr": "Prévention déchets sauvages"}'::jsonb, '{"fr": "Prévention des déchets abandonnés."}'::jsonb, '{"action_key": "ma_litter_prevention", "label_ui_fr": "Prévention déchets sauvages"}'::jsonb),
  ('CAT_WASTE', 'SA_COASTAL_WASTE_MANAGEMENT', 'MA_COASTAL_SORTING', 'MA_COASTAL_SORTING', 'Tri littoral', 'Dispositifs de tri sur zones littorales.', 90765, 3, '{"fr": "Tri littoral"}'::jsonb, '{"fr": "Dispositifs de tri sur zones littorales."}'::jsonb, '{"action_key": "ma_coastal_sorting", "label_ui_fr": "Tri littoral"}'::jsonb),
  ('CAT_WASTE', 'SA_COMPOSTING', 'MA_ONSITE_COMPOST', 'MA_ONSITE_COMPOST', 'Composteur sur site', 'Composteur sur site installé.', 90771, 4, '{"fr": "Composteur sur site"}'::jsonb, '{"fr": "Composteur sur site installé."}'::jsonb, '{"action_key": "ma_onsite_compost", "label_ui_fr": "Composteur sur site"}'::jsonb),
  ('CAT_WASTE', 'SA_COMPOSTING', 'MA_COMPOST_MAINT', 'MA_COMPOST_MAINT', 'Suivi compost', 'Suivi de l''entretien et des apports.', 90772, 4, '{"fr": "Suivi compost"}'::jsonb, '{"fr": "Suivi de l''entretien et des apports."}'::jsonb, '{"action_key": "ma_compost_maint", "label_ui_fr": "Suivi compost"}'::jsonb),
  ('CAT_WASTE', 'SA_COMPOSTING', 'MA_COMPOST_USE', 'MA_COMPOST_USE', 'Valorisation compost', 'Compost valorisé localement.', 90773, 4, '{"fr": "Valorisation compost"}'::jsonb, '{"fr": "Compost valorisé localement."}'::jsonb, '{"action_key": "ma_compost_use", "label_ui_fr": "Valorisation compost"}'::jsonb),
  ('CAT_WASTE', 'SA_DISPOSABLE_REDUCTION', 'MA_BULK_SOAP', 'MA_BULK_SOAP', 'Distributeurs rechargeables', 'Distributeurs rechargeables installés.', 90781, 1, '{"fr": "Distributeurs rechargeables"}'::jsonb, '{"fr": "Distributeurs rechargeables installés."}'::jsonb, '{"action_key": "ma_bulk_soap", "label_ui_fr": "Distributeurs rechargeables"}'::jsonb),
  ('CAT_WASTE', 'SA_DISPOSABLE_REDUCTION', 'MA_NO_SINGLE_PORTIONS', 'MA_NO_SINGLE_PORTIONS', 'Moins de dosettes', 'Dosettes et portions individuelles limitées.', 90782, 4, '{"fr": "Moins de dosettes"}'::jsonb, '{"fr": "Dosettes et portions individuelles limitées."}'::jsonb, '{"action_key": "ma_no_single_portions", "label_ui_fr": "Moins de dosettes"}'::jsonb),
  ('CAT_WASTE', 'SA_DISPOSABLE_REDUCTION', 'MA_REUSABLE_TABLEWARE', 'MA_REUSABLE_TABLEWARE', 'Vaisselle réutilisable', 'Vaisselle réutilisable privilégiée.', 90783, 4, '{"fr": "Vaisselle réutilisable"}'::jsonb, '{"fr": "Vaisselle réutilisable privilégiée."}'::jsonb, '{"action_key": "ma_reusable_tableware", "label_ui_fr": "Vaisselle réutilisable"}'::jsonb),
  ('CAT_WASTE', 'SA_DISPOSABLE_REDUCTION', 'MA_ZERO_PLASTIC_SINGLE_USE', 'MA_ZERO_PLASTIC_SINGLE_USE', 'Zéro plastique jetable', 'Suppression des plastiques à usage unique dans l''expérience client et les opérations courantes.', 90784, 1, '{"fr": "Zéro plastique jetable"}'::jsonb, '{"fr": "Suppression des plastiques à usage unique dans l''expérience client et les opérations courantes."}'::jsonb, '{"action_key": "ma_zero_plastic_single_use", "label_ui_fr": "Zéro plastique jetable"}'::jsonb),
  ('CAT_WASTE', 'SA_DURABLE_GOODS_REUSE', 'MA_FURNITURE_REUSE', 'MA_FURNITURE_REUSE', 'Réemploi mobilier', 'Réemploi ou seconde vie du mobilier.', 90791, 4, '{"fr": "Réemploi mobilier"}'::jsonb, '{"fr": "Réemploi ou seconde vie du mobilier."}'::jsonb, '{"action_key": "ma_furniture_reuse", "label_ui_fr": "Réemploi mobilier"}'::jsonb),
  ('CAT_WASTE', 'SA_DURABLE_GOODS_REUSE', 'MA_TEXTILE_REUSE', 'MA_TEXTILE_REUSE', 'Réemploi textile', 'Réemploi ou don des textiles.', 90792, 4, '{"fr": "Réemploi textile"}'::jsonb, '{"fr": "Réemploi ou don des textiles."}'::jsonb, '{"action_key": "ma_textile_reuse", "label_ui_fr": "Réemploi textile"}'::jsonb),
  ('CAT_WASTE', 'SA_DURABLE_GOODS_REUSE', 'MA_REPAIR_BEFORE_REPLACE', 'MA_REPAIR_BEFORE_REPLACE', 'Réparer avant remplacer', 'Politique réparer avant remplacer.', 90793, 4, '{"fr": "Réparer avant remplacer"}'::jsonb, '{"fr": "Politique réparer avant remplacer."}'::jsonb, '{"action_key": "ma_repair_before_replace", "label_ui_fr": "Réparer avant remplacer"}'::jsonb),
  ('CAT_WASTE', 'SA_FOOD_WASTE_REDUCTION', 'MA_DONATION_OR_REUSE', 'MA_DONATION_OR_REUSE', 'Dons ou réemploi', 'Organisation de dons ou réemploi lorsque possible.', 90801, 4, '{"fr": "Dons ou réemploi"}'::jsonb, '{"fr": "Organisation de dons ou réemploi lorsque possible."}'::jsonb, '{"action_key": "ma_donation_or_reuse", "label_ui_fr": "Dons ou réemploi"}'::jsonb),
  ('CAT_WASTE', 'SA_FOOD_WASTE_REDUCTION', 'MA_FOOD_WASTE_QUANTIFIED', 'MA_FOOD_WASTE_QUANTIFIED', 'Gaspillage quantifié', 'Suivi chiffré du gaspillage alimentaire avec mesure régulière des volumes ou poids jetés.', 90802, 1, '{"fr": "Gaspillage quantifié"}'::jsonb, '{"fr": "Suivi chiffré du gaspillage alimentaire avec mesure régulière des volumes ou poids jetés."}'::jsonb, '{"action_key": "ma_food_waste_quantified", "label_ui_fr": "Gaspillage quantifié"}'::jsonb),
  ('CAT_WASTE', 'SA_FOOD_WASTE_REDUCTION', 'MA_PORTION_ADJUSTMENT', 'MA_PORTION_ADJUSTMENT', 'Portions ajustées', 'Portions ajustées à la fréquentation.', 90803, 4, '{"fr": "Portions ajustées"}'::jsonb, '{"fr": "Portions ajustées à la fréquentation."}'::jsonb, '{"action_key": "ma_portion_adjustment", "label_ui_fr": "Portions ajustées"}'::jsonb),
  ('CAT_WASTE', 'SA_FOOD_WASTE_REDUCTION', 'MA_BUFFET_MONITORING', 'MA_BUFFET_MONITORING', 'Suivi buffet', 'Suivi des restes au buffet.', 90804, 4, '{"fr": "Suivi buffet"}'::jsonb, '{"fr": "Suivi des restes au buffet."}'::jsonb, '{"action_key": "ma_buffet_monitoring", "label_ui_fr": "Suivi buffet"}'::jsonb),
  ('CAT_WASTE', 'SA_HAZARDOUS_WASTE', 'MA_LAMP_COLLECTION', 'MA_LAMP_COLLECTION', 'Collecte lampes', 'Collecte des lampes, néons ou ampoules.', 90811, 4, '{"fr": "Collecte lampes"}'::jsonb, '{"fr": "Collecte des lampes, néons ou ampoules."}'::jsonb, '{"action_key": "ma_lamp_collection", "label_ui_fr": "Collecte lampes"}'::jsonb),
  ('CAT_WASTE', 'SA_HAZARDOUS_WASTE', 'MA_BATTERY_COLLECTION', 'MA_BATTERY_COLLECTION', 'Collecte piles', 'Collecte des piles ou petits déchets dangereux.', 90812, 4, '{"fr": "Collecte piles"}'::jsonb, '{"fr": "Collecte des piles ou petits déchets dangereux."}'::jsonb, '{"action_key": "ma_battery_collection", "label_ui_fr": "Collecte piles"}'::jsonb),
  ('CAT_WASTE', 'SA_HAZARDOUS_WASTE', 'MA_TRACKING_BSD', 'MA_TRACKING_BSD', 'Traçabilité déchets', 'Traçabilité des enlèvements ou bordereaux.', 90813, 4, '{"fr": "Traçabilité déchets"}'::jsonb, '{"fr": "Traçabilité des enlèvements ou bordereaux."}'::jsonb, '{"action_key": "ma_tracking_bsd", "label_ui_fr": "Traçabilité déchets"}'::jsonb),
  ('CAT_WASTE', 'SA_ORGANIC_WASTE_SORTING', 'MA_KITCHEN_BIOBINS', 'MA_KITCHEN_BIOBINS', 'Bacs biodéchets', 'Bacs biodéchets en cuisine ou office.', 90821, 4, '{"fr": "Bacs biodéchets"}'::jsonb, '{"fr": "Bacs biodéchets en cuisine ou office."}'::jsonb, '{"action_key": "ma_kitchen_biobins", "label_ui_fr": "Bacs biodéchets"}'::jsonb),
  ('CAT_WASTE', 'SA_ORGANIC_WASTE_SORTING', 'MA_BIOWASTE_PROC', 'MA_BIOWASTE_PROC', 'Procédure biodéchets', 'Procédure de séparation et stockage propre.', 90822, 4, '{"fr": "Procédure biodéchets"}'::jsonb, '{"fr": "Procédure de séparation et stockage propre."}'::jsonb, '{"action_key": "ma_biowaste_proc", "label_ui_fr": "Procédure biodéchets"}'::jsonb),
  ('CAT_WASTE', 'SA_ORGANIC_WASTE_SORTING', 'MA_TABLE_RETURN_SORT', 'MA_TABLE_RETURN_SORT', 'Tri retours plateau', 'Tri des restes en zone de retour si pertinent.', 90823, 4, '{"fr": "Tri retours plateau"}'::jsonb, '{"fr": "Tri des restes en zone de retour si pertinent."}'::jsonb, '{"action_key": "ma_table_return_sort", "label_ui_fr": "Tri retours plateau"}'::jsonb),
  ('CAT_WASTE', 'SA_PAPER_REDUCTION', 'MA_DIGITAL_DOCS', 'MA_DIGITAL_DOCS', 'Docs dématérialisés', 'Documents dématérialisés privilégiés.', 90831, 4, '{"fr": "Docs dématérialisés"}'::jsonb, '{"fr": "Documents dématérialisés privilégiés."}'::jsonb, '{"action_key": "ma_digital_docs", "label_ui_fr": "Docs dématérialisés"}'::jsonb),
  ('CAT_WASTE', 'SA_PAPER_REDUCTION', 'MA_PRINT_ON_DEMAND', 'MA_PRINT_ON_DEMAND', 'Impression à la demande', 'Impressions limitées à la demande.', 90832, 4, '{"fr": "Impression à la demande"}'::jsonb, '{"fr": "Impressions limitées à la demande."}'::jsonb, '{"action_key": "ma_print_on_demand", "label_ui_fr": "Impression à la demande"}'::jsonb),
  ('CAT_WASTE', 'SA_PAPER_REDUCTION', 'MA_RECYCLED_PAPER', 'MA_RECYCLED_PAPER', 'Papier recyclé', 'Papier recyclé utilisé quand nécessaire.', 90833, 4, '{"fr": "Papier recyclé"}'::jsonb, '{"fr": "Papier recyclé utilisé quand nécessaire."}'::jsonb, '{"action_key": "ma_recycled_paper", "label_ui_fr": "Papier recyclé"}'::jsonb),
  ('CAT_WASTE', 'SA_WASTE_SORTING_GUESTS', 'MA_MULTILINGUAL_SIGNAGE', 'MA_MULTILINGUAL_SIGNAGE', 'Signalétique multilingue', 'Signalétique de tri claire et multilingue.', 90841, 2, '{"fr": "Signalétique multilingue"}'::jsonb, '{"fr": "Signalétique de tri claire et multilingue."}'::jsonb, '{"action_key": "ma_multilingual_signage", "label_ui_fr": "Signalétique multilingue"}'::jsonb),
  ('CAT_WASTE', 'SA_WASTE_SORTING_GUESTS', 'MA_ROOM_BINS', 'MA_ROOM_BINS', 'Tri en chambre', 'Bacs de tri dans les hébergements ou chambres.', 90842, 1, '{"fr": "Tri en chambre"}'::jsonb, '{"fr": "Bacs de tri dans les hébergements ou chambres."}'::jsonb, '{"action_key": "ma_room_bins", "label_ui_fr": "Tri en chambre"}'::jsonb),
  ('CAT_WASTE', 'SA_WASTE_SORTING_GUESTS', 'MA_COMMON_BINS', 'MA_COMMON_BINS', 'Tri espaces communs', 'Bacs de tri dans les espaces communs.', 90843, 1, '{"fr": "Tri espaces communs"}'::jsonb, '{"fr": "Bacs de tri dans les espaces communs."}'::jsonb, '{"action_key": "ma_common_bins", "label_ui_fr": "Tri espaces communs"}'::jsonb),
  ('CAT_WASTE', 'SA_WASTE_SORTING_STAFF', 'MA_SORTING_INSTRUCTIONS', 'MA_SORTING_INSTRUCTIONS', 'Consignes de tri', 'Consignes de tri affichées pour l''équipe.', 90851, 2, '{"fr": "Consignes de tri"}'::jsonb, '{"fr": "Consignes de tri affichées pour l''équipe."}'::jsonb, '{"action_key": "ma_sorting_instructions", "label_ui_fr": "Consignes de tri"}'::jsonb),
  ('CAT_WASTE', 'SA_WASTE_SORTING_STAFF', 'MA_SORTING_AUDIT', 'MA_SORTING_AUDIT', 'Contrôle qualité tri', 'Audit ou contrôle qualité du tri.', 90852, 2, '{"fr": "Contrôle qualité tri"}'::jsonb, '{"fr": "Audit ou contrôle qualité du tri."}'::jsonb, '{"action_key": "ma_sorting_audit", "label_ui_fr": "Contrôle qualité tri"}'::jsonb),
  ('CAT_WASTE', 'SA_WASTE_SORTING_STAFF', 'MA_BACKOFFICE_SORTING', 'MA_BACKOFFICE_SORTING', 'Tri back-office', 'Bacs de tri en zones de service.', 90853, 1, '{"fr": "Tri back-office"}'::jsonb, '{"fr": "Bacs de tri en zones de service."}'::jsonb, '{"action_key": "ma_backoffice_sorting", "label_ui_fr": "Tri back-office"}'::jsonb),
  ('CAT_WATER', 'SA_BEACH_WATER_QUALITY', 'MA_BATHING_TESTS', 'MA_BATHING_TESTS', 'Analyses eau', 'Analyses de qualité de l''eau réalisées.', 100861, 2, '{"fr": "Analyses eau"}'::jsonb, '{"fr": "Analyses de qualité de l''eau réalisées."}'::jsonb, '{"action_key": "ma_bathing_tests", "label_ui_fr": "Analyses eau"}'::jsonb),
  ('CAT_WATER', 'SA_BEACH_WATER_QUALITY', 'MA_POLLUTION_RESPONSE', 'MA_POLLUTION_RESPONSE', 'Réponse pollution', 'Procédure en cas d''épisode de pollution.', 100862, 2, '{"fr": "Réponse pollution"}'::jsonb, '{"fr": "Procédure en cas d''épisode de pollution."}'::jsonb, '{"action_key": "ma_pollution_response", "label_ui_fr": "Réponse pollution"}'::jsonb),
  ('CAT_WATER', 'SA_BEACH_WATER_QUALITY', 'MA_BATHING_RESULTS_DISPLAY', 'MA_BATHING_RESULTS_DISPLAY', 'Résultats affichés', 'Résultats affichés au public.', 100863, 2, '{"fr": "Résultats affichés"}'::jsonb, '{"fr": "Résultats affichés au public."}'::jsonb, '{"action_key": "ma_bathing_results_display", "label_ui_fr": "Résultats affichés"}'::jsonb),
  ('CAT_WATER', 'SA_DISHWASHER_WATER_EFF', 'MA_FULL_LOAD_ONLY', 'MA_FULL_LOAD_ONLY', 'Cycles à pleine charge', 'Utilisation à pleine charge.', 100871, 4, '{"fr": "Cycles à pleine charge"}'::jsonb, '{"fr": "Utilisation à pleine charge."}'::jsonb, '{"action_key": "ma_full_load_only", "label_ui_fr": "Cycles à pleine charge"}'::jsonb),
  ('CAT_WATER', 'SA_DISHWASHER_WATER_EFF', 'MA_EFFICIENT_DISHWASHER', 'MA_EFFICIENT_DISHWASHER', 'Machine performante', 'Lave-vaisselle à faible consommation.', 100872, 4, '{"fr": "Machine performante"}'::jsonb, '{"fr": "Lave-vaisselle à faible consommation."}'::jsonb, '{"action_key": "ma_efficient_dishwasher", "label_ui_fr": "Machine performante"}'::jsonb),
  ('CAT_WATER', 'SA_DISHWASHER_WATER_EFF', 'MA_DISHWASHER_MAINT', 'MA_DISHWASHER_MAINT', 'Maintenance LV', 'Maintenance régulière du lave-vaisselle.', 100873, 4, '{"fr": "Maintenance LV"}'::jsonb, '{"fr": "Maintenance régulière du lave-vaisselle."}'::jsonb, '{"action_key": "ma_dishwasher_maint", "label_ui_fr": "Maintenance LV"}'::jsonb),
  ('CAT_WATER', 'SA_EFFICIENT_IRRIGATION', 'MA_DRIP_IRRIGATION', 'MA_DRIP_IRRIGATION', 'Goutte à goutte', 'Arrosage goutte à goutte ou ciblé.', 100881, 4, '{"fr": "Goutte à goutte"}'::jsonb, '{"fr": "Arrosage goutte à goutte ou ciblé."}'::jsonb, '{"action_key": "ma_drip_irrigation", "label_ui_fr": "Goutte à goutte"}'::jsonb),
  ('CAT_WATER', 'SA_EFFICIENT_IRRIGATION', 'MA_WATERING_SCHEDULE', 'MA_WATERING_SCHEDULE', 'Horaires d''arrosage', 'Arrosage aux heures les plus adaptées.', 100882, 4, '{"fr": "Horaires d''arrosage"}'::jsonb, '{"fr": "Arrosage aux heures les plus adaptées."}'::jsonb, '{"action_key": "ma_watering_schedule", "label_ui_fr": "Horaires d''arrosage"}'::jsonb),
  ('CAT_WATER', 'SA_EFFICIENT_IRRIGATION', 'MA_DROUGHT_PLANTS', 'MA_DROUGHT_PLANTS', 'Plantes sobres', 'Choix de végétaux peu gourmands en eau.', 100883, 4, '{"fr": "Plantes sobres"}'::jsonb, '{"fr": "Choix de végétaux peu gourmands en eau."}'::jsonb, '{"action_key": "ma_drought_plants", "label_ui_fr": "Plantes sobres"}'::jsonb),
  ('CAT_WATER', 'SA_EFFICIENT_TAPS_SHOWERS', 'MA_FLOW_RATE_TESTS', 'MA_FLOW_RATE_TESTS', 'Mesure des débits', 'Mesure périodique des débits.', 100891, 4, '{"fr": "Mesure des débits"}'::jsonb, '{"fr": "Mesure périodique des débits."}'::jsonb, '{"action_key": "ma_flow_rate_tests", "label_ui_fr": "Mesure des débits"}'::jsonb),
  ('CAT_WATER', 'SA_EFFICIENT_TAPS_SHOWERS', 'MA_TAP_AERATORS', 'MA_TAP_AERATORS', 'Mousseurs', 'Mousseurs sur robinets installés.', 100892, 4, '{"fr": "Mousseurs"}'::jsonb, '{"fr": "Mousseurs sur robinets installés."}'::jsonb, '{"action_key": "ma_tap_aerators", "label_ui_fr": "Mousseurs"}'::jsonb),
  ('CAT_WATER', 'SA_EFFICIENT_TAPS_SHOWERS', 'MA_SHOWER_RESTRICTORS', 'MA_SHOWER_RESTRICTORS', 'Réducteurs douche', 'Réducteurs de débit sur douches.', 100893, 4, '{"fr": "Réducteurs douche"}'::jsonb, '{"fr": "Réducteurs de débit sur douches."}'::jsonb, '{"action_key": "ma_shower_restrictors", "label_ui_fr": "Réducteurs douche"}'::jsonb),
  ('CAT_WATER', 'SA_EFFICIENT_TOILETS', 'MA_TOILET_LEAK_CHECK', 'MA_TOILET_LEAK_CHECK', 'Contrôle chasse', 'Contrôle des fuites de chasse d''eau.', 100901, 4, '{"fr": "Contrôle chasse"}'::jsonb, '{"fr": "Contrôle des fuites de chasse d''eau."}'::jsonb, '{"action_key": "ma_toilet_leak_check", "label_ui_fr": "Contrôle chasse"}'::jsonb),
  ('CAT_WATER', 'SA_EFFICIENT_TOILETS', 'MA_DUAL_FLUSH', 'MA_DUAL_FLUSH', 'Double chasse', 'Chasse d''eau double commande.', 100902, 4, '{"fr": "Double chasse"}'::jsonb, '{"fr": "Chasse d''eau double commande."}'::jsonb, '{"action_key": "ma_dual_flush", "label_ui_fr": "Double chasse"}'::jsonb),
  ('CAT_WATER', 'SA_EFFICIENT_TOILETS', 'MA_WATERLESS_URINALS', 'MA_WATERLESS_URINALS', 'Urinoirs sobres', 'Urinoirs sobres si pertinents.', 100903, 4, '{"fr": "Urinoirs sobres"}'::jsonb, '{"fr": "Urinoirs sobres si pertinents."}'::jsonb, '{"action_key": "ma_waterless_urinals", "label_ui_fr": "Urinoirs sobres"}'::jsonb),
  ('CAT_WATER', 'SA_LAUNDRY_WATER_EFF', 'MA_FULL_LOAD_LAUNDRY', 'MA_FULL_LOAD_LAUNDRY', 'Cycles optimisés', 'Cycles optimisés et pleine charge.', 100911, 4, '{"fr": "Cycles optimisés"}'::jsonb, '{"fr": "Cycles optimisés et pleine charge."}'::jsonb, '{"action_key": "ma_full_load_laundry", "label_ui_fr": "Cycles optimisés"}'::jsonb),
  ('CAT_WATER', 'SA_LAUNDRY_WATER_EFF', 'MA_EFFICIENT_WASHER', 'MA_EFFICIENT_WASHER', 'Machine performante', 'Lave-linge économe installé.', 100912, 4, '{"fr": "Machine performante"}'::jsonb, '{"fr": "Lave-linge économe installé."}'::jsonb, '{"action_key": "ma_efficient_washer", "label_ui_fr": "Machine performante"}'::jsonb),
  ('CAT_WATER', 'SA_LAUNDRY_WATER_EFF', 'MA_ECO_PROGRAMS', 'MA_ECO_PROGRAMS', 'Programmes éco', 'Programmes sobres privilégiés.', 100913, 4, '{"fr": "Programmes éco"}'::jsonb, '{"fr": "Programmes sobres privilégiés."}'::jsonb, '{"action_key": "ma_eco_programs", "label_ui_fr": "Programmes éco"}'::jsonb),
  ('CAT_WATER', 'SA_LEAK_DETECTION', 'MA_DAILY_LEAK_CHECK', 'MA_DAILY_LEAK_CHECK', 'Contrôle fuites', 'Contrôle régulier des fuites.', 100921, 4, '{"fr": "Contrôle fuites"}'::jsonb, '{"fr": "Contrôle régulier des fuites."}'::jsonb, '{"action_key": "ma_daily_leak_check", "label_ui_fr": "Contrôle fuites"}'::jsonb),
  ('CAT_WATER', 'SA_LEAK_DETECTION', 'MA_LEAK_REPAIR_PROCESS', 'MA_LEAK_REPAIR_PROCESS', 'Réparation rapide', 'Processus de réparation rapide.', 100922, 4, '{"fr": "Réparation rapide"}'::jsonb, '{"fr": "Processus de réparation rapide."}'::jsonb, '{"action_key": "ma_leak_repair_process", "label_ui_fr": "Réparation rapide"}'::jsonb),
  ('CAT_WATER', 'SA_LEAK_DETECTION', 'MA_NIGHT_FLOW_TEST', 'MA_NIGHT_FLOW_TEST', 'Test de débit nocturne', 'Test de fuite ou débit de nuit lorsque pertinent.', 100923, 4, '{"fr": "Test de débit nocturne"}'::jsonb, '{"fr": "Test de fuite ou débit de nuit lorsque pertinent."}'::jsonb, '{"action_key": "ma_night_flow_test", "label_ui_fr": "Test de débit nocturne"}'::jsonb),
  ('CAT_WATER', 'SA_RAINWATER_REUSE', 'MA_RAIN_TANK', 'MA_RAIN_TANK', 'Cuve récupération', 'Cuve de récupération d''eau installée.', 100931, 4, '{"fr": "Cuve récupération"}'::jsonb, '{"fr": "Cuve de récupération d''eau installée."}'::jsonb, '{"action_key": "ma_rain_tank", "label_ui_fr": "Cuve récupération"}'::jsonb),
  ('CAT_WATER', 'SA_RAINWATER_REUSE', 'MA_REUSE_SIGNAGE', 'MA_REUSE_SIGNAGE', 'Signalisation réseau', 'Signalisation des usages non potables.', 100932, 4, '{"fr": "Signalisation réseau"}'::jsonb, '{"fr": "Signalisation des usages non potables."}'::jsonb, '{"action_key": "ma_reuse_signage", "label_ui_fr": "Signalisation réseau"}'::jsonb),
  ('CAT_WATER', 'SA_RAINWATER_REUSE', 'MA_NONPOTABLE_USE', 'MA_NONPOTABLE_USE', 'Usage non potable', 'Usage pour arrosage ou nettoyage défini.', 100933, 4, '{"fr": "Usage non potable"}'::jsonb, '{"fr": "Usage pour arrosage ou nettoyage défini."}'::jsonb, '{"action_key": "ma_nonpotable_use", "label_ui_fr": "Usage non potable"}'::jsonb),
  ('CAT_WATER', 'SA_TOWEL_LINEN_REUSE', 'MA_LINEN_SIGNAGE', 'MA_LINEN_SIGNAGE', 'Affichage linge', 'Affichage "linge sur demande".', 100941, 4, '{"fr": "Affichage linge"}'::jsonb, '{"fr": "Affichage \"linge sur demande\"."}'::jsonb, '{"action_key": "ma_linen_signage", "label_ui_fr": "Affichage linge"}'::jsonb),
  ('CAT_WATER', 'SA_TOWEL_LINEN_REUSE', 'MA_HOUSEKEEPING_PROC', 'MA_HOUSEKEEPING_PROC', 'Procédure housekeeping', 'Procédure ménage adaptée à la réutilisation.', 100942, 4, '{"fr": "Procédure housekeeping"}'::jsonb, '{"fr": "Procédure ménage adaptée à la réutilisation."}'::jsonb, '{"action_key": "ma_housekeeping_proc", "label_ui_fr": "Procédure housekeeping"}'::jsonb),
  ('CAT_WATER', 'SA_TOWEL_LINEN_REUSE', 'MA_LAUNDRY_TRACKING', 'MA_LAUNDRY_TRACKING', 'Suivi blanchisserie', 'Suivi des cycles ou kg de linge.', 100943, 4, '{"fr": "Suivi blanchisserie"}'::jsonb, '{"fr": "Suivi des cycles ou kg de linge."}'::jsonb, '{"action_key": "ma_laundry_tracking", "label_ui_fr": "Suivi blanchisserie"}'::jsonb),
  ('CAT_WATER', 'SA_WASTEWATER_TREATMENT', 'MA_SEWAGE_COMPLIANCE', 'MA_SEWAGE_COMPLIANCE', 'Conformité assainissement', 'Raccordement ou traitement conforme.', 100951, 4, '{"fr": "Conformité assainissement"}'::jsonb, '{"fr": "Raccordement ou traitement conforme."}'::jsonb, '{"action_key": "ma_sewage_compliance", "label_ui_fr": "Conformité assainissement"}'::jsonb),
  ('CAT_WATER', 'SA_WASTEWATER_TREATMENT', 'MA_GREASE_TRAP_MAINT', 'MA_GREASE_TRAP_MAINT', 'Entretien bac à graisse', 'Entretien du bac à graisse si applicable.', 100952, 4, '{"fr": "Entretien bac à graisse"}'::jsonb, '{"fr": "Entretien du bac à graisse si applicable."}'::jsonb, '{"action_key": "ma_grease_trap_maint", "label_ui_fr": "Entretien bac à graisse"}'::jsonb),
  ('CAT_WATER', 'SA_WASTEWATER_TREATMENT', 'MA_POLLUTION_EMERGENCY', 'MA_POLLUTION_EMERGENCY', 'Plan pollution', 'Procédure en cas de pollution accidentelle.', 100953, 4, '{"fr": "Plan pollution"}'::jsonb, '{"fr": "Procédure en cas de pollution accidentelle."}'::jsonb, '{"action_key": "ma_pollution_emergency", "label_ui_fr": "Plan pollution"}'::jsonb),
  ('CAT_WATER', 'SA_WATER_MONITORING', 'MA_WATER_ALERT', 'MA_WATER_ALERT', 'Alerte surconsommation', 'Alerte en cas de surconsommation.', 100961, 2, '{"fr": "Alerte surconsommation"}'::jsonb, '{"fr": "Alerte en cas de surconsommation."}'::jsonb, '{"action_key": "ma_water_alert", "label_ui_fr": "Alerte surconsommation"}'::jsonb),
  ('CAT_WATER', 'SA_WATER_MONITORING', 'MA_WATER_KPI', 'MA_WATER_KPI', 'KPI eau', 'Suivi L/nuitée ou m³/mois.', 100962, 2, '{"fr": "KPI eau"}'::jsonb, '{"fr": "Suivi L/nuitée ou m³/mois."}'::jsonb, '{"action_key": "ma_water_kpi", "label_ui_fr": "KPI eau"}'::jsonb),
  ('CAT_WATER', 'SA_WATER_MONITORING', 'MA_WATER_READING', 'MA_WATER_READING', 'Relevé eau', 'Relevé régulier des consommations d''eau.', 100963, 1, '{"fr": "Relevé eau"}'::jsonb, '{"fr": "Relevé régulier des consommations d''eau."}'::jsonb, '{"action_key": "ma_water_reading", "label_ui_fr": "Relevé eau"}'::jsonb),
  ('CAT_WATER', 'SA_WATER_MONITORING', 'MA_WATER_THRESHOLD', 'MA_WATER_THRESHOLD', 'Seuil eau mesuré', 'Consommation d''eau mesurée inférieure à 300 litres par nuitée, avec suivi documenté.', 100964, 1, '{"fr": "Seuil eau mesuré"}'::jsonb, '{"fr": "Consommation d''eau mesurée inférieure à 300 litres par nuitée, avec suivi documenté."}'::jsonb, '{"action_key": "ma_water_threshold", "label_ui_fr": "Seuil <300 L/nuitée"}'::jsonb)
)
INSERT INTO ref_sustainability_action (
  category_id, group_id, code, external_code, label, description, position, sort_order,
  action_ui_priority, label_i18n, description_i18n, extra
)
SELECT c.id, g.id, src.code, src.external_code, src.label, src.description,
       src.position, src.position, src.action_ui_priority, src.label_i18n, src.description_i18n, src.extra
FROM src
JOIN ref_sustainability_action_category c ON c.code = src.category_code
JOIN ref_sustainability_action_group g ON g.code = src.group_code
ON CONFLICT (category_id, code) DO UPDATE SET
  group_id = EXCLUDED.group_id,
  external_code = EXCLUDED.external_code,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  position = EXCLUDED.position,
  sort_order = EXCLUDED.sort_order,
  action_ui_priority = EXCLUDED.action_ui_priority,
  label_i18n = EXCLUDED.label_i18n,
  description_i18n = EXCLUDED.description_i18n,
  extra = EXCLUDED.extra,
  updated_at = NOW();

-- ============================================================
-- Section A-6: Label ↔ equivalent group mappings (Développement Durable V5)
-- ============================================================
WITH src(classification_code, group_code, relation_type, requirement_type, match_scope, note) AS (
VALUES
  ('LBL_ATR', 'SA_ACTION_PLAN_ANNUAL', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ATR', 'SA_ANNUAL_REVIEW', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ATR', 'SA_CARBON_FOOTPRINT', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ATR', 'SA_CLIENT_SENSITIZATION', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ATR', 'SA_CLIMATE_ADAPTATION', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ATR', 'SA_DESTINATION_PARTNER_AUDIT', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ATR', 'SA_FAIR_LOCAL_CONTRACTS', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ATR', 'SA_FEEDBACK_ANALYSIS', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ATR', 'SA_HUMAN_RIGHTS_DECENT_WORK', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ATR', 'SA_IMPACT_REPORTING', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ATR', 'SA_LABELLED_LOCAL_OFFERS', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ATR', 'SA_LOCAL_COMMUNITY_SUPPORT', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ATR', 'SA_LOCAL_POPULATION_INVOLVEMENT', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ATR', 'SA_LOCAL_SUPPLIERS', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ATR', 'SA_POLICY_SUSTAINABILITY', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ATR', 'SA_PUBLIC_COMMUNICATION', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ATR', 'SA_RESPONSIBLE_PROCUREMENT_POLICY', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ATR', 'SA_RSE_STRATEGY_ALIGNMENT', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ATR', 'SA_STAFF_TRAINING_SUST', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ATR', 'SA_STAKEHOLDER_DIALOGUE', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ATR', 'SA_SUPPLIER_EVALUATION', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ATR', 'SA_TRANSPARENT_SALES_INFO', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_CLEF_VERTE', 'SA_ACTION_PLAN_ANNUAL', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_CLEF_VERTE', 'SA_BIODIVERSITY_PROTECTION', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_CLEF_VERTE', 'SA_BULK_OR_REFILL', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_CLEF_VERTE', 'SA_COMPOSTING', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_CLEF_VERTE', 'SA_CONCENTRATED_CLEANERS', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_CLEF_VERTE', 'SA_DIGITAL_SOBRIETY', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_CLEF_VERTE', 'SA_DISPOSABLE_REDUCTION', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_CLEF_VERTE', 'SA_DURABLE_GOODS_REUSE', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_CLEF_VERTE', 'SA_ECOLABEL_CLEANERS', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_CLEF_VERTE', 'SA_EFFICIENT_LIGHTING', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_CLEF_VERTE', 'SA_EFFICIENT_TAPS_SHOWERS', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_CLEF_VERTE', 'SA_ENERGY_MONITORING', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_CLEF_VERTE', 'SA_FOOD_WASTE_REDUCTION', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_CLEF_VERTE', 'SA_GUEST_INFO_SUST', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_CLEF_VERTE', 'SA_LABELLED_LOCAL_OFFERS', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_CLEF_VERTE', 'SA_LOCAL_COMMUNITY_SUPPORT', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_CLEF_VERTE', 'SA_LOCAL_ORGANIC_FAIRTRADE_FOOD', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_CLEF_VERTE', 'SA_LOCAL_SUPPLIERS', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_CLEF_VERTE', 'SA_LOW_IMPACT_TRANSPORT_INFO', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_CLEF_VERTE', 'SA_NATIVE_PLANTING', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_CLEF_VERTE', 'SA_NO_ENDANGERED_SPECIES', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_CLEF_VERTE', 'SA_ONSITE_RENEWABLE_ENERGY', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_CLEF_VERTE', 'SA_ORGANIC_WASTE_SORTING', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_CLEF_VERTE', 'SA_PAPER_REDUCTION', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_CLEF_VERTE', 'SA_PESTICIDE_AVOIDANCE', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_CLEF_VERTE', 'SA_POLICY_SUSTAINABILITY', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_CLEF_VERTE', 'SA_PUBLIC_COMMUNICATION', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_CLEF_VERTE', 'SA_RAINWATER_REUSE', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_CLEF_VERTE', 'SA_RENEWABLE_ELECTRICITY', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_CLEF_VERTE', 'SA_RESPONSIBLE_PROCUREMENT_POLICY', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_CLEF_VERTE', 'SA_STAFF_TRAINING_SUST', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_CLEF_VERTE', 'SA_TERRITORY_SUST_INFO', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_CLEF_VERTE', 'SA_VEGETARIAN_OFFER', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_CLEF_VERTE', 'SA_WASTE_SORTING_GUESTS', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_CLEF_VERTE', 'SA_WASTE_SORTING_STAFF', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_CLEF_VERTE', 'SA_WATER_MONITORING', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'SA_ACCESLIBRE', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'SA_ACCESSIBLE_WEBSITE', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'SA_ACCESS_INFO', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'SA_ACCESS_REGISTER', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'SA_ACTION_PLAN_ANNUAL', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'SA_BIODIVERSITY_PROTECTION', 'macro_group', 'obligatoire', 'search_expansion', 'Ajout v4, groupe clé du pilier écoresponsable / inclusif.'),
  ('LBL_DESTINATION_EXCELLENCE', 'SA_BULK_OR_REFILL', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'SA_CARBON_FOOTPRINT', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'SA_CONCENTRATED_CLEANERS', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'SA_CUSTOMER_FEEDBACK', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'SA_DESTINATION_SUST_INDICATORS', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'SA_DIGITAL_SOBRIETY', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'SA_DISPOSABLE_REDUCTION', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'SA_ECOLABEL_CLEANERS', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'SA_EFFICIENT_LIGHTING', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'SA_EFFICIENT_TAPS_SHOWERS', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'SA_ENERGY_AUDIT', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'SA_ENERGY_MONITORING', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'SA_FEEDBACK_ANALYSIS', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'SA_HVAC_EFFICIENCY', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'SA_LABELLED_LOCAL_OFFERS', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'SA_LOCAL_COMMUNITY_SUPPORT', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'SA_LOW_IMPACT_TRANSPORT_INFO', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'SA_LOW_IMPACT_TRANSPORT_SERVICES', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'SA_PESTICIDE_AVOIDANCE', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'SA_POLICY_SUSTAINABILITY', 'macro_group', 'obligatoire', 'search_expansion', 'Ajout v4, groupe clé du pilier écoresponsable / inclusif.'),
  ('LBL_DESTINATION_EXCELLENCE', 'SA_PRO_TRANSITION_SUPPORT', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'SA_PUBLIC_COMMUNICATION', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'SA_RAINWATER_REUSE', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'SA_RESPONSIBLE_PROCUREMENT_POLICY', 'macro_group', 'obligatoire', 'search_expansion', 'Ajout v4, groupe clé du pilier écoresponsable / inclusif.'),
  ('LBL_DESTINATION_EXCELLENCE', 'SA_STAFF_TRAINING_ACCESS', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'SA_STAFF_TRAINING_SUST', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'SA_STAKEHOLDER_DIALOGUE', 'macro_group', 'obligatoire', 'search_expansion', 'Ajout v4, groupe clé du pilier écoresponsable / inclusif.'),
  ('LBL_DESTINATION_EXCELLENCE', 'SA_TERRITORY_SUST_INFO', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'SA_THERMOREGULATION', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'SA_VISITOR_FLOW_MANAGEMENT', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'SA_WASTE_SORTING_GUESTS', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'SA_WASTE_SORTING_STAFF', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'SA_WATER_MONITORING', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_ACTION_PLAN_ANNUAL', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_AUTO_SWITCH_OFF', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_BULK_OR_REFILL', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_CARBON_FOOTPRINT', 'macro_group', 'points', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_COMPOSTING', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_DISHWASHER_WATER_EFF', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_DISPOSABLE_REDUCTION', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_DURABLE_GOODS_REUSE', 'macro_group', 'points', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_ECOLABEL_CLEANERS', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_EFFICIENT_IRRIGATION', 'macro_group', 'points', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_EFFICIENT_LIGHTING', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_EFFICIENT_TAPS_SHOWERS', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_EFFICIENT_TOILETS', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_ENERGY_MONITORING', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_FOOD_WASTE_REDUCTION', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_GUEST_INFO_SUST', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_HOT_WATER_EFFICIENCY', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_HUMAN_RIGHTS_DECENT_WORK', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_HVAC_EFFICIENCY', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_LAUNDRY_WATER_EFF', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_LOCAL_ORGANIC_FAIRTRADE_FOOD', 'macro_group', 'points', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_LOW_CHEMICAL_DISINFECTION', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_LOW_IMPACT_TRANSPORT_INFO', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_LOW_IMPACT_TRANSPORT_SERVICES', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_NATIVE_PLANTING', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_ONSITE_RENEWABLE_ENERGY', 'macro_group', 'points', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_PAPER_REDUCTION', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_PESTICIDE_AVOIDANCE', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_POLICY_SUSTAINABILITY', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_PUBLIC_COMMUNICATION', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_RAINWATER_REUSE', 'macro_group', 'points', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_REGULATORY_COMPLIANCE', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_RENEWABLE_ELECTRICITY', 'macro_group', 'points', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_RENEWABLE_HEAT', 'macro_group', 'points', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_STAFF_TRAINING_SUST', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_SUBMETERING', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_SUPPLIER_EVALUATION', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_THERMOREGULATION', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_TOWEL_LINEN_REUSE', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_VEGETARIAN_OFFER', 'macro_group', 'points', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_WASTEWATER_TREATMENT', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_WASTE_SORTING_GUESTS', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_ECO_LABEL_UE', 'SA_WASTE_SORTING_STAFF', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_FLOCON_VERT', 'SA_ACTION_PLAN_ANNUAL', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_FLOCON_VERT', 'SA_BIODIVERSITY_PROTECTION', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_FLOCON_VERT', 'SA_CLIENT_SENSITIZATION', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_FLOCON_VERT', 'SA_CLIMATE_ADAPTATION', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_FLOCON_VERT', 'SA_DESTINATION_SUST_INDICATORS', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_FLOCON_VERT', 'SA_ENERGY_MONITORING', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_FLOCON_VERT', 'SA_LOCAL_COMMUNITY_SUPPORT', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_FLOCON_VERT', 'SA_LOW_IMPACT_TRANSPORT_INFO', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_FLOCON_VERT', 'SA_LOW_IMPACT_TRANSPORT_SERVICES', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_FLOCON_VERT', 'SA_MOUNTAIN_MOBILITY_PLAN', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_FLOCON_VERT', 'SA_PESTICIDE_AVOIDANCE', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_FLOCON_VERT', 'SA_POLICY_SUSTAINABILITY', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_FLOCON_VERT', 'SA_STAKEHOLDER_DIALOGUE', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_FLOCON_VERT', 'SA_VISITOR_FLOW_MANAGEMENT', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_GREEN_DESTINATIONS', 'SA_ACTION_PLAN_ANNUAL', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_GREEN_DESTINATIONS', 'SA_BIODIVERSITY_PROTECTION', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_GREEN_DESTINATIONS', 'SA_CLIMATE_ADAPTATION', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_GREEN_DESTINATIONS', 'SA_DESTINATION_SUST_INDICATORS', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_GREEN_DESTINATIONS', 'SA_FAIR_LOCAL_CONTRACTS', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_GREEN_DESTINATIONS', 'SA_IMPACT_REPORTING', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_GREEN_DESTINATIONS', 'SA_LOCAL_COMMUNITY_SUPPORT', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_GREEN_DESTINATIONS', 'SA_LOCAL_POPULATION_INVOLVEMENT', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_GREEN_DESTINATIONS', 'SA_POLICY_SUSTAINABILITY', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_GREEN_DESTINATIONS', 'SA_STAKEHOLDER_DIALOGUE', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_GREEN_DESTINATIONS', 'SA_VISITOR_FLOW_MANAGEMENT', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_LABEL_BAS_CARBONE', 'SA_CARBON_FOOTPRINT', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_LABEL_BAS_CARBONE', 'SA_IMPACT_REPORTING', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_LABEL_BAS_CARBONE', 'SA_RSE_STRATEGY_ALIGNMENT', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_PAVILLON_BLEU', 'SA_ACCESSIBLE_PARKING', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_PAVILLON_BLEU', 'SA_ACCESSIBLE_PATHWAYS', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_PAVILLON_BLEU', 'SA_BEACH_WATER_QUALITY', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_PAVILLON_BLEU', 'SA_BIODIVERSITY_PROTECTION', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_PAVILLON_BLEU', 'SA_COASTAL_WASTE_MANAGEMENT', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_PAVILLON_BLEU', 'SA_GUEST_INFO_SUST', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_PAVILLON_BLEU', 'SA_HAZARDOUS_WASTE', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_PAVILLON_BLEU', 'SA_PESTICIDE_AVOIDANCE', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_PAVILLON_BLEU', 'SA_WASTEWATER_TREATMENT', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_PAVILLON_BLEU', 'SA_WASTE_SORTING_GUESTS', 'macro_group', 'obligatoire', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_PAVILLON_BLEU', 'SA_WATER_MONITORING', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_QUALITE_TOURISME', 'SA_ACTION_PLAN_ANNUAL', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_QUALITE_TOURISME', 'SA_CUSTOMER_FEEDBACK', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_QUALITE_TOURISME', 'SA_FEEDBACK_ANALYSIS', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.'),
  ('LBL_QUALITE_TOURISME', 'SA_PUBLIC_COMMUNICATION', 'macro_group', 'recommandé', 'search_expansion', 'Groupe d''actions rattaché au label.')
)
INSERT INTO ref_classification_equivalent_group (scheme_id, group_id, relation_type, requirement_type, match_scope, note)
SELECT s.id, g.id, src.relation_type, src.requirement_type, src.match_scope, src.note
FROM src
JOIN ref_classification_scheme s ON s.code = src.classification_code
JOIN ref_sustainability_action_group g ON g.code = src.group_code
ON CONFLICT (scheme_id, group_id) DO UPDATE SET
  relation_type = EXCLUDED.relation_type,
  requirement_type = EXCLUDED.requirement_type,
  match_scope = EXCLUDED.match_scope,
  note = EXCLUDED.note,
  updated_at = NOW();

-- ============================================================
-- Section A-7: Label ↔ equivalent action mappings (Développement Durable V5)
-- NULL classification_code rows produce no INSERT (JOIN finds no match) — intentional.
-- ============================================================
WITH src(classification_code, action_external_code, relation_type, requirement_type, match_scope, note) AS (
VALUES
  ('LBL_ATR', 'MA_ACTION_DEADLINES', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_ACTION_OWNERS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_ALERT_CHANNEL', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_ANNUAL_IMPACT_REPORT', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_ANNUAL_REVIEW_HELD', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_CLEAR_SCOPE_OF_COMMITMENT', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_CLIMATE_RISK_MAP', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_COMMUNITY_PROJECTS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_CORRECTIVE_TRACKING', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_CO_DESIGN_OFFERS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_DATA_QUALITY_CHECK', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_DECENT_WORK_CLAUSES', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_DURABILITY_PAGE', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_ECOGESTURES_TRAINING', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_EXECUTIVE_GOVERNANCE', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_FAIR_TERMS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_FEEDBACK_CHANNEL', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_FIELD_CHECKS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_GAPS_ANALYZED', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_GHG_ACCOUNTING', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_HEATWAVE_PLAN', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_HR_POLICY', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_IMPACT_SHEET', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_IMPROVEMENT_ACTIONS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_KPI_DASHBOARD', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_LABELLED_OFFERS_HIGHLIGHT', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_LABELLED_PARTNER_SELECTION', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_LOCAL_BENEFIT_TRACKING', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_LOCAL_CONSULTATION', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_LOCAL_JOBS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_LOCAL_LABEL_FILTER', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_LOCAL_PARTNER_VISIBILITY', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_LOCAL_PURCHASE_SHARE', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_LOCAL_SPEND_TRACKING', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_LOCAL_SUPPLIER_LIST', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_LOCAL_VALUE_SHARE', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_LOW_CARBON_PROJECTS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_MONTHLY_REVIEW_FEEDBACK', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_NATURE_BASED_SOLUTIONS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_NONCONFORMITY_FOLLOWUP', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_OBJECTIVES_DEFINED', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_ONTRIP_BRIEFING', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_PARTNER_AUDIT_GRID', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_PAYMENT_TIMELINESS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_PRETRIP_INFO', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_PRICE_TRANSPARENCY', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_PROCUREMENT_CHARTER', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_PROCUREMENT_TRACEABILITY', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_PRODUCT_ALIGNMENT', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_PROOFS_ONLINE', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_REDUCTION_TRAJECTORY', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_REFRESHER_TRAINING', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_RESPONSIBLE_BEHAVIOUR_TIPS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_RSE_CHARTER', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_RSE_CRITERIA_RFQ', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_RSE_REFERENT', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_RSE_SCOPE_DEFINED', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_RSE_STRATEGY_DOC', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_SCOPE_EXPLAINED', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_STAKEHOLDER_MAP', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_STAKEHOLDER_MEETING', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_SUPPLIER_ANNUAL_REVIEW', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_SUPPLIER_GRID', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_SUPPLIER_PROGRESS_PLAN', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_TEAM_FEEDBACK_LOOP', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ATR', 'MA_WASTE_TRAINING', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_ACCESSIBLE_TRANSPORT_INFO', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_ACTION_DEADLINES', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_ACTION_OWNERS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_BACKOFFICE_SORTING', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_BIODIVERSITY_AWARENESS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_BIODIV_INVENTORY', 'equivalent_action', 'recommandé', 'search_expansion', 'Ajout v4, mesure ou action clef demandée pour renforcer l''alignement Clef Verte 2026.'),
  ('LBL_CLEF_VERTE', 'MA_BIOWASTE_PROC', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_BUFFET_MONITORING', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_BULK_BUYING', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_BULK_SOAP', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_COMMONS_SIGNAGE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_COMMON_BINS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_COMMUNITY_PROJECTS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_COMPOST_MAINT', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_COMPOST_USE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_CONCENTRATED_FORMAT', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_DAILY_VEG_OPTION', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_DEVICE_LIFESPAN', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_DIGITAL_DOCS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_DONATION_OR_REUSE', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_DOSING_STATION', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_DURABILITY_PAGE', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_ECOGESTURES_TRAINING', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_ECOLABEL_LIST', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_ECOLABEL_PRODUCTS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_ENERGY_ALERT', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_ENERGY_KPI', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_ENERGY_THRESHOLD', 'equivalent_action', 'recommandé', 'search_expansion', 'Ajout v4, mesure ou action clef demandée pour renforcer l''alignement Clef Verte 2026.'),
  ('LBL_CLEF_VERTE', 'MA_FAIRTRADE_PRODUCTS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_FLOW_RATE_TESTS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_FOOD_WASTE_QUANTIFIED', 'equivalent_action', 'obligatoire', 'search_expansion', 'Ajout v4, mesure ou action clef demandée pour renforcer l''alignement Clef Verte 2026.'),
  ('LBL_CLEF_VERTE', 'MA_FURNITURE_REUSE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_GO_CERTIFICATES', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_GREEN_CONTRACT', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_GREEN_SHARE_TRACKED', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_HABITAT_PROTECTION', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_INVASIVE_SPECIES_AVOIDED', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_KITCHEN_BIOBINS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_LABELLED_OFFERS_HIGHLIGHT', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_LABELLED_PARTNER_SELECTION', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_LED_BULBS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_LESS_PACKAGING', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_LIGHTING_INVENTORY', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_LIGHTWEIGHT_WEBSITE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_LOCAL_CHARTER_INFO', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_LOCAL_ENGAGED_ACTORS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_LOCAL_FOOD_SHARE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_LOCAL_JOBS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_LOCAL_LABEL_FILTER', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_LOCAL_PARTNER_VISIBILITY', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_LOCAL_PURCHASE_SHARE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_LOCAL_SPEND_TRACKING', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_LOCAL_SUPPLIER_LIST', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_MECHANICAL_WEEDING', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_MENU_CONTROL', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_MENU_HIGHLIGHT_VEG', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_MONTHLY_ENERGY_READING', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_MOTION_SENSORS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_MULTILINGUAL_SIGNAGE', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_NATIVE_SPECIES', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_NATURAL_PRODUCTS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_NONPOTABLE_USE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_NO_SINGLE_PORTIONS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_OBJECTIVES_DEFINED', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_ONSITE_COMPOST', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_ORGANIC_PRODUCTS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_POLLINATOR_PLANTS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_PORTION_ADJUSTMENT', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_PRINT_ON_DEMAND', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_PROCUREMENT_CHARTER', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_PROCUREMENT_TRACEABILITY', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_PRODUCTION_MONITORING', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_PROOFS_ONLINE', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_PROTEIN_DIVERSIFICATION', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_PUBLIC_TRANSPORT_INFO', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_RAIN_TANK', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_RECYCLED_PAPER', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_REFILLABLE_AMENITIES', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_REFILL_STATIONS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_REFRESHER_TRAINING', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_REFUGE_ZONE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_REPAIR_BEFORE_REPLACE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_RESPONSIBLE_HOSTING', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_RESPONSIBLE_VISIT_TIPS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_REUSABLE_TABLEWARE', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_REUSE_SIGNAGE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_ROOM_BINS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_ROOM_SIGNAGE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_RSE_CHARTER', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_RSE_CRITERIA_RFQ', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_RSE_REFERENT', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_RSE_SCOPE_DEFINED', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_SCOPE_EXPLAINED', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_SHOWER_RESTRICTORS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_SOLAR_PV', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_SOLAR_THERMAL', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_SORTING_AUDIT', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_SORTING_INSTRUCTIONS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_SPECIES_POLICY', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_SUPPLIER_CHECK_SPECIES', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_SUPPLIER_PROOF', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_TABLE_RETURN_SORT', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_TAP_AERATORS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_TEXTILE_REUSE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_WASTE_TRAINING', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_WATER_ALERT', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_WATER_KPI', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_WATER_READING', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_WATER_THRESHOLD', 'equivalent_action', 'recommandé', 'search_expansion', 'Ajout v4, mesure ou action clef demandée pour renforcer l''alignement Clef Verte 2026.'),
  ('LBL_CLEF_VERTE', 'MA_WEB_SUST_PAGE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_WITHOUT_CAR_PAGE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_ZERO_PESTICIDE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_CLEF_VERTE', 'MA_ZERO_PLASTIC_SINGLE_USE', 'equivalent_action', 'obligatoire', 'search_expansion', 'Ajout v4, mesure ou action clef demandée pour renforcer l''alignement Clef Verte 2026.')
)
INSERT INTO ref_classification_equivalent_action (scheme_id, action_id, relation_type, requirement_type, match_scope, note)
SELECT s.id, a.id, src.relation_type, src.requirement_type, src.match_scope, src.note
FROM src
JOIN ref_classification_scheme s ON s.code = src.classification_code
JOIN ref_sustainability_action a ON a.external_code = src.action_external_code
ON CONFLICT (scheme_id, action_id) DO UPDATE SET
  relation_type = EXCLUDED.relation_type,
  requirement_type = EXCLUDED.requirement_type,
  match_scope = EXCLUDED.match_scope,
  note = EXCLUDED.note,
  updated_at = NOW();

-- Section A-7 part 2: LBL_DESTINATION_EXCELLENCE action equivalences
WITH src(classification_code, action_external_code, relation_type, requirement_type, match_scope, note) AS (
VALUES
  ('LBL_DESTINATION_EXCELLENCE', 'MA_ACCESLIBRE_CREATED', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_ACCESLIBRE_PHOTOS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_ACCESLIBRE_UPDATED', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_ACCESSIBILITY_DECLARATION', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_ACCESSIBLE_TRANSPORT_INFO', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_ACCESS_DEROGATIONS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_ACCESS_FACTSHEET', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_ACCESS_PHOTOS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_ACCESS_REFERENT', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_ACCESS_ROLEPLAY', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_ACTION_DEADLINES', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_ACTION_OWNERS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_AUDIT_ACTIONS_PRIORITIZED', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_AUDIT_DONE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_BACKOFFICE_SORTING', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_BIKE_PARKING', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_BIKE_REPAIR_KIT', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_BIODIVERSITY_AWARENESS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Ajout v4, actions du groupe clé Destination d''excellence.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_BIODIV_INVENTORY', 'equivalent_action', 'obligatoire', 'search_expansion', 'Ajout v4, élément de pilotage biodiversité.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_BULK_BUYING', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_BULK_SOAP', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_COMMON_BINS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_COMMUNITY_PROJECTS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_COMPLAINT_LOG', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_CONCENTRATED_FORMAT', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_CORRECTION_PLAN', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_DESTINATION_DASHBOARD', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_DEVICE_LIFESPAN', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_DOSING_STATION', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_DURABILITY_PAGE', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_ECOGESTURES_TRAINING', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_ECOLABEL_LIST', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_ECOLABEL_PRODUCTS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_ENERGY_ALERT', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_ENERGY_KPI', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_ENERGY_THRESHOLD', 'equivalent_action', 'obligatoire', 'search_expansion', 'Ajout v4, indicateur quantifié utile pour le pilier écoresponsable.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_EV_CHARGING', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_FEEDBACK_CHANNEL', 'equivalent_action', 'obligatoire', 'search_expansion', 'Ajout v4, actions du groupe clé Destination d''excellence.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_FILTERS_CLEANED', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_FLOW_RATE_TESTS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_FLOW_REDIRECTION', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_GHG_ACCOUNTING', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_GUIDE_FOR_PARTNERS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_HABITAT_PROTECTION', 'equivalent_action', 'obligatoire', 'search_expansion', 'Ajout v4, actions du groupe clé Destination d''excellence.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_HANDICAP_TRAINING', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_HVAC_MAINTENANCE', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_HVAC_RENEWAL_PLAN', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_IMPROVEMENT_ACTIONS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_LABELLED_OFFERS_HIGHLIGHT', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_LABELLED_PARTNER_SELECTION', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_LED_BULBS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_LESS_PACKAGING', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_LIGHTING_INVENTORY', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_LIGHTWEIGHT_WEBSITE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_LOCAL_CHARTER_INFO', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_LOCAL_DATA_COLLECTION', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_LOCAL_ENGAGED_ACTORS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_LOCAL_JOBS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_LOCAL_LABEL_FILTER', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_LOCAL_SPEND_TRACKING', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_LOW_CARBON_PROJECTS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_MECHANICAL_WEEDING', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_MONTHLY_ENERGY_READING', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_MONTHLY_REVIEW_FEEDBACK', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_MOTION_SENSORS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_MULTILINGUAL_SIGNAGE', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_NATURAL_PRODUCTS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_NONPOTABLE_USE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_NO_SINGLE_PORTIONS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_OBJECTIVES_DEFINED', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_PEAK_INFO', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_PROCUREMENT_CHARTER', 'equivalent_action', 'obligatoire', 'search_expansion', 'Ajout v4, actions du groupe clé Destination d''excellence.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_PROCUREMENT_TRACEABILITY', 'equivalent_action', 'obligatoire', 'search_expansion', 'Ajout v4, actions du groupe clé Destination d''excellence.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_PROOFS_ONLINE', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_PUBLIC_REPORTING_DEST', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_PUBLIC_TRANSPORT_INFO', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_QR_REVIEW', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_RAIN_TANK', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_REDUCTION_TRAJECTORY', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_REFILLABLE_AMENITIES', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_REFILL_STATIONS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_REFRESHER_TRAINING', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_REFUGE_ZONE', 'equivalent_action', 'obligatoire', 'search_expansion', 'Ajout v4, actions du groupe clé Destination d''excellence.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_REGISTER_AVAILABLE', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_REGISTER_UPDATED', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_RESERVATION_SLOTS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_RESPONSIBLE_HOSTING', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_RESPONSIBLE_VISIT_TIPS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_REUSABLE_TABLEWARE', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_REUSE_SIGNAGE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_RGAA_AUDIT', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_ROI_TRACKING', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_ROOM_BINS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_ROOM_CONTROL', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_RSE_CHARTER', 'equivalent_action', 'obligatoire', 'search_expansion', 'Ajout v4, actions du groupe clé Destination d''excellence.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_RSE_CRITERIA_RFQ', 'equivalent_action', 'obligatoire', 'search_expansion', 'Ajout v4, actions du groupe clé Destination d''excellence.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_RSE_REFERENT', 'equivalent_action', 'obligatoire', 'search_expansion', 'Ajout v4, actions du groupe clé Destination d''excellence.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_RSE_SCOPE_DEFINED', 'equivalent_action', 'obligatoire', 'search_expansion', 'Ajout v4, actions du groupe clé Destination d''excellence.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_SCOPE_EXPLAINED', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_SETPOINT_POLICY', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_SHOWER_RESTRICTORS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_SORTING_AUDIT', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_SORTING_INSTRUCTIONS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_STAFF_KNOWS_REGISTER', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_STAKEHOLDER_MAP', 'equivalent_action', 'obligatoire', 'search_expansion', 'Ajout v4, actions du groupe clé Destination d''excellence.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_STAKEHOLDER_MEETING', 'equivalent_action', 'obligatoire', 'search_expansion', 'Ajout v4, actions du groupe clé Destination d''excellence.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_SUPPLIER_PROOF', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_SURVEY_DEPLOYED', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_TAP_AERATORS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_TEAM_FEEDBACK_LOOP', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_TECHNICAL_SUPPORT', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_THERMOSTATS_INSTALLED', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_TRANSITION_WORKSHOP', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_WASTE_TRAINING', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_WATER_ALERT', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_WATER_KPI', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_WATER_READING', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_WATER_THRESHOLD', 'equivalent_action', 'obligatoire', 'search_expansion', 'Ajout v4, indicateur quantifié utile pour le pilier écoresponsable.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_WITHOUT_CAR_PAGE', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_ZERO_PESTICIDE', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_DESTINATION_EXCELLENCE', 'MA_ZERO_PLASTIC_SINGLE_USE', 'equivalent_action', 'obligatoire', 'search_expansion', 'Ajout v4, action de réduction des déchets et plastiques.')
)
INSERT INTO ref_classification_equivalent_action (scheme_id, action_id, relation_type, requirement_type, match_scope, note)
SELECT s.id, a.id, src.relation_type, src.requirement_type, src.match_scope, src.note
FROM src
JOIN ref_classification_scheme s ON s.code = src.classification_code
JOIN ref_sustainability_action a ON a.external_code = src.action_external_code
ON CONFLICT (scheme_id, action_id) DO UPDATE SET
  relation_type = EXCLUDED.relation_type,
  requirement_type = EXCLUDED.requirement_type,
  match_scope = EXCLUDED.match_scope,
  note = EXCLUDED.note,
  updated_at = NOW();

-- Section A-7 part 3: LBL_ECO_LABEL_UE action equivalences
WITH src(classification_code, action_external_code, relation_type, requirement_type, match_scope, note) AS (
VALUES
  ('LBL_ECO_LABEL_UE', 'MA_ACCESSIBLE_TRANSPORT_INFO', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_ACTION_DEADLINES', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_ACTION_OWNERS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_ALERT_CHANNEL', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_ALT_METHODS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_AUTO_LIGHT_OFF', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_BACKOFFICE_SORTING', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_BIKE_PARKING', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_BIKE_REPAIR_KIT', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_BIOMASS_SYSTEM', 'equivalent_action', 'points', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_BUFFET_MONITORING', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_BULK_BUYING', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_BULK_SOAP', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_CHEMICAL_REVIEW', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_COMMONS_SIGNAGE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_COMMON_BINS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_COMPOST_MAINT', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_COMPOST_USE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_CONTROL_CALENDAR', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_DAILY_VEG_OPTION', 'equivalent_action', 'points', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_DECENT_WORK_CLAUSES', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_DHW_EFFICIENT_SYSTEM', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_DHW_SETPOINTS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_DIGITAL_DOCS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_DISHWASHER_MAINT', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_DONATION_OR_REUSE', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_DRIP_IRRIGATION', 'equivalent_action', 'points', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_DROUGHT_PLANTS', 'equivalent_action', 'points', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_DUAL_FLUSH', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_DURABILITY_PAGE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_ECOGESTURES_TRAINING', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_ECOLABEL_LIST', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_ECOLABEL_PRODUCTS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_ECO_PROGRAMS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_EFFICIENT_DISHWASHER', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_EFFICIENT_WASHER', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_ELEC_SUBMETERS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_ENERGY_ALERT', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_ENERGY_KPI', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_EV_CHARGING', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_FAIRTRADE_PRODUCTS', 'equivalent_action', 'points', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_FILTERS_CLEANED', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_FLOW_RATE_TESTS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_FOOD_WASTE_QUANTIFIED', 'equivalent_action', 'obligatoire', 'search_expansion', 'Ajout v4, suivi quantifié du gaspillage alimentaire.'),
  ('LBL_ECO_LABEL_UE', 'MA_FULL_LOAD_LAUNDRY', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_FULL_LOAD_ONLY', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_FURNITURE_REUSE', 'equivalent_action', 'points', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_GHG_ACCOUNTING', 'equivalent_action', 'points', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_GO_CERTIFICATES', 'equivalent_action', 'points', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_GREASE_TRAP_MAINT', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_GREEN_CONTRACT', 'equivalent_action', 'points', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_GREEN_SHARE_TRACKED', 'equivalent_action', 'points', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_HEAT_PUMP', 'equivalent_action', 'points', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_HOUSEKEEPING_PROC', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_HR_POLICY', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_HVAC_MAINTENANCE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_HVAC_RENEWAL_PLAN', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_INVASIVE_SPECIES_AVOIDED', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_KEYCARD_SWITCH', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_LAUNDRY_TRACKING', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_LED_BULBS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_LIGHTING_INVENTORY', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_LINEN_SIGNAGE', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_LOCAL_FOOD_SHARE', 'equivalent_action', 'points', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_LOW_CARBON_PROJECTS', 'equivalent_action', 'points', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_MECHANICAL_WEEDING', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_MENU_HIGHLIGHT_VEG', 'equivalent_action', 'points', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_MONTHLY_ENERGY_READING', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_MOTION_SENSORS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_MULTILINGUAL_SIGNAGE', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_NATIVE_SPECIES', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_NATURAL_PRODUCTS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_NONPOTABLE_USE', 'equivalent_action', 'points', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_NO_SINGLE_PORTIONS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_OBJECTIVES_DEFINED', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_ONSITE_COMPOST', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_ORGANIC_PRODUCTS', 'equivalent_action', 'points', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_PIPE_INSULATION', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_POLLINATOR_PLANTS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_POLLUTION_EMERGENCY', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_PORTION_ADJUSTMENT', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_PRINT_ON_DEMAND', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_PRODUCTION_MONITORING', 'equivalent_action', 'points', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_PROOFS_ONLINE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_PROOF_ARCHIVE', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_PROTEIN_DIVERSIFICATION', 'equivalent_action', 'points', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_PUBLIC_TRANSPORT_INFO', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_RAIN_TANK', 'equivalent_action', 'points', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_RECYCLED_PAPER', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_REDUCTION_TRAJECTORY', 'equivalent_action', 'points', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_REFILLABLE_AMENITIES', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_REFILL_STATIONS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_REFRESHER_TRAINING', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_REGULATORY_REGISTER', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_RENEWABLE_HEAT_SHARE', 'equivalent_action', 'points', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_REPAIR_BEFORE_REPLACE', 'equivalent_action', 'points', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_REUSABLE_TABLEWARE', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_REUSE_SIGNAGE', 'equivalent_action', 'points', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_ROOM_BINS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_ROOM_CONTROL', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_ROOM_SIGNAGE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_RSE_CHARTER', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_RSE_REFERENT', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_RSE_SCOPE_DEFINED', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_SCOPE_EXPLAINED', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_SETPOINT_POLICY', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_SEWAGE_COMPLIANCE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_SHOWER_RESTRICTORS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_SOLAR_PV', 'equivalent_action', 'points', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_SOLAR_THERMAL', 'equivalent_action', 'points', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_SORTING_AUDIT', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_SORTING_INSTRUCTIONS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_STANDBY_POLICY', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_SUPPLIER_ANNUAL_REVIEW', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_SUPPLIER_GRID', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_SUPPLIER_PROGRESS_PLAN', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_SUPPLIER_PROOF', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_TAP_AERATORS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_TARGETED_DISINFECTION', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_TEXTILE_REUSE', 'equivalent_action', 'points', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_THERMOSTATS_INSTALLED', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_TOILET_LEAK_CHECK', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_USE_BREAKDOWN', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_WASTE_TRAINING', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_WATERING_SCHEDULE', 'equivalent_action', 'points', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_WATERLESS_URINALS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_WATER_SUBMETERS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_WEB_SUST_PAGE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_WITHOUT_CAR_PAGE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_ZERO_PESTICIDE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_ECO_LABEL_UE', 'MA_ZERO_PLASTIC_SINGLE_USE', 'equivalent_action', 'obligatoire', 'search_expansion', 'Ajout v4, réduction stricte des plastiques jetables.')
)
INSERT INTO ref_classification_equivalent_action (scheme_id, action_id, relation_type, requirement_type, match_scope, note)
SELECT s.id, a.id, src.relation_type, src.requirement_type, src.match_scope, src.note
FROM src
JOIN ref_classification_scheme s ON s.code = src.classification_code
JOIN ref_sustainability_action a ON a.external_code = src.action_external_code
ON CONFLICT (scheme_id, action_id) DO UPDATE SET
  relation_type = EXCLUDED.relation_type,
  requirement_type = EXCLUDED.requirement_type,
  match_scope = EXCLUDED.match_scope,
  note = EXCLUDED.note,
  updated_at = NOW();

-- Section A-7 part 4: LBL_FLOCON_VERT + LBL_GREEN_DESTINATIONS + LBL_LABEL_BAS_CARBONE + LBL_PAVILLON_BLEU + LBL_QUALITE_TOURISME
WITH src(classification_code, action_external_code, relation_type, requirement_type, match_scope, note) AS (
VALUES
  ('LBL_FLOCON_VERT', 'MA_ACCESSIBLE_TRANSPORT_INFO', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_ACTION_DEADLINES', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_ACTION_OWNERS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_ALT_ROUTE_SIGNAGE', 'equivalent_action', 'obligatoire', 'search_expansion', 'Ajout v4, renforcement de la gestion des flux visiteurs en destination de montagne.'),
  ('LBL_FLOCON_VERT', 'MA_BIKE_PARKING', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_BIKE_REPAIR_KIT', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_BIODIVERSITY_AWARENESS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_CAR_REDUCTION', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_CLIMATE_RISK_MAP', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_COMMUNITY_PROJECTS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_DESTINATION_DASHBOARD', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_ENERGY_ALERT', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_ENERGY_KPI', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_EV_CHARGING', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_FEEDBACK_CHANNEL', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_FLOW_REDIRECTION', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_HABITAT_PROTECTION', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_HEATWAVE_PLAN', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_INTERMODAL_INFO', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_LOCAL_DATA_COLLECTION', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_LOCAL_JOBS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_LOCAL_SPEND_TRACKING', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_MECHANICAL_WEEDING', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_MONTHLY_ENERGY_READING', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_MOUNTAIN_SHUTTLES', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_NATURAL_PRODUCTS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_NATURE_BASED_SOLUTIONS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_OBJECTIVES_DEFINED', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_ONTRIP_BRIEFING', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_PARK_AND_RIDE', 'equivalent_action', 'obligatoire', 'search_expansion', 'Ajout v4, renforcement de la mobilité montagne.'),
  ('LBL_FLOCON_VERT', 'MA_PEAK_INFO', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_PRETRIP_INFO', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_PUBLIC_REPORTING_DEST', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_PUBLIC_TRANSPORT_INFO', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_REFUGE_ZONE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_RESERVATION_SLOTS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_RESPONSIBLE_BEHAVIOUR_TIPS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_RSE_CHARTER', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_RSE_REFERENT', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_RSE_SCOPE_DEFINED', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_STAKEHOLDER_MAP', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_STAKEHOLDER_MEETING', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_VISITOR_COUNTING', 'equivalent_action', 'obligatoire', 'search_expansion', 'Ajout v4, renforcement de la gestion des flux visiteurs en destination de montagne.'),
  ('LBL_FLOCON_VERT', 'MA_WITHOUT_CAR_PAGE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_FLOCON_VERT', 'MA_ZERO_PESTICIDE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_GREEN_DESTINATIONS', 'MA_ACTION_DEADLINES', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_GREEN_DESTINATIONS', 'MA_ACTION_OWNERS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_GREEN_DESTINATIONS', 'MA_ANNUAL_IMPACT_REPORT', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_GREEN_DESTINATIONS', 'MA_BIODIVERSITY_AWARENESS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_GREEN_DESTINATIONS', 'MA_CLIMATE_RISK_MAP', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_GREEN_DESTINATIONS', 'MA_COMMUNITY_PROJECTS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_GREEN_DESTINATIONS', 'MA_CO_DESIGN_OFFERS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_GREEN_DESTINATIONS', 'MA_DATA_QUALITY_CHECK', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_GREEN_DESTINATIONS', 'MA_DESTINATION_DASHBOARD', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_GREEN_DESTINATIONS', 'MA_FAIR_TERMS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_GREEN_DESTINATIONS', 'MA_FEEDBACK_CHANNEL', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_GREEN_DESTINATIONS', 'MA_FLOW_REDIRECTION', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_GREEN_DESTINATIONS', 'MA_HABITAT_PROTECTION', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_GREEN_DESTINATIONS', 'MA_HEATWAVE_PLAN', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_GREEN_DESTINATIONS', 'MA_KPI_DASHBOARD', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_GREEN_DESTINATIONS', 'MA_LOCAL_BENEFIT_TRACKING', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_GREEN_DESTINATIONS', 'MA_LOCAL_CONSULTATION', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_GREEN_DESTINATIONS', 'MA_LOCAL_DATA_COLLECTION', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_GREEN_DESTINATIONS', 'MA_LOCAL_JOBS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_GREEN_DESTINATIONS', 'MA_LOCAL_SPEND_TRACKING', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_GREEN_DESTINATIONS', 'MA_LOCAL_VALUE_SHARE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_GREEN_DESTINATIONS', 'MA_NATURE_BASED_SOLUTIONS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_GREEN_DESTINATIONS', 'MA_OBJECTIVES_DEFINED', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_GREEN_DESTINATIONS', 'MA_PAYMENT_TIMELINESS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_GREEN_DESTINATIONS', 'MA_PEAK_INFO', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_GREEN_DESTINATIONS', 'MA_PUBLIC_REPORTING_DEST', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_GREEN_DESTINATIONS', 'MA_REFUGE_ZONE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_GREEN_DESTINATIONS', 'MA_RESERVATION_SLOTS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_GREEN_DESTINATIONS', 'MA_RSE_CHARTER', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_GREEN_DESTINATIONS', 'MA_RSE_REFERENT', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_GREEN_DESTINATIONS', 'MA_RSE_SCOPE_DEFINED', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_GREEN_DESTINATIONS', 'MA_STAKEHOLDER_MAP', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_GREEN_DESTINATIONS', 'MA_STAKEHOLDER_MEETING', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_LABEL_BAS_CARBONE', 'MA_ANNUAL_IMPACT_REPORT', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_LABEL_BAS_CARBONE', 'MA_DATA_QUALITY_CHECK', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_LABEL_BAS_CARBONE', 'MA_EXECUTIVE_GOVERNANCE', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_LABEL_BAS_CARBONE', 'MA_GHG_ACCOUNTING', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_LABEL_BAS_CARBONE', 'MA_KPI_DASHBOARD', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_LABEL_BAS_CARBONE', 'MA_LOW_CARBON_PROJECTS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_LABEL_BAS_CARBONE', 'MA_PRODUCT_ALIGNMENT', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_LABEL_BAS_CARBONE', 'MA_REDUCTION_TRAJECTORY', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_LABEL_BAS_CARBONE', 'MA_RSE_STRATEGY_DOC', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_PAVILLON_BLEU', 'MA_BATHING_RESULTS_DISPLAY', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_PAVILLON_BLEU', 'MA_BATHING_TESTS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_PAVILLON_BLEU', 'MA_BATTERY_COLLECTION', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_PAVILLON_BLEU', 'MA_BEACH_ASH_TRAYS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Ajout v4, renforcement de la gestion raisonnée du littoral et de la lutte contre les mégots.'),
  ('LBL_PAVILLON_BLEU', 'MA_BEACH_CLEANUP', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_PAVILLON_BLEU', 'MA_BIODIVERSITY_AWARENESS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_PAVILLON_BLEU', 'MA_COASTAL_SORTING', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_PAVILLON_BLEU', 'MA_COMMONS_SIGNAGE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_PAVILLON_BLEU', 'MA_COMMON_BINS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_PAVILLON_BLEU', 'MA_GREASE_TRAP_MAINT', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_PAVILLON_BLEU', 'MA_HABITAT_PROTECTION', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_PAVILLON_BLEU', 'MA_LAMP_COLLECTION', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_PAVILLON_BLEU', 'MA_LITTER_PREVENTION', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_PAVILLON_BLEU', 'MA_MANUAL_BEACH_CLEANING', 'equivalent_action', 'obligatoire', 'search_expansion', 'Ajout v4, renforcement de la gestion raisonnée du littoral et de la lutte contre les mégots.'),
  ('LBL_PAVILLON_BLEU', 'MA_MECHANICAL_WEEDING', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_PAVILLON_BLEU', 'MA_MULTILINGUAL_SIGNAGE', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_PAVILLON_BLEU', 'MA_NATURAL_PRODUCTS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_PAVILLON_BLEU', 'MA_PMR_SIGNAGE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_PAVILLON_BLEU', 'MA_PMR_SLOPE_CHECK', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_PAVILLON_BLEU', 'MA_PMR_SPACES', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_PAVILLON_BLEU', 'MA_POLLUTION_EMERGENCY', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_PAVILLON_BLEU', 'MA_POLLUTION_RESPONSE', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_PAVILLON_BLEU', 'MA_REFUGE_ZONE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_PAVILLON_BLEU', 'MA_ROOM_BINS', 'equivalent_action', 'obligatoire', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_PAVILLON_BLEU', 'MA_ROOM_SIGNAGE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_PAVILLON_BLEU', 'MA_SEWAGE_COMPLIANCE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_PAVILLON_BLEU', 'MA_STEP_REMOVAL', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_PAVILLON_BLEU', 'MA_TACTILE_GUIDANCE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_PAVILLON_BLEU', 'MA_TRACKING_BSD', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_PAVILLON_BLEU', 'MA_WATER_ALERT', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_PAVILLON_BLEU', 'MA_WATER_KPI', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_PAVILLON_BLEU', 'MA_WATER_READING', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_PAVILLON_BLEU', 'MA_WEB_SUST_PAGE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_PAVILLON_BLEU', 'MA_WIDTH_120CM', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_PAVILLON_BLEU', 'MA_ZERO_PESTICIDE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_QUALITE_TOURISME', 'MA_ACTION_DEADLINES', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_QUALITE_TOURISME', 'MA_ACTION_OWNERS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_QUALITE_TOURISME', 'MA_COMPLAINT_LOG', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_QUALITE_TOURISME', 'MA_DURABILITY_PAGE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_QUALITE_TOURISME', 'MA_IMPROVEMENT_ACTIONS', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_QUALITE_TOURISME', 'MA_MONTHLY_REVIEW_FEEDBACK', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_QUALITE_TOURISME', 'MA_OBJECTIVES_DEFINED', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_QUALITE_TOURISME', 'MA_PROOFS_ONLINE', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_QUALITE_TOURISME', 'MA_QR_REVIEW', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_QUALITE_TOURISME', 'MA_SCOPE_EXPLAINED', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_QUALITE_TOURISME', 'MA_SURVEY_DEPLOYED', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.'),
  ('LBL_QUALITE_TOURISME', 'MA_TEAM_FEEDBACK_LOOP', 'equivalent_action', 'recommandé', 'search_expansion', 'Retourner les objets qui portent cette action même sans porter le label.')
)
INSERT INTO ref_classification_equivalent_action (scheme_id, action_id, relation_type, requirement_type, match_scope, note)
SELECT s.id, a.id, src.relation_type, src.requirement_type, src.match_scope, src.note
FROM src
JOIN ref_classification_scheme s ON s.code = src.classification_code
JOIN ref_sustainability_action a ON a.external_code = src.action_external_code
ON CONFLICT (scheme_id, action_id) DO UPDATE SET
  relation_type = EXCLUDED.relation_type,
  requirement_type = EXCLUDED.requirement_type,
  match_scope = EXCLUDED.match_scope,
  note = EXCLUDED.note,
  updated_at = NOW();

-- ============================================================
-- Section B: Accessibilité V5
-- Extrait de seeds_accessibility_v5.sql — label LBL_TOURISME_HANDICAP,
-- famille d'équipements accessibilite, 32 équipements acc_*.
-- ============================================================

-- B-1) Schème de classification officiel accessibilité
WITH src(code, name, description, selection, display_group, is_distinction, name_i18n) AS (
VALUES
  ('LBL_TOURISME_HANDICAP', 'Tourisme & Handicap', 'Label d''État dédié à l''accessibilité touristique, référentiels par filière.', 'single', 'accessibility_labels', TRUE, '{"fr": "Tourisme & Handicap"}'::jsonb)
)
INSERT INTO ref_classification_scheme (code, name, description, selection, display_group, is_distinction, name_i18n)
SELECT code, name, description, selection, display_group, is_distinction, name_i18n
FROM src
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  selection = EXCLUDED.selection,
  display_group = EXCLUDED.display_group,
  is_distinction = EXCLUDED.is_distinction,
  name_i18n = EXCLUDED.name_i18n,
  updated_at = NOW();

-- B-2) Valeur granted pour LBL_TOURISME_HANDICAP
WITH src(scheme_code, code, name, position, name_i18n, metadata) AS (
VALUES
  ('LBL_TOURISME_HANDICAP', 'granted', 'Titulaire Tourisme & Handicap', 1, '{"fr": "Titulaire Tourisme & Handicap"}'::jsonb, '{"kind": "label_status", "label_code": "LBL_TOURISME_HANDICAP"}'::jsonb)
)
INSERT INTO ref_classification_value (scheme_id, code, name, position, name_i18n, metadata)
SELECT s.id, src.code, src.name, src.position, src.name_i18n, src.metadata
FROM src
JOIN ref_classification_scheme s ON s.code = src.scheme_code
ON CONFLICT (scheme_id, code) DO UPDATE SET
  name = EXCLUDED.name,
  position = EXCLUDED.position,
  name_i18n = EXCLUDED.name_i18n,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

-- B-2b) Sous-valeurs de type de handicap pour LBL_TOURISME_HANDICAP (2026-03-22)
-- Contexte : le label T&H est décerné par type de handicap (moteur / auditif / visuel / mental).
-- Ces 4 valeurs sont des enfants de 'granted' via parent_id (FK ref_classification_value.parent_id).
-- Vocabulaire canonique verrouillé : motor | hearing | visual | cognitive
-- Utilisation : object_classification.value_id → 'granted' (top-level inchangé)
--               object_classification.subvalue_ids → ARRAY[uuid_type_concerné, ...]
-- L'API (api.get_filtered_object_ids) ne lit pas encore subvalue_ids — prévu dans un patch API séparé.
WITH src(code, name, position, name_i18n, metadata) AS (
VALUES
  ('granted_motor',
   'Titulaire T&H — moteur',
   10,
   '{"fr": "Titulaire T&H — moteur"}'::jsonb,
   '{"kind": "disability_type_subvalue", "disability_type": "motor", "label_code": "LBL_TOURISME_HANDICAP"}'::jsonb),
  ('granted_hearing',
   'Titulaire T&H — auditif',
   20,
   '{"fr": "Titulaire T&H — auditif"}'::jsonb,
   '{"kind": "disability_type_subvalue", "disability_type": "hearing", "label_code": "LBL_TOURISME_HANDICAP"}'::jsonb),
  ('granted_visual',
   'Titulaire T&H — visuel',
   30,
   '{"fr": "Titulaire T&H — visuel"}'::jsonb,
   '{"kind": "disability_type_subvalue", "disability_type": "visual", "label_code": "LBL_TOURISME_HANDICAP"}'::jsonb),
  ('granted_cognitive',
   'Titulaire T&H — mental',
   40,
   '{"fr": "Titulaire T&H — mental"}'::jsonb,
   '{"kind": "disability_type_subvalue", "disability_type": "cognitive", "label_code": "LBL_TOURISME_HANDICAP"}'::jsonb)
)
INSERT INTO ref_classification_value (scheme_id, code, name, position, name_i18n, metadata, parent_id)
SELECT
  s.id,
  src.code,
  src.name,
  src.position,
  src.name_i18n,
  src.metadata,
  parent.id
FROM src
CROSS JOIN ref_classification_scheme s
JOIN ref_classification_value parent
  ON parent.scheme_id = s.id AND parent.code = 'granted'
WHERE s.code = 'LBL_TOURISME_HANDICAP'
ON CONFLICT (scheme_id, code) DO UPDATE SET
  name       = EXCLUDED.name,
  position   = EXCLUDED.position,
  name_i18n  = EXCLUDED.name_i18n,
  metadata   = EXCLUDED.metadata,
  parent_id  = EXCLUDED.parent_id,
  updated_at = NOW();

-- B-3) Famille amenity accessibility (via ref_code) — code canonique 'accessibility'
-- Note: apostrophes dans les strings SQL doublées ; dans JSONB les apostrophes sont aussi doublées.
INSERT INTO ref_code (domain, code, name, description, position, is_active, metadata, name_i18n, description_i18n)
SELECT 'amenity_family', 'accessibility', 'Accessibilité',
       'Aménagements et aides d''accessibilité physiques ou de service.',
       900, TRUE,
       '{"seed": "v5", "source": "CAT_ACCESS"}'::jsonb,
       '{"fr": "Accessibilité"}'::jsonb,
       '{"fr": "Aménagements et aides d''accessibilité physiques ou de service."}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM ref_code_amenity_family WHERE code = 'accessibility'
);

-- B-4) Équipements accessibilité (33 items V5-mappés + 10 codes canoniques NO-EQUIV = 43 total)
WITH family AS (
  SELECT id FROM ref_code_amenity_family WHERE code = 'accessibility' LIMIT 1
), src(code, name, description, scope, name_i18n, description_i18n, extra) AS (
VALUES
  ('acc_braille_or_audio_docs', 'Documents braille ou audio', 'Version braille ou audio lorsque pertinent.', 'object', '{"fr": "Documents braille ou audio"}'::jsonb, '{"fr": "Version braille ou audio lorsque pertinent."}'::jsonb, '{"source_action_external_code": "MA_BRAILLE_OR_AUDIO", "source_group_code": "SA_ACCESSIBLE_DOCUMENTS", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_falc_docs', 'Documents en FALC', 'Documents en FALC.', 'object', '{"fr": "Documents en FALC"}'::jsonb, '{"fr": "Documents en FALC."}'::jsonb, '{"source_action_external_code": "MA_FALC_DOCS", "source_group_code": "SA_ACCESSIBLE_DOCUMENTS", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_large_print_docs', 'Documents en grands caractères', 'Documents en grands caractères.', 'object', '{"fr": "Documents en grands caractères"}'::jsonb, '{"fr": "Documents en grands caractères."}'::jsonb, '{"source_action_external_code": "MA_LARGE_PRINT_DOCS", "source_group_code": "SA_ACCESSIBLE_DOCUMENTS", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_braille_buttons', 'Boutons braille / relief', 'Boutons en relief ou braille.', 'object', '{"fr": "Boutons braille / relief"}'::jsonb, '{"fr": "Boutons en relief ou braille."}'::jsonb, '{"source_action_external_code": "MA_BRAILLE_BUTTONS", "source_group_code": "SA_ACCESSIBLE_LIFT", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_accessible_lift', 'Ascenseur accessible', 'Dimensions de cabine adaptées.', 'object', '{"fr": "Ascenseur accessible"}'::jsonb, '{"fr": "Dimensions de cabine adaptées."}'::jsonb, '{"source_action_external_code": "MA_LIFT_DIMENSIONS", "source_group_code": "SA_ACCESSIBLE_LIFT", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_visual_audio_announce', 'Annonces visuelles et sonores', 'Annonces visuelles et sonores présentes.', 'object', '{"fr": "Annonces visuelles et sonores"}'::jsonb, '{"fr": "Annonces visuelles et sonores présentes."}'::jsonb, '{"source_action_external_code": "MA_VISUAL_AUDIO_ANNOUNCE", "source_group_code": "SA_ACCESSIBLE_LIFT", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_contrast_menu', 'Menu contrasté', 'Menu contrasté et lisible.', 'object', '{"fr": "Menu contrasté"}'::jsonb, '{"fr": "Menu contrasté et lisible."}'::jsonb, '{"source_action_external_code": "MA_CONTRAST_MENU", "source_group_code": "SA_ACCESSIBLE_MENUS", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_large_print_menu', 'Menu grands caractères', 'Menu en grands caractères.', 'object', '{"fr": "Menu grands caractères"}'::jsonb, '{"fr": "Menu en grands caractères."}'::jsonb, '{"source_action_external_code": "MA_LARGE_PRINT_MENU", "source_group_code": "SA_ACCESSIBLE_MENUS", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_simplified_menu', 'Menu simplifié', 'Version simplifiée disponible.', 'object', '{"fr": "Menu simplifié"}'::jsonb, '{"fr": "Version simplifiée disponible."}'::jsonb, '{"source_action_external_code": "MA_SIMPLIFIED_MENU", "source_group_code": "SA_ACCESSIBLE_MENUS", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_pmr_signage', 'Signalétique parking PMR', 'Signalétique parking adaptée.', 'object', '{"fr": "Signalétique parking PMR"}'::jsonb, '{"fr": "Signalétique parking adaptée."}'::jsonb, '{"source_action_external_code": "MA_PMR_SIGNAGE", "source_group_code": "SA_ACCESSIBLE_PARKING", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_pmr_parking', 'Places PMR', 'Places PMR matérialisées.', 'object', '{"fr": "Places PMR"}'::jsonb, '{"fr": "Places PMR matérialisées."}'::jsonb, '{"source_action_external_code": "MA_PMR_SPACES", "source_group_code": "SA_ACCESSIBLE_PARKING", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_step_removal', 'Accès sans ressaut', 'Ressauts ou obstacles supprimés.', 'object', '{"fr": "Accès sans ressaut"}'::jsonb, '{"fr": "Ressauts ou obstacles supprimés."}'::jsonb, '{"source_action_external_code": "MA_STEP_REMOVAL", "source_group_code": "SA_ACCESSIBLE_PATHWAYS", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_tactile_guidance', 'Guidage tactile', 'Bandes ou guidage tactile installés.', 'object', '{"fr": "Guidage tactile"}'::jsonb, '{"fr": "Bandes ou guidage tactile installés."}'::jsonb, '{"source_action_external_code": "MA_TACTILE_GUIDANCE", "source_group_code": "SA_ACCESSIBLE_PATHWAYS", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_width_120cm', 'Cheminement 1,20 m', 'Largeur minimale respectée.', 'object', '{"fr": "Cheminement 1,20 m"}'::jsonb, '{"fr": "Largeur minimale respectée."}'::jsonb, '{"source_action_external_code": "MA_WIDTH_120CM", "source_group_code": "SA_ACCESSIBLE_PATHWAYS", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_lowered_counter', 'Comptoir abaissé', 'Partie de comptoir abaissée.', 'object', '{"fr": "Comptoir abaissé"}'::jsonb, '{"fr": "Partie de comptoir abaissée."}'::jsonb, '{"source_action_external_code": "MA_LOWERED_COUNTER", "source_group_code": "SA_ACCESSIBLE_RECEPTION", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_adapted_bed_height', 'Lit à hauteur adaptée', 'Lit à hauteur adaptée.', 'object', '{"fr": "Lit à hauteur adaptée"}'::jsonb, '{"fr": "Lit à hauteur adaptée."}'::jsonb, '{"source_action_external_code": "MA_ADAPTED_BED_HEIGHT", "source_group_code": "SA_ACCESSIBLE_ROOMS", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_room_clearance', 'Dégagements suffisants', 'Dégagements suffisants autour du lit.', 'object', '{"fr": "Dégagements suffisants"}'::jsonb, '{"fr": "Dégagements suffisants autour du lit."}'::jsonb, '{"source_action_external_code": "MA_ROOM_CLEARANCE", "source_group_code": "SA_ACCESSIBLE_ROOMS", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_adapted_toilet_height', 'WC à hauteur adaptée', 'Hauteur de WC adaptée.', 'object', '{"fr": "WC à hauteur adaptée"}'::jsonb, '{"fr": "Hauteur de WC adaptée."}'::jsonb, '{"source_action_external_code": "MA_ADAPTED_TOILET_HEIGHT", "source_group_code": "SA_ACCESSIBLE_SANITARY", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_grab_bars', 'Barres d''appui WC', 'Barres d''appui fixes installées.', 'object', '{"fr": "Barres d''appui WC"}'::jsonb, '{"fr": "Barres d''appui fixes installées."}'::jsonb, '{"source_action_external_code": "MA_GRAB_BARS", "source_group_code": "SA_ACCESSIBLE_SANITARY", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_turning_space', 'Espace de manœuvre', 'Espace de manœuvre suffisant.', 'object', '{"fr": "Espace de manœuvre"}'::jsonb, '{"fr": "Espace de manœuvre suffisant."}'::jsonb, '{"source_action_external_code": "MA_TURNING_SPACE", "source_group_code": "SA_ACCESSIBLE_SANITARY", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_grab_bar_shower', 'Barres d''appui douche', 'Barres d''appui en douche installées.', 'object', '{"fr": "Barres d''appui douche"}'::jsonb, '{"fr": "Barres d''appui en douche installées."}'::jsonb, '{"source_action_external_code": "MA_GRAB_BAR_SHOWER", "source_group_code": "SA_ACCESSIBLE_SHOWER", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_shower_seat', 'Siège de douche', 'Siège de douche stable disponible.', 'object', '{"fr": "Siège de douche"}'::jsonb, '{"fr": "Siège de douche stable disponible."}'::jsonb, '{"source_action_external_code": "MA_SHOWER_SEAT", "source_group_code": "SA_ACCESSIBLE_SHOWER", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_walk_in_shower', 'Douche plain-pied', 'Douche de plain-pied installée.', 'object', '{"fr": "Douche plain-pied"}'::jsonb, '{"fr": "Douche de plain-pied installée."}'::jsonb, '{"source_action_external_code": "MA_WALK_IN_SHOWER", "source_group_code": "SA_ACCESSIBLE_SHOWER", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_contrast_signage', 'Signalétique contrastée', 'Contrastes visuels respectés.', 'object', '{"fr": "Signalétique contrastée"}'::jsonb, '{"fr": "Contrastes visuels respectés."}'::jsonb, '{"source_action_external_code": "MA_CONTRAST_SIGNAGE", "source_group_code": "SA_ACCESSIBLE_SIGNAGE", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_pictograms_used', 'Pictogrammes accessibles', 'Pictogrammes cohérents utilisés.', 'object', '{"fr": "Pictogrammes accessibles"}'::jsonb, '{"fr": "Pictogrammes cohérents utilisés."}'::jsonb, '{"source_action_external_code": "MA_PICTOGRAMS_USED", "source_group_code": "SA_ACCESSIBLE_SIGNAGE", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_readable_height', 'Signalétique à bonne hauteur', 'Hauteur et lisibilité adaptées.', 'object', '{"fr": "Signalétique à bonne hauteur"}'::jsonb, '{"fr": "Hauteur et lisibilité adaptées."}'::jsonb, '{"source_action_external_code": "MA_READABLE_HEIGHT", "source_group_code": "SA_ACCESSIBLE_SIGNAGE", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_hearing_signage', 'Signalétique aide auditive', 'Signalisation du dispositif.', 'object', '{"fr": "Signalétique aide auditive"}'::jsonb, '{"fr": "Signalisation du dispositif."}'::jsonb, '{"source_action_external_code": "MA_HEARING_SIGNAGE", "source_group_code": "SA_HEARING_ASSISTANCE", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_magnetic_loop', 'Boucle magnétique', 'Boucle à induction installée.', 'object', '{"fr": "Boucle magnétique"}'::jsonb, '{"fr": "Boucle à induction installée."}'::jsonb, '{"source_action_external_code": "MA_MAGNETIC_LOOP", "source_group_code": "SA_HEARING_ASSISTANCE", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_flash_alarms', 'Alarmes flash', 'Alarmes lumineuses disponibles.', 'object', '{"fr": "Alarmes flash"}'::jsonb, '{"fr": "Alarmes lumineuses disponibles."}'::jsonb, '{"source_action_external_code": "MA_FLASH_ALARMS", "source_group_code": "SA_MULTISENSORY_SAFETY", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_vibrating_alarms', 'Alarmes vibrantes', 'Dispositifs vibrants disponibles.', 'object', '{"fr": "Alarmes vibrantes"}'::jsonb, '{"fr": "Dispositifs vibrants disponibles."}'::jsonb, '{"source_action_external_code": "MA_VIBRATING_ALARMS", "source_group_code": "SA_MULTISENSORY_SAFETY", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_audio_description', 'Audiodescription', 'Audiodescription proposée.', 'object', '{"fr": "Audiodescription"}'::jsonb, '{"fr": "Audiodescription proposée."}'::jsonb, '{"source_action_external_code": "MA_AUDIO_DESCRIPTION", "source_group_code": "SA_SUBTITLE_AUDIO_DESC", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_subtitles', 'Sous-titrage', 'Sous-titrage des contenus.', 'object', '{"fr": "Sous-titrage"}'::jsonb, '{"fr": "Sous-titrage des contenus."}'::jsonb, '{"source_action_external_code": "MA_SUBTITLES", "source_group_code": "SA_SUBTITLE_AUDIO_DESC", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_visit_device', 'Aide de visite accessible', 'Dispositifs d''aide de visite disponibles.', 'object', '{"fr": "Aide de visite accessible"}'::jsonb, '{"fr": "Dispositifs d''aide de visite disponibles."}'::jsonb, '{"source_action_external_code": "MA_VISIT_DEVICE", "source_group_code": "SA_SUBTITLE_AUDIO_DESC", "accessibility_seed_v": "v5"}'::jsonb),
  -- 10 new canonical acc_* codes added 2026-03-22: replace legacy non-acc_* codes that had no V5 equivalent.
  ('acc_braille_signage', 'Signalétique braille', 'Panneaux et indications permanents en braille sur la signalétique directionnelle.', 'object', '{"fr": "Signalétique braille"}'::jsonb, '{"fr": "Panneaux et indications permanents en braille sur la signalétique directionnelle."}'::jsonb, '{"accessibility_seed_v": "v5"}'::jsonb),
  ('acc_guide_dog_welcome', 'Chien guide accepté', 'Chiens guides et chiens d''assistance explicitement acceptés dans l''établissement.', 'object', '{"fr": "Chien guide accepté"}'::jsonb, '{"fr": "Chiens guides et chiens d''assistance explicitement acceptés dans l''établissement."}'::jsonb, '{"accessibility_seed_v": "v5"}'::jsonb),
  ('acc_sign_language', 'Personnel LSF', 'Au moins un membre du personnel formé à la langue des signes française (LSF).', 'object', '{"fr": "Personnel LSF"}'::jsonb, '{"fr": "Au moins un membre du personnel formé à la langue des signes française (LSF)."}'::jsonb, '{"accessibility_seed_v": "v5"}'::jsonb),
  ('acc_written_communication', 'Communication écrite disponible', 'Échange écrit proposé comme alternative à la communication verbale.', 'object', '{"fr": "Communication écrite disponible"}'::jsonb, '{"fr": "Échange écrit proposé comme alternative à la communication verbale."}'::jsonb, '{"accessibility_seed_v": "v5"}'::jsonb),
  ('acc_quiet_space', 'Espace calme dédié', 'Zone calme et peu bruyante accessible aux visiteurs, distincte des espaces communs.', 'object', '{"fr": "Espace calme dédié"}'::jsonb, '{"fr": "Zone calme et peu bruyante accessible aux visiteurs, distincte des espaces communs."}'::jsonb, '{"accessibility_seed_v": "v5"}'::jsonb),
  ('acc_sensory_room', 'Salle sensorielle', 'Salle dédiée à la régulation sensorielle, à destination des visiteurs neurodivergents.', 'object', '{"fr": "Salle sensorielle"}'::jsonb, '{"fr": "Salle dédiée à la régulation sensorielle, à destination des visiteurs neurodivergents."}'::jsonb, '{"accessibility_seed_v": "v5"}'::jsonb),
  ('acc_staff_cognitive_training', 'Personnel formé — handicap cognitif', 'Personnel formé spécifiquement à l''accompagnement des personnes en situation de handicap cognitif ou d''apprentissage.', 'object', '{"fr": "Personnel formé — handicap cognitif"}'::jsonb, '{"fr": "Personnel formé spécifiquement à l''accompagnement des personnes en situation de handicap cognitif ou d''apprentissage."}'::jsonb, '{"accessibility_seed_v": "v5"}'::jsonb),
  ('acc_staff_mental_training', 'Personnel formé — santé mentale', 'Personnel formé à l''accueil des visiteurs en situation de handicap psychique ou de fragilité psychiatrique.', 'object', '{"fr": "Personnel formé — santé mentale"}'::jsonb, '{"fr": "Personnel formé à l''accueil des visiteurs en situation de handicap psychique ou de fragilité psychiatrique."}'::jsonb, '{"accessibility_seed_v": "v5"}'::jsonb),
  ('acc_flexible_visit', 'Visite flexible', 'Horaires, rythme ou parcours adaptables sur demande (pauses, durée réduite, étapes).', 'object', '{"fr": "Visite flexible"}'::jsonb, '{"fr": "Horaires, rythme ou parcours adaptables sur demande (pauses, durée réduite, étapes)."}'::jsonb, '{"accessibility_seed_v": "v5"}'::jsonb),
  ('acc_low_stimulation', 'Option basse stimulation', 'Créneau ou zone à stimulation réduite (bruit, affluence, lumière) disponible pour les visiteurs sensoriellement sensibles.', 'object', '{"fr": "Option basse stimulation"}'::jsonb, '{"fr": "Créneau ou zone à stimulation réduite (bruit, affluence, lumière) disponible pour les visiteurs sensoriellement sensibles."}'::jsonb, '{"accessibility_seed_v": "v5"}'::jsonb)
)
INSERT INTO ref_amenity (code, name, family_id, scope, description, name_i18n, description_i18n, extra)
SELECT src.code, src.name, family.id, src.scope, src.description, src.name_i18n, src.description_i18n, src.extra
FROM src
CROSS JOIN family
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  family_id = EXCLUDED.family_id,
  scope = EXCLUDED.scope,
  description = EXCLUDED.description,
  name_i18n = EXCLUDED.name_i18n,
  description_i18n = EXCLUDED.description_i18n,
  extra = EXCLUDED.extra,
  updated_at = NOW();

-- B-4b) Typage par catégorie de handicap pour les 43 équipements acc_* (2026-03-22)
-- Ajoute la clé 'disability_types' dans ref_amenity.extra pour chaque code acc_*.
-- Vocabulaire canonique verrouillé : motor | hearing | visual | cognitive
-- (miroir des 4 types T&H : moteur / auditif / visuel / mental)
-- Idempotent : merge JSONB (||) — ne supprime pas les clés extra existantes.
-- Ne touche pas les équipements sans préfixe acc_*.
WITH dt(code, disability_types) AS (
VALUES
  -- SA_ACCESSIBLE_DOCUMENTS
  ('acc_braille_or_audio_docs', '["visual"]'::jsonb),
  ('acc_falc_docs',             '["cognitive"]'::jsonb),
  ('acc_large_print_docs',      '["visual"]'::jsonb),
  -- SA_ACCESSIBLE_LIFT
  ('acc_braille_buttons',       '["visual"]'::jsonb),
  ('acc_accessible_lift',       '["motor"]'::jsonb),
  ('acc_visual_audio_announce', '["hearing", "visual"]'::jsonb),
  -- SA_ACCESSIBLE_MENUS
  ('acc_contrast_menu',         '["visual"]'::jsonb),
  ('acc_large_print_menu',      '["visual"]'::jsonb),
  ('acc_simplified_menu',       '["cognitive"]'::jsonb),
  -- SA_ACCESSIBLE_PARKING
  ('acc_pmr_signage',           '["motor"]'::jsonb),
  ('acc_pmr_parking',           '["motor"]'::jsonb),
  -- SA_ACCESSIBLE_PATHWAYS
  ('acc_step_removal',          '["motor"]'::jsonb),
  ('acc_tactile_guidance',      '["visual"]'::jsonb),
  ('acc_width_120cm',           '["motor"]'::jsonb),
  -- SA_ACCESSIBLE_RECEPTION
  ('acc_lowered_counter',       '["motor"]'::jsonb),
  -- SA_ACCESSIBLE_ROOMS
  ('acc_adapted_bed_height',    '["motor"]'::jsonb),
  ('acc_room_clearance',        '["motor"]'::jsonb),
  -- SA_ACCESSIBLE_SANITARY
  ('acc_adapted_toilet_height', '["motor"]'::jsonb),
  ('acc_grab_bars',             '["motor"]'::jsonb),
  ('acc_turning_space',         '["motor"]'::jsonb),
  -- SA_ACCESSIBLE_SHOWER
  ('acc_grab_bar_shower',       '["motor"]'::jsonb),
  ('acc_shower_seat',           '["motor"]'::jsonb),
  ('acc_walk_in_shower',        '["motor"]'::jsonb),
  -- SA_ACCESSIBLE_SIGNAGE
  ('acc_contrast_signage',      '["visual"]'::jsonb),
  ('acc_pictograms_used',       '["cognitive"]'::jsonb),
  ('acc_readable_height',       '["motor", "visual"]'::jsonb),
  -- SA_HEARING_ASSISTANCE
  ('acc_hearing_signage',       '["hearing"]'::jsonb),
  ('acc_magnetic_loop',         '["hearing"]'::jsonb),
  -- SA_MULTISENSORY_SAFETY
  ('acc_flash_alarms',          '["hearing"]'::jsonb),
  ('acc_vibrating_alarms',      '["hearing"]'::jsonb),
  -- SA_SUBTITLE_AUDIO_DESC
  ('acc_audio_description',     '["visual"]'::jsonb),
  ('acc_subtitles',             '["hearing"]'::jsonb),
  ('acc_visit_device',          '["visual", "hearing"]'::jsonb),
  -- NO-EQUIV codes added 2026-03-22
  ('acc_braille_signage',          '["visual"]'::jsonb),
  ('acc_guide_dog_welcome',        '["visual", "motor"]'::jsonb),
  ('acc_sign_language',            '["hearing"]'::jsonb),
  ('acc_written_communication',    '["hearing"]'::jsonb),
  ('acc_quiet_space',              '["cognitive"]'::jsonb),
  ('acc_sensory_room',             '["cognitive"]'::jsonb),
  ('acc_staff_cognitive_training', '["cognitive"]'::jsonb),
  ('acc_staff_mental_training',    '["cognitive"]'::jsonb),
  ('acc_flexible_visit',           '["cognitive", "motor"]'::jsonb),
  ('acc_low_stimulation',          '["cognitive"]'::jsonb)
)
UPDATE ref_amenity ra
SET
  extra      = COALESCE(ra.extra, '{}'::jsonb) || jsonb_build_object('disability_types', dt.disability_types),
  updated_at = NOW()
FROM dt
WHERE ra.code = dt.code
  AND ra.code LIKE 'acc_%';

-- Validation : tous les 43 codes acc_* doivent porter la clé disability_types.
DO $$
DECLARE
  v_missing INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_missing
  FROM ref_amenity
  WHERE code LIKE 'acc_%'
    AND NOT (extra ? 'disability_types');
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'disability_types tagging incomplet : % ligne(s) acc_* sans la clé disability_types', v_missing;
  END IF;
END;
$$;

-- ============================================================
-- Migration: consolidate 'accessibilite' → 'accessibility' (2026-03-22)
-- For DB instances where 'accessibilite' was already loaded: re-points any
-- ref_amenity rows to the canonical 'accessibility' family, then removes the
-- retired 'accessibilite' entry. Safe to re-run on a fresh DB (no-op).
-- ============================================================
DO $$
BEGIN
  -- Step 1: re-point any amenities still referencing the retired 'accessibilite' family
  UPDATE ref_amenity
  SET family_id = (
    SELECT id FROM ref_code_amenity_family WHERE code = 'accessibility'
  )
  WHERE family_id IN (
    SELECT id FROM ref_code_amenity_family WHERE code = 'accessibilite'
  );

  -- Step 2: delete the now-orphaned 'accessibilite' family (guard prevents deletion if children remain)
  DELETE FROM ref_code_amenity_family
  WHERE code = 'accessibilite'
    AND NOT EXISTS (
      SELECT 1 FROM ref_amenity ra
      WHERE ra.family_id = (
        SELECT id FROM ref_code_amenity_family WHERE code = 'accessibilite'
      )
    );

  -- Validation: exactly one accessibility-concept family must remain, with code 'accessibility'
  IF (SELECT COUNT(*) FROM ref_code_amenity_family
      WHERE code IN ('accessibility', 'accessibilite')) <> 1 THEN
    RAISE EXCEPTION 'amenity family consolidation failed: unexpected count after migration';
  END IF;
END;
$$;

-- ============================================================
-- End of V5 Sustainability + Accessibility seeds
-- ============================================================

-- ============================================================
-- Phase 0 — Seeds ref_org_role (access_control_master_plan.md §2.2)
-- Pré-requis bloquant : sans ces seeds, object_org_link est inutilisable.
-- Ajout 2026-03-23 — requis avant toute Phase 1 du modèle d'accès.
-- ============================================================
INSERT INTO ref_org_role (code, name, description, position) VALUES
-- publisher : ORG source canonique de l'objet. Écriture directe sur la donnée canonique.
('publisher', 'Publisher principal', 'ORG publisher principale — source canonique, écriture directe sur la donnée de l''objet', 10),
-- contributor : ORG enrichisseuse. Ne modifie que sa propre couche d''enrichissement.
('contributor', 'ORG contributrice', 'ORG contributrice — enrichissement propre uniquement, pas d''accès à la donnée canonique', 20),
-- reader : ORG lectrice. Accès en lecture uniquement, via lien explicite object_org_link.
('reader', 'ORG lectrice', 'ORG lectrice — accès en lecture via lien explicite seulement', 30)
ON CONFLICT (code) DO NOTHING;
-- ============================================================
-- End of Phase 0 — ref_org_role seeds
-- ============================================================

-- ============================================================
-- Phase 1 — Seeds ref_org_business_role (D1 verrouillée — 2026-03-23)
-- Rôles métier ORG. Orthogonaux au scope et aux permissions.
-- Ne confèrent aucun droit implicite.
-- ============================================================
INSERT INTO ref_org_business_role (code, name, description, position) VALUES
-- viewer : consultation uniquement, sans création ni modification
('viewer',      'Lecteur',      'Consultation uniquement dans le périmètre accessible à l''ORG et au user', 10),
-- contributor : saisie et enrichissement, sans rôle de validation éditoriale
('contributor', 'Contributeur', 'Saisie, enrichissement, mise à jour dans le périmètre autorisé. Sans validation éditoriale.', 20),
-- editor : contrôle qualité, correction, validation éditoriale
('editor',      'Éditeur',      'Contrôle qualité, correction, validation éditoriale dans le périmètre autorisé', 30)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- Phase 1 — Seeds ref_org_admin_role (D2 verrouillée — 2026-03-23)
-- Rôles admin ORG. Rang obligatoire pour les règles d'anti auto-élévation.
-- Aucun de ces rôles ne bypasse api.user_has_permission().
-- ============================================================
INSERT INTO ref_org_admin_role (code, name, description, rank) VALUES
-- team_lead (rang 10) : premier niveau de délégation, gestion des membres non-admin
('team_lead',   'Référent équipe',     'Premier niveau de délégation administrative dans l''ORG', 10),
-- org_manager (rang 20) : administration opérationnelle — peut gérer les team_lead
('org_manager', 'Gestionnaire ORG',    'Administration opérationnelle de l''ORG — peut gérer les membres de rang inférieur', 20),
-- org_admin (rang 30) : niveau le plus élevé dans l''ORG, sans dépasser le super_admin plateforme
('org_admin',   'Administrateur ORG',  'Niveau administratif le plus élevé dans l''ORG, sans dépasser le super_admin plateforme', 30)
ON CONFLICT (code) DO NOTHING;
-- ============================================================
-- End of Phase 1 — ref_org_business_role + ref_org_admin_role seeds
-- ============================================================

-- ============================================================
-- Phase 4 — Seeds ref_permission (Niveau 2, V1 verrouillée — 2026-03-23)
-- Grille complète des permissions d'action (access_control_master_plan.md §2.3).
-- Orthogonales aux rôles : aucune permission n'est conférée implicitement (§2.6 du plan).
-- Toute attribution passe par org_permission ou user_permission via les RPC dédiées.
-- ============================================================
INSERT INTO ref_permission (code, name, category, description) VALUES

  -- -------------------------------------------------------
  -- Catégorie : content — actions sur le contenu des objets
  -- -------------------------------------------------------

  -- Création d'un objet dans le périmètre de l'ORG
  ('create_object',
   'Créer un objet',
   'content',
   'Permet de créer un nouvel objet tourisme dans le périmètre de l''ORG'),

  -- Modification de la donnée canonique — réservée à l'ORG publisher principal
  ('edit_canonical_when_publisher',
   'Modifier le canonique (ORG publisher)',
   'content',
   'Permet de modifier la donnée canonique d''un objet dont l''ORG est publisher principal via object_org_link'),

  -- Modification de la couche d'enrichissement propre à l'ORG (non canonique)
  ('edit_org_enrichment',
   'Modifier l''enrichissement ORG',
   'content',
   'Permet de modifier la couche d''enrichissement propre à l''ORG, sans toucher aux données canoniques'),

  -- Publication / dépublication d'un objet
  ('publish_object',
   'Publier / dépublier un objet',
   'content',
   'Permet de passer un objet au statut published ou de le dépublier'),

  -- Validation des modifications soumises (workflow de validation éditoriale)
  ('validate_changes',
   'Valider des modifications en attente',
   'content',
   'Permet de valider ou rejeter des modifications soumises par un contributeur dans le workflow éditorial'),

  -- Modification des horaires d'ouverture
  ('edit_hours',
   'Modifier les horaires',
   'content',
   'Permet de modifier les plages horaires et calendriers d''ouverture d''un objet'),

  -- Modification de la grille tarifaire
  ('edit_pricing',
   'Modifier les tarifs',
   'content',
   'Permet de modifier la grille tarifaire et les conditions de prix d''un objet'),

  -- -------------------------------------------------------
  -- Catégorie : crm — actions sur les données de relation client
  -- -------------------------------------------------------

  -- Rédaction de notes CRM
  ('write_crm_notes',
   'Écrire des notes CRM',
   'crm',
   'Permet de rédiger et modifier des notes CRM associées à un objet'),

  -- -------------------------------------------------------
  -- Catégorie : team — actions sur la communication d'équipe
  -- -------------------------------------------------------

  -- Gestion des messages d'équipe liés aux objets
  ('manage_team_messages',
   'Gérer les messages d''équipe',
   'team',
   'Permet d''envoyer et gérer les messages d''équipe liés à un objet'),

  -- -------------------------------------------------------
  -- Catégorie : media — actions sur les documents et médias
  -- -------------------------------------------------------

  -- Attachement de documents
  ('attach_documents',
   'Attacher des documents',
   'media',
   'Permet d''attacher des fichiers et documents à un objet'),

  -- Gestion de la galerie photos
  ('edit_gallery',
   'Modifier la galerie',
   'media',
   'Permet d''ajouter, modifier ou supprimer des photos dans la galerie d''un objet')

ON CONFLICT (code) DO NOTHING;
-- ============================================================
-- End of Phase 4 — ref_permission seeds
-- ============================================================
