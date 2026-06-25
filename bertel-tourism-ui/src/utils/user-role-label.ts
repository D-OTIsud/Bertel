// Phase 7.1 — libellés FR du rôle de session (UserRole), pour la carte d'état « Session &
// rôle ». Distinct de `resolveRoleLabel` (utils/labels) qui résout les rôles d'acteur
// (actor_object_role) : ici c'est le rôle plateforme/ORG de l'utilisateur connecté.

import type { UserRole } from '../types/domain';

const USER_ROLE_LABELS_FR: Record<UserRole, string> = {
  super_admin: 'Super-administrateur',
  tourism_agent: 'Agent touristique',
  owner: 'Propriétaire',
};

/** Tonalité de badge associée au rôle (réutilise les classes `.badge--*`). */
export type RoleBadgeTone = 'info' | 'ok' | 'warn';

const USER_ROLE_TONES: Record<UserRole, RoleBadgeTone> = {
  super_admin: 'info',
  owner: 'ok',
  tourism_agent: 'ok',
};

/**
 * Libellé FR du rôle de session. Un admin d'organisation (rang ≥ 10) non super-admin reçoit
 * le suffixe « · Admin ORG » pour refléter sa capacité d'administration d'équipe.
 */
export function resolveUserRoleLabel(role: UserRole | null | undefined, adminRank?: number | null): string {
  if (!role) return 'Non connecté';
  const base = USER_ROLE_LABELS_FR[role] ?? role;
  if (role !== 'super_admin' && (adminRank ?? 0) >= 10) {
    return `${base} · Admin ORG`;
  }
  return base;
}

/** Tonalité de badge pour le rôle (défaut `info`). */
export function resolveUserRoleTone(role: UserRole | null | undefined): RoleBadgeTone {
  if (!role) return 'warn';
  return USER_ROLE_TONES[role] ?? 'info';
}
