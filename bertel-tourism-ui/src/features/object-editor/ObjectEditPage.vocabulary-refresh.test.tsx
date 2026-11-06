import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ObjectEditPage } from './ObjectEditPage';
import type { ObjectEditorState } from './useObjectEditorState';
import { cloneModules } from './editor-state';
import { fullModulesFixture, allowAll } from './sections/section-fixture.test-utils';
import { useSessionStore } from '../../store/session-store';
import { fetchThesaurusGeneration } from '../../services/thesaurus-generation';
import { ensureReferenceCatalogs } from '../../hooks/useReferenceCatalogsQuery';
import { getObjectResource } from '../../services/rpc';
import { getObjectWorkspaceResource, saveObjectWorkspaceGeneralInfo, type ObjectWorkspaceResource } from '../../services/object-workspace';
import { downloadTextFile } from './io/object-io-effects';

let mockEditor: ObjectEditorState;
let mockGeneration = '1';
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../../lib/supabase', () => ({ getApiClient: jest.fn(() => null), getSupabaseClient: jest.fn(() => null) }));
jest.mock('../../services/thesaurus-generation', () => ({
  ...jest.requireActual('../../services/thesaurus-generation'), fetchThesaurusGeneration: jest.fn(),
}));
jest.mock('../../services/rpc', () => ({ ...jest.requireActual('../../services/rpc'), getObjectResource: jest.fn() }));
jest.mock('../../services/object-versions', () => ({
  ...jest.requireActual('../../services/object-versions'), getObjectVersions: jest.fn(async () => []),
}));
jest.mock('../../services/object-workspace', () => ({
  ...jest.requireActual('../../services/object-workspace'), getObjectWorkspaceResource: jest.fn(), saveObjectWorkspaceGeneralInfo: jest.fn(),
}));
jest.mock('../../hooks/useReferenceCatalogsQuery', () => ({ ensureReferenceCatalogs: jest.fn() }));
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
jest.mock('./sections/section-registry', () => {
  function SyntheticSection({ editor }: { editor: ObjectEditorState }) {
    mockEditor = editor;
    return <>
      <input aria-label="Synthetic name" value={editor.draft.generalInfo.name}
        onChange={(event) => editor.patchModule('generalInfo', { name: event.target.value })} />
      <select aria-label="Synthetic payment" value={editor.draft.characteristics.selectedPaymentCodes[0] ?? ''}
        onChange={(event) => editor.patchModule('characteristics', { selectedPaymentCodes: [event.target.value] })}>
        {editor.draft.characteristics.paymentOptions.map((option) => <option key={option.id} value={option.code}>{option.label}</option>)}
      </select>
    </>;
  }
  return { MODE_ESSENTIAL: new Set(), getRegisteredSections: () => [{ num: '01', Component: SyntheticSection }] };
});
jest.mock('./shell/EditorNav', () => ({ EditorNav: () => null }));
jest.mock('./shell/EditorRail', () => ({ EditorRail: () => null }));
jest.mock('./widgets/BlockersModal', () => ({ BlockersModal: () => null }));
jest.mock('./widgets/ImportExportModal', () => ({ ImportExportModal: () => null }));
jest.mock('./widgets/PeerSavedBanner', () => ({ PeerSavedBanner: () => null }));
jest.mock('./io/object-io-effects', () => ({
  ...jest.requireActual('./io/object-io-effects'), downloadTextFile: jest.fn(),
}));

const ID = 'HOT-VOCABULARY-REFRESH';
const clients: QueryClient[] = [];
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}

function mount() {
  const modules = fullModulesFixture();
  modules.generalInfo.name = 'A';
  modules.generalInfo.status = 'draft';
  const server = cloneModules(modules);
  const resource = (): ObjectWorkspaceResource => ({
    id: ID, name: server.generalInfo.name, type: 'HOT',
    // A vocabulary publication does not create a new canonical object version.
    detail: { current_version: 7 } as unknown as ObjectWorkspaceResource['detail'],
    modules: cloneModules(server), permissions: allowAll,
  });
  const initialGeneration = deferred<string | null>();
  jest.mocked(fetchThesaurusGeneration).mockReturnValueOnce(initialGeneration.promise);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  client.setQueryData(['object-detail', ID, ['fr'], '1'], resource());
  client.setQueryData(['object-workspace', ID, ['fr'], '1'], resource());
  jest.mocked(getObjectResource).mockImplementation(async () => resource() as never);
  jest.mocked(getObjectWorkspaceResource).mockImplementation(async (_id, _langs, _catalogs, detail) => detail as unknown as ObjectWorkspaceResource);
  jest.mocked(saveObjectWorkspaceGeneralInfo).mockImplementation(async (_id, input) => { server.generalInfo = { ...input }; });
  render(<QueryClientProvider client={client}><ObjectEditPage objectId={ID} /></QueryClientProvider>);
  return { client, server, resource, initialGeneration };
}

