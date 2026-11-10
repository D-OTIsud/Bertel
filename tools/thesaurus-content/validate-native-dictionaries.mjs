import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const includePrivate = process.argv.includes('--include-private');
if (process.argv.slice(2).some(arg => arg !== '--include-private')) throw new Error('Only --include-private is supported');
const context = JSON.parse(fs.readFileSync(path.join(root, 'tools/thesaurus-content/lots/2026-11-10-native-dictionaries/public-source-index.json'), 'utf8'));
const privateContext = includePrivate ? JSON.parse(fs.readFileSync(path.join(root, '.tmp-thesaurus-definitions-20261110/native-role-context.json'), 'utf8')) : { rows: [] };
const oldDomains = JSON.parse(fs.readFileSync(path.join(root, 'tools/thesaurus-content/domain-labels.i18n.json'), 'utf8'));
const pub = JSON.parse(fs.readFileSync(path.join(root, 'tools/thesaurus-content/lots/2026-11-10-native-dictionaries/public-other-58.json'), 'utf8'));
const groups = JSON.parse(fs.readFileSync(path.join(root, 'tools/thesaurus-content/lots/2026-11-10-native-dictionaries/groups.reviewed.json'), 'utf8'));
const priv = includePrivate ? JSON.parse(fs.readFileSync(path.join(root, '.tmp-thesaurus-definitions-20261110/native-role-content.json'), 'utf8')) : { rows: [] };
const locales = ['fr', 'en', 'es', 'de'];
const expected = new Map([
  ['capacity_metric', 12], ['iti_assoc_role', 8], ['object_relation_type', 10],
  ['legal_type', 21], ['review_source', 7], ['sustainability_group', 76],
  ...(includePrivate ? [['actor_role', 5], ['contact_role', 6], ['org_role', 3]] : []),
]);
const errors = [];
const key = r => `${r.domain}\0${r.source_kind}\0${r.source_id}\0${r.code}`;
const expectedRows = [...context.rows, ...privateContext.rows.map(r => ({ domain:r.domain, source_kind:r.domain, source_id:r.id, code:r.code }))];
for (const row of groups.rows) {
  if (Object.keys(row).sort().join(',') !== 'code,definitions,domain,preferred_labels,source_id,source_kind') errors.push(`unexpected/protected group field at ${row.code}`);
  const source = context.rows.find(s => s.domain === row.domain && s.source_id === row.source_id && s.code === row.code);
  if (!source || row.preferred_labels?.fr !== source.name || row.definitions?.fr !== source.description) errors.push(`group French source drift at ${row.code}`);
}
const rows = [...pub.rows, ...priv.rows, ...groups.rows.map(({ preferred_labels, definitions, ...identity }) => ({ ...identity, name: preferred_labels, definition: definitions }))];
if (pub.rows.length !== 58) errors.push(`public rows: expected 58, got ${pub.rows.length}`);
if (includePrivate && priv.rows.length !== 14) errors.push(`private rows: expected 14, got ${priv.rows.length}`);
if (groups.rows.length !== 76) errors.push(`group rows: expected 76, got ${groups.rows.length}`);
const expectedCount = includePrivate ? 148 : 134;
if (rows.length !== expectedCount) errors.push(`total rows: expected ${expectedCount}, got ${rows.length}`);
const count = new Map();
const seen = new Set();
const expectedKeys = new Set(expectedRows.map(key));
for (const r of rows) {
  count.set(r.domain, (count.get(r.domain) ?? 0) + 1);
  const id = key(r);
  if (seen.has(id)) errors.push(`duplicate identity ${id.replaceAll('\0', '|')}`);
  seen.add(id);
  if (!expectedKeys.has(id)) errors.push(`unexpected identity ${id.replaceAll('\0', '|')}`);
  if (Object.keys(r).sort().join(',') !== 'code,definition,domain,name,source_id,source_kind') errors.push(`unexpected/protected field at ${r.domain}/${r.code}`);
  for (const field of ['name', 'definition']) {
    if (!r[field] || Object.keys(r[field]).sort().join(',') !== locales.slice().sort().join(',')) errors.push(`locale keys missing for ${r.domain}/${r.code}/${field}`);
    else for (const locale of locales) {
      const value = r[field][locale];
      if (typeof value !== 'string' || !value.trim()) errors.push(`blank ${r.domain}/${r.code}/${field}/${locale}`);
      if (field === 'definition' && typeof value === 'string') {
        if (value.trim().toLocaleLowerCase() === r.name[locale]?.trim().toLocaleLowerCase()) errors.push(`definition repeats name ${r.domain}/${r.code}/${locale}`);
        if (/^(concept|entry|item) (of|in|du|de|del) /i.test(value.trim())) errors.push(`placeholder-style definition ${r.domain}/${r.code}/${locale}`);
      }
    }
  }
  if (expected.has(r.domain) && !expectedRows.some(x => key(x) === id)) errors.push(`source identity mismatch ${r.domain}/${r.code}`);
}
for (const [domain, n] of expected) if ((count.get(domain) ?? 0) !== n) errors.push(`${domain}: expected ${n}, got ${count.get(domain) ?? 0}`);
for (const domain of expected.keys()) if (Object.hasOwn(oldDomains, domain)) errors.push(`overlaps completed workspace domain ${domain}`);
if (seen.size !== expectedKeys.size || [...expectedKeys].some(k => !seen.has(k))) errors.push(`corpus identity mismatch: expected ${expectedKeys.size}, received ${seen.size}`);
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(JSON.stringify({ ok:true, scope:includePrivate ? 'all nine dictionaries (private context remains local)' : 'six public dictionaries', rows:rows.length, counts:Object.fromEntries([...expected.keys()].map(k => [k, count.get(k)])), locales }, null, 2));
