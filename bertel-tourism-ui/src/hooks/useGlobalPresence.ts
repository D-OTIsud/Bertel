import { useEffect, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { mockPresence } from '../data/mock';
import { getSupabaseClient } from '../lib/supabase';
import {
  dedupePresenceMembers,
  deriveNetworkStatus,
  type RealtimeConnState,
} from '../lib/presence';
import { createResilientChannel } from '../lib/realtime-recovery';
import { readRealtimePresence, realtimeRealm, realtimeScopeKey } from '../lib/realtime-scope';
import { useSessionStore } from '../store/session-store';
import { useUiStore } from '../store/ui-store';
import type { PresenceMember } from '../types/domain';

const SELF_COLOR = '#ff7b54';
const DEMO_STAGGER_MS = 7 * 60_000;

/**
 * Site-wide presence: a single realtime channel mounted ONCE (in AppBootstrap) that
 * publishes the deduplicated roster of people currently online + a unified network
 * status into the UI store. This hook is the SOLE writer of networkStatus.
 *
 * Le canal passe par `createResilientChannel` : un canal realtime mort (CLOSED) n'est
 * jamais ranimé par realtime-js, il faut en construire un neuf — sans quoi la pastille
 * restait sur « Temps réel interrompu » jusqu'au rechargement de la page.
 */
export function useGlobalPresence(): void {
  const userId = useSessionStore((state) => state.userId);
  const userName = useSessionStore((state) => state.userName);
  const avatar = useSessionStore((state) => state.avatar);
  const demoMode = useSessionStore((state) => state.demoMode);
  const scopeKey = useSessionStore(realtimeScopeKey);
  const realm = useSessionStore(realtimeRealm);
  const setLivePresence = useUiStore((state) => state.setLivePresence);
  const setNetworkStatus = useUiStore((state) => state.setNetworkStatus);
  const setRealtimeRetry = useUiStore((state) => state.setRealtimeRetry);
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

    // Local identity is enough to show yourself if only the backend is missing.
    if (!client || !userId || scopeKey === null) {
      setLivePresence(scopeKey !== null ? [me] : []);
      setNetworkStatus('offline');
      return undefined;
    }

    let disposed = false;
    let activeChannel: RealtimeChannel | null = null;
    const isCurrent = () => !disposed && realtimeScopeKey(useSessionStore.getState()) === scopeKey;
    setLivePresence([me]);
    let realtimeStatus: RealtimeConnState = 'connecting';
    const applyNetworkStatus = () => {
      if (!isCurrent()) return;
      setNetworkStatus(deriveNetworkStatus(navigator.onLine, realtimeStatus));
    };

    const handle = createResilientChannel(client, {
      topic: `presence:global:${realm}`,
      config: { config: { private: true, presence: { key: userId } } },
      canOpen: isCurrent,
      bind: (channel) => {
        activeChannel = channel;
        channel.on('presence', { event: 'sync' }, () => {
          if (!isCurrent() || channel !== activeChannel || realtimeStatus !== 'subscribed') return;
          setLivePresence(dedupePresenceMembers(readRealtimePresence(channel.presenceState()), userId));
        });
      },
      onSubscribed: async (channel) => {
        await channel.track(me);
      },
      onState: (state) => {
        realtimeStatus = state;
        applyNetworkStatus();
      },
    });

    const unsubscribeAuthority = useSessionStore.subscribe(() => {
      if (isCurrent()) return;
      setLivePresence([]);
      setRealtimeRetry(null);
    });
    // Le bouton « Reconnecter » de la pastille réseau appelle cette reprise-ci.
    setRealtimeRetry(handle.retryNow);

    const handleBrowserChange = () => applyNetworkStatus();
    window.addEventListener('online', handleBrowserChange);
    window.addEventListener('offline', handleBrowserChange);
    applyNetworkStatus();

    return () => {
      disposed = true;
      unsubscribeAuthority();
      window.removeEventListener('online', handleBrowserChange);
      window.removeEventListener('offline', handleBrowserChange);
      setRealtimeRetry(null);
      handle.dispose();
    };
  }, [demoMode, userId, userName, avatar, scopeKey, realm, setLivePresence, setNetworkStatus, setRealtimeRetry]);
}
