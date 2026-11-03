"""Office writers versus proposal approval: stale-state rejection and consistent lock order."""
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
guard = (root / "Base de donnée DLL et API/tests/assert_partner_api_ephemeral.sql").read_text(encoding="utf-8")
claims = '{"sub":"00000000-0000-4000-a000-00000000d601","role":"authenticated","app_metadata":{"sandbox_discovery":true}}'


def sql(source):
    result = subprocess.run(command, input=source, text=True, capture_output=True, env=env, timeout=30)
    if result.returncode:
        raise RuntimeError(result.stderr.strip())
    return result.stdout.strip()


def prefix(name):
    return ("BEGIN; SET application_name='" + name + "'; SET LOCAL statement_timeout='12s';\n"
            "SELECT set_config('request.jwt.claims','" + claims + "',true);\nSET LOCAL ROLE authenticated;\n")


def race(label, first_sql, second_sql, child_table=None):
    a = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                         stderr=subprocess.PIPE, text=True, env=env, bufsize=1)
    lines = queue.Queue()
    threading.Thread(target=lambda: [lines.put(line.strip()) for line in a.stdout], daemon=True).start()
    b = None
    try:
        a.stdin.write(prefix("bertel_collection_a") + first_sql + "\nSELECT 'LOCK_HELD';\n")
        a.stdin.flush()
        deadline = time.monotonic() + 10
        while lines.get(timeout=max(0.1, deadline - time.monotonic())) != "LOCK_HELD":
            if time.monotonic() >= deadline:
                raise RuntimeError("First collection writer did not acquire its lock")
        b = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE, text=True, env=env)
        b.stdin.write(prefix("bertel_collection_b") + second_sql + "\nCOMMIT;\n")
        b.stdin.close()
        blocked = False
        deadline = time.monotonic() + 4
        while time.monotonic() < deadline:
            if sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='bertel_collection_b' AND wait_event_type='Lock');") == "t":
                blocked = True
                break
            time.sleep(0.05)
        if not blocked:
            raise RuntimeError("The second collection writer was not observed waiting")
        if child_table:
            # An old child-first writer would already hold this DML relation lock,
            # even if its DELETE has not completed. The corrected writer waits on object first.
            attempted_child_dml = sql("SELECT EXISTS(SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid "
                                     "WHERE a.application_name='bertel_collection_b' AND l.mode='RowExclusiveLock' "
                                     "AND l.relation='public." + child_table + "'::regclass);")
            assert attempted_child_dml == "f", "Office writer entered child DML before acquiring the object lock"
        a.stdin.write("COMMIT;\n")
        a.stdin.close()
        if a.wait(timeout=15):
            raise RuntimeError(a.stderr.read())
        if b.wait(timeout=15):
            raise RuntimeError(b.stderr.read())
        print(label + ": contention observed, expected outcome confirmed")
    finally:
        for process in (b, a):
            if process is not None and process.poll() is None:
                process.terminate()
                process.wait(timeout=5)


setup = """
BEGIN;
INSERT INTO auth.users(id,email) VALUES('00000000-0000-4000-a000-00000000d601','collection-race@example.test');
INSERT INTO public.app_user_profile(id,role) VALUES('00000000-0000-4000-a000-00000000d601','super_admin')
 ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role;
INSERT INTO public.object(id,object_type,name,status,is_test) VALUES
 ('HOTRUN999999D601','HOT','Collection concurrency equipment','published',true),
 ('HOTRUN999999D602','HOT','Collection concurrency opening','published',true);
COMMIT;
"""
cleanup = """
BEGIN;
DELETE FROM public.pending_change WHERE object_id IN('HOTRUN999999D601','HOTRUN999999D602');
DELETE FROM public.object WHERE id IN('HOTRUN999999D601','HOTRUN999999D602');
DELETE FROM auth.users WHERE id='00000000-0000-4000-a000-00000000d601';
COMMIT;
"""
domains = [
    ("characteristics", "HOTRUN999999D601", "save_object_commercial", "object_payment_method",
     "'{\"languages\":[],\"payment_methods\":[],\"environment_tags\":[],\"amenities\":[]}'::jsonb",
     "jsonb_build_object('payment_methods',jsonb_build_array(jsonb_build_object('payment_method_id',(SELECT id FROM public.ref_code_payment_method ORDER BY id LIMIT 1))))"),
    ("openings", "HOTRUN999999D602", "save_object_openings", "opening_period",
     "'{\"periods\":[]}'::jsonb", "'{\"periods\":[{\"name\":\"Office corrected\",\"schedules\":[]}]}'::jsonb"),
]
sql(guard + setup)
try:
    for domain, object_id, rpc, table, empty, change in domains:
        def proposal():
            result = sql(prefix("bertel_collection_setup") + "SELECT api.submit_pending_change('" + object_id
                         + "','" + table + "',NULL,'update'," + empty + ",jsonb_build_object('rpc','" + rpc
                         + "','section','" + domain + "','collection_baseline',api.get_object_proposal_baseline('"
                         + object_id + "','" + domain + "'))); COMMIT;")
            return result.splitlines()[-1]

        pending = proposal()
        writer = "SELECT api." + rpc + "('" + object_id + "'," + change + ");"
        stale = ("DO $$ DECLARE rejected boolean:=false; BEGIN BEGIN PERFORM api.approve_pending_change('"
                 + pending + "',NULL,false); EXCEPTION WHEN SQLSTATE 'PT412' THEN rejected:=true; END;"
                 "ASSERT rejected,'Stale proposal overwrote an office correction'; END $$;")
        race(domain + " office then stale approval", writer, stale)
        sql("DO $$ BEGIN ASSERT (SELECT status='pending' FROM public.pending_change WHERE id='" + pending + "'); END $$;")
        fresh = proposal()
        race(domain + " approval then office writer", "SELECT api.approve_pending_change('" + fresh + "',NULL,false);", writer, table)
        sql("DO $$ BEGIN ASSERT EXISTS(SELECT 1 FROM public." + table + " WHERE object_id='" + object_id + "'); END $$;")
finally:
    sql(guard + cleanup)
