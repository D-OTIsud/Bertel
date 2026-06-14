import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../../useObjectEditorState';
import { BlockSRV } from './BlockSRV';
import { allowAll, fullModulesFixture } from '../section-fixture.test-utils';

/**
 * T1a "honest controls" sweep — the §05 SRV block rendered a "Communes
 * desservies" zone with a hardcoded static chip set (on={false}, no onClick)
 * plus a dead "+ Commune" chip: it looked editable but wrote nothing. Removed.
 * Real zone authoring (object_zone via save_object_places) is T1b. The
 * prestation chips stay editable and persisting (languages moved to §12 — §48).
 */
describe('BlockSRV — honest controls (T1a)', () => {
  it('renders no static "Communes desservies" zone chips', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockSRV editor={result.current} permissions={allowAll} />);

    expect(screen.queryByText('Communes desservies')).not.toBeInTheDocument();
    expect(screen.queryByText('+ Commune')).not.toBeInTheDocument();
    expect(screen.queryByText('Cilaos')).not.toBeInTheDocument();
  });

  it('keeps the prestation picker toggling and persisting (via modal)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<BlockSRV editor={result.current} permissions={allowAll} />);

    act(() => { fireEvent.click(screen.getByRole('button', { name: /Choisir/i })); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Accès PMR' })); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Valider' })); });
    view.rerender(<BlockSRV editor={result.current} permissions={allowAll} />);

    expect(result.current.dirtySections.characteristics).toBe(true);
  });
});

describe('BlockSRV — single-owner surfaces (§48)', () => {
  it('no longer edits opening hours in §05 (owned by §14)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockSRV editor={result.current} permissions={allowAll} />);

    expect(screen.queryByText('Copier')).not.toBeInTheDocument(); // ScheduleEditor header gone
    expect(screen.getByText(/Géré dans la section 14/)).toBeInTheDocument();
  });

  it('no longer edits languages in §05 (owned by §12)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockSRV editor={result.current} permissions={allowAll} />);

    expect(screen.queryByText('Langues parlées au comptoir')).not.toBeInTheDocument();
    expect(screen.getByText(/Géré dans la section 12/)).toBeInTheDocument();
  });
});
