-- =====================================================
-- DONNÉES DE SEED COMPLÈTES - INDUSTRIE DU TOURISME
-- =====================================================
-- Données de référence exhaustives basées sur les meilleures pratiques
-- de l'industrie du tourisme, conformes aux standards internationaux
-- et adaptées au contexte de La Réunion

-- =====================================================
-- 1. LANGUES - SUPPORT MULTILINGUE COMPLET
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

-- =====================================================
-- 2. CANAUX DE CONTACT - COMMUNICATION TOURISTIQUE
-- =====================================================

INSERT INTO ref_code (domain, code, name, description, position) VALUES
-- Communication traditionnelle
('contact_kind', 'phone', 'Téléphone fixe', 'Numéro de téléphone fixe', 1),
('contact_kind', 'mobile', 'Téléphone mobile', 'Numéro de téléphone mobile', 2),
('contact_kind', 'fax', 'Télécopie', 'Numéro de fax', 3),
-- Communication numérique
('contact_kind', 'email', 'Adresse email', 'Adresse de messagerie électronique', 4),
('contact_kind', 'website', 'Site web', 'Site internet officiel', 5),
('contact_kind', 'whatsapp', 'WhatsApp', 'Numéro WhatsApp', 6),
('contact_kind', 'telegram', 'Telegram', 'Identifiant Telegram', 7),
-- Réseaux sociaux
('contact_kind', 'facebook', 'Facebook', 'Page Facebook', 8),
('contact_kind', 'instagram', 'Instagram', 'Compte Instagram', 9),
('contact_kind', 'twitter', 'Twitter/X', 'Compte Twitter/X', 10),
('contact_kind', 'linkedin', 'LinkedIn', 'Page LinkedIn', 11),
('contact_kind', 'youtube', 'YouTube', 'Chaîne YouTube', 12),
('contact_kind', 'tiktok', 'TikTok', 'Compte TikTok', 13),
-- Communication professionnelle
('contact_kind', 'skype', 'Skype', 'Identifiant Skype', 14),
('contact_kind', 'teams', 'Microsoft Teams', 'Lien Teams', 15),
('contact_kind', 'zoom', 'Zoom', 'Lien de réunion Zoom', 16),
-- Communication spécialisée
('contact_kind', 'booking', 'Plateforme de réservation', 'Lien de réservation en ligne', 17),
('contact_kind', 'chat', 'Chat en ligne', 'Chat support client', 18),
('contact_kind', 'app', 'Application mobile', 'Lien de téléchargement app', 19)
ON CONFLICT (domain, code) DO NOTHING;

-- =====================================================
-- 3. JOURS DE SEMAINE - GESTION DES HORAIRES
-- =====================================================

INSERT INTO ref_code (domain, code, name, position) VALUES
('weekday', 'monday', 'Lundi', 1),
('weekday', 'tuesday', 'Mardi', 2),
('weekday', 'wednesday', 'Mercredi', 3),
('weekday', 'thursday', 'Jeudi', 4),
('weekday', 'friday', 'Vendredi', 5),
('weekday', 'saturday', 'Samedi', 6),
('weekday', 'sunday', 'Dimanche', 7)
ON CONFLICT (domain, code) DO NOTHING;

-- =====================================================
-- 4. TYPES DE PLANNING D'OUVERTURE
-- =====================================================

INSERT INTO ref_code (domain, code, name, description) VALUES
('opening_schedule_type', 'regular', 'Régulier', 'Horaires fixes toute l''année'),
('opening_schedule_type', 'seasonal', 'Saisonnier', 'Horaires variables selon les saisons'),
('opening_schedule_type', 'event', 'Événementiel', 'Horaires spéciaux pour événements'),
('opening_schedule_type', 'flexible', 'Flexible', 'Horaires adaptables selon la demande'),
('opening_schedule_type', 'continuous', 'Continu', 'Ouvert 24h/24'),
('opening_schedule_type', 'appointment', 'Sur rendez-vous', 'Ouvert uniquement sur réservation')
ON CONFLICT (domain, code) DO NOTHING;

-- =====================================================
-- 5. TYPES DE MÉDIA - CONTENU MULTIMÉDIA TOURISTIQUE
-- =====================================================

INSERT INTO ref_code (domain, code, name, description, position) VALUES
-- Images
('media_type', 'photo', 'Photo', 'Image photographique', 1),
('media_type', 'panorama', 'Photo panoramique', 'Vue panoramique 360°', 2),
('media_type', 'aerial', 'Vue aérienne', 'Photo prise du ciel', 3),
('media_type', 'interior', 'Photo intérieure', 'Vue de l''intérieur', 4),
('media_type', 'exterior', 'Photo extérieure', 'Vue de l''extérieur', 5),
-- Vidéos
('media_type', 'video', 'Vidéo', 'Contenu vidéo', 6),
('media_type', 'virtual_tour', 'Visite virtuelle', 'Visite interactive 360°', 7),
('media_type', 'drone_video', 'Vidéo drone', 'Vidéo aérienne', 8),
('media_type', 'time_lapse', 'Time-lapse', 'Vidéo accélérée', 9),
-- Audio
('media_type', 'audio', 'Audio', 'Contenu audio', 10),
('media_type', 'podcast', 'Podcast', 'Émission audio', 11),
-- Documents
('media_type', 'pdf', 'PDF', 'Document PDF', 12),
('media_type', 'brochure', 'Brochure', 'Document promotionnel', 13),
('media_type', 'menu', 'Menu', 'Carte des menus', 14),
-- Interactif
('media_type', 'interactive', 'Contenu interactif', 'Expérience interactive', 15),
('media_type', 'ar', 'Réalité augmentée', 'Contenu AR', 16),
('media_type', 'vr', 'Réalité virtuelle', 'Contenu VR', 17)
ON CONFLICT (domain, code) DO NOTHING;

-- =====================================================
-- 6. FAMILLES D'ÉQUIPEMENTS - AMÉNITÉS TOURISTIQUES
-- =====================================================

INSERT INTO ref_code (domain, code, name, description, position) VALUES
-- Confort et bien-être
('amenity_family', 'comforts', 'Conforts', 'Équipements de confort de base', 1),
('amenity_family', 'wellness', 'Bien-être', 'Spa, fitness, relaxation', 2),
('amenity_family', 'accessibility', 'Accessibilité', 'Équipements PMR et accessibilité', 3),
-- Services
('amenity_family', 'services', 'Services', 'Services hôteliers et touristiques', 4),
('amenity_family', 'concierge', 'Conciergerie', 'Services de conciergerie', 5),
('amenity_family', 'transport', 'Transport', 'Services de transport', 6),
-- Équipements techniques
('amenity_family', 'equipment', 'Équipements', 'Équipements techniques et technologiques', 7),
('amenity_family', 'safety', 'Sécurité', 'Équipements de sécurité', 8),
('amenity_family', 'communication', 'Communication', 'Équipements de communication', 9),
-- Loisirs et activités
('amenity_family', 'recreation', 'Loisirs', 'Équipements de loisirs', 10),
('amenity_family', 'sports', 'Sports', 'Équipements sportifs', 11),
('amenity_family', 'entertainment', 'Divertissement', 'Équipements de divertissement', 12),
-- Restauration
('amenity_family', 'dining', 'Restauration', 'Équipements de restauration', 13),
('amenity_family', 'beverage', 'Boissons', 'Équipements de bar et boissons', 14),
-- Business et événementiel
('amenity_family', 'business', 'Business', 'Équipements d''affaires', 15),
('amenity_family', 'events', 'Événementiel', 'Équipements pour événements', 16)
ON CONFLICT (domain, code) DO NOTHING;

-- =====================================================
-- 7. MOYENS DE PAIEMENT - SOLUTIONS DE PAIEMENT TOURISTIQUES
-- =====================================================

