# Storybook middleware containment follow-up

Starting point: frozen Storybook candidate
`c676d2d002aca4a91b2e885d2fd8ccc3bb9ccf47`. This follow-up leaves that candidate
and its historical record unchanged. It adds an exact npm override only under
`@storybook/builder-webpack5@10.6.2`, selecting `webpack-dev-middleware 7.4.6`.
It does not change application code, styles, stories or Storybook configuration.
Before freezing, the branch fast-forwards to master
`73504d015b58398ef0c6c90ce9d539a5ae6bdc36`, whose tree is identical to `c676d2d`.

## Why this version needs an explicit compatibility gate

The [maintainer advisory GHSA-g84c-rxfj-3j2c / CVE-2026-76844](https://github.com/webpack/webpack-dev-middleware/security/advisories/GHSA-g84c-rxfj-3j2c)
describes traversal after stripping a non-slash-terminated `publicPath` prefix.
The official fixed releases are `7.4.6` and `8.3.0`; the npm advisory snapshot's
`7.4.5` boundary is not used as the fix. The registry's `version-6` tag remains
`6.1.3`, with no published `6.1.4`. The [7.4.6 release](https://github.com/webpack/webpack-dev-middleware/releases/tag/v7.4.6)
checks containment of the final resolved output filename.

Storybook's builder still declares `^6.1.2`, so the scoped override crosses its
declared major-version range and requires its own compatibility proof.
The [7.0.0 release](https://github.com/webpack/webpack-dev-middleware/releases/tag/v7.0.0)
raises the Node minimum to `18.12.0` and adopts `memfs 4`; the application's Node
22 baseline satisfies that engine. The selected version also brings MIME 3 and
stream-handling changes. The lock diff changes only one existing package entry
(`6.1.3` to `7.4.6`) and adds 30 entries in that middleware dependency chain,
including its own `memfs 4.80.0`. Other existing lock descriptors remain identical.

The [actual builder source](https://github.com/storybookjs/storybook/blob/v10.6.2/code/builders/builder-webpack5/src/index.ts)
imports the CommonJS factory as an ESM default, passes `publicPath`,
`writeToDisk: true`, `stats: 'errors-only'`, registers the handler, and calls
`waitUntilValid` and `close`. Those are the compatibility boundary verified here.
Because the builder writes to disk, in-memory-only storage cannot be asserted
as a mitigation. Default preview source uses an empty public path, but no broad
configuration or reachability exception is claimed.

## Significant tests

Four Node tests resolve the real middleware from the installed builder, not an
unrelated root copy:

1. Exact scoped selector, builder version, middleware version, Webpack peer and
   installed `memfs 4` alignment.
2. Real resolver denial before any synthetic outside-file lookup, including raw
   and encoded traversal variants, with positive asset/query/default-root cases.
   The identical witness fails when reading unchanged `6.1.3`; no old HTTP server
   is started, and the filesystem witness reads no real private file.
3. Actual Webpack compiler and patched loopback handler with the builder's disk
   options: stats, generated content, GET/HEAD/MIME/byte range, missing-file next
   handler, four traversal refusals against a fictional canary, real file-watch
   rebuild, explicit invalidation and close callbacks.
4. The same handler flow with default in-memory output, proving that the new
   `memfs 4` implementation serves and rebuilds the bundle without writing it to
   disk. The builder's disk-backed test is not misrepresented as memfs coverage.

Temporary fixtures are generated under a checked disposable path and removed
after closing the watcher and HTTP server. The browser suite still exercises
the complete real Storybook manager/preview and its origin boundaries. The
dedicated CI runs the four new API tests, existing six channel tests, full static
Storybook build and four no-retry Chromium tests on Node 22. Existing application
and production-image gates remain enabled. A small compiler probe alone is not
certification of the whole framework or every story interaction.

```sh
cd bertel-tourism-ui
npm ci --legacy-peer-deps
npm run test:webpack-middleware
npm run test:storybook-security
npm run build-storybook -- --disable-telemetry
npm run test:storybook-runtime
```

## Maintenance and remaining audit

Revisit this override whenever updating the builder: remove it when the upstream
range selects a fixed middleware, or renew the compatibility proof explicitly.
The parent version selector and installed-resolution test deliberately fail
closed when that boundary changes. There is no global override of unrelated
consumers and no global npm security exception.

The compared lock-only npm reports change from 44 to 43 affected package rows:
the middleware row disappears, while builder/Next Storybook rollups move from
high to low because their remaining inherited findings are lower severity.
Those severity movements do not represent three distinct advisories fixed.
Unique advisory identifiers change from 67 to 66: only the targeted GHSA is
removed, and no identifier or affected package row is added in these snapshots.
Other findings, including the conditional exact-artifact MapLibre version flag,
remain outside this fix. No clean-audit claim, deployment or production
configuration change is included.
