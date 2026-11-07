import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createDecipheriv, createHash, createSecretKey, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { chmod, chown, link, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { backupSources, readPrivateBackupInput, verifyBackup } from './backup-sink.mjs';
import { inspectManifest, storageTransport } from './copy-verified.mjs';
import { copyBinding } from './copy-reserved.mjs';
import { prepareCopyAdmissions } from './prepare-copy-admissions.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const projectRef = 'aaaaaaaaaaaaaaaaaaaa';
const documentId = '00000000-0000-4000-a000-000000009103';
const objectId = 'HOTRUN9970070001';
const sourceId = '00000000-0000-4000-a000-000000009101';
const sourcePath = 'synthetic/archive.pdf';
const destinationPath = `objects/${objectId}/${documentId}`;
const linux = process.platform === 'linux';
const supported = linux || process.platform === 'win32';
const fixtureParent = linux ? '/tmp' : homedir();

async function protectFixture(paths, replaceable) {
  if (linux) {
    await Promise.all(paths.map((path) => chmod(path, path === replaceable ? 0o1777 : 0o700)));
    return;
  }
  const { SystemRoot, SystemDrive } = process.env;
  const command = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
$inputData = ConvertFrom-Json -InputObject ([Console]::In.ReadToEnd())
$owner = [Security.Principal.WindowsIdentity]::GetCurrent().User
$rule = [Security.AccessControl.FileSystemAccessRule]::new($owner, 'FullControl', 3, 'None', 'Allow')
foreach ($path in $inputData.paths) {
  $acl = [Security.AccessControl.DirectorySecurity]::new()
  $acl.SetOwner($owner)
  $acl.SetAccessRuleProtection($true, $false)
  $acl.AddAccessRule($rule)
  if ($path -eq $inputData.replaceable) {
    $everyone = [Security.Principal.SecurityIdentifier]::new('S-1-1-0')
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($everyone, 'DeleteSubdirectoriesAndFiles', 'Allow'))
  }
  Set-Acl -LiteralPath $path -AclObject $acl
}
`;
  const result = spawnSync(join(SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ['-NoProfile', '-NonInteractive', '-Command', command],
    { env: { SystemRoot, SystemDrive }, input: JSON.stringify({ paths, replaceable }), encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
}

test('DB07 saves and decrypts exact HTTP source bytes in a private directory and refuses an occupied key', {
  skip: !supported,
}, async (t) => {
  const source = Buffer.concat([Buffer.from('%PDF synthetic backup fixture\n'), randomBytes(150_000)]);
  const metadata = { id: sourceId, name: sourcePath, etag: 'source-tag', size: source.length,
    content_type: 'application/pdf', cache_control: 'max-age=3600' };
  const manifest = Buffer.from(JSON.stringify({
    schema_version: 1, classification: 'legal_private', expected_count: 1, records: [{
      document_id: documentId, object_id: objectId, source_bucket: 'old_legal_media', source_path: sourcePath,
      source_url: `https://${projectRef}.supabase.co/storage/v1/object/public/old_legal_media/${sourcePath}`,
      destination_bucket: 'legal-documents', destination_path: destinationPath,
      destination_url: `storage://legal-documents/${destinationPath}`, source_metadata: metadata,
    }],
  }));
  const requests = [];
  const infoUrl = `/storage/v1/object/info/old_legal_media/${sourcePath}`;
  const sourceUrl = `/storage/v1/object/authenticated/old_legal_media/${sourcePath}`;
  const server = createServer((request, response) => {
    requests.push([request.method, request.url, request.headers.apikey]);
    if (request.method === 'GET' && request.url === infoUrl) {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ ...metadata, bucket_id: 'old_legal_media' }));
    } else if (request.method === 'GET' && request.url === sourceUrl) {
      response.writeHead(200, { 'content-type': metadata.content_type, 'content-length': source.length,
        etag: `"${metadata.etag}"` });
      response.end(source);
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((done) => { server.closeAllConnections(); server.close(done); }));
  const transport = storageTransport({ projectRef, serviceKey: 'test-only-no-real-key',
    testOrigin: `http://127.0.0.1:${server.address().port}`, timeoutMs: 3000 });

  const fixture = await mkdtemp(join(fixtureParent, '.db07-backup-test-'));
  const backupRoot = join(fixture, 'backup');
  const occupiedRoot = join(fixture, 'occupied');
  await Promise.all([mkdir(backupRoot), mkdir(occupiedRoot)]);
  await protectFixture([backupRoot, occupiedRoot]);
  if (linux) await chmod(fixture, 0o755);
  const key = createSecretKey(randomBytes(32));
  const manifestSha256 = sha256(manifest);
  const options = { backupRoot, key, manifestSha256, projectRef, transport, expectedCount: 1 };
  const filename = `${documentId}.db07bak`;
  const receipt = await backupSources(manifest, options);
  assert.deepEqual(receipt.records, [{ document_id: documentId, filename, bytes: source.length, sha256: sha256(source) }]);
  assert.deepEqual(JSON.parse(await readFile(join(backupRoot, 'backup-receipt.json'), 'utf8')), receipt);
  const saved = await readFile(join(backupRoot, filename));
  assert.equal(saved.length, source.length + 36);
  assert.equal(saved.subarray(0, 8).toString(), 'DB07BAK1');
  assert.equal(saved.includes(source), false);
  const decoder = createDecipheriv('aes-256-gcm', key, saved.subarray(8, 20), { authTagLength: 16 });
  decoder.setAAD(Buffer.from(JSON.stringify([manifestSha256, documentId, sourceId, source.length])));
  decoder.setAuthTag(saved.subarray(-16));
  assert.deepEqual(Buffer.concat([decoder.update(saved.subarray(20, -16)), decoder.final()]), source);
  assert.deepEqual(requests, [infoUrl, sourceUrl, infoUrl].map((url) => ['GET', url, 'test-only-no-real-key']));

  const conflict = join(occupiedRoot, filename);
  await writeFile(conflict, 'existing fixture bytes', { flag: 'wx' });
  await assert.rejects(backupSources(manifest, { ...options, backupRoot: occupiedRoot }), /^Error: backup_conflict$/);
  assert.equal(await readFile(conflict, 'utf8'), 'existing fixture bytes');
  assert.equal(await readFile(join(occupiedRoot, 'backup-receipt.json'), 'utf8'), '');
  await assert.rejects(backupSources(manifest, { ...options, backupRoot: fixture }), /^Error: backup_acl$/);
  assert.equal(requests.length, 3);

  if (linux) {
    await t.test('Linux rejects a linked root or ancestor before any GET', async () => {
      const empty = join(fixture, 'empty');
      const linkedRoot = join(fixture, 'linked-root');
      const linkedParent = join(fixture, 'linked-parent');
      await mkdir(empty, { mode: 0o700 });
      await symlink(empty, linkedRoot);
      await symlink(fixture, linkedParent);
      for (const backupRoot of [linkedRoot, join(linkedParent, 'empty')]) {
        await assert.rejects(backupSources(manifest, { ...options, backupRoot }), /^Error: backup_acl$/);
      }
      assert.equal(requests.length, 3);
    });

    await t.test('Linux refuses a receipt created with incorrect permissions before any GET', async () => {
      const backupRoot = join(fixture, 'umask-refusal');
      await mkdir(backupRoot, { mode: 0o700 });
      const previousUmask = process.umask(0o777);
      try {
        await assert.rejects(backupSources(manifest, { ...options, backupRoot }), /^Error: backup_acl$/);
      } finally {
        process.umask(previousUmask);
      }
      assert.equal(requests.length, 3);
    });

    await t.test('Linux rejects a root or ancestor belonging to a foreign uid before any GET', {
      skip: process.geteuid() !== 0,
    }, async () => {
      const foreign = join(fixture, 'foreign-owner');
      const child = join(foreign, 'operator-owned');
      await mkdir(foreign, { mode: 0o700 });
      await mkdir(child, { mode: 0o700 });
      await chown(foreign, 65534, 65534);
      for (const backupRoot of [foreign, child]) {
        await assert.rejects(backupSources(manifest, { ...options, backupRoot }), /^Error: backup_acl$/);
      }
      assert.equal(requests.length, 3);
    });
  }
});

