import { renderHook, act } from '@testing-library/react';
import { useObjectEditorState } from './useObjectEditorState';
import type { ObjectWorkspaceModules } from '../../services/object-workspace-parser';

function fixtureModules(): ObjectWorkspaceModules {
  return {
    generalInfo: { name: 'A', commercialVisibility: 'full' },
    taxonomy: { assignments: [] },
    contacts: { objectItems: [] },
    location: { main: { addressLine1: 'x' } },
  } as unknown as ObjectWorkspaceModules;
}

describe('useObjectEditorState', () => {
  it('starts clean with draft equal to baseline', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fixtureModules()));
    expect(result.current.isDirty).toBe(false);
    expect(result.current.dirtySections.contacts).toBe(false);
  });

  it('replaceModule marks that module dirty', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fixtureModules()));
    act(() => {
      result.current.replaceModule('contacts', { objectItems: [{ id: 'c1' }] } as never);
    });
    expect(result.current.dirtySections.contacts).toBe(true);
    expect(result.current.isDirty).toBe(true);
  });

  it('resetModule reverts the draft slice to baseline', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fixtureModules()));
    act(() => result.current.replaceModule('contacts', { objectItems: [{ id: 'c1' }] } as never));
    act(() => result.current.resetModule('contacts'));
    expect(result.current.dirtySections.contacts).toBe(false);
  });

  it('commitModules folds the draft into the baseline so it reads clean', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fixtureModules()));
    act(() => result.current.replaceModule('contacts', { objectItems: [{ id: 'c1' }] } as never));
    act(() => result.current.commitModules(['contacts']));
    expect(result.current.dirtySections.contacts).toBe(false);
    expect(result.current.draft.contacts).toEqual({ objectItems: [{ id: 'c1' }] });
  });
});
