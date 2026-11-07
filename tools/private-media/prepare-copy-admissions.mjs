// Offline only. Prepare a private admission script without a database or Storage connection.
import { createSecretKey } from 'node:crypto';
import { open, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPrivateBackupDirectory, readPrivateBackupInput, verifyBackupReceipt } from './backup-sink.mjs';
import { copyBinding } from './copy-reserved.mjs';
import { inspectManifest } from './copy-verified.mjs';
import { sha256 } from './prepare-cutover.mjs';

const INSTALL_VERSION = '20261107041336';
const INSTALL_NAME = 'private_storage_copy_reservations';
const INSTALL_BYTES = 12290;
const INSTALL_SHA256 = '56a5d9565b5fb584a95ae624d0bdff909ef79da2bfda7f65bf12ba04e601d5de';
const HASH = /^[a-f0-9]{64}$/;
const CONFIG_KEYS = 'epoch,manifest_sha256,mode,namespace_id,project_ref,storage_origin_sha256';
const literal = value => "'" + value.replaceAll("'", "''") + "'";
function requireThat(condition, code) {
  if (!condition) throw new Error(code);
}

function seedSql(bindings) {
  const batch = JSON.stringify(bindings);
  const count = bindings.length;
  const { namespace_id: namespace, project_ref: project, storage_origin_sha256: origin, epoch, manifest_sha256: manifest } = bindings[0];
  requireThat(!batch.includes('$db07_seed$'), 'seed_payload');
  return `-- PRIVATE: admits an entire batch in one transaction. Keep outside Git.
-- Review the exact hosted TLS target and freeze before psql -X -v ON_ERROR_STOP=1.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
SET LOCAL standard_conforming_strings = on;
SET LOCAL search_path = pg_catalog, pg_temp;
DO $db07_seed$
DECLARE
  expected CONSTANT pg_catalog.jsonb := ${literal(batch)}::pg_catalog.jsonb;
  inserted pg_catalog.int8;
BEGIN
  IF pg_catalog.current_database() <> 'postgres' OR session_user <> 'postgres' OR current_user <> 'postgres'
     OR pg_catalog.current_setting('server_version_num')::pg_catalog.int4 / 10000 <> 17
     OR pg_catalog.current_setting('synchronous_commit') <> 'on'
     OR pg_catalog.current_setting('fsync') <> 'on' OR pg_catalog.current_setting('full_page_writes') <> 'on' THEN
    RAISE EXCEPTION 'DB07 admission executor or durability guard';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations m
      WHERE m.version = '${INSTALL_VERSION}' AND m.name = '${INSTALL_NAME}'
        AND pg_catalog.cardinality(m.statements) = 1
        AND pg_catalog.octet_length(pg_catalog.convert_to(m.statements[1], 'UTF8')) = ${INSTALL_BYTES}
        AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(m.statements[1], 'UTF8')), 'hex') = '${INSTALL_SHA256}'
  ) THEN
    RAISE EXCEPTION 'DB07 exact installation receipt required';
  END IF;

  LOCK TABLE storage_reservation_private.namespace, storage_reservation_private.admission,
    storage_reservation_private.reservation IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM storage_reservation_private.namespace)
     OR EXISTS (SELECT 1 FROM storage_reservation_private.admission)
     OR EXISTS (SELECT 1 FROM storage_reservation_private.reservation) THEN
    RAISE EXCEPTION 'DB07 registry is not empty; reconcile without writing';
  END IF;

  INSERT INTO storage_reservation_private.namespace
    (id, project_ref, storage_origin_sha256, epoch, manifest_sha256, bucket, prefix, active)
  VALUES ('${namespace}', '${project}', '${origin}', '${epoch}', '${manifest}', 'legal-documents', 'objects/', true);
  INSERT INTO storage_reservation_private.admission (bucket, object_key, namespace_id, binding)
    SELECT binding->>'bucket', binding->>'key', (binding->>'namespace_id')::pg_catalog.uuid, binding
    FROM pg_catalog.jsonb_array_elements(expected) AS planned(binding);
  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted <> ${count} OR (SELECT count(*) FROM storage_reservation_private.admission) <> ${count}
     OR (SELECT count(*) FROM storage_reservation_private.namespace) <> 1
     OR NOT EXISTS (
       SELECT 1 FROM storage_reservation_private.namespace n
         WHERE n.id = '${namespace}' AND n.project_ref = '${project}' AND n.storage_origin_sha256 = '${origin}'
           AND n.epoch = '${epoch}' AND n.manifest_sha256 = '${manifest}' AND n.bucket = 'legal-documents'
           AND n.prefix = 'objects/' AND n.active
     )
     OR EXISTS (
       SELECT 1 FROM pg_catalog.jsonb_array_elements(expected) AS planned(binding)
         LEFT JOIN storage_reservation_private.admission a
           ON a.bucket = planned.binding->>'bucket' AND a.object_key = planned.binding->>'key'
         WHERE a.binding IS DISTINCT FROM planned.binding
     )
     OR EXISTS (SELECT 1 FROM storage_reservation_private.reservation) THEN
    RAISE EXCEPTION 'DB07 admission postconditions failed';
  END IF;
END;
$db07_seed$;
COMMIT;
`;
}

