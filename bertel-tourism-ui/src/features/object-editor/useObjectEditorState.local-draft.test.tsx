import { act, renderHook } from '@testing-library/react';
import { useObjectEditorState } from './useObjectEditorState';
import { fullModulesFixture } from './sections/section-fixture.test-utils';

const key = (user = 'storage-user', object = 'storage-object') => `object-editor-draft:${user}:${object}`;

beforeEach(() => { window.localStorage.clear(); });
afterEach(() => { jest.restoreAllMocks(); });

it('retains the last recovery copy and current typing after quota failure, then persists and recovers the next successful edit', () => {
  const modules = fullModulesFixture();
  modules.generalInfo.name = 'A';
  const view = renderHook(() => useObjectEditorState('storage-object', modules, 'storage-user'));
  expect(view.result.current.localDraftUnavailable).toBe(false);
  act(() => view.result.current.patchModule('generalInfo', { name: 'B' }));
  const lastStored = window.localStorage.getItem(key());
  const write = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
  act(() => view.result.current.patchModule('generalInfo', { name: 'C' }));
  expect(view.result.current.localDraftUnavailable).toBe(true);
  expect(view.result.current.baseline.generalInfo.name).toBe('A');
  expect(view.result.current.draft.generalInfo.name).toBe('C');
  expect(view.result.current.isDirty).toBe(true);
  expect(window.localStorage.getItem(key())).toBe(lastStored);
  view.rerender();
  expect(view.result.current.localDraftUnavailable).toBe(true);
  act(() => view.result.current.patchModule('generalInfo', { name: 'D' }));
  expect(view.result.current.draft.generalInfo.name).toBe('D');
  expect(view.result.current.localDraftUnavailable).toBe(true);
  write.mockRestore();
  act(() => view.result.current.patchModule('generalInfo', { name: 'E' }));
  expect(view.result.current.localDraftUnavailable).toBe(false);
  expect(JSON.parse(window.localStorage.getItem(key())!).draft.generalInfo.name).toBe('E');
  view.unmount();
  const recovered = renderHook(() => useObjectEditorState('storage-object', modules, 'storage-user'));
  expect(recovered.result.current.draft.generalInfo.name).toBe('E');
  expect(recovered.result.current.isDirty).toBe(true);
});

it('keeps editing when access to Storage itself is denied, and clears the warning when a later write succeeds', () => {
  const access = jest.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
  const modules = fullModulesFixture();
  const view = renderHook(() => useObjectEditorState('storage-object', modules, 'storage-user'));
  expect(view.result.current.localDraftUnavailable).toBe(true);
  act(() => view.result.current.patchModule('generalInfo', { name: 'Retained in this tab' }));
  expect(view.result.current.draft.generalInfo.name).toBe('Retained in this tab');
  expect(view.result.current.isDirty).toBe(true);
  access.mockRestore();
  view.rerender();
  expect(view.result.current.localDraftUnavailable).toBe(true);
  act(() => view.result.current.patchModule('generalInfo', { name: 'Now persisted' }));
  expect(view.result.current.localDraftUnavailable).toBe(false);
  expect(JSON.parse(window.localStorage.getItem(key())!).draft.generalInfo.name).toBe('Now persisted');
});

it('does not remove an unreadable previous recovery copy when getItem fails but removeItem would work', () => {
  const modules = fullModulesFixture();
  modules.generalInfo.name = 'A';
  const previous = renderHook(() => useObjectEditorState('storage-object', modules, 'storage-user'));
  act(() => previous.result.current.patchModule('generalInfo', { name: 'Previous local B' }));
  previous.unmount();
  const read = Storage.prototype.getItem;
  const stored = read.call(window.localStorage, key());
  const get = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
  const remove = jest.spyOn(Storage.prototype, 'removeItem');
  const view = renderHook(() => useObjectEditorState('storage-object', modules, 'storage-user'));
  expect(read.call(window.localStorage, key())).toBe(stored);
  expect(remove).not.toHaveBeenCalled();
  expect(view.result.current.localDraftUnavailable).toBe(true);
  expect(view.result.current.draft.generalInfo.name).toBe('A');
  view.rerender();
  expect(view.result.current.localDraftUnavailable).toBe(true);
  get.mockRestore();
  view.unmount();
  const recovered = renderHook(() => useObjectEditorState('storage-object', modules, 'storage-user'));
  expect(recovered.result.current.draft.generalInfo.name).toBe('Previous local B');
  expect(recovered.result.current.localDraftUnavailable).toBe(false);
});

