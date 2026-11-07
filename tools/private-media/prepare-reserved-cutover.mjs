// Offline only; emits private CAS SQL only from the reserved, verified receipt.
import { readFile, realpath, open } from 'node:fs/promises';
import { resolve, dirname, basename, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { inspectManifest } from './copy-verified.mjs';
import { prepareReservedCutover } from './copy-reserved.mjs';
import { sha256 } from './prepare-cutover.mjs';

async function run() {
  const options = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i];
    if (!['--manifest', '--project-ref', '--expect-sha256', '--receipt', '--expect-receipt-sha256', '--reservation-config', '--out'].includes(key)
      || options[key] || !process.argv[i + 1] || process.argv[i + 1].startsWith('--')) throw new Error('arguments');
    options[key] = process.argv[i + 1];
  }
  if (Object.keys(options).length !== 7) throw new Error('arguments');
  const git = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (git.status !== 0) throw new Error('repository');
  const root = await realpath(git.stdout.trim());
  const paths = {};
  for (const key of ['--manifest', '--receipt', '--reservation-config', '--out']) {
    const path = resolve(options[key]);
    paths[key] = key === '--out' ? resolve(await realpath(dirname(path)), basename(path)) : await realpath(path);
    const local = relative(root, paths[key]);
    if (local !== '..' && !local.startsWith(`..${sep}`) && !isAbsolute(local)
      && spawnSync('git', ['check-ignore', '--quiet', '--', paths[key]]).status !== 0) throw new Error('private_artifact_required');
  }
  const inventory = inspectManifest(await readFile(paths['--manifest']), options['--project-ref']);
  if (inventory.digest !== options['--expect-sha256']) throw new Error('manifest_digest');
  const receipt = await readFile(paths['--receipt']);
  if (sha256(receipt) !== options['--expect-receipt-sha256']) throw new Error('receipt_digest');
  const sql = prepareReservedCutover(inventory, JSON.parse(receipt), JSON.parse(await readFile(paths['--reservation-config'])));
  const file = await open(paths['--out'], 'wx', 0o600);
  try { await file.writeFile(sql); await file.sync(); } finally { await file.close(); }
  console.log(JSON.stringify({ mode: 'offline_prepared', records: inventory.records.length, sql_sha256: sha256(sql) }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run().catch((error) => {
  console.error(`DB07 preparation refused: ${/^[a-z_]+$/.test(error.message) ? error.message : 'invalid_input_or_io'}`); process.exitCode = 1;
});
