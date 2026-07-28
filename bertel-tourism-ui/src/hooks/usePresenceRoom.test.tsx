import { act, renderHook } from '@testing-library/react';
import { PRESENCE_LOCK_TTL_MS, usePresenceRoom } from './usePresenceRoom';
import { getSupabaseClient } from '../lib/supabase';
import { makeFakeRealtimeClient } from '../lib/realtime-recovery.test-utils';
import { useSessionStore } from '../store/session-store';

jest.mock('../lib/supabase', () => ({ getSupabaseClient: jest.fn() }));

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

  it('merges trackExtra into the tracked self member', () => {
    const { result } = renderHook(() =>
      usePresenceRoom('room:test', { enabled: true, trackExtra: { activeSection: '06', editing: true } }),
    );

    expect(result.current.me.activeSection).toBe('06');
    expect(result.current.me.editing).toBe(true);
  });

  it('exposes a broadcast that is a safe no-op in demo mode', async () => {
    const { result } = renderHook(() => usePresenceRoom('room:test', { enabled: true }));

    await act(async () => {
      await result.current.broadcast('object:saved', { userId: 'x', name: 'X', at: 1 });
    });

    expect(typeof result.current.broadcast).toBe('function');
  });

  // Même défaut que la présence globale : un canal CLOSED est mort pour realtime-js.
  // Sans reconstruction, la présence et les verrous de champ s'éteignent en silence au
  // milieu d'une session d'édition — il n'y a aucune pastille pour le signaler ici.
  it('rebuilds the room after the channel dies, and routes sends to the new channel', async () => {
    const { client, created } = makeFakeRealtimeClient();
    (getSupabaseClient as jest.Mock).mockReturnValue(client);
    useSessionStore.setState({ demoMode: false, userId: 'u1', userName: 'Solo', avatar: 'SO' });

    const { result } = renderHook(() => usePresenceRoom('room:test', { enabled: true }));
    act(() => created[0].emit('SUBSCRIBED'));
    expect(created[0].track).toHaveBeenCalled();

    act(() => created[0].emit('CLOSED'));
    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(created).toHaveLength(2);

    act(() => created[1].emit('SUBSCRIBED'));
    expect(created[1].track).toHaveBeenCalled();

    await act(async () => {
      await result.current.lockField('description');
    });
    expect(created[1].send).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'field:lock', payload: expect.objectContaining({ field: 'description' }) }),
    );
    expect(created[0].send).not.toHaveBeenCalled();
  });
});