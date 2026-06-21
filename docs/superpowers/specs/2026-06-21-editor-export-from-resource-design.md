# Design — Export éditeur depuis `get_object_resource` (objet complet, ré-importable)

Date : 2026-06-21
Statut : design validé (en attente de relecture utilisateur)
Périmètre : frontend uniquement (`bertel-tourism-ui`) — aucun changement SQL.

## 1. Problème

L'export JSON de l'éditeur plein-écran (§98, `OUTILS` → Import/Export) sérialise
`editor.draft`, c'est-à-dire **l'état mémoire complet de l'éditeur**. Cet état contient,
pour chaque section, deux choses de natures différentes :

1. les **données propres de l'objet** (ce qu'on veut exporter) ;
2. les **catalogues de référence** chargés pour alimenter les menus déroulants
   (`categoryOptions`, `dietaryTagOptions`, `allergenOptions`, `languageOptions`,
   `equipmentOptions`…), communs à toute la plateforme — pas des données de l'objet.

Conséquence observée sur `HLORUN00000000TV` (un HLO, hébergement locatif) : le fichier
fait 273 Ko et contient un bloc `menus` complet (catégories, allergènes, régimes), un bloc
`meetingRooms`, `activity`, `event`, `itinerary` — tous **non applicables au type HLO**.
Les données réelles y sont vides (`items: []`, `occurrences: []`, `unavailableReason`
posé), mais les catalogues sont recrachés. L'export est illisible et trompeur.

Cause racine : `serializeObjectJson(editor.draft, …)` dans
`features/object-editor/io/object-io-serialize.ts:42`, dont l'enveloppe porte
`modules: draft`.

## 2. Objectif

L'export JSON devient une **photo fidèle et compacte de l'objet tel qu'enregistré en
BDD**, obtenue par un **appel frais à `get_object_resource`**. Plus de catalogues, plus
de modules hors-type. Le fichier reste **ré-importable** dans l'éditeur (round-trip
préservé).

« Toutes les options de l'objet » = les valeurs **propres** à l'objet (équipements
possédés, classements, tags, descriptions, capacité…), c'est-à-dire tout ce que
`get_object_resource` renvoie dans `.raw`. **Pas** les catalogues globaux.

## 3. Décisions verrouillées (issues du brainstorming)

| Décision | Choix |
|----------|-------|
| But du fichier | Données complètes **et** ré-importable |
| Source | Appel frais `getObjectResource(objectId, langPrefs)` → `detail.raw` |
| Brouillon sale | L'export reflète l'état **BDD enregistré** ; avertissement non bloquant si `editor.isDirty` ; modifs non sauvegardées non incluses |
| Portée CSV | Aligné sur la BDD (même `detail` frais) |
| Compat import | Tolérer **v1 (`modules`) et v2 (`resource`)** |
| PDF | Inchangé (impression de l'éditeur à l'écran) |
| SQL | Aucun changement — réutilise `get_object_resource` + `parseObjectWorkspace` existants |

## 4. Briques existantes réutilisées

- `getObjectResource(objectId, langPrefs)` (`services/rpc.ts:258`) → `ObjectDetail`.
  Essaie `get_object_with_deep_data` puis fallback `get_object_resource`. `.raw` =
  payload objet complet (bloc `object` = `get_object_resource` verbatim, + `actors` /
  `organizations` / `parent_objects` quand deep_data est dispo). **Sans catalogues.**
- `parseObjectWorkspace(detail, langPrefs)` (`services/object-workspace.ts:3762`) :
  parser **pur** qui transforme un `ObjectDetail` en `ObjectWorkspaceModules`
  **données seules** (les catalogues sont ajoutés séparément par l'enrichissement, pas
  par ce parser). C'est exactement la brique de reconstruction pour le ré-import.
- `langPrefs` : `useSessionStore((s) => s.langPrefs)` — disponible dans `EditorReady`.
- `editor.replaceModule(key, value)` : applique un module sur le brouillon (marque dirty
  par diff de snapshot). Mécanisme d'application d'import inchangé.

## 5. Conception détaillée

### 5.1 Enveloppe v2

```jsonc
{
  "format": "bertel-object",
  "version": 2,
  "objectId": "HLORUN00000000TV",
  "type": "HLO",
  "exportedAt": "2026-06-21T…Z",
  "resource": { /* …detail.raw : objet complet en BDD, sans catalogues */ }
}
```

L'ancienne enveloppe v1 portait `modules: ObjectWorkspaceModules`. v2 porte `resource`
(le payload BDD brut) comme source de vérité.

### 5.2 Export — `object-io-serialize.ts`

- Nouvelle fonction `serializeObjectResourceJson(resource: unknown, meta: ObjectIoMeta): string`
  qui émet l'enveloppe v2. (On conserve `serializeObjectJson` legacy pour les tests v1 ou
  on la retire — voir §7.)
- `serializeObjectCsv` : signature adaptée pour lire les champs depuis la **ressource**
  (`resource.name`, `resource.status`, `resource.location.{address,postcode,city}`,
  premier `phone`/`email` des canaux de contact de la ressource) au lieu de `draft`.
  Réutiliser le patron d'extraction de `services/selection-export.ts`
  (`detail.raw.location`).

### 5.3 Export — `ObjectEditPage.tsx`

