# Migration Données Hétérogènes vers Supabase

## Contexte

Ce projet migre des données hétérogènes vers Supabase (PostgreSQL) avec une modélisation unifiée et normalisée couvrant tous les types d'objets de la nomenclature (RES, PCU, PNA, ORG, ITI, VIL, HPA, ASC, COM, HOT, HLO, LOI, FMA).

## Caractéristiques principales

- **Modélisation unifiée** : Tables communes réutilisables (localisations unifiées, contacts, médias, langues, équipements, etc.)
- **Système de localisation unifié** : `object_location` remplace `address` et `location` pour une gestion simplifiée des adresses et coordonnées géographiques
- **Points de rencontre (multi-lieux)** : `object_place` simplifié pour les points de RDV; `object_place_description` pour du contenu localisé; médias attachables à l'objet ou au lieu (`media.place_id`)
- **API JSON via vues** : `api.v_hot` (HOT exact), `api.v_objects` (générique), `api.v_needed` (structure needed.json)
- **Classifications extensibles** : schémas/valeurs génériques + préfectoral/TypeHOT via `ref_classification_scheme` et `object_classification`
- **Capacité flexible** : Référentiel extensible via `ref_capacity_metric`, `ref_capacity_applicability`, valeurs via `object_capacity`
- **Système d'ouverture riche** : `opening_period`, `opening_schedule`, `opening_time_period` pour une gestion flexible des horaires
- **Menus de restaurants** : Tables `object_menu` et `object_menu_item` pour les restaurants et événements
  - Catégories de menu via `ref_code_menu_category` (Entrée, Plat principal, Dessert, Boissons)
  - Tags alimentaires via `ref_code_dietary_tag` (végétarien, vegan, halal, etc.)
  - Allergènes via `ref_code_allergen` (gluten, arachides, lait, etc.)
  - Prix avec unités via `ref_code_price_unit` (par personne, par portion, etc.)
- **Référentiel unifié** : Table `ref_code` partitionnée par domaine pour une gestion centralisée des codes de référence
- **Workflow de modération** : Table `pending_change` et flag `object.is_editing` pour gérer les modifications en attente d'approbation
- **Médias** : publication (`is_published`), droits (`rights_expires_at`), dimensions (`width`,`height`), analyse (`analyse_data` JSONB)
- **IDs externes** : table interne `object_external_id` (mapping org/id externe + `last_synced_at`)
- **Sécurité RLS** : Politiques de sécurité au niveau des lignes activées
- **Audit** : Journalisation automatique UPDATE/DELETE (JSONB avant/après, horodatage, utilisateur)
- **Étapes d'itinéraires** : Coordonnées géographiques (POINT) pour affichage cartographique précis
- **Médias par étape** : Association flexible des médias aux étapes sans duplication du modèle media
- **API étapes** : Fonctions dédiées pour récupérer étapes avec coordonnées et médias, recherche géographique
- **API menus** : Fonction `api.get_object_resource` étendue pour exposer les menus des restaurants et événements
- **Performance** : Index optimisés et support PostGIS
- **Partitionnement avancé** : Tables partitionnées par date (`audit_log`, `crm_interaction`, `object_version`) et par domaine (`ref_code`) pour optimiser les performances
- **CRM refactorisé** : Système de suivi des demandes et interactions (non orienté vente) avec gestion des tâches et consentements RGPD
- **Conformité PostgreSQL** : Clés primaires composites sur tables partitionnées, clés étrangères adaptées, syntaxe PostgreSQL valide

## Structure des fichiers

```
├── schema_unified.sql          # Schéma SQL principal avec types, tables et contraintes
├── api_views_functions.sql     # Vues et fonctions API pour génération JSON
├── rls_policies.sql           # Politiques de sécurité RLS
├── migration_plan.sql         # Plan de migration idempotent
├── examples_queries.sql       # Exemples de requêtes et d'utilisation
├── seeds_data.sql            # Données de seed réalistes pour tests
├── verification_tests.sql    # Tests de validation et vérifications
├── erd_diagram.md           # Diagramme ER en Mermaid
└── README.md                # Ce fichier
```

## Installation et déploiement

### 1. Prérequis

- Supabase projet configuré
- PostgreSQL 15+ avec extensions PostGIS
- Accès aux fichiers CSV source

### 2. Déploiement du schéma

```sql
-- 1. Exécuter le schéma principal
\i schema_unified.sql

-- 2. Exécuter les vues et fonctions API
\i api_views_functions.sql

-- 3. Exécuter les politiques RLS
\i rls_policies.sql
### 2.b Audit des changements

L'audit est activé automatiquement sur toutes les tables du schéma `public` via des triggers.

- Table: `audit.audit_log(table_name, operation, row_pk, before_data, after_data, changed_at, changed_by)`
- Utilisateur: récupéré depuis JWT (`email`/`sub`) ou `current_user`.
- Opérations: UPDATE et DELETE (ajout INSERT possible si besoin).

Exemples:

```sql
-- Voir les 50 derniers changements
SELECT table_name, operation, changed_at, changed_by
FROM audit.audit_log
ORDER BY changed_at DESC
LIMIT 50;

