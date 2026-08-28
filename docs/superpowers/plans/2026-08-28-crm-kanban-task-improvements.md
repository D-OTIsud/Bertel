# CRM Kanban — implementation brief for task filtering, provenance, notifications, multi-assignment, and request linkage

**Audience:** junior developer, reviewed by a senior before database deployment  
**Scope:** CRM task/Kanban feature only  
**Important:** implement in the order below. Do not start with the visual changes because the current API cannot represent a creator or several assignees.

## 1. What the investigation found

The requested behavior is split between work that is missing and work that already exists.

| Requirement | Current state | Required action |
| --- | --- | --- |
| Sliding one-month Kanban period, default today -15 days through today +15 days | Missing. `CrmTaches` loads every visible CRM task and has no date state. | Add an inclusive due-date range filter with the stated default. |
| Show the user who created the task | Missing. `crm_task` has `owner` and `created_at`, but no creator id. | Persist `created_by`, return its profile name, and render it separately from assignees. |
| Notify users when assigned a new task | Missing. There is no notification table/inbox. `Sidebar.tsx` explicitly says the former fake bell was removed until backend support exists. | Add persistent in-app notifications, unread count, notification drawer, and a toast for notifications arriving during an open session. |
| Default task view to the current user instead of all users | Missing. The current filter initializes to `Toutes` and compares display names. | Initialize the filter with `session.userId`; filter by stable UUID, not display name. |
| Assign several people to one task | Missing. `crm_task.owner` is one UUID and both creation flows render a single `<select>`. | Introduce a task-assignee join table and migrate the API/UI to arrays. |
| Link a task to a CRM request and offer to close the request when the task completes | Already implemented for tasks created as follow-ups to CRM interactions. | Preserve and regression-test it. Do not build a second linking system. |

Existing request-link implementation:

- `crm_task.related_interaction_id` already references `crm_interaction`.
- `CrmInteractionModal` saves the interaction first, then creates a follow-up task with `relatedInteractionId`.
- `CrmTaches` shows the linked-interaction badge.
- Moving a linked task to `done` opens a confirmation and, after explicit approval, calls `saveCrmInteraction({ status: 'done' })`.
- The backend already rejects links to unknown interactions or interactions belonging to another object.

Treat “CRM request” as the existing root `crm_interaction`. Do not create a new `crm_request` table.

## 2. Product decisions to use unless the product owner overrides them

These decisions remove ambiguity from the implementation:

1. The date range is based on `crm_task.due_at`, inclusive at both ends.
2. Compute the initial range once when the Kanban mounts: local calendar date minus 15 days and plus 15 days. Do not recalculate it on every render.
3. Undated tasks remain visible by default. Add an “Inclure les tâches sans échéance” checkbox, initially checked. This prevents valid work from silently disappearing.
4. The assignee filter is single-choice: current user by default, then another user, then “Toutes les personnes”. A task matches when the chosen UUID appears in its `assignees` array.
5. Task creation requires at least one assignee. The current user is preselected when assignable; otherwise preselect the first assignable user. Never silently submit an empty array.
6. A creator is not an assignee. Store and display the two concepts separately.
7. An assignee receives a notification only when they are newly added to the task. Re-saving the same assignee set must not create duplicates.
8. Do not notify the acting user about their own assignment. This avoids a noisy notification for the default self-assignment. If the product owner explicitly wants self-notifications, change this rule and its test together.
9. Notifications are persistent in-app notifications. Email, browser push, and mobile push are out of scope.
10. Completing a linked task continues to ask before closing the CRM request. It must not auto-close without confirmation.

## 3. Delivery order

Use an expand/migrate/contract rollout:

1. Add the new database structures and backward-compatible RPC output/input.
2. Add SQL tests and verify the migration.
3. Change TypeScript contracts and parsers.
4. Change task creation and all task consumers.
5. Add the Kanban filters and creator/assignee card rendering.
6. Add the notification center.
7. Run focused tests, full typecheck, and the relevant integration tests.
8. Only in a later cleanup migration, after the deployed frontend no longer depends on it, consider removing `crm_task.owner` and its legacy JSON fields.

Do not drop or rename `crm_task.owner` in this change. It is still consumed by the personal hub and may be consumed by an older deployed frontend during rollout.

## 4. Database migration

Create a migration with the project CLI; do not invent a timestamp manually:

