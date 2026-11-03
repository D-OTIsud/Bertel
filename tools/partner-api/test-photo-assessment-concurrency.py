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


def stop(process):
    if process is not None and process.poll() is None:
        process.terminate()
        process.wait(timeout=5)


def finish(process, timeout=15):
    if process.wait(timeout=timeout):
        raise RuntimeError(process.stderr.read())


def hold_fixture_object(object_id, name, document_id=None):
    holding = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, text=True, env=env, bufsize=1)
    observed = queue.Queue()
    threading.Thread(target=lambda stream=holding.stdout: [observed.put(line.strip()) for line in stream], daemon=True).start()
    source = guard + "BEGIN; SET application_name='" + name + "'; SELECT 1 FROM public.object WHERE id='" + object_id + "' FOR UPDATE;"
    if document_id:
        source += "SELECT 1 FROM public.ref_document WHERE id='" + document_id + "' FOR UPDATE;"
    holding.stdin.write(source + "SELECT 'LOCK_HELD';\n")
    holding.stdin.flush()
    deadline = time.monotonic() + 10
    try:
        while observed.get(timeout=max(0.1, deadline - time.monotonic())) != "LOCK_HELD":
            if time.monotonic() >= deadline:
                raise RuntimeError("Fixture holder did not acquire its locks")
        return holding
    except BaseException:
        stop(holding)
        raise


def verify_scope_after_wait(kind):
    """B has object/library rights, but cannot use the receipt bound to A's path."""
    object_id = "HOTRUN999999C501" if kind == "reserve" else "HOTRUN999999C502"
    document_id = "00000000-0000-4000-af00-000000000102" if kind == "reserve" else "00000000-0000-4000-af00-000000000101"
    calls = {
        "reserve": "api.reserve_portal_photo_analysis('HOTRUN999999C501','00000000-0000-4000-af00-000000000102','00000000-0000-4000-af00-000000000112')",
        "start": "api.start_portal_photo_analysis('00000000-0000-4000-af00-000000000111','00000000-0000-4000-af00-000000000141')",
        "appeal": "api.appeal_portal_photo_analysis('00000000-0000-4000-af00-000000000111','Concurrency scope appeal','00000000-0000-4000-af00-000000000151')",
    }
    name = "bertel_photo_scope_waiter_" + kind
    holding = attempting = None
    switched = False
    try:
        sql("INSERT INTO public.actor_object_role(actor_id,object_id,role_id,is_primary) SELECT '00000000-0000-4000-a000-00000000c523','" + object_id + "',id,true FROM public.ref_actor_role WHERE code='operator' ON CONFLICT DO NOTHING;"
            "INSERT INTO public.actor_document(actor_id,document_id,created_by,title) VALUES('00000000-0000-4000-a000-00000000c523','" + document_id + "','00000000-0000-4000-a000-00000000c511','Shared identity-switch fixture') ON CONFLICT DO NOTHING;")
        holding = hold_fixture_object(object_id, "bertel_photo_scope_holder")
        attempting = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
        attempting.stdin.write(prefix(name) + "DO $$ DECLARE refused boolean:=false;BEGIN BEGIN PERFORM " + calls[kind]
                               + ";EXCEPTION WHEN insufficient_privilege THEN refused:=true;END;ASSERT refused,'Actor B used a receipt bound to A after waiting';END $$;COMMIT;\n")
        attempting.stdin.close()
        deadline = time.monotonic() + 4
        while sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='" + name + "' AND wait_event_type='Lock');") != "t":
            if time.monotonic() >= deadline:
                raise RuntimeError(kind + " was not observed waiting on the object")
            time.sleep(0.05)
        sql("SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',false);UPDATE public.app_user_profile SET actor_id='00000000-0000-4000-a000-00000000c523' WHERE id='00000000-0000-4000-a000-00000000c511';")
        switched = True
        sql(prefix("bertel_photo_scope_positive") + "DO $$ BEGIN ASSERT EXISTS(SELECT 1 FROM api.current_user_portal_object_ids() id WHERE id='" + object_id + "'),'Actor B lacks the positive-control object right';END $$;COMMIT;")
        holding.stdin.write("COMMIT;\n")
        holding.stdin.close()
        finish(holding)
        finish(attempting)
        sql("DO $$ BEGIN ASSERT NOT EXISTS(SELECT 1 FROM internal.portal_photo_analysis WHERE id='00000000-0000-4000-af00-000000000112');"
            "ASSERT NOT EXISTS(SELECT 1 FROM internal.portal_photo_analysis WHERE id='00000000-0000-4000-af00-000000000111' AND appeal_interaction_id IS NOT NULL);END $$;")
        if kind != "appeal":
            sql("DO $$ BEGIN ASSERT EXISTS(SELECT 1 FROM internal.portal_photo_analysis WHERE id='00000000-0000-4000-af00-000000000111' AND state='reserved' AND started_at IS NULL AND claim_id IS NULL);END $$;")
        print("Photo " + kind + ": real object wait, A-to-B switch refused despite B object/library rights, waiter committed")
    finally:
        stop(attempting)
        stop(holding)
        if switched:
            sql("SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',false);UPDATE public.app_user_profile SET actor_id='00000000-0000-4000-a000-00000000c521' WHERE id='00000000-0000-4000-a000-00000000c511';")