-- Diff JSONB sur un objet précis
SELECT jsonb_pretty(before_data), jsonb_pretty(after_data)
FROM audit.audit_log
WHERE table_name = 'address' AND row_pk ? 'id' = false
ORDER BY changed_at DESC
LIMIT 5;
```

-- 4. Exécuter le plan de migration
\i migration_plan.sql
```

### 3. Peuplement des données

```sql
-- Exécuter les seeds de test
\i seeds_data.sql

-- (optionnel) Peuplement personnalisé selon vos sources
```

### 4. Vérification

```sql
-- Exécuter les tests de validation
\i verification_tests.sql

-- Vérifier la génération JSON HOT
SELECT api_get_hotels();
```

## Utilisation de l'API

### Génération JSON HOT exact

```sql
-- Récupérer tous les hôtels au format JSON HOT exact
SELECT * FROM api.v_hot;

-- Récupérer un hôtel spécifique
SELECT * FROM api.v_hot WHERE id = 'HOTAQU000V5014ZU';
```

### Génération JSON pour autres types

```sql
-- Activités (exemple via vue générique)
SELECT * FROM api.v_objects WHERE type = 'Activités';

-- Manifestations
SELECT * FROM api.v_objects WHERE type = 'Manifestations';

-- Itinéraires (vue dédiée)
SELECT * FROM api.v_iti;  -- pratique, objets associés, étapes, sections, profil altimétrique, KML/GPX

-- Étapes d'itinéraires avec coordonnées et médias
SELECT * FROM api.get_iti_stages('ITI-EXAMPLE-001', 'fr');

-- Étapes proches d'un point géographique
SELECT * FROM api.get_stages_nearby(48.8566, 2.3522, 5000, 'fr');  -- 5km de Paris

-- Menus de restaurants et événements
SELECT api.get_object_resource('RESTAURANT-001', ARRAY['fr'], 'none', '{}'::jsonb);

-- Tous les types
SELECT * FROM api.v_objects;
```

### Export needed.json

```sql
-- Récupérer la structure needed.json
SELECT payload FROM api.v_needed;
```

## Notes de modélisation

- `object_description` couvre DescriptionsCommercialess (description, chapo, mobile, édition, offre hors zone, mesures sanitaires)
- `object_zone` permet plusieurs codes INSEE par objet
- `object_structure` relie un objet à une structure (ex: ORG)
- Classifications extensibles via `ref_classification_scheme`/`ref_classification_value` et `object_classification`
- Capacités extensibles via `ref_capacity_metric` + `object_capacity` (avec applicabilité par type)
- Documents de référence via `ref_document`, liés depuis `object_classification` et `legal`
- Développement durable:
  - Référentiels: `ref_sustainability_action_category` (catégorie), `ref_sustainability_action` (action: code, label, description)
  - Lien: `object_sustainability_action` (object_id, action_id, document_id, note)
  - Association avec un ou plusieurs labels via `object_sustainability_action_label` → `object_classification`
  
### Modèle 100% flexible (clarifications)

- Tables fixes supprimées: `classification`, `ref_classification_prefectoral`, `ref_type_hot`, `object_hot`, `capacity`.
- Remplacements:
  - Préfectoral: `ref_classification_scheme(code='prefectoral')` + `ref_classification_value(code in ['non_classe','1e'..'5e'])` + `object_classification`.
  - Type d’hôtel: `ref_classification_scheme(code='type_hot')` + `ref_classification_value(code in ['hotel','hotel_restaurant', ...])` + `object_classification`.
  - Capacités: `ref_capacity_metric` + `object_capacity`.

### I18N / Traductions

- JSONB i18n direct sur les colonnes fréquentes: `object.name_i18n`, `address.address1_i18n`, `address.city_i18n`, `media.title_i18n`, etc.
- Helper JSONB: `api.i18n_pick(jsonb, lang, fallback)`
- EAV générique conservé: table `i18n_translation` + helper `api.i18n_get_text(...)` pour cas avancés
- Endpoints:
  - `SELECT * FROM api.v_hot;` (par défaut FR via i18n JSONB)
  - `SELECT * FROM api.v_iti;`
  - `SELECT * FROM api.get_objects_i18n('HOT','en');` (fallback EAV si besoin)
- `object_external_id` conserve les correspondances d'identifiants externes par organisation (non exposé en API)

### API Étapes d'itinéraires

