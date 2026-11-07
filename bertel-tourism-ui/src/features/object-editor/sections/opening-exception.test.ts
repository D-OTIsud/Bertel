import { buildOpeningsPayload } from '../../../services/object-workspace';
import { createPeriodDraft, OPENING_WEEKDAYS } from './opening-period-edit';
import {
  buildOpeningException,
  EXCEPTION_HOURS_ENABLED,
  isOpeningHoursException,
  openingExceptionEditingReason,
  openingExceptionKind,
  validateOpeningException,
  type OpeningExceptionInput,
} from './opening-exception';

const input = (patch: Partial<OpeningExceptionInput> = {}): OpeningExceptionInput => ({
  kind: 'modified',
  label: 'Travaux',
  startDate: '2026-12-24',
  endDate: '2026-12-24',
  recurring: false,
  slots: [{ start: '10:00', end: '16:00' }],
  ...patch,
});
const fixed = (startDate: string, endDate: string, label = 'Saison') => ({
  ...createPeriodDraft(),
  recurrence: 'fixed' as const,
  allYears: false,
  startDate,
  endDate,
  label,
});

test('keeps activation explicitly off until SQL and H are deployed', () => {
  expect(EXCEPTION_HOURS_ENABLED).toBe(false);
});

test.each(['modified', 'open'] as const)(
  '%s builds fixed dates and seven independent days through the H writer',
  (kind) => {
    const period = buildOpeningException(
      input({
        kind,
        recurring: true,
        slots: [
          { start: '9h30', end: '12:00' },
          { start: '14:00', end: '16:00' },
        ],
      }),
    );
    expect(period).toMatchObject({
      isClosure: false,
      allYears: false,
      recurrence: 'fixed',
      extra: { exception_kind: kind },
    });
    expect(period.weekdays.map((day) => day.code)).toEqual(OPENING_WEEKDAYS.map((day) => day.code));
    expect(new Set(period.weekdays.map((day) => day.slots))).toHaveProperty('size', 7);
    const payload = buildOpeningsPayload([period])[0];
    expect(payload).toMatchObject({
      is_closure: false,
      all_years: false,
      date_start: '2026-12-24',
      date_end: '2026-12-24',
    });
    expect(payload.schedules[0].time_periods).toHaveLength(1);
    expect(payload.schedules[0].time_periods[0]).toMatchObject({
      closed: false,
      weekdays: OPENING_WEEKDAYS.map(({ code }) => ({ weekday_code: code })),
      time_frames: [
        { id: null, start_time: '09:30', end_time: '12:00', recurrence: null },
        { id: null, start_time: '14:00', end_time: '16:00', recurrence: null },
      ],
    });
    expect(openingExceptionKind(JSON.parse(JSON.stringify(period)))).toBe(kind);
    expect(validateOpeningException(period).error).toBeNull();
  },
);

test('closure supports an annual year boundary and removes only the UI hours marker', () => {
  const original = { ...createPeriodDraft(), extra: { exception_kind: 'open', source: 'import' } };
  const period = buildOpeningException(
    input({ kind: 'closed', startDate: '2026-12-31', endDate: '2027-01-02', recurring: true }),
    original,
  );
  expect(period).toMatchObject({
    isClosure: true,
    recurrence: 'cyclic',
    allYears: true,
    startDate: '2000-12-31',
    endDate: '2001-01-02',
    extra: { source: 'import' },
  });
  expect(period.extra).not.toHaveProperty('exception_kind');
  expect(
    buildOpeningsPayload([period])[0].schedules.flatMap((schedule) => schedule.time_periods),
  ).toEqual([]);
  expect(original.extra.exception_kind).toBe('open');
});

