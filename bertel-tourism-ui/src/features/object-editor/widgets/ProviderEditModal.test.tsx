import { render, screen, fireEvent, within } from '@testing-library/react';
import { ProviderEditModal } from './ProviderEditModal';
import type { ObjectWorkspaceActorLinkItem } from '../../../services/object-workspace-parser';

const ROLE_OPTIONS = [
  { id: 'r-op', code: 'operator', label: 'Exploitant' },
  { id: 'r-guide', code: 'guide', label: 'Guide' },
];

function actor(partial: Partial<ObjectWorkspaceActorLinkItem> = {}): ObjectWorkspaceActorLinkItem {
  return {
    id: 'a1', displayName: 'Marie Guide', firstName: 'Marie', lastName: 'Guide', gender: '',
    roleId: 'r-op', roleCode: 'operator', roleLabel: 'Exploitant',
    visibility: 'public', isPrimary: false, validFrom: '', validTo: '', note: '', contacts: [],
    ...partial,
  };
}

function renderModal(over: Partial<Parameters<typeof ProviderEditModal>[0]> = {}) {
  const onSave = jest.fn();
  const onClose = jest.fn();
  render(
    <ProviderEditModal open actor={actor()} roleOptions={ROLE_OPTIONS} onClose={onClose} onSave={onSave} {...over} />,
  );
  return { onSave, onClose };
}

describe('ProviderEditModal', () => {
  it('titles the modal with the prestataire name and lists the role catalog', () => {
    renderModal();
    expect(screen.getByText('Modifier le rattachement — Marie Guide')).toBeInTheDocument();
    const role = screen.getByRole('combobox', { name: 'Rôle de Marie Guide' });
    expect(within(role).getAllByRole('option').map((o) => o.textContent)).toEqual(
      expect.arrayContaining(['Exploitant', 'Guide']),
    );
  });

  it('returns the patched role / visibility / primary / trimmed note on save', () => {
    const { onSave } = renderModal({ actor: actor({ note: '' }) });
    fireEvent.change(screen.getByLabelText('Rôle de Marie Guide'), { target: { value: 'guide' } });
    fireEvent.change(screen.getByLabelText('Visibilité de Marie Guide'), { target: { value: 'private' } });
    fireEvent.click(screen.getByRole('button', { name: 'Prestataire principal pour ce rôle' }));
    fireEvent.change(screen.getByLabelText('Note sur Marie Guide'), { target: { value: '  Référent terrain  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    const saved = onSave.mock.calls[0][0] as ObjectWorkspaceActorLinkItem;
    expect(saved).toMatchObject({
      roleCode: 'guide', roleId: 'r-guide', roleLabel: 'Guide',
      visibility: 'private', isPrimary: true, note: 'Référent terrain',
    });
  });

  it('keeps a legacy role selectable even when absent from the catalog', () => {
    renderModal({ actor: actor({ roleCode: 'legacy_role', roleLabel: 'Ancien rôle' }) });
    const role = screen.getByRole('combobox', { name: 'Rôle de Marie Guide' });
    expect(within(role).getByRole('option', { name: 'Ancien rôle' })).toBeInTheDocument();
  });
});
