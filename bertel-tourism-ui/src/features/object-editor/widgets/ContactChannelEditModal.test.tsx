import { render, screen, fireEvent, within } from '@testing-library/react';
import { ContactChannelEditModal } from './ContactChannelEditModal';
import { createContactDraft } from '../sections/contacts-edit';
import type { ObjectWorkspaceContactItem } from '../../../services/object-workspace-parser';

const KINDS = [
  { id: 'k1', code: 'phone', label: 'Téléphone' },
  { id: 'k2', code: 'email', label: 'E-mail' },
];
const ROLES = [
  { id: 'r1', code: 'reservation', label: 'Réservation' },
  { id: 'r2', code: 'accueil', label: 'Accueil' },
];

function renderModal(over: Partial<Parameters<typeof ContactChannelEditModal>[0]> = {}) {
  const onSave = jest.fn();
  const onClose = jest.fn();
  render(
    <ContactChannelEditModal
      open
      mode="add"
      contact={createContactDraft(KINDS, true)}
      kindOptions={KINDS}
      roleOptions={ROLES}
      onClose={onClose}
      onSave={onSave}
      {...over}
    />,
  );
  return { onSave, onClose };
}

describe('ContactChannelEditModal', () => {
  it('populates the type and role selectors from reference data', () => {
    renderModal();
    const kind = screen.getByRole('combobox', { name: 'Type de contact' });
    expect(within(kind).getAllByRole('option').map((o) => o.textContent)).toEqual(
      expect.arrayContaining(['Téléphone', 'E-mail']),
    );
    const role = screen.getByRole('combobox', { name: 'Rôle du contact' });
    expect(within(role).getByRole('option', { name: '— Aucun rôle —' })).toBeInTheDocument();
    expect(within(role).getByRole('option', { name: 'Réservation' })).toBeInTheDocument();
  });

  it('keeps the save action disabled until a value is entered', () => {
    renderModal();
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Valeur du contact'), { target: { value: '0262 49 64 59' } });
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
  });

  it('returns the trimmed value and chosen type/role on save', () => {
    const { onSave } = renderModal();
    fireEvent.change(screen.getByLabelText('Type de contact'), { target: { value: 'email' } });
    fireEvent.change(screen.getByLabelText('Rôle du contact'), { target: { value: 'reservation' } });
    fireEvent.change(screen.getByLabelText('Valeur du contact'), { target: { value: '  hello@exemple.re  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    const saved = onSave.mock.calls[0][0] as ObjectWorkspaceContactItem;
    expect(saved.kindCode).toBe('email');
    expect(saved.kindLabel).toBe('E-mail');
    expect(saved.roleCode).toBe('reservation');
    expect(saved.value).toBe('hello@exemple.re');
  });

  it('edits the public and primary flags inside the modal', () => {
    const { onSave } = renderModal({
      mode: 'edit',
      contact: { ...createContactDraft(KINDS, true), value: '0262 49 64 59', isPublic: true, isPrimary: false },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Visible publiquement' }));
    fireEvent.click(screen.getByRole('button', { name: 'Canal principal pour ce type' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    const saved = onSave.mock.calls[0][0] as ObjectWorkspaceContactItem;
    expect(saved.isPublic).toBe(false);
    expect(saved.isPrimary).toBe(true);
  });

  it('uses an edit title in edit mode', () => {
    renderModal({ mode: 'edit', contact: { ...createContactDraft(KINDS, true), value: 'x' } });
    expect(screen.getByText('Modifier le canal de contact')).toBeInTheDocument();
  });
});
