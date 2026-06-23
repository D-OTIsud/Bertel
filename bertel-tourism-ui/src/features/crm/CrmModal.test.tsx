import { render, screen, fireEvent } from '@testing-library/react';
import { CrmModal } from './CrmModal';

// Primitive modal CRM (§61 rectifs PO point 3) — accessibilité de base : dialog nommé,
// fermeture Escape / overlay / ✕, focus initial sur le premier champ.
describe('CrmModal', () => {
  it('rend un dialog nommé (aria-modal) avec corps et footer', () => {
    render(
      <CrmModal title="Test modal" onClose={jest.fn()} footer={<button type="button">Valider</button>}>
        <input aria-label="Champ" />
      </CrmModal>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Test modal' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByLabelText('Champ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Valider' })).toBeInTheDocument();
  });

  it('focus initial sur le premier champ du formulaire (pas le bouton ✕)', () => {
    render(
      <CrmModal title="Test modal" onClose={jest.fn()}>
        <input aria-label="Premier champ" />
      </CrmModal>,
    );
    expect(screen.getByLabelText('Premier champ')).toHaveFocus();
  });

  it('Escape, clic overlay et bouton Fermer appellent onClose', () => {
    const onClose = jest.fn();
    const { container } = render(
      <CrmModal title="Test modal" onClose={onClose}>
        <input aria-label="Champ" />
      </CrmModal>,
    );
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Test modal' }), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.mouseDown(container.querySelector('.crm-modal-overlay') as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  // Phase 5.2 — variante tiroir latéral (dé-modalisation de l'édition acteur). Même primitive,
  // même rôle dialog + footer collant ; seules des classes modificatrices changent le chrome
  // (ancrage droit pleine hauteur). Pas de second design system (réemploi maison, pas shadcn).
  it('variant="drawer" applique les classes modificatrices en restant un dialog nommé', () => {
    const { container } = render(
      <CrmModal title="Modifier l'acteur" variant="drawer" onClose={jest.fn()} footer={<button type="button">Enregistrer</button>}>
        <input aria-label="Champ" />
      </CrmModal>,
    );
    const dialog = screen.getByRole('dialog', { name: "Modifier l'acteur" });
    expect(dialog).toHaveClass('crm-modal--drawer');
    expect(container.querySelector('.crm-modal-overlay')).toHaveClass('crm-modal-overlay--drawer');
  });

  it('variant par défaut = modal centré (aucune classe drawer)', () => {
    const { container } = render(
      <CrmModal title="X" onClose={jest.fn()}>
        <input aria-label="C" />
      </CrmModal>,
    );
    expect(screen.getByRole('dialog', { name: 'X' })).not.toHaveClass('crm-modal--drawer');
    expect(container.querySelector('.crm-modal-overlay')).not.toHaveClass('crm-modal-overlay--drawer');
  });

  it('Tab boucle à l intérieur du dialogue (trap léger)', () => {
    render(
      <CrmModal title="Test modal" onClose={jest.fn()} footer={<button type="button">Valider</button>}>
        <input aria-label="Champ" />
      </CrmModal>,
    );
    // Dernier élément focusable = Valider ; Tab depuis lui revient au premier (✕).
    const last = screen.getByRole('button', { name: 'Valider' });
    last.focus();
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Test modal' }), { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Fermer' })).toHaveFocus();
  });
});