export async function prepareCopyAdmissions(manifest, bindingConfig, options) {
  const { projectRef, manifestSha256, bindingConfigSha256, receiptSha256, expectedCount = 1710 } = options;
  requireThat(HASH.test(manifestSha256) && HASH.test(bindingConfigSha256) && HASH.test(receiptSha256)
    && Number.isSafeInteger(expectedCount) && expectedCount > 0 && expectedCount <= 1710, 'seed_pins');
  requireThat(sha256(bindingConfig) === bindingConfigSha256, 'seed_config_digest');
  const config = JSON.parse(bindingConfig);
  requireThat(config && Object.keys(config).sort().join(',') === CONFIG_KEYS && config.mode === 'hosted'
    && typeof config.namespace_id === 'string' && typeof config.epoch === 'string', 'seed_config');
  const inventory = inspectManifest(manifest, projectRef, expectedCount);
  requireThat(inventory.digest === manifestSha256, 'seed_manifest_digest');
  const verified = await verifyBackupReceipt(manifest, { ...options, expectedCount });
  const bindings = inventory.records.map((record, index) => copyBinding(inventory, record, verified.records[index], config));
  const inputPins = '-- Backup receipt SHA-256 ' + verified.receiptSha256 + '\n'
    + '-- Binding configuration SHA-256 ' + bindingConfigSha256 + '\n';
  return { sql: inputPins + seedSql(bindings), records: bindings.length, bytes: verified.bytes,
    manifest_sha256: inventory.digest, backup_receipt_sha256: verified.receiptSha256,
    binding_config_sha256: bindingConfigSha256 };
}

async function run() {
  const allowed = new Set(['--manifest', '--project-ref', '--expect-sha256', '--binding-config',
    '--expect-binding-config-sha256', '--backup-root', '--attempt-id', '--key-file', '--key-sha256',
    '--expect-backup-receipt-sha256', '--out']);
  const options = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    const name = process.argv[i];
    const value = process.argv[i + 1];
    requireThat(allowed.has(name) && !Object.hasOwn(options, name) && value && !value.startsWith('--'), 'arguments');
    options[name] = value;
  }
  requireThat(Object.keys(options).length === allowed.size && isAbsolute(options['--out']), 'arguments');
  const filename = basename(options['--out']);
  requireThat(filename.endsWith('.sql') && !filename.includes(':'), 'private_artifact_required');
  const parent = dirname(resolve(options['--out']));
  assertPrivateBackupDirectory(parent);
  const root = await realpath(fileURLToPath(new URL('../../', import.meta.url)));
  const out = resolve(await realpath(parent), filename);
  const local = relative(root, out);
  requireThat(isAbsolute(local) || local === '..' || local.startsWith('..' + sep), 'private_artifact_required');
  const manifest = await readPrivateBackupInput(options['--manifest'], 4 * 1024 * 1024);
  const config = await readPrivateBackupInput(options['--binding-config'], 8192);
  const rawKey = await readPrivateBackupInput(options['--key-file'], 32);
  let key;
  try {
    requireThat(rawKey.length === 32, 'backup_key');
    key = createSecretKey(rawKey);
  } finally {
    rawKey.fill(0);
  }
  const { sql, ...report } = await prepareCopyAdmissions(manifest, config, {
    projectRef: options['--project-ref'], manifestSha256: options['--expect-sha256'],
    bindingConfigSha256: options['--expect-binding-config-sha256'], receiptSha256: options['--expect-backup-receipt-sha256'],
    backupRoot: options['--backup-root'], attemptId: options['--attempt-id'], keySha256: options['--key-sha256'], key,
  });
  const output = await open(out, 'wx', 0o600);
  try { await output.writeFile(sql); await output.sync(); } finally { await output.close(); }
  console.log(JSON.stringify({ mode: 'offline_prepared', network: false, ...report, sql_sha256: sha256(sql) }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run().catch(error => {
  const code = /^[a-z_]+$/.test(error.message) ? error.message : 'invalid_input_or_io';
  console.error('DB07 admission preparation refused: ' + code);
  process.exitCode = 1;
});
