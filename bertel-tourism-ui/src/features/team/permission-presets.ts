// SP-2 role→permission convention (lot1_mapping_decisions.md §24 SP-2). Used to one-click
// apply a business role's standard permission set; individual toggles handle exceptions.
export const BUSINESS_ROLE_CODES = ['viewer', 'contributor', 'editor'] as const;
export type BusinessRoleCode = (typeof BUSINESS_ROLE_CODES)[number];

// 7.4 — libellés FR des rôles métier (jamais le code brut côté UI : invite, drawer, préréglage).
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

const CONTRIBUTOR_PERMISSIONS = [
  'create_object', 'edit_canonical_when_publisher', 'edit_org_enrichment',
  'edit_hours', 'edit_pricing', 'edit_gallery', 'attach_documents',
] as const;

// §214 — `write_crm_notes` fait partie du rôle Éditeur (arbitrage PO 2026-08-26 : « un éditeur doit
// pouvoir écrire du CRM »). Sans lui, `api.user_can_write_crm` / `user_can_write_crm_actor` rendent
// FALSE et TOUTE écriture CRM échoue en 42501 : affecter un établissement à un acteur, créer un
// acteur, consigner une interaction ou une tâche — et §19 affiche « Lecture seule ».
// Les éditeurs OTI Sud existants y échappaient PAR ACCIDENT : ils portent aussi le rôle admin
// `team_lead`, que la garde accepte via `api.current_user_admin_rank() IS NOT NULL`. Le préréglage,
// lui, ne l'accordait pas — un éditeur créé sans rôle admin était donc bloqué sur tout le CRM.
const EDITOR_EXTRA = [
  'publish_object', 'validate_changes', 'manage_team_messages', 'manage_legal_compliance',
  'write_crm_notes',
] as const;

const PRESETS: Record<string, string[]> = {
  viewer: [],
  contributor: [...CONTRIBUTOR_PERMISSIONS],
  editor: [...CONTRIBUTOR_PERMISSIONS, ...EDITOR_EXTRA],
};

/** The SP-2 default permission codes for a business role; [] for viewer/unknown. */
export function presetPermissionsFor(roleCode: string): string[] {
  return PRESETS[roleCode] ?? [];
}

/** Écart entre les droits d'un membre et le préréglage de son (nouveau) rôle métier. */
export interface RoleChangeReview {
  /** Codes du préréglage que le membre n'a PAS (ni individuellement, ni par héritage d'ORG). */
  missing: string[];
  /** Droits INDIVIDUELS au-delà du préréglage — les seuls qu'on puisse révoquer depuis /team. */
  excess: string[];
}

/**
 * D5 (2026-08-28) — changer le rôle métier n'appliquait RIEN.
 *
 * `rpc_set_business_role` ne touche pas aux permissions, et rien ne rejoue le préréglage : un
 * membre passé Lecteur → Éditeur gardait **0 permission** (l'étiquette changeait, les droits non),
 * et un Éditeur → Lecteur gardait les **12**. L'écran n'en disait rien.
 *
 * Cette fonction ne décide de rien : elle CONSTATE l'écart pour que l'écran puisse le dire.
 *
 * **Le préréglage reste strictement ADDITIF** (arbitrage : c'est l'architecture documentée —
 * « le rôle métier ne confère aucun droit implicite »). Aucune révocation automatique à la
 * rétrogradation, et c'est délibéré : `rpc_list_org_members` ne rend AUCUNE provenance de grant,
 * donc on ne peut pas distinguer un droit venu du préréglage d'un droit accordé exprès. Révoquer
 * en masse retirerait des droits que quelqu'un a choisi d'accorder.
 *
 * `excess` ne contient que les droits INDIVIDUELS : un droit hérité de l'ORG ne se retire pas
 * depuis la fiche d'un membre, et le proposer serait un piège.
 */
export function reviewRoleChange(
  roleCode: string,
  individualCodes: readonly string[],
  inheritedCodes: readonly string[] = [],
): RoleChangeReview {
  const preset = new Set(presetPermissionsFor(roleCode));
  const effective = new Set([...individualCodes, ...inheritedCodes]);
  return {
    missing: [...preset].filter((code) => !effective.has(code)).sort(),
    excess: individualCodes.filter((code) => !preset.has(code)).sort(),
  };
}
