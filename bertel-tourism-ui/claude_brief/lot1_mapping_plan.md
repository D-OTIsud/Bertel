# Plan de mapping — Import Lot 1
# Structures : secondary_types · zone_touristique · distribution_channel · crm_demand_topic_oti

**Version :** 1.3
**Date :** 2026-03-20
**Source :** `Etablissements (3).xlsx` — 24 onglets
**Statut :** En attente d'approbation avant implémentation

> **v1.1 — Correction majeure :** la hiérarchie des sources a été révisée.
> Les règles de mapping de `zone_touristique` et `secondary_types` changent en conséquence.
>
> **v1.2 — Ajout :** rattachement objet → organisation et certifications organisationnelles.
>
> **v1.3 — Ajustement :** formulation du rattachement corrigée (portage SIT, pas propriété), rôle par défaut révisé de `manager` vers `publisher`.

---

## 0. Hiérarchie des sources (règle de vérité)

| Feuille | Rôle | Utilisation |
|---|---|---|
| **`formulaire`** | Source canonique des **objets** | Toute donnée relative aux établissements provient de cette feuille |
| **`Prestataires`** | Source canonique des **actors** (prestataires / contacts) | Données de personnes et contacts |
| `Etablissements` | Source auxiliaire uniquement — **non utilisée comme source de vérité** | Peut être consultée pour contextualiser une donnée absente de `formulaire`, jamais comme source primaire |
| `IdSupaToSheet` | **Ignoré** | Ne pas utiliser |

**Clé de jointure principale :** `formulaire.id OTI` est l'identifiant canonique de chaque objet. Toutes les feuilles secondaires rejoignent via ce champ.

| Feuille secondaire | Colonne de jointure | Cible | Taux de match vérifié |
|---|---|---|---|
| `Resaux sociaux` | `formulaire` | `formulaire.id OTI` | 100% (783/783) |
| `CRM` | `Etablissement` | `formulaire.id OTI` | 99.6% (744/747) |
| `CRM` | `Prestataires` | `Prestataires.Presta ID` | 99.6% (672/675) |
| `Prestataires` | `formulaire` | `formulaire.id OTI` | 724/923 (les 199 sans match = prestataires sans établissement associé) |

---

## 1. `object.secondary_types`

### 1.1 Feuille source canonique

**`formulaire`** — colonne `Nom catégorie`

`Etablissements` n'est plus la source. La logique de détection multi-appartenance change.

### 1.2 Colonnes source

| Colonne | Feuille | Exemple |
|---|---|---|
| `Groupe catégorie` | `formulaire` | `'Restauration'` (toujours mono-valeur dans formulaire) |
| `Nom catégorie` | `formulaire` | `'Restaurant ; Autre type de restauration'` |

> **Différence structurelle vs Etablissements :**
> - Dans `Etablissements` : multi-appartenance indiquée par `,` dans `Groupe catégorie`
> - Dans `formulaire` : `Groupe catégorie` est **toujours mono-valeur**. La multi-appartenance est indiquée par `;` dans `Nom catégorie`.
> - Séparateur canonique dans `formulaire` : **point-virgule + espace** (` ; `)

### 1.3 Volume réel (formulaire)

| Catégorie | Compte |
|---|---|
| Lignes `formulaire` totales | 1 431 |
| Lignes avec `Nom catégorie` multi-valeurs (`;`) | **23** |
| Lignes avec `Groupe catégorie` multi-valeurs | **0** |

> **Correction v1.1 :** Le chiffre de 6 cas (basé sur `Etablissements`) était sous-estimé. La source canonique `formulaire` révèle **23 cas** de multi-appartenance, avec un séparateur différent.

### 1.4 Mapping `Nom catégorie` → `object_type`

