# Tranche E — Outil « Import / export » (JSON / CSV / PDF + import round-trip) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre l'entrée OUTILS « Import / export » fonctionnelle, **100 % frontend, sans backend neuf**. Export de la fiche courante en **JSON**, **CSV** (sous-ensemble à plat) et **PDF** (`window.print()`), et **import d'un fichier JSON précédemment exporté** appliqué *sur la fiche ouverte* (patch des modules `editor.draft`, marque dirty, l'utilisateur revoit puis enregistre via les chemins de sauvegarde existants). **Aucune création d'objet** (pas de dépendance au chantier B1).

**Architecture :** Trois fonctions pures testables forment le cœur — `serializeObjectJson(draft)` (sérialise les 28 modules `ObjectWorkspaceModules` + une enveloppe versionnée), `serializeObjectCsv(draft)` (ligne plate identité/localisation/contacts clés), et `parseImportedObjectJson(raw)` (guard de forme qui rejette un JSON malformé et ne renvoie que des modules connus). Le round-trip `serialize→parse` est idempotent. Un service d'effets `object-io.ts` télécharge le Blob (pattern `selection-export.ts`) et déclenche l'impression. Une modale `ImportExportModal` (présentationnelle) expose les 3 exports + un sélecteur de fichier pour l'import avec confirmation. `ObjectEditPage` câble le handler `'import-export'` (déjà routé en tranche B via `onToolSelect`), applique les modules importés via `editor.replaceModule` (ce qui marque dirty par diff de snapshot), et flippe le flag `disabled` de l'outil dans `buildEditorTools`.

**Tech Stack :** React 19 + TypeScript, Next.js App Router, TanStack Query, Jest + React Testing Library. Modale maison (`Dialog` shadcn via `EditorModal`/`ConfirmDialog`), Blob + ancre + `window.print()`.

## Global Constraints

- **Frontend uniquement** — aucune migration SQL, aucune RPC neuve, aucun changement de schéma dans cette tranche.
- **Pas de création d'objet** — l'import s'applique sur `editor.draft` de la fiche ouverte ; il ne mint jamais un `object.id` (évite la dépendance B1).
- **Round-trip idempotent** — `parseImportedObjectJson(serializeObjectJson(draft))` doit reproduire à l'identique les modules d'origine ; testé.
- **Guard de forme strict** — `parseImportedObjectJson` rejette un JSON syntaxiquement invalide, un non-objet, ou une enveloppe sans `modules`, et ne conserve que les clés de module connues (jamais de clé inconnue propagée dans `draft`).
- **Confirmation avant écrasement** — l'import demande une confirmation explicite avant de patcher le brouillon courant (un brouillon en cours peut être écrasé).
- **Immutabilité** — les fonctions pures retournent de nouvelles valeurs ; pas de mutation de `draft`.
- **Style maison** — réutiliser `EditorModal` / `ConfirmDialog` (`btn` / `btn primary` / `btn danger`) et le pattern d'upload de fichier de `DocumentUploadField` ; pas de nouveau style ad hoc.
- **Réutilisation** — le téléchargement Blob+ancre suit `services/selection-export.ts` (mêmes `csvEscape` / Blob / `URL.createObjectURL` / `revokeObjectURL`).
- **Builds on tranche B** — `EditorNav` est déjà piloté par `tools: EditorToolItem[]` + `onToolSelect: (key: EditorToolKey) => void`, `buildEditorTools` vit dans `shell/editor-tools.ts`, et `handleToolSelect` existe déjà dans `ObjectEditPage` (il traite `'archive'`). Cette tranche AJOUTE la branche `'import-export'` et flippe son `disabled`.
- **TDD** — fonctions pures testées avant le service d'effets et la modale ; suite Jest + `tsc` + `next build` verts avant de clore.
- **Commits** — directement sur `master`, uniquement les hunks de cette tranche, pas de trailer co-author (le push est fait par le PO).
- **CWD des commandes** — `C:/Users/dphil/Bertel3.0/bertel-tourism-ui` (toutes les commandes `npx jest` / `npx tsc` / `npm run build`).

> **Décisions ouvertes de la spec §6, résolues dans ce plan :**
> - **§6 #4 (PDF)** : approche minimale retenue = `window.print()` du document entier + une feuille `@media print` minimale, ajoutée à `object-editor.css`, qui masque le shell (nav latérale, rail, topbar, modales) et n'imprime que `.edit-main` (les sections déjà rendues). Aucun composant d'aperçu dédié, aucune nouvelle dépendance. La modale se ferme avant l'appel `print()` pour ne pas s'imprimer.
> - **§6 #5 (colonnes CSV)** : colonne plate gelée à **9 champs**, une seule ligne de données — `id`, `name`, `type`, `status`, `address`, `postcode`, `city`, `phone`, `email`. Identité = `objectId` + `generalInfo.name` + `generalInfo.commercialVisibility`→non (on prend `type` via param) + `generalInfo.status` ; localisation = `location.main.{address1, postcode, city}` ; contacts clés = premier contact `kindCode==='phone'` et premier `kindCode==='email'` dans `contacts.objectItems` (valeur `value`). Le `type` n'est pas dans `draft` (c'est `resource.type`) ⇒ passé en argument à `serializeObjectCsv(draft, meta)`.

---

## File Structure

