# Audit — Section « Filtres » de l'Explorer, de la conception au design

**Date** : 2026-07-02 · **Périmètre** : `FiltersPanel.tsx` + chips actifs + modèle de facettes + catalogues de références + capacités du RPC `get_filtered_object_ids` + couverture réelle des données (base prod OTI, 843 objets dont 362 publiés).
**Méthode** : revue de code, inventaire données live, revue design indépendante (agent), détecteur déterministe d'anti-patterns (résultat : 0 finding visuel — les problèmes sont conceptuels, pas cosmétiques).

---

## 1. Résumé exécutif

Le panneau de filtres est **architecturé pour un catalogue qui n'est pas le vôtre**. Il expose en détail des facettes hôtelières (taxonomie HOT = 7 objets publiés, salles de réunion MICE) et ignore les facettes qui couvrent réellement le corpus : les sous-catégories HLO (171 gîtes/locations), le type de restauration (90/90 restaurants couverts), les équipements (parking 66, terrasse 28…). Le vocabulaire fuit le modèle de données (« Taxonomie HOT », « Sous-types », codes de domaine) alors que **le reste du produit a déjà tranché** : éditeur, dashboard et complétude disent « Sous-catégorie ».

Cinq faits saillants :

1. **« Taxonomie » n'apparaît qu'ici.** Le titre de section vient brut de `ref_code_domain_registry.name` (« Taxonomie HOT »). Partout ailleurs (éditeur §01, dashboard, table de complétude, et même la chip active de l'Explorer !) le produit dit « Sous-catégorie ». Un seul écran est désaligné : celui-ci.
2. **La sous-catégorie est le facet le MIEUX couvert en données** (100 % des objets publiés en portent) **et le moins filtrable** : un seul domaine sur 19 est exposé (`taxonomy_hot`, codé en dur dans `explorer-reference.ts:360`), alors que le RPC serveur accepte `taxonomy_any` pour **tous** les domaines, descendants inclus.
3. **Filtre mort** : « Animaux acceptés » matche 0 objet publié (`object_pet_policy` vide en prod). Il renvoie toujours une liste vide et fait croire à l'utilisateur qu'il n'y a pas de résultats.
4. **Filtre fantôme** : le filtre environnement des Activités (`act.environmentTagsAny`) est câblé store + RPC + compteur « N actifs », mais n'a **aucune UI ni chip** : activé via URL, il filtre les résultats sans aucun moyen de le voir ou de le retirer (hors « Réinitialiser »).
5. **Le bucket Événements n'a aucun filtre de dates** alors que `object_fma` porte `event_start_date`/`event_end_date`/récurrence. Pour des événements, la date est LE filtre n° 1 ; le bucket sera inutilisable dès l'import FMA.

---

## 2. Inventaire de l'existant (panneau desktop, variante colonne)

| Groupe | Contrôles | Source | Couverture données (publiés) |
|---|---|---|---|
| Catégorie | 7 chips (Hébergements, Restaurants, Itinéraires, Activités, Événements, Visites, Services) | buckets = archétypes | HOT≈180 · RES 90 · VIS 53 · ACT 23 · SRV 16 · ITI 0 · EVT 0 |
| Statut (éditeurs) | Publié / Brouillon | `object.status` | 362 / 480 |
| Localisation | Ville (multi), Lieu-dit (mono) | `get_dashboard_filter_options` | bonne |
| Labels & certifications | dropdown « Label recherché » (schémas classés) + labels cliqués depuis les résultats | `ref_classification_scheme` | partielle |
| Tags | uniquement alimenté par clic sur un tag dans les résultats | `ref_tag` | — |
| Accessibilité et services | PMR (+types de handicap, aménagements), Démarche durable (+axes, actions), Animaux acceptés, Ouvert en ce moment | amenities / durabilité / pet_policy / horaires | PMR ok · durable ok · **animaux 0** · horaires 51/90 RES |
| Hébergements (si bucket) | Sous-types (5 chips) · « Taxonomie HOT » (arbre chips) · Capacités min/max (lits, chambres…) · Salles de réunion (4 inputs) | types + `taxonomy_hot` + `object_capacity` + MICE | sous-types ok · **taxonomie : 7 objets** · MICE : niche |
| Restaurants (si bucket) | Capacités min/max : Places assises, Places debout, Capacité max. | `object_capacity` | 65/90 |
| Itinéraires (si bucket) | Boucle/Aller-retour, Difficulté (min/max 1-5), Distance, Durée, Pratiques | `object_iti*` | 0 ITI publié |
| Visites / Services (si bucket) | Sous-types uniquement | types | ok |
| Activités (si bucket) | **rien** (le filtre environnement existe en store/RPC, sans UI) | — | — |
| Événements (si bucket) | **rien** | `object_fma` (dates prêtes) | 0 FMA publié |

---

## 3. Constats de conception

### 3.1 Le mot « taxonomie » — un terme de modèle qui fuit dans l'UI

Le produit a déjà un vocabulaire utilisateur établi, l'Explorer est le seul écran qui l'ignore :

| Surface | Terme affiché |
|---|---|
| Éditeur §01 Identité | « Sous-catégorie » (modal « Choisir une sous-catégorie ») |
| Dashboard, filtres avancés | « Domaine de catégorie » + « Sous-catégories » |
| Table de complétude | « Sous-catégorie » |
| **Chip active de l'Explorer** | « Sous-catégorie héb. » |
| **Panneau de filtres Explorer** | **« Taxonomie HOT »** (nom brut du registre) |

Le même filtre porte donc **deux noms dans le même écran** (panneau vs chip). Règle à retenir : ne jamais rendre un `ref_code_domain_registry.name` tel quel — c'est un nom d'administration de référentiel, pas un libellé utilisateur. (Le dropdown « Domaine de catégorie » du Dashboard a la même fuite : ses options affichent « Taxonomie HOT », « Taxonomie RES »…)

**Recommandation** : libellé contextuel par bucket — « Type d'hébergement », « Type de restauration », « Type d'activité »… Quand le contexte ne suffit pas, « Sous-catégorie » (le terme maison).

### 3.2 Hébergements : trois étages qui se marchent dessus, et le mauvais est détaillé

Le bucket Hébergements empile trois niveaux de « type » :

1. **Bucket** « Hébergements » (l'archétype HEB) ;
2. **« Sous-types hébergement »** = les `object_type` (Hôtels, Hôtellerie plein air, Loisirs hébergés, Campings, Résidences vacances) — du vocabulaire de modèle ;
3. **« Taxonomie HOT »** = l'arbre `taxonomy_hot` (Hôtel boutique, d'affaires, romantique…).

C'est la redondance que tu pointes — et elle est aggravée par les données : `taxonomy_hot` ne s'applique qu'aux 7 hôtels publiés, alors que **171 des ~180 hébergements sont des HLO** dont la taxonomie (`taxonomy_hlo` : Gîte & Villa, Chambre d'hôtes, Location saisonnière, Bulle, Roulotte, Hébergement insolite…) est exactement ce qu'un conseiller cherche… et n'est pas filtrable. Le panneau détaille le segment de 4 % du bucket et ignore les 96 %.

