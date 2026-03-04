# Documentation API Bertel v3.0

Documentation complète de l'API Bertel v3.0 avec interface moderne et collection Postman.

> **Note** : Cette documentation fait partie du projet [Bertel](../README.md).

## 🚀 Déploiement

### Avec Coolify

1. **Naviguer vers le dossier docs** : `cd docs/`
2. **Configurer dans Coolify** :
   - Type : Dockerfile
   - Port : 80
   - Domaine : Votre domaine personnalisé
   - **Dockerfile Path** : `./docs/Dockerfile`

3. **Déploiement automatique** à chaque push

### Configuration Supabase (self‑hosted)

Voir le guide: [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md)

### Avec Docker local

```bash
# Depuis la racine du projet
cd docs/
docker build -t bertel-api-docs .
docker run -p 8080:80 bertel-api-docs
```

## 📁 Structure

- `index.html` - Documentation principale
- `Bertel_API_v3.postman_collection.json` - Collection Postman
- `Bertel_API_v3.postman_environment.json` - Environnement Postman
- `README_Postman.md` - Guide d'utilisation Postman

## ✨ Fonctionnalités

- **Interface moderne** avec thème #76B097
- **Navigation latérale** synchronisée
- **Mode sombre/clair** avec persistance
- **Recherche globale** dans la documentation
- **Collection Postman** intégrée
- **Bouton flottant** pour toggle des sections
- **Responsive design** pour tous les écrans

## 🗂️ Structure de données de l'API

Pour comprendre les réponses de l'API et la logique métier exposée dans la documentation web (`index.html`), voici les blocs
principaux du modèle de données PostgreSQL :

- **Objets touristiques (`object`)** : entité centrale regroupant tous les types (hébergements, activités, itinéraires, événements,
  etc.) avec méta-informations communes (statut, dates de publication, indicateurs d'édition en cours).
- **Localisation unifiée (`object_location`)** : remplace les anciennes tables `address` et `location` en regroupant adresse
  postale, coordonnées géographiques et zones desservies (`object_zone`).
- **Contenus multilingues (`object_description`, colonnes `*_i18n`)** : descriptions, chapôs, infos mobiles et traductions gérées
  soit en JSONB, soit via la table générique `i18n_translation` accessible depuis les vues `api.*`.
- **Contacts et médias (`contact_channel`, `media`)** : gestion des téléphones, emails, réseaux sociaux et ressources médias
  associées (y compris les médias spécifiques à un point de rencontre via `media.place_id`).
- **Référentiels (`ref_code`, `ref_classification_scheme`, `ref_classification_value`)** : codes normalisés pour les types, labels,
  classements ou tags. Les liens objets ↔ référentiels se font via `object_classification` et `object_capacity`.
- **Accessibilité & labels handicap (`object_classification` / schéma `HANDICAP_LABEL`)** : stocke les niveaux « Tourisme & Handicap », leurs dates de validité, et les handicaps couverts (moteur, visuel, auditif, mental) via `subvalue_ids` → `ref_classification_value`.
- **Système d'ouverture (`opening_period`, `opening_schedule`, `opening_time_period`)** : structure hiérarchique permettant de
  décrire des plages d'ouverture complexes et des exceptions.
- **Workflow de modération (`pending_change`, `object_version`)** : suivi des modifications proposées et historisation des versions
  avant/après pour audit.
- **API JSON** : fonctions exposées dans le schéma `api` (ex. `api.get_object_resource`,
  `api.list_object_resources_page`, `api.search_objects_by_label`, `api.get_object_legal_data`) qui assemblent ces données pour produire les payloads documentés.
- **Classification des médias (`media_tag`)** : 23 tags prédéfinis (contenu, qualité, exclusion) pour un affichage intelligent
  sur le web. Les médias avec tags d'exclusion (interne, archive, brouillon) sont automatiquement filtrés.
  Image principale sélectionnée par priorité de tags via `api.get_media_for_web()`.
- **Statut des itinéraires (`open_status`)** : suivi d'ouverture (open/closed/partially_closed/warning) avec lien vers
  les documents officiels (arrêtés préfectoraux).
- **Performance & caching** : agrégats cachés (`cached_min_price`, `cached_main_image_url`), vue matérialisée
  `mv_ref_data_json`, recherche full-text via `tsvector`, pagination par curseur Base64URL, API carte allégée.
- **Infrastructure** : environnement Supabase géré, maintenance quotidienne automatisée, suite de tests EXPLAIN ANALYZE.
- **Système juridique complet** : gestion des documents légaux (assurances, licences, certifications), suivi de conformité, alertes
  d'expiration, workflow de demande/livraison de documents, 15+ types juridiques prédéfinis. Fonctions : `add_legal_record`,
  `get_object_legal_compliance`, `get_expiring_legal_records_api`, `audit_legal_compliance`.
- **Export GPX & traces** : export complet ou simplifié (KML, GPX, GeoJSON) avec métadonnées et waypoints, batch export,
  simplification Douglas-Peucker pour affichage carte léger. Fonctions : `export_itinerary_gpx`, `get_itinerary_track_geojson`.
- **Avis & types de chambres** : importation d'avis externes avec agrégats, gestion des types de chambres (hébergements) avec
  équipements, capacités et tarifs. Fonctions : `get_object_reviews`, `get_object_room_types`.
- **Recherche & découverte** : recherche par labels de durabilité, vue carte allégée (payload minimal), recherche par cuisine.
  Fonctions : `search_objects_by_label`, `list_objects_map_view`, `search_restaurants_by_cuisine`.
- **Promotions** : validation de codes promotionnels avec vérification temporelle et applicabilité. Fonction : `validate_promotion_code`.

Chaque section de la documentation fait référence à ces structures : lorsque vous consultez une ressource dans l'interface web,
les champs proviennent directement de ces tables ou vues. Pour une vision exhaustive, reportez-vous au schéma SQL dans
`../Base de donnée DLL et API/schema_unified.sql`, aux fonctions API dans
`../Base de donnée DLL et API/api_views_functions.sql`, et au runbook de déploiement SQL
`./SQL_ROLLOUT_RUNBOOK.md`.

## 🔗 Liens utiles

- [Collection Postman publique](https://www.postman.com/docking-module-astronaut-45890211/oti-du-sud-bertel-v3/collection/61gyd5k/bertel-api-v3-0)
- Documentation déployée : [Votre domaine]

## 📝 Maintenance

- Mise à jour de la documentation : Modifier `index.html`
- Redéploiement automatique via Coolify
- Collection Postman : Mettre à jour les fichiers JSON