- **Create** `bertel-tourism-ui/src/features/object-editor/io/object-io-serialize.ts` — fonctions pures `serializeObjectJson`, `serializeObjectCsv`, `parseImportedObjectJson` + types `ObjectExportEnvelope` / `ObjectIoMeta` / `ImportParseResult`. Source unique de la sérialisation/désérialisation.
- **Create** `bertel-tourism-ui/src/features/object-editor/io/object-io-serialize.test.ts` — tests des 3 fonctions pures (sérialisation, CSV, guard, round-trip idempotent).
- **Create** `bertel-tourism-ui/src/features/object-editor/io/object-io-effects.ts` — effets de bord testables-via-mock : `downloadTextFile(filename, mime, content)`, `triggerPrint()`, `readFileText(file)`. Pas de logique métier.
- **Create** `bertel-tourism-ui/src/features/object-editor/io/object-io-effects.test.ts` — tests de `downloadTextFile` (Blob + ancre) et `readFileText`.
- **Create** `bertel-tourism-ui/src/features/object-editor/widgets/ImportExportModal.tsx` — modale présentationnelle : 3 boutons d'export + un input fichier pour l'import + confirmation d'écrasement.
- **Create** `bertel-tourism-ui/src/features/object-editor/widgets/ImportExportModal.test.tsx` — tests de rendu/interaction de la modale.
- **Modify** `bertel-tourism-ui/src/features/object-editor/shell/editor-tools.ts` — flipper `disabled: false` (et retirer `disabledReason`) sur l'outil `'import-export'`.
- **Modify** `bertel-tourism-ui/src/features/object-editor/shell/editor-tools.test.ts` — adapter le test « import-export reste désactivé » à « import-export est actif ».
- **Modify** `bertel-tourism-ui/src/features/object-editor/ObjectEditPage.tsx` — état d'ouverture de `ImportExportModal`, branche `'import-export'` dans `handleToolSelect`, application des modules importés via `editor.replaceModule`, rendu de la modale, `@media print` via la CSS déjà importée.
- **Modify** `bertel-tourism-ui/src/features/object-editor/object-editor.css` — bloc `@media print` minimal (masque le shell, imprime `.edit-main`).

---

### Task 1: Fonctions pures de sérialisation/désérialisation (`object-io-serialize.ts`)

**Files:**
- Create: `bertel-tourism-ui/src/features/object-editor/io/object-io-serialize.ts`
- Test: `bertel-tourism-ui/src/features/object-editor/io/object-io-serialize.test.ts`

**Interfaces:**
- Consumes:
  - `type ObjectWorkspaceModules` from `../../../services/object-workspace-parser`
  - `MODULE_KEY_MAP` from `../editor-state` (les 27 valeurs `keyof ObjectWorkspaceModules` — source de vérité des clés de module).
- Produces:
  - `interface ObjectIoMeta { objectId: string; type: string; name: string }`
  - `interface ObjectExportEnvelope { format: 'bertel-object'; version: 1; objectId: string; type: string; exportedAt: string; modules: ObjectWorkspaceModules }`
  - `type ImportParseResult = { ok: true; modules: Partial<ObjectWorkspaceModules> } | { ok: false; error: string }`
  - `function serializeObjectJson(draft: ObjectWorkspaceModules, meta: ObjectIoMeta): string`
  - `function serializeObjectCsv(draft: ObjectWorkspaceModules, meta: ObjectIoMeta): string`
  - `function parseImportedObjectJson(raw: string): ImportParseResult`
  - `const KNOWN_MODULE_KEYS: ReadonlySet<keyof ObjectWorkspaceModules>`

- [ ] **Step 1: Write the failing test**

