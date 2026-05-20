# Relations Write Contract

## Scope

The relationships module covers object relations, organization links, actor links, contact visibility, and consent-linked rattachements. It is currently read-only and should be unlocked in phases.

## 2026-05-20 RPC Status

`api.save_object_relations(p_object_id text, p_payload jsonb)` is defined in `Base de donnée DLL et API/object_workspace_safe_write_rpcs.sql`.

The RPC covers outgoing `object_relation` rows and `object_org_link` rows. Incoming relations are returned as skipped because their source object owns the write. Actor/contact consent is returned as skipped until an audit trail and consent rule contract exists.

## Editable Fields

Phase 1:
- object relation target.
- relation type.
- direction.
- note.
- distance.
- position when available.

Phase 2:
- organization link target.
- organization role.
- note.
- primary/secondary state when available.

Later:
- actor link role.
- actor primary flag.
- contact visibility and consent state.

## Blocked Fields

- actor/contact consent until audit trail and legal rules are documented.
- generated/import source links.
- historical relation records unless a validity-period model is contracted.

## Tables

- object relation tables used by outgoing/incoming/parent relation payloads.
- organization link tables.
- actor link tables.
- contact and consent/audit tables.
- relation and role reference tables.

## RLS / Permission Requirements

- editor must be allowed to select both source and target objects.
- editor must be allowed to mutate only relations owned by the source object or explicit organization scope.
- duplicate source-target-type-direction combinations must be rejected.
- update policies must have matching select policies.

## Save Strategy

Use one phased RPC:
- `api.save_object_relations` for object-to-object relations and organization rattachements.
- actor/contact consent RPC only after audit trail rules exist.

Direct table writes should not be used for consent-aware changes.

## Delete Behavior

Delete omitted rows only inside the relation family being saved. Consent-linked actor/contact records are never deleted by the object relation RPC.

## Ordering Behavior

Normalize position values per relation family. Reject relation direction changes that would invert ownership without an explicit delete/create.

## Frontend Dirty / Save Behavior

Keep relationships disabled until Phase 1 RPC tests pass. Object relation controls can be unlocked before org links and actor consent; blocked sub-surfaces should show tooltip reasons.

## Tests

- parser coverage for org links, actors, parent objects, outgoing, and incoming relations.
- duplicate prevention.
- relation-direction validation.
- object relation create/update/delete.
- org link save after Phase 2.
- actor/contact consent remains read-only.
