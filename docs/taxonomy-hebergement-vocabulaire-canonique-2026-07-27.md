# Vocabulaire canonique de l'hébergement — delta live → cible et mise en œuvre filtre

**Date** : 2026-07-27 · **Périmètre** : les 5 domaines hébergement + la surface de filtre Explorer
**Référentiel canonique retenu** (arbitrage PO 2026-07-27) : **DATAtourisme** (ontologie `AccommodationProduct` / classes hébergement) + **Code du tourisme** (art. `D324-1`, `R2333-44`). **Berta** est conservé comme *vocabulaire source* et *jeu d'alias*, jamais comme référentiel.
**État** : **constat + plan — aucune modification appliquée.**
**Prolonge** : [taxonomy-hebergement-niveau2-inventaire-2026-07-27.md](taxonomy-hebergement-niveau2-inventaire-2026-07-27.md) (§1–6) et §190 (nature/forme).

---

## 1. Règle fondatrice

> **Un axe = un sens = une surface de filtre.** Aucun numéro de niveau n'a le même sens d'un arbre à l'autre. Ce qui identifie un étage, c'est son **axe déclaré**, jamais sa profondeur.

C'est la généralisation de l'invariant §190 (« la nature précède la forme »), étendue de 2 à 7 axes.

---

## 2. Les 7 axes et leur foyer actuel en base

| Axe | Terme retenu | Foyer en base aujourd'hui | État |
|---|---|---|---|
| Grande branche ontologique | **Famille d'hébergement** | *aucun* — réparti entre `object_type` et le niveau 1 de `taxonomy_hlo` | ⚠️ à dériver |
| Identité métier / réglementaire | **Nature d'hébergement** | `taxonomy_*` niveau 2 (HLO) / niveau 1 (HOT, CAMP, HPA, RVA) | ✅ existe, à normer |
| Spécialisation d'une nature | **Sous-type d'hébergement** | `taxonomy_*` (mêmes arbres) | ✅ existe |
| Structure physique proposée | **Type d'unité d'hébergement** | `taxonomy_hlo` niveau 3 — **mauvais axe** | ⚠️ à extraire |
| Niveau de qualité officiel | **Classement** | `object_classification` + filtre étoiles/épis/clés (§174) | ✅ complet |
| Distinction / réseau | **Label / qualification** | `object_classification`, groupe *Distinctions* (§175/§176) | ✅ complet |
| Orientation commerciale | **Positionnement** | *aucun* — 8 nœuds squattent `taxonomy_hot` niveau 2 | ⚠️ à sortir |
| Public visé | **Clientèle cible** | *aucun* | ⏸️ déjà différé (§34, backlog) |
| Prestation disponible | **Service** | `object_amenity` / `ref_amenity` | ✅ existe (1 code manquant, cf. §5) |

**Bilan : 4 axes sur 7 ont déjà leur foyer et n'appellent aucun changement de modèle.** Deux sont mal logés (type d'unité, positionnement), un doit être dérivé (famille).

### 2b. Vocabulaires orphelins repérés — à supprimer

- **`ref_code` domaine `accommodation_type`** (10 codes : `hotel, boutique_hotel, luxury_hotel, resort, guesthouse, gite, camping, glamping, villa, apartment`) : **0 usage, absent de `ref_code_domain_registry`**. Il mélange nature + positionnement + type d'unité dans un seul axe — exactement l'anti-pattern que ce document ferme. **À désactiver.**
- **`ref_code` domaine `room_type`** (`single, double, twin, suite`…) : légitime mais **sans rapport** avec « type d'unité ». Ce sont des catégories de chambre d'hôtel, consommées par `object_room_type.room_type_id` (0 ligne live). Ne pas confondre : `object_room_type` **n'est pas** le foyer du type d'unité.

---

## 3. Le désalignement de fond : « famille » ≠ `object_type`

La hiérarchie cible place chaque nature sous une famille. Or l'`object_type` de Bertel ne découpe pas selon les mêmes lignes :

