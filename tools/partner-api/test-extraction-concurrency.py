"""Real two-session quota, claim and dispatch races; no PDF bytes or provider call."""
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
guard = (root / "Base de donnée DLL et API/tests/assert_partner_api_ephemeral.sql").read_text(encoding="utf-8")
env = dict(os.environ, PGOPTIONS="-c bertel.ephemeral_ci=on")
command = ["psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "--dbname", db_url]
claims = '{"sub":"00000000-0000-4000-a000-00000000e701","role":"authenticated","app_metadata":{"sandbox_discovery":true}}'


def sql(source):
    result = subprocess.run(command, input=guard + source, text=True, capture_output=True, env=env, timeout=30)
    if result.returncode:
        raise RuntimeError(result.stderr.strip())
    return result.stdout.strip()


def prefix(name):
    return (guard + "BEGIN; SET application_name='" + name + "'; SET LOCAL statement_timeout='12s';\n"
            "SELECT set_config('request.jwt.claims','" + claims + "',true);\nSET LOCAL ROLE authenticated;\n")


def race(label, first_sql, second_sql):
    a = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                         stderr=subprocess.PIPE, text=True, env=env, bufsize=1)
    lines = queue.Queue()
    threading.Thread(target=lambda: [lines.put(line.strip()) for line in a.stdout], daemon=True).start()
    b = None
    try:
        a.stdin.write(prefix("bertel_extraction_a") + first_sql + "\nSELECT 'LOCK_HELD';\n")
        a.stdin.flush()
        deadline = time.monotonic() + 10
        while lines.get(timeout=max(0.1, deadline - time.monotonic())) != "LOCK_HELD":
            if time.monotonic() >= deadline:
                raise RuntimeError("First extraction operation did not acquire its lock")
        b = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE, text=True, env=env)
        b.stdin.write(prefix("bertel_extraction_b") + second_sql + "\nCOMMIT;\n")
        b.stdin.close()
        deadline = time.monotonic() + 4
        blocked = False
        while time.monotonic() < deadline:
            if sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='bertel_extraction_b' AND wait_event_type='Lock');") == "t":
                blocked = True
                break
            time.sleep(0.05)
        if not blocked:
            raise RuntimeError("The second extraction operation was not observed waiting")
        a.stdin.write("COMMIT;\n")
        a.stdin.close()
        if a.wait(timeout=15):
            raise RuntimeError(a.stderr.read())
        if b.wait(timeout=15):
            raise RuntimeError(b.stderr.read())
        print(label + ": contention observed, expected result confirmed")
    finally:
        for process in (b, a):
            if process is not None and process.poll() is None:
                process.terminate()
                process.wait(timeout=5)


