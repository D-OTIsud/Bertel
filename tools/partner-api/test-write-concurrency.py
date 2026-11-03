"""Two real connections, deterministic lock contention, disposable Supabase only."""
import os
from pathlib import Path
import queue
import subprocess
import sys
import threading
import time
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


def sql(source):
    result = subprocess.run(command, input=source, text=True, capture_output=True,
                            env=env, timeout=20)
    if result.returncode:
        raise RuntimeError(result.stderr.strip())
    return result.stdout.strip()


guard = (root / "Base de donnée DLL et API/tests/assert_partner_api_ephemeral.sql").read_text(encoding="utf-8")
user = "00000000-0000-4000-a000-00000000d401"
claims = '{"sub":"' + user + '","role":"authenticated"}'
setup = """
BEGIN;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO auth.users(id,email) VALUES('00000000-0000-4000-a000-00000000d401','concurrency@example.test');
INSERT INTO public.app_user_profile(id,role) VALUES('00000000-0000-4000-a000-00000000d401','super_admin')
 ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role;
INSERT INTO public.object(id,object_type,name,status,is_test) VALUES
 ('HOTRUN999999D401','HOT','Stay concurrent fixture','published',true),
 ('RESRUN999999D402','RES','Menu concurrent fixture','published',true);
INSERT INTO public.object_stay_policy(object_id,check_in_from,conditions)
 VALUES('HOTRUN999999D401','14:00:30','Preserve office conditions');
INSERT INTO public.object_menu(id,object_id,name,is_active,visibility) VALUES
 ('00000000-0000-4000-a000-00000000d402','RESRUN999999D402','Carte',true,'public');
INSERT INTO public.object_menu_item(id,menu_id,name,price,currency) VALUES
 ('00000000-0000-4000-a000-00000000d403','00000000-0000-4000-a000-00000000d402','Cari',18,'EUR');
CREATE TABLE internal.partner_write_concurrency_baseline(domain text PRIMARY KEY, snapshot jsonb NOT NULL);
REVOKE ALL ON internal.partner_write_concurrency_baseline FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO internal.partner_write_concurrency_baseline VALUES
 ('stay',internal.stay_policy_snapshot('HOTRUN999999D401')),
 ('menus',internal.object_menu_write_snapshot('RESRUN999999D402')->'items'->0);
COMMIT;
"""
cleanup = """
BEGIN;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DELETE FROM public.object WHERE id IN ('HOTRUN999999D401','RESRUN999999D402');
DELETE FROM auth.users WHERE id='00000000-0000-4000-a000-00000000d401';
DROP TABLE internal.partner_write_concurrency_baseline;
COMMIT;
"""


def write_call(domain, value):
    expected = "current_setting('ci.concurrent_expected')::jsonb"
    if domain == "stay":
        return ("api.save_object_capacity_policies('HOTRUN999999D401',jsonb_build_object('stay_policy',"
                "jsonb_build_object('write_contract','stay-policy-patch-v1','expected'," + expected +
                ",'changes',jsonb_build_object('check_in_from','" + value + "'))))")
    return ("api.save_object_menus('RESRUN999999D402',jsonb_build_object("
            "'write_contract','menus-reconcile-v1','request_id',gen_random_uuid(),'menus','[]'::jsonb,'deleted_menus','[]'::jsonb,"
            "'deleted_items','[]'::jsonb,'items',jsonb_build_array(jsonb_build_object("
            "'id','00000000-0000-4000-a000-00000000d403','menu_id','00000000-0000-4000-a000-00000000d402',"
            "'expected'," + expected + ",'changes',jsonb_build_object('price'," + value + "),'links','{}'::jsonb))))")


def session_prefix(domain, name):
    return ("BEGIN; SET application_name='" + name + "';\n"
            "SELECT set_config('request.jwt.claims','" + claims + "',true);\n"
            "SELECT set_config('ci.concurrent_expected',(SELECT snapshot::text FROM "
            "internal.partner_write_concurrency_baseline WHERE domain='" + domain + "'),true);\n"
            "SET LOCAL ROLE authenticated;\n")


def assert_conflict(domain, first, stale):
    a = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                         stderr=subprocess.PIPE, text=True, env=env, bufsize=1)
    lines = queue.Queue()
    threading.Thread(target=lambda: [lines.put(line.strip()) for line in a.stdout], daemon=True).start()
    b = None
    try:
        a.stdin.write(session_prefix(domain, "bertel_concurrency_a"))
        a.stdin.write("SELECT " + write_call(domain, first) + ";\nSELECT 'LOCK_HELD';\n")
        a.stdin.flush()
        deadline = time.monotonic() + 10
        while lines.get(timeout=max(0.1, deadline - time.monotonic())) != "LOCK_HELD":
            if time.monotonic() >= deadline:
                raise RuntimeError("First writer did not acquire the domain lock")
        b = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE, text=True, env=env)
        b.stdin.write(session_prefix(domain, "bertel_concurrency_b"))
        b.stdin.write("DO $test$ DECLARE rejected boolean:=false; BEGIN BEGIN PERFORM "
                      + write_call(domain, stale) + "; EXCEPTION WHEN SQLSTATE 'PT409' THEN rejected:=true; END;"
                      " ASSERT rejected,'Concurrent stale edit must conflict'; END $test$;\nROLLBACK;\n")
        b.stdin.close()
        # Prove B really waited on A; scheduling two sequential calls is insufficient.
        blocked = False
        deadline = time.monotonic() + 4
        while time.monotonic() < deadline:
            if sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='bertel_concurrency_b' AND wait_event_type='Lock');") == "t":
                blocked = True
                break
            time.sleep(0.05)
        if not blocked:
            raise RuntimeError("Second writer was not observed waiting on the first")
        a.stdin.write("COMMIT;\n")
        a.stdin.close()
        if a.wait(timeout=10):
            raise RuntimeError(a.stderr.read())
        if b.wait(timeout=10):
            raise RuntimeError(b.stderr.read())
        print(domain + ": lock contention observed, stale concurrent change rejected")
    finally:
        for process in (b, a):
            if process is not None and process.poll() is None:
                process.terminate()
                process.wait(timeout=5)


sql(guard)
sql(setup)
try:
    assert_conflict("stay", "15:00", "16:00")
    assert_conflict("menus", "19", "20")
    sql("""DO $$ BEGIN
      ASSERT (SELECT check_in_from='15:00'::time AND conditions='Preserve office conditions'
        FROM public.object_stay_policy WHERE object_id='HOTRUN999999D401');
      ASSERT (SELECT price=19 AND currency='EUR' AND name='Cari'
        FROM public.object_menu_item WHERE id='00000000-0000-4000-a000-00000000d403');
    END $$;""")
finally:
    sql(guard + cleanup)