| Nom catégorie (formulaire) | `object_type` | Notes |
|---|---|---|
| Location saisonnière | `HLO` | 524 cas — type majoritaire |
| Chambre d'hôtes | `HLO` | Pas de type dédié |
| Gîte d'étape et de randonnée | `HLO` | — |
| Hôtel | `HOT` | — |
| Auberge | `HOT` | **Arbitrage métier requis** (HOT ou HLO ?) |
| Camping | `CAMP` | — |
| Restaurant | `RES` | — |
| Autre type de restauration | `RES` | Traiteur, snack |
| Table d'hôtes | `RES` | — |
| Remise en forme | `FMA` | — |
| Divertissement | `FMA` | Bar, cinéma, spectacle |
| Terre | `ITI` | Randonnée, VTT, équitation |
| Patrimoine naturel | `ITI` | Ou `LOI` — **arbitrage métier requis** |
| Artisanat | `LOI` | — |
| Terroir | `LOI` | — |
| Patrimoine culturel | `LOI` | — |
| Patrimoine agricole | `LOI` | — |
| Patrimoine industriel | `LOI` | — |
| Art | `LOI` | — |
| Services | `ORG` | Exclu des KPI |
| Accueil et information | `ORG` | Exclu des KPI |
| Transport (Autocar) | `ORG` | Exclu des KPI |

### 1.5 Cas multi-appartenance réels (23 lignes, formulaire)

| id OTI | Nom | `Nom catégorie` | `object_type` principal | `secondary_types` |
|---|---|---|---|---|
| recWCDXqagD1EKp55 | Irise Traiteur | Restaurant ; Autre type de restauration | `RES` | `{}` (même type) |
| 69d501a7 | Tisane du Volcan | Patrimoine agricole ; Patrimoine culturel | `LOI` | `{}` (même type) |
| recjVuOypOyayuqqy | Le Labyrinthe en Champ Thé | Patrimoine agricole ; Patrimoine culturel | `LOI` | `{}` (même type) |
| recygdEueaTEjr8Nu | Adrenalile | Etangs et rivières ; Mer | `FMA` | `{}` (**type à confirmer**) |
| 5D60AA1162 | Le Jardin FOU | Terre ; Patrimoine culturel | `ITI` | `{LOI}` |
| 6a07b6d5 | La Libellule Qui Roule | Restaurant ; Autre type de restauration | `RES` | `{}` (même type) |
| rec6dejyDi7Joy3vA | Aquasens | Etangs et rivières ; Mer | `FMA` | `{}` (**type à confirmer**) |
| 191a90db | Les Crins de Bel Air | Terre ; Patrimoine culturel | `ITI` | `{LOI}` |
| recPVX5imIkKti6DB | La Marmite du Pêcheur | Restaurant ; Autre type de restauration | `RES` | `{}` (même type) |
| rec02mfTgrevxaiWm | Bouillon d'Aventure | Terre ; Patrimoine culturel | `ITI` | `{LOI}` |
| recm3zPthhLho7F66 | Parfum de Géranium | Patrimoine agricole ; Patrimoine industriel | `LOI` | `{}` (même type) |
| d20caf12 | LE PTI COIN DES ZABITANTS | Restaurant ; Autre type de restauration | `RES` | `{}` (même type) |
| rech5cqzU6ONX2AVL | CAHEB (Huiles Essentielles) | Patrimoine agricole ; Patrimoine culturel | `LOI` | `{}` (même type) |
| 883cb1c2 | Happy Time Run | Restaurant ; Autre type de restauration | `RES` | `{}` (même type) |
| recjEjBFtNJ8wMqCg | L'Impériale Pirun Pizzeria | Restaurant ; Autre type de restauration | `RES` | `{}` (même type) |
| recpoMrt052WGicmB | Far Far de Bézaves | Patrimoine agricole ; Patrimoine culturel | `LOI` | `{}` (même type) |
| 06CCA673EC | Saveurs des forêts | Patrimoine agricole ; Patrimoine culturel | `LOI` | `{}` (même type) |
| recEscXK1LxwsizGj | Le Milena's | Restaurant ; Autre type de restauration | `RES` | `{}` (même type) |
| 7ffeea05 | CAP MANAPANY | Restaurant ; Autre type de restauration | `RES` | `{}` (même type) |
| c6d5eae0 | Le Rucher du Petit Piton | Patrimoine agricole ; Patrimoine culturel | `LOI` | `{}` (même type) |
| 9fea8c0e | Insel Tours | Terre ; Patrimoine culturel | `ITI` | `{LOI}` |
| 595AE0BA7C | Association Entre-Deux Culture | Terre ; Patrimoine culturel | `ITI` | `{LOI}` |
| db789d9c | Ti Karé Dan Péi | Terre ; Patrimoine culturel | `ITI` | `{LOI}` |