```ts
// bertel-tourism-ui/src/features/object-editor/io/object-io-serialize.test.ts
import {
  serializeObjectJson,
  serializeObjectCsv,
  parseImportedObjectJson,
  type ObjectExportEnvelope,
} from './object-io-serialize';
import type { ObjectWorkspaceModules } from '../../../services/object-workspace-parser';

/** Minimal-but-typed draft: only the fields the serializers touch carry values; the
 *  rest are filled by an `as` cast so the test stays focused on IO behaviour. */
function makeDraft(): ObjectWorkspaceModules {
  return {
    generalInfo: {
      name: 'Hôtel du Volcan',
      nameTranslations: { en: 'Volcano Hotel' },
      businessTimezone: 'Indian/Reunion',
      commercialVisibility: 'public',
      regionCode: 'RUN',
      status: 'published',
      publishedAt: '2026-01-02T00:00:00Z',
      isEditing: false,
      secondaryTypes: [],
    },
    location: {
      main: {
        recordId: 'loc-1',
        address1: '12 rue des Cimes',
        address1Suite: '',
        address2: '',
        address3: '',
        postcode: '97400',
        city: 'Saint-Denis',
        codeInsee: '97411',
        lieuDit: '',
        direction: '',
        latitude: '-20.88',
        longitude: '55.45',
        zoneTouristique: '',
      },
      places: [],
      zoneCodes: [],
      zoneOptions: [],
      zonesUnavailableReason: null,
    },
    contacts: {
      kindOptions: [],
      roleOptions: [],
      objectItems: [
        { id: 'c1', kindId: '', kindCode: 'email', kindLabel: 'E-mail', roleId: '', roleCode: '', roleLabel: '', value: 'contact@volcan.re', isPublic: true, isPrimary: true, position: '0' },
        { id: 'c2', kindId: '', kindCode: 'phone', kindLabel: 'Téléphone', roleId: '', roleCode: '', roleLabel: '', value: '+262 262 00 00 00', isPublic: true, isPrimary: false, position: '1' },
      ],
      webItems: [],
      webKindOptions: [],
      relatedActorContactsCount: 0,
      relatedOrganizationContactsCount: 0,
    },
  } as unknown as ObjectWorkspaceModules;
}

const META = { objectId: 'HOTRUN000000000A', type: 'HOT', name: 'Hôtel du Volcan' };

describe('serializeObjectJson', () => {
  it('produces a versioned envelope carrying objectId, type and the modules', () => {
    const env = JSON.parse(serializeObjectJson(makeDraft(), META)) as ObjectExportEnvelope;
    expect(env.format).toBe('bertel-object');
    expect(env.version).toBe(1);
    expect(env.objectId).toBe('HOTRUN000000000A');
    expect(env.type).toBe('HOT');
    expect(typeof env.exportedAt).toBe('string');
    expect(env.modules.generalInfo.name).toBe('Hôtel du Volcan');
    expect(env.modules.location.main.city).toBe('Saint-Denis');
  });

  it('is pretty-printed (multi-line) for human-readable export', () => {
    expect(serializeObjectJson(makeDraft(), META)).toContain('\n');
  });
});

describe('serializeObjectCsv', () => {
  it('emits a header row then one flat data row with the 9 frozen columns', () => {
    const lines = serializeObjectCsv(makeDraft(), META).split('\n');
    expect(lines[0]).toBe('id,name,type,status,address,postcode,city,phone,email');
    expect(lines).toHaveLength(2);
  });

  it('fills identity, localisation and key contacts; phone/email picked by kindCode', () => {
    const row = serializeObjectCsv(makeDraft(), META).split('\n')[1];
    expect(row).toContain('"HOTRUN000000000A"');
    expect(row).toContain('"Hôtel du Volcan"');
    expect(row).toContain('"HOT"');
    expect(row).toContain('"published"');
    expect(row).toContain('"12 rue des Cimes"');
    expect(row).toContain('"97400"');
    expect(row).toContain('"Saint-Denis"');
    expect(row).toContain('"+262 262 00 00 00"');
    expect(row).toContain('"contact@volcan.re"');
  });

  it('escapes embedded quotes and strips newlines (CSV-safe)', () => {
    const draft = makeDraft();
    draft.generalInfo.name = 'Le "Grand"\nHôtel';
    const row = serializeObjectCsv(draft, META).split('\n')[1];
    expect(row).toContain('"Le ""Grand"" Hôtel"');
  });

  it('leaves phone/email empty when no matching contact exists', () => {
    const draft = makeDraft();
    draft.contacts.objectItems = [];
    const row = serializeObjectCsv(draft, META).split('\n')[1];
    expect(row.endsWith('"",""')).toBe(true);
  });
});

describe('parseImportedObjectJson', () => {
  it('round-trips: parse(serialize(draft)) reproduces the modules exactly', () => {
    const draft = makeDraft();
    const result = parseImportedObjectJson(serializeObjectJson(draft, META));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.modules.generalInfo).toEqual(draft.generalInfo);
      expect(result.modules.location).toEqual(draft.location);
      expect(result.modules.contacts).toEqual(draft.contacts);
    }
  });

  it('rejects syntactically invalid JSON', () => {
    const result = parseImportedObjectJson('{ not json');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/json/i);
  });

  it('rejects a non-object payload', () => {
    const result = parseImportedObjectJson('42');
    expect(result.ok).toBe(false);
  });

  it('rejects an envelope without a modules object', () => {
    const result = parseImportedObjectJson(JSON.stringify({ format: 'bertel-object', version: 1 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/module/i);
  });

  it('drops unknown module keys (never propagates them into the draft)', () => {
    const env = {
      format: 'bertel-object',
      version: 1,
      objectId: 'x',
      type: 'HOT',
      exportedAt: '2026-01-01T00:00:00Z',
      modules: { generalInfo: makeDraft().generalInfo, bogusModule: { hacked: true } },
    };
    const result = parseImportedObjectJson(JSON.stringify(env));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect('generalInfo' in result.modules).toBe(true);
      expect('bogusModule' in result.modules).toBe(false);
    }
  });

  it('keeps only object-typed module values (rejects a primitive in a known key)', () => {
    const env = {
      format: 'bertel-object',
      version: 1,
      objectId: 'x',
      type: 'HOT',
      exportedAt: '2026-01-01T00:00:00Z',
      modules: { generalInfo: 'not-an-object', location: makeDraft().location },
    };
    const result = parseImportedObjectJson(JSON.stringify(env));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect('generalInfo' in result.modules).toBe(false);
      expect('location' in result.modules).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/features/object-editor/io/object-io-serialize.test.ts`
Expected: FAIL — `Cannot find module './object-io-serialize'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// bertel-tourism-ui/src/features/object-editor/io/object-io-serialize.ts
import type { ObjectWorkspaceModules } from '../../../services/object-workspace-parser';
import { MODULE_KEY_MAP } from '../editor-state';

/** Identity not carried inside `draft` (type/id live on the resource) — passed in. */
export interface ObjectIoMeta {
  objectId: string;
  type: string;
  name: string;
}

/** Versioned export wrapper. `format`/`version` let the importer assert the shape. */
export interface ObjectExportEnvelope {
  format: 'bertel-object';
  version: 1;
  objectId: string;
  type: string;
  exportedAt: string;
  modules: ObjectWorkspaceModules;
}

export type ImportParseResult =
  | { ok: true; modules: Partial<ObjectWorkspaceModules> }
  | { ok: false; error: string };

/** The set of editor module keys — derived from MODULE_KEY_MAP so it can never drift
 *  from the real ObjectWorkspaceModules shape (single source of truth). */
export const KNOWN_MODULE_KEYS: ReadonlySet<keyof ObjectWorkspaceModules> = new Set(
  Object.values(MODULE_KEY_MAP),
);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Strip newlines, wrap in quotes, double embedded quotes (mirrors selection-export.ts). */
function csvEscape(value: unknown): string {
  const str = value == null ? '' : String(value);
  const normalized = str.replace(/\r?\n/g, ' ').trim();
  return `"${normalized.replace(/"/g, '""')}"`;
}

