import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from './Modal';

describe('Modal (primitive maison, remplace shadcn Dialog/Sheet)', () => {
  it('rend un dialog nommé (aria-modal) avec corps + footer', () => {
    render(
      <Modal title="Inviter un membre" onClose={jest.fn()} footer={<button type="button">Valider</button>}>
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
      <Modal title="Permissions" variant="drawer" onClose={jest.fn()}>
        <p>x</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: 'Permissions' })).toHaveClass('app-modal--drawer');
    expect(container.querySelector('.app-modal-overlay')).toHaveClass('app-modal-overlay--drawer');
  });

  it('Escape, clic overlay et bouton Fermer appellent onClose', () => {
    const onClose = jest.fn();
    const { container } = render(
      <Modal title="T" onClose={onClose}>
        <input aria-label="C" />
      </Modal>,
    );
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'T' }), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.mouseDown(container.querySelector('.app-modal-overlay') as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('D1 : verrouille le scroll du body à l’ouverture et le restaure à la fermeture', () => {
    document.body.style.overflow = '';
    const { unmount } = render(
      <Modal title="T" onClose={jest.fn()}>
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
      <Modal title="T" onClose={jest.fn()}>
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
      <Modal title="T" onClose={jest.fn()}>
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
});
