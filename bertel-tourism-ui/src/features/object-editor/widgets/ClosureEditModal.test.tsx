import { fireEvent, render, screen } from '@testing-library/react';
import { ClosureEditModal } from './ClosureEditModal';
import type { ObjectWorkspaceOpeningPeriod } from '../../../services/object-workspace-parser';

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
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
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
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  const closure = onSave.mock.calls[0][0] as ObjectWorkspaceOpeningPeriod;
  expect(closure.recurrence).toBe('cyclic');
  expect(closure.allYears).toBe(true);
  expect(closure.startDate).toBe('2000-08-01');
  expect(closure.endDate).toBe('2000-08-15');
});

test('disables save until a date is entered', () => {
  render(<ClosureEditModal open mode="add" onClose={() => {}} onSave={() => {}} />);
  const save = screen.getByRole('button', { name: 'Enregistrer' });
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
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  const closure = onSave.mock.calls[0][0] as ObjectWorkspaceOpeningPeriod;
  expect(closure.recordId).toBe('cl1');
  expect(closure.order).toBe('3');
  expect(closure.isClosure).toBe(true);
});
