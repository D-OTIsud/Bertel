import { render, screen, fireEvent } from '@testing-library/react';
import { ScopeTabs } from './ScopeTabs';

describe('ScopeTabs', () => {
  it('renders options and fires onSelect', () => {
    const onSelect = jest.fn();
    render(<ScopeTabs active="canonical" onSelect={onSelect} tabs={[
      { code: 'canonical', label: 'Canonique' },
      { code: 'org', label: 'Mon organisation · OTI du Sud' },
    ]} />);
    expect(screen.getByText('Canonique')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Mon organisation · OTI du Sud'));
    expect(onSelect).toHaveBeenCalledWith('org');
  });
});
