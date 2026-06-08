import { render, screen } from '@testing-library/react';
import { Readout } from './Readout';

describe('Readout', () => {
  it('renders the value as static text, not an editable input', () => {
    render(<Readout value="HLORUN00000000TV" mono />);
    expect(screen.getByText('HLORUN00000000TV')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows a placeholder for an empty value', () => {
    render(<Readout value="" placeholder="Non renseigné" />);
    expect(screen.getByText('Non renseigné')).toBeInTheDocument();
  });

  it('renders a prefix alongside the value', () => {
    render(<Readout value="HOT — Hotel" prefix="●" />);
    expect(screen.getByText('●')).toBeInTheDocument();
    expect(screen.getByText('HOT — Hotel')).toBeInTheDocument();
  });
});