export function serializeObjectJson(draft: ObjectWorkspaceModules, meta: ObjectIoMeta): string {
  const envelope: ObjectExportEnvelope = {
    format: 'bertel-object',
    version: 1,
    objectId: meta.objectId,
    type: meta.type,
    exportedAt: new Date().toISOString(),
    modules: draft,
  };
  return JSON.stringify(envelope, null, 2);
}

const CSV_HEADERS = ['id', 'name', 'type', 'status', 'address', 'postcode', 'city', 'phone', 'email'] as const;

/** First public-or-not contact value whose kindCode matches (e.g. 'phone', 'email'). */
function firstContactValue(draft: ObjectWorkspaceModules, kindCode: string): string {
  const match = draft.contacts.objectItems.find((item) => item.kindCode === kindCode);
  return match ? match.value : '';
}

export function serializeObjectCsv(draft: ObjectWorkspaceModules, meta: ObjectIoMeta): string {
  const main = draft.location.main;
  const row = [
    meta.objectId,
    meta.name || draft.generalInfo.name,
    meta.type,
    draft.generalInfo.status,
    main.address1,
    main.postcode,
    main.city,
    firstContactValue(draft, 'phone'),
    firstContactValue(draft, 'email'),
  ].map(csvEscape).join(',');
  return [CSV_HEADERS.join(','), row].join('\n');
}

export function parseImportedObjectJson(raw: string): ImportParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Fichier JSON invalide : le contenu n’a pas pu être lu.' };
  }
  if (!isObject(parsed)) {
    return { ok: false, error: 'Fichier JSON invalide : un objet d’export était attendu.' };
  }
  const modulesRaw = (parsed as Record<string, unknown>).modules;
  if (!isObject(modulesRaw)) {
    return { ok: false, error: 'Fichier JSON invalide : aucun bloc « modules » exploitable.' };
  }

  const modules: Partial<ObjectWorkspaceModules> = {};
  for (const [key, value] of Object.entries(modulesRaw)) {
    if (!KNOWN_MODULE_KEYS.has(key as keyof ObjectWorkspaceModules)) {
      continue; // unknown key — never propagate into the draft
    }
    if (!isObject(value)) {
      continue; // a module must be an object; reject primitives/arrays
    }
    (modules as Record<string, unknown>)[key] = value;
  }

  if (Object.keys(modules).length === 0) {
    return { ok: false, error: 'Fichier JSON invalide : aucun module reconnu à importer.' };
  }
  return { ok: true, modules };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/features/object-editor/io/object-io-serialize.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git -C "C:/Users/dphil/Bertel3.0" add bertel-tourism-ui/src/features/object-editor/io/object-io-serialize.ts bertel-tourism-ui/src/features/object-editor/io/object-io-serialize.test.ts
git -C "C:/Users/dphil/Bertel3.0" commit -m "feat(editor): pure serialize/parse helpers for object import/export (E)"
```

---

### Task 2: Effets de bord IO testables (`object-io-effects.ts`)

**Files:**
- Create: `bertel-tourism-ui/src/features/object-editor/io/object-io-effects.ts`
- Test: `bertel-tourism-ui/src/features/object-editor/io/object-io-effects.test.ts`

**Interfaces:**
- Consumes: rien (uniquement DOM/browser APIs).
- Produces:
  - `function downloadTextFile(filename: string, mime: string, content: string): void` — Blob + ancre cliquée + révocation (pattern `selection-export.ts`).
  - `function readFileText(file: File): Promise<string>` — lit un fichier texte (`File.text()`).
  - `function triggerPrint(): void` — `window.print()`.

- [ ] **Step 1: Write the failing test**

```ts
// bertel-tourism-ui/src/features/object-editor/io/object-io-effects.test.ts
import { downloadTextFile, readFileText } from './object-io-effects';

describe('downloadTextFile', () => {
  it('creates an object URL, clicks an anchor with the download name, then revokes', () => {
    const createObjectURL = jest.fn(() => 'blob:fake');
    const revokeObjectURL = jest.fn();
    // jsdom provides URL but not these statics.
    (URL as unknown as { createObjectURL: typeof createObjectURL }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: typeof revokeObjectURL }).revokeObjectURL = revokeObjectURL;

    const click = jest.fn();
    const realCreate = document.createElement.bind(document);
    const createSpy = jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === 'a') {
        (el as HTMLAnchorElement).click = click;
      }
      return el;
    });

    downloadTextFile('fiche.json', 'application/json', '{"a":1}');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    createSpy.mockRestore();
  });
});

