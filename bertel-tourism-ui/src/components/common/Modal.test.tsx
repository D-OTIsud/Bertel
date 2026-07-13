import { render, screen, fireEvent, act } from '@testing-library/react';
import { Modal } from './Modal';

describe('Modal (primitive maison, remplace shadcn Dialog/Sheet)', () => {
  it('rend un dialog nommé (aria-modal) avec corps + footer', () => {
    render(
      <Modal title="Inviter un membre" open onOpenChange={jest.fn()} footer={<button type="button">Valider</button>}>
        <input aria-label="Champ" />
      </Modal>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Inviter un membre' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).not.toHaveClass('app-modal--drawer');
    expect(screen.getByLabelText('Champ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Valider' })).toBeInTheDocument();
  });

  it('variant="drawer" applique les classes tiroir en restant un dialog', () => {
    const { container } = render(
      <Modal title="Permissions" variant="drawer" open onOpenChange={jest.fn()}>
        <p>x</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: 'Permissions' })).toHaveClass('app-modal--drawer');
    expect(container.querySelector('.app-modal-overlay')).toHaveClass('app-modal-overlay--drawer');
  });

  it('Escape, clic overlay et bouton Fermer appellent onOpenChange(false)', () => {
    const onOpenChange = jest.fn();
    const { container } = render(
      <Modal title="T" open onOpenChange={onOpenChange}>
        <input aria-label="C" />
      </Modal>,
    );
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'T' }), { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    fireEvent.mouseDown(container.querySelector('.app-modal-overlay') as HTMLElement);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onOpenChange).toHaveBeenCalledTimes(3);
  });

  it('D1 : verrouille le scroll du body à l’ouverture et le restaure à la fermeture', () => {
    document.body.style.overflow = '';
    const { unmount } = render(
      <Modal title="T" open onOpenChange={jest.fn()}>
        <input aria-label="C" />
      </Modal>,
    );
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('D1 : focus initial sur le premier champ, puis restauration au déclencheur à la fermeture', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Ouvrir';
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = render(
      <Modal title="T" open onOpenChange={jest.fn()}>
        <input aria-label="Premier champ" />
      </Modal>,
    );
    expect(screen.getByLabelText('Premier champ')).toHaveFocus();

    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it('D1 : le trap Tab compte les éléments à tabindex et boucle depuis un focus échappé', () => {
    render(
      <Modal title="T" open onOpenChange={jest.fn()}>
        <div tabIndex={0} aria-label="Zone focusable" />
        <input aria-label="Champ" />
      </Modal>,
    );
    const dialog = screen.getByRole('dialog', { name: 'T' });

    // Focus échappé (body) : Tab doit ramener sur le premier focusable de la carte.
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Fermer' })).toHaveFocus();

    // Depuis le dernier focusable, Tab reboucle sur le premier.
    screen.getByLabelText('Champ').focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Fermer' })).toHaveFocus();
  });

  it('does not render when open is false', () => {
    render(
      <Modal title="Test" open={false} onOpenChange={() => {}}>
        content
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('stays in the DOM with data-motion-phase="exiting" during the exit window, then unmounts', () => {
    jest.useFakeTimers();
    const { rerender } = render(
      <Modal title="Test" open onOpenChange={() => {}}>
        content
      </Modal>,
    );
    act(() => {
      jest.advanceTimersByTime(20);
    });
    expect(screen.getByRole('dialog').closest('[data-motion-phase]')).toHaveAttribute('data-motion-phase', 'open');

    rerender(
      <Modal title="Test" open={false} onOpenChange={() => {}}>
        content
      </Modal>,
    );
    expect(screen.getByRole('dialog').closest('[data-motion-phase]')).toHaveAttribute('data-motion-phase', 'exiting');

    // default variant="modal" exits over 220ms (matches --motion-base / the .app-modal CSS transition).
    act(() => {
      jest.advanceTimersByTime(220);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    jest.useRealTimers();
  });
});