**Observation :** Sur 23 cas, **17 mappent sur le même `object_type`** pour les deux catégories (ex: `Restaurant ; Autre type de restauration` → RES + RES → `secondary_types = {}`). Seuls **5 cas** génèrent un `secondary_types` non vide (`ITI + {LOI}`). Les 2 cas `Etangs et rivières ; Mer` nécessitent un arbitrage.

### 1.6 Règle de mapping

```
split(Nom catégorie, ' ; ')
→ premier élément → mapper vers object_type (colonne principale)
→ éléments suivants → mapper vers object_type → ajouter dans secondary_types si différent du principal
→ dédupliquer secondary_types
```

### 1.7 Rejets / cas ambigus

| Cas | Traitement |
|---|---|
| `Etangs et rivières ; Mer` (2 cas) | **Arbitrage métier requis** — FMA ? ITI ? pas de type `EAU` dans l'enum |
| `Auberge` → HOT ou HLO | **Arbitrage métier requis** |
| `Patrimoine naturel` → ITI ou LOI | **Arbitrage métier requis** |

---

## 2. `object_location.zone_touristique`

### 2.1 Feuille source canonique

**`formulaire`** — colonne `Lieux-dits`

### 2.2 Colonnes source

| Colonne | Feuille | Exemple |
|---|---|---|
| `Lieux-dits` | `formulaire` | `'La Plaine des Cafres'` |

### 2.3 Différence structurelle critique vs plan v1.0

> **⚠ Règle invalide dans le plan v1.0 :**
> Le plan précédent supposait un pattern `"lieu-dit / zone touristique"` (ex: `"Plaine des Cafres / Plaines et volcan"`).
> Ce pattern **n'existe pas dans `formulaire`**. Il était présent uniquement dans `Etablissements` (source désormais exclue).
>
> Dans `formulaire`, `Lieux-dits` contient **uniquement le nom du lieu-dit**, sans zone associée.

### 2.4 Volume réel (formulaire)

| Catégorie | Compte |
|---|---|
| Lignes avec `Lieux-dits` renseigné | 773 / 1 431 |
| Lignes sans `Lieux-dits` | 658 |
| Pattern `lieu / zone` | **0** |
| Valeurs uniques de lieux-dits | 75 |

### 2.5 Zones touristiques — état actuel

La donnée `zone_touristique` **ne peut pas être extraite automatiquement de `formulaire`**. La correspondance lieu-dit → zone doit être construite manuellement ou via un référentiel externe.

**75 lieux-dits uniques identifiés dans `formulaire` :**

| Lieux-dits les plus fréquents | Occurrences | Zone touristique probable |
|---|---|---|
| La Plaine des Cafres | 168 | Plaines et Volcan |
| Manapany-Les-Bains | 51 | Sud |
| Trois Mares | 40 | Sud |
| Vincendo | 36 | Sud |
| Langevin | 35 | Sud |
| Entre-Deux | 28 | Sud |
| centre ville | 26 | (commune — non zonifiable) |
| Tampon | 20 | (commune — non zonifiable) |
| Grand Coude | 18 | Sud |
| Ravine des Citrons | 18 | Sud |

### 2.6 Nouvelle règle de mapping

| Cas source (`formulaire.Lieux-dits`) | `lieu_dit` (object_location) | `zone_touristique` (object_location) |
|---|---|---|
| Valeur renseignée | Valeur brute (trim) | **NULL** — à enrichir via table de correspondance |
| NULL / vide | NULL | NULL |

