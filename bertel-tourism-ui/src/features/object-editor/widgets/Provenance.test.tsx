import { render, screen } from '@testing-library/react';
import { Provenance } from './Provenance';

describe('Provenance', () => {
  it('renders the source, actor and timestamp', () => {
    render(<Provenance source="Apidae" who="Import quotidien" when="2026-01-02" locked="OTI" />);

    expect(screen.getByText('Apidae')).toBeInTheDocument();
    expect(screen.getByText(/Import quotidien/)).toBeInTheDocument();
    expect(screen.getByText(/Verrouillé par OTI/)).toBeInTheDocument();
  });
});
