# Plan technique — Introduction du type `ACT`
# Activité commerciale encadrée

**Version :** 1.1
**Date :** 2026-03-21
**Statut :** Plan validé métier — en attente d'implémentation
**Prérequis :** Pilote Lot 1 validé

> Ce plan est **distinct du pilote Lot 1** et doit être exécuté après sa validation.
> Aucune des 10 fiches du pilote n'est de type `ACT`.
> Ne pas implémenter ce plan avant la validation complète du pilote.

---

## 0. Rappel des invariants métier

Ces définitions sont figées et ne doivent pas être remises en cause dans ce lot.

| Type | Définition | Ce que ce n'est pas |
|---|---|---|
| `PNA` | Site / spot / point de pratique nature-aventure | Pas une prestation commerciale |
| `ITI` | Parcours / tracé géographique structuré (LINESTRING) | Pas une sortie guidée vendue |
| `FMA` | Événement daté (concert, festival, manifestation) | Pas une activité récurrente à la demande |
| `ACT` | **Prestation commerciale encadrée, réservable, tarifée, définie par une durée** | Pas un lieu, pas un tracé, pas un événement |

### Règle ORG / ACTOR — invariant transversal

| Couche | Rôle | Exemples |
|---|---|---|
| `ORG` (object_type) | Structure institutionnelle. Portage large dans le SIT, publication, rattachement organisationnel. | OTI du Sud, CIVIS, Chambre de Commerce, fédération sportive |
| `ACTOR` (table `actor`) | Exploitant réel, gérant, owner, guide, moniteur, contact opérationnel. Personne physique ou entité opérationnelle directe. | Gérant du club de plongée, moniteur de parapente, exploitant du gîte, guide de montagne |

**Pour un objet `ACT`, le rattachement se fait sur deux couches distinctes :**
- `object_org_link [publisher]` → `OTI du Sud` (ORG) : portage institutionnel dans le SIT
- `actor_object_role [operator]` ou `[guide]` → l'entité commerciale ou la personne qui opère la prestation

Un club de plongée ou une société de canyoning n'est **pas** une `ORG` dans ce modèle sauf si elle joue un rôle institutionnel de portage SIT. En tant qu'opérateur d'une prestation, elle est portée côté `ACTOR`.

**`secondary_types` ne doit pas être utilisé pour remplacer `ACT`.**
`secondary_types` est réservé aux rares cas d'appartenance inter-famille canonique (ex : ITI + {LOI}).
Un objet `FMA` avec une activité commerciale n'est pas `FMA` + `{ACT}` — c'est deux objets distincts.

---

## 1. Décision métier actée

### 1.1 Périmètre de `ACT`

Un objet est de type `ACT` si et seulement si il vérifie les quatre critères suivants :

1. **Encadré** : présence d'un professionnel qualifié (guide, moniteur, instructeur)
2. **Réservable** : accessible sur rendez-vous ou via centrale de réservation
3. **Tarifé** : prix défini à la personne ou au groupe
4. **Durée définie** : la prestation a une durée intrinsèque (non liée à une date unique)

### 1.2 Exemples canoniques `ACT`

- Sortie canyoning guidée (4h, 8 personnes max, 65 €/pers, guide certifié)
- Baptême de plongée (1h30, débutants, 55 €, avec moniteur)
- Parapente biplace tandem (20 min, sur réservation, 90 €)
- Randonnée guidée journée (8h, 12 pers max, 40 €, guide agréé)
- Kayak de mer encadré (2h, tous niveaux, 35 €/pers)
- Session escalade initiation (demi-journée, 6 pers max, 45 €, BEES requis)
- Cours de surf (1h30, débutants, 30 €)

### 1.3 Exemples qui ne sont PAS `ACT`

| Objet | Type correct | Raison |
|---|---|---|
| Canyon de la Rivière Langevin | `PNA` | Site géographique fixe, pas une prestation |
| Spot de plongée Roches Noires | `PNA` | Zone marine délimitée, pas une offre |
| Sentier du Piton de la Fournaise | `ITI` | Tracé balisé libre, pas une prestation vendue |
| Festival Sakifo | `FMA` | Événement daté unique |
| Salle de fitness (accès libre) | `LOI` ou `COM` | Pas d'encadrement professionnel obligatoire |
| Boutique de location de vélos | `COM` | Vente/location, pas encadrement |

---

## 2. DDL nécessaire

