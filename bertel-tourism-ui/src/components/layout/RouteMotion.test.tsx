import { render, screen } from '@testing-library/react';
import { RouteMotion } from './RouteMotion';

let mockPathname = '/explorer';
jest.mock('next/navigation', () => ({ usePathname: () => mockPathname }));

describe('RouteMotion', () => {
  it('wraps children in a motion-page-enter div keyed by the current pathname', () => {
    render(
      <RouteMotion>
        <div>Explorer content</div>
      </RouteMotion>,
    );
    expect(screen.getByText('Explorer content').closest('.motion-page-enter')).toBeInTheDocument();
  });

  it('preserves the full-height flex chain required by routed workspaces', () => {
    render(
      <RouteMotion>
        <div>Full-height content</div>
      </RouteMotion>,
    );

    const wrapper = screen.getByText('Full-height content').closest('.motion-page-enter');
    expect(wrapper).toHaveClass('flex', 'h-full', 'min-h-0', 'w-full', 'min-w-0', 'flex-col');
  });

  it('renders new content when the pathname changes (remount, not a stale wrapper)', () => {
    const { rerender } = render(
      <RouteMotion>
        <div>Explorer content</div>
      </RouteMotion>,
    );
    mockPathname = '/dashboard';
    rerender(
      <RouteMotion>
        <div>Dashboard content</div>
      </RouteMotion>,
    );
    expect(screen.getByText('Dashboard content')).toBeInTheDocument();
    expect(screen.queryByText('Explorer content')).not.toBeInTheDocument();
  });
});