beforeEach(() => {
  window.localStorage.clear();
  jest.clearAllMocks();
  mockGeneration = '1';
  jest.mocked(fetchThesaurusGeneration).mockReset().mockImplementation(async () => mockGeneration);
  jest.mocked(ensureReferenceCatalogs).mockImplementation(async () => ({
    refCodeByDomain: {}, tables: {}, vocabularyRelease: mockGeneration,
  }) as never);
  useSessionStore.setState({ demoMode: false, userId: 'vocabulary-editor-user', langPrefs: ['fr'] });
});
afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
  jest.restoreAllMocks();
});

it.each([false, true])('retains unsaved C across vocabulary 1→2, reloads the same reference IDs, and saves C (storage unavailable: %s)', async (storageUnavailable) => {
  const view = mount();
  expect(screen.getByText("Chargement de l'éditeur…")).toBeInTheDocument();
  expect(screen.queryByLabelText('Synthetic name')).not.toBeInTheDocument();
  await act(async () => { view.initialGeneration.resolve('1'); });
  const nameInput = await screen.findByLabelText('Synthetic name');
  expect(nameInput).toHaveValue('A');
  expect(screen.getByRole('option', { name: 'CB' })).toHaveValue('card');
  if (storageUnavailable) jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
  fireEvent.change(nameInput, { target: { value: 'C' } });
  expect(mockEditor.isDirty).toBe(true);
  expect(mockEditor.baseline.generalInfo.name).toBe('A');

  const nextWorkspace = deferred<ObjectWorkspaceResource>();
  view.server.characteristics.paymentOptions[0].label = 'Carte bancaire renommée';
  view.server.sustainability.categories[0].actions = view.server.sustainability.categories[0].actions.filter((action) => action.code !== 'SA_LED');
  // Generation invalidation may start an old-key refetch as well as the new
  // observed query. Hold every read so this checks the actual pending editor.
  jest.mocked(getObjectWorkspaceResource).mockImplementation(() => nextWorkspace.promise);
  mockGeneration = '2';
  act(() => { window.dispatchEvent(new CustomEvent('bertel:thesaurus-published', { detail: { releaseId: 2 } })); });
  await waitFor(() => expect(getObjectWorkspaceResource).toHaveBeenCalled());
  // Keep the exact mounted field while the new generation's workspace is pending.
  const retainedDuringPending = nameInput.isConnected;
  expect(nameInput).toHaveValue('C');
  await waitFor(() => expect(nameInput.closest('[inert]')).not.toBeNull());
  if (storageUnavailable) {
    const exporter = screen.getByRole('button', { name: 'Exporter le brouillon JSON' });
    expect(exporter.closest('[inert]')).toBeNull();
    const readsBeforeExport = jest.mocked(getObjectWorkspaceResource).mock.calls.length;
    fireEvent.click(exporter);
    expect(downloadTextFile).toHaveBeenCalledTimes(1);
    const [fileName, mime, json] = jest.mocked(downloadTextFile).mock.calls[0];
    expect(fileName).toBe(`${ID}-brouillon.json`);
    expect(mime).toBe('application/json');
    expect(JSON.parse(json)).toMatchObject({ version: 2, modules: { generalInfo: { name: 'C' } } });
    expect(getObjectWorkspaceResource).toHaveBeenCalledTimes(readsBeforeExport);
    expect(saveObjectWorkspaceGeneralInfo).not.toHaveBeenCalled();
    expect(screen.getByText(/Brouillon local indisponible/)).toBeInTheDocument();
  }
  expect(view.resource().detail).toMatchObject({ current_version: 7 });
  await act(async () => { nextWorkspace.resolve(view.resource()); });
  await screen.findByRole('option', { name: 'Carte bancaire renommée' });
  jest.mocked(getObjectWorkspaceResource).mockImplementation(async (_id, _langs, _catalogs, detail) => detail as unknown as ObjectWorkspaceResource);
  expect(screen.getByLabelText('Synthetic name')).toHaveValue('C');
  expect(screen.getByLabelText('Synthetic name').closest('[inert]')).toBeNull();
  expect(screen.getByLabelText('Synthetic payment')).toHaveValue('card');
  expect(mockEditor.draft.characteristics.paymentOptions[0].id).toBe('card');
  expect(mockEditor.baseline.generalInfo.name).toBe('A');
  expect(mockEditor.draft.sustainability.categories[0].actions).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'sa-led', code: 'SA_LED', selected: true, disabled: true }),
  ]));
  expect(mockEditor.dirtySections.sustainability).toBe(false);
  expect(mockEditor.recoveryConflicts).toEqual([]);
  expect(saveObjectWorkspaceGeneralInfo).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  await waitFor(() => expect(saveObjectWorkspaceGeneralInfo).toHaveBeenCalledWith(ID, expect.objectContaining({ name: 'C' })));
  expect(view.server.generalInfo.name).toBe('C');
  expect(retainedDuringPending).toBe(true);
});
