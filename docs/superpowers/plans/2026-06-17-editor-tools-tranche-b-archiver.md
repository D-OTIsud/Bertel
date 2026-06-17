# Tranche B — Outil « Archiver » + refactor OUTILS (prop-driven) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre l'entrée OUTILS « Archiver » fonctionnelle (archive/restaure via `ConfirmDialog` + `rpc_set_object_status`), supprimer l'entrée « Dupliquer la fiche », et rendre le groupe OUTILS piloté par props — l'infrastructure partagée que les tranches A/C/E réutiliseront.

**Architecture :** Une fonction pure `buildEditorTools` calcule la liste d'outils (libellé Archiver↔Restaurer, états désactivés, raisons) à partir du statut + droits. `EditorNav` devient présentationnel et piloté par une prop `tools` + un callback `onToolSelect`. `ObjectEditPage` câble l'état du modal de confirmation et la mutation de statut existante. Aucun backend neuf (la RPC `api.rpc_set_object_status` + le hook `useSetObjectStatusMutation` existent déjà et sont utilisés en §21).

**Tech Stack :** React 19 + TypeScript, Next.js App Router, TanStack Query, Jest + React Testing Library. Composant `ConfirmDialog` maison.

## Global Constraints

- **Frontend uniquement** — aucune migration SQL, aucune RPC neuve dans cette tranche.
- **Pas de données factices** — supprimer le badge `v12` codé en dur ; ne pas inventer de numéro de version (le vrai numéro arrive en tranche C).
- **Immutabilité** — `buildEditorTools` retourne un nouveau tableau ; pas de mutation d'entrée.
- **Style maison** — réutiliser `ConfirmDialog` (`btn` / `btn danger` / `btn primary`), pas de nouveau style ad hoc.
- **TDD** — fonctions pures et composant présentationnel testés avant câblage ; suite Jest + `tsc` + `next build` verts avant de clore.
- **Commits** — directement sur `master`, uniquement les hunks de cette tranche, pas de trailer co-author (le push est fait par le PO).
- **CWD des commandes** — `C:/Users/dphil/Bertel3.0/bertel-tourism-ui` (toutes les commandes `npx jest` / `npx tsc` / `npm run build`).

## File Structure

- **Create** `bertel-tourism-ui/src/features/object-editor/shell/editor-tools.ts` — type `EditorToolItem` + fn pure `buildEditorTools`. Source unique de la logique d'outils.
- **Create** `bertel-tourism-ui/src/features/object-editor/shell/editor-tools.test.ts` — tests de `buildEditorTools`.
- **Modify** `bertel-tourism-ui/src/features/object-editor/shell/EditorNav.tsx` — supprimer `TOOL_ITEMS` codé en dur ; ajouter props `tools` + `onToolSelect` ; rendre les outils fournis.
- **Modify** `bertel-tourism-ui/src/features/object-editor/shell/EditorNav.test.tsx` — couvrir le rendu/clic des outils et l'absence de « Dupliquer ».
- **Modify** `bertel-tourism-ui/src/features/object-editor/ObjectEditPage.tsx` — câbler `buildEditorTools`, l'état du modal d'archivage, la mutation de statut, et passer `tools`/`onToolSelect` à `EditorNav` + rendre `ConfirmDialog`.

---

### Task 1: Fonction pure `buildEditorTools` + type `EditorToolItem`

**Files:**
- Create: `bertel-tourism-ui/src/features/object-editor/shell/editor-tools.ts`
- Test: `bertel-tourism-ui/src/features/object-editor/shell/editor-tools.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `type EditorToolKey = 'versions' | 'import-export' | 'archive'`
  - `interface EditorToolItem { key: EditorToolKey; label: string; stat?: string; disabled: boolean; disabledReason?: string; danger?: boolean }`
  - `interface BuildEditorToolsInput { status: string; canArchive: boolean; archiveDisabledReason?: string | null }`
  - `function buildEditorTools(input: BuildEditorToolsInput): EditorToolItem[]`
  - `function archiveTargetStatus(status: string, publishedAt: string): 'archived' | 'hidden' | 'draft'`

- [ ] **Step 1: Write the failing test**

```ts
// bertel-tourism-ui/src/features/object-editor/shell/editor-tools.test.ts
import { buildEditorTools, archiveTargetStatus } from './editor-tools';

