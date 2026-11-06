import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useObjectEditorState } from './useObjectEditorState';
import { useEditorSave } from './useEditorSave';
import { useRestoreObjectVersionMutation } from '../../hooks/useExplorerQueries';
import { restoreObjectVersion } from '../../services/object-versions';
import { saveObjectWorkspaceGeneralInfo } from '../../services/object-workspace';
import { useSessionStore } from '../../store/session-store';
import { fullModulesFixture, allowAll } from './sections/section-fixture.test-utils';
import { cloneModules } from './editor-state';

jest.mock('../../lib/supabase', () => ({ getApiClient: jest.fn(() => null), getSupabaseClient: jest.fn(() => null) }));
jest.mock('../../services/object-versions', () => ({ ...jest.requireActual('../../services/object-versions'), restoreObjectVersion: jest.fn() }));
jest.mock('../../services/object-workspace', () => ({ ...jest.requireActual('../../services/object-workspace'), saveObjectWorkspaceGeneralInfo: jest.fn() }));
jest.mock('../../services/notification-delivery', () => ({ pingNotifyDrain: jest.fn() }));
jest.mock('../../services/write-compatibility', () => ({
  ...jest.requireActual('../../services/write-compatibility'),
  readWriteCompatibility: jest.fn(async () => ({ compatible: true, clientVersion: 2, minimumClientVersion: 2, serverWriteContractVersion: 2 })),
}));

const OBJECT_ID = 'HOT-RESTORE';
const USER_ID = 'restore-synthetic-user';
const DETAIL_KEY = ['object-detail', OBJECT_ID, ['fr']];
const WORKSPACE_KEY = ['object-workspace', OBJECT_ID, ['fr']];
const clients: QueryClient[] = [];

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((yes) => { resolve = yes; });
  return { promise, resolve };
}

