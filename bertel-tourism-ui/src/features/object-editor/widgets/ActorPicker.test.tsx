import { fireEvent, render, screen } from '@testing-library/react';
import { ActorPicker } from './ActorPicker';
import { searchActors } from '../../../services/object-workspace';

jest.mock('../../../services/object-workspace', () => ({
  searchActors: jest.fn(),
}));

const searchActorsMock = searchActors as jest.MockedFunction<typeof searchActors>;

describe('ActorPicker', () => {
  beforeEach(() => {
    searchActorsMock.mockReset();
    searchActorsMock.mockResolvedValue([
      { id: 'act-9', displayName: 'Rémi Janisset', firstName: 'Rémi', lastName: 'Janisset' },
    ]);
  });

  it('debounces the query, renders results and calls onPick', async () => {
    const onPick = jest.fn();
    render(<ActorPicker onPick={onPick} />);

    fireEvent.change(screen.getByLabelText('Rechercher un acteur'), { target: { value: 'rémi' } });
    // 300ms debounce — findByRole waits past it (default waitFor timeout is 1s).
    fireEvent.click(await screen.findByRole('button', { name: /Rémi Janisset/ }));

    expect(searchActorsMock).toHaveBeenCalledWith('rémi');
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'act-9', displayName: 'Rémi Janisset', firstName: 'Rémi', lastName: 'Janisset' }),
    );
  });

  it('does not search under 2 characters', () => {
    render(<ActorPicker onPick={jest.fn()} />);

    fireEvent.change(screen.getByLabelText('Rechercher un acteur'), { target: { value: 'r' } });

    expect(searchActorsMock).not.toHaveBeenCalled();
    expect(screen.getByText('Tapez au moins 2 caractères.')).toBeInTheDocument();
  });
});
