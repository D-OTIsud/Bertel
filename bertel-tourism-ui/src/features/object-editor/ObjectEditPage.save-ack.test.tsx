import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ObjectEditPage } from './ObjectEditPage';
import type { ObjectEditorState } from './useObjectEditorState';
import { fullModulesFixture, allowAll } from './sections/section-fixture.test-utils';
import { useSessionStore } from '../../store/session-store';
import {
  saveObjectWorkspaceGeneralInfo, saveObjectWorkspaceContacts, saveObjectWorkspaceRooms,
  saveObjectWorkspaceMeetingRooms, saveObjectWorkspacePlaces, type ObjectWorkspaceResource,
} from '../../services/object-workspace';
import { submitPendingChange } from '../../services/moderation';
import { getApiClient } from '../../lib/supabase';
import { galleryBaseline } from '../../services/media-write-contract';

let mockResource: ObjectWorkspaceResource;
let mockEditor: ObjectEditorState;
const mockPublish = jest.fn();
const mockToast = jest.fn();

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../../lib/supabase', () => ({ getApiClient: jest.fn(() => null), getSupabaseClient: jest.fn(() => null) }));
jest.mock('../../services/object-workspace', () => ({
  ...jest.requireActual('../../services/object-workspace'),
  saveObjectWorkspaceGeneralInfo: jest.fn(), saveObjectWorkspaceContacts: jest.fn(),
  saveObjectWorkspaceRooms: jest.fn(), saveObjectWorkspaceMeetingRooms: jest.fn(), saveObjectWorkspacePlaces: jest.fn(),
}));
jest.mock('../../services/moderation', () => ({ submitPendingChange: jest.fn() }));
jest.mock('../../services/notification-delivery', () => ({ pingNotifyDrain: jest.fn() }));
jest.mock('../../services/write-compatibility', () => ({
  ...jest.requireActual('../../services/write-compatibility'),
  readWriteCompatibility: jest.fn(async () => ({ compatible: true, clientVersion: 2, minimumClientVersion: 2, serverWriteContractVersion: 2 })),
}));
jest.mock('../../hooks/useExplorerQueries', () => {
  const actual = jest.requireActual('../../hooks/useExplorerQueries');
  const { useQuery } = jest.requireActual('@tanstack/react-query');
  return {
    ...actual,
    useObjectWorkspaceQuery: (id: string) => useQuery({
      queryKey: ['object-workspace', id], initialData: mockResource, staleTime: Infinity, queryFn: async () => mockResource,
    }),
    usePublishObjectWorkspaceMutation: () => ({ mutateAsync: mockPublish }),
    useObjectVersionsQuery: () => ({ data: [] }),
  };
});
jest.mock('../../hooks/useToast', () => ({ useToast: () => ({ success: mockToast }) }));
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
        <option value="active">Active</option><option value="lapsed">Paused</option><option value="suspended">Hidden</option>
      </select>
      <input aria-label="Synthetic contact" value={editor.draft.contacts.objectItems[0].value} onChange={(event) => editor.replaceModule('contacts', {
        ...editor.draft.contacts, objectItems: [{ ...editor.draft.contacts.objectItems[0], value: event.target.value }],
      })} />
      <output data-testid="baseline-name">{editor.baseline.generalInfo.name}</output>
      <output data-testid="dirty">{String(editor.isDirty)}</output>
    </>;
  },
}] }));
jest.mock('./shell/EditorTopbar', () => ({ EditorTopbar: (props: {
  onSaveDraft: () => void; onPublish: () => void; saving: boolean; savingDraft: boolean; statusMessage: string | null;
}) => <>
  <output data-testid="status-message">{props.statusMessage}</output>
  <button disabled={props.saving || props.savingDraft} onClick={props.onSaveDraft}>Save</button>
  <button disabled={props.saving || props.savingDraft} onClick={props.onPublish}>Publish</button>
</> }));
jest.mock('./shell/EditorNav', () => ({ EditorNav: () => null }));
jest.mock('./shell/EditorRail', () => ({ EditorRail: () => null }));
jest.mock('./widgets/BlockersModal', () => ({ BlockersModal: (props: { open: boolean; context: string }) => props.open ? <div role="dialog" aria-label={props.context} /> : null }));
jest.mock('./widgets/VersionHistoryModal', () => ({ VersionHistoryModal: () => null }));
jest.mock('./widgets/ImportExportModal', () => ({ ImportExportModal: () => null }));
jest.mock('./widgets/PeerSavedBanner', () => ({ PeerSavedBanner: () => null }));

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { ...render(<QueryClientProvider client={client}><ObjectEditPage objectId="HOT-ACK" /></QueryClientProvider>), client };
}

