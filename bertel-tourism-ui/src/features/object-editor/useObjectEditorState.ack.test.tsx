import { act, renderHook, waitFor } from '@testing-library/react';
import { useObjectEditorState } from './useObjectEditorState';
import { cloneModules } from './editor-state';
import { fullModulesFixture } from './sections/section-fixture.test-utils';

beforeEach(() => window.localStorage.clear());

it('acknowledges B, retains C dirty in local recovery, then acknowledges the next save of C', async () => {
  const modules = fullModulesFixture();
  modules.generalInfo.name = 'A';
  const view = renderHook(() => useObjectEditorState('ack-object', modules, 'ack-user'));
  act(() => view.result.current.patchModule('generalInfo', { name: 'B' }));
  const sent = view.result.current.draft;
  act(() => view.result.current.patchModule('generalInfo', { name: 'C' }));
  act(() => view.result.current.commitModules(['generalInfo'], { sentModules: sent }));
  expect(view.result.current.baseline.generalInfo.name).toBe('B');
  expect(view.result.current.draft.generalInfo.name).toBe('C');
  expect(view.result.current.isDirty).toBe(true);
  const stored = JSON.parse(window.localStorage.getItem('object-editor-draft:ack-user:ack-object')!);
  expect(stored.baseline.generalInfo.name).toBe('B');
  expect(stored.draft.generalInfo.name).toBe('C');
  view.unmount();
  const server = cloneModules(modules);
  server.generalInfo.name = 'B';
  const recovered = renderHook(() => useObjectEditorState('ack-object', server, 'ack-user'));
  await waitFor(() => expect(recovered.result.current.draft.generalInfo.name).toBe('C'));
  expect(recovered.result.current.recoveryConflicts).toEqual([]);
  act(() => recovered.result.current.commitModules(['generalInfo'], { sentModules: recovered.result.current.draft }));
  expect(recovered.result.current.isDirty).toBe(false);
  expect(window.localStorage.getItem('object-editor-draft:ack-user:ack-object')).toBeNull();
});

it.each(['rooms', 'meetingRooms', 'places'] as const)('canonical %s acknowledges only sent children, retaining later additions, edits and removals', (key) => {
  const start = fullModulesFixture();
  const prototype = start[key].items[0];
  const idB = '00000000-0000-4000-a000-00000000b001';
  const idC = '00000000-0000-4000-a000-00000000c001';
  const knownKey = key === 'places' ? 'knownPlaceIds' : 'knownRoomIds';
  const options = key === 'places' ? { canonicalPlaces: true } : { canonicalRooms: true };
  const initial = { ...start, [key]: { ...start[key], items: [], [knownKey]: [] } };
  const { result } = renderHook(() => useObjectEditorState(`ack-${key}`, initial));
  const row = (id: string, name: string) => ({
    ...prototype, uid: id, recordId: key === 'meetingRooms' ? null : id, isNew: true, name, label: name,
  });
  act(() => result.current.replaceModule(key, { ...initial[key], items: [row(idB, 'B')] } as never));
  const sent = result.current.draft;
  act(() => result.current.replaceModule(key, { ...result.current.draft[key], items: [row(idC, 'C'), row(idB, 'Edited B')] } as never));
  act(() => result.current.commitModules([key], { ...options, sentModules: sent }));
  expect(result.current.baseline[key].items).toHaveLength(1);
  expect(result.current.baseline[key].items[0]).toMatchObject({ recordId: idB, isNew: false, name: 'B' });
  expect(result.current.draft[key].items[0]).toMatchObject({ isNew: true, name: 'C' });
  expect(result.current.draft[key].items[1]).toMatchObject({ recordId: idB, isNew: false, name: 'Edited B' });
  expect(result.current.draft[key]).toHaveProperty(knownKey, [idB]);
  expect(result.current.isDirty).toBe(true);
  // B was persisted, then removed while a second request was pending. Its ID
  // must remain known so the next writer can delete it; C is not yet persisted.
  const second = result.current.draft;
  act(() => result.current.replaceModule(key, { ...result.current.draft[key], items: [] } as never));
  act(() => result.current.commitModules([key], { ...options, sentModules: second }));
  expect(result.current.draft[key].items).toEqual([]);
  expect(result.current.draft[key]).toHaveProperty(knownKey, [idC, idB]);
  expect(result.current.isDirty).toBe(true);
  const third = result.current.draft;
  act(() => result.current.commitModules([key], { ...options, sentModules: third }));
  expect(result.current.isDirty).toBe(false);
  expect(result.current.draft[key]).toHaveProperty(knownKey, []);
});

it('an old account acknowledgement or status response cannot reactivate its draft', async () => {
  const modules = fullModulesFixture();
  const { result, rerender } = renderHook(({ userId }) => useObjectEditorState('identity-object', modules, userId), {
    initialProps: { userId: 'account-a' },
  });
  act(() => result.current.patchModule('generalInfo', { name: 'Old A sent' }));
  const old = result.current;
  rerender({ userId: 'account-b' });
  await waitFor(() => expect(result.current.draft.generalInfo.name).toBe(modules.generalInfo.name));
  act(() => {
    old.commitModules(['generalInfo'], { sentModules: old.draft });
    old.setSavedStatus('archived');
  });
  expect(result.current.baseline.generalInfo.name).toBe(modules.generalInfo.name);
  expect(result.current.draft.generalInfo.status).toBe(modules.generalInfo.status);
  expect(result.current.isDirty).toBe(false);
});
