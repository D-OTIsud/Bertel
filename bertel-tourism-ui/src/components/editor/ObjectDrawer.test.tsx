import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ObjectDrawer } from './ObjectDrawer';
import { useObjectDrawerStore } from '../../store/object-drawer-store';
import { useUiStore } from '../../store/ui-store';

const mockUseObjectDetailQuery = vi.fn();

vi.mock('../../hooks/useExplorerQueries', () => ({
  useObjectDetailQuery: (...args: unknown[]) => mockUseObjectDetailQuery(...args),
}));

vi.mock('../../hooks/usePresenceRoom', () => ({
  usePresenceRoom: () => ({
    peers: [],
    me: { userId: 'me', name: 'Me', avatar: 'ME', color: '#000' },
    lockedFields: {},
    typingUsers: [],
    lockField: vi.fn(),
    unlockField: vi.fn(),
    announceTyping: vi.fn(),
  }),
}));

describe('ObjectDrawer drafts', () => {
  beforeEach(() => {
    useUiStore.setState({ drawerObjectId: 'obj-1' });
    useObjectDrawerStore.setState({ activeSection: 'general', draftsByObject: {} });
    mockUseObjectDetailQuery.mockReset();
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