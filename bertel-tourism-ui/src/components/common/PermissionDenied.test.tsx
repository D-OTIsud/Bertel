import { render, screen } from '@testing-library/react';
import { PermissionDenied } from './PermissionDenied';

describe('PermissionDenied', () => {
  it('rend un panneau role=alert avec le titre par défaut et la voie de recours', () => {
    render(<PermissionDenied />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Accès réservé' })).toBeInTheDocument();
    expect(screen.getByText(/Contactez votre administrateur/)).toBeInTheDocument();
  });

  it('accepte un titre, une description et un id de titre personnalisés', () => {
    render(
      <PermissionDenied headingId="mon-id" title="Réservé aux gestionnaires" description="Explication dédiée." />,
    );
    const heading = screen.getByRole('heading', { name: 'Réservé aux gestionnaires' });
    expect(heading).toHaveAttribute('id', 'mon-id');
    expect(screen.getByText('Explication dédiée.')).toBeInTheDocument();
  });
});
