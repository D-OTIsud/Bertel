import { render, screen, fireEvent } from '@testing-library/react';
import { GradeBar } from './GradeBar';

const STARS = [
  { code: '1', name: '1 étoile' }, { code: '2', name: '2 étoiles' }, { code: '3', name: '3 étoiles' },
  { code: '4', name: '4 étoiles' }, { code: '5', name: '5 étoiles' },
];

it('renders one toggle per level with the level name as accessible label', () => {
  render(<GradeBar values={STARS} unit="etoile" selected={['3']} onChange={() => {}} />);
  expect(screen.getByRole('button', { name: '3 étoiles' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: '5 étoiles' })).toHaveAttribute('aria-pressed', 'false');
});

it('toggles a level independently on click', () => {
  const onChange = jest.fn();
  render(<GradeBar values={STARS} unit="etoile" selected={['3']} onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: '5 étoiles' }));
  expect(onChange).toHaveBeenCalledWith(['3', '5']);
  fireEvent.click(screen.getByRole('button', { name: '3 étoiles' }));
  expect(onChange).toHaveBeenCalledWith([]);
});
