# Hub personnel (ProfileDrawer) — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refondre le tiroir de la pastille utilisateur en hub personnel (identité éditable via modale partagée, collègues en ligne, mes tâches CRM, modération en attente, liens corrigés) — spec `docs/superpowers/specs/2026-07-03-profile-drawer-personal-hub-design.md`.

**Architecture:** Frontend Next.js (app `bertel-tourism-ui`) : refonte du contenu de `ProfileDrawer.tsx` (le Sheet et son ouverture ne bougent pas), nouveau composant partagé `ProfileEditModal` (surface UNIQUE d'édition nom+photo, consommée par le tiroir ET par Réglages → Profil), deep-link `?tab=` sur /crm. Backend : un seul patch additif — `api.list_crm_tasks` expose `owner_id`.

**Tech Stack:** React 18 + Next.js app router, zustand (session/ui stores), TanStack Query, radix Dialog/Sheet (primitives maison `components/ui`), Jest + RTL, PostgreSQL/Supabase (RPC `api.*`, MCP pour le live).

## Global Constraints

- Copie UI en **français** ; classes/tokens CSS maison (`styles.css`, `ghost-button`, `badge--*`, `field-block`…) ; **aucune nouvelle dépendance**.
- Commits **conventionnels sans trailer Co-Authored-By** ; stage+commit **par pathspec dans la même invocation** (une session parallèle peut balayer l'index partagé) ; **jamais d'amend**.
- Tests front : `npx jest <chemin>` depuis `bertel-tourism-ui/` ; typecheck : `npx tsc --noEmit` (même dossier).
- SQL : éditer les fichiers du manifest **in-place** (`Base de donnée DLL et API/…`), appliquer au live via **Supabase MCP `apply_migration`** — jamais de DDL live-only ni de source-only.
- Pas de `console.log` ; pas de `dangerouslySetInnerHTML`.
- Toasts via `sonner` (`import { toast } from 'sonner'`), pattern mock test : `jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))`.
- Le tiroir ne doit **jamais casser** sur un échec de query : bloc masqué, identité + pied restent fonctionnels.

---

### Task 1: SQL — `owner_id` dans `api.list_crm_tasks` (source + test + live)

**Files:**
- Modify: `Base de donnée DLL et API/migration_crm_module.sql:553-573` (fonction `api.list_crm_tasks`)
- Modify: `Base de donnée DLL et API/tests/test_crm_module.sql:250-252` (bloc assignation, après l'assert existant)
- Live: Supabase MCP `apply_migration` (projet CRM/prod déjà branché à la session)

**Interfaces:**
- Produces: chaque item du JSON `api.list_crm_tasks()` porte une clé **`owner_id`** (uuid de `crm_task.owner`, null si non assigné) à côté de `owner_name`. Les tâches 2+ consomment cette clé côté front (`ownerId`).

- [ ] **Step 1: Sonde live AVANT (rouge)**

Via MCP `execute_sql` :

```sql
SELECT pg_get_functiondef('api.list_crm_tasks()'::regprocedure) LIKE '%owner_id%' AS has_owner_id;
```

Attendu : `false` (la clé n'existe pas encore).

- [ ] **Step 2: Éditer la fonction dans le source**

Dans `migration_crm_module.sql`, remplacer :

```sql
      'due_at', ct.due_at, 'created_at', ct.created_at,
      'owner_name', p.display_name,
```

par :

```sql
      'due_at', ct.due_at, 'created_at', ct.created_at,
      -- owner_id (hub personnel 2026-07-03) : uuid brut pour filtrer « mes tâches » côté
      -- front par identité, jamais par nom affiché. Clé additive, aucun appelant cassé.
      'owner_id', ct.owner, 'owner_name', p.display_name,
```

- [ ] **Step 3: Compléter le test SQL**

Dans `tests/test_crm_module.sql`, juste après l'assert `'save_crm_task: la tâche assignée doit apparaître dans list_crm_tasks'` (~ligne 252), ajouter :

```sql
    -- Hub personnel : list_crm_tasks expose owner_id (uuid brut) pour filtrer « mes tâches ».
    ASSERT (SELECT t->>'owner_id' FROM jsonb_array_elements(api.list_crm_tasks()) AS t
            WHERE (t->>'id')::uuid = v_task3_id) = v_userC::text,
           'list_crm_tasks: owner_id doit exposer l''uuid de l''assigné (hub personnel)';
```

- [ ] **Step 4: Appliquer au live**

Via MCP `apply_migration`, nom `list_crm_tasks_owner_id`, contenu = le `CREATE OR REPLACE FUNCTION api.list_crm_tasks() … $$;` **complet** recopié depuis le source modifié (lignes 537-577, avec la ligne `'owner_id', ct.owner,`).

- [ ] **Step 5: Sonde live APRÈS (vert)**

```sql
SELECT pg_get_functiondef('api.list_crm_tasks()'::regprocedure) LIKE '%owner_id%' AS has_owner_id;
-- puis, s'il existe des tâches :
SELECT jsonb_array_length(api.list_crm_tasks()) AS n,
       (SELECT bool_and(t ? 'owner_id') FROM jsonb_array_elements(api.list_crm_tasks()) t) AS all_have_key;
```

Attendu : `has_owner_id = true` ; si `n > 0`, `all_have_key = true`.

- [ ] **Step 6: Commit**

```bash
git add -- "Base de donnée DLL et API/migration_crm_module.sql" "Base de donnée DLL et API/tests/test_crm_module.sql" && git commit -m "feat(crm): list_crm_tasks expose owner_id — uuid de l'assigné pour le filtre « mes tâches » du hub personnel (clé additive ; source in-place + test CI + applique live)" -- "Base de donnée DLL et API/migration_crm_module.sql" "Base de donnée DLL et API/tests/test_crm_module.sql"
```

---

### Task 2: Front — `CrmTask.ownerId` (type + parseur + mocks)

**Files:**
- Modify: `bertel-tourism-ui/src/types/domain.ts:389` (interface `CrmTask`)
- Modify: `bertel-tourism-ui/src/services/crm.ts:34-55` (`parseCrmTask`)
- Modify: `bertel-tourism-ui/src/data/mock.ts:415-420` (`mockCrmTasks`)
- Test: `bertel-tourism-ui/src/services/crm.test.ts:49-80`

**Interfaces:**
- Consumes: clé JSON `owner_id` (Task 1).
- Produces: `CrmTask.ownerId: string | null` (camelCase) ; mocks démo : task-1 `ownerId: 'usr-local-marie'` (= `userId` du mode démo), task-2 `'usr-local-jean'`, task-3 `'usr-local-luc'`.

- [ ] **Step 1: Test rouge — le parseur mappe `owner_id`**

Dans `crm.test.ts`, test « parse une tâche RPC en CrmTask » (ligne 49) : ajouter `owner_id: 'u-42',` dans la fixture (à côté de `owner_name: 'Marie',`) et `ownerId: 'u-42',` dans l'objet attendu du `toEqual` (à côté de `ownerName: 'Marie',`). Dans le test « lien interaction absent » (ligne 78), ajouter :

```ts
    expect(task.ownerId).toBeNull();
```

- [ ] **Step 2: Vérifier l'échec**

Run : `cd bertel-tourism-ui && npx jest src/services/crm.test.ts -t "parse une tâche"`
Attendu : FAIL (`ownerId` absent de l'objet produit → `toEqual` échoue).

- [ ] **Step 3: Implémenter**

`types/domain.ts` — dans `CrmTask`, sous `dueAt` :

```ts
  dueAt: string | null;
  /** Uuid de l'assigné (crm_task.owner) — filtre « mes tâches » du hub personnel. */
  ownerId: string | null;
  ownerName: string | null;
```

`services/crm.ts` — dans `parseCrmTask`, sous `dueAt` :

```ts
    dueAt: readNullableString(record.due_at),
    ownerId: readNullableString(record.owner_id),
    ownerName: readNullableString(record.owner_name),
```

`data/mock.ts` — ajouter dans chaque tâche, à côté de `ownerName` : task-1 `ownerId: 'usr-local-marie',` ; task-2 `ownerId: 'usr-local-jean',` ; task-3 `ownerId: 'usr-local-luc',`.

- [ ] **Step 4: Vérifier le vert + typecheck**

Run : `npx jest src/services/crm.test.ts` → PASS ; `npx tsc --noEmit` → 0 erreur (le champ requis force la mise à jour de tout littéral `CrmTask` — si d'autres fixtures cassent, leur ajouter `ownerId: null`).

- [ ] **Step 5: Commit**

```bash
git add -- bertel-tourism-ui/src/types/domain.ts bertel-tourism-ui/src/services/crm.ts bertel-tourism-ui/src/data/mock.ts bertel-tourism-ui/src/services/crm.test.ts && git commit -m "feat(crm): CrmTask.ownerId — mappe owner_id de list_crm_tasks (type + parseur + mocks démo alignés sur usr-local-marie)" -- bertel-tourism-ui/src/types/domain.ts bertel-tourism-ui/src/services/crm.ts bertel-tourism-ui/src/data/mock.ts bertel-tourism-ui/src/services/crm.test.ts
```

---

### Task 3: Deep-link `?tab=` sur /crm

**Files:**
- Modify: `bertel-tourism-ui/src/views/CrmPage.tsx:73-76` (effet de mount)
- Test: `bertel-tourism-ui/src/views/CrmPage.test.tsx`

**Interfaces:**
- Produces: `/crm?tab=taches` (ou `annuaire` / `timeline`) ouvre l'onglet demandé en **primant sur le nav localStorage** ; valeur invalide/absente ⇒ comportement actuel. Le ProfileDrawer (Task 5) émet `/crm?tab=taches`.

- [ ] **Step 1: Tests rouges**

Ajouter en fin de `CrmPage.test.tsx` (le harnais existant mocke déjà `services/crm` + `usePresenceRoom` ; `mockCrmTasks` contient « Rappeler le directeur ») :

```tsx
describe('deep-link ?tab= (hub personnel)', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('?tab=taches prime sur le nav persisté (annuaire) et ouvre Tâches & relances', async () => {
    localStorage.setItem('bertel-crm-nav-v2', JSON.stringify({ view: 'annuaire' }));
    window.history.replaceState(null, '', '/crm?tab=taches');
    renderPage();
    // Carte kanban du mock ⇒ la vue Tâches est bien rendue.
    expect(await screen.findByText('Rappeler le directeur')).toBeInTheDocument();
  });

  it('?tab= invalide → comportement actuel (annuaire par défaut)', async () => {
    window.history.replaceState(null, '', '/crm?tab=nimporte');
    renderPage();
    expect(await screen.findByText('Acteurs suivis')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run : `npx jest src/views/CrmPage.test.tsx -t "deep-link"`
Attendu : FAIL sur le premier test (l'annuaire persisté s'affiche au lieu des tâches).

- [ ] **Step 3: Implémenter**

Dans `CrmPage.tsx`, remplacer l'effet de mount :

```tsx
  useEffect(() => {
    setNav(loadNav());
    setHydrated(true);
  }, []);
```

par :

```tsx
  useEffect(() => {
    // Deep-link d'onglet (hub personnel 2026-07-03) : ?tab= prime sur le nav persisté —
    // même esprit que ?fiche= (§142). Lu via window.location au mount (pas de
    // useSearchParams : évite la contrainte Suspense, le nav est déjà hydraté client-only).
    const tab = new URLSearchParams(window.location.search).get('tab');
    const isValidTab = tab === 'annuaire' || tab === 'taches' || tab === 'timeline';
    setNav(isValidTab ? { view: tab } : loadNav());
    setHydrated(true);
  }, []);
```

- [ ] **Step 4: Vérifier le vert**

Run : `npx jest src/views/CrmPage.test.tsx` → PASS (toute la suite CrmPage, pas seulement les 2 nouveaux).

- [ ] **Step 5: Commit**

```bash
git add -- bertel-tourism-ui/src/views/CrmPage.tsx bertel-tourism-ui/src/views/CrmPage.test.tsx && git commit -m "feat(crm): deep-link ?tab= sur /crm — prime sur le nav persisté (window.location au mount, pas de useSearchParams) ; le hub personnel pointe Tâches & relances" -- bertel-tourism-ui/src/views/CrmPage.tsx bertel-tourism-ui/src/views/CrmPage.test.tsx
```

---

### Task 4: `ProfileEditModal` — surface unique d'édition nom+photo + intégration Réglages

**Files:**
- Create: `bertel-tourism-ui/src/features/settings/ProfileEditModal.tsx`
- Test: `bertel-tourism-ui/src/features/settings/ProfileEditModal.test.tsx`
- Modify: `bertel-tourism-ui/src/views/SettingsPage.tsx` (section `profile` + états/handlers déplacés)

**Interfaces:**
- Consumes: `updateCurrentUserProfile` / `uploadAvatar` (`services/user-profile.ts`), `useSessionStore` (`userName`, `email`, `avatarUrl`, `demoMode`, `status`, `applyProfile`), primitive `Dialog` (`components/ui/dialog`).
- Produces: `export function ProfileEditModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void })` — consommée par SettingsPage (cette task) et ProfileDrawer (Task 5).

- [ ] **Step 1: Test rouge**

Créer `ProfileEditModal.test.tsx` :

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProfileEditModal } from './ProfileEditModal';
import { useSessionStore } from '../../store/session-store';
import * as userProfile from '../../services/user-profile';
import { toast } from 'sonner';

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../../services/user-profile');
const profileMock = userProfile as jest.Mocked<typeof userProfile>;

beforeEach(() => {
  jest.clearAllMocks();
  profileMock.updateCurrentUserProfile.mockResolvedValue(undefined);
  profileMock.uploadAvatar.mockResolvedValue('https://cdn.example/avatar.jpg?v=1');
  useSessionStore.setState({
    status: 'ready', demoMode: false,
    userName: 'David P.', email: 'david@otisud.re', avatarUrl: null,
  } as never);
});

describe('ProfileEditModal', () => {
  it('préremplit le nom courant et enregistre via le service + applyProfile, puis ferme', async () => {
    const onOpenChange = jest.fn();
    render(<ProfileEditModal open onOpenChange={onOpenChange} />);
    const input = screen.getByLabelText('Nom affiché');
    expect(input).toHaveValue('David P.');
    fireEvent.change(input, { target: { value: 'David Philippe' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(profileMock.updateCurrentUserProfile).toHaveBeenCalledWith({ display_name: 'David Philippe' }));
    expect(useSessionStore.getState().userName).toBe('David Philippe');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('nom vide → erreur, aucun appel service', async () => {
    render(<ProfileEditModal open onOpenChange={jest.fn()} />);
    fireEvent.change(screen.getByLabelText('Nom affiché'), { target: { value: '   ' } });
    // Bouton désactivé sur brouillon vide : la garde UI suffit.
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    expect(profileMock.updateCurrentUserProfile).not.toHaveBeenCalled();
  });

  it('mode démo : le nom s’applique localement SANS service, la photo est désactivée', async () => {
    useSessionStore.setState({ demoMode: true, status: 'ready' } as never);
    render(<ProfileEditModal open onOpenChange={jest.fn()} />);
    expect(screen.getByLabelText(/ajouter une photo|changer la photo/i)).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Nom affiché'), { target: { value: 'Marie Demo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(useSessionStore.getState().userName).toBe('Marie Demo'));
    expect(profileMock.updateCurrentUserProfile).not.toHaveBeenCalled();
  });

  it('upload avatar : uploadAvatar appelé, avatarUrl appliqué à la session', async () => {
    render(<ProfileEditModal open onOpenChange={jest.fn()} />);
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    const input = screen.getByLabelText(/ajouter une photo/i);
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(profileMock.uploadAvatar).toHaveBeenCalledWith(file));
    expect(useSessionStore.getState().avatarUrl).toBe('https://cdn.example/avatar.jpg?v=1');
  });

  it('échec upload → toast.error, session inchangée', async () => {
    profileMock.uploadAvatar.mockRejectedValue(new Error("Format d'image non supporté (JPEG, PNG ou WebP, ≤ 5 Mo)."));
    render(<ProfileEditModal open onOpenChange={jest.fn()} />);
    const file = new File(['x'], 'photo.gif', { type: 'image/gif' });
    fireEvent.change(screen.getByLabelText(/ajouter une photo/i), { target: { files: [file] } });
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(useSessionStore.getState().avatarUrl).toBeNull();
  });
});
```

Note harnais : pour que `getByLabelText(/ajouter une photo/i)` résolve l'input file, le `<label>` doit envelopper l'input (c'est le markup ci-dessous — le libellé du label change avec `avatarUrl`, d'où la regex alternative).

- [ ] **Step 2: Vérifier l'échec**

Run : `npx jest src/features/settings/ProfileEditModal.test.tsx`
Attendu : FAIL (« Cannot find module './ProfileEditModal' »).

- [ ] **Step 3: Implémenter la modale**

Créer `ProfileEditModal.tsx` :

```tsx
'use client';

// Modale d'édition du profil — SURFACE UNIQUE d'édition nom + photo (spec hub personnel
// 2026-07-03), consommée par le ProfileDrawer et par Réglages → Mon compte → Profil.
// Reprend la mécanique §149 : updateCurrentUserProfile / uploadAvatar (route serveur,
// EXIF strippé) + applyProfile (session mise à jour sans re-bootstrap).

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { updateCurrentUserProfile, uploadAvatar } from '../../services/user-profile';
import { useSessionStore } from '../../store/session-store';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface ProfileEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProfileEditModal({ open, onOpenChange }: ProfileEditModalProps) {
  const userName = useSessionStore((state) => state.userName);
  const email = useSessionStore((state) => state.email);
  const avatarUrl = useSessionStore((state) => state.avatarUrl);
  const demoMode = useSessionStore((state) => state.demoMode);
  const status = useSessionStore((state) => state.status);
  const applyProfile = useSessionStore((state) => state.applyProfile);

  const [nameDraft, setNameDraft] = useState<string>(userName);
  const [nameSaving, setNameSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);

  // Resynchronise le brouillon à chaque ouverture (le nom peut avoir changé entre deux passages).
  useEffect(() => {
    if (open) setNameDraft(userName);
  }, [open, userName]);

  // L'avatar affiché ne doit jamais être l'e-mail : si aucun nom réel n'est enregistré,
  // le display_name retombe sur l'e-mail — on n'en tire pas d'initiales trompeuses (§149).
  const hasRealName = userName.trim() !== '' && userName.trim() !== email.trim();
  const avatarInitials = hasRealName
    ? userName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('')
    : '?';

  const handleSaveName = async () => {
    const next = nameDraft.trim();
    if (next === '') {
      toast.error('Le nom ne peut pas être vide.');
      return;
    }
    if (next === userName) {
      onOpenChange(false);
      return;
    }
    setNameSaving(true);
    try {
      if (!demoMode && status === 'ready') {
        await updateCurrentUserProfile({ display_name: next });
      }
      applyProfile({ userName: next });
      toast.success('Nom enregistré.');
      onOpenChange(false);
    } catch (error: unknown) {
      toast.error((error as Error).message);
    } finally {
      setNameSaving(false);
    }
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // permet de re-sélectionner le même fichier
    if (!file) return;
    setAvatarBusy(true);
    try {
      const url = await uploadAvatar(file);
      applyProfile({ avatarUrl: url });
      toast.success('Photo de profil mise à jour.');
    } catch (error: unknown) {
      toast.error((error as Error).message);
    } finally {
      setAvatarBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Mon profil</DialogTitle>
          <DialogDescription>
            Votre nom et votre photo — visibles dans l’app et dans le « mot du conseiller » de vos sélections.
          </DialogDescription>
        </DialogHeader>

        <div className="inline-actions" style={{ alignItems: 'center', gap: 16 }}>
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- avatar CDN Supabase
            <img
              src={avatarUrl}
              alt="Votre photo de profil"
              width={64}
              height={64}
              style={{ width: 64, height: 64, borderRadius: 999, objectFit: 'cover', flex: 'none' }}
            />
          ) : (
            <span
              aria-hidden
              style={{ width: 64, height: 64, borderRadius: 999, flex: 'none', display: 'grid', placeItems: 'center', background: 'var(--accent, #1f7a6d)', color: '#fff', fontWeight: 700, fontSize: 22 }}
            >
              {avatarInitials}
            </span>
          )}
          <label className="ghost-button marker-upload-button cursor-pointer">
            {avatarBusy ? 'Envoi…' : avatarUrl ? 'Changer la photo' : 'Ajouter une photo'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              disabled={avatarBusy || demoMode}
              onChange={(event) => void handleAvatarChange(event)}
            />
          </label>
        </div>
        {demoMode ? <p className="pref__hint">Photo indisponible en mode démo (aucune session réelle).</p> : null}
        <p className="pref__hint">JPEG, PNG ou WebP — ≤ 5 Mo. Redimensionnée et nettoyée (métadonnées EXIF/GPS supprimées) automatiquement.</p>

        <div className="field-block">
          <label htmlFor="profileEditName">Nom affiché</label>
          <input
            id="profileEditName"
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            placeholder="Prénom (ou prénom + nom)"
            autoComplete="name"
          />
          <p className="pref__hint">Ex. « David » ou « David Philippe ». C’est ce nom qui signe le « mot du conseiller ».</p>
        </div>
        <div className="settings-pane__actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => void handleSaveName()}
            disabled={nameSaving || nameDraft.trim() === ''}
          >
            {nameSaving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Vérifier le vert**

Run : `npx jest src/features/settings/ProfileEditModal.test.tsx` → PASS (5 tests).

- [ ] **Step 5: Intégrer dans SettingsPage (affichage + bouton → modale)**

Dans `SettingsPage.tsx` :

1. Ajouter l'import : `import { ProfileEditModal } from '../features/settings/ProfileEditModal';` et retirer `uploadAvatar` de l'import `services/user-profile` (garder `updateCurrentUserProfile`, utilisé par `toggleLanguage`).
2. Remplacer les états/handlers déplacés (lignes ~104-160) : supprimer `nameDraft`, `nameSaving`, `avatarBusy`, `nameDirty`, l'effet de resynchronisation, `handleSaveName`, `handleAvatarChange`. **Garder** `hasRealName` / `avatarInitials` (affichage). Ajouter :

```tsx
  // « Mon compte » → Profil : l'édition (nom + photo) vit dans ProfileEditModal — surface
  // unique partagée avec le hub personnel (ProfileDrawer). Ici : affichage + bouton.
  const [profileModalOpen, setProfileModalOpen] = useState(false);
```

3. Remplacer la section `{activeSection === 'profile' && (…)}` (lignes ~683-752) par :

```tsx
      {activeSection === 'profile' && (
      <section className="settings-pane">
        <div className="settings-pane__head">
          <div>
            <h2>Profil</h2>
            <p>Votre nom et votre photo — visibles dans l’app et dans le « mot du conseiller » de vos sélections.</p>
          </div>
          <button type="button" className="primary-button" onClick={() => setProfileModalOpen(true)}>
            Modifier
          </button>
        </div>

        <div className="settings-pane__demo">
          <div className="inline-actions" style={{ alignItems: 'center', gap: 16 }}>
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- avatar CDN Supabase, pas d'optimisation next/image requise
              <img
                src={avatarUrl}
                alt="Votre photo de profil"
                width={64}
                height={64}
                style={{ width: 64, height: 64, borderRadius: 999, objectFit: 'cover', flex: 'none' }}
              />
            ) : (
              <span
                aria-hidden
                style={{ width: 64, height: 64, borderRadius: 999, flex: 'none', display: 'grid', placeItems: 'center', background: 'var(--accent, #1f7a6d)', color: '#fff', fontWeight: 700, fontSize: 22 }}
              >
                {avatarInitials}
              </span>
            )}
            <div>
              <strong>{userName || '—'}</strong>
              <p className="pref__hint">{email || 'Aucune adresse e-mail (mode démo)'}</p>
            </div>
          </div>
        </div>
        <ProfileEditModal open={profileModalOpen} onOpenChange={setProfileModalOpen} />
      </section>
      )}
```

- [ ] **Step 6: Typecheck + suite ciblée**

Run : `npx tsc --noEmit` → 0 erreur (traque les résidus : états supprimés encore référencés, import mort). Puis `npx jest src/features/settings` → PASS.

- [ ] **Step 7: Commit**

```bash
git add -- bertel-tourism-ui/src/features/settings/ProfileEditModal.tsx bertel-tourism-ui/src/features/settings/ProfileEditModal.test.tsx bertel-tourism-ui/src/views/SettingsPage.tsx && git commit -m "feat(settings): ProfileEditModal — surface unique d'édition nom+photo (mécanique §149 déplacée) ; Réglages → Profil passe en affichage + bouton Modifier ouvrant la modale" -- bertel-tourism-ui/src/features/settings/ProfileEditModal.tsx bertel-tourism-ui/src/features/settings/ProfileEditModal.test.tsx bertel-tourism-ui/src/views/SettingsPage.tsx
```

---

### Task 5: Refonte `ProfileDrawer` (hub personnel) + CSS

**Files:**
- Modify: `bertel-tourism-ui/src/components/layout/ProfileDrawer.tsx` (réécriture du contenu)
- Test: `bertel-tourism-ui/src/components/layout/ProfileDrawer.test.tsx` (nouveau)
- Modify: `bertel-tourism-ui/src/styles.css` (classes `profile-drawer__*` : retraits + ajouts)

**Interfaces:**
- Consumes: `ProfileEditModal` (Task 4), `CrmTask.ownerId` (Task 2), `/crm?tab=taches` (Task 3), `resolveUserRoleLabel`/`resolveUserRoleTone` (`utils/user-role-label.ts`), `canAdministerTeam` (`store/session-selectors.ts`), `visibleNavItems` (`config/nav-items.ts`), `listCrmTasks` (`services/crm.ts`), `listPendingChanges` (`services/rpc.ts`), `liveMembers`/`networkStatus` (`store/ui-store.ts`).
- Produces: exports purs testables `selectMyOpenTasks(tasks: CrmTask[], userId: string | null): CrmTask[]` et `isTaskOverdue(task: CrmTask, now?: number): boolean`.

- [ ] **Step 1: Tests rouges**

Créer `ProfileDrawer.test.tsx` :

```tsx
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfileDrawer, selectMyOpenTasks, isTaskOverdue } from './ProfileDrawer';
import { useSessionStore } from '../../store/session-store';
import { useUiStore } from '../../store/ui-store';
import * as crm from '../../services/crm';
import * as rpc from '../../services/rpc';
import type { CrmTask, PresenceMember } from '../../types/domain';

jest.mock('../../services/crm');
jest.mock('../../services/rpc');
jest.mock('../../services/auth', () => ({ signOut: jest.fn() }));
// ProfileEditModal est rendu (fermé) par le tiroir : neutraliser ses dépendances réseau.
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../../services/user-profile', () => ({
  updateCurrentUserProfile: jest.fn(),
  uploadAvatar: jest.fn(),
}));

