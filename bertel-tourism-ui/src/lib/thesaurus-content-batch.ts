/** Browser-safe analysis for the versioned correction format used by propose-content.mjs. */
export type ContentObject = Record<string, unknown>;
export interface ThesaurusContentProposal {
  domain: string;
  context_key: string;
  code: string;
  concept_id?: string;
  expected_source_fingerprint?: string;
  base: ContentObject;
  changes: ContentObject;
}
export interface ThesaurusContentBatch {
  format_version: 1;
  batch_id: string;
  proposals: ThesaurusContentProposal[];
}
export interface ThesaurusImportConcept extends ContentObject {
  concept_id: string;
  domain: string;
  context_key: string;
  code: string;
  source_fingerprint: string;
  revision?: unknown;
}
export interface ThesaurusImportResult {
  proposal: ThesaurusContentProposal;
  status: 'ready' | 'unchanged' | 'conflict';
  concept_id?: string;
  name?: string;
  source_fingerprint?: string;
  reason?: string;
  fields?: string[];
}
export interface ThesaurusImportAnalysis {
  batch_id: string;
  results: ThesaurusImportResult[];
}
const EDITABLE_FIELDS = new Set(['name', 'description', 'name_i18n', 'description_i18n', 'labels', 'notes',
  'mappings', 'relations', 'replaced_by', 'parent_concept_id', 'lifecycle', 'assignable',
  'valid_from', 'valid_to', 'legacy_search_terms']);
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const FINGERPRINT = /^[a-f0-9]{32}$/;
export const isContentObject = (value: unknown): value is ContentObject => value !== null && typeof value === 'object' && !Array.isArray(value);
export const contentKey = (value: { domain: string; context_key: string; code: string }) => JSON.stringify([value.domain, value.context_key, value.code]);
function canonical(value: unknown): string | undefined {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isContentObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function parseThesaurusContentBatch(text: string): ThesaurusContentBatch {
  if (text.length > 20_000_000) throw new Error('Le lot dépasse la limite de 20 Mo. Répartissez-le en plusieurs lots.');
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error('Le JSON est invalide. Corrigez sa syntaxe avant de l’analyser.'); }
  if (!isContentObject(data) || data.format_version !== 1 || typeof data.batch_id !== 'string'
    || !data.batch_id.trim() || data.batch_id.length > 160 || !Array.isArray(data.proposals)
    || data.proposals.length < 1 || data.proposals.length > 2000) {
    throw new Error('Le lot doit contenir format_version: 1, un batch_id et de 1 à 2 000 propositions.');
  }
  const identities = new Set<string>();
  const ids = new Set<string>();
  for (const proposal of data.proposals) {
    if (!isContentObject(proposal) || typeof proposal.domain !== 'string' || !/^[a-z][a-z0-9_]{0,79}$/.test(proposal.domain)
      || typeof proposal.context_key !== 'string' || typeof proposal.code !== 'string' || !proposal.code
      || !isContentObject(proposal.base) || !isContentObject(proposal.changes)) throw new Error('Une proposition n’a pas d’identité complète (domaine, contexte, code) ou de contenu valide.');
    const base = proposal.base;
    const fields = Object.keys(proposal.changes);
    if (!fields.length || fields.some((key) => !EDITABLE_FIELDS.has(key) || !Object.hasOwn(base, key))
      || Object.keys(base).some((key) => !fields.includes(key))) throw new Error('Chaque champ modifié doit être autorisé et avoir sa valeur précédente exacte dans base.');
    if (proposal.expected_source_fingerprint !== undefined && (typeof proposal.expected_source_fingerprint !== 'string' || !FINGERPRINT.test(proposal.expected_source_fingerprint))) throw new Error('Une empreinte de source est invalide.');
    if (proposal.concept_id !== undefined && (typeof proposal.concept_id !== 'string' || !UUID.test(proposal.concept_id))) throw new Error('Un identifiant de concept est invalide.');
    const key = contentKey(proposal as unknown as ThesaurusContentProposal);
    if (identities.has(key) || (typeof proposal.concept_id === 'string' && ids.has(proposal.concept_id))) throw new Error('Un même concept apparaît plusieurs fois dans le lot.');
    identities.add(key);
    if (typeof proposal.concept_id === 'string') ids.add(proposal.concept_id);
  }
  return data as unknown as ThesaurusContentBatch;
}
export function analyseThesaurusContentBatch(batch: ThesaurusContentBatch, concepts: ThesaurusImportConcept[]): ThesaurusImportAnalysis {
  const indexed = new Map<string, ThesaurusImportConcept>();
  for (const concept of concepts) {
    const key = contentKey(concept);
    if (indexed.has(key)) throw new Error('La source contient plusieurs concepts pour la même identité. Rechargez le lot.');
    indexed.set(key, concept);
  }
  return { batch_id: batch.batch_id, results: batch.proposals.map((proposal) => {
    const concept = indexed.get(contentKey(proposal));
    const result: ThesaurusImportResult = { proposal, status: 'conflict' };
    if (!concept) return { ...result, reason: 'Concept introuvable dans la version courante.' };
    result.concept_id = concept.concept_id; result.name = String(concept.name ?? proposal.code);
    if (!UUID.test(concept.concept_id) || !FINGERPRINT.test(concept.source_fingerprint)) return { ...result, reason: 'Identité ou empreinte de source invalide.' };
    if (proposal.concept_id && proposal.concept_id !== concept.concept_id) return { ...result, reason: 'L’identifiant ne correspond pas au domaine, au contexte et au code.' };
    if (concept.revision != null) return { ...result, reason: 'Un brouillon existe déjà : il doit être relu séparément.' };
    if (proposal.expected_source_fingerprint && proposal.expected_source_fingerprint !== concept.source_fingerprint) return { ...result, reason: 'La source a changé depuis la préparation du lot.' };
    const fields = Object.keys(proposal.changes);
    if (fields.every((field) => canonical(concept[field]) === canonical(proposal.changes[field]))) return { ...result, status: 'unchanged' };
    const conflicts = fields.filter((field) => canonical(concept[field]) !== canonical(proposal.base[field]));
    if (conflicts.length) return { ...result, reason: 'La valeur courante diffère de la valeur précédente du lot.', fields: conflicts };
    return { ...result, status: 'ready', source_fingerprint: concept.source_fingerprint };
  }) };
}
