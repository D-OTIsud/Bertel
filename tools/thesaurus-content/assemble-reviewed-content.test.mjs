import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleReviewedContent, REVIEW_FIELDS } from './assemble-reviewed-content.mjs';
const id = '00000000-0000-4000-8000-000000000001';
const fixture = () => ({ source_release_id: 8, domains: [{ domain: 'amenity', required_languages: ['fr'] }], concepts: [{
  concept_id: id, domain: 'amenity', context_key: 'room', code: 'screen', name: 'Écran',
  description: 'Surface recevant une image projetée dans une salle de réunion.',
  name_i18n: { fr: 'Écran', en: 'Screen', es: 'Pantalla', de: 'Leinwand' },
  description_i18n: { fr: 'Surface recevant une image projetée dans une salle de réunion.', en: 'Surface receiving a projected image in a meeting room.', es: 'Superficie para una imagen proyectada en una sala de reuniones.', de: 'Fläche für projizierte Bilder in einem Besprechungsraum.' },
  labels: [], notes: [], mappings: [], relations: [], replaced_by: [], parent_concept_id: null, lifecycle: 'active', assignable: true,
}] });
const review = (source, changes = {}) => [{ format_version: 1, domain: 'amenity', checked_fields: [...REVIEW_FIELDS], reviews: [{
  concept_id: id, domain: 'amenity', context_key: 'room', code: 'screen', disposition: Object.keys(changes).length ? 'rewritten' : 'kept',
  reason: 'Le texte distingue la surface de projection du projecteur de la salle.', changes,
}] }];
test('complete contextual four-language content is accepted without inventing changes or relations', () => {
  const source = fixture(); const result = assembleReviewedContent(source, review(source));
  assert.equal(result.report.ready, true); assert.equal(result.report.reviewed, 1); assert.equal(result.batches.length, 0);
  assert.equal(source.concepts[0].relations.length, 0);
});
test('no unreviewed, duplicate or mismatched qualified identity can pass', () => {
  const source = fixture();
  assert.throws(() => assembleReviewedContent(source, []), /Unreviewed/);
  const files = review(source); files[0].reviews.push({ ...files[0].reviews[0] });
  assert.throws(() => assembleReviewedContent(source, files), /Duplicate/);
  files[0].reviews.pop(); files[0].reviews[0].context_key = 'other';
  assert.throws(() => assembleReviewedContent(source, files), /mismatched/);
});
test('every field family must be explicitly reviewed, including legacy and private context', () => {
  const source = fixture(); const files = review(source); files[0].checked_fields.pop();
  assert.throws(() => assembleReviewedContent(source, files), /Incomplete review/);
});
test('tautologies, Unicode-only blanks, provisional text and missing German block output', () => {
  for (const de of ['Leinwand.', '\u200b\u00a0\ufeff', 'TBD', undefined]) {
    const source = fixture(); source.concepts[0].description_i18n.de = de;
    const result = assembleReviewedContent(source, review(source));
    assert.equal(result.report.ready, false, String(de));
    assert.ok(result.report.errors.some((error) => error.field === 'definition.de'));
  }
});
test('extra languages are preserved and checked; French is synchronized', () => {
  const source = fixture(); source.concepts[0].name_i18n.it = 'Schermo'; source.concepts[0].description_i18n.it = 'Superficie per proiettare immagini in una sala riunioni.';
  const next = { ...source.concepts[0].description_i18n }; delete next.it;
  assert.throws(() => assembleReviewedContent(source, review(source, { description_i18n: next })), /loses an existing language/);
  source.concepts[0].description_i18n.fr = 'Autre texte';
  assert.ok(assembleReviewedContent(source, review(source)).report.errors.some((e) => e.field === 'description_i18n.fr'));
});
test('proposals preserve exact field bases and UUID but omit deployment-stale fingerprints', () => {
  const source = fixture(); const next = 'Surface de projection disponible dans une salle de réunion, distincte du projecteur.';
  const result = assembleReviewedContent(source, review(source, { description: next, description_i18n: { ...source.concepts[0].description_i18n, fr: next } }));
  assert.equal(result.report.ready, true); const proposal = result.batches[0].proposals[0];
  assert.equal(proposal.concept_id, id); assert.equal(proposal.context_key, 'room');
  assert.deepEqual(proposal.base.description_i18n, source.concepts[0].description_i18n);
  assert.equal(proposal.base.description, source.concepts[0].description); assert.equal(proposal.expected_source_fingerprint, undefined);
});
test('real business uncertainty blocks readiness without being silently resolved', () => {
  const source = fixture(); const files = review(source); files[0].reviews[0].disposition = 'needs_business_decision';
  const result = assembleReviewedContent(source, files); assert.equal(result.report.ready, false);
  assert.equal(result.report.errors[0].field, 'decision');
});
test('semantic self-links and parent cycles are errors; homonyms are only contextual warnings', () => {
  const source = fixture(); source.concepts[0].relations = [{ type: 'related', target_id: id }]; source.concepts[0].parent_concept_id = id;
  const result = assembleReviewedContent(source, review(source));
  assert.ok(result.report.errors.some((e) => e.field === 'relations')); assert.ok(result.report.errors.some((e) => e.field === 'parent_concept_id'));
});
test('local product mistranslation is blocked without rejecting botanical native species', () => {
  const source = fixture(); source.concepts[0].name = 'Produits locaux'; source.concepts[0].name_i18n.fr = 'Produits locaux'; source.concepts[0].description_i18n.en = 'Indigenous products are offered to guests.';
  assert.ok(assembleReviewedContent(source, review(source)).report.errors.some((e) => e.field === 'translation'));
  source.concepts[0].name = 'Espèces locales'; source.concepts[0].name_i18n.fr = 'Espèces locales';
  source.concepts[0].description = source.concepts[0].description_i18n.fr = 'Plantation de végétaux adaptés au site.';
  source.concepts[0].description_i18n.en = 'Planting native species suited to the site.';
  assert.equal(assembleReviewedContent(source, review(source)).report.ready, true);
});