| Famille cible (DATAtourisme) | ce que Bertel a aujourd'hui |
|---|---|
| Hôtellerie | type `HOT` |
| Hébergement locatif | type `HLO`, branche `hebergement_locatif` |
| Hébergement collectif | type `HLO`, branche `hebergement_collectif` **+ type `RVA`** (résidence de tourisme) |
| Hôtellerie de plein air | type `CAMP` **+ type `HPA`** |

Donc : **`HLO` chevauche deux familles**, tandis que `CAMP`+`HPA` et `HLO/collectif`+`RVA` se regroupent. La famille n'est ni l'`object_type`, ni un niveau d'arbre.

**Décision recommandée : la famille est une couche DÉRIVÉE, jamais stockée** — une fonction `(object_type, nœud de nature)` → famille. Motifs :

- Restructurer les `object_type` toucherait `ref_facet_applicability`, les archétypes éditeur, les RLS, les ids d'objets et le crosswalk partenaires : coût sans commune mesure avec le gain.
- Le mécanisme de regroupement **existe déjà** : le *bucket* Explorer (`EXPLORER_TYPE_CODE_FAMILIES`, dérivé des archétypes) groupe déjà `HOT/HPA/HLO/CAMP/RVA` sous « Hébergements ». La famille est le même mécanisme, un cran plus fin.

---

## 4. Delta live → cible, nœud par nœud

### 4a. `taxonomy_hot`

| code | libellé actuel | action | libellé cible | porteurs |
|---|---|---|---|---|
| `hotel` | **Hotel** | renommer (accent) | **Hôtel** | 3 |
| `hotel_with_restaurant` | Hôtel-restaurant | **sortir de l'axe nature** → axe *positionnement* ; la nature commune reste Hôtel | Hôtel-restaurant | 5 |
| `boutique_hotel`, `business_hotel`, `eco_hotel`, `family_hotel`, `heritage_hotel`, `modern_hotel`, `romantic_hotel`, `traditional_hotel` | 8 nœuds | **sortir de l'axe nature** → axe *positionnement* | idem, hors taxonomie | 0 chacun |

⚠️ Les sortir n'est **pas** un masquage sur données (invariant §150 : un filtre existe parce que le concept existe). Le motif est un **mauvais axe** : ce sont des orientations commerciales, pas des natures. Elles réapparaîtront dans le filtre sous « Positionnement » une fois cet axe créé.

### 4b. `taxonomy_hlo` — natures et sous-types

| code | libellé actuel | action | libellé cible |
|---|---|---|---|
| `hebergement_locatif` | Hébergement locatif | conserver — **famille** | Hébergement locatif |
| `hebergement_collectif` | Hébergement collectif | conserver — **famille** | Hébergement collectif |
| `chambre_d_hotes` | Chambre d'hôtes | conserver — nature réglementaire **et** classe DATAtourisme `Guesthouse` | Chambre d'hôtes |
| `location_saisonniere` | Meublé de tourisme / gîte | **renommer** — retirer « / gîte » (appellation commerciale, pas une nature ; DGCCRF) | **Meublé de tourisme** |
| `gite_de_randonnee` | Refuge et gîte d'étape | conserver — libellé DATAtourisme exact | Refuge et gîte d'étape |
| `gite_de_groupe` | Gîte de groupe | conserver | Gîte de groupe |
| `auberge_collective` | Auberge collective | conserver | Auberge collective |

**Ne PAS réactiver `gite_d_etape_et_de_randonnee`.** Berta agrège sous ce libellé deux sous-types distincts ; la structure §190 est plus correcte que la source. La catégorie Berta se retrouve par la **famille** `hebergement_collectif` (20 fiches, correspondance exacte) et par l'alias de recherche.

### 4c. `taxonomy_hlo` — les 12 nœuds de niveau 3 à réaffecter à l'axe *type d'unité*

| code actuel | porteurs | type d'unité cible | note |
|---|---|---|---|
| `maison` | 227 | **Maison / villa** | |
| `appartement` | 51 | **Appartement** | |
| `chalet` | 22 | **Chalet** | |
| `bungalow` | 20 | **Bungalow / mobil-home** | |
| `studio` | 5 | **Studio** | |
| `cdh_maison` | 5 | **Maison / villa** | fusionne avec `maison` |
| `gite_rural` | 4 | — | **appellation**, pas un type d'unité → alias de *Meublé de tourisme* |
| `cdh_bungalow` | 1 | **Bungalow** | fusionne avec `bungalow` |
| `bulle` | 1 | **Bulle** | |
| `lodges` | 1 | **Lodge** | |
| `hebergement_insolite` | 1 | **Hébergement insolite** | générique |
| `roulotte` | 1 | **Roulotte** | |

