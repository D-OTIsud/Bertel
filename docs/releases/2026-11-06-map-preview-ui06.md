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
