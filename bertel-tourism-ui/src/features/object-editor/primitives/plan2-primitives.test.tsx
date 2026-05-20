import { fireEvent, render, screen } from '@testing-library/react';
import { ScheduleEditor, type ScheduleRow } from './ScheduleEditor';
import { SeasonPicker } from './SeasonPicker';
import { TriState } from './TriState';

describe('Plan 2 editor primitives', () => {
  it('edits a schedule slot', () => {
    const onChange = jest.fn();
    const rows: ScheduleRow[] = [{ code: 'monday', label: 'lundi', shortLabel: 'Lun', slots: [{ start: '09:00', end: '17:00' }, null] }];
    render(<ScheduleEditor rows={rows} onChange={onChange} />);
    fireEvent.change(screen.getByDisplayValue('09:00'), { target: { value: '10:00' } });
    expect(onChange).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ slots: [expect.objectContaining({ start: '10:00' }), null] })]));
  });

  it('cycles season cells and tri-state choices', () => {
    const onSeason = jest.fn();
    render(<SeasonPicker value={Array(12).fill('')} onChange={onSeason} />);
    fireEvent.click(screen.getByText('JAN'));
    expect(onSeason).toHaveBeenCalledWith(expect.arrayContaining(['high']));

    const onTri = jest.fn();
    render(<TriState label="Familles" value="yes" onChange={onTri} />);
    fireEvent.click(screen.getByText('Cond.'));
    expect(onTri).toHaveBeenCalledWith('conditional');
  });
});
