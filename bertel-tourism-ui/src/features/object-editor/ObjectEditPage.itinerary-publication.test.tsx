import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ObjectEditPage } from './ObjectEditPage';
import { cloneModules } from './editor-state';
import { stripCatalogOptions } from './io/object-io-serialize';
import { allowAll, fullModulesFixture } from './sections/section-fixture.test-utils';
import type { ObjectWorkspaceResource, WorkspaceModuleId } from '../../services/object-workspace';
import type { ObjectEditorState } from './useObjectEditorState';

const mockPublish = jest.fn();
const mockSaveModule = jest.fn();
const mockToastSuccess = jest.fn();
const mockInvalidate = jest.fn();
let mockResource: ObjectWorkspaceResource;

// Keep the real editor state, local draft recovery, validation and save planner.
// Only the network and surrounding presentation are replaced.
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../../hooks/useExplorerQueries', () => ({
  useObjectWorkspaceQuery: () => ({ data: mockResource, isError: false }),
  usePublishObjectWorkspaceMutation: () => ({ mutateAsync: mockPublish }),
  useSetObjectStatusMutation: () => ({}),
  useObjectVersionsQuery: () => ({ data: [] }),
  useRestoreObjectVersionMutation: () => ({}),
  saveWorkspaceModule: (...args: unknown[]) => mockSaveModule(...args),
  invalidateObjectWorkspaceCaches: (...args: unknown[]) => mockInvalidate(...args),
}));
jest.mock('../../services/write-compatibility', () => ({
  readWriteCompatibility: () => Promise.resolve({ compatible: true }),
}));
jest.mock('../../services/moderation', () => ({ submitPendingChange: jest.fn() }));
jest.mock('../../services/notification-delivery', () => ({ pingNotifyDrain: jest.fn() }));
jest.mock('../../store/ui-store', () => ({ useUiStore: () => jest.fn() }));
jest.mock('../../store/session-store', () => ({
  useSessionStore: Object.assign(
    (selector: (state: unknown) => unknown) => selector({ userId: 'publication-iti', langPrefs: ['fr'] }),
    { getState: () => ({ demoMode: false }), subscribe: () => () => {} },
  ),
}));
jest.mock('../../hooks/useToast', () => ({ useToast: () => ({ success: mockToastSuccess }) }));
jest.mock('./useUnsavedDraftGuard', () => ({ useUnsavedDraftGuard: () => ({ confirmLeave: () => true }) }));
jest.mock('./presence/useEditorPresence', () => ({
  useEditorPresence: () => ({ roster: [], peersBySection: {}, broadcastSaved: jest.fn() }),
}));
jest.mock('./sections/section-registry', () => ({
  MODE_ESSENTIAL: new Set(['06']),
  getRegisteredSections: () => [{ num: '06', Component: ({ editor }: { editor: ObjectEditorState }) => <>
    <output data-testid="stage-description">{editor.draft.itinerary.stages[0].description}</output>
    <output data-testid="object-status">{editor.draft.generalInfo.status}</output>
  </> }],
}));
jest.mock('./shell/EditorTopbar', () => ({ EditorTopbar: ({ onPublish }: { onPublish: () => void }) => <button onClick={onPublish}>Publier</button> }));
jest.mock('./shell/EditorNav', () => ({ EditorNav: () => null }));
jest.mock('./shell/EditorRail', () => ({ EditorRail: () => null }));
jest.mock('./widgets/VersionHistoryModal', () => ({ VersionHistoryModal: () => null }));
jest.mock('./widgets/ImportExportModal', () => ({ ImportExportModal: () => null }));
jest.mock('./widgets/PeerSavedBanner', () => ({ PeerSavedBanner: () => null }));

const nonApplicableModules: WorkspaceModuleId[] = ['rooms', 'meeting-rooms', 'menus', 'activity', 'event'];