it('does not hydrate an initially unreadable B over C when Storage becomes readable later', () => {
  const modules = fullModulesFixture();
  modules.generalInfo.name = 'A';
  const previous = renderHook(() => useObjectEditorState('storage-object', modules, 'storage-user'));
  act(() => previous.result.current.patchModule('generalInfo', { name: 'Previous local B' }));
  previous.unmount();
  const stored = window.localStorage.getItem(key());
  const get = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
  const write = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
  const view = renderHook(() => useObjectEditorState('storage-object', modules, 'storage-user'));
  act(() => view.result.current.patchModule('generalInfo', { name: 'Current local C' }));
  get.mockRestore();
  write.mockRestore();
  view.rerender();
  expect(view.result.current.draft.generalInfo.name).toBe('Current local C');
  expect(view.result.current.localDraftUnavailable).toBe(true);
  expect(window.localStorage.getItem(key())).toBe(stored);
  act(() => view.result.current.patchModule('generalInfo', { name: 'Current local D' }));
  expect(view.result.current.localDraftUnavailable).toBe(false);
  expect(JSON.parse(window.localStorage.getItem(key())!).draft.generalInfo.name).toBe('Current local D');
});

it('a network acknowledgement does not hide a failed local removal, and a later successful existing removal clears it', () => {
  const modules = fullModulesFixture();
  const view = renderHook(() => useObjectEditorState('storage-object', modules, 'storage-user'));
  act(() => view.result.current.patchModule('generalInfo', { name: 'B' }));
  const stored = window.localStorage.getItem(key());
  const remove = jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
  act(() => view.result.current.commitModules(['generalInfo'], { sentModules: view.result.current.draft }));
  expect(view.result.current.isDirty).toBe(false);
  expect(view.result.current.draft.generalInfo.name).toBe('B');
  expect(view.result.current.localDraftUnavailable).toBe(true);
  expect(window.localStorage.getItem(key())).toBe(stored);
  remove.mockRestore();
  act(() => view.result.current.setSavedStatus('draft'));
  expect(view.result.current.localDraftUnavailable).toBe(false);
  expect(window.localStorage.getItem(key())).toBeNull();
});

it.each([{ user: 'other-user', object: 'storage-object' }, { user: 'storage-user', object: 'other-object' }])(
  'does not transfer failed storage state or drafts to identity $user/$object', ({ user, object }) => {
    const modules = fullModulesFixture();
    modules.generalInfo.name = 'A';
    const realWrite = Storage.prototype.setItem;
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, name, value) {
      if (name === key()) throw new DOMException('full', 'QuotaExceededError');
      realWrite.call(this, name, value);
    });
    const observed: Array<{ user: string; object: string; name: string; unavailable: boolean }> = [];
    const view = renderHook(({ user, object }) => {
      const editor = useObjectEditorState(object, modules, user);
      observed.push({ user, object, name: editor.draft.generalInfo.name, unavailable: editor.localDraftUnavailable });
      return editor;
    }, { initialProps: { user: 'storage-user', object: 'storage-object' } });
    act(() => view.result.current.patchModule('generalInfo', { name: 'Private local C' }));
    expect(view.result.current.localDraftUnavailable).toBe(true);
    view.rerender({ user, object });
    expect(observed.filter((entry) => entry.user === user && entry.object === object).every((entry) => entry.name === 'A' && !entry.unavailable)).toBe(true);
    act(() => view.result.current.patchModule('generalInfo', { name: 'Other draft' }));
    expect(view.result.current.localDraftUnavailable).toBe(false);
    expect(JSON.parse(window.localStorage.getItem(key(user, object))!).draft.generalInfo.name).toBe('Other draft');
    expect(window.localStorage.getItem(key())).toBeNull();
  },
);

it('storage failure and recovery leave a restoration conflict and its local value unchanged', () => {
  const modules = fullModulesFixture();
  modules.generalInfo.name = 'A';
  const view = renderHook(() => useObjectEditorState('storage-object', modules, 'storage-user'));
  act(() => view.result.current.patchModule('generalInfo', { name: 'C' }));
  const write = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
  act(() => view.result.current.adoptRestoredModules({ ...modules, generalInfo: { ...modules.generalInfo, name: 'B' } }));
  expect(view.result.current.localDraftUnavailable).toBe(true);
  expect(view.result.current.recoveryConflicts).toContain('generalInfo.name');
  expect(view.result.current.draft.generalInfo.name).toBe('C');
  expect(view.result.current.baseline.generalInfo.name).toBe('B');
  write.mockRestore();
  act(() => view.result.current.patchModule('generalInfo', { businessTimezone: 'Europe/Paris' }));
  expect(view.result.current.localDraftUnavailable).toBe(false);
  expect(view.result.current.recoveryConflicts).toContain('generalInfo.name');
  expect(JSON.parse(window.localStorage.getItem(key())!).recoveryConflicts).toContain('generalInfo.name');
  expect(view.result.current.draft.generalInfo.name).toBe('C');
});
