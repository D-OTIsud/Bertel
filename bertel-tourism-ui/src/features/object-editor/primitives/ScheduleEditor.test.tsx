import { fireEvent, render, screen } from '@testing-library/react';
import { ScheduleEditor, type ScheduleRow } from './ScheduleEditor';

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
  it('renders constrained time inputs (type=time) for an open slot', () => {
    render(<ScheduleEditor rows={week({ monday: ['09:00', '17:00'] })} colA="Plage 1" colB="Plage 2" onChange={() => {}} />);
    const start = screen.getByLabelText('lundi · Plage 1 · début');
    expect(start.getAttribute('type')).toBe('time');
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
    fireEvent.click(screen.getByLabelText('Copier lundi sur le jour suivant'));
    const next: ScheduleRow[] = onChange.mock.calls[0][0];
    const open = next.filter((r) => r.slots.some(Boolean)).map((r) => r.code);
    expect(open).toEqual(['monday', 'tuesday']); // monday + the next day only
    expect(next.find((r) => r.code === 'tuesday')?.slots[0]).toEqual({ start: '09:00', end: '12:00' });
  });

  it('disables copy on the last day (no next day)', () => {
    render(<ScheduleEditor rows={week({ sunday: ['09:00', '12:00'] })} onChange={() => {}} />);
    expect(screen.getByLabelText('Copier dimanche sur le jour suivant')).toBeDisabled();
  });

  it('opens a closed plage when its "Fermé" cell is clicked (Plage 2 reachable)', () => {
    const onChange = jest.fn();
    render(<ScheduleEditor rows={week({ monday: ['09:00', '12:00'] })} colA="Plage 1" colB="Plage 2" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Ouvrir lundi · Plage 2'));
    const next: ScheduleRow[] = onChange.mock.calls[0][0];
    expect(next.find((r) => r.code === 'monday')?.slots[1]).toEqual({ start: '', end: '' });
  });
});