**Recommandation** : un seul groupe « **Type d'hébergement** » = l'union des sous-catégories des 5 domaines HEB (les racines font office de familles). Les « Sous-types » (codes de modèle) disparaissent de l'UI ou deviennent le 1er niveau de l'arbre. Backend : rien à faire (`taxonomy_any` accepte déjà `[{domain, code}]` multi-domaines) ; frontend : élargir le `.in('domain', ['taxonomy_hot'])` et généraliser le rendu.

### 3.3 La sous-catégorie devrait être le filtre par défaut de CHAQUE bucket

19 domaines de taxonomie existent (un par type), 100 % des objets publiés portent au moins un nœud, le RPC filtre déjà descendants inclus. Distribution réelle côté restaurants (`taxonomy_res`, 90/90 couverts) : Restaurant 55 · Table d'hôte 10 · Snack-bar 7 · Restaurant de l'hôtel 5 · Ferme auberge 4 · Pizzeria 2 · Glacier 1… C'est le filtre « type de restauration » attendu, il est prêt, il n'est juste pas branché. Idem `taxonomy_loi` pour les 37 Loisirs du bucket Visites, `taxonomy_act/asc` pour les Activités, `taxonomy_prd` pour les 15 Producteurs.

### 3.4 Filtres morts, fantômes et absents

