"""Benchmark publication against an isolated local restoration of Bertel data.

Never connects to production. Requires the two thesaurus migrations already
installed on a database whose name starts with bertel_thesaurus_live_restore_.
The publication deliberately renames a root on that disposable copy.
"""

import argparse
import json
from pathlib import Path
import threading
import time
import uuid

import psycopg2
from psycopg2.extras import Json

parser = argparse.ArgumentParser()
parser.add_argument("--database", required=True)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
if not args.database.startswith("bertel_thesaurus_live_restore_"):
    raise SystemExit("Only an isolated local live-restoration database is allowed")
common = dict(host="127.0.0.1", port=55439, user="postgres", dbname=args.database)
setup = psycopg2.connect(**common)
with setup.cursor() as cursor:
    cursor.execute("SELECT id FROM public.app_user_profile WHERE role IN ('owner','super_admin')ORDER BY id LIMIT 1")
    user_id = str(cursor.fetchone()[0])
setup.close()
claims = json.dumps(dict(sub=user_id, role="authenticated"))


def connect(name):
    connection = psycopg2.connect(application_name=name, **common)
    with connection.cursor() as cursor:
        cursor.execute("SELECT set_config('request.jwt.claims',%s,false)", (claims,))
        cursor.execute("SET statement_timeout='8s'")
    connection.commit()
    return connection


def rpc(connection, action, payload):
    with connection.cursor() as cursor:
        cursor.execute("SELECT api.thesaurus_admin(%s,%s::jsonb)", (action, Json(payload)))
        return cursor.fetchone()[0]


setup = connect("thesaurus-live-copy-prepare")
with setup.cursor() as cursor:
    cursor.execute("SELECT md5(api.list_reference_bundle()::text)")
    legacy_before = cursor.fetchone()[0]
    cursor.execute("SELECT r.id::text,r.code,count(DISTINCT o.id),min(o.id)FROM public.ref_code r JOIN public.ref_code_taxonomy_closure c ON c.domain=r.domain AND c.ancestor_id=r.id JOIN public.object_taxonomy t ON t.domain=c.domain AND t.ref_code_id=c.descendant_id JOIN public.object o ON o.id=t.object_id WHERE r.domain='taxonomy_hlo'AND r.parent_id IS NULL AND o.status='published'AND NOT o.is_test GROUP BY r.id,r.code ORDER BY count(DISTINCT o.id)DESC,r.code LIMIT 1")
    root_source, root_code, published_count, editor_object = cursor.fetchone()
rpc(setup, "configure_instance", dict(base_uri="https://bertel.otisud.re/api/public/thesaurus/concepts/", license="Licence Ouverte / Etalab 2.0", attribution="Office de Tourisme Intercommunal du Sud de La Réunion (OTI du Sud)"))
rpc(setup, "bootstrap", dict(domains=["taxonomy_hlo"], idempotency_key="live-copy-bootstrap"))
setup.commit()
with setup.cursor() as cursor:
    cursor.execute("SELECT md5(api.list_reference_bundle()::text)")
    legacy_after = cursor.fetchone()[0]
    cursor.execute("SELECT concept_id,thesaurus.concept_document(concept_id)FROM thesaurus.concept WHERE source_id=%s AND domain='taxonomy_hlo'", (root_source,))
    concept_id, document = cursor.fetchone()
document["name"] += " — vérification sur copie restaurée " + str(uuid.uuid4())[:8]
revision = rpc(setup, "save_draft", dict(concept_id=str(concept_id), expected_version=0, document=document))
revision = rpc(setup, "validate_draft", dict(revision_id=revision["revision_id"], expected_version=revision["version"]))
setup.commit()
payload = dict(revision_ids=[revision["revision_id"]], expected_revision_versions={revision["revision_id"]: revision["version"]}, idempotency_key=str(uuid.uuid4()))
started_at = time.perf_counter()
preview = rpc(setup, "preview", dict(revision_ids=payload["revision_ids"]))
preview_ms = (time.perf_counter() - started_at) * 1000
setup.commit()
result = dict(database=args.database, fixture_kind="restored-production-copy", root_code=root_code, published_objects=published_count, preview=preview, preview_ms=round(preview_ms, 2), legacy_bundle_before=legacy_before, legacy_bundle_after_bootstrap=legacy_after, legacy_contract_unchanged=legacy_before == legacy_after)
started, done = threading.Event(), threading.Event()


