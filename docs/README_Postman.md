# Collection Postman - API Bertel v3.0

Cette collection Postman fournit une interface complète pour tester et explorer l'API Bertel v3.0.

## 📁 Fichiers inclus

- `Bertel_API_v3.postman_collection.json` - Collection principale
- `Bertel_API_v3.postman_environment.json` - Environnement avec variables
- `README_Postman.md` - Ce guide d'utilisation

## 🚀 Installation

### 1. Importer la collection
1. Ouvrez Postman
2. Cliquez sur **Import**
3. Sélectionnez le fichier `Bertel_API_v3.postman_collection.json`

### 2. Importer l'environnement
1. Dans Postman, cliquez sur **Environments**
2. Cliquez sur **Import**
3. Sélectionnez le fichier `Bertel_API_v3.postman_environment.json`

### 3. Configurer l'environnement
1. Sélectionnez l'environnement "Bertel API v3.0 - Environment"
2. Modifiez les variables :
   - `base_url` : URL de votre API (ex: `https://api.bertel.example.com`)
   - `apikey` : Votre clé API
   - `authorization` : Votre token Bearer (optionnel)

## 📋 Structure de la collection

### 1. Authentication & Headers
- **Test Authentication** : Vérification de l'authentification

### 2. Core Endpoints
- **Get Object Resource** : Récupérer une ressource spécifique
- **List Object Resources (Page)** : Lister avec pagination par curseur (`p_cursor`, `p_page_size`)
- **List Object Resources (Since)** : Lister depuis une date (keyset)
- **List Objects with Validated Changes Since** : IDs d'objets avec modifications validées depuis une date (accès `service_role`/`admin`)

### 3. Advanced Filtering
- **List with Rich Filters (Page)** : Filtres avancés + pagination
- **List with Rich Filters (Since)** : Filtres avancés + synchronisation

### 4. Filter Examples
- **Equipment & Services Filters** : Exemples de filtres équipements
- **Media Filters** : Exemples de filtres médias
- **Geolocation Filters** : Exemples de filtres géolocalisation
- **Itinerary Filters** : Exemples de filtres itinéraires
- **Capacity & Classification Filters** : Exemples de filtres capacité

### 5. Track Data Examples
- **Get Itinerary with KML Track** : Récupérer tracé KML
- **Get Itinerary with GPX Track** : Récupérer tracé GPX

### 6. Deep Data
- **Get Object with Deep Data** : Récupérer un objet avec parents, acteurs et organisations
- **Search Objects with Deep Data** : Recherche avec inclusion automatique des données liées

### 7. Search & Discovery
- **Search Objects by Label** : Recherche par labels de durabilité avec correspondances partielles
- **List Objects Map View** : Vue carte allégée (payload minimal pour marqueurs)
- **Search Restaurants by Cuisine** : Recherche spécialisée par types de cuisine

### 8. Media
- **Get Media for Web** : Médias filtrés pour le web (exclut internes/brouillons, sélection intelligente)

### 9. Reviews & Room Types
- **Get Object Reviews** : Avis avec agrégats (note moyenne, nombre total)
- **Get Object Room Types** : Types de chambres avec équipements, capacités et tarifs

### 10. Promotions
- **Validate Promotion Code** : Validation de codes promotionnels avec vérification temporelle

### 11. Track & GPX Export
- **Export Itinerary GPX** : Export GPX complet avec métadonnées et waypoints
- **Export Itineraries GPX Batch** : Export batch pour plusieurs itinéraires
- **Get Itinerary Track GeoJSON** : Tracé GeoJSON FeatureCollection (Leaflet, Mapbox)

### 12. Legal System
- **Add Legal Record** : Ajouter un enregistrement juridique (assurance, licence, certification)
- **Get Object Legal Data** : Récupérer tous les enregistrements juridiques d'un objet
- **Get Object Legal Compliance** : Vérifier la conformité (documents manquants, expirés)
- **Get Expiring Legal Records** : Lister les enregistrements arrivant à expiration
- **Request Legal Document** : Marquer un document comme demandé (workflow)
- **Get Pending Document Requests** : Lister les demandes de documents en attente

### 13. API Publique Partenaire (`/api/public/*`)
> Surface **tierce** dédiée : un prestataire externe passe par cette passerelle (jamais PostgREST direct). Auth par **clé partenaire** `Authorization: Bearer bk_live_…` (variable `partner_key`), base = `public_base_url`. Enveloppe `{ meta, data }`, `meta.contract_version` + header `X-Bertel-Api-Version`, fiches **publiées** uniquement. Lancer « Lister les fiches publiées » en premier (remplit `object_id`).

