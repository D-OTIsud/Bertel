import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionCapacity } from './SectionCapacity';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';

describe('SectionCapacity', () => {
  // PO 2026-06-11 (reverses the earlier §06 move): the pet policy is an accueil
  // concern for ANY establishment, not just HEB — §07 is its sole editing surface.
  it('edits the pet policy here (animaux acceptés + conditions when accepted)', () => {
    const modules = fullModulesFixture();
    modules.capacityPolicies.petPolicy = { accepted: false, conditions: '' };
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    const view = render(<SectionCapacity editor={result.current} permissions={allowAll} />);

    expect(screen.queryByLabelText("Conditions d'accueil des animaux")).not.toBeInTheDocument();
    act(() => { fireEvent.click(screen.getByLabelText('Animaux acceptés')); });
    view.rerender(<SectionCapacity editor={result.current} permissions={allowAll} />);

    expect(result.current.draft.capacityPolicies.petPolicy.accepted).toBe(true);
    act(() => {
      fireEvent.change(screen.getByLabelText("Conditions d'accueil des animaux"), {
        target: { value: 'Petits chiens tenus en laisse' },
      });
    });
    expect(result.current.draft.capacityPolicies.petPolicy.conditions).toBe('Petits chiens tenus en laisse');
    // Group policy stays in §07 too.
    expect(screen.getByText('Groupes')).toBeInTheDocument();
  });

  // T1a "honest controls": the per-row unit is metric-derived (a trigger fills it
  // from ref_capacity_metric on persist); the saver never wrote the typed value,
  // so an editable unit input was a silent write-trap. It is now read-only.
  it('renders the capacity unit as read-only (metric-derived, not editable)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionCapacity editor={result.current} permissions={allowAll} />);
    expect(screen.getByDisplayValue('pers.')).toHaveAttribute('readonly');
  });

  it('does not mark capacity-policies dirty when the read-only unit is edited', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<SectionCapacity editor={result.current} permissions={allowAll} />);
    act(() => { fireEvent.change(screen.getByDisplayValue('pers.'), { target: { value: 'm²' } }); });
    view.rerender(<SectionCapacity editor={result.current} permissions={allowAll} />);
    expect(result.current.dirtySections['capacity-policies']).toBe(false);
  });

  it('still marks capacity-policies dirty when the capacity value is edited', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<SectionCapacity editor={result.current} permissions={allowAll} />);
    act(() => { fireEvent.change(screen.getByDisplayValue('48'), { target: { value: '50' } }); });
    view.rerender(<SectionCapacity editor={result.current} permissions={allowAll} />);
    expect(result.current.dirtySections['capacity-policies']).toBe(true);
  });
});
