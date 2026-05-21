import { render, screen, fireEvent } from '@testing-library/react';
import { ChipMultiSelect } from './ChipMultiSelect';

const options = [
  { code: 'wifi', label: 'Wi-Fi' },
  { code: 'pool', label: 'Piscine' },
];

describe('ChipMultiSelect', () => {
  it('marks selected options and toggles on click', () => {
    const onToggle = jest.fn();
    render(<ChipMultiSelect options={options} selected={['wifi']} onToggle={onToggle} />);
    expect(screen.getByRole('button', { name: 'Wi-Fi' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Piscine' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Piscine' }));
    expect(onToggle).toHaveBeenCalledWith('pool');
  });
});
