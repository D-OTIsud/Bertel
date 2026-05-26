-- migration_object_location_address1_dedupe.sql
-- Legacy import stored a full formatted line in address1 while postcode, city, and lieu_dit
-- were also populated in dedicated columns. UI/API concat those fields again → duplicate display.
--
-- Pattern stripped from address1 (when present): ", {CP} {city}" optional " - {lieu-dit}"
-- Example: "28 rue Edouard Daladier, 97430 Le Tampon - PK12" → "28 rue Edouard Daladier"
--
-- PREREQUISITE: object_location from schema_unified.sql
-- IDEMPOTENT: only rows matching the import suffix pattern are updated

BEGIN;

UPDATE object_location ol
SET
  address1 = TRIM(regexp_replace(ol.address1, ',\s*\d{5}\s+[^,]+(\s+-\s+.+)?$', '')),
  updated_at = NOW()
WHERE ol.address1 IS NOT NULL
  AND ol.address1 <> ''
  AND ol.address1 ~ ',\s*\d{5}\s+[^,]+(\s+-\s+.+)?$';

COMMIT;
