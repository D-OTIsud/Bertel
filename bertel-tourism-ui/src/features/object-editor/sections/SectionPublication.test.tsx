import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionPublication } from './SectionPublication';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';
import { useSetObjectStatusMutation } from '../../../hooks/useExplorerQueries';
import type { ObjectWorkspacePermissions } from '../../../services/object-workspace';

// §21 fires a lifecycle mutation on confirm — mock the hook so tests assert the
// confirm flow (open → confirm → mutate) without touching the network.
jest.mock('../../../hooks/useExplorerQueries', () => ({
  useSetObjectStatusMutation: jest.fn(),
}));

// §108 — the hard-delete button loads a session token + the modal posts to the delete route.
// Mock both so §21 visibility tests never touch the network.
jest.mock('../../../lib/supabase', () => ({ getApiClient: () => null }));
jest.mock('../../../services/object-delete', () => ({ requestObjectDeletion: jest.fn() }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const mutateAsync = jest.fn().mockResolvedValue(undefined);
beforeEach(() => {
  mutateAsync.mockClear();
  (useSetObjectStatusMutation as jest.Mock).mockReturnValue({ mutateAsync, isPending: false });
});

/** Like `allowAll` but the `publication` module is read-only (no publish_object). */
const denyPublication = new Proxy(
  {},
  {
    get: (_t, prop) =>
      prop === 'publication'
        ? { canDirectWrite: false, canPrepareProposal: false, canSubmitProposal: false, disabledReason: 'Lecture seule — publication.' }
        : { canDirectWrite: true, canPrepareProposal: true, canSubmitProposal: true, disabledReason: null },
  },
) as ObjectWorkspacePermissions;

/** Like `allowAll` but the `delete` capability is denied (non-superuser). */
const denyDelete = new Proxy(
  {},
  {
    get: (_t, prop) =>
      prop === 'delete'
        ? { canDirectWrite: false, canPrepareProposal: false, canSubmitProposal: false, disabledReason: 'Réservé aux administrateurs plateforme.' }
        : { canDirectWrite: true, canPrepareProposal: true, canSubmitProposal: true, disabledReason: null },
  },
) as ObjectWorkspacePermissions;

/** A fixture whose lifecycle status is `archived` (the only state where hard-delete is offered). */
function archivedModulesFixture() {
  const modules = fullModulesFixture();
  return { ...modules, generalInfo: { ...modules.generalInfo, status: 'archived' } };
}

/** §21 mounts a mutation hook, so it must render inside a QueryClientProvider. */
function renderSection(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('SectionPublication (§21)', () => {
  it('shows the status as a read-only chip — not an editable select', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    renderSection(<SectionPublication editor={result.current} permissions={allowAll} objectId="o1" />);

    // The status courant value is rendered as a static chip (also echoed in the résumé)…
    expect(screen.getAllByText('Publié — en ligne').length).toBeGreaterThan(0);
    // …and the only <select> left in the section is the commercial visibility one
    // (the editable status <select> with its 4 status options is gone).
    expect(screen.queryByRole('option', { name: 'Brouillon' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Hors ligne' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Archivé' })).not.toBeInTheDocument();
  });

  it('keeps commercial_visibility editable', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const { rerender } = renderSection(
      <SectionPublication editor={result.current} permissions={allowAll} objectId="o1" />,
    );

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'private' } });
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <SectionPublication editor={result.current} permissions={allowAll} objectId="o1" />
      </QueryClientProvider>,
    );
    expect(result.current.draft.generalInfo.commercialVisibility).toBe('private');
    // commercial_visibility persists via the publication module dirty path
    // (see editor-state.isPublicationSettingsDirty).
    expect(result.current.dirtySections.publication).toBe(true);
  });

  it('renders lifecycle action buttons when publication.canDirectWrite is true', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    renderSection(<SectionPublication editor={result.current} permissions={allowAll} objectId="o1" />);

    // Fixture status is "published" → Dépublier + Archiver are the valid actions.
    expect(screen.getByRole('button', { name: 'Dépublier' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archiver' })).toBeInTheDocument();
  });

  it('hides the lifecycle buttons and shows a read-only note when canDirectWrite is false', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    renderSection(<SectionPublication editor={result.current} permissions={denyPublication} objectId="o1" />);

    expect(screen.queryByRole('button', { name: 'Dépublier' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archiver' })).not.toBeInTheDocument();
    expect(screen.getByText('Lecture seule — publication.')).toBeInTheDocument();
  });

  it('does not render the removed inert controls (adhésion select / motif hors ligne / workflow toggles)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    renderSection(<SectionPublication editor={result.current} permissions={allowAll} objectId="o1" />);

    expect(screen.queryByText("Aire d'adhésion")).not.toBeInTheDocument();
    expect(screen.queryByText('Motif hors ligne')).not.toBeInTheDocument();
    expect(screen.queryByText('Demande de validation')).not.toBeInTheDocument();
    expect(screen.queryByText('Publication différée')).not.toBeInTheDocument();
  });

  it('opens a confirmation dialog instead of changing the status immediately', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    renderSection(<SectionPublication editor={result.current} permissions={allowAll} objectId="o1" />);

    expect(screen.queryByText('Archiver la fiche ?')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Archiver' }));

    // The action is staged behind an explicit confirmation, not run.
    expect(screen.getByText('Archiver la fiche ?')).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('cancelling the confirmation closes it and leaves the status unchanged', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    renderSection(<SectionPublication editor={result.current} permissions={allowAll} objectId="o1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Dépublier' }));
    expect(screen.getByText('Dépublier la fiche ?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(screen.queryByText('Dépublier la fiche ?')).not.toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('confirming the dialog runs the lifecycle change for the chosen target', async () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    renderSection(<SectionPublication editor={result.current} permissions={allowAll} objectId="o1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Dépublier' }));
    const dialog = screen.getByRole('dialog');
    // The confirm resolves the (mocked) mutation in a microtask and then calls
    // setSavedStatus — wrap it so that state update flushes inside act().
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Dépublier' }));
    });

    expect(mutateAsync).toHaveBeenCalledWith('hidden');
    await waitFor(() => expect(result.current.draft.generalInfo.status).toBe('hidden'));
  });

  it('offers "Supprimer définitivement" next to Restaurer for a superuser on an archived fiche', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', archivedModulesFixture()));
    renderSection(<SectionPublication editor={result.current} permissions={allowAll} objectId="o1" />);

    expect(screen.getByRole('button', { name: 'Restaurer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Supprimer définitivement/ })).toBeInTheDocument();
  });

  it('does not offer hard-delete unless the fiche is archived', () => {
    // fullModulesFixture is "published" → no delete button even for a superuser.
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    renderSection(<SectionPublication editor={result.current} permissions={allowAll} objectId="o1" />);

    expect(screen.queryByRole('button', { name: /Supprimer définitivement/ })).not.toBeInTheDocument();
  });

  it('hides hard-delete from a non-superuser even on an archived fiche', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', archivedModulesFixture()));
    renderSection(<SectionPublication editor={result.current} permissions={denyDelete} objectId="o1" />);

    expect(screen.getByRole('button', { name: 'Restaurer' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Supprimer définitivement/ })).not.toBeInTheDocument();
  });

  it('opens the type-the-name confirmation modal when hard-delete is clicked', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', archivedModulesFixture()));
    renderSection(<SectionPublication editor={result.current} permissions={allowAll} objectId="o1" />);

    expect(screen.queryByText('Supprimer définitivement la fiche')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Supprimer définitivement/ }));
    expect(screen.getByText('Supprimer définitivement la fiche')).toBeInTheDocument();
  });
});
