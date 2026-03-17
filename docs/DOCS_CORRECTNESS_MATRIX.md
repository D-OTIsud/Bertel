# Docs Correctness Matrix (Cleanup Pass)

This matrix validates current documentation claims against code existence after conservative cleanup.

Status values:
- `exists`: claim matches current implementation
- `missing`: documented item not found
- `outdated`: item exists but claim is obsolete/inaccurate
- `renamed`: documented name no longer canonical

## Scope

- `README.md` (root)
- `Base de donnée DLL et API/README.md`
- `docs/README.md`
- `docs/README_Postman.md`
- `docs/index.html`
- `docs/SUPABASE_SETUP.md`

## Matrix

| Doc source | Claim | Status | Code evidence |
|---|---|---|---|
| `README.md` | Canonical SQL files are `schema_unified.sql`, `api_views_functions.sql`, `rls_policies.sql`, `seeds_data.sql` | exists | Files exist under `Base de donnée DLL et API/` |
| `Base de donnée DLL et API/README.md` | `api.get_object_resource(...)` is a primary RPC | exists | Function defined in `api_views_functions.sql` |
| `Base de donnée DLL et API/README.md` | `api.get_object_resources_batch(...)` is available | exists | Function defined in `api_views_functions.sql` |
| `Base de donnée DLL et API/README.md` | `api.list_object_resources_page_text(...)` uses cursor pagination | exists | Function signature includes `p_cursor`, `p_page_size` in `api_views_functions.sql` |
| `Base de donnée DLL et API/README.md` | `api.list_objects_with_validated_changes_since(p_since)` exists with restricted access model | exists | Function exists in `api_views_functions.sql`; access checks handled in function and grants in setup docs |
| `docs/README.md` | Unified location model is `object_location` (not legacy `address`/`location`) | exists | `CREATE TABLE IF NOT EXISTS object_location` in `schema_unified.sql` |
| `docs/README.md` | Moderation/version workflow uses `pending_change` and `object_version` | exists | `CREATE TABLE IF NOT EXISTS pending_change` and `object_version` in `schema_unified.sql` |
| `docs/README.md` | Legal system uses `object_legal` and legal API RPCs | exists | `CREATE TABLE IF NOT EXISTS object_legal` and legal functions in `api_views_functions.sql` |
| `docs/README_Postman.md` | Core list endpoints use cursor payloads (`p_cursor`, `p_page_size`) | exists | `list_object_resources_page*` and filtered page functions use cursor/page size in `api_views_functions.sql` |
| `docs/README_Postman.md` | Endpoint `list_objects_with_validated_changes_since` is admin/service scoped | exists | Function `api.list_objects_with_validated_changes_since` and setup grants in `docs/SUPABASE_SETUP.md` |
| `docs/index.html` | Endpoint `list_object_resources_filtered_since_fast` is documented | exists | Function defined in `api_views_functions.sql` |
| `docs/index.html` | Endpoint `list_objects_map_view` is documented | exists | Function defined in `api_views_functions.sql` |
| `docs/index.html` | Endpoint `get_media_for_web` is documented | exists | Function defined in `api_views_functions.sql` |
| `docs/index.html` | Endpoint `add_legal_record` is documented | exists | Function defined in `api_views_functions.sql` |
| `docs/SUPABASE_SETUP.md` | Least-privilege function allowlist grants are recommended | exists | Explicit `GRANT EXECUTE ON FUNCTION ...` statements listed |
| `docs/SUPABASE_SETUP.md` | Privileged endpoint grant to `service_role` for validated changes endpoint | exists | `GRANT EXECUTE ON FUNCTION api.list_objects_with_validated_changes_since(timestamptz) TO service_role;` |
| `docs/README.md` | Infrastructure section is Supabase-managed (no local PgBouncer requirement) | exists | `docs/README.md` now states managed Supabase infra and no active `pgbouncer.ini` dependency |
| `Base de donnée DLL et API/Guide d’utilisation – API “Unified Objec.md` | Marked as non-canonical historical guide and aligned with cursor semantics | exists | Guide now carries historical marker and uses cursor payload (`p_cursor`, `p_page_size`) consistent with SQL endpoint behavior |
| `Base de donnée DLL et API/LEGAL_RECORDS_INTEGRATION.md` | Historical guide no longer references missing legal test file | exists | `test_get_object_resource_with_legal.sql` mention removed; guidance points to existing legal RPC validation path |
| `Base de donnée DLL et API/DOCUMENT_REQUEST_SYSTEM.md` | Historical/non-canonical marker is present | exists | File explicitly marked historical/non-canonical; canonical runtime source is SQL + `docs/index.html` |
| `Base de donnée DLL et API/LEGAL_VISIBILITY_SYSTEM.md` | Historical/non-canonical marker is present | exists | File explicitly marked historical/non-canonical; canonical runtime source is SQL + `docs/index.html` |
| `Base de donnée DLL et API/ITINERARY_MEDIA_FEATURES.md` | Historical/non-canonical marker is present | exists | File explicitly marked historical/non-canonical; canonical runtime source is SQL + `docs/index.html` |
| `Base de donnée DLL et API/API_EXTENSIONS_DEEP_DATA.md` | Historical/non-canonical marker is present | exists | File explicitly marked historical/non-canonical; canonical runtime source is SQL + `docs/index.html` |
| `Base de donnée DLL et API/UNIFIED_LEGAL_SYSTEM_DOCUMENTATION.md` | Historical/non-canonical marker is present | exists | File explicitly marked historical/non-canonical; canonical runtime source is SQL + `docs/index.html` |

## Cleanup notes

- Obsolete files have been removed from the repository.
- Time-bound report references were removed from active docs and replaced with canonical runtime/runbook links.
