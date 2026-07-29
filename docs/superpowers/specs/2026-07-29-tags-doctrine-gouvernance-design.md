# Tags §09 — doctrine, catalogue cible et gouvernance de création (design)

**Date :** 2026-07-29
**Statut :** design — décisions PO prises en séance (§ 3) ; revu et corrigé le 2026-07-29 (voir §6.2) ;
lots 1→6 séquencés en §6, la purge en dernier
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

Six liens supplémentaires portent `extra = '{}'` (2 fiches, 17/06 et 03/07). **Ce sont des écritures
ÉDITEUR** — audit en §6.2 — et non des reliquats d'import comme le disait la première rédaction. Ils sont
explicitement HORS purge. `created_by` ne les distingue pas : le RPC éditeur n'écrivait pas cette colonne.

### 1.2 Le tag ne sépare plus rien

830 fiches sur 846 sont taguées (828 par l'import, 2 par un éditeur), **~5,5 tags par fiche** jusqu'à 13.
Un axe qui qualifie tout le monde n'a plus de pouvoir de filtre.

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

> **Assouplissements de revue (2026-07-29) — cette version PRÉVAUT sur la première rédaction.** Les règles
> ci-dessous étaient formulées de façon trop absolue : R1 interdisait « vue sur » alors qu'une vue mer réelle
> est un fait sur place ; R2-b et R2-c éliminaient alors qu'ils devraient orienter ; R3 promouvait
> automatiquement, au risque de multiplier champs et taxonomies.

### R1 — Un tag nomme un fait constatable SUR PLACE, jamais une proximité

> Le test n'est pas le mot employé, c'est **l'ancrage** : le fait est-il vérifiable en se tenant dans
> l'établissement ? « Vue mer depuis la terrasse » = **oui**, c'est une caractéristique sur place, vérifiable
> et actionnable. « À 30 minutes de la mer », « proche du volcan » = **non**, c'est de la localisation, et la
> localisation a déjà ses axes (commune, « Cadre & environnement »).

C'est la règle qui tue la classe de bug signalée, sans jeter les vues réelles avec. Elle est mesurable :
**4,5 %** du corpus contient littéralement « à X minutes de » — ceux-là sont exclus par construction.

### R2 — Le test d'admission : un critère éliminatoire, trois indicateurs

| | Critère | Portée |
|---|---|---|
| a | **Orphelin** — aucun axe structuré ne porte déjà le concept (type, taxonomie, cadre, équipement, classement, capacité, prix, horaires) | **ÉLIMINATOIRE.** Seul critère qui tranche à lui seul, parce qu'un doublon produit un filtre qui ment (invariant §196). Élimine 13 des 16 tags actuels (§1.4) |
| b | **Sélectivité** | **Indicateur.** La bande ~2-25 % oriente, elle n'élimine pas : un tag sur 68 % du corpus est un décor, mais un tag sur 1 % peut être décisif s'il est le seul à répondre à une vraie demande |
| c | **Vérifiabilité** | **Indicateur fort.** Plus un tag est interprétatif, plus il exige une **définition écrite** pour que deux agents le posent pareil. Sans définition, il dérive |
| d | **Actionnable** | Critère métier (PO) |

### R3 — Un candidat récurrent et vérifiable est un SIGNAL DE PROMOTION, pas une promotion automatique

> Le tag est le brouillon du modèle. Quand un concept revient et se vérifie, c'est le signal qu'il **mérite
> d'être instruit** pour rejoindre le modèle (`ref_amenity`, taxonomie, champ dédié) — pas qu'il doit y
> passer d'office.

L'instruction pèse deux choses avant de promouvoir : le **coût** (surface éditeur, filtre, i18n, seeds,
manifest, migration, et une ligne de plus dans chaque sélecteur) et la **stabilité** du concept. Un concept
instable, saisonnier ou marginal **reste un tag** — c'est précisément le rôle de cet axe : accueillir ce qui
n'est pas encore, ou pas assez, stabilisé pour mériter une colonne.

Le catalogue de tags doit rester petit ; mais multiplier les champs a son propre coût, et un modèle
sur-normalisé est aussi coûteux qu'un catalogue de tags qui enfle.

---

## 3. Décisions PO (prises en séance, 2026-07-29)

