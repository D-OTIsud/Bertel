"""Real two-session stale-release publication proof on an isolated local fixture."""
import argparse,json,threading,time,uuid
from pathlib import Path
import psycopg2
from psycopg2 import sql
from psycopg2.extras import Json
p=argparse.ArgumentParser();p.add_argument('--database',required=True);p.add_argument('--output',type=Path);args=p.parse_args()
if not args.database.startswith('bertel_thesaurus_runtime_'):raise SystemExit('Only the isolated local runtime fixture is allowed')
common=dict(host='127.0.0.1',port=55439,user='postgres',dbname=args.database,options='-c statement_timeout=120s')
migration=Path(__file__).resolve().parents[2]/'supabase/migrations/20261106160017_thesaurus_prepared_publication.sql'
admin=psycopg2.connect(host='127.0.0.1',port=55439,user='postgres',dbname='postgres');admin.autocommit=True
with admin.cursor()as q:
 q.execute('SELECT 1 FROM pg_database WHERE datname=%s',(args.database,))
 if q.fetchone()is not None:raise SystemExit('Choose a new fixture database; existing databases are never modified')
 q.execute(sql.SQL('CREATE DATABASE {} TEMPLATE bertel_thesaurus_test').format(sql.Identifier(args.database)))
admin.close()
x=psycopg2.connect(**common)
uid=str(uuid.uuid4())
with x.cursor()as q:
 q.execute("SELECT set_config('request.jwt.claims','{}',false)")
 q.execute(migration.read_text(encoding='utf-8'))
 q.execute('SELECT current_release_id FROM thesaurus.instance WHERE singleton');assert q.fetchone()[0]is None,'Template must be unactivated'
 # Restore the canonical Data API schema prerequisite omitted by this minimal
 # local template. All RPCs below run with the real authenticated role.
 q.execute('GRANT USAGE ON SCHEMA api TO authenticated')
 q.execute('INSERT INTO auth.users(id,email)VALUES(%s,%s)',(uid,uid+'@example.invalid'))
 q.execute("INSERT INTO public.app_user_profile(id,role)VALUES(%s,'super_admin')ON CONFLICT(id)DO UPDATE SET role='super_admin'",(uid,))
 q.execute("INSERT INTO public.ref_code_domain_registry(domain,name,object_type,is_hierarchical,is_taxonomy)VALUES('taxonomy_hlo','Publication race fixture','HLO',true,true)ON CONFLICT DO NOTHING")
x.commit()
x.close()
def con(name):
 x=psycopg2.connect(application_name=name,**common)
 with x.cursor()as q:q.execute("select set_config('request.jwt.claims',%s,false)",(json.dumps(dict(sub=uid,role='authenticated')),))
 x.commit();return x
def rpc(x,action,payload):
 with x.cursor()as q:
  q.execute('SET LOCAL ROLE authenticated')
  q.execute('select current_user,api.thesaurus_admin(%s,%s::jsonb)',(action,Json(payload)))
  role,result=q.fetchone();assert role=='authenticated'
  q.execute('RESET ROLE')
  return result
def prepare(x,doc,cid=None):
 p=dict(domain='taxonomy_hlo',expected_version=0,document=doc)
 if cid:p['concept_id']=cid
 r=rpc(x,'save_draft',p);r=rpc(x,'validate_draft',dict(revision_id=r['revision_id'],expected_version=r['version']));x.commit();return r
x=con('publish-race-setup');suffix=uuid.uuid4().hex[:8]
rpc(x,'configure_instance',dict(base_uri='https://publication-race.invalid/concepts/',license='fixture-only',attribution='Isolated publication race fixture'));x.commit()
base=[]
for n in('a','b'):base.append(prepare(x,dict(code='race_'+suffix+n,name='Concurrent '+n+' original',description='Synthetic concurrency proof',lifecycle='active')))
b=rpc(x,'publish',dict(revision_ids=[r['revision_id']for r in base],expected_revision_versions={r['revision_id']:r['version']for r in base},idempotency_key='race-bootstrap-'+suffix));x.commit();common_release=b['release_id']
revisions=[]
for n,r in zip(('a','b'),base):
 with x.cursor()as q:q.execute('select thesaurus.concept_document(%s::uuid)',(r['concept_id'],));doc=q.fetchone()[0]
 doc['name']='Concurrent '+n+' published';revisions.append(prepare(x,doc,r['concept_id']))
def payload(i,release):
 r=revisions[i];return dict(revision_ids=[r['revision_id']],expected_revision_versions={r['revision_id']:r['version']},expected_release_id=release,idempotency_key='race-'+suffix+'-'+str(i))
locked=threading.Event();go=threading.Event();out=dict(database=args.database,common_release_id=common_release,applied_migration=migration.name,actual_role='authenticated')
def first():
 c=con('publish-race-first')
 try:
  with c.cursor()as q:q.execute('select pg_advisory_xact_lock(741126,2)')
  locked.set();assert go.wait(30);out['first_release']=rpc(c,'publish',payload(0,common_release));c.commit()
 except Exception as er:c.rollback();out['first_error']=str(er)
 finally:c.close()
def second():
 c=con('publish-race-second')
 try:out['unexpected_second']=rpc(c,'publish',payload(1,common_release));c.commit()
 except psycopg2.Error as er:c.rollback();out['second_sqlstate']=er.pgcode
 finally:c.close()
a=threading.Thread(target=first);a.start();assert locked.wait(20);b=threading.Thread(target=second);b.start();observer=con('publish-race-observer');observer.autocommit=True
for _ in range(100):
 with observer.cursor()as q:
  q.execute("select exists(select 1 from pg_locks l join pg_stat_activity a on a.pid=l.pid where a.application_name='publish-race-second'and a.datname=current_database()and l.locktype='advisory'and l.classid=741126 and l.objid=2 and l.mode='ExclusiveLock'and not l.granted)")
  if q.fetchone()[0]:out['observed_second_publication_wait']=True;out['observed_second_publication_wait_on_k2']=True;break
 time.sleep(.05)
go.set();a.join(120);b.join(120)
assert out.get('observed_second_publication_wait')and out.get('second_sqlstate')=='PT409'and'first_error'not in out,out
with x.cursor()as q:
 q.execute('select status from thesaurus.revision where revision_id=%s::uuid',(revisions[1]['revision_id'],));out['loser_revision_retained']=q.fetchone()[0]=='validated'
 q.execute("select name from public.ref_code where id=(select source_id::uuid from thesaurus.concept where concept_id=%s::uuid)and domain='taxonomy_hlo'",(revisions[1]['concept_id'],));out['loser_source_unchanged']=q.fetchone()[0]=='Concurrent b original'
assert out['loser_revision_retained']and out['loser_source_unchanged'],out
preview=rpc(x,'preview',dict(revision_ids=[revisions[1]['revision_id']]));assert not preview['errors'],preview
out['retry_release']=rpc(x,'publish',payload(1,out['first_release']['release_id']));x.commit()
with x.cursor()as q:
 q.execute("select count(*)from thesaurus.concept c join public.ref_code r on r.id::text=c.source_id and r.domain=c.domain where c.concept_id=any(%s::uuid[])and r.name in('Concurrent a published','Concurrent b published')",([r['concept_id']for r in revisions],));out['both_changes_preserved']=q.fetchone()[0]==2
assert out['both_changes_preserved'],out
out['passed']=True
print(json.dumps(out,ensure_ascii=False,indent=2),flush=True)
if args.output:args.output.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
x.close();observer.close()
