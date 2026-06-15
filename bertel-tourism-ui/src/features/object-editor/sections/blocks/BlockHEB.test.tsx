import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { useObjectEditorState } from '../../useObjectEditorState';
import { BlockHEB } from './BlockHEB';
import { allowAll, fullModulesFixture } from '../section-fixture.test-utils';

/** Monte BlockHEB (HEB/HOT) avec un fixture modifiable. `result.current` reste live après fireEvent. */
function mountHEB(apply?: (m: ReturnType<typeof fullModulesFixture>) => void) {
  const modules = fullModulesFixture();
  // metricOptions enrichi : sans bedrooms/pitches/meeting_rooms, la dérivation serait un no-op
  // silencieux (piège §54). Le fixture par défaut ne contient que max_capacity.
  modules.capacityPolicies.metricOptions = [
    { id: 'cap', code: 'max_capacity', label: 'Capacité max.' },
    { id: 'bed', code: 'bedrooms', label: 'Chambres' },
    { id: 'pit', code: 'pitches', label: 'Emplacements' },
    { id: 'mtg', code: 'meeting_rooms', label: 'Salles de réunion' },
  ];
  apply?.(modules);
  const { result } = renderHook(() => useObjectEditorState('o1', modules));
  const props = { permissions: allowAll, archetype: 'HEB' as const, typeCode: 'HOT' };
  const view = render(<BlockHEB editor={result.current} {...props} />);
  return { result, view, rerender: () => view.rerender(<BlockHEB editor={result.current} {...props} />) };
}

describe('BlockHEB — alignement des tableaux', () => {
  it('header and room rows share identical grid tracks ending in a fixed width (no trailing auto)', () => {
    mountHEB((m) => { m.rooms.items = [{ ...m.rooms.items[0], name: 'Suite', quantity: '2' }]; });
    const header = screen.getByText('Couchages').parentElement as HTMLElement;
    const row = screen.getByText('Suite').closest('.rep-row') as HTMLElement;
    expect(header.style.gridTemplateColumns).toBe(row.style.gridTemplateColumns);
    expect(header.style.gridTemplateColumns.trim().endsWith('auto')).toBe(false);
    expect(/\d+px$/.test(header.style.gridTemplateColumns.trim())).toBe(true);
  });
});

describe('BlockHEB — encart Capacité d’accueil (§64)', () => {
  it('renders an editable Capacité max field bound to capacityItems, even with zero rooms', () => {
    const { result } = mountHEB((m) => {
      m.rooms.items = [];
      m.capacityPolicies.capacityItems = [
        { recordId: 'r1', metricId: 'cap', metricCode: 'max_capacity', metricLabel: 'Capacité max.', unit: 'pax', value: '8', effectiveFrom: '', effectiveTo: '' },
      ];
    });
    const field = screen.getByLabelText('Capacité max.') as HTMLInputElement;
    expect(field.value).toBe('8');
    act(() => { fireEvent.change(field, { target: { value: '9' } }); });
    const item = result.current.draft.capacityPolicies.capacityItems.find((i) => i.metricCode === 'max_capacity');
    expect(item).toMatchObject({ recordId: 'r1', metricId: 'cap', value: '9' }); // recordId/metricId préservés
  });

  it('creates a max_capacity item from scratch on a capacity-less object (no write-trap)', () => {
    const { result } = mountHEB((m) => { m.rooms.items = []; m.capacityPolicies.capacityItems = []; });
    act(() => { fireEvent.change(screen.getByLabelText('Capacité max.'), { target: { value: '6' } }); });
    expect(result.current.draft.capacityPolicies.capacityItems).toEqual([
      expect.objectContaining({ recordId: null, metricCode: 'max_capacity', value: '6' }),
    ]);
  });

  it('does NOT mark capacityPolicies dirty when a roomless object is merely rendered', () => {
    const { result } = mountHEB((m) => {
      m.rooms.items = [];
      m.capacityPolicies.capacityItems = [
        { recordId: 'r1', metricId: 'cap', metricCode: 'max_capacity', metricLabel: 'Capacité max.', unit: 'pax', value: '8', effectiveFrom: '', effectiveTo: '' },
      ];
    });
    expect(result.current.dirtySections['capacity-policies']).toBeFalsy();
  });

  it('no longer shows the parasitic « … reportée … §07 » text', () => {
    mountHEB((m) => { m.capacityPolicies.capacityItems = []; });
    expect(screen.queryByText(/reportée/i)).toBeNull();
  });

  it('shows a Chambres tile (derived unit count) when rooms exist', () => {
    mountHEB((m) => { m.rooms.items = [{ ...m.rooms.items[0], quantity: '3' }]; });
    expect(screen.getByText('Chambres')).toBeInTheDocument(); // libellé exact ≠ « Chambres / unités locatives »
  });

  it('hides the derived tiles when there are no rooms', () => {
    mountHEB((m) => { m.rooms.items = []; m.meetingRooms.items = []; });
    expect(screen.queryByText('Chambres')).toBeNull();
  });

  it('shows the calculated total (couchages) next to the editable max when rooms exist', () => {
    mountHEB((m) => { m.rooms.items = [{ ...m.rooms.items[0], capacityTotal: '2', quantity: '3' }]; });
    expect(screen.getByText('Capacité totale calculée')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument(); // 2 couchages × 3 unités
  });

  it('does not show the calculated total when there are no rooms', () => {
    mountHEB((m) => { m.rooms.items = []; });
    expect(screen.queryByText('Capacité totale calculée')).toBeNull();
  });

  it('offers « + Ajouter un descriptif de chambre » and shows no room table when empty (§66)', () => {
    mountHEB((m) => { m.rooms.items = []; });
    expect(screen.getByRole('button', { name: /Ajouter un descriptif de chambre/i })).toBeInTheDocument();
    expect(screen.queryByText('Chambres / unités locatives')).toBeNull();
  });

  it('shows the compact room table only when rooms exist (decoupled from salles)', () => {
    mountHEB(); // le fixture par défaut a une chambre
    expect(screen.getByText('Chambres / unités locatives')).toBeInTheDocument();
    // Salles = bloc séparé, toujours présent
    expect(screen.getByText('Salles séminaire & événementiel')).toBeInTheDocument();
  });
});

describe('BlockHEB — accueil rapatrié en §06 (§64, §07 masqué pour HEB)', () => {
  it('hosts the pet policy INLINE in §06 (§66 — pas de modale pour les animaux)', () => {
    mountHEB((m) => { m.capacityPolicies.petPolicy = { accepted: null, conditions: '' }; });
    expect(screen.getByText('Politique animaux')).toBeInTheDocument();
    expect(screen.getByLabelText('Animaux')).toBeInTheDocument(); // select directement visible, sans bouton
  });

  it('hosts the group policy in §06 as a separate button → modal (§66)', () => {
    mountHEB((m) => { m.capacityPolicies.groupPolicy = { minSize: '', maxSize: '', groupOnly: false, notes: '' }; });
    expect(screen.getByText('Politique de groupe')).toBeInTheDocument();
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Définir une politique de groupe/i })); });
    expect(screen.getByText('Groupes uniquement')).toBeInTheDocument(); // dans la modale
  });

  it('confirms the « Groupes uniquement » choice with a live notice at the bottom of the modal', () => {
    mountHEB((m) => { m.capacityPolicies.groupPolicy = { minSize: '', maxSize: '', groupOnly: false, notes: '' }; });
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Définir une politique de groupe/i })); });
    const notice = 'Les réservations individuelles ne sont pas acceptées.';
    expect(screen.queryByText(notice)).not.toBeInTheDocument(); // off ⇒ pas d'encart

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Groupes uniquement' })); });
    expect(screen.getByText(notice)).toBeInTheDocument(); // on ⇒ confirme le choix

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Groupes uniquement' })); });
    expect(screen.queryByText(notice)).not.toBeInTheDocument(); // off à nouveau ⇒ retiré
  });

  it('hosts the environment picker (Cadre / environnement) in §06 as a modal', () => {
    mountHEB();
    expect(screen.getByText('Cadre / environnement')).toBeInTheDocument();
    // Catalogue large ⇒ modal : l'option n'est PAS inline, on l'atteint via « Choisir… »
    expect(screen.queryByRole('button', { name: 'Jardin' })).toBeNull();
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Choisir/i })); });
    expect(screen.getByRole('button', { name: 'Jardin' })).toBeInTheDocument(); // dans « Disponibles »
  });
});

