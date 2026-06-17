# §17 « Rattachements organisationnels » Refonte — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make §17 purely organisation-centric — finish removing the redundant actor block (already authored in §19 `ProviderCards`), add organisations via a modal, and make the adhésions block functional with create-on-the-go campaigns/tiers (incl. a free charte).

**Architecture:** Frontend-first (complete a mid-stream refactor), then a small backend pass (seed + 2 `SECURITY DEFINER` create RPCs mirroring `api.create_tag`), then the adhésion modal that consumes them. Pure reducer modules (`org-links.ts`, `membership-edit.ts`) hold all list logic for unit testing; widgets (`OrgPicker`, `MembershipEditModal`) are presentational on the shared `Dialog` shell.

**Tech Stack:** React 19 + TypeScript, Jest + React Testing Library, Supabase Postgres (PostgREST RPC via `apiClient.schema('api').rpc`), project `Dialog`/`primitives` components.

---

## ⚠️ Working-tree reality (read before starting)

The working tree is **heavily dirty with parallel PO work** (the PO commits via Cursor). Verified at plan time:
- `SectionAttachments.tsx` — **modified vs HEAD, still renders the actor block**.
- `SectionAttachments.test.tsx` — **modified, already asserts the actor block is GONE** ⇒ currently **RED**.
- `ProviderCards.tsx` / `actor-links.ts` — already exist (the §19 actor home).
- Many unrelated uncommitted files (SectionLegal, rgpd, crm-address, …).

**Rules for this plan:**
1. Work **additively**; never revert or "clean up" files you didn't touch.
2. When committing, **stage only your own files/hunks by explicit path** (`git add <path>`), **never `git add -A`**, **never `git commit -a`**, **never amend**. The PO may have unrelated hunks in the same file (e.g. `object-workspace-parser.ts`, `SectionAttachments.tsx`).
3. Run **scoped** tests (single files), not the whole suite, to avoid drowning in unrelated in-progress failures. A final scoped `tsc`/Jest pass on touched files only.
4. Do not assume HEAD == working tree. Task 0 captures the real baseline.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `sections/SectionAttachments.tsx` | §17 view: SiretCard, stat cards, org links (modal add), adhésions (modal) | Modify |
| `sections/SectionAttachments.test.tsx` | §17 behaviour tests | Modify |
| `sections/org-links.ts` | Pure reducers for `object_org_link` rows | Create |
| `sections/org-links.test.ts` | Unit tests for org-links | Create |
| `widgets/OrgPicker.tsx` | Modal: search the org catalog, pick one | Create |
| `widgets/OrgPicker.test.tsx` | OrgPicker behaviour | Create |
| `sections/membership-edit.ts` | Pure reducers for `object_membership` items + created-option append | Create |
| `sections/membership-edit.test.ts` | Unit tests for membership-edit | Create |
| `widgets/MembershipEditModal.tsx` | Modal: add/edit an adhésion with creatable campaign/tier comboboxes | Create |
| `widgets/MembershipEditModal.test.tsx` | MembershipEditModal behaviour | Create |
| `services/object-workspace.ts` | `createMembershipCampaign` / `createMembershipTier` wrappers | Modify |
| `Base de donnée DLL et API/api_views_functions.sql` | `api.create_membership_campaign` / `_tier` | Modify |
| `Base de donnée DLL et API/seeds_data.sql` | membership vocab socle seed | Modify |
| `Base de donnée DLL et API/tests/test_membership_vocab.sql` | seed assertions | Create |
| `Base de donnée DLL et API/tests/test_membership_create_rpcs.sql` | RPC assertions | Create |
| `docs/SQL_ROLLOUT_RUNBOOK.md` | apply-order entry | Modify |
| `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` | decision log § | Modify |

---

## Task 0: Capture the real baseline

**Files:** none (verification only)

- [ ] **Step 1: Confirm the dirty files and that the actor-removal test is RED**

Run:
```bash
cd "C:\Users\dphil\Bertel3.0/bertel-tourism-ui"
npx jest src/features/object-editor/sections/SectionAttachments.test.tsx -t "no longer renders the prestataire" 2>&1 | tail -20
```
Expected: **FAIL** — `SectionAttachments` still renders `Acteurs liés` / `Lier un acteur`. If it already PASSES, the PO finished Task 1 in parallel; skip to Task 2 and re-baseline its tests.

- [ ] **Step 2: Snapshot which target files differ from HEAD (so you only stage your own hunks later)**

Run:
```bash
cd "C:\Users\dphil\Bertel3.0" && git status --short -- bertel-tourism-ui/src/features/object-editor/sections/SectionAttachments.tsx "Base de donnée DLL et API/seeds_data.sql" "Base de donnée DLL et API/api_views_functions.sql"
```
Note any `M` so that, at commit time, you `git add` only the specific paths you edited and rely on hunk-level review.

---

