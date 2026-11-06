# Import and isolated smoke

`import_and_smoke.py` never deploys the application or changes Compose. Fresh mode
imports a reviewed image, validates portable identity and local Size, then runs
the bounded tag/smoke procedure. One explicit legacy continuation can adopt a
confirmed load without loading again.

The operator must hold an exclusive writer freeze for the candidate tag and
inspected images. Inspect-then-tag is **not CAS** and does not fence another
Docker writer. Quarantine path checks require exclusive trusted root ownership;
they reopen paths across calls and are not an atomic file-descriptor snapshot.

The JSON argument contains `folder`, the original `expected` receiver object,
`receiver_succeeded: true`, `current_container`, `writers_frozen: true`, and
`image_identity`. The latter contains `config_sha256` equal to the expected
image ID plus `rootfs: {type: "layers", diff_ids: [...]}` extracted from the
audited immutable config. Original receiver parameters and manifests are unchanged.

Portable identity requires exact ID/config digest, ordered RootFS DiffIDs, OS,
architecture, USER and revision/source labels. The host's Docker-reported Size
must be a strict positive integer at most 1 GiB. It is recorded separately from
CI Size, with no equality requirement and no claim about the cause of a
difference. The new operation receipt records both measurements; old CI
manifests and receipts are never rewritten. Config content and uncompressed
DiffIDs define the cryptographic check, not a fresh rehash of host filesystem
files. See the [OCI config specification](https://github.com/opencontainers/image-spec/blob/v1.1.1/config.md).

Fresh uses the exclusive `import-smoke-operation/` journal. The immutable
records and directories are fsynced. Name/nonce/image precede create; its
acknowledged full ID and exact ID/name/nonce/image validation precede start.
Every nonzero `Docker.run` exit, timeout, interruption or invalid ACK is unknown:
no automatic replay or cleanup of that uncertain request.

The only continuation is `continuation.kind = "after_confirmed_load_4db"`.
Its predecessor operator digest must be the reviewed 4db tool. The profile
supplies exact byte sizes and SHA256 for only `00-intent.json`,
`10-load-intent.json`, `11-load-ack.json`. The original directory must contain
exactly those three regular root-owned mode0600 files. Raw hashes, strict JSON,
legacy version1 intent/source/image/tag/current/nonce/name/scope, and loaded=true
must agree. Missing, extra or divergent state refuses.

The continuation creates only the fixed exclusive sibling
`import-smoke-after-confirmed-load-4db/`. It preserves the original directory
and records the predecessor hashes, a fresh nonce/name and an honest adoption
record with `load_performed: false`. Portable physical identity, bounded Size
and empty RepoTags are mandatory before tag/create. It calls the same tag/smoke
tail and performs zero load calls. An existing sibling blocks any automatic
retry. New intents use version2 and cannot be adopted as legacy version1.
There is no general skip-load/start-stage/resume interface.

The smoke has network=none, no published port, `--no-healthcheck`, bounded
CPU/memory/pids, dropped capabilities and no new privileges. Its three GETs are
`/api/health`, `/api/app-version`, `/runtime-config.js`, all `redirect: 'error'`.
They test static health, 2/2 contract and exact six-field public configuration.
Runtime configuration is parsed without JavaScript evaluation. No readiness,
Auth, business, SMTP, AI, document or Storage operation is tested.

An acknowledged negative read-only probe may clean only its confirmed container.
Cleanup rechecks exact ID/name/nonce/image, journals intent and acknowledgement,
and never retries an uncertain rm. A foreign create ACK is refused outside the
cleanup zone. Images and tags are not automatically rolled back or deleted.

On refusal, stop and inspect the immutable journal read-only. Do not reset,
delete or replay it. S1 fresh is an operator-held sequence gate after successful
S0 continuation/smoke; preparing an S1 parameter file does not authorize running
it early.

Tests use synthetic Docker effects, real Node against loopback fixtures/fake
fetch, and native Linux-root file/mode/fsync checks. They start no real Docker
container, build no image and contact no production host.
