import { render, fireEvent } from '@testing-library/react';
import { Pav } from './crm-primitives';

// Repli portrait acteur (revue) : une photo cassée/404 retombe sur les initiales teintées —
// jamais de tuile vide (le GC des orphelins storage est différé ⇒ des url mortes existeront).
describe('Pav — portrait acteur', () => {
  it('rend l img quand photoUrl est fourni', () => {
    const { container } = render(<Pav name="Marie Hoarau" tintKey="actor-1" photoUrl="https://cdn/p.jpg" />);
    const img = container.querySelector('.pav--photo img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', 'https://cdn/p.jpg');
    // alt décoratif (le nom est rendu à côté).
    expect(img).toHaveAttribute('alt', '');
  });

  it('rend les initiales quand photoUrl est absent', () => {
    const { container, getByText } = render(<Pav name="Marie Hoarau" tintKey="actor-1" />);
    expect(container.querySelector('.pav--photo')).toBeNull();
    expect(getByText('MH')).toBeInTheDocument();
  });

  it('une photo cassée retombe sur les initiales', () => {
    const { container, queryByText, getByText } = render(
      <Pav name="Marie Hoarau" tintKey="actor-1" photoUrl="https://cdn/dead.jpg" />,
    );
    const img = container.querySelector('.pav--photo img');
    expect(img).not.toBeNull();
    expect(queryByText('MH')).toBeNull(); // encore l'image, pas d'initiales

    fireEvent.error(img as Element);

    // L'image a disparu ⇒ repli sur la tuile d'initiales teintées.
    expect(container.querySelector('.pav--photo')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(getByText('MH')).toBeInTheDocument();
  });

  it('change de photoUrl ⇒ l état d erreur est remis à zéro (pas de repli qui colle)', () => {
    const { container, rerender } = render(
      <Pav name="Marie Hoarau" tintKey="actor-1" photoUrl="https://cdn/dead.jpg" />,
    );
    fireEvent.error(container.querySelector('.pav--photo img') as Element);
    expect(container.querySelector('.pav--photo')).toBeNull(); // cassée → initiales

    // Nouvel acteur avec une photo valide : on retente l'image (l'erreur ne colle pas).
    rerender(<Pav name="Jean Payet" tintKey="actor-2" photoUrl="https://cdn/fresh.jpg" />);
    const img = container.querySelector('.pav--photo img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', 'https://cdn/fresh.jpg');
  });
});
