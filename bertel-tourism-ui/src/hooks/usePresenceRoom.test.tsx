import { act, renderHook } from '@testing-library/react';
import { PRESENCE_LOCK_TTL_MS, usePresenceRoom } from './usePresenceRoom';
import { useSessionStore } from '../store/session-store';

describe('usePresenceRoom', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useSessionStore.setState({
      demoMode: true,
      userId: 'usr-local-marie',
      userName: 'Marie D.',
      avatar: 'MA',
      role: 'tourism_agent',
      status: 'ready',
      langPrefs: ['fr'],
      errorMessage: null,
    });
  });

  it('expires local demo locks automatically', async () => {
    const { result } = renderHook(() => usePresenceRoom('room:test', { enabled: true }));

    await act(async () => {
      await result.current.lockField('description');
    });

    expect(result.current.lockedFields.description?.userId).toBe('usr-local-marie');

    await act(async () => {
      jest.advanceTimersByTime(PRESENCE_LOCK_TTL_MS + 50);
    });

    expect(result.current.lockedFields.description).toBeUndefined();
  });
});