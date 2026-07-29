import { formatLastSeen } from './format-last-seen';

// Les libellés sont rendus dans le fuseau du navigateur (aucun TZ n'est épinglé par Jest) :
// les dates de référence sont donc construites en heure LOCALE, jamais depuis une chaîne UTC,
// sinon l'assertion « à 11:08 » casserait sur une machine réglée ailleurs qu'en UTC.
const NOW = new Date(2026, 6, 29, 11, 11, 0); // 29 juillet 2026, 11:11 local
const MIN = 60_000;

describe('formatLastSeen', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  const agoMs = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

  it('returns null when no activity is known', () => {
    expect(formatLastSeen(null)).toBeNull();
    expect(formatLastSeen(undefined)).toBeNull();
    expect(formatLastSeen('pas une date')).toBeNull();
  });

  it('renders the exact date and time of the last activity', () => {
    // Arrange — 3 minutes avant « maintenant ».
    const iso = agoMs(3 * MIN);

    // Act
    const label = formatLastSeen(iso);

    // Assert
    expect(label?.absolute).toBe('29 juil. 2026 à 11:08');
    expect(label?.relative).toBe('il y a 3 min');
  });

  it('scales the relative label from minutes to months', () => {
    expect(formatLastSeen(agoMs(20_000))?.relative).toBe("à l'instant");
    expect(formatLastSeen(agoMs(5 * 60 * MIN))?.relative).toBe('il y a 5 h');
    expect(formatLastSeen(agoMs(5 * 24 * 60 * MIN))?.relative).toBe('il y a 5 j');
    expect(formatLastSeen(agoMs(15 * 24 * 60 * MIN))?.relative).toBe('il y a 2 sem.');
    expect(formatLastSeen(agoMs(91 * 24 * 60 * MIN))?.relative).toBe('il y a 3 mois');
  });

  it('never renders a negative delay when the client clock runs ahead', () => {
    expect(formatLastSeen(agoMs(-45 * MIN))?.relative).toBe("à l'instant");
  });
});
