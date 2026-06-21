# Export éditeur depuis la BDD (catalogues retirés, ré-importable) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** L'export JSON de l'éditeur devient une photo fidèle et compacte de l'objet éditable complet, frais de la BDD, sans catalogues de référence ni modules hors-type, tout en restant ré-importable.

**Architecture:** L'enveloppe d'export garde sa forme `{ format, version, objectId, type, exportedAt, modules }`. L'export source désormais le **loader complet** `getObjectWorkspaceResource` (appel BDD frais = `get_object_resource` + selects d'enrichissement, incluant les zones §41) puis retire les catalogues (`stripCatalogOptions`). L'import restaure les catalogues depuis le brouillon vivant (`restoreCatalogOptions`) pour ne pas vider les listes déroulantes. `parseImportedObjectJson` est inchangé (il ignore le numéro de version ⇒ v1 et v2, de même forme, parsent à l'identique).

**Tech Stack:** TypeScript, React (Next.js app router), Jest (jsdom), Zustand (`useSessionStore`), services Supabase RPC existants.

## Global Constraints

- Frontend uniquement — **aucun changement SQL, aucune migration, aucun déploiement**.
- Réutiliser les briques existantes : `getObjectWorkspaceResource` (`services/object-workspace.ts:3760`), `serializeObjectJson` / `serializeObjectCsv` / `parseImportedObjectJson` (`features/object-editor/io/object-io-serialize.ts`), `editor.replaceModule` / `editor.draft` / `editor.isDirty` (`useObjectEditorState.ts`), `useSessionStore((s) => s.langPrefs)`.
- Catalogues = clés `*Options` (tableaux) + `domains[].nodes` (taxonomie). Données = tout le reste (`items`, `selected*Codes`, `objectItems`, `domains[].assignment`, champs propres) — jamais touchées.
- Convention de fusion symétrique : à l'export on vide les catalogues ; à l'import les **données du fichier gagnent**, les catalogues vides sont réinjectés depuis le brouillon (un catalogue importé non vide — fichier v1 — est conservé).
- Commits : directement sur `master`, **uniquement les hunks de cette tâche**, pas de co-author trailer, pas d'amend (le PO commite en parallèle via Cursor). `--no-verify` autorisé (hooks lourds locaux).
- Vert obligatoire avant de déclarer fini : `npx jest <fichier ciblé>`, puis en fin de chantier `npx tsc --noEmit` + `npm run build` + suite éditeur.
- Répertoire de travail des commandes : `bertel-tourism-ui/`.

---

### Task 1 : Bumper l'enveloppe d'export en version 2

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/io/object-io-serialize.ts:12-19,42-52`
- Test: `bertel-tourism-ui/src/features/object-editor/io/object-io-serialize.test.ts:66`

**Interfaces:**
- Consumes: rien.
- Produces: `ObjectExportEnvelope.version: 2` (la forme de l'enveloppe est inchangée par ailleurs).

- [ ] **Step 1 : Mettre à jour le test de version (RED)**

Dans `object-io-serialize.test.ts`, remplacer l'assertion existante :

```ts
    expect(env.version).toBe(1);
```

par :

```ts
    expect(env.version).toBe(2);
```

- [ ] **Step 2 : Lancer le test, vérifier l'échec**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/io/object-io-serialize.test.ts -t "versioned envelope"`
Expected: FAIL — `Expected: 2, Received: 1`.

- [ ] **Step 3 : Bumper la version dans la source**

Dans `object-io-serialize.ts`, type de l'enveloppe :

```ts
export interface ObjectExportEnvelope {
  format: 'bertel-object';
  version: 2;
  objectId: string;
  type: string;
  exportedAt: string;
  modules: ObjectWorkspaceModules;
}
```

et le littéral dans `serializeObjectJson` :

```ts
  const envelope: ObjectExportEnvelope = {
    format: 'bertel-object',
    version: 2,
    objectId: meta.objectId,
    type: meta.type,
    exportedAt: new Date().toISOString(),
    modules: draft,
  };
```

- [ ] **Step 4 : Lancer le test, vérifier le succès**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/io/object-io-serialize.test.ts`
Expected: PASS (tous les tests du fichier).

- [ ] **Step 5 : Commit**

```bash
cd "C:/Users/dphil/Bertel3.0"
git add bertel-tourism-ui/src/features/object-editor/io/object-io-serialize.ts \
        bertel-tourism-ui/src/features/object-editor/io/object-io-serialize.test.ts
git commit --no-verify -m "feat(editor): enveloppe export v2 (objet BDD frais, catalogues retirés)"
```

---

### Task 2 : `stripCatalogOptions` — retirer les catalogues à l'export

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/io/object-io-serialize.ts` (ajout après `serializeObjectCsv`)
- Test: `bertel-tourism-ui/src/features/object-editor/io/object-io-serialize.test.ts` (nouveau `describe`)