**Conséquence :** `zone_touristique` sera NULL pour tous les objets à l'import initial.
L'enrichissement nécessite une table de correspondance `lieu_dit → zone_touristique` (75 lieux-dits à mapper manuellement — effort estimé : 1h).

### 2.7 Option d'enrichissement avant import

Construire une table de correspondance statique :
```
La Plaine des Cafres → Plaines et Volcan
Bourg Murat → Plaines et Volcan
Grand Coude → Sud
Langevin → Sud
Manapany-Les-Bains → Sud
Vincendo → Sud
... (72 autres à compléter)
```

Cette table peut être fournie sous forme de CSV validé métier, puis appliquée lors du script d'import Lot 3.

### 2.8 Rejets / cas ambigus

| Cas | Traitement |
|---|---|
| `centre ville`, `Tampon` — nom de commune, pas un lieu-dit | Copier dans `lieu_dit`, `zone_touristique = NULL`, signaler |
| `PK14`, `PK12` — kilomètriques RN3 | Copier dans `lieu_dit`, zone = `Plaines et Volcan` probable |
| Lieux-dits sans correspondance zone connue | `zone_touristique = NULL` + log |

---

## 3. `distribution_channel`

### 3.1 Feuille source canonique

**`Resaux sociaux`** — jointure sur `formulaire` via `formulaire.id OTI`

Aucun changement de source par rapport au plan v1.0 — `Resaux sociaux` était déjà la source secondaire correcte. La correction porte sur la **clé de jointure** : elle passe maintenant explicitement par `formulaire.id OTI` (et non plus par une correspondance via `Etablissements`).

### 3.2 Colonnes source

| Colonne | Feuille | Rôle |
|---|---|---|
| `formulaire` | `Resaux sociaux` | Clé de jointure → `formulaire.id OTI` |
| `Type_R_S` | `Resaux sociaux` | Type de plateforme |
| `URL` | `Resaux sociaux` | URL du lien |

### 3.3 Taux de couverture de jointure

- 783 entrées `Resaux sociaux` avec une valeur `formulaire`
- 783/783 matchent avec `formulaire.id OTI` (**100%**)
- 7 non matchés dans l'ancien plan (via `Etablissements`) étaient des artefacts de la mauvaise clé

### 3.4 Mapping `Type_R_S` → domaine cible

| `Type_R_S` (Resaux sociaux) | `domain` cible | `code` cible | Volume |
|---|---|---|---|
| `Airbnb` | `distribution_channel` | `airbnb` | 230 |
| `Booking` | `distribution_channel` | `booking` | 227 |
| `Leboncoin` | `distribution_channel` | `leboncoin` | 48 |
| `Abritel` | `distribution_channel` | `abritel` | 27 |
| `Facebook` | `social_network` | `facebook` | 645 |
| `Instagram` | `social_network` | `instagram` | 158 |
| `tripadvisor` | `social_network` | `tripadvisor` | 126 |
| `TikTok` | `social_network` | `tiktok` | 8 |

> **Règle absolue :** `Booking` ne va jamais dans `social_network`. Si `Type_R_S = 'Booking'`, target = `distribution_channel.booking` sans exception.

### 3.5 Rejets / cas ambigus

| Cas | Traitement |
|---|---|
| `Type_R_S` hors liste connue | Log de rejet — ne pas insérer, escalader |
| URL NULL | Insérer avec `url = NULL` — acceptable |
| Doublon même `formulaire` + même `Type_R_S` | `ON CONFLICT DO NOTHING` |
| `formulaire` sans match dans `formulaire.id OTI` (0 cas selon analyse) | Sans objet |

---

## 4. `crm_demand_topic_oti`

### 4.1 Feuille source canonique

**`CRM`** — colonnes `Objet_du_Contact` (topic) et `Etablissement` (lien objet)

Le CRM est lié aux objets ET aux prestataires :
- `CRM.Etablissement` → `formulaire.id OTI` (99.6% de match)
- `CRM.Prestataires` → `Prestataires.Presta ID` (99.6% de match)

