import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionCapacity } from './SectionCapacity';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';

describe('SectionCapacity', () => {
  it('no longer renders the pet-policy field (moved to BlockHEB)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionCapacity editor={result.current} permissions={allowAll} />);
    expect(screen.queryByText('Animaux')).not.toBeInTheDocument();
    // Group policy stays in §07.
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
