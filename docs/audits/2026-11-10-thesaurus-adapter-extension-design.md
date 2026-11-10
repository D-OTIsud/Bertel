# Native thesaurus adapters — implementation design

10 November 2026. Architecture only; no production schema/content/publication
change is authorized by this file itself. The root task owns deployment and the
normal authenticated publication. Source evidence comes from the catalog audit
worker's read-only live catalog/count queries, the schema sources, and the current
thesaurus publication/preparation migrations. No source values were fetched for
this architecture review.

## Root scope supplement: three private business dictionaries

The exhaustive 104-catalog audit additionally proves that `ref_actor_role` (5
rows, actor/object and default actor relationships), `ref_contact_role` (6 rows,
contact/actor channel relationships), and `ref_org_role` (3 rows, object-to-ORG
relationships) describe business relationships. They are distinct from the actual
authorization namespaces `ref_org_admin_role`, `ref_org_business_role`, and
`ref_permission`. The root therefore extends this design to **nine** new adapters,
148 source identities: the six public dictionaries below (134) plus these three
**private** dictionaries (14). Earlier references to six apply to that public
subset; source-link, gate, writer and integrity coverage must include all nine.

Register source kinds/domains `actor_role`, `contact_role`, `org_role` with
`is_public=false`, `is_governed=false`, `legacy_public=false`. Use their UUID PK,
empty context and no parent. Provide reviewed domain names and four-language
editorial content through the same private revision workflow. Installation does
not govern or publish them. Existing private identities can be edited/validated
through the existing admin circuit; private publication must never place them in
public manifests, concept readers, exports, history payloads or JSON-LD.

Only descriptive native name/description and existing position may be changed.
Preserve code/identity and every operational field; do not grant application roles
new permissions or modify the authorization tables. Add typed source-link FKs and
indexes, literal source adapter/writer mappings, guarded source authority and
private publisher-specific source privileges as for the six below. Extend
assignment/history/usage coverage for `actor_object_role`, `actor`,
`contact_channel`, `actor_channel`, and `object_org_link`, preserving the existing
actor/object ownership recursion and RLS. Test their private revision/publication
path independently of public bootstrap. The resulting adapter set is seventeen
source kinds across 87 vocabulary domains; the previous 78 policies and legacy
public catalog allowlist remain unchanged.

`ref_tag` remains a free-tag entity collection with native slug identity and
writers; its rows and tag-link integrity must be accounted for explicitly. It is
not assumed to be a curated controlled vocabulary. Security namespaces, deposited
documents, provenance entities, applicability/equivalence edges, closures,
crosswalks and registries retain their deliberate non-concept treatment and exact
identity/relationship audits. No omitted business vocabulary may be hidden behind
a generic “role” or “private” classification.

## Scope and publication decision

Add these six explicitly selected controlled dictionaries, totaling 134 currently
observed native rows. All six have UUID `id` primary keys and SELECT USING true
policies with RLS enabled. This supports a scoped public dictionary decision; it
does not make their business records, assignments or documents public.

| Domain / source kind | Native table | Rows | Incoming references | Native localization |
| --- | --- | ---: | --- | --- |
| `iti_assoc_role` | `ref_iti_assoc_role` | 8 | `object_iti_associated_object.role_id` | No maps |
| `object_relation_type` | `ref_object_relation_type` | 10 | `object_relation.relation_type_id` | No maps |
| `capacity_metric` | `ref_capacity_metric` | 12 | `object_capacity.metric_id`, `ref_capacity_applicability.metric_id` | No maps |
| `legal_type` | `ref_legal_type` | 21 | `object_legal.type_id` | No maps |
| `review_source` | `ref_review_source` | 7 | `object_review.source_id` | No maps; no native description |
| `sustainability_group` | `ref_sustainability_action_group` | 76 | `ref_sustainability_action.group_id`, `ref_classification_equivalent_group.group_id` | Name/description maps |

Register only these new vocabulary rows with explicit four-language domain names,
`required_languages=ARRAY['fr','en','es','de']`, `require_definition=true`,
`is_public=true`, `is_governed=false`, `legacy_public=false`. Preserve every field
on the existing 78 vocabulary rows. The new domain policy is a deliberate scoped
decision based on public dictionary policies and the root's selected six domains;
it is not inferred for all reference tables. `review_source` represents the
controlled review-provider/source dictionary, never review text or object IDs.