- **« Animaux acceptés »** : 0 donnée publiée. À masquer (ou griser avec mention) tant que `object_pet_policy` est vide — un filtre qui renvoie systématiquement 0 résultat détruit la confiance dans tout le panneau.
- **Filtre environnement ACT** (`environmentTagsAny`) : compté dans « N actifs », envoyé au RPC, **aucun contrôle ni chip**. Soit le rendre (chips mer/montagne/forêt…), soit le retirer du store et du compteur.
- **Événements sans dates** : `object_fma` porte début/fin/heures/récurrence. Prévoir le groupe « Dates » (Ce week-end · 7 prochains jours · plage libre) avant l'import FMA, sinon le bucket naît inutilisable.
- **Équipements/services génériques absents** : le RPC accepte `amenities_any` (déjà utilisé pour l'accessibilité), et la donnée est là — RES publiés : Parking 66 · Bar 53 · Terrasse 28 · Jardin 27 · Wi-Fi 18 · Climatisation 12 · Piscine 10. Un groupe « Services » par bucket est un quick win à fort usage conseiller. (Au passage, signal qualité d'import : « Équipement randonnée » sur 48 restaurants.)

### 3.5 Pertinence métier : le cas Restaurants (ton exemple)

- **Places assises / debout** : tu as raison, ce n'est pas un filtre de premier rang — mais il a un usage réel OTI (chercher une salle pour un groupe de 40). Couverture correcte (65/90). Verdict : **rétrograder, pas supprimer** — un seul champ « Groupe d'au moins N personnes » derrière une divulgation « Groupes & réceptions », au lieu de 6 inputs Min/Max à nu (assises min/max, debout min/max, capacité max min/max).
- **Horaires** : « Ouvert en ce moment » existe mais est **enterré en 4ᵉ position du groupe « Accessibilité et services »** — un intitulé où personne ne cherche l'ouverture. 51/90 restaurants ont un statut d'ouverture calculé. Verdict : promouvoir en toggle de premier niveau (voire dans la barre au-dessus des résultats), et prévoir l'étape suivante « ouvert le [jour] [midi/soir] » (les données `opening_*` existent, le RPC ne sait faire que l'instantané `open_now` — petite extension SQL à planifier).
- **Filtre n° 1 manquant** : « Type de restauration » (§3.3).

### 3.6 Divers conception

- **Labels & Tags en recall-only** : on ne peut filtrer par label/tag qu'en cliquant une étiquette déjà visible dans les résultats (l'état vide du panneau le dit : « Cliquez une étiquette dans la liste des résultats pour filtrer »). Il faut donc trouver un résultat qui porte le label avant de pouvoir filtrer dessus — l'inverse d'un filtre. Ajouter un picker (catalogue des labels/tags existants), le clic-pour-filtrer restant un raccourci.
- **Statut** : la logique de toggle force silencieusement `published` quand on décoche tout — comportement surprenant, préférer désactiver la dernière option cochée.
- **La variante `panel` est du code mort** : les deux seuls usages de `FiltersPanel` passent `variant="column"` (ExplorerPage.tsx:100 et 196). ~420 lignes (branche l.897-1315 + `FiltersSection`/`FiltersSubsection` + le CSS `.filters-panel__section*`) ne s'exécutent jamais et ont déjà dérivé (« Labels » vs « Labels & certifications »). À supprimer avant toute évolution des filtres.

---

## 4. Matrice cible par bucket (proposition)

Légende : ✅ garder · ✏️ renommer/redessiner · ⬇️ rétrograder (divulgation) · ➕ ajouter · ❌ retirer/masquer.

