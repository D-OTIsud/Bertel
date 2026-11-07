# Inventaire du niveau 2 de la taxonomie hébergement — croisement « Nom catégorie » Berta

**Date** : 2026-07-27 · **Périmètre** : les 5 domaines hébergement (`taxonomy_hlo`, `taxonomy_hot`, `taxonomy_camp`, `taxonomy_hpa`, `taxonomy_rva`)
**État** : inventaire **constat seul — aucune modification appliquée**. Direction retenue pour la suite (arbitrage PO du 2026-07-27) : *renommer aux libellés Berta*.
**Sources** : `_berta.csv` (485 lignes `Groupe catégorie = Hébergement`) × base live (487 hébergements publiés) × `object.extra.source_category`.

---

## 1. Résultat central

Les **5** catégories Berta de l'hébergement existent toutes en base, avec **100 % de couverture** — mais elles sont matérialisées à **trois niveaux différents**. C'est la raison pour laquelle « retrouver le Nom catégorie au niveau 2 » ne marche aujourd'hui que dans un domaine sur cinq.

| Catégorie Berta | fiches publiées | matérialisée par | niveau |
|---|---|---|---|
| Chambre d'hôtes | 78 | `taxonomy_hlo.chambre_d_hotes` | **2** ✅ |
| Location saisonnière | 369 (+ 7 sans catégorie source) | `taxonomy_hlo.location_saisonniere` | **2** ✅ |
| Gîte d'étape et de randonnée | 20 | `taxonomy_hlo.hebergement_collectif` | **1** ⚠️ |
| Hôtel | 8 | `taxonomy_hot.hotel` | **1** ⚠️ |
| Camping | 3 | types `CAMP` (1) + `HPA` (2) | **aucun nœud** ⚠️ |

Réconciliation vérifiée live (sous-arbre via `ref_code_taxonomy_closure`) :

