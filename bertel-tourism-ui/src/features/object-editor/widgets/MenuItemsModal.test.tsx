import { fireEvent, render, screen } from '@testing-library/react';
import { MenuItemsModal } from './MenuItemsModal';

const DIETARY = [{ id: 'd1', code: 'vegan', label: 'Végan' }];
const ALLERGEN = [{ id: 'a1', code: 'gluten', label: 'Gluten' }];

function renderModal(onSave = jest.fn()) {
  render(
    <MenuItemsModal
      open
      menuName="Carte midi"
      items={[]}
      dietaryOptions={DIETARY}
      allergenOptions={ALLERGEN}
      priceUnitOptions={[]}
      onClose={() => {}}
      onSave={onSave}
    />,
  );
  return onSave;
}

describe('MenuItemsModal (§06 P2 structured carte)', () => {
  it('adds a dish and returns it on save', () => {
    const onSave = renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Ajouter un plat/ }));
    fireEvent.change(screen.getByPlaceholderText('ex. Cari poulet'), { target: { value: 'Bouchons' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ name: 'Bouchons', currency: 'EUR', available: true });
  });

  it('prunes a blank dish on save (no name, no price)', () => {
    const onSave = renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Ajouter un plat/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(onSave).toHaveBeenCalledWith([]);
  });

  it('toggles a dietary tag onto the dish', () => {
    const onSave = renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Ajouter un plat/ }));
    fireEvent.change(screen.getByPlaceholderText('ex. Cari poulet'), { target: { value: 'Salade' } });
    fireEvent.click(screen.getByRole('button', { name: 'Végan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(onSave.mock.calls[0][0][0].dietaryTagCodes).toEqual(['vegan']);
  });
});
