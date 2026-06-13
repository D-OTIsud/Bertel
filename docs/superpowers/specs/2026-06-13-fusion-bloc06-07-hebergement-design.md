# Design — Fusion §06 ↔ §07 pour les hébergements (HEB)

**Date :** 2026-06-13
**Périmètre :** éditeur d'objet plein-page `/objects/[id]/edit`, archétype **HEB** (couvre `HOT · HPA · HLO · CAMP · RVA`).
**Statut :** design validé (PO), prêt pour plan d'implémentation.

---

## 1. Problème

Trois symptômes signalés par le PO, une cause racine commune.

| # | Symptôme | Cause technique |
|---|----------|-----------------|
| 1 | On peut ajouter « Chambres » / « Salles de réunion » comme **métriques libres** dans le §07 (« Métriques détaillées »), alors que ces chiffres sont déjà gérés en §06 | `object_capacity` est saisi **à la main** en §07, en parallèle de `object_room_type` / `object_meeting_room` (§06) → **deux sources de vérité** pour le même chiffre |
| 2 | Couchages / Surface / Unités / Tarif **ne s'alignent pas** sous leurs en-têtes (« il n'y a pas de colonne ») | La dernière colonne de grille est `auto` (actions) : **vide** dans l'en-tête, **large** dans les lignes (boutons Modifier/🗑) → la colonne flexible `1.4fr` se résout à des largeurs différentes entre en-tête et lignes → décalage de toutes les colonnes fixes |
| 3 | « Capacité cumulée : N personne(s) — reportée automatiquement dans la capacité totale (§07)… » et autres indications | Textes de **couplage** entre deux blocs qui ne devraient plus en faire qu'un ; bruit UX |

**Cause racine :** pour un hébergement, l'offre (chambres, salles) ET sa capacité d'accueil sont **conceptuellement un seul bloc**, mais l'éditeur les a éclatés en §06 (inventaire) et §07 (capacité), avec une saisie manuelle redondante en §07.

## 2. Décisions actées (PO)

1. **§06 fait foi** pour l'hébergement. **§07 « Capacité & accueil » est masqué pour les HEB uniquement.** Les autres archétypes (RES, ASC, ITI, VIS, SRV, FMA) conservent leur §07 **inchangé**.
2. **Les métriques structurelles sont dérivées à l'enregistrement** : `object_capacity` reste la source unique côté Explorer, mais ses lignes structurelles pour les HEB sont **calculées depuis le §06**, jamais saisies à la main.
3. **Titre du bloc fusionné :** « Chambres, capacité & séminaire ».
4. **Note PMR :** conservée mais **resserrée** en aide compacte.

## 3. État actuel (références code)

- **Périmètre des sections** — `src/features/object-editor/section-config.ts` : `makeSections(archetype)` construit les 22 sections. Gating existant par archétype : `hasPlaces` (§16 ITI/VIS uniquement). C'est le mécanisme à réutiliser pour masquer §07.
- **Registre** — `src/features/object-editor/sections/section-registry.tsx` : `getRegisteredSections()` mappe `makeSections()` → composants. `'06' → TypeBlockSection → TYPE_BLOCKS[archetype]` (HEB → `BlockHEB`), `'07' → SectionCapacity`.
- **§06** — `src/features/object-editor/sections/blocks/BlockHEB.tsx` : tableau chambres (`SortableList`, `ROOM_COLS`), tableau salles MICE (`Repeater`, `MICE_COLS`), texte « Capacité cumulée… » (l.208-214), note PMR (l.215-220). Sync max_capacity via `setRoomItems` → `syncCapacityWithRooms` (l.116-123).
- **§07** — `src/features/object-editor/sections/SectionCapacity.tsx` : tuiles `StatCard`, repeater « Métriques détaillées » (saisie libre, `createCapacityItem`), chips « Cadre / environnement » (module `characteristics`), **Groupes** (group policy), **Politique d'accueil / Animaux** (pet policy, tri-état).
- **Helpers dérivation** — `src/features/object-editor/sections/blocks/rooms-utils.ts` : `computeRoomsCapacitySum` (Σ couchages × unités), `syncCapacityWithRooms` (dérivé-sauf-override sur `max_capacity`).
- **Bug d'alignement** — `src/features/object-editor/primitives/SortableList.tsx` : `SortableRow` injecte toujours un `<button class="rep-row__handle">` en 1ʳᵉ cellule, puis `renderItem`. La grille de l'en-tête (`repHeader`) et celle des lignes partagent `columns`, mais la dernière piste `auto` a un contenu de largeur différente (en-tête vide vs actions larges).
- **Persistance** — `src/services/object-workspace.ts` :
  - `saveObjectWorkspaceRooms` (delete-reinsert direct PostgREST `object_room_type` + liens amenity/media),
  - `saveObjectWorkspaceMeetingRooms` (idem `object_meeting_room` + équipements),
  - `saveObjectWorkspaceCapacityPolicies` → RPC `save_object_commercial` (`capacities` + `group_policy` + `pet_policy`).