INSERT INTO ref_code (domain, code, name, description, position) VALUES
-- Cartes bancaires traditionnelles
('payment_method', 'carte_paiement', 'Carte de paiement', 'Carte de paiement générique', 1),
('payment_method', 'carte_bleue', 'Carte Bleue', 'Carte Bleue française', 2),
('payment_method', 'visa', 'Visa', 'Carte Visa', 3),
('payment_method', 'mastercard', 'Mastercard', 'Carte Mastercard', 4),
('payment_method', 'american_express', 'American Express', 'Carte American Express', 5),
('payment_method', 'diners_club', 'Diners Club', 'Carte Diners Club', 6),
('payment_method', 'jcb', 'JCB', 'Carte JCB', 7),
-- Paiements numériques
('payment_method', 'paypal', 'PayPal', 'Paiement PayPal', 8),
('payment_method', 'apple_pay', 'Apple Pay', 'Paiement Apple Pay', 9),
('payment_method', 'google_pay', 'Google Pay', 'Paiement Google Pay', 10),
('payment_method', 'samsung_pay', 'Samsung Pay', 'Paiement Samsung Pay', 11),
-- Paiements alternatifs
('payment_method', 'especes', 'Espèces', 'Paiement en espèces', 12),
('payment_method', 'cheque', 'Chèque', 'Paiement par chèque', 13),
('payment_method', 'cheque_vacances', 'Chèques vacances', 'Chèques vacances ANCV', 14),
('payment_method', 'virement', 'Virement bancaire', 'Virement bancaire', 15),
-- Paiements spécialisés tourisme
('payment_method', 'carte_credit', 'Carte de crédit', 'Carte de crédit', 16),
('payment_method', 'carte_debit', 'Carte de débit', 'Carte de débit', 17),
('payment_method', 'prepaiement', 'Prépaiement', 'Paiement à l''avance', 18),
-- Cryptomonnaies
('payment_method', 'bitcoin', 'Bitcoin', 'Paiement en Bitcoin', 19),
('payment_method', 'crypto', 'Cryptomonnaie', 'Paiement en cryptomonnaie', 20),
-- Paiements locaux
('payment_method', 'mobile_money', 'Mobile Money', 'Paiement mobile', 21),
('payment_method', 'wallet', 'Portefeuille électronique', 'Portefeuille électronique', 22)
ON CONFLICT (domain, code) DO NOTHING;

-- =====================================================
-- 8. RÔLES DE CONTACT - PROFILS PROFESSIONNELS TOURISTIQUES
-- =====================================================

INSERT INTO ref_contact_role (code, name, description) VALUES
-- Direction et management
('management', 'Management', 'Direction générale et management'),
('director', 'Directeur', 'Directeur général'),
('manager', 'Manager', 'Responsable de service'),
('supervisor', 'Superviseur', 'Superviseur d''équipe'),
-- Commercial et ventes
('sales', 'Commercial', 'Ventes et commercial'),
('sales_manager', 'Responsable commercial', 'Responsable des ventes'),
('account_manager', 'Chef de compte', 'Gestion des comptes clients'),
('business_development', 'Développement commercial', 'Développement des affaires'),
-- Réservations et accueil
('reservation', 'Réservation', 'Service de réservation'),
('reception', 'Réception', 'Accueil et réception'),
('concierge', 'Concierge', 'Service de conciergerie'),
('guest_services', 'Service client', 'Service clientèle'),
-- Communication et marketing
('press', 'Presse', 'Relations presse'),
('marketing', 'Marketing', 'Responsable marketing'),
('communication', 'Communication', 'Responsable communication'),
('social_media', 'Réseaux sociaux', 'Gestion des réseaux sociaux'),
-- Technique et support
('technical', 'Technique', 'Support technique / IT'),
('maintenance', 'Maintenance', 'Service de maintenance'),
('it', 'Informatique', 'Support informatique'),
('security', 'Sécurité', 'Service de sécurité'),
-- Restauration et services
('chef', 'Chef', 'Chef de cuisine'),
('sommelier', 'Sommelier', 'Spécialiste des vins'),
('waiter', 'Serveur', 'Service en salle'),
('housekeeping', 'Ménage', 'Service de ménage'),
-- Spécialisés
('guide', 'Guide', 'Guide touristique'),
('instructor', 'Moniteur', 'Moniteur d''activités'),
('therapist', 'Thérapeute', 'Thérapeute spa/wellness'),
('event_coordinator', 'Coordinateur événementiel', 'Organisateur d''événements'),
-- Information et support
('info', 'Information', 'Informations générales'),
('support', 'Support', 'Support client'),
('complaint', 'Réclamations', 'Gestion des réclamations'),
('feedback', 'Retour client', 'Collecte de retours clients')
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- 9. TAGS D'ENVIRONNEMENT - CARACTÉRISTIQUES GÉOGRAPHIQUES
-- =====================================================

INSERT INTO ref_code (domain, code, name, description, position) VALUES
-- Géographie de La Réunion
('environment_tag', 'volcan', 'Au pied du volcan', 'Situé au pied du Piton de la Fournaise', 1),
('environment_tag', 'plage', 'Plage', 'Proche d''une plage', 2),
('environment_tag', 'lagon', 'Lagon', 'Proche du lagon', 3),
('environment_tag', 'cascade', 'Cascade', 'Proche d''une cascade', 4),
('environment_tag', 'montagne', 'Montagne', 'En montagne', 5),
('environment_tag', 'foret', 'Forêt', 'En forêt tropicale', 6),
('environment_tag', 'cirque', 'Cirque', 'Dans un cirque', 7),
('environment_tag', 'ravine', 'Ravine', 'Proche d''une ravine', 8),
('environment_tag', 'plateau', 'Plateau', 'Sur un plateau', 9),
('environment_tag', 'cote', 'Côte', 'En bord de côte', 10),
-- Environnement urbain
('environment_tag', 'ville', 'En ville', 'En centre-ville', 11),
('environment_tag', 'centre_ville', 'Centre-ville', 'En centre-ville historique', 12),
('environment_tag', 'quartier', 'Quartier', 'Dans un quartier résidentiel', 13),
('environment_tag', 'commercial', 'Zone commerciale', 'En zone commerciale', 14),
('environment_tag', 'industriel', 'Zone industrielle', 'En zone industrielle', 15),
-- Environnement naturel
('environment_tag', 'jardin', 'Jardin', 'Avec jardin', 16),
('environment_tag', 'terrasse', 'Terrasse', 'Avec terrasse', 17),
('environment_tag', 'balcon', 'Balcon', 'Avec balcon', 18),
('environment_tag', 'piscine', 'Piscine', 'Avec piscine', 19),
('environment_tag', 'piscine_naturelle', 'Piscine naturelle', 'Avec piscine naturelle', 20),
-- Vues et panoramas
('environment_tag', 'vue_panoramique', 'Vue panoramique', 'Vue panoramique', 21),
('environment_tag', 'vue_mer', 'Vue mer', 'Vue sur la mer', 22),
('environment_tag', 'vue_montagne', 'Vue montagne', 'Vue sur la montagne', 23),
('environment_tag', 'vue_volcan', 'Vue volcan', 'Vue sur le volcan', 24),
('environment_tag', 'vue_jardin', 'Vue jardin', 'Vue sur jardin', 25),
-- Ambiance et atmosphère
('environment_tag', 'calme', 'Calme', 'Endroit calme', 26),
('environment_tag', 'anime', 'Animé', 'Endroit animé', 27),
('environment_tag', 'romantique', 'Romantique', 'Endroit romantique', 28),
('environment_tag', 'familial', 'Familial', 'Endroit familial', 29),
('environment_tag', 'intime', 'Intime', 'Endroit intime', 30),
-- Accessibilité et transport
('environment_tag', 'bord_mer', 'Bord de mer', 'Directement en bord de mer', 31),
('environment_tag', 'accessible', 'Accessible', 'Facilement accessible', 32),
('environment_tag', 'parking', 'Parking', 'Avec parking', 33),
('environment_tag', 'transport_public', 'Transport public', 'Proche transport public', 34),
('environment_tag', 'aeroport', 'Aéroport', 'Proche de l''aéroport', 35)
ON CONFLICT (domain, code) DO NOTHING;

-- =====================================================
-- 10. TYPES DE CUISINE - DIVERSITÉ CULINAIRE TOURISTIQUE
-- =====================================================

