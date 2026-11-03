"""Real actor/office races against the bounded photo stock, disposable Supabase only."""
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
    result = subprocess.run(command, input=source, text=True, capture_output=True, env=env, timeout=20)
    if result.returncode:
        raise RuntimeError(result.stderr.strip())
    return result.stdout.strip()


def fixture(name):
    result = subprocess.run(command + ["-f", str(root / "Base de donnée DLL et API/tests" / name)],
                            text=True, capture_output=True, env=env, timeout=30)
    if result.returncode:
        raise RuntimeError(result.stderr.strip())


actor = "00000000-0000-4000-a000-00000000c511"
office = "00000000-0000-4000-a000-00000000c512"


def prefix(user, name):
    return ("BEGIN; SET application_name='" + name + "'; SET LOCAL statement_timeout='12s';\n"
            "SELECT set_config('request.jwt.claims','{\"sub\":\"" + user
            + "\",\"role\":\"authenticated\",\"app_metadata\":{\"sandbox_discovery\":true}}',true);\n"
            "SET LOCAL ROLE authenticated;\n")


def denied(call):
    return ("DO $test$ DECLARE refused boolean:=false; BEGIN BEGIN PERFORM " + call
            + "; EXCEPTION WHEN SQLSTATE 'PT409' THEN refused:=true; END;"
            "ASSERT refused,'Concurrent photo stock request must be rejected'; END $test$;")


def race(name, first_user, first_call, second_call):
    a = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                         stderr=subprocess.PIPE, text=True, env=env, bufsize=1)
    lines = queue.Queue()
    threading.Thread(target=lambda: [lines.put(line.strip()) for line in a.stdout], daemon=True).start()
    b = None
    try:
        a.stdin.write(prefix(first_user, "bertel_photo_race_a") + "SELECT " + first_call + ";\nSELECT 'LOCK_HELD';\n")
        a.stdin.flush()
        deadline = time.monotonic() + 10
        while lines.get(timeout=max(0.1, deadline - time.monotonic())) != "LOCK_HELD":
            if time.monotonic() >= deadline:
                raise RuntimeError("First photo writer did not acquire its lock")
        b = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE, text=True, env=env)
        b.stdin.write(prefix(actor, "bertel_photo_race_b") + denied(second_call) + "\nROLLBACK;\n")
        b.stdin.close()
        blocked = False
        deadline = time.monotonic() + 4
        while time.monotonic() < deadline:
            if sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='bertel_photo_race_b' AND wait_event_type='Lock');") == "t":
                blocked = True
                break
            time.sleep(0.05)
        if not blocked:
            raise RuntimeError("The second photo writer was not observed waiting")
        a.stdin.write("COMMIT;\n")
        a.stdin.close()
        if a.wait(timeout=15):
            raise RuntimeError(a.stderr.read())
        if b.wait(timeout=15):
            raise RuntimeError(b.stderr.read())
        print(name + ": real lock contention observed; the second request was rejected")
    finally:
        for process in (b, a):
            if process is not None and process.poll() is None:
                process.terminate()
                process.wait(timeout=5)


reserve_a = "api.reserve_portal_photo_upload('HOTRUN999999C501','00000000-0000-4000-a000-00000000c531',NULL)"
reserve_b = "api.reserve_portal_photo_upload('HOTRUN999999C501','00000000-0000-4000-a000-00000000c532',NULL)"
office_add = """api.save_object_gallery('HOTRUN999999C501',jsonb_build_object(
 'write_contract','gallery-patch-v1','request_id','00000000-0000-4000-a000-00000000c533',
 'deleted','[]'::jsonb,'rows',jsonb_build_array(jsonb_build_object(
 'id','00000000-0000-4000-a501-000000000020','expected',NULL,'changes',jsonb_build_object(
 'media_type_id',(SELECT id FROM public.ref_code_media_type WHERE code='photo'),
 'url','https://example.test/office-twentieth.jpg','is_published',true,'visibility','public','position',20)))))"""
fixture("setup_partner_photo_stock.sql")
try:
    race("Two uploads at nineteen", actor, reserve_a, reserve_b)
    sql("DO $$ BEGIN ASSERT internal.gallery_photo_usage('HOTRUN999999C501')=20; ASSERT internal.gallery_published_photo_count('HOTRUN999999C501')=19; END $$;")
    sql(prefix(actor, "bertel_photo_cancel") + "SELECT api.cancel_portal_photo_upload('HOTRUN999999C501','00000000-0000-4000-a000-00000000c531'); COMMIT;")
    race("Office twentieth photo versus actor upload", office, office_add, reserve_b)
    sql("DO $$ BEGIN ASSERT internal.gallery_photo_usage('HOTRUN999999C501')=20; ASSERT internal.gallery_published_photo_count('HOTRUN999999C501')=20; END $$;")
    replacement = "api.reserve_portal_photo_upload('HOTRUN999999C503','00000000-0000-4000-a000-00000000c534','00000000-0000-4000-a503-000000000001')"
    other = "api.reserve_portal_photo_upload('HOTRUN999999C503','00000000-0000-4000-a000-00000000c535','00000000-0000-4000-a503-000000000001')"
    race("One replacement at twenty, competing replacement refused", actor, replacement, other)
    sql("""DO $$ BEGIN
      ASSERT internal.gallery_photo_usage('HOTRUN999999C503')=20;
      ASSERT internal.gallery_published_photo_count('HOTRUN999999C503')=20;
      ASSERT EXISTS(SELECT 1 FROM public.media WHERE id='00000000-0000-4000-a503-000000000001' AND is_published AND is_main);
      ASSERT NOT EXISTS(SELECT 1 FROM public.ref_document WHERE id IN('00000000-0000-4000-a000-00000000c532','00000000-0000-4000-a000-00000000c535'));
    END $$;""")
finally:
    fixture("cleanup_partner_photo_stock.sql")
