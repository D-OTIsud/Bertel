# Audit — section Filtres de l'Explorer (2026-07-27)

Périmètre : `bertel-tourism-ui/src/components/explorer/FiltersPanel.tsx` (1 505 l.) et sa
chaîne complète — `utils/facets.ts` (payload RPC), `store/explorer-store.ts`,
`components/explorer/explorer-active-chips.ts` (barre de chips),
`components/common/FilterColumnGroup.tsx`, `styles.css`, `api.get_filtered_object_ids`.

Suite de `docs/explorer-filters-audit-2026-07-02.md` (build §153→§162). Audit **technique**
(code + données live), pas une critique de maquette. Aucune modification effectuée.

Données live vérifiées sur la base de prod OTI le 2026-07-27 (840 fiches publiées).

---

## 0. État d'avancement (mis à jour en fin de passe)

| Constat | État |
|---|---|
| §3.1 filtre Label inopérant | **CORRIGÉ** — surface retirée, garde de régression `facets.test.ts` (commit `4672e47`) |
| §3.2 distinctions non applicables aux catégories cochées | **CORRIGÉ** — registre 16n + filtrage front (commit `0606128`) |
| §3.3 champs numériques sans étiquette | **CORRIGÉ** — 8 `aria-label` statiques + 4 dynamiques par métrique |
| §3.4 encadré ambre hors tokens | **CORRIGÉ** — famille `warn`, 12 px |
| §3.5 CSS `.filters-panel` mort | **CORRIGÉ (partiellement)** — bloc §3.5 supprimé, pastilles ITI passées au système local ; *reste* un ensemble plus large de règles `.filters-panel*` également inertes (voir la note en fin de §3.5) |
| §3.6 compteur « N actifs » ≠ barre de chips | **CORRIGÉ** — compteur dérivé de `buildExplorerActiveChips`, et la barre complétée des 3 critères qui y manquaient (sous-types HOT/VIS/SRV, MICE) |
| §3.13 « Capacités détaillées » (remonté par le PO après coup) | **CORRIGÉ** — liste resserrée aux sous-types cochés + « ajouter un critère » à curseur borné par le corpus (manifest 16o) |
| §3.14 « Groupe d'au moins » (remonté par le PO) | **CORRIGÉ** — min ET max bornés par le corpus ; côté RES, bascule de `max_capacity` (0 ligne) vers `seats` |
| §3.7 à §3.12 | **OUVERTS** |

---

## 1. Score

| # | Dimension | Score | Constat principal |
|---|-----------|-------|-------------------|
| 1 | Accessibilité | 2/4 | ~8 champs numériques (+2 par métrique de capacité) étiquetés par `placeholder` seul |
| 2 | Performance | 3/4 | Zéro mémoïsation : le catalogue hébergement est reconstruit à chaque frappe et à chaque changement de store |
| 3 | Responsive | 3/4 | Pas de largeur figée, mobile géré par bascule de panneau ; cibles tactiles 26-28 px |
| 4 | Theming | 2/4 | Un encadré en `amber-*` brut alors que la famille `warn` existe ; bloc CSS `.filters-panel` **mort** |
| 5 | Anti-patterns | 2/4 | Aucun tell « IA », mais **5 systèmes de pastilles** et **3 idiomes de dépliage** dans une colonne de 320 px |
| **Total** | | **12/20** | Acceptable — travail significatif requis |

Hors grille : **1 filtre silencieusement inopérant en production** (P0, §3.1) et **1 sélecteur
qui propose 33 distinctions sans tenir compte des catégories cochées** (P1, §3.2 — remonté par
le PO ; c'est un manque dans le modèle, pas dans l'UI).

---

## 2. Verdict anti-patterns : ce n'est pas du slop, c'est de la sédimentation

Aucun tell d'interface générée : pas de texte en dégradé, pas de glassmorphism, pas de
grille de cartes identiques, pas de bandeau latéral coloré, pas de hero-metric. Les tokens
sont utilisés partout, la copy est écrite (pas de titre reformulé), les états vides sont
honnêtes (« Catalogue de sous-catégories indisponible » vs « Chargement… », §155-bis).

Le défaut d'harmonie signalé est réel mais il a une **cause structurelle** : le panneau a été
étendu en dix passes (§152 → §192) et chaque passe a apporté son propre vocabulaire visuel
sans retirer le précédent. L'inventaire exact, mesuré sur le fichier :

**5 systèmes de pastille pour le même geste « choisir dans une liste »**

