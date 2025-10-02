-- =====================================================
-- DONNÉES DE SEED RÉALISTES - SUPABASE
-- =====================================================
-- Données d'exemple pour tester le schéma unifié
-- Inclut des cas limites et des données ambigües

-- =====================================================
-- 1. SEED DES TABLES DE RÉFÉRENCE - TOURISME COMPLET
-- =====================================================

-- Langues (déjà peuplées dans migration_plan.sql)
-- Ajout de langues supplémentaires pour le tourisme international
INSERT INTO ref_language (code, name, native_name) VALUES
('rcf', 'Créole réunionnais', 'Kréol réyoné'),
('hi', 'Hindi', 'हिन्दी'),
('ta', 'Tamoul', 'தமிழ்'),
('zh', 'Chinois', '中文'),
('ja', 'Japonais', '日本語'),
('ko', 'Coréen', '한국어'),
('ar', 'Arabe', 'العربية'),
('pt', 'Portugais', 'Português'),
('ru', 'Russe', 'Русский'),
('it', 'Italien', 'Italiano'),
('es', 'Espagnol', 'Español'),
('de', 'Allemand', 'Deutsch'),
('nl', 'Néerlandais', 'Nederlands'),
('sv', 'Suédois', 'Svenska'),
('no', 'Norvégien', 'Norsk'),
('da', 'Danois', 'Dansk'),
('fi', 'Finnois', 'Suomi'),
('pl', 'Polonais', 'Polski'),
('cs', 'Tchèque', 'Čeština'),
('hu', 'Hongrois', 'Magyar'),
('tr', 'Turc', 'Türkçe'),
('he', 'Hébreu', 'עברית'),
('th', 'Thaï', 'ไทย'),
('vi', 'Vietnamien', 'Tiếng Việt'),
('id', 'Indonésien', 'Bahasa Indonesia'),
('ms', 'Malais', 'Bahasa Melayu'),
('tl', 'Tagalog', 'Tagalog'),
('sw', 'Swahili', 'Kiswahili'),
('af', 'Afrikaans', 'Afrikaans'),
('is', 'Islandais', 'Íslenska'),
('mt', 'Maltais', 'Malti'),
('cy', 'Gallois', 'Cymraeg'),
('ga', 'Irlandais', 'Gaeilge'),
('eu', 'Basque', 'Euskera'),
('ca', 'Catalan', 'Català'),
('gl', 'Galicien', 'Galego')
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- CANAUX DE CONTACT - TOURISME COMPLET
-- =====================================================
INSERT INTO ref_code (domain, code, name, description, position) VALUES
 ('contact_kind','phone','Téléphone','Numéro de téléphone fixe',1),
 ('contact_kind','mobile','Mobile','Numéro de téléphone mobile',2),
 ('contact_kind','email','Email','Adresse électronique',3),
 ('contact_kind','website','Site web','Site web officiel',4),
 ('contact_kind','whatsapp','WhatsApp','Numéro WhatsApp',5),
 ('contact_kind','telegram','Telegram','Compte Telegram',6),
 ('contact_kind','facebook','Facebook','Page Facebook',7),
 ('contact_kind','instagram','Instagram','Compte Instagram',8),
 ('contact_kind','twitter','Twitter','Compte Twitter/X',9),
 ('contact_kind','linkedin','LinkedIn','Page LinkedIn',10),
 ('contact_kind','youtube','YouTube','Chaîne YouTube',11),
 ('contact_kind','tiktok','TikTok','Compte TikTok',12),
 ('contact_kind','snapchat','Snapchat','Compte Snapchat',13),
 ('contact_kind','pinterest','Pinterest','Compte Pinterest',14),
 ('contact_kind','tripadvisor','TripAdvisor','Page TripAdvisor',15),
 ('contact_kind','booking','Booking.com','Page Booking.com',16),
 ('contact_kind','airbnb','Airbnb','Page Airbnb',17),
 ('contact_kind','expedia','Expedia','Page Expedia',18),
 ('contact_kind','google_business','Google Business','Profil Google Business',19),
 ('contact_kind','fax','Fax','Numéro de fax',20),
 ('contact_kind','skype','Skype','Compte Skype',21),
 ('contact_kind','zoom','Zoom','Salle de réunion Zoom',22),
 ('contact_kind','teams','Microsoft Teams','Salle Teams',23),
 ('contact_kind','viber','Viber','Numéro Viber',24),
 ('contact_kind','wechat','WeChat','Compte WeChat',25),
 ('contact_kind','line','LINE','Compte LINE',26),
 ('contact_kind','kakao','KakaoTalk','Compte KakaoTalk',27),
 ('contact_kind','telegram_bot','Bot Telegram','Bot Telegram',28),
 ('contact_kind','chat_widget','Chat en ligne','Widget de chat sur site',29),
 ('contact_kind','contact_form','Formulaire de contact','Formulaire de contact en ligne',30)
ON CONFLICT DO NOTHING;

-- =====================================================
-- JOURS DE SEMAINE ET PÉRIODES
-- =====================================================
INSERT INTO ref_code (domain, code, name, position) VALUES
 ('weekday','monday','Lundi',1),
 ('weekday','tuesday','Mardi',2),
 ('weekday','wednesday','Mercredi',3),
 ('weekday','thursday','Jeudi',4),
 ('weekday','friday','Vendredi',5),
 ('weekday','saturday','Samedi',6),
 ('weekday','sunday','Dimanche',7)
ON CONFLICT DO NOTHING;

-- Périodes de l'année
INSERT INTO ref_code (domain, code, name, description, position) VALUES
 ('season','spring','Printemps','Saison printanière (mars-mai)',1),
 ('season','summer','Été','Saison estivale (juin-août)',2),
 ('season','autumn','Automne','Saison automnale (septembre-novembre)',3),
 ('season','winter','Hiver','Saison hivernale (décembre-février)',4),
 ('season','high','Haute saison','Période de forte affluence touristique',5),
 ('season','low','Basse saison','Période de faible affluence touristique',6),
 ('season','shoulder','Moyenne saison','Période intermédiaire',7),
 ('season','peak','Période de pointe','Période de très forte affluence',8),
 ('season','off_peak','Période creuse','Période de très faible affluence',9),
 ('season','holiday','Saison des vacances','Période des vacances scolaires',10),
 ('season','festival','Saison des festivals','Période des événements culturels',11),
 ('season','business','Saison d''affaires','Période des voyages d''affaires',12),
 ('season','wedding','Saison des mariages','Période des mariages et événements',13),
 ('season','christmas','Saison de Noël','Période des fêtes de fin d''année',14),
 ('season','easter','Saison de Pâques','Période de Pâques',15)
ON CONFLICT DO NOTHING;

-- =====================================================
-- TYPES DE PLANNING D'OUVERTURE
-- =====================================================
INSERT INTO ref_code (domain, code, name, description, position) VALUES
 ('opening_schedule_type','regular','Régulier','Horaires réguliers fixes',1),
 ('opening_schedule_type','seasonal','Saisonnier','Horaires variables selon la saison',2),
 ('opening_schedule_type','event','Événementiel','Horaires pour événements spéciaux',3),
 ('opening_schedule_type','flexible','Flexible','Horaires adaptables',4),
 ('opening_schedule_type','24_7','24h/24','Ouvert en continu',5),
 ('opening_schedule_type','appointment','Sur rendez-vous','Ouvert uniquement sur rendez-vous',6),
 ('opening_schedule_type','emergency','Urgence','Ouvert en cas d''urgence',7),
 ('opening_schedule_type','weekend','Week-end','Ouvert uniquement le week-end',8),
 ('opening_schedule_type','holiday','Vacances','Horaires spéciaux pendant les vacances',9),
 ('opening_schedule_type','summer','Été','Horaires d''été',10),
 ('opening_schedule_type','winter','Hiver','Horaires d''hiver',11)
ON CONFLICT DO NOTHING;