| # | Décision |
|---|---|
| **D1** | **Purge** des 4 529 liens portant `extra.source = 'old_data_enrichment_20260512'`, et EUX SEULS. Les 6 liens sans `source` sont de la **saisie éditeur** (audit §6.2) et sont conservés. Sauvegarde exacte des lignes supprimées avant tout DELETE, rollback fourni. |
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

**Famille** (193) et **Romantique** (51) — statut assumé, pas masqué. Ce sont les seuls sans doublon
structuré, mais ils **échouent l'indicateur R2-c** : rien n'écrit à quoi on reconnaît une fiche « Famille ».
Les conserver au catalogue est donc une décision **transitoire**, pas une réussite au test — la première
rédaction de cette spec les gardait sans le dire, ce qui mettait la doctrine en contradiction avec son propre
catalogue cible.

Deux sorties, à trancher au lot 2 :
- **les définir** (« Famille » = équipements enfants ∪ capacité ≥ 4 ∪ mention explicite ; « Romantique » = ?)
  — et ils passent R2-c ; mais une définition dérivable est aussi un signal R3, donc l'instruction doit
  peser champ vs tag ;
- **les retirer**, et le catalogue démarre vide en attendant la requalification.

Point ouvert relevé au passage : « Romantique » recoupe le nœud `taxonomy_hot.hotel_romantique` (similarité
0.647). Aucun nœud équivalent n'existe côté HLO, où il s'applique surtout — mais c'est un arbitrage R2-a.

Ils sont en tout état de cause **vidés de leurs liens hérités** (issus du même import).

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

> **Reséquencé en revue (2026-07-29).** La purge était d'abord le lot 0. C'était une erreur d'ordre : elle
> vide l'axe public **avant** que la gouvernance, les champs de remplacement et la requalification n'existent,
> et rien n'empêcherait un éditeur de recréer le lendemain les tags qu'on vient de retirer (`api.create_tag`
> est ouvert). **La purge passe en dernier, dans une release coordonnée.**

| # | Lot | Contenu | Dépend de |
|---|---|---|---|
| **1** | Traçabilité des écritures | `api.save_object_workspace_tags` doit écrire `created_by` (et `api.create_tag` le fait déjà sur `ref_tag`). Sans ça, aucune purge ne peut distinguer l'import de la saisie — c'est le défaut qui a failli détruire 6 lignes humaines | — |
| **2** | Gouvernance | `api.suggest_similar_tags` (trigramme + phonétique, sur `ref_tag` **et** catalogues voisins) + `create_tag` fail-closed (`p_confirm_distinct`) + `TagPickerModal` + écran d'administration du catalogue (fusionner / renommer / supprimer avec report des liens, ramassage des 0-lien) | — |
| **3** | Seed du catalogue survivant | **FAIT dans cette passe** — `family` / `romantic` seedés dans `seeds_data.sql`. Ils n'existaient que via l'enrichissement d'import hors manifest : une base fraîche n'avait aucun tag alors que live en portait 16 (même dérive fresh/live que la taxonomie, note 13b). ⚠️ Le `ON CONFLICT DO NOTHING` garantit l'**existence** des lignes, **pas** l'égalité des valeurs fresh/live : un `DO UPDATE` écraserait à chaque ré-application la couleur posée par `set_tag_color`, le libellé renommé depuis l'écran d'admin ou la position réordonnée. Le seed pose une valeur initiale, le catalogue vivant appartient ensuite aux administrateurs — et l'assertion C du test porte sur la PRÉSENCE des slugs, jamais sur leurs libellés | — |
| **4** | Champs de remplacement (R3) | Instruction coût/stabilité puis, si retenu : `ref_amenity.table_hotes` (famille Gastronomie) + nœuds productions en taxonomie PRD (vanille 28, letchis 22, curcuma 18, miel 14, rhum 14, géranium 13) | arbitrage PO §4.2 |
| **5** | Requalification | Rail de suggestion à valider (preuve = la phrase justificative), pour les tags **et** les champs promus. Inclut l'arbitrage des 5 liens éditeur posés sur des tags sortants (§6.2) | lots 2 et 4 |
| **6** | Sauvegarde + purge + republication | Table de sauvegarde des lignes exactes à supprimer, PUIS `migration_tags_purge_import_20260512.sql` (écrite, manifest 16p), PUIS refresh des MV — **une seule release coordonnée**, parce que la purge republie 828 fiches chez les partenaires | lots 1-5 |
| **0b** | Réparation de `object_environment_tag` | voir la correction de vérité-terrain en tête de document | couche côtière absente |
| — | Sud Sauvage | tag ou `object_location.zone_touristique` (colonne existante, 100 % NULL) ? périmètre communal à définir | arbitrage PO |