const crmMock = crm as jest.Mocked<typeof crm>;
const rpcMock = rpc as jest.Mocked<typeof rpc>;

function makeTask(over: Partial<CrmTask> = {}): CrmTask {
  return {
    id: 't1', objectId: 'obj-1', objectName: 'Hôtel Test', actorId: null, actorName: null,
    title: 'Rappeler le directeur', description: null, status: 'todo', priority: 'high',
    dueAt: null, ownerId: 'u-me', ownerName: 'David', relatedInteractionId: null,
    relatedInteractionSubject: null, relatedInteractionStatus: null,
    ...over,
  };
}

function member(over: Partial<PresenceMember> = {}): PresenceMember {
  return { userId: 'u-x', name: 'Marie', avatar: 'MA', color: '#1f7a6d', onlineSince: Date.now(), ...over };
}

function renderDrawer() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ProfileDrawer open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  crmMock.listCrmTasks.mockResolvedValue([]);
  rpcMock.listPendingChanges.mockResolvedValue([]);
  useSessionStore.setState({
    status: 'ready', demoMode: false, role: 'tourism_agent', adminRank: null,
    userId: 'u-me', email: 'david@otisud.re', userName: 'David P.', avatarUrl: null,
    orgName: 'OTI du Sud',
  } as never);
  useUiStore.setState({
    networkStatus: 'connected',
    liveMembers: [member({ userId: 'u-me', name: 'David P.' })],
  } as never);
});