-- =====================================================
-- TYPES DE MÉDIA ET CONTENU
-- =====================================================
INSERT INTO ref_code (domain, code, name, description, position) VALUES
 ('media_type','photo','Photo','Image photographique',1),
 ('media_type','video','Vidéo','Contenu vidéo',2),
 ('media_type','audio','Audio','Contenu audio',3),
 ('media_type','document','Document','Document PDF ou autre',4),
 ('media_type','presentation','Présentation','Présentation PowerPoint/Keynote',5),
 ('media_type','brochure','Brochure','Brochure touristique',6),
 ('media_type','map','Carte','Carte géographique',7),
 ('media_type','panorama','Panorama','Vue panoramique 360°',8),
 ('media_type','virtual_tour','Visite virtuelle','Visite virtuelle interactive',9),
 ('media_type','live_stream','Diffusion en direct','Diffusion en temps réel',10),
 ('media_type','podcast','Podcast','Émission audio',11),
 ('media_type','webinar','Webinaire','Séminaire en ligne',12),
 ('media_type','infographic','Infographie','Graphique informatif',13),
 ('media_type','animation','Animation','Contenu animé',14),
 ('media_type','interactive','Interactif','Contenu interactif',15),
 ('media_type','ar','Réalité augmentée','Contenu en réalité augmentée',16),
 ('media_type','vr','Réalité virtuelle','Contenu en réalité virtuelle',17),
 ('media_type','drone','Vue aérienne','Vidéo/photo prise par drone',18),
 ('media_type','underwater','Sous-marin','Contenu sous-marin',19),
 ('media_type','timelapse','Time-lapse','Vidéo en accéléré',20)
ON CONFLICT DO NOTHING;

-- =====================================================
-- TYPES D'HÉBERGEMENT - STANDARDS TOURISTIQUES
-- =====================================================
INSERT INTO ref_code (domain, code, name, description, position) VALUES
 ('accommodation_type','hotel','Hôtel','Établissement hôtelier classique',1),
 ('accommodation_type','boutique_hotel','Hôtel boutique','Petit hôtel de charme',2),
 ('accommodation_type','resort','Résort','Complexe hôtelier avec activités',3),
 ('accommodation_type','eco_hotel','Écohôtel','Hôtel respectueux de l''environnement',4),
 ('accommodation_type','luxury_hotel','Hôtel de luxe','Hôtel haut de gamme',5),
 ('accommodation_type','business_hotel','Hôtel d''affaires','Hôtel orienté voyageurs d''affaires',6),
 ('accommodation_type','budget_hotel','Hôtel économique','Hôtel à petit budget',7),
 ('accommodation_type','hostel','Auberge de jeunesse','Hébergement partagé économique',8),
 ('accommodation_type','guesthouse','Chambre d''hôte','Hébergement chez l''habitant',9),
 ('accommodation_type','bed_breakfast','Bed & Breakfast','Chambre avec petit-déjeuner',10),
 ('accommodation_type','gite','Gîte','Hébergement rural',11),
 ('accommodation_type','chalet','Chalet','Maison de montagne',12),
 ('accommodation_type','villa','Villa','Maison de vacances',13),
 ('accommodation_type','apartment','Appartement','Logement indépendant',14),
 ('accommodation_type','studio','Studio','Petit logement',15),
 ('accommodation_type','condo','Condominium','Appartement en copropriété',16),
 ('accommodation_type','camping','Camping','Hébergement en tente/camping-car',17),
 ('accommodation_type','glamping','Glamping','Camping de luxe',18),
 ('accommodation_type','campsite','Emplacement de camping','Place pour tente/camping-car',19),
 ('accommodation_type','caravan_park','Parc de caravanes','Espace pour caravanes',20),
 ('accommodation_type','rv_park','Parc pour camping-cars','Espace pour camping-cars',21),
 ('accommodation_type','lodge','Lodge','Hébergement rustique',22),
 ('accommodation_type','cabin','Cabine','Petite maison en bois',23),
 ('accommodation_type','treehouse','Cabane dans les arbres','Hébergement dans les arbres',24),
 ('accommodation_type','cave_hotel','Hôtel troglodyte','Hébergement dans une grotte',25),
 ('accommodation_type','ice_hotel','Hôtel de glace','Hébergement en glace',26),
 ('accommodation_type','boat_hotel','Hôtel flottant','Hébergement sur l''eau',27),
 ('accommodation_type','train_hotel','Hôtel-train','Hébergement dans un train',28),
 ('accommodation_type','castle','Château','Hébergement dans un château',29),
 ('accommodation_type','monastery','Monastère','Hébergement monastique',30),
 ('accommodation_type','farm_stay','Séjour à la ferme','Hébergement agricole',31),
 ('accommodation_type','homestay','Chez l''habitant','Hébergement familial',32),
 ('accommodation_type','couchsurfing','Couchsurfing','Hébergement gratuit',33),
 ('accommodation_type','youth_hostel','Auberge de jeunesse','Hébergement jeune',34),
 ('accommodation_type','backpacker','Auberge de routards','Hébergement routard',35),
 ('accommodation_type','capsule_hotel','Hôtel capsule','Hébergement en capsule',36),
 ('accommodation_type','love_hotel','Hôtel de passe','Hébergement à la journée',37),
 ('accommodation_type','ryokan','Ryokan','Auberge japonaise traditionnelle',38),
 ('accommodation_type','pension','Pension','Petit hôtel familial',39),
 ('accommodation_type','inn','Auberge','Petit hôtel rural',40),
 ('accommodation_type','tavern','Taverne','Auberge avec restaurant',41),
 ('accommodation_type','mansion','Manoir','Grande maison de maître',42),
 ('accommodation_type','palace','Palace','Hôtel de très grand luxe',43),
 ('accommodation_type','suite_hotel','Hôtel suites','Hôtel avec suites uniquement',44),
 ('accommodation_type','extended_stay','Séjour prolongé','Hébergement longue durée',45),
 ('accommodation_type','timeshare','Résidence de tourisme','Propriété partagée',46),
 ('accommodation_type','vacation_rental','Location de vacances','Location saisonnière',47),
 ('accommodation_type','serviced_apartment','Appartement meublé','Appartement avec services',48),
 ('accommodation_type','student_housing','Logement étudiant','Hébergement pour étudiants',49),
 ('accommodation_type','senior_housing','Résidence senior','Hébergement pour seniors',50)
ON CONFLICT DO NOTHING;

-- =====================================================
-- TYPES DE TOURISME ET SÉGMENTS
-- =====================================================
INSERT INTO ref_code (domain, code, name, description, position) VALUES
 ('tourism_type','cultural','Tourisme culturel','Découverte du patrimoine culturel',1),
 ('tourism_type','business','Tourisme d''affaires','Voyages professionnels',2),
 ('tourism_type','leisure','Tourisme de loisirs','Voyages de détente',3),
 ('tourism_type','adventure','Tourisme d''aventure','Activités sportives et extrêmes',4),
 ('tourism_type','eco','Écotourisme','Tourisme respectueux de l''environnement',5),
 ('tourism_type','sustainable','Tourisme durable','Tourisme responsable',6),
 ('tourism_type','rural','Tourisme rural','Découverte de la campagne',7),
 ('tourism_type','urban','Tourisme urbain','Découverte des villes',8),
 ('tourism_type','coastal','Tourisme balnéaire','Tourisme de bord de mer',9),
 ('tourism_type','mountain','Tourisme de montagne','Activités en montagne',10),
 ('tourism_type','gastronomy','Tourisme gastronomique','Découverte culinaire',11),
 ('tourism_type','wellness','Tourisme de bien-être','Spa et relaxation',12),
 ('tourism_type','medical','Tourisme médical','Soins de santé',13),
 ('tourism_type','sports','Tourisme sportif','Activités sportives',14),
 ('tourism_type','religious','Tourisme religieux','Pèlerinages et lieux saints',15),
 ('tourism_type','educational','Tourisme éducatif','Voyages d''étude',16),
 ('tourism_type','volunteer','Volontourisme','Voyages solidaires',17),
 ('tourism_type','luxury','Tourisme de luxe','Voyages haut de gamme',18),
 ('tourism_type','budget','Tourisme économique','Voyages à petit budget',19),
 ('tourism_type','family','Tourisme familial','Voyages en famille',20),
 ('tourism_type','senior','Tourisme senior','Voyages pour seniors',21),
 ('tourism_type','youth','Tourisme jeune','Voyages pour jeunes',22),
 ('tourism_type','accessible','Tourisme accessible','Voyages pour personnes handicapées',23),
 ('tourism_type','lgbt','Tourisme LGBT','Voyages pour la communauté LGBT',24),
 ('tourism_type','solo','Tourisme solo','Voyages en solo',25),
 ('tourism_type','group','Tourisme de groupe','Voyages organisés',26),
 ('tourism_type','honeymoon','Lune de miel','Voyages de noces',27),
 ('tourism_type','anniversary','Anniversaire','Célébrations',28),
 ('tourism_type','retirement','Retraite','Voyages de retraite',29),
 ('tourism_type','gap_year','Année sabbatique','Voyages longue durée',30),
 ('tourism_type','backpacking','Routard','Voyages sac à dos',31),
 ('tourism_type','cruise','Croisière','Voyages en bateau',32),
 ('tourism_type','rail','Voyage en train','Tourisme ferroviaire',33),
 ('tourism_type','road_trip','Road trip','Voyage en voiture',34),
 ('tourism_type','cycling','Cyclotourisme','Voyages à vélo',35),
 ('tourism_type','hiking','Randonnée','Marche et trekking',36),
 ('tourism_type','photography','Photographie','Voyages photo',37),
 ('tourism_type','art','Art','Découverte artistique',38),
 ('tourism_type','music','Musique','Festivals et concerts',39),
 ('tourism_type','film','Cinéma','Tourisme cinématographique',40),
 ('tourism_type','literature','Littérature','Voyages littéraires',41),
 ('tourism_type','history','Histoire','Découverte historique',42),
 ('tourism_type','archaeology','Archéologie','Sites archéologiques',43),
 ('tourism_type','nature','Nature','Observation de la nature',44),
 ('tourism_type','wildlife','Faune','Observation des animaux',45),
 ('tourism_type','birdwatching','Ornithologie','Observation des oiseaux',46),
 ('tourism_type','astronomy','Astronomie','Observation du ciel',47),
 ('tourism_type','geology','Géologie','Formations géologiques',48),
 ('tourism_type','botany','Botanique','Découverte des plantes',49),
 ('tourism_type','marine','Marin','Activités marines',50)