beforeEach(() => {
  window.localStorage.clear();
  jest.clearAllMocks();
  mockPublish.mockReset().mockResolvedValue(undefined);
  jest.mocked(saveObjectWorkspaceGeneralInfo).mockReset().mockResolvedValue(undefined);
  jest.mocked(saveObjectWorkspaceContacts).mockReset().mockResolvedValue(undefined);
  jest.mocked(saveObjectWorkspaceRooms).mockReset().mockResolvedValue(undefined);
  jest.mocked(saveObjectWorkspaceMeetingRooms).mockReset().mockResolvedValue(undefined);
  jest.mocked(saveObjectWorkspacePlaces).mockReset().mockResolvedValue(undefined);
  jest.mocked(getApiClient).mockReturnValue(null);
  jest.mocked(submitPendingChange).mockReset().mockResolvedValue('synthetic-proposal');
  useSessionStore.setState({ demoMode: false, userId: 'save-ack-user', langPrefs: ['fr'] });
  const modules = fullModulesFixture();
  modules.generalInfo.name = 'A';
  modules.generalInfo.status = 'draft';
  modules.contacts.objectItems[0].value = 'contact-a@example.invalid';
  mockResource = { id: 'HOT-ACK', name: 'A', type: 'HOT', detail: {} as ObjectWorkspaceResource['detail'], modules, permissions: allowAll };
});

