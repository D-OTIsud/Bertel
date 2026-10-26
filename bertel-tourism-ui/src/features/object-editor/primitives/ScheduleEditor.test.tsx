import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { ScheduleEditor, type ScheduleRow } from './ScheduleEditor';
import { formatScheduleTime } from './schedule-time';

const DAYS: Array<[string, string, string]> = [
  ['monday', 'lundi', 'Lun'],
  ['tuesday', 'mardi', 'Mar'],
  ['wednesday', 'mercredi', 'Mer'],
  ['thursday', 'jeudi', 'Jeu'],
  ['friday', 'vendredi', 'Ven'],
  ['saturday', 'samedi', 'Sam'],
  ['sunday', 'dimanche', 'Dim'],
];

function week(open: Record<string, [string, string]> = {}): ScheduleRow[] {
  return DAYS.map(([code, label, shortLabel]) => ({
    code,
    label,
    shortLabel,
    slots: open[code] ? [{ start: open[code][0], end: open[code][1] }, null] : [null, null],
  }));
}

describe('ScheduleEditor', () => {
  it('accepts keyboard time entry without the native picker clipping narrow columns', () => {
    render(<ScheduleEditor rows={week({ monday: ['09:00', '17:00'] })} colA="Plage 1" colB="Plage 2" onChange={() => {}} />);
    const start = screen.getByLabelText('lundi · Plage 1 · début');
    expect(start.getAttribute('type')).toBe('text');
    expect(start.getAttribute('inputmode')).toBe('numeric');
  });

  it('completes a human time such as 9h30 when leaving the field', () => {
    const onChange = jest.fn();
    function Fixture() {
      const [rows, setRows] = useState(week({ monday: ['09:00', '12:00'] }));
      return <ScheduleEditor rows={rows} colA="Plage 1" colB="Plage 2" onChange={(next) => { setRows(next); onChange(next); }} />;
    }
    render(<Fixture />);
    const input = screen.getByLabelText('lundi · Plage 1 · début');
    fireEvent.change(input, { target: { value: '9h30' } });
    fireEvent.blur(input);
    expect(onChange.mock.calls.at(-1)[0][0].slots[0].start).toBe('09:30');
  });

  it('opens a closed day group when a quick-select button is clicked', () => {
    const onChange = jest.fn();
    render(<ScheduleEditor rows={week()} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Lun-Ven' }));
    const next: ScheduleRow[] = onChange.mock.calls[0][0];
    const openCodes = next.filter((r) => r.slots.some(Boolean)).map((r) => r.code);
    expect(openCodes).toEqual(['monday', 'tuesday', 'wednesday', 'thursday', 'friday']);
  });

  it('copies a day to the NEXT day only, not the whole week', () => {
    const onChange = jest.fn();
    render(<ScheduleEditor rows={week({ monday: ['09:00', '12:00'] })} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Copier les heures de lundi sur le jour suivant'));
    const next: ScheduleRow[] = onChange.mock.calls[0][0];
    const open = next.filter((r) => r.slots.some(Boolean)).map((r) => r.code);
    expect(open).toEqual(['monday', 'tuesday']); // monday + the next day only
    expect(next.find((r) => r.code === 'tuesday')?.slots[0]).toEqual({ start: '09:00', end: '12:00' });
  });

  it('disables copy on the last day (no next day)', () => {
    render(<ScheduleEditor rows={week({ sunday: ['09:00', '12:00'] })} onChange={() => {}} />);
    expect(screen.getByLabelText('Copier les heures de dimanche sur le jour suivant')).toBeDisabled();
  });

  it('opens a closed plage when its "Fermé" cell is clicked (Plage 2 reachable)', () => {
    const onChange = jest.fn();
    render(<ScheduleEditor rows={week({ monday: ['09:00', '12:00'] })} colA="Plage 1" colB="Plage 2" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Ouvrir lundi · Plage 2'));
    const next: ScheduleRow[] = onChange.mock.calls[0][0];
    expect(next.find((r) => r.code === 'monday')?.slots[1]).toEqual({ start: '', end: '' });
  });
});

test.each([['9', '09:00'], ['9h30', '09:30'], ['0930', '09:30'], ['14:15', '14:15'], ['', ''], ['24:00', null], ['09:75', null]])('formatScheduleTime(%s) → %s', (input, expected) => {
  expect(formatScheduleTime(input)).toBe(expected);
});
