# Old_data Berta v2 import - run order

Batch id: `old-data-berta2-all-20260501-01`

This folder is the operational, paste-into-SQL-Editor version of the Berta v2
old_data import. The original 33 MB single-file artifact was too large for the
Supabase SQL Editor; here the work is broken into many small files (each
under ~700 KB) that can be pasted one at a time.

## Run order

Files are numbered. **Run them in strict numeric order.** Each file is wrapped
in its own `BEGIN ... COMMIT` so it can be re-run individually if needed; the
`DELETE FROM staging.<table>` statement only appears in the first part of each
table, so reordering the parts within one table is unsafe.

1. `00_schema_and_batch.sql` - schema + tables + indexes + batch row UPSERT.
2. `01_object_temp__NN.sql` - all parts in order.
3. `02_object_location_temp__NN.sql` - all parts in order.
4. `03_object_description_temp__NN.sql` - all parts in order.
5. `04_object_origin_temp__NN.sql` - all parts in order.
6. `05_object_capacity_temp__NN.sql` - all parts in order.
7. `06_object_language_temp__NN.sql` - all parts in order.
8. `07_object_payment_method_temp__NN.sql` - all parts in order.
9. `08_contact_channel_temp__NN.sql` - all parts in order.
10. `09_actor_temp__NN.sql`.
11. `10_actor_channel_temp__NN.sql` - all parts in order.
12. `11_actor_object_role_temp__NN.sql`.
13. `12_object_price_temp__NN.sql`.
14. `13_opening_period_temp__NN.sql`.
15. `14_object_sustainability_action_temp__NN.sql`.
16. `15_crm_interaction_temp__NN.sql` - all parts in order.
17. `16_crm_comment_temp__NN.sql` - all parts in order.
18. `17_media_galerie_lot1_temp__NN.sql` - all parts in order.
19. `18_review_mapped_supplements.sql` - the 53 category/type arbitration rows.
20. `19_finalize_batch_status.sql` - stamps `staging.import_batches.updated_at`.
21. `20_promotion.sql` - resolves and writes final tables, runs assertions,
    prints a validation summary.

## Re-running and recovery

- Stage 1 files are idempotent at the table-part granularity: a per-table
  file is safe to re-run if you also re-run any later part of the same table.
- If you only want to retry one table from scratch, re-run **all** parts of
  that table starting from `__01`.
- If `20_promotion.sql` aborts on an assertion, the promotion transaction is
  rolled back automatically. Staging stays committed and inspectable; fix the
  data, then re-run only `20_promotion.sql`.

## Known data issues handled at import time

- `contact_channel_temp` source data has 35 duplicate
  `(staging_object_key, kind_code, value)` tuples - the satellite "Contacts
  sup" sheet repeats contacts already on the main "Berta 2.0" sheet.
  `00_schema_and_batch.sql` ensures the matching unique constraint exists,
  and every `INSERT INTO staging.contact_channel_temp` in files 08 and 18
  carries an `ON CONFLICT (import_batch_id, staging_object_key, kind_code,
  value) DO NOTHING` clause so duplicates are silently skipped.

## Why the split exists

Supabase SQL Editor (and most browser-based editors) reject pastes above
roughly 1 MB. The single-file version of this import was 33 MB. Splitting
on `INSERT INTO staging.<table>` statement boundaries keeps every file well
under 1 MB while preserving the original transactional semantics inside each
file.

For non-interactive runs, all of stage 1 can also be concatenated and piped
through `psql` or `supabase db execute`; the per-file `BEGIN ... COMMIT`
boundaries do not change behaviour in that case.