```powershell
cd bertel-tourism-ui
npm run supabase -- migration new crm_task_multi_assignee_notifications
```

### 4.1 Add creator provenance

Add `public.crm_task.created_by uuid null references auth.users(id) on delete set null`.

- For all new tasks, `api.save_crm_task` must set `created_by = auth.uid()` on insert.
- Never modify `created_by` during an update, even if a payload contains that key.
- Historical creator information does not exist. Backfill `created_by = owner` only as a documented best-effort approximation for existing rows. Do not label it as exact history in migration comments.
- A dedicated index on `created_by` is not required for the requested views.

### 4.2 Add normalized assignees

Create `public.crm_task_assignee` with:

| Column | Contract |
| --- | --- |
| `task_id` | UUID, not null, FK to `public.crm_task(id)` on delete cascade |
| `user_id` | UUID, not null, FK to `auth.users(id)` on delete cascade |
| `assigned_by` | UUID, nullable, FK to `auth.users(id)` on delete set null |
| `assigned_at` | timestamptz, not null, default `now()` |

Use `(task_id, user_id)` as the primary key and add an index beginning with `user_id` for “my tasks” lookups.

Backfill one join row from every non-null `crm_task.owner`. Use `assigned_by = crm_task.created_by` after the creator backfill.

Enable RLS because the table is in `public`. Follow the current CRM API-only access model:

- revoke direct table access from `PUBLIC`, `anon`, and `authenticated`;
- perform reads and writes through audited `api.*` functions;
- grant only the required RPC execution to `authenticated` and `service_role`;
- explicitly revoke function execution from `PUBLIC` and `anon`.

### 4.3 Add persistent notifications

Create a generic `public.app_notification` table so later notification types do not require another subsystem:

| Column | Contract |
| --- | --- |
| `id` | UUID primary key, default `gen_random_uuid()` |
| `recipient_id` | UUID, not null, FK to `auth.users(id)` on delete cascade |
| `kind` | text, not null; initially only `crm_task_assigned` |
| `task_id` | UUID, nullable, FK to `crm_task(id)` on delete cascade |
| `created_by` | UUID, nullable, FK to `auth.users(id)` on delete set null |
| `created_at` | timestamptz, not null, default `now()` |
| `read_at` | timestamptz, nullable |
| `payload` | jsonb, not null, default `{}`; supplementary display data only |

Add indexes for `(recipient_id, read_at, created_at desc)` and `task_id`.

Do not put authorization decisions in `payload`. The recipient column is the security boundary.

Enable RLS and revoke direct access as for the CRM tables. The first version should use RPC polling, not direct table subscriptions. This keeps the existing “no direct `crm_*`/private-data table access from the browser” model intact and avoids exposing all notifications to Realtime accidentally.

### 4.4 Update `api.save_crm_task`

Add an `assignee_ids` JSON-array contract while retaining the old `owner` contract temporarily.

Required semantics:

- INSERT with `assignee_ids`: validate it is an array of UUID strings, remove duplicates, require at least one id, and validate every id with `api.user_can_assign_crm`.
- INSERT without `assignee_ids` but with legacy `owner`: use `[owner]`.
- INSERT without either key: use `[auth.uid()]`.
- UPDATE with no `assignee_ids` and no `owner`: leave assignments unchanged.
- UPDATE with `assignee_ids`: atomically reconcile the join table to exactly that set.
- UPDATE with only legacy `owner`: reconcile to one assignee for backward compatibility.
- Reject an explicit empty assignee set with SQLSTATE `22023`.
- Lock or otherwise serialize assignment reconciliation for a task so two concurrent edits cannot lose or duplicate assignments.
- Keep `crm_task.owner` synchronized to a deterministic compatibility value (the first UUID after sorting) until the later contract migration. Document that it is legacy and not the source of truth.
- Create `app_notification` rows only for `new_assignees = requested_assignees - existing_assignees`, excluding `auth.uid()` under the product rule above.
- Notification insertion and assignment reconciliation must be in the same transaction as the task save.
- Do not create assignment notifications for status-only updates such as Kanban drag-and-drop.

The RPC is `SECURITY DEFINER`. Keep the explicit `auth.uid()` and CRM authorization checks. For any new definer function, pin `search_path` and schema-qualify referenced objects. Never use definer rights as a substitute for authorization.