describe('selectMyOpenTasks / isTaskOverdue (purs)', () => {
  it('filtre owner+statut, trie par échéance (nulls en dernier), 4 max', () => {
    const tasks = [
      makeTask({ id: 'a', dueAt: null }),
      makeTask({ id: 'b', dueAt: '2026-07-10T09:00:00Z' }),
      makeTask({ id: 'autre', ownerId: 'u-other' }),
      makeTask({ id: 'finie', status: 'done' }),
      makeTask({ id: 'c', dueAt: '2026-07-01T09:00:00Z' }),
      makeTask({ id: 'd', dueAt: '2026-07-05T09:00:00Z', status: 'in_progress' }),
      makeTask({ id: 'e', dueAt: '2026-07-06T09:00:00Z' }),
    ];
    expect(selectMyOpenTasks(tasks, 'u-me').map((t) => t.id)).toEqual(['c', 'd', 'e', 'b']);
    expect(selectMyOpenTasks(tasks, null)).toEqual([]);
  });

  it('isTaskOverdue : échéance passée = vrai, sans échéance = faux', () => {
    const now = new Date('2026-07-03T12:00:00Z').getTime();
    expect(isTaskOverdue(makeTask({ dueAt: '2026-07-01T09:00:00Z' }), now)).toBe(true);
    expect(isTaskOverdue(makeTask({ dueAt: '2026-07-10T09:00:00Z' }), now)).toBe(false);
    expect(isTaskOverdue(makeTask({ dueAt: null }), now)).toBe(false);
  });
});

