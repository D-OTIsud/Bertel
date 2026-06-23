import { render, screen, fireEvent } from '@testing-library/react';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('affiche le titre et la description', () => {
    render(
      <EmptyState
        mode="no-data"
        title="Aucun acteur dans votre annuaire"
        description="Créez un premier acteur pour démarrer."
      />,
    );
    expect(screen.getByText('Aucun acteur dans votre annuaire')).toBeInTheDocument();
    expect(screen.getByText('Créez un premier acteur pour démarrer.')).toBeInTheDocument();
  });

  it('mode no-data : rend un CTA primaire qui appelle onClick', () => {
    const onClick = jest.fn();
    render(
      <EmptyState
        mode="no-data"
        title="Aucun acteur"
        action={{ label: 'Créer un acteur', onClick }}
      />,
    );
    const btn = screen.getByRole('button', { name: 'Créer un acteur' });
    expect(btn).toHaveClass('primary-button');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('mode filtered : rend un CTA secondaire (réinitialiser) qui appelle onClick', () => {
    const onClick = jest.fn();
    render(
      <EmptyState
        mode="filtered"
        title="Aucun résultat pour ces filtres"
        action={{ label: 'Réinitialiser les filtres', onClick }}
      />,
    );
    const btn = screen.getByRole('button', { name: 'Réinitialiser les filtres' });
    expect(btn).toHaveClass('ghost-button');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('mode coming-soon : aucun bouton, badge « Bientôt » par défaut', () => {
    render(<EmptyState mode="coming-soon" title="Module disponible au lot 4" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Bientôt')).toBeInTheDocument();
  });

  it('mode coming-soon : badge personnalisable', () => {
    render(<EmptyState mode="coming-soon" title="Bientôt" badge="Au lot 4" />);
    expect(screen.getByText('Au lot 4')).toBeInTheDocument();
  });

  it('mode error : rôle alert + bouton Réessayer qui appelle onClick', () => {
    const onClick = jest.fn();
    render(
      <EmptyState
        mode="error"
        title="Impossible de charger les fiches"
        description="Le service n'a pas répondu."
        action={{ label: 'Réessayer', onClick }}
      />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: 'Réessayer' });
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('sans action, ne rend aucun bouton (no-data)', () => {
    render(<EmptyState mode="no-data" title="Rien à afficher" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
