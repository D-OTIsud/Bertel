import { render, screen } from '@testing-library/react';
import { PresenceRail } from './PresenceRail';

jest.mock('../../../hooks/usePresenceRoom', () => ({
  usePresenceRoom: () => ({
    peers: [{ userId: 'u1', name: 'Florence G', avatar: '', color: '#176b6a' }],
    typingUsers: [],
  }),
}));

describe('PresenceRail', () => {
  it('renders live peers from the presence room', () => {
    render(<PresenceRail objectId="o1" />);
    expect(screen.getByText('Florence G')).toBeInTheDocument();
  });
});
