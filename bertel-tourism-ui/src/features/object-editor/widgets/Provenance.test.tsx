import { render, screen } from '@testing-library/react';
import { Provenance } from './Provenance';

describe('Provenance', () => {
  it('renders the source, actor and timestamp', () => {
    render(<Provenance source="Apidae" who="Import quotidien" when="2026-01-02" locked="OTI" />);

    expect(screen.getByText('Apidae')).toBeInTheDocument();
    expect(screen.getByText(/Import quotidien/)).toBeInTheDocument();
    expect(screen.getByText(/Verrouillé par OTI/)).toBeInTheDocument();
  });

  it('renders pending review with validate action', () => {
    const onApprove = jest.fn();
    render(
      <Provenance source="Prestataire" who="Jean Martin" pendingReview onApprove={onApprove} />,
    );

    expect(screen.getByText('À valider')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Valider' })).toBeInTheDocument();
  });
});
