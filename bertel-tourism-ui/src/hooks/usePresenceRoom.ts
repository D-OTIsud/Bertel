import { useEffect, useMemo, useRef, useState } from 'react';
import { mockPresence } from '../data/mock';
import { getSupabaseClient } from '../lib/supabase';
import { joinRealtimeRoom } from '../lib/realtime-room';
import {
  realtimeField, realtimeRealm, realtimeRecord, realtimeScopeKey, realtimeText, realtimeUserId,
} from '../lib/realtime-scope';
import { useSessionStore } from '../store/session-store';
import type { FieldLock, PresenceMember } from '../types/domain';

interface UsePresenceRoomOptions<TExtra extends Record<string, unknown> = Record<string, never>> {
  enabled?: boolean;
  /**
   * Extra presence payload merged into the tracked self member (e.g. the editor's active
   * section / editing flag). Re-tracked on change WITHOUT resubscribing the channel. Keep it
   * referentially stable in the caller (memoise) so it only re-tracks when values change.
   */
  trackExtra?: TExtra;
  /**
   * Custom broadcast event names to listen for on this room (e.g. ['object:saved']).
   * Must be referentially stable across renders (defined as a module constant).
   */
  subscribeEvents?: readonly string[];
  /** Called for each incoming custom broadcast registered via `subscribeEvents`. */
  onEvent?: (event: string, payload: unknown) => void;
}

interface LockEntry extends FieldLock {
  expiresAt: number;
}

export const PRESENCE_LOCK_TTL_MS = 15000;
const demoPalette = ['#ff7b54', '#4cb3ff', '#78c67a', '#ffbd59'];
const objectRoomShape = /^room:[A-Z]{3}[A-Z0-9]{13}$/;

