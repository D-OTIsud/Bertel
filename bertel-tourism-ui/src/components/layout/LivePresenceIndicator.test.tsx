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
});
