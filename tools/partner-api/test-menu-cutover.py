"""Run the actual M cutover/preparation files, disposable localhost Supabase only."""
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlparse


db_url = sys.argv[1] if len(sys.argv) == 2 else ""
target = urlparse(db_url)
if (target.scheme != "postgresql" or target.hostname not in ("127.0.0.1", "localhost")
        or target.port != 54322 or target.path != "/postgres" or target.username != "postgres"
        or target.password != "postgres" or target.query or target.fragment):
    raise SystemExit("Only the disposable localhost:54322/postgres database is accepted")

root = Path(__file__).resolve().parents[2]
env = dict(os.environ, PGOPTIONS="-c bertel.ephemeral_ci=on")
command = ["psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "--dbname", db_url]
guard = (root / "Base de donnée DLL et API/tests/assert_partner_api_ephemeral.sql").read_text(encoding="utf-8")
preparation = (root / "supabase/migrations/20261103082027_portal_menus_guarded_publication.sql").read_text(encoding="utf-8")
r4_cutover = (root / "supabase/cutovers/object_menus_atomic_reconcile.sql").read_text(encoding="utf-8")
m_cutover = (root / "supabase/cutovers/portal_menus_guarded_publication.sql").read_text(encoding="utf-8")


def sql(source, expected_error=None):
    # Every invocation independently verifies both disposable bootstrap and local flag.
    result = subprocess.run(command, input=guard + "\n" + source, text=True,
                            capture_output=True, env=env, timeout=30)
    if expected_error is not None:
        if result.returncode == 0 or expected_error not in result.stderr:
            raise RuntimeError("Expected guarded rejection was not observed: " + expected_error)
    elif result.returncode:
        raise RuntimeError(result.stderr.strip())
    return result.stdout.strip()


off = """
DO $$ BEGIN
 ASSERT (SELECT enabled=false FROM internal.portal_menu_write_configuration WHERE singleton),'M must start OFF';
 ASSERT NOT has_function_privilege('authenticated','api.publish_portal_menus(text,jsonb,uuid)','EXECUTE');
 ASSERT NOT has_function_privilege('authenticated','api.get_portal_menus_snapshot(text)','EXECUTE');
 ASSERT NOT has_function_privilege('authenticated','api.get_portal_menu_write_receipt(text,jsonb)','EXECUTE');
END $$;
"""
closed_dml = """
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['object_menu','object_menu_item','object_menu_item_media',
   'object_menu_item_dietary_tag','object_menu_item_allergen','object_menu_item_cuisine_type'] LOOP
  ASSERT NOT has_table_privilege('authenticated','public.'||t,'INSERT,UPDATE,DELETE'),t||' DML reopened';
  ASSERT NOT has_any_column_privilege('authenticated','public.'||t,'INSERT,UPDATE'),t||' column DML reopened';
 END LOOP;
END $$;
"""
active = """
DO $$ DECLARE f text; BEGIN
 ASSERT (SELECT enabled FROM internal.portal_menu_write_configuration WHERE singleton),'M cutover did not enable configuration';
 FOREACH f IN ARRAY ARRAY['api.publish_portal_menus(text,jsonb,uuid)',
   'api.get_portal_menus_snapshot(text)','api.get_portal_menu_write_receipt(text,jsonb)'] LOOP
  ASSERT has_function_privilege('authenticated',f,'EXECUTE'),f||' was not granted';
  ASSERT NOT has_function_privilege('anon',f,'EXECUTE'),f||' was granted to anon/PUBLIC';
 END LOOP;
 ASSERT NOT has_function_privilege('authenticated','internal.apply_object_menus_patch(text,jsonb)','EXECUTE');
END $$;
"""
deactivate = """
BEGIN;
UPDATE internal.portal_menu_write_configuration SET enabled=false WHERE singleton;
REVOKE EXECUTE ON FUNCTION api.publish_portal_menus(text,jsonb,uuid),
 api.get_portal_menus_snapshot(text),api.get_portal_menu_write_receipt(text,jsonb) FROM authenticated;
COMMIT;
"""


def cutover_rejects_definition_drift(signature, transform):
    original = sql("SELECT pg_get_functiondef('" + signature + "'::regprocedure);")
    try:
        sql(transform(original))
        sql(preparation, "M preparation source/attributes drift: " + signature)
        sql(m_cutover, "M cutover source/attributes drift: " + signature)
        sql(off + closed_dml)
    finally:
        sql(original)


def change_publication_body(original):
    if original.count("\nBEGIN\n") != 1:
        raise RuntimeError("Unexpected publication façade shape in drift fixture")
    return original.replace("\nBEGIN\n", "\nBEGIN\n  -- m-cutover-publication-drift fixture\n", 1)


def change_publication_default(original):
    expected = "p_extraction_operation_id uuid DEFAULT NULL::uuid"
    if original.count(expected) != 1:
        raise RuntimeError("Unexpected publication default in drift fixture")
    return original.replace(expected,
                            "p_extraction_operation_id uuid DEFAULT '10000000-0000-4000-8000-000000000001'::uuid", 1)


# No outer BEGIN: both real cutover files own and COMMIT their transactions.
sql(off)
original_definition = None
try:
    sql(r4_cutover)
    sql(closed_dml)
    # A later code, configuration or privilege change cannot bypass preparation's proof.
    cutover_rejects_definition_drift("api.publish_portal_menus(text,jsonb,uuid)", change_publication_body)
    cutover_rejects_definition_drift("api.publish_portal_menus(text,jsonb,uuid)", change_publication_default)
    publication_definition = sql("SELECT pg_get_functiondef('api.publish_portal_menus(text,jsonb,uuid)'::regprocedure);")
    try:
        sql("ALTER FUNCTION api.publish_portal_menus(text,jsonb,uuid) SET lock_timeout='10s';")
        sql(m_cutover, "M cutover source/attributes drift: api.publish_portal_menus(text,jsonb,uuid)")
        sql(off + closed_dml)
    finally:
        sql(publication_definition)
    try:
        sql("GRANT EXECUTE ON FUNCTION internal.apply_object_menus_patch(text,jsonb) TO authenticated;")
        sql(m_cutover, "M cutover ACL drift: internal.apply_object_menus_patch(text,jsonb)")
        sql(off + closed_dml)
    finally:
        sql("REVOKE EXECUTE ON FUNCTION internal.apply_object_menus_patch(text,jsonb) FROM authenticated;")
    sql(m_cutover)
    sql(active + closed_dml)
    # Repeating an exact activation also checks all nine sources/attributes/ACL.
    sql(m_cutover)
    sql(active + closed_dml)
    sql(preparation, "Do not replay M preparation after activation")
    sql(active + closed_dml)
    sql(deactivate)
    sql(off + closed_dml)
    # The exact, still-closed preparation may be replayed without reopening table DML.
    sql(preparation)
    sql(off + closed_dml)

    original_definition = sql("SELECT pg_get_functiondef('api.save_object_menus(text,jsonb)'::regprocedure);")
    if original_definition.count("\nBEGIN\n") != 1:
        raise RuntimeError("Unexpected office façade shape in drift fixture")
    changed = original_definition.replace("\nBEGIN\n", "\nBEGIN\n  -- m-cutover-source-drift fixture\n", 1)
    sql(changed)
    sql(preparation, "M refuses unexpected R4 writer source/attributes")
    sql(original_definition)
    original_definition = None
    sql(off + closed_dml)
finally:
    if original_definition is not None:
        sql(original_definition)
    sql(deactivate)
    sql(off + closed_dml)

print("PASS M real cutover, OFF restoration, activation source/attribute/ACL guards and exact replay")
