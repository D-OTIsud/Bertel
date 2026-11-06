"""Prove first publication serializes a competing URI-prefix configuration."""
import argparse
import json
from pathlib import Path
import threading
import time
import uuid
import psycopg2
from psycopg2 import sql
from psycopg2.extras import Json

parser=argparse.ArgumentParser()
parser.add_argument("--database",required=True)
parser.add_argument("--output",type=Path,required=True)
args=parser.parse_args()
if not args.database.startswith("bertel_thesaurus_config_race_"):
    raise SystemExit("Only an isolated local configuration-race database is allowed")
common=dict(host="127.0.0.1",port=55439,user="postgres")
admin=psycopg2.connect(dbname="postgres",**common);admin.autocommit=True
with admin.cursor()as cursor:
    cursor.execute("SELECT 1 FROM pg_database WHERE datname=%s",(args.database,))
    if cursor.fetchone()is None:
        cursor.execute(sql.SQL("CREATE DATABASE {} TEMPLATE bertel_thesaurus_test").format(sql.Identifier(args.database)))
admin.close()
user_id=str(uuid.uuid4())
claims=json.dumps(dict(sub=user_id,role="authenticated"))
def connect():
    connection=psycopg2.connect(dbname=args.database,**common)
    with connection.cursor()as cursor:
        cursor.execute("SET statement_timeout='15s'")
        cursor.execute("SELECT set_config('request.jwt.claims',%s,false)",(claims,))
    connection.commit()
    return connection
def rpc(connection,action,payload):
    with connection.cursor()as cursor:
        cursor.execute("SELECT api.thesaurus_admin(%s,%s::jsonb)",(action,Json(payload)))
        return cursor.fetchone()[0]
publisher=connect()
with publisher.cursor()as cursor:
    cursor.execute("SELECT api.thesaurus_generation()")
    if cursor.fetchone()[0]is not None:raise SystemExit("Template must be unactivated")
    cursor.execute("SELECT set_config('request.jwt.claims','{}',false)")
    # The schema-only local template omits this canonical Data API prerequisite.
    cursor.execute("GRANT USAGE ON SCHEMA api TO authenticated")
    cursor.execute("INSERT INTO auth.users(id,email)VALUES(%s,%s)",(user_id,user_id+"@example.invalid"))
    cursor.execute("INSERT INTO public.app_user_profile(id,role)VALUES(%s,'super_admin')ON CONFLICT(id)DO UPDATE SET role='super_admin'",(user_id,))
    cursor.execute("INSERT INTO public.ref_language(code,name)VALUES('qaa','Configuration race fixture')ON CONFLICT(code)DO NOTHING")
    cursor.execute("SELECT set_config('request.jwt.claims',%s,false)",(claims,))
rpc(publisher,"configure_instance",dict(base_uri="https://first.invalid/concepts/",license="fixture-only",attribution="Configuration race fixture"))
publisher.commit()
with publisher.cursor()as cursor:
    cursor.execute("SET LOCAL ROLE authenticated")
    cursor.execute("SELECT pg_advisory_xact_lock(741126,1)")
result={}
ready=threading.Event()
def configure():
    connection=connect()
    result["configuration_pid"]=connection.get_backend_pid()
    try:
        with connection.cursor()as cursor:cursor.execute("SET LOCAL ROLE authenticated")
        ready.set()
        rpc(connection,"configure_instance",dict(base_uri="https://second.invalid/concepts/"))
        connection.commit();result["unexpected_configuration_success"]=True
    except psycopg2.Error as error:
        connection.rollback();result["configuration_sqlstate"]=error.pgcode
    finally:connection.close()
worker=threading.Thread(target=configure);worker.start();ready.wait(10)
observer=connect();observer.autocommit=True
deadline=time.monotonic()+5
while time.monotonic()<deadline:
    with observer.cursor()as cursor:
        cursor.execute("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=%s AND locktype='advisory'AND classid=741126 AND objid=1 AND mode='ShareLock'AND NOT granted)",(result["configuration_pid"],))
        if cursor.fetchone()[0]:
            result["observed_configuration_wait"]=True;break
    time.sleep(.005)
result["publication"]=rpc(publisher,"bootstrap",dict(domains=["language"],idempotency_key="configuration-race-first-publication"))
publisher.commit();worker.join(20)
with publisher.cursor()as cursor:
    cursor.execute("SELECT base_uri FROM thesaurus.instance WHERE singleton")
    result["final_base_uri"]=cursor.fetchone()[0]
    cursor.execute("SELECT count(*)FROM thesaurus.release_concept WHERE document->>'uri'NOT LIKE'https://first.invalid/concepts/%'")
    result["inconsistent_concept_uris"]=cursor.fetchone()[0]
result["passed"]=bool(result.get("observed_configuration_wait"))and result.get("configuration_sqlstate")=="PT409"and result["final_base_uri"]=="https://first.invalid/concepts/"and result["inconsistent_concept_uris"]==0
args.output.write_text(json.dumps(result,indent=2)+"\n",encoding="utf-8")
print(json.dumps(result,indent=2))
publisher.close();observer.close()
if not result["passed"]:raise SystemExit(1)
