import { render, screen } from '@testing-library/react';
import { PageSkeleton } from './PageSkeleton';

describe('PageSkeleton', () => {
  it.each(['dashboard', 'list', 'form'] as const)('exposes aria-busy + a readable status label for variant=%s', (variant) => {
    render(<PageSkeleton variant={variant} />);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(region).toHaveAccessibleName();
  });

  it('hides its decorative blocks from assistive technology', () => {
    const { container } = render(<PageSkeleton variant="list" />);
    const decorative = container.querySelectorAll('[aria-hidden="true"]');
    expect(decorative.length).toBeGreaterThan(0);
  });
});
