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
    expect(screen.getByDisplayValue('pax')).toHaveAttribute('readonly');
  });

  it('does not mark capacity-policies dirty when the read-only unit is edited', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<SectionCapacity editor={result.current} permissions={allowAll} />);
    act(() => { fireEvent.change(screen.getByDisplayValue('pax'), { target: { value: 'm²' } }); });
    view.rerender(<SectionCapacity editor={result.current} permissions={allowAll} />);
    expect(result.current.dirtySections['capacity-policies']).toBe(false);
  });

  it('renders the capacity value as a numeric input (free text silently became NULL)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionCapacity editor={result.current} permissions={allowAll} />);
    expect(screen.getByDisplayValue('48')).toHaveAttribute('type', 'number');
  });

  it('disables « Ajouter une capacité » when every available metric is already used', () => {
    // Fixture: 1 metric option, 1 row using it → nothing left to add. The old
    // fallback duplicated options[0] and guaranteed a UNIQUE failure at save.
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionCapacity editor={result.current} permissions={allowAll} />);
    expect(screen.getByRole('button', { name: /Ajouter une capacité/ })).toBeDisabled();
  });

  it('excludes metrics already used by OTHER rows from each row metric select', () => {
    const modules = fullModulesFixture();
    modules.capacityPolicies.metricOptions = [
      { id: 'cap', code: 'max_capacity', label: 'Capacité max.' },
      { id: 'seats', code: 'seats', label: 'Places assises' },
    ];
    modules.capacityPolicies.capacityItems = [
      { recordId: 'cap1', metricId: 'cap', metricCode: 'max_capacity', metricLabel: 'Capacité max.', unit: 'pax', value: '48', effectiveFrom: '', effectiveTo: '' },
      { recordId: 'cap2', metricId: 'seats', metricCode: 'seats', metricLabel: 'Places assises', unit: 'seat', value: '12', effectiveFrom: '', effectiveTo: '' },
    ];
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    render(<SectionCapacity editor={result.current} permissions={allowAll} />);
    const selects = screen.getAllByRole('combobox');
    const optionValues = (select: HTMLElement) =>
      Array.from(select.querySelectorAll('option')).map((option) => option.getAttribute('value'));
    // Row 1 keeps its own metric but must not offer row 2's (and vice versa).
    expect(optionValues(selects[0])).toContain('max_capacity');
    expect(optionValues(selects[0])).not.toContain('seats');
    expect(optionValues(selects[1])).toContain('seats');
    expect(optionValues(selects[1])).not.toContain('max_capacity');
  });

  it('still marks capacity-policies dirty when the capacity value is edited', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<SectionCapacity editor={result.current} permissions={allowAll} />);
    act(() => { fireEvent.change(screen.getByDisplayValue('48'), { target: { value: '50' } }); });
    view.rerender(<SectionCapacity editor={result.current} permissions={allowAll} />);
    expect(result.current.dirtySections['capacity-policies']).toBe(true);
  });
});