| Système | Métriques | Utilisé par |
|---|---|---|
| `bucketChipClass` (l. 336) | 28 px, r8, 12 px **semibold**, actif = teal plein | Catégorie, Statut, types de handicap, aménagements, axes durables, actions |
| `taxonomyChipClass` (l. 360) | 26 px, r8, 12 px **medium** | Sous-catégories, catalogue hébergement sémantique |
| `typeRowClass` (l. 413) | rangée pleine largeur + fausse case à cocher | Types HOT / VIS / SRV |
| `.chip` global (styles.css l. 1673) | r**6**, padding .4/.7rem, **font-size hérité (16 px)** | Type de parcours, Difficulté, Pratiques (section Itinéraires) |
| pastille de tag (l. 1023) | r6, 12 px semibold, couleur **inline** | Tags sélectionnés |

Le 4ᵉ est le plus visible : la section Itinéraires affiche des pastilles nettement plus
grandes que tout le reste, parce que l'override compact `.explorer-workspace .filters-panel .chip`
ne s'applique plus (§3.4).

**3 idiomes de dépliage**, tous les trois visibles dans un même écran :
`FilterColumnGroup collapsible` (chevron à droite, badge de compte), les disclosures maison
du catalogue hébergement (chevron **à gauche**, badge teal arrondi, l. 568/668), et
`<details>/<summary>` natif avec triangle navigateur (« Capacités détaillées », MICE,
l. 1163/1205/1274).

**3 affordances pour « sélection multiple »** : pastilles `aria-pressed`, cases à cocher
natives (liste des labels, l. 971), et `FilterDropdown` multi (Ville, Tags, Cadre, Services).

**4 niveaux de libellé** dans une colonne étroite : 11 px majuscules `tracking-.08em` (groupe),
12 px semibold `ink-2` (sous-titre), 11 px medium `ink-3` (sous-titre de type, l. 1329),
10 px majuscules `tracking-wide` (axe, l. 598). Aucun ne domine : la hiérarchie est plate.

**Échelles ouvertes** : 4 tailles de texte déclarées (10/11/12/13) + le 16 px hérité des
`.chip` = 5 ; **6 rayons** (4, 6, 8, 9, `full`, `md`) ; **10 valeurs d'espacement**
(`gap-1`, `gap-1.5`, `gap-2`, `mb-1`, `mb-1.5`, `mb-2`, `space-y-2`, `space-y-2.5`,
`space-y-3`, `space-y-4`). Le rythme vertical est uniforme entre groupes (`py-3.5` partout)
mais aléatoire à l'intérieur.

---

## 3. Constats par sévérité

### 3.1 [P0] Le filtre « Label » ne filtre rien en production

**Localisation** : `utils/facets.ts:400-585` (`buildBucketRpcFilters`), `utils/facets.ts:587-626`
(`applyFrontendOnlyExplorerFilters`), `FiltersPanel.tsx:965-983`,
`explorer-active-chips.ts:125-127`, `ResultCardView.tsx:114-123`.
**Catégorie** : correctness (hors grille 5-dimensions).

`common.labelsAny` a toute la panoplie d'un filtre vivant : cliquable depuis les pastilles de
label des cartes résultats, synchronisé dans l'URL (`?labels=`), compté par
`activeFilterCount` (l. 260) et par le badge du groupe « Labels & certifications » (l. 311),
rendu en cases cochées avec un bouton « Effacer les labels », et présent dans la barre de
chips actives (`Label · X`).

**Aucune de ces surfaces n'a d'effet sur les résultats.** `buildBucketRpcFilters` n'émet
aucune clé `labels_any` — et `api.get_filtered_object_ids` n'en connaît aucune (seul
`label_scheme_ranked`, qui est l'autre filtre, le sélecteur « Distinctions », existe). Le seul
consommateur de `labelsAny` est `applyFrontendOnlyExplorerFilters`, appelée depuis un unique
site : `src/data/mock.ts:622`, c'est-à-dire **le chemin démo**. En mode live
(`rpc.ts:161` : `if (session.demoMode || !client)`) la fonction n'est jamais atteinte.

Symptôme utilisateur : cliquer un label sur une carte ajoute une chip, incrémente le compteur
« N actifs »… et la liste ne bouge pas d'une ligne.

`hasServerOnlyFilters` (facets.ts:235) n'inclut pas `labelsAny` non plus — cohérent avec le
fait que personne ne l'applique, mais cela confirme que l'oubli est ancien, pas un régression
récente.

