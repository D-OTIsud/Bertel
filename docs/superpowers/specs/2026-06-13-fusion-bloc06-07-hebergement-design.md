# Design — Fusion §06 ↔ §07 pour les hébergements (HEB)

**Date :** 2026-06-13
**Périmètre :** éditeur d'objet plein-page `/objects/[id]/edit`, archétype **HEB** (couvre `HOT · HPA · HLO · CAMP · RVA`).
**Statut :** design validé (PO) après audit contre la base live — v2 (corrigé).

---

## 0. Audit préalable — la base contredit la prémisse initiale (décisif)

Le plan v1 supposait « §06 (chambres) fait foi, on dérive la capacité depuis les chambres ». **Vérification live (2026-06-13) :**

| Fait vérifié (prod) | Valeur |
|---|---|
| `object_room_type` dans **toute** la base | **0 ligne** |
| `object_meeting_room` dans toute la base | **1 ligne** |
| Objets HEB | 497 (485 HLO · 9 HOT · 3 CAMP · 0 HPA · 0 RVA) |
| HEB avec types de chambres définis | **0** |
| HEB avec capacité renseignée | 496 — **100 % portent une seule métrique : `max_capacity`** (aucune date) |
| `object_group_policy` / `object_pet_policy` | **0 / 0** |

**Conséquences :**
1. La table `object_room_type` est **vide et inutilisée** → dériver la capacité « depuis les chambres » dérive depuis un ensemble vide ; le bénéfice Explorer annoncé est nul aujourd'hui.
2. Les 496 HEB stockent leur capacité réelle (un seul nombre, `max_capacity`) **dans le §07**. `save_object_commercial` fait `DELETE … object_capacity` puis réinsère le payload → si l'éditeur ne porte plus de champ capacité éditable, **la première sauvegarde efface la capacité de 496 fiches**.
3. **485/497 HEB sont des HLO** (locatifs / meublés / gîtes) : loués **en entier**, jamais à la chambre. Le modèle hôtelier « type de chambre · vue · couchages » ne leur correspondra pas. Leur capacité = un seul nombre.

