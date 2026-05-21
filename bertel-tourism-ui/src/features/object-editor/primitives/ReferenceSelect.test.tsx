import { render, screen, fireEvent } from '@testing-library/react';
import { ReferenceSelect } from './ReferenceSelect';

const options = [
  { id: 'k1', code: 'phone', label: 'Téléphone' },
  { id: 'k2', code: 'email', label: 'E-mail' },
];

describe('ReferenceSelect', () => {
  it('renders options and reports the picked code', () => {
    const onChange = jest.fn();
    render(<ReferenceSelect value="phone" options={options} onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'email' } });
    expect(onChange).toHaveBeenCalledWith('email', options[1]);
  });

  it('shows a stale value that is not in the options instead of rendering blank', () => {
    render(<ReferenceSelect value="legacy_code" options={options} onChange={() => {}} />);
    expect(screen.getByRole('combobox')).toHaveValue('legacy_code');
    expect(screen.getByText('legacy_code')).toBeInTheDocument();
  });

  it('prepends an empty entry when allowEmpty is set', () => {
    render(<ReferenceSelect value="" options={options} onChange={() => {}} allowEmpty emptyLabel="— Aucun —" />);
    expect(screen.getByRole('option', { name: '— Aucun —' })).toBeInTheDocument();
  });
});
