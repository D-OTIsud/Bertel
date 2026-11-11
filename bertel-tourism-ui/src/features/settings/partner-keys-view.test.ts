import type { PartnerKey } from '../../services/partner-keys';
import { IDLE_AFTER_DAYS, isIdle, lastUseLabel, splitKeys, summarize } from './partner-keys-view';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-11-11T12:00:00Z');

function key(overrides: Partial<PartnerKey> = {}): PartnerKey {
  return {
    id: 'key', label: 'Partenaire', keyPrefix: 'bk_live_test', scopes: [], isActive: true,
    createdAt: '2026-07-01T12:00:00Z', lastUsedAt: null, expiresAt: null, revokedAt: null,
    ...overrides,
  };
}

function daysAgo(days: number): string {
  return new Date(now.getTime() - days * DAY).toISOString();
}

describe('splitKeys', () => {
  it('partitions and sorts by latest usage or revocation without mutating the input', () => {
    const keys = [
      key({ id: 'never' }),
      key({ id: 'revoked-old', isActive: false, revokedAt: daysAgo(10) }),
      key({ id: 'older', lastUsedAt: daysAgo(3) }),
      key({ id: 'recent', lastUsedAt: daysAgo(1) }),
      key({ id: 'revoked-new', isActive: false, revokedAt: daysAgo(1) }),
      key({ id: 'revoked-missing', isActive: false }),
    ];
    const original = keys.slice();

    const { active, revoked } = splitKeys(keys);

    expect(active.map(({ id }) => id)).toEqual(['recent', 'older', 'never']);
    expect(revoked.map(({ id }) => id)).toEqual(['revoked-new', 'revoked-old', 'revoked-missing']);
    expect(keys).toEqual(original);
  });

  it('handles an empty list and keeps invalid dates behind valid dates', () => {
    expect(splitKeys([])).toEqual({ active: [], revoked: [] });
    const { active, revoked } = splitKeys([
      key({ id: 'invalid', lastUsedAt: 'invalid' }),
      key({ id: 'valid', lastUsedAt: daysAgo(1) }),
      key({ id: 'revoked-invalid', isActive: false, revokedAt: 'invalid' }),
      key({ id: 'revoked-valid', isActive: false, revokedAt: daysAgo(1) }),
    ]);
    expect(active.map(({ id }) => id)).toEqual(['valid', 'invalid']);
    expect(revoked.map(({ id }) => id)).toEqual(['revoked-valid', 'revoked-invalid']);
  });
});

describe('lastUseLabel', () => {
  const localNow = new Date(2026, 10, 11, 12);
  function localDaysAgo(days: number, hour = 12): string {
    return new Date(2026, 10, 11 - days, hour).toISOString();
  }

  it.each([
    [0, 'Aujourd’hui'],
    [1, 'Hier'],
    [2, 'il y a 2 j'],
    [29, 'il y a 29 j'],
    [30, 'il y a 1 mois'],
    [60, 'il y a 2 mois'],
    [125, 'il y a 4 mois'],
  ])('formats an age of %s calendar days', (days, expected) => {
    expect(lastUseLabel(localDaysAgo(days), localNow)).toBe(expected);
  });

  it('recognizes yesterday across midnight even when less than 24 hours elapsed', () => {
    expect(lastUseLabel(localDaysAgo(1, 23), new Date(2026, 10, 11, 1))).toBe('Hier');
  });

  it('handles absent and invalid usage and avoids a negative age for future usage', () => {
    expect(lastUseLabel(null, localNow)).toBe('Jamais utilisée');
    expect(lastUseLabel('invalid', localNow)).toBe('Jamais utilisée');
    expect(lastUseLabel(localDaysAgo(-1), localNow)).toBe('Aujourd’hui');
    expect(lastUseLabel(localDaysAgo(2), localNow.getTime())).toBe('il y a 2 j');
  });
});

describe('isIdle', () => {
  it('only considers active keys idle and treats never-used keys as idle', () => {
    expect(IDLE_AFTER_DAYS).toBe(30);
    expect(isIdle(key(), now)).toBe(true);
    expect(isIdle(key({ lastUsedAt: 'invalid' }), now)).toBe(true);
    expect(isIdle(key({ isActive: false }), now)).toBe(false);
    expect(isIdle(key({ isActive: false, lastUsedAt: daysAgo(100) }), now)).toBe(false);
  });

  it('uses a strict elapsed 30-day boundary', () => {
    expect(isIdle(key({ lastUsedAt: daysAgo(30) }), now)).toBe(false);
    expect(isIdle(key({ lastUsedAt: new Date(now.getTime() - 30 * DAY - 1).toISOString() }), now)).toBe(true);
    expect(isIdle(key({ lastUsedAt: daysAgo(2) }), now.getTime())).toBe(false);
    expect(isIdle(key({ lastUsedAt: daysAgo(-1) }), now)).toBe(false);
  });
});

describe('summarize', () => {
  it('counts active, recently used and idle keys, including the exact seven-day boundary', () => {
    const active = [
      key({ id: 'today', lastUsedAt: daysAgo(0) }),
      key({ id: 'week', lastUsedAt: daysAgo(7) }),
      key({ id: 'week-old', lastUsedAt: new Date(now.getTime() - 7 * DAY - 1).toISOString() }),
      key({ id: 'month', lastUsedAt: daysAgo(30) }),
      key({ id: 'idle', lastUsedAt: daysAgo(31) }),
      key({ id: 'never' }),
      key({ id: 'future', lastUsedAt: daysAgo(-1) }),
      key({ id: 'revoked', isActive: false, lastUsedAt: daysAgo(0) }),
    ];
    expect(summarize(active, now)).toEqual({ activeCount: 7, usedLast7Days: 2, idleCount: 2 });
  });

  it('returns zeros for an empty list', () => {
    expect(summarize([], now)).toEqual({ activeCount: 0, usedLast7Days: 0, idleCount: 0 });
  });
});