INSERT INTO ref_code (domain, code, name, description, position) VALUES
-- Cuisines locales et régionales
('cuisine_type', 'creole', 'Créole', 'Cuisine créole réunionnaise traditionnelle', 1),
('cuisine_type', 'metropolitan', 'Métropolitaine', 'Cuisine française métropolitaine', 2),
('cuisine_type', 'traditional', 'Traditionnelle', 'Cuisine traditionnelle réunionnaise', 3),
('cuisine_type', 'reunionnaise', 'Réunionnaise', 'Cuisine typique de La Réunion', 4),
-- Cuisines asiatiques
('cuisine_type', 'chinese', 'Chinoise', 'Cuisine chinoise traditionnelle', 5),
('cuisine_type', 'indian', 'Indienne', 'Cuisine indienne et tamoule', 6),
('cuisine_type', 'japanese', 'Japonaise', 'Cuisine japonaise', 7),
('cuisine_type', 'thai', 'Thaïlandaise', 'Cuisine thaïlandaise', 8),
('cuisine_type', 'vietnamese', 'Vietnamienne', 'Cuisine vietnamienne', 9),
('cuisine_type', 'korean', 'Coréenne', 'Cuisine coréenne', 10),
-- Cuisines européennes
('cuisine_type', 'italian', 'Italienne', 'Cuisine italienne', 11),
('cuisine_type', 'spanish', 'Espagnole', 'Cuisine espagnole', 12),
('cuisine_type', 'german', 'Allemande', 'Cuisine allemande', 13),
('cuisine_type', 'greek', 'Grecque', 'Cuisine grecque', 14),
('cuisine_type', 'mediterranean', 'Méditerranéenne', 'Cuisine méditerranéenne', 15),
-- Cuisines africaines et océaniennes
('cuisine_type', 'african', 'Africaine', 'Cuisine africaine', 16),
('cuisine_type', 'malagasy', 'Malgache', 'Cuisine malgache', 17),
('cuisine_type', 'oceanian', 'Océanienne', 'Cuisine océanienne', 18),
-- Cuisines spécialisées
('cuisine_type', 'international', 'Internationale', 'Cuisine internationale', 19),
('cuisine_type', 'fusion', 'Fusion', 'Cuisine fusion créole-moderne', 20),
('cuisine_type', 'gourmet', 'Gastronomique', 'Cuisine gastronomique de qualité', 21),
('cuisine_type', 'haute_cuisine', 'Haute cuisine', 'Cuisine de haut niveau', 22),
('cuisine_type', 'molecular', 'Moléculaire', 'Cuisine moléculaire', 23),
-- Restauration rapide et moderne
('cuisine_type', 'fast_food', 'Fast Food', 'Restauration rapide', 24),
('cuisine_type', 'street_food', 'Street Food', 'Cuisine de rue', 25),
('cuisine_type', 'food_truck', 'Food Truck', 'Cuisine de camion', 26),
('cuisine_type', 'casual', 'Décontractée', 'Cuisine décontractée', 27),
-- Cuisines spécialisées
('cuisine_type', 'vegetarian', 'Végétarienne', 'Cuisine végétarienne', 28),
('cuisine_type', 'vegan', 'Végane', 'Cuisine végane', 29),
('cuisine_type', 'halal', 'Halal', 'Cuisine halal', 30),
('cuisine_type', 'kosher', 'Casher', 'Cuisine casher', 31),
('cuisine_type', 'gluten_free', 'Sans gluten', 'Cuisine sans gluten', 32),
-- Cuisines thématiques
('cuisine_type', 'seafood', 'Fruits de mer', 'Cuisine de fruits de mer', 33),
('cuisine_type', 'meat', 'Viande', 'Cuisine carnée', 34),
('cuisine_type', 'dessert', 'Desserts', 'Spécialisé en desserts', 35),
('cuisine_type', 'pastry', 'Pâtisserie', 'Pâtisserie fine', 36),
('cuisine_type', 'baking', 'Boulangerie', 'Spécialisé en boulangerie', 37)
ON CONFLICT (domain, code) DO NOTHING;

-- =====================================================
-- 11. CATÉGORIES DE MENU - STRUCTURE CULINAIRE
-- =====================================================

INSERT INTO ref_code (domain, code, name, description, position) VALUES
-- Structure classique
('menu_category', 'entree', 'Entrées', 'Entrées et apéritifs', 1),
('menu_category', 'main', 'Plats principaux', 'Plats principaux et spécialités', 2),
('menu_category', 'dessert', 'Desserts', 'Desserts et douceurs', 3),
('menu_category', 'drinks', 'Boissons', 'Boissons et cocktails', 4),
-- Structure étendue
('menu_category', 'snacks', 'En-cas', 'En-cas et collations', 5),
('menu_category', 'appetizer', 'Amuse-bouches', 'Amuse-bouches et mises en bouche', 6),
('menu_category', 'soup', 'Soupes', 'Soupes et potages', 7),
('menu_category', 'salad', 'Salades', 'Salades et crudités', 8),
('menu_category', 'side', 'Accompagnements', 'Accompagnements et garnitures', 9),
('menu_category', 'cheese', 'Fromages', 'Plateau de fromages', 10),
-- Boissons spécialisées
('menu_category', 'wine', 'Vins', 'Carte des vins', 11),
('menu_category', 'cocktail', 'Cocktails', 'Cocktails et boissons alcoolisées', 12),
('menu_category', 'soft_drink', 'Boissons sans alcool', 'Boissons non alcoolisées', 13),
('menu_category', 'coffee', 'Café', 'Café et boissons chaudes', 14),
('menu_category', 'tea', 'Thé', 'Thé et infusions', 15),
-- Menus spéciaux
('menu_category', 'kids', 'Menu enfant', 'Menu spécial enfants', 16),
('menu_category', 'vegetarian', 'Menu végétarien', 'Menu végétarien', 17),
('menu_category', 'vegan', 'Menu végan', 'Menu végan', 18),
('menu_category', 'gluten_free', 'Sans gluten', 'Menu sans gluten', 19),
('menu_category', 'halal', 'Menu halal', 'Menu halal', 20),
-- Services spéciaux
('menu_category', 'breakfast', 'Petit-déjeuner', 'Menu petit-déjeuner', 21),
('menu_category', 'brunch', 'Brunch', 'Menu brunch', 22),
('menu_category', 'lunch', 'Déjeuner', 'Menu déjeuner', 23),
('menu_category', 'dinner', 'Dîner', 'Menu dîner', 24),
('menu_category', 'late_night', 'Service de nuit', 'Menu service de nuit', 25),
-- Formules
('menu_category', 'formula', 'Formule', 'Formule repas', 26),
('menu_category', 'buffet', 'Buffet', 'Buffet à volonté', 27),
('menu_category', 'tasting', 'Dégustation', 'Menu dégustation', 28),
('menu_category', 'chef_special', 'Spécialité du chef', 'Spécialité du chef', 29),
('menu_category', 'seasonal', 'Saisonnier', 'Menu saisonnier', 30)
ON CONFLICT (domain, code) DO NOTHING;

-- =====================================================
-- 12. TAGS ALIMENTAIRES - RÉGIMES ET PRÉFÉRENCES
-- =====================================================

