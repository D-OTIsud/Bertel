import { useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { mockPresence } from '../data/mock';
import { getSupabaseClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';
import type { FieldLock, PresenceMember } from '../types/domain';

interface TrackPayload {
  userId: string;
  name: string;
  avatar: string;
  color: string;
  onlineSince: number;
}

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

export function usePresenceRoom<TExtra extends Record<string, unknown> = Record<string, never>>(
  roomKey: string,
  options: UsePresenceRoomOptions<TExtra> = {},
) {
  const { enabled = true, trackExtra, subscribeEvents, onEvent } = options;
  const userId = useSessionStore((state) => state.userId);
  const userName = useSessionStore((state) => state.userName);
  const avatar = useSessionStore((state) => state.avatar);
  const demoMode = useSessionStore((state) => state.demoMode);
  const [peers, setPeers] = useState<(PresenceMember & Partial<TExtra>)[]>([]);
  const [lockedFieldEntries, setLockedFieldEntries] = useState<Record<string, LockEntry>>({});
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const subscribedRef = useRef(false);
  const typingTimers = useRef<Record<string, number>>({});
  const lockExpiryTimerRef = useRef<number | null>(null);
  const demoLockTimersRef = useRef<Record<string, number>>({});
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
    const clearLockExpiryTimer = () => {
      if (lockExpiryTimerRef.current != null) {
        window.clearTimeout(lockExpiryTimerRef.current);
        lockExpiryTimerRef.current = null;
      }
    };

    const clearDemoLockTimers = () => {
      Object.values(demoLockTimersRef.current).forEach((timer) => window.clearTimeout(timer));
      demoLockTimersRef.current = {};
    };

    const scheduleLockSweep = (entries: Record<string, LockEntry>) => {
      clearLockExpiryTimer();
      const expiries = Object.values(entries)
        .map((entry) => entry.expiresAt)
        .filter((expiresAt) => expiresAt > Date.now());

      if (expiries.length === 0) {
        return;
      }

      const nextExpiry = Math.min(...expiries);
      lockExpiryTimerRef.current = window.setTimeout(() => {
        let nextSweepLocks: Record<string, LockEntry> | null = null;
        setLockedFieldEntries((current) => {
          const now = Date.now();
          const nextEntries = Object.entries(current).filter(([, entry]) => entry.expiresAt > now);
          const nextLocks = Object.fromEntries(nextEntries) as Record<string, LockEntry>;
          nextSweepLocks = nextLocks;
          return nextLocks;
        });
        if (nextSweepLocks !== null) {
          scheduleLockSweep(nextSweepLocks);
        }
      }, Math.max(nextExpiry - Date.now(), 0) + 25);
    };

    if (!enabled) {
      setPeers([]);
      setLockedFieldEntries({});
      setTypingUsers([]);
      clearLockExpiryTimer();
      clearDemoLockTimers();
      return undefined;
    }

    if (demoMode) {
      const self = mePayloadRef.current;
      const otherPeers = mockPresence
        .filter((item) => item.userId !== self.userId)
        .slice(0, 2)
        // Stagger the mock editors a few minutes apart so the duration label has something to show.
        .map((item, index) => ({ ...item, onlineSince: sessionStartRef.current - (index + 1) * 7 * 60_000 }));
      const demoPeers = [self, ...otherPeers] as (PresenceMember & Partial<TExtra>)[];
      setPeers(demoPeers);
      return () => {
        clearLockExpiryTimer();
        clearDemoLockTimers();
      };
    }

    const client = getSupabaseClient();
    if (!client || !userId) {
      setPeers(enabled ? [mePayloadRef.current] : []);
      return () => {
        clearLockExpiryTimer();
        clearDemoLockTimers();
      };
    }

    const channel = client.channel(roomKey, {
      config: {
        presence: { key: userId },
        broadcast: { self: false },
      },
    });

    channelRef.current = channel;

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<TrackPayload & Partial<TExtra>>();
      const nextPeers = Object.values(state)
        .flat()
        .map((item, index) => ({
          ...item,
          color: item.color || demoPalette[index % demoPalette.length],
        })) as (PresenceMember & Partial<TExtra>)[];

      setPeers(nextPeers);
      let nextLocksToSweep: Record<string, LockEntry> | null = null;
      setLockedFieldEntries((current) => {
        const liveUserIds = new Set(nextPeers.map((peer) => peer.userId));
        const nextEntries = Object.entries(current).filter(([, entry]) => liveUserIds.has(entry.userId));
        const nextLocks = Object.fromEntries(nextEntries) as Record<string, LockEntry>;
        nextLocksToSweep = nextLocks;
        return nextLocks;
      });
      if (nextLocksToSweep !== null) {
        scheduleLockSweep(nextLocksToSweep);
      }
    });

    channel.on('broadcast', { event: 'field:lock' }, ({ payload }) => {
      const nextLock = payload as FieldLock;
      let nextLocksToSweep: Record<string, LockEntry> | null = null;
      setLockedFieldEntries((current) => {
        const nextLocks = {
          ...current,
          [nextLock.field]: {
            ...nextLock,
            expiresAt: Date.now() + PRESENCE_LOCK_TTL_MS,
          },
        };
        nextLocksToSweep = nextLocks;
        return nextLocks;
      });
      if (nextLocksToSweep !== null) {
        scheduleLockSweep(nextLocksToSweep);
      }
    });

    channel.on('broadcast', { event: 'field:unlock' }, ({ payload }) => {
      const field = String((payload as { field?: string }).field ?? '');
      let nextLocksToSweep: Record<string, LockEntry> | null = null;
      setLockedFieldEntries((current) => {
        const copy = { ...current };
        delete copy[field];
        nextLocksToSweep = copy;
        return copy;
      });
      if (nextLocksToSweep !== null) {
        scheduleLockSweep(nextLocksToSweep);
      }
    });

    channel.on('broadcast', { event: 'typing' }, ({ payload }) => {
      const nextUser = String((payload as { name?: string }).name ?? 'Quelqu un');
      setTypingUsers((current) => Array.from(new Set([...current, nextUser])));
      window.clearTimeout(typingTimers.current[nextUser]);
      typingTimers.current[nextUser] = window.setTimeout(() => {
        setTypingUsers((current) => current.filter((item) => item !== nextUser));
      }, 1600);
    });

    // Caller-registered custom broadcast events (e.g. 'object:saved'). The handler is read
    // from a ref so a changing onEvent identity never resubscribes the channel.
    (subscribeEventsRef.current ?? []).forEach((eventName) => {
      channel.on('broadcast', { event: eventName }, ({ payload }) => {
        onEventRef.current?.(eventName, payload);
      });
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        subscribedRef.current = true;
        await channel.track(mePayloadRef.current);
      }
    });

    return () => {
      Object.values(typingTimers.current).forEach((timer) => window.clearTimeout(timer));
      clearLockExpiryTimer();
      clearDemoLockTimers();
      subscribedRef.current = false;
      void channel.untrack();
      void channel.unsubscribe();
      void client.removeChannel(channel);
      channelRef.current = null;
    };
  }, [demoMode, enabled, meIdentity, roomKey, userId]);

  // Push presence-payload updates (active section / editing flag) without resubscribing.
  useEffect(() => {
    if (!enabled || demoMode || !subscribedRef.current || !channelRef.current) {
      return;
    }
    void channelRef.current.track(mePayloadRef.current);
  }, [me, demoMode, enabled]);

  async function lockField(field: string) {
    if (!enabled) {
      return;
    }

    if (demoMode) {
      window.clearTimeout(demoLockTimersRef.current[field]);
      demoLockTimersRef.current[field] = window.setTimeout(() => {
        setLockedFieldEntries((current) => {
          const copy = { ...current };
          delete copy[field];
          return copy;
        });
      }, PRESENCE_LOCK_TTL_MS);

      setLockedFieldEntries((current) => ({
        ...current,
        [field]: { field, userId: me.userId, name: me.name, expiresAt: Date.now() + PRESENCE_LOCK_TTL_MS },
      }));
      return;
    }

    await channelRef.current?.send({
      type: 'broadcast',
      event: 'field:lock',
      payload: { field, userId: me.userId, name: me.name },
    });
  }

  async function unlockField(field: string) {
    if (!enabled) {
      return;
    }

    if (demoMode) {
      window.clearTimeout(demoLockTimersRef.current[field]);
      delete demoLockTimersRef.current[field];
      setLockedFieldEntries((current) => {
        const copy = { ...current };
        delete copy[field];
        return copy;
      });
      return;
    }

    await channelRef.current?.send({
      type: 'broadcast',
      event: 'field:unlock',
      payload: { field },
    });
  }

  async function announceTyping() {
    if (!enabled) {
      return;
    }

    if (demoMode) {
      setTypingUsers(['Jean est en train d ecrire...']);
      window.setTimeout(() => setTypingUsers([]), 1000);
      return;
    }

    await channelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { name: me.name },
    });
  }

  /** Send a custom broadcast event to the room (no-op in demo / when disabled). */
  async function broadcast(event: string, payload: unknown) {
    if (!enabled || demoMode) {
      return;
    }
    await channelRef.current?.send({ type: 'broadcast', event, payload });
  }

  const lockedFields = Object.fromEntries(
    Object.entries(lockedFieldEntries).map(([field, entry]) => [field, { field, userId: entry.userId, name: entry.name }]),
  ) as Record<string, FieldLock>;

  return {
    peers,
    me,
    lockedFields,
    typingUsers,
    lockField,
    unlockField,
    announceTyping,
    broadcast,
  };
}
