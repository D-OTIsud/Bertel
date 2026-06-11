import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionPlaces } from './SectionPlaces';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';

/**
 * T1b sub-places (§16). The "kind" Selects (sub-place + ITI stage) have no backing
 * column on object_place / object_iti_stage — the sub-place one corrupted `chapo`,
 * the stage one was inert (onChange = no-op). Both are removed. The genuine controls
 * (label, description, visibility, add, remove) stay editable and now persist via the
 * descriptions-saver place reconcile.
 */
describe('SectionPlaces — honest controls (T1b)', () => {
  it('renders no inert place/stage "kind" selects', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionPlaces editor={result.current} permissions={allowAll} archetype="ITI" />);
    // Both kind selects defaulted to 'start' → "Départ / Entrée"; none should remain.
    expect(screen.queryAllByDisplayValue('Départ / Entrée')).toHaveLength(0);
  });

  it('labels the sub-place visibility select as read audience, not PMR accessibility', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionPlaces editor={result.current} permissions={allowAll} archetype="ITI" />);
    // visibility drives WHO CAN READ the description (8t gate) — the old
    // « ♿ Accessible / ✕ Non accessible » labels misrepresented it.
    expect(screen.getByDisplayValue('Publique')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('♿ Accessible')).not.toBeInTheDocument();
  });

  it('offers an explicit option for an undefined visibility instead of faking public', () => {
    const modules = fullModulesFixture();
    modules.descriptions.places[0].visibility = '';
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    render(<SectionPlaces editor={result.current} permissions={allowAll} archetype="ITI" />);
    expect(screen.getByDisplayValue('— Visibilité non définie —')).toBeInTheDocument();
  });

  it('keeps the sub-place label editable and marks descriptions dirty', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<SectionPlaces editor={result.current} permissions={allowAll} archetype="ITI" />);
    act(() => { fireEvent.change(screen.getByDisplayValue('Belvédère'), { target: { value: 'Belvédère haut' } }); });
    view.rerender(<SectionPlaces editor={result.current} permissions={allowAll} archetype="ITI" />);
    expect(result.current.dirtySections.descriptions).toBe(true);
    expect(result.current.draft.descriptions.places[0].label).toBe('Belvédère haut');
  });

  it('adds a sub-place (placeId null) and marks descriptions dirty', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<SectionPlaces editor={result.current} permissions={allowAll} archetype="ITI" />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Ajouter un sous-lieu/i })); });
    view.rerender(<SectionPlaces editor={result.current} permissions={allowAll} archetype="ITI" />);
    expect(result.current.draft.descriptions.places).toHaveLength(2);
    expect(result.current.draft.descriptions.places[1].placeId).toBeNull();
    expect(result.current.dirtySections.descriptions).toBe(true);
  });

  it('removes a sub-place and marks descriptions dirty', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<SectionPlaces editor={result.current} permissions={allowAll} archetype="ITI" />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Supprimer' })); });
    view.rerender(<SectionPlaces editor={result.current} permissions={allowAll} archetype="ITI" />);
    expect(result.current.draft.descriptions.places).toHaveLength(0);
    expect(result.current.dirtySections.descriptions).toBe(true);
  });

  // §41 zones: the "communes desservies" multi-select (object_zone), sourced from ref_commune.
  it('renders the communes-desservies multi-select reflecting the selected zones', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionPlaces editor={result.current} permissions={allowAll} archetype="ITI" />);
    // fixture: zoneOptions = [Le Tampon (selected via zoneCodes ['97422']), Saint-Joseph (not)].
    expect(screen.getByRole('button', { name: 'Le Tampon' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Saint-Joseph' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggles a commune and marks the location module dirty', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<SectionPlaces editor={result.current} permissions={allowAll} archetype="ITI" />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Saint-Joseph' })); });
    view.rerender(<SectionPlaces editor={result.current} permissions={allowAll} archetype="ITI" />);
    expect(result.current.dirtySections.location).toBe(true);
    expect(result.current.draft.location.zoneCodes).toContain('97412');
  });
});

describe('SectionPlaces — §46 gated itinerary module (§48)', () => {
  it('hides the stage editor and shows the notice when the itinerary module is gated', () => {
    const modules = fullModulesFixture();
    modules.itinerary.unavailableReason = 'Module non applicable au type FMA (référentiel ref_facet_applicability).';
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    render(<SectionPlaces editor={result.current} permissions={allowAll} archetype="ITI" />);

    expect(screen.getByText(/Module non applicable au type FMA/)).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Départ')).not.toBeInTheDocument(); // stage name input gone
    expect(screen.getByDisplayValue('Belvédère')).toBeInTheDocument(); // sub-place label (descriptions module) stays
  });
});
