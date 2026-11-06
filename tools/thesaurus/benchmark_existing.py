raise RuntimeError(
    "ARCHIVED_THESAURUS_TOOL: this historical database tool is disabled; see tools/thesaurus/README.md."
)

import json,threading,time,uuid,argparse
from pathlib import Path
import psycopg2
from psycopg2.extras import Json
ap=argparse.ArgumentParser();ap.add_argument('--database',required=True);ap.add_argument('--output',type=Path);args=ap.parse_args()
if not args.database.startswith('bertel_thesaurus_runtime_'):raise SystemExit('Only the isolated local runtime fixture is allowed')
common=dict(host='127.0.0.1',port=55439,user='postgres',dbname=args.database)
c=psycopg2.connect(**common)
with c.cursor()as q:q.execute("select id from app_user_profile where role='super_admin' limit 1");uid=str(q.fetchone()[0])
c.close()
def con(name):
 c=psycopg2.connect(application_name=name,**common)
 with c.cursor()as q:q.execute("select set_config('request.jwt.claims',%s,false)",(json.dumps(dict(sub=uid,role='authenticated')),))
 c.commit();return c
def rpc(c,a,p):
 with c.cursor()as q:q.execute('select api.thesaurus_admin(%s,%s::jsonb)',(a,Json(p)));return q.fetchone()[0]
c=con('thesaurus-existing-prepare')
with c.cursor()as q:
 q.execute("select concept_id,thesaurus.concept_document(concept_id) from thesaurus.concept where code='ths_perf_0'");cid,doc=q.fetchone()
 q.execute("select count(*) from public.object_taxonomy where object_id like 'HLORUNTS%'");count=q.fetchone()[0]
doc['name']='Racine synthétique '+str(uuid.uuid4())[:8]
r=rpc(c,'save_draft',dict(concept_id=str(cid),expected_version=0,document=doc));r=rpc(c,'validate_draft',dict(revision_id=r['revision_id'],expected_version=r['version']));c.commit()
p=dict(revision_ids=[r['revision_id']],expected_revision_versions={r['revision_id']:r['version']},idempotency_key=str(uuid.uuid4()))
t=time.perf_counter();preview=rpc(c,'preview',dict(revision_ids=p['revision_ids']));preview_ms=(time.perf_counter()-t)*1000;c.commit()
out=dict(database=args.database,fixture_kind='synthetic',published_objects=count,preview_ms=round(preview_ms,2));started=threading.Event();done=threading.Event()
def pub():
 x=con('thesaurus-existing-publisher')
 try:
  out['publisher_pid']=x.get_backend_pid();started.set();t=time.perf_counter();out['release']=rpc(x,'publish',p);x.commit();out['publication_ms']=round((time.perf_counter()-t)*1000,2)
 except Exception as er:x.rollback();out['publisher_error']=str(er)
 finally:done.set();x.close()
def edit():
 x=con('thesaurus-existing-editor');t=time.perf_counter()
 try:
  with x.cursor()as q:q.execute("update public.object set name=name||'+' where id='HLORUNTS00000000'")
  x.commit();out['editor_wait_ms']=round((time.perf_counter()-t)*1000,2)
 except Exception as er:x.rollback();out['editor_error']=str(er)
 finally:x.close()
reader_ready=threading.Event()
def read():
 x=con('thesaurus-existing-reader');x.autocommit=True;durations=[]
 try:
  with x.cursor()as q:
   q.execute("select count(*) from internal.mv_filtered_objects");q.fetchone();reader_ready.set()
   while not done.is_set():
    t=time.perf_counter();q.execute("select count(*) from internal.mv_filtered_objects");q.fetchone();durations.append((time.perf_counter()-t)*1000)
    time.sleep(.01)
  out['reader_queries']=len(durations);out['reader_max_wait_ms']=round(max(durations,default=0),2)
 except Exception as er:out['reader_error']=str(er);reader_ready.set()
 finally:x.close()

r=threading.Thread(target=read);r.start();reader_ready.wait(10)
a=threading.Thread(target=pub);a.start();started.wait(10)
observer=con('thesaurus-existing-observer');observer.autocommit=True
while not done.is_set():
 with observer.cursor()as q:
  q.execute("select exists(select 1 from pg_locks where pid=%s and locktype='advisory'and mode='ExclusiveLock'and granted and classid=741126 and objid=1)",(out['publisher_pid'],))
  if q.fetchone()[0]:out['observed_publication_fence']=True;break
 time.sleep(.01)
if out.get('observed_publication_fence'):
 b=threading.Thread(target=edit);b.start();b.join(120)
a.join(120)
r.join(10)
if a.is_alive():raise SystemExit('Publication timed out')
out['within_2s_editor_budget']=bool(out.get('observed_publication_fence'))and out.get('editor_wait_ms',float('inf'))<=2000
out['within_2s_reader_budget']=bool(out.get('observed_publication_fence'))and out.get('reader_queries',0)>0 and out.get('reader_max_wait_ms',float('inf'))<=2000
print(json.dumps(out,ensure_ascii=False,indent=2),flush=True)
if args.output:args.output.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
observer.close();c.close()
