import type { UserRole } from '../types/domain';

/** Whether the session may SEE the Team admin page. Individual actions are still RPC-rank-gated. */
export function canAdministerTeam(s: { role: UserRole | null; adminRank: number | null }): boolean {
  if (s.role === 'owner' || s.role === 'super_admin') return true;
  return s.role != null && (s.adminRank ?? 0) >= 10;
}

/**
 * Superuser plateforme (`owner` / `super_admin`) — miroir exact de `api.is_platform_superuser()`.
 *
 * Sert à des gardes SANS rapport avec les listes (ex. Team admin) — NE PAS le réutiliser pour la
 * création de listes : cf. `canCreateLists` ci-dessous, qui a remplacé cette restriction le
 * 2026-09-07 (cadrage `docs/superpowers/specs/2026-09-07-listes-personnelles-une-cycle-vie-design.md`
 * règle 1). Les confondre rouvrirait/refermerait le mauvais périmètre selon le sens de l'erreur.
 */
export function isPlatformSuperuser(s: { role: UserRole | null }): boolean {
  return s.role === 'owner' || s.role === 'super_admin';
}

/**
 * Création de listes (module Listes, cadrage 2026-09-07 règle 1) : TOUT utilisateur connecté
 * membre d'une organisation active, lecteurs compris — `api.create_list` n'est plus réservé au
 * superuser plateforme (ancienne garde 17l, retirée). Le seul prérequis serveur est une
 * organisation active ; `orgId` en est le miroir côté session (résolu au bootstrap via
 * `api.current_user_active_org()`). Sélecteur VOLONTAIREMENT distinct de `isPlatformSuperuser` —
 * ne pas le détourner pour d'autres gardes plateforme.
 */
export function canCreateLists(s: { orgId: string | null }): boolean {
  return s.orgId != null;
}

/**
 * Admin des listes d'une organisation (module Listes, cadrage 2026-09-07) : voit l'onglet
 * Propositions, accepte/refuse, met/retire directement sa propre liste à la une. Même seuil que
 * les autres gardes « admin d'ORG » du produit (branding, réglages d'équipe par défaut) —
 * `rang >= 30`, superuser plateforme exempté. Distinct de `canAdministerTeam` (rang >= 10, accès
 * à l'écran Team) : les confondre ouvrirait les propositions à un rôle d'admin plus faible que ce
 * que `api.list_list_proposals`/`review_list_feature` acceptent côté serveur.
 */
export function isListsAdmin(s: { role: UserRole | null; adminRank: number | null }): boolean {
  return s.role === 'owner' || s.role === 'super_admin' || (s.adminRank ?? 0) >= 30;
}