### 4.5 Update task-reading RPCs

Update every RPC branch that serializes a task, not only the global Kanban RPC:

- `api.list_crm_tasks()`
- the `tasks` branch of `api.list_object_crm(p_object_id)`
- any task serializer found by searching for `FROM crm_task`, `ct.owner`, `owner_id`, or `owner_name`

Add this stable JSON shape:

```json
{
  "assignees": [
    { "user_id": "uuid", "display_name": "Name" }
  ],
  "created_by_id": "uuid-or-null",
  "created_by_name": "Name-or-null"
}
```

Order `assignees` deterministically by case-insensitive display name and then UUID. Return `[]`, never `null`.

Keep `owner_id` and `owner_name` in `api.list_crm_tasks()` for backward compatibility in this release. The new frontend must stop using them.

### 4.6 Add notification RPCs

Add:

- `api.list_my_notifications(p_limit integer default 50)` — authenticated caller only; return only `recipient_id = auth.uid()`, newest first, with task title/object name and creator display name joined server-side.
- `api.mark_notification_read(p_id uuid)` — update only a notification owned by `auth.uid()`; unknown or foreign ids must not disclose another user's data.
- `api.mark_all_notifications_read()` — update only the caller's unread rows.

Return an unread count in the list response or add a small `api.count_my_unread_notifications()` RPC. Do not fetch another user's count.

## 5. SQL verification

Extend `Base de donnée DLL et API/tests/test_crm_module.sql` with at least these cases:

1. Existing single-owner task is backfilled into `crm_task_assignee`.
2. New task without assignment input assigns the caller and stores the caller in `created_by`.
3. New task with two valid assignees returns both in deterministic order.
4. Duplicate UUIDs in input result in one join row.
5. A user outside the caller's organization is rejected.
6. Explicit empty assignment input is rejected.
7. Status-only update leaves assignments unchanged and creates no notification.
8. Re-saving the same assignment set creates no notification.
9. Adding one user creates one notification for that user.
10. Removing then re-adding a user creates a new notification on the re-add.
11. Notification list/count/read RPCs expose only the authenticated user's rows.
12. Creator cannot be changed by an update payload.
13. Existing related-interaction validation and cross-object rejection still pass.
14. Completing a task does not close an interaction in SQL; closure remains an explicit UI action.

Run database advisors after applying the migration in a safe environment. Review both security and performance findings before continuing.

## 6. TypeScript service contracts

### 6.1 Domain types and parsing

In `bertel-tourism-ui/src/types/domain.ts`, add:

```ts
export interface CrmTaskAssignee {
  userId: string;
  displayName: string;
}
```

Change `CrmTask` to include:

- `assignees: CrmTaskAssignee[]`
- `createdById: string | null`
- `createdByName: string | null`

Keep legacy `ownerId`/`ownerName` only during the compatibility release, mark them deprecated, and do not use them in new UI logic.

In `bertel-tourism-ui/src/services/crm.ts`:

- parse malformed or missing `assignees` as `[]`;
- ignore malformed entries rather than throwing the whole task list away;
- map creator fields;
- replace `SaveCrmTaskInput.owner?: string` in new call sites with `assigneeIds?: string[]`;
- serialize it as `assignee_ids`;
- retain `owner` serialization only for compatibility tests and older callers until all in-repo callers are migrated.

Update `ObjectCrmTaskItem` only if the object CRM screen will display assignees/creator. The backend serializer must still be updated now so it has one coherent task contract.

### 6.2 Notification service

Create `bertel-tourism-ui/src/services/notifications.ts` with typed parsers and functions for list, unread count, mark one read, and mark all read. Match the defensive parsing style already used in `services/crm.ts`.

Use query keys beginning with `['notifications', userId]`. Never persist notification query data across users.

## 7. Multi-assignee task creation

Update both creation paths:

- `bertel-tourism-ui/src/features/crm/CrmTaskModal.tsx`
- the follow-up-task phase in `bertel-tourism-ui/src/features/crm/CrmInteractionModal.tsx`

Create or extract a shared accessible multi-user picker under `components/ui/pickers`. Do not import `object-editor/primitives/ChipMultiSelect` into CRM: it is coupled to editor styles and opens an editor modal, which would create a modal inside a CRM modal.

Picker behavior:

