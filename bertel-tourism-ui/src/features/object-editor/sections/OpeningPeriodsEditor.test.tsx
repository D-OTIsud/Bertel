import { fireEvent, render, screen } from '@testing-library/react';
import { OpeningPeriodsEditor } from './OpeningPeriodsEditor';
import { createPeriodDraft } from './opening-period-edit';
import type { ObjectWorkspaceOpeningPeriod } from '../../../services/object-workspace-parser';

const noop = () => {};

function renderList(periods: ObjectWorkspaceOpeningPeriod[], typeOptions = [] as never[]) {
  return render(
    <OpeningPeriodsEditor
      periods={periods}
      periodTypeOptions={typeOptions}
      currentIndex={0}
      onAdd={noop}
      onEdit={noop}
      onDelete={noop}
    />,
  );
}

test('renders the season label as a coloured chip (restores season colours)', () => {
  renderList([{ ...createPeriodDraft(0), label: 'Haute saison', recurrence: 'always' }]);
  // "Haute saison" also appears in the static legend; the chip is the .pill in the row.
  const chips = screen.getAllByText('Haute saison').filter((el) => el.classList.contains('pill'));
  expect(chips).toHaveLength(1);
  // The chip carries an inline soft-tint background — the colour the user asked to keep.
  expect(chips[0].getAttribute('style')).toMatch(/background/);
});

test('an explicit period type colours the chip from its catalog colour', () => {
  renderList(
    [{ ...createPeriodDraft(0), seasonTypeCode: 'mid', label: '', recurrence: 'always' }],
    [{ code: 'mid', label: 'Mi-saison', color: '#7a5cff', allYear: false }] as never[],
  );
  expect(screen.getByText('Mi-saison').getAttribute('style')).toMatch(/background/);
});

test('expanded hours show grouped notes, including notes on a closed day', () => {
  renderList([{
    ...createPeriodDraft(), label: 'Été', recurrence: 'always',
    weekdayNotes: { monday: 'Sur réservation', thursday: 'Sur réservation', sunday: 'Fermé pour travaux' },
  }]);
  fireEvent.click(screen.getByRole('button', { name: 'Détails de Été' }));
  expect(screen.getByText('Lun, Jeu — Sur réservation')).toBeInTheDocument();
  expect(screen.getByText('Dim — Fermé pour travaux')).toBeInTheDocument();
});

test('read-only detail shows every time frame even when the grid cannot edit them', () => {
  renderList([{
    ...createPeriodDraft(), label: 'Été', recurrence: 'always',
    weekdays: [{ code: 'monday', label: 'lundi', slots: [
      { start: '08:00', end: '10:00' }, { start: '12:00', end: '14:00' }, { start: '18:00', end: '20:00' },
    ] }],
  }]);
  fireEvent.click(screen.getByRole('button', { name: 'Détails de Été' }));
  expect(screen.getByText(/08:00–10:00 · 12:00–14:00 · 18:00–20:00/)).toBeInTheDocument();
});

test('an ambiguous day still displays all its original notes', () => {
  renderList([{
    ...createPeriodDraft(), label: 'Été', recurrence: 'always',
    editingUnavailableReason: 'Plusieurs créneaux pour un même jour.',
    schedules: [{
      id: null, schedule_type_id: null, schedule_type_code: 'regular', name: 'Horaires', note: null,
      name_i18n: null, note_i18n: null, extra: {},
      time_periods: ['Sur réservation', 'Accueil des groupes'].map((note) => ({
        id: null, closed: false, note, weekdays: [{ weekday_code: 'monday' }], time_frames: [],
      })),
    }],
  }]);
  fireEvent.click(screen.getByRole('button', { name: 'Détails de Été' }));
  expect(screen.getByText('Lun — Sur réservation')).toBeInTheDocument();
  expect(screen.getByText('Lun — Accueil des groupes')).toBeInTheDocument();
});