it('the real page saves B while C stays editable, dirty and recoverable, then the next save sends C', async () => {
  const first = deferred();
  jest.mocked(saveObjectWorkspaceGeneralInfo).mockReturnValueOnce(first.promise);
  mount();
  fireEvent.change(screen.getByLabelText('Synthetic name'), { target: { value: 'B' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(saveObjectWorkspaceGeneralInfo).toHaveBeenCalledTimes(1));
  expect(jest.mocked(saveObjectWorkspaceGeneralInfo).mock.calls[0][1].name).toBe('B');
  expect(screen.getByLabelText('Synthetic name')).toBeEnabled();
  fireEvent.change(screen.getByLabelText('Synthetic name'), { target: { value: 'C' } });
  await act(async () => { first.resolve(); });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
  expect(mockEditor.baseline.generalInfo.name).toBe('B');
  expect(mockEditor.draft.generalInfo.name).toBe('C');
  expect(mockEditor.isDirty).toBe(true);
  const stored = JSON.parse(window.localStorage.getItem('object-editor-draft:save-ack-user:HOT-ACK')!);
  expect(stored.baseline.generalInfo.name).toBe('B');
  expect(stored.draft.generalInfo.name).toBe('C');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(saveObjectWorkspaceGeneralInfo).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(mockEditor.isDirty).toBe(false));
  expect(jest.mocked(saveObjectWorkspaceGeneralInfo).mock.calls[1][1].name).toBe('C');
  expect(window.localStorage.getItem('object-editor-draft:save-ack-user:HOT-ACK')).toBeNull();
});

it('partial success acknowledges only the successful sent module, preserving both later edits and failed sections', async () => {
  const first = deferred();
  jest.mocked(saveObjectWorkspaceGeneralInfo).mockReturnValueOnce(first.promise);
  jest.mocked(saveObjectWorkspaceContacts).mockRejectedValueOnce(new Error('Synthetic contact failure'));
  mount();
  fireEvent.change(screen.getByLabelText('Synthetic name'), { target: { value: 'B' } });
  fireEvent.change(screen.getByLabelText('Synthetic contact'), { target: { value: 'contact-b@example.invalid' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(saveObjectWorkspaceContacts).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByLabelText('Synthetic name'), { target: { value: 'C' } });
  fireEvent.change(screen.getByLabelText('Synthetic contact'), { target: { value: 'contact-c@example.invalid' } });
  await act(async () => { first.resolve(); });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
  expect(mockEditor.baseline.generalInfo.name).toBe('B');
  expect(mockEditor.baseline.contacts.objectItems[0].value).toBe('contact-a@example.invalid');
  expect(mockEditor.draft.contacts.objectItems[0].value).toBe('contact-c@example.invalid');
  expect(mockEditor.dirtySections).toMatchObject({ 'general-info': true, contacts: true });
});

it('a settled contributor proposal acknowledges its submitted B while later C remains a new proposal draft', async () => {
  const first = deferred<string>();
  jest.mocked(submitPendingChange).mockReturnValueOnce(first.promise);
  mockResource.permissions = { generalInfo: { canDirectWrite: false }, publication: { canDirectWrite: false } } as never;
  mount();
  fireEvent.change(screen.getByLabelText('Synthetic name'), { target: { value: 'B' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(submitPendingChange).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByLabelText('Synthetic name'), { target: { value: 'C' } });
  await act(async () => { first.resolve('synthetic-first'); });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
  expect(jest.mocked(submitPendingChange).mock.calls[0][0].payload).toMatchObject({ name: 'B' });
  expect(mockEditor.baseline.generalInfo.name).toBe('B');
  expect(mockEditor.draft.generalInfo.name).toBe('C');
  expect(mockEditor.isDirty).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(submitPendingChange).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(mockEditor.isDirty).toBe(false));
  expect(jest.mocked(submitPendingChange).mock.calls[1][0].metadata).toMatchObject({ before: expect.stringContaining('"name":"B"'), after: expect.stringContaining('"name":"C"') });
  expect(saveObjectWorkspaceGeneralInfo).not.toHaveBeenCalled();
});

it('the real proposal RPC receives visibility B; its success neither acknowledges later C nor a failed identity proposal', async () => {
  const first = deferred<string>();
  const rpc = jest.fn(() => first.promise.then((data) => ({ data, error: null })));
  jest.mocked(getApiClient).mockReturnValue({ schema: () => ({ rpc }) } as never);
  const realSubmit = jest.requireActual('../../services/moderation').submitPendingChange as typeof submitPendingChange;
  jest.mocked(submitPendingChange).mockImplementation((input) => input.metadata?.section === 'publication'
    ? realSubmit(input) : Promise.reject(new Error('Synthetic identity failure')));
  mockResource.permissions = { generalInfo: { canDirectWrite: false }, publication: { canDirectWrite: false } } as never;
  mount();
  fireEvent.change(screen.getByLabelText('Synthetic name'), { target: { value: 'B' } });
  fireEvent.change(screen.getByLabelText('Synthetic visibility'), { target: { value: 'lapsed' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
  expect(rpc).toHaveBeenCalledWith('submit_pending_change', expect.objectContaining({
    p_payload: { commercialVisibility: 'lapsed' },
    p_metadata: expect.objectContaining({ section: 'publication', rpc: null, manual_apply: true,
      before: '{"commercialVisibility":"active"}', after: '{"commercialVisibility":"lapsed"}' }),
  }));
  fireEvent.change(screen.getByLabelText('Synthetic name'), { target: { value: 'C' } });
  fireEvent.change(screen.getByLabelText('Synthetic visibility'), { target: { value: 'suspended' } });
  await act(async () => { first.resolve('synthetic-proposal'); });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
  expect(mockEditor.baseline.generalInfo).toMatchObject({ name: 'A', commercialVisibility: 'lapsed' });
  expect(mockEditor.draft.generalInfo).toMatchObject({ name: 'C', commercialVisibility: 'suspended' });
  expect(mockEditor.dirtySections).toMatchObject({ 'general-info': true, publication: true });
  expect(saveObjectWorkspaceGeneralInfo).not.toHaveBeenCalled();
});

it('a failed save leaves its baseline and recoverable draft intact', async () => {
  jest.mocked(saveObjectWorkspaceGeneralInfo).mockRejectedValueOnce(new Error('Synthetic save failure'));
  mount();
  fireEvent.change(screen.getByLabelText('Synthetic name'), { target: { value: 'B' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(saveObjectWorkspaceGeneralInfo).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
  expect(mockEditor.baseline.generalInfo.name).toBe('A');
  expect(mockEditor.draft.generalInfo.name).toBe('B');
  expect(mockEditor.isDirty).toBe(true);
  expect(window.localStorage.getItem('object-editor-draft:save-ack-user:HOT-ACK')).not.toBeNull();
});

it.each([
  ['rooms', saveObjectWorkspaceRooms, 'knownRoomIds'],
  ['meetingRooms', saveObjectWorkspaceMeetingRooms, 'knownRoomIds'],
  ['places', saveObjectWorkspacePlaces, 'knownPlaceIds'],
] as const)('the page preserves an in-flight deletion and addition in %s without inventing persisted children', async (key, service, knownKey) => {
  const template = mockResource.modules[key].items[0];
  mockResource.modules = { ...mockResource.modules, [key]: { ...mockResource.modules[key], items: [], [knownKey]: [] } };
  const first = deferred();
  jest.mocked(service).mockReturnValueOnce(first.promise);
  const idB = '00000000-0000-4000-a000-00000000b001';
  const idC = '00000000-0000-4000-a000-00000000c001';
  const row = (id: string) => ({ ...template, uid: id, recordId: key === 'meetingRooms' ? null : id, isNew: true, name: id, label: id });
  mount();
  act(() => mockEditor.replaceModule(key, { ...mockEditor.draft[key], items: [row(idB)] } as never));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(service).toHaveBeenCalledTimes(1));
  act(() => mockEditor.replaceModule(key, { ...mockEditor.draft[key], items: [row(idC)] } as never));
  await act(async () => { first.resolve(); });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
  expect(mockEditor.baseline[key].items).toHaveLength(1);
  expect(mockEditor.baseline[key].items[0]).toMatchObject({ recordId: idB });
  expect(mockEditor.draft[key].items).toHaveLength(1);
  expect(mockEditor.draft[key].items[0]).toMatchObject({ isNew: true, name: idC });
  expect(mockEditor.draft[key]).toHaveProperty(knownKey, [idB]);
  expect(mockEditor.isDirty).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(service).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(mockEditor.isDirty).toBe(false));
  const secondInput = jest.mocked(service).mock.calls[1][1];
  expect(secondInput).toHaveProperty(knownKey, [idB]);
  expect(secondInput.items).toHaveLength(1);
  expect(secondInput.items[0]).toMatchObject({ name: idC });
});

it('a lost gallery response retains the exact request and created UUID for the page retry', async () => {
  const media = mockResource.modules.media;
  const template = media.objectItems[0];
  const typeId = '00000000-0000-4000-a000-00000000a001';
  const empty = { ...media, objectItems: [], placeItems: [], typeOptions: [{ id: typeId, code: 'photo', label: 'Photo' }] };
  mockResource.modules.media = { ...empty, galleryWriteBaseline: galleryBaseline(empty, []) };
  const requests: Array<{ request_id: string; rows: Array<{ id: string; changes: Record<string, unknown> }> }> = [];
  const rpc = jest.fn(async (name: string, args: { p_payload: typeof requests[number] }) => {
    expect(name).toBe('save_object_gallery');
    requests.push(JSON.parse(JSON.stringify(args.p_payload)));
    if (requests.length === 1) throw Object.assign(new Error('Synthetic lost response'), { code: 'FETCH_ERROR' });
    const row = args.p_payload.rows[0];
    return { data: { success: true, snapshot: [{ ...row.changes, id: row.id, object_id: 'HOT-ACK', place_id: null, updated_at: '2099-01-01T00:00:00Z', extra: {} }] }, error: null };
  });
  jest.mocked(getApiClient).mockReturnValue({ schema: () => ({ rpc }) } as never);
  mount();
  act(() => mockEditor.replaceModule('media', {
    ...mockEditor.draft.media,
    objectItems: [{ ...template, id: 'temporary-photo', scope: 'object', placeId: null, typeId, typeCode: 'photo', title: 'Synthetic photo', isMain: true, isPublished: true }],
  }));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
  expect(mockEditor.isDirty).toBe(true);
  expect(mockEditor.draft.media.galleryWriteBaseline?.createdIds['temporary-photo']).toBe(requests[0].rows[0].id);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(mockEditor.isDirty).toBe(false));
  expect(requests[1]).toEqual(requests[0]);
  expect(mockEditor.draft.media.objectItems[0].id).toBe(requests[0].rows[0].id);
  expect(window.localStorage.getItem('workspace-gallery-request:save-ack-user:HOT-ACK')).toBeNull();
});

it.each(['same module', 'another module'])('publication stops before dispatch when C is typed during saving B (%s)', async (edit) => {
  const saving = deferred();
  jest.mocked(saveObjectWorkspaceGeneralInfo).mockReturnValueOnce(saving.promise);
  mount();
  fireEvent.change(screen.getByLabelText('Synthetic name'), { target: { value: 'B' } });
  fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
  await waitFor(() => expect(saveObjectWorkspaceGeneralInfo).toHaveBeenCalledTimes(1));
  expect(jest.mocked(saveObjectWorkspaceGeneralInfo).mock.calls[0][1].name).toBe('B');
  if (edit === 'same module') fireEvent.change(screen.getByLabelText('Synthetic name'), { target: { value: 'C' } });
  else fireEvent.change(screen.getByLabelText('Synthetic contact'), { target: { value: 'contact-c@example.invalid' } });
  await act(async () => { saving.resolve(); });
  await waitFor(() => expect(mockEditor.baseline.generalInfo.name).toBe('B'));
  expect(mockPublish).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog', { name: 'publish-deferred' })).toBeInTheDocument();
  expect(mockEditor.isDirty).toBe(true);
  expect(mockEditor.draft.generalInfo.status).toBe('draft');
  expect(mockToast).not.toHaveBeenCalled();
  const stored = JSON.parse(window.localStorage.getItem('object-editor-draft:save-ack-user:HOT-ACK')!);
  expect(stored.baseline.generalInfo.name).toBe('B');
  if (edit === 'same module') expect(stored.draft.generalInfo.name).toBe('C');
  else expect(stored.draft.contacts.objectItems[0].value).toBe('contact-c@example.invalid');
});

it('publication sends after saving B when no later content edit was made', async () => {
  const saving = deferred();
  jest.mocked(saveObjectWorkspaceGeneralInfo).mockReturnValueOnce(saving.promise);
  mount();
  fireEvent.change(screen.getByLabelText('Synthetic name'), { target: { value: 'B' } });
  fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
  await waitFor(() => expect(saveObjectWorkspaceGeneralInfo).toHaveBeenCalledTimes(1));
  await act(async () => { saving.resolve(); });
  await waitFor(() => expect(mockPublish).toHaveBeenCalledWith(true));
  expect(mockEditor.baseline.generalInfo.name).toBe('B');
  expect(mockEditor.draft.generalInfo.status).toBe('published');
  expect(mockEditor.isDirty).toBe(false);
  expect(screen.queryByRole('dialog', { name: 'publish-deferred' })).not.toBeInTheDocument();
});

it('a refreshed gallery CAS baseline and description-language navigation do not postpone publication', async () => {
  const saving = deferred();
  jest.mocked(saveObjectWorkspaceGeneralInfo).mockReturnValueOnce(saving.promise);
  mount();
  fireEvent.change(screen.getByLabelText('Synthetic name'), { target: { value: 'B' } });
  fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
  await waitFor(() => expect(saveObjectWorkspaceGeneralInfo).toHaveBeenCalledTimes(1));
  act(() => {
    mockEditor.mergeSavedModule('media', (media) => ({ ...media, galleryWriteBaseline: galleryBaseline(media, []) }));
    mockEditor.patchModule('descriptions', { activeLanguage: 'en' });
  });
  await act(async () => { saving.resolve(); });
  await waitFor(() => expect(mockPublish).toHaveBeenCalledWith(true));
  expect(mockEditor.draft.descriptions.activeLanguage).toBe('en');
  expect(screen.queryByRole('dialog', { name: 'publish-deferred' })).not.toBeInTheDocument();
});

it('C typed after publication was dispatched stays dirty without claiming that the sent B was cancelled', async () => {
  const publishing = deferred();
  mockPublish.mockReturnValueOnce(publishing.promise);
  mount();
  fireEvent.change(screen.getByLabelText('Synthetic name'), { target: { value: 'B' } });
  fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
  await waitFor(() => expect(mockPublish).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByLabelText('Synthetic name'), { target: { value: 'C' } });
  await act(async () => { publishing.resolve(); });
  await waitFor(() => expect(mockEditor.draft.generalInfo.status).toBe('published'));
  expect(mockEditor.baseline.generalInfo.name).toBe('B');
  expect(mockEditor.draft.generalInfo.name).toBe('C');
  expect(mockEditor.isDirty).toBe(true);
  expect(screen.queryByRole('dialog', { name: 'publish-deferred' })).not.toBeInTheDocument();
});

it.each([
  ['rooms', saveObjectWorkspaceRooms, 'knownRoomIds'],
  ['meetingRooms', saveObjectWorkspaceMeetingRooms, 'knownRoomIds'],
  ['places', saveObjectWorkspacePlaces, 'knownPlaceIds'],
] as const)('canonical acknowledgement of new %s children does not postpone publication', async (key, service, knownKey) => {
  const template = mockResource.modules[key].items[0];
  mockResource.modules = { ...mockResource.modules, [key]: { ...mockResource.modules[key], items: [], [knownKey]: [] } };
  const saving = deferred();
  jest.mocked(service).mockReturnValueOnce(saving.promise);
  const id = '00000000-0000-4000-a000-00000000b001';
  mount();
  act(() => mockEditor.replaceModule(key, { ...mockEditor.draft[key], items: [{
    ...template, uid: id, recordId: key === 'meetingRooms' ? null : id, isNew: true, name: 'Sent child', label: 'Sent child',
  }] } as never));
  fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
  await waitFor(() => expect(service).toHaveBeenCalledTimes(1));
  await act(async () => { saving.resolve(); });
  await waitFor(() => expect(mockPublish).toHaveBeenCalledWith(true));
  expect(mockEditor.baseline[key].items[0]).toMatchObject({ recordId: id, isNew: false });
  expect(mockEditor.isDirty).toBe(false);
  expect(screen.queryByRole('dialog', { name: 'publish-deferred' })).not.toBeInTheDocument();
});

it('a save settled after the editor unmounts cannot dispatch publication', async () => {
  const saving = deferred();
  jest.mocked(saveObjectWorkspaceGeneralInfo).mockReturnValueOnce(saving.promise);
  const view = mount();
  fireEvent.change(screen.getByLabelText('Synthetic name'), { target: { value: 'B' } });
  fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
  await waitFor(() => expect(saveObjectWorkspaceGeneralInfo).toHaveBeenCalledTimes(1));
  view.unmount();
  await act(async () => { saving.resolve(); });
  expect(mockPublish).not.toHaveBeenCalled();
  expect(mockToast).not.toHaveBeenCalled();
});

it('a save settled after another object mounts cannot publish the old object', async () => {
  const saving = deferred();
  jest.mocked(saveObjectWorkspaceGeneralInfo).mockReturnValueOnce(saving.promise);
  const view = mount();
  fireEvent.change(screen.getByLabelText('Synthetic name'), { target: { value: 'B' } });
  fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
  await waitFor(() => expect(saveObjectWorkspaceGeneralInfo).toHaveBeenCalledTimes(1));
  mockResource = { ...mockResource, id: 'OTHER-ACK', modules: fullModulesFixture() };
  view.rerender(<QueryClientProvider client={view.client}><ObjectEditPage objectId="OTHER-ACK" /></QueryClientProvider>);
  await waitFor(() => expect(mockEditor.objectId).toBe('OTHER-ACK'));
  await act(async () => { saving.resolve(); });
  expect(mockPublish).not.toHaveBeenCalled();
  expect(mockToast).not.toHaveBeenCalled();
  expect(mockEditor.objectId).toBe('OTHER-ACK');
  expect(screen.queryByRole('dialog', { name: 'publish-deferred' })).not.toBeInTheDocument();
});

it('a save settled after an account change neither publishes nor reports an edit to the new account', async () => {
  const saving = deferred();
  jest.mocked(saveObjectWorkspaceGeneralInfo).mockReturnValueOnce(saving.promise);
  mount();
  fireEvent.change(screen.getByLabelText('Synthetic name'), { target: { value: 'B' } });
  fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
  await waitFor(() => expect(saveObjectWorkspaceGeneralInfo).toHaveBeenCalledTimes(1));
  act(() => useSessionStore.setState({ userId: 'other-save-ack-user' }));
  await waitFor(() => expect(mockEditor.draft.generalInfo.name).toBe('A'));
  await act(async () => { saving.resolve(); });
  expect(mockPublish).not.toHaveBeenCalled();
  expect(mockToast).not.toHaveBeenCalled();
  expect(mockEditor.draft.generalInfo.status).toBe('draft');
  expect(screen.queryByRole('dialog', { name: 'publish-deferred' })).not.toBeInTheDocument();
});

it('account A to B to A invalidates the old save but permits a fresh publish attempt', async () => {
  const saving = deferred();
  jest.mocked(saveObjectWorkspaceGeneralInfo).mockReturnValueOnce(saving.promise);
  mount();
  fireEvent.change(screen.getByLabelText('Synthetic name'), { target: { value: 'B' } });
  fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
  await waitFor(() => expect(saveObjectWorkspaceGeneralInfo).toHaveBeenCalledTimes(1));
  act(() => {
    useSessionStore.setState({ userId: 'other-save-ack-user' });
    useSessionStore.setState({ userId: 'save-ack-user' });
  });
  await act(async () => { saving.resolve(); });
  expect(mockPublish).not.toHaveBeenCalled();
  expect(mockToast).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
  await waitFor(() => expect(mockPublish).toHaveBeenCalledWith(true));
});

it.each(['account', 'object'])('a stale preliminary save failure does not expose its status message after an %s change', async (change) => {
  const saving = deferred();
  jest.mocked(saveObjectWorkspaceGeneralInfo).mockReturnValueOnce(saving.promise);
  const view = mount();
  fireEvent.change(screen.getByLabelText('Synthetic name'), { target: { value: 'B' } });
  fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
  await waitFor(() => expect(saveObjectWorkspaceGeneralInfo).toHaveBeenCalledTimes(1));
  if (change === 'account') {
    act(() => useSessionStore.setState({ userId: 'other-save-ack-user' }));
    await waitFor(() => expect(mockEditor.draft.generalInfo.name).toBe('A'));
  } else {
    mockResource = { ...mockResource, id: 'OTHER-ACK', modules: fullModulesFixture() };
    view.rerender(<QueryClientProvider client={view.client}><ObjectEditPage objectId="OTHER-ACK" /></QueryClientProvider>);
    await waitFor(() => expect(mockEditor.objectId).toBe('OTHER-ACK'));
  }
  await act(async () => { saving.reject(new Error('Synthetic expired preliminary save failure')); });
  expect(screen.getByTestId('status-message')).toBeEmptyDOMElement();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(mockPublish).not.toHaveBeenCalled();
  expect(mockToast).not.toHaveBeenCalled();
});

it('a preliminary save failure in the current scope still reports its error and prevents publication', async () => {
  const saving = deferred();
  jest.mocked(saveObjectWorkspaceGeneralInfo).mockReturnValueOnce(saving.promise);
  mount();
  fireEvent.change(screen.getByLabelText('Synthetic name'), { target: { value: 'B' } });
  fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
  await waitFor(() => expect(saveObjectWorkspaceGeneralInfo).toHaveBeenCalledTimes(1));
  await act(async () => { saving.reject(new Error('Synthetic current preliminary save failure')); });
  expect(screen.getByTestId('status-message')).toHaveTextContent('Synthetic current preliminary save failure');
  expect(screen.getByRole('dialog', { name: 'save' })).toBeInTheDocument();
  expect(mockPublish).not.toHaveBeenCalled();
  expect(mockEditor.draft.generalInfo.name).toBe('B');
  expect(mockEditor.isDirty).toBe(true);
});
