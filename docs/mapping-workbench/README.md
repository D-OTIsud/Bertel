# Bertel Mapping Workbench

This workbench turns the Bertel V3 object model into practical, reviewable tools for:

- understanding the global Postgres/Supabase schema,
- mapping the object database surface to the Next.js object editor/detail UI,
- profiling Berta v2 old data before promotion,
- validating old-object insertion after promotion,
- defining fixture coverage for object workspace UI states.

It is intentionally source-code first: DBML, SQL, CSV, and Markdown files that can be versioned and reviewed with the rest of the project.

## Source Of Truth Inputs

Use these files as the upstream truth before changing this workbench:

- `ARCHITECTURE.md`
- `docs/architecture/bertel-object-workspace-canonical-map.md`
- `docs/architecture/OBJECT_DATA_DICTIONARY.md`
- `Base de donnée DLL et API/schema_unified.sql`
- `Base de donnée DLL et API/api_views_functions.sql`
- `Base de donnée DLL et API/Old_data_cleaned/berta2_all_20260501/manifest.json`
- `bertel-tourism-ui/src/services/object-workspace-parser.ts`
- `bertel-tourism-ui/src/features/object-drawer/object-drawer-sections.ts`

## Files

- `dbml/bertel-core-object-surface.dbml`
  - Hand-curated DBML map of the object-facing schema.
  - Paste into dbdiagram.io or convert to a static ERD.

- `object-workspace-surface-map.csv`
  - Canonical product module -> UI section -> source tables -> API payload -> old data mapping.
  - Use it as the acceptance checklist when adding or reshaping object editor panels.

- `sql/old-data-profile.duckdb.sql`
  - DuckDB profiling script for the cleaned old CSV bundle.
  - Finds row counts, orphan satellite rows, duplicate contacts, invalid coordinates, and review-mapped type decisions.

- `sql/post-import-surface-assertions.sql`
  - PostgreSQL/Supabase checks to run after `old_data_supabase_import_20260501/20_promotion.sql`.
  - Focuses on UI-readiness and object-surface completeness, complementing the promotion script's embedded assertions.

- `fixtures/object-workspace-fixture-matrix.csv`
  - Fixture targets for Storybook/Jest/Playwright coverage of the drawer/detail states.

## Workflow

### 1. Global schema understanding

Open `dbml/bertel-core-object-surface.dbml` in dbdiagram, or use it as the human-readable ERD summary beside the full SQL schema.

For a live database, SchemaSpy is still the best second artifact because it introspects the real deployed schema, constraints, and foreign keys.

Portable tooling is installed under `.tools/`:

- DuckDB CLI: `.tools/python/Scripts/duckdb.exe`
- Graphviz dot: `.tools/graphviz/Graphviz-14.1.5-win64/bin/dot.exe`
- SchemaSpy: `.tools/schemaspy/schemaspy-7.0.2-app.jar`
- PostgreSQL JDBC: `.tools/schemaspy/postgresql-42.7.11.jar`

To generate SchemaSpy HTML from a reachable Postgres/Supabase database, set `PGHOST`, `PGDATABASE`, `PGUSER`, and `PGPASSWORD`, then run:

```powershell
.\docs\mapping-workbench\run-schemaspy.ps1
```

### 2. Old data profiling before insert

Run from the repository root:

```bash
duckdb old-data-profile.duckdb -c ".read docs/mapping-workbench/sql/old-data-profile.duckdb.sql"
```

On Windows/PowerShell you can also run:

```powershell
.\docs\mapping-workbench\run-old-data-profile.ps1
```

The script reads the cleaned CSVs directly from:

```text
Base de donnée DLL et API/Old_data_cleaned/berta2_all_20260501/
```

Review these outputs before promotion:

- `table_counts`
- `object_type_counts`
- `satellite_object_refs_summary`
- `satellite_refs_missing_main_object`
- `duplicate_object_contacts`
- `invalid_coordinates`
- `review_mapped_type_counts`

### 3. Insert old objects

Use the operational run order documented in:

```text
Base de donnée DLL et API/old_data_supabase_import_20260501/README.md
```

Run `00` through `20` in strict numeric order.

### 4. Validate post-import UI surface

After `20_promotion.sql` succeeds, run:

```sql
\i docs/mapping-workbench/sql/post-import-surface-assertions.sql
```

or paste it into the Supabase SQL editor. It should return summary result sets and raise an exception if a blocking surface issue is found.

### 5. UI fixture coverage

Use `fixtures/object-workspace-fixture-matrix.csv` to create stable raw `ObjectDetail.raw` fixtures for:

- parser unit tests,
- object drawer panel tests,
- Storybook stories for difficult object states,
- Playwright screenshots for visual regressions.

## Definition Of Done For A Mapping Change

A mapping change is not done until:

- `object-workspace-surface-map.csv` names the source tables and API keys,
- old data profiling has no unexplained orphan or duplicate rows,
- post-import assertions pass,
- the parser exposes the data through `ObjectWorkspaceModules`,
- the drawer section/panel has a fixture for at least one full and one sparse state,
- the visual/detail behavior is checked for desktop and narrow viewports when layout changes.