**Verdict :** la gêne du PO est fondée (le repeater de métriques libres du §07 EST confus/redondant ; bugs d'alignement et textes parasites réels). Mais « tout dériver des chambres » optimise pour un hôtel-à-chambres quasi inexistant dans ce parc. **Correction (décision PO) :** la **capacité max reste un champ éditable de plein droit** ; le tableau de chambres devient un **détail optionnel** ; la dérivation Explorer devient un **bonus** non porteur.

---

## 1. Problème (symptômes PO)

| # | Symptôme | Cause |
|---|----------|-------|
| 1 | On peut ajouter « Chambres » / « Salles de réunion » comme **métriques libres** dans le §07, en doublon conceptuel de §06 | Repeater « Métriques détaillées » à saisie libre sur `object_capacity`, en parallèle des tables §06 |
| 2 | Couchages/Surface/Unités/Tarif **ne s'alignent pas** sous leurs en-têtes | Dernière piste de grille `auto` (actions) : vide dans l'en-tête, large dans les lignes → la piste flexible `1.4fr` se résout différemment entre en-tête et lignes |
| 3 | « Capacité cumulée… reportée automatiquement dans §07… » + indications | Textes de couplage entre deux blocs qui n'en font plus qu'un |

## 2. Décisions actées (PO)

1. **Un seul bloc hébergement** (§06) fait foi. **§07 masqué pour les HEB uniquement** ; les autres archétypes (RES, ASC, ITI, VIS, SRV, FMA) gardent leur §07 **inchangé**.
2. **Capacité max = champ principal éditable**, **toujours** disponible (même sans chambres). Pré-rempli/suggéré depuis les chambres *quand il y en a* (dérivé-sauf-override), **jamais conditionné** à elles.
3. **Tableau types de chambres + salles MICE = détail optionnel repliable** (replié par défaut quand vide) — pour les hôtels qui veulent détailler ; sans friction pour les locatifs entiers.
4. **Dérivation Explorer = bonus** : si des chambres/salles existent, elles alimentent `bedrooms`/`pitches`/`meeting_rooms` dans `object_capacity` ; sinon rien. Plus le mécanisme porteur.
5. **Suppression du repeater « Métriques détaillées »** pour HEB (source de la gêne #1).
6. Titre du bloc : « Chambres, capacité & séminaire ». Note PMR **resserrée** en aide compacte.

## 3. État actuel (références code)

- **Périmètre des sections** — `src/features/object-editor/section-config.ts` : `makeSections(archetype)` ; gating existant `hasPlaces` (§16) = mécanisme à réutiliser pour masquer §07.
- **Registre** — `src/features/object-editor/sections/section-registry.tsx` : `'06' → TYPE_BLOCKS[archetype]` (HEB → `BlockHEB`), `'07' → SectionCapacity`. `MODE_ESSENTIAL` ne contient pas `'07'`.
- **§06** — `src/features/object-editor/sections/blocks/BlockHEB.tsx` : tableau chambres (`SortableList`, `ROOM_COLS`), salles MICE (`Repeater`, `MICE_COLS`), texte « Capacité cumulée… » (l.208-214), note PMR (l.215-220), sync via `setRoomItems → syncCapacityWithRooms` (l.116-123).
- **§07** — `src/features/object-editor/sections/SectionCapacity.tsx` : tuiles `StatCard`, repeater « Métriques détaillées » (à retirer pour HEB), chips « Cadre/environnement » (module `characteristics`, **partagé avec §12**), Groupes (group policy), Animaux (pet policy, tri-état).
- **Helpers** — `src/features/object-editor/sections/blocks/rooms-utils.ts` : `computeRoomsCapacitySum`, `syncCapacityWithRooms` (dérivé-sauf-override `max_capacity`).
- **Alignement** — `src/features/object-editor/primitives/SortableList.tsx` (`SortableRow` injecte la cellule handle puis `renderItem`) ; `Repeater.tsx`.
- **Persistance** — `src/services/object-workspace.ts` : `saveObjectWorkspaceRooms` / `…MeetingRooms` (delete-reinsert direct PostgREST) ; `saveObjectWorkspaceCapacityPolicies` → RPC `save_object_commercial`.
- **RPC** — `Base de donnée DLL et API/object_workspace_safe_write_rpcs.sql` : `save_object_commercial` **delete-reinsert** `object_capacity` depuis `capacities[]` (résout `metric_id`/`metric_code`, `unit` par trigger) + upsert group/pet policy.
- **Catalogue** — `seeds_data.sql` `ref_capacity_metric` (max_capacity, bedrooms, pitches, meeting_rooms, …) ; applicabilité `ref_capacity_applicability` (loader filtre déjà `metricOptions`).
- **Explorer** — `src/services/explorer-reference.ts` `hotCapacityMetrics` ; moteur SQL `api_views_functions.sql` (~l.1416) filtre via `capacity_filters` sur `object_capacity` → la dérivation alimente la même table, **aucune réécriture Explorer**.

## 4. Architecture cible

### A. Masquer §07 pour HEB
`makeSections()` : omettre l'entrée `{ num: '07' }` quand `archetype === 'HEB'` (comme `hasPlaces` pour §16). `SectionCapacity` reste le composant `'07'` pour tous les autres archétypes, **strictement inchangé**.

### B. §06 « Chambres, capacité & séminaire » — réordonné, capacité d'abord
`BlockHEB` (déjà HEB-only). Ordre **capacité-first** (le cas réel = un nombre) :

1. **Capacité d'accueil** *(en tête, toujours visible)* :
   - **Capacité max (pax)** — champ éditable de plein droit. **Bound DIRECTEMENT sur l'item `capacityPolicies.capacityItems[metricCode==='max_capacity']`** (mutation en place via `replaceModule`, en préservant `recordId` + `metricId`), **jamais** un state local découplé — sinon le delete-reinsert efface les 496 fiches *(audit Angle 1/5, sévérité high)*. **`onChange` doit CRÉER l'item s'il n'existe pas** (objet vide / 0 ligne de capacité) via un helper type `createCapacityItem` ciblé sur `metricOptions.find(code==='max_capacity')` — sinon la saisie sur un nouvel objet est un no-op silencieux (write-trap) *(audit Angle 4, high : `syncCapacityWithRooms` ne crée jamais la ligne à 0 chambre)*. Quand des chambres existent : suggéré = Σ(couchages × unités), **dérivé-sauf-override** (`syncCapacityWithRooms`). Quand 0 chambre : saisie libre (le sync est inerte, `nextSum = 0` → ne touche jamais la valeur chargée). Aide : « Capacité d'accueil totale. Si vous détaillez les chambres ci-dessous, elle se calcule automatiquement — ajustez au besoin (lit d'appoint). »
   - **Chambres** / **Salles de réunion** — tuiles **dérivées lecture seule**, affichées **seulement si** des chambres/salles existent (sinon masquées — pas de tuile vide pour les 485 gîtes).
   - **Groupes** (min/max, groupes uniquement, notes) — rendu **aussi** en §06.
   - **Animaux** (tri-état + conditions) — rendu **aussi** en §06.
   - **Cadre / environnement** (chips, module `characteristics`) — rendu **aussi** en §06.
2. **Détailler les chambres / unités** *(disclosure repliable)* :
   - Pas de primitive accordion existant (`Fs.folded` est un repli niveau-section). → **`<details>` natif ou `useState` + `aria-expanded` inline** dans `BlockHEB` (pattern `SectionAccessibility`). Ouvert si des chambres/salles existent, replié sinon : `useState(rooms.items.length > 0 || meetingRooms.items.length > 0)`.
   - Tableau types de chambres (alignement corrigé) + « Ajouter un type de chambre ».
   - Tableau salles séminaire & événementiel (alignement corrigé) + « Ajouter une salle ».

**Précision « rendu aussi » (audit Angle 3, medium) :** Groupes / Animaux / chips environnement sont **DUPLIQUÉS** dans `BlockHEB`, **PAS retirés** de `SectionCapacity` — celle-ci reste le composant `'07'` des 6 autres archétypes. La source d'état est unique (`editor.draft.capacityPolicies` / `.characteristics`), donc aucune désynchro même si les deux composants existent ; §07 étant masqué pour HEB, un seul rendu est monté à la fois. Reporter les gardes `unavailableReason` (→ `ModuleUnavailableNotice`) autour des contrôles dupliqués. §12 (`SectionPayLangs`) ne consomme jamais l'environnement → intact. Modules `capacityPolicies` + `characteristics` restent **chargés et sauvegardés par module dirty** (`save_object_commercial` / `saveObjectWorkspaceCharacteristics`), indépendamment de la visibilité des sections *(audit Angle 1/2/3, ok)*.

### C. Suppression du repeater « Métriques détaillées » pour HEB
Plus de saisie libre de métriques en HEB. La seule métrique éditable = **Capacité max** (champ dédié ci-dessus). Les métriques structurelles (`bedrooms`/`pitches`/`meeting_rooms`) ne sont saisissables nulle part : elles sont **dérivées** des tables §06 quand elles existent. *(Live : 100 % des HEB n'ont que `max_capacity` → aucune perte.)*

### D. Dérivation Explorer (bonus, non porteur)
Étendre `rooms-utils` : quand les chambres **ou** salles changent, injecter dans `capacityItems` (en plus de `max_capacity`) :

| Métrique | Code | Dérivée | Comportement |
|----------|------|---------|--------------|
| Capacité max | `max_capacity` | Σ(couchages × unités) | dérivé-**sauf-override**, **toujours éditable** |
| Chambres / emplacements | `bedrooms` (HOT/HLO/RVA) **ou** `pitches` (HPA/CAMP) | Σ(unités) | dérivé, lecture seule |
| Salles de réunion | `meeting_rooms` | nb de salles | dérivé, lecture seule |

Mapping unités→métrique **explicite** selon `typeCode` : `HOT/HLO/RVA → bedrooms`, `HPA/CAMP → pitches`. **Pas de « défaut bedrooms »** : il serait gardé-out pour les campings (bedrooms non applicable à HPA/CAMP) → perte silencieuse de la dérivation `pitches` *(audit Angle 5, medium)*. `meeting_rooms` universel. **`typeCode` est à AJOUTER à la déstructuration de `BlockHEB`** (aujourd'hui `{ editor, folded }`) — il est bien plombé jusqu'au composant (`ObjectEditPage` → `TypeBlockSection` → spread). N'injecter une métrique que si elle est présente dans **`capacity.metricOptions` du module CHARGÉ** (`getObjectWorkspaceCapacityPoliciesModule`, filtré par `ref_capacity_applicability`), **jamais** la dérivation basée sur le `metricOptions` du parser fixture (qui ne liste que les métriques déjà présentes → un test sur fixture pauvre passerait en vert sur un no-op, exactement le piège §54 `capacity_total`) *(audit Angle 5, ok)*. Persistance par `save_object_commercial` (delete-reinsert). **Pas de trigger DB** : front-orchestrateur unique, réversible. Avec 0 chambre (cas actuel), ces lignes ne sont jamais créées → comportement identique à aujourd'hui.

### E. Bug d'alignement
Cause racine confirmée *(audit Angle 5, ok)* : la dernière piste `auto` (actions) vaut **0 px en en-tête** (cellule vide) et **~90 px en ligne** (boutons) → la piste partagée `1.4fr` reçoit plus d'espace en en-tête qu'en ligne → toutes les pistes fixes dérivent. Corrections **cumulées** (les deux nécessaires) :
1. Dernière piste `auto` → **largeur fixe** dans `ROOM_COLS` et `MICE_COLS`, dimensionnée pour la cellule la plus large : **ROOM ≈ 120 px** (badge PMR + Modifier + suppression), **MICE ≈ 96 px** (pas de PMR). + cellule d'en-tête vide pour la colonne actions dans **chacun** des deux `repHeader`.
2. **Aligner le `gap`** : `repHeader` impose `gap: 8` inline, `.rep-row` impose `gap: 10px` (CSS) → résidu de ~1-2 px/colonne même après le fix #1 *(audit Angle 5, medium — non vu en v2)*. Passer `repHeader` à `gap: 10`.

Note décompte (audit Angle 5, ok) : ROOM (`SortableList` injecte le handle) = 7 pistes / 6 labels ; MICE (`Repeater` n'injecte PAS de handle) = 6 pistes / 5 labels — les deux en-têtes sont courts d'**exactement** la colonne actions, symétrie cohérente, pas de piège « MICE sans handle ». *(Option propreté : faire dériver l'en-tête des mêmes `columns` dans le primitive.)*

### F. Textes parasites
- **Supprimer** « Capacité cumulée… reportée dans §07 » (la valeur EST le champ Capacité max juste au-dessus).
- **Resserrer** la note PMR en aide compacte (le badge PMR reste par ligne).

## 5. Sécurité données (non négociable)

Les 496 HEB live portent leur capacité dans `object_capacity`. Comme `save_object_commercial` delete-reinsert :
- Le champ **Capacité max de §06 DOIT charger la valeur existante** (`capacityPolicies.capacityItems[max_capacity].value`) et la conserver au save — sinon perte sur 496 fiches.
- Test de non-régression dédié : objet HEB roomless avec `max_capacity=N`, ouverture éditeur → save sans modif → `object_capacity` inchangé (toujours 1 ligne, valeur N).
- Le sync ne doit **jamais** s'exécuter avec 0 chambre (garde `nextSum===prevSum` ⇒ `null` ; `prevSum=nextSum=0`).

## 6. Hors-scope (différés, documentés)

- **Refonte du modèle inventaire par sous-type HEB** (hôtel=chambres / locatif=logement entier / camping=emplacements) — l'audit montre que le modèle type-de-chambre ne colle qu'aux hôtels. Sa propre passe spec si le besoin se confirme.
- **`beds`/`floor_area_m2`/`seats` saisissables pour HEB** — retirés avec le repeater ; non utilisés live. Réintroduire via champ dédié si besoin métier.
- **Trigger DB de dérivation** (imports hors éditeur) — front-only suffit pour le MVP.
- **Élagage de `hotCapacityMetrics` Explorer** vers les seuls filtres alimentés (cosmétique).

## 7. Vérification

**Tests automatisés (TDD) :**
- `rooms-utils` : dérivation `bedrooms` (branche HOT/HLO/RVA) **ET** `pitches` (branche HPA/CAMP) — fixture dont `metricOptions` contient ces codes (sinon no-op vert, piège §54) ; `meeting_rooms` (count) ; `max_capacity` dérivé-sauf-override ; **inertie à 0 chambre** (`sync([],[]) ⇒ null`, valeur chargée intacte).
- `BlockHEB` : **création from-scratch** (objet 0 capacité → saisir N → `capacityItems` contient 1 item `max_capacity` `recordId:null value:N`) ; capacité max éditable **sans chambres** + override tient ; **non-régression roomless** (HEB `max_capacity=N`, ouverture → save sans modif ⇒ module **non dirty**, aucun appel `save_object_commercial` ; puis édition ⇒ payload `capacities` = 1 ligne `{id:recordId, value:N'}`, pas `[]`) ; tuiles dérivées masquées si 0 chambre ; disclosure repliée par défaut quand vide ; groupes/animaux/environnement présents ; alignement DOM (mêmes pistes en-tête vs lignes, dernière piste fixe, `gap` aligné).
- `section-config` : HEB **20** sections, `'07'` **omis** pour HEB / **présent** pour RES/ASC/ITI/VIS/SRV/FMA ; `section-registry.test` (HEB 20, plus d'adjacence `'06'==='07'-1`).
- `editor-completion` : §06 crédité de la capacité `max_capacity` pour un HLO roomless ; `'07'` non compté pour HEB.
- `SectionCapacity` : **inchangé** non-HEB ; `SectionPayLangs` (§12) : contrôles paiements/langues intacts (module partagé).
- Suite FE verte + `tsc`.

**Manuel (app réelle, données live) :**
- Éditer un HLO roomless (cas dominant) : la **Capacité max s'affiche, est éditable**, le §07 a disparu de la nav ; save → `object_capacity` conserve sa ligne (pas d'effacement).
- Éditer le HOT avec 1 salle MICE : la salle apparaît dans le détail ; tuile « Salles de réunion : 1 » dérivée ; `meeting_rooms` en base après save.
- Éditer un RES (non-HEB) : §07 présent et fonctionnel ; §12 intact.

## 8. Impacts transverses à TRAITER (issus de l'audit — pas seulement « à vérifier »)

- **`editor-completion.ts` (high, deux corrections)** : (a) `computeOverallCompletion` utilise la liste **codée en dur** `SCORE_SECTION_NUMS` qui inclut `'07'` et est appelée **sans nums filtrés** (`ObjectEditPage.tsx:151`) → §07 reste compté pour HEB même masqué. Passer une liste de nums **dérivée de l'archétype** (intersection avec `getRegisteredSections(archetype)`). (b) La règle `'06'` ne score **que** `rooms.items.length > 0` → les 485 HLO roomless afficheraient §06 à **0 %** alors qu'ils portent la capacité. **Étendre la règle `'06'`** pour créditer la présence d'une valeur `max_capacity` (`capacityItems.some(max_capacity && value)`).
- **`editor-validation.ts` (high)** : la règle `editor-validation.ts:111-116` émet pour HEB `0` chambre le warn « Ajoutez au moins un type de chambre ou d'unité locative » → **nag permanent sur 485/485 HLO** (loués en entier), en contradiction directe avec « chambres = optionnel ». **Restreindre ce warn à `HOT`** (modèle hôtelier) ou le retirer. Aucun bloqueur ne référence `'07'`/capacité (confirmé) → masquer §07 ne casse aucune publication.
- **Tests à mettre à jour (high)** : `section-config.test.ts` (HEB **20** sections, plus 21), `section-registry.test.tsx` (HEB **20** + retirer l'assertion d'adjacence `'06' === '07'-1`), `editor-completion.test.ts`. Ajouter le test ciblé « `'07'` omis pour HEB, présent pour RES/ASC/ITI/VIS/SRV/FMA ».
- **Drawer / fiche publique** (`object-drawer/utils.ts` `parseCapacities`, `ObjectDetailView`) : lit `object_capacity`, découplé de l'éditeur — **inchangé, OK** (audit Angle 4). Redondance **future** seulement : quand la dérivation §4.D produira des lignes `bedrooms`/`meeting_rooms` réelles, la fiche montrerait le nb de chambres en stat capacité **et** dans `RoomList` → filtre d'affichage à prévoir (cosmétique, hors MVP, 0 chambre live).
- **Documentation** : entrée décision log `lot1_mapping_decisions.md` (§64) + mise à jour de la ligne différée « Editor §07 capacity-metric filtering » + mémoire MCP.

## 9. Watch-items (hors-scope de cette passe, documentés)

- **Lignes `object_group_policy` fantômes (medium, pré-existant)** : le saver envoie toujours la clé `group_policy` → la RPC UPSERT une ligne même si l'utilisateur n'a touché que la capacité (les 496 HEB ont 0 group_policy aujourd'hui → matérialisation silencieuse `group_only=false`). Déjà vrai via §07, **pas un bloqueur**. Option future : garde tri-état « tout vide ⇒ `group_policy: null` » comme `pet_policy`.
- **`beds` / `floor_area_m2` / `seats` non saisissables pour HEB** : retirés avec le repeater ; applicables côté `ref_capacity_applicability` mais **0 ligne live**. Décision PO assumée ; réintroduire comme **champ dédié** (pas repeater) si un besoin métier émerge.
- **WARN « ajoutez une chambre » → modèle inventaire par sous-type** : le débat HLO-sans-chambre rejoint le hors-scope §6 (refonte inventaire hôtel/locatif/camping).