ON CONFLICT DO NOTHING;

-- =====================================================
-- FAMILLES D'ÉQUIPEMENTS ET SERVICES
-- =====================================================
INSERT INTO ref_code (domain, code, name, description, position) VALUES
 ('amenity_family','comforts','Conforts','Équipements de confort',1),
 ('amenity_family','services','Services','Services proposés',2),
 ('amenity_family','equipment','Équipements','Équipements techniques',3),
 ('amenity_family','safety','Sécurité','Équipements de sécurité',4),
 ('amenity_family','accessibility','Accessibilité','Équipements d''accessibilité',5),
 ('amenity_family','entertainment','Divertissement','Équipements de loisirs',6),
 ('amenity_family','wellness','Bien-être','Équipements de bien-être',7),
 ('amenity_family','business','Affaires','Équipements professionnels',8),
 ('amenity_family','transport','Transport','Services de transport',9),
 ('amenity_family','food','Restauration','Services alimentaires',10),
 ('amenity_family','technology','Technologie','Équipements technologiques',11),
 ('amenity_family','outdoor','Extérieur','Équipements extérieurs',12),
 ('amenity_family','sports','Sport','Équipements sportifs',13),
 ('amenity_family','children','Enfants','Équipements pour enfants',14),
 ('amenity_family','pets','Animaux','Équipements pour animaux',15)
ON CONFLICT DO NOTHING;

-- =====================================================
-- ÉQUIPEMENTS ET SERVICES DÉTAILLÉS
-- =====================================================
INSERT INTO ref_code (domain, code, name, description, position) VALUES
-- Conforts
 ('amenity','air_conditioning','Climatisation','Air conditionné',1),
 ('amenity','heating','Chauffage','Système de chauffage',2),
 ('amenity','wifi','Wi-Fi','Accès Internet sans fil',3),
 ('amenity','tv','Télévision','Télévision dans les chambres',4),
 ('amenity','minibar','Minibar','Réfrigérateur avec boissons',5),
 ('amenity','safe','Coffre-fort','Coffre-fort sécurisé',6),
 ('amenity','balcony','Balcon','Balcon privé',7),
 ('amenity','terrace','Terrasse','Terrasse privée',8),
 ('amenity','garden','Jardin','Jardin privé',9),
 ('amenity','fireplace','Cheminée','Cheminée',10),
 ('amenity','jacuzzi','Jacuzzi','Bain à remous',11),
 ('amenity','sauna','Sauna','Sauna privé',12),
 ('amenity','steam_room','Hammam','Salle de vapeur',13),
 ('amenity','massage','Massage','Service de massage',14),
 ('amenity','room_service','Service en chambre','Service en chambre 24h/24',15),
 ('amenity','housekeeping','Ménage','Service de ménage quotidien',16),
 ('amenity','laundry','Blanchisserie','Service de blanchisserie',17),
 ('amenity','dry_cleaning','Pressing','Service de pressing',18),
 ('amenity','iron','Fer à repasser','Fer à repasser',19),
 ('amenity','hairdryer','Sèche-cheveux','Sèche-cheveux',20),
 ('amenity','bathrobe','Peignoir','Peignoir de bain',21),
 ('amenity','slippers','Pantoufles','Pantoufles',22),
 ('amenity','toiletries','Articles de toilette','Articles de toilette gratuits',23),
 ('amenity','towel','Serviettes','Serviettes de bain',24),
 ('amenity','linen','Linge de lit','Linge de lit de qualité',25),
 ('amenity','pillow','Oreillers','Oreillers confortables',26),
 ('amenity','blanket','Couvertures','Couvertures supplémentaires',27),
 ('amenity','blackout_curtains','Rideaux occultants','Rideaux occultants',28),
 ('amenity','soundproofing','Insonorisation','Chambre insonorisée',29),
 ('amenity','air_purifier','Purificateur d''air','Purificateur d''air',30),
 ('amenity','humidifier','Humidificateur','Humidificateur',31),
 ('amenity','fan','Ventilateur','Ventilateur',32),
 ('amenity','desk','Bureau','Bureau de travail',33),
 ('amenity','chair','Chaise','Chaise confortable',34),
 ('amenity','lamp','Lampe','Éclairage d''appoint',35),
 ('amenity','mirror','Miroir','Miroir',36),
 ('amenity','wardrobe','Penderie','Penderie spacieuse',37),
 ('amenity','drawers','Tiroirs','Tiroirs de rangement',38),
 ('amenity','shelves','Étagères','Étagères',39),
 ('amenity','hangers','Cintres','Cintres',40),
 ('amenity','luggage_rack','Porte-bagages','Porte-bagages',41),
 ('amenity','umbrella','Parapluie','Parapluie',42),
 ('amenity','newspaper','Journal','Journal quotidien',43),
 ('amenity','magazine','Magazines','Magazines',44),
 ('amenity','books','Livres','Livres',45),
 ('amenity','games','Jeux','Jeux de société',46),
 ('amenity','puzzle','Puzzle','Puzzle',47),
 ('amenity','cards','Cartes','Jeu de cartes',48),
 ('amenity','candles','Bougies','Bougies',49),
 ('amenity','flowers','Fleurs','Fleurs fraîches',50),

