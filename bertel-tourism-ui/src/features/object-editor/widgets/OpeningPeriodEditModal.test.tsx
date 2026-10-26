import { fireEvent, render, screen } from '@testing-library/react';
import { OpeningPeriodEditModal } from './OpeningPeriodEditModal';
import { createPeriodDraft } from '../sections/opening-period-edit';

const noop = () => {};

test('cyclic start month stays selected even before an end month is chosen', () => {
  render(
    <OpeningPeriodEditModal open mode="add" draft={{ ...createPeriodDraft(0), recurrence: 'cyclic' }}
      existingPeriods={[]} periodTypeOptions={[]} onClose={noop} onSave={noop} />,
  );
  const startMonth = screen.getByLabelText('Mois de début') as HTMLSelectElement;
  fireEvent.change(startMonth, { target: { value: '5' } });
  // Regression: the picker used to round-trip through the encoded date, which stayed empty
  // until BOTH months were set, so the chosen month snapped back to "— Mois —".
  expect((screen.getByLabelText('Mois de début') as HTMLSelectElement).value).toBe('5');
});

test('cyclic both months set encodes a sentinel-year range onto the saved draft', () => {
  let saved: ReturnType<typeof createPeriodDraft> | null = null;
  render(
    <OpeningPeriodEditModal open mode="add" draft={{ ...createPeriodDraft(0), recurrence: 'cyclic' }}
      existingPeriods={[]} periodTypeOptions={[]} onClose={noop} onSave={(p) => { saved = p; }} />,
  );
  fireEvent.change(screen.getByLabelText('Mois de début'), { target: { value: '5' } });
  fireEvent.change(screen.getByLabelText('Mois de fin'), { target: { value: '9' } });
  fireEvent.click(screen.getByRole('button', { name: /^(Ajouter|Appliquer)$/ }));
  expect(saved).not.toBeNull();
  expect(saved!.startDate).toBe('2000-05-01');
  expect(saved!.endDate).toBe('2000-09-30');
});

test('switching recurrence to "Toute l\'année" hides the season type select', () => {
  render(
    <OpeningPeriodEditModal open mode="add" draft={{ ...createPeriodDraft(0), recurrence: 'cyclic' }}
      existingPeriods={[]} periodTypeOptions={[]} onClose={noop} onSave={noop} />,
  );
  expect(screen.getByLabelText('Type de période')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Toute l.année/ }));
  expect(screen.queryByLabelText('Type de période')).not.toBeInTheDocument();
});

test('cyclic mode shows month pickers, hides the bucket dropdown', () => {
  render(
    <OpeningPeriodEditModal open mode="add" draft={{ ...createPeriodDraft(0), recurrence: 'cyclic' }}
      existingPeriods={[]} periodTypeOptions={[]} onClose={noop} onSave={noop} />,
  );
  expect(screen.getByLabelText('Récurrence')).toBeInTheDocument();
  expect(screen.queryByLabelText('Période (cycle)')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Mois de début')).toBeInTheDocument();
  expect(screen.getByLabelText('Mois de fin')).toBeInTheDocument();
});

test('always mode shows no date inputs', () => {
  render(
    <OpeningPeriodEditModal open mode="add" draft={{ ...createPeriodDraft(0), recurrence: 'always' }}
      existingPeriods={[]} periodTypeOptions={[]} onClose={noop} onSave={noop} />,
  );
  expect(screen.queryByLabelText('Mois de début')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Date de début')).not.toBeInTheDocument();
});

test('fixed mode shows full date inputs', () => {
  render(
    <OpeningPeriodEditModal open mode="add" draft={{ ...createPeriodDraft(0), recurrence: 'fixed' }}
      existingPeriods={[]} periodTypeOptions={[]} onClose={noop} onSave={noop} />,
  );
  expect(screen.getByLabelText('Date de début')).toBeInTheDocument();
  expect(screen.getByLabelText('Date de fin')).toBeInTheDocument();
});

test('no longer renders the exceptional-closure block (moved to object level)', () => {
  render(
    <OpeningPeriodEditModal open mode="add" draft={createPeriodDraft(0)}
      existingPeriods={[]} periodTypeOptions={[]} onClose={noop} onSave={noop} />,
  );
  expect(screen.queryByLabelText('Date de fermeture')).not.toBeInTheDocument();
});

test('editing and copying hours preserves each day’s note and period metadata', () => {
  const draft = {
    ...createPeriodDraft(),
    recurrence: 'always' as const,
    sourcePeriodId: 'original-period',
    nameI18n: { en: 'Summer' },
    extra: { imported: true },
    weekdayNotes: { monday: 'Sur réservation', tuesday: 'Accueil des groupes' },
    weekdays: [
      { code: 'monday', label: 'lundi', slots: [{ start: '09:00', end: '12:00' }] },
      { code: 'tuesday', label: 'mardi', slots: [{ start: '10:00', end: '13:00' }] },
    ],
  };
  const onSave = jest.fn();
  render(<OpeningPeriodEditModal open mode="edit" draft={draft} existingPeriods={[]} periodTypeOptions={[]} onClose={noop} onSave={onSave} />);

  expect(screen.getByText('Lun — Sur réservation')).toBeInTheDocument();
  expect(screen.getByText('Mar — Accueil des groupes')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('lundi · Plage 1 · début'), { target: { value: '08:30' } });
  fireEvent.click(screen.getByLabelText('Copier les heures de lundi sur le jour suivant'));
  fireEvent.click(screen.getByRole('button', { name: /^(Ajouter|Appliquer)$/ }));

  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
    sourcePeriodId: draft.sourcePeriodId,
    nameI18n: draft.nameI18n,
    extra: draft.extra,
    weekdayNotes: draft.weekdayNotes,
  }));
  const saved = onSave.mock.calls[0][0];
  expect(saved.weekdays.find((day: { code: string }) => day.code === 'tuesday').slots).toEqual([{ start: '08:30', end: '12:00' }]);
});

