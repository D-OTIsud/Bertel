import { renderHook, act, waitFor } from '@testing-library/react';
import { useObjectEditorState } from './useObjectEditorState';
import type { ObjectWorkspaceModules } from '../../services/object-workspace-parser';
import { fullModulesFixture } from './sections/section-fixture.test-utils';
import { cloneModules } from './editor-state';
import { stripCatalogOptions } from './io/object-io-serialize';

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
  it('ignores a late acknowledgement from the previous object', () => {
    const modules = fullModulesFixture();
    const { result, rerender } = renderHook(({ id }) => useObjectEditorState(id, modules), { initialProps: { id: 'HOT-FIRST' } });
    const acknowledgeFirst = result.current.mergeSavedModule;
    rerender({ id: 'HOT-SECOND' });
    act(() => result.current.patchModule('generalInfo', { name: 'Travail seconde fiche' }));
    act(() => acknowledgeFirst('generalInfo', (current) => ({ ...current, name: 'Ancienne réponse' })));
    expect(result.current.objectId).toBe('HOT-SECOND');
    expect(result.current.draft.generalInfo.name).toBe('Travail seconde fiche');
  });
  it('rebases saved fields without acknowledging other local edits to the same module', () => {
    const modules = fullModulesFixture();
    const { result } = renderHook(() => useObjectEditorState('HOT-REBASE', modules));
    const oldPets = { ...modules.capacityPolicies.petPolicy };
    act(() => result.current.patchModule('capacityPolicies', { petPolicy: { accepted: true, conditions: 'Demande locale' } }));
    act(() => result.current.mergeSavedModule('capacityPolicies', (current) => ({ ...current, stayPolicy: { ...current.stayPolicy, checkInFrom: '15:00' } })));
    expect(result.current.baseline.capacityPolicies.stayPolicy.checkInFrom).toBe('15:00');
    expect(result.current.draft.capacityPolicies.stayPolicy.checkInFrom).toBe('15:00');
    expect(result.current.baseline.capacityPolicies.petPolicy).toEqual(oldPets);
    expect(result.current.draft.capacityPolicies.petPolicy.conditions).toBe('Demande locale');
    expect(result.current.dirtySections['capacity-policies']).toBe(true);
  });
  it('keeps stale hidden edits in recovery storage without blocking the itinerary', async () => {
    const modules = fullModulesFixture();
    const draft = cloneModules(modules);
    draft.rooms.items[0].name = 'Ancien brouillon conservé';
    window.localStorage.setItem('object-editor-draft:account-hidden:ITI2', JSON.stringify({
      schemaVersion: 1, objectId: 'ITI2', baseline: stripCatalogOptions(modules), draft: stripCatalogOptions(draft),
    }));
    const { result } = renderHook(() => useObjectEditorState('ITI2', modules, 'account-hidden', ['rooms']));
    await waitFor(() => expect(result.current.draft.rooms.items[0].name).toBe('Ancien brouillon conservé'));
    expect(result.current.isDirty).toBe(false);
    expect(result.current.dirtySections.rooms).toBe(false);
    const stored = JSON.parse(window.localStorage.getItem('object-editor-draft:account-hidden:ITI2')!);
    expect(stored.draft.rooms.items[0].name).toBe('Ancien brouillon conservé');
  });

  it('keeps applicable recovery conflicts while excluding conflicts in an inapplicable module', async () => {
    const baseline = fullModulesFixture();
    const draft = cloneModules(baseline);
    const modules = cloneModules(baseline);
    draft.rooms.items[0].name = 'Chambre locale';
    modules.rooms.items[0].name = 'Chambre serveur';
    draft.itinerary.access = 'Accès local';
    modules.itinerary.access = 'Accès serveur';
    window.localStorage.setItem('object-editor-draft:account-conflict:ITI3', JSON.stringify({
      schemaVersion: 1, objectId: 'ITI3', baseline: stripCatalogOptions(baseline), draft: stripCatalogOptions(draft),
    }));
    const { result } = renderHook(() => useObjectEditorState('ITI3', modules, 'account-conflict', ['rooms']));
    await waitFor(() => expect(result.current.draft.itinerary.access).toBe('Accès local'));
    expect(result.current.recoveryConflicts).toEqual(['itinerary.access']);
    expect(result.current.draft.rooms.items[0].name).toBe('Chambre locale');
  });
  it('restores every module catalog without marking untouched itinerary sections dirty', async () => {
    const modules = fullModulesFixture();
    const draft = cloneModules(modules);
    draft.itinerary.stages[0].description = 'Étape du brouillon à conserver';
    window.localStorage.setItem('object-editor-draft:account-iti:ITI1', JSON.stringify({
      schemaVersion: 1, objectId: 'ITI1', baseline: stripCatalogOptions(modules), draft: stripCatalogOptions(draft),
    }));
    const { result } = renderHook(() => useObjectEditorState('ITI1', modules, 'account-iti'));
    await waitFor(() => expect(result.current.draft.itinerary.stages[0].description).toBe('Étape du brouillon à conserver'));
    expect(result.current.draft.rooms.roomTypeOptions).toEqual(modules.rooms.roomTypeOptions);
    expect(result.current.draft.itinerary.stageKindOptions).toEqual(modules.itinerary.stageKindOptions);
    expect(result.current.draft.cuisine.options).toEqual(modules.cuisine.options);
    expect(result.current.draft.taxonomy.domains).toEqual(modules.taxonomy.domains);
    expect(Object.entries(result.current.dirtySections).filter(([, dirty]) => dirty).map(([key]) => key)).toEqual(['itinerary']);
  });
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
