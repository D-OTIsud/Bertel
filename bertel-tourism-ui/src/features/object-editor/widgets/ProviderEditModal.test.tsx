import { render, screen, fireEvent } from '@testing-library/react';
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
    contactsRestricted: false,
    ...partial,
  };
}

function renderModal(over: Partial<Parameters<typeof ProviderEditModal>[0]> = {}) {
  const onSave = jest.fn();
  const onClose = jest.fn();
  render(
    <ProviderEditModal
      open
      actor={actor()}
      roleOptions={ROLE_OPTIONS}
      noteUnavailableReason={null}
      onClose={onClose}
      onSave={onSave}
      {...over}
    />,
  );
  return { onSave, onClose };
}

describe('ProviderEditModal', () => {
  it('titles the modal with the prestataire name and lists the role catalog', () => {
    renderModal();
    expect(screen.getByRole('heading', { name: 'Marie Guide' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exploitant' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Guide' })).toBeInTheDocument();
  });

  it('returns the patched role / visibility / primary / trimmed note on save', () => {
    const { onSave } = renderModal({ actor: actor({ note: '' }) });
    fireEvent.click(screen.getByRole('button', { name: 'Guide' }));
    fireEvent.click(screen.getByRole('button', { name: 'Interne' }));
    fireEvent.click(screen.getByRole('button', { name: 'Contact principal pour ce rôle' }));
    fireEvent.click(screen.getByText('Ajouter une note interne'));
    fireEvent.change(screen.getByLabelText('Note sur Marie Guide'), { target: { value: '  Référent terrain  ' } });
    fireEvent.click(screen.getByRole('button', { name: /^(Ajouter|Appliquer)$/ }));

    const saved = onSave.mock.calls[0][0] as ObjectWorkspaceActorLinkItem;
    expect(saved).toMatchObject({
      roleCode: 'guide', roleId: 'r-guide', roleLabel: 'Guide',
      visibility: 'private', isPrimary: true, note: 'Référent terrain',
    });
  });

  it('keeps a legacy role selectable even when absent from the catalog', () => {
    renderModal({ actor: actor({ roleCode: 'legacy_role', roleLabel: 'Ancien rôle' }) });
    expect(screen.getByRole('button', { name: 'Ancien rôle' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('§208 — disables the Note field and states the per-fiche reason (no silent write-trap)', () => {
    renderModal({ noteUnavailableReason: "Réservé aux membres de l'organisation éditrice — non modifiable ici." });
    const note = screen.getByLabelText('Note sur Marie Guide');
    expect(note).toHaveAttribute('readonly');
    expect(screen.getByText("Réservé aux membres de l'organisation éditrice — non modifiable ici.")).toBeInTheDocument();
    fireEvent.change(note, { target: { value: 'Tentative de saisie' } });
    expect(note).toHaveValue('');
  });

  // §208 — le verdict est PAR FICHE : une ligne rédigée par le serveur ne décide de rien, et un
  // lien NEUF (contactsRestricted false par construction) ne rouvre pas le champ pour autant.
  it("§208 — le drapeau de la LIGNE ne pilote pas le champ : seul le verdict par fiche le fait", () => {
    renderModal({ actor: actor({ contactsRestricted: true, note: '' }), noteUnavailableReason: null });
    expect(screen.getByLabelText('Note sur Marie Guide')).not.toHaveAttribute('readonly');
  });

  it('keeps the Note field editable and saves it when no reason is given', () => {
    const { onSave } = renderModal({ actor: actor({ contactsRestricted: false, note: '' }), noteUnavailableReason: null });
    fireEvent.click(screen.getByText('Ajouter une note interne'));
    const note = screen.getByLabelText('Note sur Marie Guide');
    expect(note).not.toHaveAttribute('readonly');
    fireEvent.change(note, { target: { value: 'Référent terrain' } });
    fireEvent.click(screen.getByRole('button', { name: /^(Ajouter|Appliquer)$/ }));
    expect((onSave.mock.calls[0][0] as ObjectWorkspaceActorLinkItem).note).toBe('Référent terrain');
  });

  it('preserves a locked note byte-for-byte while role and visibility change', () => {
    const { onSave } = renderModal({ actor: actor({ note: '  Source protégée  ', validFrom: '2025-01-01', validTo: '2027-12-31' }), noteUnavailableReason: 'Note non modifiable.' });
    fireEvent.click(screen.getByRole('button', { name: 'Guide' }));
    fireEvent.click(screen.getByRole('button', { name: /^(Ajouter|Appliquer)$/ }));
    expect(onSave.mock.calls[0][0]).toMatchObject({ note: '  Source protégée  ', validFrom: '2025-01-01', validTo: '2027-12-31', roleCode: 'guide' });
  });
});