describe('ProfileDrawer (hub personnel)', () => {
  it('identité complète : nom, e-mail, organisation, rôle FR lisible', async () => {
    useSessionStore.setState({ adminRank: 12 } as never);
    renderDrawer();
    expect(await screen.findByText('David P.')).toBeInTheDocument();
    expect(screen.getByText('david@otisud.re')).toBeInTheDocument();
    expect(screen.getByText('OTI du Sud')).toBeInTheDocument();
    expect(screen.getByText('Agent touristique · Admin ORG')).toBeInTheDocument();
    // Plus aucun code brut.
    expect(screen.queryByText(/tourism_agent|ready|connected|workspace/i)).not.toBeInTheDocument();
  });

  it('seul connecté → message dédié ; collègues → noms listés sans le mien', async () => {
    renderDrawer();
    expect(await screen.findByText('Vous êtes le seul connecté.')).toBeInTheDocument();

    useUiStore.setState({
      liveMembers: [member({ userId: 'u-me', name: 'David P.' }), member({ userId: 'u-2', name: 'Marie H.' }), member({ userId: 'u-3', name: 'Luc P.' })],
    } as never);
    renderDrawer();
    expect(await screen.findByText('Marie H.')).toBeInTheDocument();
    expect(screen.getByText('Luc P.')).toBeInTheDocument();
    expect(screen.queryByText('Vous êtes le seul connecté.')).not.toBeInTheDocument();
  });

  it('mes tâches : filtrées (owner + statut ouvert), badge « En retard », liens /crm?tab=taches', async () => {
    crmMock.listCrmTasks.mockResolvedValue([
      makeTask({ id: 't1', title: 'Rappeler le directeur', dueAt: '2020-01-01T09:00:00Z' }),
      makeTask({ id: 't2', title: 'Tâche d’un collègue', ownerId: 'u-other' }),
      makeTask({ id: 't3', title: 'Tâche terminée', status: 'done' }),
    ]);
    renderDrawer();
    expect(await screen.findByText('Rappeler le directeur')).toBeInTheDocument();
    expect(screen.queryByText('Tâche d’un collègue')).not.toBeInTheDocument();
    expect(screen.queryByText('Tâche terminée')).not.toBeInTheDocument();
    expect(screen.getByText('En retard')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Toutes mes tâches' })).toHaveAttribute('href', '/crm?tab=taches');
  });

  it('aucune tâche assignée → le bloc « Mes tâches » est absent', async () => {
    renderDrawer();
    expect(await screen.findByText('En ligne maintenant')).toBeInTheDocument();
    expect(screen.queryByText('Mes tâches')).not.toBeInTheDocument();
  });

  it('modération : compteur > 0 → lien /moderation ; 0 → bloc absent', async () => {
    rpcMock.listPendingChanges.mockResolvedValue([
      { id: 'pc-1', objectName: 'O', author: 'A', field: 'f', before: 'b', after: 'a', submittedAt: '2026-07-01', status: 'pending' },
      { id: 'pc-2', objectName: 'O', author: 'A', field: 'f', before: 'b', after: 'a', submittedAt: '2026-07-01', status: 'pending' },
    ] as never);
    renderDrawer();
    const link = await screen.findByRole('link', { name: /2 suggestions en attente/i });
    expect(link).toHaveAttribute('href', '/moderation');
  });

  it('pied : « Mon équipe » gated admin (/settings?section=team), Paramètres toujours là', async () => {
    renderDrawer();
    expect(await screen.findByRole('link', { name: /Paramètres/i })).toHaveAttribute('href', '/settings');
    expect(screen.queryByRole('link', { name: /Mon équipe/i })).not.toBeInTheDocument();

    useSessionStore.setState({ adminRank: 12 } as never);
    renderDrawer();
    expect(await screen.findByRole('link', { name: /Mon équipe/i })).toHaveAttribute('href', '/settings?section=team');
  });

  it('réseau : bandeau seulement si dégradé/hors-ligne', async () => {
    renderDrawer();
    expect(await screen.findByText('En ligne maintenant')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    useUiStore.setState({ networkStatus: 'degraded' } as never);
    renderDrawer();
    expect(await screen.findByRole('status')).toHaveTextContent('Connexion dégradée');
  });

  it('déconnexion masquée en mode démo', async () => {
    useSessionStore.setState({ demoMode: true } as never);
    renderDrawer();
    expect(await screen.findByText('En ligne maintenant')).toBeInTheDocument();
    expect(screen.queryByText('Se deconnecter')).not.toBeInTheDocument();
    expect(screen.queryByText('Se déconnecter')).not.toBeInTheDocument();
  });
});
```

Note : chaque `renderDrawer()` supplémentaire dans un même test rend un second Sheet — utiliser les requêtes `findBy*` (elles ciblent le dernier rendu car les textes attendus diffèrent) ; si une collision de doublons apparaît, appeler `unmount()` sur le premier rendu (`const { unmount } = renderDrawer()`).

- [ ] **Step 2: Vérifier l'échec**

Run : `npx jest src/components/layout/ProfileDrawer.test.tsx`
Attendu : FAIL (`selectMyOpenTasks` non exporté, contenus absents).

- [ ] **Step 3: Réécrire `ProfileDrawer.tsx`**

Contenu complet :

```tsx
'use client';

// Hub personnel (spec 2026-07-03) — le tiroir de la pastille utilisateur devient un espace
// personnel : identité éditable (ProfileEditModal), collègues en ligne (presence globale
// useGlobalPresence), tâches CRM assignées, modération en attente, raccourcis réels.
// Les blocs dynamiques sont tolérants à l'échec (query en erreur ⇒ bloc masqué) :
// identité + pied ne dépendent d'aucun réseau.

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LogOut, Pencil, Settings2, ShieldCheck, Users, WifiOff, X } from 'lucide-react';
import { visibleNavItems } from '../../config/nav-items';
import { signOut } from '../../services/auth';
import { listCrmTasks } from '../../services/crm';
import { listPendingChanges } from '../../services/rpc';
import { useSessionStore } from '../../store/session-store';
import { useUiStore } from '../../store/ui-store';
import { canAdministerTeam } from '@/store/session-selectors';
import { resolveUserRoleLabel, resolveUserRoleTone } from '../../utils/user-role-label';
import { ProfileEditModal } from '../../features/settings/ProfileEditModal';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import type { CrmTask } from '../../types/domain';

interface ProfileDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function initialsFromName(value: string | null | undefined): string {
  const parts = String(value ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return 'BT';
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

/** Tâches ouvertes assignées à l'utilisateur : todo/in_progress, échéance croissante (nulls en dernier), 4 max. */
export function selectMyOpenTasks(tasks: CrmTask[], userId: string | null): CrmTask[] {
  if (!userId) return [];
  return tasks
    .filter((task) => task.ownerId === userId && (task.status === 'todo' || task.status === 'in_progress'))
    .sort((a, b) => {
      if (!a.dueAt && !b.dueAt) return 0;
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;
      return a.dueAt.localeCompare(b.dueAt);
    })
    .slice(0, 4);
}

/** Échéance dépassée (badge « En retard »). */
export function isTaskOverdue(task: CrmTask, now: number = Date.now()): boolean {
  return Boolean(task.dueAt && new Date(task.dueAt).getTime() < now);
}

function formatSince(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatDue(dueAt: string): string {
  return new Date(dueAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function ProfileDrawer({ open, onOpenChange }: ProfileDrawerProps) {
  const role = useSessionStore((state) => state.role);
  const adminRank = useSessionStore((state) => state.adminRank);
  const userId = useSessionStore((state) => state.userId);
  const userName = useSessionStore((state) => state.userName);
  const email = useSessionStore((state) => state.email);
  const orgName = useSessionStore((state) => state.orgName);
  const avatarUrl = useSessionStore((state) => state.avatarUrl);
  const sessionStatus = useSessionStore((state) => state.status);
  const demoMode = useSessionStore((state) => state.demoMode);
  const networkStatus = useUiStore((state) => state.networkStatus);
  const liveMembers = useUiStore((state) => state.liveMembers);
  const [editOpen, setEditOpen] = useState(false);

  const userLabel = userName || 'Equipe Bertel';
  const initials = initialsFromName(userLabel);
  const roleLabel = resolveUserRoleLabel(role, adminRank);
  const roleTone = resolveUserRoleTone(role);
  const colleagues = liveMembers.filter((memberEntry) => memberEntry.userId !== userId);
  const showTeamLink = canAdministerTeam({ role, adminRank });

  // Mêmes clés de cache que CrmPage / le badge Sidebar (aucune double charge réseau) ;
  // fetch uniquement panneau ouvert. Query en erreur ⇒ data undefined ⇒ bloc masqué.
  const tasksQuery = useQuery({ queryKey: ['crm-tasks'], queryFn: listCrmTasks, enabled: open, staleTime: 60_000 });
  const moderationVisible = visibleNavItems(role, demoMode).some((item) => item.to === '/moderation');
  const pendingQuery = useQuery({
    queryKey: ['pending-changes', 'pending'],
    queryFn: () => listPendingChanges('pending'),
    enabled: open && moderationVisible,
    staleTime: 60_000,
  });
  const myTasks = selectMyOpenTasks(tasksQuery.data ?? [], userId);
  const pendingCount = pendingQuery.data?.length ?? 0;

  const close = () => onOpenChange(false);

  async function handleSignOut() {
    await signOut();
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          showClose={false}
          aria-describedby={undefined}
          className="profile-drawer w-full max-w-[420px] border-0 p-0 sm:max-w-[420px]"
        >
          <SheetTitle className="sr-only">Mon espace</SheetTitle>
          <SheetDescription className="sr-only">
            Identité, collègues en ligne, tâches assignées et raccourcis personnels.
          </SheetDescription>
          <div className="profile-drawer__inner">
            <div className="profile-drawer__header">
              <span className="eyebrow">Mon espace</span>
              <button type="button" className="topbar-icon-button" onClick={close} aria-label="Fermer le panneau">
                <X className="h-4 w-4" />
              </button>
            </div>

            {networkStatus !== 'connected' ? (
              <p className="profile-drawer__network" role="status">
                <WifiOff className="h-4 w-4" aria-hidden />
                {networkStatus === 'degraded'
                  ? 'Connexion dégradée — certaines données peuvent être obsolètes.'
                  : 'Hors ligne — les données affichées peuvent être obsolètes.'}
              </p>
            ) : null}

            <div className="profile-drawer__card">
              {avatarUrl
                // eslint-disable-next-line @next/next/no-img-element -- avatar CDN Supabase
                ? <img className="profile-drawer__avatar profile-drawer__avatar--photo" src={avatarUrl} alt="" />
                : <span className="profile-drawer__avatar">{initials}</span>}
              <div className="profile-drawer__identity">
                <strong>{userLabel}</strong>
                {email ? <span>{email}</span> : null}
                <span className="profile-drawer__meta">
                  {orgName ? <span>{orgName}</span> : null}
                  <span className={`badge badge--${roleTone}`}>{roleLabel}</span>
                </span>
              </div>
            </div>
            <button type="button" className="ghost-button" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" />
              Modifier mon profil
            </button>

            <section className="profile-drawer__block" aria-label="Collègues en ligne">
              <h3 className="profile-drawer__block-title">En ligne maintenant</h3>
              {colleagues.length === 0 ? (
                <p className="profile-drawer__empty">Vous êtes le seul connecté.</p>
              ) : (
                <ul className="profile-drawer__presence">
                  {colleagues.map((memberEntry) => (
                    <li
                      key={memberEntry.userId}
                      title={memberEntry.onlineSince ? `En ligne depuis ${formatSince(memberEntry.onlineSince)}` : 'En ligne'}
                    >
                      <span className="profile-drawer__presence-avatar" style={{ background: memberEntry.color }} aria-hidden>
                        {memberEntry.avatar}
                      </span>
                      <span>{memberEntry.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {myTasks.length > 0 ? (
              <section className="profile-drawer__block" aria-label="Mes tâches">
                <h3 className="profile-drawer__block-title">Mes tâches</h3>
                <ul className="profile-drawer__tasks">
                  {myTasks.map((task) => (
                    <li key={task.id}>
                      <Link href="/crm?tab=taches" className="profile-drawer__task" onClick={close}>
                        <span className="profile-drawer__task-title">{task.title}</span>
                        <span className="profile-drawer__task-meta">
                          {task.objectName}
                          {task.dueAt ? ` · ${formatDue(task.dueAt)}` : ''}
                          {isTaskOverdue(task) ? <span className="badge badge--warn">En retard</span> : null}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link href="/crm?tab=taches" className="profile-drawer__more" onClick={close}>
                  Toutes mes tâches
                </Link>
              </section>
            ) : null}

            {moderationVisible && pendingCount > 0 ? (
              <section className="profile-drawer__block" aria-label="Modération">
                <Link href="/moderation" className="profile-drawer__task" onClick={close}>
                  <span className="profile-drawer__task-title">
                    <ShieldCheck className="h-4 w-4" aria-hidden />
                    {pendingCount} suggestion{pendingCount > 1 ? 's' : ''} en attente de modération
                  </span>
                </Link>
              </section>
            ) : null}

            <div className="profile-drawer__actions">
              {showTeamLink ? (
                <Link href="/settings?section=team" className="ghost-button" onClick={close}>
                  <Users className="h-4 w-4" />
                  Mon équipe
                </Link>
              ) : null}
              <Link href="/settings" className="ghost-button" onClick={close}>
                <Settings2 className="h-4 w-4" />
                Paramètres
              </Link>
            </div>

            {!demoMode && sessionStatus === 'ready' ? (
              <Button type="button" variant="ghost" className="profile-drawer__logout" onClick={() => void handleSignOut()}>
                <LogOut className="h-4 w-4" />
                Se déconnecter
              </Button>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
      <ProfileEditModal open={editOpen} onOpenChange={setEditOpen} />
    </>
  );
}
```

- [ ] **Step 4: CSS — retraits + ajouts dans `styles.css`**

**Retraits** (styles du vieux tiroir, désormais sans consommateur) :
1. Ligne ~7405 : retirer `.profile-drawer__status,` du sélecteur groupé (garder `.profile-drawer__actions, .sidebar-brand__header { … }`).
2. Lignes ~7413-7423 : supprimer le bloc `.profile-drawer__mode { … }` entier.
3. Lignes ~7530-7532 : supprimer le bloc `.profile-drawer__status { flex-wrap: wrap; }`.
4. Vérifier avec `grep -n "profile-drawer__status\|profile-drawer__mode" src/styles.css` qu'il ne reste **aucune** occurrence (il y a un second groupe responsive vers la ligne ~7918 — le nettoyer aussi s'il référence ces classes).

**Ajouts** (après le bloc `.profile-drawer__logout { … }`, ~ligne 7538) :

```css
/* Hub personnel — bandeau réseau (affiché seulement dégradé / hors-ligne) */
.profile-drawer__network {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  padding: 0.6rem 0.9rem;
  border-radius: 14px;
  background: rgba(196, 121, 47, 0.12);
  border: 1px solid rgba(196, 121, 47, 0.3);
  font-size: 0.85rem;
  font-weight: 600;
}

.profile-drawer__identity {
  display: grid;
  gap: 0.15rem;
  min-width: 0;
}

.profile-drawer__identity span {
  overflow-wrap: anywhere;
}

.profile-drawer__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.2rem;
}

/* Blocs du hub (présence / tâches / modération) — même peau que profile-drawer__card */
.profile-drawer__block {
  display: grid;
  gap: 0.6rem;
  border-radius: 28px;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.76);
  border: 1px solid rgba(24, 49, 59, 0.08);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

.profile-drawer__block-title {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.profile-drawer__empty {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.profile-drawer__presence {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.5rem;
}

.profile-drawer__presence li {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.profile-drawer__presence-avatar {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 0.72rem;
  font-weight: 700;
  flex: none;
}

.profile-drawer__tasks {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.35rem;
}

.profile-drawer__task {
  display: grid;
  gap: 0.15rem;
  padding: 0.5rem 0.65rem;
  border-radius: 14px;
  text-decoration: none;
  color: inherit;
}

.profile-drawer__task:hover {
  background: rgba(24, 49, 59, 0.05);
}

.profile-drawer__task-title {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-weight: 600;
}

.profile-drawer__task-meta {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.45rem;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.profile-drawer__more {
  justify-self: start;
  font-size: 0.85rem;
  font-weight: 600;
  text-decoration: underline;
}
```

- [ ] **Step 5: Vérifier le vert + typecheck**

Run : `npx jest src/components/layout/ProfileDrawer.test.tsx` → PASS ; `npx tsc --noEmit` → 0 erreur.

- [ ] **Step 6: Vérification visuelle (preview)**

Démarrer le serveur (`preview_start`, config existante de `.claude/launch.json`) — **rappel : le preview local tourne sur la DB de démo** ; en mode démo la présence affiche 2 collègues factices et task-1 appartient à `usr-local-marie`. Ouvrir le tiroir (clic pastille sidebar), vérifier par `preview_snapshot` : identité (nom/e-mail/org/rôle), « En ligne maintenant », « Mes tâches » (1 tâche Marie), pied. Ouvrir « Modifier mon profil » → la modale s'affiche par-dessus. `preview_screenshot` en preuve.

- [ ] **Step 7: Commit**

```bash
git add -- bertel-tourism-ui/src/components/layout/ProfileDrawer.tsx bertel-tourism-ui/src/components/layout/ProfileDrawer.test.tsx bertel-tourism-ui/src/styles.css && git commit -m "feat(layout): ProfileDrawer hub personnel — identité éditable (ProfileEditModal), collègues en ligne (presence globale), mes tâches CRM (ownerId, badge retard, 4 max), modération en attente, liens réels (/settings?section=team gated, /crm?tab=taches), réseau seulement si dégradé ; retire les pills codes bruts + CSS mort (__status/__mode)" -- bertel-tourism-ui/src/components/layout/ProfileDrawer.tsx bertel-tourism-ui/src/components/layout/ProfileDrawer.test.tsx bertel-tourism-ui/src/styles.css
```

---

### Task 6: Vérifications globales + documentation

**Files:**
- Modify: `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (gitignoré, local — PAS de commit)

**Interfaces:**
- Consumes: tout le lot (Tasks 1-5).

- [ ] **Step 1: Suite complète + typecheck**

Run : `cd bertel-tourism-ui && npx jest --silent` → 0 échec ; `npx tsc --noEmit` → 0 erreur.
Si un test hors-lot casse sur `CrmTask` (champ requis `ownerId` manquant dans une fixture), corriger la fixture (`ownerId: null`) — jamais le type.

- [ ] **Step 2: Journal de décisions**

Dans `lot1_mapping_decisions.md` : `grep -n "^## §" | tail -1` pour trouver le **dernier § réel** (gotcha connu : collisions de numérotation en sessions parallèles — re-vérifier au moment d'écrire), puis ajouter l'entrée suivante (§N = dernier + 1) :

```markdown
## §N — Hub personnel : refonte du panneau utilisateur (pastille sidebar) (2026-07-03)

- ProfileDrawer refondu en hub personnel (spec docs/superpowers/specs/2026-07-03-profile-drawer-personal-hub-design.md) :
  identité complète (nom/e-mail/org/rôle FR via resolveUserRoleLabel) + « Modifier mon profil » →
  ProfileEditModal ; « En ligne maintenant » (liveMembers, soi exclu) ; « Mes tâches » (list_crm_tasks
  filtré ownerId === userId, todo/in_progress, tri échéance, 4 max, badge retard, masqué si vide) ;
  « À modérer » conditionnel (même clé de cache que le badge sidebar §120) ; pied Mon équipe
  (/settings?section=team, gated canAdministerTeam), Paramètres, déconnexion. Réseau affiché
  SEULEMENT si dégradé/hors-ligne. Retirés : pills connected/N live/workspace + role·status bruts,
  lien trompeur « Espace equipe » → /crm.
- ProfileEditModal = SURFACE UNIQUE d'édition nom+photo (mécanique §149 déplacée de SettingsPage) ;
  Réglages → Mon compte → Profil devient affichage + bouton ouvrant la même modale (pas deux saves
  qui divergent).
- SQL additif : api.list_crm_tasks expose owner_id (uuid crm_task.owner) — filtre « mes tâches »
  par identité, jamais par nom affiché. In-place migration_crm_module.sql + live (MCP
  list_crm_tasks_owner_id) + assert test_crm_module.sql. CrmTask.ownerId côté front.
- /crm?tab=annuaire|taches|timeline : deep-link d'onglet qui PRIME sur le nav localStorage
  (lu via window.location au mount — pas de useSearchParams, évite la contrainte Suspense).
```

- [ ] **Step 3: Rapport final**

Récapituler au PO : ce qui a changé, les commits, l'état des vérifications (suite, tsc, sondes live, preview), et le reste-à-faire éventuel.

---

## Self-review (fait à la rédaction)

- **Couverture spec** : §3.1→Task 5 (+ Task 4 modale), §3.2→Task 5, §3.3→Tasks 1/2/5 (+ deep-link Task 3), §3.4→Task 5, §3.5→Task 5, §3.6→Task 5, §4→Task 4, §5.1→Task 1, §5.2→Task 2, §5.3→Task 3, §5.4→Task 5, §6/§7→intégrés aux composants, §8→tests des Tasks 1-5. Pas de gap.
- **Placeholders** : aucun (code complet dans chaque step).
- **Cohérence de types** : `selectMyOpenTasks(tasks, userId)` / `isTaskOverdue(task, now?)` identiques entre Task 5 code et tests ; `ProfileEditModal({ open, onOpenChange })` identique Tasks 4/5 ; `ownerId: string | null` identique Tasks 2/5.
