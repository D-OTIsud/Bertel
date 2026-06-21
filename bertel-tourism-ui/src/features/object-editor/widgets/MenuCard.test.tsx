import { fireEvent, render, screen } from '@testing-library/react';
import { MenuCard } from './MenuCard';
import { createMenuItem } from '../sections/blocks/menu-items';
import type { ObjectWorkspaceMenu, ObjectWorkspaceMenuItem } from '../../../services/object-workspace-parser';

const SECTIONS = [
  { id: 'entree', code: 'entree', label: 'Entrées' },
  { id: 'main', code: 'main', label: 'Plats' },
];

function dish(over: Partial<ObjectWorkspaceMenuItem>): ObjectWorkspaceMenuItem {
  return { ...createMenuItem(0, 'main', 'Plats'), recordId: 'mi1', name: 'Cari', price: '14', ...over };
}
function menu(items: ObjectWorkspaceMenuItem[] = [], over: Partial<ObjectWorkspaceMenu> = {}): ObjectWorkspaceMenu {
  return { recordId: 'm1', categoryId: '', categoryCode: '', categoryLabel: '', name: 'Carte midi', description: '', active: true, visibility: 'public', position: '1', items, ...over };
}

function renderCard(m: ObjectWorkspaceMenu, onChange = jest.fn(), onDelete = jest.fn()) {
  render(<MenuCard menu={m} sectionOptions={SECTIONS} dietaryOptions={[]} allergenOptions={[]} onChange={onChange} onDelete={onDelete} />);
  return { onChange, onDelete };
}

describe('MenuCard (§06 P2c collapsible)', () => {
  it('is collapsed by default and shows title + summary; expands to reveal dishes', () => {
    renderCard(menu([dish({})]));
    expect(screen.getByText('Carte midi')).toBeInTheDocument();
    expect(screen.getByText(/Plats · 1 plat\(s\)/)).toBeInTheDocument();
    // dish hidden until expanded
    expect(screen.queryByText('14 €')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Déployer le menu' }));
    expect(screen.getByText('Cari')).toBeInTheDocument();
    expect(screen.getByText('14 €')).toBeInTheDocument();
  });

  it('opens the dish modal from the pencil icon', () => {
    renderCard(menu([dish({})]));
    fireEvent.click(screen.getByRole('button', { name: 'Déployer le menu' }));
    fireEvent.click(screen.getByRole('button', { name: /Modifier Cari/ }));
    expect(screen.getByText('Plat — Plats')).toBeInTheDocument(); // DishEditModal title
  });

  it('removes a dish from the trash icon (onChange without that dish)', () => {
    const { onChange } = renderCard(menu([dish({})]));
    fireEvent.click(screen.getByRole('button', { name: 'Déployer le menu' }));
    fireEvent.click(screen.getByRole('button', { name: /Supprimer Cari/ }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ items: [] }));
  });

  it('auto-expands a fresh (empty, untitled) menu', () => {
    renderCard(menu([], { name: '', recordId: null }));
    expect(screen.getByPlaceholderText('Nom du menu')).toBeInTheDocument(); // body visible
    expect(screen.getByText(/Ajouter une section/)).toBeInTheDocument();
  });
});