-- Services
 ('amenity','concierge','Conciergerie','Service de conciergerie',51),
 ('amenity','reception','Réception','Réception 24h/24',52),
 ('amenity','check_in','Enregistrement','Enregistrement express',53),
 ('amenity','check_out','Départ','Départ express',54),
 ('amenity','luggage_storage','Consigne','Consigne à bagages',55),
 ('amenity','valet_parking','Voiturier','Service de voiturier',56),
 ('amenity','shuttle','Navette','Service de navette',57),
 ('amenity','airport_transfer','Transfert aéroport','Transfert aéroport',58),
 ('amenity','taxi','Taxi','Service de taxi',59),
 ('amenity','car_rental','Location de voiture','Location de voiture',60),
 ('amenity','bike_rental','Location de vélo','Location de vélo',61),
 ('amenity','scooter_rental','Location de scooter','Location de scooter',62),
 ('amenity','tour_booking','Réservation d''excursions','Réservation d''excursions',63),
 ('amenity','ticket_booking','Réservation de billets','Réservation de billets',64),
 ('amenity','restaurant_booking','Réservation de restaurant','Réservation de restaurant',65),
 ('amenity','spa_booking','Réservation de spa','Réservation de spa',66),
 ('amenity','golf_booking','Réservation de golf','Réservation de golf',67),
 ('amenity','tennis_booking','Réservation de tennis','Réservation de tennis',68),
 ('amenity','fitness_booking','Réservation de fitness','Réservation de fitness',69),
 ('amenity','beauty_booking','Réservation de beauté','Réservation de beauté',70),
 ('amenity','medical_service','Service médical','Service médical',71),
 ('amenity','pharmacy','Pharmacie','Pharmacie',72),
 ('amenity','doctor','Médecin','Médecin',73),
 ('amenity','dentist','Dentiste','Dentiste',74),
 ('amenity','veterinarian','Vétérinaire','Vétérinaire',75),
 ('amenity','bank','Banque','Service bancaire',76),
 ('amenity','atm','Distributeur','Distributeur automatique',77),
 ('amenity','currency_exchange','Change','Service de change',78),
 ('amenity','post_office','Poste','Service postal',79),
 ('amenity','internet_cafe','Cybercafé','Cybercafé',80),
 ('amenity','business_center','Centre d''affaires','Centre d''affaires',81),
 ('amenity','meeting_room','Salle de réunion','Salle de réunion',82),
 ('amenity','conference_room','Salle de conférence','Salle de conférence',83),
 ('amenity','boardroom','Salle de conseil','Salle de conseil',84),
 ('amenity','auditorium','Auditorium','Auditorium',85),
 ('amenity','exhibition_space','Espace d''exposition','Espace d''exposition',86),
 ('amenity','wedding_venue','Lieu de mariage','Lieu de mariage',87),
 ('amenity','event_planning','Organisation d''événements','Organisation d''événements',88),
 ('amenity','catering','Traiteur','Service de traiteur',89),
 ('amenity','florist','Fleuriste','Service de fleuriste',90),
 ('amenity','photographer','Photographe','Service de photographe',91),
 ('amenity','videographer','Vidéaste','Service de vidéaste',92),
 ('amenity','musician','Musicien','Service de musicien',93),
 ('amenity','dj','DJ','Service de DJ',94),
 ('amenity','entertainer','Animateur','Service d''animateur',95),
 ('amenity','translator','Traducteur','Service de traduction',96),
 ('amenity','guide','Guide','Service de guide',97),
 ('amenity','driver','Chauffeur','Service de chauffeur',98),
 ('amenity','security','Sécurité','Service de sécurité',99),
 ('amenity','babysitting','Garde d''enfants','Service de garde d''enfants',100),

-- Équipements
 ('amenity','pool','Piscine','Piscine',101),
 ('amenity','hot_tub','Bain à remous','Bain à remous',102),
 ('amenity','gym','Salle de sport','Salle de sport',103),
 ('amenity','tennis_court','Court de tennis','Court de tennis',104),
 ('amenity','golf_course','Golf','Parcours de golf',105),
 ('amenity','spa','Spa','Centre de spa',106),
 ('amenity','massage_room','Salle de massage','Salle de massage',107),
 ('amenity','beauty_salon','Salon de beauté','Salon de beauté',108),
 ('amenity','barber','Barbier','Service de barbier',109),
 ('amenity','hairdresser','Coiffeur','Service de coiffeur',110),
 ('amenity','nail_salon','Institut de beauté','Institut de beauté',111),
 ('amenity','restaurant','Restaurant','Restaurant',112),
 ('amenity','bar','Bar','Bar',113),
 ('amenity','cafe','Café','Café',114),
 ('amenity','lounge','Salon','Salon',115),
 ('amenity','library','Bibliothèque','Bibliothèque',116),
 ('amenity','game_room','Salle de jeux','Salle de jeux',117),
 ('amenity','cinema','Cinéma','Cinéma',118),
 ('amenity','theater','Théâtre','Théâtre',119),
 ('amenity','casino','Casino','Casino',120),
 ('amenity','nightclub','Boîte de nuit','Boîte de nuit',121),
 ('amenity','karaoke','Karaoké','Karaoké',122),
 ('amenity','bowling','Bowling','Bowling',123),
 ('amenity','billiards','Billard','Billard',124),
 ('amenity','ping_pong','Ping-pong','Ping-pong',125),
 ('amenity','foosball','Baby-foot','Baby-foot',126),
 ('amenity','arcade','Salle d''arcade','Salle d''arcade',127),
 ('amenity','playground','Aire de jeux','Aire de jeux pour enfants',128),
 ('amenity','kids_club','Club enfants','Club enfants',129),
 ('amenity','nursery','Crèche','Crèche',130),
 ('amenity','teen_club','Club ados','Club adolescents',131),
 ('amenity','adult_club','Club adultes','Club adultes',132),
 ('amenity','beach','Plage','Plage privée',133),
 ('amenity','beach_chairs','Chaises de plage','Chaises de plage',134),
 ('amenity','beach_umbrella','Parasol','Parasol',135),
 ('amenity','beach_towels','Serviettes de plage','Serviettes de plage',136),
 ('amenity','snorkeling_gear','Équipement de snorkeling','Équipement de snorkeling',137),
 ('amenity','diving_gear','Équipement de plongée','Équipement de plongée',138),
 ('amenity','surfboard','Planche de surf','Planche de surf',139),
 ('amenity','kayak','Kayak','Kayak',140),
 ('amenity','paddleboard','Paddle','Paddle',141),
 ('amenity','sailing_boat','Voilier','Voilier',142),
 ('amenity','motorboat','Bateau à moteur','Bateau à moteur',143),
 ('amenity','fishing_gear','Équipement de pêche','Équipement de pêche',144),
 ('amenity','barbecue','Barbecue','Barbecue',145),
 ('amenity','outdoor_dining','Repas en plein air','Repas en plein air',146),
 ('amenity','garden','Jardin','Jardin',147),
 ('amenity','rooftop','Toit-terrasse','Toit-terrasse',148),
 ('amenity','patio','Patio','Patio',149),
 ('amenity','balcony','Balcon','Balcon',150),
 ('amenity','terrace','Terrasse','Terrasse',151),
 ('amenity','courtyard','Cour','Cour intérieure',152),
 ('amenity','fountain','Fontaine','Fontaine',153),
 ('amenity','pond','Étang','Étang',154),
 ('amenity','waterfall','Cascade','Cascade',155),
 ('amenity','gazebo','Pavillon','Pavillon',156),
 ('amenity','pergola','Pergola','Pergola',157),
 ('amenity','fire_pit','Foyer','Foyer',158),
 ('amenity','outdoor_heating','Chauffage extérieur','Chauffage extérieur',159),
 ('amenity','outdoor_cooling','Refroidissement extérieur','Refroidissement extérieur',160),
 ('amenity','outdoor_lighting','Éclairage extérieur','Éclairage extérieur',161),
 ('amenity','outdoor_speakers','Haut-parleurs extérieurs','Haut-parleurs extérieurs',162),
 ('amenity','outdoor_tv','Télévision extérieure','Télévision extérieure',163),
 ('amenity','outdoor_wifi','Wi-Fi extérieur','Wi-Fi extérieur',164),
 ('amenity','outdoor_power','Prise électrique extérieure','Prise électrique extérieure',165),
 ('amenity','outdoor_water','Point d''eau extérieur','Point d''eau extérieur',166),
 ('amenity','outdoor_shower','Douche extérieure','Douche extérieure',167),
 ('amenity','outdoor_toilet','Toilettes extérieures','Toilettes extérieures',168),
 ('amenity','outdoor_storage','Rangement extérieur','Rangement extérieur',169),
 ('amenity','outdoor_workspace','Espace de travail extérieur','Espace de travail extérieur',170),
 ('amenity','outdoor_meeting','Salle de réunion extérieure','Salle de réunion extérieure',171),
 ('amenity','outdoor_dining','Repas extérieur','Repas extérieur',172),
 ('amenity','outdoor_bar','Bar extérieur','Bar extérieur',173),
 ('amenity','outdoor_kitchen','Cuisine extérieure','Cuisine extérieure',174),
 ('amenity','outdoor_refrigerator','Réfrigérateur extérieur','Réfrigérateur extérieur',175),
 ('amenity','outdoor_ice_maker','Machine à glace extérieure','Machine à glace extérieure',176),
 ('amenity','outdoor_grill','Grill extérieur','Grill extérieur',177),
 ('amenity','outdoor_pizza_oven','Four à pizza extérieur','Four à pizza extérieur',178),
 ('amenity','outdoor_smoker','Fumoir extérieur','Fumoir extérieur',179),
 ('amenity','outdoor_wok','Wok extérieur','Wok extérieur',180),
 ('amenity','outdoor_fireplace','Cheminée extérieure','Cheminée extérieure',181),
 ('amenity','outdoor_chimney','Cheminée extérieure','Cheminée extérieure',182),
 ('amenity','outdoor_heater','Chauffage extérieur','Chauffage extérieur',183),
 ('amenity','outdoor_fan','Ventilateur extérieur','Ventilateur extérieur',184),
 ('amenity','outdoor_misting','Système de brumisation','Système de brumisation',185),
 ('amenity','outdoor_shade','Ombrage extérieur','Ombrage extérieur',186),
 ('amenity','outdoor_awning','Auvent extérieur','Auvent extérieur',187),
 ('amenity','outdoor_canopy','Canopée extérieure','Canopée extérieure',188),
 ('amenity','outdoor_tent','Tente extérieure','Tente extérieure',189),
 ('amenity','outdoor_marquee','Chapiteau extérieur','Chapiteau extérieur',190),
 ('amenity','outdoor_stage','Scène extérieure','Scène extérieure',191),
 ('amenity','outdoor_dance_floor','Piste de danse extérieure','Piste de danse extérieure',192),
 ('amenity','outdoor_seating','Sièges extérieurs','Sièges extérieurs',193),
 ('amenity','outdoor_tables','Tables extérieures','Tables extérieures',194),
 ('amenity','outdoor_chairs','Chaises extérieures','Chaises extérieures',195),
 ('amenity','outdoor_benches','Bancs extérieurs','Bancs extérieurs',196),
 ('amenity','outdoor_sofas','Canapés extérieurs','Canapés extérieurs',197),
 ('amenity','outdoor_loungers','Transats extérieurs','Transats extérieurs',198),
 ('amenity','outdoor_hammocks','Hamacs extérieurs','Hamacs extérieurs',199),
 ('amenity','outdoor_swings','Balancelles extérieures','Balancelles extérieures',200)
