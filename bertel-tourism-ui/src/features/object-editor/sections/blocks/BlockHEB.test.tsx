import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../../useObjectEditorState';
import { BlockHEB } from './BlockHEB';
import { allowAll, fullModulesFixture } from '../section-fixture.test-utils';

describe('BlockHEB pet policy (moved to §07 — PO 2026-06-11)', () => {
  it('renders no pet-policy controls; the §07 note carries the animals summary', () => {
    const modules = fullModulesFixture();
    modules.capacityPolicies.petPolicy.accepted = true;
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    render(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);

    expect(screen.queryByLabelText('Animaux acceptés')).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Conditions d'accueil des animaux")).not.toBeInTheDocument();
    // Single-owner pointer (§48 pattern): the note names §07 and reflects the state.
    expect(screen.getByText(/Capacité & contenance/)).toBeInTheDocument();
    expect(screen.getByText(/Animaux acceptés/)).toBeInTheDocument();
  });
});

describe('BlockHEB room edit modal', () => {
  it('opens the room edit modal and persists per-room amenity changes', () => {
    const modules = fullModulesFixture();
    modules.rooms.amenityOptions = [{ id: 'wifi', code: 'wifi', label: 'Wi-Fi' }, { id: 'ac', code: 'ac', label: 'Clim' }];
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    const view = render(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Modifier la chambre/i })); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Clim' })); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' })); });
    view.rerender(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);
    expect(result.current.draft.rooms.items[0].amenityCodes).toContain('ac');
  });
});

describe('BlockHEB meeting-room edit modal', () => {
  it('opens the meeting-room edit modal and persists equipment changes', () => {
    const modules = fullModulesFixture();
    modules.meetingRooms.equipmentOptions = [{ id: 'e1', code: 'projector', label: 'Vidéoprojecteur' }];
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    const view = render(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Modifier la salle/i })); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Vidéoprojecteur' })); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' })); });
    view.rerender(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);
    expect(result.current.draft.meetingRooms.items[0].equipmentCodes).toContain('projector');
  });
});

describe('BlockHEB — single-owner surfaces (§48)', () => {
  it('no longer edits the group policy in §05 (owned by §07)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);

    expect(screen.queryByText('Groupes — min')).not.toBeInTheDocument();
    expect(screen.queryByText('Groupes — max')).not.toBeInTheDocument();
    expect(screen.queryByText('Notes groupes')).not.toBeInTheDocument();
    expect(screen.queryByText('Groupes uniquement')).not.toBeInTheDocument();
    expect(screen.getByText(/Géré dans la section 07/)).toBeInTheDocument();
  });

  it('no longer hosts the pet policy (single owner = §07, PO 2026-06-11)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);

    expect(screen.queryByLabelText('Animaux acceptés')).not.toBeInTheDocument();
  });
});

