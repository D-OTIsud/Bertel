import { buildEventOccurrenceRows } from './event-occurrences';

describe('buildEventOccurrenceRows', () => {
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