An alternative private staging registration is possible but adds a later exposure
migration and makes creation of new concepts fail the existing private-ungoverned
creation guard. Public-but-ungoverned registration keeps the current workflow:
source rows can be synchronized for private editorial work, and **no** new concept
or domain enters a public release until ordinary bootstrap/publication succeeds.
Do not bootstrap, set governance true, insert revisions, or rewrite live native
content in the adapter-install migration. Install triggers with governance false;
once ordinary bootstrap activates governance, canonical writes use the existing
protected publisher circuit.

`ref_legal_type.is_public` governs visibility of documents of that legal type
(`schema_unified.sql` documents this), not visibility of the dictionary name.
Preserve it and all other existing product/security flags. Do not alter the legacy
`api.public_catalog_domains()` allowlist or application-role ACLs. Source table
policies are not authority to edit thesaurus content: the existing platform
superuser check and current-authority recheck remain the authority.

## Identity and native source contracts

Use `(source_kind, source_id=id::text, domain)` as the persistent unique source
identity. Allocate each canonical concept ID once using the existing source-key
conflict path, then preserve it on every subsequent sync. Never join by code,
recreate concepts after a rename, or use the same raw UUID as canonical identity
across unrelated tables. The latter can collide across independently keyed native
tables. Repeated sync must return the same canonical UUID for each native tuple.

`source_rows` retains its exact existing columns and eight UNION arms, appending
six arms. Five flat adapters have empty `context_key` and null parent tuple. Group
rows have `context_key=category_id::text` and the native category tuple as parent.
Every arm carries the complete native row as payload and `{'id': id}` source key.
Do not project business assignment rows. Group code is globally UNIQUE in
`migration_sustainability_v5.sql`; do not weaken that native constraint merely
because the canonical table also supports contextual codes.

Extend `source_link` with six nullable UUID FK columns, each referencing only its
native table with ON DELETE RESTRICT, plus one partial UNIQUE index each. Replace
only the existing `num_nonnulls(...)=1` CHECK with the fourteen-adapter version;
retain the composite ref-code/null-pair check and every existing FK/index. Snapshot
and assert the old constraints before replacement. Existing rows remain unchanged.
Extend `sync_sources`' link INSERT columns and CASE arms. A sync populates source
identities/links only; it does not set governance or alter source values.

## Native group membership preserves both category contexts

The live catalog reports 239 actions with a non-null group FK: 237 share the
group's category and two cross categories. No native constraint forbids the latter.
Both are supported native memberships and must be preserved without correction.

- Keep every existing action's `context_key` and `broader` category unchanged.
- Give each group its own native category as `broader`.
- Add optional `member_of: [groupConceptId]` to a grouped action and
  `members: [actionConceptId, ...]` to a group, sorted and deduplicated by UUID.
- Use explicit `bertel:memberOf` / `bertel:member` JSON-LD predicates. Keep group
  nodes as the existing concept representation; do not assume SKOS Collection,
  substitute `related`, or reinterpret membership as `broader`.
- Add no implicit scheme-equivalence edge from
  `ref_classification_equivalent_group`. That table represents a separate contract.

Implement one private STABLE SECURITY INVOKER helper, for example
`thesaurus.native_membership_edges()`, deriving typed canonical endpoints from
native `action.group_id` and persistent source identities. Revoke PUBLIC/API-role
EXECUTE and grant only the existing trusted callers that require it. Public
renderers include only governed public endpoint domains. Do not emit membership
fields for unrelated concepts, or for old action snapshots before groups enter
scope. Extend **both** `concept_document(uuid,boolean)` and the set-based
`publication_documents(uuid[])` from this same semantic contract; preserve the
independent rendering-equivalence regression. Editorial reads may show the source
FK in private `source_fields`; public membership fields come from the frozen
release document, never a current-source lookup during HTTP reads.

For this bounded delivery, membership and context are read-only native structure:
reject attempts to change an existing action's `source_fields.group_id` or a
group's `category_id`; omit/preserve means preserve, and explicit null/changed
values must not be silently ignored. The existing action writer already omits
`group_id`; add an explicit validator/writer rejection so the contract is honest.
Allow creation of a new group with a required existing native category, then freeze
its context. Fully editing group membership or creating an action and its brand
new group in one release would require dependency-ordered native INSERTs; the
current parent-only dependency preparation does not establish that order. Do not
add that larger writer feature implicitly to an editorial adapter extension.