### 2.1 Extension de l'ENUM `object_type`

**Une seule instruction, non destructive :**

```
ALTER TYPE object_type ADD VALUE IF NOT EXISTS 'ACT';
```

- N'affecte aucun objet existant
- Le trigger `api.generate_object_id` gère automatiquement le préfixe `ACT{REGION}...`
- La contrainte `chk_object_id_shape` (`^[A-Z]{3}[A-Z0-9]{3}[0-9A-Z]{10}$`) est respectée

### 2.2 Nouvelle table `object_act`

Table d'extension 1:1 sur `object`, modèle identique à `object_fma` et `object_iti`.

**Champs minimaux :**

| Colonne | Type | Contrainte | Justification |
|---|---|---|---|
| `object_id` | TEXT | PK, FK → object(id) ON DELETE CASCADE | Clé d'extension 1:1 |
| `duration_min` | INTEGER | CHECK (duration_min > 0) | Durée intrinsèque — critère de définition du type |
| `min_participants` | SMALLINT | CHECK (>= 1), nullable | Taille groupe minimum commercial |
| `max_participants` | SMALLINT | CHECK (>= min_participants), nullable | Capacité réelle groupe |
| `difficulty_level` | SMALLINT | CHECK (BETWEEN 1 AND 5), nullable | Échelle identique à `object_iti.difficulty_level` |
| `guide_required` | BOOLEAN | NOT NULL DEFAULT TRUE | Caractère encadré — critère de définition |
| `min_age` | SMALLINT | nullable | Contrainte sécurité (parapente, canyoning…) |
| `equipment_provided` | BOOLEAN | NOT NULL DEFAULT FALSE | Impact tarif et communication visiteur |
| `site_object_id` | TEXT | FK → object(id) ON DELETE SET NULL, **nullable** | Lien optionnel vers le PNA/site support |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | — |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | — |

**`site_object_id` est optionnel.** Une ACT peut exister sans PNA associé (activité en piscine, salle d'escalade intérieure, cours de cuisine). Quand il est renseigné, il pointe conventionnellement vers un `PNA` mais aucune contrainte de type n'est imposée à la DB (même pattern que `object_membership.org_object_id`).

**Champs explicitement hors périmètre pour ce lot :**

| Champ | Raison du report |
|---|---|
| `is_bookable_online` | Dépend d'une intégration centrale de réservation non encore modélisée |
| `weather_dependent` | Requiert une source météo — Lot 3 |
| `season_codes TEXT[]` | Saisonnalité exploitable seulement quand les filtres API exposent `ACT` |
| `equipment_list JSONB` | Granularité excessive pour l'import initial ; `equipment_provided` booléen suffit |
| `certification_required TEXT` | Couvert par `object_classification` (scheme `type_act`) |

---

## 3. Seeds nécessaires

### 3.1 Scheme `type_act`

Nouveau `ref_classification_scheme` :

| Champ | Valeur |
|---|---|
| `code` | `type_act` |
| `name` | `Type d'activité encadrée` |
| `selection` | `single` |
| `is_distinction` | `FALSE` |
| `display_group` | (null — pas un label/distinction) |

### 3.2 Valeurs `type_act`

12 valeurs initiales, couvrant le corpus La Réunion et les cas de requalification du mapping :

| `code` | `name` | `ordinal` |
|---|---|---|
| `canyoning` | Canyoning | 1 |
| `plongee` | Plongée sous-marine | 2 |
| `parapente` | Parapente | 3 |
| `kayak` | Kayak / Paddle | 4 |
| `randonnee_guidee` | Randonnée guidée | 5 |
| `escalade` | Escalade encadrée | 6 |
| `snorkeling` | Snorkeling encadré | 7 |
| `surf_cours` | Cours de surf | 8 |
| `vtt_guide` | VTT guidé | 9 |
| `equitation` | Équitation | 10 |
| `remise_en_forme` | Remise en forme / Fitness | 11 |
| `autre` | Autre activité encadrée | 12 |

### 3.3 Nouveaux `ref_object_relation_type`

Deux nouveaux types de relation pour lier ACT à ses objets supports :

| `code` | `name` | `description` |
|---|---|---|
| `uses_itinerary` | Suit l'itinéraire | Une ACT emprunte un tracé ITI (randonnée guidée, VTT guidé) |
| `based_at_site` | Se pratique sur le site | Une ACT se déroule sur un PNA (canyoning, plongée, parapente) |

Ces types utilisent la table `object_relation` existante — aucun DDL de table supplémentaire.

**Hiérarchie de lien recommandée :**
- `object_act.site_object_id` → pour le lien primaire fort (le site principal)
- `object_relation [uses_itinerary]` → pour le lien secondaire vers un ITI
- `object_relation [based_at_site]` → alternatif à `site_object_id` si le FK direct n'est pas posé

### 3.4 Rattachement organisationnel d'un ACT

Un objet `ACT` est rattaché à deux couches distinctes, non interchangeables :

```
ACT (Sortie canyoning Langevin)
  ├── object_org_link  [publisher]      → ORG  : OTI du Sud (portage SIT)
  ├── actor_object_role [operator]      → ACTOR : prestataire commercial (club, société, moniteur)
  ├── object_act.site_object_id         → PNA  : Canyon Rivière Langevin (optionnel)
  ├── object_relation [uses_itinerary]  → ITI  : Sentier du canyon (optionnel)
  ├── object_price                      → tarifs
  └── object_classification [type_act]  → type : canyoning
```

L'opérateur commercial (club de plongée, société de canyoning, moniteur indépendant) est toujours un `ACTOR`, jamais une `ORG`, sauf s'il joue lui-même un rôle institutionnel de portage SIT.
Les rôles `owner` et `manager` dans `ref_org_role` ne doivent pas être attribués à des ORG commerciales opératrices : ces rôles relèvent de la couche `actor_object_role`.

---

## 4. Impact sur le mapping actuel

### 4.1 Requalifications nécessaires dans `lot1_mapping_plan.md §1.4`

| `Nom catégorie` (formulaire) | Mapping actuel | Statut | Correction cible |
|---|---|---|---|
| `Remise en forme` | `FMA` | **Incorrect** — prestation récurrente, pas un événement daté | `ACT`, `type_act = remise_en_forme` |
| `Divertissement` | `FMA` | **Partiel** — ambigu selon le contenu | Voir §4.2 |
| `Terre` | `ITI` | **Partiel** — le tracé libre = ITI correct ; la sortie guidée commerciale = ACT | Voir §4.3 |
| `Etangs et rivières ; Mer` (2 cas) | Non résolu | **Résolu par ACT** | Voir §4.4 |
| `Patrimoine naturel` | `ITI` ou `LOI` (en suspens) | **Partiellement résolu par ACT** | Voir §4.5 |

### 4.2 Arbitrage `Divertissement`

Trois sous-cas métier distincts — arbitrage requis pour chaque fiche :

| Sous-cas | Type correct |
|---|---|
| Spectacle, concert, représentation datée | `FMA` |
| Activité physique guidée (tyrolienne, accrobranche, laser game…) | `ACT` |
| Bar, discothèque, cinéma | `COM` |

### 4.3 Arbitrage `Terre` (randonnée, VTT, équitation)

Deux objets distincts peuvent coexister pour le même lieu :

| Objet | Type |
|---|---|
| Le sentier balisé (tracé libre) | `ITI` |
| La sortie guidée commerciale sur ce sentier | `ACT`, lien `uses_itinerary` → ITI |

Si la fiche `formulaire` décrit une prestation avec tarif et encadrement → `ACT`.
Si la fiche décrit un sentier ou circuit libre → `ITI`.
Arbitrage à faire fiche par fiche.

### 4.4 Résolution `Etangs et rivières ; Mer` (2 cas — Adrenalile, Aquasens)

| Objet | Type |
|---|---|
| Le site nautique (zone d'eau, point GPS) | `PNA` |
| L'activité commerciale nautique (kayak, plongée, snorkeling encadré) | `ACT`, `site_object_id → PNA` |

Ces 2 fiches décrivent vraisemblablement des prestataires d'activités nautiques → `ACT`.
À confirmer à la lecture des fiches avant import.

### 4.5 Résolution `Patrimoine naturel`

| Sous-cas | Type correct |
|---|---|
| Site naturel accessible librement (sentier, cascade, zone géologique) | `PNA` |
| Visite guidée payante d'un site naturel | `ACT`, `site_object_id → PNA` |

---

## 5. Ce qui reste hors périmètre de ce lot

| Sujet | Pourquoi hors périmètre |
|---|---|
| Intégration système de réservation en ligne | Dépend d'une architecture externe non définie |
| Exposition `ACT` dans les filtres API de l'explorateur | Post-import — quand le volume le justifie |
| Domaine `activity_type` (ref_code orphelin) | À déprécier en Lot 3 au profit de `type_act` — pas urgent |
| `seasonal_availability` (disponibilité par saison) | Lot 3 — `object_price` avec `valid_from`/`valid_to` suffit à court terme |
| Gestion d'équipement détaillée | Lot 3 — `equipment_provided` booléen suffit |
| Contrainte DB CHECK `object_type = 'PNA'` sur `site_object_id` | Non implémentée — convention métier suffisante à ce stade |
| Import des ACT de la feuille `formulaire` | Après arbitrages §4.2–4.5 et après validation pilote |

---

## 6. Ce qu'on ne doit pas faire

### 6.1 Ne pas étendre l'ENUM pour des sous-types

`chambre_dhotes`, `table_dhotes`, `canyoning`, `plongee` ne sont **jamais** des valeurs d'`object_type`.
Les sous-types métier se portent dans `object_classification` (scheme `type_act`, `type_hlo`, `type_res`, etc.).

### 6.2 Ne pas utiliser `secondary_types` à la place de `ACT`

`secondary_types` est réservé aux objets appartenant simultanément à deux familles canoniques (ex : ITI + {LOI}).
Un objet `FMA` qui porte aussi une prestation commerciale n'est pas `FMA` avec `secondary_types = {ACT}`.
C'est soit un FMA (l'événement), soit un ACT (la prestation), selon ce qui est décrit.

### 6.3 Ne pas faire rentrer les activités commerciales dans `PNA`

`PNA` est un site géographique. Il n'a pas de tarif propre, pas de durée, pas de guide.
Mettre une sortie canyoning dans `PNA` dilue le sens du type et rend le SIT inexploitable pour les OTA.

### 6.4 Ne pas traiter `FMA` comme un fourre-tout pour les activités de loisir

`FMA` = événement daté. Toute activité sans date fixe constitutive **n'est pas un FMA**.
`Remise en forme`, `cours de surf`, `sortie kayak sur réservation` ne sont pas des FMA.

### 6.5 Ne pas modéliser les opérateurs commerciaux comme ORG

Un club de plongée, une société de canyoning, un moniteur indépendant, un exploitant de gîte ne sont **pas** des `ORG` dans le sens de ce modèle.
`ORG` est réservé aux structures institutionnelles qui portent des objets dans le SIT (OTI, intercommunalité, fédération).
L'opérateur d'une prestation `ACT` est un `ACTOR` lié via `actor_object_role`.
Créer une `ORG` pour chaque prestataire commercial produirait une explosion d'ORG sans valeur institutionnelle et diluerait le rôle `object_org_link`.

### 6.6 Ne pas confondre `object_org_link` et `actor_object_role`

`object_org_link` : lien entre un objet et une ORG institutionnelle — portage, publication, rattachement SIT.
`actor_object_role` : lien entre un objet et un ACTOR opérationnel — gérance, exploitation, guidage, propriété.
Les rôles `owner` et `manager` de `ref_org_role` ne doivent pas être utilisés pour des entités commerciales opératrices : ces notions appartiennent à `ref_actor_role`.

### 6.7 Ne pas implémenter ce lot avant la validation du pilote

Le pilote Lot 1 porte 10 fiches HLO/RES/LOI. Aucune n'est de type `ACT`.
Introduire `ACT` avant la validation du pilote serait du scope creep inutile.

---

---

## 7. Résumé des actions à réaliser (dans l'ordre)

| # | Action | Nature | Prérequis |
|---|---|---|---|
| 1 | Valider le pilote Lot 1 (10 fiches) | Métier | — |
| 2 | `ALTER TYPE object_type ADD VALUE 'ACT'` | DDL non-destructif | Pilote validé |
| 3 | `CREATE TABLE object_act` (champs §2.2) | DDL | Étape 2 |
| 4 | Seed `ref_classification_scheme` : `type_act` | SQL seed | Étape 2 |
| 5 | Seed `ref_classification_value` : 12 valeurs | SQL seed | Étape 4 |
| 6 | Seed `ref_object_relation_type` : `uses_itinerary`, `based_at_site` | SQL seed | Étape 2 |
| 7 | Mettre à jour `lot1_mapping_plan.md §1.4` avec les requalifications | Plan | Arbitrages §4.2–4.5 résolus |
| 8 | Implémenter l'import des ACT | Import | Étapes 2–7 |