INSERT INTO ref_code (domain, code, name, description, position) VALUES
-- Régimes végétariens
('dietary_tag', 'vegetarian', 'Végétarien', 'Sans viande ni poisson', 1),
('dietary_tag', 'vegan', 'Végan', 'Sans produits d''origine animale', 2),
('dietary_tag', 'lacto_vegetarian', 'Lacto-végétarien', 'Végétarien avec produits laitiers', 3),
('dietary_tag', 'ovo_vegetarian', 'Ovo-végétarien', 'Végétarien avec œufs', 4),
('dietary_tag', 'pescatarian', 'Pescétarien', 'Végétarien avec poisson', 5),
-- Régimes religieux
('dietary_tag', 'halal', 'Halal', 'Conforme aux règles alimentaires islamiques', 6),
('dietary_tag', 'kosher', 'Casher', 'Conforme aux règles alimentaires juives', 7),
('dietary_tag', 'jain', 'Jain', 'Régime jain végétarien strict', 8),
-- Intolérances et allergies
('dietary_tag', 'gluten_free', 'Sans gluten', 'Sans gluten', 9),
('dietary_tag', 'dairy_free', 'Sans lactose', 'Sans produits laitiers', 10),
('dietary_tag', 'nut_free', 'Sans fruits à coque', 'Sans fruits à coque', 11),
('dietary_tag', 'soy_free', 'Sans soja', 'Sans soja', 12),
('dietary_tag', 'egg_free', 'Sans œufs', 'Sans œufs', 13),
('dietary_tag', 'fish_free', 'Sans poisson', 'Sans poisson', 14),
('dietary_tag', 'shellfish_free', 'Sans crustacés', 'Sans crustacés', 15),
-- Régimes de santé
('dietary_tag', 'low_sodium', 'Faible en sodium', 'Régime pauvre en sel', 16),
('dietary_tag', 'low_sugar', 'Faible en sucre', 'Régime pauvre en sucre', 17),
('dietary_tag', 'low_fat', 'Faible en gras', 'Régime pauvre en matières grasses', 18),
('dietary_tag', 'low_carb', 'Faible en glucides', 'Régime pauvre en glucides', 19),
('dietary_tag', 'keto', 'Cétogène', 'Régime cétogène', 20),
('dietary_tag', 'paleo', 'Paléo', 'Régime paléolithique', 21),
-- Qualité et origine
('dietary_tag', 'organic', 'Bio', 'Produits biologiques', 22),
('dietary_tag', 'local', 'Local', 'Produits locaux de La Réunion', 23),
('dietary_tag', 'seasonal', 'Saisonnier', 'Produits de saison', 24),
('dietary_tag', 'fair_trade', 'Commerce équitable', 'Produits commerce équitable', 25),
('dietary_tag', 'sustainable', 'Durable', 'Produits durables', 26),
-- Régimes spéciaux
('dietary_tag', 'raw', 'Cru', 'Cuisine crue', 27),
('dietary_tag', 'macrobiotic', 'Macrobiotique', 'Régime macrobiotique', 28),
('dietary_tag', 'ayurvedic', 'Ayurvédique', 'Régime ayurvédique', 29),
('dietary_tag', 'mediterranean', 'Méditerranéen', 'Régime méditerranéen', 30),
-- Portions et service
('dietary_tag', 'small_portion', 'Petite portion', 'Portions réduites', 31),
('dietary_tag', 'large_portion', 'Grande portion', 'Portions généreuses', 32),
('dietary_tag', 'sharing', 'À partager', 'Plats à partager', 33),
('dietary_tag', 'individual', 'Individuel', 'Portions individuelles', 34)
ON CONFLICT (domain, code) DO NOTHING;

-- =====================================================
-- 13. ALLERGÈNES - SÉCURITÉ ALIMENTAIRE
-- =====================================================

INSERT INTO ref_code (domain, code, name, description, position) VALUES
-- Allergènes majeurs (réglementation européenne)
('allergen', 'gluten', 'Gluten', 'Contient du gluten (blé, seigle, orge, avoine)', 1),
('allergen', 'nuts', 'Fruits à coque', 'Contient des fruits à coque', 2),
('allergen', 'dairy', 'Lait', 'Contient du lait et produits laitiers', 3),
('allergen', 'eggs', 'Œufs', 'Contient des œufs', 4),
('allergen', 'fish', 'Poisson', 'Contient du poisson', 5),
('allergen', 'shellfish', 'Crustacés', 'Contient des crustacés', 6),
('allergen', 'soy', 'Soja', 'Contient du soja', 7),
('allergen', 'sesame', 'Sésame', 'Contient du sésame', 8),
-- Allergènes supplémentaires
('allergen', 'peanuts', 'Arachides', 'Contient des arachides', 9),
('allergen', 'celery', 'Céleri', 'Contient du céleri', 10),
('allergen', 'mustard', 'Moutarde', 'Contient de la moutarde', 11),
('allergen', 'lupin', 'Lupin', 'Contient du lupin', 12),
('allergen', 'molluscs', 'Mollusques', 'Contient des mollusques', 13),
-- Allergènes spécifiques
('allergen', 'wheat', 'Blé', 'Contient du blé', 14),
('allergen', 'rye', 'Seigle', 'Contient du seigle', 15),
('allergen', 'barley', 'Orge', 'Contient de l''orge', 16),
('allergen', 'oats', 'Avoine', 'Contient de l''avoine', 17),
-- Allergènes de contact
('allergen', 'sulphites', 'Sulfites', 'Contient des sulfites', 18),
('allergen', 'sulphur_dioxide', 'Dioxyde de soufre', 'Contient du dioxyde de soufre', 19),
-- Allergènes émergents
('allergen', 'quinoa', 'Quinoa', 'Contient du quinoa', 20),
('allergen', 'buckwheat', 'Sarrasin', 'Contient du sarrasin', 21),
('allergen', 'coconut', 'Noix de coco', 'Contient de la noix de coco', 22),
('allergen', 'pine_nuts', 'Pignons', 'Contient des pignons', 23),
-- Allergènes de production
('allergen', 'may_contain', 'Peut contenir', 'Peut contenir des traces', 24),
('allergen', 'processed_in', 'Traité dans', 'Traité dans un atelier utilisant', 25),
('allergen', 'cross_contamination', 'Contamination croisée', 'Risque de contamination croisée', 26)
ON CONFLICT (domain, code) DO NOTHING;

-- =====================================================
-- 14. RÉSEAUX SOCIAUX - PRÉSENCE DIGITALE
-- =====================================================

INSERT INTO ref_code (domain, code, name, description, position) VALUES
-- Réseaux sociaux principaux
('social_network', 'facebook', 'Facebook', 'Réseau social Facebook', 1),
('social_network', 'instagram', 'Instagram', 'Réseau social Instagram', 2),
('social_network', 'twitter', 'Twitter/X', 'Réseau social Twitter/X', 3),
('social_network', 'linkedin', 'LinkedIn', 'Réseau professionnel LinkedIn', 4),
('social_network', 'youtube', 'YouTube', 'Plateforme vidéo YouTube', 5),
('social_network', 'tiktok', 'TikTok', 'Réseau social TikTok', 6),
-- Réseaux spécialisés
('social_network', 'pinterest', 'Pinterest', 'Plateforme de partage Pinterest', 7),
('social_network', 'snapchat', 'Snapchat', 'Réseau social Snapchat', 8),
('social_network', 'whatsapp', 'WhatsApp', 'Messagerie WhatsApp', 9),
('social_network', 'telegram', 'Telegram', 'Messagerie Telegram', 10),
-- Plateformes professionnelles
('social_network', 'tripadvisor', 'TripAdvisor', 'Plateforme de voyage TripAdvisor', 11),
('social_network', 'booking', 'Booking.com', 'Plateforme de réservation Booking', 12),
('social_network', 'airbnb', 'Airbnb', 'Plateforme de location Airbnb', 13),
('social_network', 'google_my_business', 'Google My Business', 'Profil Google My Business', 14),
-- Plateformes spécialisées
('social_network', 'foursquare', 'Foursquare', 'Plateforme de géolocalisation', 15),
('social_network', 'yelp', 'Yelp', 'Plateforme d''avis Yelp', 16),
('social_network', 'zomato', 'Zomato', 'Plateforme de restauration Zomato', 17),
('social_network', 'untappd', 'Untappd', 'Plateforme de boissons Untappd', 18)
ON CONFLICT (domain, code) DO NOTHING;

-- =====================================================
-- 15. NIVEAUX DE LANGUE - COMPÉTENCES LINGUISTIQUES
-- =====================================================

INSERT INTO ref_code (domain, code, name, description, position) VALUES
-- Échelle CECR (Cadre Européen Commun de Référence)
('language_level', 'a1', 'A1 - Débutant', 'Niveau débutant (utilisateur élémentaire)', 1),
('language_level', 'a2', 'A2 - Élémentaire', 'Niveau élémentaire (utilisateur élémentaire)', 2),
('language_level', 'b1', 'B1 - Intermédiaire', 'Niveau intermédiaire (utilisateur indépendant)', 3),
('language_level', 'b2', 'B2 - Intermédiaire avancé', 'Niveau intermédiaire avancé (utilisateur indépendant)', 4),
('language_level', 'c1', 'C1 - Avancé', 'Niveau avancé (utilisateur expérimenté)', 5),
('language_level', 'c2', 'C2 - Maîtrise', 'Niveau maîtrise (utilisateur expérimenté)', 6),
-- Niveaux spécialisés
('language_level', 'native', 'Natif', 'Langue maternelle', 7),
('language_level', 'bilingual', 'Bilingue', 'Bilingue natif', 8),
('language_level', 'fluent', 'Courant', 'Parlé couramment', 9),
('language_level', 'conversational', 'Conversationnel', 'Niveau conversationnel', 10),
('language_level', 'basic', 'Basique', 'Niveau basique', 11),
('language_level', 'professional', 'Professionnel', 'Niveau professionnel', 12)
ON CONFLICT (domain, code) DO NOTHING;

-- =====================================================
-- 16. TYPES DE PRIX - TARIFICATION TOURISTIQUE
-- =====================================================

