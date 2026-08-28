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

/**
 * Module → NUMÉROS de section vers lesquels sauter (chantier 2026-08-28 n°4, lot C).
 *
 * Sans cette table, les erreurs d'enregistrement ne pouvaient pas offrir de bouton « Aller › » :
 * leur `Issue.section` est un LIBELLÉ de module, pas un numéro, et l'ancre `id="section-NN"`
 * n'existe donc pas. La liste est ORDONNÉE — le bouton saute à la première section — parce que
 * plusieurs modules en couvrent légitimement plusieurs (c'est d'ailleurs la raison pour laquelle
 * les erreurs sont groupées par module et non par section).
 *
 * `Record<WorkspaceModuleId, …>` comme `MODULE_LABEL` : ajouter un module au type sans l'ajouter
 * ici CASSE LA COMPILATION. C'est la garde — elle est structurelle, ne pas l'affaiblir en
 * `Partial` ni en signature d'index.
 *
 * Numéros vérifiés sur les composants eux-mêmes (`num="NN"` dans `sections/`), jamais déduits.
 * §06 est le bloc TYPE (un composant par archétype) ; §07 « Capacité & accueil » est MASQUÉ pour
 * les HEB, dont la capacité vit dans le §06 (§64) — d'où les deux numéros sur `capacity-policies`.
 */
export const MODULE_SECTION_NUMS: Record<WorkspaceModuleId, string[]> = {
  'general-info': ['01'],
  taxonomy: ['01'],
  publication: ['21'],
  'sync-identifiers': ['22'],
  location: ['02'],
  places: ['16'],
  descriptions: ['04'],
  media: ['05'],
  contacts: ['03'],
  characteristics: ['06', '07'],
  distinctions: ['08', '09'],
  'capacity-policies': ['07', '06'],
  pricing: ['13'],
  rooms: ['06'],
  'meeting-rooms': ['06'],
  menus: ['06'],
  cuisine: ['06'],
  activity: ['06'],
  event: ['06'],
  itinerary: ['06'],
  openings: ['14'],
  'provider-follow-up': ['19'],
  relationships: ['15', '17', '19'],
  memberships: ['17'],
  legal: ['18'],
  tags: ['11'],
  sustainability: ['10'],
  distribution: ['03'],
  provider: ['18'],
};

export function moduleSectionNums(module: WorkspaceModuleId): string[] {
  return MODULE_SECTION_NUMS[module] ?? [];
}

/** Convert a batched save result into req-tone Issues, labelled by module. */
export function saveResultToIssues(result: EditorSaveResult): Issue[] {
  const failed: Issue[] = result.failed.map((entry) => ({
    section: moduleLabel(entry.module),
    message: entry.message,
    tone: 'req',
    nums: moduleSectionNums(entry.module),
  }));
  const blocked: Issue[] = result.blocked.map((entry) => ({
    section: moduleLabel(entry.module),
    message: `Lecture seule : ${entry.reason}`,
    tone: 'req',
    nums: moduleSectionNums(entry.module),
  }));
  return [...failed, ...blocked];
}

/** Convert a publish RPC rejection into a single Publication req Issue. */
export function publishErrorToIssue(error: unknown): Issue {
  return {
    section: 'Publication',
    message: error instanceof Error ? error.message : 'Publication impossible.',
    tone: 'req',
    // `section` reste le LIBELLÉ (aucune ancre `section-Publication` n'existe) ; le saut passe
    // par le numéro réel du §21, vérifié sur SectionPublication.tsx.
    nums: ['21'],
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