- **RPC** — `Base de donnée DLL et API/object_workspace_safe_write_rpcs.sql` : `save_object_commercial` **delete-reinsert** `object_capacity` depuis `capacities[]`, résout `metric_id` OU `metric_code`, `unit` posé par trigger. → on peut y faire passer les lignes dérivées sans nouvelle table ni nouveau saver.
- **Catalogue métriques** — `seeds_data.sql` : 12 codes `ref_capacity_metric` dont `max_capacity`, `bedrooms`, `pitches`, `meeting_rooms`. Applicabilité par type : `ref_capacity_applicability` (HOT → max_capacity, beds, bedrooms, meeting_rooms, floor_area_m2 ; HPA → max_capacity, beds, pitches, campers, tents, vehicles, meeting_rooms). Le loader `getObjectWorkspaceCapacityPoliciesModule` filtre déjà `metricOptions` par cette table (§62).
- **Explorer** — `src/services/explorer-reference.ts` : `hotCapacityMetrics` = beds, bedrooms, pitches, meeting_rooms ; le moteur de recherche SQL filtre via `capacity_filters` sur `object_capacity` (`api_views_functions.sql` ~l.1416). Aucune réécriture Explorer nécessaire (dérivation alimente la même table).

## 4. Architecture cible

### A. Périmètre par archétype (masquer §07 pour HEB)
`makeSections()` : omettre l'entrée `{ num: '07' }` quand `archetype === 'HEB'`, comme `hasPlaces` le fait pour §16. `SectionCapacity` reste le composant `'07'` pour tous les autres archétypes, **strictement inchangé**.

### B. §06 devient le bloc accueil unique des HEB
`BlockHEB` (déjà HEB-only) — titre « Chambres, capacité & séminaire ». Structure :

1. **Chambres / unités locatives** — tableau existant, **alignement corrigé** (cf. D).
2. **Capacité d'accueil** *(nouvel encart, rapatrié du §07)* :
   - **Capacité max (pax)** — *seul champ chiffré éditable*. Pré-rempli = Σ(couchages × unités), **dérivé-sauf-override** (réutilise `syncCapacityWithRooms`). Aide : « Calculée depuis les chambres — augmentez au besoin (lit d'appoint). »
   - **Chambres** + **Salles de réunion** — tuiles **dérivées, lecture seule** (aucune saisie).
   - **Groupes** (min/max, groupes uniquement, notes) — déplacé du §07.
   - **Animaux** (tri-état + conditions) — déplacé du §07.
   - **Cadre / environnement** (chips, module `characteristics`) — déplacé du §07.
3. **Salles séminaire & événementiel** — tableau existant, **alignement corrigé** (cf. D).

Les modules `capacityPolicies` et `characteristics` restent **chargés et sauvegardés** (`save_object_commercial`) pour les HEB ; ils sont simplement **montés en §06** au lieu du §07. Les gardes `unavailableReason` (no-clobber sur load dégradé) sont conservées.

### C. Dérivation à l'enregistrement
Étendre `rooms-utils` : à chaque changement des chambres **ou** des salles, recalculer et injecter dans `capacityItems` (en plus de `max_capacity`) :

| Métrique | Code | Valeur dérivée | Comportement |
|----------|------|----------------|--------------|
| Capacité max | `max_capacity` | Σ(couchages × unités) | dérivé-**sauf-override** (existant) |
| Chambres / emplacements | `bedrooms` (HOT/HLO/RVA) **ou** `pitches` (HPA/CAMP) | Σ(unités) | dérivé, **toujours suit** (lecture seule) |
| Salles de réunion | `meeting_rooms` | nombre de salles | dérivé, **toujours suit** (lecture seule) |

Le mapping unités→métrique dépend du `typeCode` (dispo dans `SectionProps`). Défaut `bedrooms` si type inconnu. La métrique dérivée n'est créée **que si** elle est applicable au type (présente dans `metricOptions`, déjà filtré par `ref_capacity_applicability`) — fail-safe : si absente, on n'injecte pas (pas de ligne orpheline).

Persistance par le saver existant `save_object_commercial` (delete-reinsert `object_capacity`). **`object_capacity` reste la source unique de l'Explorer** ; ses lignes structurelles HEB sont dérivées du §06. **Pas de trigger DB** : le front est l'orchestrateur unique → réversible, simple, cohérent avec le `max_capacity` actuel.

### D. Bug d'alignement
Remplacer la dernière piste `auto` (actions) par une **largeur fixe** dans `ROOM_COLS` et `MICE_COLS`, et garantir que l'en-tête (`repHeader`) déclare **le même nombre de pistes** que les lignes (cellule d'en-tête vide pour la colonne actions). Ainsi en-tête et lignes partagent des pistes identiques → alignement exact. (Option de propreté : factoriser le rendu d'en-tête dans le primitive `SortableList`/`Repeater` pour qu'il dérive des mêmes `columns`.)

