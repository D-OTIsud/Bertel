import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ObjectEditPage } from './ObjectEditPage';
import type { ObjectEditorState } from './useObjectEditorState';
import { cloneModules } from './editor-state';
import { fullModulesFixture, allowAll } from './sections/section-fixture.test-utils';
import { useSessionStore } from '../../store/session-store';
import { getObjectResource } from '../../services/rpc';
import { getObjectVersions, restoreObjectVersion } from '../../services/object-versions';
import { getObjectWorkspaceResource, saveObjectWorkspaceGeneralInfo, type ObjectWorkspaceResource } from '../../services/object-workspace';

let mockEditor: ObjectEditorState;
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../../lib/supabase', () => ({ getApiClient: jest.fn(() => null), getSupabaseClient: jest.fn(() => null) }));
jest.mock('../../services/rpc', () => ({ ...jest.requireActual('../../services/rpc'), getObjectResource: jest.fn() }));
jest.mock('../../services/object-versions', () => ({
  ...jest.requireActual('../../services/object-versions'), getObjectVersions: jest.fn(), restoreObjectVersion: jest.fn(),
}));
jest.mock('../../services/object-workspace', () => ({
  ...jest.requireActual('../../services/object-workspace'), getObjectWorkspaceResource: jest.fn(), saveObjectWorkspaceGeneralInfo: jest.fn(),
}));
jest.mock('../../hooks/useReferenceCatalogsQuery', () => ({ ensureReferenceCatalogs: jest.fn(async () => ({})) }));
jest.mock('../../services/notification-delivery', () => ({ pingNotifyDrain: jest.fn() }));
jest.mock('../../services/write-compatibility', () => ({
  ...jest.requireActual('../../services/write-compatibility'),
  readWriteCompatibility: jest.fn(async () => ({ compatible: true, clientVersion: 2, minimumClientVersion: 2, serverWriteContractVersion: 2 })),
}));
jest.mock('../../hooks/useToast', () => ({ useToast: () => ({ success: jest.fn() }) }));
jest.mock('./useUnsavedDraftGuard', () => ({ useUnsavedDraftGuard: () => ({ confirmLeave: () => true }) }));
jest.mock('./presence/useEditorPresence', () => ({ useEditorPresence: () => ({
  roster: [], peersBySection: {}, savedNotice: null, broadcastSaved: jest.fn(), dismissSavedNotice: jest.fn(),
}) }));
jest.mock('./editor-completion', () => ({ computeSectionCompletions: () => [], computeOverallCompletion: () => ({ num: 0, den: 0, pct: 0 }) }));
jest.mock('./editor-validation', () => ({ validateForPublication: () => ({ blockers: [], warnings: [] }) }));
jest.mock('./section-config', () => ({ makeSections: () => [] }));
jest.mock('./sections/section-registry', () => ({ MODE_ESSENTIAL: new Set(), getRegisteredSections: () => [{
  num: '01', Component: ({ editor }: { editor: ObjectEditorState }) => {
    mockEditor = editor;
    return <>
      <input aria-label="Synthetic name" value={editor.draft.generalInfo.name} onChange={(event) => editor.patchModule('generalInfo', { name: event.target.value })} />
      <select aria-label="Synthetic visibility" value={editor.draft.generalInfo.commercialVisibility} onChange={(event) => editor.patchModule('generalInfo', { commercialVisibility: event.target.value })}>
        <option value="active">Active</option><option value="lapsed">Paused</option>
      </select>
    </>;
  },
}] }));
jest.mock('./shell/EditorNav', () => ({ EditorNav: ({ onToolSelect }: { onToolSelect: (key: string) => void }) =>
  <button onClick={() => onToolSelect('versions')}>Versions</button> }));
jest.mock('./shell/EditorRail', () => ({ EditorRail: () => null }));
jest.mock('./widgets/BlockersModal', () => ({ BlockersModal: () => null }));
jest.mock('./widgets/ImportExportModal', () => ({ ImportExportModal: () => null }));
jest.mock('./widgets/PeerSavedBanner', () => ({ PeerSavedBanner: () => null }));

