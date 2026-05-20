import { render, screen, fireEvent } from '@testing-library/react';
import { Input, Textarea, Toggle, Chip, Fs } from './index';

describe('editor primitives', () => {
  it('Input is controlled — fires onChange with the new value', () => {
    const onChange = jest.fn();
    render(<Input value="hi" onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello' } });
    expect(onChange).toHaveBeenCalledWith('hello');
  });

  it('Textarea reports a character count when count is provided', () => {
    render(<Textarea value="abc" onChange={() => {}} count max={160} />);
    expect(screen.getByText(/3 \/ 160/)).toBeInTheDocument();
  });

  it('Toggle fires onChange with the negated value when clicked', () => {
    const onChange = jest.fn();
    render(<Toggle label="Animaux" on={false} onChange={onChange} />);
    fireEvent.click(screen.getByText('Animaux'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('Chip applies the is-on class when selected', () => {
    const { container } = render(<Chip label="CB" on />);
    expect(container.querySelector('.chip.is-on')).not.toBeNull();
  });

  it('Fs collapses its body when folded', () => {
    render(
      <Fs num="01" title="Identité" folded>
        <p>body</p>
      </Fs>,
    );
    expect(screen.queryByText('body')).not.toBeInTheDocument();
  });
});