def publish():
    connection = connect("thesaurus-live-copy-publisher")
    try:
        result["publisher_pid"] = connection.get_backend_pid()
        with connection.cursor() as cursor:
            cursor.execute("SET LOCAL ROLE authenticated")
        started.set()
        began = time.perf_counter()
        result["release"] = rpc(connection, "publish", payload)
        connection.commit()
        result["publication_ms"] = round((time.perf_counter() - began) * 1000, 2)
    except Exception as error:
        connection.rollback()
        result["publisher_error"] = str(error)
    finally:
        done.set()
        connection.close()


def edit():
    connection = connect("thesaurus-live-copy-editor")
    began = time.perf_counter()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SET LOCAL ROLE authenticated")
            cursor.execute("UPDATE public.object SET name=name WHERE id=%s", (editor_object,))
            result["editor_rows"] = cursor.rowcount
        result["editor_wait_ms"] = round((time.perf_counter() - began) * 1000, 2)
    except Exception as error:
        result["editor_error"] = str(error)
    finally:
        connection.rollback()
        connection.close()


def read():
    connection = connect("thesaurus-live-copy-reader")
    durations = []
    try:
        connection.autocommit = True
        with connection.cursor() as cursor:
            cursor.execute("SET ROLE service_role")
            while not done.is_set():
                began = time.perf_counter()
                cursor.execute("SELECT api.list_partner_objects_with_vocabulary(p_page_size=>1,p_types=>ARRAY['HLO'],p_taxonomy_codes=>ARRAY[%s])", ("taxonomy_hlo:" + root_code,))
                page = cursor.fetchone()[0]
                durations.append((time.perf_counter() - began) * 1000)
                result["reader_rows"] = len(page["data"])
                result["reader_release"] = page.get("meta", page.get("info", {})).get("vocabulary_release")
                time.sleep(.01)
        result["reader_wait_ms"] = round(max(durations, default=0), 2)
        result["reader_queries"] = len(durations)
    except Exception as error:
        result["reader_error"] = str(error)
    finally:
        connection.rollback()
        connection.close()


publisher = threading.Thread(target=publish)
publisher.start()
started.wait(10)
observer = connect("thesaurus-live-copy-observer")
observer.autocommit = True
while not done.is_set():
    with observer.cursor() as cursor:
        cursor.execute("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=%s AND locktype='advisory'AND mode='ExclusiveLock'AND granted AND classid=741126 AND objid=1)", (result["publisher_pid"],))
        if cursor.fetchone()[0]:
            result["observed_publication_fence"] = True
            break
    time.sleep(.005)
workers = []
if result.get("observed_publication_fence"):
    workers = [threading.Thread(target=edit), threading.Thread(target=read)]
    for worker in workers:
        worker.start()
for worker in workers + [publisher]:
    worker.join(30)
result["within_budgets"] = bool(result.get("observed_publication_fence")) and result.get("editor_rows") == 1 and result.get("reader_rows") == 1 and result.get("reader_queries", 0) > 0 and result.get("publication_ms") is not None and result.get("editor_wait_ms", float("inf")) <= 2000 and result.get("reader_wait_ms", float("inf")) <= 2000 and result["legacy_contract_unchanged"]
args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({key: value for key, value in result.items() if key not in ("preview", "release")}, ensure_ascii=False, indent=2), flush=True)
observer.close()
setup.close()
if not result["within_budgets"]:
    raise SystemExit(1)