- `handleExportJson` devient **async** :
  1. `const detail = await getObjectResource(objectId, langPrefs)` (try/catch → message
     d'erreur si échec, pas de téléchargement vide).
  2. Si `editor.isDirty` → `setStatusMessage(...)` d'avertissement (modifs non incluses).
  3. `downloadTextFile(`${objectId}.json`, 'application/json',
     serializeObjectResourceJson(detail.raw, { objectId, type: detail.type ?? '', name: detail.name }))`.
- `handleExportCsv` : même `detail` frais (un seul fetch peut servir JSON et CSV si
  déclenchés ensemble ; ici chaque bouton fetch indépendamment — acceptable, ou
  factoriser un petit `fetchExportDetail()`).
- Modale `ImportExportModal` : texte « telle qu'affichée à l'écran » → « telle
  qu'enregistrée en base ».

### 5.4 Import — `object-io-serialize.ts`

`parseImportedObjectJson` renvoie un résultat **discriminé** :

```ts
type ImportParseResult =
  | { ok: true; kind: 'resource'; resource: unknown }            // v2
  | { ok: true; kind: 'modules'; modules: Partial<ObjectWorkspaceModules> } // v1
  | { ok: false; error: string };
```

- v2 : présence d'un objet `resource` → `{ ok, kind: 'resource', resource }`.
- v1 : présence d'un objet `modules` → chemin actuel (filtre `KNOWN_MODULE_KEYS`).
- Ni l'un ni l'autre → erreur. Ce module reste **pur** (pas d'appel au parser
  service-level) : la reconstruction v2 se fait côté page (qui a `langPrefs`).

### 5.5 Import — `ObjectEditPage.tsx` / `handleImportFile`

- v2 : reconstruire `const detail = { id: objectId, name: resource.name ?? '', type: resource.type, raw: resource }`,
  puis `const parsed = parseObjectWorkspace(detail, langPrefs)` → modules données seules.
- v1 : `parsed = result.modules` (chemin actuel).
- Application en **préservant les catalogues vivants du brouillon** :
  ```ts
  for (const [key, value] of Object.entries(parsed)) {
    editor.replaceModule(key, mergeImportedModule(editor.draft[key], value));
  }
  ```

### 5.6 `mergeImportedModule` — helper pur (nouveau, testé)

Problème : `parseObjectWorkspace` produit des modules dont les tableaux de catalogues
sont vides (`categoryOptions: []`, etc.). Les appliquer tels quels écraserait les listes
déroulantes vivantes du brouillon.

Règle de fusion retenue — **liste blanche des clés de catalogue** :

> Pour chaque module, prendre tous les champs **importés** ; puis, pour chaque clé de
> catalogue connue de ce module (les `*Options` + cas nommés : `equipmentOptions`,
> `categoryOptions`, `dietaryTagOptions`, `allergenOptions`, `cuisineTypeOptions`,
> `languageOptions`, `zoneOptions`, etc.), **réinjecter la valeur du brouillon**.

Déterministe et sans ambiguïté donnée/catalogue : on ne préserve QUE des clés de
catalogue identifiées, jamais des champs de données. Les noms de clés de catalogue sont
recensés à partir des fonctions d'enrichissement `getObjectWorkspace*Module`
(`object-workspace.ts`) et figés dans une constante testée
(`CATALOG_OPTION_KEYS` par module, ou un set plat de noms de clés). Alternative écartée
(« ne jamais laisser un tableau importé vide écraser un tableau brouillon peuplé ») : trop
floue, risquerait de préserver une donnée que l'utilisateur a réellement vidée.

## 6. Tests

- `object-io-serialize.test.ts` :
  - `serializeObjectResourceJson` émet `version: 2`, `resource`, **aucune** clé catalogue.
  - `parseImportedObjectJson` : reconnaît v2 (`kind: 'resource'`), v1 (`kind: 'modules'`),
    rejette le bruit.
  - `serializeObjectCsv` lit depuis la ressource.
- `mergeImportedModule` : préserve les catalogues (liste blanche), applique les données.
- Round-trip (intégration légère) : `resource` → `parseObjectWorkspace` → modules
  cohérents (au moins un module données présent, catalogues du brouillon préservés).
- `ImportExportModal.test.tsx` : texte mis à jour.
- Suites Jest éditeur + `tsc --noEmit` + `next build` verts.

## 7. Hors-périmètre / différé

- PDF : reste l'impression de l'éditeur à l'écran (reflète l'écran, pas la BDD). Aligner
  plus tard si besoin.
- Retrait éventuel de `serializeObjectJson` (v1) : on **garde** la lecture v1 à l'import
  (compat) ; l'écriture v1 disparaît. La fonction legacy d'écriture peut être supprimée
  une fois les tests bascule v2 en place.
- Aucune migration, aucun déploiement SQL.

## 8. Risques

- `getObjectResource` renvoie le **deep_data** quand dispo (donc `.raw` inclut
  `actors`/`organizations`/`parent_objects`). C'est « l'objet complet » au sens large —
  conforme à l'intention. Si on veut strictement le bloc objet, filtrer `deep_data`/
  `actors`/… à la sérialisation (décision : **on garde tout**, c'est plus complet).
- Échec réseau à l'export : géré par try/catch + message.
- Fusion catalogues à l'import : couverte par la liste blanche + tests.