beforeEach(() => {
  window.localStorage.clear();
  jest.clearAllMocks();
  mockPublish.mockResolvedValue(undefined);
  mockSaveModule.mockResolvedValue(undefined);
  const modules = fullModulesFixture();
  modules.generalInfo.status = 'draft';
  modules.publication.status = 'draft';
  for (const key of ['rooms', 'meetingRooms', 'menus', 'activity', 'event'] as const) {
    modules[key].unavailableReason = 'Module non applicable au type ITI (référentiel ref_facet_applicability).';
  }
  mockResource = {
    id: 'ITI1', name: 'Sentier test', type: 'ITI', detail: {} as ObjectWorkspaceResource['detail'],
    modules, permissions: allowAll, nonApplicableModules,
  };
});

function recoverAndRender() {
  const draft = cloneModules(mockResource.modules);
  draft.itinerary.stages[0].description = 'Étape retrouvée dans le brouillon';
  // An old hidden edit is preserved locally, but must not be written onto an ITI.
  draft.rooms.items[0].quantity = '99';
  window.localStorage.setItem('object-editor-draft:publication-iti:ITI1', JSON.stringify({
    schemaVersion: 1, objectId: 'ITI1', baseline: stripCatalogOptions(mockResource.modules), draft: stripCatalogOptions(draft),
  }));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><ObjectEditPage objectId="ITI1" /></QueryClientProvider>);
}

it('publishes a recovered itinerary after saving only its real edits, preserving hidden draft data', async () => {
  recoverAndRender();
  await waitFor(() => expect(screen.getByTestId('stage-description')).toHaveTextContent('Étape retrouvée dans le brouillon'));
  fireEvent.click(screen.getByRole('button', { name: 'Publier' }));
  await waitFor(() => expect(mockPublish).toHaveBeenCalledWith(true));
  expect(mockSaveModule).toHaveBeenCalledTimes(1);
  expect(mockSaveModule.mock.calls[0][1]).toMatchObject({ moduleId: 'itinerary', value: { stages: [expect.objectContaining({ description: 'Étape retrouvée dans le brouillon' })] } });
  expect(mockSaveModule.mock.invocationCallOrder[0]).toBeLessThan(mockPublish.mock.invocationCallOrder[0]);
  await waitFor(() => expect(screen.getByTestId('object-status')).toHaveTextContent('published'));
  expect(mockToastSuccess).toHaveBeenCalledWith('Fiche enregistrée et publiée');
  expect(screen.queryByText('Enregistrement incomplet')).not.toBeInTheDocument();
  const stored = JSON.parse(window.localStorage.getItem('object-editor-draft:publication-iti:ITI1')!);
  expect(stored.draft.rooms.items[0].quantity).toBe('99');
});

it('still blocks publication when the applicable itinerary could not be loaded completely', async () => {
  mockResource.modules.itinerary.unavailableReason = 'Les traductions des étapes ne sont pas complètement chargées.';
  recoverAndRender();
  fireEvent.click(screen.getByRole('button', { name: 'Publier' }));
  expect(await screen.findByText(/Les traductions des étapes ne sont pas complètement chargées\./)).toBeInTheDocument();
  expect(mockSaveModule).not.toHaveBeenCalled();
  expect(mockPublish).not.toHaveBeenCalled();
  expect(screen.getByTestId('stage-description')).toHaveTextContent('Étape retrouvée dans le brouillon');
});

it('keeps the recovered itinerary draft when its actual save fails and does not publish', async () => {
  mockSaveModule.mockRejectedValue(new Error('Sauvegarde du parcours impossible.'));
  recoverAndRender();
  fireEvent.click(screen.getByRole('button', { name: 'Publier' }));
  expect(await screen.findByText('Sauvegarde du parcours impossible.')).toBeInTheDocument();
  expect(mockPublish).not.toHaveBeenCalled();
  expect(screen.getByTestId('stage-description')).toHaveTextContent('Étape retrouvée dans le brouillon');
  expect(screen.getByTestId('object-status')).not.toHaveTextContent('published');
});
