import { fireEvent, render, screen } from '@testing-library/react';
import { ClosureEditModal } from './ClosureEditModal';
import type { ObjectWorkspaceOpeningPeriod } from '../../../services/object-workspace-parser';
import { createPeriodDraft } from '../sections/opening-period-edit';
import * as exceptionFeatures from '../sections/opening-exception';

jest.mock('../sections/opening-exception', () => ({
  __esModule: true,
  ...jest.requireActual('../sections/opening-exception'),
  EXCEPTION_HOURS_ENABLED: false,
}));

afterEach(() => {
  Object.defineProperty(exceptionFeatures, 'EXCEPTION_HOURS_ENABLED', {
    value: false,
    configurable: true,
  });
});

test('editing closure dates preserves source, translations, type and schedule metadata', () => {
  const draft = {
    ...createPeriodDraft(),
    recordId: 'closure-id',
    label: 'Travaux',
    isClosure: true,
    recurrence: 'fixed' as const,
    startDate: '2026-11-01',
    endDate: '2026-11-01',
    seasonTypeCode: 'exceptional',
    sourcePeriodId: 'source-id',
    nameI18n: { en: 'Works' },
    extra: { source: 'import' },
    weekdayNotes: { sunday: 'Travaux' },
  };
  const onSave = jest.fn();
  render(<ClosureEditModal open mode="edit" draft={draft} onClose={() => {}} onSave={onSave} />);
  fireEvent.change(screen.getByLabelText('Date de fermeture'), { target: { value: '2026-11-02' } });
  fireEvent.click(screen.getByRole('button', { name: /^(Ajouter|Appliquer)$/ }));
  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      recordId: draft.recordId,
      startDate: '2026-11-02',
      endDate: '2026-11-02',
      seasonTypeCode: draft.seasonTypeCode,
      sourcePeriodId: draft.sourcePeriodId,
      nameI18n: draft.nameI18n,
      extra: draft.extra,
      weekdayNotes: draft.weekdayNotes,
    }),
  );
});

