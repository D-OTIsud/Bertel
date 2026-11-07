import { spawnSync } from 'node:child_process';
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, KeyObject, randomBytes, timingSafeEqual } from 'node:crypto';
import { constants, lstatSync } from 'node:fs';
import { open, readdir } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { assertSource, inspectManifest } from './copy-verified.mjs';

const MAGIC = Buffer.from('DB07BAK1');
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = MAGIC.length + NONCE_BYTES;
const BLOCK_BYTES = 64 * 1024;
const RECEIPT = 'backup-receipt.json';
const RECEIPT_MAX = 1024 * 1024;
const ALGORITHM = 'aes-256-gcm';
const HASH = /^[0-9a-f]{64}$/;
const ATTEMPT = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const LINUX = process.platform === 'linux';
const READ_FLAGS = LINUX ? constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK : 'r';

// The current Windows user and SYSTEM may hold the private directory.
// Recheck inherited ACLs on each file before completing the receipt.
const ACL_GATE = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
$inputData = ConvertFrom-Json -InputObject ([Console]::In.ReadToEnd())
$dir = Get-Item -Force -LiteralPath $inputData.root
$volume = [IO.DriveInfo]::new($dir.Root.FullName)
if (!$dir.PSIsContainer -or $volume.DriveType -ne 'Fixed' -or $volume.DriveFormat -ne 'NTFS') { exit 1 }
$sidType = [Security.Principal.SecurityIdentifier]
$owner = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$trusted = @($owner, 'S-1-5-18', 'S-1-5-32-544', 'S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464')
for ($parent = $dir; $parent; $parent = $parent.Parent) {
  if ($parent.Attributes -band [IO.FileAttributes]::ReparsePoint) { exit 1 }
  $acl = Get-Acl -LiteralPath $parent.FullName
  if ($trusted -notcontains $acl.GetOwner($sidType).Value) { exit 1 }
  $raw = [Security.AccessControl.RawSecurityDescriptor]::new($acl.GetSecurityDescriptorBinaryForm(), 0)
  if ($null -eq $raw.DiscretionaryAcl) { exit 1 }
  # GenericAll/Write, MAXIMUM_ALLOWED, DELETE, WRITE_DAC/OWNER and
  # directory write data/EA/attributes or DELETE_CHILD. Creating unrelated
  # subdirectories at the drive root alone cannot replace an ancestor.
  $mutable = 0x520D0152
  if ($parent.Parent) { $mutable = $mutable -bor 4 }
  foreach ($ace in $raw.DiscretionaryAcl) {
    if ([int]$ace.AceFlags -band [int][Security.AccessControl.AceFlags]::InheritOnly) { continue }
    if ($ace.AceType -eq 'AccessDenied') { continue }
    if ($ace.AceType -ne 'AccessAllowed') { exit 1 }
    if ($trusted -notcontains $ace.SecurityIdentifier.Value -and ($ace.AccessMask -band $mutable)) { exit 1 }
  }
}
function Assert-PrivateAcl($item, [bool] $directory) {
  if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { exit 1 }
  $acl = Get-Acl -LiteralPath $item.FullName
  if ($acl.GetOwner($sidType).Value -ne $owner -or ($directory -and !$acl.AreAccessRulesProtected)) { exit 1 }
  $ownerRule = $false
  foreach ($rule in $acl.GetAccessRules($true, $true, $sidType)) {
    $trustee = $rule.IdentityReference.Value
    if ($rule.AccessControlType -ne 'Allow' -or ($trustee -ne $owner -and $trustee -ne 'S-1-5-18')) { exit 1 }
    if ($trustee -eq $owner -and $rule.FileSystemRights -eq 'FullControl' -and
        $rule.PropagationFlags -eq 'None' -and (!$directory -or [int]$rule.InheritanceFlags -eq 3)) {
      $ownerRule = $true
    }
  }
  if (!$ownerRule) { exit 1 }
}
Assert-PrivateAcl $dir $true
foreach ($name in $inputData.files) {
  $file = Get-Item -Force -LiteralPath (Join-Path $dir.FullName $name)
  if ($file.PSIsContainer) { exit 1 }
  Assert-PrivateAcl $file $false
}
[Console]::Out.Write('OK')
`;

function assertLinuxPrivateFile(stat) {
  if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.geteuid() || (stat.mode & 0o7777) !== 0o600) {
    throw new Error('backup_acl');
  }
}

function assertLinuxPrivateRoot(root, files) {
  const uid = process.geteuid();
  const directory = lstatSync(root);
  if (!directory.isDirectory() || directory.uid !== uid || (directory.mode & 0o7777) !== 0o700) {
    throw new Error('backup_acl');
  }
  // No unrelated uid may replace an ancestor or a child in a mutable parent.
  // The system's sticky /tmp protects its private, operator-owned child.
  for (let parent = dirname(root); ; parent = dirname(parent)) {
    const stat = lstatSync(parent);
    const systemTmp = parent === '/tmp' && stat.uid === 0 && (stat.mode & 0o1000) !== 0;
    if (!stat.isDirectory() || (stat.uid !== 0 && stat.uid !== uid) || ((stat.mode & 0o022) !== 0 && !systemTmp)) {
      throw new Error('backup_acl');
    }
    if (dirname(parent) === parent) break;
  }
  for (const name of files) assertLinuxPrivateFile(lstatSync(join(root, name)));
}

function assertPrivateRoot(root, files = []) {
  if (LINUX) {
    try {
      assertLinuxPrivateRoot(root, files);
    } catch {
      throw new Error('backup_acl');
    }
    return;
  }
  const systemRoot = process.env.SystemRoot;
  if (process.platform !== 'win32' || !systemRoot || !/^[a-z]:\\[^:]+$/i.test(root)) {
    throw new Error('backup_requires_private_ntfs');
  }
  const powershell = join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const result = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', ACL_GATE], {
    env: { SystemRoot: systemRoot, SystemDrive: process.env.SystemDrive ?? systemRoot.slice(0, 2) },
    input: JSON.stringify({ root, files }), encoding: 'utf8', windowsHide: true, timeout: 90_000,
  });
  if (result.status !== 0 || result.stdout !== 'OK') throw new Error('backup_acl');
}

export function assertPrivateBackupDirectory(root) {
  if (typeof root !== 'string' || !isAbsolute(root)) throw new Error('backup_inputs');
  assertPrivateRoot(resolve(root));
}

export async function readPrivateBackupInput(filename, maxBytes) {
  if (!isAbsolute(filename) || /:/.test(basename(filename))) throw new Error('backup_inputs');
  const path = resolve(filename);
  assertPrivateRoot(dirname(path), [basename(path)]);
  return readLocalFile(path, maxBytes);
}

async function readLocalFile(path, maxBytes) {
  const file = await open(path, READ_FLAGS);
  try {
    const stat = await file.stat();
    if (LINUX) assertLinuxPrivateFile(stat);
    if (stat.nlink !== 1 || !stat.isFile() || stat.size < 1 || stat.size > maxBytes) throw new Error('backup_file');
    return await readExact(file, stat.size, 0);
  } finally {
    await file.close();
  }
}

function backupContext(root, key, { attemptId, keySha256 }) {
  if (!ATTEMPT.test(attemptId) || !HASH.test(keySha256) ||
      basename(root) !== `db07-backup-${attemptId}`) throw new Error('backup_attempt');
  const bytes = key.export();
  try {
    if (createHash('sha256').update(bytes).digest('hex') !== keySha256) throw new Error('backup_key');
  } finally {
    bytes.fill(0);
  }
  return { attempt_id: attemptId, key_sha256: keySha256 };
}

function archiveAAD(inventory, record, context) {
  const fields = [inventory.digest, record.document_id, record.source_metadata.id, record.source_metadata.size];
  if (context) fields.push('DB07 backup attempt v1', context.attempt_id, context.key_sha256);
  return Buffer.from(JSON.stringify(fields));
}

const archiveName = (record) => `${record.document_id.toLowerCase()}.db07bak`;

function receiptTag(key, receipt) {
  const receiptKey = Buffer.from(hkdfSync('sha256', key, Buffer.alloc(0), 'DB07 backup receipt v1', 32));
  try {
    return createHmac('sha256', receiptKey).update(JSON.stringify(receipt)).digest();
  } finally {
    receiptKey.fill(0);
  }
}

async function openExclusive(path) {
  let file;
  try {
    file = await open(path, 'wx', 0o600);
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('backup_conflict');
    throw new Error('backup_open');
  }
  if (LINUX) {
    try {
      assertLinuxPrivateFile(await file.stat());
    } catch (error) {
      await file.close();
      throw error;
    }
  }
  return file;
}

async function readExact(file, length, position) {
  const bytes = Buffer.alloc(length);
  for (let offset = 0; offset < length;) {
    const { bytesRead } = await file.read(bytes, offset, length - offset, position + offset);
    if (!bytesRead) throw new Error('backup_length');
    offset += bytesRead;
  }
  return bytes;
}

async function verifySavedObject(path, key, aad, source) {
  const file = await open(path, READ_FLAGS);
  try {
    const dataEnd = HEADER_BYTES + source.bytes;
    const stat = await file.stat();
    if (LINUX) assertLinuxPrivateFile(stat);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size !== dataEnd + TAG_BYTES) throw new Error('backup_length');
    const header = await readExact(file, HEADER_BYTES, 0);
    if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('backup_format');
    const decipher = createDecipheriv(ALGORITHM, key, header.subarray(MAGIC.length), { authTagLength: TAG_BYTES });
    decipher.setAAD(aad);
    decipher.setAuthTag(await readExact(file, TAG_BYTES, dataEnd));
    const hash = createHash('sha256');
    for (let pos = HEADER_BYTES; pos < dataEnd; pos += BLOCK_BYTES) {
      const block = await readExact(file, Math.min(BLOCK_BYTES, dataEnd - pos), pos);
      hash.update(decipher.update(block));
    }
    try { hash.update(decipher.final()); } catch { throw new Error('backup_authentication'); }
    if (hash.digest('hex') !== source.sha256) throw new Error('backup_hash');
  } finally {
    await file.close();
  }
}

function backupInputs(manifestBytes, { backupRoot, key, manifestSha256, projectRef, expectedCount }) {
  if (typeof backupRoot !== 'string' || !isAbsolute(backupRoot) ||
      !(key instanceof KeyObject) || key.type !== 'secret' || key.symmetricKeySize !== 32) {
    throw new Error('backup_inputs');
  }
  const inventory = inspectManifest(manifestBytes, projectRef, expectedCount);
  if (inventory.digest !== manifestSha256) throw new Error('backup_manifest');
  if (new Set(inventory.records.map((r) => r.document_id.toLowerCase())).size !== inventory.records.length) {
    throw new Error('backup_manifest_duplicate');
  }
  return { root: resolve(backupRoot), inventory };
}

export async function backupSources(manifestBytes, options) {
  const { key, transport, signal, attemptId, keySha256 } = options;
  const { root, inventory } = backupInputs(manifestBytes, options);
  const context = attemptId !== undefined || keySha256 !== undefined ? backupContext(root, key, options) : null;
  assertPrivateRoot(root);
  if (context && (await readdir(root)).length !== 0) throw new Error('backup_conflict');
  const receiptFile = await openExclusive(join(root, RECEIPT));
  try {
    const records = [];
    for (const record of inventory.records) {
      if (signal?.aborted) throw new Error('interrupted');
      const filename = archiveName(record);
      const path = join(root, filename);
      const { source_bucket: bucket, source_path: sourcePath, source_metadata: expected } = record;
      const aad = archiveAAD(inventory, record, context);
      const file = await openExclusive(path);
      let source;
      try {
        assertSource(await transport.info(bucket, sourcePath, signal), record);
        const nonce = randomBytes(NONCE_BYTES);
        const cipher = createCipheriv(ALGORITHM, key, nonce, { authTagLength: TAG_BYTES });
        cipher.setAAD(aad);
        await file.writeFile(Buffer.concat([MAGIC, nonce]));
        source = await transport.hashObject(bucket, sourcePath, expected, signal,
          async (chunk) => file.writeFile(cipher.update(chunk)));
        await file.writeFile(cipher.final());
        await file.writeFile(cipher.getAuthTag());
        assertSource(await transport.info(bucket, sourcePath, signal), record);
        await file.sync();
      } finally {
        await file.close();
      }
      await verifySavedObject(path, key, aad, source);
      records.push({ document_id: record.document_id, filename, ...source });
    }
    assertPrivateRoot(root, [RECEIPT, ...records.map(({ filename }) => filename)]);
    const receipt = { format: MAGIC.toString(), manifest_sha256: inventory.digest, ...context, records };
    if (context) receipt.tag = receiptTag(key, receipt).toString('hex');
    await receiptFile.writeFile(`${JSON.stringify(receipt)}\n`);
    await receiptFile.sync();
    return receipt;
  } finally {
    await receiptFile.close();
  }
}

export async function verifyBackupReceipt(manifestBytes, options) {
  const { key } = options;
  const { root, inventory } = backupInputs(manifestBytes, options);
  const context = backupContext(root, key, options);
  const files = inventory.records.map(archiveName);
  assertPrivateRoot(root, [RECEIPT]);
  let receipt;
  let receiptSha256;
  try {
    const raw = await readLocalFile(join(root, RECEIPT), RECEIPT_MAX);
    receiptSha256 = createHash('sha256').update(raw).digest('hex');
    if (options.receiptSha256 !== undefined && receiptSha256 !== options.receiptSha256) throw new Error('backup_receipt');
    receipt = JSON.parse(raw);
  } catch { throw new Error('backup_receipt'); }
  if (!receipt || !HASH.test(receipt.tag) || receipt.format !== MAGIC.toString() ||
      receipt.manifest_sha256 !== inventory.digest || receipt.attempt_id !== context.attempt_id ||
      receipt.key_sha256 !== context.key_sha256 || !Array.isArray(receipt.records) ||
      receipt.records.length !== files.length) throw new Error('backup_receipt');
  const { tag, ...body } = receipt;
  if (!timingSafeEqual(receiptTag(key, body), Buffer.from(tag, 'hex'))) throw new Error('backup_receipt');
  assertPrivateRoot(root, files);
  for (const [index, record] of inventory.records.entries()) {
    const saved = receipt.records[index];
    if (!saved || saved.document_id !== record.document_id || saved.filename !== files[index] ||
        saved.bytes !== record.source_metadata.size || !HASH.test(saved.sha256)) throw new Error('backup_receipt');
    await verifySavedObject(join(root, files[index]), key, archiveAAD(inventory, record, context), saved);
  }
  return { receiptSha256, records: receipt.records.map(({ document_id, bytes, sha256 }) => ({ document_id, bytes, sha256 })),
    bytes: receipt.records.reduce((sum, saved) => sum + saved.bytes, 0) };
}

export async function verifyBackup(manifestBytes, options) {
  const verified = await verifyBackupReceipt(manifestBytes, options);
  return { records: verified.records.length, bytes: verified.bytes };
}
