import { useEffect, useRef } from 'react';
import { mockPresence } from '../data/mock';
import { getSupabaseClient } from '../lib/supabase';
import {
  dedupePresenceMembers,
  deriveNetworkStatus,
  type PresenceTrackPayload,
  type RealtimeConnState,
} from '../lib/presence';
import { useSessionStore } from '../store/session-store';
import { useUiStore } from '../store/ui-store';
import type { PresenceMember } from '../types/domain';

const GLOBAL_PRESENCE_ROOM = 'presence:global';
const SELF_COLOR = '#ff7b54';
const DEMO_STAGGER_MS = 7 * 60_000;

/**
 * Site-wide presence: a single realtime channel mounted ONCE (in AppBootstrap) that
 * publishes the deduplicated roster of people currently online + a unified network
 * status into the UI store. This hook is the SOLE writer of networkStatus.
 */
export function useGlobalPresence(): void {
  const userId = useSessionStore((state) => state.userId);
  const userName = useSessionStore((state) => state.userName);
  const avatar = useSessionStore((state) => state.avatar);
  const demoMode = useSessionStore((state) => state.demoMode);
  const setLivePresence = useUiStore((state) => state.setLivePresence);
  const setNetworkStatus = useUiStore((state) => state.setNetworkStatus);
  // Captured once: when this tab came online.
  const onlineSinceRef = useRef(Date.now());

  useEffect(() => {
    const me: PresenceMember = {
      userId: userId ?? 'anonymous',
      name: userName || 'Vous',
      avatar: avatar || '–',
      color: SELF_COLOR,
      onlineSince: onlineSinceRef.current,
    };

    // Demo mode: static roster, healthy connection (showcase).
    if (demoMode) {
      const others = mockPresence
        .filter((member) => member.userId !== me.userId)
        .slice(0, 2)
        .map((member, index) => ({ ...member, onlineSince: onlineSinceRef.current - (index + 1) * DEMO_STAGGER_MS }));
      setLivePresence([me, ...others]);
      setNetworkStatus('connected');
      return undefined;
    }

    const client = getSupabaseClient();

    // No backend configured or not authenticated yet: show just yourself, offline.
    if (!client || !userId) {
      setLivePresence(userId ? [me] : []);
      setNetworkStatus('offline');
      return undefined;
    }

    let realtimeStatus: RealtimeConnState = 'connecting';
    const applyNetworkStatus = () => {
      setNetworkStatus(deriveNetworkStatus(navigator.onLine, realtimeStatus));
    };

    const channel = client.channel(GLOBAL_PRESENCE_ROOM, {
      config: { presence: { key: userId }, broadcast: { self: false } },
    });

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<PresenceTrackPayload>();
      setLivePresence(dedupePresenceMembers(state as Record<string, PresenceTrackPayload[]>, userId));
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        realtimeStatus = 'subscribed';
        applyNetworkStatus();
        await channel.track(me);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        realtimeStatus = 'error';
        applyNetworkStatus();
      } else if (status === 'CLOSED') {
        realtimeStatus = 'closed';
        applyNetworkStatus();
      }
    });

    const handleBrowserChange = () => applyNetworkStatus();
    window.addEventListener('online', handleBrowserChange);
    window.addEventListener('offline', handleBrowserChange);
    applyNetworkStatus();

    return () => {
      window.removeEventListener('online', handleBrowserChange);
      window.removeEventListener('offline', handleBrowserChange);
      void channel.untrack();
      void channel.unsubscribe();
      void client.removeChannel(channel);
    };
  }, [demoMode, userId, userName, avatar, setLivePresence, setNetworkStatus]);
}
