import { render, screen } from '@testing-library/react';
import { toast } from 'sonner';
import { PresenceRail, computeDepartedPeers, formatPresenceDuration } from './PresenceRail';

const FIVE_MIN_MS = 5 * 60 * 1000;

type MockPeer = { userId: string; name: string; avatar: string; color: string; onlineSince?: number };

let mockPeers: MockPeer[] = [];
let mockMe: MockPeer = { userId: 'me-self', name: 'Moi', avatar: 'MO', color: '#176b6a' };

jest.mock('sonner', () => ({ toast: jest.fn() }));

jest.mock('../../../hooks/usePresenceRoom', () => ({
  usePresenceRoom: () => ({
    peers: mockPeers,
    me: mockMe,
    typingUsers: [],
  }),
}));

describe('formatPresenceDuration', () => {
  const now = 1_700_000_000_000;

  it('returns null when the join time is unknown', () => {
    expect(formatPresenceDuration(undefined, now)).toBeNull();
    expect(formatPresenceDuration(Number.NaN, now)).toBeNull();
  });

  it('shows "à l\'instant" under one minute', () => {
    expect(formatPresenceDuration(now - 30_000, now)).toBe("à l'instant");
  });

  it('shows minutes for sub-hour durations', () => {
    expect(formatPresenceDuration(now - FIVE_MIN_MS, now)).toBe('depuis 5 min');
  });

  it('shows whole hours with no remainder', () => {
    expect(formatPresenceDuration(now - 60 * 60 * 1000, now)).toBe('depuis 1 h');
  });

  it('shows hours and minutes together', () => {
    expect(formatPresenceDuration(now - 80 * 60 * 1000, now)).toBe('depuis 1 h 20 min');
  });

  it('clamps a future join time to "à l\'instant"', () => {
    expect(formatPresenceDuration(now + FIVE_MIN_MS, now)).toBe("à l'instant");
  });
});

describe('PresenceRail', () => {
  it('renders live peers from the presence room', () => {
    mockPeers = [{ userId: 'u1', name: 'Florence G', avatar: '', color: '#176b6a' }];
    render(<PresenceRail objectId="o1" />);
    expect(screen.getByText('Florence G')).toBeInTheDocument();
  });

  it('shows how long the editor has been connected instead of the raw user id', () => {
    mockPeers = [
      {
        userId: '44b43d4b-e5be-446d-aac0-0a5b43a4cdc2',
        name: 'd.philippe@otisud.com',
        avatar: '',
        color: '#176b6a',
        onlineSince: Date.now() - FIVE_MIN_MS,
      },
    ];
    render(<PresenceRail objectId="o1" />);

    expect(screen.getByText('depuis 5 min')).toBeInTheDocument();
    expect(screen.queryByText('44b43d4b-e5be-446d-aac0-0a5b43a4cdc2')).not.toBeInTheDocument();
  });
});

describe('computeDepartedPeers', () => {
  const alice: MockPeer = { userId: 'a', name: 'Alice', avatar: '', color: '' };
  const bob: MockPeer = { userId: 'b', name: 'Bob', avatar: '', color: '' };
  const self: MockPeer = { userId: 'me-self', name: 'Moi', avatar: '', color: '' };

  it('returns peers that were present before but are gone now', () => {
    expect(computeDepartedPeers([alice, bob], [alice], 'me-self')).toEqual([bob]);
  });

  it('never reports the current user as departed', () => {
    expect(computeDepartedPeers([self, alice], [alice], 'me-self')).toEqual([]);
  });

  it('returns an empty list when a peer joins (nobody left)', () => {
    expect(computeDepartedPeers([alice], [alice, bob], 'me-self')).toEqual([]);
  });
});

describe('PresenceRail leave snackbar', () => {
  beforeEach(() => {
    (toast as unknown as jest.Mock).mockClear();
    mockMe = { userId: 'me-self', name: 'Moi', avatar: 'MO', color: '#176b6a' };
  });

  it('shows a 5s snackbar naming the editor who left the page', () => {
    const florence: MockPeer = { userId: 'u1', name: 'Florence G', avatar: '', color: '#176b6a' };
    const bob: MockPeer = { userId: 'u2', name: 'Bob', avatar: '', color: '#ff7b54' };
    mockPeers = [mockMe, florence, bob];
    const { rerender } = render(<PresenceRail objectId="o1" />);

    mockPeers = [mockMe, florence];
    rerender(<PresenceRail objectId="o1" />);

    expect(toast).toHaveBeenCalledWith('Bob a quitté la page', { duration: 5000 });
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it('does not toast on first render or when a new peer joins', () => {
    const florence: MockPeer = { userId: 'u1', name: 'Florence G', avatar: '', color: '#176b6a' };
    mockPeers = [mockMe, florence];
    const { rerender } = render(<PresenceRail objectId="o1" />);

    mockPeers = [mockMe, florence, { userId: 'u3', name: 'Inès', avatar: '', color: '#78c67a' }];
    rerender(<PresenceRail objectId="o1" />);

    expect(toast).not.toHaveBeenCalled();
  });
});
