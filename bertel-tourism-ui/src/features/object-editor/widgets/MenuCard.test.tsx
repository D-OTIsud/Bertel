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

function renderCard(m: ObjectWorkspaceMenu) {
  const onEdit = jest.fn();
  const onDelete = jest.fn();
  const onToggleActive = jest.fn();
  render(<MenuCard menu={m} sectionOptions={SECTIONS} onEdit={onEdit} onDelete={onDelete} onToggleActive={onToggleActive} />);
  return { onEdit, onDelete, onToggleActive };
}

describe('MenuCard (§06 P2c — read-only collapsible display)', () => {
  it('is collapsed by default and expands to a read-only dish list', () => {
    renderCard(menu([dish({})]));
    expect(screen.getByText('Carte midi')).toBeInTheDocument();
    expect(screen.getByText(/Plats · 1 plat\(s\)/)).toBeInTheDocument();
    expect(screen.queryByText('14 €')).not.toBeInTheDocument(); // collapsed

    fireEvent.click(screen.getByRole('button', { name: 'Déployer le menu' }));
    expect(screen.getByText('Cari')).toBeInTheDocument();
    expect(screen.getByText('14 €')).toBeInTheDocument();
    // read-only: no per-dish edit/delete icons in the card
    expect(screen.queryByRole('button', { name: /Modifier Cari/ })).not.toBeInTheDocument();
  });

  it('the pencil triggers onEdit (open the modal), the trash triggers onDelete', () => {
    const { onEdit, onDelete } = renderCard(menu([dish({})]));
    fireEvent.click(screen.getByRole('button', { name: /Modifier le menu/ }));
    expect(onEdit).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Supprimer le menu/ }));
    expect(onDelete).toHaveBeenCalled();
  });
});