def verify_off_without_object_wait():
    holding = attempting = None
    try:
        holding = hold_fixture_object("HOTRUN999999C502", "bertel_photo_off_holder")
        sql("UPDATE internal.portal_photo_analysis_settings SET enabled=false;")
        attempting = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
        attempting.stdin.write(prefix("bertel_photo_off_caller") + "DO $$ DECLARE r jsonb;BEGIN r:=api.reserve_portal_photo_analysis('HOTRUN999999C502','00000000-0000-4000-af00-000000000101','00000000-0000-4000-af00-000000000111');"
                               "ASSERT r->>'enabled'='false' AND r->>'created'='false' AND NOT(r ? 'operation') AND NOT(r ? 'context'),'OFF leaked a previous dispatch context';END $$;COMMIT;\n")
        attempting.stdin.close()
        finish(attempting, timeout=3)
        sql("DO $$ BEGIN ASSERT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='bertel_photo_off_holder' AND state='idle in transaction');"
            "ASSERT EXISTS(SELECT 1 FROM internal.portal_photo_analysis WHERE id='00000000-0000-4000-af00-000000000111' AND state='reserved');END $$;")
        print("Photo OFF: existing reservation returned no context without waiting on a held object; waiter committed")
    finally:
        stop(attempting)
        stop(holding)
        sql("UPDATE internal.portal_photo_analysis_settings SET enabled=true;")


def verify_paid_finish_without_parent_wait():
    holding = completing = None
    try:
        sql(prefix("bertel_photo_finish_start") + "DO $$ DECLARE r jsonb;BEGIN r:=api.start_portal_photo_analysis('00000000-0000-4000-af00-000000000111','00000000-0000-4000-af00-000000000141');ASSERT r->>'started'='true';END $$;COMMIT;")
        holding = hold_fixture_object("HOTRUN999999C502", "bertel_photo_finish_holder", "00000000-0000-4000-af00-000000000101")
        completing = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
        completing.stdin.write(guard + "BEGIN;SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',true);SET LOCAL ROLE service_role;"
                              "DO $$ DECLARE r jsonb;BEGIN r:=api.finish_portal_photo_analysis('00000000-0000-4000-af00-000000000111','00000000-0000-4000-af00-000000000141',"
                              "'{\"state\":\"assessed\",\"assessment\":{\"score\":7,\"summary\":\"Concurrency fixture\",\"strengths\":[],\"issues\":[]},\"publication\":\"office_review\"}');"
                              "ASSERT r->>'state'='assessed' AND r->>'publication'='office_review';END $$;COMMIT;\n")
        completing.stdin.close()
        finish(completing, timeout=3)
        sql("DO $$ BEGIN ASSERT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='bertel_photo_finish_holder' AND state='idle in transaction');"
            "ASSERT EXISTS(SELECT 1 FROM internal.portal_photo_analysis WHERE id='00000000-0000-4000-af00-000000000111' AND state='assessed');END $$;")
        print("Photo paid finish: durable assessed result committed while object and document locks remain held")
    finally:
        stop(completing)
        stop(holding)


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
                  "ASSERT r->>'state'='quota_reached','Second object bypassed the shared actor analysis budget'; END $$; COMMIT;\n")
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
    verify_off_without_object_wait()
    verify_scope_after_wait("reserve")
    verify_scope_after_wait("start")
    verify_paid_finish_without_parent_wait()
    verify_scope_after_wait("appeal")
finally:
    for process in (b, a):
        if process is not None and process.poll() is None:
            process.terminate()
            process.wait(timeout=5)
    if prepared:
        fixture("cleanup_partner_photo_assessment_concurrency.sql")
    fixture("cleanup_partner_photo_stock.sql")
