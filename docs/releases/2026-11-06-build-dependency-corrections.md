# Build dependency corrections

Starting point: master `d1313f3d81a1ccc70cc78a1b16159abb760fd85d`.
The current lock-only npm audit confirmed both advisories below. This lot changes
only their compatible locked versions, tests and CI. Application code, CSS,
PostCSS/Autoprefixer/Next versions, MapLibre and its backport artifact are unchanged.

| Dependency | Locked before | Locked after | Advisory |
| --- | --- | --- | --- |
| source-map-js | 1.2.1 | 1.2.2 | [GHSA-68fv-2mgg-jv7q / CVE-2026-93749](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) |
| baseline-browser-mapping | 2.10.8 | 2.11.0 | [GHSA-w5vr-8v7q-w6rv / CVE-2026-45819](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv) |

Both corrected versions satisfy the existing parent ranges: PostCSS 8.5.28 uses
`source-map-js ^1.2.1`; Next 16.4.5 and Browserslist 4.28.1 use Baseline `^2.9.19`
and `^2.9.0`. These are the first fixed releases, rather than an update to the
latest Baseline dataset. npm generated the targeted lock entries and validated
the final graph with the original direct dependencies restored. No permanent
override, new direct dependency or blanket audit fix is introduced. The two
licenses remain BSD-3-Clause and Apache-2.0 respectively.

## Fixes and actual uses

The [source-map-js fix](https://github.com/7rulnik/source-map-js/commit/cf7658058ceeaa8619d5ae0ec90be6905209d016)
validates indexed offsets, including cumulative nested offsets, before their
conversion can amplify work or memory. It also improves conversion of line gaps
and nested maps. The
[1.2.2 release](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2)
contains that fix.

The [Baseline fix/release](https://github.com/web-platform-dx/baseline-browser-mapping/releases/tag/v2.11.0)
replaces process termination with exceptions for conflicting options, including
inconsistent KaiOS/downstream-browser configuration. This minor release also
refactors dataset compression and adds an API; it is not represented as a
one-line patch. Historical browser/version projections used by the tests are
unchanged between 2.10.8 and 2.11.0. Chrome release-date metadata for those
projections changes by two days; the test deliberately checks target versions,
not a claim of identical entire datasets.

There are no direct application imports of either package. PostCSS's input/map
modules load source-map-js. Next's compiled Browserslist loads the external
Baseline package; its build browser selection and compiled CSS/Babel/Webpack
tools use that Browserslist. The app's PostCSS config uses Tailwind and
Autoprefixer and defines no custom Browserslist/Baseline target.

The lockfile does not label both packages dev-only because Next participates in
the production dependency graph. This is not evidence of a public HTTP exploit
path. The final-image checker measures package-installed copies in the emitted
standalone image, including nested dependencies, and rejects vulnerable or
unidentified copies. It first verifies the known Next installation under `/app`;
a wrong or missing root cannot be mistaken for absence. It does not inventory
code inlined into other bundles. Next's separate vendored `source-map` and
`source-map08` modules are unchanged; this package update does not certify those
implementations. Absence is reported rather than assumed. No live deployment
or production reachability measurement is performed in this lot.

## Evidence and gates

The isolated installation uses the real locked parent APIs. Seven Node tests
cover parent resolution, malicious indexed offsets and their nested sum, valid
source-map roundtrips/line gaps, PostCSS plus Autoprefixer output and source
content, Baseline exception recovery, historical browser targets, the real Next
Browserslist query, and negative final-image inventory fixtures.

The same two security witnesses fail against the unchanged old modules:
source-map-js accepts an excessive indexed offset, and Baseline terminates the
bounded child instead of returning through a caught exception. The source-map
witness stops at construction and never requests a harmful serialization. The
Baseline child has a timeout and memory cap. Old packages exist only in private
disposable probes, not the application or CI dependency graph.

```sh
cd bertel-tourism-ui
npm ci --legacy-peer-deps
npm run test:tooling-dependencies
npm run typecheck
npm run build
```

CI runs the API tests on Node 22 Ubuntu and in the actual Alpine builder, then
inventories the final non-root image. Existing native image, PDF, MapLibre and
browser gates remain enabled. Full application build/runtime validation remains
a release gate; a successful isolated probe alone is not that proof. The raw
before/after audit reports and probe logs remain private outside Git.

The follow-up lock-only audit must remove these two advisories specifically.
Other audit findings remain separate; this record makes no clean-audit claim.
No deployment or production configuration change is included.