INSERT INTO ref_code (domain, code, name, description, position) VALUES
-- Types de prix de base
('price_kind', 'standard', 'Standard', 'Prix standard', 1),
('price_kind', 'promotional', 'Promotionnel', 'Prix promotionnel', 2),
('price_kind', 'seasonal', 'Saisonnier', 'Prix saisonnier', 3),
('price_kind', 'group', 'Groupe', 'Prix de groupe', 4),
('price_kind', 'corporate', 'Entreprise', 'Prix entreprise', 5),
-- Types de prix spéciaux
('price_kind', 'early_bird', 'Early Bird', 'Prix early bird', 6),
('price_kind', 'last_minute', 'Last minute', 'Prix last minute', 7),
('price_kind', 'loyalty', 'Fidélité', 'Prix fidélité', 8),
('price_kind', 'member', 'Membre', 'Prix membre', 9),
('price_kind', 'student', 'Étudiant', 'Prix étudiant', 10),
('price_kind', 'senior', 'Senior', 'Prix senior', 11),
-- Types de prix événementiels
('price_kind', 'event', 'Événement', 'Prix événementiel', 12),
('price_kind', 'package', 'Forfait', 'Prix forfaitaire', 13),
('price_kind', 'all_inclusive', 'Tout inclus', 'Prix tout inclus', 14),
('price_kind', 'half_board', 'Demi-pension', 'Prix demi-pension', 15),
('price_kind', 'full_board', 'Pension complète', 'Prix pension complète', 16)
ON CONFLICT (domain, code) DO NOTHING;

-- =====================================================
-- 17. UNITÉS DE PRIX - MÉTRIQUES TARIFAIRES
-- =====================================================

INSERT INTO ref_code (domain, code, name, description, position) VALUES
-- Unités de base
('price_unit', 'per_person', 'Par personne', 'Prix par personne', 1),
('price_unit', 'per_room', 'Par chambre', 'Prix par chambre', 2),
('price_unit', 'per_night', 'Par nuit', 'Prix par nuit', 3),
('price_unit', 'per_day', 'Par jour', 'Prix par jour', 4),
('price_unit', 'per_week', 'Par semaine', 'Prix par semaine', 5),
('price_unit', 'per_month', 'Par mois', 'Prix par mois', 6),
-- Unités spécialisées
('price_unit', 'per_group', 'Par groupe', 'Prix par groupe', 7),
('price_unit', 'per_table', 'Par table', 'Prix par table', 8),
('price_unit', 'per_plate', 'Par assiette', 'Prix par assiette', 9),
('price_unit', 'per_kg', 'Par kilogramme', 'Prix par kilogramme', 10),
('price_unit', 'per_liter', 'Par litre', 'Prix par litre', 11),
-- Unités temporelles
('price_unit', 'per_hour', 'Par heure', 'Prix par heure', 12),
('price_unit', 'per_half_day', 'Par demi-journée', 'Prix par demi-journée', 13),
('price_unit', 'per_activity', 'Par activité', 'Prix par activité', 14),
('price_unit', 'per_course', 'Par cours', 'Prix par cours', 15),
-- Unités forfaitaires
('price_unit', 'flat_rate', 'Forfait', 'Prix forfaitaire', 16),
('price_unit', 'package', 'Package', 'Prix package', 17),
('price_unit', 'all_inclusive', 'Tout inclus', 'Prix tout inclus', 18)
ON CONFLICT (domain, code) DO NOTHING;

-- =====================================================
-- 18. ÉQUIPEMENTS DE RÉUNION - ÉVÉNEMENTIEL BUSINESS
-- =====================================================

INSERT INTO ref_code (domain, code, name, description, position) VALUES
-- Équipements audiovisuels
('meeting_equipment', 'projector', 'Projecteur', 'Projecteur vidéo', 1),
('meeting_equipment', 'screen', 'Écran', 'Écran de projection', 2),
('meeting_equipment', 'microphone', 'Microphone', 'Microphone', 3),
('meeting_equipment', 'speakers', 'Haut-parleurs', 'Système de sonorisation', 4),
('meeting_equipment', 'video_conference', 'Visioconférence', 'Équipement de visioconférence', 5),
-- Équipements informatiques
('meeting_equipment', 'computer', 'Ordinateur', 'Ordinateur portable', 6),
('meeting_equipment', 'internet', 'Internet', 'Connexion internet', 7),
('meeting_equipment', 'wifi', 'Wi-Fi', 'Accès Wi-Fi', 8),
('meeting_equipment', 'printer', 'Imprimante', 'Imprimante', 9),
('meeting_equipment', 'scanner', 'Scanner', 'Scanner', 10),
-- Mobilier et aménagement
('meeting_equipment', 'flipchart', 'Paperboard', 'Paperboard', 11),
('meeting_equipment', 'whiteboard', 'Tableau blanc', 'Tableau blanc', 12),
('meeting_equipment', 'podium', 'Podium', 'Podium', 13),
('meeting_equipment', 'stage', 'Scène', 'Scène', 14),
('meeting_equipment', 'lighting', 'Éclairage', 'Éclairage professionnel', 15),
-- Équipements spécialisés
('meeting_equipment', 'simultaneous_translation', 'Traduction simultanée', 'Cabine de traduction', 16),
('meeting_equipment', 'recording', 'Enregistrement', 'Équipement d''enregistrement', 17),
('meeting_equipment', 'streaming', 'Streaming', 'Équipement de streaming', 18),
('meeting_equipment', 'hybrid', 'Hybride', 'Équipement hybride présentiel/distanciel', 19)
ON CONFLICT (domain, code) DO NOTHING;

-- =====================================================
-- 19. PRATIQUES D'ITINÉRAIRES - ACTIVITÉS DE PLEINE NATURE
-- =====================================================

INSERT INTO ref_code (domain, code, name, description, position) VALUES
-- Randonnées
('iti_practice', 'hiking', 'Randonnée pédestre', 'Randonnée à pied', 1),
('iti_practice', 'trekking', 'Trekking', 'Randonnée longue distance', 2),
('iti_practice', 'trail_running', 'Trail running', 'Course en montagne', 3),
('iti_practice', 'walking', 'Marche', 'Marche de promenade', 4),
-- Sports de montagne
('iti_practice', 'climbing', 'Escalade', 'Escalade', 5),
('iti_practice', 'canyoning', 'Canyoning', 'Descente de canyon', 6),
('iti_practice', 'via_ferrata', 'Via ferrata', 'Via ferrata', 7),
('iti_practice', 'mountain_biking', 'VTT', 'Vélo tout terrain', 8),
-- Sports nautiques
('iti_practice', 'diving', 'Plongée', 'Plongée sous-marine', 9),
('iti_practice', 'snorkeling', 'Snorkeling', 'Palmes, masque et tuba', 10),
('iti_practice', 'kayaking', 'Kayak', 'Kayak', 11),
('iti_practice', 'surfing', 'Surf', 'Surf', 12),
('iti_practice', 'sailing', 'Voile', 'Voile', 13),
-- Sports aériens
('iti_practice', 'paragliding', 'Parapente', 'Parapente', 14),
('iti_practice', 'helicopter', 'Hélicoptère', 'Vol en hélicoptère', 15),
('iti_practice', 'ultralight', 'ULM', 'Ultra léger motorisé', 16),
-- Activités culturelles
('iti_practice', 'cultural_visit', 'Visite culturelle', 'Visite de sites culturels', 17),
('iti_practice', 'museum', 'Musée', 'Visite de musée', 18),
('iti_practice', 'heritage', 'Patrimoine', 'Découverte du patrimoine', 19),
('iti_practice', 'local_culture', 'Culture locale', 'Immersion culturelle', 20),
-- Activités gastronomiques
('iti_practice', 'food_tour', 'Tour gastronomique', 'Découverte culinaire', 21),
('iti_practice', 'wine_tasting', 'Dégustation de vin', 'Dégustation de vins', 22),
('iti_practice', 'cooking_class', 'Cours de cuisine', 'Cours de cuisine', 23),
-- Activités nature
('iti_practice', 'bird_watching', 'Observation d''oiseaux', 'Observation ornithologique', 24),
('iti_practice', 'wildlife', 'Observation faune', 'Observation de la faune', 25),
('iti_practice', 'botanical', 'Botanique', 'Découverte botanique', 26),
('iti_practice', 'photography', 'Photographie', 'Photographie nature', 27)
ON CONFLICT (domain, code) DO NOTHING;