- **`api.v_iti`** : Vue principale incluant étapes avec coordonnées et médias
  - `stages` : Array d'objets avec `id`, `name`, `description`, `position`, `coordinates` (lat/lon), `media`
  - `media` par étape : Array avec `id`, `title`, `credit`, `url`, `media_type`, `position`
- **`api.get_iti_stages(iti_id, lang_code)`** : Fonction dédiée pour récupérer étapes d'un ITI
- **`api.get_stages_nearby(lat, lon, radius_meters, lang_code)`** : Recherche géographique d'étapes
- **Multi-lieux (places)** : Les vues `api.v_hot` et `api.v_objects` exposent `places`: liste des points de rencontre d'un objet, avec adresse, coordonnées, descriptions locales et médias propres au lieu (fallback sur le contenu de l'objet sinon)

### Tagging dynamique (libre, multilingue)

- Référentiel libre: `ref_tag(slug, name, description, color, icon)` (multilingue via `i18n_translation`)
- Liaison générique: `tag_link(tag_id, target_table, target_pk)` pour taguer n'importe quelle table (`object`, `media`, `object_place`, ...)
- Vue pratique: `api.object_tag` pour les tags d'objets (`object_id`, `slug`, `name`)

Exemples:
```sql
-- Créer un tag 'volcano'
INSERT INTO ref_tag(slug, name, color, icon) VALUES ('volcano','Volcan','#E53935','mdi-volcano')
ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name;

-- Taguer un objet
INSERT INTO tag_link(tag_id, target_table, target_pk)
SELECT id, 'object', 'HOTAQU000V5014ZU' FROM ref_tag WHERE slug='volcano';

-- Trouver tous les objets tagués 'volcano'
SELECT object_id FROM api.object_tag WHERE slug='volcano';

-- Taguer un média spécifique
INSERT INTO tag_link(tag_id, target_table, target_pk)
SELECT id, 'media', '06c9a6b6-...' FROM ref_tag WHERE slug='volcano';

-- Rechercher par nom de tag (insensible aux accents/majuscules)
SELECT * FROM ref_tag WHERE immutable_unaccent(lower(name)) LIKE immutable_unaccent(lower('%volc%'));
```

### Workflow de modération et changements en attente

Le système inclut un workflow de modération pour gérer les modifications proposées par les utilisateurs :

```sql
-- Soumettre un changement en attente
SELECT api.submit_pending_change(
  p_object_id    => 'HOTRUN0000000001',
  p_target_table => 'object',
  p_target_pk    => 'HOTRUN0000000001',
  p_action       => 'update',
  p_payload      => '{"name":"Nouveau nom","extra":{"source":"user"}}'::jsonb
);

-- Voir les changements en attente pour un objet
SELECT pc.*, o.name as object_name
FROM pending_change pc
JOIN object o ON o.id = pc.object_id
WHERE pc.status = 'pending'
ORDER BY pc.submitted_at DESC;

-- Approuver un changement
UPDATE pending_change 
SET status = 'approved', 
    reviewed_by = current_user,
    reviewed_at = NOW(),
    review_note = 'Changement approuvé'
WHERE id = 'change-uuid-here';

-- Voir les objets en cours d'édition
SELECT o.id, o.name, o.is_editing, 
       COUNT(pc.id) as pending_count
FROM object o
LEFT JOIN pending_change pc ON o.id = pc.object_id AND pc.status = 'pending'
WHERE o.is_editing = TRUE
GROUP BY o.id, o.name, o.is_editing;
```

### Système d'ouverture riche

Le système d'ouverture flexible permet de gérer des horaires complexes avec périodes, plannings et créneaux :

```sql
-- Créer une période d'ouverture
INSERT INTO opening_period (object_id, name, date_start, date_end, is_active)
VALUES ('RESTAURANT-001', 'Ouverture été 2024', '2024-06-01', '2024-09-30', TRUE);

-- Ajouter un planning pour cette période
INSERT INTO opening_schedule (period_id, name, description, is_active)
SELECT id, 'Planning principal', 'Horaires de base', TRUE
FROM opening_period WHERE object_id = 'RESTAURANT-001' AND name = 'Ouverture été 2024';

-- Créer des créneaux horaires
INSERT INTO opening_time_period (schedule_id, name, start_time, end_time, is_active)
SELECT s.id, 'Service midi', '12:00', '14:00', TRUE
FROM opening_schedule s
JOIN opening_period p ON p.id = s.period_id
WHERE p.object_id = 'RESTAURANT-001' AND p.name = 'Ouverture été 2024';

-- Définir les jours d'ouverture pour chaque créneau
INSERT INTO opening_time_period_weekday (time_period_id, weekday, is_active)
SELECT tp.id, wd, TRUE
FROM opening_time_period tp
JOIN opening_schedule s ON s.id = tp.schedule_id
JOIN opening_period p ON p.id = s.period_id
CROSS JOIN unnest(ARRAY['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']::weekday[]) AS wd
WHERE p.object_id = 'RESTAURANT-001' AND tp.name = 'Service midi';

-- Vérifier si un objet est ouvert maintenant
SELECT api.is_object_open_now('RESTAURANT-001');
```

