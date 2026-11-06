# Distributed AI request admission

Translation and menu extraction retain their existing **12 requests per sliding
60 seconds, per verified user and per route**. Budgets stay separate. A request
is admitted at the same point as before: translation before reading its body;
extraction after validating the body/object-ID shape. Failed/forbidden requests
therefore keep their previous charging semantics. One extraction repair remains
part of one request, not another provider-budget admission.

`api.admit_ai_request(uuid,text)` is service-only and security-invoker. A private
RLS table stores at most twelve timestamps for each user/allowlisted route.
Primary-key insertion and a row lock serialize competing workers; time is read
after the lock and timestamps exactly 60 seconds old expire. Denial appends
nothing and returns the remaining wait in whole seconds. Ordinary clients cannot
execute the RPC or access the table; user identity comes from server `getUser`,
never request-body metadata. Existing caller-scoped object permissions remain.

Unavailable, malformed or timed-out admission fails closed with HTTP503 before
provider-secret lookup, image processing or paid work. The admission network
deadline is five seconds; caller abort propagates and a late positive result is
ignored. During extraction, an abort also prevents further image jobs/provider
start after the current image job settles; the local lease remains held until
that job settles. Its existing cancellation/error surface is reused.
An uncertain database timeout may already have consumed a slot and is
not refunded or retried. HTTP429 retains existing messages and reports the real
`Retry-After`. The existing frontend error state is reused; other configuration
503 responses keep their previous wording. Discovery remains blocked before any
quota/body/provider work. Existing per-process CPU leases are unchanged.

Apply `20261106145451_distributed_ai_request_admission.sql` before deploying the
application. Missing RPC/grants deliberately cause503, never fallback to a local
or unlimited counter. All replicas must run the new server before asserting a
distributed guarantee. An application rollback leaves the database state intact
but old servers again enforce only local quotas; do not describe that mixed or
rolled-back state as distributed protection. SMTP quotas, receipts, notification
delivery policy, organization budgets and distributed CPU leases are separate.

Validation includes real PostgreSQL17 service-role/negative privilege tests,
strict sliding-window expiration, independent consumers blocked on the same row,
one remaining slot, clock after lock, restart persistence and separate budgets.
API tests exercise real admission parsing/abort logic with simulated effects and
provider/DB responses. Fresh Supabase SQL CI is wired to run SQL, multi-connection
and real GoTrue/PostgREST role tests on its disposable loopback stack. The latter
creates a confirmed synthetic account, verifies its Auth identity, proves client
roles cannot call admission, and admits exactly12 of24 concurrent service-role
requests across two HTTP callers. Only an in-memory effect counter is used;
there is no AI provider, invite or email endpoint call. The account is removed.

`maxDuration=60` is deployment metadata in Next16.4.5, not a demonstrated
standalone execution timer. A successful admission adds its actual latency below
five seconds; the existing55-second provider timeout is unchanged. External
proxy/hosting limits and live disconnect propagation need separate operational
verification; this change does not claim a measured end-to-end60-second bound.