**Recommandation** — deux issues seulement, pas de demi-mesure :
1. Câbler une clé `labels_any` dans le RPC (les libellés viennent de
   `cached_classification_codes` / `object_classification`, la matière existe), ou
2. Retirer entièrement la surface (pastilles cliquables des cartes, bloc du panneau, chips,
   compteur, paramètre d'URL) et laisser « Distinctions » (`label_scheme_ranked`) porter seul
   le besoin — il est plus riche (rang, équivalences §173, niveaux §174).

L'option 2 est la plus courte et probablement la bonne : « Distinctions » couvre déjà le cas
d'usage, et deux filtres de label côte à côte dont un seul fonctionne est précisément la
confusion à supprimer. C'est une décision produit, pas technique.
**Commande suggérée** : `/impeccable harden`.

### 3.2 [P1] Le sélecteur « Distinctions » ignore les catégories sélectionnées

**Localisation** : `FiltersPanel.tsx:303` (`rankedLabelOptions = references?.rankedLabelSchemes`),
`FiltersPanel.tsx:917-934` (le groupe entier), `services/explorer-reference.ts:558-562` (la
requête catalogue).
**Catégorie** : Anti-pattern / pertinence — signalé par le PO.

Le groupe « Labels & certifications » est rendu **inconditionnellement**, entre « Localisation »
et « Tags », donc **au-dessus** des sections type-spécifiques. Son sélecteur liste les
**33 schemes** `is_distinction = true`, sans aucun égard pour les buckets cochés. Avec la seule
catégorie *Visites* sélectionnée, l'utilisateur se voit proposer :

> Classement hôtelier · Classement camping · Classement meublés · Classement résidence de
> tourisme · Classement village de vacances · Classement auberge collective · Classement parc
> résidentiel de loisirs · Gîtes de France (épis) · Clévacances (clés) · Logis · Clef Verte ·
> Écolabel européen – hébergement touristique …

Aucun ne peut produire un résultat sur une fiche VIS. Symétriquement, les quatre schemes qui
concernent *réellement* une visite (Monument Historique, Musée de France, Jardin Remarquable,
Maison des Illustres) sont noyés au milieu de la liste sous le même groupe `quality_label`.
Le sélecteur est searchable, mais il faut déjà savoir quoi chercher.

Le problème est **structurel, pas cosmétique** : `ref_classification_scheme` (12 colonnes,
vérifiée en live) ne porte **aucune applicabilité par type d'objet**, et il n'existe pas de
table `ref_classification_scheme_applicability`. Le front ne peut donc rien filtrer — la
donnée n'existe pas. C'est le même vide que `ref_facet_registry` / `ref_facet_applicability`
comble pour les facettes type-spécifiques (invariant CLAUDE.md « Type→facet applicability —
single registry ») ; les distinctions n'ont jamais eu leur registre.

**Trois options, par ordre de justesse :**

1. **Registre d'applicabilité (recommandé)** — `ref_classification_scheme_applicability
   (scheme_id, object_type)`, seedé selon la règle métier (un classement hôtelier ne concerne
   que HOT, un classement camping que CAMP/HPA, Monument Historique que PCU/VIS…), exposé dans
   le payload de références, consommé par le panneau : la liste se réduit aux schemes
   applicables à l'union des types des buckets cochés ; **aucun bucket coché ⇒ liste complète**
   (pas de sélection = pas de contrainte, cohérent avec le reste du panneau). Aligné sur
   l'architecture existante, réutilisable par l'éditeur §08 (qui souffre du même problème :
   il propose aujourd'hui les 33 schemes sur n'importe quel type de fiche) et par le calcul de
   complétude §99. C'est un seed + une colonne, pas une refonte.
2. **Dérivation par la donnée** — un scheme est proposé si ≥1 objet publié de ce type le porte
   en `granted`. Gratuit (agrégat au chargement des références), mais **contraire au principe
   §150** (« un filtre existe parce que le concept existe dans le modèle, jamais gaté sur les
   données ») : un musée éligible à Clef Verte mais non encore labellisé rendrait le scheme
   invisible, donc non saisissable — la donnée manquante se perpétuerait.
3. **Regroupement seul** — garder les 33 mais préfixer les groupes du sélecteur par le domaine
   (« Hébergement — Classement hôtelier »). Palliatif d'une heure ; ne supprime pas le ridicule
   signalé, il l'organise.

Effet de bord favorable de l'option 1 : le groupe « Labels & certifications » devient vide pour
un bucket sans distinction applicable, et peut alors se masquer — une section de moins dans la
colonne, ce qui sert directement le §3.10.
**Commande suggérée** : `/impeccable shape` (la décision de modèle d'abord), puis
`/impeccable harden`.

### 3.3 [P1] Champs numériques étiquetés par `placeholder` seul

**Localisation** : `FiltersPanel.tsx:1208-1239` (MICE ×4), `1425-1460` (Distance ×2, Durée ×2),
`1173-1195` et `1284-1306` (capacités détaillées, 2 par métrique).
**Catégorie** : Accessibilité — **WCAG 2.2 AA 3.3.2 (Labels or Instructions) et 4.1.2**.

Huit champs statiques plus deux par métrique de capacité n'ont ni `<label>`, ni `aria-label`,
ni `aria-labelledby`. Le `<strong>{metric.name}</strong>` qui précède la paire Min/Max
(l. 1167) n'est pas associé programmatiquement : un lecteur d'écran annonce « Min, zone de
saisie » sans savoir de quelle métrique il s'agit — et `placeholder` disparaît dès la première
frappe, y compris visuellement pour un utilisateur en surcharge cognitive.

Le panneau **sait** faire : `aria-label="Capacité d'accueil minimale en personnes"` (l. 1158),
`aria-label="Événements à partir du"` (l. 1356), `<label className="sr-only">` sur la recherche
hébergement (l. 632). C'est un oubli local, pas une absence de culture a11y.

**Recommandation** : `aria-label` explicite sur les 8 champs statiques ;
`aria-label={`${metric.name} — minimum`}` sur les paires dynamiques.
**Commande suggérée** : `/impeccable harden`.

### 3.4 [P1] Encadré d'avertissement hors système de tokens

**Localisation** : `FiltersPanel.tsx:712-714`.
**Catégorie** : Theming.

```
border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] text-amber-900
```

C'est la **seule** couleur codée en dur du fichier (tout le reste passe par
`ink/surface/line/teal/orange`). La famille sémantique existe pourtant déjà dans
`tailwind.config.js:65-70` : `warn.bg` / `warn.border` / `warn.ink`, adossée à
`--warn-bg: #fbf0dd` / `--warn-ink: #7a4e12` (contraste ≈ 6,0:1 documenté dans `styles.css:102`).
Conséquence concrète : sous un thème par ORG (§172, qui surcharge `--surface`, `--line`, les
5 couleurs de marque), cet encadré reste figé en ambre Tailwind — il « sort » du panneau.

