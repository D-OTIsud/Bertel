import { fireEvent, render, screen } from '@testing-library/react';
import { MenuEditModal } from './MenuEditModal';
import { createMenuItem } from '../sections/blocks/menu-items';
import type { ObjectWorkspaceMenu, ObjectWorkspaceMenuItem } from '../../../services/object-workspace-parser';

const SECTIONS = [
  { id: 'entree', code: 'entree', label: 'Entrées' },
  { id: 'main', code: 'main', label: 'Plats' },
];

function dish(over: Partial<ObjectWorkspaceMenuItem>): ObjectWorkspaceMenuItem {
  return { ...createMenuItem(0, 'main', 'Plats'), recordId: 'mi1', name: 'Cari', price: '14', ...over };
}
function baseMenu(items: ObjectWorkspaceMenuItem[] = [], over: Partial<ObjectWorkspaceMenu> = {}): ObjectWorkspaceMenu {
  return { recordId: null, categoryId: '', categoryCode: '', categoryLabel: '', name: '', description: '', active: true, visibility: 'public', position: '1', items, ...over };
}

function renderModal(menu: ObjectWorkspaceMenu, onSave = jest.fn()) {
  render(<MenuEditModal open menu={menu} sectionOptions={SECTIONS} dietaryOptions={[]} allergenOptions={[]} onClose={() => {}} onSave={onSave} />);
  return onSave;
}

describe('MenuEditModal (§06 P2c — create/edit a whole menu)', () => {
  it('edits the title and adds a section, then opens the dish modal to add a plat', () => {
    renderModal(baseMenu());

    fireEvent.change(screen.getByPlaceholderText('Nom du menu'), { target: { value: 'Carte midi' } });
    fireEvent.change(screen.getByLabelText('Choisir une section'), { target: { value: 'entree' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));

    fireEvent.click(screen.getByRole('button', { name: /Ajouter un plat à « Entrées »/ }));
    expect(screen.getByText('Plat — Entrées')).toBeInTheDocument(); // nested DishEditModal
  });

  it('lists an existing dish with edit/delete icons; deleting then saving drops it', () => {
    const onSave = renderModal(baseMenu([dish({})], { name: 'Carte midi' }));

    expect(screen.getByText('Cari')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Modifier Cari/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Supprimer Cari/ }));
    expect(screen.queryByText('Cari')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const saved = onSave.mock.calls[0][0] as ObjectWorkspaceMenu;
    expect(saved.name).toBe('Carte midi');
    expect(saved.items).toEqual([]);
  });

  it('opens the dish modal on the pencil of an existing dish', () => {
    renderModal(baseMenu([dish({})], { name: 'Carte midi' }));
    fireEvent.click(screen.getByRole('button', { name: /Modifier Cari/ }));
    expect(screen.getByText('Plat — Plats')).toBeInTheDocument();
  });
});
