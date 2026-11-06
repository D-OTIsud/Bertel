# Storybook dev-server security

Starting point: master `7f02282e6131113570eeda86398c4b6820b632fd`.
The three direct Storybook development dependencies (`storybook`,
`@storybook/nextjs`, `@storybook/addon-a11y`) are pinned together to `10.6.2`.
No application source, CSS, story, Storybook configuration, MapLibre artifact,
Zod version or Radix version changes in this lot.
Two npm test commands and a dedicated security CI workflow are added.

## Vendor fixes and compatibility

The vendor identifies `10.6.2` as the first fixed release for:

- [GHSA-f2ph-cmg5-wxc8](https://github.com/storybookjs/storybook/security/advisories/GHSA-f2ph-cmg5-wxc8): foreign `postMessage` senders could enter development manager/preview channels.
- [GHSA-px85-f4q5-jh77](https://github.com/storybookjs/storybook/security/advisories/GHSA-px85-f4q5-jh77): exposed development servers could be used for code injection.

The patched development server defaults to `127.0.0.1`, restricts embedding to
its own origin and explicitly allowed localhost origins, filters preview message
origins, and pins registered manager frames to their configured origins. These
are intentional vendor security changes. This lot does not opt back into LAN
exposure, arbitrary cross-host embedding or insecure origin allowances.
The existing stories and styles are preserved. Configured remote Storybook refs
remain accepted by the manager transport; static-preview message compatibility
also remains covered.

npm resolves the aligned Storybook family and its compatible dependencies:
79 package entries plus the root lock entry change, including optional OXC
platform packages, Webpack and loaders. This is a bounded Storybook cohort
update, not a claim that only three lock entries changed. `image-size` leaves
this dependency graph, and the resolved `fast-uri` becomes `3.1.9`.
The MapLibre backport, Zod, Radix, source-map-js and baseline-browser-mapping
lock descriptors remain byte-identical to the starting point.

## Evidence

Six Node tests import the real installed `PostMessageTransport` export and use
DOM `MessageEvent` fixtures. They cover aligned installed versions, rejection of
foreign/opaque preview senders, manager origin pinning, a configured remote ref,
a frame losing registration, and static-preview compatibility. Three of the
same origin-filter witnesses (preview dev, manager origin pinning and configured
remote-ref pinning) fail against the unchanged `10.4.0` transport in a private
read-only probe; they pass with `10.6.2`. The frame-registration case is separate
compatibility coverage, not an additional old-vs-new rejection claim.
Each transport probe ends with a legitimate event as a processing barrier.
The vulnerable dev server is
never started. These transport probes are not an end-to-end code-execution
exploit demonstration.

Four Chromium tests run the actual patched development server with no `--host`
override, one worker and zero retries:

1. `127.0.0.1` responds while a direct connection to `127.0.0.2` is refused;
   manager/preview responses carry the expected `frame-ancestors` policy.
2. The real manager renders the existing application invitation story, which
   can be closed and reopened without JavaScript errors.
3. Chromium reports the actual `frame-ancestors` violation for a foreign
   embedding origin. A permission grant confined to this test's routed fixture
   lets the request reach CSP rather than stop at Chromium's separate local
   network permission gate. No application permission or policy is changed.
4. A real foreign window sends a benign probe to an actual preview popup. Its
   DOM listener observes the browser-supplied foreign origin, while the real
   Storybook channel receives only legitimate same-origin probes before and
   after it. The later probe supplies a processing barrier.

The complete existing static Storybook builds successfully. CI repeats the
transport tests, complete static build and actual dev-server Chromium tests on
Node 22. Existing application build, tests, image and runtime gates remain
enabled. The browser proof samples one existing story; it does not certify
every story interaction or a production deployment.

```sh
cd bertel-tourism-ui
npm ci --legacy-peer-deps
npm run test:storybook-security
npm run build-storybook -- --disable-telemetry
node scripts/run-playwright.mjs install --with-deps chromium
npm run test:storybook-runtime
```

## Remaining audit scope

The lock-only npm report changes from 47 to 44 affected package rows:
`storybook`, `fast-uri` and `image-size` disappear, with no newly affected row.
Unique advisory identifiers change from 82 to 67, with no added identifier in
the compared snapshots. These are separate metrics. Raw reports remain private.

The remaining report still includes the MapLibre version flag, whose closure
depends on the separately attested exact backport artifact and installed bytes.
It also includes `webpack-dev-middleware 6.1.3`: Storybook `10.6.2` still requests
the `^6.1.2` major. The [middleware vendor](https://github.com/webpack/webpack-dev-middleware/security/advisories/GHSA-g84c-rxfj-3j2c)
requires `7.4.6`; that major is not forced here without its own compatibility
proof. Development tools are not treated as risk-free because of their npm
`dev` label. This lot makes no clean-audit claim and includes no deployment or
production configuration change.
