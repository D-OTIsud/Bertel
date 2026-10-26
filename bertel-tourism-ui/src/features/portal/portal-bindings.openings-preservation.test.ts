import { buildOpeningsPayload } from '../../services/object-workspace';
import type { ObjectWorkspaceOpeningPeriod, ObjectWorkspaceOpeningsModule } from '../../services/object-workspace-parser';
import { readStayOpening, readWeekHours, setStayClosures, setStayOpening, setWeekHours } from './portal-bindings';

function period(patch: Partial<ObjectWorkspaceOpeningPeriod> = {}): ObjectWorkspaceOpeningPeriod {
  return {
    recordId: 'period-1', order: '1', bucket: 'current', label: 'Saison principale', seasonTypeCode: '',
    startDate: '', endDate: '', allYears: true, recurrence: 'always', isClosure: false, closedDays: [],
    sourcePeriodId: 'source-1', nameI18n: { en: 'Main season' }, extra: { imported: true },
    weekdayNotes: { monday: 'Sur réservation', tuesday: 'Groupe uniquement' },
    weekdays: [
      { code: 'monday', label: 'lundi', slots: [{ start: '09:00', end: '12:00' }] },
      { code: 'tuesday', label: 'mardi', slots: [{ start: '09:00', end: '12:00' }] },
    ],
    ...patch,
  };
}

function openings(...periods: ObjectWorkspaceOpeningPeriod[]): ObjectWorkspaceOpeningsModule {
  return { periods } as ObjectWorkspaceOpeningsModule;
}

describe('horaires portail : conservation des notes et de la hiérarchie', () => {
  it.each(['modified', 'open'])('exclut uniquement une exception marquée %s et la conserve en changeant les horaires habituels', (kind) => {
    const exception = period({ recordId: 'exception', label: 'Travaux', recurrence: 'fixed', allYears: false,
      startDate: '2026-12-24', endDate: '2026-12-24', extra: { exception_kind: kind, source: 'import' } });
    const before = openings(period(), exception);
    expect(readWeekHours(before).readOnlyReason).toBeNull();
    expect(readStayOpening(before).readOnlyReason).toBeNull();
    const next = setWeekHours(before, { monday: { open: true, fixedHours: true, slots: [{ start: '11:00', end: '13:00' }] } });
    expect(next.periods[1]).toBe(exception);
    expect(next.periods[0].weekdays.find((day) => day.code === 'monday')?.slots).toEqual([{ start: '11:00', end: '13:00' }]);
    expect(setStayOpening(before, { openAllYear: true, startDate: '', endDate: '' }).periods[1]).toBe(exception);
  });

  it('garde la lecture seule des vraies saisons et des périodes habituelles non représentables', () => {
    const second = period({ recordId: 'other', extra: { exception_kind: 'unknown' } });
    expect(readWeekHours(openings(period(), second)).readOnlyReason).not.toBeNull();
    const unavailable = period({ editingUnavailableReason: 'Plusieurs horaires à préserver.' });
    const exception = period({ recordId: 'exception', extra: { exception_kind: 'open' } });
    const before = openings(unavailable, exception);
    expect(readWeekHours(before).readOnlyReason).toBe(unavailable.editingUnavailableReason);
    expect(setWeekHours(before, {})).toBe(before);
  });

  it('laisse les jours annotés modifiables et conserve leurs notes quand les heures changent', () => {
    const before = openings(period());
    expect(readWeekHours(before).readOnlyReason).toBeNull();
    const next = setWeekHours(before, { monday: { open: true, fixedHours: true, slots: [{ start: '10:00', end: '13:00' }] } });
    expect(next.periods[0].weekdayNotes).toBe(before.periods[0].weekdayNotes);
    expect(next.periods[0]).toMatchObject({ sourcePeriodId: 'source-1', nameI18n: { en: 'Main season' }, extra: { imported: true } });
    const payload = buildOpeningsPayload(next.periods);
    expect(payload[0]).toMatchObject({ source_period_id: 'source-1', name_i18n: { en: 'Main season' }, extra: { imported: true } });
    expect(payload[0].schedules).toEqual(expect.arrayContaining([
      expect.objectContaining({ time_periods: expect.arrayContaining([
        expect.objectContaining({ note: 'Sur réservation', weekdays: [{ weekday_code: 'monday' }], time_frames: [expect.objectContaining({ start_time: '10:00', end_time: '13:00' })] }),
        expect.objectContaining({ note: 'Groupe uniquement', weekdays: [{ weekday_code: 'tuesday' }] }),
      ]) }),
    ]));
  });

  it('conserve la note après fermeture et réouverture d’un jour', () => {
    const before = openings(period());
    const closed = setWeekHours(before, { monday: { open: false, fixedHours: false, slots: [] } });
    expect(closed.periods[0].weekdayNotes?.monday).toBe('Sur réservation');
    expect(buildOpeningsPayload(closed.periods)[0].schedules).toEqual(expect.arrayContaining([
      expect.objectContaining({ time_periods: expect.arrayContaining([
        expect.objectContaining({ closed: true, note: 'Sur réservation', weekdays: [{ weekday_code: 'monday' }], time_frames: [] }),
      ]) }),
    ]));
    const reopened = setWeekHours(closed, { monday: { open: true, fixedHours: false, slots: [] } });
    expect(reopened.periods[0].weekdayNotes?.monday).toBe('Sur réservation');
    expect(readWeekHours(reopened).hours.monday).toMatchObject({ open: true, fixedHours: false });
  });

  it('signale une vraie ambiguïté et refuse les setters qui l’aplatiraient', () => {
    const before = openings(period({ editingUnavailableReason: 'Plusieurs horaires à préserver.' }));
    expect(readWeekHours(before).readOnlyReason).toBe('Plusieurs horaires à préserver.');
    expect(readStayOpening(before).readOnlyReason).toBe('Plusieurs horaires à préserver.');
    expect(setWeekHours(before, { monday: { open: false, fixedHours: false, slots: [] } })).toBe(before);
    expect(setStayOpening(before, { openAllYear: false, startDate: '2000-06-01', endDate: '2000-08-31' })).toBe(before);
  });

  it('garde les métadonnées et notes en changeant une saison d’hébergement', () => {
    const before = openings(period());
    const next = setStayOpening(before, { openAllYear: false, startDate: '2000-06-01', endDate: '2000-08-31' });
    expect(next.periods[0]).toMatchObject({ sourcePeriodId: 'source-1', nameI18n: { en: 'Main season' }, extra: { imported: true }, weekdayNotes: before.periods[0].weekdayNotes });
  });

  it('garde la fermeture brute et les notes quand le portail en change les dates', () => {
    const closure = period({ recordId: 'closure-1', isClosure: true, recurrence: 'fixed', allYears: false, startDate: '2026-12-25', endDate: '2026-12-25' });
    const before = openings(period(), closure);
    const next = setStayClosures(before, [{ key: 'closure-1', label: closure.label, startDate: '2026-12-24', endDate: '2026-12-26' }]);
    expect(next.periods[0]).toBe(before.periods[0]);
    expect(next.periods[1]).toMatchObject({ sourcePeriodId: 'source-1', extra: { imported: true }, weekdayNotes: closure.weekdayNotes, startDate: '2026-12-24', endDate: '2026-12-26' });
  });
});
