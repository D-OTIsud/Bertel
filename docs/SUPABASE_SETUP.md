## Supabase (self-hosted) setup for Bertel API v3

This project exposes read models and RPCs from the `api` schema through PostgREST. On self‑hosted Supabase (e.g., via Coolify), you must configure the REST service environment and grant permissions so RPCs are visible and callable.

### 1) Required database extensions

Run once on your database (already included in `schema_unified.sql`, but safe to re-run):

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "unaccent";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS btree_gist;
```

If your platform installs extensions into the `extensions` schema (Supabase default), make sure the REST service search_path includes it (see step 2b).

### 2) Configure PostgREST (REST service)

Keep functions under `api` (do not move them to `public`). Expose that schema and make sure `extensions` (and `public`) are in the extra search path for built‑in functions like `unaccent`.

#### 2a) Environment variables

Set these on the PostgREST container/service (Coolify → your Supabase REST app → Environment variables):

```
PGRST_DB_SCHEMAS=public,storage,graphql_public,api
PGRST_DB_EXTRA_SEARCH_PATH=public,extensions
```

Redeploy/restart the REST service after changing these.

If you use Compose Override in Coolify, add under the `rest` service:

```yaml
services:
  rest:
    environment:
      PGRST_DB_SCHEMAS: public,storage,graphql_public,api
      PGRST_DB_EXTRA_SEARCH_PATH: public,extensions
```

#### 2b) Reload schema cache

After grants or function changes you can refresh without a full restart:

```sql
NOTIFY pgrst, 'reload schema';
```

Note: After changing `PGRST_DB_SCHEMAS`/`PGRST_DB_EXTRA_SEARCH_PATH`, a service restart is required.

### Supabase Cloud (managed) setup

If you use Supabase Cloud (hosted by Supabase), configure the REST API from Studio. You do not edit container env vars; use the API settings UI instead.

1) In Studio: Settings → API
- Exposed schemas: add `api` to the list (keep `public`, `storage`, `graphql_public`).
- DB Extra Search Path: set to `public, extensions`.
- Save changes.

2) Reload the schema cache
- Either click the “Reload” button in the API settings (if shown), or run in the SQL editor:

```sql
NOTIFY pgrst, 'reload schema';
```

3) Ensure extensions exist (run once in SQL editor):

```sql
CREATE EXTENSION IF NOT EXISTS "unaccent";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
```

4) Grant permissions (run once in SQL editor):

```sql
GRANT USAGE ON SCHEMA api TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA api TO anon, authenticated;
```

5) Test an RPC from the API docs or via curl/Postman
- Endpoint: `/rest/v1/rpc/list_object_resources_page_text`
- Headers: `apikey`, `Authorization`, `Content-Type: application/json`, `Content-Profile: api`
- Body example: `{ "p_cursor": null }`

Troubleshooting is identical to the self‑hosted section below (404 → expose `api`; 42883 → add `extensions` to DB Extra Search Path; 401/406/415 → headers/roles/body).

### 3) Permissions for API consumers

Grant once to the roles you use (typically `anon`, `authenticated`, optionally `service_role`):

```sql
GRANT USAGE ON SCHEMA api TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA api TO anon, authenticated;

-- Optional if you call with the service key
GRANT USAGE ON SCHEMA api TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA api TO service_role;
```

### 4) Calling RPCs (examples)

RPCs are defined in `api`, e.g. `api.list_object_resources_page_text`. Call via PostgREST at `/rest/v1/rpc/<function>`.

Headers (typical):
- `apikey: <anon or service key>`
- `Authorization: Bearer <anon/service key or user JWT>`
- `Content-Type: application/json`
- `Content-Profile: api` (recommended when you use multiple schemas)

Example: minimal call (at least one named argument is required by PostgREST):

```bash
curl 'https://<your-host>/rest/v1/rpc/list_object_resources_page_text' \
  -H 'apikey: <key>' \
  -H 'Authorization: Bearer <key-or-jwt>' \
  -H 'Content-Type: application/json' \
  -H 'Content-Profile: api' \
  -d '{"p_cursor": null}'
```

With filters:

```bash
curl 'https://<your-host>/rest/v1/rpc/list_object_resources_page_text' \
  -H 'apikey: <key>' \
  -H 'Authorization: Bearer <key-or-jwt>' \
  -H 'Content-Type: application/json' \
  -H 'Content-Profile: api' \
  -d '{
    "p_page_size": 20,
    "p_types": ["accommodation","event"],
    "p_status": ["published"],
    "p_search": "museum"
  }'
```

### 5) Troubleshooting

- 404 PGRST202: "Could not find the function public.<name>"
  - Cause: `api` not included in `PGRST_DB_SCHEMAS`, or REST service not restarted.
  - Fix: Set `PGRST_DB_SCHEMAS=public,storage,graphql_public,api` and restart REST; then `NOTIFY pgrst, 'reload schema';`.

- 42883: "function unaccent(text) does not exist"
  - Cause: `unaccent` is installed under `extensions` and not on search_path when REST executes.
  - Fix: Set `PGRST_DB_EXTRA_SEARCH_PATH=public,extensions` and restart REST. Ensure `CREATE EXTENSION IF NOT EXISTS "unaccent";` is present.
  - Optional hardening: reference the extension explicitly in your helper:
    ```sql
    CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
    RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
      SELECT extensions.unaccent($1)
    $$;
    ```

- 401 Unauthorized
  - Check `apikey`/`Authorization` header and role grants.

- 406/415 (content negotiation)
  - Ensure `Content-Type: application/json` and the body is valid JSON.

### 6) Optional: make RPCs appear in Studio docs

If you use Supabase Studio, ensure the `api` schema is listed under "Exposed schemas" (or equivalent) so functions appear in UI docs. This does not affect runtime as long as the REST env vars above are set.



