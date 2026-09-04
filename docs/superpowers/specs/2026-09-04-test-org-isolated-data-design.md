# Organisation de test à données isolées — design

Date : 2026-09-04 · Statut : validé, en implémentation

## Problème

Il n'existe aucun moyen d'exercer la plateforme (éditeur, Explorer, CRM,
dashboard, publications) sur des données jetables. Toute fiche créée pour
essayer une fonctionnalité entre dans le corpus réel, devient visible de tous
et **part à l'API partenaire**.

On veut une organisation de test disposant d'un corpus complet et réaliste
(~15 objets de chacun des 19 types, acteurs fictifs), totalement cloisonné :
invisible du dehors, et ne voyant pas le dedans.

## État existant (mesuré sur la base live, 2026-09-04)

- Une ORG **est** un objet (`object_type='ORG'`). Appartenance :
  `user_org_membership`. Rattachement des fiches : `object_org_link`.
  Live : 2 ORG, 855 objets, 13 types sur 19 peuplés, 707 acteurs.
- `org_config.access_scope` (`own_objects_only` | `all_published`) existe déjà
  — mais **il ne restreint rien**, parce qu'une policy distincte,
  `public_objects_published`, accorde `status='published'` à `public`
  (donc `anon` compris). Même constat pour la garde des ~40 tables filles,
  `api.can_read_object` = `published OR can_read_extended`, et pour la
  matview `internal.mv_filtered_objects` (`WHERE status='published'`).
- Aucune dimension « donnée de test » n'existe. `isDemoOnlyModule` est un
  drapeau d'affichage de modules, pas un périmètre de données.
- **Les acteurs sont déjà cloisonnés** : `ext_actor_read` s'appuie sur
  `can_read_extended` (chemin ORG), jamais sur `published`. Les acteurs
  fictifs seront invisibles au dehors sans aucune modification.

## Approches écartées

**Projet Supabase séparé.** Isolation parfaite, mais duplique 370 tables,
374 fonctions, l'auth et le déploiement, et dérive de la prod. C'est une
seconde application, pas une section de test.

**Dériver le caractère de test de `object_org_link` → `org_config` à chaque
garde.** Correct par construction, aucune dénormalisation — mais place une
jointure dans le chemin RLS le plus chaud, celui déjà réécrit en ensembliste
pour tenir sous le `statement_timeout` de 8 s (§35).

## Approche retenue

`object.is_test` dénormalisé, **entretenu par trigger** depuis le lien d'ORG :
l'organisation reste la source de vérité, mais la garde ne lit qu'une constante
par ligne — pas de jointure, indexable.

### 1. Schéma

    object.is_test          boolean NOT NULL DEFAULT false  -- + index partiel WHERE is_test
    org_config.is_test_org  boolean NOT NULL DEFAULT false

Un trigger sur `object_org_link` propage `org_config.is_test_org` de l'ORG
primaire vers `object.is_test`. Une fiche de test ne peut donc pas être
versée en production par un drapeau mal positionné.

### 2. La garde — une seule feuille

`api.current_user_in_test_org()` — `STABLE SECURITY DEFINER`, lit
`user_org_membership ⋈ org_config`, avec **`pg_temp` explicitement en
dernier** dans le `search_path` : sans lui (§208/R2.1) n'importe quel
`authenticated` forge le périmètre par un `CREATE TEMP TABLE
user_org_membership`. Appelée sous la forme `(SELECT …)` pour que le planner
la remonte en InitPlan — l'idiome déjà en place pour `auth.uid()`.

Le cloisonnement joue **dans les deux sens** avec un seul prédicat :

    is_test = false AND (SELECT api.current_user_in_test_org()) IS NOT TRUE

Les données de test ne sortent pas ; les comptes de test ne voient pas les
855 fiches réelles.

### 3. Les cinq points de passage

| # | Surface | Modification |
|---|---------|--------------|
| 1 | Policy RLS `public_objects_published` sur `object` | ajout du prédicat |
| 2 | `api.can_read_object()` | ajout sur la branche `published` — irrigue ~40 policies filles |
| 3 | `internal.mv_filtered_objects` | porte `is_test` ; les appelants Explorer filtrent dessus |
| 4 | Les 5 RPC `SECURITY DEFINER` qui court-circuitent la RLS (`get_object_resource`, `list_object_markers`, `get_filtered_object_ids`, 2 RPC dashboard) | périmètre explicite |
| 5 | **API partenaire** (service_role — court-circuite toute la RLS) | `is_test = false` inconditionnel dans les RPC de l'allowlist, **y compris le flux de tombstones `list_deleted_objects_since`** : un objet de test *supprimé* ne doit pas fuir davantage |

Ainsi que `capture_metric_snapshots` (cron dashboard), pour que les objets de
test ne polluent pas les séries temporelles de production.

### 4. Jeu de données — hybride

~285 objets (15 × 19 types). Coquilles synthétiques (noms, acteurs, contacts,
adresses : **aucune PII réelle n'entre dans le corpus de test**), profondeur
structurelle empruntée aux fiches réelles du même type (jeux d'équipements,
motifs d'ouverture, formes de tarifs, classements). Les types sans source
vivante (PNA, ITI, VIL, ASC, RVA, et CAMP/HPA/SPU/PCU quasi vides) sont
entièrement fabriqués à partir des tables de référence.

### 5. Réinitialisation et accès

`api.rpc_reset_test_data()` — réservée au superuser, **verrouillée sur les ORG
`is_test_org = true`** (une purge qui ne peut pas être pointée sur la
production), idempotente, exposée par un bouton dans les réglages.

Comptes de test dédiés uniquement : pas de double appartenance, donc aucune
surface de bascule de session.

### 6. Tests

Tests SQL prouvant chaque sens de la garde, et surtout celui qui compte :
**un objet de test publié est absent de `/api/public/objects`, de
`/objects/{id}` et du flux de suppressions.** Plus une garde CI : tout futur
prédicat `status='published'` ajouté sans le filtre de test échoue le build.

## Risques

- Le jeu de données est l'essentiel de l'effort (285 fiches avec de la
  profondeur réelle).
- Le point de passage 4 est celui où un oubli est **silencieux** : un RPC
  DEFINER qui oublie le filtre verse des données de test dans l'Explorer d'une
  ORG réelle, sans erreur. D'où la garde CI.
