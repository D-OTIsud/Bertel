import { render, screen, fireEvent } from '@testing-library/react';
import { EditorNav } from './EditorNav';
import { makeSections } from '../section-config';

describe('EditorNav', () => {
  it('renders every section group heading', () => {
    render(<EditorNav groups={makeSections('HEB')} activeNum="01" onSelect={() => {}} />);
    expect(screen.getByText('Identité')).toBeInTheDocument();
    expect(screen.getByText('Gestion')).toBeInTheDocument();
  });

  it('fires onSelect with the section number when an item is clicked', () => {
    const onSelect = jest.fn();
    render(<EditorNav groups={makeSections('HEB')} activeNum="01" onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Médias'));
    expect(onSelect).toHaveBeenCalledWith('06');
  });
});
