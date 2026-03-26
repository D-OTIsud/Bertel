# Plan d'import CRM Lot 1
# Structures : crm_interaction · staging.crm_interaction_temp · staging.crm_comment_temp

**Version :** 1.0
**Date :** 2026-03-26
**Sources :** `Etablissements - CRM (1).csv`, `Etablissements - Commentaires (1).csv`
**Statut :** En attente d'approbation avant implémentation

---

## 0. Objectif

Définir un plan d'import propre et minimal pour les données CRM historiques issues des exports CSV Berta v2, en les réconciliant avec les identifiants canoniques Bertel avant toute promotion vers les tables finales.

Le but n'est pas de recréer l'ancien modèle source, mais d'intégrer ces données dans le modèle Bertel existant avec un niveau de traçabilité suffisant.

---

## 1. Règle de vérité sur les identifiants

### 1.1 Principe général

**Tous les identifiants présents dans les CSV sont des identifiants legacy source.**

Ils ne doivent jamais être utilisés comme PK finales ni comme FK finales dans Bertel.

Ils doivent être utilisés uniquement pour :
- le chargement brut en staging,
- la réconciliation vers les identifiants canoniques Bertel,
- la traçabilité historique dans `extra`.

### 1.2 Détail des identifiants legacy

| Colonne source | Signification | Nature |
|---|---|---|
| `CRM.ID` | identifiant legacy de l'interaction CRM | legacy only |
| `Commentaires.ID` | identifiant legacy du commentaire | legacy only |
| `Commentaires.CRM` | référence au parent `CRM.ID` | legacy only |
| `CRM.Prestataires` | identifiant legacy côté actor | legacy only |
| `CRM.Etablissement` | identifiant legacy côté object | legacy only |

### 1.3 Réconciliation attendue

| Source legacy | Cible Bertel |
|---|---|
| `CRM.Etablissement` | `object.id` |
| `CRM.Prestataires` | `actor.id` |
| `Interlocuteur` / `User` | `auth.users.id` |
| `Commentaires.CRM` | `crm_interaction.id` du parent promu |

---

## 2. Lecture métier des deux sources

### 2.1 Fichier `CRM`

Chaque ligne représente une interaction CRM historique entre l'OTI et un prestataire / établissement.

Ce n'est pas un système de ticketing structuré, mais un journal opérationnel d'échanges et de demandes.

### 2.2 Fichier `Commentaires`

Chaque ligne représente une note de suivi ajoutée à une interaction CRM existante.

Le lien parent/enfant est :

```text
Commentaires.CRM -> CRM.ID
```

Le commentaire est un historique de suivi, pas une entité métier autonome.

### 2.3 Règles métier déjà établies

| Terme source | Sens Bertel |
|---|---|
| `prestataire` | actor |
| `établissement` | object |

Les deux ne doivent jamais être confondus.

---

## 3. Décisions de modélisation retenues

### 3.1 Table finale cible

Aucune nouvelle table métier finale n'est créée.

Les lignes CRM parent et les lignes commentaire sont toutes deux intégrées dans `crm_interaction`.

### 3.2 Table de staging supplémentaire

Une nouvelle table de staging est nécessaire pour les commentaires :

```text
staging.crm_comment_temp
```

### 3.3 Lien parent/enfant

Le schéma final `crm_interaction` ne possède pas de FK auto-référente de parenté.

La relation parent/enfant des commentaires est donc conservée uniquement à titre de traçabilité dans `extra`, via :
- `parent_legacy_crm_id`,
- `promoted_parent_interaction_id`.

### 3.4 Statut des commentaires

Les commentaires promus dans `crm_interaction` prennent toujours :

```text
status = 'done'
```

Le statut source brut est conservé dans `extra.original_comment_status`.

Aucune reconstruction spéculative du cycle de vie n'est faite à l'import.

### 3.5 Héritage depuis le parent

Pour les commentaires promus :
- `object_id` est hérité du parent,
- `actor_id` doit être hérité du parent si disponible,
- `owner` est résolu via l'email du commentaire quand possible.

---

## 4. Contraintes et écarts de schéma connus

### 4.1 `demand_topic_id`

Le schéma final `crm_interaction.demand_topic_id` référence `ref_code_demand_topic(id)`.

Or les topics OTI ont été seedés sous le domaine `crm_demand_topic_oti`.

**Décision :**
- ne pas renseigner `demand_topic_id` à l'import,
- stocker la résolution dans `extra.oti_demand_topic_id` et `extra.oti_demand_topic_code`.

### 4.2 Humeurs CRM

