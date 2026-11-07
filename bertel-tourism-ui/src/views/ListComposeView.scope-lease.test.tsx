import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import ListComposeView from './ListComposeView';
import { useSessionStore } from '@/store/session-store';
import { useServiceAvailability } from '@/hooks/useServiceAvailability';
import { getList, updateList, setListItems, duplicateList, deleteList, listsQueryKeys, parseListDetail, type ObjectListDetail } from '@/services/lists';

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
beforeEach(() => {
  jest.clearAllMocks();
  onlineManager.setOnline(true);
  useSessionStore.setState({ authAuthority: { userId: 'user-A', epoch: 1, hydrated: true }, userId: 'user-A', orgId: 'ORG1', status: 'ready', role: 'tourism_agent', demoMode: false,
    canEditObjects: true, isTestRealm: false, adminRank: null });
  jest.mocked(useServiceAvailability).mockReturnValue({ translation: false, imageAnalysis: false, email: true });
  jest.mocked(getList).mockImplementation(async (id) => detail(id));
  jest.mocked(updateList).mockImplementation(async (id, patch) => detail(id, { name: patch.name ?? `Name ${id}` }));
  jest.mocked(setListItems).mockImplementation(async (id) => detail(id));
  jest.mocked(duplicateList).mockResolvedValue('new-A');
});
afterEach(() => { onlineManager.setOnline(true); for (const client of clients.splice(0)) client.clear(); });

it.each(['duplicate','language','delete'] as const)('a completed old %s cannot leave B permanently action-locked',async(mode)=>{
  const pending=deferred<unknown>();
  if(mode==='duplicate')jest.mocked(duplicateList).mockImplementationOnce(()=>pending.promise as Promise<string>);
  if(mode==='language')jest.mocked(updateList).mockImplementationOnce(()=>pending.promise as Promise<ObjectListDetail>);
  if(mode==='delete')jest.mocked(deleteList).mockImplementationOnce(()=>pending.promise as Promise<void>);
  const view=page();await screen.findByLabelText('Nom de la liste');
  if(mode==='duplicate')fireEvent.click(await screen.findByRole('button',{name:/Dupliquer/}));
  if(mode==='language')fireEvent.click(screen.getByRole('button',{name:'\u00c9diter en anglais'}));
  if(mode==='delete'){
    fireEvent.click(screen.getByRole('button',{name:'Supprimer la liste'}));
    const dialog=await screen.findByRole('dialog',{name:'Supprimer la liste ?'});
    fireEvent.click(within(dialog).getByRole('button',{name:'Supprimer'}));
  }
  await waitFor(()=>expect(mode==='language'?updateList:mode==='delete'?deleteList:duplicateList).toHaveBeenCalledTimes(1));
  view.navigate(B);await screen.findByLabelText('Nom de la liste');
  await act(async()=>{pending.resolve(mode==='duplicate'?'old-copy-A':mode==='language'?detail(A,{lang:'en'}):undefined);});
  expect(mockPush).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole('button',{name:/Dupliquer/}));
  await waitFor(()=>expect(duplicateList).toHaveBeenLastCalledWith(B, expect.objectContaining({ signal: expect.any(AbortSignal) })));
  expect(screen.getByLabelText('Nom de la liste')).toHaveValue(`Name ${B}`);
});
it('an A completion cannot release a newer B action lease',async()=>{
  const a=deferred<string>(),b=deferred<string>();jest.mocked(duplicateList).mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
  const view=page();fireEvent.click(await screen.findByRole('button',{name:/Dupliquer/}));
  await waitFor(()=>expect(duplicateList).toHaveBeenCalledTimes(1));
  view.navigate(B);await screen.findByLabelText('Nom de la liste');
  fireEvent.click(await screen.findByRole('button',{name:/Dupliquer/}));
  await waitFor(()=>expect(duplicateList).toHaveBeenCalledTimes(2));
  await act(async()=>{a.resolve('old-copy-A');});expect(mockPush).not.toHaveBeenCalled();
  expect(screen.getByRole('button',{name:/Dupliquer/})).toBeDisabled();
  fireEvent.click(await screen.findByRole('button',{name:/Dupliquer/}));expect(duplicateList).toHaveBeenCalledTimes(2);
  await act(async()=>{b.resolve('current-copy-B');});expect(mockPush).toHaveBeenCalledWith('/listes/current-copy-B');
});