const ID = 'HOT-RESTORE-PAGE';
const USER = 'restore-page-synthetic-user';
const clients: QueryClient[] = [];

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function mount() {
  const modules = fullModulesFixture();
  modules.generalInfo.name = 'A';
  modules.generalInfo.status = 'draft';
  const server = cloneModules(modules);
  const resource = (id = ID): ObjectWorkspaceResource => ({
    id, name: server.generalInfo.name, type: 'HOT', detail: {} as ObjectWorkspaceResource['detail'],
    modules: cloneModules(server), permissions: allowAll,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const initial = resource();
  client.setQueryData(['object-detail', ID, ['fr']], initial);
  client.setQueryData(['object-workspace', ID, ['fr']], initial);
  jest.mocked(getObjectResource).mockImplementation(async (id) => resource(id) as never);
  jest.mocked(getObjectWorkspaceResource).mockImplementation(async (_id, _langs, _catalogs, detail) => detail as unknown as ObjectWorkspaceResource);
  jest.mocked(getObjectVersions).mockResolvedValue([
    { versionNumber: 3, createdAt: '', createdByName: '', changeType: 'update', changeReason: '', changedFields: [] },
    { versionNumber: 2, createdAt: '', createdByName: '', changeType: 'update', changeReason: '', changedFields: [] },
  ]);
  jest.mocked(restoreObjectVersion).mockImplementation(async () => { server.generalInfo.name = 'B'; });
  jest.mocked(saveObjectWorkspaceGeneralInfo).mockImplementation(async (_id, input) => { server.generalInfo = { ...input }; });
  const page = (id = ID) => <QueryClientProvider client={client}><ObjectEditPage objectId={id} /></QueryClientProvider>;
  return { ...render(page()), client, server, resource, page };
}

async function startRestore() {
  fireEvent.click(screen.getByRole('button', { name: 'Versions' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Restaurer la version 2' }));
  await waitFor(() => expect(restoreObjectVersion).toHaveBeenCalledTimes(1));
}

function closeHistory() { fireEvent.click(screen.getByRole('button', { name: 'Fermer' })); }
function saveButton() { return screen.getByRole('button', { name: 'Enregistrer' }); }

beforeEach(() => {
  window.localStorage.clear();
  jest.clearAllMocks();
  useSessionStore.setState({ demoMode: false, userId: USER, langPrefs: ['fr'] });
});
afterEach(() => {
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
  for (const client of clients.splice(0)) client.clear();
});

it('the real page restores B, observes B, then a visibility save sends B rather than the pre-restore A', async () => {
  const view = mount();
  await startRestore();
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByLabelText('Synthetic name')).toHaveValue('B');
  expect(mockEditor.baseline.generalInfo.name).toBe('B');
  fireEvent.change(screen.getByLabelText('Synthetic visibility'), { target: { value: 'lapsed' } });
  fireEvent.click(saveButton());
  await waitFor(() => expect(saveObjectWorkspaceGeneralInfo).toHaveBeenCalledWith(ID, expect.objectContaining({ name: 'B', commercialVisibility: 'lapsed' })));
  await waitFor(() => expect(mockEditor.isDirty).toBe(false));
  expect(view.server.generalInfo.name).toBe('B');
});

it.each(['Garder mes modifications', 'Utiliser les valeurs du serveur'])('C stays editable during RPC/reread, and %s resolves the retained conflict before an explicit save', async (choice) => {
  const view = mount();
  const rpc = deferred();
  const read = deferred<ObjectWorkspaceResource>();
  jest.mocked(restoreObjectVersion).mockImplementation(async () => { await rpc.promise; view.server.generalInfo.name = 'B'; });
  jest.mocked(getObjectWorkspaceResource).mockReturnValueOnce(read.promise);
  await startRestore();
  expect(screen.getByRole('button', { name: 'Restaurer la version 3' })).toBeDisabled();
  closeHistory();
  expect(saveButton()).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Publier' })).toBeDisabled();
  expect(screen.getByLabelText('Synthetic name')).toBeEnabled();
  fireEvent.change(screen.getByLabelText('Synthetic name'), { target: { value: 'C' } });
  await act(async () => { rpc.resolve(); });
  await waitFor(() => expect(getObjectWorkspaceResource).toHaveBeenCalledTimes(1));
  expect(saveButton()).toBeDisabled();
  expect(mockEditor.baseline.generalInfo.name).toBe('A');
  expect(screen.getByLabelText('Synthetic name')).toHaveValue('C');
  await act(async () => { read.resolve(view.resource()); });
  await screen.findByRole('button', { name: choice });
  expect(mockEditor.baseline.generalInfo.name).toBe('B');
  expect(mockEditor.draft.generalInfo.name).toBe('C');
  expect(mockEditor.recoveryConflicts).toContain('generalInfo.name');
  expect(saveObjectWorkspaceGeneralInfo).not.toHaveBeenCalled();
  // A reload preserves the mandatory choice and the local C.
  view.unmount();
  render(view.page());
  await screen.findByRole('button', { name: choice });
  expect(mockEditor.recoveryConflicts).toContain('generalInfo.name');
  fireEvent.click(screen.getByRole('button', { name: choice }));
  expect(mockEditor.recoveryConflicts).toEqual([]);
  expect(mockEditor.draft.generalInfo.name).toBe(choice === 'Garder mes modifications' ? 'C' : 'B');
  expect(saveObjectWorkspaceGeneralInfo).not.toHaveBeenCalled();
  if (choice === 'Garder mes modifications') {
    fireEvent.click(saveButton());
    await waitFor(() => expect(saveObjectWorkspaceGeneralInfo).toHaveBeenCalledWith(ID, expect.objectContaining({ name: 'C' })));
  } else {
    expect(mockEditor.isDirty).toBe(false);
    fireEvent.change(screen.getByLabelText('Synthetic visibility'), { target: { value: 'lapsed' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(saveObjectWorkspaceGeneralInfo).toHaveBeenCalledWith(ID, expect.objectContaining({ name: 'B', commercialVisibility: 'lapsed' })));
  }
});

it('cache B alone cannot release Save while the page still observes prop A', async () => {
  const view = mount();
  const rpc = deferred();
  jest.mocked(restoreObjectVersion).mockImplementation(async () => { await rpc.promise; view.server.generalInfo.name = 'B'; });
  await startRestore();
  closeHistory();
  const notifications: Array<() => void> = [];
  notifyManager.setScheduler((callback) => { notifications.push(callback); });
  await act(async () => { rpc.resolve(); });
  await waitFor(() => expect(view.client.getQueryData<ObjectWorkspaceResource>(['object-workspace', ID, ['fr']])?.name).toBe('B'));
  expect(mockEditor.baseline.generalInfo.name).toBe('A');
  expect(saveButton()).toBeDisabled();
  await act(async () => { while (notifications.length) notifications.shift()!(); });
  await waitFor(() => expect(mockEditor.baseline.generalInfo.name).toBe('B'));
  expect(mockEditor.isDirty).toBe(false);
});

it('a failed authoritative read keeps restoration pending, and Retry adopts B without resubmitting the restore RPC', async () => {
  const view = mount();
  jest.mocked(getObjectResource).mockRejectedValueOnce(new Error('Synthetic reread unavailable'));
  await startRestore();
  closeHistory();
  await screen.findByText('Synthetic reread unavailable');
  expect(saveButton()).toBeDisabled();
  expect(mockEditor.baseline.generalInfo.name).toBe('A');
  expect(screen.getByLabelText('Synthetic name').closest('[inert]')).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
  await waitFor(() => expect(mockEditor.baseline.generalInfo.name).toBe('B'));
  expect(screen.getByLabelText('Synthetic name').closest('[inert]')).toBeNull();
  expect(restoreObjectVersion).toHaveBeenCalledTimes(1);
  expect(view.server.generalInfo.name).toBe('B');
});

it('a rejected restore leaves C dirty and releases the existing actions', async () => {
  mount();
  const rpc = deferred();
  jest.mocked(restoreObjectVersion).mockReturnValueOnce(rpc.promise);
  await startRestore();
  closeHistory();
  fireEvent.change(screen.getByLabelText('Synthetic name'), { target: { value: 'C' } });
  await act(async () => { rpc.reject(new Error('Synthetic restore denied')); });
  await waitFor(() => expect(saveButton()).toBeEnabled());
  expect(mockEditor.draft.generalInfo.name).toBe('C');
  expect(mockEditor.baseline.generalInfo.name).toBe('A');
  expect(mockEditor.isDirty).toBe(true);
});

it.each(['account', 'object'])('a restore response from the previous %s cannot adopt or acknowledge the new editor draft', async (transition) => {
  const view = mount();
  const rpc = deferred();
  jest.mocked(restoreObjectVersion).mockImplementation(async () => { await rpc.promise; view.server.generalInfo.name = 'B'; });
  await startRestore();
  closeHistory();
  if (transition === 'account') act(() => useSessionStore.setState({ userId: 'restore-page-other-user' }));
  else {
    const next = view.resource('HOT-RESTORE-OTHER');
    view.client.setQueryData(['object-workspace', next.id, ['fr']], next);
    view.rerender(view.page(next.id));
  }
  fireEvent.change(screen.getByLabelText('Synthetic name'), { target: { value: 'New identity draft' } });
  await act(async () => { rpc.resolve(); });
  await waitFor(() => {
    const previous = view.client.getQueryState<ObjectWorkspaceResource>(['object-workspace', ID, ['fr']]);
    if (transition === 'account') expect(previous?.data?.name).toBe('B');
    else expect(previous?.isInvalidated).toBe(true);
  });
  expect(mockEditor.draft.generalInfo.name).toBe('New identity draft');
  expect(mockEditor.baseline.generalInfo.name).toBe('A');
  expect(mockEditor.recoveryConflicts).toEqual([]);
  expect(saveObjectWorkspaceGeneralInfo).not.toHaveBeenCalled();
});