Le texte est en outre en **10 px**, la plus petite taille du panneau, pour un message
d'avertissement — l'inverse de la hiérarchie attendue.

**Recommandation** : `border-warn-border bg-warn-bg text-warn-ink`, taille 12 px.
**Commande suggérée** : `/impeccable colorize` puis `/impeccable polish`.

### 3.5 [P1] Bloc CSS mort : la compaction voulue ne s'applique jamais

**Localisation** : `styles.css:8419-8452` ; classe racine attendue absente de
`FiltersPanel.tsx:830`.
**Catégorie** : Theming / Anti-pattern.

`.explorer-workspace` **est** posée (`ExplorerPage.tsx:141`), mais `.filters-panel` **ne l'est
plus** depuis la refonte §142. Toutes les règles descendantes sont donc inertes :

- `.explorer-workspace .filters-panel .chip` (min-height 28 px, font-size .85rem) → **la seule
  raison pour laquelle les pastilles ITI sont plus grosses que les autres** ;
- `.explorer-workspace .filters-panel .switch-row` (`align-items: center`) → les quatre
  interrupteurs « Accessibilité (PMR) / Démarche durable / Animaux / Ouvert maintenant »
  héritent du `align-items: flex-start` de base (`styles.css:1729`) ;
- `.filters-panel__content`, `.filters-panel__subsection`, `.filters-panel__reset` (qui code en
  dur `#b34b3d`) → jamais atteintes.

Les enfants BEM autonomes (`.filters-panel__metric-stack`, `__metric-row`, `__range-grid`)
sont, eux, bien vivants : le nettoyage doit être chirurgical, pas un `DELETE` du bloc entier.

**Recommandation** : supprimer les règles descendantes mortes et porter l'intention en local
(la section ITI passe de `.chip` à `taxonomyChipClass` / `bucketChipClass`), ce qui résout du
même geste le 4ᵉ système de pastille du §2. Une pastille de moins, ~30 lignes de CSS en moins.
**Commande suggérée** : `/impeccable distill`.

