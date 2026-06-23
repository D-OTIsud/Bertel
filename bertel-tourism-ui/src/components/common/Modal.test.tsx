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
});
