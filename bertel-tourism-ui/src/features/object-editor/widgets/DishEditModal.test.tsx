import { fireEvent, render, screen } from '@testing-library/react';
import { DishEditModal } from './DishEditModal';
import { createMenuItem } from '../sections/blocks/menu-items';

// MarkdownEditorLazy is dynamic/SSR-false + TipTap — mock it to a plain textarea.
jest.mock('../../../components/markdown/MarkdownEditorLazy', () => ({
  MarkdownEditorLazy: ({ value, onChange, ariaLabel }: { value: string; onChange: (md: string) => void; ariaLabel: string }) => (
    <textarea aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

const DIETARY = [{ id: 'd1', code: 'vegan', label: 'Végan' }];
const ALLERGEN = [{ id: 'a1', code: 'gluten', label: 'Gluten' }];

describe('DishEditModal (§06 P2c — single dish)', () => {
  it('edits a dish and returns it on save', () => {
    const onSave = jest.fn();
    const dish = { ...createMenuItem(0, 'entree', 'Entrées'), name: 'Samoussas', price: '6' };
    render(
      <DishEditModal open dish={dish} sectionLabel="Entrées" dietaryOptions={DIETARY} allergenOptions={ALLERGEN} onClose={() => {}} onSave={onSave} />,
    );

    expect(screen.getByRole('heading', { name: 'Ajouter un plat' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Prix du plat'), { target: { value: '7.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Végan' }));
    fireEvent.click(screen.getByRole('button', { name: /^(Ajouter|Appliquer)$/ }));

    const saved = onSave.mock.calls[0][0];
    expect(saved).toMatchObject({ name: 'Samoussas', price: '7.5', sectionCode: 'entree', dietaryTagCodes: ['vegan'] });
  });

  it('separates origin and quality from diets while keeping their existing storage codes and hidden fields', () => {
    const onSave = jest.fn();
    const dish = { ...createMenuItem(0, 'main', 'Plats'), name: 'Cari', mediaIds: ['photo-1'], cuisineTypeCodes: ['creole'], kindId: 'kind-1', unitId: 'unit-1' };
    render(<DishEditModal open dish={dish} sectionLabel="Plats" dietaryOptions={[...DIETARY, { id: 'local', code: 'local', label: 'Local' }, { id: 'bio', code: 'organic', label: 'Bio' }]} allergenOptions={ALLERGEN} onClose={() => {}} onSave={onSave} />);
    const origin = screen.getByRole('region', { name: 'Origine et qualité' });
    expect(origin).toHaveTextContent('Local');
    expect(origin).toHaveTextContent('Bio');
    fireEvent.click(screen.getByRole('button', { name: 'Local' }));
    fireEvent.click(screen.getByRole('button', { name: /^(Ajouter|Appliquer)$/ }));
    expect(onSave.mock.calls[0][0]).toMatchObject({ dietaryTagCodes: ['local'], mediaIds: ['photo-1'], cuisineTypeCodes: ['creole'], kindId: 'kind-1', unitId: 'unit-1' });
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
