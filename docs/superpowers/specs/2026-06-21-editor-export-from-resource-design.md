# Design — Export éditeur = objet complet depuis la BDD (catalogues retirés, ré-importable)

Date : 2026-06-21
Statut : design validé (corrigé après découverte d'un défaut — voir §8)
Périmètre : frontend uniquement (`bertel-tourism-ui`) — aucun changement SQL.

## 1. Problème

L'export JSON de l'éditeur plein-écran (§98, `OUTILS` → Import/Export) sérialise
`editor.draft`, l'**état mémoire complet de l'éditeur**. Cet état mêle, par section :

1. les **données propres de l'objet** (ce qu'on veut exporter) ;
2. les **catalogues de référence** chargés pour alimenter les menus déroulants
   (`*Options` : `categoryOptions`, `dietaryTagOptions`, `allergenOptions`,
   `languageOptions`, `equipmentOptions`, `schemeOptions`, `domains[].nodes`…),
   communs à toute la plateforme — pas des données de l'objet.

Sur `HLORUN00000000TV` (un HLO), le fichier fait 273 Ko et contient un bloc `menus`
complet (catégories, allergènes, régimes), `meetingRooms`, `activity`, `event`,
`itinerary` — tous **non applicables au type HLO** (données vides : `items: []`,
`unavailableReason` posé) mais dont les catalogues sont recrachés. Illisible et trompeur.

Cause racine : `serializeObjectJson(editor.draft, …)`
(`features/object-editor/io/object-io-serialize.ts:42`), enveloppe `modules: draft`.

## 2. Objectif

L'export JSON devient une **photo fidèle et compacte de l'objet éditable complet, frais
de la BDD**, sans catalogues ni modules hors-type. Le fichier reste **ré-importable**
dans l'éditeur (round-trip préservé).

« Toutes les options de l'objet » = les valeurs **propres** à l'objet (équipements
possédés, classements, tags, zones/communes, descriptions, capacité…). **Pas** les
catalogues globaux.

## 3. Décisions verrouillées (issues du brainstorming)

| Décision | Choix |
|----------|-------|
| But du fichier | Données complètes **et** ré-importable |
| Source | **Loader complet `getObjectWorkspaceResource(objectId, langPrefs)`** (appel frais BDD = `get_object_resource` **+** selects d'enrichissement), puis retrait des catalogues |
| Brouillon sale | L'export reflète l'état **BDD enregistré** ; avertissement non bloquant si `editor.isDirty` ; modifs non sauvegardées non incluses |
| Portée CSV | Aligné sur la BDD (consomme `ws.modules` frais ; sérialiseur CSV inchangé) |
| Compat import | v1 (catalogues présents) **et** v2 (catalogues vides) — **même forme `modules`**, `parseImportedObjectJson` inchangé |
| PDF | Inchangé (impression de l'éditeur à l'écran) |
| SQL | Aucun changement |

## 4. Pourquoi `get_object_resource` brut ne suffit PAS (défaut corrigé)

`get_object_resource.raw` **ne porte pas tout l'objet éditable**. Les **zones**
(communes desservies, §41) sont lues par un **select direct** sur `object_zone`
(`getObjectWorkspaceZonesModule`, `object-workspace.ts:5670`), pas par le RPC. Exporter
`resource.raw` seul **perdrait silencieusement les zones** (et tout autre champ chargé
par select direct). C'est l'inverse de « l'objet complet ».

`getObjectWorkspaceResource` (`object-workspace.ts:3760`) est le **loader de l'éditeur** :
il appelle `getObjectResource` PUIS lance les selects d'enrichissement (zones, taxonomie,
catalogues amenity/payment/contacts…) et renvoie le `ObjectWorkspaceModules` **complet**.
C'est la source correcte. On lui retire ensuite les catalogues pour le fichier.

## 5. Briques existantes réutilisées

- `getObjectWorkspaceResource(objectId, langPrefs)` → `ObjectWorkspaceResource`
  `{ id, name, type?, detail, modules, permissions }`. `modules` = objet éditable complet
  (données **+** catalogues).
- `serializeObjectJson(modules, meta)` / `serializeObjectCsv(modules, meta)` /
  `parseImportedObjectJson(raw)` (`io/object-io-serialize.ts`) — déjà en place.
- `serializeObjectCsv` lit déjà depuis `modules` (name/status/adresse/contacts) → CSV
  aligné « gratuitement » en lui passant `ws.modules`.
- `parseImportedObjectJson` ne lit QUE `modules` (ignore le numéro de version) → v1 et v2
  parsent à l'identique, **sans modification**.
- `editor.replaceModule<K>(key, value)` / `editor.draft` / `editor.isDirty`
  (`useObjectEditorState.ts`).
- `langPrefs` : `useSessionStore((s) => s.langPrefs)` ; `downloadTextFile` /
  `readFileText` (`io/object-io-effects.ts`).

## 6. Conception détaillée

