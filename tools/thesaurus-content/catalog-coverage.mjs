import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const discoveryAt = args.indexOf('--check-discovered');
const inputPath = args[0] && args[0] !== '--check-discovered'
  ? path.resolve(args[0])
  : path.join(here, 'catalog-coverage.json');
const report = JSON.parse(await readFile(inputPath, 'utf8'));
const entries = report.catalogs;
const errors = [];
if (!Array.isArray(entries)) errors.push('catalogs must be an array');
const byKey = new Map((entries ?? []).map((entry) => [entry.key, entry]));
if (byKey.size !== (entries ?? []).length) errors.push('duplicate key in captured coverage');
const discoveryTest = await readFile(path.resolve(here, '../../Base de donnée DLL et API/tests/test_thesaurus_catalog_coverage.sql'), 'utf8');
const expectedLiteral = discoveryTest.match(/expected CONSTANT text\[\] := ARRAY\[([\s\S]*?)\n  \];/);
const testedKeys = expectedLiteral ? [...expectedLiteral[1].matchAll(/'([^']+)'/g)].map(match => match[1]).sort() : [];
if (JSON.stringify(testedKeys) !== JSON.stringify([...byKey.keys()].sort())) {
  errors.push('the fresh-schema live-discovery invariant must classify the same keys as the catalog matrix');
}
for (const entry of entries ?? []) {
  for (const field of [
    'name', 'table', 'kind', 'rows', 'semantic_role', 'adapter', 'treatment',
    'row_coverage_status', 'edge_coverage_status', 'columns', 'pk', 'incoming',
    'outgoing', 'rls', 'policies', 'visibility_effect',
  ]) {
    if (entry[field] === undefined || entry[field] === null || entry[field] === '') {
      errors.push(`${entry.key ?? '<unknown>'} missing ${field}`);
    }
  }
  if (!Object.hasOwn(entry, 'missing_identities')) {
    errors.push(`${entry.key}: missing_identities classification`);
  }
}
if (discoveryAt >= 0) {
  const freshPath = args[discoveryAt + 1];
  if (!freshPath) errors.push('--check-discovered requires a JSON file');
  else {
    const fresh = JSON.parse(await readFile(path.resolve(freshPath), 'utf8'));
    const catalogs = Array.isArray(fresh) ? fresh : fresh.catalogs;
    if (!Array.isArray(catalogs)) errors.push('discovery input must be an array or contain catalogs[]');
    else {
      const keys = catalogs.map((item) => typeof item === 'string' ? item : item.catalog_key ?? item.key);
      for (const key of keys) if (!byKey.has(key)) errors.push(`new catalog key lacks deliberate classification: ${key}`);
      for (const key of byKey.keys()) if (!keys.includes(key)) errors.push(`captured key absent from fresh discovery: ${key}`);
    }
  }
}
if (errors.length) {
  process.stderr.write(`${errors.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(JSON.stringify({ catalog_keys: byKey.size, classified: true }) + '\n');
}