ON CONFLICT DO NOTHING;

-- =====================================================
-- MOYENS DE PAIEMENT - TOURISME MODERNE
-- =====================================================
INSERT INTO ref_code (domain, code, name, description, position) VALUES
-- Cartes de crédit traditionnelles
('payment_method','visa','Visa','Carte Visa',1),
('payment_method','mastercard','Mastercard','Carte Mastercard',2),
('payment_method','american_express','American Express','Carte American Express',3),
('payment_method','discover','Discover','Carte Discover',4),
('payment_method','diners_club','Diners Club','Carte Diners Club',5),
('payment_method','jcb','JCB','Carte JCB',6),
('payment_method','unionpay','UnionPay','Carte UnionPay',7),
('payment_method','carte_bleue','Carte Bleue','Carte Bleue française',8),
('payment_method','maestro','Maestro','Carte Maestro',9),
('payment_method','electron','Visa Electron','Carte Visa Electron',10),

-- Cartes de débit
('payment_method','debit_card','Carte de débit','Carte de débit',11),
('payment_method','atm_card','Carte ATM','Carte de retrait',12),
('payment_method','prepaid_card','Carte prépayée','Carte prépayée',13),
('payment_method','gift_card','Carte cadeau','Carte cadeau',14),
('payment_method','travel_card','Carte de voyage','Carte de voyage',15),

-- Paiements numériques
('payment_method','paypal','PayPal','PayPal',16),
('payment_method','apple_pay','Apple Pay','Apple Pay',17),
('payment_method','google_pay','Google Pay','Google Pay',18),
('payment_method','samsung_pay','Samsung Pay','Samsung Pay',19),
('payment_method','alipay','Alipay','Alipay',20),
('payment_method','wechat_pay','WeChat Pay','WeChat Pay',21),
('payment_method','line_pay','LINE Pay','LINE Pay',22),
('payment_method','kakao_pay','KakaoPay','KakaoPay',23),
('payment_method','paytm','Paytm','Paytm',24),
('payment_method','phonepe','PhonePe','PhonePe',25),
('payment_method','gpay','GPay','GPay',26),
('payment_method','amazon_pay','Amazon Pay','Amazon Pay',27),
('payment_method','stripe','Stripe','Stripe',28),
('payment_method','square','Square','Square',29),
('payment_method','klarna','Klarna','Klarna',30),
('payment_method','afterpay','Afterpay','Afterpay',31),
('payment_method','sezzle','Sezzle','Sezzle',32),
('payment_method','affirm','Affirm','Affirm',33),

-- Cryptomonnaies
('payment_method','bitcoin','Bitcoin','Bitcoin',34),
('payment_method','ethereum','Ethereum','Ethereum',35),
('payment_method','litecoin','Litecoin','Litecoin',36),
('payment_method','ripple','Ripple','Ripple',37),
('payment_method','dogecoin','Dogecoin','Dogecoin',38),
('payment_method','binance_coin','Binance Coin','Binance Coin',39),
('payment_method','cardano','Cardano','Cardano',40),
('payment_method','polkadot','Polkadot','Polkadot',41),
('payment_method','solana','Solana','Solana',42),
('payment_method','avalanche','Avalanche','Avalanche',43),

-- Paiements traditionnels
('payment_method','cash','Espèces','Paiement en espèces',44),
('payment_method','cheque','Chèque','Chèque',45),
('payment_method','bank_transfer','Virement bancaire','Virement bancaire',46),
('payment_method','wire_transfer','Virement international','Virement international',47),
('payment_method','sepa','SEPA','Virement SEPA',48),
('payment_method','swift','SWIFT','Virement SWIFT',49),
('payment_method','ach','ACH','Virement ACH',50),
('payment_method','bacs','BACS','Virement BACS',51),
('payment_method','faster_payments','Faster Payments','Faster Payments',52),

-- Paiements spécialisés tourisme
('payment_method','cheque_vacances','Chèques vacances','Chèques vacances ANCV',53),
('payment_method','holiday_voucher','Bon de vacances','Bon de vacances',54),
('payment_method','travel_voucher','Bon de voyage','Bon de voyage',55),
('payment_method','gift_voucher','Bon cadeau','Bon cadeau',56),
('payment_method','loyalty_points','Points de fidélité','Points de fidélité',57),
('payment_method','miles','Miles','Miles aériens',58),
('payment_method','rewards','Récompenses','Récompenses',59),
('payment_method','cashback','Cashback','Cashback',60),
('payment_method','store_credit','Crédit magasin','Crédit magasin',61),

-- Paiements par pays/région
('payment_method','ideal','iDEAL','iDEAL (Pays-Bas)',62),
('payment_method','sofort','Sofort','Sofort (Allemagne)',63),
('payment_method','giropay','Giropay','Giropay (Allemagne)',64),
('payment_method','eps','EPS','EPS (Autriche)',65),
('payment_method','bancontact','Bancontact','Bancontact (Belgique)',66),
('payment_method','multibanco','Multibanco','Multibanco (Portugal)',67),
('payment_method','p24','Przelewy24','Przelewy24 (Pologne)',68),
('payment_method','trustly','Trustly','Trustly (Suède)',69),
('payment_method','swish','Swish','Swish (Suède)',70),
('payment_method','vipps','Vipps','Vipps (Norvège)',71),
('payment_method','mobilepay','MobilePay','MobilePay (Danemark)',72),
('payment_method','klarna','Klarna','Klarna (Suède)',73),
('payment_method','sepa_instant','SEPA Instant','SEPA Instant',74),
('payment_method','fps','Faster Payment Service','Faster Payment Service (UK)',75),
('payment_method','bpay','BPAY','BPAY (Australie)',76),
('payment_method','eftpos','EFTPOS','EFTPOS (Australie)',77),
('payment_method','interac','Interac','Interac (Canada)',78),
('payment_method','pix','PIX','PIX (Brésil)',79),
('payment_method','boleto','Boleto','Boleto (Brésil)',80),
('payment_method','oxxo','OXXO','OXXO (Mexique)',81),
('payment_method','spei','SPEI','SPEI (Mexique)',82),
('payment_method','upi','UPI','UPI (Inde)',83),
('payment_method','netbanking','Net Banking','Net Banking (Inde)',84),
('payment_method','wallet','Portefeuille électronique','Portefeuille électronique',85),

