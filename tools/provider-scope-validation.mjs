// Isolated PostgreSQL checks: pass the path to an external @electric-sql/pglite
// dist/index.js installation. No live database or app dependency is modified.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modulePath = process.argv[2];
if (!modulePath) throw new Error('Pass the path to @electric-sql/pglite/dist/index.js');
const { PGlite } = await import(pathToFileURL(path.resolve(modulePath)).href);
const db = new PGlite();
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA api; CREATE SCHEMA internal;
    CREATE SCHEMA extensions; CREATE SCHEMA audit; CREATE SCHEMA crm; CREATE SCHEMA ref;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
    CREATE FUNCTION api.current_user_test_realm() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT COALESCE((auth.jwt()->>'sandbox')::boolean,false) $$;
    CREATE TYPE public.object_type AS ENUM ('ORG','HOT','SRV');
    CREATE TYPE public.object_status AS ENUM ('published','draft','archived');
    CREATE TYPE public.crm_status AS ENUM ('new','in_progress','awaiting_provider','resolved','closed','canceled');
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
    CREATE TABLE public.app_user_profile (id uuid PRIMARY KEY, display_name text, role text, preferences jsonb DEFAULT '{}');
    ALTER TABLE public.app_user_profile ENABLE ROW LEVEL SECURITY;
    CREATE POLICY own_profile ON public.app_user_profile TO authenticated USING (id=(SELECT auth.uid())) WITH CHECK (id=(SELECT auth.uid()));
    GRANT USAGE ON SCHEMA public,auth,api TO authenticated;
    GRANT SELECT,UPDATE ON public.app_user_profile TO authenticated;
    CREATE TABLE public.object (id text PRIMARY KEY, object_type public.object_type, name text, status public.object_status, is_test boolean NOT NULL DEFAULT false);
    CREATE TABLE public.actor (id uuid PRIMARY KEY, display_name text);
    CREATE TABLE public.ref_actor_role (id uuid PRIMARY KEY, code text);
    INSERT INTO public.ref_actor_role VALUES ('00000000-0000-4000-a000-000000000001','operator');
    CREATE TABLE public.actor_object_role (actor_id uuid, object_id text, role_id uuid, valid_from date, valid_to date, PRIMARY KEY(actor_id,object_id,role_id));
    CREATE TABLE public.crm_interaction (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), object_id text, actor_id uuid, status public.crm_status, occurred_at timestamptz, resolved_at timestamptz, demand_topic_id uuid);
    CREATE TABLE public.crm_task (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), object_id text, status text);
    CREATE TABLE public.ref_code_demand_topic (id uuid, code text, name text);
    CREATE TABLE public.crm_interaction_status_event (interaction_id uuid, from_status public.crm_status, to_status public.crm_status, changed_at timestamptz);
    CREATE TABLE public.object_version (object_id text, created_by uuid, change_type text, created_at timestamptz);
    CREATE FUNCTION api.crm_user_label(p_user_id uuid, p_name text) RETURNS text LANGUAGE sql STABLE AS $$ SELECT COALESCE(p_name,p_user_id::text) $$;
    -- Only unrelated search/geo facets are reduced in this test host. The
    -- migration patches this function using its real predicate and contract.
    CREATE FUNCTION api.get_filtered_object_ids(p_filters jsonb,p_types public.object_type[],p_status public.object_status[],p_search text DEFAULT NULL)
    RETURNS TABLE(object_id text,label_rank integer,label_match jsonb,relevance real)
    LANGUAGE sql STABLE SECURITY DEFINER AS $$
      WITH source_rows AS (SELECT id AS object_id,object_type,status FROM public.object WHERE is_test=api.current_user_test_realm()),
      params AS (SELECT COALESCE(p_filters,'{}'::jsonb) AS filters)
      SELECT src.object_id,0,NULL::jsonb,0::real FROM source_rows src CROSS JOIN params
      WHERE (p_types IS NULL OR src.object_type = ANY(p_types))
        AND (p_status IS NULL OR src.status = ANY(p_status))
    $$;
  `);
  const canonical = await readFile(path.join(root, 'Base de donnée DLL et API/api_views_functions.sql'), 'utf8');
  for (const name of ['get_dashboard_crm_open','get_dashboard_crm_activity','get_dashboard_team_activity']) {
    const definition = canonical.match(new RegExp(`CREATE OR REPLACE FUNCTION api\\.${name}\\(\\)[\\s\\S]*?AS (\\$fn\\$|\\$\\$)[\\s\\S]*?\\1;`))?.[0];
    assert.ok(definition, `${name} source must exist`);
    await db.exec(definition);
  }
  const migration = await readFile(path.join(root, 'supabase/migrations/20261030123304_provider_scope_preference.sql'), 'utf8');
  await db.exec(migration);
  await db.exec(migration); // Idempotent, including the targeted filter patch.
  const regression = await readFile(path.join(root, 'Base de donnée DLL et API/tests/test_provider_scope_preference.sql'), 'utf8');
  await db.exec(regression);
  await db.exec(`
    SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
    INSERT INTO public.object VALUES
      ('linked','HOT','Linked','published',false), ('unlinked','HOT','Unlinked','published',false),
      ('sandbox','HOT','Sandbox','published',true);
    INSERT INTO public.actor_object_role VALUES
      ('00000000-0000-4000-a000-000000000011','linked','00000000-0000-4000-a000-000000000001',NULL,NULL),
      ('00000000-0000-4000-a000-000000000013','sandbox','00000000-0000-4000-a000-000000000001',NULL,NULL),
      ('00000000-0000-4000-a000-000000000012','linked','00000000-0000-4000-a000-000000000001',NULL,NULL);
    INSERT INTO public.crm_interaction (object_id,actor_id,status,occurred_at) VALUES
      ('linked',NULL,'new',now()),
      (NULL,'00000000-0000-4000-a000-000000000011','new',now()),
      ('unlinked','00000000-0000-4000-a000-000000000011','new',now()),
      (NULL,'00000000-0000-4000-a000-000000000099','new',now()),
      ('sandbox',NULL,'new',now()),
      ('linked',NULL,'closed',now());
    INSERT INTO public.crm_task (object_id,status) VALUES
      ('linked','todo'),('unlinked','todo'),('sandbox','todo'),('linked','canceled');
    INSERT INTO public.object_version VALUES
      ('linked','00000000-0000-4000-a000-000000000021','insert',now()),
      ('linked','00000000-0000-4000-a000-000000000021','update',now()),
      ('unlinked','00000000-0000-4000-a000-000000000022','update',now()),
      ('sandbox','00000000-0000-4000-a000-000000000022','update',now()),
      ('linked',NULL,'update',now());
  `);
  const scalar = async (sql) => (await db.query(sql)).rows[0].value;
  const card = await scalar('SELECT api.get_dashboard_provider_crm_open() AS value');
  assert.equal(card.open_interactions, 2, 'Keep object and actor-only interactions once; explicit unlinked object wins over its actor');
  assert.equal(card.open_tasks, 1, 'Exclude unlinked, sandbox and canceled tasks');
  assert.equal(card.total, 3);
  assert.equal(card.recent_interactions + card.backlog_interactions, card.open_interactions);
  const crm = await scalar('SELECT api.get_dashboard_provider_crm_activity() AS value');
  assert.equal(crm.open_by_age.reduce((n,r) => n+r.count,0), 2);
  assert.equal(crm.open_by_topic.reduce((n,r) => n+r.count,0), 2);
  assert.equal(crm.monthly_flow.reduce((n,r) => n+r.created,0), 3);
  const team = await scalar('SELECT api.get_dashboard_provider_team_activity() AS value');
  assert.equal(team.weeks.length, 12);
  assert.equal(team.weeks.reduce((n,r) => n+r.editor_days,0), 1, 'Multiple versions still count one editor-day');
  assert.equal(team.contributors.length, 1, 'Exclude unlinked, test-realm and unattributed work');
  const global = await scalar('SELECT api.get_dashboard_crm_open() AS value');
  assert.equal(global.open_interactions, 5, 'The existing global RPC remains unchanged');
  await db.exec(`
    INSERT INTO public.crm_interaction (id,object_id,status,occurred_at,resolved_at) VALUES
      ('00000000-0000-4000-a000-000000000031','linked','resolved',now()-interval '14 days',now()),
      ('00000000-0000-4000-a000-000000000032','unlinked','resolved',now()-interval '1 day',now());
    INSERT INTO public.crm_interaction_status_event VALUES
      ('00000000-0000-4000-a000-000000000031',NULL,'new',now()-interval '14 days'),
      ('00000000-0000-4000-a000-000000000031','new','awaiting_provider',now()-interval '10 days'),
      ('00000000-0000-4000-a000-000000000031','awaiting_provider','in_progress',now()-interval '3 days'),
      ('00000000-0000-4000-a000-000000000031','in_progress','resolved',now()),
      ('00000000-0000-4000-a000-000000000032',NULL,'new',now()-interval '1 day'),
      ('00000000-0000-4000-a000-000000000032','new','resolved',now());
  `);
  const net = (await scalar('SELECT api.get_dashboard_provider_crm_activity() AS value')).net;
  assert.equal(net.count, 1, 'Net treatment time excludes unlinked objects');
  assert.equal(Number(net.avg_days), 7, 'Fourteen elapsed days minus seven waiting days');
  await db.exec(`SELECT set_config('request.jwt.claims', '{"role":"service_role","sandbox":true}', false);`);
  const sandbox = await scalar('SELECT api.get_dashboard_provider_crm_open() AS value');
  assert.equal(sandbox.open_interactions, 1, 'Realm isolation works in both directions');
  assert.equal(sandbox.open_tasks, 1);
  console.log('Provider scope: migration replay, filter dates/deduplication, preference/RLS, CRM anchoring, tasks, team activity and both realms passed.');
} finally { await db.close(); }
