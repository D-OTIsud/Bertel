import { act, render, screen } from '@testing-library/react';
import { OfflineBanner } from './OfflineBanner';

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
  window.dispatchEvent(new Event(value ? 'online' : 'offline'));
}

describe('OfflineBanner', () => {
  beforeEach(() => setOnline(true));

  it('renders nothing while online', () => {
    render(<OfflineBanner />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('stays mounted through the exit window after coming back online', () => {
    jest.useFakeTimers();
    render(<OfflineBanner />);
    act(() => setOnline(false));
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Hors ligne');

    act(() => setOnline(true));
    expect(screen.getByRole('status')).toBeInTheDocument(); // still mounted, exiting
    act(() => { jest.advanceTimersByTime(140); });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    jest.useRealTimers();
  });
});
