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
    expect(screen.queryByRole('button', { name: /Ajouter un menu/ })).not.toBeInTheDocument();
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

describe('BlockRES — §06 menus : carte dépliable (lecture) + modale (édition)', () => {
  it('shows collapsible read-only cards; expand reveals dishes; the pencil opens the edit modal', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockRES editor={result.current} permissions={allowAll} />);

    // Fixture menu1 = "Carte midi" with 1 dish ("Cari") in "Plats principaux".
    expect(screen.getByText('Carte midi')).toBeInTheDocument();
    expect(screen.getByText(/Plats principaux · 1 plat\(s\)/)).toBeInTheDocument();
    expect(screen.queryByText('Cari')).not.toBeInTheDocument(); // collapsed

    fireEvent.click(screen.getByRole('button', { name: 'Déployer le menu' }));
    expect(screen.getByText('Cari')).toBeInTheDocument(); // read-only view
    expect(screen.queryByRole('button', { name: /Modifier Cari/ })).not.toBeInTheDocument(); // no per-dish icon in the card

    // editing is done in the modal, opened from the card's "Modifier le menu".
    fireEvent.click(screen.getByRole('button', { name: /Modifier le menu/ }));
    expect(screen.getByText(/Menu — Carte midi/)).toBeInTheDocument(); // MenuEditModal
  });

  it('opens the create modal from "Ajouter un menu"', () => {
    const modules = fullModulesFixture();
    modules.menus.items = [];
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    render(<BlockRES editor={result.current} permissions={allowAll} />);

    expect(screen.getByText(/Aucun menu pour le moment/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Ajouter un menu/ }));
    expect(screen.getByText(/Menu — Sans titre/)).toBeInTheDocument(); // MenuEditModal (new)
  });
});

describe('BlockRES — §06 cartes : ajout via modale', () => {
  it('renders an "Ajouter une carte" button (replaces the inline file picker)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockRES editor={result.current} permissions={allowAll} />);
    expect(screen.getByRole('button', { name: /Ajouter une carte/ })).toBeInTheDocument();
  });
});

describe('BlockRES — §06 ne porte ni l’édition ni les pointeurs §07/§14 (bruit retiré)', () => {
  it('does not edit the group policy in §06 (owned by §07)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockRES editor={result.current} permissions={allowAll} />);

    expect(screen.queryByText('Capacité groupe min')).not.toBeInTheDocument();
    expect(screen.queryByText('Capacité groupe max')).not.toBeInTheDocument();
    expect(screen.queryByText('Groupes uniquement')).not.toBeInTheDocument();
  });

  it('does not edit service hours in §06 (owned by §14)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockRES editor={result.current} permissions={allowAll} />);

    expect(screen.queryByText('Copier')).not.toBeInTheDocument(); // ScheduleEditor header gone
  });

  it('no longer renders the §07/§14 "géré ailleurs" pointer notes (noise removed per PO 2026-06-22)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockRES editor={result.current} permissions={allowAll} />);

    // Cuisine/cartes/service section must not echo capacity (§07) or hours (§14) — they are noise here.
    expect(screen.queryByText(/Géré dans la section 07/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Géré dans la section 14/)).not.toBeInTheDocument();
  });
});
