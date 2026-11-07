import { render, screen } from '@testing-library/react';
import { SiretCard } from './SiretCard';

describe('SiretCard', () => {
  it('renders stored legal entity fields and disables live lookup', () => {
    render(<SiretCard siret="44851998300012" company="SARL Domaine du Bel Air" naf="55.10Z" legalForm="SARL" />);

    expect(screen.getByText('44851998300012')).toBeInTheDocument();
    expect(screen.getByText('SARL Domaine du Bel Air')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Re-vérifier/ })).toBeDisabled();
  });
});
