# Import and isolated smoke

`import_and_smoke.py` is a separate operator mutation after the receiver has
verified an archive. It imports one reviewed image, checks its immutable identity,
creates a local candidate tag, and tests an isolated container. It never deploys
the application, changes Compose, binds a public port or supplies a service secret.

The operator must hold an exclusive writer freeze for the candidate tag and
inspected images throughout this operation. Inspect-then-tag is **not CAS**.
The script checks before and after; it does not fence another Docker writer.

The base64 JSON argument contains `folder`, `expected`, `receiver_succeeded: true`,
`current_container` and `writers_frozen: true`. `expected` is the receiver's exact
reviewed parameter object. The current container is supplied by the operator;
the source contains no deployment-specific container name, URL or release pin.
The receipt, folder ownership and ZIP/manifest/gzip hashes are rechecked before
mutation. Public configuration is read as six selected public fields only and
must match its expected canonical hash.

`import-smoke-operation/` is exclusive and never adopted on retry. Its immutable
JSON records and parent directories are fsynced. Smoke name, nonce and expected
image are durable before `docker create`; the returned full container ID is
durable before start. Missing/invalid acknowledgements, transport failures and
interruptions stop the procedure. They leave records for read-only inspection,
with no automatic replay or cleanup of an uncertain request.

Known start/probe failures may clean only a confirmed ID whose Docker metadata
matches the exact ID, name, nonce label and image. Cleanup intent and acknowledgement
are also durable; a lost cleanup acknowledgement is not retried. The script
does not roll back an imported image or tag automatically.

The smoke has `--network none`, no published port, `--no-healthcheck`, bounded
CPU/memory/pids, dropped capabilities and no new privileges. Disabling the
inherited image healthcheck keeps readiness outside this smoke's scope. Its
three explicit GETs are `/api/health`, `/api/app-version` and `/runtime-config.js`,
all with `redirect: 'error'`. Runtime configuration is parsed without evaluating
JavaScript, must have exactly six unique expected string keys, and must match
the public configuration hash. Health and the 2/2 contract must pass.

On refusal, inspect the immutable operation journal and the recorded identity
read-only before choosing a new operation. An existing operation directory
blocks automatic retry. A crash can leave only an intent, including when Docker
already performed a request. Those states are deliberately not interpreted as
evidence that no effect occurred.

Tests use synthetic Docker effects and a real Node process with an in-process
loopback HTTP fixture/fake fetch. The Linux guard job tests actual private file
modes, exclusive records and fsync failure ordering as root in a disposable runner.
It does not start a Docker container, build an image or contact production.
