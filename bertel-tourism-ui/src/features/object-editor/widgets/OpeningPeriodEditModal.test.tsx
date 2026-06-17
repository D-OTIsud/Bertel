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
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
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
  fireEvent.change(screen.getByLabelText('Récurrence'), { target: { value: 'always' } });
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