const secondId = '00000000-0000-4000-8000-000000000002';
function pair() {
  const source = fixture();
  source.concepts[0].source_kind = 'ref_code';
  source.concepts.push({ ...structuredClone(source.concepts[0]), concept_id: secondId, code: 'other_screen' });
  return source;
}
function reviewAll(source) {
  return source.domains.map(({ domain }) => ({ format_version: 1, domain, checked_fields: [...REVIEW_FIELDS],
    reviews: source.concepts.filter((c) => c.domain === domain).map((c) => ({ concept_id: c.concept_id,
      domain, code: c.code, context_key: c.context_key, disposition: 'kept',
      reason: 'La fonction de projection et son contexte de salle restent explicites dans les quatre langues.', changes: {} })) }));
}

test('internal relation types match SQL: exact equivalence is accepted and hierarchy uses parents', () => {
  const source = pair();
  source.concepts[0].relations = [{ type: 'exact_equivalent', target_id: secondId }];
  assert.equal(assembleReviewedContent(source, reviewAll(source)).report.ready, true);
  for (const type of ['broader', 'narrower']) {
    source.concepts[0].relations[0].type = type;
    assert.ok(assembleReviewedContent(source, reviewAll(source)).report.errors.some((e) => e.field === 'relations'), type);
  }
});

test('an association is valid between independent concepts but not between ancestor and descendant', () => {
  const source = pair(); source.concepts[0].relations = [{ type: 'related', target_id: secondId }];
  assert.equal(assembleReviewedContent(source, reviewAll(source)).report.ready, true);
  source.concepts[0].parent_concept_id = secondId;
  assert.ok(assembleReviewedContent(source, reviewAll(source)).report.errors.some((e) => e.field === 'relations' && /ancestor/.test(e.reason)));
});

