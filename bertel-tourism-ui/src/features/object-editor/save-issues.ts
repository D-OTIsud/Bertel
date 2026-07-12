import type { Issue } from './editor-validation';
import type { EditorSaveResult } from './useEditorSave';
import type { WorkspaceModuleId } from '../../services/object-workspace';

/**
 * Human label per workspace module — used to title save/permission errors in the
 * BlockersModal. Keyed by WorkspaceModuleId so the Record type forces full coverage
 * (mirrors MODULE_KEY_MAP). Errors are grouped by module, never by a forced section
 * (several modules — e.g. characteristics — legitimately span multiple sections).
 */
export const MODULE_LABEL: Record<WorkspaceModuleId, string> = {
  'general-info': 'Identité & taxonomie',
  taxonomy: 'Taxonomie',
  publication: 'Publication',
  'sync-identifiers': 'Identifiants externes',
  location: 'Localisation',
  places: 'Sites secondaires',
  descriptions: 'Descriptions & langues parlées',
  media: 'Médias',
  contacts: 'Contacts',
  characteristics: 'Caractéristiques',
  distinctions: 'Classifications',
  'capacity-policies': 'Capacité & accueil',
  pricing: 'Tarifs, paiement & extras',
  rooms: 'Chambres',
  'meeting-rooms': 'Salles de réunion',
  menus: 'Cartes & menus',
  cuisine: 'Cuisines proposées',
  activity: 'Activité',
  event: 'Dates & programmation',
  itinerary: 'Itinéraire',
  openings: "Périodes d'ouverture",
  'provider-follow-up': 'Suivi prestataire',
  relationships: 'Liens vers fiches',
  memberships: 'Rattachements',
  legal: 'Juridique',
  tags: 'Tags & étiquettes',
  sustainability: 'Démarche durable',
  distribution: 'Distribution',
  provider: 'Prestataire',
};

export function moduleLabel(module: WorkspaceModuleId): string {
  return MODULE_LABEL[module] ?? module;
}

/** Convert a batched save result into req-tone Issues, labelled by module. */
export function saveResultToIssues(result: EditorSaveResult): Issue[] {
  const failed: Issue[] = result.failed.map((entry) => ({
    section: moduleLabel(entry.module),
    message: entry.message,
    tone: 'req',
  }));
  const blocked: Issue[] = result.blocked.map((entry) => ({
    section: moduleLabel(entry.module),
    message: `Lecture seule : ${entry.reason}`,
    tone: 'req',
  }));
  return [...failed, ...blocked];
}

/** Convert a publish RPC rejection into a single Publication req Issue. */
export function publishErrorToIssue(error: unknown): Issue {
  return {
    section: 'Publication',
    message: error instanceof Error ? error.message : 'Publication impossible.',
    tone: 'req',
  };
}

export interface IssueGroup {
  num: string;
  label: string;
  issues: Issue[];
}

/** Group section-keyed issues, preserving first-seen order; unknown sections get an empty label. */
export function groupIssuesBySection(
  issues: Issue[],
  sectionLabels: Record<string, string>,
): IssueGroup[] {
  const order: string[] = [];
  const byNum = new Map<string, Issue[]>();
  for (const issue of issues) {
    const bucket = byNum.get(issue.section);
    if (bucket) {
      bucket.push(issue);
    } else {
      byNum.set(issue.section, [issue]);
      order.push(issue.section);
    }
  }
  return order.map((num) => ({
    num,
    label: sectionLabels[num] ?? '',
    issues: byNum.get(num) as Issue[],
  }));
}
