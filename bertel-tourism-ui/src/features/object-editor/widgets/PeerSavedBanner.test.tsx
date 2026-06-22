import { fireEvent, render, screen } from '@testing-library/react';
import { PeerSavedBanner } from './PeerSavedBanner';

describe('PeerSavedBanner', () => {
  it('renders nothing without a notice', () => {
    const { container } = render(
      <PeerSavedBanner notice={null} onReload={jest.fn()} onDismiss={jest.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('names the peer who saved and reloads on click', () => {
    const onReload = jest.fn();
    render(
      <PeerSavedBanner notice={{ name: 'Sarah', at: 1 }} onReload={onReload} onDismiss={jest.fn()} />,
    );
    expect(screen.getByText(/Sarah/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /recharger/i }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('dismisses on the close action', () => {
    const onDismiss = jest.fn();
    render(
      <PeerSavedBanner notice={{ name: 'Sarah', at: 1 }} onReload={jest.fn()} onDismiss={onDismiss} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /ignorer/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('exposes the banner as a status region', () => {
    render(
      <PeerSavedBanner notice={{ name: 'Sarah', at: 1 }} onReload={jest.fn()} onDismiss={jest.fn()} />,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
