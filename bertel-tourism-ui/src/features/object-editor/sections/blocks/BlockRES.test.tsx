import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../../useObjectEditorState';
import { BlockRES } from './BlockRES';
import { allowAll, fullModulesFixture } from '../section-fixture.test-utils';

/**
 * §06 P1 — « Cuisines proposées » (Bloc A) is an OBJECT-LEVEL facet (object_cuisine_type),
 * DECOUPLED from the menus module. It must render and be editable even when there is no menu
 * (the old write-trap: cuisine codes lived on menus.items[0].items[0], a no-op for the 100% of
 * restaurants with 0 menus). The §46 menus gate must NOT hide the cuisine block.
 */
describe('BlockRES — §06 P1 cuisine Bloc A (object-level, decoupled)', () => {
  it('renders the cuisine field even with no menus (no write-trap)', () => {
    const modules = fullModulesFixture();
    modules.menus.items = [];
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    render(<BlockRES editor={result.current} permissions={allowAll} />);

    expect(screen.getByText('Cuisines proposées')).toBeInTheDocument();
    expect(screen.getByText('Types de cuisine')).toBeInTheDocument();
  });

  it('keeps the cuisine block when the menus module is gated (decoupled)', () => {
    const modules = fullModulesFixture();
    modules.menus.unavailableReason = 'Module non applicable au type HOT (référentiel ref_facet_applicability).';
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    render(<BlockRES editor={result.current} permissions={allowAll} />);

    // Bloc A is independent of the menus gate → still present.
    expect(screen.getByText('Cuisines proposées')).toBeInTheDocument();
    // The menus controls are hidden behind the gate.
    expect(screen.getByText(/Module non applicable au type HOT/)).toBeInTheDocument();
    expect(screen.queryByText(/Ajouter un menu \/ une carte/)).not.toBeInTheDocument();
  });

  it('shows a ModuleUnavailableNotice for the cuisine field when its catalog failed to load', () => {
    const modules = fullModulesFixture();
    modules.cuisine.unavailableReason = 'Le catalogue des types de cuisine n’a pas pu être chargé.';
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    render(<BlockRES editor={result.current} permissions={allowAll} />);

    expect(screen.getByText(/catalogue des types de cuisine/)).toBeInTheDocument();
  });

  it('renders the menu controls when no reason is set', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockRES editor={result.current} permissions={allowAll} />);

    expect(screen.getByRole('button', { name: /Ajouter un menu/ })).toBeInTheDocument();
  });
});

describe('BlockRES — §06 P2b menus 3-niveaux (Menu → Sections → Plats)', () => {
  it('lists existing menus and opens the menu editor on "Modifier"', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockRES editor={result.current} permissions={allowAll} />);

    // Fixture menu1 = "Carte midi" with 1 dish.
    expect(screen.getByText('Carte midi')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
    expect(screen.getByText(/Menu — Carte midi/)).toBeInTheDocument(); // modal title
    expect(screen.getByDisplayValue('Carte midi')).toBeInTheDocument(); // editable menu title
  });

  it('opens an empty menu editor from "Ajouter un menu"', () => {
    const modules = fullModulesFixture();
    modules.menus.items = [];
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    render(<BlockRES editor={result.current} permissions={allowAll} />);

    expect(screen.getByText(/Aucun menu pour le moment/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Ajouter un menu/ }));
    expect(screen.getByText(/Menu — Sans titre/)).toBeInTheDocument();
  });
});

describe('BlockRES — single-owner surfaces (§48)', () => {
  it('no longer edits the group policy in §06 (owned by §07)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockRES editor={result.current} permissions={allowAll} />);

    expect(screen.queryByText('Capacité groupe min')).not.toBeInTheDocument();
    expect(screen.queryByText('Capacité groupe max')).not.toBeInTheDocument();
    expect(screen.queryByText('Groupes uniquement')).not.toBeInTheDocument();
    expect(screen.getByText(/Géré dans la section 07/)).toBeInTheDocument();
  });

  it('no longer edits service hours in §06 (owned by §14)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockRES editor={result.current} permissions={allowAll} />);

    expect(screen.queryByText('Copier')).not.toBeInTheDocument(); // ScheduleEditor header gone
    expect(screen.getByText(/Géré dans la section 14/)).toBeInTheDocument();
  });
});