### 4.2 Colonnes source

| Colonne | Feuille | Rôle |
|---|---|---|
| `Objet_du_Contact` | `CRM` | Sujet de l'interaction — source du code `crm_demand_topic_oti` |
| `Etablissement` | `CRM` | FK vers `formulaire.id OTI` (objet concerné) |
| `Prestataires` | `CRM` | FK vers `Prestataires.Presta ID` (prestataire concerné) |
| `Date` | `CRM` | Date de l'interaction |
| `Status` | `CRM` | Statut de traitement (`Traitée`, etc.) |
| `Message` | `CRM` | Corps du message (non mappé Lot 1) |
| `Sous-catégorie` | `CRM` | Sous-topic (non mappé Lot 1 — Lot 4) |

Aucun changement de source par rapport au plan v1.0. La correction porte sur la **clarification que la jointure passe par `formulaire.id OTI`** et `Prestataires.Presta ID`, pas par `Etablissements`.

### 4.3 Table de normalisation (inchangée)

| Valeur brute | Occurrences | Code seedé | Normalisation |
|---|---|---|---|
| `Accompagnement Taxe de séjour` | 636 | `accompagnement_taxe_sejour` | Canonique |
| `Accompagnement taxe de séjour` | 5 | `accompagnement_taxe_sejour` | Casse normalisée |
| `Promotion SIT (reunion.fr)` | 273 | `promotion_sit` | — |
| `Demande signalétique` | 186 | `demande_signaletique` | — |
| `Promotion  Explore` | 158 | `promotion_explore` | Double espace supprimé |
| `Partenaire d'une action B To C` | 154 | `partenaire_b2c` | — |
| `Promotion Facebook` | 153 | `promotion_facebook` | — |
| `Fermeture définitive` | 141 | `fermeture_definitive` | — |
| `Labels et classements étoiles` | 130 | `labels_classements_etoiles` | — |
| `Autres` | 76 | `autres` | — |
| `Modification infos BDD` | 55 | `modification_infos_bdd` | — |
| `Fermeture provisoire` | 37 | `fermeture_provisoire` | — |
| `Porteur de projet(s)` | 31 | `porteur_de_projet` | — |
| `Demande de visite` | 22 | `demande_de_visite` | — |
| `Participants d'un atelier presta` | 20 | `participants_atelier_presta` | — |
| `Ousailé` | 19 | `ousaile` | — |
| `Demande d'attestation OTI` | 18 | `demande_attestation_oti` | — |
| `Problème  juridique, Sirene` | 18 | `probleme_juridique_sirene` | Double espace supprimé |
| `Plainte client` | 5 | `plainte_client` | — |
| `Boutique` | 2 | `boutique` | — |
| `Dispositifs financiers` | 1 | `dispositifs_financiers` | — |

### 4.4 Rejets / cas ambigus

| Cas | Traitement |
|---|---|
| `Objet_du_Contact` NULL (quelques lignes) | Exclure — log de rejet |
| `Etablissement` sans match `formulaire.id OTI` (3 cas) | Log — insérer sans FK objet ou exclure |
| `Prestataires` sans match `Prestataires.Presta ID` (3 cas) | Log — insérer sans FK prestataire ou exclure |
| `Sous-catégorie` renseignée | Conserver en `extra JSONB` — mapping Lot 4 |

---

## 5. Plan d'import pilote

### 5.1 Objectif

Valider les règles de mapping sur un échantillon contrôlé de **10 établissements** avant import global.

### 5.2 Critères de sélection

| Critère | Cible |
|---|---|
| Multi-appartenance `ITI + {LOI}` | 4 cas : 5D60AA1162, 191a90db, rec02mfTgrevxaiWm, 9fea8c0e |
| Multi-appartenance même type (validation règle dédup) | 1 cas RES+RES : recWCDXqagD1EKp55 |
| Avec lieu-dit et zone connue | 1 établissement de La Plaine des Cafres |
| Sans lieu-dit | 1 établissement |
| Avec liens OTA dans `Resaux sociaux` | 1 établissement avec Airbnb + Booking |
| Avec interactions CRM variées | 1 établissement avec ≥ 3 sujets distincts |