- searchable by display name;
- selected people shown as removable chips;
- current user selected initially;
- at least one selection required;
- keyboard-accessible checkboxes/list options;
- loading, empty, and query-error states are visible;
- no selection is lost when assignee data finishes loading after the modal opens.

Both save calls must send `assigneeIds`, including the request-follow-up flow that also sends `relatedInteractionId`.

## 8. Kanban filters and cards

Update `bertel-tourism-ui/src/features/crm/CrmTaches.tsx`.

### 8.1 Date-range state

Extract small pure helpers into `crm-task-filters.ts` so they can be unit-tested:

- `defaultTaskDateRange(now)` returns date-only strings for -15/+15 calendar days;
- `isTaskInDateRange(task, range, includeUndated)` implements inclusive bounds;
- invalid dates return false rather than crashing;
- compare calendar dates, not elapsed 24-hour durations, so DST/time-zone changes cannot move boundaries.

Render “Du” and “Au” date inputs, an “Inclure sans échéance” checkbox, and a “Réinitialiser” action. Show a validation message and do not apply an inverted range when `from > to`.

The date and person predicates must compose with the existing status predicate.

### 8.2 Default current-user filter

Read `userId` and `userName` from `useSessionStore`.

- Initial selected value: current UUID when available, otherwise `ALL_ASSIGNEES`.
- Build options from `listCrmAssignees`, keyed by UUID.
- Do not derive the filter from `ownerName`; names are not unique and can change.
- “Toutes les personnes” remains an explicit option.
- A task matches when `task.assignees.some(a => a.userId === selectedUserId)`.
- Do not switch back to all merely because the current default produces zero cards; an intentional empty “my tasks” view is valid.

### 8.3 Card content

Replace the one-owner avatar with the assignee list:

- show up to three avatars/initials;
- for more than three, render a `+N` indicator;
- accessible label/title contains every assignee's full display name;
- render a separate muted line: `Créée par {createdByName}`;
- historical null creator displays `Créateur inconnu`, not an assignee's name guessed by the client.

Keep object, actor, due badge, linked-request badge, drag-and-drop, keyboard action buttons, and read-only gating unchanged.

## 9. Personal hub compatibility

Update `selectMyOpenTasks` in `bertel-tourism-ui/src/components/layout/ProfileDrawer.tsx`:

```ts
task.assignees.some((assignee) => assignee.userId === userId)
```

Keep the existing open-status filter, due-date ordering, and four-item limit. Add a test proving a jointly assigned task appears for either assignee.

## 10. Notification UI

### 10.1 Shell ownership

Manage notification-drawer open state in `bertel-tourism-ui/src/components/layout/AppShell.tsx`, alongside `profileOpen`.

Add to `Sidebar`:

- a real bell button;
- unread badge using the existing `.app-sidebar__badge` visual pattern;
- accessible label such as `Notifications, 3 non lues`;
- callback prop that opens the notification drawer.

Add a `NotificationDrawer` near `ProfileDrawer` in the shell. Each assignment notification shows task title, object name, assigner/creator, relative or formatted date, and read/unread state. Clicking it must:

1. mark it read;
2. close the drawer;
3. navigate to `/crm?tab=taches`;
4. invalidate/refetch `['crm-tasks']` if needed.

Provide “Tout marquer comme lu”. Show loading, empty, and retry/error states.

### 10.2 Refresh and toast behavior

For the first delivery, poll while an authenticated session is ready:

- unread count: every 30 seconds and on window focus;
- full notification list: only while the drawer is open;
- after a successful task assignment mutation, invalidate the assignee/task queries where appropriate.

Use the existing `useToast` abstraction. Show a toast only for notification ids first observed after the initial successful fetch in the current browser session. Do not replay every unread notification on page load.

Do not add Realtime in the same junior ticket. If instant delivery is later required, use the existing resilient-channel helper and a carefully authorized private channel. Supabase Postgres Changes requires grants, RLS, and publication configuration; it should not be bolted onto this API-only table casually.

## 11. Preserve the existing CRM-request flow

Do not rewrite this feature. Add/keep regression coverage for:

- interaction is saved before its follow-up task;
- follow-up includes `relatedInteractionId` and all selected `assigneeIds`;
- retrying a failed task creation does not create the interaction twice;
- linked badge opens the related actor/object context;
- moving an open linked task to `done` prompts once;
- “Non” leaves the request open;
- “Oui, clôturer” sets the interaction status to `done` and invalidates task, actor, object, and timeline queries;
- already-closed and unlinked requests do not prompt;
- closing failure is visible and does not roll the completed task back silently.

