import { act, renderHook } from '@testing-library/react';
import { useGlobalPresence } from './useGlobalPresence';
import { getSupabaseClient } from '../lib/supabase';
import { makeFakeRealtimeClient } from '../lib/realtime-recovery.test-utils';
import { useSessionStore } from '../store/session-store';
import { useUiStore } from '../store/ui-store';

jest.mock('../lib/supabase', () => ({ getSupabaseClient: jest.fn() }));

describe('useGlobalPresence', () => {
  beforeEach(() => {
    useUiStore.setState({ liveMembers: [], networkStatus: 'connected', realtimeRetry: null });
  });

  it('demo mode publishes the mock roster with the current user first and a healthy status', () => {
    useSessionStore.setState({ demoMode: true, userId: 'usr-local-marie', userName: 'Marie D.', avatar: 'MA' });
    renderHook(() => useGlobalPresence());
    const state = useUiStore.getState();
    expect(state.liveMembers.length).toBeGreaterThanOrEqual(2);
    expect(state.liveMembers[0].name).toBe('Marie D.');
    expect(state.networkStatus).toBe('connected');
  });

  it('with no Supabase client, shows only yourself and offline', () => {
    (getSupabaseClient as jest.Mock).mockReturnValue(null);
    useSessionStore.setState({ demoMode: false, userId: 'u1', userName: 'Solo', avatar: 'SO' });
    renderHook(() => useGlobalPresence());
    const state = useUiStore.getState();
    expect(state.liveMembers).toHaveLength(1);
    expect(state.liveMembers[0].userId).toBe('u1');
    expect(state.networkStatus).toBe('offline');
  });

  it('with no userId (guest), publishes an empty roster and offline', () => {
    (getSupabaseClient as jest.Mock).mockReturnValue(null);
    useSessionStore.setState({ demoMode: false, userId: null, userName: '', avatar: '--' });
    renderHook(() => useGlobalPresence());
    const state = useUiStore.getState();
    expect(state.liveMembers).toEqual([]);
    expect(state.networkStatus).toBe('offline');
  });

  describe('with a live realtime channel', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      useSessionStore.setState({ demoMode: false, userId: 'u1', userName: 'Solo', avatar: 'SO' });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('publishes the roster and a healthy status once subscribed', () => {
      const { client, created } = makeFakeRealtimeClient();
      (getSupabaseClient as jest.Mock).mockReturnValue(client);

      renderHook(() => useGlobalPresence());
      act(() => {
        created[0].presenceState.mockReturnValue({
          u1: [{ userId: 'u1', name: 'Solo', avatar: 'SO', color: '#000', onlineSince: 1 }],
        });
        created[0].emit('SUBSCRIBED');
        created[0].syncPresence();
      });

      expect(created[0].track).toHaveBeenCalled();
      expect(useUiStore.getState().networkStatus).toBe('connected');
      expect(useUiStore.getState().liveMembers).toHaveLength(1);
    });

    // Le bug d'origine : un canal CLOSED est mort pour realtime-js, la pastille restait
    // sur « Temps réel interrompu » jusqu'au rechargement de la page.
    it('recovers on its own after the channel dies, with no page reload', () => {
      const { client, created } = makeFakeRealtimeClient();
      (getSupabaseClient as jest.Mock).mockReturnValue(client);

      renderHook(() => useGlobalPresence());
      act(() => created[0].emit('SUBSCRIBED'));
      expect(useUiStore.getState().networkStatus).toBe('connected');

      act(() => created[0].emit('CLOSED'));
      expect(useUiStore.getState().networkStatus).toBe('degraded');

      act(() => {
        jest.advanceTimersByTime(1_000);
      });
      expect(created).toHaveLength(2);

      act(() => created[1].emit('SUBSCRIBED'));
      expect(useUiStore.getState().networkStatus).toBe('connected');
    });

    it('publishes a manual retry for the network pill, and withdraws it on unmount', () => {
      const { client, created } = makeFakeRealtimeClient();
      (getSupabaseClient as jest.Mock).mockReturnValue(client);

      const { unmount } = renderHook(() => useGlobalPresence());
      const retry = useUiStore.getState().realtimeRetry;
      expect(retry).toEqual(expect.any(Function));

      act(() => created[0].emit('CHANNEL_ERROR'));
      act(() => retry?.());
      expect(created).toHaveLength(2);

      unmount();
      expect(useUiStore.getState().realtimeRetry).toBeNull();
    });
  });
});
