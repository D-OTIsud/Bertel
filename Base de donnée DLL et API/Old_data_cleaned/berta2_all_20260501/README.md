# Berta v2 Old_data cleaned bundle: all main-source objects

Generated on 2026-05-01 from:

- `C:\Users\dphil\Downloads\Berta 2.0 - Berta 2.0 (3).csv` as the clean main object source
- `Base de donnée DLL et API/Old_data` for satellite files

Batch id:

```text
old-data-berta2-all-20260501-01
```

For Supabase copy/paste, use the SQL files in this folder, in strict numeric order:

```text
Base de donnée DLL et API/old_data_supabase_import_20260501/
  README.md
  00_schema_and_batch.sql
  01_object_temp__01.sql        ... 01_object_temp__04.sql
  02_object_location_temp__01.sql ... 02_object_location_temp__04.sql
  03_object_description_temp__01.sql ... 03_object_description_temp__05.sql
  ...
  17_media_galerie_lot1_temp__01.sql ... 17_media_galerie_lot1_temp__03.sql
  18_review_mapped_supplements.sql
  19_finalize_batch_status.sql
  20_promotion.sql
```

The full runbook is in that folder's own `README.md`. Every file is under ~700 KB so each one pastes safely into the Supabase SQL Editor; for non-interactive runs everything can also be concatenated in numeric order and piped through `psql` or `supabase db execute`.

Files `00`..`19` are stage 1 (load `staging.*` tables, idempotent per batch id). File `20` is stage 2: it promotes staged rows into the final tables (`object`, `actor`, `crm_interaction`, `media`, ...), runs the assertion block, and emits a read-only validation summary. The promotion runs in a single transaction so a failed assertion rolls back all final-table writes; staging stays committed and inspectable.

All files embed the cleaned data as SQL `INSERT` statements and do not require local CSV access, `psql` meta-commands, `\copy`, or the retired import application.

In staging, `raw_source_data` is the canonical Berta record. The `extra` JSON fields are derived helpers used by the import SQL and can be recomputed from `raw_source_data`.

The promotion phase resolves the publisher org through a stable `object_external_id` (`old_data_import_context` / `oti-du-sud-run`). On the first run it can stamp that ID from the seeded `OTI du Sud` / `RUN` organisation.

The source file has 837 usable rows:

- 363 online
- 474 offline
- 837 unique object ids
- 0 malformed rows

This bundle includes online and offline objects from the clean main object source. Offline objects are kept as active objects and staged as draft/active, preserving the legacy `En ligne = non` value in the raw source data. The standalone SQL also imports the 53 former reject rows as provisional, review-mapped objects with `mapping_review_required = true`.

Standalone SQL publication mapping:

- 363 legacy online rows -> `published` / `active`
- 474 legacy offline rows -> `draft` / `active`

Coverage:

- 1153 unique legacy object ids seen across the main object file and satellite files
- 837 unique ids in the clean main object source
- 837 main-source objects imported by the standalone SQL
- 784 clean mapped objects in the CSV bundle
- 53 category/type arbitration objects imported by the SQL with provisional object types
- 316 satellite-only ids missing from the clean main object source

Loaded dependent CSV rows are scoped to the 784 clean mapped objects. The standalone SQL adds basic staging rows for the 53 review-mapped objects: 53 object rows, 53 locations, 50 descriptions, and 131 valid contact channels, plus origin/external id and org links during promotion.

- 1805 object contacts
- 686 actors
- 789 actor-object roles
- 1435 CRM parent interactions
- 1740 CRM comments
- 4014 gallery media rows
- 740 prices
- 257 opening-period rows
- 57 sustainability rows kept for review/rejection handling

See `old_data_object_id_coverage.csv` for the IDs that exist in satellite files but are not available in the clean main object source.

See `old_data_review_mapped.csv` for the 53 provisional object-type decisions embedded in the standalone SQL.
