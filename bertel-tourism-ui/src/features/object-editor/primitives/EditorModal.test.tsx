import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EditorModal, EditorModalContext } from './EditorModal';

describe('EditorModal', () => {
  it('renders title + children when open and fires save/cancel', () => {
    const onSave = jest.fn();
    const onClose = jest.fn();
    render(
      <EditorModal open title="Modifier le média" onClose={onClose} onSave={onSave}>
        <p>Corps</p>
      </EditorModal>,
    );
    expect(screen.getByText('Modifier le média')).toBeInTheDocument();
    expect(screen.getByText('Corps')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onSave).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing when closed', () => {
    render(
      <EditorModal open={false} title="X" onClose={() => {}} onSave={() => {}}>
        <p>Corps</p>
      </EditorModal>,
    );
    expect(screen.queryByText('Corps')).not.toBeInTheDocument();
  });

  it('carries the actual object context through the dialog portal', () => {
    render(
      <EditorModalContext.Provider value="Domaine du Bel Air · Hébergement">
        <EditorModal open title="Ajouter une salle" eyebrow="Salles" onClose={() => {}} onSave={() => {}}>
          <input aria-label="Nom" />
        </EditorModal>
      </EditorModalContext.Provider>,
    );
    expect(screen.getByText('Domaine du Bel Air · Hébergement')).toBeInTheDocument();
  });

  it('focuses the first visible field and closes through Escape', () => {
    const onClose = jest.fn();
    render(
      <EditorModal
        open
        title="Ajouter une période"
        eyebrow="Horaires"
        saveLabel="Ajouter"
        onClose={onClose}
        onSave={() => {}}
        aside={<p>Aperçu de la période</p>}
      >
        <div hidden>
          <input aria-label="Option repliée" />
        </div>
        <input aria-label="Nom de la période" />
      </EditorModal>,
    );
    expect(screen.getByLabelText('Nom de la période')).toHaveFocus();
    expect(screen.getByRole('complementary', { name: 'Aperçu' })).toHaveTextContent('Aperçu de la période');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('skips fields in closed native details and disabled fieldsets', () => {
    render(
      <EditorModal open title="Rattachement" onClose={() => {}} onSave={() => {}}>
        <details>
          <summary>Note interne</summary>
          <textarea aria-label="Note masquée" />
        </details>
        <fieldset disabled>
          <input aria-label="Champ indisponible" />
        </fieldset>
        <button type="button">Choisir un rôle</button>
      </EditorModal>,
    );
    expect(screen.getByRole('button', { name: 'Choisir un rôle' })).toHaveFocus();
  });

  it('returns focus to the opener after Escape closes a controlled dialog', async () => {
    function ControlledModal() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Modifier
          </button>
          <EditorModal open={open} title="Période" onClose={() => setOpen(false)} onSave={() => {}}>
            <input aria-label="Nom" />
          </EditorModal>
        </>
      );
    }
    render(<ControlledModal />);
    const opener = screen.getByRole('button', { name: 'Modifier' });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByLabelText('Nom')).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });
});
