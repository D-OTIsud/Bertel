\set ON_ERROR_STOP on

-- Cloud-safe rehearsal: exercise the §190 taxonomy and DATAtourisme
-- leaf-aware crosswalk in one transaction, then leave the database untouched.
BEGIN;
\ir ../taxonomy_nature_forme_manifest_20260724.sql
\ir ../migration_taxonomy_nature_forme_body.sql
\ir ../migration_interop_crosswalk_leafaware_body.sql
\ir test_interop_crosswalk_leafaware.sql
\ir test_interop_profiles.sql
\ir test_object_jsonld_schemaorg.sql
ROLLBACK;