> **Fait le 2026-07-27**, chirurgicalement : bloc `styles.css:8419-8452` supprimé (avec un
> commentaire qui dit pourquoi), les 3 groupes ITI passés à `bucketChipClass`, et les enfants
> BEM autonomes réellement utilisés (`__metric-stack`, `__metric-row`, `__range-grid`)
> conservés.
>
> **Reste à traiter (même cause, périmètre plus large)** : `.filters-panel` n'étant posée nulle
> part, d'AUTRES règles sont également inertes — `styles.css:1863-1935`
> (`__section`, `__section-header`, `__section-heading`, `__section-body`, `__subsection`,
> `__toggle-group`…), plus les occurrences aux lignes ~1265, 1288, 1565, 1857, 7671, 7725,
> 8053, 8339, 8571, 8757, et les descendants `.dashboard-filters-sidebar .filters-panel__*`
> (~9985-10007). Non touchées ici parce qu'un balayage en bloc sort du périmètre de ce
> constat et demande de vérifier surface par surface qu'aucune n'est réellement appliquée
> ailleurs. À faire dans une passe `/impeccable distill` dédiée.

### 3.6 [P1] Le compteur « N actifs » contredit la barre de chips

**Localisation** : `FiltersPanel.tsx:243-280` vs `explorer-active-chips.ts:78-298`.
**Catégorie** : Accessibilité / cohérence (l'invariant §152 vise exactement ce cas :
« sinon les deux compteurs co-visibles se contredisent »).

Trois divergences vérifiées :

| Filtre | `activeFilterCount` | Barre de chips |
|---|---|---|
| Buckets sélectionnés | **1** quel que soit le nombre (l. 245) | **1 chip par bucket** |
| Statuts sélectionnés | **1** quel que soit le nombre (l. 262) | **1 chip par statut** |
| `rankedLabelValueCodes` (niveaux GradeBar §174) | **0** — non compté | **1 chip** `Niveau · N sélectionnés` |
| `rankedLabelIncludeEquivalents = false` (§173) | **0** — non compté | **1 chip** `Label obtenu uniquement` |

Trois buckets + deux statuts + un niveau affichent « 2 actifs » au-dessus de 6 chips.

**Recommandation** : dériver le compteur **de** `buildExplorerActiveChips(filters).length` —
une seule source, plus de dérive possible. La fonction est déjà pure et testée.
**Commande suggérée** : `/impeccable harden`.

### 3.7 [P2] Descriptions livrées uniquement par `title` + `aria-description`

**Localisation** : `FiltersPanel.tsx:538` (nœuds taxonomiques), `572` (`aria-description`),
`585-591` (icône Info), `755` (aménagements), `790`/`815` (durabilité).
**Catégorie** : Accessibilité.

Les descriptions métier (définition d'une nature d'hébergement, source réglementaire, ancien
vocabulaire Berta) ne sont exposées que par l'attribut `title` : invisible au clavier,
inaccessible au tactile, non lu de façon fiable par les lecteurs d'écran. L'icône Info
(l. 585) est `aria-hidden="true"` et non focusable — c'est une **affordance visuelle qui
promet une information inatteignable**.

`aria-description` (l. 572) est un brouillon ARIA 1.3 sans support navigateur généralisé :
utiliser `aria-describedby` pointant sur un nœud réel.

**Recommandation** : un `Tooltip` déclenché au survol **et** au focus, avec
`aria-describedby`. Le composant existe-t-il déjà dans `components/ui/` ? Si oui, réutiliser.
**Commande suggérée** : `/impeccable harden`.

### 3.8 [P2] Recalcul intégral du catalogue hébergement à chaque rendu

**Localisation** : `FiltersPanel.tsx:468-718` (`renderAccommodationTaxonomy`), plus
`290-302` (`visibleAccessibilityAmenities`, `visibleSustainabilityActions`).
**Catégorie** : Performance.

Aucun `useMemo` dans le composant. `renderAccommodationTaxonomy()` refait à **chaque** rendu :
filtrage des domaines HOT, `flatMap` sur tous les nœuds, construction de 2 `Map`, `sort` des
codes de famille, puis pour chaque famille un `filter` + un `sortAccommodationNodes` (tri
`localeCompare` fr). Le composant se re-rend à chaque frappe du champ de recherche
hébergement **et** à chaque changement du store Explorer (tout toggle de filtre).