### 5.3 Séquence d'import pilote

```
Étape 1 : Construire la table de correspondance lieu_dit → zone_touristique
           (75 valeurs à mapper — format CSV validé métier)
           → BLOQUANT si zone_touristique non NULL est requis pour le pilote
           → Non bloquant si zone_touristique = NULL accepté en phase pilote

Étape 2 : Importer les 10 objets pilotes depuis `formulaire`
           → vérifier object_type principal depuis Groupe catégorie
           → vérifier lieu_dit depuis Lieux-dits
           → vérifier zone_touristique (NULL ou enrichie via table)
           → vérifier secondary_types sur les 5 cas pilotes

Étape 3 : Importer les liens Resaux sociaux des 10 objets
           → vérifier routing distribution_channel vs social_network
           → jointure via formulaire.id OTI (100% de couverture attendu)

Étape 4 : Importer les interactions CRM des 10 objets
           → normalisation Objet_du_Contact → code crm_demand_topic_oti
           → jointure via CRM.Etablissement → formulaire.id OTI

Étape 5 : Contrôle qualité
           → Booking absent de social_network : 100%
           → secondary_types cohérent : 100% des cas pilotes
           → zone_touristique : log des NULL et des enrichissements appliqués
           → Taux de rejet CRM < 2%
```

### 5.4 Ce qui bloque l'import pilote

| # | Bloquant | Décision requise | Nature |
|---|---|---|---|
| 1 | Table de correspondance `lieu_dit → zone_touristique` | Fournie par l'équipe OTI OU accepter NULL pour le pilote | **Métier** |
| 2 | `Auberge` → `HOT` ou `HLO` | Arbitrage type | **Métier** |
| 3 | `Etangs et rivières ; Mer` → quel `object_type` ? | Pas de type EAU dans l'enum | **Métier** |
| 4 | `Patrimoine naturel` → `ITI` ou `LOI` | Ambiguïté fonctionnelle | **Métier** |

### 5.5 Ce qui ne bloque pas

- La jointure `Resaux sociaux → formulaire` est propre (100% de match) — aucune table de correspondance supplémentaire nécessaire
- La normalisation CRM est complète et commitée dans les seeds
- `secondary_types` est mappable pour 21/23 cas sans arbitrage métier

---

## 6. Récapitulatif des règles invalides dans le plan v1.0

| Règle v1.0 | Statut | Remplacement v1.1 |
|---|---|---|
| Source `Etablissements` pour objets | **Invalide** | Source `formulaire` |
| Pattern `"lieu / zone"` dans Lieux-dits | **Invalide** | `Lieux-dits` contient uniquement le lieu-dit dans `formulaire` |
| 6 cas multi-appartenance (séparateur `,` dans `Groupe catégorie`) | **Invalide** | 23 cas (séparateur ` ; ` dans `Nom catégorie`) |
| Jointure RS via `Etablissements` | **Sans objet** | Jointure directe `Resaux sociaux.formulaire → formulaire.id OTI` |
| Zone extraite automatiquement (3 zones connues) | **Invalide** | `zone_touristique = NULL` à l'import, enrichissement via table externe |

---

## 7. Rattachement organisationnel et certifications de l'organisation

> **Sens métier exact :** OTI du Sud porte les fiches dans le SIT, les diffuse, et en assure le suivi qualité. Ce n'est pas une relation de propriété sur l'établissement — l'établissement appartient à son exploitant. C'est un **portage organisationnel dans le SIT** : l'OTI est l'organisation qui référence, maintient et publie l'information touristique.

### A. État du schéma actuel

#### A1. Rattachement organisationnel dans le SIT

Le schéma couvre ce besoin **nativement et complètement** via deux structures :

