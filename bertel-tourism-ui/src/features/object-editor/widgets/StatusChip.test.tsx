import { render, screen } from '@testing-library/react';
import { StatusChip } from './StatusChip';

describe('StatusChip', () => {
  it('renders the published status label', () => {
    render(<StatusChip status="published" />);
    expect(screen.getByText('Publié — en ligne')).toBeInTheDocument();
  });

  it('renders the draft status label', () => {
    render(<StatusChip status="draft" />);
    expect(screen.getByText('Brouillon')).toBeInTheDocument();
  });

  it('falls back to the raw status code for an unknown status', () => {
    render(<StatusChip status="weird" />);
    expect(screen.getByText('weird')).toBeInTheDocument();
  });
});
