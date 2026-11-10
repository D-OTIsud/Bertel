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
