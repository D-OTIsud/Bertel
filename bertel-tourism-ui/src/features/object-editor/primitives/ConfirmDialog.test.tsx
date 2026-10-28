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

function EmbeddedConfirmation() {
  const [open, setOpen] = useState(false);
  const [present, setPresent] = useState(true);
  return <section>
    <button type="button">Ouvrir la carte</button>
    <fieldset>
      <div hidden><button type="button">Période repliée</button></div>
      {present && <button type="button" onClick={() => setOpen(true)}>Supprimer la fermeture</button>}
      <button type="button">Ajouter une exception</button>
      <ConfirmDialog open={open} title="Supprimer la fermeture" message="Supprimer cette fermeture ?"
        confirmLabel="Supprimer" onCancel={() => setOpen(false)}
        onConfirm={() => { setPresent(false); setOpen(false); }} />
    </fieldset>
  </section>;
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

  it('returns focus to visible embedded controls when deleting the opener, without jumping to the enclosing map', async () => {
    render(<EmbeddedConfirmation />);
    const opener = screen.getByRole('button', { name: 'Supprimer la fermeture' });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(opener).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ajouter une exception' })).toHaveFocus();
  });
});
