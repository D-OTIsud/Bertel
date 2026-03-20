# Plan de migration sans rupture d'API — Bertel SIT

**Version :** 1.3
**Date :** 2026-03-20
**Statut :** Garde-fous validés — base vierge confirmée — en attente d'approbation pour exécution Lot 1
**Périmètre :** 4 sujets prioritaires issus de l'analyse du fichier Excel `Etablissements (3).xlsx`

---

## Principes directeurs

- La nouvelle base Supabase est la **cible canonique**. L'Excel révèle des manques ; il ne dicte pas la structure.
- Tous les changements sont **additifs**. Aucune API existante ne change de comportement.
- Les éléments transitoires sont **explicitement documentés** et portent une condition de suppression.
- `object.object_type` reste le **type principal de référence** pour toutes les APIs existantes, sans exception.
- `p_types object_type[]` dans `get_filtered_object_ids` continue de signifier le **type principal uniquement**. Aucune extension implicite.
- Un filtre n'est exposé dans l'API qu'une fois la donnée **backfillée et stabilisée**.
- Tout champ secondaire ou transitoire est **opt-in** : seul le code qui l'invoque explicitement en tient compte.

---

## A. Plan révisé par sujet

---

### A1. Géographie / Zones / Lieux-dits

**Contexte :**
L'Excel révèle un référentiel géographique implicite à deux niveaux dans le champ "Lieux-dits" :
`"Plaine des Cafres / Plaines et volcan"` → lieu-dit / zone touristique (massif).
`object_location` dispose d'un champ `lieu_dit` libre utilisé par le filtre `lieu_dit_any`.
Aucune table de référence de zones / massifs n'existe dans le schéma.

**Décision retenue :** Option minimale avec garde-fou de non-exposition API.

**Ce qui change maintenant :**
- Ajouter `zone_touristique TEXT` nullable sur `object_location` (schéma additif).
- Ce champ est documenté explicitement comme **transitoire** dans les commentaires SQL : sa vocation est de recevoir la donnée brute Excel jusqu'à ce qu'un référentiel structuré soit validé.
- Ce champ est **non exposé comme filtre API** tant que la donnée n'est pas backfillée et normalisée.

**Ce qui est explicitement reporté :**
- Créer `ref_zone_touristique` (id, code, nom, commune_ids[]) — après confirmation besoin UI.
- Créer `ref_lieu_dit` avec FK vers zone — après `ref_zone_touristique`.
- Exposer `zone_touristique_any` dans `p_filters` — uniquement après backfill validé et données stabilisées.
- Hiérarchie complète région > commune > zone > lieu-dit > GPS.

**Impact API :**
Aucun. Champ nullable additionnel, non référencé dans les vues ou fonctions existantes. La sémantique de `lieu_dit_any` dans `p_filters` est inchangée.

---

### A2. Multi-appartenance des objets

**Contexte :**
21 établissements dans l'Excel ont plusieurs catégories (ex : hôtel-restaurant, ferme avec table d'hôtes).
`object.object_type` est un enum single-value.
Le schéma actuel n'accepte pas qu'un objet appartienne à plusieurs types.

**Décision retenue :** Structure secondaire transitoire — non canonique, opt-in, explicitement documentée.

**Ce qui change maintenant :**
- Ajouter `secondary_types object_type[] NOT NULL DEFAULT '{}'` sur `object`.
- Ce champ est **non-canonique** : `object.object_type` reste le type principal de référence, sans exception.
- Aucune API existante ne lit, ne filtre, ni n'utilise `secondary_types` automatiquement.
- Son usage est **opt-in** : seul le code qui l'invoque explicitement en tient compte.
- Le champ est documenté dans les commentaires SQL comme transitoire et potentiellement remplaçable.

**Ce qui est explicitement reporté :**
- Étendre `get_filtered_object_ids` pour filtrer sur `secondary_types` — uniquement via une clé dédiée dans `p_filters` (ex: `secondary_types_any`), jamais implicitement via `p_types`.
- Junction table `object_type_link` — sur-modélisation pour 21 cas, écarté pour l'instant.
- Modifier l'enum `object_type` (HOT, HLO, RES…) — pas de nouveaux types sans validation métier complète.

**Impact API :**
Aucun. `object_type` principal inchangé. `p_types` dans `get_filtered_object_ids` filtre uniquement sur `object.object_type`. `secondary_types` est ignoré par toutes les APIs existantes. Aucune extension silencieuse.

