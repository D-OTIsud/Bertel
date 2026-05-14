# Base de donnee DLL et API

## Contexte

Ce dossier contient le schema SQL principal, les fonctions RPC exposees dans le schema `api`, les politiques RLS, les seeds, et les scripts de performance/maintenance pour Bertel 3.0 sur Supabase.

## Fichiers presents

```text
Base de donnee DLL et API/
├── schema_unified.sql
├── api_views_functions.sql
├── rls_policies.sql
├── ui_whitelabel_branding.sql
├── seeds_data.sql
├── test_performance.sql
├── maintenance.sql
└── README.md
```

## Ordre de deploiement recommande

### Prerequis extensions PostgreSQL (avant le schema)

Sur un projet Supabase/PostgreSQL neuf, activez d'abord les extensions suivantes:

```sql
CREATE SCHEMA IF NOT EXISTS extensions;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "unaccent" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS btree_gist;
```

Optionnel (uniquement si vous planifiez des taches programmees SQL):

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
```

```sql
-- 1) Schema
\i schema_unified.sql

-- 2) Fonctions API
\i api_views_functions.sql

-- 3) Politiques RLS
\i rls_policies.sql

-- 4) Branding UI et parametres white-label
\i ui_whitelabel_branding.sql

-- 5) Donnees de seed (optionnel)
\i seeds_data.sql
```

## Fonctions API principales (existantes)

### Ressource objet

- `api.get_object_resource(p_object_id, p_lang_prefs, p_track_format, p_options)`
- `api.get_object_resources_batch(p_ids, p_lang_prefs, p_track_format, p_options)`

Exemple:

```sql
SELECT api.get_object_resource(
  'HOTRUN0000000001',
  ARRAY['fr', 'en'],
  'none',
  '{}'::jsonb
);
```

### Listing et pagination

- `api.list_object_resources_page(...)`
- `api.list_object_resources_page_text(...)`
- `api.list_object_resources_since_fast(...)`
- `api.list_object_resources_since_fast_text(...)`
- `api.list_object_resources_filtered_page(...)`
- `api.list_object_resources_filtered_since_fast(...)`

Exemple page-based (signature actuelle):

```sql
SELECT api.list_object_resources_page_text(
  p_cursor := NULL,
  p_page_size := 20,
  p_types := ARRAY['HOT', 'RES']::text[],
  p_status := ARRAY['published']::text[],
  p_search := 'restaurant'
);
```

Exemple since/keyset:

```sql
SELECT api.list_object_resources_since_fast_text(
  p_since := NOW() - INTERVAL '7 days',
  p_cursor := NULL,
  p_limit := 50,
  p_types := ARRAY['ITI']::text[],
  p_status := ARRAY['published']::text[]
);
```

### Vue carte / recherche

- `api.list_objects_map_view(...)`
- `api.search_objects_by_label(...)`
- `api.search_restaurants_by_cuisine(...)`

Exemple:

```sql
SELECT api.list_objects_map_view(
  p_types := ARRAY['HOT', 'RES'],
  p_filters := jsonb_build_object(
    'bbox', jsonb_build_array(2.0, 48.5, 3.0, 49.0)
  ),
  p_limit := 200
);
```

### Media / reviews / room types

- `api.get_media_for_web(...)`
- `api.get_object_reviews(...)`
- `api.get_object_room_types(...)`

### Itineraires

- `api.export_itinerary_gpx(...)`
- `api.get_itinerary_track_geojson(...)`

### Systeme legal

- `api.get_object_legal_data(p_object_id)`

### Modifications validees

- `api.list_objects_with_validated_changes_since(p_since timestamptz)`
- Retour: tableau JSON des `object_id`.
- Acces: reserve `service_role` / `admin` (controle dans la fonction et via RLS).

Exemple:

```sql
SELECT api.list_objects_with_validated_changes_since(
  NOW() - INTERVAL '30 days'
);
```

## Tables importantes

- `object` (entite centrale + colonnes de cache)
- `object_location` (adresse + geolocalisation unifiees, `geog2`)
- `object_taxonomy` (rattachement hierarchique d un objet a un noeud `ref_code`)
- `ref_code_domain_registry` (registre des domaines `ref_code` utilises comme taxonomies)
- `ref_code_taxonomy_closure` (ancetres/descendants denormalises pour filtres et breadcrumbs)
- `object_classification` (classements officiels, labels, distinctions et donnees datees associees)
- `pending_change` (workflow de moderation)
- `object_version` (historisation/versions)
- `object_legal` (suivi legal unifie)
- `media`, `object_review`, `object_room_type`, `object_menu*`

## Taxonomie hierarchique

La sous-categorisation metier n est plus stockee dans `object_classification`.

- `object_type` reste le type structurel principal de la fiche.
- `object_taxonomy` porte la sous-categorie hierarchique la plus precise par domaine.
- `ref_code` porte les noeuds de taxonomie, scopes par `domain`, avec `parent_id` pour la hierarchie.
- `object_classification` reste reserve aux vraies qualifications: etoiles, labels, distinctions, et enregistrements avec `status`, `requested_at`, `awarded_at`, `valid_until`, `document_id` ou `subvalue_ids`.

Impacts API:

- `api.get_object_resource(...)` expose un bloc top-level `taxonomy`.
- Le bloc `classifications` est qualification-only.
- Les filtres de listing peuvent utiliser `taxonomy_any` pour filtrer sur les noeuds et leurs descendants.

## Note de deploiement `ref_code`

Le modele cible impose une unicite stricte sur `ref_code(domain, code)`.

- Le schema cree donc `uq_ref_code_domain_code`.
- Les seeds doivent rester idempotentes via des upserts deterministes sur `(domain, code)`.
- Si vous voyez encore `could not create unique index ... (domain, code)=... is duplicated`, cela veut dire que la base contient deja des lignes dupliquees issues d un chargement partiel precedent. Dans ce cas, sur une base de projet neuve, le bon choix est de nettoyer ou recreer la base puis de relancer le bootstrap complet.

## Performance

- Recherche full-text: `name_search_vector` et `city_search_vector` (GIN).
- Geospatial: indexes GiST sur `geog2`.
- Projection filtree: `mv_filtered_objects` (vue materialisee hot-path pour endpoints filtres).
- Index keyset ajoutes pour synchronisation:
  - `idx_object_updated_at_id`
  - `idx_object_updated_at_source_id`
  - variantes partielles `published`.
- Index endpoint modifications validees:
  - `idx_pending_change_validated_effective_ts`.

## RLS et securite

- RLS active dans `rls_policies.sql`.
- Fonctions `SECURITY DEFINER` sensibles avec `SET search_path` explicite.
- Eviter les grants globaux sur toutes les fonctions `api`; preferer une allowlist (voir `docs/SUPABASE_SETUP.md`).

## Scripts operationnels

### Benchmark

```sql
\i test_performance.sql
```

### Maintenance

```sql
\i maintenance.sql
```

Recommandation de rafraichissement `mv_filtered_objects`:

```sql
-- Toutes les 5 minutes (SLA listing/filtrage)
SELECT cron.schedule(
  'refresh-mv-filtered-objects',
  '*/5 * * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY mv_filtered_objects$$
);
```

Points de stale possibles pour `mv_filtered_objects`:
- changements de localisation principale (`object_location`)
- transitions de statut editorial (`object.status`)
- changements de nom / index de recherche (`object.name*`)
- evolution des caches denormalises (`cached_*`)

Mitigation en place:
- refresh `CONCURRENTLY` planifie via `pg_cron` toutes les 5 minutes.
- compromis accepte: les endpoints listing/filtrage peuvent renvoyer des donnees avec un retard maximum cible de 5 minutes.

Recommandation de rafraichissement `cached_is_open_now`:

```sql
SELECT cron.schedule(
  'refresh-open-status',
  '*/5 * * * *',
  $$SELECT api.refresh_open_status()$$
);
```

Fenetre de staleness cible:
- API de listing/filtrage basee sur la MV: <= 10 minutes.
- Champ `object.cached_is_open_now`: <= 5 minutes.
- Endpoints detail objet: temps reel (tables source).

## Gouvernance timezone (open_now)

- Source de verite: `object.business_timezone` (IANA timezone name), default `Indian/Reunion`.
- Validation: la valeur est verifiee contre `pg_timezone_names` a l'ecriture.
- Calcul metier: `api.is_object_open_now()` et `api.refresh_open_status()` comparent les plages `opening_time_frame` a l'heure locale objet (`CURRENT_TIMESTAMP AT TIME ZONE object.business_timezone`), pas au timezone serveur.
- Frontieres horaires: avec un refresh cron toutes les 5 minutes, un changement d'etat (ex: fermeture a 18:00) est reflechi au plus tard sous ~5 minutes.

## Gouvernance i18n

- Canonique: colonnes JSONB `*_i18n` (lecture standard via `api.i18n_pick` / `api.i18n_pick_strict`).
- Overflow/extension: table EAV `i18n_translation` (cas sans colonne `*_i18n` native).
- Garde-fou actif: insertion/mise a jour dans `i18n_translation` est bloquee quand `target_table.target_column_i18n` existe deja.

## Notes

- Cette documentation remplace les references historiques a des vues/fichiers qui ne sont plus presents.
- Pour le runbook de deploiement SQL, voir `docs/SQL_ROLLOUT_RUNBOOK.md`.