Les valeurs sources de type emoji ne correspondent pas au domaine `mood` actuel.

**Décision :**
- laisser `request_mood_id` et `response_mood_id` à `NULL`,
- stocker `humeur_raw` et `humeur_apres_raw` dans `extra`.

### 4.3 `crm_interaction.object_id` obligatoire

`crm_interaction.object_id` est `NOT NULL` dans le schéma actuel.

**Décision :**
- les lignes CRM sans `Etablissement` réconciliable ne sont pas promues,
- elles restent rejetées en staging avec motif explicite.

---

## 5. Prérequis techniques avant import CRM

### 5.1 Préremplissage de `object_external_id`

La réconciliation object doit être faite via `object_external_id`, avec scope organisationnel.

Clé de lookup attendue :

```text
(organization_object_id, source_system, external_id)
```

Le plan retient :
- `organization_object_id = <OTI org object id>`,
- `source_system = 'berta_v2_csv_export'`,
- `external_id = CRM.Etablissement`.

### 5.2 Important

Le `org_object_id` de l'OTI ne doit pas être résolu par répétition de lookup fragile par nom dans chaque requête.

Il doit être :
- soit fourni comme paramètre fixe,
- soit résolu une seule fois au début du processus, puis réutilisé partout.

### 5.3 Réconciliation actor

La réconciliation actor suppose que l'import des prestataires est déjà passé, avec conservation de l'identifiant legacy côté `actor`.

Exemple attendu :

```text
actor.extra->>'legacy_presta_id' = CRM.Prestataires
```

### 5.4 Réconciliation users

Les emails `CRM.Interlocuteur` et `Commentaires.User` sont résolus vers `auth.users.id` quand possible.

Si non trouvé :
- la ligne n'est pas rejetée,
- `owner = NULL`,
- un log de traçabilité est conservé.

---

## 6. Modèle de staging retenu

### 6.1 `staging.crm_interaction_temp`

Table existante utilisée pour recevoir les lignes CRM parent.

Contenu attendu :
- clés legacy brutes,
- champs fonctionnels normalisés,
- colonnes de réconciliation,
- `raw_source_data`,
- `extra`.

### 6.2 `staging.crm_comment_temp`

Nouvelle table de staging pour les commentaires.

Colonnes minimales attendues :
- `legacy_comment_id`
- `parent_legacy_crm_id`
- `user_email`
- `body`
- `occurred_at`
- `humeur_raw`
- `original_comment_status`
- `close_reqs`
- `modere`
- `resolved_parent_interaction_id`
- `resolved_object_id`
- `resolved_actor_id`
- `resolved_owner_id`
- `resolution_status`
- `rejection_reason`
- `raw_source_data`

### 6.3 Convention de statut staging

Le plan réutilise la logique suivante, sauf si la table existante impose déjà une convention différente :
- `pending`
- `approved`
- `rejected`

**Règle :** ne pas inventer une convention parallèle si `staging.crm_interaction_temp` utilise déjà autre chose.

---

## 7. Règles de réconciliation

### 7.1 Object legacy -> object.id

Lookup via `object_external_id`, avec scope organisationnel OTI :

```text
organization_object_id = <OTI org object id>
source_system          = 'berta_v2_csv_export'
external_id            = staging_object_key
```

### 7.2 Actor legacy -> actor.id

Lookup via la clé legacy prestataire conservée côté actor.

### 7.3 User email -> auth.users.id

Lookup exact sur l'email.

### 7.4 Topic texte -> UUID OTI

Lookup sur `ref_code` avec :

```text
domain = 'crm_demand_topic_oti'
name   = valeur source brute de Objet_du_Contact
```

Le résultat va dans `extra`, pas dans `demand_topic_id`.

### 7.5 Parent legacy CRM -> parent promu

Pour les commentaires, la résolution du parent ne peut se faire qu'après promotion des lignes CRM parent dans `crm_interaction`.

Lookup attendu :

```text
crm_interaction.extra->>'legacy_crm_id' = parent_legacy_crm_id
and crm_interaction.source = 'import_berta2_crm'
```

---

## 8. Modèle final de promotion

### 8.1 Lignes CRM parent -> `crm_interaction`

Colonnes finales :
- `object_id` = object canonique résolu
- `actor_id` = actor canonique résolu ou NULL
- `interaction_type` = `visit` si applicable, sinon `note`
- `direction` = `internal`
- `status` = normalisé depuis la source CRM
- `body`
- `occurred_at`
- `resolved_at`
- `is_actionable`
- `owner`
- `source = 'import_berta2_crm'`
- `demand_topic_id = NULL`
- `request_mood_id = NULL`
- `response_mood_id = NULL`
- `extra` avec les clés legacy et données non mappées en FK

