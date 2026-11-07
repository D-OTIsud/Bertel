import { fireEvent, render, screen } from '@testing-library/react';
import { StatCard } from './StatCard';

describe('StatCard', () => {
  it('renders the label, value and suffix', () => {
    render(<StatCard label="Distance" value="8.5" suffix="km" />);
    expect(screen.getByText('Distance')).toBeInTheDocument();
    expect(screen.getByText('8.5')).toBeInTheDocument();
    expect(screen.getByText('km')).toBeInTheDocument();
  });

  it('renders inert (disabled) steppers when hasStep is set without onStep', () => {
    render(<StatCard label="Distance" value="8.5" suffix="km" hasStep />);
    const buttons = screen.getAllByRole('button', { hidden: true });
    expect(buttons).toHaveLength(2);
    buttons.forEach((b) => expect(b).toBeDisabled());
  });

  it('§111: wires the +/- steppers to onStep when provided', () => {
    const onStep = jest.fn();
    render(<StatCard label="Distance" value="8.5" suffix="km" hasStep onStep={onStep} />);
    const minus = screen.getByLabelText('Diminuer Distance');
    const plus = screen.getByLabelText('Augmenter Distance');
    expect(minus).toBeEnabled();
    expect(plus).toBeEnabled();
    fireEvent.click(plus);
    fireEvent.click(minus);
    expect(onStep).toHaveBeenNthCalledWith(1, 1);
    expect(onStep).toHaveBeenNthCalledWith(2, -1);
  });
});
