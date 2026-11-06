# Canonical origin for email links

Login returns also reject backslashes, control characters and external origins
after URL normalization. Safe internal parameters/fragments and role defaults
are preserved. Actor returns are checked against the normalized portal pathname,
so dot segments cannot escape `/espace`. This interaction was explicitly approved.

Admin invitations, actor invitations, list mail and notification mail now use only
the deployment's `NEXT_PUBLIC_APP_URL`. Request Origin, Host and Forwarded headers
cannot select a destination. Missing/invalid configuration returns HTTP503 before
an invitation/account replacement, notification claim or public list-link creation.

Configure an HTTPS origin with no credentials, path, query or fragment before
deploying. An explicit HTTP loopback URL is supported outside production only.
The existing Compose variable is reused. Its server lookup stays dynamic so the
standalone image reads runtime configuration; see the [Next.js documentation](https://nextjs.org/docs/app/guides/environment-variables#bundling-environment-variables-for-the-browser).

Unit/route tests use synthetic SMTP/Auth implementations and foreign headers to
assert the exact destination and fail-closed behavior. They do not prove the live
proxy accepts forged Host headers or that a deployed email was previously poisoned.
The deployment configuration still requires a read-only check before rollout.