test('hour changes keep original provenance and notes for the H regrouping', () => {
  const original = buildOpeningException(input());
  Object.assign(original, {
    recordId: '00000000-0000-4000-8000-000000000001',
    sourcePeriodId: '00000000-0000-4000-8000-000000000002',
    nameI18n: { en: 'Works' },
    weekdayNotes: { monday: 'Sur réservation', tuesday: 'Groupe uniquement' },
    extra: { exception_kind: 'modified', imported: true },
  });
  const next = buildOpeningException(
    input({ slots: [{ start: '11:00', end: '15:00' }] }),
    original,
  );
  expect(next).toMatchObject({
    recordId: original.recordId,
    sourcePeriodId: original.sourcePeriodId,
    nameI18n: original.nameI18n,
    weekdayNotes: original.weekdayNotes,
    extra: { imported: true, exception_kind: 'modified' },
  });
  const payload = buildOpeningsPayload([next])[0];
  expect(payload.source_period_id).toBe(original.sourcePeriodId);
  const groups = payload.schedules[0].time_periods;
  expect(
    groups.find((group) => group.weekdays.some((day) => day.weekday_code === 'monday')),
  ).toMatchObject({
    note: 'Sur réservation',
    time_frames: [expect.objectContaining({ start_time: '11:00', end_time: '15:00' })],
  });
  expect(
    groups.find((group) => group.weekdays.some((day) => day.weekday_code === 'tuesday'))?.note,
  ).toBe('Groupe uniquement');
  expect(original.weekdays[0].slots[0].start).toBe('10:00');
});

test.each([
  { startDate: '2026-02-30' },
  { endDate: '2026-12-23' },
  { slots: [] },
  { slots: [{ start: '10:00', end: '' }] },
  { slots: [{ start: '25:00', end: '26:00' }] },
  { slots: [{ start: '22:00', end: '02:00' }] },
  {
    slots: [
      { start: '10:00', end: '12:00' },
      { start: '11:00', end: '13:00' },
    ],
  },
  {
    slots: [
      { start: '10:00', end: '11:00' },
      { start: '12:00', end: '13:00' },
      { start: '14:00', end: '15:00' },
    ],
  },
])('rejects unrepresentable dates/hours: %j', (patch) => {
  expect(validateOpeningException(buildOpeningException(input(patch))).error).not.toBeNull();
});

test('blocks equal/partial overlaps and a wider exception that would lose to a more precise period', () => {
  const candidate = buildOpeningException(
    input({ startDate: '2026-12-20', endDate: '2026-12-31' }),
  );
  expect(validateOpeningException(candidate, [fixed('2026-12-19', '2026-12-23')]).error).toMatch(
    /chevauchent/,
  );
  expect(validateOpeningException(candidate, [fixed('2026-12-20', '2026-12-31')]).error).toMatch(
    /chevauchent/,
  );
  expect(
    validateOpeningException(candidate, [fixed('2026-12-24', '2026-12-26', 'Noël')]).error,
  ).toMatch(/Noël.*plus précise/);
  expect(validateOpeningException(candidate, [fixed('2026-01-01', '2026-12-31')]).error).toBeNull();
});

test('excludes the original edited row and warns honestly about closures without predicting usual hours', () => {
  const original = buildOpeningException(input());
  const candidate = buildOpeningException(input({ label: 'Renommée' }), original);
  const closure = { ...fixed('2026-12-24', '2026-12-24'), isClosure: true };
  expect(validateOpeningException(candidate, [original], original)).toEqual({
    error: null,
    warning: null,
  });
  expect(validateOpeningException(candidate, [closure]).warning).toMatch(
    /fermetures.*prioritaires/,
  );
});

test('keeps legacy periods ordinary and prevents flattening an existing nonuniform exception', () => {
  expect(
    isOpeningHoursException({ ...createPeriodDraft(), extra: { exception_kind: 'other' } }),
  ).toBe(false);
  const period = buildOpeningException(input());
  expect(openingExceptionEditingReason(period)).toBeNull();
  period.weekdays[0].slots[0].start = '11:00';
  expect(openingExceptionEditingReason(period)).toMatch(/différents selon les jours/);
  period.editingUnavailableReason = 'Plusieurs horaires à préserver.';
  expect(openingExceptionEditingReason(period)).toBe(period.editingUnavailableReason);
  expect(
    openingExceptionEditingReason({
      ...buildOpeningException(input()),
      recurrence: 'cyclic',
      allYears: true,
    }),
  ).toMatch(/récurrence non représentable/);
});