Ce n'est pas un blocage au volume actuel, mais la frappe dans le champ de recherche est le
chemin le plus chaud du panneau et c'est celui qui paie le plus.

**Recommandation** : `useMemo` sur `entries` / `familyCodes` (dépendance : `references`) en
séparant la projection catalogue — stable — du filtrage par requête — volatil.
**Commande suggérée** : `/impeccable optimize`.

### 3.9 [P2] Dérive de libellé « Distinctions » vs chip « Classé · »

**Localisation** : `FiltersPanel.tsx:920-923` vs `explorer-active-chips.ts:115`.
**Catégorie** : Anti-pattern (copy).

§175 a renommé le sélecteur en « Distinctions » avec une justification explicite en commentaire :
« le mot *classement* est réservé au classement officiel de l'État ». La chip correspondante dit
toujours `Classé · Gîtes de France`. Le renommage n'est allé qu'à mi-chemin — exactement la
dérive que §175 voulait supprimer.

**Recommandation** : `Distinction · X`.
**Commande suggérée** : `/impeccable clarify`.

### 3.10 [P2] Cinq systèmes de pastille / trois idiomes de dépliage

Détaillé au §2. Ce n'est pas un point isolé mais **le** constat UI/UX du panneau.

**Recommandation** : réduire à **deux** systèmes de pastille (un pour la sélection primaire =
`bucketChipClass`, un pour la sélection secondaire dense = `taxonomyChipClass`, la pastille de
tag restant à part parce qu'elle porte une couleur métier), **un** idiome de dépliage
(`FilterColumnGroup` partout, y compris pour « Capacités détaillées » et MICE — supprime les
deux `<details>` natifs), **trois** tailles de texte (11 px majuscules = groupe, 12 px = corps,
13 px = interrupteurs), **deux** rayons (8 px et `full`). Extraire les deux pastilles retenues
dans `components/ui/` : le Dashboard consomme le même panneau (`DashboardPage.tsx:67`) et en
bénéficie sans travail supplémentaire.
**Commandes suggérées** : `/impeccable extract` puis `/impeccable layout`.

### 3.11 [P3] Flag mort `ENABLE_SEMANTIC_ACCOMMODATION_LAYOUT`

**Localisation** : `FiltersPanel.tsx:58`, utilisé l. 1136-1138.

Constante `true` en dur : la branche `false` est inatteignable. Le repli utile
(`renderAccommodationTaxonomy() ?? renderTypeTree(...)`) est porté par le `??`, pas par le flag
— le ternaire est donc du bruit.

**Recommandation** : supprimer la constante et le ternaire, garder le `??`.
**Commande suggérée** : `/impeccable distill`.

### 3.12 [P3] Le bouton « Réinitialiser » est toujours actif

**Localisation** : `FiltersPanel.tsx:836-838`. À 0 filtre actif il reste pleinement coloré
(`text-orange-2`) et cliquable pour un no-op. Le compteur juste à côté affiche déjà l'état :
désactiver le bouton à 0 est gratuit et honnête.

---

## 4. Constats données live (informatif, pas des bugs)

Vérifié sur la prod OTI (840 fiches publiées). Le principe §150 — *un filtre existe parce que
le concept existe dans le modèle, jamais parce que la donnée est là* — reste la règle ; ces
chiffres servent à calibrer les attentes, pas à masquer des filtres.

| Surface | Matière publiée | Effet |
|---|---|---|
| Bucket **Itinéraires** (parcours, difficulté, distance, durée, pratiques) | **0 ITI publié**, 0 ligne `object_iti_practice` | Toute la section renvoie 0 |
| Bucket **Événements** (type, dates) | **0 FMA publié** | Idem |
| Séminaires & réunions (MICE) | **0 ligne `object_meeting_room`** publiée | Idem (replié par défaut, bon choix) |
| Animaux acceptés | **2 fiches** `object_pet_policy` | ≤ 2 résultats (était 0 en juillet) |
| Aménagements d'accessibilité `acc_*` | **3 lignes** tous statuts confondus | Quasi inexploitable ; le bras label T&H (§162, 4 grants) porte le filtre |
| Groupe d'au moins… (HEB) | **551** `max_capacity` publiés | Sain |
| Groupe d'au moins… (RES) | **89** `seats` publiés | Sain |
| Cadre & environnement | **777 / 840** | Sain |
| Services & équipements | **748 objets**, 15 familles | Sain |
| Tags | **813 objets**, 17 tags | Sain |
| Lieu-dit | **80** valeurs distinctes | Sain |
| Démarche durable | **20 objets** | Étroit mais réel |

Les trois premières lignes signifient qu'un utilisateur qui coche « Itinéraires » ou
« Événements » obtient une liste vide **sans explication**. Ce n'est pas un bug de filtre, mais
un état vide qui mérite sa copy (« Aucun itinéraire publié pour l'instant » plutôt qu'un
« 0 résultat » nu). Voir `/impeccable onboard`.

---

## 5. Ce qui fonctionne bien (à préserver)

- **`FilterColumnGroup` est exemplaire** : préfixe `sr-only "Section "` pour distinguer le
  disclosure de la chip de bucket homonyme, suffixe `sr-only "critères actifs"` pour que le
  badge ne soit pas un nombre nu, `aria-expanded` + `aria-controls` corrects. C'est le niveau
  que le reste du panneau devrait atteindre.
- **États vides honnêtes** : « Catalogue de sous-catégories indisponible » (références chargées)
  vs « Chargement du catalogue… » (§155-bis) — pas de spinner menteur.
- **Gardes anti-combinaison-vide** : cascade bucket → sous-filtres (D23), purge des
  sous-catégories au retrait d'un type (§155-bis), ré-inclusion automatique d'un type quand on
  coche une de ses sous-catégories, réordonnancement min/max (§156), exclusivité
  `openNow` ⊕ `openAt` (§157). Le panneau ne produit jamais silencieusement un ensemble vide
  par contradiction interne.
- **Discipline de tokens** : un seul écart sur ~1 500 lignes (§3.3).
- **Aucune animation de propriété de layout**, aucun effet coûteux.
- **Couverture de tests** : 18 tests sur `FiltersPanel.test.tsx` + la variante Dashboard.
  Point aveugle : aucun test n'assert qu'un filtre **filtre** (§3.1 serait passé au travers).

---

## 6. Plan d'action

| Ordre | Sévérité | Action | Commande |
|---|---|---|---|
| 1 | P0 | Trancher le sort de `labelsAny` : câbler `labels_any` au RPC **ou** retirer les 6 surfaces | `/impeccable harden` |
| 2 | P1 | Registre d'applicabilité des distinctions par type d'objet, puis filtrage du sélecteur | `/impeccable shape` |
| 3 | P1 | `aria-label` sur les 8 champs numériques statiques + les paires de métriques | `/impeccable harden` |
| 4 | P1 | Compteur « N actifs » dérivé de `buildExplorerActiveChips` | `/impeccable harden` |
| 5 | P1 | Encadré ambre → famille `warn` | `/impeccable colorize` |
| 6 | P1 | Nettoyer les règles `.filters-panel` mortes + basculer les pastilles ITI en local | `/impeccable distill` |
| 6b | P2 | Réduire à 2 pastilles / 1 dépliage / 3 tailles / 2 rayons, extraits dans `components/ui/` | `/impeccable extract`, puis `/impeccable layout` |
| 7 | P2 | Tooltip focusable + `aria-describedby` à la place de `title` / `aria-description` | `/impeccable harden` |
| 8 | P2 | `useMemo` sur la projection du catalogue hébergement | `/impeccable optimize` |
| 9 | P2 | Chip « Distinction · » au lieu de « Classé · » | `/impeccable clarify` |
| 10 | P3 | Flag mort, bouton Réinitialiser désactivé à 0 | `/impeccable distill` |
| 11 | — | Copy d'état vide pour les buckets sans matière publiée (ITI, EVT) | `/impeccable onboard` |
| 12 | — | Passe finale | `/impeccable polish` |

L'action 5 et l'action 6 se recouvrent : faire 5 en premier fait disparaître un système de
pastille sur cinq presque gratuitement.

### 3.13 [P1] « Capacités détaillées » : liste au périmètre du bucket, et 6 métriques sans donnée

**Localisation** : `services/explorer-reference.ts` (`bucketCapacityOptions`), `FiltersPanel.tsx`
(les deux blocs `<details>` HÉB et RES).
**Catégorie** : Anti-pattern / pertinence — remonté par le PO après la première passe.
**État** : **CORRIGÉ** (manifest 16o).

Le tiroir empilait une paire Min/Max par métrique, avec deux défauts superposés.

**a) La liste était calculée pour le BUCKET, pas pour les types cochés.** `ref_capacity_applicability`
porte pourtant la donnée par type — `pitches`/`campers`/`tents` → CAMP, HPA ; `bedrooms` → HOT,
HLO, RVA. Mais `bucketCapacityOptions('HOT', …)` unionne HOT∪HLO∪HPA∪CAMP∪RVA, donc chercher un
hôtel proposait « Emplacements », « Camping-cars », « Tentes » et « Véhicules ».

