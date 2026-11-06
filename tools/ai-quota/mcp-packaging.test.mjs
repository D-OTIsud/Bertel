import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fresh = await readFile(join(root, 'Base de donnée DLL et API/ai_request_admission.sql'));
const migrations = (await readdir(join(root, 'supabase/migrations')))
  .filter((name) => /^\d{14}_distributed_ai_request_admission\.sql$/.test(name));
let payload;
try { payload = await readFile(new URL('./prepared-mcp-upgrade.sql', import.meta.url)); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  assert.equal(migrations.length, 1, 'one actual admission migration must remain after receipt reconciliation');
  payload = await readFile(join(root, 'supabase/migrations', migrations[0]));
}

test('fresh admission source keeps the exact reviewed original bytes', () => {
  assert.equal(hash(fresh), '3d618baf364e2ad281393177bbebf118208ed1e196c207bd0e4626106373139b');
});

test('the prepared or actually versioned DO embeds all source bytes except the two outer boundaries', () => {
  const original = fresh.toString('utf8');
  assert.equal((original.match(/^BEGIN;$/gm) ?? []).length, 1);
  assert.equal((original.match(/^COMMIT;$/gm) ?? []).length, 1);
  const inner = original.replace(/^BEGIN;\n/m, '').replace(/^COMMIT;\n/m, '');
  const match = payload.toString('utf8').match(/EXECUTE \$reviewed_ia_body\$\n([\s\S]*?)\$reviewed_ia_body\$;/);
  assert.ok(match, 'guarded source block must remain explicit');
  assert.deepEqual(Buffer.from(match[1]), Buffer.from(inner));
  assert.equal(/^(?:BEGIN|COMMIT|ROLLBACK);$/m.test(inner), false);
});

test('the reviewed upgrade envelope remains exact and does not create a second version', () => {
  assert.equal(hash(payload), '43e2a719e8b4ac7112a32df09beb84042d5f51d265a640ce3dc921d8da4f44f0');
  assert.deepEqual(migrations, ['20261106200353_distributed_ai_request_admission.sql'],
    'only the actually observed production receipt version remains active');
});

test('fresh apply uses the source and never the production-state upgrade guard', async () => {
  const manifest = await readFile(join(root, 'Base de donnée DLL et API/ci_fresh_apply.sql'), 'utf8');
  assert.equal((manifest.match(/^\\ir ai_request_admission\.sql$/gm) ?? []).length, 1);
  assert.equal(/^\\ir .*distributed_ai_request_admission\.sql$/m.test(manifest), false);
  assert.equal(manifest.includes('prepared-mcp-upgrade.sql'), false);
});
