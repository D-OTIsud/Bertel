import { fireEvent, render, screen } from '@testing-library/react';
import { Select } from './Select';

it('preserves a historical value and refuses newly choosing unavailable options', () => {
  const onChange = jest.fn();
  render(<Select value="old" onChange={onChange} aria-label="Référence" options={[
    { v: '', l: 'Aucune' }, { v: 'old', l: 'Ancienne', disabled: true },
    { v: 'blocked', l: 'Retirée', disabled: true }, { v: 'active', l: 'Active' },
  ]} />);
  const select = screen.getByRole('combobox');
  expect(select).toHaveValue('old');
  expect(screen.getByRole('option', { name: 'Ancienne — à requalifier' })).toBeDisabled();
  expect(screen.getByRole('option', { name: 'Retirée — indisponible' })).toBeDisabled();
  fireEvent.change(select, { target: { value: 'blocked' } });
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.change(select, { target: { value: '' } });
  expect(onChange).toHaveBeenLastCalledWith('');
  fireEvent.change(select, { target: { value: 'active' } });
  expect(onChange).toHaveBeenLastCalledWith('active');
});

it('preserves a current value missing from the catalog without offering it as a new choice', () => {
  render(<Select value="legacy" onChange={jest.fn()} options={['', 'new']} />);
  expect(screen.getByRole('combobox')).toHaveValue('legacy');
  expect(screen.getByRole('option', { name: 'legacy — à requalifier' })).toBeDisabled();
});

it('keeps ordinary string options and accessibility metadata compatible', () => {
  const onChange = jest.fn();
  render(<Select value="one" options={['one', 'two']} onChange={onChange} id="reference" aria-label="Référence" aria-describedby="hint" />);
  expect(screen.getByRole('combobox')).toHaveAttribute('aria-describedby', 'hint');
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'two' } });
  expect(onChange).toHaveBeenCalledWith('two');
});
