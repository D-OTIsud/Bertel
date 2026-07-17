import { render, screen, fireEvent } from '@testing-library/react';
import { WidgetFrame } from './WidgetFrame';

describe('WidgetFrame', () => {
  it('renders a skeleton (not bare text) while pending, with aria-busy status semantics', () => {
    render(<WidgetFrame isPending error={null}>content</WidgetFrame>);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(region).toHaveAccessibleName();
    expect(screen.queryByText('Chargement…')).not.toBeInTheDocument();
  });

  it('renders the provided custom skeleton when pending', () => {
    render(
      <WidgetFrame isPending error={null} skeleton={<div data-testid="custom-skel" />}>
        content
      </WidgetFrame>,
    );
    expect(screen.getByTestId('custom-skel')).toBeInTheDocument();
  });

  it('reveals loaded content with the motion-content-reveal class', () => {
    render(<WidgetFrame isPending={false} error={null}>content</WidgetFrame>);
    expect(screen.getByText('content').closest('.motion-content-reveal')).toBeInTheDocument();
  });

  it("affiche l'erreur avec bouton réessayer", () => {
    const onRetry = jest.fn();
    render(
      <WidgetFrame isPending={false} error={new Error('x')} onRetry={onRetry}>
        <p>contenu</p>
      </WidgetFrame>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Impossible de charger');
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("affiche l'état vide", () => {
    render(
      <WidgetFrame isPending={false} error={null} isEmpty emptyLabel="Rien ici.">
        <p>contenu</p>
      </WidgetFrame>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Rien ici.');
  });

  it('affiche les enfants sinon', () => {
    render(<WidgetFrame isPending={false} error={null}><p>contenu</p></WidgetFrame>);
    expect(screen.getByText('contenu')).toBeInTheDocument();
  });

  it("affiche l'erreur sans bouton quand onRetry absent", () => {
    render(
      <WidgetFrame isPending={false} error={new Error('x')}>
        <p>contenu</p>
      </WidgetFrame>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