**Interfaces:**
- Consumes: `isObject` (helper déjà présent dans le fichier, ligne 31), `ObjectWorkspaceModules`.
- Produces: `export function stripCatalogOptions(modules: ObjectWorkspaceModules): ObjectWorkspaceModules` — copie où toute clé `*Options` (tableau) et `domains[].nodes` sont vidées ; les données sont conservées.

- [ ] **Step 1 : Écrire les tests (RED)**

Ajouter à la fin de `object-io-serialize.test.ts` :

```ts
import { stripCatalogOptions, restoreCatalogOptions } from './object-io-serialize';

describe('stripCatalogOptions', () => {
  it('empties *Options arrays but keeps object data', () => {
    const modules = {
      menus: {
        categoryOptions: [{ id: 'a', code: 'drinks', label: 'Boissons' }],
        allergenOptions: [{ id: 'b', code: 'gluten', label: 'Gluten' }],
        items: [{ id: 'm1', name: 'Menu midi' }],
        unavailableReason: 'Module non applicable au type HLO.',
      },
      characteristics: {
        languageOptions: [{ id: 'l', code: 'fr', label: 'Français' }],
        selectedAmenityCodes: ['wifi', 'parking'],
      },
    } as unknown as ObjectWorkspaceModules;

    const stripped = stripCatalogOptions(modules) as unknown as Record<string, any>;
    expect(stripped.menus.categoryOptions).toEqual([]);
    expect(stripped.menus.allergenOptions).toEqual([]);
    expect(stripped.menus.items).toEqual([{ id: 'm1', name: 'Menu midi' }]);
    expect(stripped.menus.unavailableReason).toBe('Module non applicable au type HLO.');
    expect(stripped.characteristics.languageOptions).toEqual([]);
    expect(stripped.characteristics.selectedAmenityCodes).toEqual(['wifi', 'parking']);
  });

  it('empties taxonomy domains[].nodes but keeps the assignment', () => {
    const modules = {
      taxonomy: {
        domains: [
          {
            domain: 'taxonomy_hlo',
            nodes: [{ id: 'n1', code: 'auberge' }, { id: 'n2', code: 'studio' }],
            assignment: { recordId: 'r1', nodeId: 'n1', code: 'auberge' },
          },
        ],
        unavailableReason: null,
      },
    } as unknown as ObjectWorkspaceModules;

    const stripped = stripCatalogOptions(modules) as unknown as Record<string, any>;
    expect(stripped.taxonomy.domains[0].nodes).toEqual([]);
    expect(stripped.taxonomy.domains[0].assignment).toEqual({ recordId: 'r1', nodeId: 'n1', code: 'auberge' });
    expect(stripped.taxonomy.domains[0].domain).toBe('taxonomy_hlo');
  });

  it('does not mutate the input', () => {
    const modules = {
      menus: { categoryOptions: [{ id: 'a' }], items: [] },
    } as unknown as ObjectWorkspaceModules;
    stripCatalogOptions(modules);
    expect((modules as unknown as Record<string, any>).menus.categoryOptions).toHaveLength(1);
  });
});
```

- [ ] **Step 2 : Lancer les tests, vérifier l'échec**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/io/object-io-serialize.test.ts -t "stripCatalogOptions"`
Expected: FAIL — `stripCatalogOptions is not a function` / import error.

- [ ] **Step 3 : Implémenter `stripCatalogOptions`**

Ajouter dans `object-io-serialize.ts`, après `serializeObjectCsv` :

```ts
/** Catalog/option arrays are editor-load reference data (dropdown choices), NOT object
 *  data. They follow the `*Options` naming convention; taxonomy nests its catalog under
 *  `domains[].nodes` (the object's own choice lives in `domains[].assignment`). */
function isCatalogKey(key: string): boolean {
  return key.endsWith('Options');
}

function stripModuleCatalogs(module: unknown): unknown {
  if (!isObject(module)) {
    return module;
  }
  const out: Record<string, unknown> = { ...module };
  for (const key of Object.keys(out)) {
    if (isCatalogKey(key) && Array.isArray(out[key])) {
      out[key] = [];
    }
  }
  if (Array.isArray(out.domains)) {
    out.domains = (out.domains as unknown[]).map((domain) =>
      isObject(domain) ? { ...domain, nodes: [] } : domain,
    );
  }
  return out;
}

/** Returns a copy of the editor modules with every reference catalog emptied. Used so the
 *  JSON export carries only the object's own data (no menu categories / allergens / etc.). */
export function stripCatalogOptions(modules: ObjectWorkspaceModules): ObjectWorkspaceModules {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(modules)) {
    out[key] = stripModuleCatalogs(value);
  }
  return out as ObjectWorkspaceModules;
}
```

