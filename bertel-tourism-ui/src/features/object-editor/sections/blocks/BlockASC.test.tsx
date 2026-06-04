import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../../useObjectEditorState';
import { BlockASC } from './BlockASC';
import { allowAll, fullModulesFixture } from '../section-fixture.test-utils';

/**
 * T1a "honest controls" sweep — the §05 ASC block previously rendered two
 * editable-looking-but-inert controls: a "Public & niveau accueillis" set of
 * audience TriStates (onChange = no-op) and a "Conditions saisonnières"
 * SeasonPicker fed a hardcoded constant. Neither persisted on save. Both are
 * removed (the seasonality profile is logged as a future feature). Genuine
 * controls (toggles, pricing rows) must stay editable.
 */
describe('BlockASC — honest controls (T1a)', () => {
  it('renders no inert "Public & niveau" audience TriState controls', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockASC editor={result.current} permissions={allowAll} />);

    expect(screen.queryByText('Public & niveau accueillis')).not.toBeInTheDocument();
    expect(screen.queryByText('Familles')).not.toBeInTheDocument();
    expect(screen.queryByText('Débutants')).not.toBeInTheDocument();
    expect(screen.queryByText('Personnes à mobilité réduite')).not.toBeInTheDocument();
  });

  it('renders no inert "Conditions saisonnières" season picker', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockASC editor={result.current} permissions={allowAll} />);

    expect(screen.queryByText('Conditions saisonnières')).not.toBeInTheDocument();
    // The SeasonPicker legend label — present iff the picker still renders.
    expect(screen.queryByText('Saison haute')).not.toBeInTheDocument();
  });

  it('keeps the encadrement toggle editable and persisting', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<BlockASC editor={result.current} permissions={allowAll} />);

    act(() => { fireEvent.click(screen.getByLabelText('Encadrement obligatoire')); });
    view.rerender(<BlockASC editor={result.current} permissions={allowAll} />);

    expect(result.current.dirtySections.activity).toBe(true);
  });
});
