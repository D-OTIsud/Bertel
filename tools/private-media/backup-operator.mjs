// Run offline by default. Only --execute admits the pinned Storage GETs.
import { createSecretKey } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { inspectManifest, previewInventory, storageTransport } from './copy-verified.mjs';
import { backupSources, readPrivateBackupInput, verifyBackup } from './backup-sink.mjs';

function parse(argv) {
  const options = {};
  const modes = ['--execute', '--verify'];
  const common = ['--manifest', '--project-ref', '--expect-sha256'];
  const binding = ['--backup-root', '--attempt-id', '--key-file', '--key-sha256'];
  const allowed = [...modes, ...common, ...binding, '--storage-key-file'];
  for (let index = 0; index < argv.length; index++) {
    const option = argv[index];
    if (!allowed.includes(option) || Object.hasOwn(options, option)) throw new Error('backup_arguments');
    const value = modes.includes(option) ? true : argv[++index];
    if (!value || (typeof value === 'string' && value.startsWith('--'))) throw new Error('backup_arguments');
    options[option] = value;
  }
  if (options['--execute'] && options['--verify']) throw new Error('backup_arguments');
  const required = [...common];
  if (options['--execute'] || options['--verify']) required.push(...binding);
  if (options['--execute']) required.push('--storage-key-file');
  if (required.some((option) => !Object.hasOwn(options, option)) ||
      Object.keys(options).some((option) => !modes.includes(option) && !required.includes(option))) {
    throw new Error('backup_arguments');
  }
  return options;
}

async function run(argv) {
  const options = parse(argv);
  const manifest = await readFile(options['--manifest']);
  const projectRef = options['--project-ref'];
  const manifestSha256 = options['--expect-sha256'];
  const inventory = inspectManifest(manifest, projectRef);
  if (inventory.digest !== manifestSha256) throw new Error('backup_manifest');
  if (!options['--verify'] && !options['--execute']) {
    return { ...previewInventory(inventory), mode: 'preview', operation: 'db07_backup' };
  }
  const rawKey = await readPrivateBackupInput(options['--key-file'], 32);
  let key;
  try {
    if (rawKey.length !== 32) throw new Error('backup_key');
    key = createSecretKey(rawKey);
  } finally {
    rawKey.fill(0);
  }
  const bound = { projectRef, manifestSha256, key, keySha256: options['--key-sha256'],
    backupRoot: options['--backup-root'], attemptId: options['--attempt-id'] };
  if (options['--verify']) return { mode: 'verify', network: false, ...await verifyBackup(manifest, bound) };

  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new Error('backup_tls');
  const rawStorageKey = await readPrivateBackupInput(options['--storage-key-file'], 16 * 1024);
  let transport;
  try {
    const serviceKey = rawStorageKey.toString('utf8').trim();
    const { info, hashObject } = storageTransport({ projectRef, serviceKey });
    transport = { info, hashObject };
  } finally {
    rawStorageKey.fill(0);
  }
  const receipt = await backupSources(manifest, { ...bound, transport });
  return { mode: 'execute', network: true, records: receipt.records.length,
    bytes: receipt.records.reduce((sum, record) => sum + record.bytes, 0) };
}

try {
  process.stdout.write(`${JSON.stringify(await run(process.argv.slice(2)))}\n`);
} catch (error) {
  // Failures can contain private filenames or origins. Emit only coded outcomes.
  const code = /^backup_[a-z_]+$/.test(error.message) ? error.message : 'backup_failed';
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
}