- [ ] **Step 4 : Lancer les tests, vérifier le succès**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/io/object-io-serialize.test.ts -t "stripCatalogOptions"`
Expected: PASS (3 tests).

- [ ] **Step 5 : Commit**

```bash
cd "C:/Users/dphil/Bertel3.0"
git add bertel-tourism-ui/src/features/object-editor/io/object-io-serialize.ts \
        bertel-tourism-ui/src/features/object-editor/io/object-io-serialize.test.ts
git commit --no-verify -m "feat(editor): stripCatalogOptions — retire les catalogues de l'export"
```

---

### Task 3 : `restoreCatalogOptions` — réinjecter les catalogues à l'import

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/io/object-io-serialize.ts` (ajout après `stripCatalogOptions`)
- Test: `bertel-tourism-ui/src/features/object-editor/io/object-io-serialize.test.ts` (nouveau `describe`)

**Interfaces:**
- Consumes: `isObject`, `isCatalogKey`, `stripModuleCatalogs` (du fichier).
- Produces: `export function restoreCatalogOptions<T>(incoming: T, draftModule: unknown): T` — repart de `incoming` (données du fichier) ; pour chaque clé `*Options` vide, réinjecte celle du brouillon si elle est non vide ; pour la taxonomie, restaure `domains[].nodes` par domaine (apparié par `domain`) quand le fichier les a vidés. Les données du fichier gagnent toujours.

- [ ] **Step 1 : Écrire les tests (RED)**

Ajouter à la fin de `object-io-serialize.test.ts` :

```ts
describe('restoreCatalogOptions', () => {
  it('refills an empty *Options from the draft, keeps file data', () => {
    const incoming = { categoryOptions: [], items: [{ id: 'm1' }] };
    const draft = { categoryOptions: [{ id: 'a', code: 'drinks' }], items: [{ id: 'OLD' }] };
    const merged = restoreCatalogOptions(incoming, draft) as Record<string, any>;
    expect(merged.categoryOptions).toEqual([{ id: 'a', code: 'drinks' }]);
    expect(merged.items).toEqual([{ id: 'm1' }]); // file data wins
  });

  it('keeps a non-empty imported *Options (v1 file with catalogs)', () => {
    const incoming = { categoryOptions: [{ id: 'fromFile' }], items: [] };
    const draft = { categoryOptions: [{ id: 'fromDraft' }], items: [] };
    const merged = restoreCatalogOptions(incoming, draft) as Record<string, any>;
    expect(merged.categoryOptions).toEqual([{ id: 'fromFile' }]);
  });

  it('restores taxonomy domains[].nodes per domain, keeps the file assignment', () => {
    const incoming = { domains: [{ domain: 'taxonomy_hlo', nodes: [], assignment: { nodeId: 'NEW' } }] };
    const draft = {
      domains: [{ domain: 'taxonomy_hlo', nodes: [{ id: 'n1' }, { id: 'n2' }], assignment: { nodeId: 'OLD' } }],
    };
    const merged = restoreCatalogOptions(incoming, draft) as Record<string, any>;
    expect(merged.domains[0].nodes).toEqual([{ id: 'n1' }, { id: 'n2' }]);
    expect(merged.domains[0].assignment).toEqual({ nodeId: 'NEW' }); // file wins
  });

  it('round-trips strip→restore back to the populated draft catalogs', () => {
    const draftModule = {
      categoryOptions: [{ id: 'a' }, { id: 'b' }],
      items: [{ id: 'm1' }],
    };
    const stripped = (stripCatalogOptions({ menus: draftModule } as any) as any).menus;
    const restored = restoreCatalogOptions(stripped, draftModule) as Record<string, any>;
    expect(restored.categoryOptions).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(restored.items).toEqual([{ id: 'm1' }]);
  });

  it('passes through a non-object value unchanged', () => {
    expect(restoreCatalogOptions('x' as unknown, {})).toBe('x');
  });
});
```

- [ ] **Step 2 : Lancer les tests, vérifier l'échec**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/io/object-io-serialize.test.ts -t "restoreCatalogOptions"`
Expected: FAIL — `restoreCatalogOptions is not a function`.

- [ ] **Step 3 : Implémenter `restoreCatalogOptions`**

Ajouter dans `object-io-serialize.ts`, après `stripCatalogOptions` :

