# Plan de mapping — Import Lot 1
# Structures : secondary_types · zone_touristique · distribution_channel · crm_demand_topic_oti

**Version :** 1.0
**Date :** 2026-03-20
**Source :** `Etablissements (3).xlsx` — 896 lignes, 24 onglets
**Statut :** En attente d'approbation avant implémentation

---

## Périmètre

Ce document couvre uniquement le mapping des 4 structures du Lot 1 :
- `object.secondary_types` — types secondaires des objets multi-appartenance
- `object_location.zone_touristique` — zone touristique texte libre
- `ref_code (distribution_channel)` — canaux OTA/diffusion
- `ref_code (crm_demand_topic_oti)` — sujets CRM réels OTI

Il ne couvre pas l'import général des établissements (Lot 3).

---

## 1. `object.secondary_types`

### 1.1 Colonnes source

| Onglet | Colonne | Exemple |
|---|---|---|
| `Etablissements` | `Groupe catégorie` | `"Hébergement,Restauration"` |
| `Etablissements` | `Nom catégorie` | `"Chambre d'hôtes,Table d'hôtes"` |
| `Etablissements` | `Nom sous catégorie` | `"Chambre d'hôte,Table d'hôte"` |

La colonne `Groupe catégorie` est la source primaire pour détecter la multi-appartenance (valeur à virgule).
La colonne `Nom catégorie` précise les types et permet le mapping vers `object_type`.

### 1.2 Volume réel

| Catégorie | Compte |
|---|---|
| Rows `Groupe catégorie` avec virgule | **6** |
| Rows `Nom catégorie` avec virgule | **37** (inclut les sous-types fonctionnels non structurants) |

**Remarque :** Le chiffre de 21 évoqué dans le plan de migration venait d'une estimation préliminaire. L'analyse précise donne **6 établissements avec vraie multi-appartenance de type principal** et 37 avec multi-sous-catégories (souvent purement descriptifs, non structurants pour `object_type`).

### 1.3 Mapping `Nom catégorie` → `object_type`

| Nom catégorie (Excel) | object_type cible | Notes |
|---|---|---|
| Hôtel | `HOT` | — |
| Location saisonnière | `HLO` | Gîte, Villa, Appartement, Bungalow |
| Chambre d'hôtes | `HLO` | Pas de type dédié — HLO par défaut |
| Gîte d'étape et de randonnée | `HLO` | — |
| Camping | `CAMP` | — |
| Restaurant | `RES` | — |
| Table d'hôtes | `RES` | Restauration attachée à un hébergement |
| Autre type de restauration | `RES` | Traiteur, snack inclus |
| Auberge | `HOT` | À confirmer |
| Remise en forme | `FMA` | — |
| Terre / Patrimoine naturel | `ITI` | Randonnée pédestre, VTT |
| Artisanat / Patrimoine agricole | `LOI` | — |
| Divertissement | `FMA` | Bar, cinéma, spectacle |
| Accueil et information | `ORG` | Exclus des KPI dashboard |
| Transport (Autocar) | `ORG` | Exclus |
| Services | `ORG` | Exclus |

### 1.4 Cas multi-appartenance réels (6 lignes)

| id | Nom | Groupe catégorie | Type principal (`object_type`) | `secondary_types` |
|---|---|---|---|---|
| 3011 | Bar le 3615 El Pesciofi | Restauration, Loisirs - se divertir | `RES` | `{FMA}` |
| 1692 | El Latino | Restauration, Loisirs - se divertir | `RES` | `{FMA}` |
| 255 | Étoile des Neiges | Hébergement, Restauration | `HLO` | `{RES}` |
| 2948 | Vague du Sud | Hébergement, Restauration | `HOT` | `{RES}` |
| — | AGENCE AVENTURE | Découverte, Loisirs - se divertir | `LOI` | `{FMA}` (à confirmer) |
| — | Guinguette (La) | Restauration, Loisirs - se divertir | `RES` | `{FMA}` |

> **Règle de mapping :** le premier `Groupe catégorie` détermine `object_type` (principal). Chaque groupe supplémentaire est mappé via le tableau 1.3 et inséré dans `secondary_types`.

### 1.5 Normalisations

- Supprimer les guillemets dans `"Loisirs - se divertir"`.
- Supprimer les espaces autour des virgules.
- Ignorer les doublons dans la liste (ex : `Patrimoine agricole,Patrimoine culturel` → deux types LOI → dédupliqué → `{LOI}`).

### 1.6 Rejets / cas ambigus

| Cas | Traitement recommandé |
|---|---|
| `Nom catégorie` multi-valeurs sans `Groupe catégorie` multi — ex : `Patrimoine agricole,Patrimoine culturel` | Considérer comme un seul type LOI (variation fonctionnelle, non structurante) |
| `Auberge` → HOT ou HLO ? | **Arbitrage métier requis** avant import |
| `Table d'hôtes` seule sans hébergement associé | RES par défaut — vérifier si un objet HLO parent existe dans la base |
| `AGENCE AVENTURE LA REUNION` — id NULL | Ligne sans identifiant — exclure de l'import pilote |
| `Guinguette (La)` — id NULL | Idem |

