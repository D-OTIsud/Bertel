import { buildEditTopSaveLabel, formatLastObjectUpdate } from './format-last-object-update';

describe('formatLastObjectUpdate', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-20T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns em dash when date is missing or invalid', () => {
    expect(formatLastObjectUpdate(null)).toBe('Dernière mise à jour · —');
    expect(formatLastObjectUpdate('not-a-date')).toBe('Dernière mise à jour · —');
  });

  it('formats relative times for recent updates', () => {
    expect(formatLastObjectUpdate('2026-05-20T11:59:30Z')).toBe('Dernière mise à jour · à l\'instant');
    expect(formatLastObjectUpdate('2026-05-20T11:30:00Z')).toBe('Dernière mise à jour · il y a 30 min');
  });

  it('formats absolute date when update is older than a week', () => {
    expect(formatLastObjectUpdate('2026-01-02')).toMatch(/Dernière mise à jour · 2 janv\. 2026/);
  });
});

describe('buildEditTopSaveLabel', () => {
  it('prioritizes status message and appends dirty hint after last update', () => {
    expect(buildEditTopSaveLabel({ statusMessage: 'Publié.', dirtyCount: 2, lastSavedAt: '2026-01-02' })).toBe(
      'Publié.',
    );
    expect(
      buildEditTopSaveLabel({ statusMessage: null, dirtyCount: 2, lastSavedAt: '2026-01-02' }),
    ).toMatch(/Dernière mise à jour · .* · 2 modif\. locales · Publier pour enregistrer/);
  });
});
