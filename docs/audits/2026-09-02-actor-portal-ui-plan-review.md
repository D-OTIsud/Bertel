# Review — actor portal UI plan

Date: 2026-09-02  
Branch: `claude/actor-sheet-interface-spec-26b57f`  
Commits reviewed: `80c7b5b`, `67db609`  
Reference mockup: <https://claude.ai/code/artifact/c0475d08-c84f-4578-9513-a0de6c8d8234>

## Scope and conclusion

The reviewed commits are documentation-only. This review therefore covers the internal consistency of the rewritten specification and implementation plan, its feasibility against the existing frontend primitives, and its fidelity to the mockup. No runtime test suite was applicable.

The lean, single-column task-list direction is coherent with the mockup and substantially better suited to the intended mobile audience. Before implementation, however, the plan should address the seven findings below. The first three can lose or misrepresent an actor's work.

## Findings

### P1 — Scope the submissions query to the current fiche

Location: `docs/superpowers/plans/2026-09-01-portail-acteur.md`, line 3241.

The proposed query uses:

```ts
useQuery(['portal-submissions'], () => listMySubmissions(20))
```

This contradicts the invariant established in Tasks 6 and 11: the fiche page must always pass its object id. With a multi-fiche actor, the unfiltered 20-row result can omit the current fiche. The shared React Query key can also reuse one fiche's submissions while another fiche is open.

Recommended correction:

```ts
useQuery({
  queryKey: ['portal-submissions', objectId],
  queryFn: () => listMySubmissions(20, objectId),
})
```

Keep broad invalidation with the `['portal-submissions']` prefix if all cached fiche histories must refresh.

### P1 — Do not erase drafts before sign-out succeeds

Location: `docs/superpowers/plans/2026-09-01-portail-acteur.md`, line 3228.

The plan tells `PortalShell.handleSignOut` to call `clearAllPortalDrafts(userId)` before `signOut()`. A network or authentication failure would then destroy all unsent work while leaving the actor logged in.

Recommended correction: capture the user id, await successful sign-out, and only then purge that account's drafts and sent snapshots. An equally safe option is to purge in the confirmed `SIGNED_OUT` transition.

### P1 — Persist the error report with the local draft

Locations: `docs/superpowers/plans/2026-09-01-portail-acteur.md`, lines 3184 and 3193–3227.

The hub promises that a text entered under “Signaler une erreur” is retained locally when there is no modified rubric. This is essential because `submit_actor_fiche` rejects a message-only submission. However, the proposed draft functions receive only `baseline` and `draft`, and the storage design explicitly retains only dirty module slices. It has no input or schema field for the office message or error report.

Consequently, a refresh or navigation can discard the actor's only copy of the report.

Recommended correction: add the office message/error report to the persisted draft schema and to the read, write, fingerprint-mismatch, purge, and restoration tests. Its lifecycle should be explicit: preserve it until a successful send or an explicit discard.

### P2 — A new pending correction must outrank an older rejection

Locations: `docs/superpowers/plans/2026-09-01-portail-acteur.md`, lines 3036–3038 and 3243.

The planned state priority is:

```text
rejected > pending > dirty > filled/todo
```

After an actor corrects and resubmits a rejected rubric, that module belongs to both sets:

- `rejectedModules`, derived from the latest resolved submission;
- `pendingModules`, derived from the new open submission.

The rubric would therefore continue to display “À reprendre” instead of “Envoyé — en vérification,” contradicting the after-send flow and encouraging an action that the open-submission lock cannot accept.

Recommended correction: make `pending` outrank `rejected`, or remove modules present in the open submission from `rejectedModules`. Add a test for the transition `rejected → corrected → pending`.

### P2 — Portal-scoped CSS cannot reach the portalled send modal

Locations: `docs/superpowers/plans/2026-09-01-portail-acteur.md`, lines 2532–2540 and 3187.

The portal raises buttons and controls to the mobile sizing contract through selectors rooted at `.portal-shell`. The existing house `Modal`, however, uses `createPortal(..., document.body)`. `PortalSendModal` is therefore no longer a descendant of `.portal-shell`, so rules such as these do not apply:

```css
.portal-shell .primary-button,
.portal-shell .ghost-button { min-height: 48px; }

.portal-shell input,
.portal-shell textarea { font-size: 1.05rem; }
```

The send dialog would retain the smaller back-office dimensions and violate the plan's touch-target and typography requirements.

Recommended correction: give the modal a dedicated context class, such as `portal-modal`, and define its scoped control rules independently of DOM ancestry. Alternatively, extend `Modal` to accept a portal container within `.portal-shell`.

### P2 — `officePhone` has no implementation path

Location: `docs/superpowers/plans/2026-09-01-portail-acteur.md`, line 3184.

The error-report fallback requires both the public email and telephone of the publisher office. The plan mentions an `officePhone` to be emitted “de la même façon,” but:

- Task 6 only adds `office_email` to `list_my_portal_fiches`;
- Task 11 only adds `officeEmail` to `PortalFiche` and its parser;
- the service fixture and parser tests contain no telephone field.

Recommended correction: add `office_phone` to the SQL output, `PortalFiche`, the defensive parser, fixtures, and tests. Specify primary/public ordering consistently with `office_email`.

### P2 — The Task 10 commit omits the Step 2 bis files

Location: `docs/superpowers/plans/2026-09-01-portail-acteur.md`, line 2222.

Step 2 bis modifies the login and password screens, their route wrappers, and their tests. The Task 10 commit command stages none of those files. Following the plan literally leaves the first-contact experience uncommitted and risks mixing it into a later unrelated commit.

Recommended correction: list the affected login/set-password views, wrappers, and tests under Task 10 “Files,” and add every modified path to its commit command.

## Additional alignment notes

These are not blockers, but should be resolved while applying the corrections:

- The `WeekHours` type shown in Task 13 lacks the `fixedHours` field later required to represent “ouvert sans horaires fixes.” Either add the field to the type or state that this state is inferred exclusively from the empty-slot sentinel.
- The hub description uses a bare `<a href="?rubrique=…">` even though the preceding routing contract explicitly forbids bare anchors. Replace that example with `Link` so the plan does not encode contradictory guidance.
- The proposed `PortalShell` markup lays the logo, brand name, and eyebrow in one flex row, whereas the mockup stacks the brand name and “Espace prestataire.” The CSS should specify that two-line brand block and a narrow-screen overflow strategy.

## Recommended disposition

Revise the plan before starting Tasks 10–14. The findings do not undermine the simplified portal concept; they close lifecycle, cache-scoping, accessibility, and implementation-completeness gaps that would otherwise surface late in mobile acceptance testing.
