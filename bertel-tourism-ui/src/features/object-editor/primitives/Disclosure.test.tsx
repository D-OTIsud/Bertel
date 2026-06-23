import { render, screen, fireEvent } from '@testing-library/react';
import { Disclosure } from './Disclosure';

describe('Disclosure', () => {
  it('rend le titre et le résumé', () => {
    render(<Disclosure title="Détails de capacité" summary="3 métrique(s)"><p>contenu</p></Disclosure>);
    expect(screen.getByText('Détails de capacité')).toBeInTheDocument();
    expect(screen.getByText('3 métrique(s)')).toBeInTheDocument();
  });

  it('est replié par défaut (contenu masqué, aria-expanded=false)', () => {
    render(<Disclosure title="T"><p>contenu</p></Disclosure>);
    const head = screen.getByRole('button', { name: /T/ });
    expect(head).toHaveAttribute('aria-expanded', 'false');
  });

  it('s’ouvre/ferme au clic (aria-expanded bascule)', () => {
    render(<Disclosure title="T"><p>contenu</p></Disclosure>);
    const head = screen.getByRole('button', { name: /T/ });
    fireEvent.click(head);
    expect(head).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(head);
    expect(head).toHaveAttribute('aria-expanded', 'false');
  });

  it('respecte defaultOpen', () => {
    render(<Disclosure title="T" defaultOpen><p>contenu</p></Disclosure>);
    expect(screen.getByRole('button', { name: /T/ })).toHaveAttribute('aria-expanded', 'true');
  });
});
