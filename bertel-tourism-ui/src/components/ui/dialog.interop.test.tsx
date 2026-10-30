import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { CrmModal } from '../../features/crm/CrmModal';
import { EditorModal } from '../../features/object-editor/primitives/EditorModal';

it('closes only the confirmation above an editor and returns focus inside the editor', async () => {
  const closeEditor = jest.fn();
  function Example() {
    const [confirming, setConfirming] = useState(false);
    return <EditorModal open title="Éditeur" onClose={closeEditor} onSave={() => undefined}>
      <button type="button" onClick={() => setConfirming(true)}>Demander la suppression</button>
      <ConfirmDialog open={confirming} title="Confirmer" message="Retirer du brouillon ?"
        onCancel={() => setConfirming(false)} onConfirm={() => setConfirming(false)} />
    </EditorModal>;
  }
  render(<Example />);
  fireEvent.click(screen.getByRole('button', { name: 'Demander la suppression' }));
  expect(screen.getByRole('dialog', { name: 'Confirmer' })).toBeInTheDocument();
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Confirmer' })).not.toBeInTheDocument());
  expect(closeEditor).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Demander la suppression' })).toHaveFocus());
  expect(getComputedStyle(document.body).overflow).toBe('hidden');
});

it('keeps a generic parent locked while a nested editor closes', async () => {
  function Example() {
    const [editing, setEditing] = useState(false);
    return <Modal open title="Parent" onOpenChange={() => undefined}>
      <button type="button" onClick={() => setEditing(true)}>Modifier</button>
      <EditorModal open={editing} title="Enfant" onClose={() => setEditing(false)} onSave={() => setEditing(false)}>
        <input aria-label="Champ enfant" />
      </EditorModal>
    </Modal>;
  }
  render(<Example />);
  fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
  expect(screen.getByLabelText('Champ enfant')).toHaveFocus();
  expect(Number(screen.getByRole('dialog', { name: 'Enfant' }).style.zIndex)).toBeGreaterThan(
    Number(screen.getByRole('dialog', { name: 'Parent', hidden: true }).style.zIndex),
  );
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Enfant' })).not.toBeInTheDocument());
  await waitFor(() => expect(screen.getByRole('button', { name: 'Modifier' })).toHaveFocus());
  expect(getComputedStyle(document.body).overflow).toBe('hidden');
});

it('keeps CRM ancestry and skips hidden or disabled initial controls', () => {
  const { container } = render(<div className="crm-app"><CrmModal title="CRM" onClose={() => undefined}>
    <div hidden><input aria-label="Masqué" /></div>
    <fieldset disabled><input aria-label="Désactivé" /></fieldset>
    <input aria-label="Disponible" />
  </CrmModal></div>);
  expect(container.querySelector('.crm-app .crm-modal')).toBe(screen.getByRole('dialog', { name: 'CRM' }));
  expect(screen.getByLabelText('Disponible')).toHaveFocus();
});

it('does not take focus from an editor opened while a CRM modal unmounts', async () => {
  function Example() {
    const [crm, setCrm] = useState(true);
    const [editor, setEditor] = useState(false);
    return <div className="crm-app">
      {crm && <CrmModal title="CRM" onClose={() => setCrm(false)}>
        <button type="button" onClick={() => { setCrm(false); setEditor(true); }}>Ouvrir l’éditeur</button>
      </CrmModal>}
      <EditorModal open={editor} title="Éditeur" onClose={() => setEditor(false)} onSave={() => undefined}>
        <input aria-label="Champ de l’éditeur" />
      </EditorModal>
    </div>;
  }
  render(<Example />);
  fireEvent.click(screen.getByRole('button', { name: 'Ouvrir l’éditeur' }));
  await waitFor(() => expect(screen.getByLabelText('Champ de l’éditeur')).toHaveFocus());
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(screen.getByLabelText('Champ de l’éditeur')).toHaveFocus();
  expect(getComputedStyle(document.body).overflow).toBe('hidden');
});
