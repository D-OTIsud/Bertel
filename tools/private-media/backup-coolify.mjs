import { spawn } from 'node:child_process';
import { createHash, createSecretKey, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { constants } from 'node:fs';
import { open, readdir } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { backupSources, readPrivateBackupInput } from './backup-sink.mjs';
import { inspectManifest, storageTransport } from './copy-verified.mjs';

const ATTEMPT = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const AGE_RECIPIENT = /^age1[023456789acdefghjklmnpqrstuvwxyz]{58}$/;
// age/age from the verified official age-v1.3.2-linux-amd64.tar.gz.
const AGE_SHA256 = 'eb7dd1b518f0a307c99cd97782623c5321da049154b04acd2d98d21aa7bc9b2c';

async function verifyAge(age) {
  const binary = await open(age, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await binary.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.getuid() || (stat.mode & 0o7777) !== 0o700
        || stat.size < 1 || stat.size > 16 * 1024 * 1024
        || createHash('sha256').update(await binary.readFile()).digest('hex') !== AGE_SHA256) {
      throw new Error('backup_age_binary');
    }
  } finally {
    await binary.close();
  }
}

async function syncDirectory(path) {
  const directory = await open(path, 'r');
  try { await directory.sync(); } finally { await directory.close(); }
}

async function sealKey(rawKey, { parent, attemptId, age, recipient }) {
  const envelope = await open(join(parent, `backup-key-${attemptId}.age`), 'wx', 0o600);
  try {
    const child = spawn(age, ['-r', recipient], {
      env: { LANG: 'C' }, stdio: ['pipe', envelope.fd, 'ignore'], signal: AbortSignal.timeout(15_000),
    });
    const [[code]] = await Promise.all([
      once(child, 'close'), pipeline(Readable.from([rawKey]), child.stdin),
    ]);
    const { size } = await envelope.stat();
    if (code !== 0 || size < rawKey.length || size > 4096) throw new Error('backup_envelope');
    await envelope.sync();
  } finally {
    await envelope.close();
  }
  await syncDirectory(parent);
}

async function run(argv) {
  const [mode, manifestFile, projectRef, manifestSha256, backupRoot, attemptId, age, recipient] = argv;
  if (process.platform !== 'linux' || process.arch !== 'x64' || argv.length !== 8 || mode !== '--execute'
      || !ATTEMPT.test(attemptId) || !AGE_RECIPIENT.test(recipient)
      || !isAbsolute(backupRoot) || resolve(backupRoot) !== backupRoot
      || basename(backupRoot) !== `db07-backup-${attemptId}`) {
    throw new Error('backup_arguments');
  }
  const parent = dirname(backupRoot);
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0' || dirname(manifestFile) !== parent || age !== join(parent, 'age')) {
    throw new Error('backup_environment');
  }
  const manifest = await readPrivateBackupInput(manifestFile, 2 * 1024 * 1024);
  const inventory = inspectManifest(manifest, projectRef);
  if (inventory.digest !== manifestSha256) throw new Error('backup_manifest');
  const configuredOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (configuredOrigin !== inventory.origin && configuredOrigin !== `${inventory.origin}/`) {
    throw new Error('backup_origin');
  }
  if ((await readdir(backupRoot)).length !== 0) throw new Error('backup_conflict');
  await verifyAge(age);
  const { info, hashObject } = storageTransport({
    projectRef, serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  });
  const rawKey = randomBytes(32);
  let key;
  let keySha256;
  try {
    await sealKey(rawKey, { parent, attemptId, age, recipient });
    key = createSecretKey(rawKey);
    keySha256 = createHash('sha256').update(rawKey).digest('hex');
  } finally {
    rawKey.fill(0);
  }
  const receipt = await backupSources(manifest, {
    backupRoot, key, attemptId, keySha256, projectRef, manifestSha256, transport: { info, hashObject },
  });
  await syncDirectory(backupRoot);
  return { records: receipt.records.length, bytes: receipt.records.reduce((sum, entry) => sum + entry.bytes, 0) };
}

try {
  process.stdout.write(`${JSON.stringify(await run(process.argv.slice(2)))}\n`);
} catch (error) {
  process.stderr.write(`${/^backup_[a-z_]+$/.test(error.message) ? error.message : 'backup_failed'}\n`);
  process.exitCode = 1;
}