- `chambre_d_hotes` → 78 Berta « Chambre d'hôtes » + 2 Berta « Location saisonnière » = **80**
  (les 2 transfuges = arbitrages tracés : Entr'Deux Gones §190, Zévi sur Mer §189)
- `location_saisonniere` → 369 Berta « Location saisonnière » + 7 sans catégorie = **376**
- `hebergement_collectif` → **20**, soit exactement les 20 Berta « Gîte d'étape et de randonnée »
- `hotel` → **8**, soit exactement les 8 Berta « Hôtel »
- `CAMP` + `HPA` → **3**, soit exactement les 3 Berta « Camping »

**0 fiche publiée sans nœud de taxonomie** (confirme l'état de sortie de §189).

---

## 2. Inventaire niveau 2, domaine par domaine

Niveau compté depuis la racine technique exclue : niveau 1 = enfant de `root`.

### 2a. `taxonomy_hlo` — le seul domaine où le niveau 2 porte la catégorie Berta

| niveau | parent | code | libellé actuel | actif | porteurs directs | sous-arbre | catégorie Berta des porteurs |
|---|---|---|---|---|---|---|---|
| 1 | root | `hebergement_locatif` | Hébergement locatif | ✅ | 0 | 456 | — |
| 1 | root | `hebergement_collectif` | Hébergement collectif | ✅ | 0 | 20 | — |
| 1 | root | `auberge` | Auberge | ❌ | 0 | 0 | — |
| 1 | root | `gite_d_etape_et_de_randonnee` | Gîte d'étape et de randonnée | ❌ | 0 | 0 | — |
| **2** | `hebergement_locatif` | `chambre_d_hotes` | Chambre d'hôtes | ✅ | 71 | 80 | Chambre d'hôtes (69) · Location saisonnière (2) |
| **2** | `hebergement_locatif` | `location_saisonniere` | Meublé de tourisme / gîte | ✅ | 46 | 376 | Location saisonnière (44) · aucune (2) |
| **2** | `hebergement_collectif` | `gite_de_randonnee` | Refuge et gîte d'étape | ✅ | 17 | 17 | Gîte d'étape et de randonnée (17) |
| **2** | `hebergement_collectif` | `gite_de_groupe` | Gîte de groupe | ✅ | 3 | 3 | Gîte d'étape et de randonnée (3) |
| **2** | `hebergement_collectif` | `auberge_collective` | Auberge collective | ✅ | 0 | 0 | — (forward-looking) |

Niveau 3 (formes) pour mémoire : `maison` 227 · `appartement` 51 · `chalet` 22 · `bungalow` 20 · `studio` 5 · `cdh_maison` 5 · `gite_rural` 4 · `bulle` 1 · `cdh_bungalow` 1 · `hebergement_insolite` 1 · `lodges` 1 · `roulotte` 1. Désactivés : `bungalow_chalet`, `gite_villa`, `chambre`, `cottage`, `rez_de_chaussee_d_une_maison`.

### 2b. `taxonomy_hot` — le niveau 2 est un qualificatif d'ambiance, pas une catégorie

| niveau | code | libellé | porteurs |
|---|---|---|---|
| 1 | `hotel` | **Hotel** *(sans accent)* | 3 |
| 2 | `hotel_with_restaurant` | Hôtel-restaurant | 5 |
| 2 | `boutique_hotel`, `business_hotel`, `eco_hotel`, `family_hotel`, `heritage_hotel`, `modern_hotel`, `romantic_hotel`, `traditional_hotel` | 8 qualificatifs | 0 chacun |

La catégorie Berta « Hôtel » est au **niveau 1**. Les 9 nœuds de niveau 2 décrivent un positionnement (ambiance, service), pas une nature — ils n'ont pas d'équivalent Berta. Aucun ne porte de `metadata` (seed d'origine).

### 2c. `taxonomy_camp` — niveau 2 vidé par la migration du 2026-07-27

| niveau | code | libellé | actif | assignable | porteurs |
|---|---|---|---|---|---|
| 1 | `camping` | Camping | ✅ | ✅ | 1 |
| 2 | `camping_chez_l_habitant` | Camping chez l'habitant | ✅ | ❌ | 0 |

`migration_taxonomy_camp_hpa_homestay.sql` (§191) a été appliquée : les 2 porteurs sont partis vers `taxonomy_hpa.homestay_camping` et le nœud de niveau 2 est désormais non assignable. **`taxonomy_camp` n'a donc plus de niveau 2 vivant.**

### 2d. `taxonomy_hpa` — pas de niveau 2

5 nœuds, **tous niveau 1** : `natural_camp_area` (0), `farm_camping` (0), `outdoor_glamping` (0), `motorhome_area` (0), `homestay_camping` (**2**, arrivés par §191).

### 2e. `taxonomy_rva` — pas de niveau 2

3 nœuds, **tous niveau 1**, tous à 0 porteur : `tourism_residence`, `holiday_village`, `aparthotel`. Domaine déclaré conforme par §190 (§3b), jamais utilisé.

---

## 3. État du marqueur `ref_code.metadata` — à moitié posé

`metadata` est le porte-information existant (jsonb). Deux vocabulaires s'y superposent, sans recouvrement :

| clé | valeur | posée par | nœuds hébergement concernés |
|---|---|---|---|
| `axis` | `nature` | §190 | `hebergement_locatif`, `hebergement_collectif`, `auberge_collective` |
| `axis` | `forme` | §190 | `cdh_maison`, `cdh_bungalow`, `bungalow`, `chalet` |
| `level` | `source_category` | import 20260512 | `auberge`, `gite_d_etape_et_de_randonnee` (les 2 désactivés) |
| `level` | `source_subcategory` | import 20260512 | tous les autres, **y compris les 4 nœuds de niveau 2 vivants** |
| *(aucune)* | — | seeds | les 9 qualificatifs `taxonomy_hot`, `homestay_camping` |

Deux constats exploitables :

1. **`level: source_category` est la trace directe de la colonne « Nom catégorie » Berta.** Sur tout l'hébergement, seuls **2** nœuds la portent — `auberge` et `gite_d_etape_et_de_randonnee` — et les deux sont **désactivés, 0 porteur**. Les 3 autres catégories Berta (Chambre d'hôtes, Location saisonnière, Hôtel) n'ont **jamais été matérialisées comme nœud de catégorie** : l'import les a repliées sur des nœuds marqués `source_subcategory`. C'est la cause racine de l'asymétrie du §1.
2. **`level: source_subcategory` est périmé et trompeur sur les 4 nœuds de niveau 2** (`chambre_d_hotes`, `location_saisonniere`, `gite_de_groupe`, `gite_de_randonnee`) : ce sont des natures, pas des formes. §190 a rempli `axis` sur les 7 nœuds qu'il a créés et laissé les 13 autres avec l'étiquette d'import.

---

## 4. Renommage aux libellés Berta — portée réelle

Direction retenue par le PO. Le diff est **petit** : sur les 5 catégories, une seule diverge vraiment.

| # | nœud | niveau | libellé actuel | libellé Berta | fiches | nature du changement |
|---|---|---|---|---|---|---|
| 1 | `taxonomy_hlo.location_saisonniere` | 2 | Meublé de tourisme / gîte | **Location saisonnière** | 376 | renommage — **revient sur un arbitrage §190** |
| 2 | `taxonomy_hot.hotel` | 1 | Hotel | **Hôtel** | 8 | correction typographique (accent manquant) |
| 3 | `taxonomy_hlo.chambre_d_hotes` | 2 | Chambre d'hôtes | Chambre d'hôtes | 80 | **rien à faire** — déjà identique |
| 4 | Camping | type | — | — | 3 | **rien à renommer** — porté par les types `CAMP`/`HPA` |

Les `code` ne bougent dans aucun cas : seuls `name` / `name_i18n.fr` changent ⇒ **neutre pour les partenaires** (le crosswalk mappe sur les codes).

### Le point qui reste à trancher

La catégorie Berta **« Gîte d'étape et de randonnée » (20 fiches)** correspond exactement au nœud de **niveau 1** `hebergement_collectif`, pas à un nœud de niveau 2. Trois issues, aucune évidente :

- **(a)** Renommer `hebergement_collectif` en « Gîte d'étape et de randonnée ». Aligne le libellé sur Berta, mais casse la symétrie de l'axe nature posé par §190 (`hebergement_locatif` / `hebergement_collectif`) et exclut du libellé le nœud forward-looking `auberge_collective`.
- **(b)** Laisser `hebergement_collectif` tel quel et accepter que cette catégorie Berta vive au niveau 1. Le niveau 2 reste alors incomplet vis-à-vis de Berta (2 catégories sur 5).
- **(c)** Ré-armer le nœud désactivé `gite_d_etape_et_de_randonnee` comme niveau 2 sous `hebergement_collectif`, et redescendre `gite_de_randonnee` / `gite_de_groupe` au niveau 3. Restaure la catégorie Berta au bon étage, mais annule le découpage §190 et ajoute un étage à un sous-arbre de 20 fiches.

---

## 5. Impact filtres (constat, non corrigé)

`renderTaxonomyChips` ([FiltersPanel.tsx:333](../bertel-tourism-ui/src/components/explorer/FiltersPanel.tsx)) rend **tous** les nœuds actifs d'un domaine en liste plate, triée sur `position` seule, sans utiliser `depth` — pourtant calculé et disponible dans [explorer-reference.ts:298](../bertel-tourism-ui/src/services/explorer-reference.ts).

Conséquence : `gite_de_groupe` (pos. 1009), `gite_de_randonnee` (1010) et `auberge_collective` (1003) sont des **niveaux 2** dont les `position` sont dans la plage des formes de niveau 3 — ils apparaissent donc noyés au milieu d'`Appartement`, `Chalet`, `Bulle`… Le niveau 2 n'existe pas comme étage dans le panneau de filtres.

Un renommage seul ne corrige pas ce point.

---

## 6. Ce qui n'a pas été fait

Aucune écriture : ni DDL, ni DML, ni code frontend. Ce document est un constat.