### Gestion des menus de restaurants

```sql
-- Créer des catégories de menu
INSERT INTO ref_code_menu_category (domain, code, name, position) VALUES 
('menu_category', 'entree', 'Entrées', 1),
('menu_category', 'main', 'Plats principaux', 2),
('menu_category', 'dessert', 'Desserts', 3),
('menu_category', 'drinks', 'Boissons', 4);

-- Créer des tags alimentaires
INSERT INTO ref_code_dietary_tag (domain, code, name, position) VALUES 
('dietary_tag', 'vegetarian', 'Végétarien', 1),
('dietary_tag', 'vegan', 'Végan', 2),
('dietary_tag', 'halal', 'Halal', 3),
('dietary_tag', 'gluten_free', 'Sans gluten', 4);

-- Créer des allergènes
INSERT INTO ref_code_allergen (domain, code, name, position) VALUES 
('allergen', 'gluten', 'Gluten', 1),
('allergen', 'nuts', 'Fruits à coque', 2),
('allergen', 'dairy', 'Lait', 3),
('allergen', 'eggs', 'Œufs', 4);

-- Créer un menu pour un restaurant
INSERT INTO object_menu (object_id, name, description, position) 
VALUES ('RESTAURANT-001', 'Menu du jour', 'Menu traditionnel créole', 1);

-- Ajouter des éléments au menu
INSERT INTO object_menu_item (menu_id, name, category_id, price_amount, currency, unit_id, position)
SELECT 
  m.id,
  'Rougail saucisse',
  c.id,
  15.50,
  'EUR',
  u.id,
  1
FROM object_menu m
CROSS JOIN ref_code_menu_category c
CROSS JOIN ref_code_price_unit u
WHERE m.object_id = 'RESTAURANT-001' 
  AND c.code = 'main'
  AND u.code = 'per_person';

-- Taguer un plat comme végétarien
INSERT INTO menu_item_dietary_tag (menu_item_id, dietary_tag_id)
SELECT mi.id, dt.id
FROM object_menu_item mi
JOIN object_menu m ON m.id = mi.menu_id
CROSS JOIN ref_code_dietary_tag dt
WHERE m.object_id = 'RESTAURANT-001' 
  AND mi.name = 'Rougail saucisse'
  AND dt.code = 'vegetarian';

-- Récupérer le menu complet via API
SELECT api.get_object_resource('RESTAURANT-001', ARRAY['fr'], 'none', '{}'::jsonb);
```

### Contraintes & Index clés

- Ouverture: exclusion GIST `ex_opening_weekday_slot_no_overlap` empêche les chevauchements de créneaux par (object_id, weekday)
- Médias: au plus un `is_main` par `(object_id, media_type)` via `uq_media_one_main_per_type`; URL http/https obligatoire
- Réseaux sociaux: au plus un `is_primary` par `(object_id, network_type)`
- Légal: `chk_siret` (14 chiffres) et `chk_siren_shape` (9 chiffres)
- Recherche: GIN trigram sur `object.name`, `address.city`, `address.address1`

### Référentiel unifié et partitionnement

Le système utilise une table unifiée `ref_code` partitionnée par domaine pour centraliser tous les codes de référence :

```sql
-- Exemples de domaines supportés
INSERT INTO ref_code (domain, code, name, description) VALUES 
('contact_kind', 'phone', 'Téléphone', 'Numéro de téléphone'),
('contact_kind', 'email', 'Email', 'Adresse email'),
('payment_method', 'card', 'Carte bancaire', 'Paiement par carte'),
('environment_tag', 'beach', 'Plage', 'Environnement de plage'),
('amenity_family', 'comfort', 'Confort', 'Équipements de confort');

-- Accès via les partitions spécialisées
SELECT * FROM ref_code_contact_kind WHERE code = 'phone';
SELECT * FROM ref_code_payment_method WHERE code = 'card';
```

### Géolocalisation unifiée

- `object_location.geog2` est une colonne générée à partir de `latitude/longitude` et indexée GIST.
- Les tables `address` et `location` ont été fusionnées en `object_location` pour simplifier la gestion des adresses et coordonnées.
- Support des instructions de direction (`direction`) pour guider les visiteurs.
- Localisations multiples par objet via le flag `is_main_location` et `position`.

## Types d'objets supportés

