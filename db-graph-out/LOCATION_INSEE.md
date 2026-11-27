# Location INSEE — targeted live-production supplement, 27 November 2026

This is a targeted production catalogue capture through the Bertel Supabase
connector at `2026-11-27T05:55:41.163971+00:00`. It is **not** a full catalogue refresh.
The installed migration is
[`20261127054746_location_insee.sql`](../supabase/migrations/20261127054746_location_insee.sql).
[LOCATION_INSEE_CATALOG.json](LOCATION_INSEE_CATALOG.json) records body-free
metadata, exact function-body hashes, constraints, indexes, policies, grants,
trigger definitions and the aggregate production postcheck.

## Installed schema and write path

- `public.ref_commune_postcode(postcode varchar(5), insee_code varchar(5))`
  contains 37 official La Réunion postal/INSEE pairs. Both columns are required;
  the pair is the primary key, the postcode has a five-digit check, and INSEE
  references `public.ref_commune(insee_code)`. The INSEE FK is indexed.
- This lookup has RLS enabled and SELECT-only grants for `anon`,
  `authenticated`, `service_role` and `bertel_thesaurus_publisher`.
  Its two SELECT policies are recorded exactly in the capture.
- `public.object_location.code_insee` is now NOT NULL, has a validated FK to
  `public.ref_commune(insee_code)`, and has a supporting index.
- `a_set_location_insee` executes before INSERT or UPDATE OF city, postcode,
  code_insee on each canonical location row. Its name orders it before the
  existing thesaurus mutation journal. This protects both main addresses and
  place addresses, including imports promoted into the canonical table.
- The additional `thesaurus_assignment_guard` calls the existing governed
  commune assignment guard. It preserves the established published-vocabulary
  and historical-assignment rules.

| Function | Result / volatility | Effective EXECUTE |
| --- | --- | --- |
| `internal.normalize_commune_name(p_name text)` | `text`; IMMUTABLE | authenticated, service_role, publisher; anon denied |
| `internal.resolve_location_insee(p_city text, p_postcode text)` | `text`; STABLE | authenticated, service_role, publisher; anon denied |
| `internal.set_location_insee()` | `trigger`; VOLATILE | postgres only; invoked by the installed trigger |

All three functions are **SECURITY INVOKER** with fixed search paths. The resolver
reads `public.ref_commune` and `public.ref_commune_postcode`; the normalizer calls
the existing `public.immutable_unaccent(text)`. The trigger resolves and writes
the incoming `code_insee`; it does not elevate the caller or bypass existing RLS.

Resolution uses normalized commune names and official postal correspondences,
with no network dependency at save time. Known contradictions are rejected.
Shared postcodes require a unique match or a compatible explicit INSEE code.
Changing an address recomputes a stale code. An unchanged historical address/code
assignment is retained. Missing or demonstrably wrong codes were repaired by the
migration through the ordinary audit and ownership guards.

## Observed production postcheck

The same live capture confirms:

- Migration history contains version `20261127054746`.
- 1,189 canonical location rows; zero missing, unknown or inconsistent INSEE codes.
- 37 postal/INSEE mappings.
- Four objects still have **no main location**. Their commune cannot be inferred
  from absent address information; this migration does not invent a location or
  change the application's creation flow.

The schema guarantee applies to rows in `object_location`. It does not assert
that every object already has a main location. The approved application creation
flow and additional deferred integrity constraints are now implemented and tested
locally; see [CREATE_OBJECT_LOCATION.md](CREATE_OBJECT_LOCATION.md). That later
source/local supplement does not claim a production deployment.

## Catalogue provenance and scope

`graph.json`, `FUNCTIONS.md`, `FUNCTION_ACCESS.md`, `POLICIES.md`,
`dbdoc/`, the ignored graph viewer and the standalone API/DB reference were
**not regenerated or relabelled** for this targeted observation. They retain their
6 November baseline and the pre-existing separately documented supplements.
All existing graph nodes, edges and workspace changes remain intact.

For these new functions, the postal lookup and the changed location constraints
and triggers, consult this supplement and its exact live evidence until the next
complete catalogue extraction incorporates them. The index links this partial
capture explicitly; its baseline counts are not presented as fresh totals.
