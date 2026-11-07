import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LivePresenceIndicator } from './LivePresenceIndicator';
import { useSessionStore } from '../../store/session-store';
import { useUiStore } from '../../store/ui-store';
import type { PresenceMember } from '../../types/domain';
import type { NetworkStatus } from '../../types/domain';

function seed(members: PresenceMember[], networkStatus: NetworkStatus = 'connected') {
  useUiStore.setState({ liveMembers: members, networkStatus });
}

describe('LivePresenceIndicator', () => {
  beforeEach(() => {
    useUiStore.setState({ realtimeRetry: null });
    useSessionStore.setState({ userId: 'me' });
    seed([{ userId: 'me', name: 'Marie', avatar: 'MA', color: '#ff7b54', onlineSince: Date.now() - 5 * 60_000 }]);
  });

  it('shows the live count in the trigger', () => {
    render(<LivePresenceIndicator />);
    expect(screen.getByRole('button', { name: /1 live/i })).toBeInTheDocument();
  });

  it('opens the panel on click and marks the current user', async () => {
    const user = userEvent.setup();
    seed([
      { userId: 'me', name: 'Marie', avatar: 'MA', color: '#ff7b54' },
      { userId: 'u2', name: 'Jean', avatar: 'JE', color: '#4cb3ff' },
    ]);
    render(<LivePresenceIndicator />);
    await user.click(screen.getByRole('button', { name: /2 live/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Marie · Vous')).toBeInTheDocument();
    expect(screen.getByText('Jean')).toBeInTheDocument();
  });

  it('opens on hover and closes on Escape', async () => {
    const user = userEvent.setup();
    render(<LivePresenceIndicator />);
    await user.hover(screen.getByRole('button', { name: /1 live/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('tells you when you are alone online', async () => {
    const user = userEvent.setup();
    render(<LivePresenceIndicator />);
    await user.click(screen.getByRole('button', { name: /1 live/i }));
    expect(screen.getByText('Vous êtes seul·e en ligne.')).toBeInTheDocument();
  });

  it('surfaces the offline label when the network is down', () => {
    seed([], 'offline');
    render(<LivePresenceIndicator />);
    expect(screen.getByText('Hors ligne')).toBeInTheDocument();
  });

  it('offers the reconnect button only while the connection is degraded', () => {
    const { unmount } = render(<LivePresenceIndicator />); // networkStatus = 'connected'
    expect(screen.queryByRole('button', { name: /reconnecter/i })).not.toBeInTheDocument();
    unmount();

    seed([], 'degraded');
    render(<LivePresenceIndicator />);
    expect(screen.getByText('Temps réel interrompu')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reconnecter/i })).toBeInTheDocument();
  });

  it('reconnects the realtime channel in place, without reloading the page', async () => {
    const user = userEvent.setup();
    const realtimeRetry = jest.fn();
    seed([], 'degraded');
    useUiStore.setState({ realtimeRetry });

    render(<LivePresenceIndicator />);
    await user.click(screen.getByRole('button', { name: /reconnecter/i }));

    expect(realtimeRetry).toHaveBeenCalledTimes(1);
  });

  it('falls back to a page reload when no realtime channel is mounted', async () => {
    const user = userEvent.setup();
    const reload = jest.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, reload } });

    try {
      seed([], 'offline');
      useUiStore.setState({ realtimeRetry: null });
      render(<LivePresenceIndicator />);
      await user.click(screen.getByRole('button', { name: /reconnecter/i }));
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });

  it('closes the panel when keyboard focus leaves it', async () => {
    const user = userEvent.setup();
    render(
      <>
        <LivePresenceIndicator />
        <button type="button">ailleurs</button>
      </>,
    );
    await user.tab(); // focus the indicator trigger -> onFocus opens the panel
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.tab(); // focus moves to the sibling button -> onBlur closes
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