---

## 2. `object_location.zone_touristique`

### 2.1 Colonnes source

| Onglet | Colonne | Exemple |
|---|---|---|
| `Etablissements` | `Lieux-dits` | `"Plaine des Cafres / Plaines et volcan"` |

### 2.2 Volume

| Catégorie | Compte |
|---|---|
| Lignes avec `Lieux-dits` renseigné | **312 / 896** |
| Dont avec pattern `lieu / zone` | **196** |
| Dont lieu-dit sans zone (pas de slash) | **116** |
| Lignes sans lieu-dit | **584** |

### 2.3 Règle d'extraction

Le champ `Lieux-dits` contient deux informations séparées par ` / ` :

```
"Plaine des Cafres / Plaines et volcan"
 ↓ lieu_dit                ↓ zone_touristique
```

**Parsing :** `split(' / ', maxsplit=1)` → `[lieu_dit, zone_touristique]`

### 2.4 Zones touristiques identifiées (données Excel)

| Zone extraite | Occurrences | Normalisée |
|---|---|---|
| `Plaines et volcan` | 146 | `Plaines et Volcan` |
| `Sud` | 49 | `Sud` |
| `Cirque de Mafate` | 1 | `Cirque de Mafate` |

### 2.5 Normalisations

- Trim des espaces avant/après le slash.
- `"Plaines et volcan"` → `"Plaines et Volcan"` (majuscule V canonique).
- Cas particulier : `"Plaine des Cfres, 23è"` (typo + format invalide) → **rejet, import à NULL, log de rejet**.

### 2.6 Règles de mapping

| Cas source | `lieu_dit` (object_location) | `zone_touristique` (object_location) |
|---|---|---|
| `"Lieu / Zone"` | Partie avant le slash | Partie après le slash (normalisée) |
| `"Lieu seul"` (sans slash) | Valeur brute | `NULL` |
| Vide ou NULL | `NULL` | `NULL` |
| Typo non parseable | `NULL` (log) | `NULL` (log) |

### 2.7 Rejets / cas ambigus

| Cas | Traitement |
|---|---|
| `"Plaine des Cfres, 23è"` | Rejet — log dans fichier de rejets pilote |
| Lieux-dits avec virgule (1 cas) | Parser la première valeur uniquement ; log de l'ambiguïté |
| Lieux-dits sans zone (116 cas) | `zone_touristique = NULL` — acceptable pour l'instant (Lot 3) |

---

## 3. `distribution_channel`

### 3.1 Colonnes source

| Onglet | Colonne | Valeurs OTA présentes |
|---|---|---|
| `Resaux sociaux` | `Type_R_S` | `Airbnb`, `Booking`, `Leboncoin`, `Abritel` |
| `Etablissements` | `Site Tiers` | `airbnb,booking` (liste comma-séparée) |

### 3.2 Volume

| Platform | Onglet source | Occurrences |
|---|---|---|
| Airbnb | Resaux sociaux | 230 |
| Booking | Resaux sociaux | 227 |
| Leboncoin | Resaux sociaux | 48 |
| Abritel | Resaux sociaux | 27 |
| airbnb,booking | Etablissements.Site Tiers | 3 (doublons probables avec Resaux sociaux) |

**Source principale :** onglet `Resaux sociaux` (lien direct par `formulaire` = ID établissement Airtable).

### 3.3 Mapping `Type_R_S` → `distribution_channel.code`

| `Type_R_S` (Excel) | `domain` cible | `code` cible |
|---|---|---|
| `Airbnb` | `distribution_channel` | `airbnb` |
| `Booking` | `distribution_channel` | `booking` |
| `Leboncoin` | `distribution_channel` | `leboncoin` |
| `Abritel` | `distribution_channel` | `abritel` |
| `Facebook` | `social_network` | `facebook` |
| `Instagram` | `social_network` | `instagram` |
| `TikTok` | `social_network` | `tiktok` |
| `tripadvisor` | `social_network` | `tripadvisor` |

> **Règle absolue :** `Booking` ne va jamais dans `social_network`. Si une ligne source classe Booking comme réseau social, elle est remappée vers `distribution_channel.booking`.

### 3.4 Jointure avec les établissements