**Garde-fou explicite :**
`secondary_types` est une structure de transition. Si la multi-appartenance devient un besoin structurant majeur (>50 objets, besoin UI confirmé), une junction table `object_type_link` prendra le relais. La condition de remplacement est documentée dans le registre de dette.

---

### A3. OTA / Airbnb / Canaux de diffusion

**Contexte :**
L'Excel contient 230 liens Airbnb, 48 Leboncoin, 27 Abritel — absents des seeds.
Ces plateformes sont actuellement classées sémantiquement comme `social_network` dans `ref_code`, ce qui est incorrect.
Booking (227 liens) est seedé dans `social_network` — classement sémantiquement incorrect, décision prise de le corriger.

**Hypothèse de base confirmée (v1.3) :**
La base de données est **vierge**. Aucune donnée d'usage en production. Aucune contrainte de compatibilité de données existantes. Seuls les fichiers seeds définissent l'état initial.

**Décision retenue (v1.3 — décision métier finale) :**
`distribution_channel` est le **seul emplacement valide** pour Booking.com.
`social_network` ne doit pas contenir `booking`. Aucun doublon. Aucune vérification FK en base. Aucune migration de données existantes.

**Ce qui change maintenant (Lot 1) :**
- Créer le domaine `ref_code (distribution_channel)` avec : `airbnb`, `leboncoin`, `abritel`, `booking`.
- S'assurer que `ref_code (social_network, booking)` n'est pas présent dans `seeds_data.sql` — suppression ou non-insertion selon l'état actuel du fichier.

**Règle de migration future (import Lot 3 et données historiques) :**
Si des données historiques (Excel ou autre source) contiennent des liens Booking classés comme réseau social :
- Ces données doivent être remappées vers `distribution_channel.booking` lors de l'import.
- On préfère corriger la donnée à la source plutôt que conserver une mauvaise classification.
- Aucun lien Booking ne doit être inséré dans `social_network` à aucun moment.

**Ce qui est explicitement reporté :**
- Table dédiée OTA avec gestion de contrats, tarifs, parité — hors scope.

**Impact API :**
Aucun. `distribution_channel` est un nouveau domaine non référencé dans les fonctions existantes. Les APIs qui lisent `social_network` continuent à fonctionner sans Booking, ce qui est le comportement souhaité.

---

### A4. CRM prestataire OTI

**Contexte :**
Le domaine `ref_code (demand_topic)` seedé (information, réservation, groupe…) ne correspond pas aux 20 sujets réels OTI (Accompagnement Taxe de séjour, Promotion SIT, Demande signalétique…).
2000 interactions CRM historiques dans l'Excel utilisent ces sujets OTI.

**Décision retenue :** Nouveau domaine `crm_demand_topic_oti` dans `ref_code` — additif, sans toucher à `demand_topic`.

**Ce qui change maintenant :**
- Ajouter le domaine `ref_code (crm_demand_topic_oti)` avec les 20 valeurs réelles OTI.
- Normaliser 2 doublons de casse ("Accompagnement Taxe de séjour" / "Accompagnement taxe de séjour") sur la valeur canonique.
- `demand_topic` générique est conservé **intouché**.

**Ce qui est explicitement reporté :**
- Hiérarchie topic / subtopic CRM.
- Migration des 2000 interactions historiques vers le nouveau domaine — lot 3.
- Mappage `Humeur CRM` (émojis) vers un enum dédié `crm_sentiment` — lot 3 ou 4.

**Impact API :**
Aucun. Nouveau domaine additif. Les appels CRM existants avec `demand_topic` continuent à fonctionner.

---

## B. Matrice compatibilité API révisée

| Changement | API / fonction concernée | Contrat inchangé | Changement automatique | Stratégie |
|---|---|---|---|---|
| `zone_touristique TEXT` sur `object_location` | `get_filtered_object_ids`, vues location | ✅ oui | ❌ non | Champ invisible pour les APIs. Non exposé dans `p_filters` avant backfill. |
| `zone_touristique_any` dans `p_filters` | `get_filtered_object_ids` | ✅ oui | ❌ non | **Reporté.** N'existe pas encore. À ajouter uniquement après backfill stabilisé. |
| `secondary_types object_type[]` sur `object` | Toutes les APIs lisant `object` | ✅ oui | ❌ non | Champ additionnel non-canonique. Non lu automatiquement par aucune API. Opt-in explicite uniquement. |
| `p_types` — comportement **inchangé** | `get_filtered_object_ids` | ✅ oui | ❌ non | `p_types` filtre uniquement sur `object.object_type`. `secondary_types` ignoré sans exception. |
| Futur opt-in `secondary_types` dans filtre | `get_filtered_object_ids` | ✅ oui | ❌ non | **Reporté.** Via clé dédiée dans `p_filters` (ex: `secondary_types_any`), jamais via `p_types`. Aucune extension implicite. |
| Domaine `distribution_channel` | Aucune API existante | ✅ oui | ❌ non | Nouveau domaine pur seed. Aucune vue ni fonction ne l'expose. |
| `booking` absent de `social_network` (base vierge) | APIs lisant `social_network` | ✅ oui | ❌ non | Base vierge : Booking n'est jamais inséré dans `social_network`. Aucune vérification FK nécessaire. Comportement souhaité dès le départ. |
| Domaine `crm_demand_topic_oti` | APIs CRM `listCrmTasks`, etc. | ✅ oui | ❌ non | Nouveau domaine additif. `demand_topic` générique inchangé. |

