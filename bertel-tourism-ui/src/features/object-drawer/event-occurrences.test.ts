import { buildEventDisplayData, buildEventOccurrenceRows } from './event-occurrences';

// Repère local fixe pour les cas now-relative (midi le 14/07/2026, heure locale).
const NOW = new Date(2026, 6, 14, 12, 0, 0);

describe('buildEventDisplayData', () => {
  it('sélectionne une occurrence future comme « next »', () => {
    const data = buildEventDisplayData([], [{ id: 'a', start_at: '2026-08-01', end_at: '2026-08-01' }], NOW);
    expect(data.next?.key).toBe('a');
    expect(data.upcoming).toHaveLength(1);
    expect(data.past).toHaveLength(0);
  });

  it('choisit la PLUS PROCHE de plusieurs dates futures comme « next »', () => {
    const data = buildEventDisplayData([], [
      { id: 'late', start_at: '2026-09-10' },
      { id: 'soon', start_at: '2026-07-20' },
      { id: 'mid', start_at: '2026-08-15' },
    ], NOW);
    expect(data.next?.key).toBe('soon');
    expect(data.upcoming.map((r) => r.key)).toEqual(['soon', 'mid', 'late']);
  });

  it('ne sélectionne pas une occurrence future ANNULÉE comme « next »', () => {
    const data = buildEventDisplayData([], [
      { id: 'x', start_at: '2026-07-20', state: 'annule' },
      { id: 'y', start_at: '2026-08-01' },
    ], NOW);
    expect(data.next?.key).toBe('y');
    expect(data.cancelled.map((r) => r.key)).toEqual(['x']);
    expect(data.upcoming.map((r) => r.key)).toEqual(['y']);
  });

  it('considère un événement EN COURS comme à venir', () => {
    const data = buildEventDisplayData([], [
      { id: 'ongoing', start_at: '2026-07-10T09:00:00', end_at: '2026-07-20T18:00:00' },
    ], NOW);
    expect(data.upcoming.map((r) => r.key)).toEqual(['ongoing']);
    expect(data.next?.key).toBe('ongoing');
  });

  it('utilise la date canonique quand aucune occurrence', () => {
    const data = buildEventDisplayData(
      [{ event_start_date: '2026-08-01', event_start_time: '20:00:00', is_recurring: false }],
      [],
      NOW,
    );
    expect(data.canonical?.start).toBe('2026-08-01T20:00:00');
    expect(data.next?.source).toBe('canonical');
  });

  it('ne présente PAS une date canonique passée comme « next »', () => {
    const data = buildEventDisplayData([{ event_start_date: '2026-01-01', event_end_date: '2026-01-01' }], [], NOW);
    expect(data.canonical).not.toBeNull();
    expect(data.next).toBeNull();
  });

  it('préserve la récurrence (booléen + motif)', () => {
    const data = buildEventDisplayData(
      [{ event_start_date: '2026-08-01', is_recurring: true, recurrence_pattern: 'Tous les samedis' }],
      [],
      NOW,
    );
    expect(data.recurring).toBe(true);
    expect(data.recurrencePattern).toBe('Tous les samedis');
  });

  it('ne décale PAS une date-only par conversion UTC (comparaison locale)', () => {
    const data = buildEventDisplayData([], [
      { id: 'today', start_at: '2026-07-14' },
      { id: 'yesterday', start_at: '2026-07-13' },
    ], NOW);
    // La journée entière du 14 est encore « à venir » à midi ; le 13 est passé.
    expect(data.upcoming.map((r) => r.key)).toEqual(['today']);
    expect(data.past.map((r) => r.key)).toEqual(['yesterday']);
    // La valeur brute n'est pas mutée / décalée.
    expect(data.upcoming[0].start).toBe('2026-07-14');
  });

  it('ignore une plage sans date valide (pas de fabrication)', () => {
    const data = buildEventDisplayData([], [{ id: 'x', state: 'scheduled' }, { id: 'y', start_at: '' }], NOW);
    expect(data.upcoming).toHaveLength(0);
    expect(data.past).toHaveLength(0);
    expect(data.cancelled).toHaveLength(0);
  });

  it('trie upcoming ASC et past DESC', () => {
    const data = buildEventDisplayData([], [
      { id: 'p1', start_at: '2026-06-01' },
      { id: 'p2', start_at: '2026-05-01' },
      { id: 'u1', start_at: '2026-09-01' },
      { id: 'u2', start_at: '2026-08-01' },
    ], NOW);
    expect(data.upcoming.map((r) => r.key)).toEqual(['u2', 'u1']);
    expect(data.past.map((r) => r.key)).toEqual(['p1', 'p2']);
  });
});

describe('buildEventOccurrenceRows (legacy)', () => {
  it('renvoie une liste vide sans occurrence', () => {
    expect(buildEventOccurrenceRows([])).toEqual([]);
  });

  it('ignore une occurrence sans date (pas de fabrication)', () => {
    expect(buildEventOccurrenceRows([{ id: 'x', state: 'scheduled' }])).toEqual([]);
  });

  it('formate une date unique en FR', () => {
    const rows = buildEventOccurrenceRows([{ id: 'a', start_at: '2026-07-14', end_at: '2026-07-14' }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toMatch(/14/);
    expect(rows[0].label).toMatch(/2026/);
    expect(rows[0].cancelled).toBe(false);
  });

  it('formate une plage « Du … au … » quand les jours diffèrent', () => {
    const rows = buildEventOccurrenceRows([{ id: 'b', start_at: '2026-07-14', end_at: '2026-07-18' }]);
    expect(rows[0].label).toMatch(/^Du .* au /);
    expect(rows[0].label).toMatch(/18/);
  });

  it('marque une occurrence annulée', () => {
    const rows = buildEventOccurrenceRows([{ id: 'c', start_at: '2026-07-14', state: 'annule' }]);
    expect(rows[0].cancelled).toBe(true);
  });

  it('accepte les repli start/end', () => {
    const rows = buildEventOccurrenceRows([{ start: '2026-08-01', end: '2026-08-01' }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe('occ-0');
  });
});
