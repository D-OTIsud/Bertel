# Tags §09 — doctrine, catalogue cible et gouvernance de création (design)

**Date :** 2026-07-29
**Statut :** design — décisions PO prises en séance (§ 3), lots 0→4 à séquencer
**Périmètre :** `ref_tag` / `tag_link` (axe §09), le modal de création de tag, un écran d'administration du
catalogue, et les promotions de concepts vers `ref_amenity` / taxonomie PRD.
**Hors périmètre :** i18n des noms de tags (FR seul, inchangé) ; la couleur et l'ordre des tags (livrés §09,
2026-06-15) ; `object_environment_tag` (axe voisin, non modifié — c'est justement lui qu'on cesse de doublonner).

Prédécesseur : `2026-06-15-tags-section-09-redesign-design.md` (qui différait explicitement
« tag catalog merge/rename/retire admin tooling » — c'est le lot 1 ci-dessous).

> **⚠ Correction de vérité-terrain (2026-07-29, postérieure à la rédaction — elle PRÉVAUT sur le corps).**
> Le tableau §4.1 dit, pour chaque tag sortant, que « le concept reste filtrable via son axe légitime ».
> **C'est faux pour les codes géographiques de `object_environment_tag`** : cet axe est le **jumeau du même
> import** — 3 419 de ses 3 441 lignes ont été posées à la **même minute** (12/05/2026 13:52), seules 22
> sont des corrections humaines postérieures. Vérifié objectivement : **20 fiches « Plage » au Tampon**,
> commune sans littoral, + 3 à Entre-Deux (23 faux certains sur 55) ; **5 des 6 « Lagon »** au Tampon /
> Entre-Deux, alors qu'il n'y a aucun lagon sur le territoire CASUD (le lagon réunionnais est côte ouest) ;
> 8 « Bord de mer » au Tampon.
> **Décision PO (2026-07-29) : purger les tags, mais RÉPARER le cadre plutôt que le purger** — les tags sont
> irrécupérables (184 fiches sans aucune justification), tandis que les codes du cadre sont *falsifiables par
> la géographie* et son catalogue est bien conçu. La réparation devient le **lot 0b**.
> **Lot 0b actuellement BLOQUÉ**, et il ne faut pas le forcer : il n'existe en base **aucune géométrie de
> littoral ni de commune** (`ref_commune` n'a que l'INSEE et le nom ; les seules colonnes géographiques sont
> `object_location.geog2`, les traces ITI et les sentiers ONF), et **`object_location.city` ne concorde pas
> partout avec les coordonnées** (Le Tampon descend à `lat -21.3733`, au sud de son territoire réel).
> Débloqué par : l'import d'une couche côtière (donnée publique IGN/OSM). Écrire la règle sur des limites
> communales devinées serait exactement l'erreur qu'on corrige.

---

## 1. Constat — ce que la base dit réellement

Mesuré sur le corpus live le 2026-07-29 (846 fiches, dont 844 géolocalisées).

### 1.1 Une origine unique, non humaine

Les **4 529** liens `tag_link` ont été posés en **une seule passe le 12/05/2026**, `created_by = NULL`,
`extra.source = 'old_data_enrichment_20260512'`. C'est le **même import** qui a écrasé la nature par la forme
dans la taxonomie hébergement (§190) et mal typé environ la moitié des ACT (§186).

Six liens supplémentaires portent `extra = '{}'` (2 fiches, 17/06 et 03/07), `created_by = NULL` également :
petits reliquats d'import, pas de la saisie éditeur.

### 1.2 Le tag ne sépare plus rien

813 fiches sur 846 sont taguées, **~5,6 tags par fiche** (jusqu'à 13). Un axe qui qualifie tout le monde
n'a plus de pouvoir de filtre.

| Tag | Liens | % du corpus |
|---|---:|---:|
| Plein air | 571 | 68 % |
| Cuisine | 545 | 64 % |
| Panorama | 442 | 52 % |
| Volcan | 350 | 41 % |
| Mer et littoral | 323 | 38 % |

### 1.3 Les tags ne sont pas reproductibles depuis le contenu de la fiche

Part des fiches taguées qui contiennent **ne serait-ce qu'un mot** du champ lexical du tag (nom + description
+ chapô + description édition) :

| Tag | Taguées | Explicables |
|---|---:|---:|
| Boutique | 319 | **19 %** |
| Patrimoine | 261 | **20 %** |
| Panorama | 442 | **31 %** |
| Mer et littoral | 323 | **42 %** |

Ces pourcentages sont une **borne haute** de la précision : les « expliqués » incluent précisément les faux
positifs signalés par le PO — « vue mer », « à 30 minutes de la mer », « cuisine équipée ». Le reste
(58 % pour *Mer et littoral*) n'a **aucune** justification textuelle : ni règle ni relecture ne peut le
reconstituer.

Hors périmètre flagrant, vérifié : *Hébergement* posé sur 54 restaurants, 24 activités, 14 producteurs ;
*Cuisine* sur **367 hébergements** contre 133 restaurants.

### 1.4 Le problème structurel : 13 tags sur 16 doublonnent un axe déjà filtrable

Le recouvrement avec `object_environment_tag` (panneau « Cadre & environnement », filtre §154) est quasi 1:1 —
le même import a écrit les deux bras, le bras tag étant appliqué plus généreusement :

| Tag §09 | Cadre & environnement | En commun |
|---|---:|---:|
| Volcan 357 | `volcan` 350 | **350** (l'environnement est un sous-ensemble strict) |
| Panorama 445 | `vue_panoramique` 439 | 436 |
| Patrimoine 264 | `patrimoine` 255 | 253 |
| Mer et littoral 327 | `bord_mer` + `plage` + `lagon` 146 | 143 (+184 fiches sans aucun marqueur littoral) |

Les autres ont leur maison ailleurs : *Hébergement* / *Cuisine* = `object_type` ; *Visite guidée* / *Atelier* /
*Ferme* / *Bien-être* / *Boutique* = nœuds de taxonomie existants (`taxonomy_act.craft_workshop`,
`taxonomy_loi.visite_guidee`, `taxonomy_prd.exploitation_agricole`, `taxonomy_act.wellness_massage`,
`taxonomy_com.souvenir_shop`…).

**Et l'Explorer expose les deux filtres en même temps** : `tags_any` (clic sur une pastille de carte) et
`environment_tags_any` (panneau §154). Deux surfaces, un concept, deux réponses différentes — la classe de
bug exacte de §196 (filtre Animaux muet) et §194 (filtre Label mort).

Seuls **Famille**, **Romantique** et **Bio** n'ont aucun doublon structuré.

---

## 2. Doctrine

### R1 — Un tag qualifie la fiche, jamais son voisinage

> Si la phrase qui justifie le tag contient « à 30 minutes de », « proche de », « vue sur » — ce n'est pas un
> tag, c'est de la localisation. La localisation a déjà deux axes : la commune et « Cadre & environnement ».

C'est la règle qui tue la classe de bug signalée. Elle est mesurable : **4,5 %** du corpus contient
littéralement la formule « à X minutes de », **5,0 %** contient « vue mer ».

### R2 — Le test d'admission, quatre critères cumulatifs

| | Critère | Ce qu'il élimine |
|---|---|---|
| a | **Orphelin** — aucun axe structuré ne le porte (type, taxonomie, cadre, équipement, classement, capacité, prix, horaires) | 13 des 16 tags actuels (§1.4). C'est l'invariant §196 |
| b | **Sélectif** — vise ~2 à 25 % du corpus | *Plein air* (68 %), *Cuisine* (64 %), *Panorama* (52 %) |
| c | **Vérifiable** — un agent répond oui/non en regardant la fiche, sans interpréter | *Romantique*, *Famille* dans leur forme actuelle |
| d | **Actionnable** — quelqu'un choisit vraiment avec | critère métier (PO) |

### R3 — Un candidat-tag récurrent ET vérifiable n'est pas un tag : c'est un champ manquant

> Le tag est le brouillon du modèle. On ne garde en tag que ce qui est éditorial et **non normalisable**.

Conséquence opérationnelle : quand un concept revient (mesuré ≥ ~2 % du corpus) et qu'il est objectivement
vérifiable, il rejoint **le modèle** (`ref_amenity`, taxonomie, champ dédié) — pas le catalogue de tags. Il
devient alors filtrable proprement, et R2-a interdit d'en refaire un tag.

C'est ce qui distingue durablement cet axe des autres : **le catalogue de tags doit rester petit et le
rester.** Un catalogue de tags qui grossit est le symptôme d'un modèle qui n'a pas suivi.

---

## 3. Décisions PO (prises en séance, 2026-07-29)

| # | Décision |
|---|---|
| **D1** | **Purge** des 4 529 liens hérités de `old_data_enrichment_20260512` (+ les 6 reliquats). Aucun n'est de la saisie humaine. |
| **D2** | **Retrait du catalogue** des tags qui échouent au test R2 (§4.1). Le concept reste filtrable via son axe légitime. |
| **D3** | **Gouvernance de création : suggérer avant de créer + écran d'administration** (§5). Pas de cycle de vie « proposé → validé » : l'éditeur ne doit jamais être bloqué pendant son travail ; la dérive se corrige après coup, en un seul endroit. |
| **D4** | **Repeuplement mixte** : promotion en **champs structurés** de ce qui est normalisable (table d'hôtes, productions) ; **rail de suggestion à valider** pour l'éditorial restant. Aucun tag n'est reposé automatiquement depuis la prose. |

### 3.1 Pourquoi D4 est mixte — le constat qui a forcé la nuance

Le repeuplement « automatique sur critères stricts » a été instruit puis écarté comme insuffisant à lui seul.
Les sources de preuve **non textuelles** sont vides ou déjà des axes de filtre :

| Source envisagée | État live |
|---|---|
| `object_stay_policy` (long séjour) | **2 lignes** |
| `object_group_policy` (grande tablée) | **2 lignes** |
| `object_cuisine_type` (terroir, cuisine) | **0 ligne** |
| `object_accommodation_unit_type` (insolite) | 340 lignes, mais bulle + cabane + roulotte = **6 fiches** ; et le catalogue porte déjà un type `unusual_outdoor_unit` |
| équipements / cadre / taxonomie | non utilisables : **ce sont déjà des axes de filtre**, R2-a l'interdit |

En strict, seul **Sud Sauvage** survivait (règle déterministe sur `code_insee`, ~90 fiches). D'où D4 : ce qui
est normalisable rejoint le modèle, le reste passe par une suggestion relue par un humain.

---

## 4. Catalogue cible

### 4.1 Sortants (échec R2)

| Tag | Liens | Motif | Le concept reste filtrable via |
|---|---:|---|---|
| Hébergement | 620 | R2-a, R2-b | `object_type` (HLO/HOT/HPA/CAMP) |
| Plein air | 571 | R2-a, R2-b, R2-c | cadre (`rural`, `montagne`, `foret`), taxonomie ASC |
| Cuisine | 545 | R2-a, R2-b | `object_type` RES + `object_cuisine_type` |
| Panorama | 442 | R2-a (doublon 436/439) | cadre `vue_panoramique` |
| Volcan | 350 | R2-a (doublon 350/350), R1 | cadre `volcan` |
| Bien-être | 340 | R2-a | équipements `spa`/`massage`/`jacuzzi`, `taxonomy_act.wellness_massage` |
| Mer et littoral | 323 | **R1**, R2-a | cadre `bord_mer` / `plage` / `lagon` |
| Boutique | 319 | R2-a, R2-c (19 % explicables) | équipement `Boutique`, `taxonomy_com.souvenir_shop` |
| Patrimoine | 261 | R2-a (doublon 253/255) | cadre `patrimoine`, taxonomie VIS/PCU |
| Produits locaux | 203 | R2-a | `object_type` PRD, `taxonomy_com.local_crafts` |
| Ferme et agrotourisme | 98 | R2-a | `taxonomy_prd.exploitation_agricole` / `agrotourisme` |
| Atelier | 74 | R2-a | `taxonomy_act.craft_workshop`, `taxonomy_loi.atelier` |
| Visite guidée | 57 | R2-a | `taxonomy_loi.visite_guidee`, `taxonomy_act.guided_tour` (§186 lot B) |
| Bio | 25 | R2-c | (aucun axe — voir 4.3, candidat à promotion) |
| `jacuzzy` | 0 | doublon orthographique de l'équipement `Jacuzzi` (85 usages) | équipement `Jacuzzi` |

**Famille** (193) et **Romantique** (51) sont les seuls sans doublon structuré. Ils échouent R2-c sous leur
forme actuelle (non vérifiables). Ils ne sont pas supprimés du catalogue mais **vidés de leurs liens**
hérités : ils redeviennent des tags éditoriaux à poser, et rejoignent le chantier « clientèle / audience »
déjà différé (§34).

### 4.2 Candidats mesurés — vers le modèle (R3), pas vers le catalogue

Mesures = **planchers** (mentions textuelles seules, corpus publié).

| Concept | Fiches | % | Destination proposée |
|---|---:|---:|---|
| Table d'hôtes | 43 | 5,1 % | `ref_amenity`, famille Gastronomie |
| Vanille | 28 | 3,3 % | taxonomie PRD (production) |
| Letchis & fruits | 22 | 2,6 % | taxonomie PRD |
| Curcuma / safran péi | 18 | 2,1 % | taxonomie PRD |
| Miel & apiculture | 14 | 1,7 % | taxonomie PRD |
| Rhum & arrangés | 14 | 1,7 % | taxonomie PRD |
| Géranium | 13 | 1,5 % | taxonomie PRD |
| Baignade bassin / cascade | 28 | 3,3 % | à instruire (cadre `cascade` existe, 21 usages) |
| Long séjour / télétravail | 15 | 1,8 % | `object_stay_policy` (table vide, 2 lignes) |
| Grande tablée / groupes | 23 | 2,7 % | `object_group_policy` (table vide, 2 lignes) |

### 4.3 Candidats qui restent des tags (éditoriaux, non normalisables)

| Concept | Fiches | % | Note |
|---|---:|---:|---|
| Case créole traditionnelle | 20 | 2,4 % | fait architectural, non porté par le modèle |
| Sud Sauvage | 90 | 10,7 % | **appartenance à une destination nommée**, pas une distance — compatible R1. Alternative : `object_location.zone_touristique`, colonne existante et **100 % NULL**. Arbitrage PO ouvert. |
| Hébergement insolite | 12 | 1,4 % | recoupe `unusual_outdoor_unit` → probable R2-a, à trancher |
| Bio | 25 | 2,9 % | vérifiable via certificat AB → probable promotion en classification |

Ordre de grandeur cible du catalogue : **une poignée de tags**, pas une douzaine — conformément à R3.

---

## 5. Gouvernance de la création

### 5.1 Le trou, et sa preuve

Le tag **`jacuzzy`** (0 lien, créé à la main) coexiste en base avec l'équipement **`Jacuzzi`** (85 usages).
Chemin exact reconstitué :

- `api.create_tag` dédoublonne sur le **nom normalisé exact** (`immutable_unaccent(lower(name))`) — donc
  `Bien-Être` = `bien-être`, mais `jacuzzy` ≠ `jacuzzi` ;
- `TagPickerModal.tsx` filtre la bibliothèque par **sous-chaîne** (`normalizeKey(label).includes(qKey)`) :
  taper « jacuzzy » ne remonte **aucune** proposition, et le bouton « Créer « jacuzzy » » s'affiche.

L'éditeur n'a jamais eu l'information qu'il fabriquait un doublon.

### 5.2 Étage 1 — normaliser à l'écriture (existe, à durcir)

Accents, casse, espaces, ponctuation : déjà fait. À ajouter : pluriel simple et apostrophes typographiques
(`'` vs `’`), qui produisent aujourd'hui deux tags distincts.

### 5.3 Étage 2 — proposer avant de créer (le correctif)

Nouveau `api.suggest_similar_tags(p_name)`, qui remonte les candidats proches par **deux signaux
orthogonaux** — exactement le dispositif validé en §199 :

- **trigramme** (`pg_trgm`) — écart de **caractères** : `jacuzzy` → `jacuzzi` ;
- **phonétique** (`dmetaphone`) — écart de **son** : `sentié` → `sentier`, `kaz` → `case`.

Les deux sont nécessaires : §199 a établi qu'un écart sur la **première lettre** est structurellement
invisible aux trigrammes, et que `dmetaphone` (anglophone) rate le *g* doux français. Retirer un bras perd
une classe de fautes.

Le périmètre de recherche **doit inclure les catalogues voisins** (`ref_amenity`, `ref_code` des domaines
pertinents) et pas seulement `ref_tag` : sinon on rejoue `jacuzzy` contre le mauvais référentiel — c'est
précisément ce qui s'est produit.

Contrat UI : « Créer » n'apparaît qu'**après** affichage des candidats et refus explicite
(« aucun ne convient »). Côté RPC, `api.create_tag` gagne un `p_confirm_distinct boolean` et **refuse**
(fail-closed) si un candidat dépasse le seuil de proximité sans confirmation — la garde ne peut pas vivre
uniquement dans l'UI (une seconde surface la contournerait, cf. §196).

**Seuils :** à calibrer sur CE catalogue et à asserter en CI, comme §197/§199. Un seuil dont les comptes ne
bougent pas sur une plage est un **plateau**, à documenter comme tel.

### 5.4 Étage 3 — écran d'administration du catalogue

Différé par le design §09 du 2026-06-15 (« catalog merge/rename/retire admin tooling »), il devient
nécessaire dès lors que la création reste libre :

- **fusionner** deux tags (report des `tag_link`, dédoublonnage par `(tag_id, target_pk)`) ;
- **renommer** (le slug reste stable — il est la valeur envoyée au filtre `tags_any`) ;
- **supprimer** (refus si liens, ou report explicite) ;
- **ramassage** des tags à 0 lien.

Gate : superuser plateforme ou admin d'ORG de rang suffisant, aligné sur l'admin `ref_code` livrée §119.

---

## 6. Lots

| Lot | Contenu | Dépend de |
|---|---|---|
| **0** | Purge des 4 529 + 6 liens ; retrait des 15 tags sortants (§4.1) ; garde CI non vacante | — |
| **1** | `api.suggest_similar_tags` + `create_tag` fail-closed + `TagPickerModal` ; écran d'administration du catalogue | — |
| **2** | Promotions R3 : `ref_amenity.table_hotes` (famille Gastronomie) + nœuds productions en taxonomie PRD | arbitrage PO §4.2 |
| **3** | Rail de suggestion à valider (preuve = la phrase justificative), pour les tags **et** les champs promus | lots 1-2 |
| **4** | Sud Sauvage : tag ou `zone_touristique` ? périmètre communal à définir | arbitrage PO |

### 6.1 Précaution d'exécution du lot 0 (§197)

`tag_link` porte `trg_refresh_object_filter_caches_tag_link`, **FOR EACH ROW**, qui appelle
`api.refresh_object_filter_caches(target_pk)` à chaque suppression. Une purge naïve de 4 529 lignes ferait
donc 4 529 reconstructions de `search_document`, et — `search_document` n'étant **pas** exclu des trois
triggers « changement métier » de `object` (différé §197 documenté) — poserait `updated_at = now()` et un
snapshot `object_version` sur ~813 fiches.

Or `object.updated_at` est **le signal de reprise des synchronisations partenaires**.

La purge doit donc, dans la transaction qui détient déjà le verrou : désactiver le trigger de cache le temps
du seul `DELETE` (nommage gardé, `ALTER TABLE … DISABLE/ENABLE TRIGGER`), puis exécuter **un seul** passage
`refresh_object_filter_caches` sur les fiches touchées, puis rafraîchir les vues matérialisées concernées
(+ `ANALYZE`, cf. l'invariant §197).

**Arbitrage restant :** faut-il que cette purge bumpe `updated_at` (les partenaires reprennent les fiches
dont les tags ont disparu) ou non (correction interne, invisible aux partenaires) ? Décision PO.

---

## 7. Invariant proposé pour `CLAUDE.md`

> ### Un tag qualifie la fiche, jamais son voisinage — et un tag récurrent vérifiable est un champ manquant
>
> L'axe §09 (`ref_tag` / `tag_link`) est **éditorial et non normalisable**. Trois règles :
> 1. **Voisinage interdit.** Si la justification d'un tag contient « à X minutes de », « proche de »,
>    « vue sur », c'est de la localisation — elle a déjà ses axes (commune, `object_environment_tag`).
>    C'est ce qui a produit *Mer et littoral* sur des gîtes des hauts du Tampon (import 20260512).
> 2. **Test d'admission cumulatif** : orphelin (aucun axe structuré ne le porte — invariant §196),
>    sélectif (~2-25 % du corpus), vérifiable sans interprétation, actionnable.
> 3. **Un candidat récurrent ET vérifiable rejoint le MODÈLE** (`ref_amenity`, taxonomie, champ dédié),
>    pas le catalogue de tags. Le catalogue doit rester petit ; sa croissance est le symptôme d'un modèle
>    en retard.
>
> **Création contrôlée :** un nom normalisé exact ne suffit pas à dédoublonner (`jacuzzy` vs l'équipement
> `Jacuzzi`). Toute création passe par une suggestion à **deux signaux orthogonaux** (trigramme + phonétique,
> dispositif §199) portant sur `ref_tag` **et les catalogues voisins**, avec refus fail-closed **côté RPC** —
> jamais une garde seulement-UI.