| Code | Type | Description |
|------|------|-------------|
| HOT | Hôtels | Hôtels et hébergements hôteliers |
| HLO | Hébergements de loisirs | Gîtes, chambres d'hôtes, etc. |
| HPA | Hébergements particuliers | Locations saisonnières, etc. |
| VIL | Villas | Villas de luxe, etc. |
| CAMP | Campings | Campings et hébergements insolites |
| RES | Restaurants | Restaurants et établissements de restauration |
| PCU | Patrimoine culturel | Musées, monuments, sites culturels |
| PNA | Patrimoine naturel | Parcs, réserves, sites naturels |
| ORG | Organismes | Offices de tourisme, associations |
| ITI | Itinéraires | Sentiers, circuits, parcours |
| ASC | Activités | Activités sportives et culturelles |
| COM | Commerce | Boutiques, commerces |
| LOI | Loisirs | Équipements de loisirs |
| FMA | Manifestations | Événements, festivals |

## Exemples de requêtes

### Recherche d'hôtels par ville et classification

```sql
SELECT 
    o.id,
    o.name,
    ol.city,
    cp.name as classification,
    cap.total_rooms,
    array_agg(cc.value) as phones
FROM object o
LEFT JOIN object_location ol ON o.id = ol.object_id AND ol.is_main_location = TRUE
LEFT JOIN LATERAL (
  SELECT (
    SELECT rcv.name FROM object_classification oc 
    JOIN ref_classification_value rcv ON rcv.id = oc.value_id 
    JOIN ref_classification_scheme rcs ON rcs.id = oc.scheme_id 
    WHERE oc.object_id = o.id AND rcs.code = 'prefectoral' LIMIT 1
  ) AS name
) cp ON TRUE
LEFT JOIN LATERAL (
  SELECT 
    MAX(CASE WHEN rm.code='total_rooms' THEN oc.value_integer END) AS total_rooms
  FROM object_capacity oc
  JOIN ref_capacity_metric rm ON rm.id = oc.metric_id
  WHERE oc.object_id = o.id
) cap ON TRUE
LEFT JOIN contact_channel cc ON o.id = cc.object_id 
LEFT JOIN ref_code_contact_kind ck ON ck.id = cc.kind_id AND ck.code = 'phone'
WHERE ol.city ILIKE '%Tampon%'
  AND cp.name IN ('2 étoiles', '3 étoiles')
GROUP BY o.id, o.name, ol.city, cp.name, cap.total_rooms
ORDER BY cp.name, o.name;
```

### Recherche géographique

```sql
SELECT 
    o.id,
    o.name,
    ol.city,
    ST_Distance(
        ol.geog2,
        ST_GeogFromText('POINT(55.5000 -21.2800)')
    ) as distance_meters
FROM object o
LEFT JOIN object_location ol ON o.id = ol.object_id AND ol.is_main_location = TRUE
WHERE o.object_type = 'HOT'
  AND ol.geog2 IS NOT NULL
  AND ST_DWithin(
      ol.geog2,
      ST_GeogFromText('POINT(55.5000 -21.2800)'),
      10000 -- 10 km de rayon
  )
ORDER BY distance_meters;
```

### Statistiques par type d'objet

```sql
SELECT 
    o.object_type,
    COUNT(*) as total_objects,
    COUNT(ol.object_id) as with_location,
    COUNT(cc.object_id) as with_contact,
    AVG(cap.total_rooms) as avg_rooms,
    COUNT(pc.object_id) as pending_changes
FROM object o
LEFT JOIN object_location ol ON o.id = ol.object_id AND ol.is_main_location = TRUE
LEFT JOIN contact_channel cc ON o.id = cc.object_id
LEFT JOIN LATERAL (
  SELECT 
    MAX(CASE WHEN rm.code='total_rooms' THEN oc.value_integer END) AS total_rooms
  FROM object_capacity oc
  JOIN ref_capacity_metric rm ON rm.id = oc.metric_id
  WHERE oc.object_id = o.id
) cap ON TRUE
LEFT JOIN pending_change pc ON o.id = pc.object_id AND pc.status = 'pending'
GROUP BY o.object_type
ORDER BY total_objects DESC;
```

## Sécurité

### Politiques RLS

- **Lecture publique** : Tous les objets sont lisibles publiquement
- **Écriture propriétaire** : Seuls les propriétaires et admins peuvent modifier
- **Tables de référence** : Lecture publique, écriture admin

### Rôles

- `service_role` : Accès complet pour les migrations
- `admin` : Accès complet aux données
- `authenticated` : Accès aux données selon les politiques
- `anon` : Lecture publique uniquement

## Performance

### Index créés

- Index sur les clés étrangères
- Index spatial PostGIS sur `location.geog2` (géolocalisation optimisée)
- Index de recherche textuelle sur `object.name` avec trigram
- Index sur les colonnes de filtrage courantes
- Index GIN pour la recherche full-text
- Index partiels pour les colonnes à faible cardinalité
- Index sur colonnes générées pour la recherche normalisée

### Partitionnement avancé

#### **Tables partitionnées par date**

