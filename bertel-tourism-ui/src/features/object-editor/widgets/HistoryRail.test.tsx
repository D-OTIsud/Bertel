import { render, screen } from '@testing-library/react';
import { HistoryRail } from './HistoryRail';

describe('HistoryRail', () => {
  it('renders recent changes from provided audit data', () => {
    render(<HistoryRail items={[{ who: 'Import Apidae', what: 'a synchronisé la fiche', when: '2026-01-02' }]} />);
    expect(screen.getByText('Import Apidae')).toBeInTheDocument();
    expect(screen.getByText(/synchronisé/)).toBeInTheDocument();
  });
});
