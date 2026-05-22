import { fireEvent, render, screen } from '@testing-library/react';
import { LocationFormattedInput } from './LocationFormattedInput';

describe('LocationFormattedInput', () => {
  it('normalizes address text on blur', () => {
    const onChange = jest.fn();
    render(<LocationFormattedInput value="" onChange={onChange} aria-label="Adresse" />);
    const input = screen.getByLabelText('Adresse');
    fireEvent.change(input, { target: { value: '38 chemin du bel air' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith('38 Chemin du Bel Air');
  });
});
