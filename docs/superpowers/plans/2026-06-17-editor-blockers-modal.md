# Modal explicatif des blocages enregistrement/publication — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher un modal explicatif — groupé par section, avec « Aller à la section » — quand un enregistrement ou une publication est empêché(e) dans l'éditeur de fiche pleine page.

**Architecture:** Frontend uniquement. On réutilise le type `Issue` et `validateForPublication` existants. Trois helpers purs convertissent les résultats de `save()`/RPC publish en `Issue[]` et les regroupent par section. Un nouveau composant `BlockersModal` (sur le primitive `Dialog`) rend les groupes. `EditorReady` (dans `ObjectEditPage.tsx`) pilote l'ouverture ; le bouton « Publier » redevient cliquable et la pastille de validation de la barre ouvre le modal.

**Tech Stack:** React 19 + TypeScript, Jest + React Testing Library, primitive `Dialog` (`components/ui/dialog`), CSS maison (`object-editor.css`).

## Global Constraints

- **Frontend-only** — aucune modification SQL/API/serveur, aucune modification des règles `VALIDATION_RULES`.
- **Type unique** — tout blocage est un `Issue { section: string; message: string; tone: 'req' | 'warn' }` (de `editor-validation.ts`). Pas de type parallèle.
- **Pas de write-trap silencieux** — ce travail renforce l'invariant « Editor — no silent write-traps ».
- **Réutiliser les patterns modal existants** — `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogFooter` comme `EditorModal`/`ConfirmDialog`. Classe `object-editor` sur le `DialogContent`.
- **Réutiliser les styles `.issue`/`.issue__dot.req`/`.issue__dot.warn`/`.issue__body`/`.issue__go`** existants pour les lignes.
- **Pas de fausse section** — les erreurs d'enregistrement (clés par module) sont libellées par nom de module, jamais rattachées de force à un numéro de section.
- **Commits** : type conventionnel, directement sur `master`, `git add` des chemins explicites uniquement (l'arbre de travail contient des édits parallèles du PO). Pas de push (le PO pousse), pas de trailer co-author.
- **Commandes** (cwd `bertel-tourism-ui/`) : test ciblé `npx jest <path>` ; suite `npm run test:run` ; types `npm run typecheck` ; build `npm run build`.

---

### Task 1: Helpers purs `save-issues.ts`

**Files:**
- Create: `bertel-tourism-ui/src/features/object-editor/save-issues.ts`
- Test: `bertel-tourism-ui/src/features/object-editor/save-issues.test.ts`

**Interfaces:**
- Consumes: `Issue` (de `./editor-validation`), `EditorSaveResult` (type, de `./useEditorSave`), `WorkspaceModuleId` (de `../../services/object-workspace`), `MODULE_KEY_MAP` (de `./editor-state`, pour le test de couverture).
- Produces:
  - `MODULE_LABEL: Record<WorkspaceModuleId, string>`
  - `moduleLabel(module: WorkspaceModuleId): string`
  - `saveResultToIssues(result: EditorSaveResult): Issue[]` — `tone: 'req'`, `section` = libellé module
  - `publishErrorToIssue(error: unknown): Issue` — `section: 'Publication'`, `tone: 'req'`
  - `interface IssueGroup { num: string; label: string; issues: Issue[] }`
  - `groupIssuesBySection(issues: Issue[], sectionLabels: Record<string, string>): IssueGroup[]` — ordre de première apparition

- [ ] **Step 1: Write the failing test**

Create `bertel-tourism-ui/src/features/object-editor/save-issues.test.ts`:

```ts
import {
  MODULE_LABEL,
  moduleLabel,
  saveResultToIssues,
  publishErrorToIssue,
  groupIssuesBySection,
} from './save-issues';
import { MODULE_KEY_MAP } from './editor-state';
import type { EditorSaveResult } from './useEditorSave';

describe('save-issues', () => {
  it('maps failed and blocked modules to req issues labelled by module', () => {
    const result: EditorSaveResult = {
      saved: [],
      failed: [{ module: 'pricing', message: 'Remise invalide.' }],
      blocked: [{ module: 'media', reason: 'Droits insuffisants' }],
    };
    const issues = saveResultToIssues(result);
    expect(issues).toEqual([
      { section: 'Tarifs, paiement & extras', message: 'Remise invalide.', tone: 'req' },
      { section: 'Médias', message: 'Lecture seule : Droits insuffisants', tone: 'req' },
    ]);
  });

  it('returns [] for an empty save result', () => {
    expect(saveResultToIssues({ saved: [], failed: [], blocked: [] })).toEqual([]);
  });

  it('turns a publish Error into a Publication req issue, with a fallback for non-errors', () => {
    expect(publishErrorToIssue(new Error('RPC refusé'))).toEqual({
      section: 'Publication',
      message: 'RPC refusé',
      tone: 'req',
    });
    expect(publishErrorToIssue('boom')).toEqual({
      section: 'Publication',
      message: 'Publication impossible.',
      tone: 'req',
    });
  });

  it('groups issues by section in first-seen order and resolves labels', () => {
    const groups = groupIssuesBySection(
      [
        { section: '04', message: 'Accroche', tone: 'req' },
        { section: '02', message: 'Commune', tone: 'req' },
        { section: '04', message: 'Descriptif', tone: 'req' },
        { section: '99', message: 'Inconnue', tone: 'req' },
      ],
      { '02': 'Localisation', '04': 'Descriptions & langues parlées' },
    );
    expect(groups).toEqual([
      {
        num: '04',
        label: 'Descriptions & langues parlées',
        issues: [
          { section: '04', message: 'Accroche', tone: 'req' },
          { section: '04', message: 'Descriptif', tone: 'req' },
        ],
      },
      { num: '02', label: 'Localisation', issues: [{ section: '02', message: 'Commune', tone: 'req' }] },
      { num: '99', label: '', issues: [{ section: '99', message: 'Inconnue', tone: 'req' }] },
    ]);
  });

  it('provides a non-empty label for every workspace module id', () => {
    for (const module of Object.keys(MODULE_KEY_MAP)) {
      expect(moduleLabel(module as keyof typeof MODULE_KEY_MAP)).toBeTruthy();
    }
    expect(Object.keys(MODULE_LABEL).sort()).toEqual(Object.keys(MODULE_KEY_MAP).sort());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd bertel-tourism-ui && npx jest save-issues`
Expected: FAIL — `Cannot find module './save-issues'`.

- [ ] **Step 3: Write minimal implementation**

Create `bertel-tourism-ui/src/features/object-editor/save-issues.ts`:

```ts
import type { Issue } from './editor-validation';
import type { EditorSaveResult } from './useEditorSave';
import type { WorkspaceModuleId } from '../../services/object-workspace';

/**
 * Human label per workspace module — used to title save/permission errors in the
 * BlockersModal. Keyed by WorkspaceModuleId so the Record type forces full coverage
 * (mirrors MODULE_KEY_MAP). Errors are grouped by module, never by a forced section
 * (several modules — e.g. characteristics — legitimately span multiple sections).
 */
export const MODULE_LABEL: Record<WorkspaceModuleId, string> = {
  'general-info': 'Identité & taxonomie',
  taxonomy: 'Taxonomie',
  publication: 'Publication',
  'sync-identifiers': 'Identifiants externes',
  location: 'Localisation',
  descriptions: 'Descriptions & langues parlées',
  media: 'Médias',
  contacts: 'Contacts',
  characteristics: 'Caractéristiques',
  distinctions: 'Classifications',
  'capacity-policies': 'Capacité & accueil',
  pricing: 'Tarifs, paiement & extras',
  rooms: 'Chambres',
  'meeting-rooms': 'Salles de réunion',
  menus: 'Cartes & menus',
  activity: 'Activité',
  event: 'Dates & programmation',
  itinerary: 'Itinéraire',
  openings: "Périodes d'ouverture",
  'provider-follow-up': 'Suivi prestataire',
  relationships: 'Liens vers fiches',
  memberships: 'Rattachements',
  legal: 'Juridique',
  tags: 'Tags & étiquettes',
  sustainability: 'Démarche durable',
  distribution: 'Distribution',
  provider: 'Prestataire',
};

export function moduleLabel(module: WorkspaceModuleId): string {
  return MODULE_LABEL[module] ?? module;
}

/** Convert a batched save result into req-tone Issues, labelled by module. */
export function saveResultToIssues(result: EditorSaveResult): Issue[] {
  const failed: Issue[] = result.failed.map((entry) => ({
    section: moduleLabel(entry.module),
    message: entry.message,
    tone: 'req',
  }));
  const blocked: Issue[] = result.blocked.map((entry) => ({
    section: moduleLabel(entry.module),
    message: `Lecture seule : ${entry.reason}`,
    tone: 'req',
  }));
  return [...failed, ...blocked];
}

/** Convert a publish RPC rejection into a single Publication req Issue. */
export function publishErrorToIssue(error: unknown): Issue {
  return {
    section: 'Publication',
    message: error instanceof Error ? error.message : 'Publication impossible.',
    tone: 'req',
  };
}

export interface IssueGroup {
  num: string;
  label: string;
  issues: Issue[];
}

/** Group section-keyed issues, preserving first-seen order; unknown sections get an empty label. */
export function groupIssuesBySection(
  issues: Issue[],
  sectionLabels: Record<string, string>,
): IssueGroup[] {
  const order: string[] = [];
  const byNum = new Map<string, Issue[]>();
  for (const issue of issues) {
    const bucket = byNum.get(issue.section);
    if (bucket) {
      bucket.push(issue);
    } else {
      byNum.set(issue.section, [issue]);
      order.push(issue.section);
    }
  }
  return order.map((num) => ({
    num,
    label: sectionLabels[num] ?? '',
    issues: byNum.get(num) as Issue[],
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd bertel-tourism-ui && npx jest save-issues`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck**

Run: `cd bertel-tourism-ui && npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
cd bertel-tourism-ui
git add src/features/object-editor/save-issues.ts src/features/object-editor/save-issues.test.ts
git commit -m "feat(editor): pure helpers — save/publish errors → grouped Issues"
```

---

### Task 2: Composant `BlockersModal`

**Files:**
- Create: `bertel-tourism-ui/src/features/object-editor/widgets/BlockersModal.tsx`
- Test: `bertel-tourism-ui/src/features/object-editor/widgets/BlockersModal.test.tsx`
- Modify: `bertel-tourism-ui/src/features/object-editor/object-editor.css` (ajout de styles de groupe en fin de fichier)

**Interfaces:**
- Consumes: `Issue` (de `../editor-validation`), `groupIssuesBySection` (de `../save-issues`), `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogFooter` (de `../../../components/ui/dialog`).
- Produces:
  - `interface BlockersModalProps { open: boolean; onClose: () => void; context: 'publish' | 'save'; requiredBlockers: Issue[]; saveErrors: Issue[]; warnings: Issue[]; sectionLabels: Record<string, string>; onGoToSection: (num: string) => void }`
  - `function BlockersModal(props: BlockersModalProps): JSX.Element`

- [ ] **Step 1: Write the failing test**

Create `bertel-tourism-ui/src/features/object-editor/widgets/BlockersModal.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { BlockersModal } from './BlockersModal';

const sectionLabels = { '02': 'Localisation', '04': 'Descriptions & langues parlées' };

const baseProps = {
  open: true,
  onClose: jest.fn(),
  context: 'publish' as const,
  requiredBlockers: [],
  saveErrors: [],
  warnings: [],
  sectionLabels,
  onGoToSection: jest.fn(),
};

describe('BlockersModal', () => {
  it('titles the modal from the context', () => {
    const { rerender } = render(<BlockersModal {...baseProps} context="publish" />);
    expect(screen.getByText('Publication impossible')).toBeInTheDocument();
    rerender(<BlockersModal {...baseProps} context="save" />);
    expect(screen.getByText('Enregistrement incomplet')).toBeInTheDocument();
  });

  it('groups required blockers by section with their label and navigates on click', () => {
    const onGoToSection = jest.fn();
    render(
      <BlockersModal
        {...baseProps}
        requiredBlockers={[{ section: '02', message: 'La commune est obligatoire.', tone: 'req' }]}
        onGoToSection={onGoToSection}
      />,
    );
    expect(screen.getByText(/Section 02 — Localisation/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('La commune est obligatoire.'));
    expect(onGoToSection).toHaveBeenCalledWith('02');
  });

  it('renders save errors under their own group, labelled by module', () => {
    render(
      <BlockersModal
        {...baseProps}
        context="save"
        saveErrors={[{ section: 'Tarifs, paiement & extras', message: 'Remise invalide.', tone: 'req' }]}
      />,
    );
    expect(screen.getByText("Erreurs d’enregistrement")).toBeInTheDocument();
    expect(screen.getByText('Tarifs, paiement & extras')).toBeInTheDocument();
    expect(screen.getByText('Remise invalide.')).toBeInTheDocument();
  });

  it('lists warnings under a separate non-blocking heading', () => {
    render(
      <BlockersModal
        {...baseProps}
        warnings={[{ section: '04', message: 'Descriptif court.', tone: 'warn' }]}
      />,
    );
    expect(screen.getByText('Alertes non bloquantes')).toBeInTheDocument();
    expect(screen.getByText('Descriptif court.')).toBeInTheDocument();
  });

  it('does not render empty groups', () => {
    render(<BlockersModal {...baseProps} />);
    expect(screen.queryByText("Erreurs d’enregistrement")).not.toBeInTheDocument();
    expect(screen.queryByText('Alertes non bloquantes')).not.toBeInTheDocument();
  });

  it('fires onClose from the footer button', () => {
    const onClose = jest.fn();
    render(<BlockersModal {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd bertel-tourism-ui && npx jest BlockersModal`
Expected: FAIL — `Cannot find module './BlockersModal'`.

- [ ] **Step 3: Write minimal implementation**

Create `bertel-tourism-ui/src/features/object-editor/widgets/BlockersModal.tsx`:

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../../components/ui/dialog';
import type { Issue } from '../editor-validation';
import { groupIssuesBySection } from '../save-issues';

interface BlockersModalProps {
  open: boolean;
  onClose: () => void;
  /** Drives the title/intro: a blocked publish vs a failed/partial save. */
  context: 'publish' | 'save';
  /** Required-field publication blockers (section = num). */
  requiredBlockers: Issue[];
  /** Save/permission/RPC errors (section = module label). */
  saveErrors: Issue[];
  /** Non-blocking warnings (section = num). */
  warnings: Issue[];
  /** num → human section label. */
  sectionLabels: Record<string, string>;
  onGoToSection: (num: string) => void;
}

/**
 * Explains, on a blocked save/publish attempt, which information in which section
 * blocks and why — grouped by section with a jump action — and lists non-blocking
 * alerts separately. Complements the always-on IssuesRail; does not replace it.
 */
export function BlockersModal({
  open,
  onClose,
  context,
  requiredBlockers,
  saveErrors,
  warnings,
  sectionLabels,
  onGoToSection,
}: BlockersModalProps) {
  const title = context === 'publish' ? 'Publication impossible' : 'Enregistrement incomplet';
  const intro =
    context === 'publish'
      ? 'Corrigez les points suivants avant de publier la fiche.'
      : "Certaines sections n'ont pas pu être enregistrées.";
  const blockerGroups = groupIssuesBySection(requiredBlockers, sectionLabels);
  const warningGroups = groupIssuesBySection(warnings, sectionLabels);

  return (
    <Dialog open={open} onOpenChange={(next: boolean) => { if (!next) onClose(); }}>
      <DialogContent className="object-editor">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="blockers-modal__body">
          <p className="blockers-modal__intro">{intro}</p>

          {saveErrors.length > 0 && (
            <section className="blockers-group">
              <h4 className="blockers-group__head">Erreurs d’enregistrement</h4>
              {saveErrors.map((issue) => (
                <div key={`${issue.section}-${issue.message}`} className="issue issue--static">
                  <span className="issue__dot req" />
                  <span className="issue__body">
                    <strong>{issue.section}</strong>
                    <small>{issue.message}</small>
                  </span>
                </div>
              ))}
            </section>
          )}

          {blockerGroups.map((group) => (
            <section key={group.num} className="blockers-group">
              <h4 className="blockers-group__head">
                Section {group.num}{group.label ? ` — ${group.label}` : ''}
              </h4>
              {group.issues.map((issue) => (
                <button
                  type="button"
                  key={issue.message}
                  className="issue"
                  onClick={() => onGoToSection(group.num)}
                >
                  <span className="issue__dot req" />
                  <span className="issue__body"><small>{issue.message}</small></span>
                  <span className="issue__go">Aller ›</span>
                </button>
              ))}
            </section>
          ))}

          {warningGroups.length > 0 && (
            <div className="blockers-modal__warn">
              <h4 className="blockers-modal__warn-head">Alertes non bloquantes</h4>
              {warningGroups.map((group) => (
                <section key={group.num} className="blockers-group">
                  <h5 className="blockers-group__head">
                    Section {group.num}{group.label ? ` — ${group.label}` : ''}
                  </h5>
                  {group.issues.map((issue) => (
                    <button
                      type="button"
                      key={issue.message}
                      className="issue"
                      onClick={() => onGoToSection(group.num)}
                    >
                      <span className="issue__dot warn" />
                      <span className="issue__body"><small>{issue.message}</small></span>
                      <span className="issue__go">Aller ›</span>
                    </button>
                  ))}
                </section>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <button type="button" className="btn primary" onClick={onClose}>Fermer</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd bertel-tourism-ui && npx jest BlockersModal`
Expected: PASS (6 tests).

- [ ] **Step 5: Add modal styles**

Append to the end of `bertel-tourism-ui/src/features/object-editor/object-editor.css`:

```css
/* §95 — BlockersModal: groupes de blocages par section + séparateur alertes. */
.object-editor .blockers-modal__body { display: grid; gap: 14px; }
.object-editor .blockers-modal__intro { margin: 0; font-size: 12px; color: var(--ink-4); }
.object-editor .blockers-group { display: grid; }
.object-editor .blockers-group__head {
  margin: 0; font-size: 11px; font-weight: 800;
  text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-3);
}
.object-editor .issue--static { cursor: default; }
.object-editor .blockers-modal__warn { border-top: 1px solid var(--line-soft); padding-top: 12px; }
.object-editor .blockers-modal__warn-head {
  margin: 0 0 4px; font-size: 11.5px; font-weight: 800; color: var(--ink-3);
}
```

- [ ] **Step 6: Typecheck**

Run: `cd bertel-tourism-ui && npm run typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
cd bertel-tourism-ui
git add src/features/object-editor/widgets/BlockersModal.tsx src/features/object-editor/widgets/BlockersModal.test.tsx src/features/object-editor/object-editor.css
git commit -m "feat(editor): BlockersModal — grouped blockers + save errors + alerts"
```

---

### Task 3: `EditorTopbar` — Publier cliquable + pastille déclencheur

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/shell/EditorTopbar.tsx`
- Test: `bertel-tourism-ui/src/features/object-editor/shell/EditorTopbar.test.tsx`

**Interfaces:**
- Consumes: rien de nouveau.
- Produces: `EditorTopbarProps` gagne `onShowBlockers?: () => void`. La pastille `edit-top__validation` devient un `<button>` quand `onShowBlockers` est fourni. « Publier » n'est plus désactivé par `publishDisabled` (reste désactivé sur `publishing`/`saving`).

- [ ] **Step 1: Write the failing test**

Append these tests inside the `describe('EditorTopbar', …)` block in `bertel-tourism-ui/src/features/object-editor/shell/EditorTopbar.test.tsx`:

```tsx
  it('keeps Publier clickable even with blockers and calls onPublish', () => {
    const onPublish = jest.fn();
    render(<EditorTopbar {...baseProps} blockerCount={3} onPublish={onPublish} />);
    const publish = screen.getByRole('button', { name: 'Publier' });
    expect(publish).not.toBeDisabled();
    fireEvent.click(publish);
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it('makes the validation chip a button that calls onShowBlockers', () => {
    const onShowBlockers = jest.fn();
    render(<EditorTopbar {...baseProps} blockerCount={2} onShowBlockers={onShowBlockers} />);
    fireEvent.click(screen.getByRole('button', { name: /2 blocages/ }));
    expect(onShowBlockers).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd bertel-tourism-ui && npx jest EditorTopbar`
Expected: FAIL — Publier is disabled (current code disables on... actually publishDisabled defaults false, so the first new test may already pass; the second FAILS because the chip is a `<span>`, not a button → `getByRole('button', { name: /2 blocages/ })` throws).

- [ ] **Step 3: Write minimal implementation**

In `bertel-tourism-ui/src/features/object-editor/shell/EditorTopbar.tsx`:

3a. Add `onShowBlockers?: () => void;` to the `EditorTopbarProps` interface (after `onSaveDraft?`):

```tsx
  onSaveDraft?: () => void;
  onShowBlockers?: () => void;
```

3b. Add `onShowBlockers` to the destructured params (after `onSaveDraft,`):

```tsx
  onSaveDraft,
  onShowBlockers,
}: EditorTopbarProps) {
```

3c. Replace the validation `<span>` block:

```tsx
        <span className={`edit-top__validation${blockerCount > 0 ? ' has-blockers' : ''}`}>
          {blockerCount > 0
            ? `${blockerCount} blocage${blockerCount > 1 ? 's' : ''}`
            : `${warningCount} alerte${warningCount > 1 ? 's' : ''}`}
        </span>
```

with:

```tsx
        {(() => {
          const validationLabel =
            blockerCount > 0
              ? `${blockerCount} blocage${blockerCount > 1 ? 's' : ''}`
              : `${warningCount} alerte${warningCount > 1 ? 's' : ''}`;
          const validationClass = `edit-top__validation${blockerCount > 0 ? ' has-blockers' : ''}`;
          return onShowBlockers ? (
            <button type="button" className={validationClass} onClick={onShowBlockers}>
              {validationLabel}
            </button>
          ) : (
            <span className={validationClass}>{validationLabel}</span>
          );
        })()}
```

3d. The Publish button already reads `disabled={publishDisabled || publishing || saving}`. Leave it — Task 4 stops passing the blocker-based `publishDisabled`, so `publishDisabled` defaults to `false`. No change needed here.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd bertel-tourism-ui && npx jest EditorTopbar`
Expected: PASS (all tests, including the two new ones).

- [ ] **Step 5: Typecheck**

Run: `cd bertel-tourism-ui && npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
cd bertel-tourism-ui
git add src/features/object-editor/shell/EditorTopbar.tsx src/features/object-editor/shell/EditorTopbar.test.tsx
git commit -m "feat(editor): topbar — clickable Publier + validation chip opens blockers"
```

---

### Task 4: Câblage `ObjectEditPage` (EditorReady)

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/ObjectEditPage.tsx`

**Interfaces:**
- Consumes: `BlockersModal` (Task 2), `saveResultToIssues`/`publishErrorToIssue` (Task 1), `Issue` (de `./editor-validation`), `onShowBlockers` (Task 3).
- Produces: rien de réutilisable par d'autres tâches (tâche terminale). Pilote l'ouverture du modal.

> **Note de testabilité :** `ObjectEditPage`/`EditorReady` est un conteneur lourd (QueryClient, ui-store, 22 sections, scroll-spy) et n'a aucun fichier de test existant ; la logique réellement testable vit dans les helpers purs (Task 1) et les composants (Tasks 2–3), déjà couverts. La vérification de cette tâche = `typecheck` + suite complète verte + build + vérification visuelle dans le preview (un blocage ⇒ modal ; un enregistrement échoué ⇒ modal). On n'ajoute pas de test de page fragile.

- [ ] **Step 1: Add imports**

In `bertel-tourism-ui/src/features/object-editor/ObjectEditPage.tsx`, after the `validateForPublication` import (line ~22):

```tsx
import { validateForPublication, type Issue } from './editor-validation';
import { saveResultToIssues, publishErrorToIssue } from './save-issues';
import { BlockersModal } from './widgets/BlockersModal';
```

(The first line already exists — add only the two new lines beneath it.)

- [ ] **Step 2: Add state + sectionLabels in EditorReady**

After `const [savingDraft, setSavingDraft] = useState(false);` (line ~140):

```tsx
  const [blockersModalOpen, setBlockersModalOpen] = useState(false);
  const [modalContext, setModalContext] = useState<'publish' | 'save'>('publish');
  const [saveErrors, setSaveErrors] = useState<Issue[]>([]);
```

After the `historyItems` memo (line ~174):

```tsx
  const sectionLabels = useMemo(
    () => Object.fromEntries(navItems.map((item) => [item.num, item.label])),
    [navItems],
  );
```

- [ ] **Step 3: Make persistDirtyModules return structured errors**

Replace the whole `persistDirtyModules` function body with:

```tsx
  /** Persist local draft modules to the database (shared by publish and draft-save). */
  async function persistDirtyModules(): Promise<{ ok: boolean; saveErrors: Issue[] }> {
    const dirty = (Object.keys(editor.dirtySections) as WorkspaceModuleId[]).filter(
      (m) => editor.dirtySections[m],
    );
    if (dirty.length === 0) {
      return { ok: true, saveErrors: [] };
    }

    const result = await save(dirty, resource.permissions, editor.draft);
    editor.commitModules(
      result.saved.flatMap((m) => (m === 'publication' ? ['generalInfo'] : [MODULE_KEY_MAP[m]])),
    );

    const issues = saveResultToIssues(result);
    if (result.failed.length > 0) {
      // §48 — keep the terse save-bar message; the modal carries the full per-section detail.
      setStatusMessage(`${result.failed.length} section(s) en échec : ${result.failed[0].message}`);
      return { ok: false, saveErrors: issues };
    }
    if (result.blocked.length > 0) {
      setStatusMessage(
        `${result.saved.length} section(s) enregistrée(s), ${result.blocked.length} bloquée(s).`,
      );
      return { ok: false, saveErrors: issues };
    }

    return { ok: true, saveErrors: [] };
  }
```

- [ ] **Step 4: Open the modal from handleSaveDraft**

Replace `handleSaveDraft` with:

```tsx
  /** Persist work-in-progress without publishing and without the blocker gate. */
  async function handleSaveDraft() {
    setStatusMessage(null);
    setSavingDraft(true);
    try {
      const { ok, saveErrors: errors } = await persistDirtyModules();
      if (ok) {
        setStatusMessage('Brouillon enregistré.');
      } else {
        setSaveErrors(errors);
        setModalContext('save');
        setBlockersModalOpen(true);
      }
    } finally {
      setSavingDraft(false);
    }
  }
```

- [ ] **Step 5: Open the modal from handlePublish**

Replace `handlePublish` with:

```tsx
  async function handlePublish() {
    if (validation.blockers.length > 0) {
      setSaveErrors([]);
      setModalContext('publish');
      setBlockersModalOpen(true);
      setStatusMessage(`${validation.blockers.length} blocage(s) empêchent la publication.`);
      return;
    }

    setStatusMessage(null);
    const { ok, saveErrors: errors } = await persistDirtyModules();
    if (!ok) {
      setSaveErrors(errors);
      setModalContext('save');
      setBlockersModalOpen(true);
      return;
    }

    try {
      await publishObject.mutateAsync(true);
      editor.setSavedStatus('published');
      setStatusMessage('Fiche enregistrée et publiée.');
    } catch (error) {
      const issue = publishErrorToIssue(error);
      setSaveErrors([issue]);
      setModalContext('save');
      setBlockersModalOpen(true);
      setStatusMessage(issue.message);
    }
  }

  /** Open the explanatory modal from the topbar validation chip. */
  function showBlockers() {
    setSaveErrors([]);
    setModalContext('publish');
    setBlockersModalOpen(true);
  }
```

- [ ] **Step 6: Wire the topbar + remove the blocker-based publishDisabled**

In the `<EditorTopbar … />` JSX, remove this line:

```tsx
        publishDisabled={validation.blockers.length > 0}
```

and add (after `onSaveDraft={() => void handleSaveDraft()}`):

```tsx
        onShowBlockers={
          validation.blockers.length > 0 || validation.warnings.length > 0 ? showBlockers : undefined
        }
```

- [ ] **Step 7: Render the modal**

Immediately before the closing `</div>` of the root `edit-flat` container (after `</div>` that closes `.edit-body`, line ~308), add:

```tsx
      <BlockersModal
        open={blockersModalOpen}
        onClose={() => setBlockersModalOpen(false)}
        context={modalContext}
        requiredBlockers={validation.blockers}
        saveErrors={saveErrors}
        warnings={validation.warnings}
        sectionLabels={sectionLabels}
        onGoToSection={(num) => {
          scrollToSection(num);
          setBlockersModalOpen(false);
        }}
      />
```

- [ ] **Step 8: Typecheck**

Run: `cd bertel-tourism-ui && npm run typecheck`
Expected: exit 0.

- [ ] **Step 9: Run the full editor suite**

Run: `cd bertel-tourism-ui && npx jest object-editor`
Expected: PASS (existing editor specs + the new save-issues/BlockersModal/EditorTopbar specs).

- [ ] **Step 10: Commit**

```bash
cd bertel-tourism-ui
git add src/features/object-editor/ObjectEditPage.tsx
git commit -m "feat(editor): open BlockersModal on blocked publish/save; enable Publier"
```

---

### Task 5: Vérification finale (suite + build + preview)

**Files:** aucun (vérification).

- [ ] **Step 1: Full test suite**

Run: `cd bertel-tourism-ui && npm run test:run`
Expected: exit 0, suite verte (aucune régression).

- [ ] **Step 2: Typecheck**

Run: `cd bertel-tourism-ui && npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Production build**

Run: `cd bertel-tourism-ui && npm run build`
Expected: exit 0 (les `*.test.*` sont exclus du build par tsconfig).

- [ ] **Step 4: Preview verification (preview_* tools)**

1. `preview_start` (ou réutiliser un serveur en cours).
2. Naviguer vers `/objects/<id>/edit` d'un objet `draft` incomplet (nom/commune/accroche/descriptif manquants).
3. Cliquer « Publier » → vérifier que le **BlockersModal** s'ouvre avec « Publication impossible », les sections groupées (Section 01 — Identité…, Section 02 — Localisation…) et un bouton « Aller à la section ».
4. Cliquer « Aller à la section » sur un blocage → vérifier le scroll vers la section et la fermeture du modal.
5. Cliquer la pastille « N blocages » de la barre → vérifier la réouverture du modal.
6. `preview_screenshot` pour preuve visuelle.

- [ ] **Step 5: Mettre à jour le journal de décisions**

Ajouter une entrée (§95 ou numéro libre suivant) dans `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` : modal explicatif des blocages enregistrement/publication ; bouton Publier réactivé (ouvre le modal au lieu d'être un cul-de-sac désactivé) ; frontend-only ; helpers `save-issues.ts` + `BlockersModal`. Commit :

```bash
cd bertel-tourism-ui
git add claude_brief/lot1_mapping_decisions.md
git commit -m "docs(editor): journal — modal explicatif des blocages publication/enregistrement"
```

> `CLAUDE.md` est gitignoré (local-only) ; si un nouvel invariant émerge, le proposer au PO mais ne pas committer.

---

## Self-Review

**Spec coverage:**
- §2 décision 1 (Publier cliquable → modal) → Task 3 (Publier non désactivé + pastille) + Task 4 (handlePublish ouvre le modal, retrait de `publishDisabled`). ✓
- §2 décision 2 (blocages groupés par section + alertes séparées) → Task 2 (BlockersModal groupes A/B/C). ✓
- §3 modèle (3 sources → Issue) → Task 1 (`saveResultToIssues`, `publishErrorToIssue`) + Task 4 (`validation.blockers`/`warnings`). ✓
- §4.1 BlockersModal → Task 2. ✓
- §4.2 save-issues.ts → Task 1. ✓
- §4.3 wiring → Task 4. ✓
- §4.4 topbar → Task 3. ✓
- §4.5 CSS → Task 2 (Step 5). ✓
- §6 tests → Task 1 (purs), Task 2 (modal), Task 3 (topbar) ; §7 page non testée justifiée dans Task 4. ✓

**Placeholder scan:** aucun TBD/TODO ; tout le code est complet et littéral. ✓

**Type consistency:** `Issue { section, message, tone }` cohérent partout ; `EditorSaveResult { saved, failed:[{module,message}], blocked:[{module,reason}] }` (de `useEditorSave.ts`) consommé tel quel par `saveResultToIssues` ; `BlockersModalProps` identique entre Task 2 (déf) et Task 4 (usage) ; `groupIssuesBySection(issues, sectionLabels)` même signature en Task 1/2 ; `onShowBlockers?: () => void` même nom en Task 3/4. ✓
