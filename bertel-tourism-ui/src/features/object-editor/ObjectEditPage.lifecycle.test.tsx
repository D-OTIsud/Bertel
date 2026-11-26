import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ObjectEditPage } from './ObjectEditPage';
import { fullModulesFixture, allowAll } from './sections/section-fixture.test-utils';
import type { ObjectWorkspaceResource } from '../../services/object-workspace';

let mockResource: ObjectWorkspaceResource;
const mockSetStatus = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../../hooks/useExplorerQueries', () => ({
  useObjectWorkspaceQuery: () => ({ data: mockResource, isError: false, isFetching: false }),
  usePublishObjectWorkspaceMutation: () => ({}),
  useSetObjectStatusMutation: () => ({ mutateAsync: mockSetStatus, isPending: false }),
  useObjectVersionsQuery: () => ({ data: [] }),
  useRestoreObjectVersionMutation: () => ({}),
}));
jest.mock('../../store/ui-store', () => ({ useUiStore: () => jest.fn() }));
jest.mock('../../store/session-store', () => ({
  useSessionStore: Object.assign(
    (selector: (state: { langPrefs: string[]; userId: null }) => unknown) => selector({ langPrefs: ['fr'], userId: null }),
    { getState: () => ({ langPrefs: ['fr'], userId: null }), subscribe: () => () => {} },
  ),
}));
jest.mock('../../hooks/useToast', () => ({ useToast: () => ({ success: jest.fn() }) }));
jest.mock('./useUnsavedDraftGuard', () => ({ useUnsavedDraftGuard: () => ({ confirmLeave: () => true }) }));
jest.mock('./useEditorSave', () => ({ useEditorSave: () => ({ save: jest.fn(), saving: false }) }));
jest.mock('./presence/useEditorPresence', () => ({ useEditorPresence: () => ({ roster: [], peersBySection: {} }) }));
jest.mock('./editor-completion', () => ({ computeSectionCompletions: () => [], computeOverallCompletion: () => ({}) }));
jest.mock('./editor-validation', () => ({ validateForPublication: () => ({ blockers: [], warnings: [] }) }));
jest.mock('./section-config', () => ({ makeSections: () => [] }));
jest.mock('./sections/section-registry', () => ({ MODE_ESSENTIAL: new Set(), getRegisteredSections: () => [] }));
jest.mock('./shell/EditorTopbar', () => ({ EditorTopbar: () => null }));
jest.mock('./shell/EditorNav', () => ({ EditorNav: ({ onToolSelect }: { onToolSelect: (key: string) => void }) =>
  <button type="button" onClick={() => onToolSelect('archive')}>Outil archiver/restaurer</button> }));
jest.mock('./shell/EditorRail', () => ({ EditorRail: () => null }));
jest.mock('./widgets/BlockersModal', () => ({ BlockersModal: () => null }));
jest.mock('./widgets/VersionHistoryModal', () => ({ VersionHistoryModal: () => null }));
jest.mock('./widgets/ImportExportModal', () => ({ ImportExportModal: () => null }));
jest.mock('./widgets/PeerSavedBanner', () => ({ PeerSavedBanner: () => null }));

function mount(status = 'draft', publishedAt = '') {
  const modules = fullModulesFixture();
  modules.generalInfo.status = status;
  modules.generalInfo.publishedAt = publishedAt;
  modules.publication.status = status;
  modules.publication.publishedAt = publishedAt;
  mockResource = { id: 'HOT-LIFECYCLE', name: 'Fiche témoin', type: 'HOT',
    detail: {} as ObjectWorkspaceResource['detail'], modules, permissions: allowAll };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><ObjectEditPage objectId="HOT-LIFECYCLE" /></QueryClientProvider>);
}

function openConfirmation() {
  fireEvent.click(screen.getByRole('button', { name: 'Outil archiver/restaurer' }));
  return screen.getByRole('dialog');
}

beforeEach(() => {
  window.localStorage.clear();
  mockSetStatus.mockReset().mockResolvedValue('archived');
});

it('requires a trimmed multiline reason for archiving through the editor tool', async () => {
  mount();
  const dialog = openConfirmation();
  const field = within(dialog).getByRole('textbox', { name: /Motif de l’archivage/ });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Archiver' }));
  expect(mockSetStatus).not.toHaveBeenCalled();
  expect(field).toHaveFocus();
  fireEvent.change(field, { target: { value: '  Fermeture définitive\nInformation confirmée.  ' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Archiver' }));
  await waitFor(() => expect(mockSetStatus).toHaveBeenCalledWith({
    status: 'archived', reason: 'Fermeture définitive\nInformation confirmée.',
  }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

it('preserves the reason and displays a backend error in the dialog, then allows retry', async () => {
  mockSetStatus.mockRejectedValueOnce(new Error('Archivage temporairement indisponible.'));
  mount();
  const dialog = openConfirmation();
  const field = within(dialog).getByRole('textbox', { name: /Motif de l’archivage/ });
  fireEvent.change(field, { target: { value: 'Fin d’activité' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Archiver' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Archivage temporairement indisponible.');
  expect(field).toHaveValue('Fin d’activité');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Archiver' }));
  await waitFor(() => expect(mockSetStatus).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

it('resets an abandoned justification when the archive dialog opens again', () => {
  mount();
  const dialog = openConfirmation();
  fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Motif abandonné' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }));
  openConfirmation();
  expect(screen.getByRole('textbox', { name: /Motif de l’archivage/ })).toHaveValue('');
  expect(screen.queryByText(/Un motif est obligatoire/)).not.toBeInTheDocument();
});

it('prevents a second archive and preserves the dialog while saving', async () => {
  let finish!: () => void;
  mockSetStatus.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  mount();
  const dialog = openConfirmation();
  fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Fermeture' } });
  const confirm = within(dialog).getByRole('button', { name: 'Archiver' });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(mockSetStatus).toHaveBeenCalledTimes(1);
  expect(within(dialog).getByRole('textbox')).toBeDisabled();
  expect(dialog).toBeInTheDocument();
  await act(async () => { finish(); });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

it('restores an archived fiche without requiring a justification', async () => {
  mount('archived', '2026-11-01T08:00:00Z');
  const dialog = openConfirmation();
  expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Restaurer' }));
  await waitFor(() => expect(mockSetStatus).toHaveBeenCalledWith('hidden'));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
