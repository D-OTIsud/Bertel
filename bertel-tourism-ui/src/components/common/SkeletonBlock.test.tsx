import { render, screen } from '@testing-library/react';
import { SkeletonBlock } from './SkeletonBlock';

describe('SkeletonBlock', () => {
  it('is hidden from assistive technology', () => {
    render(<SkeletonBlock className="h-4 w-24" data-testid="block" />);
    expect(screen.getByTestId('block')).toHaveAttribute('aria-hidden', 'true');
  });

  it('carries the shared shimmer class', () => {
    render(<SkeletonBlock className="h-4 w-24" data-testid="block" />);
    expect(screen.getByTestId('block')).toHaveClass('drawer-skeleton');
  });
});