describe('BlockHEB room edit modal', () => {
  it('opens the room edit modal and persists per-room amenity changes', () => {
    const modules = fullModulesFixture();
    modules.rooms.amenityOptions = [{ id: 'wifi', code: 'wifi', label: 'Wi-Fi' }, { id: 'ac', code: 'ac', label: 'Clim' }];
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    const view = render(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Modifier la chambre/i })); });
    // Equipment is now behind the « Choisir » modal trigger inside the room dialog (search +
    // Sélectionnés/Disponibles). Scope to the room dialog — the §06 environment picker also has a « Choisir ».
    act(() => { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Choisir/i })); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Clim' })); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Valider' })); });
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

  it('locks room adults + children to the couchages total', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Modifier la chambre/i })); });
    // Total is the anchor: set it to 4, then adults = 3 rebalances children to 1 (sum stays 4).
    act(() => { fireEvent.change(screen.getByLabelText('Couchages (total)'), { target: { value: '4' } }); });
    act(() => { fireEvent.change(screen.getByLabelText('Adultes'), { target: { value: '3' } }); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' })); });
    view.rerender(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);
    expect(result.current.draft.rooms.items[0].capacityTotal).toBe('4');
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
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Ajouter un descriptif de chambre/i })); });
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

  it('syncCapacityWithRooms targets the REAL max_capacity metric (capacity_total never existed in ref_capacity_metric)', async () => {
    const { syncCapacityWithRooms } = await import('./rooms-utils');
    const capacity = fullModulesFixture().capacityPolicies;
    capacity.capacityItems = []; // no row yet — the sync must CREATE the max_capacity item
    const synced = syncCapacityWithRooms(capacity, [], [{ capacityTotal: '2', quantity: '10' }]);
    expect(synced?.capacityItems[0].metricCode).toBe('max_capacity');
    expect(synced?.capacityItems[0].value).toBe('20');
  });

  it('syncCapacityWithRooms updates the §07 max_capacity metric while it tracks the cumul', async () => {
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
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Ajouter un descriptif de chambre/i })); });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Annuler' })); });
    view.rerender(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);
    expect(result.current.draft.rooms.items).toHaveLength(before);

    // Enregistrer: the configured row is appended.
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Ajouter un descriptif de chambre/i })); });
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
    expect(screen.queryByText(/Ajouter un descriptif de chambre/)).not.toBeInTheDocument();
  });

  it('renders the meeting-rooms unavailable notice independently of the rooms area', () => {
    const modules = fullModulesFixture();
    modules.meetingRooms.unavailableReason = 'Module non applicable au type ITI (référentiel ref_facet_applicability).';
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    render(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);

    expect(screen.getByText(/Module non applicable au type ITI/)).toBeInTheDocument();
    expect(screen.queryByText(/Ajouter une salle/)).not.toBeInTheDocument();
    // The rooms area is gated by its OWN reason — it stays editable here.
    expect(screen.getByText(/Ajouter un descriptif de chambre/)).toBeInTheDocument();
  });
});
