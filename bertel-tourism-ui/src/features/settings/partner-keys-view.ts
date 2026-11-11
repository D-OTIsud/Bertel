import type { PartnerKey } from '../../services/partner-keys';

const DAY_MS = 24 * 60 * 60 * 1000;
export const IDLE_AFTER_DAYS = 30;

function timestamp(iso: string | null): number | null {
  if (!iso) return null;
  const value = Date.parse(iso);
  return Number.isNaN(value) ? null : value;
}

function newestFirst(a: string | null, b: string | null): number {
  const first = timestamp(a);
  const second = timestamp(b);
  if (first === null) return second === null ? 0 : 1;
  if (second === null) return -1;
  return second - first;
}

export function splitKeys(keys: readonly PartnerKey[]): { active: PartnerKey[]; revoked: PartnerKey[] } {
  const active: PartnerKey[] = [];
  const revoked: PartnerKey[] = [];
  for (const key of keys) (key.isActive ? active : revoked).push(key);
  active.sort((a, b) => newestFirst(a.lastUsedAt, b.lastUsedAt));
  revoked.sort((a, b) => newestFirst(a.revokedAt, b.revokedAt));
  return { active, revoked };
}

function calendarDay(value: Date): number {
  // Compare local dates without making a daylight-saving transition an extra day.
  return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / DAY_MS;
}

export function lastUseLabel(iso: string | null, now: Date | number): string {
  const usedAt = timestamp(iso);
  if (usedAt === null) return 'Jamais utilisée';
  const days = Math.max(0, calendarDay(new Date(Number(now))) - calendarDay(new Date(usedAt)));
  if (days === 0) return 'Aujourd’hui';
  if (days === 1) return 'Hier';
  if (days < 30) return `il y a ${days} j`;
  return `il y a ${Math.floor(days / 30)} mois`;
}

export function isIdle(key: PartnerKey, now: Date | number): boolean {
  if (!key.isActive) return false;
  const usedAt = timestamp(key.lastUsedAt);
  return usedAt === null || Number(now) - usedAt > IDLE_AFTER_DAYS * DAY_MS;
}

export function summarize(active: readonly PartnerKey[], now: Date | number): {
  activeCount: number;
  usedLast7Days: number;
  idleCount: number;
} {
  const summary = { activeCount: 0, usedLast7Days: 0, idleCount: 0 };
  for (const key of active) {
    if (!key.isActive) continue;
    summary.activeCount += 1;
    const usedAt = timestamp(key.lastUsedAt);
    const age = usedAt === null ? null : Number(now) - usedAt;
    if (age !== null && age >= 0 && age <= 7 * DAY_MS) summary.usedLast7Days += 1;
    if (isIdle(key, now)) summary.idleCount += 1;
  }
  return summary;
}
