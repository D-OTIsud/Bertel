import { act, render, renderHook } from '@testing-library/react';
import { PRESENCE_LOCK_TTL_MS, usePresenceRoom } from './usePresenceRoom';
import { getSupabaseClient } from '../lib/supabase';
import { makeFakeRealtimeClient } from '../lib/realtime-recovery.test-utils';
import { useSessionStore } from '../store/session-store';
import { useEditorPresence } from '../features/object-editor/presence/useEditorPresence';
import { PresenceRail } from '../features/object-editor/widgets/PresenceRail';

jest.mock('../lib/supabase', () => ({ getSupabaseClient: jest.fn() }));

const objectRoom = 'room:HOTRUN999999AR01';
const writer = '00000000-0000-4000-a000-00000000ae11';
const other = '00000000-0000-4000-a000-00000000ae12';
function liveSession() {
  useSessionStore.setState({ demoMode: false, userId: writer, userName: 'Solo', avatar: 'SO',
    canEditObjects: true, isTestRealm: false, orgId: 'ORGRUN999999AR01', isSandboxDiscovery: false,
    authAuthority: { userId: writer, epoch: 1, hydrated: true } });
}

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
    liveSession();

    const { result } = renderHook(() => usePresenceRoom(objectRoom));
    expect(client.channel).toHaveBeenCalledWith(objectRoom, expect.objectContaining({
      config: expect.objectContaining({ private: true, presence: { key: writer } }),
    }));
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

  it('ignores malformed locks, protects the claimant on unlock and discards callbacks during Auth hydration', async () => {
    const { client, created } = makeFakeRealtimeClient();
    (getSupabaseClient as jest.Mock).mockReturnValue(client);
    liveSession();
    const { result } = renderHook(() => usePresenceRoom(objectRoom));
    act(() => created[0].emit('SUBSCRIBED'));
    act(() => created[0].broadcastEvent('field:lock', { field: null, userId: null, name: 123 }));
    expect(result.current.lockedFields).toEqual({});
    act(() => created[0].broadcastEvent('field:lock', { field: 'name', userId: writer, name: 'Solo' }));
    act(() => created[0].broadcastEvent('field:unlock', { field: 'name', userId: other }));
    expect(result.current.lockedFields.name?.userId).toBe(writer);
    act(() => created[0].broadcastEvent('field:unlock', { field: 'name', userId: writer }));
    expect(result.current.lockedFields).toEqual({});
    act(() => created[0].broadcastEvent('field:lock', { field: 'name', userId: writer, name: 'Solo' }));
    act(() => jest.advanceTimersByTime(PRESENCE_LOCK_TTL_MS + 50));
    expect(result.current.lockedFields).toEqual({});
    act(() => {
      useSessionStore.getState().observeAuthUser(other);
      expect(useSessionStore.getState().userId).toBe(writer);
      created[0].broadcastEvent('field:lock', { field: 'name', userId: writer, name: 'Solo' });
    });
    expect(result.current.lockedFields).toEqual({});
    await act(async () => result.current.broadcast('object:saved', {}));
    expect(created[0].send).not.toHaveBeenCalled();
    expect(client.removeChannel).toHaveBeenCalledWith(created[0]);
    expect(created).toHaveLength(1);
  });

  it('joins CRM presence only for an eligible current persona and its own realm', () => {
    const { client, created } = makeFakeRealtimeClient();
    (getSupabaseClient as jest.Mock).mockReturnValue(client);
    liveSession();
    useSessionStore.setState({ isTestRealm: true, canEditObjects: false });
    renderHook(() => usePresenceRoom('crm:tasks'));
    expect(created).toHaveLength(0);
    act(() => useSessionStore.setState({ canEditObjects: true }));
    expect(client.channel).toHaveBeenCalledWith('crm:tasks:test', expect.objectContaining({
      config: expect.objectContaining({ private: true }),
    }));
    expect(created[0].bindings).toEqual(['presence']);
    act(() => useSessionStore.setState({ role: 'owner' }));
    expect(client.removeChannel).toHaveBeenCalledWith(created[0]);
    expect(created).toHaveLength(1);
  });

  it('shares the editor and drawer channel through independent unmounts and an Auth replacement', () => {
    const { client, created } = makeFakeRealtimeClient();
    (getSupabaseClient as jest.Mock).mockReturnValue(client);
    liveSession();
    // Rail/preview use the plain room hook. In React their effects can run before the editor's.
    const objectId = objectRoom.slice('room:'.length);
    const rail = render(<PresenceRail objectId={objectId} />);
    const editor = renderHook(() => useEditorPresence({ objectId, activeSection: '06', dirtySections: { pricing: true } }));
    const [first] = created;
    expect(created).toHaveLength(1);
    expect(first.subscribe).toHaveBeenCalledTimes(1);
    expect(first.bindings.filter((type) => type === 'presence')).toHaveLength(1);
    const previousSend = editor.result.current.broadcastSaved;

    act(() => {
      first.emit('SUBSCRIBED');
      first.presenceState.mockReturnValue({ [other]: [{ userId: other, name: 'Collègue', activeSection: '07' }] });
      first.syncPresence();
    });
    expect(first.track).toHaveBeenLastCalledWith(expect.objectContaining({ activeSection: '06', editing: true }));
    expect(rail.getByText('Collègue')).toBeInTheDocument();
    expect(editor.result.current.peersBySection['07'][0].userId).toBe(other);
    act(previousSend);
    expect(first.send).toHaveBeenCalledWith(expect.objectContaining({ event: 'object:saved' }));

    rail.unmount();
    expect(client.removeChannel).not.toHaveBeenCalled();
    const preview = renderHook(() => usePresenceRoom(objectRoom));
    expect(first.subscribe).toHaveBeenCalledTimes(1);
    expect(first.bindings.filter((type) => type === 'presence')).toHaveLength(1);
    expect(preview.result.current.peers.map((member) => member.userId)).toEqual([other]);
    act(() => {
      first.broadcastEvent('object:saved', { objectId, userId: other, name: 'Collègue', at: Date.now() });
    });
    expect(editor.result.current.savedNotice?.name).toBe('Collègue');

    act(() => useSessionStore.getState().observeAuthUser(other));
    expect(editor.result.current.savedNotice).toBeNull();
    expect(preview.result.current.peers).toEqual([]);
    expect(client.removeChannel).toHaveBeenCalledTimes(1);
    act(() => useSessionStore.setState({ userId: other, userName: 'Autre',
      authAuthority: { userId: other, epoch: 2, hydrated: true } }));
    expect(created).toHaveLength(2);
    const next = created[1];
    const staleEvent = { objectId, userId: writer, name: 'Avant le nouveau join', at: Date.now() };
    act(() => {
      next.presenceState.mockReturnValue({ [writer]: [{ userId: writer, name: 'Ancien salon' }] });
      client.routePresence(objectRoom);
      client.routeBroadcast(objectRoom, 'object:saved', staleEvent);
    });
    expect(preview.result.current.peers).toEqual([]);
    expect(editor.result.current.savedNotice).toBeNull();
    act(() => next.emit('SUBSCRIBED'));
    expect(next.subscribe).toHaveBeenCalledTimes(1);
    expect(next.track).toHaveBeenLastCalledWith(expect.objectContaining({ userId: other, activeSection: '06' }));
    const latePreview = renderHook(() => usePresenceRoom(objectRoom));
    expect(latePreview.result.current.peers).toEqual([]);
    latePreview.unmount();
    act(() => {
      next.presenceState.mockReturnValue({ [writer]: [{ userId: writer, name: 'Présence confirmée' }] });
      client.routePresence(objectRoom);
      client.routeBroadcast(objectRoom, 'object:saved', { ...staleEvent, name: 'Après le nouveau join' });
    });
    expect(preview.result.current.peers.map((member) => member.name)).toEqual(['Présence confirmée']);
    expect(editor.result.current.savedNotice?.name).toBe('Après le nouveau join');
    act(previousSend);
    expect(next.send).not.toHaveBeenCalled();
    act(editor.result.current.broadcastSaved);
    expect(next.send).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ userId: other }) }));

    editor.unmount();
    expect(client.removeChannel).toHaveBeenCalledTimes(1);
    act(() => {
      next.presenceState.mockReturnValue({ [writer]: [{ userId: writer, name: 'Premier' }] });
      next.syncPresence();
    });
    expect(preview.result.current.peers.map((member) => member.userId)).toEqual([writer]);
    preview.unmount();
    expect(client.removeChannel).toHaveBeenCalledTimes(2);
  });
});