L'enveloppe **ne change pas de forme** : toujours `{ format, version, objectId, type,
exportedAt, modules }`. v2 signale seulement « frais BDD + catalogues retirés ». La
différence est dans le **contenu** des `modules` (catalogues vidés), pas dans la structure.

### 6.1 `object-io-serialize.ts`

- `ObjectExportEnvelope.version` : `1` → `2` ; constante de `serializeObjectJson` idem.
  (`serializeObjectJson` reste générique : il emballe les `modules` qu'on lui donne — le
  retrait des catalogues se fait AVANT l'appel.)
- **Nouvelle fonction pure** `stripCatalogOptions(modules: ObjectWorkspaceModules): ObjectWorkspaceModules` :
  copie profonde ; pour chaque module, vide toute clé `…Options` qui est un tableau ;
  cas spécial taxonomie : `domains[].nodes` → `[]` (on conserve `domains[].assignment`
  et les métadonnées de domaine). Convention : les catalogues sont les clés `*Options`
  (+ `domains[].nodes`) ; les données sont nommées autrement (`items`, `selected*Codes`,
  `objectItems`, `domains[].assignment`, champs propres) et ne sont jamais touchées.
- **Nouvelle fonction pure** `restoreCatalogOptions(incoming, draftModule)` (inverse,
  pour l'import) : repart de `incoming` (données du fichier) ; pour chaque clé `*Options`,
  si le tableau importé est **vide** et que le brouillon en a un **non vide**, prendre
  celui du brouillon ; cas taxonomie : par domaine, si `incoming.nodes` est vide, réinjecter
  les `nodes` du domaine correspondant du brouillon (apparié par `domain`). Règle
  symétrique qui marche pour v2 (catalogues vides → restaurés) **et** v1 (catalogues
  présents → conservés).

### 6.2 `ObjectEditPage.tsx` (composant `EditorReady`)

- Ajouter `const langPrefs = useSessionStore((s) => s.langPrefs)` ; importer
  `getObjectWorkspaceResource`, `useSessionStore`, `stripCatalogOptions`,
  `restoreCatalogOptions`.
- `handleExportJson` devient **async** :
  ```ts
  try {
    const ws = await getObjectWorkspaceResource(objectId, langPrefs);
    if (editor.isDirty) {
      setStatusMessage('Export basé sur la fiche enregistrée — vos modifications non sauvegardées n’y figurent pas.');
    }
    const meta = { objectId, type: ws.type ?? '', name: ws.name };
    downloadTextFile(`${objectId}.json`, 'application/json',
      serializeObjectJson(stripCatalogOptions(ws.modules), meta));
  } catch (e) {
    setStatusMessage(e instanceof Error ? `Export impossible : ${e.message}` : 'Export impossible.');
  }
  ```
- `handleExportCsv` devient **async** : même `ws` frais →
  `serializeObjectCsv(ws.modules, meta)` (sérialiseur inchangé). Try/catch idem.
  (Chaque bouton fetch indépendamment — acceptable ; pas de cache partagé.)
- `handleImportFile` : après `parseImportedObjectJson`, restaurer les catalogues :
  ```ts
  for (const [key, value] of Object.entries(result.modules)) {
    editor.replaceModule(
      key as keyof typeof editor.draft,
      restoreCatalogOptions(value, editor.draft[key as keyof typeof editor.draft]) as never,
    );
  }
  ```

### 6.3 `ImportExportModal.tsx`

- Texte du hint export : « Télécharge la fiche courante (telle qu'affichée à l'écran). »
  → « Télécharge la fiche **telle qu'enregistrée en base** (vos modifications non
  sauvegardées ne sont pas incluses). »

## 7. Tests

- `object-io-serialize.test.ts` :
  - `serializeObjectJson` : `version` vaut **2** (mise à jour de l'assertion existante).
  - `stripCatalogOptions` : vide les `*Options` et `domains[].nodes`, **conserve**
    données (`items`, `selected*Codes`, `objectItems`, `domains[].assignment`, champs).
  - `restoreCatalogOptions` : v2 (catalogues vides → réinjectés depuis le brouillon),
    v1 (catalogues présents → conservés), données du fichier toujours gagnantes,
    cas taxonomie (`domains[].nodes` restaurés par domaine, `assignment` du fichier gardé).
  - round-trip `parse(serialize(modules))` toujours vert (forme inchangée).
- `ImportExportModal.test.tsx` : assertion sur le nouveau hint.
- Suites Jest éditeur + `tsc --noEmit` + `next build` verts. Frontend-only.

## 8. Risques / notes

- **Défaut corrigé** (origine de la révision) : `get_object_resource.raw` est incomplet
  (zones en select direct) ; on source donc depuis `getObjectWorkspaceResource`. Vérifié
  sur `object-workspace.ts:5670`.
- Coût export : un appel loader complet (`get_object_resource` + ~13 selects ref). Action
  délibérée et rare ⇒ acceptable.
- Échec réseau export : try/catch + message.
- Restauration catalogues à l'import : la sauvegarde ne dépend PAS des catalogues
  (elle écrit les codes/données) ; la restauration est un confort UX (déroulants peuplés).
  Couverte par tests.
- Nouvelle famille de catalogue avec une clé hors-convention (ni `*Options` ni
  `domains[].nodes`) : à ajouter explicitement dans `stripCatalogOptions`/
  `restoreCatalogOptions` le jour venu. Convention actuelle vérifiée sur l'export réel.
- PDF inchangé (reflète l'écran). Aligner plus tard si besoin.
