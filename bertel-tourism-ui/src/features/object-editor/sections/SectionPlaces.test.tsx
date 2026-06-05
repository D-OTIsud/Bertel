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

  it('keeps the sub-place visibility select', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionPlaces editor={result.current} permissions={allowAll} archetype="ITI" />);
    expect(screen.getByDisplayValue('♿ Accessible')).toBeInTheDocument();
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
});