-- =====================================================
-- 20. THÈMES DE DEMANDE - BESOINS CLIENTÈLE
-- =====================================================

INSERT INTO ref_code (domain, code, name, description, position) VALUES
-- Hébergement
('demand_topic', 'accommodation', 'Hébergement', 'Demandes d''hébergement', 1),
('demand_topic', 'hotel', 'Hôtel', 'Demandes hôtelières', 2),
('demand_topic', 'restaurant', 'Restauration', 'Demandes de restauration', 3),
('demand_topic', 'activity', 'Activité', 'Demandes d''activités', 4),
-- Transport
('demand_topic', 'transport', 'Transport', 'Demandes de transport', 5),
('demand_topic', 'rental', 'Location', 'Demandes de location', 6),
('demand_topic', 'transfer', 'Transfert', 'Demandes de transfert', 7),
-- Événementiel
('demand_topic', 'event', 'Événement', 'Demandes événementielles', 8),
('demand_topic', 'meeting', 'Réunion', 'Demandes de réunion', 9),
('demand_topic', 'conference', 'Conférence', 'Demandes de conférence', 10),
-- Information
('demand_topic', 'information', 'Information', 'Demandes d''information', 11),
('demand_topic', 'booking', 'Réservation', 'Demandes de réservation', 12),
('demand_topic', 'cancellation', 'Annulation', 'Demandes d''annulation', 13),
-- Services
('demand_topic', 'service', 'Service', 'Demandes de service', 14),
('demand_topic', 'complaint', 'Réclamation', 'Réclamations', 15),
('demand_topic', 'feedback', 'Retour', 'Retours clients', 16)
ON CONFLICT (domain, code) DO NOTHING;

-- =====================================================
-- 21. SOUS-THÈMES DE DEMANDE - DÉTAILS SPÉCIFIQUES
-- =====================================================

INSERT INTO ref_code (domain, code, name, description, position) VALUES
-- Hébergement
('demand_subtopic', 'room_availability', 'Disponibilité chambre', 'Disponibilité des chambres', 1),
('demand_subtopic', 'room_type', 'Type de chambre', 'Type de chambre souhaité', 2),
('demand_subtopic', 'room_service', 'Service en chambre', 'Service en chambre', 3),
('demand_subtopic', 'check_in', 'Enregistrement', 'Enregistrement arrivée', 4),
('demand_subtopic', 'check_out', 'Départ', 'Enregistrement départ', 5),
-- Restauration
('demand_subtopic', 'menu', 'Menu', 'Demande de menu', 6),
('demand_subtopic', 'dietary', 'Régime alimentaire', 'Régime alimentaire spécial', 7),
('demand_subtopic', 'reservation', 'Réservation table', 'Réservation de table', 8),
('demand_subtopic', 'catering', 'Traiteur', 'Service traiteur', 9),
-- Activités
('demand_subtopic', 'schedule', 'Horaires', 'Horaires d''activités', 10),
('demand_subtopic', 'equipment', 'Équipement', 'Équipement nécessaire', 11),
('demand_subtopic', 'guide', 'Guide', 'Guide accompagnateur', 12),
('demand_subtopic', 'group_size', 'Taille groupe', 'Taille du groupe', 13),
-- Transport
('demand_subtopic', 'airport_pickup', 'Navette aéroport', 'Navette aéroport', 14),
('demand_subtopic', 'car_rental', 'Location voiture', 'Location de voiture', 15),
('demand_subtopic', 'taxi', 'Taxi', 'Service taxi', 16),
-- Événementiel
('demand_subtopic', 'venue', 'Lieu', 'Lieu d''événement', 17),
('demand_subtopic', 'capacity', 'Capacité', 'Capacité d''accueil', 18),
('demand_subtopic', 'catering_event', 'Traiteur événement', 'Traiteur pour événement', 19),
('demand_subtopic', 'decoration', 'Décoration', 'Décoration événement', 20)
ON CONFLICT (domain, code) DO NOTHING;

-- =====================================================
-- 22. AMBIANCES - ATMOSPHÈRES ET MOODS
-- =====================================================

INSERT INTO ref_code (domain, code, name, description, position) VALUES
-- Ambiances générales
('mood', 'romantic', 'Romantique', 'Ambiance romantique', 1),
('mood', 'family', 'Familial', 'Ambiance familiale', 2),
('mood', 'business', 'Business', 'Ambiance professionnelle', 3),
('mood', 'casual', 'Décontracté', 'Ambiance décontractée', 4),
('mood', 'luxury', 'Luxe', 'Ambiance de luxe', 5),
-- Ambiances nature
('mood', 'nature', 'Nature', 'Ambiance nature', 6),
('mood', 'tropical', 'Tropical', 'Ambiance tropicale', 7),
('mood', 'mountain', 'Montagne', 'Ambiance montagne', 8),
('mood', 'ocean', 'Océan', 'Ambiance océan', 9),
('mood', 'forest', 'Forêt', 'Ambiance forêt', 10),
-- Ambiances urbaines
('mood', 'urban', 'Urbain', 'Ambiance urbaine', 11),
('mood', 'historic', 'Historique', 'Ambiance historique', 12),
('mood', 'modern', 'Moderne', 'Ambiance moderne', 13),
('mood', 'traditional', 'Traditionnel', 'Ambiance traditionnelle', 14),
-- Ambiances sociales
('mood', 'social', 'Social', 'Ambiance sociale', 15),
('mood', 'intimate', 'Intime', 'Ambiance intime', 16),
('mood', 'festive', 'Festif', 'Ambiance festive', 17),
('mood', 'calm', 'Calme', 'Ambiance calme', 18),
('mood', 'energetic', 'Énergique', 'Ambiance énergique', 19),
-- Ambiances culturelles
('mood', 'cultural', 'Culturel', 'Ambiance culturelle', 20),
('mood', 'artistic', 'Artistique', 'Ambiance artistique', 21),
('mood', 'authentic', 'Authentique', 'Ambiance authentique', 22),
('mood', 'exotic', 'Exotique', 'Ambiance exotique', 23)
ON CONFLICT (domain, code) DO NOTHING;

-- =====================================================
-- 23. ÉQUIPEMENTS TOURISTIQUES COMPLETS - AMÉNITÉS
-- =====================================================

