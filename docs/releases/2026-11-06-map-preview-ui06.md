# UI06 — explicit action in the compact map preview

The user approved this exact direction: preserve the preview photo and name,
put “Ouvrir la fiche” under the name using the existing primary button treatment,
provide a 44 px target, close the preview then open the existing drawer for that
same object, announce the name as a title, and make closing accessible. No new
design direction, dependency, map renderer or backend flow is introduced.

The existing 260 px card, 120 px photo, status, metadata and tags are preserved. The
name is now an `h3` naming the preview article. A native primary button replaces
the old 26 px decorative CTA and whole-card button. Tags retain their filter
actions as separate native buttons. The named close action has a 44 px target.
Preview stacking keeps that target clickable above corner zoom controls at 320 px.

Pointer hover keeps the current intent/minimum-visible/grace timing and does not
move focus. Keyboard focus on a marker opens its preview and moves to the primary
action after the map adapter attaches its portal. The cancellable animation-frame
handoff accommodates StrictMode replay without focusing a detached node. Focus
inside the preview prevents timed closure. Escape or the close action returns
focus to the originating marker without reopening the preview. The open action
uses the existing `openDrawer` with the exact preview object ID.

## Validation and scope

- TypeScript app check passes.
- Four neighboring suites / 18 tests pass: map feature generation, cluster
  composition, marker configuration and Explorer view state.
- Four actual Chromium scenarios pass at 320, 390, 768 and 1180 px with one worker,
  no retries, no skips and no flaky outcome. Each uses real Explorer search,
  the map view, real MapLibre/adapter rendering and the existing object drawer.
  Tests assert the heading/photo, primary action under the name, 44 px targets,
  viewport bounds, real mouse clicks on close/open, matching drawer name,
  keyboard focus, Escape, Enter and return to the marker. The 1180 px case crosses
  the current closure deadline while the action remains focused.
- A visual pass caught the zoom control covering close at 320 px; the scoped
  stacking fix and real click assertion are included. Screenshots of all four
  widths were inspected. No global layout change was needed.

The browser proof uses the existing fictional demo object with a complete drawer
fixture, a synthetic map style and thumbnail served by the test, and blocks every
other external request. There are no page/console errors or unexpected requests.
This validates the local UI flow, not production, hosted Auth, live tile providers
or a physical screen reader. No local production build or deployment is claimed.

Initial base: PR 112 source `560591dd0418f3f93a7f46d3e3bd73817e5855d5`.
Private validation artifacts are `browser-final.json`, `typecheck.log`,
`neighbors.log` and four viewport screenshots. They contain fictional demo data
and are kept outside Git. The lot remains subject to counter-review and its
final branch CI before integration.

## Counter-review: cancelled hover and focus ownership

Review found that entering marker B replaced a mutable trigger ref immediately,
although the preview still belonged to A until the 250 ms hover-intent completed.
Leaving B before that delay could retain A's focused action but return focus to B
on Escape. The trigger now belongs to the displayed `HoverPopupState` and changes
with the object only when the delayed opening completes. A cancelled hover cannot
replace it. Focus outlines reuse `--ring`, at 2 px with a 2 px offset; the current
token aliases the existing primary color.

A fifth real Chromium regression uses the existing `pmr=true` URL filter to keep
exactly two fictional demo objects. It opens A through keyboard focus, confirms
focus on A's actual action, moves the real pointer into and out of B, requires
trusted pointer events lasting less than 250 ms, crosses that deadline, and
requires A to remain focused while B is absent. Escape must then focus A's pin.
No timer, application handler or focus outcome is mocked.

- RED: test-only commit `484fab17e04dd02e24b6c0d585972ff2c3e9f01d`, with
  `MapPanel` byte-identical to `31ace7c`. B's hover lasted 117.7 ms; A remained
  displayed and focused, but Escape returned to B. The final pin-A assertion failed.
- GREEN: composed commit `b389c4be46d342cd3936e00bfb3d214696f8c24a`, including
  master `6b1ade10c76b42a8207e528986b9720d5a46d325` without conflicts. All five
  browser cases pass with one worker, zero retries, zero skips and zero flaky
  outcomes. The cancelled hover lasted 42.7 ms and Escape returned to A.
- Both runs use `playwright.map-preview.config.ts`, which requires the exact
  committed source SHA, records its tree and component blob, rejects tracked
  changes and remote endpoints, and forces `reuseExistingServer: false`.
  Invoke from `bertel-tourism-ui` with `MAP_PREVIEW_EXPECTED_COMMIT=<HEAD>`.
- The composed TypeScript check and four neighboring suites / 18 tests pass.
  The restoration, archive and privacy tests inherited from master are unchanged.

Private evidence is `trigger-red.json`, `trigger-green.json`,
`trigger-typecheck.log` and `trigger-neighbors.log` in
`C:/Users/dphil/.codex/tmp/map-preview-ui06-20261106/`. Earlier unsuccessful test
setups are kept separately as `trigger-setup-invalid*.json`; they are not RED
proofs. They either missed the intended short-hover condition or selected a
noninteractive label. The valid RED and GREEN use the same regression test.

For historical CI scope, initial `31ace7c` passed both frontend events: PR run
42282656284 (37 browser cases, no retry) and push run 42282646325 (36 passed plus
one existing `premium-motion.spec.ts` retry). The four UI06 cases passed without
retry in both runs. That existing motion test's blob was unchanged and no motion
fix is included here. These results do not qualify the corrected head's CI.