## Writer, validation and data preservation

Extend the existing private `apply_source` table mapping and literal allowlists.
Never accept a caller-selected table/PK/column. All six use `id` as native PK.
Preserve the prepared writer's typed changed-column comparison and legacy-search
roundtrip patch; do not restore an older whole function body.

Initial descriptive write allowlists:

| Source kind | Existing native fields allowed by this delivery |
| --- | --- |
| `iti_assoc_role`, `object_relation_type` | `name`, `description`, `position` |
| `capacity_metric` | `name`, `description`, `position`, `icon_url` |
| `legal_type` | `name`, `description` |
| `review_source` | `name`, `icon_url` |
| `sustainability_group` | `name`, `description`, `name_i18n`, `description_i18n`, `position`, `icon_url`, `category_id` only from immutable/new group context |

All fields outside these lists are preserved on existing rows, including capacity
`unit`, legal `category/is_required/is_public/review_interval_days`, provider
`base_url`, group `extra`, and action `group_id`. Validate attempted changes to
protected operational fields explicitly rather than reporting a successful edit
that the writer ignores. Capacity unit is especially important: its native AFTER
UPDATE trigger propagates to `object_capacity`, which conflicts with the prepared
publisher's prohibition on early owned-row writes. Do not bypass that fence or add
a publisher exception. New row creation uses native defaults for optional preserved
fields; IDs/codes/context come from the canonical identity, not source_fields.

Extend `admin_dispatch`'s new-concept context CASE for groups and the validator's
immutable-context and parent-compatibility arms. A group's parent must be the
category identified by its immutable context. Flat adapters retain the existing
incompatible-parent refusal. Cross-category action membership remains valid:
action hierarchy checks compare its own category only. Reject malformed UUIDs,
missing category/context, cross-adapter parents and unauthorized field changes.

The current localization overlay already supports these shapes: native French
name/description remains authoritative when present; translations unsupported by
native columns live in `localized_field`. `review_source` needs its French and
other definitions in the overlay because its native table lacks `description`.
Group maps remain native. Reuse current definition validation and release-wide
four-language checks. No empty translations, placeholder definitions or weakened
definition policy. Draft saves/validation must leave native values untouched.

## Fences, RLS, assignments and prepared contracts

Existing publisher role attributes, memberships, functions, and existing ACLs stay
unchanged. Add only the required publisher DML privileges and publisher-specific
ALL RLS policy on these **six** new native source tables, with literal table names.
Keep existing source read/write policies intact. `ref_iti_assoc_role` has a public
read policy but no admin write policy surfaced; do not invent a broad admin/API
write grant. The publisher-specific source path supplies its necessary authority.
Check EXECUTE on every applicable RLS policy dependency as the publisher.

Install the existing `zz_thesaurus_source_guard`, statement source-gate and prepared
TRUNCATE guard on all six sources. Extend `preparation_sources()` by exactly those
six table OIDs and retain its recursive partition behavior. Add their native
unique-key columns to the preparation key contract only after verifying every
actual plain immediate unique key. Extend only the known new fields; validate the
entire previous registry first, then change the expected `apply_source` hash and
the six new key entries. Preserve all other support hashes/key arrays exactly.
Add new membership helpers to the reviewed hash contract if they influence
prepared publication; record that explicit contract expansion instead of silently
regenerating all trusted hashes. The existing cache projection dependencies stay
unchanged unless actual source inspection proves a new read dependency.

Hardcoded eight-source selectors must be extended consistently in:

1. `usage_objects(uuid[])` table-to-kind mapping and native FK target allowlist.
2. `row_has_historical_reference(...)` mapping/allowlist, preserving recursive
   retention and historical editing behavior.
3. Assignment-trigger installation: regenerate the complete existing+new FK spec
   for each affected table, retaining older adapter arms on mixed-FK tables.
4. Publisher RLS-helper verification source relation list.

Reuse `guard_assignment()` itself unless a demonstrated shape needs a change.
Verify `object_capacity`, `object_iti_associated_object`, `object_relation`,
`object_legal`, and `object_review` get the expected existing K1/journal/retention
coverage; add missing coverage using the reviewed registry rules. Do not make
reference-to-reference rows appear to be object-owned. Group usage must also
follow native group-to-action dependencies into existing action/object usage;
`object_ids_for_row()` deliberately does not traverse reference parents and cannot
discover those dependents by itself. Extend source dependency closure for usage,
not `is_ancestor()` or action hierarchy semantics.

