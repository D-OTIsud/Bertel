# Object creation location — source and isolated local catalogue supplement

**Scope:** source and an isolated PostgreSQL 17 rehearsal on 27 November 2026.
This is **not a production deployment, a production catalogue capture, or a full
graph refresh**. The final local metadata was captured from
`bertel_create_location_test_20261127` at `2026-11-27T10:24:25.049039+04:00`.
See [the body-free local evidence](CREATE_OBJECT_LOCATION_LOCAL_CATALOG.json),
which includes the exact migration SHA-256, function hashes, grants, trigger
definitions and the recorded verification results.

Source: [20261127061143_create_object_required_location.sql](../supabase/migrations/20261127061143_create_object_required_location.sql).
The earlier [location INSEE supplement](LOCATION_INSEE.md) has a separate live
production provenance; its deployment must not be confused with this local work.

## Functions and write contract

| Signature | Behaviour / relations | Access |
| --- | --- | --- |
| `api.rpc_create_object(text,text,text,text,text)` | Required named arguments `p_object_type`, `p_name`, `p_region_code`, `p_city`, `p_postcode`, with no defaults. Checks the existing current creation permission, resolves and validates the official postal/commune pair, then inserts `public.object` and its main `public.object_location` in one transaction. Existing triggers maintain organization attachment, author, realm, history and governed INSEE assignment. | SECURITY DEFINER; authenticated application user required; effective EXECUTE for authenticated/service_role, denied to anon. |
| `api.rpc_create_object(text,text,text)` | Legacy region default retained. Delegates to the five-argument function with absent city/postcode and refuses after authorization with `MISSING_REQUIRED_FIELD`. The old two-key and three-key clients cannot create a fiche without an address. | Same explicit EXECUTE grants and denial to anon. |
| `internal.guard_object_main_location_insee()` | Reads and locks the one owning object, then checks that it retains a direct main location with INSEE. Uses `FOR NO KEY UPDATE`; ignores an owner already deleted and institutional ORG records. | Private SECURITY DEFINER trigger helper owned by postgres; direct EXECUTE denied to anon, authenticated and service_role. Its bounded owner-ID lookup is solely an integrity decision and adds no application authorization bypass. |

All three functions have fixed search paths. The new overload has no default
arguments, so PostgREST selects a single signature from the supplied argument
names. The canonical `object_location` INSEE resolver and thesaurus assignment
guard remain authoritative; a late assignment failure rolls back object,
location, organization links and history together.

## Deferred integrity guards

Four enabled constraint triggers are `DEFERRABLE INITIALLY DEFERRED`:

- `object_creation_main_location_required`: new non-ORG objects.
- `object_type_main_location_required`: actual type changes to a non-ORG type.
- `object_main_location_delete_required`: deletion of a direct main address.
- `object_main_location_update_required`: demotion or transfer of that address.

The final transaction state is checked. An importer can insert an object before
its address in the same transaction, and an editor can replace the main address
atomically. A transaction cannot leave a new non-ORG fiche without a main INSEE
location. Existing address-free history is not retroactively rejected; the four
pre-existing objects without main locations are preserved. Institutional ORG
creation remains under its existing onboarding workflow.

The owner row lock uses `FOR NO KEY UPDATE` to remain compatible with the
`KEY SHARE` locks taken by ordinary child-table foreign keys while serializing
the integrity decision with retyping and deletion. Two real concurrent local
connections reproduced a `40P01` deadlock with `FOR UPDATE`; after this correction,
both the retyping transaction and the main-address replacement committed.

## Verified local behaviour

The migration was reapplied idempotently to the isolated copy of
`bertel_location_insee_test_20261127`. Recorded SQL results are:

- `test_create_object_required_location.sql`: PASS — real authorized creator,
  named five-argument call, correct main INSEE, legacy refusal, input validation,
  denied caller/session, governed late-failure rollback and sandbox realm.
- `test_object_main_location_required.sql`: PASS — direct creation and deferred
  main-location integrity, including transaction-end checks and replacement.
- `test_object_initial_publication_guard.sql`: PASS.
- `test_test_org_isolation.sql`: PASS.
- `test_location_insee.sql`: PASS.
- `test_object_current_rights_committed_revocation.sql`: PASS with the disposable
  current-rights test setting, on this isolated copy only.

The final local capture has 1,183 location rows, zero missing INSEE codes and four
objects without main locations. These are **local** counts, not a new production
measurement. The verification evidence reports no creation fixture objects, no
creation fixture auth users and no remaining race fixture object.

The approved creation UI now collects Code postal and Commune, uses the published
assignable commune snapshot plus the postal lookup, and sends both values in the
single creation RPC without exposing INSEE entry. Its three targeted Jest suites
passed 42 tests and typecheck passed. Browser QA and production deployment are
separate evidence and are not claimed by this catalogue supplement.

## Catalogue provenance

`graph.json`, global `FUNCTIONS.md`/`FUNCTION_ACCESS.md`, `POLICIES.md`, per-table
`dbdoc/`, and rendered database references are not regenerated or relabelled by
this supplement. Their full production baseline and existing separately scoped
updates remain intact. Consult this local evidence for the proposed RPC and
constraint triggers until a later complete live extraction incorporates an
actually deployed version.
