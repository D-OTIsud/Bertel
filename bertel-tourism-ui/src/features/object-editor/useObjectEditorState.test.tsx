import { renderHook, act, waitFor } from '@testing-library/react';
import { useObjectEditorState } from './useObjectEditorState';
import type { ObjectWorkspaceModules } from '../../services/object-workspace-parser';

function fixtureModules(): ObjectWorkspaceModules {
  return {
    generalInfo: { name: 'A', commercialVisibility: 'full', status: 'draft' },
    taxonomy: { assignments: [] },
    contacts: { objectItems: [] },
    location: { main: { addressLine1: 'x' } },
    publication: { status: 'draft' },
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

  it('canonical room commit records stable IDs and clears the new-row marker', () => {
    const start = { ...fixtureModules(), rooms: { items: [], knownRoomIds: [] } } as unknown as ObjectWorkspaceModules;
    const { result } = renderHook(() => useObjectEditorState('o1', start));
    act(() => result.current.replaceModule('rooms', {
      ...start.rooms,
      items: [{ recordId: null, uid: 'room-uuid', isNew: true }],
    } as never));
    act(() => result.current.commitModules(['rooms'], { canonicalRooms: true }));
    expect(result.current.draft.rooms.knownRoomIds).toEqual(['room-uuid']);
    expect(result.current.draft.rooms.items[0]).toMatchObject({ uid: 'room-uuid', isNew: false });
    expect(result.current.isDirty).toBe(false);
  });

  it('canonical place commit records IDs only for a direct-save commit', () => {
    const start = { ...fixtureModules(), places: { items: [], knownPlaceIds: [], unavailableReason: null } } as unknown as ObjectWorkspaceModules;
    const direct = renderHook(() => useObjectEditorState('o1', start));
    act(() => direct.result.current.replaceModule('places', {
      ...start.places,
      items: [{ recordId: 'place-uuid', isNew: true }],
    } as never));
    act(() => direct.result.current.commitModules(['places'], { canonicalPlaces: true }));
    expect(direct.result.current.draft.places.knownPlaceIds).toEqual(['place-uuid']);
    expect(direct.result.current.draft.places.items[0]).toMatchObject({ recordId: 'place-uuid', isNew: false });
    expect(direct.result.current.isDirty).toBe(false);

    const proposal = renderHook(() => useObjectEditorState('o2', start));
    act(() => proposal.result.current.replaceModule('places', {
      ...start.places,
      items: [{ recordId: 'proposal-uuid', isNew: true }],
    } as never));
    act(() => proposal.result.current.commitModules(['places']));
    expect(proposal.result.current.draft.places.knownPlaceIds).toEqual([]);
    expect(proposal.result.current.draft.places.items[0]).toMatchObject({ recordId: 'proposal-uuid', isNew: true });
  });

  it.each([['another account', 'account-b'], ['signed out', null]])('drops the prior in-memory draft after switching to %s', async (_label, nextUserId) => {
    window.localStorage.clear();
    const modules = fixtureModules();
    const { result, rerender } = renderHook(
      ({ userId }: { userId: string | null }) => useObjectEditorState('o1', modules, userId),
      { initialProps: { userId: 'account-a' as string | null } },
    );
    act(() => result.current.replaceModule('contacts', { objectItems: [{ id: 'private-to-a' }] } as never));
    await waitFor(() => expect(window.localStorage.getItem('object-editor-draft:account-a:o1')).not.toBeNull());

    rerender({ userId: nextUserId });
    await waitFor(() => expect(result.current.draft.contacts).toEqual(modules.contacts));
    expect(result.current.isDirty).toBe(false);
    expect(result.current.recoveryConflicts).toEqual([]);
    expect(window.localStorage.getItem('object-editor-draft:account-a:o1')).not.toBeNull();
    if (nextUserId) expect(window.localStorage.getItem('object-editor-draft:account-b:o1')).toBeNull();
  });

  it('ignores malformed persisted snapshots without crashing or hydrating them', async () => {
    window.localStorage.setItem('object-editor-draft:account-a:o1', JSON.stringify({
      schemaVersion: 1,
      objectId: 'o1',
      baseline: [],
      draft: [],
    }));
    const modules = fixtureModules();
    const { result } = renderHook(() => useObjectEditorState('o1', modules, 'account-a'));
    await waitFor(() => expect(result.current.draft).toEqual(modules));
    expect(result.current.isDirty).toBe(false);
    expect(result.current.recoveryConflicts).toEqual([]);
  });

  it('rejects stored module slices whose server-shaped arrays are malformed', async () => {
    window.localStorage.setItem('object-editor-draft:account-a:o1', JSON.stringify({
      schemaVersion: 1,
      objectId: 'o1',
      baseline: {
        ...fixtureModules(),
        taxonomy: { assignments: {} },
        contacts: { objectItems: null },
      },
      draft: {
        ...fixtureModules(),
        taxonomy: { assignments: {} },
        contacts: { objectItems: null },
      },
    }));
    const modules = fixtureModules();
    const { result } = renderHook(() => useObjectEditorState('o1', modules, 'account-a'));
    await waitFor(() => expect(result.current.draft).toEqual(modules));
    expect(result.current.isDirty).toBe(false);
  });

  it('setSavedStatus updates status in draft AND baseline without marking dirty', () => {
    const { result } = renderHook(() => useObjectEditorState('HOTRUN1', fixtureModules()));

    act(() => result.current.setSavedStatus('published'));

    expect((result.current.draft.generalInfo as { status?: string }).status).toBe('published');
    expect((result.current.draft.publication as { status?: string }).status).toBe('published');
    // It is the new clean truth — not a pending edit:
    expect(result.current.isDirty).toBe(false);
  });
});
