import { useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { mockPresence } from '../data/mock';
import { getSupabaseClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';
import { useUiStore } from '../store/ui-store';
import type { FieldLock, PresenceMember } from '../types/domain';

interface TrackPayload {
  userId: string;
  name: string;
  avatar: string;
  color: string;
}

interface UsePresenceRoomOptions {
  enabled?: boolean;
  syncGlobalStatus?: boolean;
}

interface LockEntry extends FieldLock {
  expiresAt: number;
}

export const PRESENCE_LOCK_TTL_MS = 15000;
const demoPalette = ['#ff7b54', '#4cb3ff', '#78c67a', '#ffbd59'];

export function usePresenceRoom(roomKey: string, options: UsePresenceRoomOptions = {}) {
  const { enabled = true, syncGlobalStatus = false } = options;
  const userId = useSessionStore((state) => state.userId);
  const userName = useSessionStore((state) => state.userName);
  const avatar = useSessionStore((state) => state.avatar);
  const demoMode = useSessionStore((state) => state.demoMode);
  const setNetworkStatus = useUiStore((state) => state.setNetworkStatus);
  const setLiveUsersCount = useUiStore((state) => state.setLiveUsersCount);
  const [peers, setPeers] = useState<PresenceMember[]>([]);
  const [lockedFieldEntries, setLockedFieldEntries] = useState<Record<string, LockEntry>>({});
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingTimers = useRef<Record<string, number>>({});
  const lockExpiryTimerRef = useRef<number | null>(null);
  const demoLockTimersRef = useRef<Record<string, number>>({});

  const me = useMemo<PresenceMember>(
    () => ({
      userId: userId ?? 'anonymous',
      name: userName || 'Utilisateur',
      avatar,
      color: demoPalette[0],
    }),
    [avatar, userId, userName],
  );

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
        setLockedFieldEntries((current) => {
          const now = Date.now();
          const nextEntries = Object.entries(current).filter(([, entry]) => entry.expiresAt > now);
          const nextLocks = Object.fromEntries(nextEntries) as Record<string, LockEntry>;
          scheduleLockSweep(nextLocks);
          return nextLocks;
        });
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
      const demoPeers = [me, ...mockPresence.filter((item) => item.userId !== me.userId).slice(0, 2)];
      setPeers(demoPeers);
      if (syncGlobalStatus) {
        setLiveUsersCount(demoPeers.length);
        setNetworkStatus(navigator.onLine ? 'degraded' : 'offline');
      }
      return () => {
        clearLockExpiryTimer();
        clearDemoLockTimers();
      };
    }

    const client = getSupabaseClient();
    if (!client || !userId) {
      setPeers(enabled ? [me] : []);
      if (syncGlobalStatus) {
        setLiveUsersCount(1);
        setNetworkStatus('offline');
      }
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
      const state = channel.presenceState<TrackPayload>();
      const nextPeers = Object.values(state)
        .flat()
        .map((item, index) => ({
          userId: item.userId,
          name: item.name,
          avatar: item.avatar,
          color: item.color || demoPalette[index % demoPalette.length],
        }));

      setPeers(nextPeers);
      setLockedFieldEntries((current) => {
        const liveUserIds = new Set(nextPeers.map((peer) => peer.userId));
        const nextEntries = Object.entries(current).filter(([, entry]) => liveUserIds.has(entry.userId));
        const nextLocks = Object.fromEntries(nextEntries) as Record<string, LockEntry>;
        scheduleLockSweep(nextLocks);
        return nextLocks;
      });
      if (syncGlobalStatus) {
        setLiveUsersCount(nextPeers.length);
      }
    });

    channel.on('broadcast', { event: 'field:lock' }, ({ payload }) => {
      const nextLock = payload as FieldLock;
      setLockedFieldEntries((current) => {
        const nextLocks = {
          ...current,
          [nextLock.field]: {
            ...nextLock,
            expiresAt: Date.now() + PRESENCE_LOCK_TTL_MS,
          },
        };
        scheduleLockSweep(nextLocks);
        return nextLocks;
      });
    });

    channel.on('broadcast', { event: 'field:unlock' }, ({ payload }) => {
      const field = String((payload as { field?: string }).field ?? '');
      setLockedFieldEntries((current) => {
        const copy = { ...current };
        delete copy[field];
        scheduleLockSweep(copy);
        return copy;
      });
    });

    channel.on('broadcast', { event: 'typing' }, ({ payload }) => {
      const nextUser = String((payload as { name?: string }).name ?? 'Quelqu un');
      setTypingUsers((current) => Array.from(new Set([...current, nextUser])));
      window.clearTimeout(typingTimers.current[nextUser]);
      typingTimers.current[nextUser] = window.setTimeout(() => {
        setTypingUsers((current) => current.filter((item) => item !== nextUser));
      }, 1600);
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        if (syncGlobalStatus) {
          setNetworkStatus('connected');
        }
        await channel.track(me);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        if (syncGlobalStatus) {
          setNetworkStatus('degraded');
        }
      } else if (status === 'CLOSED') {
        if (syncGlobalStatus) {
          setNetworkStatus('offline');
        }
      }
    });

    return () => {
      Object.values(typingTimers.current).forEach((timer) => window.clearTimeout(timer));
      clearLockExpiryTimer();
      clearDemoLockTimers();
      void channel.untrack();
      void channel.unsubscribe();
      void client.removeChannel(channel);
      channelRef.current = null;
    };
  }, [demoMode, enabled, me, roomKey, setLiveUsersCount, setNetworkStatus, syncGlobalStatus, userId]);

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
  };
}