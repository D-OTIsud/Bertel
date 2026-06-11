import { render, screen, fireEvent } from '@testing-library/react';
import { WidgetFrame } from './WidgetFrame';

describe('WidgetFrame', () => {
  it('affiche le chargement', () => {
    render(<WidgetFrame isLoading error={null}><p>contenu</p></WidgetFrame>);
    expect(screen.getByRole('status')).toHaveTextContent('Chargement');
    expect(screen.queryByText('contenu')).not.toBeInTheDocument();
  });

  it("affiche l'erreur avec bouton réessayer", () => {
    const onRetry = jest.fn();
    render(
      <WidgetFrame isLoading={false} error={new Error('x')} onRetry={onRetry}>
        <p>contenu</p>
      </WidgetFrame>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Impossible de charger');
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("affiche l'état vide", () => {
    render(
      <WidgetFrame isLoading={false} error={null} isEmpty emptyLabel="Rien ici.">
        <p>contenu</p>
      </WidgetFrame>,
    );
    expect(screen.getByText('Rien ici.')).toBeInTheDocument();
  });

  it('affiche les enfants sinon', () => {
    render(<WidgetFrame isLoading={false} error={null}><p>contenu</p></WidgetFrame>);
    expect(screen.getByText('contenu')).toBeInTheDocument();
  });
});