- **Lister les fiches publiées** : `GET /api/public/objects` (curseur, `page_size`, `types`, `search`, `lang`)
- **Récupérer une fiche publiée** : `GET /api/public/objects/{id}`
- **Fiche + JSON-LD schema.org (I4)** : `GET /api/public/objects/{id}?format=jsonld` → bloc additif `data.jsonld` (document schema.org, `@type` selon le type d'objet ; prêt pour SEO / interop)
- **Fiche — toutes les langues (C-5)** : `GET /api/public/objects/{id}?lang=all` → bloc additif `data.i18n`
- **Flux tombstone (C-4)** : `GET /api/public/objects/deletions?since=…` (suppressions définitives, pour miroir partenaire)
- **Catalogues de référentiels (I1)** : `GET /api/public/catalog?domains=…`

## 🔧 Variables d'environnement

| Variable | Description | Exemple |
|----------|-------------|---------|
| `base_url` | URL de base de l'API (PostgREST/RPC) | `https://api.bertel.example.com` |
| `apikey` | Votre clé API | `your-api-key-here` |
| `authorization` | Token Bearer (optionnel) | `Bearer your-token-here` |
| `public_base_url` | URL de l'app (passerelle partenaire `/api/public/*`) | `https://app.bertel.example.com` |
| `partner_key` | Clé partenaire Bearer pour `/api/public/*` (émise par l'OTI) | `bk_live_…` |
| `object_id` | ID d'objet (auto-rempli) | Auto-généré |
| `itinerary_id` | ID d'itinéraire (auto-rempli) | Auto-généré |
| `current_timestamp` | Timestamp actuel (auto-généré) | Auto-généré |

## 🧪 Tests automatiques

Chaque requête inclut des tests automatiques :
- ✅ Vérification du code de statut (200)
- ✅ Vérification du Content-Type JSON
- ✅ Validation de la structure de réponse
- ✅ Sauvegarde automatique des IDs pour les requêtes suivantes

## 📊 Exemples d'utilisation

### Récupérer une ressource
```json
{
  "p_object_id": "example-id",
  "p_lang_prefs": ["fr", "en"],
  "p_track_format": "none"
}
```

### Lister avec pagination
```json
{
  "p_cursor": null,
  "p_page_size": 20,
  "p_types": ["ITI", "HER"],
  "p_status": ["published"]
}
```

### Filtrer par équipements
```json
{
  "p_cursor": null,
  "p_page_size": 20,
  "p_filters": {
    "amenities_any": ["PARKING", "WIFI"],
    "pet_accepted": true
  }
}
```

### Synchronisation depuis une date
```json
{
  "p_since": "2024-04-01T00:00:00Z",
  "p_cursor": null,
  "p_limit": 50
}
```

## 🔍 Filtres disponibles

### Équipements & Services
- `amenities_any` / `amenities_all` : Équipements
- `amenity_families_any` : Familles d'équipements
- `pet_accepted` : Animaux acceptés
- `payment_methods_any` : Moyens de paiement
- `environment_tags_any` : Tags environnement
- `languages_any` : Langues parlées

### Médias
- `media_types_any` : Types de médias
- `media_published_only` : Médias publiés uniquement
- `media_must_have_main` : Doit avoir un média principal

### Géolocalisation
- `within_radius` : Dans un rayon
- `bbox` : Dans une bounding box

### Itinéraires
- `itinerary` : Critères d'itinéraire (boucle, difficulté, distance, durée, pratiques)

### Capacité & Classement
- `capacity_filters` : Filtres de capacité
- `classifications_any` : Classifications
- `tags_any` : Tags
- `meeting_room` : Salle de réunion

### Disponibilité
- `open_now` : Ouvert maintenant

## 🎯 Conseils d'utilisation

1. **Commencez par** "Test Authentication" pour vérifier votre configuration
2. **Utilisez** les exemples de filtres pour comprendre les possibilités
3. **Les variables** sont automatiquement remplies par les scripts
4. **Les tests** vous donnent un retour immédiat sur la validité des réponses
5. **Copiez** les exemples de requêtes pour vos propres développements
6. **Pagination** : pour les endpoints *Page*, utilisez `p_cursor` et `p_page_size` (pas `p_page`)

## 📚 Documentation complète

Pour plus de détails sur l'API, consultez la documentation complète dans `index.html`.

## 🤝 Support

Pour toute question ou problème :
- Consultez la documentation API
- Vérifiez vos variables d'environnement
- Testez avec "Test Authentication" en premier
