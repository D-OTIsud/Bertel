import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import ListComposeView from './ListComposeView';
import { useSessionStore } from '@/store/session-store';
import { useServiceAvailability } from '@/hooks/useServiceAvailability';
import { getList, updateList, setListItems, duplicateList, listsQueryKeys, parseListDetail, type ObjectListDetail } from '@/services/lists';

jest.mock('@/services/lists', () => ({ ...jest.requireActual('@/services/lists'),
  getListEmailContext: jest.fn(async () => ({ generations: {} })),
  getList: jest.fn(), updateList: jest.fn(), setListItems: jest.fn(), duplicateList: jest.fn(),
  deleteList: jest.fn(), shareList: jest.fn(), ensureListShareLink: jest.fn(), sendListByEmail: jest.fn(),
  restoreList: jest.fn(), requestListFeature: jest.fn(), reviewListFeature: jest.fn(), setListFeatured: jest.fn(),
}));
jest.mock('@/features/object-editor/useObjectSearch', () => ({ useObjectSearch: () => ({ results: [], loading: false }) }));
jest.mock('@/hooks/useServiceAvailability', () => ({ useServiceAvailability: jest.fn() }));
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/features/lists/OtiTemplate', () => ({ __esModule: true, default: () => <div />, itemsToOtiPois: () => [] }));
jest.mock('@/features/lists/ChannelFrame', () => ({ __esModule: true, default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));

const A = 'list-A', B = 'list-B';
function detail(id: string, overrides: Partial<ObjectListDetail> = {}): ObjectListDetail {
  return { ...parseListDetail({ id, name: `Name ${id}`, kind: 'static', lang: 'fr', created_by: 'user-A', org_object_id: 'ORG1',
    can_edit: true, can_manage_sharing: true, items: [{ object_id: 'SHARED', position: 0, note_fr: `Note ${id}`,
      card: { id: 'SHARED', name: `Place ${id}`, type: 'HOT' } }] }), ...overrides };
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const clients: QueryClient[] = [];
function page() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  clients.push(client);
  for (const user of ['user-A', 'user-B']) for (const id of [A, B]) client.setQueryData(listsQueryKeys.detail(id, user, 'ORG1'), detail(id, { createdBy: user }));
  const ui = (id: string) => <QueryClientProvider client={client}><ListComposeView listId={id} /></QueryClientProvider>;
  const view = render(ui(A));
  return { client, navigate: (id: string) => view.rerender(ui(id)) };
}
async function pauseMetadata(view: ReturnType<typeof page>) {
  onlineManager.setOnline(false);
  const field = await screen.findByLabelText('Nom de la liste');
  fireEvent.change(field, { target: { value: 'Sent A' } }); fireEvent.blur(field);
  await waitFor(() => expect(view.client.getMutationCache().getAll().some((mutation) => mutation.state.isPaused)).toBe(true));
  expect(updateList).not.toHaveBeenCalled();
}
async function resume(client: QueryClient) {
  await act(async () => { onlineManager.setOnline(true); await client.resumePausedMutations(); });
}
beforeEach(() => {
  jest.clearAllMocks();
  onlineManager.setOnline(true);
  useSessionStore.setState({ userId: 'user-A', orgId: 'ORG1', status: 'ready', role: 'tourism_agent', demoMode: false,
    canEditObjects: true, isTestRealm: false, adminRank: null });
  jest.mocked(useServiceAvailability).mockReturnValue({ translation: false, imageAnalysis: false, email: true });
  jest.mocked(getList).mockImplementation(async (id) => detail(id));
  jest.mocked(updateList).mockImplementation(async (id, patch) => detail(id, { name: patch.name ?? `Name ${id}` }));
  jest.mocked(setListItems).mockImplementation(async (id) => detail(id));
  jest.mocked(duplicateList).mockResolvedValue('new-A');
});
afterEach(() => { onlineManager.setOnline(true); for (const client of clients.splice(0)) client.clear(); });

it('ack A updates only A cache and preserves the newer B draft', async () => {
  const ack = deferred<ObjectListDetail | null>(); jest.mocked(updateList).mockReturnValueOnce(ack.promise);
  const view = page();
  const name = await screen.findByLabelText('Nom de la liste');
  fireEvent.change(name, { target: { value: 'Sent A' } }); fireEvent.blur(name);
  await waitFor(() => expect(updateList).toHaveBeenCalledWith(A, { name: 'Sent A' }));
  view.navigate(B);
  const b = await screen.findByLabelText('Nom de la liste'); fireEvent.change(b, { target: { value: 'Draft B C' } });
  await act(async () => { ack.resolve(detail(A, { name: 'Acknowledged A' })); });
  expect(view.client.getQueryData(listsQueryKeys.detail(A, 'user-A', 'ORG1'))).toMatchObject({ id: A, name: 'Acknowledged A' });
  expect(view.client.getQueryData(listsQueryKeys.detail(B, 'user-A', 'ORG1'))).toMatchObject({ id: B, name: `Name ${B}` });
  expect(b).toHaveValue('Draft B C');
});

it('rejected items from A cannot remove the same object or its draft note from B', async () => {
  const ack = deferred<ObjectListDetail | null>(); jest.mocked(setListItems).mockReturnValueOnce(ack.promise);
  const view = page();
  fireEvent.change(await screen.findByLabelText(`Note pour Place ${A}`), { target: { value: 'Sent note A' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  await waitFor(() => expect(setListItems).toHaveBeenCalledTimes(1));
  view.navigate(B);
  const noteB = await screen.findByLabelText(`Note pour Place ${B}`); fireEvent.change(noteB, { target: { value: 'Draft B C' } });
  await act(async () => { ack.resolve(detail(A, { items: [] })); });
  expect(screen.getByLabelText(`Note pour Place ${B}`)).toHaveValue('Draft B C');
  expect(screen.queryByText(/Un lieu n'a pas pu être enregistré/)).not.toBeInTheDocument();
  expect(view.client.getQueryData(listsQueryKeys.detail(A, 'user-A', 'ORG1'))).toMatchObject({ id: A, items: [] });
  expect(view.client.getQueryData(listsQueryKeys.detail(B, 'user-A', 'ORG1'))).toMatchObject({ id: B });
});

it('a paused mutation retains target A after navigation B, rather than taking current mutationFn options', async () => {
  const view = page(); await pauseMetadata(view); view.navigate(B);
  await screen.findByLabelText('Nom de la liste'); await resume(view.client);
  expect(updateList).toHaveBeenCalledTimes(1); expect(updateList).toHaveBeenCalledWith(A, { name: 'Sent A' });
  expect(view.client.getQueryData(listsQueryKeys.detail(A, 'user-A', 'ORG1'))).toMatchObject({ id: A, name: 'Sent A' });
  expect(view.client.getQueryData(listsQueryKeys.detail(B, 'user-A', 'ORG1'))).toMatchObject({ id: B, name: `Name ${B}` });
});

it.each(['other user', 'account ABA'] as const)('a paused mutation cannot dispatch after %s', async (mode) => {
  const view = page(); await pauseMetadata(view);
  act(() => { useSessionStore.setState({ userId: 'user-B' }); if (mode === 'account ABA') useSessionStore.setState({ userId: 'user-A' }); });
  await resume(view.client); expect(updateList).not.toHaveBeenCalled();
});

it('queued edits capture the original account epoch before a preceding write settles', async () => {
  const ack = deferred<ObjectListDetail | null>(); jest.mocked(updateList).mockReturnValueOnce(ack.promise);
  page(); const name = await screen.findByLabelText('Nom de la liste');
  fireEvent.change(name, { target: { value: 'Sent A one' } }); fireEvent.blur(name);
  await waitFor(() => expect(updateList).toHaveBeenCalledTimes(1));
  fireEvent.change(name, { target: { value: 'Queued A two' } }); fireEvent.blur(name);
  act(() => { useSessionStore.setState({ userId: 'user-B' }); useSessionStore.setState({ userId: 'user-A' }); });
  await act(async () => { ack.resolve(detail(A, { name: 'Sent A one' })); });
  expect(updateList).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Nom de la liste')).toHaveValue('Queued A two');
});

it('a paused duplication keeps target A and cannot navigate the later B view', async () => {
  const view = page(); onlineManager.setOnline(false);
  fireEvent.click(await screen.findByRole('button', { name: /Dupliquer/ }));
  await waitFor(() => expect(view.client.getMutationCache().getAll().some((mutation) => mutation.state.isPaused)).toBe(true));
  view.navigate(B); await resume(view.client);
  expect(duplicateList).toHaveBeenCalledWith(A); expect(mockPush).not.toHaveBeenCalled();
});

it('late A failure cannot replace B error state or discard B input', async () => {
  const ack = deferred<ObjectListDetail | null>(); jest.mocked(updateList).mockReturnValueOnce(ack.promise);
  const view = page(); const name = await screen.findByLabelText('Nom de la liste');
  fireEvent.change(name, { target: { value: 'Sent A' } }); fireEvent.blur(name);
  await waitFor(() => expect(updateList).toHaveBeenCalledTimes(1));
  view.navigate(B); fireEvent.change(await screen.findByLabelText('Nom de la liste'), { target: { value: 'Draft B C' } });
  await act(async () => { ack.reject(new Error('Synthetic old A failure')); });
  expect(screen.queryByText('Synthetic old A failure')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Nom de la liste')).toHaveValue('Draft B C');
});

it('ordinary B→C edits in the same view remain editable and both save in their intended order', async () => {
  const ack = deferred<ObjectListDetail | null>(); jest.mocked(updateList).mockReturnValueOnce(ack.promise);
  const view = page(); const name = await screen.findByLabelText('Nom de la liste');
  fireEvent.change(name, { target: { value: 'Sent B' } }); fireEvent.blur(name);
  await waitFor(() => expect(updateList).toHaveBeenCalledTimes(1));
  expect(name).not.toBeDisabled(); fireEvent.change(name, { target: { value: 'Draft C' } }); fireEvent.blur(name);
  await act(async () => { ack.resolve(detail(A, { name: 'Sent B' })); });
  await waitFor(() => expect(updateList).toHaveBeenCalledTimes(2));
  expect(jest.mocked(updateList).mock.calls.map(([id, patch]) => [id, patch.name])).toEqual([[A, 'Sent B'], [A, 'Draft C']]);
  expect(name).toHaveValue('Draft C');
  expect(view.client.getQueryData(listsQueryKeys.detail(A, 'user-A', 'ORG1'))).toMatchObject({ name: 'Draft C' });
});
