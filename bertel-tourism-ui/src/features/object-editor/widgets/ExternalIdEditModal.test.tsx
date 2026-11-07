import { render, screen, fireEvent, within } from '@testing-library/react';
import { ExternalIdEditModal } from './ExternalIdEditModal';
import { createExternalIdDraft } from '../sections/external-id-edit';
import type { ObjectWorkspaceExternalIdentifierItem } from '../../../services/object-workspace-parser';

function renderModal(over: Partial<Parameters<typeof ExternalIdEditModal>[0]> = {}) {
  const onSave = jest.fn();
  const onClose = jest.fn();
  render(
    <ExternalIdEditModal
      open
      mode="add"
      item={createExternalIdDraft()}
      onClose={onClose}
      onSave={onSave}
      {...over}
    />,
  );
  return { onSave, onClose };
}

describe('ExternalIdEditModal', () => {
  it('offers only the non-canonical sources in the selector', () => {
    renderModal();
    const select = screen.getByRole('combobox', { name: 'Système source' });
    const labels = within(select).getAllByRole('option').map((o) => o.textContent);
    expect(labels).toEqual(['Airtable (recId)', 'Apidae (object_id)', 'DataTourisme (URI)']);
  });

  it('keeps save disabled until an identifier is entered', () => {
    renderModal();
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Identifiant externe'), { target: { value: 'recABC123' } });
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
  });

  it('returns the trimmed source and identifier on save', () => {
    const { onSave } = renderModal();
    fireEvent.change(screen.getByLabelText('Système source'), { target: { value: 'AP' } });
    fireEvent.change(screen.getByLabelText('Identifiant externe'), { target: { value: '  12345  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    const saved = onSave.mock.calls[0][0] as ObjectWorkspaceExternalIdentifierItem;
    expect(saved.sourceSystem).toBe('AP');
    expect(saved.externalId).toBe('12345');
  });

  it('uses an edit title and preserves the row id in edit mode', () => {
    const { onSave } = renderModal({
      mode: 'edit',
      item: { ...createExternalIdDraft(), id: 'row-1', sourceSystem: 'DT', externalId: 'uri:1' },
    });
    expect(screen.getByText('Modifier l’identifiant externe')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const saved = onSave.mock.calls[0][0] as ObjectWorkspaceExternalIdentifierItem;
    expect(saved.id).toBe('row-1');
  });
});
