import type { UserRole } from '../types/domain';

/** Whether the session may SEE the Team admin page. Individual actions are still RPC-rank-gated. */
export function canAdministerTeam(s: { role: UserRole | null; adminRank: number | null }): boolean {
  if (s.role === 'owner' || s.role === 'super_admin') return true;
  return s.role != null && (s.adminRank ?? 0) >= 10;
}

/**
 * Superuser plateforme (`owner` / `super_admin`) — miroir exact de `api.is_platform_superuser()`.
 *
 * 17l : c'est la SEULE population autorisée à créer une liste (arbitrage PO 2026-08-31). Le rang
 * d'administration d'ORG ne suffit pas — d'où un sélecteur distinct de `canAdministerTeam`, qui
 * lui accepte le rang ≥ 10. Les confondre rouvrirait la création à des org_admins que la RPC
 * refuse, et l'écran promettrait un bouton qui rend 42501.
 */
export function isPlatformSuperuser(s: { role: UserRole | null }): boolean {
  return s.role === 'owner' || s.role === 'super_admin';
}