If the product owner later asks for manually linking an arbitrary existing task to a request, treat that as a separate edit-task feature. The present requirement “if a task is created for a request” is already satisfied by the follow-up creation path.

## 12. Frontend tests

Update fixtures and tests in at least:

- `src/services/crm.test.ts`
- `src/features/crm/CrmTaches.test.tsx`
- `src/features/crm/CrmInteractionModal.test.tsx`
- `src/features/crm/CrmActorFiche.test.tsx`
- `src/components/layout/ProfileDrawer.test.tsx`
- `src/components/layout/Sidebar.test.tsx`
- new notification service/drawer tests
- new `crm-task-filters.test.ts`

Required UI cases:

1. Default date inputs equal -15/+15 calendar days using fake timers.
2. Both boundary dates are included; dates just outside are excluded.
3. Undated tasks are included by default and can be hidden.
4. Inverted range shows a validation message.
5. Default assignee filter is current UUID, even when two users have the same display name.
6. “Toutes les personnes” shows all matching tasks.
7. A joint task appears for either assignee filter.
8. Card shows all assignees accessibly and the creator separately.
9. Both creation paths submit several assignee ids.
10. Empty assignee selection cannot submit.
11. Notification badge, drawer, mark-one, and mark-all behavior.
12. Initial unread load does not toast; a newly observed id does.
13. Existing drag/drop, read-only, error, and linked-request tests continue to pass.

Use fake system time for date tests and restore it after each test. Do not create fixtures with `Date.now()` at module import time unless the fake time is installed before import.

## 13. Commands and final verification

From `bertel-tourism-ui`:

```powershell
npm run test:run -- src/services/crm.test.ts src/features/crm/CrmTaches.test.tsx src/features/crm/CrmInteractionModal.test.tsx src/components/layout/ProfileDrawer.test.tsx src/components/layout/Sidebar.test.tsx
npm run typecheck
npm run build
```

Also run the new notification and filter tests, plus the SQL CRM test suite in the project's normal database-test environment.

Before handoff:

- inspect the migration diff;
- confirm no direct browser query targets `crm_task_assignee` or `app_notification`;
- confirm anon cannot execute the new RPCs;
- confirm one user cannot list or mark another user's notifications;
- confirm duplicate display names do not affect filtering or assignment;
- confirm the old deployed frontend can still read `owner_id`/`owner_name` and save a single `owner` during rollout;
- regenerate `dbdoc/` and `db-graph-out/` using `tools/db-graph/README.md` after the live schema changes;
- run `graphify update .` after code changes;
- leave generated graph files changed if regeneration legitimately updates them.

## 14. Definition of done

The ticket is complete only when all of the following are demonstrable:

- Opening the Kanban defaults to the signed-in user's tasks due from 15 days before through 15 days after today, with undated tasks included.
- The user can change/reset the date range and explicitly choose all or another assignee.
- A task can have two or more assignees end-to-end: database, RPC, parser, form, card, filter, and personal hub.
- Every new task has immutable creator provenance and cards show the creator distinctly.
- Newly added assignees receive exactly one persistent notification; unchanged assignees receive none.
- The notification badge/inbox is private to the signed-in user and read state persists.
- The existing interaction-to-follow-up link and explicit completion/closure confirmation still work.
- Focused tests, SQL tests, typecheck, and production build pass.

## 15. Review checkpoints for the senior developer

Request senior review before proceeding past each checkpoint:

1. **Migration review:** join-table design, backfill, definer security, grants, and compatibility fields.
2. **RPC review:** exact set reconciliation, authorization, transactionality, and notification deduplication.
3. **UI contract review:** UUID-based filtering, date semantics, multi-picker accessibility, and no nested modal.
4. **Release review:** database-first deploy, frontend deploy, rollback behavior, and deferred legacy-owner cleanup.

Relevant Supabase guidance:

- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Securing the Data API](https://supabase.com/docs/guides/api/securing-your-api)
- [Database functions and definer security](https://supabase.com/docs/guides/database/functions)
- [Postgres Changes requirements](https://supabase.com/docs/guides/realtime/postgres-changes)
