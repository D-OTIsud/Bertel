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
      { id: 'act-9', displayName: 'M. Rémi Janisset', firstName: 'Rémi', lastName: 'Janisset', gender: 'M.', email: 'remi@example.com' },
    ]);
  });

  it('debounces the query, renders the actor card (name + e-mail) and links via the "Lier" button', async () => {
    const onPick = jest.fn();
    render(<ActorPicker onPick={onPick} />);

    fireEvent.change(screen.getByLabelText('Rechercher un acteur'), { target: { value: 'rémi' } });
    // 300ms debounce — findByText waits past it (default waitFor timeout is 1s).
    expect(await screen.findByText('M. Rémi Janisset')).toBeInTheDocument();
    expect(screen.getByText('remi@example.com')).toBeInTheDocument();

    // The explicit icon button (aria-label "Lier <name>") performs the link, not the whole row.
    fireEvent.click(screen.getByRole('button', { name: 'Lier M. Rémi Janisset' }));

    expect(searchActorsMock).toHaveBeenCalledWith('rémi');
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'act-9', displayName: 'M. Rémi Janisset', email: 'remi@example.com' }),
    );
  });

  it('does not search under 2 characters', () => {
    render(<ActorPicker onPick={jest.fn()} />);

    fireEvent.change(screen.getByLabelText('Rechercher un acteur'), { target: { value: 'r' } });

    expect(searchActorsMock).not.toHaveBeenCalled();
    expect(screen.getByText('Tapez au moins 2 caractères.')).toBeInTheDocument();
  });
});
