import { analyseThesaurusContentBatch, parseThesaurusContentBatch, type ThesaurusContentBatch, type ThesaurusImportConcept } from './thesaurus-content-batch';

const id = '00000000-0000-4000-8000-000000000001';
const fingerprint = 'a'.repeat(32);
const proposal = { concept_id: id, domain: 'classification_value', context_key: 'scheme-a', code: '1', base: { description: 'Ancienne définition.' }, changes: { description: 'Niveau une étoile du classement hôtelier.' } };
const batch = (): ThesaurusContentBatch => ({ format_version: 1, batch_id: 'hotel-2026', proposals: [JSON.parse(JSON.stringify(proposal))] });
const concept = (overrides: Partial<ThesaurusImportConcept> = {}): ThesaurusImportConcept => ({ ...proposal, name: 'Une étoile', description: 'Ancienne définition.', source_fingerprint: fingerprint, revision: null, ...overrides });

describe('browser content correction preflight', () => {
  it('accepts the existing versioned format and a complete 1477-concept import', () => {
    const input = batch();
    input.proposals = Array.from({ length: 1477 }, (_, index) => ({ ...proposal, concept_id: undefined, code: String(index) }));
    expect(parseThesaurusContentBatch(JSON.stringify(input)).proposals).toHaveLength(1477);
    expect(() => parseThesaurusContentBatch('{')).toThrow(/JSON/);
  });
  it('requires exact bases, editable fields and unique qualified identities', () => {
    const input = batch();
    input.proposals.push({ ...proposal });
    expect(() => parseThesaurusContentBatch(JSON.stringify(input))).toThrow(/plusieurs fois/);
    expect(() => parseThesaurusContentBatch(JSON.stringify({ ...batch(), proposals: [{ ...proposal, base: {} }] }))).toThrow(/valeur précédente/);
    expect(() => parseThesaurusContentBatch(JSON.stringify({ ...batch(), proposals: [{ ...proposal, base: { definitions: {} }, changes: { definitions: { fr: 'Définition' } } }] }))).toThrow(/autorisé/);
  });
  it('resolves the complete domain/context/code identity and checks optional UUIDs', () => {
    const input = batch();
    expect(analyseThesaurusContentBatch(input, [concept({ context_key: 'scheme-b' })]).results[0]).toMatchObject({ status: 'conflict' });
    expect(analyseThesaurusContentBatch(input, [concept({ concept_id: '00000000-0000-4000-8000-000000000002' })]).results[0].reason).toMatch(/identifiant/);
    expect(analyseThesaurusContentBatch(input, [concept()]).results[0]).toMatchObject({ status: 'ready', source_fingerprint: fingerprint });
  });
  it('never replaces an existing draft, even if all requested fields are already equal', () => {
    expect(analyseThesaurusContentBatch(batch(), [concept({ description: proposal.changes.description, revision: { status: 'draft' } })]).results[0]).toMatchObject({ status: 'conflict', reason: expect.stringMatching(/brouillon existe/) });
  });
  it('recognizes unchanged fields before checking old bases and ignores object key order', () => {
    const input = batch();
    input.proposals[0].base = { description_i18n: { en: 'Old', fr: 'Ancienne' } };
    input.proposals[0].changes = { description_i18n: { fr: 'Nouvelle', en: 'New' } };
    expect(analyseThesaurusContentBatch(input, [concept({ description_i18n: { en: 'New', fr: 'Nouvelle' } })]).results[0].status).toBe('unchanged');
  });
  it('retains exact French i18n bases and refuses field-level or fingerprint changes', () => {
    const input = batch();
    input.proposals[0].base = { description_i18n: { fr: 'Ancienne' } };
    input.proposals[0].changes = { description_i18n: { fr: 'Nouvelle' } };
    expect(analyseThesaurusContentBatch(input, [concept({ description_i18n: {} })]).results[0]).toMatchObject({ status: 'conflict', fields: ['description_i18n'] });
    input.proposals[0].expected_source_fingerprint = 'b'.repeat(32);
    expect(analyseThesaurusContentBatch(input, [concept()]).results[0].reason).toMatch(/source a changé/);
  });
});