```sql
-- audit.audit_log - Partitionnement par changed_at
CREATE TABLE audit.audit_log (
  id UUID,
  changed_at TIMESTAMPTZ,
  -- ... autres colonnes ...
  PRIMARY KEY (id, changed_at)  -- Clé primaire composite requise
) PARTITION BY RANGE (changed_at);

-- crm_interaction - Partitionnement par created_at
CREATE TABLE crm_interaction (
  id UUID,
  created_at TIMESTAMPTZ,
  -- ... autres colonnes ...
  PRIMARY KEY (id, created_at)  -- Clé primaire composite requise
) PARTITION BY RANGE (created_at);

-- object_version - Partitionnement par created_at
CREATE TABLE object_version (
  id UUID,
  created_at TIMESTAMPTZ,
  -- ... autres colonnes ...
  PRIMARY KEY (id, created_at)  -- Clé primaire composite requise
) PARTITION BY RANGE (created_at);
```

#### **Partitionnement par domaine (ref_code)**

```sql
-- ref_code - Partitionnement par domaine
CREATE TABLE ref_code (
  id UUID,
  domain TEXT,
  -- ... autres colonnes ...
  PRIMARY KEY (id, domain)  -- Clé primaire composite requise
) PARTITION BY LIST (domain);

-- Partitions automatiques par domaine
CREATE TABLE ref_code_demand_topic PARTITION OF ref_code FOR VALUES IN ('demand_topic');
CREATE TABLE ref_code_contact_kind PARTITION OF ref_code FOR VALUES IN ('contact_kind');
CREATE TABLE ref_code_menu_category PARTITION OF ref_code FOR VALUES IN ('menu_category');
CREATE TABLE ref_code_dietary_tag PARTITION OF ref_code FOR VALUES IN ('dietary_tag');
CREATE TABLE ref_code_allergen PARTITION OF ref_code FOR VALUES IN ('allergen');
-- etc...
```

#### **Maintenance automatique des partitions**

```sql
-- Création automatique de partitions mensuelles
SELECT audit.create_monthly_partition('2024-01-01'::date);
SELECT crm.create_interaction_monthly_partition('2024-01-01'::date);

-- Suppression automatique des anciennes partitions
SELECT audit.drop_old_partitions(12);  -- Garde 12 mois
```

### Optimisations

- **Triggers automatiques** pour `updated_at`
- **Contraintes de validation** des données
- **Normalisation 3NF** pour éviter les redondances
- **Support PostGIS** pour les requêtes géographiques
- **Colonnes générées** pour la recherche normalisée (insensible aux accents)
- **Index partiels** pour optimiser les requêtes sur les statuts
- **Clés étrangères composites** pour les tables partitionnées

## Maintenance

### Vérifications régulières

```sql
-- Vérifier l'intégrité des données
SELECT * FROM post_migration_checks();

-- Nettoyer les données orphelines
DELETE FROM contact_channel WHERE object_id NOT IN (SELECT id FROM object);

-- Mettre à jour les statistiques
ANALYZE object;
ANALYZE address;
ANALYZE contact_channel;
```

### Rollback

```sql
-- Annuler complètement la migration
SELECT rollback_migration();
```

## Problèmes résolus

### 1. Colonnes multi-valeurs
- **Problème** : Listes séparées par virgule dans les CSV
- **Solution** : Tables de liaison M:N normalisées

### 2. Types hétérogènes
- **Problème** : Dates en texte, booléens "Oui/Non", montants avec virgules
- **Solution** : Colonnes _raw + normalisation avec validation

### 3. Nulls incohérents
- **Problème** : Valeurs vides, "N/A", "—" dans les CSV
- **Solution** : Normalisation avec préservation des valeurs brutes

### 4. Doublons et désalignements
- **Problème** : Mêmes entités dans plusieurs feuilles
- **Solution** : ID fonctionnel stable + dédoublonnage

### 5. Formats de contact variés
- **Problème** : Téléphones, emails, URLs non normalisés
- **Solution** : Table `contact_channel` avec validation

### 6. Cohérence sémantique
- **Problème** : Catégories sans référentiel unique
- **Solution** : Tables de référence `ref_*` avec codes stables

### 7. Conformité PostgreSQL
- **Problème** : Syntaxe PostgreSQL invalide et contraintes incompatibles
- **Solution** : Corrections complètes pour la conformité PostgreSQL

#### **Corrections de syntaxe PostgreSQL**

```sql
-- ❌ AVANT - Syntaxe invalide
CREATE TRIGGER IF NOT EXISTS trigger_name ...

-- ✅ APRÈS - Vérification explicite d'existence
IF NOT EXISTS (
  SELECT 1 FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  WHERE t.tgname = 'trigger_name'
) THEN
  CREATE TRIGGER trigger_name ...
END IF;
```

#### **Clés primaires sur tables partitionnées**

