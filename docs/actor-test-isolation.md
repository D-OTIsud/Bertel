# Actor test isolation

The test corpus previously marked fictional actors with `extra.test_corpus`, but
CRM actor queries did not enforce that marker. Production super administrators
could therefore see those actors in the directory, actor picker, and direct
table reads even though their associated properties were isolated.

On 2026-09-07, a read-only production-session reproduction returned 919 CRM
actors, including all 212 seeded test actors. None of those 212 actors had a
link to a production property. No unmarked actor was linked exclusively to test
properties.

## Database contract

Migration `supabase/migrations/20260907073235_actor_test_realm_isolation.sql`
adds a durable `actor.is_test` dimension. Existing seed metadata identifies the
fictional records for backfill; names and email suffixes are not used to guess
whether a person is fictional. Actor creation derives its realm on the server,
and removing the last property link does not turn a test actor into a production
prospect.

Actor access must satisfy the current session's realm in addition to its existing
permissions. This includes super administrators. Restrictive row policies cover
table access; security-definer CRM and search functions also enforce the realm
because they bypass row policies. Links and CRM records must not connect an actor
to a property in the other realm.

The client clears old queries when the user, organization, or realm changes.
Persistence and mounted query observers use the same session scope, preventing
previously loaded actors from surviving a scope switch.

## Verification and rollout

The SQL regression is
`Base de donnée DLL et API/tests/test_actor_test_realm.sql`. It runs in a
transaction ending in `ROLLBACK`. Apply the migration before this test on a new
database. `ci_fresh_apply.sql` includes both after the test corpus and CRM
migrations.

For an existing database, first execute the migration and regression together in
one rolled-back transaction. Then apply the migration atomically, repeat the
regression, and compare production/sandbox directory counts against the seed
metadata. Keep real actors unchanged and retain the test corpus for the sandbox.

## Applied 2026-09-07

The migration was applied atomically to the live database after rollback-only
verification. An authenticated production administrator's directory changed from
919 actors (including 212 test actors) to 707 actors with zero seeded test actors.
Direct actor reads also returned zero test actors. The sandbox-realm probe
returned all 212 test actors and zero production actors. Existing actor counts
and the complete contents of the 707 production actor rows were unchanged.

Eleven relevant SQL regression files passed, including actor creation,
permissions, search, CRM lifecycle, portal access, seed/reset, contact export,
and existing erasure behavior. The new cache and document-promotion protections
passed 118 tests across their targeted frontend/API runs; TypeScript passed.
These application changes are in the workspace and require the normal
application deployment. The database visibility correction is already live.

The separate `test_gdpr_cleanup_operations.sql` suite could not run because the
pre-existing live database lacks `internal.gdpr_cleanup_task`; its unrelated
migration was not applied as part of this correction.