### E. Textes parasites
- **Supprimer** « Capacité cumulée… reportée automatiquement dans la capacité totale (§07)… » : redondant, la valeur est désormais le champ **Capacité max** juste à côté.
- **Resserrer** la note PMR en aide compacte (le badge PMR reste sur chaque ligne).

## 5. Hors-scope (différés, documentés)

- **`beds` / `pitches` Explorer pour HOT** non alimentés (ambigus : `beds` ≠ couchages-pax sans modèle de lits ; `pitches` = camping, modèle distinct) — honnête, ces filtres sont vides aujourd'hui.
- **Trigger DB de dérivation** : durcissement futur pour les imports / écritures directes hors éditeur (le front-only suffit pour le MVP, comme `max_capacity` aujourd'hui).
- **Élagage de `hotCapacityMetrics`** (Explorer) pour ne montrer que les filtres réellement alimentés (`bedrooms`, `meeting_rooms`) — cosmétique, pass séparée.

## 6. Vérification

**Tests automatisés (TDD) :**
- `rooms-utils` : dérivation `bedrooms`/`pitches` (mapping par type) et `meeting_rooms` (count) ; `max_capacity` dérivé-sauf-override inchangé.
- `BlockHEB` : encart Capacité d'accueil rendu (capacité max éditable + override tient, tuiles dérivées lecture seule, groupes/animaux/environnement présents) ; alignement DOM (même `gridTemplateColumns` en-tête vs lignes, dernière piste fixe).
- `section-config` : `'07'` **omis** pour HEB, **présent** pour tous les autres archétypes.
- `SectionCapacity` : **inchangé** pour les non-HEB (régression nulle).
- Suite FE complète verte + `tsc` propre.

**Manuel (app réelle, données live) :**
- Éditer un HOT : ajouter/éditer des chambres → la **Capacité max suit** ; la surcharger → l'override **tient** au prochain changement ; **Chambres** et **Salles de réunion** dérivées correctes ; le §07 **n'apparaît plus** dans la nav.
- Save → vérifier les lignes `object_capacity` en base (max_capacity + bedrooms + meeting_rooms) et que les **filtres Explorer** Chambres/Salles de réunion fonctionnent.
- Éditer un RES (non-HEB) : §07 toujours présent et fonctionnel.

## 7. Impacts à vérifier (alignement transverse)

- **`editor-completion.ts`** : le scoring de complétion ne doit plus compter §07 pour les HEB (sinon score faussé) ; la capacité d'accueil compte désormais via §06.
- **`editor-validation.ts`** : aucun bloqueur de publication ne doit référencer §07 pour les HEB.
- **`MODE_ESSENTIAL`** (mode rapide) : `'07'` n'y est pas → rien à changer ; vérifier que masquer §07 pour HEB ne casse pas le mode rapide.
- **Drawer** (`object-drawer/utils.ts` `parseCapacities`) : lit `object_capacity` — bénéficie de la dérivation, aucun changement requis ; vérifier qu'il n'affiche pas des doublons.
- **Documentation** : entrée décision log `lot1_mapping_decisions.md` (§64 à créer) + mise à jour de la ligne « Editor §07 capacity-metric filtering » et de la mémoire MCP.
