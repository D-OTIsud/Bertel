import { act, renderHook } from '@testing-library/react';
import { useGlobalPresence } from './useGlobalPresence';
import { getSupabaseClient } from '../lib/supabase';
import { makeFakeRealtimeClient } from '../lib/realtime-recovery.test-utils';
import { useSessionStore } from '../store/session-store';
import { useUiStore } from '../store/ui-store';

jest.mock('../lib/supabase', () => ({ getSupabaseClient: jest.fn() }));

const selfId = '00000000-0000-4000-a000-00000000ae11';
const otherId = '00000000-0000-4000-a000-00000000ae12';
function liveSession() {
  useSessionStore.setState({ demoMode: false, role: 'tourism_agent', status: 'ready', isTestRealm: false,
    orgId: 'ORGRUN999999AR01', isSandboxDiscovery: false, userId: selfId, userName: 'Solo', avatar: 'SO',
    authAuthority: { userId: selfId, epoch: 1, hydrated: true } });
}

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
    liveSession();
    renderHook(() => useGlobalPresence());
    const state = useUiStore.getState();
    expect(state.liveMembers).toHaveLength(1);
    expect(state.liveMembers[0].userId).toBe(selfId);
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
      liveSession();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('publishes the roster and a healthy status once subscribed', () => {
      const { client, created } = makeFakeRealtimeClient();
      (getSupabaseClient as jest.Mock).mockReturnValue(client);

      renderHook(() => useGlobalPresence());
      expect(client.channel).toHaveBeenCalledWith('presence:global:prod', {
        config: { private: true, presence: { key: selfId } },
      });
      act(() => {
        created[0].presenceState.mockReturnValue({
          [selfId]: [{ userId: selfId, name: 'Solo', avatar: 'SO', color: '#000000', onlineSince: 1 }],
          [otherId]: [{ userId: selfId, name: 123 }],
        });
        created[0].emit('SUBSCRIBED');
        created[0].syncPresence();
      });

      expect(created[0].track).toHaveBeenCalled();
      expect(useUiStore.getState().networkStatus).toBe('connected');
      expect(useUiStore.getState().liveMembers).toHaveLength(1);
    });

    it('clears the old roster during Auth hydration and rejoins only the current realm and persona', () => {
      const { client, created } = makeFakeRealtimeClient();
      (getSupabaseClient as jest.Mock).mockReturnValue(client);
      renderHook(() => useGlobalPresence());
      act(() => {
        created[0].emit('SUBSCRIBED');
        useSessionStore.getState().observeAuthUser(otherId);
        expect(useSessionStore.getState().userId).toBe(selfId);
        expect(useUiStore.getState().liveMembers).toEqual([]);
        created[0].presenceState.mockReturnValue({ [selfId]: [{ userId: selfId, name: 'Old roster' }] });
        created[0].syncPresence();
      });
      expect(useUiStore.getState().liveMembers).toEqual([]);
      expect(created).toHaveLength(1);
      act(() => useSessionStore.setState({ userId: otherId, isTestRealm: true,
        authAuthority: { userId: otherId, epoch: 2, hydrated: true } }));
      expect(created.map((channel) => channel.topic)).toEqual(['presence:global:prod', 'presence:global:test']);
      act(() => {
        created[1].presenceState.mockReturnValue({ [selfId]: [{ userId: selfId, name: 'Ancien salon' }] });
        client.routePresence('presence:global:test');
      });
      expect(useUiStore.getState().liveMembers.map((member) => member.userId)).toEqual([otherId]);
      act(() => {
        created[1].emit('SUBSCRIBED');
        created[1].presenceState.mockReturnValue({ [otherId]: [{ userId: otherId, name: 'Membre courant' }] });
        client.routePresence('presence:global:test');
      });
      expect(useUiStore.getState().liveMembers.map((member) => member.name)).toEqual(['Membre courant']);
      act(() => useSessionStore.setState({ role: 'actor' }));
      expect(useUiStore.getState().liveMembers).toEqual([]);
      expect(client.removeChannel).toHaveBeenCalledWith(created[1]);
      expect(created).toHaveLength(2);
    });

    it('requires a verified organization for agents while keeping privileged back-office personas eligible', () => {
      const { client, created } = makeFakeRealtimeClient();
      (getSupabaseClient as jest.Mock).mockReturnValue(client);
      useSessionStore.setState({ orgId: null });
      renderHook(() => useGlobalPresence());
      expect(created).toHaveLength(0);
      act(() => useSessionStore.setState({ role: 'owner' }));
      expect(created).toHaveLength(1);
      act(() => useSessionStore.setState({ isSandboxDiscovery: true }));
      expect(client.removeChannel).toHaveBeenCalledWith(created[0]);
      expect(useUiStore.getState().liveMembers).toEqual([]);
      act(() => useSessionStore.setState({ role: 'super_admin', isSandboxDiscovery: false }));
      expect(created).toHaveLength(2);
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
