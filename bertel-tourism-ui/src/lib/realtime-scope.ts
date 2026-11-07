import type { useSessionStore } from '../store/session-store';
import type { PresenceMember } from '../types/domain';

type Session = ReturnType<typeof useSessionStore.getState>;

export function realtimeScopeKey(session: Session): string | null {
  const authority = session.authAuthority;
  if (session.demoMode || session.isSandboxDiscovery || session.status !== 'ready' || !session.userId
    || !session.role || session.role === 'actor' || (session.role === 'tourism_agent' && !session.orgId)
    || !authority?.hydrated || authority.userId !== session.userId) return null;
  return JSON.stringify([authority.epoch, session.userId, session.role, session.orgId,
    session.isTestRealm, session.canEditObjects, session.adminRank]);
}

export function realtimeRealm(session: Session): 'prod' | 'test' {
  return session.isTestRealm ? 'test' : 'prod';
}

export function realtimeRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

export function realtimeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string' || value.length > maxLength || /[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(value)) return null;
  return value.trim() || null;
}

export function realtimeUserId(value: unknown): string | null {
  return typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

export function realtimeTimestamp(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= Date.now() + 60_000
    ? value : undefined;
}

type PresenceEntry = PresenceMember & { activeSection?: string; editing?: boolean };

export function readRealtimePresence(state: unknown): Record<string, PresenceEntry[]> {
  const byKey = realtimeRecord(state);
  if (!byKey) return {};
  const result: Record<string, PresenceEntry[]> = {};
  for (const [key, entries] of Object.entries(byKey)) {
    if (!realtimeUserId(key) || !Array.isArray(entries)) continue;
    const peers: PresenceEntry[] = [];
    for (const entry of entries) {
      const payload = realtimeRecord(entry);
      if (!payload || payload.userId !== key) continue;
      const name = realtimeText(payload.name, 120);
      if (!name) continue;
      const activeSection = typeof payload.activeSection === 'string' && /^\d{2}$/.test(payload.activeSection)
        ? payload.activeSection : undefined;
      peers.push({
        userId: key,
        name,
        avatar: realtimeText(payload.avatar, 12) ?? '',
        color: typeof payload.color === 'string' && /^#[0-9a-f]{6}$/i.test(payload.color) ? payload.color : '',
        onlineSince: realtimeTimestamp(payload.onlineSince),
        ...(activeSection ? { activeSection, editing: payload.editing === true } : {}),
      });
    }
    if (peers.length) result[key] = peers;
  }
  return result;
}

export function realtimeField(value: unknown): string | null {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9_.:-]{0,119}$/i.test(value)
    && !['constructor', 'prototype'].includes(value) ? value : null;
}
