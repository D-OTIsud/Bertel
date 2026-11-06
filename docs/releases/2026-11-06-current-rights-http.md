# Current-rights HTTP witnesses

The disposable SQL CI stack now exercises GoTrue-issued JWTs against real PostgREST requests. Confirmed users are created through the local admin endpoint, then authenticate with passwords and independently verify `/auth/v1/user`. No invite/recovery/mail/provider endpoint is used. Credentials remain in process memory; raw native stack startup output is withheld because it can contain generated keys.

The DB02 fixture accepts an optional flag for these already-created Auth identities; existing SQL callers keep their original setup. Six synthetic users, current memberships and exact synthetic objects are isolated in the disposable stack. No production migration, policy, grant or application flow changes.

| Witness | Positive | Committed change and same-JWT refusal |
| --- | --- | --- |
| ORG A/B | Separate private reads and canonical PATCH | Foreign ORG, creator/e-mail/stale app-metadata claims add no authority |
| Current writer | Real private history, restore and legal file locator | Business-role demotion denies PATCH/restore/private documents |
| Individual permission | Current explicit exception works | Revocation denies; departure denies even with individual permission retained |
| ORG switch | New single current ORG is readable/writable | Prior private scope and prior ORG PATCH disappear |
| Test/production realm | Test user reads and PATCHes test object; prod public read remains available | Membership switch changes realm immediately, despite stale JWT metadata |
| Actor portal | Nonempty workspace, private preview and proposal | Link expiry, profile-role demotion and actor unlink deny subsequent calls |

Every authorization transition is committed through a separate database connection. The original access-token bytes are reused without refresh, and Auth remains valid after the rights are lost. Refused requests must leave canonical state/proposals unchanged. The existing published-object and published-history read rules remain positive; this work does not change historical projection policy.

A separate Storage probe uses a few synthetic PDF/PNG bytes in new private buckets. It checks flat info, authenticated HEAD, actual SHA256, cross-bucket ACK identity, exact apostrophe/space keys, denied anonymous access and no-overwrite collisions/concurrency. Storage API v1.41.8 rejects accented upload keys with `InvalidKey`; this version-specific negative witness is explicit, and no accented-key copy support is claimed. Its [key validator](https://github.com/supabase/storage/blob/v1.41.8/src/storage/limits.ts#L50-L54) permits the positive ASCII key. Stored cache metadata is preserved independently from authenticated transport Cache-Control. It does not call or relax the production copy operator, and a local Storage image cannot attest production behavior.

Safety gates require explicit CI opt-in, a marked workdir inside runner temp, literal loopback API/DB targets and a matching stack DSN. Alternate-host query overrides, redirects and remote targets refuse. Users/rows/objects/buckets are cleaned through their fixture owners; append-only traces and any failed cleanup remain inside the disposable runner, which is stopped in the final CI step and destroyed by the hosted job lifecycle.

Local validation covers syntax and target-refusal guards only. The real HTTP contracts require the frozen candidate's SQL CI run; no native-Postgres substitute or Next build is claimed as that evidence.

Primary contracts: [Auth admin creation](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [database authorization](https://supabase.com/docs/guides/database/secure-data), [private Storage buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals).
