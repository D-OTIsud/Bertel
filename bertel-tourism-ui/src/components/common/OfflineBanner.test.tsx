import { render, screen, act } from '@testing-library/react';
import { OfflineBanner } from './OfflineBanner';

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
}

describe('OfflineBanner', () => {
  afterEach(() => {
    setNavigatorOnline(true);
  });

  it('ne rend rien quand le navigateur est en ligne', () => {
    setNavigatorOnline(true);
    render(<OfflineBanner />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('affiche le bandeau quand le navigateur est hors ligne', () => {
    setNavigatorOnline(false);
    render(<OfflineBanner />);
    expect(screen.getByRole('status')).toHaveTextContent('Hors ligne');
  });

  it('réagit aux événements online/offline', () => {
    setNavigatorOnline(true);
    render(<OfflineBanner />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    act(() => {
      setNavigatorOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByRole('status')).toBeInTheDocument();

    act(() => {
      setNavigatorOnline(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