```sql
-- ❌ AVANT - Clé primaire simple sur table partitionnée
CREATE TABLE crm_interaction (
  id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ
) PARTITION BY RANGE (created_at);

-- ✅ APRÈS - Clé primaire composite requise
CREATE TABLE crm_interaction (
  id UUID,
  created_at TIMESTAMPTZ,
  PRIMARY KEY (id, created_at)  -- Inclut la colonne de partitionnement
) PARTITION BY RANGE (created_at);
```

#### **Clés étrangères vers tables partitionnées**

```sql
-- ❌ AVANT - Clé étrangère simple vers table partitionnée
CREATE TABLE crm_task (
  related_interaction_id UUID REFERENCES crm_interaction(id)
);

-- ✅ APRÈS - Clé étrangère composite
CREATE TABLE crm_task (
  related_interaction_id UUID,
  related_interaction_created_at TIMESTAMPTZ
);

ALTER TABLE crm_task ADD CONSTRAINT fk_crm_task_related_interaction 
FOREIGN KEY (related_interaction_id, related_interaction_created_at) 
REFERENCES crm_interaction(id, created_at);
```

#### **Index partiels avec contraintes**

```sql
-- ❌ AVANT - Index partiel avec sous-requête (non supporté)
CREATE UNIQUE INDEX uq_actor_channel_email_unique 
ON actor_channel (value) 
WHERE kind_id IN (SELECT id FROM ref_code_contact_kind WHERE code = 'email');

-- ✅ APRÈS - Trigger pour validation complexe
CREATE TRIGGER trg_prevent_duplicate_actor_email
BEFORE INSERT OR UPDATE ON actor_channel
FOR EACH ROW EXECUTE FUNCTION prevent_duplicate_actor_email();
```

### 8. Architecture de partitionnement
- **Problème** : Index fantômes sur partitions inexistantes
- **Solution** : Suppression des références aux partitions fantômes, maintenance automatique des vraies partitions

### 9. Triggers et fonctions
- **Problème** : Ordre de création incorrect (triggers avant fonctions)
- **Solution** : Réorganisation de l'ordre de création, ajout de `DROP IF EXISTS`

### 10. Gestion des schémas
- **Problème** : Schémas `ref` et `crm` utilisés sans création explicite
- **Solution** : Création explicite des schémas avec `CREATE SCHEMA IF NOT EXISTS`

## Nouvelles fonctionnalités

### **Système de versioning des objets**

```sql
-- Table de versioning automatique
CREATE TABLE object_version (
  id UUID,
  object_id TEXT,
  version_number INTEGER,
  data JSONB,  -- État complet de l'objet
  created_at TIMESTAMPTZ,
  created_by UUID,
  change_reason TEXT,
  change_type TEXT,  -- 'create', 'update', 'delete'
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Trigger automatique de versioning
CREATE TRIGGER trg_object_versioning
AFTER INSERT OR UPDATE OR DELETE ON object
FOR EACH ROW EXECUTE FUNCTION create_object_version();
```

### **Gestion des consentements RGPD**

```sql
-- Consentements par canal de communication
CREATE TABLE crm_person_consent (
  person_id UUID REFERENCES crm_person(id),
  channel TEXT,  -- 'email', 'phone', 'sms', 'whatsapp'
  consent_given BOOLEAN NOT NULL,
  consent_date TIMESTAMPTZ,
  consent_method TEXT,  -- 'explicit', 'opt_in', 'opt_out'
  document_id UUID REFERENCES ref_document(id),  -- Preuve du consentement
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### **Recherche textuelle avancée**

```sql
-- Colonnes générées pour recherche normalisée
ALTER TABLE object ADD COLUMN name_normalized TEXT 
GENERATED ALWAYS AS (lower(immutable_unaccent(name))) STORED;