```ts
function restoreModuleCatalogs(incoming: unknown, draftModule: unknown): unknown {
  if (!isObject(incoming)) {
    return incoming;
  }
  const out: Record<string, unknown> = { ...incoming };
  const draft: Record<string, unknown> = isObject(draftModule) ? draftModule : {};

  for (const key of Object.keys(out)) {
    const importedEmpty = Array.isArray(out[key]) && (out[key] as unknown[]).length === 0;
    const draftHas = Array.isArray(draft[key]) && (draft[key] as unknown[]).length > 0;
    if (isCatalogKey(key) && importedEmpty && draftHas) {
      out[key] = draft[key];
    }
  }

  if (Array.isArray(out.domains) && Array.isArray(draft.domains)) {
    const draftDomains = draft.domains as unknown[];
    out.domains = (out.domains as unknown[]).map((domain) => {
      if (!isObject(domain) || (Array.isArray(domain.nodes) && domain.nodes.length > 0)) {
        return domain;
      }
      const match = draftDomains.find((candidate) => isObject(candidate) && candidate.domain === domain.domain);
      return isObject(match) && Array.isArray(match.nodes) ? { ...domain, nodes: match.nodes } : domain;
    });
  }
  return out;
}

/** Inverse of stripCatalogOptions for the import path: file data wins, but an emptied
 *  catalog is refilled from the live draft so dropdowns stay populated. A v1 file (catalogs
 *  present) keeps its own. */
export function restoreCatalogOptions<T>(incoming: T, draftModule: unknown): T {
  return restoreModuleCatalogs(incoming, draftModule) as T;
}
```

- [ ] **Step 4 : Lancer les tests, vérifier le succès**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/io/object-io-serialize.test.ts`
Expected: PASS (tout le fichier, incl. round-trip existant).

- [ ] **Step 5 : Commit**

```bash
cd "C:/Users/dphil/Bertel3.0"
git add bertel-tourism-ui/src/features/object-editor/io/object-io-serialize.ts \
        bertel-tourism-ui/src/features/object-editor/io/object-io-serialize.test.ts
git commit --no-verify -m "feat(editor): restoreCatalogOptions — réinjecte les catalogues à l'import"
```

---

### Task 4 : Brancher l'export sur le loader frais + retrait des catalogues (JSON & CSV) + texte modale

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/ObjectEditPage.tsx` (imports ~6-32, `handleExportJson`/`handleExportCsv` ~176-183, ajout `langPrefs`)
- Modify: `bertel-tourism-ui/src/features/object-editor/widgets/ImportExportModal.tsx:58`
- Test: `bertel-tourism-ui/src/features/object-editor/widgets/ImportExportModal.test.tsx`

**Interfaces:**
- Consumes: `getObjectWorkspaceResource` (`services/object-workspace.ts`), `useSessionStore` (`store/session-store`), `stripCatalogOptions` (Task 2), `serializeObjectJson` (Task 1), `serializeObjectCsv`, `downloadTextFile`, `editor.isDirty`, `setStatusMessage`.
- Produces: export JSON/CSV qui reflètent l'état BDD enregistré.

- [ ] **Step 1 : Écrire le test de copie de la modale (RED)**

Vérifier d'abord l'import du composant testé en tête de `ImportExportModal.test.tsx` (le `render`/`screen` y sont déjà). Ajouter un test :

```ts
  it('annonce que l’export reflète la base, pas l’écran', () => {
    render(
      <ImportExportModal
        open
        onClose={() => {}}
        onExportJson={() => {}}
        onExportCsv={() => {}}
        onExportPdf={() => {}}
        onImportFile={() => {}}
        importError={null}
      />,
    );
    expect(screen.getByText(/telle qu.?enregistrée en base/i)).toBeInTheDocument();
  });
```

(Si les helpers `render`/`screen` ne sont pas déjà importés dans ce fichier, ajouter `import { render, screen } from '@testing-library/react';` et `import { ImportExportModal } from './ImportExportModal';`.)

- [ ] **Step 2 : Lancer le test, vérifier l'échec**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/widgets/ImportExportModal.test.tsx -t "reflète la base"`
Expected: FAIL — texte introuvable (la modale dit encore « telle qu'affichée à l'écran »).

- [ ] **Step 3 : Mettre à jour le texte de la modale**

Dans `ImportExportModal.tsx`, remplacer :

```tsx
              <p className="io-modal__hint">Télécharge la fiche courante (telle qu’affichée à l’écran).</p>
```

par :

```tsx
              <p className="io-modal__hint">Télécharge la fiche telle qu’enregistrée en base (vos modifications non sauvegardées ne sont pas incluses).</p>
```

- [ ] **Step 4 : Vérifier le test de modale au vert**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/widgets/ImportExportModal.test.tsx`
Expected: PASS.

- [ ] **Step 5 : Câbler les handlers d'export dans `ObjectEditPage.tsx`**

Ajouter les imports manquants (regrouper avec les imports existants en tête de fichier) :

```ts
import { useSessionStore } from '../../store/session-store';
import { getObjectWorkspaceResource } from '../../services/object-workspace';
```

et compléter l'import des fonctions IO :

```ts
import {
  serializeObjectJson,
  serializeObjectCsv,
  parseImportedObjectJson,
  stripCatalogOptions,
  restoreCatalogOptions,
  type ObjectIoMeta,
} from './io/object-io-serialize';
```

Dans le composant `EditorReady`, ajouter près des autres hooks (après `const editor = …`) :

```ts
  const langPrefs = useSessionStore((state) => state.langPrefs);
