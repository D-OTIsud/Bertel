import { render, screen } from '@testing-library/react';
import { SiretCard } from './SiretCard';

describe('SiretCard', () => {
  it('renders the stored legal entity fields', () => {
    render(<SiretCard siret="44851998300012" company="SARL Domaine du Bel Air" naf="55.10Z" legalForm="SARL" />);

    expect(screen.getByText('44851998300012')).toBeInTheDocument();
    expect(screen.getByText('SARL Domaine du Bel Air')).toBeInTheDocument();
  });

  it('makes no claim of an INSEE verification', () => {
    render(<SiretCard siret="44851998300012" company="SARL Domaine du Bel Air" />);

    expect(screen.queryByText(/INSEE/)).not.toBeInTheDocument();
    expect(screen.queryByText(/SIRENE/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Re-vérifier/ })).not.toBeInTheDocument();
  });
});
