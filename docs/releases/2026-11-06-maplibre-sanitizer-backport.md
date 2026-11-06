# MapLibre 5.20.1 sanitizer backport

The approved choice is to retain the current map and WebGL1 compatibility. This
package applies the official sanitizer fix to the locked 5.20.1 distribution;
it does not introduce MapLibre 6, a fallback screen, new map defaults or adapter
changes. Application map components and styles are unchanged.

## Source and bounded security claim

- [GHSA-jrc7-96c5-q579 / CVE-2026-85061](https://github.com/maplibre/maplibre-gl-js/security/advisories/GHSA-jrc7-96c5-q579)
  describes skipped adjacent attributes when deleting from a live NamedNodeMap.
- [Official fix 1da69f3cd913a39fa948708e01478663bf48bc27](https://github.com/maplibre/maplibre-gl-js/commit/1da69f3cd913a39fa948708e01478663bf48bc27)
  snapshots attributes with `Array.from` before removal.
- [The 5.20.1 map source](https://github.com/maplibre/maplibre-gl-js/blob/v5.20.1/src/ui/map.ts)
  attempts WebGL2 and then WebGL1. The
  [v6 migration guide](https://maplibre.org/maplibre-gl-js/docs/guides/v5-to-v6-migration-guide/)
  documents the WebGL2 requirement and changed worker/default behavior.

This is a Bertel-maintained backport, not a new official upstream release.
The package name, version `5.20.1`, main entry, dependencies and original license
metadata remain unchanged. Registry scanners may therefore continue to report
the affected version. Any exception for this advisory is valid only with the
exact artifact integrity below, the installed-payload attestation and passing
behavioral witnesses. It does not cover any other advisory, another artifact or
an installation that fails verification. No global audit suppression is added.

## Pinned inputs and output

Official input: `https://registry.npmjs.org/maplibre-gl/-/maplibre-gl-5.20.1.tgz`
(690 ordinary files).

```text
sha512-57YIgfRct+rrk78ldoWRuLWRnXV/1vM2Rk0QYfEDQmsXdpgbACwvGoREIOZtyDIaq/GJK/ORYEriaAdVZuNfvw==
```

Reviewed output: `bertel-tourism-ui/vendor/maplibre-gl-5.20.1-bertel-security.1.tgz`
(686 files, 4,292,533 bytes).

```text
sha512-/x4YJXIM2hIZES78uXC29jJMHUyszCIwpcPZVJY4rDIwFShFRuDB3rlevJlYWXM+yNVqYPhjtgaq/xQ9aPW1Kg==
```

The adjacent manifest records every output file's SHA-256, the official input
integrity, patch commit, five before/after hashes, exact substitution counts and
the four omitted sourcemaps. `scripts/maplibre-backport.patches.json` also pins
each accepted source/result hash and the exact expression. A source change is
accepted only with exactly one substitution per file:

| Payload | Patch |
| --- | --- |
| `dist/maplibre-gl.js` | `e.attributes` → `Array.from(e.attributes)` in the pinned loop |
| `dist/maplibre-gl-csp.js` | Same pinned minified loop |
| `dist/maplibre-gl-dev.js` | `elem.attributes` → `Array.from(elem.attributes)` in the pinned loop |
| `dist/maplibre-gl-csp-dev.js` | Same pinned readable loop |
| `src/util/dom.ts` | Same official TypeScript fix |

Each of the four modified JavaScript bundles loses its single sourcemap
reference, and its now-inaccurate `.js.map` is omitted. Other sourcemaps are
unchanged. All remaining 681 payloads, including workers, CSS, types, package
metadata, `LICENSE.txt`, notices and dependencies, retain their original bytes.
The original BSD-3-Clause license and bundled third-party notices remain in the
artifact. No upstream rebuild or minifier is used.

## Reproduce and install

From `bertel-tourism-ui`:

```sh
node scripts/build-maplibre-backport.mjs --check
# Optional offline input, checked against the same official SRI:
node scripts/build-maplibre-backport.mjs --check --upstream /path/to/maplibre-gl-5.20.1.tgz
# Explicit regeneration during a reviewed packaging change:
node scripts/build-maplibre-backport.mjs --write --upstream /path/to/maplibre-gl-5.20.1.tgz
npm ci --legacy-peer-deps
npm run verify:maplibre
npm run test:maplibre-backport
```

The producer uses Node built-ins, validates the entire official input before
parsing, accepts only the known tar shape, and never extracts into `node_modules`.
It preserves official tar metadata/order, normalizes gzip metadata, and requires
the final archive's pinned SRI. Unknown input/output bytes or a changed producer
toolchain fail closed. An already-patched known file is a no-op. `--write` writes
only the two vendor artifacts and only if their bytes differ.

`package.json` and the lockfile install the reviewed local tarball directly.
There is no postinstall patch and no install-time network fetch for MapLibre.
Docker copies `vendor/` before `npm ci`. The prebuild verifier checks the actual
resolved main entry and all 686 installed payload files, including alternate
bundles and licenses, against the pinned artifact. It also checks package/lock
source and integrity. Extra, missing, altered or linked payload files fail.
The lock must contain exactly one MapLibre installation. The pinned upstream
package has no `exports`, `browser` or `module` entry; explicit checks reject any
alternate entry, in addition to hashing its entire original package metadata.

## Evidence and release gates

The local isolated npm installation passed eight Node tests. They reproduce the
unsafe consecutive-attribute case in the unchanged official default entry and
verify both payload families through the installed default entry plus all four
real bundles. Safe credit links survive. Other tests check reconstruction twice,
unchanged payloads, idempotence, unknown source/output rejection, missing/extra
files, altered bundles/licenses/version and a disguised manifest. jsdom uses
real host TextEncoder/TextDecoder and a Blob-URL host shim; no Map or worker is
instantiated in this sanitizer test. Nested lockfile copies and alternate
entrypoints are rejected by additional negative witnesses.

CI must additionally pass reconstruction and actual installed-bundle tests on
Node 22 Ubuntu and Node 22 Alpine. The final production image is tested with
Chromium against the actual Explorer map, real worker and GeoJSON pixels, zoom
navigation, unchanged overscale default, both ordinary WebGL2 and a browser with
WebGL2 context creation disabled (real WebGL1). Only offline synthetic map data
is used. This browser proof does not certify every physical GPU or third-party
tile service. Existing native image and real browser PDF gates remain enabled.
Map proofs have retries disabled. Their bounded readiness wait accepts only a
temporarily missing matching React ref/canvas; engine errors propagate and a
missing/lost GL context fails after ref readiness.

No production deployment or configuration change is part of this packaging lot.