-- Paiements d'entreprise
('payment_method','corporate_card','Carte d''entreprise','Carte d''entreprise',86),
('payment_method','purchase_order','Bon de commande','Bon de commande',87),
('payment_method','invoice','Facture','Paiement sur facture',88),
('payment_method','net_30','Net 30','Paiement net 30 jours',89),
('payment_method','net_60','Net 60','Paiement net 60 jours',90),
('payment_method','net_90','Net 90','Paiement net 90 jours',91),
('payment_method','letter_of_credit','Lettre de crédit','Lettre de crédit',92),
('payment_method','bank_guarantee','Garantie bancaire','Garantie bancaire',93),
('payment_method','performance_bond','Caution de performance','Caution de performance',94),
('payment_method','bid_bond','Caution de soumission','Caution de soumission',95),

-- Paiements alternatifs
('payment_method','barter','Troc','Échange de services',96),
('payment_method','trade','Échange commercial','Échange commercial',97),
('payment_method','installments','Paiement échelonné','Paiement échelonné',98),
('payment_method','layaway','Acompte','Acompte',99),
('payment_method','deposit','Dépôt de garantie','Dépôt de garantie',100)
ON CONFLICT DO NOTHING;

-- =====================================================
-- DEVISES MONÉTAIRES
-- =====================================================
INSERT INTO ref_code (domain, code, name, description, position) VALUES
('currency','EUR','Euro','Euro (€)',1),
('currency','USD','Dollar américain','Dollar américain ($)',2),
('currency','GBP','Livre sterling','Livre sterling (£)',3),
('currency','JPY','Yen japonais','Yen japonais (¥)',4),
('currency','CHF','Franc suisse','Franc suisse (CHF)',5),
('currency','CAD','Dollar canadien','Dollar canadien (C$)',6),
('currency','AUD','Dollar australien','Dollar australien (A$)',7),
('currency','NZD','Dollar néo-zélandais','Dollar néo-zélandais (NZ$)',8),
('currency','SEK','Couronne suédoise','Couronne suédoise (kr)',9),
('currency','NOK','Couronne norvégienne','Couronne norvégienne (kr)',10),
('currency','DKK','Couronne danoise','Couronne danoise (kr)',11),
('currency','ISK','Couronne islandaise','Couronne islandaise (kr)',12),
('currency','PLN','Zloty polonais','Zloty polonais (zł)',13),
('currency','CZK','Couronne tchèque','Couronne tchèque (Kč)',14),
('currency','HUF','Forint hongrois','Forint hongrois (Ft)',15),
('currency','RON','Leu roumain','Leu roumain (lei)',16),
('currency','BGN','Lev bulgare','Lev bulgare (лв)',17),
('currency','HRK','Kuna croate','Kuna croate (kn)',18),
('currency','RSD','Dinar serbe','Dinar serbe (дин)',19),
('currency','MKD','Denar macédonien','Denar macédonien (ден)',20),
('currency','BAM','Mark convertible','Mark convertible (КМ)',21),
('currency','ALL','Lek albanais','Lek albanais (L)',22),
('currency','MNT','Tugrik mongol','Tugrik mongol (₮)',23),
('currency','RUB','Rouble russe','Rouble russe (₽)',24),
('currency','UAH','Hryvnia ukrainienne','Hryvnia ukrainienne (₴)',25),
('currency','BYN','Rouble biélorusse','Rouble biélorusse (Br)',26),
('currency','KZT','Tenge kazakh','Tenge kazakh (₸)',27),
('currency','UZS','Som ouzbek','Som ouzbek (сўм)',28),
('currency','KGS','Som kirghiz','Som kirghiz (с)',29),
('currency','TJS','Somoni tadjik','Somoni tadjik (SM)',30),
('currency','TMT','Manat turkmène','Manat turkmène (T)',31),
('currency','AZN','Manat azerbaïdjanais','Manat azerbaïdjanais (₼)',32),
('currency','GEL','Lari géorgien','Lari géorgien (₾)',33),
('currency','AMD','Dram arménien','Dram arménien (֏)',34),
('currency','TRY','Livre turque','Livre turque (₺)',35),
('currency','ILS','Shekel israélien','Shekel israélien (₪)',36),
('currency','JOD','Dinar jordanien','Dinar jordanien (د.ا)',37),
('currency','LBP','Livre libanaise','Livre libanaise (ل.ل)',38),
('currency','SYP','Livre syrienne','Livre syrienne (ل.س)',39),
('currency','IQD','Dinar irakien','Dinar irakien (د.ع)',40),
('currency','KWD','Dinar koweïtien','Dinar koweïtien (د.ك)',41),
('currency','BHD','Dinar bahreïni','Dinar bahreïni (د.ب)',42),
('currency','QAR','Riyal qatari','Riyal qatari (ر.ق)',43),
('currency','AED','Dirham émirati','Dirham émirati (د.إ)',44),
('currency','OMR','Rial omanais','Rial omanais (ر.ع)',45),
('currency','YER','Rial yéménite','Rial yéménite (ر.ي)',46),
('currency','SAR','Riyal saoudien','Riyal saoudien (ر.س)',47),
('currency','IRR','Rial iranien','Rial iranien (﷼)',48),
('currency','AFN','Afghani afghan','Afghani afghan (؋)',49),
('currency','PKR','Roupie pakistanaise','Roupie pakistanaise (₨)',50),
('currency','INR','Roupie indienne','Roupie indienne (₹)',51),
('currency','BDT','Taka bangladais','Taka bangladais (৳)',52),
('currency','LKR','Roupie srilankaise','Roupie srilankaise (₨)',53),
('currency','NPR','Roupie népalaise','Roupie népalaise (₨)',54),
('currency','MVR','Rufiyaa maldivienne','Rufiyaa maldivienne (ރ)',55),
('currency','BTN','Ngultrum bhoutanais','Ngultrum bhoutanais (Nu)',56),
('currency','MMK','Kyat birman','Kyat birman (K)',57),
('currency','THB','Baht thaïlandais','Baht thaïlandais (฿)',58),
('currency','LAK','Kip laotien','Kip laotien (₭)',59),
('currency','KHR','Riel cambodgien','Riel cambodgien (៛)',60),
('currency','VND','Dong vietnamien','Dong vietnamien (₫)',61),
('currency','IDR','Rupiah indonésienne','Rupiah indonésienne (Rp)',62),
('currency','MYR','Ringgit malaisien','Ringgit malaisien (RM)',63),
('currency','SGD','Dollar singapourien','Dollar singapourien (S$)',64),
('currency','BND','Dollar brunéien','Dollar brunéien (B$)',65),
('currency','PHP','Peso philippin','Peso philippin (₱)',66),
('currency','TWD','Dollar taïwanais','Dollar taïwanais (NT$)',67),
('currency','HKD','Dollar de Hong Kong','Dollar de Hong Kong (HK$)',68),
('currency','MOP','Pataca macanaise','Pataca macanaise (MOP$)',69),
('currency','CNY','Yuan chinois','Yuan chinois (¥)',70),
('currency','KRW','Won sud-coréen','Won sud-coréen (₩)',71),
('currency','MNT','Tugrik mongol','Tugrik mongol (₮)',72),
('currency','KZT','Tenge kazakh','Tenge kazakh (₸)',73),
('currency','UZS','Som ouzbek','Som ouzbek (сўм)',74),
('currency','KGS','Som kirghiz','Som kirghiz (с)',75),
('currency','TJS','Somoni tadjik','Somoni tadjik (SM)',76),
('currency','TMT','Manat turkmène','Manat turkmène (T)',77),
('currency','AZN','Manat azerbaïdjanais','Manat azerbaïdjanais (₼)',78),
('currency','GEL','Lari géorgien','Lari géorgien (₾)',79),
('currency','AMD','Dram arménien','Dram arménien (֏)',80),
('currency','TRY','Livre turque','Livre turque (₺)',81),
('currency','ILS','Shekel israélien','Shekel israélien (₪)',82),
('currency','JOD','Dinar jordanien','Dinar jordanien (د.ا)',83),
('currency','LBP','Livre libanaise','Livre libanaise (ل.ل)',84),
('currency','SYP','Livre syrienne','Livre syrienne (ل.س)',85),
('currency','IQD','Dinar irakien','Dinar irakien (د.ع)',86),
('currency','KWD','Dinar koweïtien','Dinar koweïtien (د.ك)',87),
('currency','BHD','Dinar bahreïni','Dinar bahreïni (د.ب)',88),
('currency','QAR','Riyal qatari','Riyal qatari (ر.ق)',89),
('currency','AED','Dirham émirati','Dirham émirati (د.إ)',90),
('currency','OMR','Rial omanais','Rial omanais (ر.ع)',91),
('currency','YER','Rial yéménite','Rial yéménite (ر.ي)',92),
('currency','SAR','Riyal saoudien','Riyal saoudien (ر.س)',93),
('currency','IRR','Rial iranien','Rial iranien (﷼)',94),
('currency','AFN','Afghani afghan','Afghani afghan (؋)',95),
('currency','PKR','Roupie pakistanaise','Roupie pakistanaise (₨)',96),
('currency','INR','Roupie indienne','Roupie indienne (₹)',97),
('currency','BDT','Taka bangladais','Taka bangladais (৳)',98),
('currency','LKR','Roupie srilankaise','Roupie srilankaise (₨)',99),
('currency','NPR','Roupie népalaise','Roupie népalaise (₨)',100)
ON CONFLICT DO NOTHING;

