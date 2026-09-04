# Base de donnee DLL et API

## Contexte

Ce dossier contient le schema SQL principal, les fonctions RPC exposees dans le schema `api`, les politiques RLS, les seeds, et les scripts de performance/maintenance pour Bertel 3.0 sur Supabase.

## Fichiers presents

```text
Base de donnee DLL et API/
├── Fresh install core
│   ├── schema_unified.sql
│   ├── migration_sustainability_v5.sql
│   ├── migration_room_type_ref.sql
│   ├── migration_tag_link_position.sql
│   ├── api_views_functions.sql
│   ├── rls_policies.sql
│   ├── object_workspace_safe_write_rpcs.sql
│   ├── object_workspace_gap_rpcs.sql
│   ├── ui_whitelabel_branding.sql
│   ├── media_bucket.sql
│   └── seeds_data.sql
├── Post-seed / post-import fixups
│   ├── migration_legal_siret_canonical.sql
│   └── migration_object_location_address1_dedupe.sql
├── Maintenance and benchmarks
│   ├── maintenance.sql
│   └── test_performance.sql
├── Upgrade-only patch
│   └── branding_admin_profile_role_patch.sql
├── Local / pilot-only inserts
│   └── lot1_pilot_inserts.sql
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
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

Optionnel (uniquement si vous planifiez des taches programmees SQL):

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
```

