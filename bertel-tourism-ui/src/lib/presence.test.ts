import {
  dedupePresenceMembers,
  deriveNetworkStatus,
  formatPresenceDuration,
  initials,
  networkStatusLabel,
} from './presence';

const FIVE_MIN_MS = 5 * 60 * 1000;

describe('dedupePresenceMembers', () => {
  it('collapses several connections of one person into a single member', () => {
    const state = {
      u1: [
        { userId: 'u1', name: 'Marie', avatar: 'MA', color: '#ff7b54', onlineSince: 3000 },
        { userId: 'u1', name: 'Marie', avatar: 'MA', color: '#ff7b54', onlineSince: 1000 },
        { userId: 'u1', name: 'Marie', avatar: 'MA', color: '#ff7b54', onlineSince: 2000 },
      ],
    };
    const members = dedupePresenceMembers(state, 'u1');
    expect(members).toHaveLength(1);
    expect(members[0].onlineSince).toBe(1000); // earliest arrival wins
  });

  it('sorts the current user first, then by arrival time', () => {
    const state = {
      u2: [{ userId: 'u2', name: 'Bob', avatar: 'BO', color: '#000', onlineSince: 1000 }],
      me: [{ userId: 'me', name: 'Moi', avatar: 'MO', color: '#000', onlineSince: 5000 }],
    };
    const members = dedupePresenceMembers(state, 'me');
    expect(members.map((m) => m.userId)).toEqual(['me', 'u2']);
  });

  it('returns an empty list for an empty state', () => {
    expect(dedupePresenceMembers({}, 'me')).toEqual([]);
  });
});

describe('deriveNetworkStatus', () => {
  it('is offline whenever the browser is offline', () => {
    expect(deriveNetworkStatus(false, 'subscribed')).toBe('offline');
  });
  it('is connected when online and subscribed', () => {
    expect(deriveNetworkStatus(true, 'subscribed')).toBe('connected');
  });
  it('is degraded when online but the channel is not subscribed', () => {
    expect(deriveNetworkStatus(true, 'connecting')).toBe('degraded');
    expect(deriveNetworkStatus(true, 'error')).toBe('degraded');
    expect(deriveNetworkStatus(true, 'closed')).toBe('degraded');
  });
});

describe('networkStatusLabel', () => {
  it('maps each status to a French label + tone', () => {
    expect(networkStatusLabel('connected')).toMatchObject({ tone: 'green', label: 'En ligne' });
    expect(networkStatusLabel('degraded')).toMatchObject({ tone: 'orange', label: 'Temps réel interrompu' });
    expect(networkStatusLabel('offline')).toMatchObject({ tone: 'red', label: 'Hors ligne' });
  });
});

describe('initials', () => {
  it('takes up to two uppercased initials', () => {
    expect(initials('Marie Durand')).toBe('MD');
    expect(initials('cilaos')).toBe('C');
  });
});

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
