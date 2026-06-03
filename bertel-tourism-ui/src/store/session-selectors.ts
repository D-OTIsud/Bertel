import type { UserRole } from '../types/domain';

/** Whether the session may SEE the Team admin page. Individual actions are still RPC-rank-gated. */
export function canAdministerTeam(s: { role: UserRole | null; adminRank: number | null }): boolean {
  if (s.role === 'owner' || s.role === 'super_admin') return true;
  return s.role != null && (s.adminRank ?? 0) >= 10;
}