test('a parent must match the source family and the qualified classification scheme', () => {
  const source = pair();
  source.concepts[0].source_kind = 'amenity';
  assert.equal(assembleReviewedContent(source, reviewAll(source)).report.ready, true);
  source.concepts[0].parent_concept_id = secondId;
  assert.ok(assembleReviewedContent(source, reviewAll(source)).report.errors.some((e) => e.field === 'parent_concept_id'));
  source.domains.push({ domain: 'amenity_family' }); source.concepts[1].domain = 'amenity_family';
  assert.equal(assembleReviewedContent(source, reviewAll(source)).report.ready, true);
  source.concepts[0].source_kind = 'classification_value'; source.concepts[0].context_key = 'scheme-a';
  source.concepts[1].source_kind = 'classification_scheme'; source.concepts[1].source_id = 'scheme-a';
  assert.equal(assembleReviewedContent(source, reviewAll(source)).report.ready, true);
  source.concepts[1].source_id = 'scheme-b';
  assert.ok(assembleReviewedContent(source, reviewAll(source)).report.errors.some((e) => e.field === 'parent_concept_id'));
});

test('replacement cycles are blocked across both stored representations', () => {
  const source = pair(); source.concepts[0].relations = [{ type: 'replaced_by', target_id: secondId }];
  assert.equal(assembleReviewedContent(source, reviewAll(source)).report.ready, true);
  source.concepts[1].replaced_by = [id];
  assert.ok(assembleReviewedContent(source, reviewAll(source)).report.errors.some((e) => e.field === 'replaced_by' && /cycle/.test(e.reason)));
});

test('a mapping requires its vocabulary and provenance and can use a URN supported by SQL', () => {
  const source = fixture();
  source.concepts[0].mappings = [{ type: 'closeMatch', target_uri: 'urn:example:screen', vocabulary: 'Example', source: 'Équivalence documentaire examinée.' }];
  assert.equal(assembleReviewedContent(source, review(source)).report.ready, true);
  for (const field of ['source', 'vocabulary']) {
    const mapping = source.concepts[0].mappings[0]; const before = mapping[field]; delete mapping[field];
    assert.ok(assembleReviewedContent(source, review(source)).report.errors.some((e) => e.field === 'mappings'), field);
    mapping[field] = before;
  }
});

test('bad lists and null members return structural errors instead of throwing type errors', () => {
  for (const field of ['labels', 'notes', 'relations', 'mappings', 'replaced_by']) {
    for (const value of [{}, null, [null]]) {
      const source = fixture(); source.concepts[0][field] = value;
      const result = assembleReviewedContent(source, review(source));
      assert.equal(result.report.ready, false, `${field}/${JSON.stringify(value)}`);
      assert.ok(result.report.errors.some((e) => e.field === field));
    }
  }
});

test('language codes, note types and punctuation-only definitions are validated as SQL text', () => {
  for (const note of [{ lang: 'French', type: 'scope', value: 'Un contexte.' }, { lang: 'fr', type: 'unrecognized', value: 'Un contexte.' }, { lang: 'fr', type: 'scope', value: '\uFFFD' }]) {
    const source = fixture(); source.concepts[0].notes = [note];
    assert.ok(assembleReviewedContent(source, review(source)).report.errors.some((e) => e.field === 'notes'));
  }
  const source = fixture(); source.concepts[0].description_i18n.de = '— …';
  assert.ok(assembleReviewedContent(source, review(source)).report.errors.some((e) => e.field === 'definition.de'));
  source.concepts[0].name_i18n['not_a_language'] = 'Nom';
  assert.ok(assembleReviewedContent(source, review(source)).report.errors.some((e) => e.field === 'name_i18n'));
});

test('local-product checks cover a changed French scope and German product variants', () => {
  const source = fixture(); const description = 'Produits locaux proposés dans la boutique.';
  const next = { ...source.concepts[0].description_i18n, fr: description, de: 'Indigene Erzeugnisse werden angeboten.' };
  const result = assembleReviewedContent(source, review(source, { description, description_i18n: next }));
  assert.ok(result.report.errors.some((e) => e.field === 'translation'));
});
