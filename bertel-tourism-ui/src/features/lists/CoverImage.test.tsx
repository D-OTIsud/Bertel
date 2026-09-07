import { fireEvent, render, screen } from '@testing-library/react';
import { CoverImage } from './CoverImage';

describe('CoverImage — repli sur URL cassée (§listes 2026-09-07)', () => {
  it('rend une <img> quand une src est fournie', () => {
    render(<CoverImage src="https://img/ok.jpg" alt="Couverture" />);
    expect(screen.getByRole('img', { name: 'Couverture' })).toHaveAttribute('src', 'https://img/ok.jpg');
  });

  it('bascule sur un aplat neutre quand aucune src n’est fournie', () => {
    const { container } = render(<CoverImage src={null} alt="Couverture" />);
    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(container.querySelector('.bg-\\[\\#cfc6b6\\]')).toBeInTheDocument();
  });

  it('bascule sur l’aplat neutre après un échec de chargement (onError), sans planter', () => {
    const { container } = render(<CoverImage src="https://img/broken.jpg" alt="Couverture" />);
    const img = screen.getByRole('img', { name: 'Couverture' });
    fireEvent.error(img);
    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(container.querySelector('.bg-\\[\\#cfc6b6\\]')).toBeInTheDocument();
  });

  it('retente une NOUVELLE src même si la précédente avait échoué', () => {
    const { container, rerender } = render(<CoverImage src="https://img/broken.jpg" alt="Couverture" />);
    fireEvent.error(screen.getByRole('img', { name: 'Couverture' }));
    expect(container.querySelector('img')).not.toBeInTheDocument();

    rerender(<CoverImage src="https://img/other.jpg" alt="Couverture" />);
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://img/other.jpg');
  });
});
