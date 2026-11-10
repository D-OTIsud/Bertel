#!/usr/bin/env node
/** Offline only: reconcile a complete concept-by-concept editorial review with its source. */
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateBatch } from './propose-content.mjs';

export const REVIEW_FIELDS = ['preferred_labels', 'definitions', 'translations', 'labels', 'notes',
  'relations', 'parent_context', 'mappings', 'lifecycle', 'legacy_search_terms'];
const LANGUAGES = ['fr', 'en', 'es', 'de'];
const EDITABLE = new Set(['name', 'description', 'name_i18n', 'description_i18n', 'labels', 'notes',
  'mappings', 'relations', 'replaced_by', 'parent_concept_id', 'lifecycle', 'assignable', 'valid_from', 'valid_to']);
const record = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const canonical = (x) => Array.isArray(x) ? `[${x.map(canonical).join(',')}]`
  : record(x) ? `{${Object.keys(x).sort().map((key) => `${JSON.stringify(key)}:${canonical(x[key])}`).join(',')}}` : JSON.stringify(x);
const identity = (c) => JSON.stringify([c.domain, c.context_key ?? '', c.code]);
export const normalizeText = (x) => typeof x === 'string' ? x.normalize('NFKC').toLocaleLowerCase('fr').replace(/[\p{P}\p{Z}\p{Cf}\s]/gu, '') : '';
const realText = (x) => typeof x === 'string' && /[^\s\p{Z}\p{Cf}]/u.test(x);
const cleanText = (x) => realText(x) && !/[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(x);
const languageTag = (x) => typeof x === 'string' && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(x);
const array = (x) => Array.isArray(x) ? x : [];
const RELATION_TYPES = new Set(['related', 'exact_equivalent', 'replaced_by']);
const NOTE_TYPES = new Set(['scope', 'definition', 'history', 'source']);
// Mirrors validate_document: parents express hierarchy, relation types do not.
const compatibleParent = (child, parent) => (
  (child.source_kind === 'ref_code' && parent.domain === child.domain)
  || (child.source_kind === 'amenity' && parent.source_kind === 'ref_code' && parent.domain === 'amenity_family')
  || (child.source_kind === 'classification_value' && (
    (parent.source_kind === 'classification_value' && parent.context_key === child.context_key)
    || (parent.source_kind === 'classification_scheme' && parent.source_id === child.context_key)))
  || (child.source_kind === 'sustainability_action' && parent.source_kind === 'sustainability_category' && parent.source_id === child.context_key)
);
const placeholders = new Set(['todo', 'tbd', 'àcompléter', 'acompleter', 'na']);
const fail = (message) => { throw new Error(message); };

/** Completeness is mechanical evidence; the supplied decisions remain editorial responsibility. */
export function assembleReviewedContent(workspace, reviewFiles, { batchId = 'bertel-editorial-2026-11' } = {}) {
  if (!record(workspace) || !Array.isArray(workspace.concepts) || !Array.isArray(workspace.domains)) fail('Complete source workspace required.');
  const sources = new Map(); const sourceIds = new Set(); const domains = new Map(workspace.domains.map((d) => [d.domain, d]));
  for (const concept of workspace.concepts) {
    const key = identity(concept);
    if (!concept.concept_id || sources.has(key) || sourceIds.has(concept.concept_id) || !domains.has(concept.domain)) fail(`Ambiguous source identity: ${key}`);
    sources.set(key, concept); sourceIds.add(concept.concept_id);
  }
  const reviews = new Map();
  for (const file of reviewFiles) {
    if (!record(file) || file.format_version !== 1 || !domains.has(file.domain) || !Array.isArray(file.reviews)
      || !Array.isArray(file.checked_fields) || REVIEW_FIELDS.some((field) => !file.checked_fields.includes(field))) fail(`Incomplete review contract: ${file?.domain}`);
    for (const review of file.reviews) {
      const key = identity(review); const source = sources.get(key);
      if (!source || review.domain !== file.domain || review.concept_id !== source.concept_id || reviews.has(key)) fail(`Duplicate or mismatched review: ${key}`);
      if (!['kept', 'rewritten', 'needs_business_decision'].includes(review.disposition) || !realText(review.reason)) fail(`Missing editorial decision: ${key}`);
      const changes = review.changes ?? {};
      if (!record(changes) || Object.keys(changes).some((field) => !EDITABLE.has(field) || !Object.hasOwn(source, field))) fail(`Unsupported change: ${key}`);
      if (review.disposition === 'kept' && Object.keys(changes).length) fail(`Kept concept has changes: ${key}`);
      for (const field of ['name_i18n', 'description_i18n']) {
        if (Object.hasOwn(changes, field) && (!record(changes[field]) || Object.keys(source[field] ?? {}).some((lang) => !Object.hasOwn(changes[field], lang)))) fail(`A translated map loses an existing language: ${key}/${field}`);
      }
      reviews.set(key, review);
    }
  }
  const missing = [...sources.keys()].filter((key) => !reviews.has(key));
  if (missing.length) fail(`Unreviewed concepts (${missing.length}): ${missing.slice(0, 5).join(', ')}`);
  const errors = []; const warnings = []; const proposals = []; const concepts = []; const counts = {};
  for (const [key, source] of sources) {
    const review = reviews.get(key); const changes = Object.fromEntries(Object.entries(review.changes ?? {})
      .filter(([field, value]) => canonical(source[field]) !== canonical(value)));
    const concept = { ...source, ...changes }; concepts.push(concept);
    counts[source.domain] ??= { reviewed: 0, kept: 0, rewritten: 0, needs_business_decision: 0, proposals: 0 };
    const count = counts[source.domain]; count.reviewed++; count[review.disposition]++;
    if (review.disposition === 'needs_business_decision') errors.push({ identity: key, field: 'decision', reason: review.reason });
    for (const field of ['name_i18n', 'description_i18n']) {
      if (!record(concept[field]) || Object.keys(concept[field]).some((lang) => !languageTag(lang))) errors.push({ identity: key, field, reason: 'Expected a complete map with valid language tags.' });
    }
    const names = { ...(record(concept.name_i18n) ? concept.name_i18n : {}), fr: concept.name };
    const definitions = { ...(record(concept.description_i18n) ? concept.description_i18n : {}), fr: concept.description };
    const languages = new Set([...LANGUAGES, ...(domains.get(source.domain).required_languages ?? []), ...Object.keys(names), ...Object.keys(definitions)]);
    for (const lang of languages) {
      for (const [field, value] of [['name', names[lang]], ['definition', definitions[lang]]]) {
        if (!cleanText(value) || !normalizeText(value)) errors.push({ identity: key, field: `${field}.${lang}`, reason: 'Missing or invalid text.' });
      }
      const normalized = normalizeText(definitions[lang]);
      if (normalized && (normalized === normalizeText(names[lang]) || placeholders.has(normalized))) errors.push({ identity: key, field: `definition.${lang}`, reason: 'Repeated label or provisional text.' });
    }
    for (const [field, value] of [['name_i18n', concept.name], ['description_i18n', concept.description]]) {
      if (concept[field]?.fr != null && concept[field].fr !== value) errors.push({ identity: key, field: `${field}.fr`, reason: 'French translation differs from the authoritative French field.' });
    }
    if (/(?:local.*(?:food|product)|produit.*loca|achat.*loca)/iu.test(`${source.code} ${source.name} ${source.description} ${concept.name} ${concept.description}`)
      && /(?:produits? indigènes?|indigenous (?:food|products?)|indigene(?:n|r|s)? (?:produkte|lebensmittel|erzeugnisse|waren))/iu.test(canonical({ names, definitions, labels: concept.labels }))) errors.push({ identity: key, field: 'translation', reason: 'Local products must not be translated as indigenous products.' });
    for (const field of ['labels', 'notes', 'relations', 'mappings', 'replaced_by']) if (!Array.isArray(concept[field])) errors.push({ identity: key, field, reason: 'Expected a complete array.' });
    for (const label of array(concept.labels)) {
      if (!record(label) || !languageTag(label.lang) || !['alt', 'hidden'].includes(label.kind) || !cleanText(label.value)) { errors.push({ identity: key, field: 'labels', reason: 'Invalid label language, type or text.' }); continue; }
      if (label.kind === 'alt' && normalizeText(label.value) === normalizeText(names[label.lang])) warnings.push({ identity: key, field: 'labels', reason: 'Redundant editorial synonym.' });
    }
    for (const note of array(concept.notes)) if (!record(note) || !languageTag(note.lang) || !NOTE_TYPES.has(note.type) || !cleanText(note.value)) errors.push({ identity: key, field: 'notes', reason: 'Invalid note language, type or text.' });
    for (const mapping of array(concept.mappings)) {
      if (!record(mapping) || !['exactMatch', 'closeMatch', 'broadMatch', 'narrowMatch', 'relatedMatch'].includes(mapping.type) || !/^(?:https?:\/\/|urn:)/iu.test(mapping.target_uri ?? '')
        || !cleanText(mapping.source) || !cleanText(mapping.vocabulary)) errors.push({ identity: key, field: 'mappings', reason: 'Mapping requires a valid type, URI, vocabulary and source.' });
    }
    if (!['active', 'deprecated', 'retired'].includes(concept.lifecycle) || typeof concept.assignable !== 'boolean') errors.push({ identity: key, field: 'lifecycle', reason: 'Invalid lifecycle or assignability.' });
    if (Object.keys(changes).length) {
      count.proposals++;
      proposals.push({ concept_id: source.concept_id, domain: source.domain, context_key: source.context_key ?? '', code: source.code,
        base: Object.fromEntries(Object.keys(changes).map((field) => [field, source[field]])), changes });
    }
  }
  const indexed = new Map(concepts.map((c) => [c.concept_id, c]));
  const isAncestor = (ancestor, child) => {
    const seen = new Set(); let parent = indexed.get(child)?.parent_concept_id;
    while (parent && !seen.has(parent)) {
      if (parent === ancestor) return true;
      seen.add(parent); parent = indexed.get(parent)?.parent_concept_id;
    }
    return false;
  };
  const replacements = new Map(concepts.map((c) => [c.concept_id, new Set([
    ...array(c.replaced_by), ...array(c.relations).filter((r) => record(r) && r.type === 'replaced_by').map((r) => r.target_id),
  ].filter((target) => indexed.has(target)))]));
  const replacementCycle = (id, active = new Set(), seen = new Set()) => {
    if (active.has(id)) return true;
    if (seen.has(id)) return false;
    active.add(id);
    for (const next of replacements.get(id) ?? []) if (replacementCycle(next, active, seen)) return true;
    active.delete(id); seen.add(id); return false;
  };
  for (const concept of concepts) {
    const key = identity(concept);
    for (const relation of array(concept.relations)) {
      if (!record(relation) || !RELATION_TYPES.has(relation.type) || !indexed.has(relation.target_id) || relation.target_id === concept.concept_id) { errors.push({ identity: key, field: 'relations', reason: 'Invalid semantic relation type or target; hierarchy uses the parent.' }); continue; }
      if (relation.type === 'related' && (isAncestor(relation.target_id, concept.concept_id) || isAncestor(concept.concept_id, relation.target_id))) errors.push({ identity: key, field: 'relations', reason: 'A related concept cannot be a hierarchical ancestor or descendant.' });
    }
    for (const target of array(concept.replaced_by)) if (!indexed.has(target) || target === concept.concept_id) errors.push({ identity: key, field: 'replaced_by', reason: 'Invalid replacement target.' });
    if (replacementCycle(concept.concept_id)) errors.push({ identity: key, field: 'replaced_by', reason: 'Replacement cycle.' });
    if (concept.parent_concept_id && indexed.has(concept.parent_concept_id) && !compatibleParent(concept, indexed.get(concept.parent_concept_id))) errors.push({ identity: key, field: 'parent_concept_id', reason: 'Parent is incompatible with the source kind or qualified context.' });
    const visited = new Set([concept.concept_id]); let parent = concept.parent_concept_id;
    while (parent) {
      if (visited.has(parent) || !indexed.has(parent)) { errors.push({ identity: key, field: 'parent_concept_id', reason: 'Missing parent or hierarchical cycle.' }); break; }
      visited.add(parent); parent = indexed.get(parent).parent_concept_id;
    }
  }
  // Homonyms are reported, never treated as permission to merge independent concepts.
  const aliases = new Map();
  for (const c of concepts) for (const label of array(c.labels)) if (record(label) && label.kind === 'alt' && languageTag(label.lang) && cleanText(label.value)) {
    const key = JSON.stringify([c.domain, label.lang, normalizeText(label.value)]);
    if (!aliases.has(key)) aliases.set(key, new Set()); aliases.get(key).add(c.concept_id);
  }
  for (const [key, ids] of aliases) if (ids.size > 1) warnings.push({ field: 'labels', identity: key, reason: 'Shared editorial synonym: review its contexts without merging homonyms.', concept_ids: [...ids] });
  const batches = [];
  for (const domain of Object.keys(counts).sort()) {
    const items = proposals.filter((p) => p.domain === domain);
    for (let offset = 0; offset < items.length; offset += 1000) batches.push(validateBatch({ format_version: 1, batch_id: `${batchId}-${domain}-${offset / 1000 + 1}`, proposals: items.slice(offset, offset + 1000) }));
  }
  return { report: { format_version: 1, source_release_id: workspace.source_release_id, reviewed: reviews.size,
    domains: counts, proposals: proposals.length, ready: errors.length === 0, errors, warnings,
    limits: 'Mechanical checks establish completeness and structural consistency. Editorial reasons document the review; they do not certify providers or independent human/native review.' },
    batches, combined: { format_version: 1, batch_id: batchId, proposals } };
}

export async function main(args = process.argv.slice(2)) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--workspace', '--reviews', '--output'].includes(args[i]) || !args[i + 1] || options[args[i]]) fail('Usage: --workspace complete.json --reviews directory --output directory');
    options[args[i]] = args[i + 1];
  }
  if (Object.keys(options).length !== 3) fail('All three offline paths are required.');
  const workspace = JSON.parse(await readFile(resolve(options['--workspace']), 'utf8'));
  const dir = resolve(options['--reviews']); const reviews = [];
  for (const name of (await readdir(dir)).filter((n) => n.endsWith('.json')).sort()) reviews.push(JSON.parse(await readFile(join(dir, name), 'utf8')));
  const result = assembleReviewedContent(workspace, reviews); const output = resolve(options['--output']);
  await mkdir(output, { recursive: true });
  await writeFile(join(output, 'review-report.json'), `${JSON.stringify(result.report, null, 2)}\n`);
  if (!result.report.ready) { process.stdout.write(`${result.report.errors.length} blocking issues; review-report.json written, no batches generated.\n`); return 2; }
  for (const batch of result.batches) await writeFile(join(output, `${batch.batch_id}.json`), `${JSON.stringify(batch, null, 2)}\n`);
  await writeFile(join(output, 'all-reviewed-corrections.json'), `${JSON.stringify(result.combined, null, 2)}\n`);
  process.stdout.write(`${result.report.reviewed} concepts reviewed, ${result.report.proposals} proposals, ${result.report.warnings.length} warnings. No network access or writes to the thesaurus.\n`);
  return 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().then((code) => { process.exitCode = code; }).catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