test('closing then reopening a day keeps its note', () => {
  const onSave = jest.fn();
  render(<OpeningPeriodEditModal open mode="edit" draft={{
    ...createPeriodDraft(),
    recurrence: 'always',
    weekdayNotes: { monday: 'Sur réservation' },
    weekdays: [{ code: 'monday', label: 'lundi', slots: [{ start: '09:00', end: '12:00' }] }],
  }} existingPeriods={[]} periodTypeOptions={[]} onClose={noop} onSave={onSave} />);

  fireEvent.click(screen.getByText('Lun').closest('button')!);
  expect(screen.getByText('Lun — Sur réservation')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Lun').closest('button')!);
  fireEvent.click(screen.getByRole('button', { name: /^(Ajouter|Appliquer)$/ }));
  expect(onSave.mock.calls[0][0].weekdayNotes).toEqual({ monday: 'Sur réservation' });
});

test('a third daily time frame cannot be silently removed by this editor', () => {
  const onSave = jest.fn();
  render(<OpeningPeriodEditModal open mode="edit" draft={{
    ...createPeriodDraft(),
    recurrence: 'always',
    weekdays: [{ code: 'monday', label: 'lundi', slots: [
      { start: '08:00', end: '10:00' }, { start: '12:00', end: '14:00' }, { start: '18:00', end: '20:00' },
    ] }],
  }} existingPeriods={[]} periodTypeOptions={[]} onClose={noop} onSave={onSave} />);

  expect(screen.getByRole('status')).toHaveTextContent('plus de deux plages');
  expect(screen.getByLabelText('lundi · Plage 1 · début')).toBeDisabled();
  expect(screen.getByRole('button', { name: /^(Ajouter|Appliquer)$/ })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: /^(Ajouter|Appliquer)$/ }));
  expect(onSave).not.toHaveBeenCalled();
});

test('short time entry is normalized on apply, while invalid times block the draft', () => {
  const onSave = jest.fn();
  render(<OpeningPeriodEditModal open mode="edit" draft={{ ...createPeriodDraft(), recurrence: 'always', weekdays: [{ code: 'monday', label: 'lundi', slots: [{ start: '09:00', end: '12:00' }] }] }} existingPeriods={[]} periodTypeOptions={[]} onClose={noop} onSave={onSave} />);
  fireEvent.change(screen.getByLabelText('lundi · Plage 1 · début'), { target: { value: '25h30' } });
  expect(screen.getByRole('button', { name: 'Appliquer' })).toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent('heures valides');
  fireEvent.change(screen.getByLabelText('lundi · Plage 1 · début'), { target: { value: '9h30' } });
  fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }));
  expect(onSave.mock.calls[0][0].weekdays[0].slots[0].start).toBe('09:30');
});
