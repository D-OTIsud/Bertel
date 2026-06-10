import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../../useObjectEditorState';
import { BlockHEB } from './BlockHEB';
import { allowAll, fullModulesFixture } from '../section-fixture.test-utils';

describe('BlockHEB pet policy', () => {
  it('hides the conditions textarea until pets are accepted', () => {
    const modules = fullModulesFixture();
    modules.capacityPolicies.petPolicy.accepted = false;
    modules.capacityPolicies.petPolicy.conditions = '';
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    const view = render(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);

    expect(screen.queryByLabelText("Conditions d'accueil des animaux")).not.toBeInTheDocument();

    act(() => { fireEvent.click(screen.getByLabelText('Animaux acceptés')); });
    view.rerender(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);

    expect(result.current.draft.capacityPolicies.petPolicy.accepted).toBe(true);
    expect(screen.getByLabelText("Conditions d'accueil des animaux")).toBeInTheDocument();
  });

  it('renders no "Politique animaux renseignée" toggle', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);
    expect(screen.queryByText(/Politique animaux renseignée/i)).not.toBeInTheDocument();
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