-- =====================================================
-- RÔLES DE CONTACT - TOURISME COMPLET
-- =====================================================
INSERT INTO ref_contact_role (code, name, description) VALUES
('reservation', 'Réservation', 'Contact pour réservations'),
('management', 'Management', 'Direction / management'),
('press', 'Presse', 'Relations presse'),
('technical', 'Technique', 'Support technique / IT'),
('sales', 'Commercial', 'Ventes / commercial'),
('info', 'Information', 'Informations générales'),
('concierge', 'Conciergerie', 'Service de conciergerie'),
('reception', 'Réception', 'Service de réception'),
('housekeeping', 'Ménage', 'Service de ménage'),
('maintenance', 'Maintenance', 'Service de maintenance'),
('security', 'Sécurité', 'Service de sécurité'),
('catering', 'Restauration', 'Service de restauration'),
('events', 'Événements', 'Organisation d''événements'),
('marketing', 'Marketing', 'Service marketing'),
('finance', 'Finance', 'Service financier'),
('legal', 'Juridique', 'Service juridique'),
('hr', 'Ressources humaines', 'Ressources humaines'),
('it', 'Informatique', 'Service informatique'),
('guest_services', 'Service client', 'Service client'),
('emergency', 'Urgences', 'Contact d''urgence'),
('complaints', 'Réclamations', 'Service réclamations'),
('feedback', 'Retours', 'Service retours clients'),
('loyalty', 'Fidélité', 'Programme de fidélité'),
('partnerships', 'Partenariats', 'Relations partenaires'),
('suppliers', 'Fournisseurs', 'Relations fournisseurs')
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- ACCESSIBILITÉ ET HANDICAP
-- =====================================================
INSERT INTO ref_code (domain, code, name, description, position) VALUES
('accessibility','wheelchair_accessible','Accessible fauteuil roulant','Accessible aux fauteuils roulants',1),
('accessibility','mobility_impaired','Mobilité réduite','Adapté aux personnes à mobilité réduite',2),
('accessibility','visual_impaired','Déficience visuelle','Adapté aux personnes malvoyantes',3),
('accessibility','hearing_impaired','Déficience auditive','Adapté aux personnes malentendantes',4),
('accessibility','cognitive_disability','Déficience cognitive','Adapté aux personnes avec déficience cognitive',5),
('accessibility','service_animal','Animal d''assistance','Accepte les animaux d''assistance',6),
('accessibility','elevator','Ascenseur','Ascenseur disponible',7),
('accessibility','ramp','Rampe','Rampe d''accès',8),
('accessibility','wide_door','Porte large','Portes larges',9),
('accessibility','accessible_bathroom','Toilettes accessibles','Toilettes adaptées',10),
('accessibility','accessible_parking','Parking accessible','Places de parking adaptées',11),
('accessibility','braille','Braille','Signalétique en braille',12),
('accessibility','audio_guide','Guide audio','Guide audio disponible',13),
('accessibility','sign_language','Langue des signes','Service en langue des signes',14),
('accessibility','tactile_guide','Guide tactile','Guide tactile disponible',15),
('accessibility','low_vision','Basse vision','Adapté à la basse vision',16),
('accessibility','deaf_friendly','Sourd-friendly','Adapté aux personnes sourdes',17),
('accessibility','autism_friendly','Autisme-friendly','Adapté aux personnes autistes',18),
('accessibility','sensory_friendly','Sensoriel-friendly','Adapté aux sensibilités sensorielles',19),
('accessibility','quiet_space','Espace calme','Espace calme disponible',20)
ON CONFLICT DO NOTHING;

-- =====================================================
-- DURABILITÉ ET ÉCO-TOURISME
-- =====================================================
INSERT INTO ref_code (domain, code, name, description, position) VALUES
('sustainability','eco_certified','Certifié écologique','Certification écologique',1),
('sustainability','green_energy','Énergie verte','Utilise des énergies renouvelables',2),
('sustainability','water_conservation','Conservation de l''eau','Pratiques de conservation de l''eau',3),
('sustainability','waste_reduction','Réduction des déchets','Pratiques de réduction des déchets',4),
('sustainability','recycling','Recyclage','Programme de recyclage',5),
('sustainability','composting','Compostage','Programme de compostage',6),
('sustainability','local_sourcing','Approvisionnement local','Produits et services locaux',7),
('sustainability','organic','Biologique','Produits biologiques',8),
('sustainability','fair_trade','Commerce équitable','Commerce équitable',9),
('sustainability','carbon_neutral','Neutre en carbone','Neutre en carbone',10),
('sustainability','carbon_offset','Compensation carbone','Compensation carbone',11),
('sustainability','sustainable_transport','Transport durable','Options de transport durable',12),
('sustainability','bike_friendly','Vélo-friendly','Accueil des cyclistes',13),
('sustainability','public_transport','Transport public','Accès transport public',14),
('sustainability','walking_friendly','Piéton-friendly','Accessible à pied',15),
('sustainability','wildlife_protection','Protection de la faune','Protection de la faune',16),
('sustainability','habitat_conservation','Conservation des habitats','Conservation des habitats',17),
('sustainability','marine_protection','Protection marine','Protection marine',18),
('sustainability','forest_conservation','Conservation forestière','Conservation forestière',19),
('sustainability','community_support','Soutien communautaire','Soutien à la communauté locale',20),
('sustainability','cultural_preservation','Préservation culturelle','Préservation du patrimoine culturel',21),
('sustainability','education','Éducation environnementale','Programmes d''éducation environnementale',22),
('sustainability','research','Recherche','Soutien à la recherche',23),
('sustainability','volunteering','Bénévolat','Opportunités de bénévolat',24),
('sustainability','donation','Don','Programme de dons',25),
('sustainability','plastic_free','Sans plastique','Sans plastique à usage unique',26),
('sustainability','zero_waste','Zéro déchet','Objectif zéro déchet',27),
('sustainability','energy_efficient','Économe en énergie','Équipements économes en énergie',28),
('sustainability','water_efficient','Économe en eau','Équipements économes en eau',29),
('sustainability','sustainable_materials','Matériaux durables','Matériaux durables',30)
ON CONFLICT DO NOTHING;

-- =====================================================
-- TAGS D'ENVIRONNEMENT - TOURISME COMPLET
-- =====================================================
INSERT INTO ref_code (domain, code, name, description, position) VALUES
-- Environnements naturels
('environment_tag','volcan','Au pied du volcan','Situé au pied du Piton de la Fournaise',1),
('environment_tag','plage','Plage','Proche d''une plage',2),
('environment_tag','lagon','Lagon','Proche du lagon',3),
('environment_tag','cascade','Cascade','Proche d''une cascade',4),
('environment_tag','montagne','Montagne','En montagne',5),
('environment_tag','foret','Forêt','En forêt',6),
('environment_tag','jardin','Jardin','Avec jardin',7),
('environment_tag','terrasse','Terrasse','Avec terrasse',8),
('environment_tag','vue_panoramique','Vue panoramique','Vue panoramique',9),
('environment_tag','bord_mer','Bord de mer','Au bord de mer',10),
('environment_tag','lac','Lac','Proche d''un lac',11),
('environment_tag','riviere','Rivière','Proche d''une rivière',12),
('environment_tag','ocean','Océan','Face à l''océan',13),
('environment_tag','golf','Golf','Proche d''un golf',14),
('environment_tag','ski','Ski','Station de ski',15),
('environment_tag','spa','Spa','Centre de spa',16),
('environment_tag','thermal','Thermal','Station thermale',17),
('environment_tag','vignoble','Vignoble','Proche d''un vignoble',18),
('environment_tag','parc_naturel','Parc naturel','Dans un parc naturel',19),
('environment_tag','reserve','Réserve','Dans une réserve',20),

