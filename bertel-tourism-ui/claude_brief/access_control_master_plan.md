# Bertel 3.0 — Modèle d'accès et de permissions
## Document maître

**Version :** 1.5
**Date :** 2026-03-23
**Statut :** Toutes les décisions verrouillées — base de référence complète pour l'implémentation
**Auteur :** Produit lors des sessions de conception 2026-03-23
**Dernière révision :** 2026-03-23 — D1 verrouillée : grille `ref_org_business_role` figée (`viewer`/10, `contributor`/20, `editor`/30) ; aucune décision ouverte

---

## Table des matières

1. [Contexte et objectif](#1-contexte-et-objectif)
2. [Décisions verrouillées](#2-décisions-verrouillées)
   - 2.1 User / ORG / Actor
   - 2.2 ORG et publisher
   - 2.3 Structure générale des droits — modèle à 3 niveaux
   - 2.4 Séparation des concepts
   - 2.5 Rôles utilisateur dans l'ORG
   - 2.6 Administration et anti auto-élévation
   - 2.7 Administration ORG
   - 2.8 Gouvernance du scope ORG
3. [Groupes](#3-groupes)
   - 3.1 Groupes mono-ORG
   - 3.2 Groupes multi-ORG
   - 3.3 Gouvernance des groupes multi-ORG
   - 3.4 Effet de sortie d'une ORG d'un groupe multi-ORG
   - 3.5 Permissions dans un groupe multi-ORG
   - 3.6 Périmètre réel d'application des permissions de groupe
   - 3.7 Validation croisée des règles multi-ORG
   - 3.8 Qui peut accepter ou refuser une règle multi-ORG
4. [Modèle de données conceptuel](#4-modèle-de-données-conceptuel)
5. [Corrections du blueprint précédent](#5-corrections-du-blueprint-précédent)
6. [Watch-outs architecturaux](#6-watch-outs-architecturaux)
   - 6.1 Performance RLS
   - 6.2 Cycle de vie des permissions et exceptions
7. [Plan d'implémentation global](#7-plan-dimplémentation-global)
8. [Décisions restantes à trancher](#8-décisions-restantes-à-trancher)

---

## 1. Contexte et objectif

### Situation actuelle

Le projet Bertel 3.0 n'a aujourd'hui **aucun mécanisme de membership user ↔ ORG**. Le modèle existant contient :

- `app_user_profile.role` : rôle global plateforme (`owner`, `super_admin`, `tourism_agent`) — scopé à la plateforme entière, pas à une ORG.
- `actor_object_role` : lien acteur ↔ objet avec rôle — utilisé pour les droits locaux sur les objets.
- `api.can_read_extended()` : fonction RLS qui dérive un accès ORG implicite par chaîne email → acteur → `object_org_link`. Pas de membership explicite.
- `ref_org_role` + `object_org_link` : rattachement ORG ↔ objet — structural, mais sans seeds et sans connexion au user.

Ce modèle ne permet pas :
- d'identifier à quelle ORG appartient un user,
- de lui attribuer un rôle dans cette ORG,
- de lui accorder des permissions d'action distinctes de son rôle,
- de gérer des groupes avec scope et permissions propres,
- de modéliser une gouvernance multi-ORG.

### Objectif

Construire un modèle d'accès complet, cohérent, évolutif, qui distingue :

- **l'appartenance** (à quelle ORG appartient ce user ?),
- **le rôle métier** (quel est son rôle professionnel dans cette ORG ?),
- **le rôle d'administration** (peut-il administrer d'autres membres ou droits ?),
- **les permissions d'action** (quelles actions peut-il faire ?),
- **les exceptions fines** (quelles surcharges s'appliquent à lui ou à son ORG ?),
- **les groupes** (à quel sous-ensemble de périmètre appartient-il ?)

Ces dimensions sont **orthogonales**. Les mélanger dans un seul concept (rôle = tout) est la source principale de rigidité et de dette architecturale dans ce type de système.

---

## 2. Décisions verrouillées

Ces décisions sont figées. Elles ne doivent pas être remises en question sans demande explicite de changement.

---

### 2.1 User / ORG / Actor

| Règle | Détail |
|-------|--------|
| **1 user métier = 1 ORG active** | Un user dont le rôle plateforme est `tourism_agent` n'appartient qu'à une seule ORG à la fois. |
| **Exception owner / super_admin** | Les comptes `owner` et `super_admin` ne sont pas soumis à la contrainte métier 1 user = 1 ORG. Ils peuvent opérer hors modèle ORG. La multiplicité éventuelle de memberships reste un détail d'implémentation à préciser si nécessaire — ce point n'est pas verrouillé. |
| **Lien user → actor optionnel** | Un user peut être lié à 0 ou 1 actor. Ce lien n'est pas obligatoire pour fonctionner. |
| **1 user = au plus 1 actor** | Un user ne peut être lié qu'à un seul actor. Un actor ne peut être lié qu'à un seul user. |
| **Actor → objets multiples** | Un actor peut être lié à plusieurs objets via `actor_object_role`, avec des rôles différents selon l'objet. |
| **Droits actor = exceptions locales** | Le lien user → actor ne définit pas le rôle global ORG du user. Les droits actor sont des exceptions locales sur certains objets. Le rôle actor ne remplace pas le rôle ORG global. |

---

### 2.2 ORG et publisher

| Règle | Détail |
|-------|--------|
| **ORG = objet** | Les organisations sont des objets du modèle avec `object_type = 'ORG'`. |
| **Rattachement ORG ↔ objet** | `object_org_link` est la table de rattachement. Elle porte le rôle de l'ORG sur l'objet (publisher, contributor, reader). |
| **Auto-attach à la création** | Quand un user d'une ORG crée un objet, cet objet est automatiquement rattaché à l'ORG du user comme **publisher principal** (`object_org_link.is_primary = TRUE`). |
| **Publisher = source primaire** | L'ORG publisher est la source primaire de vérité d'un objet. Elle modifie directement la donnée canonique. |
| **Tiers ≠ canonique** | Une ORG tierce (non publisher) ne modifie jamais la donnée canonique. Elle passe toujours par sa couche d'enrichissement propre. |
| **Enrichissement = lien explicite** | Une ORG tierce ne peut enrichir un objet que si elle dispose d'un lien explicite via `object_org_link` (rôle `contributor` ou supérieur). Sans ce lien, elle ne peut rien écrire. |
| **Pas de validation publisher** | Une ORG tierce n'a pas besoin de validation du publisher pour publier son propre enrichissement. L'enrichissement ORG lui appartient. |

Codes `ref_org_role` à seeder (actuellement manquants — **bloquant**) :

| Code | Sémantique |
|------|-----------|
| `publisher` | ORG publisher principale, source canonique, écriture directe |
| `contributor` | ORG contributrice / enrichisseuse, couche propre uniquement |
| `reader` | ORG lectrice, accès en lecture via lien explicite seulement |

---

### 2.3 Structure générale des droits — modèle à 3 niveaux

Le modèle de droits repose sur **3 niveaux hiérarchiques**. La priorité est : **Niveau 3 > Niveau 2 > Niveau 1**.

#### Niveau 1 — Scope d'accès de l'ORG

Le Niveau 1 définit **le périmètre d'objets auquel l'ORG a accès**. Il opère au niveau de l'organisation entière, pas au niveau des utilisateurs. Seul le `super_admin` peut le modifier (§2.8).

Ce niveau ne porte **pas** les permissions d'action (pas de `create`, `publish`, etc. ici).

**Le Niveau 1 ne détermine pas ce que les utilisateurs font.** Il détermine uniquement sur quels objets l'ORG dispose d'une visibilité globale. C'est le Niveau 2 qui précise quels utilisateurs ou groupes de l'ORG peuvent agir sur ce périmètre.

##### A. Périmètre propre de l'ORG — toujours inclus

Une ORG a toujours accès à l'intégralité des objets qui lui appartiennent :
- les objets qu'elle a créés,
- les objets qu'elle publie (rôle `publisher` via `object_org_link`),
- les objets auxquels elle est explicitement rattachée (tout rôle via `object_org_link`).

Pour ce périmètre propre, l'ORG voit les objets publiés **et** les objets non publiés. Le statut de publication n'est pas une barrière interne : une ORG voit toujours ses brouillons et les brouillons des objets qu'elle gère.

##### B. Objets d'autres ORG — configurable

En dehors du périmètre propre, l'accès à des objets appartenant à d'autres ORG dépend du scope configuré dans `org_config.access_scope`.

| Valeur | Périmètre externe |
|--------|------------------|
| `own_objects_only` | Périmètre propre uniquement. Aucun objet d'une autre ORG n'est visible. |
| `all_published` | Périmètre propre + tous les objets publiés d'autres ORG, en lecture. |

**Objets non publiés d'autres ORG :** une ORG ne voit pas par défaut les objets non publiés d'autres ORG, quel que soit son scope. Cet accès ne peut exister que via des mécanismes spécifiques : groupe d'objets ciblé, groupe multi-ORG accepté, ou exception de Niveau 3. Il ne fait pas partie du scope standard.

##### C. Enrichissement sur le périmètre externe

Si l'ORG a le scope `all_published`, elle peut lire les objets publiés externes. L'enrichissement de ces objets reste toujours conditionné à l'existence d'un lien `object_org_link` explicite avec le rôle `contributor` sur cet objet.

Le scope `all_published` rend le périmètre d'enrichissement **disponible au niveau de l'ORG**. Il ne l'accorde pas automatiquement à tous ses utilisateurs. C'est le **Niveau 2** qui détermine quels utilisateurs ou groupes peuvent réellement exercer cette possibilité.

#### Niveau 2 — Permissions d'action

Le Niveau 2 opère **à l'intérieur du périmètre défini par le Niveau 1**. Il ne peut pas l'élargir — c'est le rôle du Niveau 3 (`scope_override`). Il précise quels membres ou groupes peuvent exercer quelles actions sur les objets accessibles.

Les permissions d'action sont **accordables** :
- à toute l'ORG (effet sur tous ses membres),
- à un groupe d'utilisateurs (via `group_permission`),
- ou à un utilisateur précis.

Liste des permissions V1 (à seeder) :

| Code | Catégorie | Description |
|------|-----------|-------------|
| `create_object` | content | Créer un objet tourisme |
| `edit_canonical_when_publisher` | content | Modifier la donnée canonique (si ORG publisher) |
| `edit_org_enrichment` | content | Modifier la couche d'enrichissement ORG |
| `publish_object` | content | Publier / dépublier un objet |
| `validate_changes` | content | Valider des modifications en attente |
| `write_crm_notes` | crm | Rédiger des notes CRM sur un objet |
| `manage_team_messages` | team | Envoyer des messages d'équipe |
| `attach_documents` | media | Attacher des documents |
| `edit_gallery` | media | Modifier la galerie photos |
| `edit_hours` | content | Modifier les horaires |
| `edit_pricing` | content | Modifier la grille tarifaire |

#### Niveau 3 — Exceptions fines

Les exceptions peuvent être accordées :
- à l'ORG entière,
- ou à un utilisateur précis.

Elles peuvent :
- **restreindre** un droit existant (`revoke`),
- **élargir** un droit non accordé (`grant`),
- **modifier le scope** (`scope_override`).

En V1, la granularité maximale est l'objet ciblé (`target_object_id`). Le ciblage par champ individuel est reporté.

---

### 2.4 Séparation des concepts

Ces distinctions sont non négociables. Les mélanger produit un modèle impossible à maintenir.

| Concept A | Concept B | Relation |
|-----------|-----------|---------|
| Membership ORG | Rôle métier ORG | Séparés — on peut changer le rôle sans toucher le membership |
| Rôle métier ORG | Rôle d'administration ORG | Séparés — on peut être admin sans avoir un rôle métier différent |
| Rôles | Permissions | Séparés — les rôles sont des repères, les permissions sont les actions autorisées |
| Permissions de base | Exceptions | Séparées — les exceptions surchargent les permissions sans les redéfinir |
| Permissions user | Additives | `user_permission` est additive : un user peut se voir accorder une permission que son ORG n'a pas. Les permissions utilisateur ne sont pas restreintes au sous-ensemble déjà accordé à l'ORG. |
| **Scope ORG (Niveau 1)** | **Rôle métier** | **Séparés et orthogonaux.** Le scope ORG détermine sur quels objets l'ORG a une visibilité globale. Le rôle métier décrit la fonction professionnelle du user. Le rôle métier n'encode pas, n'élargit pas et ne restreint pas le scope — ces dimensions ne doivent jamais se mélanger. |
| **Scope ORG (Niveau 1)** | **Permissions d'action (Niveau 2)** | **Séparés et ordonnés.** Le Niveau 1 détermine le périmètre visible. Le Niveau 2 détermine ce que les utilisateurs ou groupes peuvent faire dans ce périmètre. Le Niveau 1 ne confère aucun droit d'action automatique aux utilisateurs. |

---

### 2.5 Rôles utilisateur dans l'ORG

| Règle | Détail |
|-------|--------|
| **1 rôle métier obligatoire** | Tout user rattaché à une ORG a toujours un rôle métier. Ce rôle est unique. |
| **0 ou 1 rôle d'administration** | Un user peut avoir au plus un rôle d'administration dans son ORG. Ce rôle est optionnel. |
| **Pas d'admin sans métier** | Un rôle d'administration seul, sans rôle métier associé, n'est pas possible. |
| **Rôle métier = dimension "qui je suis"** | Le rôle métier reflète la fonction professionnelle du user dans l'ORG. |
| **Rôle admin = dimension "ce que j'administre"** | Le rôle d'administration définit le périmètre de gestion de ce user dans l'ORG. |

---

### 2.6 Administration et anti auto-élévation

Ces règles s'appliquent à tout rôle d'administration à n'importe quel niveau du modèle.

| Règle | Détail |
|-------|--------|
| **Pas d'auto-attribution** | Un administrateur ne peut pas s'attribuer lui-même un rôle, une permission, ou une exception. |
| **Pas d'auto-élévation** | Un administrateur ne peut pas augmenter ses propres droits. |
| **Gestion vers le bas seulement** | Un administrateur peut gérer des droits strictement inférieurs aux siens dans son périmètre. |
| **Permissions ciblées possibles** | Un administrateur peut accorder des permissions ciblées à un user sans élever son rôle global. |
| **Pas de retrait latéral** | Un administrateur ne peut pas retirer des droits équivalents aux siens. |
| **Rétrogradation = autorité supérieure** | Seule une autorité de rang supérieur peut faire redescendre un administrateur. |
| **Admin sans bypass de permissions** | Aucun rôle d'administration ne bypasse automatiquement `api.user_has_permission()`. Les droits d'un admin sont explicites, déclarés de la même façon que pour tout autre user, et visibles dans les vues de debug et de calcul des permissions effectives. Un admin doit avoir ses permissions dans `org_permission` ou `user_permission` comme n'importe qui. Ce choix est motivé par la sécurité et l'auditabilité. |

---

### 2.7 Administration ORG

| Règle | Détail |
|-------|--------|
| **Scope limité à l'ORG** | Un administrateur ORG n'administre que dans le périmètre de sa propre organisation. |
| **Pas de pouvoir inter-ORG** | Un administrateur ORG n'a aucun pouvoir administratif sur une autre ORG. |
| **Super admin = portée globale** | Seul le super admin a une portée d'administration au-delà des organisations. |
| **Rang explicite obligatoire** | Les rôles d'administration ORG doivent porter un rang numérique explicite pour comparer les niveaux et appliquer les règles d'anti auto-élévation. |

---

### 2.8 Gouvernance du scope ORG

| Règle | Détail |
|-------|--------|
| **Modification de `org_config.access_scope` = super admin uniquement** | Le scope d'accès global d'une ORG ne peut être modifié que par une autorité plateforme (`super_admin` / `platform_owner`). Un administrateur ORG local ne peut pas s'auto-attribuer un élargissement du scope de son organisation. |
| **Motivation** | Le scope est structurant pour toute la chaîne de permissions. L'élargir est un acte de gouvernance des données, pas un acte d'administration locale. Un admin ORG peut demander un changement, mais ne peut pas l'effectuer lui-même. |

---

## 3. Groupes

---

### 3.1 Groupes mono-ORG

- Un groupe mono-ORG est interne à une ORG.
- Il peut être créé et administré par un administrateur ORG.
- Il sert à mutualiser scope, permissions et exceptions pour un sous-ensemble de membres.
- Son scope peut pointer vers une liste explicite d'IDs d'objets (V1) ou vers des ensembles plus complexes (versions futures).
- Les membres d'un groupe mono-ORG doivent tous appartenir à la même ORG.

**Sémantique de `group_scope_object` vide (verrouillé) :**

- Si un groupe n'a aucune ligne dans `group_scope_object`, son périmètre est **vide** : aucun objet accessible.
- **empty scope = no access.** Il n'y a pas d'héritage implicite du scope ORG.
- Pour qu'un groupe n'ait aucune restriction de scope, cela doit être modélisé explicitement (ex : flag `unrestricted_scope` à ajouter si ce besoin émerge). La règle par défaut est volontairement stricte.
- Ce choix évite les accès non intentionnels lors de la création d'un groupe sans scope configuré.

---

### 3.2 Groupes multi-ORG

- Les groupes multi-ORG **font partie du modèle cible**. Ils ne sont pas reportés architecturalement.
- La **création** d'un groupe multi-ORG est réservée au **super admin uniquement**.
- Le super admin peut créer le groupe et désigner les group admins initiaux pour chaque ORG participante.
- Le modèle de données intègre les groupes multi-ORG **dès la fondation**. L'activation opérationnelle est phasée dans le chantier courant : elle suit la consolidation des groupes mono-ORG (Phase 7 du plan), sans changement de vision produit ni report architectural.

---

### 3.3 Gouvernance des groupes multi-ORG

| Règle | Détail |
|-------|--------|
| **Group admin par ORG** | Chaque ORG participante doit avoir au moins un group admin appartenant à cette ORG. |
| **Multi-admin possible** | Plusieurs membres d'une même ORG peuvent être group admins du même groupe. |
| **Super admin toujours souverain** | Le super admin conserve toujours la main sur tout groupe multi-ORG. |
| **Group admin limité à sa propre ORG** | Un group admin ne peut administrer que : les membres de sa propre ORG dans le groupe, la participation de sa propre ORG au groupe, et les acceptations / refus des règles du groupe pour sa propre ORG. |
| **Pas d'inter-ORG pour le group admin** | Un group admin ne peut pas administrer directement les membres des autres ORG participantes. |
| **Dissolution = super admin uniquement** | Un group admin ne peut pas dissoudre tout le groupe. Il peut seulement retirer son ORG du groupe. |

---

### 3.4 Effet de sortie d'une ORG d'un groupe multi-ORG

Quand une ORG quitte un groupe multi-ORG :

1. Tous ses membres sont retirés du groupe immédiatement.
2. Tous les droits accordés par le groupe à ces membres disparaissent immédiatement.
3. Ces utilisateurs retrouvent uniquement leurs droits normaux hors groupe.
4. Cet effet est immédiat, pas différé.

---

### 3.5 Permissions dans un groupe multi-ORG

**Option A choisie.** Un groupe multi-ORG porte **un seul paquet de permissions commun**.

- Ce paquet est commun à toutes les ORG participantes.
- Son effet se déploie ORG par ORG selon validation (voir §3.7).
- Les permissions du groupe **ne modifient jamais** :
  - le rôle global ORG d'un member,
  - les permissions globales de l'ORG hors groupe,
  - les permissions globales personnelles d'un user hors groupe.

---

### 3.6 Périmètre réel d'application des permissions de groupe

- Une ORG publisher reste responsable de ses objets.
- Lorsqu'une règle du groupe est acceptée par une ORG, elle ne s'applique que dans le cadre du groupe et sur les objets dont cette ORG est publisher.
- Les droits d'enrichissement propres à chaque ORG restent séparés du mécanisme de groupe.

---

### 3.7 Validation croisée des règles multi-ORG

Les règles de groupe multi-ORG ne s'appliquent pas automatiquement à toutes les ORG.

**États d'acceptation par ORG :**

| État | Description |
|------|-------------|
| `proposed` | La règle a été proposée par le super admin ou un group admin. |
| `accepted` | L'ORG a explicitement accepté la règle. Elle est effective pour cette ORG. |
| `refused` | L'ORG a refusé la règle. Elle n'est pas effective pour cette ORG. |

**Règles d'application :**

- Une règle **ne devient effective pour une ORG donnée que lorsqu'elle l'a acceptée**.
- Si une ORG refuse, la règle peut rester active sur les autres ORG qui l'ont acceptée.
- Les états sont **réversibles** : une ORG peut passer d'`accepted` à `refused` et vice-versa.
- Les transitions doivent être horodatées (date de proposition, date d'acceptation, date de refus).

---

### 3.8 Qui peut accepter ou refuser une règle multi-ORG

Pour une ORG donnée, l'action `accept` / `refuse` peut être faite :
- par les group admins de cette ORG dans ce groupe,
- ou par des utilisateurs de cette ORG ayant un rang administratif suffisant (rang supérieur aux group admins du groupe).

Cette capacité d'acceptation ne donne **pas** automatiquement tous les autres pouvoirs du group admin.

---

## 4. Modèle de données conceptuel

Cette section décrit les briques nécessaires en termes logiques, **sans SQL**. Les noms de tables sont des propositions stables, pas encore définitifs.

---

### Bloc A — Membership et rôles

**`user_org_membership`**
Lie un user à une ORG. Ce record représente **uniquement le fait d'appartenir** à une ORG. Ne porte pas les rôles.
Colonnes clés : `user_id`, `org_object_id`, `is_active`, `invited_by`, dates.
Contrainte : un user actif ne peut avoir qu'une seule appartenance active (sauf owner/super_admin).

**`ref_org_business_role`**
Catalogue des rôles métier possibles dans une ORG. Chaque rôle reflète la fonction professionnelle du user — sans implication de scope ni de permissions d'action.

Grille V1 (verrouillée — D1) :

| Code | Label | Position | Interprétation |
|------|-------|----------|----------------|
| `viewer` | Lecteur | 10 | Consultation uniquement dans le périmètre accessible à l'ORG et au user. Ne peut ni créer ni modifier. |
| `contributor` | Contributeur | 20 | Saisie, enrichissement, mise à jour dans le périmètre autorisé. Sans rôle de validation éditoriale. |
| `editor` | Éditeur | 30 | Contrôle qualité, correction, validation éditoriale, amélioration des contenus dans le périmètre autorisé. |

Note : le rôle métier est orthogonal au scope ORG (§2.4) et aux permissions d'action (§2.3). Il ne confère aucun droit implicite. Le rôle `coordinator` est explicitement exclu des seeds V1 (justification en §8 D1).

**`user_org_business_role`**
Affecte un rôle métier à un user dans son ORG. Référence `user_org_membership`. Un seul rôle actif par user à la fois.

**`ref_org_admin_role`**
Catalogue des rôles d'administration possibles dans une ORG. Chaque rôle porte un **rang numérique explicite** pour comparer les niveaux et appliquer les règles d'anti auto-élévation.

Grille V1 (verrouillée — D2) :

| Code | Label | Rang | Interprétation |
|------|-------|------|----------------|
| `team_lead` | Référent équipe | 10 | Premier niveau de délégation administrative. Peut gérer des droits dans son périmètre immédiat, sans pouvoir d'administration structurelle. |
| `org_manager` | Gestionnaire ORG | 20 | Niveau d'administration opérationnelle. Peut gérer les membres et les droits inférieurs à son rang. |
| `org_admin` | Administrateur ORG | 30 | Niveau administratif le plus élevé dans l'ORG. Ne dépasse pas la portée du `super_admin` plateforme. Peut gérer tout ce qui est de rang inférieur. |

**`user_org_admin_role`**
Affecte un rôle d'administration à un user dans son ORG. Optionnel. Référence `user_org_membership`. Au plus un rôle actif par user.

---

### Bloc B — Scope et permissions

**`org_config`**
Configuration de l'ORG portant son **scope d'accès** (Niveau 1). Ne porte que le scope. Les permissions d'action n'ont pas leur place ici.
Colonnes clés : `org_object_id`, `access_scope` (enum : `own_objects_only`, `all_published`).

- `own_objects_only` : périmètre propre uniquement — objets créés, publiés ou liés via `object_org_link`, brouillons inclus. Aucun objet externe visible.
- `all_published` : périmètre propre + lecture de tous les objets publiés d'autres ORG. L'enrichissement des objets externes reste conditionné à un `object_org_link` explicite.

Note : l'accès aux objets non publiés d'autres ORG n'est pas une valeur de scope standard. Il relève d'une exception de Niveau 3 ou d'un mécanisme de groupe spécifique.

**`ref_permission`**
Catalogue des permissions d'action disponibles sur la plateforme. Chaque permission a un code, un nom, une catégorie.

**`org_permission`**
Permissions d'action accordées à une ORG entière (Niveau 2, scope ORG). Une entrée par permission accordée.

**`user_permission`**
Permissions d'action accordées à un user précis (Niveau 2, scope user). Une entrée par permission accordée.

**`org_exception`**
Exceptions fines accordées à une ORG (Niveau 3). Portent un type (`grant`, `revoke`, `scope_override`) et optionnellement un objet ciblé.

**`user_exception`**
Exceptions fines accordées à un user précis (Niveau 3). Même structure que `org_exception`.

---

### Bloc C — Groupes

**`user_group`**
Entité groupe. Ne porte pas directement de référence ORG : le rattachement aux ORG participantes passe par `group_org_participant` (Bloc D). Un groupe mono-ORG est simplement un groupe avec une seule ORG participante dans `group_org_participant`. Un groupe multi-ORG en a plusieurs. Cette structure est uniforme dès la fondation.
Colonnes clés : `code`, `name`, `is_active`, `group_type` (enum : `mono_org`, `multi_org`).

**`user_group_member`**
Lie un user à un groupe. Le user doit appartenir à l'une des ORG participantes du groupe (via `group_org_participant`).

**`group_permission`**
Permissions accordées au groupe entier. S'appliquent à tous les membres.

**`group_scope_object`**
Scope V1 du groupe : liste explicite d'IDs d'objets. Un groupe sans lignes = périmètre vide = aucun accès (verrouillé — voir §3.1).

---

### Bloc D — Groupes multi-ORG et gouvernance

**`group_org_participant`**
Enregistre qu'une ORG participe à un groupe multi-ORG. Colonnes clés : `group_id`, `org_object_id`, `joined_at`, `left_at`.

**`group_org_admin`**
Désigne les group admins d'une ORG dans un groupe. Colonnes clés : `group_id`, `org_object_id`, `user_id`.
Contrainte : le user doit appartenir à l'ORG en question.

**`group_org_rule`**
Définit une règle de groupe. C'est un conteneur nommé (libellé, description, proposant) qui regroupe un ensemble de permissions. Appartient à un groupe.
Colonnes clés : `group_id`, `code`, `description`, `proposed_by`, `proposed_at`.

**`group_org_rule_permission`**
Porte les permissions concrètes qu'une règle accorde. Une règle est un conteneur ; les permissions réelles qu'elle confère sont dans cette table. Sans lignes ici, une règle est vide et sans effet.
Colonnes clés : `rule_id`, `permission_id`.
Contrainte : `permission_id` référence `ref_permission`.

**`group_org_rule_acceptance`**
Enregistre l'état d'acceptation d'une règle par chaque ORG participante.
Colonnes clés : `rule_id`, `org_object_id`, `state` (`proposed`, `accepted`, `refused`), `decided_by`, `proposed_at`, `accepted_at`, `refused_at`.
Les états sont réversibles. L'état actif est la dernière transition.

---

### Bloc E — Lien user ↔ actor

**Modification de `app_user_profile`**
Ajout d'une colonne `actor_id` (FK nullable vers `actor`). Index unique partiel pour garantir la contrainte 1-to-1 dans les deux sens.

---

### Récapitulatif des entités et leur rôle

```
app_user_profile ←── user_org_membership ──→ object(ORG)
                           │
          ┌────────────────┤────────────────┐
          ▼                ▼                ▼
user_org_business_role  user_org_admin_role  (is_active)
          │
          ▼
     org_config (scope ORG)
          │
          ▼
  org_permission / user_permission (Niveau 2)
          │
          ▼
  org_exception / user_exception (Niveau 3)


user_org_membership ──→ user_group_member ──→ user_group
                                                    │
                         ┌──────────────────────────┤
                         ▼                          ▼
                  group_permission         group_scope_object
                         │
                  group_org_participant (1..N ORG par groupe)
                         │
                  group_org_admin (group admins par ORG)
                         │
                  group_org_rule ──→ group_org_rule_permission
                         │
                  group_org_rule_acceptance (état par ORG)
```

---

## 5. Corrections du blueprint précédent

Le blueprint produit lors de la session précédente (2026-03-23) contenait plusieurs points incorrects ou incomplets au regard des décisions validées ensuite. Ils sont listés ici pour ne pas être reproduits.

---

### Correction C1 — `member_role_id` dans `user_org_membership`

**Ce qui était proposé :** `user_org_membership` contenait une colonne `member_role_id`.

**Ce qui est correct :** Le membership (appartenance à une ORG) et l'affectation du rôle sont **deux concepts séparés**. `user_org_membership` ne doit porter que le fait d'appartenir. Les rôles sont portés par `user_org_business_role` et `user_org_admin_role`, chacun dans sa propre table, avec sa propre logique de contrainte.

---

### Correction C2 — Un seul type de rôle membership

**Ce qui était proposé :** `ref_org_member_role` avec des codes `org_admin`, `org_editor`, `org_viewer` fusionnant métier et administration.

**Ce qui est correct :** Le rôle métier et le rôle d'administration sont deux dimensions orthogonales. Ils doivent avoir deux tables de référence distinctes (`ref_org_business_role` et `ref_org_admin_role`) avec des catalogues et des contraintes différents. Un user peut être `editor` (métier) et `org_manager` (administration) sans que ces deux dimensions interfèrent.

---

### Correction C3 — `org_config.can_create_objects`

**Ce qui était proposé :** `org_config` portait une colonne `can_create_objects`.

**Ce qui est correct :** `org_config` ne porte que le **scope d'accès** (Niveau 1). La permission de créer des objets (`create_object`) est une permission d'action (Niveau 2) et appartient dans `org_permission` ou `user_permission`. Mélanger scope et permissions dans `org_config` violerait la séparation des niveaux.

---

### Correction C4 — Groupes multi-ORG reportés

**Ce qui était proposé :** les groupes multi-ORG étaient listés dans "Ce qu'on reporte" — reportés à une phase future non définie.

**Ce qui est correct :** les groupes multi-ORG **font partie du modèle cible et du modèle de données**. Leur implémentation est phasée, mais le schéma doit les anticiper dès la conception. Les tables `group_org_participant`, `group_org_admin`, `group_org_rule`, `group_org_rule_acceptance` doivent être conçues en même temps que les tables de groupes mono-ORG, même si elles sont remplies plus tard.

---

### Correction C5 — Gouvernance multi-ORG absente

**Ce qui était proposé :** aucune modélisation de la gouvernance multi-ORG (validation, états, droits de dissolution, etc.).

**Ce qui est correct :** le modèle multi-ORG inclut une gouvernance explicite avec des états par ORG (`proposed`, `accepted`, `refused`), des horodatages, une réversibilité et des règles d'administration décentralisées (group admin par ORG). Ces éléments doivent figurer dans le modèle de données.

---

### Correction C6 — `ref_org_role` seeds absents = bloquant non signalé comme tel

**Ce qui était proposé :** les seeds manquants étaient mentionnés mais présentés comme une étape parmi d'autres.

**Ce qui est correct :** les seeds de `ref_org_role` (`publisher`, `contributor`, `reader`) sont un **pré-requis bloquant absolu**. `object_org_link` est inutilisable sans eux. Aucune partie du modèle d'accès ne peut fonctionner si l'ORG ne peut pas être rattachée à ses objets avec un rôle. Ces seeds doivent partir en étape 0, isolés et prioritaires.

---

## 6. Watch-outs architecturaux

Ces points d'attention doivent être connus avant de commencer l'implémentation. Ils ne remettent pas en cause le modèle, mais conditionnent la façon dont certaines parties doivent être construites.

---

### 6.1 Performance RLS

**Risque :** une fonction `api.user_has_permission(permission_code)` appelée ligne par ligne dans des policies RLS sur de gros volumes devient rapidement coûteuse. Si la résolution complète des permissions est recalculée pour chaque ligne d'une table d'objets (potentiellement plusieurs milliers de lignes), les requêtes peuvent dégénérer.

**Points d'attention :**

- Éviter le modèle naïf où `api.user_has_permission()` est utilisée directement dans une clause `USING (...)` portant sur une table de données volumineuse sans index ou mise en cache.
- Prévoir des **helpers SQL ciblés** pour des vérifications fréquentes (ex : `api.user_can_read_object(p_object_id)` qui court-circuite les cas simples avant d'appeler la résolution complète).
- Concevoir des **index adaptés** sur les tables `user_permission`, `org_permission`, `user_exception`, `org_exception`, ciblés sur les colonnes les plus filtrées (`user_id`, `org_object_id`, `permission_id`).
- Envisager une **matérialisation contrôlée** des droits effectifs si le volume ou la latence le justifient (ex : table de cache `user_effective_permissions` recalculée sur changement).

**Ce que le JWT ne doit pas porter :**

Le JWT ne peut pas servir de source de vérité complète des permissions effectives, pour plusieurs raisons :

- Les droits peuvent changer pendant la session (invitation retirée, rôle modifié, exception ajoutée).
- Les règles de groupe multi-ORG ont des états évolutifs (`accepted` → `refused` et vice-versa).
- Certaines permissions dépendent du contexte objet (ex : `edit_canonical_when_publisher` n'est valide que si l'ORG est publisher sur cet objet précis).

Le JWT peut au plus porter du contexte simple et stable :
- `user_id`
- rôle plateforme (`owner`, `super_admin`, `tourism_agent`)
- éventuellement `org_object_id` courant

La vérification des permissions effectives doit toujours être faite côté base de données, au moment de l'action.

---

### 6.2 Cycle de vie des permissions et exceptions

**Risque :** le modèle génère des droits qui peuvent devenir obsolètes ou incohérents si les événements de cycle de vie ne sont pas gérés. Un user qui change d'ORG ou de rôle doit voir ses droits recalculés, pas conservés silencieusement.

**Événements à gérer explicitement :**

| Événement | Effet attendu |
|-----------|--------------|
| **Changement d'ORG** (user rattaché à une nouvelle ORG) | Purge forte ou désactivation de : `user_permission`, `user_exception`, memberships dans tous les groupes liés à l'ancienne ORG, `user_org_business_role`, `user_org_admin_role`. |
| **Changement de rôle dans la même ORG** | Audit obligatoire des `user_permission` additives et `user_exception` : vérifier si elles restent cohérentes avec le nouveau rôle. Revalidation éventuelle par un administrateur. |
| **Sortie d'une ORG d'un groupe multi-ORG** | Retrait immédiat de tous les membres de cette ORG du groupe + suppression des droits accordés par ce groupe à ces membres (voir §3.4). |
| **Rôle admin retiré** | Audit des droits administratifs délégués par cet admin : vérifier si des sous-droits accordés par lui doivent être retirés ou revalidés. |

**Implication sur le modèle :**

Le cycle de vie doit être anticipé dès la phase de schéma, notamment pour :
- `user_permission` : doit être liée à l'ORG courante du user pour permettre la purge ciblée.
- `user_exception` : même contrainte.
- `user_group_member` : la contrainte d'appartenance ORG doit être revérifiée à chaque changement de membership.
- Participations à des groupes multi-ORG : l'état `group_org_participant.left_at` doit être utilisé pour tracer la sortie sans détruire l'historique.

Ces cleanups doivent être implémentés comme des triggers ou des procédures explicites, pas comme des comportements implicites.

---

## 7. Plan d'implémentation global

L'implémentation se déroule en phases séquentielles. Chaque phase doit être stable et déployable avant de commencer la suivante.

---

### Phase 0 — Seeds manquants (pré-requis bloquant)

**Fichier :** `seeds_data.sql`

- Ajouter les seeds `ref_org_role` : `publisher`, `contributor`, `reader`.

Sans ces seeds, toute la suite est bloquée. Cette phase est atomique et sans risque de régression.

---

### Phase 1 — Fondation du modèle (schéma uniquement, pas de RLS)

**Fichier :** `schema_unified.sql`, `seeds_data.sql`

1. Créer `ref_org_business_role` + seeds (codes verrouillés — décision D1 figée : `viewer`/10, `contributor`/20, `editor`/30)
2. Créer `ref_org_admin_role` + seeds avec rang numérique (codes verrouillés — décision D2 figée : `team_lead`/10, `org_manager`/20, `org_admin`/30)
3. Créer `user_org_membership`
4. Créer `user_org_business_role`
5. Créer `user_org_admin_role`
6. Ajouter colonne `actor_id` dans `app_user_profile` + index unique partiel
7. Créer `org_config`
8. Créer `ref_permission` + seeds (liste §2.3)
9. Créer `org_permission`, `user_permission`
10. Créer `org_exception`, `user_exception`
11. Créer `user_group`, `user_group_member`, `group_permission`, `group_scope_object`
12. Créer `group_org_participant`, `group_org_admin`, `group_org_rule`, `group_org_rule_permission`, `group_org_rule_acceptance`

**Pas de RLS modifiée à cette phase.** L'existant continue de fonctionner via le chemin acteur.

---

### Phase 2 — Intégration RLS minimale (membership)

**Fichier :** `rls_policies.sql`

1. Créer `api.current_user_org_id()` — retourne l'`org_object_id` actif du user
2. Créer `api.current_user_business_role_code()` — retourne le code du rôle métier
3. Créer `api.current_user_admin_role_code()` — retourne le code du rôle admin (ou NULL)
4. **Modifier** `api.can_read_extended()` — OR entre l'ancien chemin acteur (conservé) et le nouveau chemin membership + `org_config.access_scope`
5. Ajouter policies RLS sur `user_org_membership`, `user_org_business_role`, `user_org_admin_role`
6. Ajouter policies RLS sur `org_config`

**L'ancien chemin `api.user_actor_ids()` est conservé intact.** Il ne peut être retiré qu'après audit de couverture 100% des memberships.

---

### Phase 3 — Intégration permissions d'action (RLS + fonctions)

**Fichier :** `rls_policies.sql`

1. Créer `api.user_has_permission(permission_code text)` — résolution complète Niveaux 1/2/3
   - Ordre de résolution : `user_exception (revoke)` → `user_exception (grant)` → `user_permission` → `group_permission` → `org_permission` → défaut `FALSE`
2. Créer `api.user_can_write_canonical(p_object_id text)`
3. Créer `api.user_can_write_enrichment(p_object_id text)`
4. Modifier les policies d'écriture des objets pour vérifier `api.user_has_permission(...)`
5. Ajouter policies RLS sur `org_permission`, `user_permission`, `org_exception`, `user_exception`

---

### Phase 4 — Intégration API (vues et fonctions exposées)

**Fichier :** `api_views_functions.sql`

1. `api.get_user_context()` — retourne en JSON : org_object_id, business_role_code, admin_role_code, actor_id, permissions effectives
2. Vue `v_org_members` — liste des membres d'une ORG avec leurs rôles
3. Vue `v_user_effective_permissions` — debug + admin panel
4. Vue `v_org_groups` — groupes d'une ORG

---

### Phase 5 — Intégration bootstrap session (frontend)

**Fichiers :** `bertel-tourism-ui/src/hooks/useBootstrapSession.ts`, `bertel-tourism-ui/src/services/user-profile.ts`

1. Appeler `api.get_user_context()` au bootstrap
2. Charger dans le store : `org_object_id`, `business_role`, `admin_role`, `actor_id`, `permissions`
3. Mettre à jour l'interface `AppUserProfileRow`

---

### Phase 6 — Interface d'administration ORG (frontend)

À planifier séparément :
- Page membres de l'ORG
- Page groupes
- Page permissions
- Formulaires d'invitation et de modification de rôle

---

### Phase 7 — Groupes multi-ORG (implémentation opérationnelle)

Les tables `group_org_*` sont créées en Phase 1 mais restent vides. Cette phase les active :

1. Interface super admin : création de groupe multi-ORG + désignation group admins
2. Logique de validation des règles (`group_org_rule_acceptance`)
3. RLS sur les tables `group_org_*`
4. Extension de `api.user_has_permission()` pour intégrer les règles acceptées

---

## 8. Décisions verrouillées (anciennement "restantes")

**Toutes les décisions sont verrouillées.** D1 et D2 sont figées. Aucune décision ouverte ne subsiste. Le document est une base de référence complète pour l'implémentation.

---

### D1 — Codes de `ref_org_business_role` ✓ VERROUILLÉ

**Décision figée le 2026-03-23.**

| `code` | Label | Position | Description |
|--------|-------|----------|-------------|
| `viewer` | Lecteur | 10 | Consultation uniquement dans le périmètre accessible à l'ORG et au user. Ne peut ni créer ni modifier. |
| `contributor` | Contributeur | 20 | Saisit, enrichit et met à jour dans le périmètre autorisé. Crée du contenu, ne valide pas. |
| `editor` | Éditeur | 30 | Contrôle qualité, correction, validation éditoriale, amélioration des contenus dans le périmètre autorisé. |

**Invariants applicables (§2.4) :**
- Le rôle métier est orthogonal au scope ORG. `viewer` ne restreint pas le scope ; `editor` ne l'élargit pas.
- Le rôle métier est orthogonal aux permissions d'action. Aucun de ces codes ne confère de permission implicite — les permissions sont portées par `org_permission` ou `user_permission`.
- Le rôle métier est orthogonal au rôle admin. Un `editor` peut ne pas avoir de rôle admin ; un `viewer` peut être `team_lead`.

**Sur le rôle `coordinator` :** évalué et exclu des seeds V1. Dans un modèle où scope (Niveau 1) et permissions (Niveau 2) sont séparés, `coordinator` ne peut valoir que comme étiquette professionnelle distincte d'`editor`. Or la distinction entre éditeur et coordinateur territorial s'exprime entièrement via les groupes et les permissions — pas via le rôle métier. L'inclure en V1 créerait un risque de dérive : les équipes y liraient un niveau de droits implicite, ce qui contredirait la séparation fondamentale. `coordinator` peut être ajouté ultérieurement si une justification purement fonctionnelle émerge.

**Seeds Phase 1 :** débloqués — peuvent être écrits.

---

### D2 — Codes de `ref_org_admin_role` avec rangs ✓ VERROUILLÉ

**Décision figée le 2026-03-23.**

| `code` | Label | Rang | Description |
|--------|-------|------|-------------|
| `team_lead` | Référent équipe | 10 | Premier niveau de délégation administrative dans l'ORG. |
| `org_manager` | Gestionnaire ORG | 20 | Niveau d'administration opérationnelle de l'ORG. |
| `org_admin` | Administrateur ORG | 30 | Niveau administratif le plus élevé dans l'ORG, sans dépasser le `super_admin` plateforme. |

**Invariants applicables (§2.6) :**
- Un `team_lead` (rang 10) ne peut gérer que des droits de rang strictement inférieur à 10 — en V1 cela revient à la gestion des membres non-admin.
- Un `org_manager` (rang 20) peut gérer les `team_lead` mais pas les `org_admin`.
- Un `org_admin` (rang 30) peut gérer tous les rôles d'administration inférieurs dans son ORG, pas les `super_admin` plateforme.
- Aucun de ces rôles ne bypasse `api.user_has_permission()` (règle §2.6 "Admin sans bypass").

**Seeds Phase 1 :** débloqués — peuvent être écrits.

---

*Fin du document — version 1.5, 2026-03-23*
