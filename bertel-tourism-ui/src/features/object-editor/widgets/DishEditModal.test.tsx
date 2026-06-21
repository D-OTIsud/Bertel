import { fireEvent, render, screen } from '@testing-library/react';
import { DishEditModal } from './DishEditModal';
import { createMenuItem } from '../sections/blocks/menu-items';

const DIETARY = [{ id: 'd1', code: 'vegan', label: 'Végan' }];
const ALLERGEN = [{ id: 'a1', code: 'gluten', label: 'Gluten' }];

describe('DishEditModal (§06 P2c — single dish)', () => {
  it('edits a dish and returns it on save', () => {
    const onSave = jest.fn();
    const dish = { ...createMenuItem(0, 'entree', 'Entrées'), name: 'Samoussas', price: '6' };
    render(
      <DishEditModal open dish={dish} sectionLabel="Entrées" dietaryOptions={DIETARY} allergenOptions={ALLERGEN} onClose={() => {}} onSave={onSave} />,
    );

    expect(screen.getByText('Plat — Entrées')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Prix du plat'), { target: { value: '7.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Végan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    const saved = onSave.mock.calls[0][0];
    expect(saved).toMatchObject({ name: 'Samoussas', price: '7.5', sectionCode: 'entree', dietaryTagCodes: ['vegan'] });
  });

  it('offers a delete action only for an existing dish', () => {
    const onDelete = jest.fn();
    const { rerender } = render(
      <DishEditModal open dish={createMenuItem(0, 'main', 'Plats')} sectionLabel="Plats" dietaryOptions={[]} allergenOptions={[]} onClose={() => {}} onSave={() => {}} />,
    );
    expect(screen.queryByRole('button', { name: /Supprimer ce plat/ })).not.toBeInTheDocument();

    rerender(
      <DishEditModal open dish={createMenuItem(0, 'main', 'Plats')} sectionLabel="Plats" dietaryOptions={[]} allergenOptions={[]} onClose={() => {}} onSave={() => {}} onDelete={onDelete} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Supprimer ce plat/ }));
    expect(onDelete).toHaveBeenCalled();
  });
});