test('bound DB07 backup verifies offline and refuses incomplete, tampered or replaceable attempts', {
  skip: !supported,
}, async (t) => {
  const sources = ['fixture-one', 'fixture-two'].map((label) => Buffer.from(label));
  const records = sources.map((source, index) => {
    const id = index === 0 ? documentId : '00000000-0000-4000-a000-000000009104';
    const path = `synthetic/${index}.pdf`;
    const target = `objects/${objectId}/${id}`;
    return { document_id: id, object_id: objectId, source_bucket: 'old_legal_media', source_path: path,
      source_url: `https://${projectRef}.supabase.co/storage/v1/object/public/old_legal_media/${path}`,
      destination_bucket: 'legal-documents', destination_path: target, destination_url: `storage://legal-documents/${target}`,
      source_metadata: { id: index === 0 ? sourceId : '00000000-0000-4000-a000-000000009105',
        name: path, etag: 'fixture-tag', size: source.length, content_type: 'application/pdf', cache_control: 'max-age=3600' } };
  });
  const manifest = Buffer.from(JSON.stringify({ schema_version: 1, classification: 'legal_private', expected_count: 2, records }));
  const requests = [];
  let failSecond = true;
  const server = createServer((request, response) => {
    requests.push([request.method, request.url]);
    for (const [index, record] of records.entries()) {
      if (request.method === 'GET' && request.url === `/storage/v1/object/info/old_legal_media/${record.source_path}`) {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ ...record.source_metadata, bucket_id: record.source_bucket }));
        return;
      }
      if (request.method === 'GET' && request.url === `/storage/v1/object/authenticated/old_legal_media/${record.source_path}`) {
        if (index === 1 && failSecond) {
          response.writeHead(503).end();
          return;
        }
        response.writeHead(200, { 'content-type': 'application/pdf', 'content-length': sources[index].length, etag: '"fixture-tag"' });
        response.end(sources[index]);
        return;
      }
    }
    response.writeHead(404).end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((done) => { server.closeAllConnections(); server.close(done); }));
  const transport = storageTransport({ projectRef, serviceKey: 'test-only-no-real-key',
    testOrigin: `http://127.0.0.1:${server.address().port}`, timeoutMs: 3000 });
  const rawKey = randomBytes(32);
  const common = { key: createSecretKey(rawKey), keySha256: sha256(rawKey), projectRef,
    manifestSha256: sha256(manifest), expectedCount: 2 };
  const root = await mkdtemp(join(fixtureParent, '.db07-backup-bound-'));
  const unsafe = join(root, 'replaceable');
  const secrets = join(root, 'keys');
  await Promise.all([mkdir(unsafe), mkdir(secrets)]);
  const attempt = (parent) => {
    const attemptId = randomUUID();
    return { ...common, attemptId, backupRoot: join(parent, `db07-backup-${attemptId}`) };
  };
  const partial = attempt(root);
  const full = attempt(root);
  const replaceable = attempt(unsafe);
  const roots = [partial.backupRoot, full.backupRoot, replaceable.backupRoot, unsafe];
  await Promise.all(roots.slice(0, -1).map((path) => mkdir(path)));
  await protectFixture([...roots, secrets], unsafe);
  const keyPath = join(secrets, 'test-key');
  await writeFile(keyPath, rawKey, { flag: 'wx', mode: 0o600 });
  assert.deepEqual(await readPrivateBackupInput(keyPath, 32), rawKey);

  if (linux) {
    await t.test('Linux rejects permissive or linked input files', async () => {
      await chmod(keyPath, 0o640);
      await assert.rejects(readPrivateBackupInput(keyPath, 32), /^Error: backup_acl$/);
      await chmod(keyPath, 0o600);
      const symlinkPath = join(secrets, 'symlink');
      await symlink(keyPath, symlinkPath);
      await assert.rejects(readPrivateBackupInput(symlinkPath, 32), /^Error: backup_acl$/);
      const hardlinkPath = join(secrets, 'hardlink');
      await link(keyPath, hardlinkPath);
      await assert.rejects(readPrivateBackupInput(keyPath, 32), /^Error: backup_acl$/);
      assert.equal(requests.length, 0);
    });

    await t.test('Linux rejects an input file belonging to a foreign uid', {
      skip: process.geteuid() !== 0,
    }, async () => {
      const foreign = join(secrets, 'foreign');
      await writeFile(foreign, rawKey, { flag: 'wx', mode: 0o600 });
      await chown(foreign, 65534, 65534);
      await assert.rejects(readPrivateBackupInput(foreign, 32), /^Error: backup_acl$/);
      assert.equal(requests.length, 0);
    });
  }

  await assert.rejects(backupSources(manifest, { ...replaceable, transport }), /^Error: backup_acl$/);
  await assert.rejects(backupSources(manifest, { ...full, transport, keySha256: 'a'.repeat(64) }), /^Error: backup_key$/);
  assert.equal(requests.length, 0);
  await assert.rejects(backupSources(manifest, { ...partial, transport }), /^Error: storage_http$/);
  assert.equal(requests.length, 5);
  await assert.rejects(verifyBackup(manifest, partial), /^Error: backup_receipt$/);
  await assert.rejects(backupSources(manifest, { ...partial, transport }), /^Error: backup_conflict$/);
  assert.equal(requests.length, 5);

  failSecond = false;
  const receipt = await backupSources(manifest, { ...full, transport });
  assert.equal(requests.length, 11);
  assert.ok(requests.every(([method]) => method === 'GET'));
  assert.deepEqual(await verifyBackup(manifest, full), { records: 2, bytes: sources[0].length + sources[1].length });
  const receiptPath = join(full.backupRoot, 'backup-receipt.json');
  const inventory = inspectManifest(manifest, projectRef, 2);
  const config = {
    mode: 'hosted', project_ref: projectRef, manifest_sha256: inventory.digest,
    namespace_id: randomUUID(), epoch: randomUUID(), storage_origin_sha256: sha256(inventory.origin),
  };
  const configBytes = Buffer.from(JSON.stringify(config));
  const seedOptions = { ...full, receiptSha256: sha256(await readFile(receiptPath)), bindingConfigSha256: sha256(configBytes) };
  const prepared = await prepareCopyAdmissions(manifest, configBytes, seedOptions);
  assert.equal(prepared.records, 2);
  assert.equal(prepared.backup_receipt_sha256, seedOptions.receiptSha256);
  assert.equal(prepared.binding_config_sha256, seedOptions.bindingConfigSha256);
  const payload = /expected CONSTANT pg_catalog.jsonb := '(.*)'::pg_catalog.jsonb;/.exec(prepared.sql);
  assert.ok(payload);
  assert.deepEqual(JSON.parse(payload[1]), inventory.records.map((record, index) =>
    copyBinding(inventory, record, { sha256: sha256(sources[index]), bytes: sources[index].length }, config)));
  assert.equal([...prepared.sql.matchAll(/^BEGIN ISOLATION LEVEL READ COMMITTED READ WRITE;$/gm)].length, 1);
  assert.equal([...prepared.sql.matchAll(/^COMMIT;$/gm)].length, 1);
  const lock = /LOCK TABLE storage_reservation_private\.namespace, storage_reservation_private\.admission,\s+storage_reservation_private\.reservation IN SHARE ROW EXCLUSIVE MODE;/.exec(prepared.sql);
  assert.ok(lock && lock.index < prepared.sql.indexOf('DO $db07_seed$'));
  assert.match(prepared.sql, /INSERT INTO storage_reservation_private\.namespace/);
  assert.match(prepared.sql, /INSERT INTO storage_reservation_private\.admission/);
  assert.match(prepared.sql, /20261107041336/);
  assert.doesNotMatch(prepared.sql, /ON CONFLICT|(?:INSERT INTO|UPDATE|DELETE FROM) storage_reservation_private\.reservation|storage_reservation_api\./i);
  await assert.rejects(prepareCopyAdmissions(manifest, configBytes, { ...seedOptions, receiptSha256: 'a'.repeat(64) }),
    /^Error: backup_receipt$/);
  await assert.rejects(prepareCopyAdmissions(manifest, configBytes, { ...seedOptions, bindingConfigSha256: 'a'.repeat(64) }),
    /^Error: seed_config_digest$/);
  const secondPath = join(full.backupRoot, receipt.records[1].filename);
  if (linux) {
    await chmod(secondPath, 0o640);
    await assert.rejects(verifyBackup(manifest, full), /^Error: backup_acl$/);
    await chmod(secondPath, 0o600);
  }
  const sealed = await readFile(secondPath);
  const decoder = createDecipheriv('aes-256-gcm', full.key, sealed.subarray(8, 20), { authTagLength: 16 });
  const second = records[1];
  decoder.setAAD(Buffer.from(JSON.stringify([full.manifestSha256, second.document_id, second.source_metadata.id,
    second.source_metadata.size, 'DB07 backup attempt v1', full.attemptId, full.keySha256])));
  decoder.setAuthTag(sealed.subarray(-16));
  assert.deepEqual(Buffer.concat([decoder.update(sealed.subarray(20, -16)), decoder.final()]), sources[1]);
  sealed[sealed.length - 1] ^= 1;
  await writeFile(secondPath, sealed);
  await assert.rejects(prepareCopyAdmissions(manifest, configBytes, seedOptions), /^Error: backup_authentication$/);
  await writeFile(receiptPath, JSON.stringify({ ...receipt, records: [receipt.records[0]] }));
  await assert.rejects(verifyBackup(manifest, full), /^Error: backup_receipt$/);
  assert.equal(requests.length, 11);
});

test('admission CLI has no execution mode and suppresses unexpected argument values', () => {
  const result = spawnSync(process.execPath, ['tools/private-media/prepare-copy-admissions.mjs', '--execute', 'sensitive-fixture-value'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /arguments/);
  assert.doesNotMatch(result.stderr, /sensitive-fixture-value/);
});
