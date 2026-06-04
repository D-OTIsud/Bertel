import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../../useObjectEditorState';
import { BlockSRV } from './BlockSRV';
import { allowAll, fullModulesFixture } from '../section-fixture.test-utils';

/**
 * T1a "honest controls" sweep — the §05 SRV block rendered a "Communes
 * desservies" zone with a hardcoded static chip set (on={false}, no onClick)
 * plus a dead "+ Commune" chip: it looked editable but wrote nothing. Removed.
 * Real zone authoring (object_zone via save_object_places) is T1b. The
 * prestation + langue chips stay editable and persisting.
 */
describe('BlockSRV — honest controls (T1a)', () => {
  it('renders no static "Communes desservies" zone chips', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockSRV editor={result.current} permissions={allowAll} />);

    expect(screen.queryByText('Communes desservies')).not.toBeInTheDocument();
    expect(screen.queryByText('+ Commune')).not.toBeInTheDocument();
    expect(screen.queryByText('Cilaos')).not.toBeInTheDocument();
  });

  it('keeps the prestation chips toggling and persisting', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<BlockSRV editor={result.current} permissions={allowAll} />);

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Accès PMR' })); });
    view.rerender(<BlockSRV editor={result.current} permissions={allowAll} />);

    expect(result.current.dirtySections.characteristics).toBe(true);
  });
});