### Transverse (tous buckets)
| Filtre | Verdict | Détail |
|---|---|---|
| Catégorie (7 buckets) | ✅ | libellés à accentuer (« Hébergements », « Itinéraires », « Événements ») |
| Ville / Lieu-dit | ✅ | RAS — bon filtre conseiller |
| Ouvert maintenant | ✏️➕ | sortir d'« Accessibilité et services », toggle de premier niveau ; étape 2 : « ouvert le… » |
| PMR + détails | ✅ | bon pattern de divulgation ; renommer « Accessibilité » (PMR = sigle) |
| Démarche durable + axes/actions | ✅ | idem, « Actions précises » → « Actions engagées » |
| Animaux acceptés | ❌ (temporaire) | 0 donnée publiée — masquer jusqu'à peuplement de `object_pet_policy` |
| Label recherché (classés) | ✅ | libellé « Label recherché » → « Classement / label » |
| Labels cliqués / Tags | ✏️ | ajouter un vrai picker ; garder le clic-pour-filtrer comme raccourci |
| Statut (éditeurs) | ✅ | corriger le toggle silencieux |
| Sous-catégorie | ➕ | **le** chantier : un groupe « Type de … » par bucket, tous domaines (§3.3) |

### Par bucket
| Bucket (publiés) | Garder | Changer | Ajouter |
|---|---|---|---|
| **Hébergements (≈180)** | capacités (lits/chambres) ⬇️ en « Pour N personnes » | fusionner Sous-types + « Taxonomie HOT » → **Type d'hébergement** (union des 5 domaines HEB, dominé par `taxonomy_hlo` : Gîte, Chambre d'hôtes, Location…) ; Salles de réunion ⬇️ derrière « Groupes & séminaires » | Services (piscine, cuisine équipée… `amenities_any`) |
| **Restaurants (90)** | — | Places assises/debout ⬇️ → un champ « Groupe d'au moins N » ; « Ouvert maintenant » promu | **Type de restauration** (`taxonomy_res`) ; Services (Parking 66, Terrasse 28, Clim 12…) |
| **Itinéraires (0 publié)** | Boucle, Difficulté, Distance, Durée, Pratiques — bon set métier | Difficulté : 5 chips (pas des inputs Min/Max) ; Durée : presets (« < 2 h », « demi-journée », « journée ») ; incohérence « Aller-retour » (panneau) vs « Aller simple » (chip) à trancher | — |
| **Activités (23)** | — | rendre OU retirer le filtre environnement fantôme | **Type d'activité** (`taxonomy_act`/`asc`) |
| **Événements (0, import à venir)** | — | — | **Dates** (Ce week-end / 7 jours / plage) sur `object_fma` — à préparer avant l'import |
| **Visites (53)** | Sous-types (Loisir, Patrimoine, Site naturel, Producteur) | — | **Sous-catégories LOI** (37 objets) + PRD (dégustation, visite de ferme) |
| **Services (16)** | Sous-types | — | rien de plus à ce volume |

---

## 5. Constats de design (panneau lui-même)

_Synthèse des deux évaluations indépendantes (revue design + détecteur). Le détecteur déterministe n'a relevé **aucun** anti-pattern visuel (pas de slop cosmétique) ; tout se joue au niveau structure, vocabulaire et affordances._

### Score de santé design (revue indépendante) — **23/40**

