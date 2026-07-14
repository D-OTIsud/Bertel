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

describe('BlockASC — prestations & équipements (§48)', () => {
  it('toggles a general amenity via the modal picker and marks characteristics dirty', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<BlockASC editor={result.current} permissions={allowAll} />);

    act(() => { fireEvent.click(screen.getByRole('button', { name: /Choisir/i })); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Accès PMR' })); }); // « Disponibles »
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Valider' })); });
    view.rerender(<BlockASC editor={result.current} permissions={allowAll} />);

    expect(result.current.dirtySections.characteristics).toBe(true);
    expect(result.current.draft.characteristics.selectedAmenityCodes).toContain('pmr_access');
  });
});

describe('BlockASC — un seul contrôle par champ (6.2, fin du clobber)', () => {
  it('ne rend plus les contrôles dupliqués durée/équipement', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockASC editor={result.current} permissions={allowAll} />);
    expect(screen.queryByText('Durée affichée')).not.toBeInTheDocument();
    expect(screen.queryByText('Équipement fourni (détail)')).not.toBeInTheDocument();
    expect(screen.getAllByText('Durée minimale')).toHaveLength(1);
    expect(screen.getAllByText('Équipement fourni')).toHaveLength(1);
  });

  it('rend un toggle équipement et un détail conditionnel', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<BlockASC editor={result.current} permissions={allowAll} />);
    expect(screen.getByLabelText('Équipement fourni')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/casque/i)).toBeInTheDocument();
    act(() => { fireEvent.change(screen.getByPlaceholderText(/casque/i), { target: { value: 'casque fourni' } }); });
    view.rerender(<BlockASC editor={result.current} permissions={allowAll} />);
    expect(result.current.dirtySections.activity).toBe(true);
    expect(result.current.draft.activity.equipmentProvidedDetails).toBe('casque fourni');
  });
});

describe('BlockASC — single-owner surfaces (§48)', () => {
  it('no longer edits pricing formulas in §05 (owned by §13)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockASC editor={result.current} permissions={allowAll} />);

    expect(screen.queryByText(/Ajouter une formule/)).not.toBeInTheDocument();
    expect(screen.queryByText('Formules & sessions')).not.toBeInTheDocument();
    expect(screen.getByText(/Géré dans la section 13/)).toBeInTheDocument();
  });
});

describe('BlockASC — §46 disabled-with-reason (activity module)', () => {
  it('renders the unavailable notice instead of activity controls when gated', () => {
    const modules = fullModulesFixture();
    modules.activity.unavailableReason = 'Module non applicable au type RES (référentiel ref_facet_applicability).';
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    render(<BlockASC editor={result.current} permissions={allowAll} />);

    expect(screen.getByText(/Module non applicable au type RES/)).toBeInTheDocument();
    expect(screen.queryByText('Durée minimale')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Encadrement obligatoire')).not.toBeInTheDocument();
    // §48 pins: secondary suppression sites (Difficulté + Durée affichée in the grid-3 below pricing)
    expect(screen.queryByText('Durée affichée')).not.toBeInTheDocument();
    expect(screen.queryByText('Difficulté')).not.toBeInTheDocument();
    // notice renders exactly once (no duplicate from a secondary render site)
    expect(screen.getAllByText(/Module non applicable au type RES/)).toHaveLength(1);
  });

  it('keeps the non-type-gated controls editable while the activity module is gated', () => {
    const modules = fullModulesFixture();
    modules.activity.unavailableReason = 'Module non applicable au type RES (référentiel ref_facet_applicability).';
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    render(<BlockASC editor={result.current} permissions={allowAll} />);

    // The §48 amenity picker edits the characteristics module — never gated by activity.
    expect(screen.getByRole('button', { name: /Choisir/i })).toBeInTheDocument();
  });
});
