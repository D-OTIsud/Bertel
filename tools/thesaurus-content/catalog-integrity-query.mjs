import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ident = value => {
  if (typeof value !== 'string' || !/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error('Invalid catalog identifier');
  return `"${value}"`;
};
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const hash = text => createHash('sha256').update(text).digest('hex');

/** Read-only aggregate queries. No business values or row identities leave PostgreSQL. */
export function catalogIntegrityChecks(coverage, metadata) {
  if (!Array.isArray(coverage.catalogs) || !Array.isArray(metadata.foreign_keys)) throw new Error('Missing catalog metadata');
  const keys = new Set();
  const tables = new Set();
  const checks = [];
  for (const catalog of coverage.catalogs) {
    if (keys.has(catalog.key)) throw new Error('Duplicate catalog key');
    keys.add(catalog.key);
    tables.add(catalog.table);
    const table = `public.${ident(catalog.table)}`;
    let identity;
    let required;
    if (catalog.key === 'ref_interop_crosswalk') {
      // These are the two actual partial UNIQUE keys; the table has no PK.
      identity = `CASE WHEN s.taxonomy_code IS NULL THEN jsonb_build_array(s.profile,s.object_type,'type-default') ELSE jsonb_build_array(s.profile,s.object_type,s.taxonomy_domain,s.taxonomy_code) END`;
      required = `s.profile IS NULL OR s.object_type IS NULL OR (s.taxonomy_code IS NOT NULL AND s.taxonomy_domain IS NULL)`;
    } else {
      if (!Array.isArray(catalog.pk) || !catalog.pk.length) throw new Error(`Review identity for ${catalog.key}`);
      const columns = catalog.pk.map(column => `s.${ident(column.name)}`);
      identity = `jsonb_build_array(${columns.join(',')})`;
      required = columns.map(column => `${column} IS NULL`).join(' OR ');
    }
    const filter = catalog.kind === 'ref_code_domain' ? ` WHERE s.domain=${literal(catalog.domain)}` : '';
    checks.push({ id: `identity:${catalog.key}`, sql: `SELECT ${literal(`identity:${catalog.key}`)} check_id,jsonb_build_object('key',${literal(catalog.key)},'rows',count(*),'distinct_identities',count(DISTINCT identity),'duplicate_identities',count(*)-count(DISTINCT identity),'missing_key_components',count(*) FILTER(WHERE missing),'identity_checksum',md5(COALESCE(string_agg(identity::text,',' ORDER BY identity::text),''))) result FROM(SELECT ${identity} identity,(${required}) missing FROM ${table} s${filter}) identities` });
  }
  for (const fk of metadata.foreign_keys) {
    if (fk.parent_constraint_id == null) throw new Error('Missing partition-parent constraint metadata');
    // PostgreSQL creates implementation constraints for each referenced target
    // partition. Only their root FK applies to every source row; treating every
    // partition clone as an independent FK invents false orphan reports.
    if (String(fk.parent_constraint_id) !== '0') continue;
    // Native catalog references and their public business consumers. Staging
    // copies are inventoried in metadata but are not canonical business children.
    if (fk.source_schema !== 'public' || (!tables.has(fk.source_table) && !(fk.target_schema === 'public' && tables.has(fk.target_table)))) continue;
    if (!Array.isArray(fk.columns) || !fk.columns.length) throw new Error('Empty foreign key');
    const source = `${ident(fk.source_schema)}.${ident(fk.source_table)}`;
    const target = `${ident(fk.target_schema)}.${ident(fk.target_table)}`;
    const present = fk.columns.map(c => `s.${ident(c.source)} IS NOT NULL`).join(' AND ');
    const any = fk.columns.map(c => `s.${ident(c.source)} IS NOT NULL`).join(' OR ');
    const match = fk.columns.map(c => `t.${ident(c.target)}=s.${ident(c.source)}`).join(' AND ');
    const edge = `jsonb_build_array(${fk.columns.map(c => `s.${ident(c.source)}`).join(',')})`;
    const id = `fk:${fk.source_schema}.${fk.source_table}:${fk.conname}`;
    checks.push({ id, sql: `SELECT ${literal(id)} check_id,jsonb_build_object('constraint',${literal(fk.conname)},'source',${literal(`${fk.source_schema}.${fk.source_table}`)},'target',${literal(`${fk.target_schema}.${fk.target_table}`)},'validated',${fk.convalidated ? 'true' : 'false'},'referencing_rows',count(*) FILTER(WHERE ${present}),'partial_null_rows',count(*) FILTER(WHERE (${any}) AND NOT(${present})),'orphan_rows',count(*) FILTER(WHERE (${present}) AND NOT EXISTS(SELECT 1 FROM ${target} t WHERE ${match})),'target_identity_checksum',md5(COALESCE(string_agg(${edge}::text,',' ORDER BY ${edge}::text) FILTER(WHERE ${present}),''))) result FROM ${source} s` });
  }
  return checks;
}

export function batchChecks(checks, maxCharacters = 24000) {
  const batches = [];
  let current = [];
  const render = items => `SELECT statement_timestamp() captured_at,jsonb_object_agg(check_id,result) checks FROM (${items.map(c => c.sql).join('\nUNION ALL\n')}) checked;\n`;
  for (const check of checks) {
    if (render([check]).length > maxCharacters) throw new Error('Individual check exceeds the query bound');
    if (render([...current, check]).length > maxCharacters) {
      batches.push({ checks: current, sql: render(current) });
      current = [];
    }
    current.push(check);
  }
  if (current.length) batches.push({ checks: current, sql: render(current) });
  return batches;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [coverageFile, metadataFile, outputFolder] = process.argv.slice(2);
  if (!coverageFile || !metadataFile || !outputFolder) throw new Error('Usage: node catalog-integrity-query.mjs coverage.json metadata.json output-folder');
  const coverageText = await readFile(coverageFile, 'utf8');
  const metadataText = await readFile(metadataFile, 'utf8');
  const checks = catalogIntegrityChecks(JSON.parse(coverageText), JSON.parse(metadataText));
  const batches = batchChecks(checks);
  await mkdir(outputFolder, { recursive: true });
  const manifest = { coverage_sha256: hash(coverageText), metadata_sha256: hash(metadataText), checks: checks.length, batches: [] };
  for (const [index, batch] of batches.entries()) {
    const file = `catalog-integrity-${String(index + 1).padStart(3, '0')}.sql`;
    await writeFile(path.join(outputFolder, file), batch.sql);
    manifest.batches.push({ file, sha256: hash(batch.sql), characters: batch.sql.length, checks: batch.checks.map(c => c.id) });
  }
  await writeFile(path.join(outputFolder, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ catalogs: JSON.parse(coverageText).catalogs.length, checks: checks.length, batches: batches.length, generated_only: true }));
}