test.each(['Horaires modifiés', 'Ouvert exceptionnellement'])(
  '%s stays unavailable until the read contract supports it',
  (label) => {
    const onSave = jest.fn();
    render(<ClosureEditModal open mode="add" onClose={() => {}} onSave={onSave} />);
    expect(screen.getByRole('button', { name: label })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeDisabled();
    expect(screen.queryByText('Horaires exceptionnels')).not.toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  },
);

test.each(['Horaires modifiés', 'Ouvert exceptionnellement'])(
  '%s prepares a fixed seven-day exception when activation is mocked',
  (label) => {
    Object.defineProperty(exceptionFeatures, 'EXCEPTION_HOURS_ENABLED', {
      value: true,
      configurable: true,
    });
    const onSave = jest.fn();
    render(<ClosureEditModal open mode="add" onClose={() => {}} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(screen.getByText('Horaires exceptionnels')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Se répète chaque année' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Date de l’exception'), {
      target: { value: '2026-12-24' },
    });
    fireEvent.change(screen.getByLabelText('Début de la plage 1'), { target: { value: '9h30' } });
    fireEvent.change(screen.getByLabelText('Fin de la plage 1'), { target: { value: '16:00' } });
    expect(screen.queryByText(/Habituellement/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const period = onSave.mock.calls[0][0];
    expect(period).toMatchObject({
      isClosure: false,
      recurrence: 'fixed',
      allYears: false,
      startDate: '2026-12-24',
      endDate: '2026-12-24',
      extra: { exception_kind: label === 'Horaires modifiés' ? 'modified' : 'open' },
    });
    expect(period.weekdays).toHaveLength(7);
    expect(
      period.weekdays.every(
        (day: { slots: unknown }) =>
          JSON.stringify(day.slots) === JSON.stringify([{ start: '09:30', end: '16:00' }]),
      ),
    ).toBe(true);
  },
);

test('activated hours form keeps notes visible and blocks a wider exception that would not win', () => {
  Object.defineProperty(exceptionFeatures, 'EXCEPTION_HOURS_ENABLED', {
    value: true,
    configurable: true,
  });
  const draft = exceptionFeatures.buildOpeningException({
    kind: 'modified',
    label: 'Travaux',
    startDate: '2026-12-20',
    endDate: '2026-12-31',
    recurring: false,
    slots: [{ start: '10:00', end: '16:00' }],
  });
  draft.weekdayNotes = { monday: 'Sur réservation' };
  const morePrecise = {
    ...createPeriodDraft(),
    recurrence: 'fixed' as const,
    allYears: false,
    label: 'Noël',
    startDate: '2026-12-24',
    endDate: '2026-12-26',
  };
  const onSave = jest.fn();
  render(
    <ClosureEditModal
      open
      mode="edit"
      draft={draft}
      existingPeriods={[draft, morePrecise]}
      onClose={() => {}}
      onSave={onSave}
    />,
  );
  expect(screen.getByText(/Lun — Sur réservation/)).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent(/Noël.*plus précise/);
  expect(screen.getByRole('button', { name: 'Appliquer' })).toBeDisabled();
  expect(onSave).not.toHaveBeenCalled();
});

test('an existing advanced exception cannot silently become a closure while the switch is off', () => {
  const draft = exceptionFeatures.buildOpeningException({
    kind: 'modified',
    label: 'Travaux',
    startDate: '2026-12-24',
    endDate: '2026-12-24',
    recurring: false,
    slots: [{ start: '10:00', end: '16:00' }],
  });
  const onSave = jest.fn();
  render(<ClosureEditModal open mode="edit" draft={draft} onClose={() => {}} onSave={onSave} />);
  expect(screen.getByRole('button', { name: 'Horaires modifiés' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getByRole('button', { name: 'Appliquer' })).toBeDisabled();
  expect(onSave).not.toHaveBeenCalled();
});


// Existing production closure cases remain covered with the approved draft CTA.
test('closure modal supports a single date, a range toggle, and a yearly toggle', () => {
  render(<ClosureEditModal open mode="add" onClose={() => {}} onSave={() => {}} />);
  expect(screen.getByLabelText('Date de fermeture')).toBeInTheDocument();
  expect(screen.getByLabelText('Plage de dates')).toBeInTheDocument();
  expect(screen.getByLabelText('Se répète chaque année')).toBeInTheDocument();
});

test('reveals the end date input when the range toggle is on', () => {
  render(<ClosureEditModal open mode="add" onClose={() => {}} onSave={() => {}} />);
  expect(screen.queryByLabelText('Fin de fermeture')).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Plage de dates'));
  expect(screen.getByLabelText('Fin de fermeture')).toBeInTheDocument();
});

test('emits a fixed single-date closure: start=end, isClosure, empty schedule', () => {
  const onSave = jest.fn();
  render(<ClosureEditModal open mode="add" onClose={() => {}} onSave={onSave} />);
  fireEvent.change(screen.getByLabelText('Date de fermeture'), { target: { value: '2026-12-25' } });
  fireEvent.click(screen.getByRole('button', { name: /^(Ajouter|Appliquer)$/ }));
  expect(onSave).toHaveBeenCalledTimes(1);
  const closure = onSave.mock.calls[0][0] as ObjectWorkspaceOpeningPeriod;
  expect(closure.isClosure).toBe(true);
  expect(closure.recurrence).toBe('fixed');
  expect(closure.startDate).toBe('2026-12-25');
  expect(closure.endDate).toBe('2026-12-25');
  expect(closure.weekdays).toEqual([]);
  expect(closure.closedDays).toEqual([]);
});

test('encodes a yearly closure range into the sentinel year', () => {
  const onSave = jest.fn();
  render(<ClosureEditModal open mode="add" onClose={() => {}} onSave={onSave} />);
  fireEvent.click(screen.getByLabelText('Plage de dates'));
  fireEvent.click(screen.getByLabelText('Se répète chaque année'));
  fireEvent.change(screen.getByLabelText('Date de fermeture'), { target: { value: '2026-08-01' } });
  fireEvent.change(screen.getByLabelText('Fin de fermeture'), { target: { value: '2026-08-15' } });
  fireEvent.click(screen.getByRole('button', { name: /^(Ajouter|Appliquer)$/ }));
  const closure = onSave.mock.calls[0][0] as ObjectWorkspaceOpeningPeriod;
  expect(closure.recurrence).toBe('cyclic');
  expect(closure.allYears).toBe(true);
  expect(closure.startDate).toBe('2000-08-01');
  expect(closure.endDate).toBe('2000-08-15');
});

test('disables save until a date is entered', () => {
  render(<ClosureEditModal open mode="add" onClose={() => {}} onSave={() => {}} />);
  const save = screen.getByRole('button', { name: /^(Ajouter|Appliquer)$/ });
  expect(save).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Date de fermeture'), { target: { value: '2026-12-25' } });
  expect(save).toBeEnabled();
});

test('preserves recordId when editing an existing closure', () => {
  const onSave = jest.fn();
  const draft: ObjectWorkspaceOpeningPeriod = {
    recordId: 'cl1',
    order: '3',
    bucket: 'current',
    label: 'Travaux',
    seasonTypeCode: '',
    startDate: '2026-09-01',
    endDate: '2026-09-10',
    allYears: false,
    recurrence: 'fixed',
    isClosure: true,
    closedDays: [],
    weekdays: [],
  };
  render(<ClosureEditModal open mode="edit" draft={draft} onClose={() => {}} onSave={onSave} />);
  // The range input must be pre-checked (start !== end), exposing the end input.
  expect(screen.getByLabelText('Fin de fermeture')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^(Ajouter|Appliquer)$/ }));
  const closure = onSave.mock.calls[0][0] as ObjectWorkspaceOpeningPeriod;
  expect(closure.recordId).toBe('cl1');
  expect(closure.order).toBe('3');
  expect(closure.isClosure).toBe(true);
});
