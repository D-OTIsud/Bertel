import { fireEvent, render, screen } from '@testing-library/react';
import { RelationPicker } from './RelationPicker';

jest.mock('../useObjectSearch', () => ({
  useObjectSearch: () => ({
    loading: false,
    results: [{ id: 'o1', name: 'Plage de Grand Bois', type: 'PNA', status: 'published', city: 'Saint-Pierre', code: 'PNA-001' }],
  }),
}));

describe('RelationPicker', () => {
  it('renders search results and calls onPick', () => {
    const onPick = jest.fn();
    render(<RelationPicker currentObjectId="self" onPick={onPick} />);

    fireEvent.change(screen.getByPlaceholderText('Rechercher une fiche à lier'), { target: { value: 'grand' } });
    fireEvent.click(screen.getByText('Plage de Grand Bois'));

    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'o1' }));
  });
});
