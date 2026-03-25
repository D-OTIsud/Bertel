import { fireEvent, render, screen } from '@testing-library/react';
import { ObjectDrawer } from './ObjectDrawer';
import { useObjectDrawerStore } from '../../store/object-drawer-store';
import { useSessionStore } from '../../store/session-store';
import { useUiStore } from '../../store/ui-store';

const mockUseObjectDetailQuery = jest.fn();

jest.mock('../../hooks/useExplorerQueries', () => ({
  useObjectDetailQuery: (...args: unknown[]) => mockUseObjectDetailQuery(...args),
}));

jest.mock('../../hooks/usePresenceRoom', () => ({
  usePresenceRoom: () => ({
    peers: [],
    me: { userId: 'me', name: 'Me', avatar: 'ME', color: '#000' },
    lockedFields: {},
    typingUsers: [],
    lockField: jest.fn(),
    unlockField: jest.fn(),
    announceTyping: jest.fn(),
  }),
}));

describe('ObjectDrawer drafts', () => {
  beforeEach(() => {
    useUiStore.setState({ drawerObjectId: 'obj-1' });
    // mode must be 'edit' for these tests — they assert on form inputs in the edit panels
    useObjectDrawerStore.setState({ activeSection: 'general', mode: 'edit', draftsByObject: {} });
    useSessionStore.setState({ role: 'tourism_agent', status: 'ready' });
    mockUseObjectDetailQuery.mockClear();
  });

  it('does not overwrite a local draft when the same object refetches', () => {
    mockUseObjectDetailQuery.mockReturnValue({
      data: { id: 'obj-1', name: 'Hotel A', raw: { description: 'Initial description' } },
      isLoading: false,
      isError: false,
      error: null,
    });

    const { rerender } = render(<ObjectDrawer objectId="obj-1" />);

    const nameInput = screen.getByDisplayValue('Hotel A');
    fireEvent.change(nameInput, { target: { value: 'Hotel A Draft' } });
    expect(screen.getByDisplayValue('Hotel A Draft')).toBeInTheDocument();

    mockUseObjectDetailQuery.mockReturnValue({
      data: { id: 'obj-1', name: 'Hotel A Refetched', raw: { description: 'Server update' } },
      isLoading: false,
      isError: false,
      error: null,
    });

    rerender(<ObjectDrawer objectId="obj-1" />);

    expect(screen.getByDisplayValue('Hotel A Draft')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Hotel A Refetched')).not.toBeInTheDocument();
  });

  it('resets the draft when switching to another object', () => {
    mockUseObjectDetailQuery.mockReturnValue({
      data: { id: 'obj-1', name: 'Hotel A', raw: { description: 'Initial description' } },
      isLoading: false,
      isError: false,
      error: null,
    });

    const { rerender } = render(<ObjectDrawer objectId="obj-1" />);
    fireEvent.change(screen.getByDisplayValue('Hotel A'), { target: { value: 'Hotel A Draft' } });

    mockUseObjectDetailQuery.mockReturnValue({
      data: { id: 'obj-2', name: 'Restaurant B', raw: { description: 'Fresh record' } },
      isLoading: false,
      isError: false,
      error: null,
    });

    rerender(<ObjectDrawer objectId="obj-2" />);

    expect(screen.getByDisplayValue('Restaurant B')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Hotel A Draft')).not.toBeInTheDocument();
  });
});