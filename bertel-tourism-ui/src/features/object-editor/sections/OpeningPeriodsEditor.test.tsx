import { render, screen } from '@testing-library/react';
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
