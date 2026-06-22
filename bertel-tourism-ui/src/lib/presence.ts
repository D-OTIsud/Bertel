import type { NetworkStatus, PresenceMember } from '../types/domain';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** One raw presence entry as tracked on the realtime channel (one per connection). */
export interface PresenceTrackPayload {
  userId: string;
  name: string;
  avatar: string;
  color: string;
  onlineSince?: number;
}

/** Realtime channel connection state, normalised for status derivation. */
export type RealtimeConnState = 'subscribed' | 'connecting' | 'error' | 'closed';

/**
 * Deduplicate a Supabase presence state into one member per person.
 * presenceState() returns { [presenceKey]: [payload, ...] }, and the key is the userId,
 * so each key is one person even with several tabs/connections open.
 * onlineSince = the EARLIEST across that person's connections (first arrival).
 * Sort: the current user (selfId) first, then by onlineSince, then by name.
 */
export function dedupePresenceMembers(
  state: Record<string, PresenceTrackPayload[]>,
  selfId: string | null,
): PresenceMember[] {
  const members: PresenceMember[] = Object.entries(state).map(([key, entries]) => {
    const first = entries[0];
    const sinces = entries
      .map((entry) => entry?.onlineSince)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    return {
      userId: first?.userId ?? key,
      name: first?.name ?? 'Utilisateur',
      avatar: first?.avatar ?? '',
      color: first?.color ?? '',
      onlineSince: sinces.length > 0 ? Math.min(...sinces) : undefined,
    };
  });

  return members.sort((a, b) => {
    if (a.userId === selfId) return -1;
    if (b.userId === selfId) return 1;
    const aSince = a.onlineSince ?? Number.POSITIVE_INFINITY;
    const bSince = b.onlineSince ?? Number.POSITIVE_INFINITY;
    if (aSince !== bSince) return aSince - bSince;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Single source of truth for the network pill state. Browser-offline always wins (red);
 * otherwise the channel decides: subscribed = green, anything else = degraded (orange).
 */
export function deriveNetworkStatus(
  browserOnline: boolean,
  realtimeStatus: RealtimeConnState,
): NetworkStatus {
  if (!browserOnline) return 'offline';
  if (realtimeStatus === 'subscribed') return 'connected';
  return 'degraded';
}

export interface NetworkStatusLabel {
  tone: 'green' | 'orange' | 'red';
  label: string;
  description: string;
}

/** French label + tone + tooltip copy for a network status. */
export function networkStatusLabel(status: NetworkStatus): NetworkStatusLabel {
  switch (status) {
    case 'connected':
      return { tone: 'green', label: 'En ligne', description: 'Connexion temps réel active.' };
    case 'degraded':
      return {
        tone: 'orange',
        label: 'Temps réel interrompu',
        description: 'Tes données restent à jour ; seule la présence live est en pause.',
      };
    case 'offline':
    default:
      return { tone: 'red', label: 'Hors ligne', description: 'Aucune connexion réseau détectée.' };
  }
}

/** Up to two uppercased initials from a display name (e.g. "Marie Durand" -> "MD"). */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Human-readable "how long this member has been online" label.
 * Returns null when the join time is unknown.
 */
export function formatPresenceDuration(onlineSince: number | undefined, now: number): string | null {
  if (onlineSince == null || !Number.isFinite(onlineSince)) {
    return null;
  }

  const elapsedMs = Math.max(0, now - onlineSince);
  const totalMinutes = Math.floor(elapsedMs / MINUTE_MS);

  if (totalMinutes < 1) {
    return "à l'instant";
  }
  if (elapsedMs < HOUR_MS) {
    return `depuis ${totalMinutes} min`;
  }

  const hours = Math.floor(elapsedMs / HOUR_MS);
  const minutes = totalMinutes - hours * 60;
  return minutes === 0 ? `depuis ${hours} h` : `depuis ${hours} h ${minutes} min`;
}