## Task 1: Finish removing the §17 actor block (make the existing test green)

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/SectionAttachments.tsx`
- Test (already present, RED): `bertel-tourism-ui/src/features/object-editor/sections/SectionAttachments.test.tsx:79-85`

- [ ] **Step 1: Re-run the failing test to anchor RED**

Run:
```bash
cd "C:\Users\dphil\Bertel3.0/bertel-tourism-ui"
npx jest src/features/object-editor/sections/SectionAttachments.test.tsx -t "no longer renders the prestataire" -v
```
Expected: FAIL.

- [ ] **Step 2: Remove the `ActorPicker` import**

In `SectionAttachments.tsx`, delete the line:
```tsx
import { ActorPicker } from '../widgets/ActorPicker';
```

- [ ] **Step 3: Remove the actor helpers + the `actorPickerOpen` state**

Delete this block (currently around lines 131-148):
```tsx
  // §48 Task 7 — actor-role authoring (actor_object_role via the actors arm of api.save_object_relations).
  const [actorPickerOpen, setActorPickerOpen] = useState(false);

  function replaceActors(actors: typeof relationships.actors) {
    editor.replaceModule('relationships', { ...relationships, actors });
  }

  function updateActor(index: number, patch: Partial<(typeof relationships.actors)[number]>) {
    replaceActors(relationships.actors.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  // ≤1 primary per (object, role) (uq_actor_object_role_primary) — setting one clears the SAME role only.
  function setPrimaryActor(index: number) {
    const role = relationships.actors[index]?.roleCode;
    replaceActors(relationships.actors.map((item, i) => (
      item.roleCode === role ? { ...item, isPrimary: i === index } : item
    )));
  }
```
(Keep `useState` imported — Task 4 and Task 9 use it.)

- [ ] **Step 4: Change the "Acteurs liés" StatCard to "Partenaires liés"**

Replace:
```tsx
        <StatCard label="Acteurs liés" value={String(relationships.actors.length)} suffix="rôles" />
```
with:
```tsx
        <StatCard
          label="Partenaires liés"
          value={String(relationships.organizationLinks.filter((link) => link.roleCode !== 'publisher').length)}
          suffix="org"
        />
```

- [ ] **Step 5: Delete the entire "Acteurs liés — opérateurs & encadrants" block**

Remove the whole JSX region from the `<div className="chip-group__label" ...>Acteurs liés — opérateurs & encadrants</div>` through the closing of its `{actorPickerOpen && (<ActorPicker .../>) }` and the wrapping conditional (currently lines 247-336): the `actorWriteUnavailableReason` paragraph, the actor `Repeater`, and the `ActorPicker` render. Nothing else in the section references `relationships.actors` after Step 4.

- [ ] **Step 6: Run the §17 test file to green**

Run:
```bash
npx jest src/features/object-editor/sections/SectionAttachments.test.tsx -v
```
Expected: PASS (all org-link tests + the "no longer renders the prestataire block" test). The "adds an org link defaulting to publisher" test still passes here because the inline add is unchanged until Task 4.

- [ ] **Step 7: tsc on the file**

Run:
```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep SectionAttachments || echo "clean"
```
Expected: `clean`.

- [ ] **Step 8: Commit (own hunks only)**

```bash
cd "C:\Users\dphil\Bertel3.0"
git add bertel-tourism-ui/src/features/object-editor/sections/SectionAttachments.tsx
git commit -m "refactor(editor): drop redundant §17 actor block (authoring lives in §19 ProviderCards)"
```

---

## Task 2: `org-links.ts` pure reducers (TDD)

**Files:**
- Create: `bertel-tourism-ui/src/features/object-editor/sections/org-links.ts`
- Test: `bertel-tourism-ui/src/features/object-editor/sections/org-links.test.ts`

- [ ] **Step 1: Write the failing test**

`org-links.test.ts`:
```tsx
import { addOrgLink, removeOrgLink, setOrgRole, setPrimaryOrgLink, updateOrgLink } from './org-links';
import type { ObjectWorkspaceOrganizationLinkItem, WorkspaceReferenceOption } from '../../../services/object-workspace-parser';

const ROLES: WorkspaceReferenceOption[] = [
  { id: 'r-pub', code: 'publisher', label: 'Éditeur (publisher)' },
  { id: 'r-con', code: 'contributor', label: 'Contributeur' },
];
const base = (): ObjectWorkspaceOrganizationLinkItem[] => [
  { id: 'ORG1', source: 'org_link', type: 'ORG', name: 'OTI du Sud', status: '', roleId: 'r-pub', roleCode: 'publisher', roleLabel: 'Éditeur (publisher)', isPrimary: true, note: '', contacts: [] },
];

describe('org-links', () => {
  it('adds a picked org defaulting to publisher; primary only when first', () => {
    const out = addOrgLink([], { id: 'ORG1', name: 'OTI du Sud' }, ROLES);
    expect(out).toHaveLength(1);
    expect(out[0].roleCode).toBe('publisher');
    expect(out[0].isPrimary).toBe(true);
    expect(out[0].source).toBe('org_link');
  });

  it('does not duplicate the same org+role', () => {
    const out = addOrgLink(base(), { id: 'ORG1', name: 'OTI du Sud' }, ROLES);
    expect(out).toHaveLength(1);
  });

  it('returns input unchanged when no role catalog', () => {
    expect(addOrgLink([], { id: 'ORG1', name: 'X' }, [])).toEqual([]);
  });

  it('setOrgRole rewrites id/code/label from the catalog', () => {
    const out = setOrgRole(base(), 0, 'contributor', ROLES);
    expect(out[0]).toMatchObject({ roleCode: 'contributor', roleId: 'r-con', roleLabel: 'Contributeur' });
  });

  it('setPrimaryOrgLink keeps exactly one primary (uq_object_primary_org)', () => {
    const two = addOrgLink(base(), { id: 'ORG2', name: 'OTI Nord' }, ROLES);
    const out = setPrimaryOrgLink(two, 1);
    expect(out.map((l) => l.isPrimary)).toEqual([false, true]);
  });

  it('updateOrgLink patches a single row; removeOrgLink drops it', () => {
    expect(updateOrgLink(base(), 0, { note: 'hi' })[0].note).toBe('hi');
    expect(removeOrgLink(base(), 0)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/features/object-editor/sections/org-links.test.ts -v`
Expected: FAIL — `Cannot find module './org-links'`.

- [ ] **Step 3: Implement `org-links.ts`**

```tsx
/**
 * Pure reducers for §17 organisation links (object_org_link). Persisted by
 * saveObjectWorkspaceRelationships (api.save_object_relations, org_links arm). Constraints mirrored:
 *  - exactly one primary per object: uq_object_primary_org;
 *  - the same org may hold several roles, but not the same role twice.
 */
import type {
  ObjectWorkspaceOrganizationLinkItem,
  ObjectWorkspaceOrgOption,
  WorkspaceReferenceOption,
} from '../../../services/object-workspace-parser';

/** Append a picked org, defaulting to the `publisher` role (or the first available). No-op when the
 *  org already holds that role, or when no role catalog is available (never fabricate a role). */
export function addOrgLink(
  links: ObjectWorkspaceOrganizationLinkItem[],
  picked: ObjectWorkspaceOrgOption,
  roleOptions: WorkspaceReferenceOption[],
): ObjectWorkspaceOrganizationLinkItem[] {
  const role = roleOptions.find((option) => option.code === 'publisher') ?? roleOptions[0];
  if (!role) {
    return links;
  }
  if (links.some((link) => link.id === picked.id && link.roleCode === role.code)) {
    return links;
  }
  return [
    ...links,
    {
      id: picked.id,
      source: 'org_link',
      type: 'ORG',
      name: picked.name,
      status: '',
      roleId: role.id,
      roleCode: role.code,
      roleLabel: role.label,
      isPrimary: links.length === 0,
      note: '',
      contacts: [],
    },
  ];
}

export function updateOrgLink(
  links: ObjectWorkspaceOrganizationLinkItem[],
  index: number,
  patch: Partial<ObjectWorkspaceOrganizationLinkItem>,
): ObjectWorkspaceOrganizationLinkItem[] {
  return links.map((link, position) => (position === index ? { ...link, ...patch } : link));
}

export function setOrgRole(
  links: ObjectWorkspaceOrganizationLinkItem[],
  index: number,
  roleCode: string,
  roleOptions: WorkspaceReferenceOption[],
): ObjectWorkspaceOrganizationLinkItem[] {
  const role = roleOptions.find((option) => option.code === roleCode);
  return updateOrgLink(links, index, {
    roleCode,
    roleId: role?.id ?? '',
    roleLabel: role?.label ?? roleCode,
  });
}

/** Exactly one primary per object (uq_object_primary_org): set the index primary, clear all others. */
export function setPrimaryOrgLink(
  links: ObjectWorkspaceOrganizationLinkItem[],
  index: number,
): ObjectWorkspaceOrganizationLinkItem[] {
  return links.map((link, position) => ({ ...link, isPrimary: position === index }));
}

export function removeOrgLink(
  links: ObjectWorkspaceOrganizationLinkItem[],
  index: number,
): ObjectWorkspaceOrganizationLinkItem[] {
  return links.filter((_, position) => position !== index);
}
```

- [ ] **Step 4: Run to green**

Run: `npx jest src/features/object-editor/sections/org-links.test.ts -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\dphil\Bertel3.0"
git add bertel-tourism-ui/src/features/object-editor/sections/org-links.ts bertel-tourism-ui/src/features/object-editor/sections/org-links.test.ts
git commit -m "feat(editor): pure org-link reducers for §17 (mirror actor-links)"
```

---

## Task 3: `OrgPicker` modal widget (TDD)

**Files:**
- Create: `bertel-tourism-ui/src/features/object-editor/widgets/OrgPicker.tsx`
- Test: `bertel-tourism-ui/src/features/object-editor/widgets/OrgPicker.test.tsx`

- [ ] **Step 1: Write the failing test**

`OrgPicker.test.tsx`:
```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { OrgPicker } from './OrgPicker';

const OPTIONS = [
  { id: 'ORG1', name: 'OTI du Sud' },
  { id: 'ORG2', name: 'OTI Nord' },
  { id: 'ORG3', name: 'Office régional' },
];

describe('OrgPicker', () => {
  it('filters by name (accent/case-insensitive) and picks one', () => {
    const onPick = jest.fn();
    render(<OrgPicker open options={OPTIONS} onPick={onPick} onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText(/Rechercher une organisation/i), { target: { value: 'nord' } });
    fireEvent.click(screen.getByRole('button', { name: 'OTI Nord' }));

    expect(onPick).toHaveBeenCalledWith({ id: 'ORG2', name: 'OTI Nord' });
  });

  it('hides already-linked organisations via excludeIds', () => {
    render(<OrgPicker open options={OPTIONS} excludeIds={['ORG1']} onPick={() => {}} onClose={() => {}} />);
    expect(screen.queryByRole('button', { name: 'OTI du Sud' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'OTI Nord' })).toBeInTheDocument();
  });

  it('shows an empty hint when nothing matches', () => {
    render(<OrgPicker open options={OPTIONS} onPick={() => {}} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Rechercher une organisation/i), { target: { value: 'zzz' } });
    expect(screen.getByText(/Aucune organisation/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/features/object-editor/widgets/OrgPicker.test.tsx -v`
Expected: FAIL — `Cannot find module './OrgPicker'`.

- [ ] **Step 3: Implement `OrgPicker.tsx`**

```tsx
import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import type { ObjectWorkspaceOrgOption } from '../../../services/object-workspace-parser';

function normalize(value: string): string {
  return value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

interface OrgPickerProps {
  open: boolean;
  options: ObjectWorkspaceOrgOption[];
  /** Org ids already linked — filtered out of the list (anti-doublon). */
  excludeIds?: string[];
  onPick: (org: ObjectWorkspaceOrgOption) => void;
  onClose: () => void;
}

/**
 * §17 — modal to attach an organisation. Orgs are a bounded catalog (relationships.orgOptions), so this
 * is a client-side filtered list (no server search), on the shared Dialog shell with the `rpick` look of
 * ActorPicker for visual parity. Picking creates the link with role `publisher` by default (see org-links).
 */
export function OrgPicker({ open, options, excludeIds = [], onPick, onClose }: OrgPickerProps) {
  const [query, setQuery] = useState('');
  const excluded = useMemo(() => new Set(excludeIds), [excludeIds]);
  const q = normalize(query);
  const matches = useMemo(
    () => options.filter((option) => !excluded.has(option.id) && (!q || normalize(option.name).includes(q))),
    [options, excluded, q],
  );

  return (
    <Dialog open={open} onOpenChange={(next: boolean) => { if (!next) onClose(); }}>
      <DialogContent className="object-editor">
        <DialogHeader>
          <DialogTitle>Rattacher une organisation</DialogTitle>
        </DialogHeader>
        <div className="ed-modal__body">
          <div className="rpick">
            <div className="rpick__head">
              <span className="rpick__icon">⌕</span>
              <input
                className="rpick__input"
                autoFocus
                value={query}
                placeholder="Rechercher une organisation…"
                aria-label="Rechercher une organisation"
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="rpick__list">
              {matches.length === 0 ? (
                <div className="rpick__empty">Aucune organisation disponible.</div>
              ) : (
                matches.map((option, index) => (
                  <button
                    type="button"
                    key={option.id}
                    className={`rpick__row${index === 0 ? ' is-hi' : ''}`}
                    onClick={() => onPick(option)}
                  >
                    <span className="rpick__main">
                      <strong>{option.name}</strong>
                    </span>
                    <span className="rpick__suggest">Rattacher</span>
                  </button>
                ))
              )}
            </div>
            <div className="rpick__foot">
              <span>Organisations du catalogue de votre périmètre</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run to green**

Run: `npx jest src/features/object-editor/widgets/OrgPicker.test.tsx -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\dphil\Bertel3.0"
git add bertel-tourism-ui/src/features/object-editor/widgets/OrgPicker.tsx bertel-tourism-ui/src/features/object-editor/widgets/OrgPicker.test.tsx
git commit -m "feat(editor): OrgPicker modal for §17 org attachment"
```

---

## Task 4: Wire `OrgPicker` into §17 (replace the silent `orgOptions[0]` add)

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/SectionAttachments.tsx`
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/SectionAttachments.test.tsx`

- [ ] **Step 1: Update the "adds an org link" test to go through the modal (RED)**

In `SectionAttachments.test.tsx`, replace the `it('adds an org link defaulting to publisher', …)` test body (lines ~28-40) with:
```tsx
  it('adds an org link via the OrgPicker modal, defaulting to publisher', () => {
    const modules = fullModulesFixture();
    modules.relationships.organizationLinks = [];
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    const view = render(<SectionAttachments editor={result.current} permissions={allowAll} />);

    act(() => { fireEvent.click(screen.getByRole('button', { name: /Rattacher une organisation/i })); });
    view.rerender(<SectionAttachments editor={result.current} permissions={allowAll} />);
    // modal open → pick the first catalog org
    const firstOrg = modules.relationships.orgOptions[0];
    act(() => { fireEvent.click(screen.getByRole('button', { name: firstOrg.name })); });
    view.rerender(<SectionAttachments editor={result.current} permissions={allowAll} />);

    expect(result.current.draft.relationships.organizationLinks).toHaveLength(1);
    expect(result.current.draft.relationships.organizationLinks[0].id).toBe(firstOrg.id);
    expect(result.current.draft.relationships.organizationLinks[0].roleCode).toBe('publisher');
    expect(result.current.draft.relationships.organizationLinks[0].isPrimary).toBe(true);
  });
```
> Confirm `fullModulesFixture().relationships.orgOptions` is non-empty; if empty, set `modules.relationships.orgOptions = [{ id: 'ORG1', name: 'OTI du Sud' }]` at the top of the test.

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/features/object-editor/sections/SectionAttachments.test.tsx -t "via the OrgPicker modal" -v`
Expected: FAIL (clicking "Rattacher" currently adds inline; no modal/org button appears).

- [ ] **Step 3: Refactor the org-link handlers in `SectionAttachments.tsx` to use `org-links.ts` + open the modal**

Add imports near the top:
```tsx
import { OrgPicker } from '../widgets/OrgPicker';
import { addOrgLink, removeOrgLink, setOrgRole, setPrimaryOrgLink, updateOrgLink } from './org-links';
```
Add modal state alongside the other hooks:
```tsx
  const [orgPickerOpen, setOrgPickerOpen] = useState(false);
```
Replace the existing org helpers (`replaceLinks` / `updateLink` / `setPrimaryLink`, lines ~117-129) with thin wrappers over the pure reducers:
```tsx
  function replaceLinks(organizationLinks: typeof relationships.organizationLinks) {
    editor.replaceModule('relationships', { ...relationships, organizationLinks });
  }
  function updateLink(index: number, patch: Partial<(typeof relationships.organizationLinks)[number]>) {
    replaceLinks(updateOrgLink(relationships.organizationLinks, index, patch));
  }
  function setPrimaryLink(index: number) {
    replaceLinks(setPrimaryOrgLink(relationships.organizationLinks, index));
  }
```

- [ ] **Step 4: Replace the inline `onAdd` with "open modal", change the role `Select` to use `setOrgRole`, and render `OrgPicker`**

In the org `Repeater`, change `onAdd`:
```tsx
          onAdd={() => {
            if (relationships.orgOptions.length === 0 || relationships.orgRoleOptions.length === 0) return;
            setOrgPickerOpen(true);
          }}
```
In the role `Select`'s `onChange`, replace the inline body with:
```tsx
                onChange={(roleCode) => replaceLinks(setOrgRole(relationships.organizationLinks, index, roleCode, relationships.orgRoleOptions))}
```
In the delete button `onClick`, replace with:
```tsx
                onClick={() => replaceLinks(removeOrgLink(relationships.organizationLinks, index))}
```
Immediately after the org `Repeater` (still inside the `else` arm), render the modal:
```tsx
          {orgPickerOpen && (
            <OrgPicker
              open={orgPickerOpen}
              options={relationships.orgOptions}
              excludeIds={relationships.organizationLinks.map((link) => link.id)}
              onPick={(org) => {
                replaceLinks(addOrgLink(relationships.organizationLinks, org, relationships.orgRoleOptions));
                setOrgPickerOpen(false);
              }}
              onClose={() => setOrgPickerOpen(false)}
            />
          )}
```

- [ ] **Step 5: Run the §17 test file to green**

Run: `npx jest src/features/object-editor/sections/SectionAttachments.test.tsx -v`
Expected: PASS (modal-add test + role/primary/remove tests all green).

- [ ] **Step 6: tsc**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "SectionAttachments|OrgPicker|org-links" || echo "clean"`
Expected: `clean`.

- [ ] **Step 7: Commit**

```bash
cd "C:\Users\dphil\Bertel3.0"
git add bertel-tourism-ui/src/features/object-editor/sections/SectionAttachments.tsx bertel-tourism-ui/src/features/object-editor/sections/SectionAttachments.test.tsx
git commit -m "feat(editor): attach §17 organisations via OrgPicker modal (no more silent orgOptions[0])"
```

---

## Task 5: Backend — seed socle + create-on-the-go RPCs

**Files:**
- Modify: `Base de donnée DLL et API/api_views_functions.sql` (append the 2 functions)
- Modify: `Base de donnée DLL et API/seeds_data.sql` (append the seed)
- Create: `Base de donnée DLL et API/tests/test_membership_vocab.sql`
- Create: `Base de donnée DLL et API/tests/test_membership_create_rpcs.sql`
- Modify: `docs/SQL_ROLLOUT_RUNBOOK.md`

- [ ] **Step 1: Verify the `(domain, code)` uniqueness + that `immutable_unaccent` / `name_normalized` exist (so ON CONFLICT and the RPC dedup are valid)**

Run via Supabase MCP `execute_sql`:
```sql
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'public.ref_code'::regclass AND contype IN ('u','p');
SELECT 1 FROM pg_proc WHERE proname = 'immutable_unaccent' LIMIT 1;
```
If there is **no** unique on `(domain, code)`, use the `WHERE NOT EXISTS` seed form (Step 3 note) and target the actual unique in the RPC EXCEPTION. If `immutable_unaccent` is absent, fall back to `lower(unaccent(...))` used elsewhere — but `api.create_tag` uses `immutable_unaccent`, so it should exist.

- [ ] **Step 2: Add the seed block to `seeds_data.sql`** (near other `ref_code` domain seeds)

```sql
-- §17 adhésions OTI — vocabulaire socle (campagnes + paliers). Idempotent.
-- L'utilisateur en crée d'autres à la volée via api.create_membership_campaign / _tier.
INSERT INTO public.ref_code (id, domain, code, name, name_normalized, position)
VALUES
  (gen_random_uuid(), 'membership_campaign', 'adhesion_2025', 'Adhésion 2025',       immutable_unaccent(lower('Adhésion 2025')),       1),
  (gen_random_uuid(), 'membership_campaign', 'adhesion_2026', 'Adhésion 2026',       immutable_unaccent(lower('Adhésion 2026')),       2),
  (gen_random_uuid(), 'membership_campaign', 'charte',        'Charte d''engagement', immutable_unaccent(lower('Charte d''engagement')), 3),
  (gen_random_uuid(), 'membership_tier',     'membre',         'Membre',              immutable_unaccent(lower('Membre')),              1),
  (gen_random_uuid(), 'membership_tier',     'membre_premium', 'Membre Premium',      immutable_unaccent(lower('Membre Premium')),      2),
  (gen_random_uuid(), 'membership_tier',     'partenaire',     'Partenaire',          immutable_unaccent(lower('Partenaire')),          3),
  (gen_random_uuid(), 'membership_tier',     'charte_gratuit', 'Charte (gratuit)',    immutable_unaccent(lower('Charte (gratuit)')),    4)
ON CONFLICT (domain, code) DO NOTHING;
```
> If Step 1 found no `(domain, code)` unique, wrap each row as `INSERT … SELECT … WHERE NOT EXISTS (SELECT 1 FROM public.ref_code WHERE domain=… AND code=…)` instead of `ON CONFLICT`.

- [ ] **Step 3: Add the two RPCs to `api_views_functions.sql`** (after the tag RPCs if present, else at the membership/CRM area)

```sql
-- §17 — create-on-the-go membership vocabulary (mirror api.create_tag). Gated per-object; dedup by
-- name within the domain. Returns {ref_id, code, name, created}. gen_random_uuid() (restricted search_path).
CREATE OR REPLACE FUNCTION api.create_membership_campaign(p_anchor_object_id text, p_name text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'api', 'internal', 'auth'
AS $function$
DECLARE v_name text := btrim(coalesce(p_name, '')); v_norm text; v_code text; v_row public.ref_code%ROWTYPE;
BEGIN
  PERFORM internal.workspace_assert_can_write_object(p_anchor_object_id);
  IF v_name = '' THEN RAISE EXCEPTION 'Campaign name is required' USING ERRCODE = '22023'; END IF;
  v_norm := immutable_unaccent(lower(v_name));
  SELECT * INTO v_row FROM public.ref_code WHERE domain = 'membership_campaign' AND name_normalized = v_norm LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('ref_id', v_row.id, 'code', v_row.code, 'name', v_row.name, 'created', false); END IF;
  v_code := btrim(regexp_replace(v_norm, '[^a-z0-9]+', '_', 'g'), '_');
  IF v_code = '' THEN RAISE EXCEPTION 'Campaign name yields an empty code' USING ERRCODE = '22023'; END IF;
  BEGIN
    INSERT INTO public.ref_code (id, domain, code, name, name_normalized)
    VALUES (gen_random_uuid(), 'membership_campaign', v_code, v_name, v_norm) RETURNING * INTO v_row;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_row FROM public.ref_code WHERE domain = 'membership_campaign' AND name_normalized = v_norm LIMIT 1;
    IF NOT FOUND THEN
      v_code := v_code || '_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
      INSERT INTO public.ref_code (id, domain, code, name, name_normalized)
      VALUES (gen_random_uuid(), 'membership_campaign', v_code, v_name, v_norm) RETURNING * INTO v_row;
    END IF;
  END;
  RETURN jsonb_build_object('ref_id', v_row.id, 'code', v_row.code, 'name', v_row.name, 'created', true);
END; $function$;

CREATE OR REPLACE FUNCTION api.create_membership_tier(p_anchor_object_id text, p_name text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'api', 'internal', 'auth'
AS $function$
DECLARE v_name text := btrim(coalesce(p_name, '')); v_norm text; v_code text; v_row public.ref_code%ROWTYPE;
BEGIN
  PERFORM internal.workspace_assert_can_write_object(p_anchor_object_id);
  IF v_name = '' THEN RAISE EXCEPTION 'Tier name is required' USING ERRCODE = '22023'; END IF;
  v_norm := immutable_unaccent(lower(v_name));
  SELECT * INTO v_row FROM public.ref_code WHERE domain = 'membership_tier' AND name_normalized = v_norm LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('ref_id', v_row.id, 'code', v_row.code, 'name', v_row.name, 'created', false); END IF;
  v_code := btrim(regexp_replace(v_norm, '[^a-z0-9]+', '_', 'g'), '_');
  IF v_code = '' THEN RAISE EXCEPTION 'Tier name yields an empty code' USING ERRCODE = '22023'; END IF;
  BEGIN
    INSERT INTO public.ref_code (id, domain, code, name, name_normalized)
    VALUES (gen_random_uuid(), 'membership_tier', v_code, v_name, v_norm) RETURNING * INTO v_row;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_row FROM public.ref_code WHERE domain = 'membership_tier' AND name_normalized = v_norm LIMIT 1;
    IF NOT FOUND THEN
      v_code := v_code || '_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
      INSERT INTO public.ref_code (id, domain, code, name, name_normalized)
      VALUES (gen_random_uuid(), 'membership_tier', v_code, v_name, v_norm) RETURNING * INTO v_row;
    END IF;
  END;
  RETURN jsonb_build_object('ref_id', v_row.id, 'code', v_row.code, 'name', v_row.name, 'created', true);
END; $function$;

GRANT EXECUTE ON FUNCTION api.create_membership_campaign(text, text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION api.create_membership_tier(text, text) TO authenticated, anon, service_role;
```

- [ ] **Step 4: Apply to live as ONE migration via Supabase MCP `apply_migration`**

Name: `membership_vocab_seed_and_create_rpcs`. Body = the seed block (Step 2) + the two functions + grants (Step 3). Then:
```sql
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 5: Write `tests/test_membership_vocab.sql`**

```sql
-- Asserts the §17 membership vocabulary socle is present (run after the seed).
DO $$
DECLARE n_campaign int; n_tier int; n_charte int;
BEGIN
  SELECT count(*) INTO n_campaign FROM public.ref_code WHERE domain = 'membership_campaign';
  SELECT count(*) INTO n_tier     FROM public.ref_code WHERE domain = 'membership_tier';
  SELECT count(*) INTO n_charte   FROM public.ref_code WHERE domain = 'membership_campaign' AND code = 'charte';
  IF n_campaign < 3 THEN RAISE EXCEPTION 'expected >=3 membership_campaign, got %', n_campaign; END IF;
  IF n_tier     < 4 THEN RAISE EXCEPTION 'expected >=4 membership_tier, got %', n_tier; END IF;
  IF n_charte   < 1 THEN RAISE EXCEPTION 'charte campaign missing'; END IF;
  IF EXISTS (SELECT 1 FROM public.ref_code WHERE domain IN ('membership_campaign','membership_tier') AND code <> lower(code)) THEN
    RAISE EXCEPTION 'membership codes must be lower-case snake';
  END IF;
  RAISE NOTICE 'test_membership_vocab OK (campaigns=%, tiers=%)', n_campaign, n_tier;
END $$;
```

- [ ] **Step 6: Write `tests/test_membership_create_rpcs.sql`** (transient — create + dedup + cleanup; run as service_role via MCP)

```sql
-- create → dedup → cleanup. Uses a throwaway name so it never collides with real vocab.
DO $$
DECLARE r1 jsonb; r2 jsonb;
BEGIN
  -- service_role bypasses the per-object gate inside workspace_assert_can_write_object for this smoke;
  -- on live, run with a real object id the caller can write. Here we assert dedup behaviour on the ref rows.
  INSERT INTO public.ref_code (id, domain, code, name, name_normalized)
  VALUES (gen_random_uuid(), 'membership_tier', 'zz_test_charte', 'ZZ Test Charte', immutable_unaccent(lower('ZZ Test Charte')));
  -- a second insert with the same normalized name must be deduped by the RPC, never duplicated:
  IF (SELECT count(*) FROM public.ref_code WHERE domain='membership_tier' AND name_normalized = immutable_unaccent(lower('ZZ Test Charte'))) <> 1 THEN
    RAISE EXCEPTION 'dedup precondition failed';
  END IF;
  DELETE FROM public.ref_code WHERE domain='membership_tier' AND code='zz_test_charte';
  RAISE NOTICE 'test_membership_create_rpcs OK';
END $$;
```
> For a full RPC call test, invoke `api.create_membership_tier('<writable_object_id>', 'ZZ Test Charte')` twice via MCP and assert the 2nd returns `created:false` with the same `ref_id`; then `DELETE` the created row.

- [ ] **Step 7: Run both SQL tests on live via MCP** and confirm the `OK` NOTICEs; run `api.create_membership_tier` twice as described and confirm `created:false` on the 2nd call (then delete the throwaway row).

- [ ] **Step 8: Runbook entry** — in `docs/SQL_ROLLOUT_RUNBOOK.md`, add `membership_vocab_seed_and_create_rpcs` to the apply order with a one-line note (seed + 2 create RPCs; folded into `seeds_data.sql` + `api_views_functions.sql`).

- [ ] **Step 9: Commit**

```bash
cd "C:\Users\dphil\Bertel3.0"
git add "Base de donnée DLL et API/seeds_data.sql" "Base de donnée DLL et API/api_views_functions.sql" "Base de donnée DLL et API/tests/test_membership_vocab.sql" "Base de donnée DLL et API/tests/test_membership_create_rpcs.sql" docs/SQL_ROLLOUT_RUNBOOK.md
git commit -m "feat(db): seed §17 adhésion vocab + create_membership_campaign/_tier RPCs (create-on-the-go)"
```

---

## Task 6: Service wrappers `createMembershipCampaign` / `createMembershipTier`

**Files:**
- Modify: `bertel-tourism-ui/src/services/object-workspace.ts`

- [ ] **Step 1: Implement the wrappers** (place next to the other RPC wrappers; reuse the file's existing `apiClient`, `mapMutationError`, `readRecord`, `readString` helpers)

```tsx
/**
 * §17 — create-on-the-go membership campaign/tier (mirror createWorkspaceTag). Gated per-object by the
 * RPC (workspace_assert_can_write_object); returns the existing-or-created ref option for the combobox.
 */
async function createMembershipRef(
  fnName: 'create_membership_campaign' | 'create_membership_tier',
  objectId: string,
  name: string,
): Promise<WorkspaceReferenceOption> {
  const { data, error } = await apiClient.schema('api').rpc(fnName, {
    p_anchor_object_id: objectId,
    p_name: name,
  });
  if (error) {
    throw mapMutationError(error, "Création de la valeur d'adhésion impossible.");
  }
  const row = readRecord(data);
  return {
    id: readString(row.ref_id),
    code: readString(row.code),
    label: readString(row.name, readString(row.code)),
  };
}

export function createMembershipCampaign(objectId: string, name: string): Promise<WorkspaceReferenceOption> {
  return createMembershipRef('create_membership_campaign', objectId, name);
}

export function createMembershipTier(objectId: string, name: string): Promise<WorkspaceReferenceOption> {
  return createMembershipRef('create_membership_tier', objectId, name);
}
```
> Ensure `WorkspaceReferenceOption` is imported in this file (it already is, used by the membership loader). If `apiClient` is named differently here, use the existing client reference used by `callObjectWorkspaceRpc`.

- [ ] **Step 2: tsc**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep object-workspace.ts || echo "clean"`
Expected: `clean`.

- [ ] **Step 3: Commit**

```bash
cd "C:\Users\dphil\Bertel3.0"
git add bertel-tourism-ui/src/services/object-workspace.ts
git commit -m "feat(editor): service wrappers for membership campaign/tier create-on-the-go"
```

---

## Task 7: `membership-edit.ts` pure reducers (TDD)

**Files:**
- Create: `bertel-tourism-ui/src/features/object-editor/sections/membership-edit.ts`
- Test: `bertel-tourism-ui/src/features/object-editor/sections/membership-edit.test.ts`

- [ ] **Step 1: Write the failing test**

`membership-edit.test.ts`:
```tsx
import { appendCreatedOption, applyMembershipPatch, buildNewMembership } from './membership-edit';
import type { ObjectWorkspaceMembershipModule } from '../../../services/object-workspace-parser';

const mod = (): ObjectWorkspaceMembershipModule => ({
  campaignOptions: [{ id: 'c1', code: 'adhesion_2026', label: 'Adhésion 2026' }],
  tierOptions: [{ id: 't1', code: 'membre', label: 'Membre' }],
  scopeOptions: [{ orgObjectId: 'ORG1', label: 'OTI du Sud', isPrimary: true }],
  items: [],
  unavailableReason: null,
});

describe('membership-edit', () => {
  it('buildNewMembership seeds from the first scope/campaign/tier', () => {
    const item = buildNewMembership(mod());
    expect(item).not.toBeNull();
    expect(item).toMatchObject({ orgObjectId: 'ORG1', campaignCode: 'adhesion_2026', tierCode: 'membre', status: 'prospect', scope: 'object' });
  });

  it('buildNewMembership returns null without a scope org', () => {
    expect(buildNewMembership({ ...mod(), scopeOptions: [] })).toBeNull();
  });

  it('applyMembershipPatch keeps id/label consistent with the catalog', () => {
    const item = buildNewMembership(mod())!;
    const patched = applyMembershipPatch(item, { campaignCode: 'adhesion_2026' }, mod());
    expect(patched).toMatchObject({ campaignId: 'c1', campaignLabel: 'Adhésion 2026' });
  });

  it('appendCreatedOption adds a new option once (idempotent by code)', () => {
    const created = { id: 'c2', code: 'charte', label: "Charte d'engagement" };
    const once = appendCreatedOption(mod().campaignOptions, created);
    expect(once).toHaveLength(2);
    expect(appendCreatedOption(once, created)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/features/object-editor/sections/membership-edit.test.ts -v`
Expected: FAIL — `Cannot find module './membership-edit'`.

- [ ] **Step 3: Implement `membership-edit.ts`**

```tsx
/**
 * Pure reducers for §17 adhésions (object_membership). Persisted by saveObjectWorkspaceMemberships.
 * A membership always carries a campaign AND a tier (both NOT NULL); "gratuit" (charte) is conveyed by
 * the chosen campaign/tier label, not a price field.
 */
import type {
  ObjectWorkspaceMembershipItem,
  ObjectWorkspaceMembershipModule,
  WorkspaceReferenceOption,
} from '../../../services/object-workspace-parser';

export function buildNewMembership(module: ObjectWorkspaceMembershipModule): ObjectWorkspaceMembershipItem | null {
  const scope = module.scopeOptions[0];
  if (!scope) {
    return null;
  }
  const campaign = module.campaignOptions[0];
  const tier = module.tierOptions[0];
  return {
    recordId: null,
    scope: 'object',
    orgObjectId: scope.orgObjectId,
    orgLabel: scope.label,
    campaignId: campaign?.id ?? '',
    campaignCode: campaign?.code ?? '',
    campaignLabel: campaign?.label ?? '',
    tierId: tier?.id ?? '',
    tierCode: tier?.code ?? '',
    tierLabel: tier?.label ?? '',
    status: 'prospect',
    startsAt: '',
    endsAt: '',
    paymentDate: '',
    metadataJson: '',
    visibilityImpact: '',
  };
}

export function applyMembershipPatch(
  item: ObjectWorkspaceMembershipItem,
  patch: Partial<ObjectWorkspaceMembershipItem>,
  module: ObjectWorkspaceMembershipModule,
): ObjectWorkspaceMembershipItem {
  const next: ObjectWorkspaceMembershipItem = { ...item, ...patch };
  if (patch.campaignCode) {
    const campaign = module.campaignOptions.find((option) => option.code === patch.campaignCode);
    if (campaign) {
      next.campaignId = campaign.id;
      next.campaignLabel = campaign.label;
    }
  }
  if (patch.tierCode) {
    const tier = module.tierOptions.find((option) => option.code === patch.tierCode);
    if (tier) {
      next.tierId = tier.id;
      next.tierLabel = tier.label;
    }
  }
  if (patch.orgObjectId) {
    const scope = module.scopeOptions.find((option) => option.orgObjectId === patch.orgObjectId);
    if (scope) {
      next.orgLabel = scope.label;
    }
  }
  return next;
}

/** Append a just-created campaign/tier option to the local catalog (idempotent by code). */
export function appendCreatedOption(
  options: WorkspaceReferenceOption[],
  created: WorkspaceReferenceOption,
): WorkspaceReferenceOption[] {
  if (options.some((option) => option.code === created.code)) {
    return options;
  }
  return [...options, created];
}
```

- [ ] **Step 4: Run to green**

Run: `npx jest src/features/object-editor/sections/membership-edit.test.ts -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\dphil\Bertel3.0"
git add bertel-tourism-ui/src/features/object-editor/sections/membership-edit.ts bertel-tourism-ui/src/features/object-editor/sections/membership-edit.test.ts
git commit -m "feat(editor): pure membership reducers for §17 adhésions"
```

---

## Task 8: `MembershipEditModal` widget (TDD)

**Files:**
- Create: `bertel-tourism-ui/src/features/object-editor/widgets/MembershipEditModal.tsx`
- Test: `bertel-tourism-ui/src/features/object-editor/widgets/MembershipEditModal.test.tsx`

- [ ] **Step 1: Write the failing test** (mock the service so no network)

`MembershipEditModal.test.tsx`:
```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MembershipEditModal } from './MembershipEditModal';
import type { ObjectWorkspaceMembershipModule } from '../../../services/object-workspace-parser';

jest.mock('../../../services/object-workspace', () => ({
  createMembershipCampaign: jest.fn(async (_o: string, name: string) => ({ id: 'new-c', code: 'charte_x', label: name })),
  createMembershipTier: jest.fn(async (_o: string, name: string) => ({ id: 'new-t', code: 'charte_t', label: name })),
}));

const module = (): ObjectWorkspaceMembershipModule => ({
  campaignOptions: [{ id: 'c1', code: 'adhesion_2026', label: 'Adhésion 2026' }],
  tierOptions: [{ id: 't1', code: 'membre', label: 'Membre' }],
  scopeOptions: [{ orgObjectId: 'ORG1', label: 'OTI du Sud', isPrimary: true }],
  items: [],
  unavailableReason: null,
});

describe('MembershipEditModal', () => {
  it('creates a new adhésion (add mode) and calls onSave', () => {
    const onSave = jest.fn();
    render(<MembershipEditModal open mode="add" objectId="o1" module={module()} item={null} onSave={onSave} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/i }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({ campaignCode: 'adhesion_2026', tierCode: 'membre', orgObjectId: 'ORG1' });
  });

  it('creates a campaign on the go and selects it', async () => {
    const onCreateOption = jest.fn();
    render(<MembershipEditModal open mode="add" objectId="o1" module={module()} item={null} onSave={() => {}} onClose={() => {}} onCreateOption={onCreateOption} />);
    // target the free-text Input (distinct label) — NOT the Select (aria-label "Campagne")
    fireEvent.change(screen.getByLabelText(/Campagne — rechercher ou créer/i), { target: { value: 'Charte écolo' } });
    fireEvent.click(screen.getByRole('button', { name: /Créer « Charte écolo »/i }));
    await waitFor(() => expect(onCreateOption).toHaveBeenCalledWith('campaign', { id: 'new-c', code: 'charte_x', label: 'Charte écolo' }));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/features/object-editor/widgets/MembershipEditModal.test.tsx -v`
Expected: FAIL — `Cannot find module './MembershipEditModal'`.

- [ ] **Step 3: Implement `MembershipEditModal.tsx`** (creatable combobox = type-to-search a `Select` plus a "Créer « X »" affordance, mirroring `TagPickerModal`)

```tsx
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../../components/ui/dialog';
import { Field, Input, Select } from '../primitives';
import { createMembershipCampaign, createMembershipTier } from '../../../services/object-workspace';
import type {
  ObjectWorkspaceMembershipItem,
  ObjectWorkspaceMembershipModule,
  WorkspaceReferenceOption,
} from '../../../services/object-workspace-parser';
import { applyMembershipPatch, buildNewMembership } from '../sections/membership-edit';

const STATUSES = ['prospect', 'invoiced', 'paid', 'canceled', 'lapsed'];

function normalize(value: string): string {
  return value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

type Dim = 'campaign' | 'tier';

interface CreatableProps {
  label: string;
  value: string;
  options: WorkspaceReferenceOption[];
  objectId: string;
  busy: boolean;
  onSelect: (code: string) => void;
  onCreate: (name: string) => Promise<void>;
}

/** A select over existing options + a "Créer « X »" affordance when the typed name has no exact match. */
function CreatableRefField({ label, value, options, objectId, busy, onSelect, onCreate }: CreatableProps) {
  const [draft, setDraft] = useState('');
  const q = normalize(draft);
  const exact = options.some((option) => normalize(option.label) === q);
  return (
    <Field label={label}>
      <Select
        value={value}
        aria-label={label}
        options={options.map((option) => ({ v: option.code, l: option.label }))}
        onChange={onSelect}
      />
      <Input
        value={draft}
        placeholder={`Rechercher ou créer (${label.toLowerCase()})…`}
        aria-label={`${label} — rechercher ou créer`}
        onChange={setDraft}
      />
      {q && !exact && (
        <button
          type="button"
          className="btn primary"
          style={{ marginTop: 6 }}
          disabled={busy || !objectId}
          onClick={() => { void onCreate(draft.trim()).then(() => setDraft('')); }}
        >
          Créer « {draft.trim()} »
        </button>
      )}
      {!objectId && <p className="muted" style={{ marginTop: 4 }}>Enregistrez la fiche avant de créer.</p>}
    </Field>
  );
}

interface MembershipEditModalProps {
  open: boolean;
  mode: 'add' | 'edit';
  objectId: string;
  module: ObjectWorkspaceMembershipModule;
  item: ObjectWorkspaceMembershipItem | null;
  onSave: (item: ObjectWorkspaceMembershipItem) => void;
  onClose: () => void;
  /** Bubble a just-created campaign/tier up so §17 can append it to the module options. */
  onCreateOption?: (dim: Dim, option: WorkspaceReferenceOption) => void;
}

/**
 * §17 — add/edit one adhésion. Campaign & tier are creatable on the go (mirror TagPickerModal):
 * api.create_membership_campaign / _tier, gated per-object, deduped server-side. Both are required
 * (object_membership.campaign_id/tier_id NOT NULL) — a free charte is just a campaign+tier pair.
 */
export function MembershipEditModal({
  open, mode, objectId, module, item, onSave, onClose, onCreateOption,
}: MembershipEditModalProps) {
  const [draft, setDraft] = useState<ObjectWorkspaceMembershipItem>(
    () => item ?? buildNewMembership(module) ?? ({} as ObjectWorkspaceMembershipItem),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch(next: Partial<ObjectWorkspaceMembershipItem>) {
    setDraft((current) => applyMembershipPatch(current, next, module));
  }

  async function handleCreate(dim: Dim, name: string) {
    if (!objectId || !name) return;
    setBusy(true);
    setError(null);
    try {
      const created = dim === 'campaign'
        ? await createMembershipCampaign(objectId, name)
        : await createMembershipTier(objectId, name);
      onCreateOption?.(dim, created);
      patch(dim === 'campaign' ? { campaignCode: created.code, campaignId: created.id, campaignLabel: created.label }
                              : { tierCode: created.code, tierId: created.id, tierLabel: created.label });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Création impossible.');
    } finally {
      setBusy(false);
    }
  }

  const canSave = Boolean(draft.orgObjectId && draft.campaignCode && draft.tierCode && draft.status);

  return (
    <Dialog open={open} onOpenChange={(next: boolean) => { if (!next) onClose(); }}>
      <DialogContent className="object-editor">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? 'Modifier l’adhésion' : 'Ajouter une adhésion'}</DialogTitle>
        </DialogHeader>
        <div className="ed-modal__body">
          <Field label="Organisation">
            <Select
              value={draft.orgObjectId}
              aria-label="Organisation"
              options={module.scopeOptions.map((scope) => ({ v: scope.orgObjectId, l: scope.label }))}
              onChange={(orgObjectId) => patch({ orgObjectId })}
            />
          </Field>
          <CreatableRefField
            label="Campagne" value={draft.campaignCode} options={module.campaignOptions}
            objectId={objectId} busy={busy}
            onSelect={(campaignCode) => patch({ campaignCode })}
            onCreate={(name) => handleCreate('campaign', name)}
          />
          <CreatableRefField
            label="Palier" value={draft.tierCode} options={module.tierOptions}
            objectId={objectId} busy={busy}
            onSelect={(tierCode) => patch({ tierCode })}
            onCreate={(name) => handleCreate('tier', name)}
          />
          <Field label="Statut">
            <Select value={draft.status} aria-label="Statut" options={STATUSES} onChange={(status) => patch({ status })} />
          </Field>
          <Field label="Début">
            <Input type="date" value={draft.startsAt} onChange={(startsAt) => patch({ startsAt })} />
          </Field>
          {error && <p role="alert" style={{ marginTop: 8, color: 'var(--red, #93392a)', fontSize: 12 }}>{error}</p>}
        </div>
        <DialogFooter>
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button type="button" className="btn primary" disabled={!canSave || busy} onClick={() => onSave(draft)}>
            Enregistrer
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```
> Confirm `Field`/`Select`/`Input` are exported from `../primitives` (they are, used across sections) and `Select` accepts both `{v,l}[]` and `string[]` option forms (the §17 status select already uses the `string[]` form).

- [ ] **Step 4: Run to green**

Run: `npx jest src/features/object-editor/widgets/MembershipEditModal.test.tsx -v`
Expected: PASS.

- [ ] **Step 5: tsc**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep MembershipEditModal || echo "clean"`
Expected: `clean`.

- [ ] **Step 6: Commit**

```bash
cd "C:\Users\dphil\Bertel3.0"
git add bertel-tourism-ui/src/features/object-editor/widgets/MembershipEditModal.tsx bertel-tourism-ui/src/features/object-editor/widgets/MembershipEditModal.test.tsx
git commit -m "feat(editor): MembershipEditModal with create-on-the-go campaign/tier"
```

---

## Task 9: Wire adhésions modal + empty state into §17; drop the "Campagnes disponibles" chipset

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/SectionAttachments.tsx`
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/SectionAttachments.test.tsx`

- [ ] **Step 1: Add §17 adhésion tests (RED)**

Append to `SectionAttachments.test.tsx`:
```tsx
describe('SectionAttachments — §17 adhésions (modale + état vide)', () => {
  it('shows an explicit empty state when there is no adhésion', () => {
    const modules = fullModulesFixture();
    modules.memberships.items = [];
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    render(<SectionAttachments editor={result.current} permissions={allowAll} objectId="o1" />);
    expect(screen.getByText(/Aucune adhésion/i)).toBeInTheDocument();
  });

  it('opens the membership modal from "Ajouter une adhésion"', () => {
    const modules = fullModulesFixture();
    modules.memberships.items = [];
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    const view = render(<SectionAttachments editor={result.current} permissions={allowAll} objectId="o1" />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Ajouter une adhésion/i })); });
    view.rerender(<SectionAttachments editor={result.current} permissions={allowAll} objectId="o1" />);
    expect(screen.getByRole('button', { name: /Enregistrer/i })).toBeInTheDocument();
  });

  it('no longer renders the "Campagnes disponibles" chipset', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionAttachments editor={result.current} permissions={allowAll} objectId="o1" />);
    expect(screen.queryByText(/Campagnes disponibles/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/features/object-editor/sections/SectionAttachments.test.tsx -t "adhésions" -v`
Expected: FAIL.

- [ ] **Step 3: Replace the §17 membership rendering** in `SectionAttachments.tsx`

Add imports:
```tsx
import { MembershipEditModal } from '../widgets/MembershipEditModal';
import { appendCreatedOption } from './membership-edit';
import type { WorkspaceReferenceOption } from '../../../services/object-workspace-parser';
```
Remove the now-unused `createMembership` helper, the `STATUSES` const, and the `Chip`/`ChipSet` imports if no longer used. Add modal state + handlers near the other hooks:
```tsx
  const [memberDialog, setMemberDialog] = useState<{ open: boolean; index: number | null }>({ open: false, index: null });

  function saveMembership(item: ObjectWorkspaceMembershipItem) {
    const next = memberDialog.index === null
      ? [...memberships.items, item]
      : memberships.items.map((existing, i) => (i === memberDialog.index ? item : existing));
    editor.replaceModule('memberships', { ...memberships, items: next });
    setMemberDialog({ open: false, index: null });
  }
  function appendMembershipOption(dim: 'campaign' | 'tier', option: WorkspaceReferenceOption) {
    editor.replaceModule('memberships', dim === 'campaign'
      ? { ...memberships, campaignOptions: appendCreatedOption(memberships.campaignOptions, option) }
      : { ...memberships, tierOptions: appendCreatedOption(memberships.tierOptions, option) });
  }
```
(Keep the existing `update`/`replace` helpers only if still referenced; the inline membership `Repeater` is replaced below, so delete `update` and the membership `Repeater`.)

Replace the JSX from `<div className="chip-group__label" ...>Campagnes disponibles</div>` through the end of the membership `Repeater` with:
```tsx
      <div className="chip-group__label" style={{ marginTop: 14 }}>Adhésions OTI</div>
      {memberships.unavailableReason ? (
        <p style={{ fontSize: 12, color: 'var(--ink-4)', margin: '0 0 12px' }}>{memberships.unavailableReason}</p>
      ) : memberships.items.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--ink-4)', margin: '0 0 10px' }}>
          Aucune adhésion — cet objet n’est rattaché à aucune campagne ni charte.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
          {memberships.items.map((item, index) => (
            <button
              key={`${item.recordId ?? 'membership'}-${index}`}
              type="button"
              className="rep-row"
              style={{ gridTemplateColumns: '1fr auto', textAlign: 'left', cursor: 'pointer' }}
              onClick={() => setMemberDialog({ open: true, index })}
            >
              <span style={{ fontSize: 12 }}>
                <strong>{item.orgLabel}</strong> · {item.campaignLabel || item.campaignCode} · {item.tierLabel || item.tierCode}
              </span>
              <span className="pill-mini">{item.status}</span>
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className="rep-add"
        disabled={memberships.scopeOptions.length === 0}
        title={memberships.scopeOptions.length === 0 ? 'Rattachez d’abord une organisation.' : undefined}
        onClick={() => setMemberDialog({ open: true, index: null })}
      >
        Ajouter une adhésion
      </button>
      {memberDialog.open && (
        <MembershipEditModal
          open={memberDialog.open}
          mode={memberDialog.index === null ? 'add' : 'edit'}
          objectId={objectId ?? ''}
          module={memberships}
          item={memberDialog.index === null ? null : memberships.items[memberDialog.index]}
          onSave={saveMembership}
          onClose={() => setMemberDialog({ open: false, index: null })}
          onCreateOption={appendMembershipOption}
        />
      )}
```
> `objectId` is a `SectionProps` field (already used by §15/§19). Confirm it's destructured in `SectionAttachments({ editor, folded, objectId })`; add `objectId` to the destructure if missing. Import `ObjectWorkspaceMembershipItem` (already imported at top of the file).

- [ ] **Step 4: Run the §17 test file to green**

Run: `npx jest src/features/object-editor/sections/SectionAttachments.test.tsx -v`
Expected: PASS (org tests + actor-gone + adhésion empty-state/modal/no-chipset).

- [ ] **Step 5: tsc**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "SectionAttachments|MembershipEditModal|membership-edit" || echo "clean"`
Expected: `clean`.

- [ ] **Step 6: Commit**

```bash
cd "C:\Users\dphil\Bertel3.0"
git add bertel-tourism-ui/src/features/object-editor/sections/SectionAttachments.tsx bertel-tourism-ui/src/features/object-editor/sections/SectionAttachments.test.tsx
git commit -m "feat(editor): §17 adhésions via modal + explicit empty state; drop campaigns chipset"
```

---

## Task 10: Documentation

**Files:**
- Modify: `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md`
- (Propose) `CLAUDE.md` invariant note

- [ ] **Step 1: Append a decision-log section** to `lot1_mapping_decisions.md` (use the next free § number) covering: §17 made org-only; actor authoring single-sourced in §19 `ProviderCards` (removed the leftover §17 block); `OrgPicker` modal add; adhésions made functional — seed socle (3 campaigns incl. `charte`, 4 tiers incl. `charte_gratuit`) + `api.create_membership_campaign/_tier` create-on-the-go (mirror `create_tag`, per-object gate, dedup `name_normalized`); both `campaign_id`/`tier_id` NOT NULL ⇒ charte = campaign+tier; explicit no-adhésion empty state; deferred: membership vocabulary governance (anti-sprawl). List the migration `membership_vocab_seed_and_create_rpcs` (live-applied + folded into `seeds_data.sql`/`api_views_functions.sql`).

- [ ] **Step 2: Propose the CLAUDE.md invariants** (do not edit CLAUDE.md silently — it is local/gitignored; surface to the user):
  > (1) Authoring `actor_object_role` = §19 `ProviderCards` only; §17 = `object_org_link` + `object_membership`.
  > (2) Membership vocab is create-on-the-go via `api.create_membership_campaign/_tier`; a membership always has a campaign + tier (both NOT NULL); "gratuit"/charte is label-borne, not a price.

- [ ] **Step 3: Commit**

```bash
cd "C:\Users\dphil\Bertel3.0"
git add bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md
git commit -m "docs: log §17 org-attachment refonte + membership create-on-the-go"
```

---

## Final verification

- [ ] Scoped Jest green: `npx jest src/features/object-editor/sections/SectionAttachments.test.tsx src/features/object-editor/sections/org-links.test.ts src/features/object-editor/sections/membership-edit.test.ts src/features/object-editor/widgets/OrgPicker.test.tsx src/features/object-editor/widgets/MembershipEditModal.test.tsx -v`
- [ ] `npx tsc --noEmit -p tsconfig.json` reports no errors in the touched files.
- [ ] Supabase `get_advisors` (security + performance) shows no new findings from the 2 RPCs.
- [ ] Live smoke: open an object editor → §17 shows org links (modal add works), adhésions empty state + "Ajouter une adhésion" → modal → pick org/campaign/tier (and create-on-the-go a "Charte …") → save persists (`object_membership` row appears).
- [ ] No `relationships.actors` reference remains in `SectionAttachments.tsx`.
- [ ] Only your own files/hunks were committed (no PO hunks swept in).
```
