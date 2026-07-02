import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('boum');
  }
  return <p>Contenu sain</p>;
}

describe('ErrorBoundary', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    // React + le boundary journalisent l'erreur : on silencie pour un output propre.
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('rend les enfants quand tout va bien', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Contenu sain')).toBeInTheDocument();
  });

  it('affiche l’écran de repli avec une référence incident quand un enfant throw', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Une erreur est survenue')).toBeInTheDocument();
    expect(screen.getByText(/^ERR-/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Réessayer/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Retour à l’accueil|Retour à l'accueil/ })).toHaveAttribute('href', '/');
  });

  it('« Réessayer » relance le rendu des enfants', () => {
    function Harness() {
      const [shouldThrow, setShouldThrow] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setShouldThrow(false)}>
            répare
          </button>
          <ErrorBoundary>
            <Bomb shouldThrow={shouldThrow} />
          </ErrorBoundary>
        </>
      );
    }
    render(<Harness />);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // On répare la cause puis on relance : le contenu doit revenir.
    fireEvent.click(screen.getByRole('button', { name: 'répare' }));
    fireEvent.click(screen.getByRole('button', { name: /Réessayer/ }));
    expect(screen.getByText('Contenu sain')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