| # | Heuristique | Score | Faille clé |
|---|---|---|---|
| 1 | Visibilité de l'état du système | 3 | « N actifs » + barre de chips = bien ; mais le rétrécissement des sous-types HOT est **compté sans jamais produire de chip**, et les sous-types VIS/SRV ne sont même pas comptés — compteur ≠ barre |
| 2 | Correspondance système / monde réel | 2 | « Loisirs hébergés » pour HLO : un conseiller cherche « Gîte » ; « Cap. théâtre / Cap. classe » = jargon MICE ; « PMR » non expansé |
| 3 | Contrôle et liberté | 3 | Chips retirables + Tout effacer ; mais les chips-compteurs (« Accessibilité · 3 critères ») retirent le groupe ENTIER — impossible d'ôter 1 critère sur 3 depuis la barre |
| 4 | Cohérence et standards | 1 | Le pire poste : accents présents dans les chips/absents du panneau, « Aller-retour » vs « Aller simple », deux idiomes de sélection opposés (buckets vides = tous ; sous-types tout-cochés = tous) |
| 5 | Prévention des erreurs | 2 | min > max possible sur les 8 paires Min/Max, sans message ; difficulté accepte 0 ou 9 au clavier |
| 6 | Reconnaissance plutôt que rappel | 2 | Labels/Tags non ajoutables depuis le panneau ; chips-compteurs qui cachent LESQUELS critères sont actifs |
| 7 | Flexibilité et efficacité | 3 | Dropdown communes searchable + clavier, « ★ Liste dynamique », URL sync ; mais Lieu-dit non searchable |
| 8 | Esthétique et minimalisme | 3 | Colonne plate disciplinée ; alourdie par 4 inputs MICE toujours déployés et les murs de chips taxonomie |
| 9 | Récupération des erreurs | 2 | Bon EmptyState « Aucun résultat » + CTA ; mais `FilterDropdown.loadError` n'est **jamais câblé** → échec de chargement des référentiels = dropdowns silencieusement vides |
| 10 | Aide et documentation | 2 | `title` sur aménagements (bien) ; aucune légende de l'échelle de difficulté (1 = facile ?), aucune aide Min/Max |

**Verdict AI-slop** : pas du slop générique — parti pris réel (colonne plate à filets, tokens maison, chips 28 px, divulgation progressive PMR/durable, empty-states honnêtes). Deux odeurs de génération pressée : la variante `panel` **morte** (~420 lignes jamais exécutées — les deux seuls usages passent `variant="column"`, ExplorerPage.tsx:100/196) et la grille Min/Max copiée-collée 8 fois comme réponse par défaut à tout filtre quantitatif, y compris une échelle ordinale 1-5.

**Charge cognitive : 6 échecs / 8 → critique.** Échecs : >4 options à plusieurs points de décision (7 buckets, murs de chips taxonomie, ~22 aménagements) ; hiérarchie visuelle plate (3 niveaux de titres quasi identiques) ; scroll estimé > 2 500 px dans une colonne de 296 px avec HOT+ITI+PMR+durable actifs ; **idiomes de sélection contradictoires** (buckets : rien coché = tous ; sous-types : tout coché = tous ; et tout décocher ⇒ de nouveau tous) ; placeholder-as-label sur tous les inputs numériques (l'étiquette disparaît dès la saisie) ; état par défaut illisible (éditeur : « 0 actifs » alors que Publié+Brouillon et 5 sous-types sont rendus actifs). Réussites : la divulgation progressive PMR→types→aménagements et durable→axes→actions (le meilleur pattern du panneau), et la proximité du compte « N fiches » dans la colonne voisine.

**Parcours conseiller au téléphone (simulés)** :
- « Un resto ouvert maintenant à Saint-Pierre pour 8 personnes » : ~25-45 s, dont la moitié en hésitation — « Ouvert en ce moment » est rangé sous « Accessibilité et services », et « 8 personnes » impose de deviner Min ou Max (il faut Min = 8, rien ne le dit).
- « Un gîte à Cilaos qui accepte les chiens » : **60 s ou échec** — « gîte » n'existe nulle part dans le panneau (il faut savoir qu'un gîte est « Loisirs hébergés »/HLO) ; le blocage est lexical, pas mécanique. Et « Animaux acceptés » renverra 0 résultat (filtre mort, §3.4).

**Ce qui marche (à préserver)** : la divulgation progressive accessibilité/durabilité avec filtrage contextuel des aménagements par type de handicap ; la barre de chips D23 complète et honnête (libellés résolus, retrait unitaire, « ★ Liste dynamique ») ; `FilterDropdown` (portal clampé, recherche insensible aux accents, navigation clavier).

_Note de vérification : la revue indépendante pensait le mot « Taxonomie » non affiché ; vérifié en base — le titre de groupe rendu est bien `ref_code_domain_registry.name` = « Taxonomie HOT » (§3.1)._