Le doublon `cdh_maison` / `maison` (et `cdh_bungalow` / `bungalow`) n'existe **que** parce qu'un `ref_code` est mono-parent. Sur un axe parallèle, il disparaît : 6 fiches concernées.

**Neutralité partenaires vérifiée** : `ref_interop_crosswalk` ne mappe **que** des nœuds de nature (`chambre_d_hotes`, `location_saisonniere`, `hebergement_collectif`, `gite_de_randonnee`) et résout par ancêtre. Aucune de ces 12 feuilles n'y figure ⇒ extraire l'axe type d'unité **ne change aucune sortie partenaire**, tant que l'objet conserve son nœud de nature.

### 4d. `taxonomy_camp` / `taxonomy_hpa` — hôtellerie de plein air

État après §191 (appliquée le 2026-07-27) : `CAMP` = classé (1 fiche), `HPA` = non classé (2 fiches sur `homestay_camping`).

| point | action |
|---|---|
| `homestay_camping` « Camping chez l'habitant » (2 fiches) | **appellation locale, pas une nature canonique** → requalifier au cas par cas : `farm_camping` si l'activité est sur une exploitation agricole, sinon `natural_camp_area`. Nécessite vérification terrain. |
| **Parc résidentiel de loisirs (PRL)** | **absent** — nature réglementaire réelle, à créer sous la famille plein air (0 porteur, forward-looking) |
| `motorhome_area` « Aire d'accueil camping-car » | conserver (hors liste DATAtourisme citée mais nature réelle et utile) |

### 4e. `taxonomy_rva`

Les 3 nœuds sont corrects et alignés. Seule conséquence du modèle cible : **`tourism_residence` relève de la famille « Hébergement collectif »**, pas d'une famille propre. C'est une affectation de famille dérivée — aucun changement de nœud.

### 4f. Convention à écrire noir sur blanc

