import { render, screen } from '@testing-library/react';
import { OpeningPeriodEditModal } from './OpeningPeriodEditModal';
import { createPeriodDraft } from '../sections/opening-period-edit';

const noop = () => {};

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