```

Remplacer `handleExportJson` et `handleExportCsv` (qui utilisaient `editor.draft`) par des versions async qui font un appel frais et retirent les catalogues :

```ts
  async function handleExportJson() {
    try {
      const ws = await getObjectWorkspaceResource(objectId, langPrefs);
      if (editor.isDirty) {
        setStatusMessage('Export basé sur la fiche enregistrée — vos modifications non sauvegardées n’y figurent pas.');
      }
      const meta: ObjectIoMeta = { objectId, type: ws.type ?? '', name: ws.name };
      downloadTextFile(`${objectId}.json`, 'application/json', serializeObjectJson(stripCatalogOptions(ws.modules), meta));
    } catch (error) {
      setStatusMessage(error instanceof Error ? `Export impossible : ${error.message}` : 'Export impossible.');
    }
  }

  async function handleExportCsv() {
    try {
      const ws = await getObjectWorkspaceResource(objectId, langPrefs);
      const meta: ObjectIoMeta = { objectId, type: ws.type ?? '', name: ws.name };
      downloadTextFile(`${objectId}.csv`, 'text/csv', serializeObjectCsv(ws.modules, meta));
    } catch (error) {
      setStatusMessage(error instanceof Error ? `Export impossible : ${error.message}` : 'Export impossible.');
    }
  }
```

Mettre à jour le câblage de la modale pour gérer les handlers async (le prop type `() => void` accepte un retour `Promise<void>`, mais on enveloppe explicitement pour la lisibilité) :

```tsx
        onExportJson={() => void handleExportJson()}
        onExportCsv={() => void handleExportCsv()}
```

Supprimer la variable `ioMeta` devenue inutile (le `meta` est désormais construit dans chaque handler à partir de `ws`), **sauf** si `handleExportPdf` ou un autre consommateur l'utilise encore — dans ce cas la laisser. Vérifier par recherche `ioMeta` dans le fichier avant suppression.

- [ ] **Step 6 : Vérifier la compilation et la suite éditeur**

Run: `cd bertel-tourism-ui && npx tsc --noEmit`
Expected: 0 erreur.

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor`
Expected: PASS (aucune régression).

- [ ] **Step 7 : Commit**

```bash
cd "C:/Users/dphil/Bertel3.0"
git add bertel-tourism-ui/src/features/object-editor/ObjectEditPage.tsx \
        bertel-tourism-ui/src/features/object-editor/widgets/ImportExportModal.tsx \
        bertel-tourism-ui/src/features/object-editor/widgets/ImportExportModal.test.tsx
git commit --no-verify -m "feat(editor): export JSON/CSV depuis le loader BDD frais, catalogues retirés"
```

---

### Task 5 : Brancher la restauration des catalogues à l'import

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/ObjectEditPage.tsx:205-211` (`handleImportFile`, boucle `replaceModule`)

**Interfaces:**
- Consumes: `restoreCatalogOptions` (Task 3, déjà importé en Task 4), `editor.draft`, `editor.replaceModule`.
- Produces: import qui réapplique les données du fichier sans vider les listes déroulantes.

- [ ] **Step 1 : Modifier la boucle d'application**

Dans `handleImportFile`, remplacer :

```ts
    // Apply each known module onto the draft — replaceModule marks it dirty by snapshot diff.
    for (const [key, value] of Object.entries(result.modules)) {
      editor.replaceModule(
        key as keyof typeof editor.draft,
        value as (typeof editor.draft)[keyof typeof editor.draft],
      );
    }
```

par :

```ts
    // Apply each known module onto the draft — replaceModule marks it dirty by snapshot diff.
    // restoreCatalogOptions keeps the live draft's reference catalogs so a v2 export (catalogs
    // stripped) doesn't blank the dropdowns; file data still wins. A v1 file keeps its catalogs.
    for (const [key, value] of Object.entries(result.modules)) {
      const moduleKey = key as keyof typeof editor.draft;
      editor.replaceModule(
        moduleKey,
        restoreCatalogOptions(value, editor.draft[moduleKey]) as (typeof editor.draft)[keyof typeof editor.draft],
      );
    }
```

- [ ] **Step 2 : Vérifier la compilation**

Run: `cd bertel-tourism-ui && npx tsc --noEmit`
Expected: 0 erreur.

- [ ] **Step 3 : Vérifier la suite éditeur**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor`
Expected: PASS.

- [ ] **Step 4 : Commit**

```bash
cd "C:/Users/dphil/Bertel3.0"
git add bertel-tourism-ui/src/features/object-editor/ObjectEditPage.tsx
git commit --no-verify -m "feat(editor): import restaure les catalogues du brouillon (données du fichier prioritaires)"
```