**`object_org_link`** (table de liaison, déjà existante)
```
object_id       TEXT → object(id)   — l'établissement référencé
org_object_id   TEXT → object(id)   — l'organisation portant la fiche (type ORG)
role_id         UUID → ref_org_role — rôle organisationnel
is_primary      BOOLEAN             — contrainte unique : une seule org principale par fiche
```

**`ref_org_role`** — rôles disponibles et leur sens métier exact :

| Code | Libellé seedé | Sens métier | Pertinence OTI du Sud |
|---|---|---|---|
| `owner` | Propriétaire principale | Détient l'objet juridiquement ou commercialement | ❌ L'OTI ne possède pas les établissements |
| `manager` | Gestionnaire | Gère l'établissement au quotidien (exploitation) | ❌ L'OTI ne gère pas les hôtels ou restaurants |
| `publisher` | Diffuseur | Référence, maintient et publie l'information dans le SIT | ✅ C'est exactement le rôle de l'OTI |

Les organisations elles-mêmes sont des **objets avec `object_type = 'ORG'`**. Le seed de test contient déjà `'Office de Tourisme Intercommunal TEST'` (region_code='TST'). OTI du Sud sera créée de la même façon.

#### A2. Certifications / qualifications d'une organisation

Le schéma couvre également ce besoin **sans modification** via `object_classification` :

```
object_id   TEXT → object(id)   — peut être n'importe quel objet, y compris un ORG
scheme_id   UUID → ref_classification_scheme
value_id    UUID → ref_classification_value
status      TEXT                — requested | granted | suspended | expired
awarded_at  DATE
valid_until DATE
```

`object_classification` n'est pas réservée aux établissements — elle est liée à `object(id)` sans restriction de `object_type`. Un objet ORG peut donc porter des certifications via cette même table.

**Conclusion :** aucune nouvelle table n'est nécessaire pour les deux besoins.

---

### B. Recommandation minimale retenue

#### B1. OTI du Sud — objet ORG de référence

Créer un objet `object_type = 'ORG'` représentant OTI du Sud dans les seeds de production (hors seeds de test déjà existants) :

```
name       = 'OTI du Sud'   (nom court opérationnel)
object_type = 'ORG'
region_code = 'SUD'          (ou code à confirmer — distinct de 'TST')
status      = 'published'
```

**Cet objet doit exister en base avant l'import pilote.** Il est le référent de tous les `object_org_link` insérés lors de l'import.

#### B2. Règle de rattachement pour l'import

Pour chaque objet importé depuis `formulaire` :

```
INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary)
SELECT
  <id_du_nouvel_objet>,
  oti.id,
  r.id,
  TRUE
FROM object oti, ref_org_role r
WHERE oti.object_type = 'ORG' AND oti.name = 'OTI du Sud'
  AND r.code = 'publisher'
ON CONFLICT DO NOTHING;
```

- **Rôle : `publisher`** — OTI du Sud référence et publie l'information touristique dans le SIT. Elle n'est pas propriétaire ni gestionnaire opérationnel des établissements.
- `is_primary = TRUE` — l'OTI est l'organisation principale portant la fiche dans ce SIT.
- Si un établissement a par ailleurs un propriétaire ou gestionnaire distinct (ex : groupe hôtelier), un second `object_org_link` pourra être ajouté plus tard avec `is_primary = FALSE` et le rôle approprié (`owner` ou `manager`).

#### B3. Certifications organisationnelles — seeds nécessaires

Les certifications OTI du Sud à stocker dans `object_classification` nécessitent des schemes dédiés, **distincts** des schemes de distinction des établissements :

| Certification | `scheme_code` proposé | `is_distinction` | `display_group` |
|---|---|---|---|
| Destination d'Excellence | `destination_excellence` | `FALSE` | `NULL` |
| QTI-R (Qualité Tourisme île de la Réunion) | `qti_r` | `FALSE` | `NULL` |
| Tourisme & Handicap (OTI) | `tourisme_handicap` | `TRUE` | `accessibility_label` |