### 6.2 La provenance ne se lit PAS dans `created_by` (correction de revue)

`api.save_object_workspace_tags` (`object_workspace_gap_rpcs.sql`) insère `tag_link` **sans `created_by`** :
une écriture éditeur a donc, elle aussi, `created_by = NULL`. Tout test qui prend `created_by IS NULL` pour
un marqueur d'import est **inerte** — la première version de la purge présentait exactement ce test comme un
garde-fou protégeant le travail des agents.

**Le seul marqueur fiable est `extra->>'source'`**, et le prédicat de purge s'y limite désormais (plus
`target_table = 'object'`, `tag_link` étant polymorphe).

Les 6 lignes `extra = '{}'` ont été **auditées et sont de la saisie éditeur** : le RPC fait un
delete-then-insert de toute la fiche en écrivant `position = ordinality-1` et `extra = {}` ; ces lignes ont
des positions contiguës depuis 0 (0-1-2-3 sur `HLORUN00000000TV`, 0-1 sur `LOIRUN00000000QO`), un horodatage
identique par fiche, et ces 2 fiches ne portent **aucune** ligne d'import — signature exacte du
delete-then-insert. Elles sont hors purge.

**Conséquence directe :** 5 de ces 6 liens pointent vers des tags sortants (*Panorama*, *Mer et littoral*,
*Bien-être*, *Produits locaux*, *Boutique*). La garde fail-closed de la migration **fire donc aujourd'hui**,
et c'est voulu : un agent les a posés délibérément, leur sort est un arbitrage métier (lot 5), pas un effet
de bord de migration. C'est la raison technique qui confirme le reséquencement.

Le lot 1 (écrire `created_by`) rend ce raisonnement inutile pour l'avenir : la provenance sera lisible.

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
> 1. **Le fait doit être constatable SUR PLACE.** Le test est l'ancrage, pas le mot : « vue mer depuis la
>    terrasse » est une caractéristique de l'établissement et passe ; « à X minutes de », « proche de » sont
>    de la localisation, qui a déjà ses axes (commune, `object_environment_tag`). C'est cette confusion qui a
>    produit *Mer et littoral* sur des gîtes des hauts du Tampon (import 20260512).
> 2. **Un seul critère éliminatoire : orphelin** — si un axe structuré porte déjà le concept, pas de tag
>    (invariant §196), parce que le doublon produit un filtre qui ment. Sélectivité (~2-25 %) et
>    vérifiabilité sont des **indicateurs** qui orientent la décision, pas des couperets : un tag sur 1 %
>    peut être décisif, et un tag interprétatif est recevable s'il porte une définition écrite.
> 3. **Un candidat récurrent et vérifiable est un SIGNAL DE PROMOTION vers le modèle** (`ref_amenity`,
>    taxonomie, champ dédié), à instruire — coût de la surface ajoutée contre stabilité du concept — et non
>    à promouvoir d'office. Un concept instable ou marginal reste un tag : c'est le rôle de cet axe. Le
>    catalogue doit rester petit, mais un modèle sur-normalisé coûte autant qu'un catalogue qui enfle.
> 4. **La provenance s'écrit à l'écriture.** Tout writer de `tag_link` stampe `created_by` ET
>    `extra.source`. Sans cela, une saisie humaine est indiscernable d'un import, et aucune purge ne peut
>    plus être ciblée sans détruire du travail d'agent (défaut réel, rattrapé avant application en §203).
>
> **Création contrôlée :** un nom normalisé exact ne suffit pas à dédoublonner (`jacuzzy` vs l'équipement
> `Jacuzzi`). Toute création passe par une suggestion à **deux signaux orthogonaux** (trigramme + phonétique,
> dispositif §199) portant sur `ref_tag` **et les catalogues voisins**, avec refus fail-closed **côté RPC** —
> jamais une garde seulement-UI.