describe('BlockHEB — §05 review fixes (2026-06-11)', () => {
  it('labels the boardroom capacity Conseil, never Banquet', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);
    expect(screen.getByText('Conseil')).toBeInTheDocument();
    expect(screen.queryByText(/banquet/i)).not.toBeInTheDocument();
  });

  it('lets the meeting modal edit the capacité en U', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Modifier la salle/i })); });
    act(() => { fireEvent.change(screen.getByLabelText('Capacité en U'), { target: { value: '24' } }); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' })); });
    view.rerender(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);
    expect(result.current.draft.meetingRooms.items[0].capacityU).toBe('24');
  });

  it('lets the room modal edit adults and children capacities', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Modifier la chambre/i })); });
    act(() => { fireEvent.change(screen.getByLabelText('Adultes'), { target: { value: '3' } }); });
    act(() => { fireEvent.change(screen.getByLabelText('Enfants'), { target: { value: '1' } }); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' })); });
    view.rerender(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);
    expect(result.current.draft.rooms.items[0].capacityAdults).toBe('3');
    expect(result.current.draft.rooms.items[0].capacityChildren).toBe('1');
  });

  it('renders accessible delete buttons, not bare ×', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);
    const dels = screen.getAllByRole('button', { name: 'Supprimer' });
    expect(dels.length).toBeGreaterThanOrEqual(2);
    dels.forEach((del) => expect(del.textContent?.trim()).not.toBe('×'));
  });

  it('generates non-colliding room codes when adding after a delete', () => {
    const modules = fullModulesFixture();
    modules.rooms.items = [
      { ...modules.rooms.items[0], code: 'unit-1' },
      { ...modules.rooms.items[0], recordId: 'r2', code: 'unit-2' },
    ];
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    const view = render(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);

    // Delete the FIRST room — items.length is back to 1, but 'unit-2' still exists.
    act(() => { fireEvent.click(screen.getAllByRole('button', { name: 'Supprimer' })[0]); });
    view.rerender(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);
    // Add now goes through the modal: open then save.
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Ajouter un type de chambre/i })); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' })); });
    view.rerender(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);

    const codes = result.current.draft.rooms.items.map((item) => item.code);
    expect(codes).toHaveLength(2);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('gives rooms a real drag handle; meeting rooms none (order not persisted)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);
    // Fixture: 1 room, 1 meeting room — exactly ONE real handle (the room's).
    expect(screen.getAllByRole('button', { name: 'Déplacer' })).toHaveLength(1);
  });

  it('shows a Non applicable pill instead of "0 type(s)" when rooms are gated', () => {
    const modules = fullModulesFixture();
    modules.rooms.items = [];
    modules.rooms.unavailableReason = 'Module non applicable au type RES.';
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    render(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);
    expect(screen.getByText('Non applicable')).toBeInTheDocument();
    expect(screen.queryByText(/0 type/)).not.toBeInTheDocument();
  });
});

describe('rooms-utils', () => {
  it('nextRoomCode skips existing unit-N codes', async () => {
    const { nextRoomCode } = await import('./rooms-utils');
    expect(nextRoomCode([{ code: 'unit-1' }, { code: 'unit-3' }, { code: 'std' }])).toBe('unit-4');
    expect(nextRoomCode([])).toBe('unit-1');
  });

  it('reindexRoomPositions rewrites 1-based positions in array order', async () => {
    const { reindexRoomPositions } = await import('./rooms-utils');
    const items = [{ position: '2' }, { position: '1' }] as never[];
    expect(reindexRoomPositions(items).map((item: { position: string }) => item.position)).toEqual(['1', '2']);
  });

  it('computeRoomsCapacitySum cumulates couchages × unités (empty quantity = 1 unit)', async () => {
    const { computeRoomsCapacitySum } = await import('./rooms-utils');
    expect(computeRoomsCapacitySum([
      { capacityTotal: '2', quantity: '12' },
      { capacityTotal: '4', quantity: '' },
      { capacityTotal: '', quantity: '3' },
    ])).toBe(28);
  });

  it('syncCapacityWithRooms updates the §07 capacity_total metric while it tracks the cumul', async () => {
    const { syncCapacityWithRooms } = await import('./rooms-utils');
    const capacity = fullModulesFixture().capacityPolicies;
    capacity.capacityItems[0].value = '24'; // = prev cumul (2 × 12)
    const prev = [{ capacityTotal: '2', quantity: '12' }];
    const next = [{ capacityTotal: '2', quantity: '10' }];

    const synced = syncCapacityWithRooms(capacity, prev, next);
    expect(synced?.capacityItems[0].value).toBe('20');
  });

  it('syncCapacityWithRooms never clobbers a manually diverged capacity', async () => {
    const { syncCapacityWithRooms } = await import('./rooms-utils');
    const capacity = fullModulesFixture().capacityPolicies;
    capacity.capacityItems[0].value = '48'; // manual value ≠ prev cumul 24
    const prev = [{ capacityTotal: '2', quantity: '12' }];
    const next = [{ capacityTotal: '2', quantity: '10' }];

    expect(syncCapacityWithRooms(capacity, prev, next)).toBeNull();
  });
});

