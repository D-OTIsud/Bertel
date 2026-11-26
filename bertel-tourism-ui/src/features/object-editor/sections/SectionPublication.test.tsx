import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionPublication } from './SectionPublication';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';
import { useSetObjectStatusMutation } from '../../../hooks/useExplorerQueries';
import { useObjectLifecycleDetailsQuery } from '../../../hooks/useObjectLifecycleDetailsQuery';
import type { ObjectWorkspacePermissions } from '../../../services/object-workspace';

// §21 fires a lifecycle mutation on confirm — mock the hook so tests assert the
// confirm flow (open → confirm → mutate) without touching the network.
jest.mock('../../../hooks/useExplorerQueries', () => ({
  useSetObjectStatusMutation: jest.fn(),
}));
jest.mock('../../../hooks/useObjectLifecycleDetailsQuery', () => ({ useObjectLifecycleDetailsQuery: jest.fn() }));

// §108 — the hard-delete button loads a session token + the modal posts to the delete route.
// Mock both so §21 visibility tests never touch the network.
jest.mock('../../../lib/supabase', () => ({ getApiClient: () => null }));
jest.mock('../../../services/object-delete', () => ({ requestObjectDeletion: jest.fn() }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const mutateAsync = jest.fn().mockResolvedValue(undefined);
beforeEach(() => {
  mutateAsync.mockClear();
  (useSetObjectStatusMutation as jest.Mock).mockReturnValue({ mutateAsync, isPending: false });
  (useObjectLifecycleDetailsQuery as jest.Mock).mockReturnValue({ data: null, isPending: false, isError: false });
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

  it('shows archive author, local date and multiline reason even in read-only mode', () => {
    (useObjectLifecycleDetailsQuery as jest.Mock).mockReturnValue({
      data: { createdByName: 'Marie Dupont', createdAt: '2026-11-26T10:30:00Z', changeReason: 'Fermeture temporaire.\nRéouverture en janvier.' },
      isPending: false, isError: false,
    });
    const { result } = renderHook(() => useObjectEditorState('o1', archivedModulesFixture()));
    renderSection(<SectionPublication editor={result.current} permissions={denyPublication} objectId="o1" />);

    expect(screen.getByText(/Archivée par Marie Dupont/)).toHaveTextContent('le 26/11/2026 à 14:30');
    expect(screen.getByText('26/11/2026 à 14:30')).toHaveAttribute('datetime', '2026-11-26T10:30:00Z');
    expect(screen.getByText(/Fermeture temporaire/).textContent).toContain('Fermeture temporaire.\nRéouverture en janvier.');
    expect(useObjectLifecycleDetailsQuery).toHaveBeenCalledWith('o1', 'archived');
  });

  it('shows offline transition details without mistaking a restoration for unpublication', () => {
    (useObjectLifecycleDetailsQuery as jest.Mock).mockReturnValue({
      data: { createdByName: 'Paul Martin', createdAt: '2026-11-26T10:30:00Z', changeReason: 'Informations à vérifier.' },
      isPending: false, isError: false,
    });
    const modules = fullModulesFixture();
    modules.generalInfo.status = 'hidden';
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    renderSection(<SectionPublication editor={result.current} permissions={allowAll} objectId="o1" />);

    expect(screen.getByText(/Statut modifié par Paul Martin/)).toBeInTheDocument();
    expect(screen.getByText(/Informations à vérifier/)).toBeInTheDocument();
    expect(useObjectLifecycleDetailsQuery).toHaveBeenCalledWith('o1', 'hidden');
  });

  it('shows an explicit fallback for older archives without a recorded author', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', archivedModulesFixture()));
    renderSection(<SectionPublication editor={result.current} permissions={allowAll} objectId="o1" />);
    expect(screen.getByText('Auteur non renseigné')).toBeInTheDocument();
    expect(screen.queryByText('Motif :')).not.toBeInTheDocument();
  });

  it('does not show an unknown author while archive information is loading', () => {
    (useObjectLifecycleDetailsQuery as jest.Mock).mockReturnValue({ data: undefined, isPending: true, isError: false });
    const { result } = renderHook(() => useObjectEditorState('o1', archivedModulesFixture()));
    renderSection(<SectionPublication editor={result.current} permissions={allowAll} objectId="o1" />);
    expect(screen.queryByText('Auteur non renseigné')).not.toBeInTheDocument();
  });

  it('reports unavailable history separately from an unrecorded author', () => {
    (useObjectLifecycleDetailsQuery as jest.Mock).mockReturnValue({ data: undefined, isPending: false, isError: true });
    const { result } = renderHook(() => useObjectEditorState('o1', archivedModulesFixture()));
    renderSection(<SectionPublication editor={result.current} permissions={allowAll} objectId="o1" />);
    expect(screen.getByText('Informations de changement de statut indisponibles.')).toBeInTheDocument();
    expect(screen.queryByText('Auteur non renseigné')).not.toBeInTheDocument();
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
    fireEvent.change(within(dialog).getByRole('textbox', { name: /Motif de la dépublication/ }), { target: { value: ' Informations à vérifier. ' } });
    // The confirm resolves the (mocked) mutation in a microtask and then calls
    // setSavedStatus — wrap it so that state update flushes inside act().
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Dépublier' }));
    });

    expect(mutateAsync).toHaveBeenCalledWith({ status: 'hidden', reason: 'Informations à vérifier.' });
    await waitFor(() => expect(result.current.draft.generalInfo.status).toBe('hidden'));
  });

  it('requires a non-whitespace archive reason before sending the status change', async () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    renderSection(<SectionPublication editor={result.current} permissions={allowAll} objectId="o1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Archiver' }));
    const dialog = screen.getByRole('dialog');
    const reason = within(dialog).getByRole('textbox', { name: /Motif de l’archivage/ });
    fireEvent.change(reason, { target: { value: ' \n\t ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Archiver' }));
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(reason).toHaveFocus();

    fireEvent.change(reason, { target: { value: ' En pause.\nRecontacter en janvier. ' } });
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Archiver' })); });
    expect(mutateAsync).toHaveBeenCalledWith({ status: 'archived', reason: 'En pause.\nRecontacter en janvier.' });
  });

  it('keeps the reason and dialog open when the status change fails', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('Connexion interrompue.'));
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    renderSection(<SectionPublication editor={result.current} permissions={allowAll} objectId="o1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Archiver' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox', { name: /Motif de l’archivage/ }), { target: { value: 'Fermeture temporaire.' } });
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Archiver' })); });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Connexion interrompue.');
    expect(screen.getByRole('textbox', { name: /Motif de l’archivage/ })).toHaveValue('Fermeture temporaire.');
  });

  it('restores an archived fiche without requesting a reason', async () => {
    const { result } = renderHook(() => useObjectEditorState('o1', archivedModulesFixture()));
    renderSection(<SectionPublication editor={result.current} permissions={allowAll} objectId="o1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Restaurer' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Restaurer' })); });
    expect(mutateAsync).toHaveBeenCalledWith('hidden');
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