## Incremental publication changes are narrow but mandatory

Existing `activate` copies unchanged documents from the previous release. Merely
adding fields to renderers cannot populate them on already-published actions.
Add a private deterministic dirty-closure helper over native membership endpoints.
After the existing scope-dirty union and before `publication_documents` rendering,
union the matching member/group endpoints into `document_dirty`, then deduplicate.
On initial group bootstrap, the 76 newly scoped groups cause their 239 native
member actions to be rendered; the existing native-parent closure also dirties
their own category parents. Existing action category contexts/edges remain exact.
Unrelated documents are copied byte-for-byte from release 25. Labels/definitions
of the 1,477 completed concepts are never changed by this relationship projection.

The helper must cover existing and newly scoped endpoints and retain both old/new
endpoints if membership editing is added later. For this delivery, membership is
immutable, so source-native edges plus `scope_dirty` and revision IDs are sufficient.
Do not claim general reassignment support without old-endpoint tests/storage.
Extend the publication semantic-target scope check to `member_of` and `members`:
every referenced endpoint must exist publicly in the same new release. Keep the
existing hierarchy/relation checks. Membership is a typed dependency, never an
ancestor relation or an editable `thesaurus.relation` row.

These are the only necessary activation-body changes beyond the already reviewed
metadata constructor patch. Pin the exact post-metadata predecessor hash and each
replacement's occurrence count; verify the inverse yields that exact hash, reject
partial replay, preserve OID/owner/ACL/settings, and use the exact per-grantor
temporary membership restoration proven by the metadata migration. Do not touch
authority checks, K2/K1 order, journal validation, immutable guards, expected release
handling, idempotency, checksums or outbox finalization.

## Bounded implementation packages and verification

The root may assign implementation to inexpensive workers after this design;
this architecture review spawns none. Keep the migration constructor owned by one
worker to avoid overlapping security patches.

- **SQL package:** new ordered migration + matching standalone mirror; source/link
  adapters, descriptive writer/validator, six policies/guards, dependency/usage
  selectors, membership projection/dirty helper, minimal activation patch and
  narrowly updated preparation contract. Append to `ci_fresh_apply.sql` only after
  the 78-domain metadata migration/test. Preserve historical migrations.
- **Content package:** six new four-language domain label entries and reviewed
  proposals for the 134 exact native identities, using the existing authenticated
  proposal tool. Capture fresh fingerprints after deployment; prepare, validate,
  preview and publish using ordinary authorized RPCs. Do not modify the completed
  1,477 proposals/content or publish from SQL migrations. Check source fields and
  fingerprints again immediately before the normal publication.
- **HTTP/contract package:** explicit `member_of`/`members` public projection and
  UUID-array validation, honest Bertel JSON-LD predicates/context, optional-field
  OpenAPI/Postman/docs updates, and preservation of legacy release responses. No
  live-source lookups in readers; no new public RPC or partner authority path.

Required meaningful disposable proofs: complete fresh apply; upgrade from current
metadata predecessor as non-superuser with exact membership restoration; 78 old
flags/legacy allowlist and release-25/history byte equality; rerunnable identity
mapping; FK one-of/link uniqueness; four-language validation for every shape,
especially overlay-only review-source definitions; draft-only saves do not mutate
native rows; publication changes only declared descriptive columns; illegal unit,
legal security flag, context and membership edits refuse; governed direct writes
refuse; unpublished/historical assignment retention works for all five new object
consumers; preparation gates/contract drift/race checks remain enforced.

Publication tests must prove first group bootstrap renders membership only for the
239 native actions, category hierarchy remains unchanged, flat/unrelated snapshots
copy unchanged, all targets are scoped, and a cross-category fixture preserves the
action's category, group's different category and exact membership FK. Compare
per-concept and set-based renderers, repeated/idempotent publications, older release
HTTP payloads/ETags and JSON-LD output. No synthetic production auth, production
function instrumentation, archived unsafe DB tools or publication bypass.

Before execution, freeze actual live predecessor function/constraint/view hashes
after the metadata migration, compare against fresh assembly, and review the
concrete generated diff. No numeric support hash is invented in this plan. A
fresh CI run and the stronger final review qualify the implementation; the reduced
metadata fixture alone does not qualify this fourteen-source extension.
