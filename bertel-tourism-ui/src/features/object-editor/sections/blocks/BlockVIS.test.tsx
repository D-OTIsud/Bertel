import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../../useObjectEditorState';
import { BlockVIS } from './BlockVIS';
import { allowAll, fullModulesFixture } from '../section-fixture.test-utils';

/**
 * T1a "honest controls" sweep — the §05 VIS block rendered a "Public &
 * accessibilité" set of audience TriStates with no-op onChange handlers
 * (silently discarded). Removed. The visit-mode toggles / equipment chips /
 * tariff rows / schedule stay editable and persisting.
 */
describe('BlockVIS — honest controls (T1a)', () => {
  it('renders no inert "Public & accessibilité" audience TriState controls', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockVIS editor={result.current} permissions={allowAll} />);

    expect(screen.queryByText('Public & accessibilité')).not.toBeInTheDocument();
    expect(screen.queryByText('Scolaires')).not.toBeInTheDocument();
    expect(screen.queryByText('Malentendants')).not.toBeInTheDocument();
  });

  it('keeps the visit-mode toggle editable and persisting', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<BlockVIS editor={result.current} permissions={allowAll} />);

    act(() => { fireEvent.click(screen.getByLabelText('Visite libre')); });
    view.rerender(<BlockVIS editor={result.current} permissions={allowAll} />);

    expect(result.current.dirtySections.characteristics).toBe(true);
  });
});

describe('BlockVIS — single-owner surfaces (§48)', () => {
  it('no longer edits tariffs in §05 (owned by §13)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockVIS editor={result.current} permissions={allowAll} />);

    expect(screen.queryByText(/Ajouter une ligne tarifaire/)).not.toBeInTheDocument();
    expect(screen.getByText(/Géré dans la section 13/)).toBeInTheDocument();
  });

  it('no longer edits opening hours in §05 (owned by §14)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockVIS editor={result.current} permissions={allowAll} />);

    expect(screen.queryByText('Copier')).not.toBeInTheDocument(); // ScheduleEditor header gone
    expect(screen.getByText(/Géré dans la section 14/)).toBeInTheDocument();
  });
});
