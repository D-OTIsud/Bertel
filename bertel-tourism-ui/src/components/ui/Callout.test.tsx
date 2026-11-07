import { render, screen } from '@testing-library/react';
import { Callout } from './Callout';

describe('Callout', () => {
  it('rend un role=note avec aria-label, titre, corps et chips', () => {
    render(
      <Callout
        variant="info"
        ariaLabel="Périmètre de l'outil"
        title="Ce que l'outil touche"
        chips={[{ label: 'Données du sujet' }, { label: 'Référentiel public' }]}
      >
        Corps explicatif.
      </Callout>,
    );
    expect(screen.getByRole('note', { name: "Périmètre de l'outil" })).toBeInTheDocument();
    expect(screen.getByText("Ce que l'outil touche")).toBeInTheDocument();
    expect(screen.getByText('Corps explicatif.')).toBeInTheDocument();
    expect(screen.getByText('Données du sujet')).toBeInTheDocument();
    expect(screen.getByText('Référentiel public')).toBeInTheDocument();
  });

  it('applique la surface de la variante (token résolu, pas transparent)', () => {
    render(
      <Callout variant="danger" ariaLabel="Erreur">
        x
      </Callout>,
    );
    expect(screen.getByRole('note', { name: 'Erreur' })).toHaveClass('bg-danger-bg');
  });
});