> ⚠ **EXTRAIT INDICATIF, PAS UN MANIFESTE.** Le bloc ci-dessous est une liste **partielle**,
> tenue a la main et incomplete depuis longtemps (CRM, listes, moderation, documents
> prestataires et outbox e-mail n'y figurent pas). Le jouer tel quel produit une base
> partielle, voire echoue. **La seule voie d'installation executable et tenue a jour est
> `ci_fresh_apply.sql`** (manifeste ordonne complet, joue par la CI a chaque push) ; l'ordre
> autoritaire et les caveats sont dans `docs/SQL_ROLLOUT_RUNBOOK.md`.

```sql
-- 1) Schema
\i schema_unified.sql

-- 2) Migrations DDL (AVANT api/seeds ; ajoutent colonnes/tables requises)
\i migration_sustainability_v5.sql
\i migration_room_type_ref.sql
\i migration_tag_link_position.sql
\i migration_iti_duration_elevation.sql

-- 3) Fonctions API
\i api_views_functions.sql

-- 4) Politiques RLS (definit api.is_object_owner)
\i rls_policies.sql

-- 5) RPC d'ecriture editeur (schema internal + sections restantes)
\i object_workspace_safe_write_rpcs.sql
\i object_workspace_gap_rpcs.sql

-- 5b) SP-1 autorisation d'ecriture canonique (apres les RPC workspace, avant le branding)
\i migration_permission_write_paths.sql
-- 5c) SP-1b couverture canonique complete (tables editeur restantes)
\i migration_permission_write_paths_b.sql
-- 5d) P0.3 garde-lecture RLS (tables enfant: objet publie OU can_read_extended)
\i migration_rls_read_gate_p03.sql
-- 5e) SP-4 RPC lecture roster api.rpc_list_org_members (identites membres pour la page admin equipe)
\i migration_sp4_list_org_members.sql
-- 5f) RPC machine a etats du statut objet api.rpc_set_object_status (+ rpc_publish_object devient un wrapper)
\i migration_object_status_lifecycle.sql
-- 5g) Correctif securite RLS object_act (lecture/ecriture gardees comme les tables enfant soeurs)
\i migration_object_act_rls.sql
-- 5h) Menage: RLS sur 3 tables ref_* + suppression des 5 tables de sauvegarde *_bak_20260519_082607z
\i migration_rls_ref_and_bak_cleanup.sql
-- 5i) §41 zones: ref_commune (24 communes de La Reunion) + RLS + FK object_zone.insee_commune
\i migration_ref_commune.sql
-- 5j) §46 registre type->facette: ref_facet_registry + ref_facet_applicability + triggers d'applicabilite (+ violations fn)
\i migration_facet_applicability.sql
-- 5k) §47 object_fma: triple de politiques d'ecriture par commande (canonical_ins/upd/del) -- corrige l'upsert FMA RLS-refuse
\i migration_object_fma_write_policy.sql
-- 5l) §47 convergence: 93 politiques FOR ALL -> triples par commande (canonical/admin_ins/upd/del) sur 57 tables enfant
\i migration_write_policy_percommand.sql
-- 5m) §38 lectures: 25 politiques de lecture plates passent au gabarit ensembliste (InitPlan unique au lieu d'un scalaire par ligne)
\i migration_child_read_gate_setbased.sql
-- 5n) §48 applicabilite object_act etendue a ASC (les deux types ASC et ACT portent object_act)
\i migration_object_act_asc_applicability.sql
-- 5o) §48 chemin d'ecriture acteurs: actor_object_role en politiques par commande (canonical_ins/upd/del) + branche actors de save_object_relations + RPC api.search_actors (gate editeurs, perimetre acteurs lisibles + echappement des jokers LIKE)
\i migration_actor_links_editor.sql
-- 5p) §193 conformite juridique: permission dediee + retroattribution aux editeurs + RLS object_legal
\i migration_unblock_team_legal_access.sql

-- 6) Branding UI white-label (fichier complet pour une install neuve)
\i ui_whitelabel_branding.sql

-- 7) Bucket de stockage media
\i media_bucket.sql
-- 7b) Bucket prive des justificatifs juridiques
\i legal_documents_bucket.sql

-- 8) Donnees de seed (necessite migration_sustainability_v5)
\i seeds_data.sql

-- 9) Correctifs de donnees APRES seeds (no-op sur base neuve)
\i migration_legal_siret_canonical.sql
\i migration_object_location_address1_dedupe.sql
-- §46: seed ref_capacity_applicability (facettes capacite Explorer HOT/RES) -- necessite ref_capacity_metric (seeds)
\i migration_capacity_applicability_seed.sql

-- 10) et 11) NE SONT PAS EXECUTABLES DEPUIS CE BLOC -- voir l'avertissement plus haut.
--     Les deux chantiers ci-dessous sont documentes ICI parce qu'ils sont recents et qu'on
--     les cherche d'abord dans ce fichier ; leur SEULE voie d'execution est
--     `ci_fresh_apply.sql` (manifeste ordonne complet) et `docs/SQL_ROLLOUT_RUNBOOK.md`.
--
-- 10) 227 -- le role metier CONFERE les droits (matrice org_role_permission), l'ecriture CRM
--     exige la permission, l'ecriture d'une liste appartient a son createur, la creation
--     d'une liste est reservee au superuser plateforme. Quatre fichiers, dans cet ordre :
--       migration_role_permission_matrix.sql        (17i)
--       migration_crm_write_requires_permission.sql (17j)
--       migration_list_write_creator_only.sql       (17k)
--       migration_list_create_superuser_only.sql    (17l)
--     Ces quatre etapes etaient deja en production et absentes du manifeste comme de ce
--     fichier : dette de packaging rattrapee au packaging du portail acteur, qui depend
--     d'org_role_permission. Prerequis ABSENTS de ce bloc : migration_crm_module.sql
--     (api.current_user_crm_object_ids, exigee par 17j) et migration_object_list.sql
--     (object_list / api.create_list, exigees par 17k et 17l).
--
-- 11) Portail acteur (18a, migration_actor_portal.sql) : persona `actor`, portee dediee,
--     D7 (l'acteur n'ecrit pas le canonique), fiche_submission + tache de verification
--     multi-assignee, D9 (validation totale ou partielle, manual_apply acquittable),
--     outbox elargie. Prerequis ABSENTS de ce bloc, en plus des quatre ci-dessus :
--     migration_moderation_rpcs.sql (pending_change / approve_pending_change),
--     supabase/migrations/20260807124408_actor_prospects_documents.sql et
--     migration_crm_task_email_documents.sql (colonnes d'outbox email_* de app_notification,
--     et corps canonique de api.list_crm_tasks que 18a redeploie).
--     L'ordre reel et les trois contraintes qui le fixent sont dans le manifeste et au
--     runbook, section `## 18a` -- ils ne se deduisent PAS de ce bloc.
--     NE PAS jouer migration_gdpr_erasure.sql APRES 18a : cette redaction ignore la branche
--     acteur et effacerait le deliage du compte portail, sans lever.

-- Ordre complet + refresh MV + rollback : voir docs/SQL_ROLLOUT_RUNBOOK.md
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

### Regle d import HLO : nature avant forme

Pour tout import d hebergement HLO, la categorie source et la sous-categorie sont deux axes differents :

1. la categorie source choisit d abord la branche de **nature** (`chambre_d_hotes`, `location_saisonniere`, `hebergement_collectif`) ;
2. la sous-categorie ne choisit ensuite qu une feuille de **forme sous cette branche** ;
3. si la forme est inconnue ou absente, conserver le noeud de nature ;
4. si nature et forme se contredisent, envoyer la fiche en arbitrage PO et ne jamais laisser la forme ecraser silencieusement la nature.

La synchronisation Berta vivante ne cree actuellement aucune affectation `object_taxonomy`. Tout futur ingesteur qui le fera doit appliquer cette regle et executer la garde rejouable documentee dans `docs/taxonomy-hlo-nature-forme-2026-07-24.md`.

Le crosswalk DATAtourisme peut affiner la classe HLO sans changer le contrat de l API prestataire : `migration_interop_crosswalk_leafaware.sql` choisit le noeud taxonomique mappe le plus proche via la closure (`depth ASC`), puis retombe sur le mapping generique de l `object_type`. Les profils schema.org, Apidae et Tourinsoft restent sur leur mapping de type.

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

### Realm de test (bac a sable) — 18a/18b

Un unique predicat cloisonne le corpus de test, ecrit partout a l'identique :

    o.is_test = (SELECT api.current_user_test_realm())

Une EGALITE, donc les deux sens a la fois : le corpus de test ne sort pas, et le compte de test
ne voit pas la production.

- `object.is_test` est **denormalise mais entretenu par trigger** depuis `org_config.is_test_org`.
  Ne jamais l'ecrire a la main : l'organisation est la source de verite.
- `api.current_user_test_realm()` est la feuille unique. `pg_temp` **en dernier** dans son
  `search_path` (§208/R2.1). Elle ne renvoie JAMAIS NULL — c'est ce qui permet l'egalite.
- Toute policy de lecture testant `status='published'` DOIT porter le predicat. Un `DO` block de
  `migration_test_org_isolation.sql` refuse de valider sinon, et `tests/test_test_org_isolation.sql`
  le reverifie (bloc A).
- **L'API partenaire appelle en `service_role`, qui court-circuite la RLS** : le predicat est
  ecrit dans les corps de fonction, pas seulement dans les policies. Toute nouvelle fonction
  `SECURITY DEFINER` ou servie au partenaire doit le porter.
- Les tombstones (`object_deletion_log.is_test`) figent le realm A LA SUPPRESSION : l'objet
  n'existe plus, on ne peut pas le rejoindre apres coup.

Voir `docs/SQL_ROLLOUT_RUNBOOK.md` (18a/18b) et
`docs/superpowers/specs/2026-09-04-test-org-isolated-data-design.md`.

## Scripts operationnels

### Benchmark

```sql
\i test_performance.sql
```

### Maintenance

```sql
\i maintenance.sql
```

Recommandation de rafraichissement `internal.mv_filtered_objects`:

```sql
-- Toutes les 5 minutes (SLA listing/filtrage)
SELECT cron.schedule(
  'refresh-mv-filtered-objects',
  '*/5 * * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_filtered_objects$$
);
```

Points de stale possibles pour `internal.mv_filtered_objects`:
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