**b) Dix des douze métriques n'ont aucune donnée.** Vérifié sur la prod : seules `max_capacity`
(551 fiches) et `seats` (89) portent des lignes. `beds`, `bedrooms`, `standing_places`, `pitches`,
`campers`, `tents`, `vehicles`, `bikes`, `meeting_rooms`, `floor_area_m2` sont à **zéro ligne**,
tous statuts confondus. Et `max_capacity` est déjà le contrôle principal rendu juste au-dessus
(« Groupe d'au moins… »). Pour un hôtel, le tiroir affichait donc 6 contrôles sans effet possible
plus un doublon.

**Correctif livré :**

- la liste suit les **sous-types cochés** (`filterOptionsByObjectTypes`, la primitive de 16n
  généralisée aux types) — Hôtel seul ⇒ Lits, Chambres, Surface ; Camping ⇒ Emplacements,
  Camping-cars, Tentes, Véhicules ;
- on **ajoute un critère** au lieu de tous les afficher : la colonne ne porte que ce qui est
  demandé ;
- chaque critère est un **curseur min/max borné par le corpus** (`v_capacity_metric_bounds`,
  vue `security_invoker`, manifest 16o) doublé de deux champs numériques étiquetés — le curseur
  pour explorer, les champs pour préciser et pour rester utilisable au clavier ;
- `max_capacity` sort du tiroir : une seule commande par filtre.

**Ce qui n'a délibérément PAS été fait** : masquer les métriques sans donnée. Le principe §150
tient — la surface de filtre suit le modèle, jamais les données. Une métrique sans bornes reste
proposée, sans curseur, avec la mention « aucune valeur saisie pour l'instant ». À noter pour
la lecture des résultats : l'arme serveur exige une ligne `object_capacity`, donc ajouter un
critère écarte les fiches qui ne renseignent pas cette capacité — ce qui, sur ces 10 métriques,
donne aujourd'hui 0 résultat. C'est le comportement juste, et il est désormais lisible au lieu
d'être une surprise.

### 3.14 [P1] « Groupe d'au moins… » : une seule borne, et une métrique morte côté Restaurants

**Localisation** : `FiltersPanel.tsx` (contrôle vedette des sections HÉB et RES).
**Catégorie** : correctness + pertinence — remonté par le PO.
**État** : **CORRIGÉ**.

Deux problèmes, l'un signalé, l'autre trouvé en vérifiant les données du premier.

**a) Une seule borne.** Le contrôle n'écrivait que `min`. « Un gîte pour au moins 12 » est un
besoin réel, mais « un gîte de 4 à 6 personnes » l'est tout autant, et c'est même le cas
courant : la capacité médiane des meublés est 6, pour une étendue de 2 à 44. Le contrôle
devient un curseur min/max borné par le corpus et resserré sur les sous-types cochés — chercher
un hôtel affiche l'étendue des hôtels (20–87), pas celle de tout l'hébergement. Le libellé passe
à « Capacité d'accueil » : « au moins » ne décrivait plus ce que fait le contrôle.

**b) Côté Restaurants, le contrôle était mort.** Il pointait sur la métrique `max_capacity`,
dont **aucune fiche RES ne porte la moindre valeur** — 0 ligne, tous statuts confondus. Il ne
renvoyait donc jamais rien, quoi qu'on y saisisse : même classe que le filtre Label du §3.1.
Les restaurants renseignent `seats` (89 fiches publiées, 2 à 350 places). Le contrôle y pointe
désormais, et `seats` sort du tiroir détaillé pour ne pas devenir un doublon.

Le couple bucket → métrique vedette vit dans une table unique, `HEADLINE_CAPACITY_METRIC`
(`utils/facets.ts`) : le chargeur de références s'en sert pour exclure la métrique du tiroir
détaillé, le panneau pour la rendre en vedette. Les deux appliquaient la même intention sans
partager de source — c'est ce qui avait laissé `max_capacity` en place côté RES.

**Leçon transposable** : choisir une métrique par son nom générique (`max_capacity` « capacité
maximale ») plutôt que par ce que le type renseigne effectivement produit un contrôle
silencieusement vide. Avant d'exposer une métrique, vérifier qu'elle est portée par les fiches
du type visé.
