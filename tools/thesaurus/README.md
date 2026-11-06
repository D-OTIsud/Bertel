# Thesaurus verification evidence: historical database tools are quarantined

The database scripts in this directory produced the historical results recorded
in the delivery audit. Their source remains available to review those results.
**They are not reusable operator commands.** Their CLI entry points and normal
imports now stop before loading a database driver, parsing a target, opening a
connection, changing a database, or writing a result. There is no override flag
or environment variable that enables them.

This applies to new executions/imports of this source version. It cannot revoke
old module objects already loaded in a long-running interpreter, earlier source
copies, or deliberately rewritten code. Close old interpreter sessions before
using the updated checkout. Do not describe this source quarantine as a sandbox
or as retroactive cleanup of earlier runs.

The quarantine covers `benchmark_existing.py`, `restore_local_cron_fixture.py`,
`preparation_test_oracle.py`, `verify_configuration_race.py`,
`verify_filter_expansion.py`, `verify_live_restore.py`,
`verify_native_projection.py`, `verify_preparation_fk_races.py`,
`verify_preparation_late_writer.py`, `verify_preparation_races.py`,
`verify_prepared_runtime.py`, `verify_publish_race.py`, `verify_runtime.py`, and
`verify_usage_projection.py`. The HTTP-only `verify_partner_http.py` is outside
this database hardening change; this document does not certify its behavior.

## Why the historical interfaces are closed

The old checks are insufficient to establish a safe disposable target:

- `host=127.0.0.1` alone does not neutralize ambient `PGHOSTADDR`, `PGSERVICE`,
  `PGOPTIONS` and other libpq configuration. Several scripts could create a
  database before attesting the server they had actually connected to.
- A database-name prefix, or a name equal to a previously used local clone,
  does not prove who created or owns that database. Existing clones must not
  be adopted or retried on that basis.
- The runtime benchmark committed synthetic journal rows before all checks
  were protected by a global cleanup boundary. The FK harness could change
  functions in autocommit before entering its cleanup block. Old cleanup
  success on another path does not qualify these failure paths.

The immediate safety measure is refusal, rather than an unqualified connection
wrapper around the same historical mutations. This change does **not** certify
that the preserved code now cleans up after partial failure, prove that any old
clone is restored, or establish new publication/performance results. In
particular, it must not be described as a new PostgreSQL race or restore proof.

## Conditions for a separately reviewed replacement

A replacement must establish all of the following before it is made runnable:

1. Before connection, reject ambiguous libpq environment/configuration and
   unsupported options without displaying their values. Use an explicit,
   non-shared disposable endpoint; the historical server on port 55439 and its
   copies are excluded from these new tests.
2. Initially connect without mutation capability. Attest the effective peer,
   server/system identity, instance lifetime and database identity/owner using
   independent expected evidence from a newly provisioned fixture. A literal
   host, returned DSN, database prefix, or caller-written ownership assertion
   alone is not that evidence. No `CREATE DATABASE`, grant, fixture insert or
   function instrumentation may precede this attestation.
3. Create each clone through a controlled provisioner and bind a fresh run
   identity to the actual server, database identity, owner and provenance. Do
   not silently adopt a pre-existing database or infer ownership from its name.
4. Persist a single-use run state **before the first mutation**. A pending,
   interrupted, failed or unproven-cleanup run is quarantined and cannot be
   retried automatically. A new process must also refuse an interrupted run.
5. Enter the outer cleanup boundary before the first mutation, including
   autocommit setup, journal seeding and function instrumentation. Track every
   resource and mutation as it is acquired. Stop/join workers and close their
   connections before attempting restoration; report cleanup failures without
   replacing the original failure or recording a false success.
6. Establish a baseline and verify the complete promised restoration:
   definitions/owners/ACL/enabled triggers, rows and receipts, object versions,
   projections and other claimed state. If any part is not attested, preserve
   the failure evidence, quarantine the clone and refuse reuse. Quarantine is
   not proof that restoration succeeded.
7. Exercise pure pre-connection refusals, then synthetic failures at every
   acquisition/mutation/cleanup boundary on a fresh owned fixture. Include
   process interruption and restart refusal. A genuine new PostgreSQL proof is
   required before claiming the replacement works against PostgreSQL.

No connection factory or ownership protocol meeting those conditions is shipped
by this quarantine change. Consequently there is no supported route from these
historical commands to a live or disposable database. An operator cannot reopen
them by supplying a manifest, flag, environment value or old evidence file.

## Verification and retained evidence

Run the pure refusal tests with Python's standard library; no PostgreSQL or
`psycopg2` installation is needed:

```powershell
python -m unittest discover -s tools/thesaurus -p "test_archived_tools.py" -v
```

The tests use temporary sentinels to detect driver imports, connection or output
attempts. They check normal CLI/import paths, poisoned libpq configuration,
unowned/ambiguous targets and optimized Python. They do not execute the old
mutation paths or pretend to validate their `finally` blocks by simulation.
Every child must acknowledge that its sentinels were installed. Separate
positive controls verify that the driver, parser, socket, configuration, output
and forged-helper probes are reached and refused as intended. The socket probe
does not request a connection or DNS lookup, even if the sentinel is broken.

Keep all earlier reports and private database copies unchanged. Historical
measurements retain only their original scope; they cannot certify these new
target or cleanup requirements. The application, migrations, published
thesaurus, partner API and deployment configuration are outside this change.