export function usePresenceRoom<TExtra extends Record<string, unknown> = Record<string, never>>(
  roomKey: string,
  options: UsePresenceRoomOptions<TExtra> = {},
) {
  const { enabled = true, trackExtra, subscribeEvents, onEvent } = options;
  const userId = useSessionStore((state) => state.userId);
  const userName = useSessionStore((state) => state.userName);
  const avatar = useSessionStore((state) => state.avatar);
  const demoMode = useSessionStore((state) => state.demoMode);
  const scopeKey = useSessionStore(realtimeScopeKey);
  const realm = useSessionStore(realtimeRealm);
  const crmAllowed = useSessionStore((state) => state.canEditObjects && state.role !== 'owner');
  const crmRoom = roomKey === 'crm:tasks';
  const editor = trackExtra !== undefined;
  const contextKey = demoMode ? 'demo:' + roomKey : scopeKey === null ? null : scopeKey + ':' + roomKey;
  const [activeContext, setActiveContext] = useState<string | null>(null);
  const [peers, setPeers] = useState<(PresenceMember & Partial<TExtra>)[]>([]);
  const [lockedFieldEntries, setLockedFieldEntries] = useState<Record<string, LockEntry>>({});
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const roomRef = useRef<{ context: string; handle: ReturnType<typeof joinRealtimeRoom> } | null>(null);
  const typingTimers = useRef<Map<string, number>>(new Map());
  // Captured once when the editor mounts: when the current user opened this room.
  const sessionStartRef = useRef(Date.now());

  // Stable identity — the channel (re)subscribes only when this changes, NOT on every
  // trackExtra update (which would churn the realtime connection on each scroll).
  const meIdentity = useMemo<PresenceMember>(
    () => ({
      userId: userId ?? 'anonymous',
      name: userName || 'Utilisateur',
      avatar,
      color: demoPalette[0],
      onlineSince: sessionStartRef.current,
    }),
    [avatar, userId, userName],
  );

  // The full tracked/returned self member = identity + caller-supplied extra.
  const me = useMemo(
    () => ({ ...meIdentity, ...(trackExtra ?? {}) }) as PresenceMember & Partial<TExtra>,
    [meIdentity, trackExtra],
  );

  // Latest payload + callbacks read inside effects without forcing a resubscribe.
  const mePayloadRef = useRef(me);
  mePayloadRef.current = me;
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const subscribeEventsRef = useRef(subscribeEvents);
  subscribeEventsRef.current = subscribeEvents;

  useEffect(() => {
    const nextExpiry = Math.min(...Object.values(lockedFieldEntries).map((entry) => entry.expiresAt));
    if (!Number.isFinite(nextExpiry)) return;
    const timer = window.setTimeout(() => {
      setLockedFieldEntries((current) => Object.fromEntries(
        Object.entries(current).filter(([, entry]) => entry.expiresAt > Date.now()),
      ));
    }, Math.max(nextExpiry - Date.now(), 0) + 25);
    return () => window.clearTimeout(timer);
  }, [lockedFieldEntries]);

  useEffect(() => {
    setActiveContext(contextKey);
    setPeers([]);
    setLockedFieldEntries({});
    setTypingUsers([]);
    if (!enabled) return;

    const clearTyping = () => {
      typingTimers.current.forEach((timer) => window.clearTimeout(timer));
      typingTimers.current.clear();
    };

    if (demoMode) {
      const self = mePayloadRef.current;
      const otherPeers = mockPresence
        .filter((item) => item.userId !== self.userId)
        .slice(0, 2)
        // Stagger the mock editors a few minutes apart so the duration label has something to show.
        .map((item, index) => ({ ...item, onlineSince: sessionStartRef.current - (index + 1) * 7 * 60_000 }));
      const demoPeers = [self, ...otherPeers] as (PresenceMember & Partial<TExtra>)[];
      setPeers(demoPeers);
      return clearTyping;
    }

    const client = getSupabaseClient();
    if (!client || !userId || scopeKey === null || contextKey === null
      || (crmRoom ? !crmAllowed : !objectRoomShape.test(roomKey))) return;

    const handle = joinRealtimeRoom(client, crmRoom ? `crm:tasks:${realm}` : roomKey, scopeKey, userId, {
      editor,
      payload: () => mePayloadRef.current,
      onPresence: (state) => {
        const nextPeers = Object.values(state)
          .flat()
          .map((item, index) => ({
            ...item,
            color: item.color || demoPalette[index % demoPalette.length],
          })) as (PresenceMember & Partial<TExtra>)[];

        setPeers(nextPeers);
        setLockedFieldEntries((current) => {
          const liveUserIds = new Set(nextPeers.map((peer) => peer.userId));
          return Object.fromEntries(Object.entries(current).filter(([, entry]) => liveUserIds.has(entry.userId)));
        });
      },
      onBroadcast: (event, payload) => {
        if (event === 'object:saved') {
          if (subscribeEventsRef.current?.includes(event)) onEventRef.current?.(event, payload);
          return;
        }
        const claimed = realtimeRecord(payload);
        if (event === 'typing') {
          const nextUser = realtimeText(claimed?.name, 120);
          if (!nextUser || (!typingTimers.current.has(nextUser) && typingTimers.current.size >= 32)) return;
          setTypingUsers((current) => Array.from(new Set([...current, nextUser])));
          window.clearTimeout(typingTimers.current.get(nextUser));
          typingTimers.current.set(nextUser, window.setTimeout(() => {
            typingTimers.current.delete(nextUser);
            setTypingUsers((current) => current.filter((item) => item !== nextUser));
          }, 1600));
          return;
        }
        const field = realtimeField(claimed?.field);
        const userId = realtimeUserId(claimed?.userId);
        if (!field || !userId) return;
        if (event === 'field:unlock') {
          setLockedFieldEntries((current) => {
            if (!Object.hasOwn(current, field) || current[field].userId !== userId) return current;
            const copy = { ...current };
            delete copy[field];
            return copy;
          });
          return;
        }
        const name = realtimeText(claimed?.name, 120);
        if (!name) return;
        setLockedFieldEntries((current) => {
          const existing = Object.hasOwn(current, field) ? current[field] : undefined;
          if (existing && existing.expiresAt > Date.now() && existing.userId !== userId) return current;
          if (!existing && Object.keys(current).length >= 32) return current;
          return { ...current, [field]: { field, userId, name, expiresAt: Date.now() + PRESENCE_LOCK_TTL_MS } };
        });
      },
    });
    roomRef.current = { context: contextKey, handle };

    return () => {
      clearTyping();
      handle.dispose();
      roomRef.current = null;
    };
  }, [demoMode, enabled, editor, meIdentity, roomKey, userId, scopeKey, realm, crmRoom, crmAllowed, contextKey]);

  // Push presence-payload updates (active section / editing flag) without resubscribing.
  useEffect(() => {
    roomRef.current?.handle.updatePresence();
  }, [me]);

  const currentRoom = () => enabled && roomRef.current?.context === contextKey ? roomRef.current.handle : null;

  async function lockField(field: string) {
    if (!enabled || !realtimeField(field)) {
      return;
    }

    if (demoMode) {
      setLockedFieldEntries((current) => ({
        ...current,
        [field]: { field, userId: me.userId, name: me.name, expiresAt: Date.now() + PRESENCE_LOCK_TTL_MS },
      }));
      return;
    }

    if (crmRoom) return;
    await currentRoom()?.send('field:lock', { field, userId: me.userId, name: me.name });
  }

  async function unlockField(field: string) {
    if (!enabled || !realtimeField(field)) {
      return;
    }

    if (demoMode) {
      setLockedFieldEntries((current) => {
        const copy = { ...current };
        delete copy[field];
        return copy;
      });
      return;
    }

    if (crmRoom) return;
    await currentRoom()?.send('field:unlock', { field, userId: me.userId });
  }

  async function announceTyping() {
    if (!enabled) {
      return;
    }

    if (demoMode) {
      setTypingUsers(['Jean est en train d ecrire...']);
      window.clearTimeout(typingTimers.current.get('demo'));
      typingTimers.current.set('demo', window.setTimeout(() => setTypingUsers([]), 1000));
      return;
    }

    if (crmRoom) return;
    await currentRoom()?.send('typing', { name: me.name });
  }

  /** Send a custom broadcast event to the room (no-op in demo / when disabled). */
  async function broadcast(event: string, payload: unknown) {
    if (crmRoom || event !== 'object:saved') {
      return;
    }
    await currentRoom()?.send(event, payload);
  }

  const showRoom = enabled && contextKey !== null && activeContext === contextKey;
  const lockedFields = showRoom ? Object.fromEntries(
    Object.entries(lockedFieldEntries).map(([field, entry]) => [field, { field, userId: entry.userId, name: entry.name }]),
  ) : {};

  return {
    contextKey: showRoom ? contextKey : null,
    peers: showRoom ? peers : [],
    me,
    lockedFields,
    typingUsers: showRoom ? typingUsers : [],
    lockField,
    unlockField,
    announceTyping,
    broadcast,
  };
}
