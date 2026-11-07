# Object visibility — performance notes (Option A routing)

Companion to `user-object-visibility-diagnostic.md`. Captures the cost model
and index coverage of the routing change applied to
`api.get_filtered_object_ids` in `Base de donnée DLL et API/api_views_functions.sql`.

## Routing summary

`api.get_filtered_object_ids` decides at runtime whether to read from the
hot-path materialized view `internal.mv_filtered_objects` (the "MV path") or
from the live `object` table (the "live path"). With the fix:

| Call shape | `p_status` | `use_mv` | Source | Why |
| --- | --- | --- | --- | --- |
| Public Explorer / anonymous | `['published']` | `TRUE` | MV | Hot path preserved. |
| Public Explorer with live-only filter (e.g. `city_any`) | `['published']` | `FALSE` | live | Filter needs joins absent from the MV. |
| Editor / admin Explorer | `['published','draft']` | `FALSE` | live | MV only stores published rows. |
| Editor / admin Explorer | `['draft']` | `FALSE` | live | Same reason. |
| Anything containing `archived` | n/a | `FALSE` | live | Same reason. |
| `NULL` p_status | n/a | `TRUE` | MV | Caller wrappers default to `['published']`; safe. |

Order of statuses does not matter (rule uses the array containment operator
`<@`).

## Expected row counts (2026-05-19 inventory)

| Table / source | Rows |
| --- | --- |
| `object` total | 848 |
| `object` `status = 'published'` | 374 |
| `object` `status = 'draft'` | 474 |
| `internal.mv_filtered_objects` total | 374 |
| `internal.mv_filtered_objects` `status` (only value) | `published` (×374) |

For the target user (`44b43d4b-e5be-446d-aac0-0a5b43a4cdc2`) the editor
explorer should return roughly `848` cards once RLS on `object` is applied
inside `api.get_object_cards_batch` (they are super_admin + org_admin of OTI
du Sud, and 474/474 drafts belong to that ORG).

## Index coverage of the live path

The live-path query inside `api.get_filtered_object_ids` is:

```sql
FROM object o
CROSS JOIN params
LEFT JOIN LATERAL (
  SELECT ol2.city_search_vector, ol2.city, ol2.lieu_dit, ol2.geog2
  FROM object_location ol2
  WHERE ol2.object_id = o.id
    AND ol2.is_main_location IS TRUE
  ORDER BY ol2.created_at
  LIMIT 1
) ol ON TRUE
WHERE NOT params.use_mv
  AND src.status = ANY(p_status)
  AND <… other filters …>
```

EXPLAIN for the editor case (`status IN ('published','draft')`, no filters):

```
Nested Loop Left Join
  Bitmap Heap Scan on object o
    Recheck Cond: (status = ANY ('{published,draft}'::object_status[]))
    Bitmap Index Scan on idx_object_type_status
  Limit
    Sort  (Sort Key: ol2.created_at)
      Index Scan using idx_object_location_object_id on object_location ol2
```

Indexes already present that benefit the live path:

| Table | Index | Why |
| --- | --- | --- |
| `object` | `idx_object_type_status` (object_type, status) | Status / type filter — used in the plan above. |
| `object` | `idx_object_status_draft` (id, name, object_type WHERE status='draft') | Partial covering index — used when filtering drafts only. |
| `object` | `idx_object_status_published` (…) | Same for published-only. |
| `object` | `idx_object_status_archived` (…) | Same for archived. |
| `object` | `idx_object_cached_*_gin` (cached_amenity_codes, cached_payment_codes, cached_environment_tags, cached_language_codes, cached_classification_codes, cached_taxonomy_codes) | Array overlap (`&&`) filters. |
| `object` | `idx_object_name_search_vector` (GIN, full) | Full-text search across drafts. |
| `object` | `idx_object_published_name_search` (GIN, partial WHERE published) | Full-text search published only. |
| `object_location` | `idx_object_location_object_id`, `idx_location_main_covering`, `idx_location_main_geog_gist` | LATERAL join + radius/bbox filters. |
| `object_org_link` | `idx_object_org_link_object_id`, `idx_object_org_link_org_object_id` | RLS in downstream `get_object_cards_batch`. |
| `object_amenity` | `idx_object_amenity_object_id` | `amenities_all` join. |
| `object_classification` | `idx_object_classification_object_id`, `idx_classification_active` (object_id, value_id, scheme_id WHERE granted) | `label_scheme_ranked` / classifications. |
| `object_iti` | `idx_object_iti_object_id`, `idx_iti_with_track` | `itinerary` block. |
| `tag_link` | `idx_tag_link_target` (target_table, target_pk) | `tags_any`. |
| `object_meeting_room` / `meeting_room_equipment` | room/object indexes | `meeting_room` block. |

Conclusion: the live path is already well indexed. **No new index is
required for the immediate fix.** A small extra cost is paid by editor
sessions (no MV cache), which is acceptable: editors are a small fraction of
traffic and the live path uses partial indexes that fit the data set.

## Risks worth watching

- `name_search_vector` searches across drafts use the global GIN index. If
  the volume of drafts grows materially (10k+) and full-text search becomes
  slow for editors, consider extending the existing partial GIN index to
  cover `('published','draft')` or adding a draft-specific partial GIN.
- `LEFT JOIN LATERAL` on `object_location` orders by `created_at` and is
  served by `idx_object_location_object_id` plus a sort. The partial
  `uq_object_location_main` already enforces a single main row per object,
  so the `Limit 1` is effectively deterministic; performance is fine today,
  but a future index `(object_id) WHERE is_main_location` ordered by
  `created_at` would remove the in-memory sort if it ever shows up in
  pg_stat_statements.

## Why we did **not** broaden / rebuild the MV

- The MV is `SECURITY DEFINER`–accessed and bypasses RLS. Adding drafts to
  the MV without a per-row authorisation guard would leak drafts of other
  ORGs to any authenticated caller who passes `p_status = ['draft']`.
- Refreshing the MV requires either `CONCURRENTLY` (needs a unique index —
  exists) and a one-shot full scan, plus updates to all consumers that rely
  on "MV row = published". This is more change than the editor visibility
  bug warrants.
- Editors are a small fraction of Explorer traffic (CRM workflow), so
  paying the live-path cost on their side keeps the public Explorer fast
  without risking a leak.

## Future option (deferred)

If the editor Explorer becomes slow at larger scale (rough rule of thumb:
when `object` exceeds ~50k rows AND editor sessions exceed ~10 rps), build
a dedicated editor-scoped materialized view that includes drafts but is
keyed on `org_object_id` and refreshed alongside `mv_filtered_objects`.
Per-row visibility would be enforced inline with `api.can_read_extended` in
the SECURITY DEFINER function. Keep this as an option, not as a current
action item.

## Verification commands

Read-only counts:

```sql
SELECT status, COUNT(*) FROM object              GROUP BY status;
SELECT COUNT(*)         FROM internal.mv_filtered_objects;  -- needs internal schema USAGE
```

Plan check (live path, editor case):

```sql
EXPLAIN (FORMAT TEXT, COSTS ON, VERBOSE OFF)
SELECT o.id
FROM object o
LEFT JOIN LATERAL (
  SELECT ol2.city_search_vector, ol2.city, ol2.lieu_dit, ol2.geog2
  FROM object_location ol2
  WHERE ol2.object_id = o.id AND ol2.is_main_location IS TRUE
  ORDER BY ol2.created_at LIMIT 1
) ol ON TRUE
WHERE o.status = ANY(ARRAY['published','draft']::object_status[]);
```