La colonne `formulaire` dans `Resaux sociaux` correspond à l'identifiant Airtable (pas l'id numérique).
La jointure vers `object.id` nécessite une table de correspondance `id_airtable → id_objet` (à construire lors de l'import Lot 3).

### 3.5 Doublon Site Tiers / Resaux sociaux

Les 3 lignes `Etablissements.Site Tiers = "airbnb,booking"` sont probablement des doublons des entrées `Resaux sociaux`. À dédupliquer lors de l'import via contrainte `ON CONFLICT DO NOTHING` sur la table de liaison.

### 3.6 Rejets / cas ambigus

| Cas | Traitement |
|---|---|
| `Type_R_S` inconnu (valeur hors liste) | Log de rejet — ne pas insérer |
| Lien OTA sans URL (`URL` NULL) | Insérer avec `url = NULL` — acceptable |
| Doublon même `formulaire` + même `Type_R_S` | Dédupliquer via `ON CONFLICT DO NOTHING` |

---

## 4. `crm_demand_topic_oti`

### 4.1 Colonnes source

| Onglet | Colonne | Colonne secondaire |
|---|---|---|
| `CRM` | `Objet_du_Contact` | `Sous-catégorie` (Lot 4, non mappé ici) |

### 4.2 Volume

- **2 122 interactions CRM** au total
- **20 valeurs uniques** après normalisation (voir table 4.3)

### 4.3 Table de normalisation complète

| Valeur brute Excel | Occurrences | Code seedé | Normalisation appliquée |
|---|---|---|---|
| `Accompagnement Taxe de séjour` | 636 | `accompagnement_taxe_sejour` | Valeur canonique |
| `Accompagnement taxe de séjour` | 5 | `accompagnement_taxe_sejour` | Casse normalisée (minuscule → majuscule T) |
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

**Total après dédoublonnage casse :** 20 codes distincts pour 2 122 interactions.

### 4.4 Jointure avec les établissements

La colonne `Prestataires` dans `CRM` correspond à l'identifiant Airtable de l'établissement.
Même logique de jointure que pour `Resaux sociaux` : nécessite la table de correspondance `id_airtable → id_objet`.

### 4.5 Rejets / cas ambigus

| Cas | Traitement |
|---|---|
| `Objet_du_Contact` NULL ou vide | Exclure de l'import — log de rejet |
| Valeur hors des 20 codes connus | Log de rejet — ne pas insérer ; escalader pour arbitrage |
| `Sous-catégorie` renseignée | Conserver en colonne `extra JSONB` provisoirement ; mapping Lot 4 |

---

## 5. Plan d'import pilote

### 5.1 Objectif

Valider les règles de mapping sur un échantillon contrôlé avant l'import global.
Périmètre : **10 établissements** couvrant les cas représentatifs et ambigus.

### 5.2 Critères de sélection de l'échantillon pilote

| Critère | Établissements cibles |
|---|---|
| Multi-appartenance (Lot 1) | id 255, 2948, 3011, 1692 (les 4 avec id valide) |
| Lieu-dit avec zone | 2 établissements avec pattern `lieu / zone` |
| Lieu-dit sans zone | 1 établissement |
| Sans lieu-dit | 1 établissement |
| Avec liens OTA (Airbnb + Booking) | 1 établissement avec entrées dans `Resaux sociaux` |
| Avec interactions CRM | 1 établissement avec plusieurs sujets |

### 5.3 Séquence d'import pilote

```
Étape 1 : Préparer la table de correspondance id_airtable → id_objet
           (nécessaire pour joindre Resaux sociaux et CRM aux objets)

Étape 2 : Importer les 10 établissements pilotes (object + object_location)
           → vérifier object_type principal
           → vérifier lieu_dit et zone_touristique
           → vérifier secondary_types (4 cas multi-appartenance)

Étape 3 : Importer les liens Resaux sociaux des 10 établissements
           → vérifier routing distribution_channel vs social_network
           → vérifier absence de Booking dans social_network

Étape 4 : Importer les interactions CRM des 10 établissements
           → vérifier normalisation des valeurs source
           → vérifier codes crm_demand_topic_oti

Étape 5 : Contrôle qualité
           → requête de vérification : aucun booking dans social_network
           → requête de vérification : secondary_types cohérent avec object_type
           → log des rejets : compter les lignes non importées et leur motif
```

### 5.4 Critères de validation du pilote

| Critère | Seuil d'acceptation |
|---|---|
| Taux de rejets zone_touristique | < 5% (hors lignes sans lieu-dit) |
| Taux de rejets CRM | < 2% (hors NULL) |
| Booking absent de social_network | 100% |
| secondary_types cohérent | 100% des 4 cas multi-cat |
| Doublons OTA dédupliqués | 100% |

### 5.5 Ce qui bloque l'import pilote

| Bloquant | Action requise |
|---|---|
| Table de correspondance `id_airtable → id_objet` | À construire (onglet `IdSupaToSheet` à analyser) |
| Arbitrage `Auberge` → HOT ou HLO | Décision métier avant import |
| Jointure `formulaire` (Resaux sociaux / CRM) → id objet | Dépend de la table de correspondance |

---

## 6. Résumé des décisions requises avant implémentation

| # | Question | Impact |
|---|---|---|
| 1 | `Auberge` → `HOT` ou `HLO` ? | Mapping Nom catégorie |
| 2 | `Table d'hôtes` seule → `RES` sans objet HLO parent ? | Règle de création objet |
| 3 | Lignes sans id numérique (AGENCE AVENTURE, Guinguette) → importer ou exclure ? | Périmètre pilote |
| 4 | Lieux-dits sans zone (116 cas) → laisser `zone_touristique = NULL` ou enrichissement manuel ? | Qualité data |
| 5 | `Ousailé` — est-ce un lieu-dit ou une erreur de saisie ? | Qualité code CRM |
