import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogIntegrityChecks, batchChecks } from './catalog-integrity-query.mjs';

const coverage = { catalogs: [{ key: 'ref_code:example', table: 'ref_code', kind: 'ref_code_domain', domain: 'example', pk: [{ name: 'id' }, { name: 'domain' }] }] };
const metadata = { foreign_keys: [{ conname: 'child_ref_fkey', parent_constraint_id: 0, convalidated: true, source_schema: 'public', source_table: 'child', target_schema: 'public', target_table: 'ref_code', columns: [{ source: 'ref_id', target: 'id' }, { source: 'ref_domain', target: 'domain' }] }] };

test('each catalog identity is scoped and each composite FK uses every target component', () => {
  const checks = catalogIntegrityChecks(coverage, metadata);
  assert.equal(checks.length, 2);
  assert.match(checks[0].sql, /WHERE s.domain='example'/);
  assert.match(checks[0].sql, /count\(DISTINCT identity\)/);
  assert.match(checks[1].sql, /t\."id"=s\."ref_id" AND t\."domain"=s\."ref_domain"/);
  assert.match(checks[1].sql, /NOT EXISTS/);
  assert.doesNotMatch(checks.map(x => x.sql).join(''), /to_jsonb\(s\)|s\.\*/);
});

test('unknown identity, duplicate catalogs and unsafe metadata identifiers fail closed', () => {
  assert.throws(() => catalogIntegrityChecks({ catalogs: [{ ...coverage.catalogs[0], pk: [] }] }, metadata), /Review identity/);
  assert.throws(() => catalogIntegrityChecks({ catalogs: [...coverage.catalogs, ...coverage.catalogs] }, metadata), /Duplicate/);
  assert.throws(() => catalogIntegrityChecks({ catalogs: [{ ...coverage.catalogs[0], table: 'ref_code; DROP TABLE secret' }] }, metadata), /Invalid catalog identifier/);
});

test('referenced partition implementation constraints are checked through their root FK', () => {
  const root = { ...metadata.foreign_keys[0], parent_constraint_id: 0 };
  const clone = { ...root, conname: 'child_ref_partition_clone', target_table: 'ref_code_one_partition', parent_constraint_id: 123 };
  const checks = catalogIntegrityChecks(coverage, { foreign_keys: [root, clone] });
  assert.equal(checks.length, 2);
  assert.ok(!checks.some(check => check.id.includes('partition_clone')));
});

test('query batching is bounded and retains every identity/check exactly once', () => {
  const checks = catalogIntegrityChecks(coverage, metadata);
  const batches = batchChecks(checks, 1400);
  assert.equal(batches.length, 2);
  assert.deepEqual(batches.flatMap(x => x.checks.map(c => c.id)), checks.map(c => c.id));
  for (const batch of batches) {
    assert.ok(batch.sql.length <= 1400);
    assert.match(batch.sql, /^SELECT statement_timestamp/);
  }
  assert.throws(() => batchChecks(checks, 100), /exceeds/);
});