-- Équipements de confort
INSERT INTO ref_amenity (code, name, family_id, description)
SELECT v.code, v.name, fam.id, v.description
FROM (
  VALUES
    -- Conforts de base
    ('tv','Télévision','comforts','Télévision dans les chambres'),
    ('wifi','Wi-Fi','comforts','Accès Wi‑Fi gratuit'),
    ('air_conditioning','Climatisation','comforts','Climatisation'),
    ('heating','Chauffage','comforts','Chauffage'),
    ('minibar','Minibar','comforts','Minibar'),
    ('safe','Coffre-fort','comforts','Coffre-fort'),
    ('balcony','Balcon','comforts','Balcon'),
    ('terrace','Terrasse','comforts','Terrasse'),
    -- Bien-être
    ('spa','Spa','wellness','Centre de spa'),
    ('sauna','Sauna','wellness','Sauna'),
    ('jacuzzi','Jacuzzi','wellness','Jacuzzi'),
    ('massage','Massage','wellness','Service de massage'),
    ('fitness','Fitness','wellness','Salle de fitness'),
    ('pool','Piscine','wellness','Piscine'),
    ('hot_tub','Bain à remous','wellness','Bain à remous'),
    -- Services
    ('restaurant','Restaurant','services','Restaurant sur place'),
    ('bar','Bar','services','Bar'),
    ('room_service','Service en chambre','services','Service en chambre'),
    ('concierge','Conciergerie','services','Service de conciergerie'),
    ('laundry','Blanchisserie','services','Service de blanchisserie'),
    ('parking','Parking','services','Parking'),
    ('valet','Voiturier','services','Service de voiturier'),
    -- Équipements techniques
    ('business_center','Centre d''affaires','equipment','Centre d''affaires'),
    ('meeting_room','Salle de réunion','equipment','Salle de réunion'),
    ('projector','Projecteur','equipment','Projecteur vidéo'),
    ('printer','Imprimante','equipment','Imprimante'),
    ('computer','Ordinateur','equipment','Ordinateur'),
    -- Sécurité
    ('security','Sécurité','safety','Service de sécurité'),
    ('cctv','Vidéosurveillance','safety','Vidéosurveillance'),
    ('fire_safety','Sécurité incendie','safety','Système de sécurité incendie'),
    ('emergency_exit','Sortie de secours','safety','Sortie de secours'),
    -- Accessibilité
    ('wheelchair_access','Accès fauteuil roulant','accessibility','Accès fauteuil roulant'),
    ('elevator','Ascenseur','accessibility','Ascenseur'),
    ('braille','Braille','accessibility','Signalétique braille'),
    ('hearing_loop','Boucle magnétique','accessibility','Boucle magnétique'),
    -- Loisirs
    ('tennis','Tennis','sports','Court de tennis'),
    ('golf','Golf','sports','Terrains de golf'),
    ('beach','Plage','recreation','Accès plage'),
    ('garden','Jardin','recreation','Jardin'),
    ('playground','Aire de jeux','recreation','Aire de jeux enfants'),
    -- Restauration spécialisée
    ('breakfast','Petit-déjeuner','dining','Service petit-déjeuner'),
    ('buffet','Buffet','dining','Buffet'),
    ('catering','Traiteur','dining','Service traiteur'),
    ('wine_cellar','Cave à vin','beverage','Cave à vin'),
    ('cocktail_bar','Bar à cocktails','beverage','Bar à cocktails'),
    -- Business
    ('conference_room','Salle de conférence','business','Salle de conférence'),
    ('boardroom','Salle de conseil','business','Salle de conseil'),
    ('exhibition_space','Espace d''exposition','business','Espace d''exposition'),
    ('translation','Traduction','business','Service de traduction'),
    -- Événementiel
    ('wedding_venue','Lieu de mariage','events','Lieu de mariage'),
    ('banquet_hall','Salle de banquet','events','Salle de banquet'),
    ('outdoor_space','Espace extérieur','events','Espace extérieur'),
    ('dance_floor','Piste de danse','events','Piste de danse')
) AS v(code,name,fam_code,description)
JOIN ref_code_amenity_family fam ON fam.code = v.fam_code
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- 24. CLASSIFICATIONS HÔTELIÈRES - TYPES D'HÉBERGEMENT
-- =====================================================

INSERT INTO ref_classification_scheme (code, name, description) VALUES 
('type_hot','Type d''hôtel','Classification des types d''hôtels'),
('star_rating','Classification étoiles','Classification par étoiles'),
('prefectoral','Classification préfectorale','Classification préfectorale française'),
('eco_label','Label écologique','Labels et certifications écologiques'),
('accessibility','Accessibilité','Labels d''accessibilité')
ON CONFLICT (code) DO NOTHING;

-- Types d'hôtels
INSERT INTO ref_classification_value (scheme_id, code, name, description)
SELECT rcs.id, v.code, v.name, v.description
FROM ref_classification_scheme rcs,
     (VALUES
       ('hotel','Hôtel','Hôtel classique'),
       ('hotel_restaurant','Hôtel-restaurant','Hôtel avec restaurant'),
       ('hotel_boutique','Hôtel boutique','Hôtel boutique de charme'),
       ('hotel_ecologique','Hôtel écologique','Hôtel respectueux de l''environnement'),
       ('hotel_historique','Hôtel historique','Hôtel de caractère historique'),
       ('hotel_moderne','Hôtel moderne','Hôtel contemporain'),
       ('hotel_traditionnel','Hôtel traditionnel','Hôtel traditionnel'),
       ('hotel_familial','Hôtel familial','Hôtel adapté aux familles'),
       ('hotel_romantique','Hôtel romantique','Hôtel pour couples'),
       ('hotel_affaires','Hôtel d''affaires','Hôtel business'),
       ('hotel_luxury','Hôtel de luxe','Hôtel haut de gamme'),
       ('hotel_budget','Hôtel économique','Hôtel économique'),
       ('hotel_resort','Résort','Complexe hôtelier'),
       ('hotel_casino','Hôtel-casino','Hôtel avec casino'),
       ('hotel_spa','Hôtel-spa','Hôtel avec spa'),
       ('hotel_golf','Hôtel-golf','Hôtel avec golf'),
       ('hotel_beach','Hôtel de plage','Hôtel en bord de mer'),
       ('hotel_mountain','Hôtel de montagne','Hôtel en montagne'),
       ('hotel_city','Hôtel urbain','Hôtel en ville'),
       ('hotel_airport','Hôtel aéroport','Hôtel proche aéroport')
     ) AS v(code,name,description)
WHERE rcs.code='type_hot'
ON CONFLICT (scheme_id, code) DO NOTHING;

-- Classification par étoiles
INSERT INTO ref_classification_value (scheme_id, code, name, description)
SELECT rcs.id, v.code, v.name, v.description
FROM ref_classification_scheme rcs,
     (VALUES
       ('1e','1 étoile','Hôtel 1 étoile'),
       ('2e','2 étoiles','Hôtel 2 étoiles'),
       ('3e','3 étoiles','Hôtel 3 étoiles'),
       ('4e','4 étoiles','Hôtel 4 étoiles'),
       ('5e','5 étoiles','Hôtel 5 étoiles'),
       ('palace','Palace','Hôtel palace'),
       ('unclassified','Non classé','Hôtel non classé')
     ) AS v(code,name,description)
WHERE rcs.code='star_rating'
ON CONFLICT (scheme_id, code) DO NOTHING;

-- Classification préfectorale
INSERT INTO ref_classification_value (scheme_id, code, name, description)
SELECT rcs.id, v.code, v.name, v.description
FROM ref_classification_scheme rcs,
     (VALUES
       ('1e','1 étoile','Classification préfectorale 1 étoile'),
       ('2e','2 étoiles','Classification préfectorale 2 étoiles'),
       ('3e','3 étoiles','Classification préfectorale 3 étoiles'),
       ('4e','4 étoiles','Classification préfectorale 4 étoiles'),
       ('5e','5 étoiles','Classification préfectorale 5 étoiles')
     ) AS v(code,name,description)
WHERE rcs.code='prefectoral'
ON CONFLICT (scheme_id, code) DO NOTHING;

-- Labels écologiques
INSERT INTO ref_classification_value (scheme_id, code, name, description)
SELECT rcs.id, v.code, v.name, v.description
FROM ref_classification_scheme rcs,
     (VALUES
       ('clef_verte','Clef Verte','Label Clef Verte'),
       ('ecolabel','Écolabel européen','Écolabel européen'),
       ('green_globe','Green Globe','Certification Green Globe'),
       ('earthcheck','EarthCheck','Certification EarthCheck'),
       ('iso14001','ISO 14001','Certification ISO 14001'),
       ('carbon_neutral','Neutre carbone','Certification neutre carbone')
     ) AS v(code,name,description)
WHERE rcs.code='eco_label'
ON CONFLICT (scheme_id, code) DO NOTHING;

-- Labels d'accessibilité
INSERT INTO ref_classification_value (scheme_id, code, name, description)
SELECT rcs.id, v.code, v.name, v.description
FROM ref_classification_scheme rcs,
     (VALUES
       ('tourism_handicap','Tourisme & Handicap','Label Tourisme & Handicap'),
       ('pmr','PMR','Accessible aux personnes à mobilité réduite'),
       ('deaf_friendly','Sourds et malentendants','Adapté aux sourds et malentendants'),
       ('blind_friendly','Aveugles et malvoyants','Adapté aux aveugles et malvoyants'),
       ('autism_friendly','Autisme','Adapté aux personnes autistes')
     ) AS v(code,name,description)
WHERE rcs.code='accessibility'
ON CONFLICT (scheme_id, code) DO NOTHING;

-- =====================================================
-- 25. MÉTRIQUES DE CAPACITÉ - MESURES TOURISTIQUES
-- =====================================================

