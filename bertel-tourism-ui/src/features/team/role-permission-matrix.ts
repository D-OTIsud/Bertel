// §227 — le rôle métier CONFÈRE les droits (table `org_role_permission`, réglée par ORG).
// Logique pure, sans accès réseau : c'est elle que l'écran interroge avant d'écrire quoi que
// ce soit, et c'est ici que se teste la question qui compte — « qui bascule si je coche ça ? ».

/** Codes de permission conférés par chaque rôle métier, pour UNE org. */
export type RoleMatrix = Record<string, string[]>;

export interface MemberRef {
  userId: string;
  displayName: string;
  /** Nullable en base : un membre peut n'avoir aucun rôle métier actif. */
  businessRoleCode: string | null;
  /** Exceptions individuelles du membre — un droit qu'il garde même retiré du rôle. */
  individualCodes: readonly string[];
}

/**
 * Droits effectifs d'un membre : ses exceptions individuelles ∪ les droits de son rôle.
 *
 * Miroir exact du prédicat SQL `api.user_has_permission` (chemin 1 OU chemin 2). Si les deux
 * divergent, l'écran ment — d'où la duplication assumée plutôt qu'un aller-retour serveur.
 */
export function effectivePermissions(
  individual: readonly string[],
  roleCode: string | null,
  matrix: RoleMatrix,
): string[] {
  const set = new Set(individual);
  if (roleCode) for (const code of matrix[roleCode] ?? []) set.add(code);
  return [...set];
}

export interface ToggleImpact {
  /** Membres dont l'accès CHANGE réellement — ceux que la confirmation doit nommer. */
  affected: MemberRef[];
  /**
   * Membres du rôle qui gardent le droit malgré son retrait, parce qu'ils le portent en
   * exception individuelle. Les compter comme « perdants » ferait croire à un admin qu'il a
   * fermé un accès qui reste ouvert.
   */
  retainedByException: MemberRef[];
  grants: boolean;
}

/** Qui bascule vraiment si on (dé)coche `permCode` pour `roleCode`. */
export function impactOfToggle(
  matrix: RoleMatrix,
  roleCode: string,
  permCode: string,
  granted: boolean,
  members: readonly MemberRef[],
): ToggleImpact {
  const alreadyHas = (matrix[roleCode] ?? []).includes(permCode);
  if (alreadyHas === granted) return { affected: [], retainedByException: [], grants: granted };

  const inRole = members.filter((m) => m.businessRoleCode === roleCode);
  const withException = inRole.filter((m) => m.individualCodes.includes(permCode));
  const withoutException = inRole.filter((m) => !m.individualCodes.includes(permCode));

  // À l'octroi comme au retrait, seuls les membres SANS exception voient leur accès changer :
  // celui qui porte déjà le droit individuellement l'avait avant et l'aura après.
  return {
    affected: withoutException,
    retainedByException: granted ? [] : withException,
    grants: granted,
  };
}