---

### Task 6 : Vérification finale (build + preuve comportementale)

**Files:** aucun (vérification).

- [ ] **Step 1 : Type-check global**

Run: `cd bertel-tourism-ui && npx tsc --noEmit`
Expected: 0 erreur.

- [ ] **Step 2 : Build de production**

Run: `cd bertel-tourism-ui && npm run build`
Expected: exit 0 (les `*.test.*` sont exclus du build).

- [ ] **Step 3 : Suite IO + éditeur complète**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor`
Expected: PASS.

- [ ] **Step 4 : Preuve comportementale (manuel, à rapporter)**

Lancer l'appli (`npm run dev`), ouvrir `/objects/HLORUN00000000TV/edit` → OUTILS → Exporter en JSON. Vérifier sur le fichier téléchargé :
- `version` vaut `2` ;
- le bloc `menus` n'a plus de `categoryOptions`/`allergenOptions`/`dietaryTagOptions` peuplés (tableaux vides) — fini les allergènes ;
- les blocs hors-type (`menus`, `meetingRooms`, `activity`, `event`, `itinerary`) ne contiennent plus que des données vides + `unavailableReason` ;
- les **zones** (`location.zoneCodes`) de l'objet sont présentes (preuve que le loader complet a été utilisé) ;
- la taille du fichier est de l'ordre de quelques Ko (vs 273 Ko).
Puis ré-importer ce fichier : les listes déroulantes (catalogues) restent peuplées et les données du fichier sont appliquées.

- [ ] **Step 5 (optionnel) : Retrait du code mort**

Si `serializeObjectJson` ou `ioMeta` ne sont plus référencés nulle part après le chantier, les supprimer dans un commit `refactor:` dédié. Vérifier par recherche avant suppression. (Ne PAS supprimer `serializeObjectJson` s'il reste utilisé par un test ou le handler.)

---

## Self-Review (effectuée par l'auteur du plan)

**Couverture du spec :**
- §6.1 `version: 2` → Task 1 ✓ ; `stripCatalogOptions` → Task 2 ✓ ; `restoreCatalogOptions` → Task 3 ✓.
- §6.2 export JSON/CSV frais + dirty warning + erreur → Task 4 ✓ ; import restore → Task 5 ✓.
- §6.3 texte modale → Task 4 ✓.
- §7 tests (version, strip, restore, round-trip, modale, build) → Tasks 1-4 + 6 ✓.
- §4 source = loader complet (zones préservées) → Task 4 (preuve en Task 6 Step 4) ✓.

**Scan placeholders :** aucun TBD/TODO ; code complet à chaque étape.

**Cohérence des types :** `stripCatalogOptions(modules) → ObjectWorkspaceModules`, `restoreCatalogOptions<T>(incoming, draftModule) → T`, helper partagé `isCatalogKey`/`stripModuleCatalogs`/`restoreModuleCatalogs` ; `getObjectWorkspaceResource → ObjectWorkspaceResource { type?, name, modules }` ; `ObjectIoMeta { objectId, type, name }`. Noms cohérents entre tâches.

---

### Task 7 : Catalogues hors-convention (extension décidée après vérification)

**Contexte :** la preuve comportementale sur `HLORUN00000000TV` montre que le strip générique `*Options` + `domains[].nodes` ne réduit que de 38 % (167→103 Ko). Deux catalogues échappent à la convention :
- `characteristics.amenityGroups` — catalogue **pur** (la donnée objet est ailleurs : `selectedAmenityCodes`) ⇒ se droppe/restaure comme un `*Options`.
- `sustainability.categories[].actions[]` — catalogue **entrelacé** avec la donnée (`selected`/`note`/`documentId` par action) ⇒ projeter sur les actions porteuses de données à l'export, re-fusionner le vocabulaire complet du brouillon à l'import. (Sur cet objet : 0/239 action sélectionnée ⇒ 49,8 Ko de pur vocabulaire.)

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/io/object-io-serialize.ts`
- Test: `bertel-tourism-ui/src/features/object-editor/io/object-io-serialize.test.ts`