function harness(initialName = 'A') {
  const initial = fullModulesFixture();
  initial.generalInfo.name = initialName;
  initial.generalInfo.status = 'draft';
  const server = cloneModules(initial);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  client.setQueryData(DETAIL_KEY, { generalInfo: initial.generalInfo });
  client.setQueryData(WORKSPACE_KEY, initial);
  const readDetail = jest.fn(async () => ({ generalInfo: cloneModules(server).generalInfo }));
  // Same dependency relationship as loadObjectWorkspace: a fresh detail is reused.
  // Only network reads are replaced; QueryClient, mutation and editor hooks are real.
  const readWorkspace = jest.fn(async () => {
    const detail = await client.fetchQuery({ queryKey: DETAIL_KEY, queryFn: readDetail, staleTime: 5 * 60 * 1000 });
    return { ...cloneModules(server), generalInfo: detail.generalInfo };
  });
  jest.mocked(restoreObjectVersion).mockImplementation(async () => { server.generalInfo.name = 'B'; });
  jest.mocked(saveObjectWorkspaceGeneralInfo).mockImplementation(async (_id, input) => {
    server.generalInfo.name = input.name;
    server.generalInfo.commercialVisibility = input.commercialVisibility;
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const view = renderHook(({ userId }) => {
    const workspace = useQuery({ queryKey: WORKSPACE_KEY, queryFn: readWorkspace, staleTime: Infinity });
    const editor = useObjectEditorState(OBJECT_ID, workspace.data!, userId);
    const restore = useRestoreObjectVersionMutation(OBJECT_ID);
    const saver = useEditorSave(OBJECT_ID);
    return { workspace, editor, restore, saver };
  }, { wrapper, initialProps: { userId: USER_ID } });
  return { ...view, client, server, initial, readDetail, readWorkspace };
}

beforeEach(() => {
  window.localStorage.clear();
  jest.clearAllMocks();
  useSessionStore.setState({ demoMode: false, userId: USER_ID, langPrefs: ['fr'] });
});
afterEach(() => { for (const client of clients.splice(0)) client.clear(); });

it('restoration invalidates detail before workspace, explicitly adopts B, and the next real save sends B rather than A', async () => {
  const view = harness();
  expect(view.result.current.editor.draft.generalInfo.name).toBe('A');
  await act(async () => { await view.result.current.restore.mutateAsync(2); });
  expect(view.readDetail).toHaveBeenCalledTimes(1);
  expect(view.readWorkspace).toHaveBeenCalledTimes(1);
  expect(view.client.getQueryData(WORKSPACE_KEY)).toMatchObject({ generalInfo: { name: 'B' } });
  await waitFor(() => expect(view.result.current.workspace.data?.generalInfo.name).toBe('B'));
  // Ordinary query changes still do not reset the editable snapshot.
  expect(view.result.current.editor.draft.generalInfo.name).toBe('A');
  act(() => view.result.current.editor.adoptRestoredModules(view.result.current.workspace.data!));
  expect(view.result.current.editor.baseline.generalInfo.name).toBe('B');
  expect(view.result.current.editor.draft.generalInfo.name).toBe('B');
  expect(view.result.current.editor.isDirty).toBe(false);
  act(() => view.result.current.editor.patchModule('generalInfo', { commercialVisibility: 'lapsed' }));
  const sent = view.result.current.editor.draft;
  await act(async () => {
    const outcome = await view.result.current.saver.save(['publication'], allowAll, sent);
    expect(outcome.saved).toEqual(['publication']);
    view.result.current.editor.commitModules(['generalInfo'], { sentModules: sent });
  });
  expect(saveObjectWorkspaceGeneralInfo).toHaveBeenCalledWith(OBJECT_ID, expect.objectContaining({ name: 'B', commercialVisibility: 'lapsed' }));
  expect(view.server.generalInfo.name).toBe('B');
});

it('retains C entered during the restore RPC, and exposes conflicts without changing media, prices, hours or status', async () => {
  const view = harness();
  const response = deferred();
  jest.mocked(restoreObjectVersion).mockImplementation(async () => {
    await response.promise;
    view.server.generalInfo.name = 'B';
    // These must not be adopted as if this canonical restore had changed them.
    view.server.generalInfo.status = 'archived';
    view.server.media.objectItems = [];
    view.server.pricing.prices = [];
    view.server.openings.periods = [];
  });
  let restoring!: Promise<unknown>;
  act(() => { restoring = view.result.current.restore.mutateAsync(2); });
  await waitFor(() => expect(restoreObjectVersion).toHaveBeenCalledTimes(1));
  act(() => view.result.current.editor.patchModule('generalInfo', { name: 'C' }));
  const local = view.result.current.editor.draft;
  await act(async () => { response.resolve(); await restoring; });
  await waitFor(() => expect(view.result.current.workspace.data?.generalInfo.name).toBe('B'));
  act(() => view.result.current.editor.adoptRestoredModules(view.result.current.workspace.data!));
  expect(view.result.current.editor.baseline.generalInfo.name).toBe('B');
  expect(view.result.current.editor.draft.generalInfo).toMatchObject({ name: 'C', status: 'draft' });
  expect(view.result.current.editor.recoveryConflicts).toContain('generalInfo.name');
  expect(view.result.current.editor.draft.media).toEqual(local.media);
  expect(view.result.current.editor.draft.pricing).toEqual(local.pricing);
  expect(view.result.current.editor.draft.openings).toEqual(local.openings);
  expect(view.result.current.editor.isDirty).toBe(true);
  const stored = JSON.parse(window.localStorage.getItem(`object-editor-draft:${USER_ID}:${OBJECT_ID}`)!);
  expect(stored.baseline.generalInfo.name).toBe('B');
  expect(stored.draft.generalInfo.name).toBe('C');
  act(() => view.result.current.editor.keepRecoveredDraft());
  expect(view.result.current.editor.recoveryConflicts).toEqual([]);
  expect(view.result.current.editor.baseline.generalInfo.name).toBe('B');
  expect(view.result.current.editor.draft.generalInfo.name).toBe('C');
  expect(view.result.current.editor.isDirty).toBe(true);
  expect(saveObjectWorkspaceGeneralInfo).not.toHaveBeenCalled(); // Explicit saving is still required.
});

it('the existing server choice uses restored B and clears its module conflict', async () => {
  const view = harness();
  act(() => view.result.current.editor.patchModule('generalInfo', { name: 'C' }));
  await act(async () => { await view.result.current.restore.mutateAsync(2); });
  await waitFor(() => expect(view.result.current.workspace.data?.generalInfo.name).toBe('B'));
  act(() => view.result.current.editor.adoptRestoredModules(view.result.current.workspace.data!));
  expect(view.result.current.editor.recoveryConflicts).toContain('generalInfo.name');
  act(() => view.result.current.editor.resetModule('generalInfo'));
  expect(view.result.current.editor.draft.generalInfo.name).toBe('B');
  expect(view.result.current.editor.recoveryConflicts).toEqual([]);
  expect(view.result.current.editor.isDirty).toBe(false);
  view.unmount();
  const reloaded = harness('B');
  expect(reloaded.result.current.editor.draft.generalInfo.name).toBe('B');
  expect(reloaded.result.current.editor.recoveryConflicts).toEqual([]);
  expect(reloaded.result.current.editor.isDirty).toBe(false);
});

it('unresolved restore conflicts survive reload, while the local choice survives a later reload without automatically saving C', async () => {
  const view = harness();
  act(() => view.result.current.editor.patchModule('generalInfo', { name: 'C' }));
  await act(async () => { await view.result.current.restore.mutateAsync(2); });
  await waitFor(() => expect(view.result.current.workspace.data?.generalInfo.name).toBe('B'));
  act(() => view.result.current.editor.adoptRestoredModules(view.result.current.workspace.data!));
  expect(view.result.current.editor.recoveryConflicts).toContain('generalInfo.name');
  view.unmount();
  const conflicted = harness('B');
  await waitFor(() => expect(conflicted.result.current.editor.draft.generalInfo.name).toBe('C'));
  expect(conflicted.result.current.editor.baseline.generalInfo.name).toBe('B');
  expect(conflicted.result.current.editor.recoveryConflicts).toContain('generalInfo.name');
  act(() => conflicted.result.current.editor.keepRecoveredDraft());
  expect(conflicted.result.current.editor.recoveryConflicts).toEqual([]);
  conflicted.unmount();
  const kept = harness('B');
  await waitFor(() => expect(kept.result.current.editor.draft.generalInfo.name).toBe('C'));
  expect(kept.result.current.editor.baseline.generalInfo.name).toBe('B');
  expect(kept.result.current.editor.recoveryConflicts).toEqual([]);
  expect(kept.result.current.editor.isDirty).toBe(true);
  expect(saveObjectWorkspaceGeneralInfo).not.toHaveBeenCalled();
});

it('validates optional schema1 conflict metadata while retaining usable local edits', () => {
  const base = fullModulesFixture();
  const draft = cloneModules(base);
  draft.generalInfo.name = 'C';
  window.localStorage.setItem('object-editor-draft:metadata-user:metadata-object', JSON.stringify({
    schemaVersion: 1, objectId: 'metadata-object', baseline: base, draft,
    recoveryConflicts: ['generalInfo.name', 'generalInfo.name', '__proto__.invalid', 17, null],
  }));
  const { result } = renderHook(() => useObjectEditorState('metadata-object', base, 'metadata-user'));
  expect(result.current.draft.generalInfo.name).toBe('C');
  expect(result.current.recoveryConflicts).toEqual(['generalInfo.name']);
});

it('a rejected restore neither refetches nor changes the editor snapshot', async () => {
  const view = harness();
  jest.mocked(restoreObjectVersion).mockRejectedValueOnce(new Error('Synthetic restore rejection'));
  act(() => view.result.current.editor.patchModule('generalInfo', { name: 'C' }));
  await act(async () => { await expect(view.result.current.restore.mutateAsync(2)).rejects.toThrow('Synthetic restore rejection'); });
  expect(view.readWorkspace).not.toHaveBeenCalled();
  expect(view.readDetail).not.toHaveBeenCalled();
  expect(view.result.current.editor.baseline.generalInfo.name).toBe('A');
  expect(view.result.current.editor.draft.generalInfo.name).toBe('C');
});

it('a failed post-restore read does not pretend A is restored B; retry returns a usable B', async () => {
  const view = harness();
  view.readDetail.mockRejectedValueOnce(new Error('Synthetic reload failure'));
  await act(async () => { await view.result.current.restore.mutateAsync(2); });
  await waitFor(() => expect(view.result.current.workspace.isError).toBe(true));
  expect(view.result.current.workspace.data?.generalInfo.name).toBe('A');
  expect(view.result.current.editor.baseline.generalInfo.name).toBe('A');
  expect(saveObjectWorkspaceGeneralInfo).not.toHaveBeenCalled();
  await act(async () => { await view.result.current.workspace.refetch(); });
  await waitFor(() => expect(view.result.current.workspace.isSuccess).toBe(true));
  act(() => view.result.current.editor.adoptRestoredModules(view.result.current.workspace.data!));
  expect(view.result.current.editor.draft.generalInfo.name).toBe('B');
});

it('an ordinary successful refetch preserves the draft and does not adopt B without an explicit restoration transition', async () => {
  const view = harness();
  act(() => view.result.current.editor.patchModule('generalInfo', { name: 'C' }));
  view.server.generalInfo.name = 'B';
  await act(async () => {
    await view.client.invalidateQueries({ queryKey: DETAIL_KEY });
    await view.result.current.workspace.refetch();
  });
  await waitFor(() => expect(view.result.current.workspace.data?.generalInfo.name).toBe('B'));
  expect(view.result.current.editor.baseline.generalInfo.name).toBe('A');
  expect(view.result.current.editor.draft.generalInfo.name).toBe('C');
});

it('an adoption or local-conflict decision captured by the old account cannot reactivate it', async () => {
  const view = harness();
  const old = view.result.current.editor;
  view.rerender({ userId: 'another-synthetic-user' });
  await waitFor(() => expect(view.result.current.editor.isDirty).toBe(false));
  const restored = cloneModules(view.initial);
  restored.generalInfo.name = 'B';
  act(() => { old.adoptRestoredModules(restored); old.keepRecoveredDraft(); });
  expect(view.result.current.editor.draft.generalInfo.name).toBe('A');
});