**Règle absolue :** Aucun des changements de lot 1 ne modifie le comportement d'une API ou d'une vue existante. La base étant vierge, il n'existe aucune donnée à préserver — le seed correct dès le départ est la seule action nécessaire. Aucune extension silencieuse de la sémantique de `p_types`.

---

## C. Registre de dette transitoire

---

### C1. `secondary_types object_type[]`

| Attribut | Valeur |
|---|---|
| **Rôle** | Stocker les types secondaires d'un objet multi-appartenance (ex: hôtel-restaurant) |
| **Raison d'existence** | 21 établissements Excel ont plusieurs catégories. Junction table = sur-modélisation pour ce volume. |
| **Où il vit** | `public.object.secondary_types` |
| **Ce qu'il protège** | Évite de modifier l'enum `object_type` ou la sémantique de `p_types` dans l'API |
| **Condition de suppression** | Quand la multi-appartenance concerne >50 objets et que l'UI en a besoin structurellement, une junction table `object_type_link` prendra le relais |
| **Ce qu'il faudra supprimer** | Colonne `secondary_types`, migration des données vers `object_type_link`, mise à jour des rares points de code opt-in qui le lisent |

---

### C2. `zone_touristique TEXT` sur `object_location`

| Attribut | Valeur |
|---|---|
| **Rôle** | Stocker la zone touristique / massif en texte libre pendant la phase de backfill |
| **Raison d'existence** | Permet d'importer et conserver la donnée Excel sans créer `ref_zone_touristique` immédiatement |
| **Où il vit** | `public.object_location.zone_touristique` |
| **Ce qu'il protège** | Évite de créer un référentiel géographique dont la structure n'est pas encore validée côté UI |
| **Condition de suppression** | Quand `ref_zone_touristique` est créée et que toutes les valeurs texte ont été normalisées sur des IDs de la table de référence |
| **Ce qu'il faudra supprimer** | Champ texte libre, remplacé par `zone_touristique_id UUID REFERENCES ref_zone_touristique(id)` |

---

~~**C3. `booking` en double domaine**~~ — Sans objet (décision v1.3).

Base vierge. Booking.com est seedé **uniquement** dans `distribution_channel` dès le départ. Aucun doublon, aucune dette, aucune migration de données nécessaire.

---

## D. Lot 2 révisé

> Lot 2 = additif avec extension de filtre — **après validation lot 1 et backfill partiel**

**Ce qui entre dans le lot 2 :**

| Action | Justification | Prérequis |
|---|---|---|
| Étendre `ref_amenity` avec les ~10 équipements manquants confirmés (ventilateur, TV satellite, linge maison, sanitaires privés, piscine chauffée, etc.) | Valeurs confirmées dans l'Excel, sans ambiguïté métier | Validation de la liste exacte par l'équipe OTI |
| Compléter `ref_code (payment_method)` avec Eurocard, Tickets restaurant, Mandat postal | 3 valeurs fréquentes (55x, 61x, 41x) sans ambiguïté | — |
| Compléter `ref_code (social_network)` avec Instagram Reels, YouTube si usage réel confirmé | OTA couverts par `distribution_channel` — ces plateformes sont des vrais RS | Vérification dans les données réelles |
| Ajouter `Langue des Signes Française` dans `ref_language` | 1 occurrence, pertinence accessibilité | — |
| Ajouter `Certification accueil clientèle indienne` dans `ref_classification_scheme` si validé | 1 établissement dans l'Excel | Validation existence organisme certificateur |
| Compléter catégories `ref_sustainability_action_category` : `alimentation`, `sensibilisation`, `construction`, `engagement` | Valeurs réelles dans l'onglet D_Durable, non ambiguës | — |
| Exposer `zone_touristique_any` dans `p_filters` de `get_filtered_object_ids` | Filtre géographique utile pour l'UI | **Uniquement après backfill complet et données stabilisées** |

