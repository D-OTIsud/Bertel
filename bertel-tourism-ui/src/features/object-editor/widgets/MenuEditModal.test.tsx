import { fireEvent, render, screen } from '@testing-library/react';
import { MenuEditModal } from './MenuEditModal';
import { createMenuItem } from '../sections/blocks/menu-items';
import type { ObjectWorkspaceMenu, ObjectWorkspaceMenuItem } from '../../../services/object-workspace-parser';

jest.mock('../../../components/markdown/MarkdownEditorLazy', () => ({
  MarkdownEditorLazy: ({ value, onChange, ariaLabel }: { value: string; onChange: (next: string) => void; ariaLabel: string }) =>
    <textarea aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value)} />,
}));
const SECTIONS = [{ id: 'entree', code: 'entree', label: 'Entrées' }, { id: 'main', code: 'main', label: 'Plats' }];
function dish(over: Partial<ObjectWorkspaceMenuItem> = {}): ObjectWorkspaceMenuItem {
  return { ...createMenuItem(0, 'main', 'Plats'), recordId: 'mi1', name: 'Cari', price: '14', ...over };
}
function baseMenu(items: ObjectWorkspaceMenuItem[] = [], over: Partial<ObjectWorkspaceMenu> = {}): ObjectWorkspaceMenu {
  return { recordId: null, categoryId: '', categoryCode: '', categoryLabel: '', name: '', description: '', active: true, visibility: 'public', position: '1', items, ...over };
}
function renderModal(menu: ObjectWorkspaceMenu, onSave = jest.fn()) {
  render(<MenuEditModal open menu={menu} sectionOptions={SECTIONS} dietaryOptions={[]} allergenOptions={[]} onClose={() => {}} onSave={onSave} />);
  return onSave;
}

describe('MenuEditModal — one menu draft with integrated dish panel', () => {
  it('adds a rubric and edits its new dish in the same dialog', () => {
    const onSave = renderModal(baseMenu());
    fireEvent.change(screen.getByPlaceholderText('Nom du menu'), { target: { value: 'Carte midi' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Entrées' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un plat en entrées' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /^(Ajouter|Appliquer) le menu$/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Nom du plat/), { target: { value: 'Samoussas' } });
    fireEvent.change(screen.getByLabelText('Prix du plat'), { target: { value: '6' } });
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^(Ajouter|Appliquer) le menu$/ }));
    expect(onSave.mock.calls[0][0]).toMatchObject({ name: 'Carte midi', items: [expect.objectContaining({ name: 'Samoussas', sectionCode: 'entree', price: '6' })] });
  });

  it('deletes the selected dish locally and commits only with the menu', () => {
    const onSave = renderModal(baseMenu([dish()], { name: 'Carte midi' }));
    expect(screen.getByRole('button', { name: 'Modifier Cari' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer ce plat' }));
    expect(screen.queryByRole('button', { name: 'Modifier Cari' })).not.toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^(Ajouter|Appliquer) le menu$/ }));
    expect(onSave.mock.calls[0][0]).toMatchObject({ name: 'Carte midi', items: [] });
  });

  it('keeps drafts when switching dishes and preserves metadata, NULL visibility and unnamed existing rows', () => {
    const items = [dish({ mediaIds: ['photo-1'], cuisineTypeCodes: ['creole'] }), dish({ recordId: 'mi2', name: '', price: '', description: 'Texte existant', sectionId: 'section-db' })];
    const onSave = renderModal(baseMenu(items, { recordId: 'menu-1', rawName: null, rawVisibility: null, name: '', visibility: '', description: 'Métadonnée du menu', position: '9' }));
    fireEvent.change(screen.getByLabelText('Prix du plat'), { target: { value: '16' } });
    fireEvent.click(screen.getByRole('button', { name: 'Modifier le plat' }));
    expect(screen.getByLabelText(/Nom du plat/)).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Modifier Cari' }));
    expect(screen.getByLabelText('Prix du plat')).toHaveValue(16);
    fireEvent.click(screen.getByRole('button', { name: /^(Ajouter|Appliquer) le menu$/ }));
    expect(onSave.mock.calls[0][0]).toMatchObject({ rawName: null, rawVisibility: null, name: '', visibility: '', description: 'Métadonnée du menu', position: '9',
      items: [expect.objectContaining({ price: '16', mediaIds: ['photo-1'], cuisineTypeCodes: ['creole'] }), expect.objectContaining({ recordId: 'mi2', name: '', description: 'Texte existant', sectionId: 'section-db' })] });
  });
});