### 8.2 Lignes commentaire -> `crm_interaction`

Colonnes finales :
- `object_id` = hérité du parent
- `actor_id` = hérité du parent si disponible
- `interaction_type = 'note'`
- `direction = 'internal'`
- `status = 'done'`
- `body`
- `occurred_at`
- `owner`
- `source = 'import_berta2_commentaire'`
- `demand_topic_id = NULL`
- `request_mood_id = NULL`
- `response_mood_id = NULL`
- `extra` avec lien parent legacy, parent promu, statut brut, humeur, flags

### 8.3 Données conservées uniquement dans `extra`

- `legacy_crm_id`
- `legacy_comment_id`
- `parent_legacy_crm_id`
- `promoted_parent_interaction_id`
- `oti_demand_topic_id`
- `oti_demand_topic_code`
- `humeur_raw`
- `humeur_apres_raw`
- `sous_categorie`
- `original_comment_status`
- `close_reqs`
- `interlocuteur_email`
- `import_source`

---

## 9. Cas rejetés

### 9.1 Rejets CRM parent

- `Etablissement` vide
- `Etablissement` sans correspondance `object_external_id`
- date invalide empêchant `occurred_at`

### 9.2 Rejets commentaire

- parent CRM introuvable après promotion des parents
- date invalide empêchant `occurred_at`

### 9.3 Cas non bloquants

Ne doivent pas provoquer de rejet :
- actor introuvable,
- owner introuvable,
- topic introuvable,
- humeur non normalisée.

Ils doivent être loggés et conservés en `extra` quand utile.

---

## 10. Séquence d'implémentation retenue

### Étape 0
Valider le `org_object_id` OTI à utiliser pour tous les lookups `object_external_id`.

### Étape 1
Compléter `object_external_id` à partir des objets déjà importés si les external IDs Airtable ne sont pas encore présents.

### Étape 2
Charger le CSV `CRM` dans `staging.crm_interaction_temp`.

### Étape 3
Créer puis charger le CSV `Commentaires` dans `staging.crm_comment_temp`.

### Étape 4
Faire le pass de réconciliation sur les lignes CRM parent :
- object,
- actor,
- owner,
- topic.

### Étape 5
Marquer les lignes CRM parent `approved` / `rejected`.

### Étape 6
Promouvoir les lignes CRM parent dans `crm_interaction`.

### Étape 7
Faire le pass de réconciliation des commentaires vers leur parent promu.

### Étape 8
Marquer les commentaires `approved` / `rejected`.

### Étape 9
Promouvoir les commentaires dans `crm_interaction`.

### Étape 10
Lancer les contrôles de validation finaux.

---

## 11. Contrôles de validation minimum

### 11.1 Intégrité objet

Aucune interaction promue ne doit référencer un `object_id` absent.

### 11.2 État du staging

Aucune ligne du batch ne doit rester en `pending` à la fin du process.

### 11.3 Couverture topics

Mesurer le taux de lignes CRM promues sans `extra.oti_demand_topic_id`.

### 11.4 Orphelins commentaires

Mesurer le nombre de commentaires rejetés pour parent introuvable.

### 11.5 Traçabilité parent commentaire

Chaque commentaire promu doit porter un `promoted_parent_interaction_id` dans `extra`.

### 11.6 Précondition external IDs

Avant staging CRM, vérifier que tous les objets pilotes attendus sont bien trouvables dans `object_external_id` pour le scope OTI retenu.

---

## 12. Dette de schéma identifiée, non bloquante pour l'import

| Sujet | Dette actuelle | Effet |
|---|---|---|
| Topics OTI | pas de FK directe compatible avec `crm_demand_topic_oti` | topic stocké en `extra` |
| Humeurs CRM | pas de domaine de ref adapté | humeur stockée en `extra` |
| Interactions actor-only | `crm_interaction.object_id` non nullable | certaines lignes restent rejetées |
| Parenté commentaire | pas de FK auto-référente sur `crm_interaction` | lien parent en traçabilité uniquement |

---

## 13. Décision finale

Le plan retenu est :
- **pas de nouvelle table métier finale**,
- **une nouvelle table de staging pour les commentaires**,
- **réconciliation obligatoire de tous les identifiants legacy avant promotion**,
- **promotion des parents puis des commentaires**,
- **traçabilité forte dans `extra`**,
- **pas de reconstruction spéculative du cycle de vie source**.

Ce plan est suffisant pour lancer une implémentation pragmatique et propre dans le modèle Bertel actuel.
