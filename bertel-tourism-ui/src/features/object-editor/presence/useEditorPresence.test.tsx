import { act, renderHook } from '@testing-library/react';
import { useEditorPresence } from './useEditorPresence';
import { usePresenceRoom } from '../../../hooks/usePresenceRoom';
import { useSessionStore } from '../../../store/session-store';
import type { EditorPeer } from './editor-presence';

jest.mock('../../../hooks/usePresenceRoom');
const mockUsePresenceRoom = usePresenceRoom as jest.MockedFunction<typeof usePresenceRoom>;

const broadcastSpy = jest.fn();
const selfId = '00000000-0000-4000-a000-00000000ae11';
const peerId = '00000000-0000-4000-a000-00000000ae12';
let lastOptions: { trackExtra?: unknown; onEvent?: (event: string, payload: unknown) => void } | undefined;

const peer = (over: Partial<EditorPeer> & { userId: string }): EditorPeer => ({
  name: over.userId,
  avatar: '',
  color: '#000',
  ...over,
});

function setRoom(peers: EditorPeer[]) {
  mockUsePresenceRoom.mockImplementation(((_roomKey: string, options?: typeof lastOptions) => {
    lastOptions = options;
    return {
      peers,
      me: peer({ userId: 'me' }),
      lockedFields: {},
      typingUsers: [],
      lockField: jest.fn(),
      unlockField: jest.fn(),
      announceTyping: jest.fn(),
      broadcast: broadcastSpy,
    };
  }) as unknown as typeof usePresenceRoom);
}

describe('useEditorPresence', () => {
  beforeEach(() => {
    broadcastSpy.mockClear();
    lastOptions = undefined;
    useSessionStore.setState({ userId: selfId, userName: 'Moi', demoMode: false, status: 'ready',
      role: 'tourism_agent', isTestRealm: false, orgId: 'ORGRUN999999AR01', isSandboxDiscovery: false,
      authAuthority: { userId: selfId, epoch: 1, hydrated: true } });
    setRoom([]);
  });

  it('derives the roster and the per-section groups from the room peers', () => {
    setRoom([
      peer({ userId: selfId, name: 'Moi', activeSection: '01' }),
      peer({ userId: 'u1', name: 'Sarah', activeSection: '06' }),
    ]);
    const { result } = renderHook(() =>
      useEditorPresence({ objectId: 'o1', activeSection: '01', dirtySections: {} }),
    );

    expect(result.current.roster.map((r) => r.userId)).toEqual([selfId, 'u1']);
    expect(result.current.peersBySection['06'].map((p) => p.userId)).toEqual(['u1']);
  });

  it('publishes the active section and editing flag via trackExtra', () => {
    renderHook(() =>
      useEditorPresence({ objectId: 'o1', activeSection: '06', dirtySections: { pricing: true } }),
    );

    expect(lastOptions?.trackExtra).toEqual({ activeSection: '06', editing: true });
  });

  it('broadcastSaved emits an object:saved event carrying the current user', () => {
    const { result } = renderHook(() =>
      useEditorPresence({ objectId: 'o1', activeSection: '01', dirtySections: {} }),
    );

    act(() => result.current.broadcastSaved());

    expect(broadcastSpy).toHaveBeenCalledTimes(1);
    const [event, payload] = broadcastSpy.mock.calls[0];
    expect(event).toBe('object:saved');
    expect(payload).toEqual({ userId: selfId, objectId: 'o1', name: 'Moi', at: expect.any(Number) });
  });

  it('surfaces a saved notice for a peer save and clears it on dismiss', () => {
    const { result } = renderHook(() =>
      useEditorPresence({ objectId: 'o1', activeSection: '01', dirtySections: {} }),
    );

    const at = Date.now();
    act(() => lastOptions?.onEvent?.('object:saved', { userId: peerId, objectId: 'o1', name: 'Sarah', at }));
    expect(result.current.savedNotice).toEqual({ name: 'Sarah', at });

    act(() => result.current.dismissSavedNotice());
    expect(result.current.savedNotice).toBeNull();
  });

  it('ignores an object:saved event coming from the current user', () => {
    const { result } = renderHook(() =>
      useEditorPresence({ objectId: 'o1', activeSection: '01', dirtySections: {} }),
    );

    act(() => lastOptions?.onEvent?.('object:saved', { userId: selfId, objectId: 'o1', name: 'Moi', at: Date.now() }));
    expect(result.current.savedNotice).toBeNull();
  });

  it('checks the exact object, payload and Auth generation before exposing an advisory', () => {
    const { result } = renderHook(() =>
      useEditorPresence({ objectId: 'o1', activeSection: '01', dirtySections: {} }),
    );
    const payload = { userId: peerId, objectId: 'o1', name: 'Sarah', at: Date.now() };
    act(() => lastOptions?.onEvent?.('object:saved', { ...payload, objectId: 'o2' }));
    act(() => lastOptions?.onEvent?.('object:saved', { ...payload, at: Infinity }));
    act(() => lastOptions?.onEvent?.('object:saved', { ...payload, name: 'A'.repeat(121) }));
    expect(result.current.savedNotice).toBeNull();
    act(() => lastOptions?.onEvent?.('object:saved', payload));
    expect(result.current.savedNotice).toEqual({ name: 'Sarah', at: payload.at });
    act(() => useSessionStore.getState().observeAuthUser(peerId));
    expect(result.current.savedNotice).toBeNull();
  });

  it('scatters mock editors onto sections in demo mode so badges are visible', () => {
    useSessionStore.setState({ userId: 'me', userName: 'Moi', demoMode: true });
    setRoom([
      peer({ userId: 'me', activeSection: '01' }),
      peer({ userId: 'u1', name: 'Jean' }),
      peer({ userId: 'u2', name: 'Lina' }),
    ]);

    const { result } = renderHook(() =>
      useEditorPresence({ objectId: 'o1', activeSection: '01', dirtySections: {} }),
    );

    const placed = Object.values(result.current.peersBySection).flat();
    expect(placed.map((p) => p.userId).sort()).toEqual(['u1', 'u2']);
  });

  it('does not synthesize sections for section-less peers outside demo mode', () => {
    setRoom([peer({ userId: selfId, activeSection: '01' }), peer({ userId: 'u1', name: 'Jean' })]);

    const { result } = renderHook(() =>
      useEditorPresence({ objectId: 'o1', activeSection: '01', dirtySections: {} }),
    );

    expect(result.current.peersBySection).toEqual({});
  });
});
