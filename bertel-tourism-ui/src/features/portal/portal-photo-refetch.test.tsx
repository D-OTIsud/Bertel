import { useCallback } from 'react';
import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { PhotosEditorRubric } from './rubrics/PhotosEditorRubric';
import { PORTAL_RUBRICS, type BuiltPortalRubric } from './portal-rubrics';
import { fullModulesFixture } from '../object-editor/sections/section-fixture.test-utils';
import { useObjectEditorState, type ObjectEditorState } from '../object-editor/useObjectEditorState';
import { galleryBaseline } from '../../services/media-write-contract';
import { getPortalPhotoWorkspace, type PortalPhotoWorkspace } from '../../services/portal-photos';
import { getApiClient, getSupabaseClient } from '../../lib/supabase';
import { useSessionStore } from '../../store/session-store';

jest.mock('../../lib/supabase', () => ({ getApiClient: jest.fn(() => null), getSupabaseClient: jest.fn(() => null) }));
jest.mock('../../services/portal-photos', () => ({
  ...jest.requireActual('../../services/portal-photos'),
  getPortalPhotoWorkspace: jest.fn(),
}));

const OBJECT_ID = 'ALBUM-REFETCH-SYNTHETIC';
const clients: QueryClient[] = [];
const originalFetch = global.fetch;

function freshModules(name = 'Fiche synthétique') {
  const modules = fullModulesFixture();
  modules.generalInfo.name = name;
  modules.media.objectItems = [];
  modules.media.unavailableReason = null;
  modules.media.galleryWriteBaseline = galleryBaseline(modules.media, []);
  return modules;
}

function emptyPhotoWorkspace(): PortalPhotoWorkspace {
  return {
    published: [], proposals: [], analysisEnabled: false, writesEnabled: true,
    orderSnapshot: [], orderNeedsNormalization: false,
    capacity: { limit: 20, published: 0, reserved: 0, used: 0, remaining: 20 },
  };
}

function setupPhotoFlow() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
  clients.push(client);
  let reads = 0;
  let merges = 0;
  let last = freshModules();
  let latestEditor: ObjectEditorState;
  const initialReadId = last.media.galleryWriteBaseline?.readId;
  const workspaceKey = ['object-workspace', OBJECT_ID, ['fr']];
  const photoKey = ['portal-photo-workspace', useSessionStore.getState().userId, OBJECT_ID];
  const invalidations = jest.spyOn(client, 'invalidateQueries');
  const onDirty = jest.fn();
  const onDone = jest.fn();
  const onCancel = jest.fn();

  function Flow() {
    const queryClient = useQueryClient();
    const workspace = useQuery({
      queryKey: workspaceKey,
      initialData: last,
      queryFn: async () => {
        reads++;
        // Match the loader's fresh gallery readId. Bound the failing case so a
        // regression terminates instead of keeping the Jest process refetching.
        if (reads <= 4) last = freshModules();
        return last;
      },
    });
    const editor = useObjectEditorState(OBJECT_ID, workspace.data);
    // The same merge/invalidation boundary used by PortalFicheEditor.
    const mergeSavedModule = useCallback<ObjectEditorState['mergeSavedModule']>((key, update) => {
      merges++;
      editor.mergeSavedModule(key, update);
      void queryClient.invalidateQueries({ queryKey: ['object-workspace', OBJECT_ID] });
      void queryClient.invalidateQueries({ queryKey: ['portal-fiches'] });
    }, [editor.mergeSavedModule, queryClient]);
    latestEditor = editor;
    return <PhotosEditorRubric editor={{ ...editor, mergeSavedModule }}
      rubric={{ ...PORTAL_RUBRICS.find((rubric) => rubric.id === 'photos')!, state: 'filled', readOnlyReason: null } as BuiltPortalRubric}
      archetype="RES" formKey="photos" onDone={onDone} onCancel={onCancel} onDirtyChange={onDirty} />;
  }

  render(<QueryClientProvider client={client}><Flow /></QueryClientProvider>);
  return {
    client, workspaceKey, photoKey, invalidations, initialReadId,
    get reads() { return reads; }, get merges() { return merges; }, get editor() { return latestEditor; },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  global.fetch = jest.fn().mockRejectedValue(new Error('External fetch is forbidden in this synthetic regression'));
  jest.mocked(getPortalPhotoWorkspace).mockResolvedValue(emptyPhotoWorkspace());
});

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  expect(global.fetch).not.toHaveBeenCalled();
  expect(getApiClient).not.toHaveBeenCalled();
  expect(getSupabaseClient).not.toHaveBeenCalled();
  global.fetch = originalFetch;
});

