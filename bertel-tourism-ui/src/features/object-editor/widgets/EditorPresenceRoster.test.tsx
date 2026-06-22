import { render, screen } from '@testing-library/react';
import { EditorPresenceRoster } from './EditorPresenceRoster';
import type { RosterEntry } from '../presence/editor-presence';

const entry = (over: Partial<RosterEntry> & { userId: string }): RosterEntry => ({
  name: over.userId,
  avatar: '',
  color: '#000',
  isSelf: false,
  ...over,
});

describe('EditorPresenceRoster', () => {
  it('renders nothing when the user is alone', () => {
    const { container } = render(
      <EditorPresenceRoster roster={[entry({ userId: 'me', isSelf: true })]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders an avatar per member and the live count', () => {
    render(
      <EditorPresenceRoster
        roster={[
          entry({ userId: 'me', name: 'Marie Astor', isSelf: true }),
          entry({ userId: 'u1', name: 'Sarah Durand' }),
        ]}
      />,
    );
    expect(screen.getByText('MA')).toBeInTheDocument();
    expect(screen.getByText('SD')).toBeInTheDocument();
    expect(screen.getByText(/2 live/i)).toBeInTheDocument();
  });

  it('flags the current user in the avatar title', () => {
    render(
      <EditorPresenceRoster
        roster={[
          entry({ userId: 'me', name: 'Marie Astor', isSelf: true }),
          entry({ userId: 'u1', name: 'Sarah Durand' }),
        ]}
      />,
    );
    expect(screen.getByTitle(/Marie Astor.*Vous/i)).toBeInTheDocument();
  });
});