INSERT INTO ref_capacity_metric (code, name, unit, description) VALUES
-- Capacités d'hébergement
('total_rooms', 'Nombre total de chambres', 'rooms', 'Nombre total de chambres disponibles'),
('total_beds', 'Nombre total de lits', 'beds', 'Nombre total de lits disponibles'),
('single_rooms', 'Chambres simples', 'rooms', 'Nombre de chambres simples'),
('double_rooms', 'Chambres doubles', 'rooms', 'Nombre de chambres doubles'),
('twin_rooms', 'Chambres à lits jumeaux', 'rooms', 'Nombre de chambres à lits jumeaux'),
('family_rooms', 'Chambres familiales', 'rooms', 'Nombre de chambres familiales'),
('suite_rooms', 'Suites', 'rooms', 'Nombre de suites'),
('accessible_rooms', 'Chambres accessibles', 'rooms', 'Nombre de chambres accessibles PMR'),
-- Capacités de restauration
('restaurant_capacity', 'Capacité restaurant', 'seats', 'Nombre de places en restaurant'),
('bar_capacity', 'Capacité bar', 'seats', 'Nombre de places au bar'),
('terrace_capacity', 'Capacité terrasse', 'seats', 'Nombre de places en terrasse'),
('banquet_capacity', 'Capacité banquet', 'seats', 'Nombre de places pour banquets'),
-- Capacités événementielles
('meeting_rooms', 'Salles de réunion', 'rooms', 'Nombre de salles de réunion'),
('conference_capacity', 'Capacité conférence', 'seats', 'Nombre de places en conférence'),
('exhibition_space', 'Espace d''exposition', 'm2', 'Surface d''exposition en m²'),
('outdoor_space', 'Espace extérieur', 'm2', 'Surface d''espace extérieur en m²'),
-- Capacités de loisirs
('pool_capacity', 'Capacité piscine', 'people', 'Nombre de personnes en piscine'),
('spa_capacity', 'Capacité spa', 'people', 'Nombre de personnes au spa'),
('fitness_capacity', 'Capacité fitness', 'people', 'Nombre de personnes en salle de sport'),
-- Capacités de transport
('parking_spaces', 'Places de parking', 'spaces', 'Nombre de places de parking'),
('valet_capacity', 'Capacité voiturier', 'cars', 'Nombre de voitures en voiturier'),
-- Capacités spécialisées
('wheelchair_spaces', 'Places fauteuils roulants', 'spaces', 'Nombre de places pour fauteuils roulants'),
('pet_capacity', 'Capacité animaux', 'pets', 'Nombre d''animaux acceptés'),
('storage_capacity', 'Capacité stockage', 'm3', 'Volume de stockage en m³')
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- 26. RÉSUMÉ ET STATISTIQUES DES DONNÉES DE SEED
-- =====================================================

-- Vérification et statistiques des données insérées
DO $$
DECLARE
    language_count INTEGER;
    contact_kind_count INTEGER;
    media_type_count INTEGER;
    amenity_family_count INTEGER;
    payment_method_count INTEGER;
    environment_tag_count INTEGER;
    cuisine_type_count INTEGER;
    menu_category_count INTEGER;
    dietary_tag_count INTEGER;
    allergen_count INTEGER;
    social_network_count INTEGER;
    language_level_count INTEGER;
    price_kind_count INTEGER;
    price_unit_count INTEGER;
    meeting_equipment_count INTEGER;
    iti_practice_count INTEGER;
    demand_topic_count INTEGER;
    demand_subtopic_count INTEGER;
    mood_count INTEGER;
    amenity_count INTEGER;
    classification_scheme_count INTEGER;
    classification_value_count INTEGER;
    capacity_metric_count INTEGER;
    contact_role_count INTEGER;
BEGIN
    -- Compter les langues
    SELECT COUNT(*) INTO language_count FROM ref_language;
    
    -- Compter les domaines ref_code
    SELECT COUNT(*) INTO contact_kind_count FROM ref_code_contact_kind;
    SELECT COUNT(*) INTO media_type_count FROM ref_code_media_type;
    SELECT COUNT(*) INTO amenity_family_count FROM ref_code_amenity_family;
    SELECT COUNT(*) INTO payment_method_count FROM ref_code_payment_method;
    SELECT COUNT(*) INTO environment_tag_count FROM ref_code_environment_tag;
    SELECT COUNT(*) INTO cuisine_type_count FROM ref_code_cuisine_type;
    SELECT COUNT(*) INTO menu_category_count FROM ref_code_menu_category;
    SELECT COUNT(*) INTO dietary_tag_count FROM ref_code_dietary_tag;
    SELECT COUNT(*) INTO allergen_count FROM ref_code_allergen;
    SELECT COUNT(*) INTO social_network_count FROM ref_code_social_network;
    SELECT COUNT(*) INTO language_level_count FROM ref_code_language_level;
    SELECT COUNT(*) INTO price_kind_count FROM ref_code_price_kind;
    SELECT COUNT(*) INTO price_unit_count FROM ref_code_price_unit;
    SELECT COUNT(*) INTO meeting_equipment_count FROM ref_code_meeting_equipment;
    SELECT COUNT(*) INTO iti_practice_count FROM ref_code_iti_practice;
    SELECT COUNT(*) INTO demand_topic_count FROM ref_code_demand_topic;
    SELECT COUNT(*) INTO demand_subtopic_count FROM ref_code_demand_subtopic;
    SELECT COUNT(*) INTO mood_count FROM ref_code_mood;
    
    -- Compter les autres tables
    SELECT COUNT(*) INTO amenity_count FROM ref_amenity;
    SELECT COUNT(*) INTO classification_scheme_count FROM ref_classification_scheme;
    SELECT COUNT(*) INTO classification_value_count FROM ref_classification_value;
    SELECT COUNT(*) INTO capacity_metric_count FROM ref_capacity_metric;
    SELECT COUNT(*) INTO contact_role_count FROM ref_contact_role;
    
    RAISE NOTICE '=== RÉSUMÉ DES DONNÉES DE SEED INSÉRÉES ===';
    RAISE NOTICE 'Langues: %', language_count;
    RAISE NOTICE 'Canaux de contact: %', contact_kind_count;
    RAISE NOTICE 'Types de média: %', media_type_count;
    RAISE NOTICE 'Familles d''équipements: %', amenity_family_count;
    RAISE NOTICE 'Moyens de paiement: %', payment_method_count;
    RAISE NOTICE 'Tags d''environnement: %', environment_tag_count;
    RAISE NOTICE 'Types de cuisine: %', cuisine_type_count;
    RAISE NOTICE 'Catégories de menu: %', menu_category_count;
    RAISE NOTICE 'Tags alimentaires: %', dietary_tag_count;
    RAISE NOTICE 'Allergènes: %', allergen_count;
    RAISE NOTICE 'Réseaux sociaux: %', social_network_count;
    RAISE NOTICE 'Niveaux de langue: %', language_level_count;
    RAISE NOTICE 'Types de prix: %', price_kind_count;
    RAISE NOTICE 'Unités de prix: %', price_unit_count;
    RAISE NOTICE 'Équipements de réunion: %', meeting_equipment_count;
    RAISE NOTICE 'Pratiques d''itinéraires: %', iti_practice_count;
    RAISE NOTICE 'Thèmes de demande: %', demand_topic_count;
    RAISE NOTICE 'Sous-thèmes de demande: %', demand_subtopic_count;
    RAISE NOTICE 'Ambiances: %', mood_count;
    RAISE NOTICE 'Équipements: %', amenity_count;
    RAISE NOTICE 'Schémas de classification: %', classification_scheme_count;
    RAISE NOTICE 'Valeurs de classification: %', classification_value_count;
    RAISE NOTICE 'Métriques de capacité: %', capacity_metric_count;
    RAISE NOTICE 'Rôles de contact: %', contact_role_count;
    
    RAISE NOTICE '=== TOTAL DES RÉFÉRENCES: % ===', 
        language_count + contact_kind_count + media_type_count + amenity_family_count + 
        payment_method_count + environment_tag_count + cuisine_type_count + menu_category_count + 
        dietary_tag_count + allergen_count + social_network_count + language_level_count + 
        price_kind_count + price_unit_count + meeting_equipment_count + iti_practice_count + 
        demand_topic_count + demand_subtopic_count + mood_count + amenity_count + 
        classification_scheme_count + classification_value_count + capacity_metric_count + contact_role_count;
    
    RAISE NOTICE '✓ Seed complet réussi avec % références au total', 
        language_count + contact_kind_count + media_type_count + amenity_family_count + 
        payment_method_count + environment_tag_count + cuisine_type_count + menu_category_count + 
        dietary_tag_count + allergen_count + social_network_count + language_level_count + 
        price_kind_count + price_unit_count + meeting_equipment_count + iti_practice_count + 
        demand_topic_count + demand_subtopic_count + mood_count + amenity_count + 
        classification_scheme_count + classification_value_count + capacity_metric_count + contact_role_count;
END $$;

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