describe('buildEditorTools', () => {
  const base = { status: 'draft', canArchive: true };

  it('lists exactly the three tools in order: versions, import-export, archive', () => {
    const keys = buildEditorTools(base).map((t) => t.key);
    expect(keys).toEqual(['versions', 'import-export', 'archive']);
  });

  it('never includes a duplicate tool', () => {
    const labels = buildEditorTools(base).map((t) => t.label.toLowerCase());
    expect(labels.some((l) => l.includes('dupliquer'))).toBe(false);
  });

  it('keeps versions and import-export disabled with a "bientôt" reason (wired in later tranches)', () => {
    const tools = buildEditorTools(base);
    const versions = tools.find((t) => t.key === 'versions')!;
    const io = tools.find((t) => t.key === 'import-export')!;
    expect(versions.disabled).toBe(true);
    expect(versions.disabledReason).toMatch(/bient/i);
    expect(io.disabled).toBe(true);
    expect(versions.stat).toBeUndefined(); // no fake version number
  });

  it('labels archive "Archiver" with danger tone when not archived', () => {
    const archive = buildEditorTools({ status: 'published', canArchive: true }).find((t) => t.key === 'archive')!;
    expect(archive.label).toBe('Archiver');
    expect(archive.danger).toBe(true);
    expect(archive.disabled).toBe(false);
  });

  it('labels archive "Restaurer" without danger when already archived', () => {
    const archive = buildEditorTools({ status: 'archived', canArchive: true }).find((t) => t.key === 'archive')!;
    expect(archive.label).toBe('Restaurer');
    expect(archive.danger).toBe(false);
  });

  it('disables archive with the supplied reason when the user lacks publish rights', () => {
    const archive = buildEditorTools({ status: 'draft', canArchive: false, archiveDisabledReason: 'Lecture seule.' }).find((t) => t.key === 'archive')!;
    expect(archive.disabled).toBe(true);
    expect(archive.disabledReason).toBe('Lecture seule.');
  });
});