> `is_distinction = FALSE` pour les deux premiers : ce sont des certifications organisationnelles, pas des labels d'établissement. Le KPI DistinctionOverview (qui filtre sur `is_distinction = TRUE`) ne les remontera donc pas dans les stats des établissements — comportement souhaité.
>
> `tourisme_handicap` est déjà seedé comme scheme d'établissement (`is_distinction = TRUE`). Si OTI du Sud elle-même est certifiée T&H, c'est une `object_classification` sur l'objet ORG avec le même scheme — aucun conflit.

---

### C. Impact sur le plan de migration et sur le pilote

#### C1. Nouveau prérequis avant import pilote

| Prérequis | Nature | Bloquant pilote |
|---|---|---|
| Objet ORG `'OTI du Sud'` créé en base (seed ou INSERT manuel) | Technique | **OUI** — sans lui, l'INSERT `object_org_link` échoue |
| `region_code` de l'OTI du Sud confirmé | Métier | OUI |
| Schemes `destination_excellence` et `qti_r` seedés | Technique | Non — uniquement si on importe les certifs lors du pilote |

#### C2. Modification de la séquence d'import pilote

La section 5.3 (Séquence d'import pilote) est complétée :

```
Étape 0 (nouveau — BLOQUANT) :
  Créer l'objet ORG 'OTI du Sud' en base
  → seed de production ou INSERT manuel de validation
  → vérifier que object_type='ORG' et status='published'

Étape 2 (amendée) :
  Pour chaque objet importé depuis formulaire :
  → insérer l'objet dans object + object_location
  → insérer object_org_link avec org='OTI du Sud', role='publisher', is_primary=TRUE

Étape 6 (nouveau — optionnel pilote) :
  Insérer les object_classification de l'OTI du Sud elle-même
  → Destination d'Excellence : scheme=destination_excellence, status='granted'
  → QTI-R : scheme=qti_r, status='granted'
  → uniquement si les schemes sont seedés avant le pilote
```

#### C3. Règle posée dans le plan (permanente)

> **Tout objet importé dans ce chantier est rattaché à OTI du Sud comme organisation portant la fiche dans le SIT**, via `object_org_link` avec `role = publisher` et `is_primary = TRUE`.
> Ce rattachement signifie que l'OTI du Sud référence, maintient et publie l'information touristique de cet objet — pas qu'elle en est propriétaire ou gestionnaire opérationnel.
> Cette règle s'applique à tous les objets importés depuis `formulaire`, quel que soit leur `object_type` (HOT, RES, HLO, CAMP, FMA, ITI, LOI…).

---

### D. Ce qu'il faudra créer plus tard si on veut aller plus loin

| Besoin futur | Structure | Quand |
|---|---|---|
| Plusieurs organisations pour un même établissement (ex : OTI + CRT) | `object_org_link` supplémentaires avec `is_primary = FALSE` | Lot 3+ |
| Hiérarchie OTI du Sud → CRT Réunion → Atout France | `object_org_link` entre objets ORG | Lot 4 |
| Dates de validité des certifications OTI | `object_classification.awarded_at` + `valid_until` | À l'import pilote si disponibles |
| Portail de gestion des certifications orga | Vue API dédiée | Non planifié |

---

### E. Ce point est-il bloquant avant le pilote ?

**Partiellement bloquant.** La création de l'objet ORG `'OTI du Sud'` est un prérequis technique strict : sans lui, l'import des liaisons `object_org_link` échouera. En revanche, les certifications de l'OTI elle-même (Destination d'Excellence, QTI-R) sont optionnelles pour le pilote.

| Élément | Bloquant pilote | Action |
|---|---|---|
| Objet ORG OTI du Sud en base | **OUI** | À créer avant l'Étape 0 du pilote |
| `region_code` de l'OTI du Sud | **OUI** | Arbitrage métier (code court à définir) |
| Seeds `destination_excellence` + `qti_r` | Non | Peut attendre après le pilote |
| Certifications OTI dans `object_classification` | Non | Peut attendre après le pilote |