**Ce qui est retiré du lot 2 — lot "à valider métier" séparé, sans date :**

| Label retiré | Raison |
|---|---|
| `100% La Réunion` | Ambiguïté : label officiel certifié ou mention marketing ? Organisme certificateur non confirmé. |
| `Réunion pour Tous` | Structure multi-axes non confirmée localement (4 axes comme Tourisme & Handicap ?) |
| `IGP` | Ambiguïté : label d'établissement ou label de produit dans ce SIT ? |
| `Agriculture Biologique (AB)` | Idem IGP — certification de l'exploitation ou des produits ? |

**Ce qui ne rentre jamais dans le lot 2 sans décision explicite :**
- Aucune extension implicite de la sémantique de `p_types`.
- Aucun filtre sur `secondary_types` dans les APIs existantes — uniquement via clé dédiée dans `p_filters`.
- Aucune création de `ref_zone_touristique` — uniquement si le besoin UI est confirmé.

---

## E. Recommandation finale

### Lancer maintenant (lot 1 — risque API nul)

- `ALTER TABLE object ADD COLUMN secondary_types object_type[] NOT NULL DEFAULT '{}'` + commentaire SQL "transitoire, non-canonique, opt-in"
- `ALTER TABLE object_location ADD COLUMN zone_touristique TEXT` + commentaire SQL "transitoire, non exposé API avant backfill"
- Seeds : domaine `distribution_channel` avec `airbnb`, `leboncoin`, `abritel`, `booking` — base vierge, aucune vérification FK nécessaire
- Seeds : domaine `crm_demand_topic_oti` (20 valeurs OTI normalisées)
- Vérifier que `seeds_data.sql` ne contient pas `(social_network, booking)` — supprimer si présent

### Valider avant de toucher

- Liste exacte des ~10 équipements `ref_amenity` manquants — avec l'équipe OTI
- Structure de `Réunion pour Tous` (axes ? valeurs ?) — validation terrain
- `100% La Réunion` — label officiel avec organisme certificateur ou mention ?
- `IGP` / `AB` — périmètre dans ce SIT : établissement ou produit ?
- Multi-appartenance réelle en production : le chiffre exact au-delà des 21 cas Excel

### Ne pas faire

- Modifier le comportement de `get_filtered_object_ids` sans flag opt-in explicite et décision de lot séparée
- Étendre `p_types` pour inclure implicitement `secondary_types`
- Exposer `zone_touristique_any` dans l'API avant backfill
- Créer `ref_zone_touristique` avant que l'UI en ait besoin
- Insérer `booking` dans `social_network` pour quelque raison que ce soit — ni maintenant ni lors des imports futurs
- Seeder IGP, AB, 100% La Réunion, Réunion pour Tous avant validation métier

---

## Annexe — Lots de travail

| Lot | Label | Contenu | Prérequis | Risque API |
|---|---|---|---|---|
| **Lot 1** | Sans risque / sans rupture API | Schema additif (`secondary_types`, `zone_touristique`), seeds `distribution_channel` + `crm_demand_topic_oti` | Aucun | Nul |
| **Lot 2** | Additif avec extension filtre | Seeds équipements/paiement/langues/DD, extension `zone_touristique_any` filtre | Backfill `zone_touristique` + validations métier lot "à valider" | Nul si additif |
| **Lot 3** | Backfill / migration données | Import établissements Excel, remplissage `zone_touristique`, migration CRM, migration liens OTA | Scripts de transformation + règles normalisées | Nul côté API |
| **Lot 4** | Nettoyage dette | Dédupliquer Booking, créer `ref_zone_touristique` + FK, supprimer `zone_touristique TEXT` | Lot 3 terminé + besoin UI confirmé | Faible si séquencé |

---

## Labels en attente de validation métier

> Ne pas seeder avant arbitrage explicite.

| Label | Blocage | Question à trancher |
|---|---|---|
| `100% La Réunion` | Organisme certificateur ? | Label officiel ou mention marketing ? |
| `Réunion pour Tous` | Structure inconnue | 4 axes handicap comme Tourisme & Handicap ? Autre découpage ? |
| `IGP` | Périmètre SIT flou | Label de l'établissement ou des produits vendus ? |
| `Agriculture Biologique (AB)` | Périmètre SIT flou | Idem IGP |
| `Certification accueil clientèle indienne` | 1 seul cas | Organisme reconnu ? Pérennité du label ? |
