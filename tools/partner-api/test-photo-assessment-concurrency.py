"""Real per-actor photo-analysis quota across two different objects, disposable only."""
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
guard = (root / "Base de donnée DLL et API/tests/assert_partner_api_ephemeral.sql").read_text(encoding="utf-8") + "\n"
env = dict(os.environ, PGOPTIONS="-c bertel.ephemeral_ci=on")
command = ["psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "--dbname", db_url]


def sql(source):
    result = subprocess.run(command, input=guard + source, text=True, capture_output=True, env=env, timeout=20)
    if result.returncode:
        raise RuntimeError(result.stderr.strip())
    return result.stdout.strip()


def fixture(name):
    result = subprocess.run(command + ["-f", str(root / "Base de donnée DLL et API/tests" / name)],
                            text=True, capture_output=True, env=env, timeout=30)
    if result.returncode:
        raise RuntimeError(result.stderr.strip())


def prefix(name):
    return (guard + "BEGIN; SET application_name='" + name + "'; SET LOCAL statement_timeout='12s';\n"
            "SELECT set_config('request.jwt.claims','{\"sub\":\"00000000-0000-4000-a000-00000000c511\","
            "\"role\":\"authenticated\"}',true); SET LOCAL ROLE authenticated;\n")


def verify_scope_after_wait():
    """Revoke the registered actor while a real caller waits on the object lock."""
    holding = attempting = None
    revoked = False
    try:
        holding = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                   stderr=subprocess.PIPE, text=True, env=env, bufsize=1)
        observed = queue.Queue()
        threading.Thread(target=lambda stream=holding.stdout: [observed.put(line.strip()) for line in stream], daemon=True).start()
        holding.stdin.write(guard + "BEGIN; SET application_name='bertel_photo_analysis_scope_holder';"
                            "SELECT 1 FROM public.object WHERE id='HOTRUN999999C502' FOR UPDATE; SELECT 'LOCK_HELD';\n")
        holding.stdin.flush()
        deadline = time.monotonic() + 10
        while observed.get(timeout=max(0.1, deadline - time.monotonic())) != "LOCK_HELD":
            if time.monotonic() >= deadline:
                raise RuntimeError("Scope test did not obtain the object lock")
        attempting = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                      stderr=subprocess.PIPE, text=True, env=env)
        attempting.stdin.write(prefix("bertel_photo_analysis_scope_waiter")
                               + "DO $$ DECLARE refused boolean:=false;BEGIN BEGIN PERFORM api.start_portal_photo_analysis("
                               "'00000000-0000-4000-af00-000000000111','00000000-0000-4000-af00-000000000141');"
                               "EXCEPTION WHEN insufficient_privilege THEN refused:=true;END;"
                               "ASSERT refused,'Revoked actor passed dispatch authorization after the lock wait';END $$;ROLLBACK;\n")
        attempting.stdin.close()
        waiting = False
        deadline = time.monotonic() + 4
        while time.monotonic() < deadline:
            if sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='bertel_photo_analysis_scope_waiter' AND wait_event_type='Lock');") == "t":
                waiting = True
                break
            time.sleep(0.05)
        if not waiting:
            raise RuntimeError("Dispatch caller was not observed waiting on the object")
        sql("UPDATE public.app_user_profile SET actor_id=NULL WHERE id='00000000-0000-4000-a000-00000000c511';")
        revoked = True
        holding.stdin.write("COMMIT;\n")
        holding.stdin.close()
        if holding.wait(timeout=15):
            raise RuntimeError(holding.stderr.read())
        if attempting.wait(timeout=15):
            raise RuntimeError(attempting.stderr.read())
        sql("DO $$ BEGIN ASSERT EXISTS(SELECT 1 FROM internal.portal_photo_analysis WHERE id='00000000-0000-4000-af00-000000000111' AND state='reserved' AND started_at IS NULL AND claim_id IS NULL);END $$;")
        print("Photo dispatch after a real object wait: revoked actor refused; no provider attempt marked")
    finally:
        for process in (attempting, holding):
            if process is not None and process.poll() is None:
                process.terminate()
                process.wait(timeout=5)
        if revoked:
            sql("SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',false);UPDATE public.app_user_profile SET actor_id='00000000-0000-4000-a000-00000000c521' WHERE id='00000000-0000-4000-a000-00000000c511';")


fixture("setup_partner_photo_stock.sql")
prepared = False
a = b = None
try:
    fixture("setup_partner_photo_assessment_concurrency.sql")
    prepared = True
    a = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                         stderr=subprocess.PIPE, text=True, env=env, bufsize=1)
    lines = queue.Queue()
    threading.Thread(target=lambda: [lines.put(line.strip()) for line in a.stdout], daemon=True).start()
    a.stdin.write(prefix("bertel_photo_analysis_race_a") + "SELECT api.reserve_portal_photo_analysis("
                  "'HOTRUN999999C502','00000000-0000-4000-af00-000000000101','00000000-0000-4000-af00-000000000111');\nSELECT 'LOCK_HELD';\n")
    a.stdin.flush()
    deadline = time.monotonic() + 10
    while lines.get(timeout=max(0.1, deadline - time.monotonic())) != "LOCK_HELD":
        if time.monotonic() >= deadline:
            raise RuntimeError("First analysis did not reserve its actor budget")
    b = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                         stderr=subprocess.PIPE, text=True, env=env)
    b.stdin.write(prefix("bertel_photo_analysis_race_b") + "DO $$ DECLARE r jsonb; BEGIN r:=api.reserve_portal_photo_analysis("
                  "'HOTRUN999999C501','00000000-0000-4000-af00-000000000102','00000000-0000-4000-af00-000000000112');"
                  "ASSERT r->>'state'='quota_reached','Second object bypassed the shared actor analysis budget'; END $$; ROLLBACK;\n")
    b.stdin.close()
    waiting = False
    deadline = time.monotonic() + 4
    while time.monotonic() < deadline:
        if sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='bertel_photo_analysis_race_b' AND wait_event='advisory');") == "t":
            waiting = True
            break
        time.sleep(0.05)
    if not waiting:
        raise RuntimeError("Second object was not observed waiting on the actor analysis advisory lock")
    a.stdin.write("COMMIT;\n")
    a.stdin.close()
    if a.wait(timeout=15):
        raise RuntimeError(a.stderr.read())
    if b.wait(timeout=15):
        raise RuntimeError(b.stderr.read())
    sql("""DO $$ BEGIN
      ASSERT (SELECT count(*) FROM internal.portal_photo_analysis WHERE actor_id='00000000-0000-4000-a000-00000000c521')=1;
      ASSERT NOT EXISTS(SELECT 1 FROM internal.portal_photo_analysis WHERE id='00000000-0000-4000-af00-000000000112');
      ASSERT internal.gallery_photo_usage('HOTRUN999999C501')=20;
      ASSERT internal.gallery_photo_usage('HOTRUN999999C502')=1;
    END $$;""")
    print("Photo analysis across two objects: real actor advisory wait observed; one budget reservation, both private uploads retained")
    verify_scope_after_wait()
finally:
    for process in (b, a):
        if process is not None and process.poll() is None:
            process.terminate()
            process.wait(timeout=5)
    if prepared:
        fixture("cleanup_partner_photo_assessment_concurrency.sql")
    fixture("cleanup_partner_photo_stock.sql")