### Constats convergents (revue de code)

- **Accents manquants dans tout le panneau** : « Publie », « Hebergements », « Itineraires », « Evenements », « Reinitialiser », « Difficulte », « Duree (h) », « Accessibilite et services », « Demarche durable », « Amenagements precis »… alors que les chips actives sont correctement accentuées (« Publié », « Catégorie », « Démarche durable »). Deux niveaux de qualité de français dans le même écran.
- **Libellés de types incohérents entre surfaces** : `hotSubtypeLabels` (FiltersPanel) vs `TYPE_LABEL` (archetypes.ts) divergent — PCU « Culture » vs « Patrimoine », PNA « Nature » vs « Site naturel », VIL « Villages » vs « Ville », HLO « Loisirs hébergés » vs « Hébergement loisir ». La map locale contient en outre 13 entrées mortes (types hors bucket HOT). Une seule source : `resolveTypeLabel`.
- **Même filtre, deux formulations** : « Ouvert en ce moment » (panneau) vs « Ouvert maintenant » (chip) ; « Aller-retour » (panneau) vs « Aller simple » (chip — contresens, un aller-retour n'est pas un aller simple).
- **Affordances numériques faibles** : Difficulté 1-5 en deux inputs number ; capacités en batteries de Min/Max ; MICE en 4 inputs à nu avec placeholders tronqués (« Cap. theatre min »).
- **Indentation d'arbre cassée** : les nœuds de taxonomie sont indentés par `margin-left: depth × 0.5rem` sur des chips en `flex-wrap` — dès que la ligne wrappe, l'indentation ne signifie plus rien.
- **Pas de divulgation progressive au niveau groupe** : `FilterColumnGroup` n'est pas repliable ; bucket Hébergements ouvert = très long scroll. Le Dashboard a déjà le pattern « Filtres avancés » repliable.
- **États vides qui parlent système** : « Les aménagements seront proposés dès que le référentiel sera chargé » — « référentiel » est du vocabulaire d'administrateur de données.
- **Compteur « N actifs » sans « N résultats »** : le panneau compte les filtres, pas les résultats ; aucun feedback de volume par option (facet counts) pour guider le choix. Le compteur ment par ailleurs deux fois : un dessin de zone compte 2 (polygon + bbox), et le rétrécissement des sous-types compte 1 sans chip correspondante (VIS/SRV rétrécis : ni compté ni chipé).
- **Pas de garde min ≤ max** sur les 8 paires Min/Max ; placeholders en guise d'étiquettes (le contexte disparaît dès la saisie).
- **`FilterDropdown.loadError` jamais alimenté** par le panneau : un échec de chargement des référentiels donne des dropdowns silencieusement vides (« Toutes les communes » sans aucune option).
- **Accessibilité (a11y)** : `aria-pressed` présent sur statuts/switchs mais absent des chips de buckets et de sous-types — l'état actif teal n'est pas annoncé aux lecteurs d'écran là où ça compte le plus ; « Tout effacer » n'apparaît qu'à partir de 2 chips ; bouton « Réinitialiser » stylé hors tokens (`#b34b3d`).

---

## 6. Plan d'action priorisé

**P0 — confiance & honnêteté (petits diffs)**
1. Masquer « Animaux acceptés » tant que la donnée est vide (ou l'assortir d'un compte).
2. Supprimer le filtre fantôme environnement ACT du compteur/RPC **ou** lui donner une UI + chip.
3. Trancher la contradiction « Aller-retour » (panneau) / « Aller simple » (chip) pour `is_loop=false` avec le métier — c'est de la désinformation terrain sur un produit rando — et partager la constante.
4. Passe d'accents + unification des libellés dupliqués : supprimer `hotSubtypeLabels`, dériver de `TYPE_LABEL`/`resolveTypeLabel` (source unique) ; « Ouvert maintenant » partout ; envisager de renommer HLO « Gîtes & meublés » dans `TYPE_LABEL` (validation métier) — « gîte » doit devenir trouvable.

**P1 — le chantier demandé : sous-catégories par bucket**
5. Renommer « Taxonomie X » → « Type de … » (et corriger le dropdown Dashboard « Domaine de catégorie »).
6. Élargir le chargement des domaines (`explorer-reference.ts`) à tous les buckets et rendre le groupe génériquement ; fusionner Sous-types + taxonomie dans Hébergements (§3.2). Backend prêt (`taxonomy_any`).
7. Ajouter « Type de restauration » (RES) et « Type d'activité » (ACT) — mêmes mécaniques.
8. Difficulté ITI : 5 chips ou segmenté Facile/Moyen/Difficile (l'échelle 1-5 en deux inputs numériques libres est une affordance fausse) ; garde min ≤ max sur les paires restantes.

**P2 — pertinence métier & cohérence d'état**
9. Promouvoir « Ouvert maintenant » hors du groupe Accessibilité ; rétrograder les capacités en « Groupe d'au moins N » ; MICE derrière divulgation « Groupes & séminaires » avec vraies étiquettes (pas des placeholders).
10. Groupe « Services » (amenities) pour RES/HEB.
11. Picker Labels/Tags.
12. Idiome de sélection des sous-types aligné sur les buckets (vide = tous, chips inactives par défaut) + chip « Sous-type · X » dans la barre + compter VIS/SRV ; ne compter le dessin de zone qu'une fois.

**P3 — design & dette**
13. Supprimer la variante `panel` morte (~420 lignes) ; presets de durée ITI ; indentation d'arbre réelle (liste, pas chips wrappées) ; groupes repliables ; `aria-pressed` sur toutes les chips ; câbler `loadError` des dropdowns ; facet counts (« Restaurants (127) », « Ouvert maintenant (43) ») — le markers RPC prouve que l'agrégat est abordable.
14. Préparer le groupe Dates Événements avant l'import FMA (extension RPC ; le modèle est prêt).

---

## 7. Annexes — données d'appui (prod, 2026-07-02)

- Objets : 480 draft · 362 publiés · 1 archivé. Publiés par type : HLO 171 · RES 90 · LOI 37 · ACT 23 · PRD 15 · PSV 10 · HOT 7 · COM 4 · CAMP 2 · PCU 1 · SPU 1 · ORG 1.
- Taxonomie : 19 domaines dans le registre ; 100 % des publiés portent ≥ 1 nœud ; seul `taxonomy_hot` est exposé dans l'Explorer (`explorer-reference.ts:360`).
- `taxonomy_res` sur RES publiés : Restaurant 55 · Table d'hôte 10 · Snack-bar 7 · Restaurant de l'hôtel 5 · Ferme auberge 4 · Pizzeria 2 · Chambre d'hôte 2 · Auberge 2 · Salle de réception 1 · Glacier 1 · Auberge de campagne 1.
- Capacités : `seats`/`standing_places` applicables à RES, PCU, ASC, LOI, FMA, SPU, PRD ; couverture RES 65/90.
- Horaires : `cached_is_open_now` non nul — RES 51/90 · LOI 16/37 · PRD 10/15 · ACT 7/23 · HOT 0/7.
- Amenities RES publiés (top) : Parking 66 · Bar 53 · « Équipement randonnée » 48 (bruit d'import à nettoyer) · Terrasse commune 28 · Jardin 27 · Wi-Fi 18 · Climatisation 12 · Piscine 10.
- `object_pet_policy` : 0 ligne sur objets publiés (filtre « Animaux acceptés » mort).
- `object_fma` : `event_start_date`, `event_end_date`, heures, `is_recurring`, `recurrence_pattern` — aucun filtre UI/RPC ne les consomme.
- RPC `get_filtered_object_ids` : `taxonomy_any` générique (tout domaine, descendants via `cached_taxonomy_codes`), `amenities_any`, `capacity_filters`, `meeting_room`, `itinerary{…}`, `open_now`, `pet_accepted`, `sustainability_*`, `label_scheme_ranked`, `tags_any`, `city_any`, `lieu_dit_any`, `bbox`, `search_mode=global`.
