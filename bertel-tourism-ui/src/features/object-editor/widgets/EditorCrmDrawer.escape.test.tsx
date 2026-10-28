import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorCrmDrawer } from './EditorCrmDrawer';

// Only the backend-dependent panel is substituted. Sheet, its Radix capture
// listener, and the nested CRM modal/focus behavior are the production components.
jest.mock('../../crm/CrmEstablishmentPanel', () => {
  const { useState } = jest.requireActual<typeof import('react')>('react');
  const { CrmModal } = jest.requireActual<typeof import('../../crm/CrmModal')>('../../crm/CrmModal');
  return {
    CrmEstablishmentPanel: function Panel() {
      const [editing, setEditing] = useState(false);
      const [name, setName] = useState('Marie');
      const [saved, setSaved] = useState('');
      return <>
        <button onClick={() => setEditing(true)}>Modifier l’acteur</button>
        <output aria-label="Nom appliqué">{saved}</output>
        {editing && <CrmModal title="Modifier l’acteur" variant="drawer" onClose={() => setEditing(false)}
          footer={<button onClick={() => { setSaved(name); setEditing(false); }}>Appliquer</button>}>
          <input aria-label="Nom de l’acteur" value={name} onChange={(event) => setName(event.target.value)} />
        </CrmModal>}
      </>;
    },
  };
});

function ControlledDrawer({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(true);
  return <EditorCrmDrawer objectId="o1" canWrite open={open} onClose={() => { onClose(); setOpen(false); }} />;
}

it('le premier Escape ferme seulement le CRM enfant, rend le focus, puis le second ferme le Sheet', async () => {
  const onClose = jest.fn();
  render(<ControlledDrawer onClose={onClose} />);
  const opener = screen.getByRole('button', { name: 'Modifier l’acteur' });
  await userEvent.click(opener);
  const child = screen.getByRole('dialog', { name: 'Modifier l’acteur' });
  const input = within(child).getByRole('textbox', { name: 'Nom de l’acteur' });
  expect(input).toHaveFocus();
  await userEvent.type(input, ' Hoarau');
  expect(input).toHaveValue('Marie Hoarau');
  await userEvent.tab();
  expect(within(child).getByRole('button', { name: 'Appliquer' })).toHaveFocus();
  await userEvent.tab();
  expect(within(child).getByRole('button', { name: 'Fermer' })).toHaveFocus();
  await userEvent.tab({ shift: true });
  expect(within(child).getByRole('button', { name: 'Appliquer' })).toHaveFocus();
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('dialog', { name: 'Modifier l’acteur' })).not.toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: "Suivi CRM de l'établissement" })).toBeInTheDocument();
  expect(onClose).not.toHaveBeenCalled();
  expect(opener).toHaveFocus();
  await userEvent.keyboard('{Escape}');
  expect(onClose).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

it('Escape garde sa fermeture normale lorsque le Sheet ne contient pas de modal CRM ouverte', async () => {
  const onClose = jest.fn();
  render(<ControlledDrawer onClose={onClose} />);
  await userEvent.keyboard('{Escape}');
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('les champs et l’action de l’enfant restent utilisables au clavier sans fermer le Sheet', async () => {
  const onClose = jest.fn();
  render(<ControlledDrawer onClose={onClose} />);
  const opener = screen.getByRole('button', { name: 'Modifier l’acteur' });
  await userEvent.click(opener);
  const input = screen.getByRole('textbox', { name: 'Nom de l’acteur' });
  await userEvent.clear(input);
  await userEvent.type(input, 'Marie Guide');
  await userEvent.tab();
  await userEvent.keyboard('{Enter}');
  expect(screen.getByLabelText('Nom appliqué')).toHaveTextContent('Marie Guide');
  expect(onClose).not.toHaveBeenCalled();
  expect(opener).toHaveFocus();
});