test('a photo merge does not refetch itself; explicit workspace and photo refreshes still work', async () => {
  const flow = setupPhotoFlow();
  await waitFor(() => expect(getPortalPhotoWorkspace).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(flow.client.isFetching()).toBe(0));
  expect(flow.reads).toBe(1);
  expect(flow.merges).toBe(1);
  expect(flow.invalidations).toHaveBeenCalledTimes(2);
  const afterInitialRead = flow.client.getQueryData<ReturnType<typeof freshModules>>(flow.workspaceKey)!;
  expect(afterInitialRead.media.galleryWriteBaseline?.readId).not.toBe(flow.initialReadId);

  await act(async () => { await flow.client.invalidateQueries({ queryKey: flow.workspaceKey }); });
  expect(flow.reads).toBe(2);
  expect(flow.merges).toBe(1);
  expect(flow.client.getQueryData<ReturnType<typeof freshModules>>(flow.workspaceKey)!.media.galleryWriteBaseline?.readId)
    .not.toBe(afterInitialRead.media.galleryWriteBaseline?.readId);

  const photo = {
    id: 'synthetic-published-photo', url: 'https://example.test/photo.jpg', title: 'Nouvelle photo',
    description: '', credit: '', position: 1, isMain: true, portalDocumentId: null,
    textSnapshot: { title: 'Nouvelle photo', description: '', title_i18n: {}, description_i18n: {}, revision: 'photo-revision-2' },
  };
  jest.mocked(getPortalPhotoWorkspace).mockResolvedValue({ ...emptyPhotoWorkspace(), published: [photo] });
  await act(async () => { await flow.client.invalidateQueries({ queryKey: flow.photoKey }); });
  await waitFor(() => expect(flow.client.isFetching()).toBe(0));
  expect(getPortalPhotoWorkspace).toHaveBeenCalledTimes(2);
  expect(flow.merges).toBe(2);
  expect(flow.reads).toBe(3);
  await waitFor(() => {
    expect(flow.editor.baseline.media.objectItems).toEqual([expect.objectContaining({ id: photo.id, title: photo.title })]);
    expect(flow.editor.draft.media.objectItems).toEqual([expect.objectContaining({ id: photo.id, title: photo.title })]);
  });
  expect(flow.merges).toBe(2);
  expect(flow.reads).toBe(3);
});

test.each([
  { transition: 'object', objectId: 'ALBUM-OBJECT-B', userId: 'synthetic-user-a' },
  { transition: 'account', objectId: 'ALBUM-OBJECT-A', userId: 'synthetic-user-b' },
])('merge identity survives a same-scope refetch and rejects an old response after an $transition change', ({ objectId, userId }) => {
  const first = freshModules('Fiche A');
  const { result, rerender } = renderHook((props) => useObjectEditorState(props.objectId, props.modules, props.userId), {
    initialProps: { objectId: 'ALBUM-OBJECT-A', modules: first, userId: 'synthetic-user-a' },
  });
  const mergeA = result.current.mergeSavedModule;
  act(() => result.current.patchModule('generalInfo', { name: 'Saisie locale A' }));
  rerender({ objectId: 'ALBUM-OBJECT-A', modules: freshModules('Serveur A relu'), userId: 'synthetic-user-a' });
  expect(result.current.mergeSavedModule).toBe(mergeA);
  expect(result.current.draft.generalInfo.name).toBe('Saisie locale A');

  rerender({ objectId, modules: freshModules('Fiche B'), userId });
  expect(result.current.mergeSavedModule).not.toBe(mergeA);
  expect(result.current.objectId).toBe(objectId);
  expect(result.current.draft.generalInfo.name).toBe('Fiche B');
  act(() => mergeA('generalInfo', (current) => ({ ...current, name: 'Réponse périmée A' })));
  expect(result.current.baseline.generalInfo.name).toBe('Fiche B');
  expect(result.current.draft.generalInfo.name).toBe('Fiche B');

  act(() => result.current.mergeSavedModule('generalInfo', (current) => ({ ...current, name: 'B enregistré' })));
  expect(result.current.baseline.generalInfo.name).toBe('B enregistré');
  expect(result.current.draft.generalInfo.name).toBe('B enregistré');
});