> **« Hébergement collectif » est employé dans Bertel au sens DATAtourisme** — accueil de groupes (auberge collective, gîte de groupe, refuge et gîte d'étape, résidence de tourisme) — **et non au sens statistique de l'Insee**, qui englobe hôtels et campings. Toute lecture Insee d'un chiffre Bertel doit être re-agrégée.

À ajouter au `CLAUDE.md` (section *Business invariants*) et au dictionnaire d'objets.

---

## 5. Table d'arbitrage exhaustive — valeur Berta → rôle → canonique → alias

### 5a. Colonne `Nom catégorie` (485 lignes) → **nature source Berta**

| Valeur Berta | n | Rôle sémantique réel | Terme canonique | Axe cible | Alias de recherche |
|---|---|---|---|---|---|
| Location saisonnière | 376 | mode/contrat de location, **pas** une nature | **Meublé de tourisme** | nature | *Location saisonnière*, *Gîte* |
| Chambre d'hôtes | 78 | nature réglementaire ✅ | Chambre d'hôtes | nature | — |
| Gîte d'étape et de randonnée | 20 | **famille** (agrège 2 sous-types) | Hébergement collectif | famille | *Gîte d'étape et de randonnée* |
| Hôtel | 8 | nature ✅ | Hôtel | nature | — |
| Camping | 3 | nature ✅ | Camping | nature | — |

### 5b. Colonne `Nom sous catégorie` (24 valeurs) — **axe mixte, à ventiler**

| Valeur Berta | n | Rôle sémantique réel | Terme canonique | Axe cible |
|---|---|---|---|---|
| Gîte & Villa | 175 | type d'unité composite | Maison / villa | type d'unité |
| Maison | 82 | type d'unité | Maison / villa | type d'unité |
| Chambre d'hôte | 64 | **nature** | Chambre d'hôtes | nature |
| Bungalow & Chalet | 52 | type d'unité composite | Bungalow **+** Chalet (déjà scindé §190) | type d'unité |
| Appartement | 47 | type d'unité | Appartement | type d'unité |
| *(vide)* | 15 | — | nature seule, sans précision | — |
| Gîte de randonnée | 13 | sous-type | Refuge et gîte d'étape | sous-type |
| Hôtel | 7 | nature | Hôtel | nature |
| Gîte rural | 5 | **appellation** | *(alias de Meublé de tourisme)* | alias |
| Studio | 5 | type d'unité | Studio | type d'unité |
| Chambre d'hôte ; Table d'hôte | 3 | nature **+ service** | Chambre d'hôtes + service *Table d'hôtes* | nature + service |
| Gîte de groupe | 3 | sous-type | Gîte de groupe | sous-type |
| Camping | 2 | nature | Camping | nature |
| Rez de chaussée d'une maison | 2 | type d'unité (précision) | Maison / villa | type d'unité |
| chambre | 1 | type d'unité | Chambre | type d'unité |
| cottage | 1 | appellation | *(alias de Maison / villa)* | alias |
| Gîte & Villa ; Appartement | 1 | type d'unité **multiple** | Maison / villa + Appartement | type d'unité (multi-valué) |
| Table d'hôte ; Chambre d'hôte | 1 | nature + service | idem ligne ci-dessus | nature + service |
| Camping chez l'habitant | 1 | appellation locale | **à arbitrer** (ferme / aire naturelle) | nature — arbitrage |
| Roulotte | 1 | type d'unité | Roulotte | type d'unité |
| Lodges | 1 | type d'unité | Lodge | type d'unité |
| bulle | 1 | type d'unité | Bulle | type d'unité |
| Hébergement Insolite | 1 | type d'unité générique | Hébergement insolite | type d'unité |
| Auberge | 1 | **ambigu** | **à arbitrer** (Hôtel vs Auberge collective) | nature — arbitrage |

**Confirmation empirique** : la colonne `Nom sous catégorie` mélange **5 axes** (nature, sous-type, type d'unité, appellation, service) et est parfois **multi-valuée** (séparateur ` ; `). Elle ne peut pas être portée par un nœud unique — c'est la cause racine des régressions §190.

**Deux conséquences immédiates :**
1. Le **type d'unité doit être multi-valué** (« Gîte & Villa ; Appartement ») ⇒ table de liaison, pas une colonne.
2. Le service **Table d'hôtes** n'a **aucun foyer** : `ref_amenity` a `breakfast` mais pas de code table d'hôtes, et `taxonomy_res.table_d_hotes` est désactivé à 0 porteur. ⇒ créer un `ref_amenity` `table_d_hotes` et y verser les 4 fiches.

---

## 6. Mise en œuvre côté filtres

### 6a. Le défaut actuel

`renderTaxonomyChips` ([FiltersPanel.tsx:333](../bertel-tourism-ui/src/components/explorer/FiltersPanel.tsx)) rend **tous** les nœuds actifs d'un domaine en **liste plate**, triée sur `position` seule, **sans utiliser `depth`** — pourtant calculé et disponible ([explorer-reference.ts:298](../bertel-tourism-ui/src/services/explorer-reference.ts)). Les natures se retrouvent noyées au milieu des formes (`gite_de_groupe` pos. 1009 entre `Chalet` et `Gîte rural`).

De plus, `listTaxonomyReferences` ne sélectionne **pas** `description` ⇒ les chips de taxonomie **n'ont aucune infobulle**, alors que le pattern existe 120 lignes plus haut (`title={amenity.description}`, lignes 457 / 492 / 517).

### 6b. La cible : quatre étages nommés, jamais mélangés

```
Hébergements
├─ Famille          [Hôtellerie] [Hébergement locatif] [Hébergement collectif] [Plein air]
├─ Nature           chips, filtrées par la famille active
├─ Sous-type        chips, filtrées par la nature active
└─ Type de logement chips, bloc SÉPARÉ — jamais sous une nature
```

Chaque bloc porte son **titre explicite** (« Nature d'hébergement », « Type de logement »). Un utilisateur ne peut plus confondre « Chambre d'hôtes » (nature) et « Chambre » (type d'unité) : ils ne sont plus dans le même bloc.

### 6c. Les quatre dispositifs anti-chipotage

1. **Infobulle normative sur chaque chip de nature.** `ref_code.description` est déjà peuplé et déjà servi ; il suffit d'ajouter `description` au select et `title={node.description}` au chip. La description cite **la source d'autorité** :
   > *Meublé de tourisme* — villa, appartement ou studio à l'usage exclusif du locataire (Code du tourisme, art. D324-1). Anciennement « Location saisonnière » dans Berta.

   Le terme n'est plus une opinion : il est sourcé dans l'UI.

2. **Alias Berta dans la recherche.** Taper « location saisonnière » **doit** ramener *Meublé de tourisme*. Les alias vivent dans `ref_code.metadata.aliases` (jsonb déjà présent, aucune colonne à créer) et alimentent le filtre de recherche des chips.

3. **Bandeau de correspondance, affiché une fois puis rejetable.** Un tableau court « ancien terme Berta → nouveau terme », consultable ensuite via une icône d'aide du bloc.

4. **Tri par position d'axe**, pas par la `position` héritée de l'import. Corrige le mélange actuel des étages.

### 6d. Point de vigilance — la famille est dérivée

Les 4 boutons de famille ne correspondent à aucun champ stocké : ils se résolvent en `(object_type, nœud de nature)`. Concrètement, sélectionner *Hébergement collectif* doit produire `types ∈ {HLO, RVA} ∧ nature ∈ sous-arbre(hebergement_collectif) ∪ taxonomy_rva`. C'est le seul point du plan qui demande une vraie logique de résolution, pas juste du rendu.

---

## 7. Séquencement proposé

Trois lots indépendants, du moins risqué au plus structurant. Chacun est livrable seul.

| Lot | Contenu | Données touchées | Risque partenaires |
|---|---|---|---|
| **L1 — Vocabulaire** | Renommer `hotel`→Hôtel et `location_saisonniere`→Meublé de tourisme ; poser `metadata.axis` sur les 13 nœuds encore marqués `source_subcategory` ; poser `metadata.aliases` (alias Berta) ; désactiver le domaine orphelin `accommodation_type` ; écrire la convention « collectif » au sens DATAtourisme | 0 ligne `object_taxonomy` | **nul** (codes inchangés) |
| **L2 — Filtres** | Rendu par axe (4 blocs titrés), infobulles normatives, recherche par alias, bandeau de correspondance, tri par axe | aucune | nul |
| **L3 — Axe type d'unité** | Créer le domaine + la table de liaison multi-valuée ; migrer les 12 feuilles (~334 fiches) vers l'axe ; fusionner `cdh_maison`/`maison` et `cdh_bungalow`/`bungalow` ; reverser `gite_rural`/`cottage` en alias ; créer `ref_amenity.table_d_hotes` ; créer le nœud PRL | ~334 lignes | **nul** (crosswalk = natures uniquement, vérifié) |

**L1 + L2 délivrent déjà l'objectif utilisateur** — un vocabulaire normé, sourcé, et des filtres où chaque étage a un nom — sans toucher une seule affectation d'objet. L3 est la mise en conformité structurelle du modèle.

### Arbitrages restant ouverts avant L3

1. `Camping chez l'habitant` (2 fiches) → camping à la ferme ou aire naturelle ? *Vérification terrain requise.*
2. `Auberge` (1 fiche, brouillon) → Hôtel ou Auberge collective ?
3. `gite_rural` (4 fiches) → alias de *Meublé de tourisme*, ou nature distincte conservée ?
4. ~~Le positionnement (8 nœuds HOT) : axe à créer maintenant, ou nœuds simplement désactivés en attendant ?~~
   **Décidé le 2026-07-29** : axe multi-valué créé. `hotel_with_restaurant`
   rejoint les huit orientations commerciales, soit 9 valeurs. « Hôtel » reste
   la nature englobante et son filtre couvre donc les hôtels avec ou sans
   restaurant ; « Hôtel-restaurant » affine via le nouvel axe.

---

## 8. Ce qui n'a pas été fait

Aucune écriture : ni DDL, ni DML, ni code frontend. Ce document est un constat et un plan.