-- Environnements urbains
('environment_tag','ville','En ville','En centre-ville',21),
('environment_tag','centre_ville','Centre-ville','En centre-ville',22),
('environment_tag','quartier_historique','Quartier historique','Dans un quartier historique',23),
('environment_tag','marina','Marina','Proche d''une marina',24),
('environment_tag','port','Port','Proche du port',25),
('environment_tag','gare','Gare','Proche de la gare',26),
('environment_tag','aeroport','Aéroport','Proche de l''aéroport',27),
('environment_tag','universite','Université','Proche de l''université',28),
('environment_tag','hopital','Hôpital','Proche de l''hôpital',29),
('environment_tag','centre_commercial','Centre commercial','Proche d''un centre commercial',30),

-- Ambiances
('environment_tag','calme','Calme','Endroit calme',31),
('environment_tag','anime','Animé','Endroit animé',32),
('environment_tag','romantique','Romantique','Endroit romantique',33),
('environment_tag','familial','Familial','Endroit familial',34),
('environment_tag','luxueux','Luxueux','Endroit luxueux',35),
('environment_tag','authentique','Authentique','Endroit authentique',36),
('environment_tag','moderne','Moderne','Endroit moderne',37),
('environment_tag','traditionnel','Traditionnel','Endroit traditionnel',38),
('environment_tag','cosmopolite','Cosmopolite','Endroit cosmopolite',39),
('environment_tag','local','Local','Endroit local',40),

-- Activités
('environment_tag','sport','Sport','Activités sportives',41),
('environment_tag','culture','Culture','Activités culturelles',42),
('environment_tag','gastronomie','Gastronomie','Gastronomie locale',43),
('environment_tag','shopping','Shopping','Shopping',44),
('environment_tag','nightlife','Vie nocturne','Vie nocturne',45),
('environment_tag','art','Art','Art et culture',46),
('environment_tag','musique','Musique','Musique',47),
('environment_tag','festival','Festival','Festivals',48),
('environment_tag','evenement','Événement','Événements',49),
('environment_tag','conference','Conférence','Conférences',50)
ON CONFLICT DO NOTHING;

-- =====================================================
-- ACTIVITÉS TOURISTIQUES
-- =====================================================
INSERT INTO ref_code (domain, code, name, description, position) VALUES
-- Activités nautiques
('activity','swimming','Natation','Natation',1),
('activity','snorkeling','Snorkeling','Plongée libre',2),
('activity','scuba_diving','Plongée sous-marine','Plongée avec bouteille',3),
('activity','surfing','Surf','Surf',4),
('activity','windsurfing','Planche à voile','Planche à voile',5),
('activity','kitesurfing','Kitesurf','Kitesurf',6),
('activity','sailing','Voile','Voile',7),
('activity','kayaking','Kayak','Kayak',8),
('activity','canoeing','Canoë','Canoë',9),
('activity','paddleboarding','Paddle','Stand-up paddle',10),
('activity','fishing','Pêche','Pêche',11),
('activity','boat_tour','Tour en bateau','Tour en bateau',12),
('activity','cruise','Croisière','Croisière',13),
('activity','whale_watching','Observation des baleines','Observation des baleines',14),
('activity','dolphin_watching','Observation des dauphins','Observation des dauphins',15),

-- Activités terrestres
('activity','hiking','Randonnée','Randonnée pédestre',16),
('activity','trekking','Trekking','Trekking',17),
('activity','mountain_biking','VTT','Vélo tout terrain',18),
('activity','cycling','Cyclisme','Cyclisme',19),
('activity','horse_riding','Équitation','Équitation',20),
('activity','rock_climbing','Escalade','Escalade',21),
('activity','canyoning','Canyoning','Canyoning',22),
('activity','zip_lining','Tyrolienne','Tyrolienne',23),
('activity','paragliding','Parapente','Parapente',24),
('activity','skydiving','Parachutisme','Parachutisme',25),
('activity','hot_air_balloon','Montgolfière','Montgolfière',26),
('activity','golf','Golf','Golf',27),
('activity','tennis','Tennis','Tennis',28),
('activity','squash','Squash','Squash',29),
('activity','badminton','Badminton','Badminton',30),

-- Activités culturelles
('activity','museum_visit','Visite de musée','Visite de musée',31),
('activity','art_gallery','Galerie d''art','Galerie d''art',32),
('activity','historical_site','Site historique','Site historique',33),
('activity','monument','Monument','Monument',34),
('activity','castle_visit','Visite de château','Visite de château',35),
('activity','church_visit','Visite d''église','Visite d''église',36),
('activity','temple_visit','Visite de temple','Visite de temple',37),
('activity','cultural_center','Centre culturel','Centre culturel',38),
('activity','theater','Théâtre','Théâtre',39),
('activity','concert','Concert','Concert',40),
('activity','opera','Opéra','Opéra',41),
('activity','ballet','Ballet','Ballet',42),
('activity','festival','Festival','Festival',43),
('activity','exhibition','Exposition','Exposition',44),
('activity','workshop','Atelier','Atelier',45),

-- Activités gastronomiques
('activity','cooking_class','Cours de cuisine','Cours de cuisine',46),
('activity','wine_tasting','Dégustation de vin','Dégustation de vin',47),
('activity','food_tour','Tour gastronomique','Tour gastronomique',48),
('activity','market_visit','Visite de marché','Visite de marché',49),
('activity','farm_visit','Visite de ferme','Visite de ferme',50),
('activity','brewery_tour','Visite de brasserie','Visite de brasserie',51),
('activity','distillery_tour','Visite de distillerie','Visite de distillerie',52),
('activity','chocolate_tasting','Dégustation de chocolat','Dégustation de chocolat',53),
('activity','cheese_tasting','Dégustation de fromage','Dégustation de fromage',54),
('activity','olive_oil_tasting','Dégustation d''huile d''olive','Dégustation d''huile d''olive',55),

-- Activités de bien-être
('activity','spa_treatment','Soin spa','Soin spa',56),
('activity','massage','Massage','Massage',57),
('activity','yoga','Yoga','Yoga',58),
('activity','meditation','Méditation','Méditation',59),
('activity','pilates','Pilates','Pilates',60),
('activity','fitness','Fitness','Fitness',61),
('activity','gym','Salle de sport','Salle de sport',62),
('activity','sauna','Sauna','Sauna',63),
('activity','jacuzzi','Jacuzzi','Jacuzzi',64),
('activity','thermal_bath','Bain thermal','Bain thermal',65),

-- Activités d'aventure
('activity','safari','Safari','Safari',66),
('activity','wildlife_watching','Observation de la faune','Observation de la faune',67),
('activity','bird_watching','Observation des oiseaux','Observation des oiseaux',68),
('activity','photography','Photographie','Photographie',69),
('activity','astronomy','Astronomie','Astronomie',70),
('activity','caving','Spéléologie','Spéléologie',71),
('activity','ice_climbing','Escalade sur glace','Escalade sur glace',72),
('activity','snowshoeing','Raquettes','Raquettes',73),
('activity','cross_country_skiing','Ski de fond','Ski de fond',74),
('activity','downhill_skiing','Ski alpin','Ski alpin',75),
('activity','snowboarding','Snowboard','Snowboard',76),
('activity','ice_skating','Patinage sur glace','Patinage sur glace',77),
('activity','sledding','Luge','Luge',78),
('activity','snowmobiling','Motoneige','Motoneige',79),
('activity','dog_sledding','Traîneau à chiens','Traîneau à chiens',80)
ON CONFLICT DO NOTHING;

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
