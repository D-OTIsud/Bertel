import { render, screen } from '@testing-library/react';
import { PresenceRail, formatPresenceDuration } from './PresenceRail';

const FIVE_MIN_MS = 5 * 60 * 1000;

let mockPeers: Array<{ userId: string; name: string; avatar: string; color: string; onlineSince?: number }> = [];

jest.mock('../../../hooks/usePresenceRoom', () => ({
  usePresenceRoom: () => ({
    peers: mockPeers,
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