-- Index trigram sur colonnes générées
CREATE INDEX idx_object_name_normalized_trgm 
ON object USING GIN (name_normalized gin_trgm_ops);
```

### **Fonctions d'auto-population**

```sql
-- Auto-population du sujet des interactions CRM
CREATE OR REPLACE FUNCTION api.auto_populate_interaction_subject()
RETURNS TRIGGER AS $$
BEGIN
  -- Génère automatiquement le sujet basé sur le type de demande
  IF NEW.subject IS NULL OR trim(NEW.subject) = '' THEN
    NEW.subject := generate_interaction_subject(NEW.demand_topic_id, NEW.demand_subtopic_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### **Maintenance automatique des partitions**

```sql
-- Fonction de création automatique de partitions
CREATE OR REPLACE FUNCTION audit.create_monthly_partition(partition_date DATE)
RETURNS TEXT AS $$
DECLARE
  partition_name TEXT;
  start_date TIMESTAMPTZ;
  end_date TIMESTAMPTZ;
BEGIN
  partition_name := 'audit_log_' || to_char(partition_date, 'YYYY_MM');
  start_date := date_trunc('month', partition_date);
  end_date := start_date + INTERVAL '1 month';
  
  -- Création de la partition avec index
  EXECUTE format('CREATE TABLE IF NOT EXISTS audit.%I PARTITION OF audit.audit_log
                  FOR VALUES FROM (%L) TO (%L)',
                 partition_name, start_date, end_date);
  
  -- Création des index sur la partition
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_table_name ON audit.%I (table_name)',
                 partition_name, partition_name);
  
  RETURN 'Partition ' || partition_name || ' created successfully';
END;
$$ LANGUAGE plpgsql;
```

## Extensions futures

- **Edge Functions** : API serverless pour les requêtes complexes
- **Cron Jobs** : Synchronisation automatique des données
- **Webhooks** : Notifications en temps réel
- **Réplication** : Pour la haute disponibilité
- **Machine Learning** : Analyse prédictive des interactions CRM
- **API GraphQL** : Interface de requête plus flexible

## Résumé des améliorations majeures

### **🏗️ Architecture et Performance**
- **Partitionnement avancé** : Tables `audit_log`, `crm_interaction`, `object_version` partitionnées par date et `ref_code` par domaine
- **Clés primaires composites** : Conformité PostgreSQL pour les tables partitionnées
- **Clés étrangères adaptées** : Support des références vers tables partitionnées
- **Index optimisés** : Index partiels, trigram, et colonnes générées pour la recherche

### **📍 Géolocalisation et Localisation**
- **Système unifié** : Table `object_location` fusionnant `address` et `location`
- **Multi-localisation** : Support de plusieurs adresses par objet avec `is_main_location`
- **Instructions de direction** : Champ `direction` pour guider les visiteurs
- **Géocodage optimisé** : Colonnes générées et index GIST pour la recherche spatiale

### **⏰ Système d'Ouverture Riche**
- **Horaires flexibles** : `opening_period`, `opening_schedule`, `opening_time_period` pour une gestion complexe
- **Périodes multiples** : Support des horaires saisonniers et exceptionnels
- **API d'ouverture** : Fonction `api.is_object_open_now()` pour vérifier l'état actuel
- **Remplacement du système simple** : Migration complète depuis `opening` et `opening_closed_day`

### **🔧 Référentiel Unifié**
- **Table centralisée** : `ref_code` partitionnée par domaine pour tous les codes de référence
- **Partitions spécialisées** : `ref_code_contact_kind`, `ref_code_payment_method`, etc.
- **Gestion simplifiée** : Un seul modèle pour tous les types de codes
- **Extensibilité** : Ajout facile de nouveaux domaines de référence

### **🛡️ Workflow de Modération**
- **Changements en attente** : Table `pending_change` pour gérer les modifications proposées
- **Flag d'édition** : `object.is_editing` automatiquement géré par triggers
- **API de soumission** : Fonction `api.submit_pending_change()` pour créer des changements
- **Workflow complet** : Statuts pending/approved/rejected/applied avec métadonnées

### **📊 CRM Refactorisé**
- **Modèle orienté demandes** : Suivi des interactions avec les acteurs gérés (non prospection)
- **Types d'interactions** : Appels, emails, rendez-vous, visites, WhatsApp, SMS, notes
- **Auto-population** : Sujet des interactions généré automatiquement
- **Gestion des tâches** : Système de suivi avec priorités et échéances
- **Consentements RGPD** : Gestion des autorisations par canal de communication

### **🔧 Conformité PostgreSQL**
- **Syntaxe valide** : Correction de `CREATE TRIGGER IF NOT EXISTS` et autres syntaxes invalides
- **Contraintes adaptées** : Index partiels sans sous-requêtes, triggers pour validation complexe
- **Ordre de création** : Fonctions définies avant les triggers qui les utilisent
- **Gestion des schémas** : Création explicite des schémas `ref` et `crm`

### **📈 Nouvelles Fonctionnalités**
- **Versioning des objets** : Historique complet des modifications avec `object_version`
- **Recherche normalisée** : Colonnes générées pour recherche insensible aux accents
- **Maintenance automatique** : Fonctions pour créer et supprimer les partitions
- **Audit complet** : Journalisation automatique des changements avec métadonnées

### **🎯 Optimisations**
- **Performance** : Partition pruning automatique, index optimisés
- **Maintenance** : Suppression des index fantômes, gestion automatique des partitions
- **Évolutivité** : Structure modulaire et extensible
- **Documentation** : Commentaires complets et exemples d'utilisation

## Support

Pour toute question ou problème :
1. Vérifier les logs de migration
2. Exécuter les tests de validation
3. Consulter les données legacy pour debug
4. Utiliser les fonctions de comparaison données normalisées vs brutes
5. Consulter la documentation des nouvelles fonctionnalités CRM et de partitionnement