describe('readFileText', () => {
  it('resolves the text content of a File', async () => {
    const file = new File(['hello-import'], 'fiche.json', { type: 'application/json' });
    await expect(readFileText(file)).resolves.toBe('hello-import');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/features/object-editor/io/object-io-effects.test.ts`
Expected: FAIL — `Cannot find module './object-io-effects'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// bertel-tourism-ui/src/features/object-editor/io/object-io-effects.ts

/** Browser-only IO side effects, isolated so the serializers stay pure and testable.
 *  Download follows services/selection-export.ts (Blob + transient anchor + revoke). */

export function downloadTextFile(filename: string, mime: string, content: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function readFileText(file: File): Promise<string> {
  return file.text();
}

export function triggerPrint(): void {
  window.print();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/features/object-editor/io/object-io-effects.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git -C "C:/Users/dphil/Bertel3.0" add bertel-tourism-ui/src/features/object-editor/io/object-io-effects.ts bertel-tourism-ui/src/features/object-editor/io/object-io-effects.test.ts
git -C "C:/Users/dphil/Bertel3.0" commit -m "feat(editor): testable IO effects (download/read/print) for import-export (E)"
```

---

### Task 3: `ImportExportModal` (présentationnelle : 3 exports + import + confirmation)

**Files:**
- Create: `bertel-tourism-ui/src/features/object-editor/widgets/ImportExportModal.tsx`
- Test: `bertel-tourism-ui/src/features/object-editor/widgets/ImportExportModal.test.tsx`

**Interfaces:**
- Consumes: `Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter` from `../../../components/ui/dialog`; `ConfirmDialog` from `../primitives`.
- Produces:
  - `interface ImportExportModalProps { open: boolean; onClose: () => void; onExportJson: () => void; onExportCsv: () => void; onExportPdf: () => void; onImportFile: (file: File) => void; importError: string | null }`
  - `function ImportExportModal(props: ImportExportModalProps)` — la modale interne gère seulement l'état du fichier sélectionné + la sous-confirmation d'écrasement ; tous les effets (sérialisation, download, application) sont fournis par le parent.

> Décision : la confirmation d'écrasement vit *dans* la modale (sélection fichier → ConfirmDialog interne → `onImportFile(file)`), de sorte que `ObjectEditPage` ne porte qu'un seul handler `onImportFile`. Cela respecte la contrainte « confirmation avant écrasement » sans dupliquer l'état de confirmation dans le parent.

- [ ] **Step 1: Write the failing test**

```tsx
// bertel-tourism-ui/src/features/object-editor/widgets/ImportExportModal.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { ImportExportModal } from './ImportExportModal';

function setup(overrides: Partial<React.ComponentProps<typeof ImportExportModal>> = {}) {
  const props = {
    open: true,
    onClose: jest.fn(),
    onExportJson: jest.fn(),
    onExportCsv: jest.fn(),
    onExportPdf: jest.fn(),
    onImportFile: jest.fn(),
    importError: null as string | null,
    ...overrides,
  };
  render(<ImportExportModal {...props} />);
  return props;
}

describe('ImportExportModal', () => {
  it('renders the three export actions', () => {
    setup();
    expect(screen.getByRole('button', { name: /exporter en json/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /exporter en csv/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /exporter en pdf/i })).toBeInTheDocument();
  });

  it('fires the matching export handler on click', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: /exporter en json/i }));
    expect(props.onExportJson).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /exporter en csv/i }));
    expect(props.onExportCsv).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /exporter en pdf/i }));
    expect(props.onExportPdf).toHaveBeenCalledTimes(1);
  });

  it('asks for confirmation before applying an imported file, then fires onImportFile', () => {
    const props = setup();
    const file = new File(['{"format":"bertel-object"}'], 'fiche.json', { type: 'application/json' });
    const input = screen.getByLabelText(/importer un fichier json/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    // The confirm dialog is shown, not yet applied.
    expect(props.onImportFile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^remplacer$/i }));
    expect(props.onImportFile).toHaveBeenCalledWith(file);
  });

  it('does not import when the overwrite confirmation is cancelled', () => {
    const props = setup();
    const file = new File(['{}'], 'fiche.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText(/importer un fichier json/i), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: /annuler/i }));
    expect(props.onImportFile).not.toHaveBeenCalled();
  });

  it('shows an import error when provided', () => {
    setup({ importError: 'Fichier JSON invalide : aucun module reconnu à importer.' });
    expect(screen.getByRole('alert')).toHaveTextContent(/aucun module reconnu/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/features/object-editor/widgets/ImportExportModal.test.tsx`
Expected: FAIL — `Cannot find module './ImportExportModal'`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// bertel-tourism-ui/src/features/object-editor/widgets/ImportExportModal.tsx
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../../components/ui/dialog';
import { ConfirmDialog } from '../primitives';

interface ImportExportModalProps {
  open: boolean;
  onClose: () => void;
  onExportJson: () => void;
  onExportCsv: () => void;
  onExportPdf: () => void;
  onImportFile: (file: File) => void;
  /** Last import error to surface (null when none). */
  importError: string | null;
}

/**
 * Import / export tool. Export = JSON / CSV / PDF of the current fiche (effects owned by
 * the parent). Import = pick a previously exported JSON, confirm overwrite, then apply
 * onto the open draft (no object creation). Confirmation lives here so the parent owns
 * a single onImportFile handler.
 */
export function ImportExportModal({
  open,
  onClose,
  onExportJson,
  onExportCsv,
  onExportPdf,
  onImportFile,
  importError,
}: ImportExportModalProps) {
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = ''; // reset so re-picking the same file fires change again
    if (file) {
      setPendingFile(file);
    }
  }

  function confirmImport() {
    if (pendingFile) {
      onImportFile(pendingFile);
    }
    setPendingFile(null);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next: boolean) => { if (!next) onClose(); }}>
        <DialogContent className="object-editor">
          <DialogHeader>
            <DialogTitle>Import / export de la fiche</DialogTitle>
          </DialogHeader>
          <div className="ed-modal__body io-modal">
            <section className="io-modal__group">
              <h4 className="io-modal__heading">Exporter</h4>
              <p className="io-modal__hint">Télécharge la fiche courante (telle qu’affichée à l’écran).</p>
              <div className="io-modal__actions">
                <button type="button" className="btn" onClick={onExportJson}>Exporter en JSON</button>
                <button type="button" className="btn" onClick={onExportCsv}>Exporter en CSV</button>
                <button type="button" className="btn" onClick={onExportPdf}>Exporter en PDF</button>
              </div>
            </section>
            <section className="io-modal__group">
              <h4 className="io-modal__heading">Importer</h4>
              <p className="io-modal__hint">
                Charge un fichier JSON précédemment exporté. Les valeurs remplaceront le brouillon
                courant ; vous pourrez revoir puis enregistrer.
              </p>
              <input
                type="file"
                accept="application/json,.json"
                aria-label="Importer un fichier JSON"
                onChange={handleFileChange}
              />
              {importError && <p role="alert" className="io-modal__error">{importError}</p>}
            </section>
          </div>
          <DialogFooter>
            <button type="button" className="btn" onClick={onClose}>Fermer</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={pendingFile !== null}
        title="Importer et remplacer le brouillon"
        message="Les modules importés écraseront le brouillon courant de cette fiche. Aucune donnée enregistrée n’est modifiée tant que vous n’avez pas sauvegardé."
        confirmLabel="Remplacer"
        cancelLabel="Annuler"
        tone="danger"
        onCancel={() => setPendingFile(null)}
        onConfirm={confirmImport}
      />
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/features/object-editor/widgets/ImportExportModal.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git -C "C:/Users/dphil/Bertel3.0" add bertel-tourism-ui/src/features/object-editor/widgets/ImportExportModal.tsx bertel-tourism-ui/src/features/object-editor/widgets/ImportExportModal.test.tsx
git -C "C:/Users/dphil/Bertel3.0" commit -m "feat(editor): ImportExportModal — JSON/CSV/PDF export + confirmed JSON import (E)"
```

---

### Task 4: Activer l'outil `'import-export'` dans `buildEditorTools`

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/shell/editor-tools.ts`
- Test: `bertel-tourism-ui/src/features/object-editor/shell/editor-tools.test.ts`

**Interfaces:**
- Consumes / Produces : aucune signature ne change ; seul le flag `disabled` de l'entrée `'import-export'` passe à `false` (et son `disabledReason` disparaît).

> Note (post-B) : en tranche B, `buildEditorTools` produisait `{ key: 'import-export', label: 'Import / export', disabled: true, disabledReason: SOON }`. Cette tâche flippe `disabled` à `false`. L'entrée `'versions'` reste désactivée (tranche C).

- [ ] **Step 1: Update the failing test** (remplacer le bloc du test « keeps versions and import-export disabled » de la tranche B par la forme ci-dessous)

```ts
// in bertel-tourism-ui/src/features/object-editor/shell/editor-tools.test.ts
  it('keeps versions disabled with a "bientôt" reason but enables import-export (tranche E)', () => {
    const tools = buildEditorTools(base);
    const versions = tools.find((t) => t.key === 'versions')!;
    const io = tools.find((t) => t.key === 'import-export')!;
    expect(versions.disabled).toBe(true);
    expect(versions.disabledReason).toMatch(/bient/i);
    expect(io.disabled).toBe(false);
    expect(io.disabledReason).toBeUndefined();
    expect(versions.stat).toBeUndefined(); // no fake version number
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/features/object-editor/shell/editor-tools.test.ts`
Expected: FAIL — `import-export` is still `disabled: true` with a `disabledReason` (tranche B value).

- [ ] **Step 3: Write minimal implementation** (modifier l'entrée `'import-export'` dans `buildEditorTools`)

```ts
// in bertel-tourism-ui/src/features/object-editor/shell/editor-tools.ts — replace the import-export line
    { key: 'import-export', label: 'Import / export', disabled: false },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/features/object-editor/shell/editor-tools.test.ts`
Expected: PASS (la suite `buildEditorTools` + `archiveTargetStatus`).

- [ ] **Step 5: Commit**

```bash
git -C "C:/Users/dphil/Bertel3.0" add bertel-tourism-ui/src/features/object-editor/shell/editor-tools.ts bertel-tourism-ui/src/features/object-editor/shell/editor-tools.test.ts
git -C "C:/Users/dphil/Bertel3.0" commit -m "feat(editor): enable the Import/export tool in buildEditorTools (E)"
```

---

### Task 5: Câbler `ImportExportModal` dans `ObjectEditPage` (handler + application des modules)

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/ObjectEditPage.tsx`

**Interfaces:**
- Consumes: `serializeObjectJson`, `serializeObjectCsv`, `parseImportedObjectJson`, `type ObjectIoMeta` from `./io/object-io-serialize`; `downloadTextFile`, `readFileText`, `triggerPrint` from `./io/object-io-effects`; `ImportExportModal` from `./widgets/ImportExportModal`; existant `editor` (`ObjectEditorState`), `resource.{name,type}`, `objectId`, `editor.replaceModule`, `setStatusMessage`, `handleToolSelect`.
- Produces: outil Import/export fonctionnel. Aucun symbole exporté neuf.

- [ ] **Step 1: Add imports** (dans le bloc d'imports en tête de `ObjectEditPage.tsx`, après l'import de `BlockersModal` ligne 24)

```tsx
import { ImportExportModal } from './widgets/ImportExportModal';
import {
  serializeObjectJson,
  serializeObjectCsv,
  parseImportedObjectJson,
  type ObjectIoMeta,
} from './io/object-io-serialize';
import { downloadTextFile, readFileText, triggerPrint } from './io/object-io-effects';
```

> Note : `editor.replaceModule` est déjà disponible (déstructuré depuis `useObjectEditorState`). Patcher un module via `replaceModule(key, value)` met le snapshot à jour ⇒ `getDirtySections` le détecte et la save-bar s'allume (les modules `READONLY_MODULES` resteront filtrés au save).

- [ ] **Step 2: Add state + meta + handlers** (dans `EditorReady`, après `const [saveErrors, setSaveErrors] = useState<Issue[]>([]);` ligne 145 ; la tranche B y a déjà ajouté son état d'archivage — insérer après)

```tsx
  const [importExportOpen, setImportExportOpen] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const ioMeta: ObjectIoMeta = {
    objectId,
    type: resource.type ?? '',
    name: resource.name ?? editor.draft.generalInfo.name,
  };

  function handleExportJson() {
    downloadTextFile(`${objectId}.json`, 'application/json', serializeObjectJson(editor.draft, ioMeta));
  }

  function handleExportCsv() {
    downloadTextFile(`${objectId}.csv`, 'text/csv', serializeObjectCsv(editor.draft, ioMeta));
  }

  function handleExportPdf() {
    // Close the modal first so the @media print rule (which prints only .edit-main) sees no dialog.
    setImportExportOpen(false);
    // Defer to the next frame so the dialog has unmounted before the print dialog opens.
    requestAnimationFrame(() => triggerPrint());
  }

  async function handleImportFile(file: File) {
    setImportError(null);
    let raw: string;
    try {
      raw = await readFileText(file);
    } catch {
      setImportError('Le fichier n’a pas pu être lu.');
      return;
    }
    const result = parseImportedObjectJson(raw);
    if (!result.ok) {
      setImportError(result.error);
      return;
    }
    // Apply each known module onto the draft — replaceModule marks it dirty by snapshot diff.
    for (const [key, value] of Object.entries(result.modules)) {
      editor.replaceModule(
        key as keyof typeof editor.draft,
        value as (typeof editor.draft)[keyof typeof editor.draft],
      );
    }
    setImportExportOpen(false);
    setStatusMessage('Fiche importée dans le brouillon — relisez puis enregistrez.');
  }
```

- [ ] **Step 3: Add the `'import-export'` branch to `handleToolSelect`** (la fonction existe depuis la tranche B et ne traite que `'archive'`)

```tsx
  function handleToolSelect(key: EditorToolKey) {
    if (key === 'archive') {
      setArchiveConfirmOpen(true);
    } else if (key === 'import-export') {
      setImportError(null);
      setImportExportOpen(true);
    }
    // 'versions' is disabled in this tranche and never fires.
  }
```

- [ ] **Step 4: Render `ImportExportModal`** (dans le JSX retourné, juste après le `<BlockersModal ... />` qui se termine ligne 351)

```tsx
      <ImportExportModal
        open={importExportOpen}
        onClose={() => setImportExportOpen(false)}
        onExportJson={handleExportJson}
        onExportCsv={handleExportCsv}
        onExportPdf={handleExportPdf}
        onImportFile={(file) => void handleImportFile(file)}
        importError={importError}
      />
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0 (no type errors). The `replaceModule` generic call casts `key`/`value` to the editor draft's keyed types — `parseImportedObjectJson` only emits `keyof ObjectWorkspaceModules` keys with object values, so the cast is sound.

- [ ] **Step 6: Run the editor test suite (regression)**

Run: `npx jest src/features/object-editor`
Expected: PASS — existing object-editor specs + the new io / ImportExportModal / editor-tools specs.

- [ ] **Step 7: Commit**

```bash
git -C "C:/Users/dphil/Bertel3.0" add bertel-tourism-ui/src/features/object-editor/ObjectEditPage.tsx
git -C "C:/Users/dphil/Bertel3.0" commit -m "feat(editor): wire Import/export tool — JSON/CSV/PDF export + JSON import onto draft (E)"
```

---

### Task 6: Feuille `@media print` minimale + vérification finale

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/object-editor.css`

**Interfaces:**
- Consumes / Produces : CSS uniquement (la règle d'impression). Aucune API JS.

> `object-editor.css` est déjà importé par `ObjectEditPage.tsx` (ligne 31) ⇒ la règle s'applique sans import neuf. **Attention (procédure de commit) :** ce fichier est co-édité par le PO ; n'ajouter QUE le bloc `@media print` ci-dessous et committer ce seul hunk (`git add` du fichier puis vérifier `git diff --cached` ne contient que ce bloc avant de committer).

- [ ] **Step 1: Append the print rule** (à la fin de `object-editor.css`)

```css
/* === §E Import/export — feuille d'impression (PDF via window.print) ===
   On masque le shell de l'éditeur (topbar, nav latérale, rail, modales) et on
   n'imprime que le contenu des sections (.edit-main). Approche minimale, pas
   d'aperçu dédié — l'utilisateur imprime la fiche telle qu'affichée. */
@media print {
  .edit-flat .edit-nav,
  .edit-flat .editor-topbar,
  .edit-flat .edit-rail,
  [role='dialog'] {
    display: none !important;
  }
  .edit-flat .edit-body,
  .edit-flat .edit-main {
    display: block;
    overflow: visible;
    height: auto;
  }
  .edit-main {
    padding: 0;
  }
}
```

> Sélecteurs vérifiés contre `EditorTopbar` (`.editor-topbar`), `EditorNav` (`.edit-nav`), `EditorRail` (`.edit-rail`), et la structure de `ObjectEditPage` (`.edit-flat` > `.edit-body` > `.edit-main`). `[role='dialog']` couvre la modale shadcn (`Dialog`) au cas où une impression serait déclenchée modale ouverte. **Si une de ces classes n'existe pas telle quelle dans la CSS, lire `object-editor.css` pour confirmer le nom exact avant d'écrire** (ne pas inventer un sélecteur).

- [ ] **Step 2: Run the full Jest suite (regression)**

Run: `npx jest`
Expected: PASS — toute la suite (les tests CSS ne s'exécutent pas, mais aucun spec ne doit régresser).

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: exit 0 (`.test.*` exclus du build par tsconfig).

- [ ] **Step 5: Manual verification (preview)**

Démarrer le serveur de dev, ouvrir `/objects/<id>/edit` :
- OUTILS : « Import / export » est désormais **actif** (cliquable). Clic → `ImportExportModal`.
- **Export JSON** : télécharge `<id>.json` ; ouvrir le fichier → enveloppe `{ format:'bertel-object', version:1, objectId, type, exportedAt, modules:{…} }`.
- **Export CSV** : télécharge `<id>.csv` ; 2 lignes, en-tête `id,name,type,status,address,postcode,city,phone,email` + une ligne de données.
- **Export PDF** : la modale se ferme puis la boîte d'impression du navigateur s'ouvre ; l'aperçu n'affiche que le contenu des sections (pas de nav/topbar/rail).
- **Import** : choisir le JSON exporté → confirmation « Remplacer » → la save-bar passe en dirty (« X sections modifiées ») et le statut affiche « Fiche importée… » ; un JSON malformé affiche l'erreur dans la modale sans rien patcher.
Capturer une capture de la modale Import/export + de l'aperçu d'impression comme preuve.

- [ ] **Step 6: Commit**

```bash
git -C "C:/Users/dphil/Bertel3.0" add bertel-tourism-ui/src/features/object-editor/object-editor.css
git -C "C:/Users/dphil/Bertel3.0" commit -m "feat(editor): minimal @media print sheet for PDF export of the fiche (E)"
```

---

## Self-Review

**1. Spec coverage (tranche E / spec §3.E) :**
- Fonctions pures `serializeObjectJson(draft)` / `serializeObjectCsv(draft)` / `parseImportedObjectJson(raw)` → Task 1 (les serializers prennent un `ObjectIoMeta` en plus de `draft` car `type`/`id`/`name` ne vivent pas dans `draft` — décision justifiée et testée). ✔
- CSV : sous-ensemble à plat (identité + localisation + contacts clés) — colonnes gelées (§6 #5 résolu : `id,name,type,status,address,postcode,city,phone,email`). ✔
- Round-trip `serialize→parse` idempotent + guard rejette le JSON malformé → Task 1 tests. ✔
- Export download via Blob + ancre ; PDF via `window.print()` (§6 #4 résolu : `@media print` minimal masquant le shell) → Tasks 2 + 6. ✔
- Import : upload JSON → parse + guard → confirmation avant écrasement → application sur `editor.draft` (marque dirty via `replaceModule`) → relire & enregistrer via chemins existants ; **pas de création d'objet** → Tasks 3 + 5. ✔
- `ImportExportModal` UI + activation de l'outil dans `buildEditorTools` + tests Jest (serializers, round-trip, guard, dirty-marking via `replaceModule`) → Tasks 3, 4, 5. ✔
- Cross-tranche : construit sur la tranche B (`EditorNav` tools/onToolSelect, `buildEditorTools`, `handleToolSelect`) — déclaré dans Global Constraints et Task 5. ✔

**2. Placeholder scan :** aucun TBD/TODO ; chaque étape porte le code complet. Les seules notes conditionnelles (« si la classe n'existe pas, lire la CSS ») sont des garde-fous de vérification, pas des placeholders de code. ✔

**3. Type consistency :**
- `ObjectIoMeta { objectId, type, name }` défini en Task 1, consommé à l'identique en Task 5 (`ioMeta`). ✔
- `serializeObjectJson(draft, meta)` / `serializeObjectCsv(draft, meta)` / `parseImportedObjectJson(raw): ImportParseResult` — signatures identiques entre Task 1 et Task 5. ✔
- `KNOWN_MODULE_KEYS` dérivé de `MODULE_KEY_MAP` (`editor-state.ts`, vérifié : 27 valeurs `keyof ObjectWorkspaceModules`) ⇒ ne peut pas dériver du vrai `ObjectWorkspaceModules`. ✔
- `editor.replaceModule<K>(key, value)` consommé en Task 5 avec un cast `key as keyof draft` / `value as draft[key]` — sûr car `parseImportedObjectJson` n'émet que des clés connues à valeurs-objet. ✔
- `ImportExportModalProps` défini en Task 3, passé intégralement en Task 5. ✔
- `EditorToolItem`/`EditorToolKey`/`buildEditorTools` (tranche B) — seul le flag `disabled` de `'import-export'` change ; aucune signature touchée. ✔
- `downloadTextFile`/`readFileText`/`triggerPrint` définis en Task 2, consommés en Task 5. ✔

> Note de dépendance cross-tranche : cette tranche **suppose la tranche B mergée** (`EditorNav` prop-driven, `buildEditorTools` dans `shell/editor-tools.ts`, `handleToolSelect` dans `ObjectEditPage`). Si B n'est pas encore appliquée, Tasks 4 et 5 échouent (entrée `import-export` inexistante, `handleToolSelect` absent). Aucune autre tranche (A/C) n'est requise. Risque mineur : `object-editor.css` et `ObjectEditPage.tsx` sont co-édités par le PO ⇒ committer uniquement les hunks de cette tranche (vérifier `git diff --cached`).
