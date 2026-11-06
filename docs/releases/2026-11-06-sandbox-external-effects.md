# Public discovery: external effects

The public discovery account remains available. Server routes verify its trusted
`app_metadata.sandbox_discovery` marker using Auth `getUser` and refuse real email,
portal/admin invitations and AI provider calls before reading request bodies or
loading provider/SMTP configuration. Service availability reports those features
as unavailable for that identity. User-editable metadata grants no authority.

Notifications retain their in-app event. A database trigger records durable
suppression when a notification concerns a discovery recipient/creator, a task
created by discovery, or a test object. Pending matching events are backfilled.
The service-only final check also suppresses buffered envelopes if their trusted
context changed after the claim. It fails closed if that check is unavailable.
Existing claim and acknowledgement function definitions remain unchanged.

Apply `20261106101044_sandbox_external_effects_policy.sql` before deploying the
application. The new application intentionally returns HTTP503 instead of sending
notifications if the new RPC is absent. Deploy both parts to enforce the complete
policy; retain the database suppression on an application rollback.

The classifier can recognize existing context and its durable marker. It cannot
reconstruct a deleted historical account/object origin that was never recorded.
This change does not configure Supabase Auth's public recovery or signup mail
endpoints, nor provide distributed SMTP quotas or exactly-once delivery.

Verification includes real PostgreSQL17 execution of the unchanged migration and
current claim function on an isolated reduced substrate; full-schema SQL CI runs
the versioned regression with current realm guards. API regressions verify no
provider/SMTP call on refusals and preserve ordinary authorized paths. No real
email or billed AI call is used by these tests.
