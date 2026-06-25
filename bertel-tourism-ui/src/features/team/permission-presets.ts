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

const EDITOR_EXTRA = ['publish_object', 'validate_changes', 'manage_team_messages'] as const;

const PRESETS: Record<string, string[]> = {
  viewer: [],
  contributor: [...CONTRIBUTOR_PERMISSIONS],
  editor: [...CONTRIBUTOR_PERMISSIONS, ...EDITOR_EXTRA],
};

/** The SP-2 default permission codes for a business role; [] for viewer/unknown. */
export function presetPermissionsFor(roleCode: string): string[] {
  return PRESETS[roleCode] ?? [];
}
