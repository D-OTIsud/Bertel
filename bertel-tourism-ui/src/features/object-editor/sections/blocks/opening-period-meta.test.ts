import { classifyOpeningSeason, formatPeriodRange } from './opening-period-meta';
import type { ObjectWorkspaceOpeningPeriod } from '../../../../services/object-workspace-parser';

const p = (o: Partial<ObjectWorkspaceOpeningPeriod>): ObjectWorkspaceOpeningPeriod => ({
  recordId: null, order: '1', bucket: 'current', label: '', seasonTypeCode: '',
  startDate: '', endDate: '', allYears: true, recurrence: 'always', isClosure: false,
  closedDays: [], weekdays: [], ...o,
});

describe('classifyOpeningSeason', () => {
  const empty = new Map<string, { label: string; color: string }>();

  test('an explicit period type wins and carries its catalog colour', () => {
    const typed = new Map([['mi', { label: 'Mi-saison', color: '#7a5cff' }]]);
    expect(classifyOpeningSeason(p({ seasonTypeCode: 'mi', label: 'Été' }), typed))
      .toEqual({ label: 'Mi-saison', hex: '#7a5cff' });
  });
  test('label keywords classify an untyped period — teal for haute, amber for hors', () => {
    expect(classifyOpeningSeason(p({ label: 'Haute saison' }), empty)?.hex).toBe('#176b6a');
    expect(classifyOpeningSeason(p({ label: 'Hors saison' }), empty)?.hex).toBe('#c08a3e');
  });
  test('classifies a season period WITHOUT opening hours (no shut greying)', () => {
    // weekdays empty ⇒ periodKind() would say 'shut'; the season chip must stay teal.
    expect(classifyOpeningSeason(p({ label: 'Haute saison', weekdays: [] }), empty)?.hex).toBe('#176b6a');
  });
  test('returns null when the period is not season-classifiable', () => {
    expect(classifyOpeningSeason(p({ label: 'Vacances de juillet' }), empty)).toBeNull();
  });
});

describe('formatPeriodRange', () => {
  test('always => Toute l’année', () => {
    expect(formatPeriodRange(p({ recurrence: 'always' }))).toBe('Toute l’année');
  });
  test('cyclic => month range WITHOUT a year', () => {
    const label = formatPeriodRange(p({ recurrence: 'cyclic', allYears: true, startDate: '2000-05-01', endDate: '2000-09-30' }));
    expect(label).toMatch(/mai/i);
    expect(label).toMatch(/septembre/i);
    expect(label).not.toMatch(/2000/);
  });
  test('fixed => full date range', () => {
    const label = formatPeriodRange(p({ recurrence: 'fixed', allYears: false, startDate: '2025-01-15', endDate: '2025-12-15' }));
    expect(label).toMatch(/→/);
  });
});