describe('archiveTargetStatus', () => {
  it('archives a live fiche', () => {
    expect(archiveTargetStatus('published', '2026-01-01')).toBe('archived');
  });
  it('restores an archived fiche that was once published to hidden', () => {
    expect(archiveTargetStatus('archived', '2026-01-01')).toBe('hidden');
  });
  it('restores a never-published archived fiche to draft', () => {
    expect(archiveTargetStatus('archived', '')).toBe('draft');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/features/object-editor/shell/editor-tools.test.ts`
Expected: FAIL — `Cannot find module './editor-tools'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// bertel-tourism-ui/src/features/object-editor/shell/editor-tools.ts
export type EditorToolKey = 'versions' | 'import-export' | 'archive';

export interface EditorToolItem {
  key: EditorToolKey;
  label: string;
  stat?: string;
  disabled: boolean;
  disabledReason?: string;
  danger?: boolean;
}

export interface BuildEditorToolsInput {
  /** Lifecycle status from editor.draft.generalInfo.status. */
  status: string;
  /** permissions.publication.canDirectWrite — gates archive/restore. */
  canArchive: boolean;
  /** permissions.publication.disabledReason — shown when canArchive is false. */
  archiveDisabledReason?: string | null;
}

const SOON = 'Bientôt disponible';

/** Restore target mirrors api.rpc_set_object_status's state machine (computeStatusActions). */
export function archiveTargetStatus(status: string, publishedAt: string): 'archived' | 'hidden' | 'draft' {
  if (status === 'archived') {
    return publishedAt ? 'hidden' : 'draft';
  }
  return 'archived';
}

/** Single source of truth for the OUTILS group. Duplicate tool intentionally absent (PO, 2026-06-17). */
export function buildEditorTools(input: BuildEditorToolsInput): EditorToolItem[] {
  const isArchived = input.status === 'archived';
  return [
    { key: 'versions', label: 'Versions / historique', disabled: true, disabledReason: SOON },
    { key: 'import-export', label: 'Import / export', disabled: true, disabledReason: SOON },
    {
      key: 'archive',
      label: isArchived ? 'Restaurer' : 'Archiver',
      danger: !isArchived,
      disabled: !input.canArchive,
      disabledReason: input.canArchive ? undefined : (input.archiveDisabledReason ?? 'Lecture seule — publication.'),
    },
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/features/object-editor/shell/editor-tools.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git -C "C:/Users/dphil/Bertel3.0" add bertel-tourism-ui/src/features/object-editor/shell/editor-tools.ts bertel-tourism-ui/src/features/object-editor/shell/editor-tools.test.ts
git -C "C:/Users/dphil/Bertel3.0" commit -m "feat(editor): pure buildEditorTools helper for the OUTILS group (B)"
```

---

### Task 2: `EditorNav` piloté par props (`tools` + `onToolSelect`), suppression du codé en dur

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/shell/EditorNav.tsx`
- Test: `bertel-tourism-ui/src/features/object-editor/shell/EditorNav.test.tsx`

**Interfaces:**
- Consumes: `EditorToolItem`, `EditorToolKey` from `./editor-tools` (Task 1).
- Produces: `EditorNav` accepts new props `tools?: EditorToolItem[]` (default `[]`) and `onToolSelect?: (key: EditorToolKey) => void` (default no-op). Enabled tools fire `onToolSelect(tool.key)`; disabled tools render `title={disabledReason}` and don't fire.

- [ ] **Step 1: Write the failing test** (append to the existing describe block)

```tsx
// add to bertel-tourism-ui/src/features/object-editor/shell/EditorNav.test.tsx
import type { EditorToolItem } from './editor-tools';

const TOOLS: EditorToolItem[] = [
  { key: 'versions', label: 'Versions / historique', disabled: true, disabledReason: 'Bientôt disponible' },
  { key: 'import-export', label: 'Import / export', disabled: true, disabledReason: 'Bientôt disponible' },
  { key: 'archive', label: 'Archiver', danger: true, disabled: false },
];

describe('EditorNav tools', () => {
  it('renders the Outils group with the provided tools and no Dupliquer entry', () => {
    render(<EditorNav groups={makeSections('HEB')} activeNum="01" onSelect={() => {}} tools={TOOLS} />);
    expect(screen.getByText('Outils')).toBeInTheDocument();
    expect(screen.getByText('Archiver')).toBeInTheDocument();
    expect(screen.queryByText('Dupliquer la fiche')).not.toBeInTheDocument();
  });

  it('fires onToolSelect for an enabled tool', () => {
    const onToolSelect = jest.fn();
    render(<EditorNav groups={makeSections('HEB')} activeNum="01" onSelect={() => {}} tools={TOOLS} onToolSelect={onToolSelect} />);
    fireEvent.click(screen.getByText('Archiver'));
    expect(onToolSelect).toHaveBeenCalledWith('archive');
  });

  it('does not fire onToolSelect for a disabled tool', () => {
    const onToolSelect = jest.fn();
    render(<EditorNav groups={makeSections('HEB')} activeNum="01" onSelect={() => {}} tools={TOOLS} onToolSelect={onToolSelect} />);
    fireEvent.click(screen.getByText('Versions / historique'));
    expect(onToolSelect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/features/object-editor/shell/EditorNav.test.tsx`
Expected: FAIL — `tools`/`onToolSelect` not accepted; `Archiver` rendered as a hardcoded disabled button (click assertion fails) or "Dupliquer la fiche" still present.

- [ ] **Step 3: Write minimal implementation** (replace the hardcoded `TOOL_ITEMS` block and the Outils render)

```tsx
// bertel-tourism-ui/src/features/object-editor/shell/EditorNav.tsx
import type { SectionGroup } from '../section-config';
import type { EditorToolItem, EditorToolKey } from './editor-tools';

export type EditorNavStatus = 'ok' | 'warn' | 'req';

export interface EditorNavSectionState {
  pct: number;
  status: EditorNavStatus;
  hint?: string;
}

interface EditorNavProps {
  groups: SectionGroup[];
  activeNum: string;
  sectionState?: Record<string, EditorNavSectionState>;
  onSelect: (num: string) => void;
  tools?: EditorToolItem[];
  onToolSelect?: (key: EditorToolKey) => void;
}

/**
 * Presentational grouped section nav. Scroll-spy (tracking `activeNum` from the
 * scroll position) and scroll-into-view on select are owned by ObjectEditPage.
 * The OUTILS group is data-driven via `tools` (see shell/editor-tools.ts).
 */
export function EditorNav({
  groups,
  activeNum,
  sectionState = {},
  onSelect,
  tools = [],
  onToolSelect = () => {},
}: EditorNavProps) {
  return (
    <nav className="edit-nav">
      <div className="edit-nav__root-title">Sections de la fiche</div>
      {groups.map((g) => (
        <div key={g.group} className="edit-nav__group">
          <div className="edit-nav__title">{g.group}</div>
          {g.items.map((it) => {
            const state = sectionState[it.num];
            const statLabel = state?.hint || (state && state.pct < 100 ? `${state.pct}%` : '');
            return (
              <button
                type="button"
                key={it.num}
                className={`edit-nav__item${activeNum === it.num ? ' is-on' : ''}`}
                onClick={() => onSelect(it.num)}
              >
                <span className={`edit-nav__dot ${state?.status ?? ''}`} />
                <span className="label">
                  <span className="edit-nav__num">{it.num}</span>
                  {it.label}
                </span>
                {statLabel ? (
                  <span className={`edit-nav__stat ${state?.status ?? ''}`}>{statLabel}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      ))}
      {tools.length > 0 && (
        <div className="edit-nav__group edit-nav__tools">
          <div className="edit-nav__title">Outils</div>
          {tools.map((tool) => (
            <button
              type="button"
              key={tool.key}
              className={`edit-nav__item${tool.danger ? ' edit-nav__item--danger' : ''}`}
              disabled={tool.disabled}
              title={tool.disabledReason}
              onClick={() => { if (!tool.disabled) onToolSelect(tool.key); }}
            >
              <span className="edit-nav__dot" />
              <span className="label">{tool.label}</span>
              {tool.stat ? <span className="edit-nav__stat">{tool.stat}</span> : null}
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/features/object-editor/shell/EditorNav.test.tsx`
Expected: PASS (existing 2 tests + 3 new tests).

- [ ] **Step 5: Commit**

```bash
git -C "C:/Users/dphil/Bertel3.0" add bertel-tourism-ui/src/features/object-editor/shell/EditorNav.tsx bertel-tourism-ui/src/features/object-editor/shell/EditorNav.test.tsx
git -C "C:/Users/dphil/Bertel3.0" commit -m "feat(editor): data-driven OUTILS nav group; drop hardcoded duplicate entry (B)"
```

---

### Task 3: Câbler l'archivage dans `ObjectEditPage` (confirm + mutation + tools)

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/ObjectEditPage.tsx`

**Interfaces:**
- Consumes: `buildEditorTools`, `archiveTargetStatus`, `EditorToolKey` from `./shell/editor-tools`; `ConfirmDialog` from `./primitives`; `useSetObjectStatusMutation` from `../../hooks/useExplorerQueries`; existing `editor.draft.generalInfo.status`, `editor.draft.publication.publishedAt`, `resource.permissions.publication.{canDirectWrite,disabledReason}`, `editor.setSavedStatus`.
- Produces: a functional Archiver/Restaurer tool. No new exported symbols.

- [ ] **Step 1: Add imports** (in the import block near the top of `ObjectEditPage.tsx`)

```tsx
import { ConfirmDialog } from './primitives';
import { buildEditorTools, archiveTargetStatus, type EditorToolKey } from './shell/editor-tools';
import { useSetObjectStatusMutation } from '../../hooks/useExplorerQueries';
```

> Note: `useObjectWorkspaceQuery` / `usePublishObjectWorkspaceMutation` are already imported from `../../hooks/useExplorerQueries` on line 6 — extend that existing import line rather than duplicating it. Final form:
> `import { useObjectWorkspaceQuery, usePublishObjectWorkspaceMutation, useSetObjectStatusMutation } from '../../hooks/useExplorerQueries';`

- [ ] **Step 2: Add state + derived values + handlers** (inside `EditorReady`, after the existing `const [saveErrors, ...] = useState<Issue[]>([]);` on line 145)

```tsx
  const setObjectStatus = useSetObjectStatusMutation(objectId);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);

  const lifecycleStatus = editor.draft.generalInfo.status || editor.draft.publication.status || 'draft';
  const lifecyclePublishedAt = editor.draft.publication.publishedAt || editor.draft.generalInfo.publishedAt || '';
  const isArchived = lifecycleStatus === 'archived';

  const editorTools = useMemo(
    () =>
      buildEditorTools({
        status: lifecycleStatus,
        canArchive: resource.permissions.publication.canDirectWrite,
        archiveDisabledReason: resource.permissions.publication.disabledReason,
      }),
    [lifecycleStatus, resource.permissions.publication.canDirectWrite, resource.permissions.publication.disabledReason],
  );

  function handleToolSelect(key: EditorToolKey) {
    if (key === 'archive') {
      setArchiveConfirmOpen(true);
    }
    // 'versions' and 'import-export' are disabled in tranche B and never fire.
  }

  async function handleArchiveConfirm() {
    const target = archiveTargetStatus(lifecycleStatus, lifecyclePublishedAt);
    try {
      await setObjectStatus.mutateAsync(target);
      editor.setSavedStatus(target);
      setArchiveConfirmOpen(false);
      setStatusMessage(isArchived ? 'Fiche restaurée.' : 'Fiche archivée.');
    } catch (error) {
      setArchiveConfirmOpen(false);
      setStatusMessage(error instanceof Error ? error.message : 'Changement de statut impossible.');
    }
  }
```

- [ ] **Step 3: Pass tools to `EditorNav`** (modify the `<EditorNav ... />` on line 315)

```tsx
        <EditorNav
          groups={groups}
          activeNum={activeNum}
          sectionState={navSectionState}
          onSelect={scrollToSection}
          tools={editorTools}
          onToolSelect={handleToolSelect}
        />
```

- [ ] **Step 4: Render the ConfirmDialog** (just before the existing `<BlockersModal ... />` on line 339, inside the returned JSX)

```tsx
      <ConfirmDialog
        open={archiveConfirmOpen}
        title={isArchived ? 'Restaurer la fiche' : 'Archiver la fiche'}
        message={
          isArchived
            ? 'La fiche quittera l’état archivé et redeviendra modifiable (brouillon ou hors-ligne). Elle pourra être republiée.'
            : 'La fiche sera archivée et retirée de l’Explorer. Aucune donnée n’est supprimée — vous pourrez la restaurer.'
        }
        confirmLabel={isArchived ? 'Restaurer' : 'Archiver'}
        cancelLabel="Annuler"
        tone={isArchived ? 'default' : 'danger'}
        onCancel={() => setArchiveConfirmOpen(false)}
        onConfirm={() => void handleArchiveConfirm()}
      />
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0 (no type errors).

- [ ] **Step 6: Run the editor test suite (regression)**

Run: `npx jest src/features/object-editor`
Expected: PASS — all existing object-editor specs + the new editor-tools / EditorNav specs.

- [ ] **Step 7: Production build**

Run: `npm run build`
Expected: exit 0 (`.test.*` excluded from the build per tsconfig).

- [ ] **Step 8: Manual verification (preview)**

Start the dev server (preview_start), open `/objects/<id>/edit` for a **published** fiche:
- OUTILS shows 3 entries (Versions/historique + Import/export grisés « Bientôt disponible » ; **pas** de « Dupliquer la fiche »).
- Click « Archiver » → ConfirmDialog (tone danger) → Confirmer → save-bar « Fiche archivée. » ; rouvrir l'éditeur d'une fiche archivée : l'entrée affiche « Restaurer » (tone neutre) et restaure vers hidden/draft.
- With a read-only persona (`canDirectWrite=false`), « Archiver » est grisé avec la raison en `title`.
Capture a screenshot of the OUTILS group + the archive ConfirmDialog as proof.

- [ ] **Step 9: Commit**

```bash
git -C "C:/Users/dphil/Bertel3.0" add bertel-tourism-ui/src/features/object-editor/ObjectEditPage.tsx
git -C "C:/Users/dphil/Bertel3.0" commit -m "feat(editor): wire Archiver/Restaurer tool via ConfirmDialog + rpc_set_object_status (B)"
```

---

## Self-Review

**1. Spec coverage (tranche B scope):**
- Spec §3.B « Archiver » : l'entrée OUTILS appelle `useSetObjectStatusMutation` via `ConfirmDialog`, bascule Archiver↔Restaurer, grisée sans droit → Tasks 1 (logique) + 3 (câblage). ✔
- Spec §4 cross-cutting : `EditorNav` prop-driven (`tools`), suppression de « Dupliquer la fiche » → Tasks 1+2. ✔
- Spec §2 : badge `v12` factice supprimé (pas de `stat` sur versions) → Task 1 test + impl. ✔
- Out of scope ici (tranches A/C/E) : versions/import-export restent désactivés « Bientôt disponible » — assumé. ✔

**2. Placeholder scan:** aucun TBD/TODO ; chaque étape porte le code complet. ✔

**3. Type consistency:** `EditorToolItem` / `EditorToolKey` / `buildEditorTools` / `archiveTargetStatus` définis en Task 1 et consommés à l'identique en Tasks 2 et 3. `archiveTargetStatus(status, publishedAt)` appelée avec `(lifecycleStatus, lifecyclePublishedAt)` — signatures alignées. `EditorNav` props `tools`/`onToolSelect` définies en Task 2, passées en Task 3. ✔

> Note de planning (hors tranche B) : la source du flag « admin » pour le §22 (tranche A), la garde de statut au restore (C), la résolution `created_by` (C), le CSS print et les colonnes CSV (E), et le prochain id de manifeste SQL restent à fixer dans les plans A/C/E (cf. spec §6).
