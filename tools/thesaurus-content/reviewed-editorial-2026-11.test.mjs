import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { validateBatch } from './propose-content.mjs';
import { REVIEW_FIELDS, normalizeText } from './assemble-reviewed-content.mjs';
const directory = new URL('./lots/2026-11-10-editorial-review/', import.meta.url);
const read = (name) => JSON.parse(readFileSync(new URL(name, directory), 'utf8'));
const manifest = read('review-decisions.json'); const report = read('review-report.json');
const batches = readdirSync(directory).filter((name) => /^corrections\..*\.json$/.test(name)).map(read);
const key = (c) => JSON.stringify([c.domain, c.context_key, c.code]);
const indexed = new Map(manifest.reviews.map((r) => [r.concept_id, r]));

test('the reviewed lot covers all 1477 identities and 78 domains, including private and historical concepts', () => {
  assert.equal(manifest.format_version, 1); assert.equal(manifest.source_release_id, 8);
  assert.equal(manifest.reviews.length, 1477); assert.equal(indexed.size, 1477);
  assert.equal(new Set(manifest.reviews.map(key)).size, 1477);
  assert.equal(new Set(manifest.reviews.map((r) => r.domain)).size, 78);
  assert.equal(report.baseline.outside_current_snapshot, 115);
  assert.equal(manifest.reviews.filter((r) => r.source_lifecycle === 'deprecated').length, 38);
  assert.match(report.source_workspace_sha256, /^[a-f0-9]{64}$/); assert.equal(report.source_export_stable, true);
});
test('every concept has a reason and complete contextual FR/EN/ES/DE definitions', () => {
  for (const review of manifest.reviews) {
    assert.ok(['kept', 'rewritten'].includes(review.disposition), key(review));
    assert.ok(review.reason.trim(), key(review));
    assert.deepEqual([...review.checked_fields].sort(), [...REVIEW_FIELDS].sort());
    assert.equal(review.result.preferred_labels.fr, review.result.name);
    for (const lang of ['fr', 'en', 'es', 'de']) {
      const name = review.result.preferred_labels[lang]; const definition = review.result.definitions[lang];
      assert.ok(normalizeText(name) && normalizeText(definition), `${key(review)}/${lang}`);
      assert.notEqual(normalizeText(name), normalizeText(definition), `${key(review)}/${lang}`);
      assert.ok(!['todo', 'tbd', 'àcompléter', 'acompleter'].includes(normalizeText(definition)));
    }
    assert.equal(review.result.lifecycle, review.source_lifecycle);
    assert.equal(review.result.assignable, review.source_assignable);
  }
});
test('each proposed update has its exact field base and belongs to a reviewed identity', () => {
  const ids = new Set(); let count = 0;
  for (const batch of batches) {
    validateBatch(batch);
    for (const proposal of batch.proposals) {
      assert.ok(!ids.has(proposal.concept_id)); ids.add(proposal.concept_id); count++;
      const review = indexed.get(proposal.concept_id); assert.ok(review); assert.equal(key(proposal), key(review));
      assert.deepEqual(Object.keys(proposal.base).sort(), Object.keys(proposal.changes).sort());
      assert.equal(proposal.expected_source_fingerprint, undefined, 'Fresh fingerprints are bound after deployment by the authenticated importer.');
      for (const field of ['lifecycle', 'assignable', 'parent_concept_id', 'relations', 'replaced_by', 'legacy_search_terms']) assert.ok(!(field in proposal.changes), field);
      for (const note of proposal.changes.notes ?? []) if (note.value.startsWith('Note éditoriale locale (enrichissement 2026-11) :')) assert.equal(note.type, 'history');
    }
  }
  assert.equal(count, report.proposals); assert.equal(count, 1449); assert.equal(batches.length, 78);
  assert.equal(report.ready, true); assert.deepEqual(report.errors, []); assert.deepEqual(report.warnings, []);
});

test('all final French names use display text without long dashes or raw technical keys', () => {
  for (const review of manifest.reviews) {
    assert.doesNotMatch(review.result.name, /[—–_]|taxonom(?:y|ie)/iu, key(review));
    assert.equal(review.result.preferred_labels.fr, review.result.name);
  }
  assert.equal(report.changed_documents.french_names, 174);
  assert.equal(report.changed_documents.labels, 143);
});

test('the approved 16-name follow-up changes only French names and preserves former names as hidden search terms', () => {
  const delta = validateBatch(read('french-names-delta.json'));
  assert.equal(delta.proposals.length, 16);
  assert.equal(new Set(delta.proposals.map((p) => p.concept_id)).size, 16);
  const proposals = new Map(batches.flatMap((batch) => batch.proposals).map((p) => [p.concept_id, p]));
  for (const proposal of delta.proposals) {
    assert.deepEqual(Object.keys(proposal.changes).sort(), ['labels', 'name', 'name_i18n']);
    assert.notEqual(proposal.base.name, proposal.changes.name);
    assert.equal(proposal.changes.name_i18n.fr, proposal.changes.name);
    for (const [lang, value] of Object.entries(proposal.base.name_i18n)) {
      if (lang !== 'fr') assert.equal(proposal.changes.name_i18n[lang], value, `${key(proposal)}/${lang}`);
    }
    const previous = proposal.changes.labels.filter((label) => label.lang === 'fr'
      && normalizeText(label.value) === normalizeText(proposal.base.name));
    assert.equal(previous.length, 1, key(proposal));
    assert.equal(previous[0].kind, 'hidden', key(proposal));
    assert.deepEqual(proposal.changes.labels.filter((label) => label.lang !== 'fr'),
      proposal.base.labels.filter((label) => label.lang !== 'fr'), key(proposal));
    const correction = proposals.get(proposal.concept_id);
    assert.ok(correction, key(proposal));
    for (const field of ['name', 'name_i18n', 'labels']) {
      assert.deepEqual(proposal.changes[field], correction.changes[field], `${key(proposal)}/${field}`);
    }
    assert.equal(indexed.get(proposal.concept_id).result.name, proposal.changes.name, key(proposal));
  }
});
