import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EditorModal } from './EditorModal';
import { Field } from './Field';
import { Input } from './Input';

function DraftModal({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(true);
  const [name, setName] = useState('Congés');
  return <EditorModal open={open} title="Exception d’ouverture" onSave={() => undefined}
    onClose={() => { setOpen(false); onClose(); }}>
    <Field label="Nom" hint="Nom de l’exception"><Input value={name} onChange={setName} /></Field>
  </EditorModal>;
}

describe('Field help inside the real EditorModal', () => {
  it('consumes the first Escape without dismissing the modal or losing its draft; a second Escape closes the modal', async () => {
    const onClose = jest.fn();
    render(<DraftModal onClose={onClose} />);
    const help = screen.getByRole('button', { name: 'Aide : Nom' });
    const input = screen.getByLabelText('Nom');
    fireEvent.change(input, { target: { value: 'Congés annuels' } });
    fireEvent.focus(help);
    expect(help).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(help, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Exception d’ouverture' })).toBeInTheDocument();
    expect(help).toHaveAttribute('aria-expanded', 'false');
    expect(help).toHaveFocus();
    expect(input).toHaveValue('Congés annuels');
    expect(input).toHaveAccessibleDescription('Nom de l’exception');
    fireEvent.keyDown(help, { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('allows pointer interaction with the portaled bubble while the modal blocks body pointers', () => {
    const onClose = jest.fn();
    render(<DraftModal onClose={onClose} />);
    const help = screen.getByRole('button', { name: 'Aide : Nom' });
    fireEvent.mouseEnter(help);
    const bubble = document.querySelector<HTMLElement>('[data-field-help]')!;
    expect(document.body).toHaveStyle({ pointerEvents: 'none' });
    expect(getComputedStyle(bubble).pointerEvents).toBe('auto');
    fireEvent.mouseLeave(help);
    fireEvent.mouseEnter(bubble);
    fireEvent.pointerDown(bubble);
    expect(help).toHaveAttribute('aria-expanded', 'true');
    expect(onClose).not.toHaveBeenCalled();
  });
});
