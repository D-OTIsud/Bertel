import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = (path, encoding) => readFile(new URL(path, root), encoding);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fresh = await read('Base de donnée DLL et API/distributed_list_email_intents.sql');
const versioned = '20261107031344_distributed_list_email_intents.sql';

test('fresh list-mail source keeps the exact reviewed bytes', () => {
  assert.equal(fresh.length, 23369);
  assert.equal(hash(fresh), 'd210b3fcac4d20e2ab9f41c2f2355d1fd319e1b3583715cc7ec535a52a628425');
});

test('the applied DO embeds all source bytes except the two outer transaction boundaries', async () => {
  const original = fresh.toString('utf8');
  assert.equal((original.match(/^BEGIN;$/gm) ?? []).length, 1);
  assert.equal((original.match(/^COMMIT;$/gm) ?? []).length, 1);
  assert.ok(original.endsWith('COMMIT;\n'));
  const inner = original.replace(/^BEGIN;\n/m, '').slice(0, -'COMMIT;\n'.length);
  assert.equal(/^(?:BEGIN|COMMIT|ROLLBACK);$/m.test(inner), false);
  assert.equal(Buffer.byteLength(inner), 23354);
  assert.equal(hash(inner), '270a244c134126a580b4a4edefa47d9fe535be24de80ce071e808927c5483183');
  const applied = await read('supabase/migrations/' + versioned, 'utf8');
  const embedded = applied.match(/^  v_body CONSTANT pg_catalog\.text := \$smtp_body_270a244c134126a5\$([\s\S]*?)\$smtp_body_270a244c134126a5\$;$/m);
  assert.ok(embedded, 'the exact guarded body remains explicit');
  assert.deepEqual(Buffer.from(embedded[1]), Buffer.from(inner));
});

test('only the observed list-mail receipt version is active with the exact applied bytes', async () => {
  const migrations = (await readdir(new URL('supabase/migrations/', root)))
    .filter((name) => name.endsWith('_distributed_list_email_intents.sql'));
  assert.deepEqual(migrations, [versioned]);
  const applied = await read('supabase/migrations/' + versioned);
  assert.equal(applied.length, 105701);
  assert.equal(hash(applied), '27a32f2cf14476aba38e780d5bfa3f858275bc16892b4b3d7be65177c8e144c3');
});

test('fresh apply includes the canonical source once and excludes the hosted guard', async () => {
  const manifest = await read('Base de donnée DLL et API/ci_fresh_apply.sql', 'utf8');
  const includes = manifest.split(/\r?\n/).filter((line) =>
    /^\s*\\i(?:r)?\s+.*(?:distributed_list_email_intents|prepared-smtp-upgrade)\.sql\b/.test(line));
  assert.deepEqual(includes, ['\\ir distributed_list_email_intents.sql']);
});
