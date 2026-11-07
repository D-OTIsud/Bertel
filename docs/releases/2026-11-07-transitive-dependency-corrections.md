# Compatible transitive dependency corrections

Starting source: `19dbfb2fbd068302b17268f1ef6fa10bc829d483`.
Only the lockfile changes dependency resolution. The package manifest, overrides,
direct tool versions and reviewed MapLibre backport remain unchanged.

## Resolved scope

The targeted command was run with npm 11.11.0 / Node 25.8.1 in an isolated
worktree with no `node_modules`, an empty npm user/global configuration and a
private cache. No install script ran:

```sh
npm update axios brace-expansion browserslist follow-redirects form-data joi js-yaml picomatch \
  --package-lock-only --ignore-scripts --legacy-peer-deps --no-audit --no-fund
```

| Package | Previous versions | Resolved versions |
| --- | --- | --- |
| axios | 1.16.1 | 1.21.0 |
| brace-expansion | 1.1.12 / 2.1.0 | 1.1.21 / 2.1.7 |
| browserslist | 4.28.1 | 4.29.5 |
| follow-redirects | 1.16.0 | 1.16.2 |
| form-data | 4.0.5 | 4.0.6 |
| joi | 17.13.3 | 17.13.9 |
| js-yaml | 3.14.2 / nested 4.1.1 | 3.15.2 / nested 4.3.2 |
| picomatch | 2.3.1 / 4.0.3 / 4.0.4 | 2.3.2 / 4.0.7 |

The real npm resolution changes **21 package entries**, with no additions or
removals. Twelve entries previously affected by high advisories are corrected.
Six dependency entries accompany them: `caniuse-lite` 1.0.30001823,
`electron-to-chromium` 1.5.478, `node-releases` 2.0.63,
`baseline-browser-mapping` 2.11.35, `update-browserslist-db` 1.3.4 and
`hasown` 2.0.4. The new Browserslist requires newer versions of the first five;
form-data requires the last one.

The remaining three entries are previously corrected Picomatch 4.0.4 copies
under Storybook's test runner, `@types/jest` and `jest-config`. npm's update by
package name refreshes those to 4.0.7 as well. This is an explicit expansion
beyond the original sixteen-entry minimum, rather than a requirement imposed by
another dependency. The same-major patch line includes fixes to extglob branch
preservation and scanning; no matcher API major changes. The already corrected
js-yaml 4.3.2 copy under cosmiconfig remains unchanged.

All changed versions satisfy their existing parent ranges. Jest, Storybook,
Next, Supabase CLI and MapLibre keep their previous versions. Browser data
changes can affect CSS prefixes and target selection; output equivalence is not
assumed.

## Applicability and remaining boundaries

Axios, Joi and follow-redirects enter through Storybook's `wait-on` dependency;
form-data also serves the real jsdom XHR implementation used by Jest. Glob and
YAML packages serve test discovery, coverage/configuration and CSS tooling.
No application import of these eight packages was found. The Joi options schema
in wait-on does not call the affected email-multiple or isoDate validators.
This narrows observed exposure without treating development tools as harmless.

Browserslist is used by Babel, Autoprefixer and Webpack. A previously built
standalone artifact from the starting source contains the external Browserslist
4.28.1 package despite its `dev` lock marker. It also contains Next's separate
compiled Browserslist and Picomatch implementations. **This lock update does
not replace Next's integrated copies.** No public HTTP exploit was demonstrated,
and their presence must not be mistaken for a reachability proof either way.
The existing final-image tooling check inventories only source-map-js and
baseline-browser-mapping package copies; it does not close this separate issue.

As checked on 2026-11-07, the official npm `latest` Next release is still
16.4.5. Its [source dependency pins](https://github.com/vercel/next.js/blob/v16.4.5/packages/next/package.json)
remain Browserslist 4.28.1 and Picomatch 4.0.1. The
[upstream Picomatch vendoring PR](https://github.com/vercel/next.js/pull/96417)
is open, not a released fix. There is no newer stable Next patch to qualify in
this lot. Any separately reviewed backport would need to rebuild the two
compiled modules with Next's own ncc recipe and preserve its dynamic-require
externals, licenses and compatibility checks. No such backport is implemented
or claimed qualified here.

MapLibre 5.20.1 retains the reviewed vendored artifact and the official
[attribute-snapshot correction](https://github.com/maplibre/maplibre-gl-js/commit/1da69f3cd913a39fa948708e01478663bf48bc27).
Its version-based critical npm warning remains. This is a justification tied to
that specific advisory and patched artifact, not a blanket audit exception.

## Validation status

The final real npm audit reports **33 affected package rows**: 13 low,
19 moderate, zero high and one critical, with **15 unique advisory URLs**.
The starting report had 41 rows and 61 unique advisories. These are different
metrics. The audit exits 1 because findings remain; no clean-audit claim is made.

`npm ci --dry-run --ignore-scripts --legacy-peer-deps --no-audit --no-fund`
passes without creating `node_modules`. This validates lock/manifest acceptance,
not installed runtime behavior. No old dependency test result is transferred to
the new lock. Existing Node 22 CI gates must install this exact lock and run
the MapLibre, tooling/PostCSS/YAML, Jest, typecheck, application build and
Storybook checks before integration. Native image checks remain separate.
No production configuration, deployment or remote application operation is part
of this change.

Primary advisory references: [Axios](https://github.com/advisories/GHSA-c29m-xwm3-cm6r),
[brace expansion](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr),
[Browserslist](https://github.com/advisories/GHSA-73wf-gq98-2v4g),
[redirects](https://github.com/advisories/GHSA-mrwp-f3q8-3g9p),
[form-data](https://github.com/advisories/GHSA-hmw2-7cc7-3qxx),
[Joi](https://github.com/advisories/GHSA-4528-x5fx-h6hg),
[YAML](https://github.com/advisories/GHSA-2883-xcg3-v3hh), and
[Picomatch](https://github.com/advisories/GHSA-c2c7-rcm5-vvqj).