setup = """
BEGIN;
DO $setup$
DECLARE r record; refs jsonb; ctx jsonb; stats jsonb; carte_role uuid;
 u uuid:='00000000-0000-4000-a000-00000000e701'; actor_id uuid:='00000000-0000-4000-a000-00000000e702';
 actor_claims jsonb:=jsonb_build_object('sub',u,'role','authenticated','app_metadata',jsonb_build_object('sandbox_discovery',true));
BEGIN
 ASSERT (SELECT NOT enabled FROM internal.portal_menu_write_configuration WHERE singleton),'M must start OFF';
 ASSERT (SELECT NOT enabled AND daily_page_limit IS NULL FROM internal.menu_extraction_settings WHERE singleton),'E must start OFF with no product quota';
 INSERT INTO auth.users(id,email) VALUES(u,'extraction-race@example.test');
 INSERT INTO public.actor(id,display_name,is_test,extra) VALUES(actor_id,'Extraction race actor',true,'{"test_corpus":true}');
 INSERT INTO public.app_user_profile(id,role,actor_id) VALUES(u,'actor',actor_id)
 ON CONFLICT(id) DO UPDATE SET role='actor',actor_id=EXCLUDED.actor_id;
 SELECT id INTO carte_role FROM public.ref_code_document_type WHERE code='carte';
 UPDATE internal.portal_menu_write_configuration SET enabled=true WHERE singleton;
 -- One page is a temporary test boundary, restored to NULL in finally.
 UPDATE internal.menu_extraction_settings SET enabled=true,daily_page_limit=1 WHERE singleton;
 FOR r IN SELECT * FROM (VALUES
  ('RESRUN999999E701','00000000-0000-4000-a000-00000000e711'::uuid,'00000000-0000-4000-a000-00000000e721'::uuid),
  ('RESRUN999999E702','00000000-0000-4000-a000-00000000e712'::uuid,'00000000-0000-4000-a000-00000000e722'::uuid)
 ) f(object_id,document_id,operation_id) LOOP
  INSERT INTO public.object(id,object_type,name,status,is_test) VALUES(r.object_id,'RES','Extraction concurrent source','published',true);
  INSERT INTO public.actor_object_role(actor_id,object_id,role_id,is_primary)
   SELECT actor_id,r.object_id,id,true FROM public.ref_actor_role WHERE code='operator';
  INSERT INTO public.ref_document(id,url,title,access_scope,storage_bucket,storage_path)
   VALUES(r.document_id,'https://project.example/storage/v1/object/public/documents/'||r.object_id||'/cartes/race.pdf',
     'Synthetic source','public','documents',r.object_id||'/cartes/race.pdf');
  INSERT INTO public.object_document(object_id,document_id,role_id,title,position) VALUES(r.object_id,r.document_id,carte_role,'Source',1);
  INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('documents',r.object_id||'/cartes/race.pdf','{"size":128,"mimetype":"application/pdf"}');
  PERFORM set_config('request.jwt.claims',actor_claims::text,true);
  refs:=jsonb_build_array(jsonb_build_object('kind','carte','id',r.document_id,'pages',jsonb_build_array(1),
    'expected',internal.restaurant_carte_link_snapshot(r.object_id,r.document_id)));
  ctx:=api.menu_extraction_context(r.object_id,refs,NULL)->'context';
  stats:=jsonb_build_array(jsonb_build_object('id',r.document_id,'bucket','documents','path',r.object_id||'/cartes/race.pdf',
    'sha256',repeat('b',64),'mimeType','application/pdf','pageCount',1,'selectedPages',jsonb_build_array(1),
    'storageExpected',internal.menu_extraction_storage_snapshot('documents',r.object_id||'/cartes/race.pdf')));
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  PERFORM api.seal_menu_extraction(r.operation_id,u,r.object_id,refs,NULL,ctx,stats,1,'{}');
 END LOOP;
END;
$setup$;
COMMIT;
"""
cleanup = """
BEGIN;
DELETE FROM public.object WHERE id IN ('RESRUN999999E701','RESRUN999999E702');
DELETE FROM public.ref_document WHERE id IN ('00000000-0000-4000-a000-00000000e711','00000000-0000-4000-a000-00000000e712');
-- Only the two synthetic metadata rows above; there were never backing file bytes.
-- Supabase Storage's 2026 direct-delete guard requires this transaction-local opt-in.
SET LOCAL storage.allow_delete_query='true';
DELETE FROM storage.objects WHERE bucket_id='documents' AND name IN ('RESRUN999999E701/cartes/race.pdf','RESRUN999999E702/cartes/race.pdf');
DELETE FROM internal.menu_extraction_day WHERE user_id='00000000-0000-4000-a000-00000000e701';
DELETE FROM auth.users WHERE id='00000000-0000-4000-a000-00000000e701';
DELETE FROM public.actor WHERE id='00000000-0000-4000-a000-00000000e702';
UPDATE internal.menu_extraction_settings SET enabled=false,daily_page_limit=NULL WHERE singleton;
UPDATE internal.portal_menu_write_configuration SET enabled=false WHERE singleton;
COMMIT;
"""
sql(setup)
try:
    race("Account quota across two different restaurant fiches",
         "SELECT api.reserve_menu_extraction('00000000-0000-4000-a000-00000000e721');",
         "DO $$ DECLARE denied boolean:=false; BEGIN BEGIN PERFORM api.reserve_menu_extraction('00000000-0000-4000-a000-00000000e722'); EXCEPTION WHEN SQLSTATE 'PT429' THEN denied:=true; END; ASSERT denied,'Quota spent twice'; END $$;")
    sql("DO $$ BEGIN ASSERT (SELECT reserved_pages=1 AND consumed_pages=0 FROM internal.menu_extraction_day WHERE user_id='00000000-0000-4000-a000-00000000e701'); ASSERT (SELECT state='inspected' FROM internal.menu_extraction_operation WHERE id='00000000-0000-4000-a000-00000000e722'); END $$;")
    race("Exclusive operation claim",
         "DO $$ BEGIN ASSERT api.claim_menu_extraction('00000000-0000-4000-a000-00000000e721','00000000-0000-4000-a000-00000000e731')->>'claimed'='true'; END $$;",
         "DO $$ BEGIN ASSERT api.claim_menu_extraction('00000000-0000-4000-a000-00000000e721','00000000-0000-4000-a000-00000000e732')->>'claimed'='false','Two workers claimed one operation'; END $$;")
    race("Single dispatch debit even with the same claim UUID",
         "DO $$ BEGIN ASSERT api.mark_menu_extraction_started('00000000-0000-4000-a000-00000000e721','00000000-0000-4000-a000-00000000e731')->>'started'='true'; END $$;",
         "DO $$ DECLARE denied boolean:=false; BEGIN BEGIN PERFORM api.mark_menu_extraction_started('00000000-0000-4000-a000-00000000e721','00000000-0000-4000-a000-00000000e731'); EXCEPTION WHEN SQLSTATE 'PT409' THEN denied:=true; END; ASSERT denied,'Dispatch paid twice'; END $$;")
    sql("DO $$ BEGIN ASSERT (SELECT reserved_pages=0 AND consumed_pages=1 FROM internal.menu_extraction_day WHERE user_id='00000000-0000-4000-a000-00000000e701'); ASSERT (SELECT state='started' FROM internal.menu_extraction_operation WHERE id='00000000-0000-4000-a000-00000000e721'); END $$;")
finally:
    sql(cleanup)
