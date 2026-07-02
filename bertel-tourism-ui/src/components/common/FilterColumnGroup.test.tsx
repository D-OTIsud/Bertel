import { render, screen, fireEvent } from '@testing-library/react';
import { FilterColumnGroup } from './FilterColumnGroup';

describe('FilterColumnGroup', () => {
  it('rend un en-tête statique (pas de bouton) par défaut', () => {
    render(
      <FilterColumnGroup label="Localisation">
        <div>corps</div>
      </FilterColumnGroup>,
    );
    expect(screen.getByText('corps')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Localisation/ })).not.toBeInTheDocument();
  });

  it('collapsible : replie/déplie au clic et aria-expanded suit', () => {
    render(
      <FilterColumnGroup label="Hebergements" collapsible>
        <div>corps</div>
      </FilterColumnGroup>,
    );
    const toggle = screen.getByRole('button', { name: /Hebergements/, expanded: true });
    expect(screen.getByText('corps')).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('corps')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('corps')).toBeInTheDocument();
  });

  it('collapsible : le badge de compte reste visible une fois replié', () => {
    render(
      <FilterColumnGroup label="Restaurants" collapsible count={2}>
        <div>corps</div>
      </FilterColumnGroup>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Restaurants/ }));
    expect(screen.queryByText('corps')).not.toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('defaultOpen=false démarre replié', () => {
    render(
      <FilterColumnGroup label="Itineraires" collapsible defaultOpen={false}>
        <div>corps</div>
      </FilterColumnGroup>,
    );
    expect(screen.queryByText('corps')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Itineraires/, expanded: false })).toBeInTheDocument();
  });
});