describe('BlockHEB — add opens the edit modal directly (no ghost row)', () => {
  it('adding a room opens the modal; Enregistrer appends, Annuler appends nothing', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);
    const before = result.current.draft.rooms.items.length;

    // Annuler: no row added.
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Ajouter un type de chambre/i })); });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Annuler' })); });
    view.rerender(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);
    expect(result.current.draft.rooms.items).toHaveLength(before);

    // Enregistrer: the configured row is appended.
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Ajouter un type de chambre/i })); });
    act(() => { fireEvent.change(screen.getByLabelText('Couchages (total)'), { target: { value: '2' } }); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' })); });
    view.rerender(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);
    expect(result.current.draft.rooms.items).toHaveLength(before + 1);
    expect(result.current.draft.rooms.items[before].capacityTotal).toBe('2');
  });

  it('adding a salle opens the modal; Enregistrer appends', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);
    const before = result.current.draft.meetingRooms.items.length;

    act(() => { fireEvent.click(screen.getByRole('button', { name: /Ajouter une salle/i })); });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    act(() => { fireEvent.change(screen.getByLabelText('Capacité en U'), { target: { value: '18' } }); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' })); });
    view.rerender(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);
    expect(result.current.draft.meetingRooms.items).toHaveLength(before + 1);
    expect(result.current.draft.meetingRooms.items[before].capacityU).toBe('18');
  });
});

describe('BlockHEB — capacity auto-sync + PMR liaison', () => {
  it('updates the §07 capacity metric when a room edit changes the cumul it was tracking', () => {
    const modules = fullModulesFixture();
    modules.capacityPolicies.capacityItems[0].value = '24'; // tracking the cumul 2 × 12
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    const view = render(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);

    act(() => { fireEvent.click(screen.getByRole('button', { name: /Modifier la chambre/i })); });
    act(() => { fireEvent.change(screen.getByLabelText('Couchages (total)'), { target: { value: '3' } }); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' })); });
    view.rerender(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);

    expect(result.current.draft.capacityPolicies.capacityItems[0].value).toBe('36');
    expect(result.current.dirtySections['capacity-policies']).toBe(true);
  });

  it('shows the PMR liaison note when at least one room is accessible', () => {
    const modules = fullModulesFixture();
    modules.rooms.items[0].accessible = true;
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    render(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);
    expect(screen.getByText(/chambre\(s\) PMR/i)).toBeInTheDocument();
  });

  it('shows no PMR note when no room is accessible', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);
    expect(screen.queryByText(/chambre\(s\) PMR/i)).not.toBeInTheDocument();
  });
});

describe('BlockHEB — §46 disabled-with-reason (rooms / meetingRooms modules)', () => {
  it('renders the rooms unavailable notice instead of the rooms repeater when gated', () => {
    const modules = fullModulesFixture();
    modules.rooms.unavailableReason = 'Module non applicable au type RES (référentiel ref_facet_applicability).';
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    render(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);

    expect(screen.getByText(/Module non applicable au type RES/)).toBeInTheDocument();
    // Regex matcher: the Repeater add button renders "+ {addLabel}" as two text
    // nodes, so an exact-string match can never hit it (and would be vacuous).
    expect(screen.queryByText(/Ajouter un type de chambre/)).not.toBeInTheDocument();
    // capacityPolicies is NOT type-gated — its controls stay rendered and editable.
    expect(screen.getByText("Politiques d'accueil")).toBeInTheDocument();
  });

  it('renders the meeting-rooms unavailable notice independently of the rooms area', () => {
    const modules = fullModulesFixture();
    modules.meetingRooms.unavailableReason = 'Module non applicable au type ITI (référentiel ref_facet_applicability).';
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    render(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);

    expect(screen.getByText(/Module non applicable au type ITI/)).toBeInTheDocument();
    expect(screen.queryByText(/Ajouter une salle/)).not.toBeInTheDocument();
    // The rooms area is gated by its OWN reason — it stays editable here.
    expect(screen.getByText(/Ajouter un type de chambre/)).toBeInTheDocument();
  });
});
