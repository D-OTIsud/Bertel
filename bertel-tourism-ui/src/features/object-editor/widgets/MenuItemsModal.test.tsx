import { fireEvent, render, screen } from '@testing-library/react';
import { MenuEditModal } from './MenuItemsModal';
import type { ObjectWorkspaceMenu } from '../../../services/object-workspace-parser';

const SECTIONS = [
  { id: 'entree', code: 'entree', label: 'Entrées' },
  { id: 'main', code: 'main', label: 'Plats' },
];
const DIETARY = [{ id: 'd1', code: 'vegan', label: 'Végan' }];
const ALLERGEN = [{ id: 'a1', code: 'gluten', label: 'Gluten' }];

function baseMenu(items: ObjectWorkspaceMenu['items'] = []): ObjectWorkspaceMenu {
  return {
    recordId: null, categoryId: '', categoryCode: '', categoryLabel: '',
    name: '', description: '', active: true, visibility: 'public', position: '1', items,
  };
}

function renderModal(onSave = jest.fn(), menu = baseMenu()) {
  render(
    <MenuEditModal
      open
      menu={menu}
      sectionOptions={SECTIONS}
      dietaryOptions={DIETARY}
      allergenOptions={ALLERGEN}
      onClose={() => {}}
      onSave={onSave}
    />,
  );
  return onSave;
}

describe('MenuEditModal (§06 P2b — Menu → Sections → Plats)', () => {
  it('builds a menu: title, a section, then a dish in that section', () => {
    const onSave = renderModal();

    fireEvent.change(screen.getByPlaceholderText('Nom du menu'), { target: { value: 'Carte midi' } });

    // add the "Entrées" section
    fireEvent.change(screen.getByLabelText('Choisir une section'), { target: { value: 'entree' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));

    // add a dish to it
    fireEvent.click(screen.getByRole('button', { name: /Ajouter un plat à « Entrées »/ }));
    fireEvent.change(screen.getByPlaceholderText('ex. Cari poulet'), { target: { value: 'Samoussas' } });

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as ObjectWorkspaceMenu;
    expect(saved.name).toBe('Carte midi');
    expect(saved.items).toHaveLength(1);
    expect(saved.items[0]).toMatchObject({ name: 'Samoussas', sectionCode: 'entree', sectionLabel: 'Entrées' });
  });

  it('groups existing dishes under their section and prunes blanks', () => {
    const menu = baseMenu([
      { recordId: 'mi1', name: 'Bouchons', description: '', price: '6', currency: 'EUR', kindId: '', kindCode: '', kindLabel: '', unitId: '', unitCode: '', unitLabel: '', mediaIds: [], available: true, position: '1', dietaryTagCodes: [], allergenCodes: [], cuisineTypeCodes: [], sectionCode: 'entree', sectionId: 'entree', sectionLabel: 'Entrées' },
    ]);
    const onSave = renderModal(jest.fn(), menu);

    expect(screen.getByText('Entrées')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Bouchons')).toBeInTheDocument();

    // add a second, blank dish in Entrées → pruned on save
    fireEvent.click(screen.getByRole('button', { name: /Ajouter un plat à « Entrées »/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    const saved = onSave.mock.calls[0][0] as ObjectWorkspaceMenu;
    expect(saved.items).toHaveLength(1);
    expect(saved.items[0].name).toBe('Bouchons');
  });
});
