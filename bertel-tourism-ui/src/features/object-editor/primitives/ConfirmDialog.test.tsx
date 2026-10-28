import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfirmDialog } from './ConfirmDialog';
import { EditorModal } from './EditorModal';

function NestedConfirmation({ onParentClose }: { onParentClose: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [name, setName] = useState('Brouillon');
  return <EditorModal open title="Modifier la ligne" onClose={onParentClose} onSave={() => undefined}>
    <input aria-label="Nom conservé" value={name} onChange={(event) => setName(event.target.value)} />
    <button type="button" onClick={() => setConfirm(true)}>Demander la suppression</button>
    <ConfirmDialog open={confirm} title="Supprimer la ligne" message="Supprimer cette ligne du brouillon ?"
      confirmLabel="Supprimer" tone="danger" onCancel={() => setConfirm(false)} onConfirm={() => setConfirm(false)} />
  </EditorModal>;
}

describe('ConfirmDialog', () => {
  it('renders the title, message and labelled actions when open', () => {
    render(
      <ConfirmDialog
        open
        title="Détacher le prestataire"
        message="Voulez-vous vraiment détacher ?"
        confirmLabel="Détacher"
        tone="danger"
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />,
    );
    expect(screen.getByText('Détacher le prestataire')).toBeInTheDocument();
    expect(screen.getByText('Voulez-vous vraiment détacher ?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Détacher' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument();
  });

  it('fires onConfirm and onCancel from the matching buttons', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(
      <ConfirmDialog
        open
        title="T"
        message="M"
        confirmLabel="Confirmer"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders nothing while closed', () => {
    render(<ConfirmDialog open={false} title="T" message="M" onCancel={() => undefined} onConfirm={() => undefined} />);
    expect(screen.queryByText('T')).not.toBeInTheDocument();
  });

  it('keeps a real parent EditorModal and its draft intact on Escape, then restores focus to the confirmation opener', async () => {
    const onParentClose = jest.fn();
    render(<NestedConfirmation onParentClose={onParentClose} />);
    const input = screen.getByLabelText('Nom conservé');
    fireEvent.change(input, { target: { value: 'Modifié sans enregistrer' } });
    const opener = screen.getByRole('button', { name: 'Demander la suppression' });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole('button', { name: 'Annuler' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Supprimer la ligne' })).not.toBeInTheDocument());
    expect(onParentClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Modifier la ligne' })).toBeInTheDocument();
    expect(input).toHaveValue('Modifié sans enregistrer');
    expect(opener).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onParentClose).toHaveBeenCalledTimes(1);
  });
});
