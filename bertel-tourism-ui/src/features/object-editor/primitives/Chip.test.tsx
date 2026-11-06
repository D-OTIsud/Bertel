import { fireEvent, render, screen } from '@testing-library/react';
import { Chip } from './Chip';

it('disables adding an unavailable reference while allowing its selected value to be removed', () => {
  const onClick = jest.fn();
  const { rerender } = render(<Chip label="Historique" disabled onClick={onClick} />);
  const unavailable = screen.getByRole('button', { name: 'Historique — indisponible' });
  expect(unavailable).toBeDisabled();
  fireEvent.click(unavailable);
  expect(onClick).not.toHaveBeenCalled();
  rerender(<Chip label="Historique" disabled on onClick={onClick} />);
  const selected = screen.getByRole('button', { name: 'Historique — à requalifier' });
  expect(selected).toBeEnabled();
  expect(selected).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(selected);
  expect(onClick).toHaveBeenCalledTimes(1);
});
