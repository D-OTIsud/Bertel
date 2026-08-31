// Vocabulaire des rôles métier + lecture d'un changement de rôle.
//
// §227 (2026-08-31) — ce fichier portait les PRÉRÉGLAGES en dur (`presetPermissionsFor`,
// `reviewRoleChange`) parce que le rôle métier ne conférait rien : l'architecture SP-2 posait
// « aucun droit implicite », et un bouton appliquait le préréglage à la main, une fois.
// Le rôle confère désormais réellement ses droits (table `org_role_permission`, réglée par ORG),
// donc la constante applicative a disparu : la source est la base, lue par `listRolePermissions`.
// Garder une copie en dur ici aurait créé deux vérités concurrentes sur qui peut écrire.

export const BUSINESS_ROLE_CODES = ['viewer', 'contributor', 'editor'] as const;
export type BusinessRoleCode = (typeof BUSINESS_ROLE_CODES)[number];

// Libellés FR des rôles métier (jamais le code brut côté UI : invite, tiroir, matrice).
const BUSINESS_ROLE_LABELS_FR: Record<string, string> = {
  viewer: 'Lecteur',
  contributor: 'Contributeur',
  editor: 'Éditeur',
};

/** Libellé FR d'un rôle métier (repli sur le code si inconnu). */
export function businessRoleLabel(code: string | null | undefined): string {
  if (!code) return '(aucun rôle)';
  return BUSINESS_ROLE_LABELS_FR[code] ?? code;
}

/** Ce qu'un changement de rôle métier fait — et ne fait pas — aux droits d'un membre. */
export interface RoleChangeReview {
  /** Droits que le NOUVEAU rôle confère (appliqués immédiatement, sans geste supplémentaire). */
  granted: string[];
  /**
   * Exceptions individuelles qui SURVIVENT au changement, au-delà du nouveau rôle.
   *
   * C'est le point qui compte à la rétrogradation : passer quelqu'un Éditeur → Lecteur retire
   * les droits du rôle, mais PAS ceux qu'on lui a accordés nommément. Un admin qui croit avoir
   * fermé l'accès en changeant l'étiquette se tromperait — d'où l'annonce explicite.
   * Rien n'est révoqué automatiquement : une exception a été accordée exprès par quelqu'un.
   */
  residualExceptions: string[];
}

/**
 * Constate l'effet d'un passage au rôle `roleCode`, sans rien décider.
 *
 * `matrix` vient de la base (`listRolePermissions`) : cette fonction ne connaît aucun préréglage.
 */
export function reviewRoleChange(
  roleCode: string,
  individualCodes: readonly string[],
  matrix: Record<string, string[]>,
): RoleChangeReview {
  const granted = matrix[roleCode] ?? [];
  const conferred = new Set(granted);
  return {
    granted: [...granted].sort(),
    residualExceptions: individualCodes.filter((code) => !conferred.has(code)).sort(),
  };
}
