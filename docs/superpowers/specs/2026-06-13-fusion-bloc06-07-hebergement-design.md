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
   - **Capacité max (pax)** — champ éditable de plein droit. **Chargé depuis `object_capacity` existant** (sécurité données : c'est lui qui sera réinséré au save). Quand des chambres existent : suggéré = Σ(couchages × unités), **dérivé-sauf-override** (`syncCapacityWithRooms`). Quand 0 chambre : simple saisie libre (le sync est inerte, `nextSum = 0` → ne touche jamais la valeur chargée). Aide : « Capacité d'accueil totale. Si vous détaillez les chambres ci-dessous, elle se calcule automatiquement — ajustez au besoin (lit d'appoint). »
   - **Chambres** / **Salles de réunion** — tuiles **dérivées lecture seule**, affichées **seulement si** des chambres/salles existent (sinon masquées — pas de tuile vide pour les 485 gîtes).
   - **Groupes** (min/max, groupes uniquement, notes) — déplacé du §07.
   - **Animaux** (tri-état + conditions) — déplacé du §07.
   - **Cadre / environnement** (chips, module `characteristics`) — déplacé du §07.
2. **Détailler les chambres / unités** *(disclosure repliable, replié par défaut quand vide)* :
   - Tableau types de chambres (alignement corrigé) + « Ajouter un type de chambre ».
   - Tableau salles séminaire & événementiel (alignement corrigé) + « Ajouter une salle ».

Modules `capacityPolicies` + `characteristics` restent **chargés et sauvegardés** (`save_object_commercial`) pour HEB ; juste **montés en §06**. Gardes `unavailableReason` conservées. Le module `characteristics` étant partagé avec §12, n'y déplacer que **l'affichage** des chips environnement — §12 reste fonctionnel.

### C. Suppression du repeater « Métriques détaillées » pour HEB
Plus de saisie libre de métriques en HEB. La seule métrique éditable = **Capacité max** (champ dédié ci-dessus). Les métriques structurelles (`bedrooms`/`pitches`/`meeting_rooms`) ne sont saisissables nulle part : elles sont **dérivées** des tables §06 quand elles existent. *(Live : 100 % des HEB n'ont que `max_capacity` → aucune perte.)*

### D. Dérivation Explorer (bonus, non porteur)
Étendre `rooms-utils` : quand les chambres **ou** salles changent, injecter dans `capacityItems` (en plus de `max_capacity`) :

| Métrique | Code | Dérivée | Comportement |
|----------|------|---------|--------------|
| Capacité max | `max_capacity` | Σ(couchages × unités) | dérivé-**sauf-override**, **toujours éditable** |
| Chambres / emplacements | `bedrooms` (HOT/HLO/RVA) **ou** `pitches` (HPA/CAMP) | Σ(unités) | dérivé, lecture seule |
| Salles de réunion | `meeting_rooms` | nb de salles | dérivé, lecture seule |

Mapping unités→métrique selon `typeCode` (dispo dans `SectionProps`, défaut `bedrooms`). N'injecter que si la métrique est applicable au type (présente dans `metricOptions`, déjà filtré par `ref_capacity_applicability`). Persistance par `save_object_commercial` (delete-reinsert). **Pas de trigger DB** : front-orchestrateur unique, réversible. Avec 0 chambre (cas actuel), ces lignes ne sont jamais créées → comportement identique à aujourd'hui.

### E. Bug d'alignement
Dernière piste `auto` (actions) → **largeur fixe** dans `ROOM_COLS` et `MICE_COLS` ; l'en-tête (`repHeader`) déclare le **même nombre de pistes** que les lignes (cellule d'en-tête vide pour les actions). En-tête et lignes partagent des pistes identiques → alignement exact. *(Option propreté : faire dériver l'en-tête des mêmes `columns` dans le primitive.)*

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
- `rooms-utils` : dérivation `bedrooms`/`pitches` (mapping type) + `meeting_rooms` ; `max_capacity` dérivé-sauf-override ; **inertie à 0 chambre** (ne touche pas la valeur chargée).
- `BlockHEB` : capacité max éditable **sans chambres** + override tient ; tuiles dérivées masquées si 0 chambre ; disclosure chambres repliée par défaut ; groupes/animaux/environnement présents ; alignement DOM (mêmes `gridTemplateColumns` en-tête vs lignes, dernière piste fixe).
- `section-config` : `'07'` **omis** pour HEB, **présent** ailleurs.
- `SectionCapacity` : **inchangé** non-HEB ; `SectionPayLangs` (§12) : chips intactes (module partagé).
- Suite FE verte + `tsc`.

**Manuel (app réelle, données live) :**
- Éditer un HLO roomless (cas dominant) : la **Capacité max s'affiche, est éditable**, le §07 a disparu de la nav ; save → `object_capacity` conserve sa ligne (pas d'effacement).
- Éditer le HOT avec 1 salle MICE : la salle apparaît dans le détail ; tuile « Salles de réunion : 1 » dérivée ; `meeting_rooms` en base après save.
- Éditer un RES (non-HEB) : §07 présent et fonctionnel ; §12 intact.

## 8. Impacts transverses à vérifier

- **`editor-completion.ts`** : ne plus compter §07 pour HEB (sinon score faussé) ; capacité comptée via §06.
- **`editor-validation.ts`** : aucun bloqueur publication ne référence §07 pour HEB.
- **Drawer / fiche publique** (`object-drawer/utils.ts` `parseCapacities`) : lit `object_capacity` — inchangé ; vérifier l'absence de doublon d'affichage.
- **Documentation** : entrée décision log `lot1_mapping_decisions.md` (§64) + mise à jour de la ligne différée « Editor §07 capacity-metric filtering » + mémoire MCP.