**Interfaces:**
- Consumes: `isObject`, existing `stripModuleCatalogs`/`restoreModuleCatalogs`/`isCatalogKey`.
- Produces: `stripCatalogOptions`/`restoreCatalogOptions` qui gèrent en plus `amenityGroups` (catalogue pur) et `sustainability.categories` (entrelacé). Aucun changement de page (les deux fns sont déjà appelées par l'éditeur).

- [ ] **Step 1 : Écrire les tests (RED)**

Ajouter à la fin de `object-io-serialize.test.ts` :

```ts
describe('non-convention catalogs (Task 7)', () => {
  it('strips characteristics.amenityGroups (pure catalog), keeps selectedAmenityCodes', () => {
    const modules = {
      characteristics: {
        amenityGroups: [{ familyCode: 'climate', options: [{ id: 'a', code: 'heating' }] }],
        selectedAmenityCodes: ['heating'],
        languageOptions: [{ id: 'l', code: 'fr' }],
      },
    } as unknown as ObjectWorkspaceModules;
    const stripped = stripCatalogOptions(modules) as unknown as Record<string, any>;
    expect(stripped.characteristics.amenityGroups).toEqual([]);
    expect(stripped.characteristics.languageOptions).toEqual([]);
    expect(stripped.characteristics.selectedAmenityCodes).toEqual(['heating']);
  });

  it('restores amenityGroups from the draft (file selection wins)', () => {
    const incoming = { amenityGroups: [], selectedAmenityCodes: ['heating'] };
    const draft = { amenityGroups: [{ familyCode: 'climate', options: [{ id: 'a' }] }], selectedAmenityCodes: ['OLD'] };
    const merged = restoreCatalogOptions(incoming, draft) as Record<string, any>;
    expect(merged.amenityGroups).toEqual([{ familyCode: 'climate', options: [{ id: 'a' }] }]);
    expect(merged.selectedAmenityCodes).toEqual(['heating']);
  });

  it('projects sustainability to actions carrying data, drops empty categories', () => {
    const modules = {
      sustainability: {
        categories: [
          { code: 'CAT_A', actions: [
            { code: 'MA_1', selected: true, note: '', documentId: '' },
            { code: 'MA_2', selected: false, note: '', documentId: '' },
          ] },
          { code: 'CAT_B', actions: [
            { code: 'MA_3', selected: false, note: '', documentId: '' },
          ] },
        ],
      },
    } as unknown as ObjectWorkspaceModules;
    const stripped = stripCatalogOptions(modules) as unknown as Record<string, any>;
    expect(stripped.sustainability.categories).toHaveLength(1);
    expect(stripped.sustainability.categories[0].code).toBe('CAT_A');
    expect(stripped.sustainability.categories[0].actions.map((a: any) => a.code)).toEqual(['MA_1']);
  });

  it('keeps a sustainability action that has only a note (no selected)', () => {
    const modules = {
      sustainability: { categories: [{ code: 'CAT_A', actions: [{ code: 'MA_1', selected: false, note: 'x', documentId: '' }] }] },
    } as unknown as ObjectWorkspaceModules;
    const stripped = stripCatalogOptions(modules) as unknown as Record<string, any>;
    expect(stripped.sustainability.categories[0].actions).toHaveLength(1);
  });

  it('re-merges the full sustainability vocabulary from the draft, file selection wins', () => {
    const incoming = { categories: [{ code: 'CAT_A', actions: [{ code: 'MA_1', selected: true, note: 'kept', documentId: '' }] }] };
    const draft = {
      categories: [{ code: 'CAT_A', actions: [
        { code: 'MA_1', selected: false, note: '', documentId: '', label: 'Action 1' },
        { code: 'MA_2', selected: true, note: 'stale', documentId: '', label: 'Action 2' },
      ] }],
    };
    const merged = restoreCatalogOptions(incoming, draft) as Record<string, any>;
    const actions = merged.categories[0].actions;
    expect(actions).toHaveLength(2); // full vocabulary restored
    expect(actions[0]).toMatchObject({ code: 'MA_1', selected: true, note: 'kept', label: 'Action 1' });
    // MA_2 not in the file ⇒ reset to unselected (file wins fully)
    expect(actions[1]).toMatchObject({ code: 'MA_2', selected: false, note: '', label: 'Action 2' });
  });

  it('keeps the file sustainability as-is when the draft has no vocabulary', () => {
    const incoming = { categories: [{ code: 'CAT_A', actions: [{ code: 'MA_1', selected: true }] }] };
    const merged = restoreCatalogOptions(incoming, { categories: null }) as Record<string, any>;
    expect(merged.categories[0].actions[0].code).toBe('MA_1');
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/io/object-io-serialize.test.ts -t "non-convention"`
Expected: FAIL (amenityGroups non vidé / sustainability non projeté).

- [ ] **Step 3 : Implémenter l'extension dans `object-io-serialize.ts`**

(a) Élargir `isCatalogKey` pour inclure les catalogues purs hors-convention :

```ts
/** Pure catalog keys that don't follow the `*Options` convention (object data lives elsewhere). */
const EXTRA_CATALOG_KEYS = new Set<string>(['amenityGroups']);

function isCatalogKey(key: string): boolean {
  return key.endsWith('Options') || EXTRA_CATALOG_KEYS.has(key);
}
```

(b) Ajouter les helpers sustainability (après `restoreModuleCatalogs`) :

```ts
/** A sustainability action carries data when selected, annotated, or document-linked. */
function actionHasData(action: unknown): boolean {
  return (
    isObject(action) &&
    (action.selected === true ||
      (typeof action.note === 'string' && action.note !== '') ||
      (typeof action.documentId === 'string' && action.documentId !== ''))
  );
}

/** Sustainability nests the V5 vocabulary as categories[].actions[] with the object's data
 *  (selected/note/documentId) on each action. Export keeps only actions carrying data and
 *  drops categories left empty. */
function stripSustainabilityCatalog(module: unknown): unknown {
  if (!isObject(module) || !Array.isArray(module.categories)) {
    return stripModuleCatalogs(module);
  }
  const base = stripModuleCatalogs(module) as Record<string, unknown>;
  base.categories = (module.categories as unknown[])
    .map((cat) =>
      isObject(cat) && Array.isArray(cat.actions)
        ? { ...cat, actions: (cat.actions as unknown[]).filter(actionHasData) }
        : cat,
    )
    .filter((cat) => !isObject(cat) || !Array.isArray(cat.actions) || (cat.actions as unknown[]).length > 0);
  return base;
}

/** Import: rebuild the full vocabulary from the live draft, overlaying the file's selection
 *  per (categoryCode, actionCode); actions absent from the file reset to unselected (file wins).
 *  If the draft carries no vocabulary, keep the file's selected-only set (data preserved). */
function restoreSustainabilityCatalog(incoming: unknown, draftModule: unknown): unknown {
  if (!isObject(incoming)) {
    return incoming;
  }
  const out = restoreModuleCatalogs(incoming, draftModule) as Record<string, unknown>;
  const draftCategories =
    isObject(draftModule) && Array.isArray(draftModule.categories) ? (draftModule.categories as unknown[]) : null;
  if (!draftCategories) {
    return out;
  }
  const fileByCategory = new Map<unknown, Map<unknown, Record<string, unknown>>>();
  for (const cat of Array.isArray(incoming.categories) ? (incoming.categories as unknown[]) : []) {
    if (!isObject(cat)) continue;
    const actions = new Map<unknown, Record<string, unknown>>();
    for (const action of Array.isArray(cat.actions) ? (cat.actions as unknown[]) : []) {
      if (isObject(action) && 'code' in action) actions.set(action.code, action);
    }
    fileByCategory.set(cat.code, actions);
  }
  out.categories = draftCategories.map((cat) => {
    if (!isObject(cat) || !Array.isArray(cat.actions)) return cat;
    const fileActions = fileByCategory.get(cat.code) ?? new Map<unknown, Record<string, unknown>>();
    return {
      ...cat,
      actions: (cat.actions as unknown[]).map((action) => {
        if (!isObject(action) || !('code' in action)) return action;
        const fileAction = fileActions.get(action.code);
        if (!fileAction) {
          return { ...action, selected: false, note: '', documentId: '' };
        }
        return {
          ...action,
          selected: fileAction.selected === true,
          note: typeof fileAction.note === 'string' ? fileAction.note : '',
          documentId: typeof fileAction.documentId === 'string' ? fileAction.documentId : '',
        };
      }),
    };
  });
  return out;
}
```

(c) Router dans les deux fonctions publiques :

```ts
export function stripCatalogOptions(modules: ObjectWorkspaceModules): ObjectWorkspaceModules {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(modules)) {
    out[key] = key === 'sustainability' ? stripSustainabilityCatalog(value) : stripModuleCatalogs(value);
  }
  return out as unknown as ObjectWorkspaceModules;
}

export function restoreCatalogOptions<T>(incoming: T, draftModule: unknown): T {
  if (isObject(incoming) && Array.isArray((incoming as Record<string, unknown>).categories)) {
    return restoreSustainabilityCatalog(incoming, draftModule) as T;
  }
  return restoreModuleCatalogs(incoming, draftModule) as T;
}
```

(Remplacer les corps existants de `stripCatalogOptions`/`restoreCatalogOptions` par ceux-ci ; `isCatalogKey` est remplacé par la version (a).)

- [ ] **Step 4 : Lancer les tests, vérifier le succès**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/io/object-io-serialize.test.ts`
Expected: PASS (tout le fichier, y compris les tests Task 2/3 inchangés et les nouveaux).

- [ ] **Step 5 : Type-check**

Run: `cd bertel-tourism-ui && npx tsc --noEmit`
Expected: 0 erreur.

- [ ] **Step 6 : Commit**

```bash
cd "C:/Users/dphil/Bertel3.0"
git add bertel-tourism-ui/src/features/object-editor/io/object-io-serialize.ts \
        bertel-tourism-ui/src/features/object-editor/io/object-io-serialize.test.ts
git commit --no-verify -m "feat(editor): strip catalogues hors-convention (amenityGroups + vocabulaire sustainability)"
```
