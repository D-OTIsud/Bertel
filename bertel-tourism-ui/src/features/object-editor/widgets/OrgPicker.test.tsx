import { fireEvent, render, screen } from '@testing-library/react';
import { OrgPicker } from './OrgPicker';

const OPTIONS = [
  { id: 'ORG1', name: 'OTI du Sud' },
  { id: 'ORG2', name: 'OTI Nord' },
  { id: 'ORG3', name: 'Office régional' },
];

describe('OrgPicker', () => {
  it('filters by name (accent/case-insensitive) and picks one', () => {
    const onPick = jest.fn();
    render(<OrgPicker open options={OPTIONS} onPick={onPick} onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText(/Rechercher une organisation/i), { target: { value: 'nord' } });
    fireEvent.click(screen.getByRole('button', { name: /OTI Nord/i }));

    expect(onPick).toHaveBeenCalledWith({ id: 'ORG2', name: 'OTI Nord' });
  });

  it('hides already-linked organisations via excludeIds', () => {
    render(<OrgPicker open options={OPTIONS} excludeIds={['ORG1']} onPick={() => {}} onClose={() => {}} />);
    expect(screen.queryByRole('button', { name: /OTI du Sud/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /OTI Nord/i })).toBeInTheDocument();
  });

  it('shows an empty hint when nothing matches', () => {
    render(<OrgPicker open options={OPTIONS} onPick={() => {}} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Rechercher une organisation/i), { target: { value: 'zzz' } });
    expect(screen.getByText(/Aucune organisation/i)).toBeInTheDocument();
  });
});
