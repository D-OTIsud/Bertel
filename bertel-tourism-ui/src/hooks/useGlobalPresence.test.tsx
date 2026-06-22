import { renderHook } from '@testing-library/react';
import { useGlobalPresence } from './useGlobalPresence';
import { getSupabaseClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';
import { useUiStore } from '../store/ui-store';

jest.mock('../lib/supabase', () => ({ getSupabaseClient: jest.fn() }));

describe('useGlobalPresence', () => {
  beforeEach(() => {
    useUiStore.setState({ liveMembers: [], networkStatus: 'connected' });
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
});
