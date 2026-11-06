"""Isolated PostgreSQL concurrency and 447-object publication benchmark.

Creates a new local test database from the existing schema-only audit template.
It never connects to a non-loopback server or modifies the audit template.
Requires psycopg2 (the test run used psycopg2-binary 2.9.11 in a temporary directory).
"""

from __future__ import annotations

raise RuntimeError(
    "ARCHIVED_THESAURUS_TOOL: this historical database tool is disabled; see tools/thesaurus/README.md."
)

import argparse
import json
from pathlib import Path
import threading
import time
import uuid

import psycopg2
from psycopg2 import sql
from psycopg2.extras import Json, execute_values


ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase/migrations/20261106112948_thesaurus_publication.sql"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=55439)
    parser.add_argument("--database", required=True)
    parser.add_argument("--objects", type=int, default=447)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if not args.database.startswith("bertel_thesaurus_runtime_"):
        raise SystemExit("Refusing a database outside the isolated runtime-test prefix")
    if not 1 <= args.objects <= 1000:
        raise SystemExit("Fixture size must be between 1 and 1000")
    common = dict(host="127.0.0.1", port=args.port, user="postgres", connect_timeout=10)
    admin = psycopg2.connect(dbname="postgres", **common)
    admin.autocommit = True
    with admin.cursor() as cur:
        cur.execute("SELECT 1 FROM pg_database WHERE datname=%s", (args.database,))
        if cur.fetchone():
            raise SystemExit("Test database already exists; choose a new isolated name")
        cur.execute(sql.SQL("CREATE DATABASE {} TEMPLATE bertel_iti_sections_audit").format(sql.Identifier(args.database)))
    admin.close()
    profile_id = str(uuid.uuid4())
    claims = json.dumps({"sub": profile_id, "role": "authenticated"})

    def connect(name: str):
        conn = psycopg2.connect(dbname=args.database, application_name=name, **common)
        with conn.cursor() as cur:
            cur.execute("SELECT set_config('request.jwt.claims',%s,false)", (claims,))
            cur.execute("SET statement_timeout='300s'")
        conn.commit()
        return conn

    def rpc(conn, action, payload):
        with conn.cursor() as cur:
            cur.execute("SELECT api.thesaurus_admin(%s,%s::jsonb)", (action, Json(payload)))
            return cur.fetchone()[0]

    db = connect("thesaurus-runtime-setup")
    db.autocommit = True
    with db.cursor() as cur:
        cur.execute(MIGRATION.read_text(encoding="utf-8"))
    db.autocommit = False
    source_ids = [str(uuid.uuid4()) for _ in range(3)]
    object_ids = [f"HLORUNTS{i:08d}" for i in range(args.objects + 1)]
    with db.cursor() as cur:
        # Fixture account creation runs as local SQL maintenance before that account exists.
        cur.execute("SELECT set_config('request.jwt.claims','{}',false)")
        cur.execute("INSERT INTO auth.users(id,email)VALUES(%s,%s)", (profile_id, f"{profile_id}@example.invalid"))
        cur.execute("INSERT INTO public.app_user_profile(id,role,display_name)VALUES(%s,'super_admin','Runtime fixture')ON CONFLICT(id)DO UPDATE SET role='super_admin'", (profile_id,))
        cur.execute("SELECT set_config('request.jwt.claims',%s,false)", (claims,))
        cur.execute("INSERT INTO public.ref_code_domain_registry(domain,name,object_type,is_hierarchical,is_taxonomy)VALUES('taxonomy_hlo','Runtime fixture','HLO',true,true)ON CONFLICT(domain)DO NOTHING")
        for i, source_id in enumerate(source_ids):
            cur.execute("INSERT INTO public.ref_code(id,domain,code,name,description,parent_id,metadata)VALUES(%s,'taxonomy_hlo',%s,%s,'Synthetic benchmark definition',%s,%s)", (source_id, f"ths_perf_{i}", f"Concept synthétique {i}", source_ids[i - 1] if i else None, Json({"aliases": [f"historique_{i}"]})))
        execute_values(cur, "INSERT INTO public.object(id,object_type,name,status)VALUES %s", [(oid, "HLO", f"Fiche synthétique {i}", "published") for i, oid in enumerate(object_ids)])
        execute_values(cur, "INSERT INTO public.object_taxonomy(object_id,domain,ref_code_id)VALUES %s", [(oid, "taxonomy_hlo", source_ids[2]) for oid in object_ids[:-1]])
    rpc(db, "configure_instance", {"base_uri": "https://fixture.invalid/api/public/thesaurus/concepts/", "license": "synthetic-test-only", "attribution": "Synthetic fixture owner"})
    rpc(db, "bootstrap", {"domains": ["taxonomy_hlo"], "idempotency_key": "runtime-bootstrap"})
    db.commit()
    with db.cursor() as cur:
        cur.execute("SELECT source_id,concept_id FROM thesaurus.concept WHERE domain='taxonomy_hlo'")
        concept_ids = {sid: str(cid) for sid, cid in cur.fetchall()}
    db.commit()

    def prepare(concept_id, changes):
        with db.cursor() as cur:
            cur.execute("SELECT thesaurus.concept_document(%s::uuid)", (concept_id,))
            document = cur.fetchone()[0]
        document.update(changes)
        revision = rpc(db, "save_draft", {"concept_id": concept_id, "expected_version": 0, "document": document})
        revision = rpc(db, "validate_draft", {"revision_id": revision["revision_id"], "expected_version": revision["version"]})
        db.commit()
        return {"revision_ids": [revision["revision_id"]], "expected_revision_versions": {revision["revision_id"]: revision["version"]}}

    retire = prepare(concept_ids[source_ids[2]], {"lifecycle": "retired"})
    retire["idempotency_key"] = "runtime-retirement"
    locked = threading.Event()
    allow_publish = threading.Event()
    outcomes: dict = {}

    def publisher():
        conn = connect("thesaurus-race-publisher")
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT pg_advisory_xact_lock(741126,1)")
            locked.set()
            if not allow_publish.wait(20):
                raise RuntimeError("Assignment did not reach the expected live lock")
            start = time.perf_counter()
            outcomes["retirement"] = rpc(conn, "publish", retire)
            conn.commit()
            outcomes["retirement_ms"] = round((time.perf_counter() - start) * 1000, 2)
        except Exception as error:
            conn.rollback()
            outcomes["publisher_error"] = str(error)
        finally:
            conn.close()

    def assignment():
        conn = connect("thesaurus-race-assignment")
        try:
            with conn.cursor() as cur:
                cur.execute("INSERT INTO public.object_taxonomy(object_id,domain,ref_code_id)VALUES(%s,'taxonomy_hlo',%s)", (object_ids[-1], source_ids[2]))
            conn.commit()
            outcomes["assignment_rejected"] = False
        except psycopg2.Error as error:
            conn.rollback()
            outcomes["assignment_rejected"] = error.pgcode == "23514"
            outcomes["assignment_sqlstate"] = error.pgcode
        finally:
            conn.close()

    pub_thread = threading.Thread(target=publisher)
    pub_thread.start()
    if not locked.wait(20):
        raise RuntimeError("Publisher failed before acquiring its lock")
    assignment_thread = threading.Thread(target=assignment)
    assignment_thread.start()
    observer = connect("thesaurus-runtime-observer")
    observer.autocommit = True
    for _ in range(100):
        with observer.cursor() as cur:
            cur.execute("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database()AND application_name='thesaurus-race-assignment'AND wait_event_type='Lock'AND wait_event='advisory')")
            if cur.fetchone()[0]:
                outcomes["observed_assignment_wait"] = True
                break
        time.sleep(0.05)
    allow_publish.set()
    pub_thread.join(300)
    assignment_thread.join(300)
    if pub_thread.is_alive() or assignment_thread.is_alive():
        raise RuntimeError("Concurrency test did not finish within its bounded timeout")
    if not outcomes.get("observed_assignment_wait") or not outcomes.get("assignment_rejected"):
        raise AssertionError(f"Retirement race is not safe: {outcomes}")

    rename = prepare(concept_ids[source_ids[0]], {"name": "Racine synthétique renommée"})
    rename["idempotency_key"] = "runtime-root-rename"
    start = time.perf_counter()
    outcomes["preview"] = rpc(db, "preview", {"revision_ids": rename["revision_ids"]})
    outcomes["preview_ms"] = round((time.perf_counter() - start) * 1000, 2)
    db.commit()
    rename.pop("expected_release_id", None)
    started_publish = threading.Event()

    def rename_publisher():
        conn = connect("thesaurus-benchmark-publisher")
        try:
            outcomes["rename_pid"] = conn.get_backend_pid()
            started_publish.set()
            start = time.perf_counter()
            outcomes["rename"] = rpc(conn, "publish", rename)
            conn.commit()
            outcomes["publication_ms"] = round((time.perf_counter() - start) * 1000, 2)
        except Exception as error:
            conn.rollback()
            outcomes["rename_error"] = str(error)
        finally:
            conn.close()

    def editor():
        conn = connect("thesaurus-benchmark-editor")
        try:
            start = time.perf_counter()
            with conn.cursor() as cur:
                cur.execute("UPDATE public.object SET name=name||' (édition)'WHERE id=%s", (object_ids[0],))
            conn.commit()
            outcomes["editor_wait_ms"] = round((time.perf_counter() - start) * 1000, 2)
        except Exception as error:
            conn.rollback()
            outcomes["editor_error"] = str(error)
        finally:
            conn.close()

    rename_thread = threading.Thread(target=rename_publisher)
    rename_thread.start()
    if not started_publish.wait(20):
        raise RuntimeError("Benchmark publisher did not start")
    # Observe the fence acquired by the actual API. Planning warmup intentionally
    # happens before that fence and remains included in total publication latency.
    for _ in range(2000):
        with observer.cursor() as cur:
            cur.execute("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=%s AND locktype='advisory'AND mode='ExclusiveLock'AND granted AND classid=741126 AND objid=1)", (outcomes["rename_pid"],))
            if cur.fetchone()[0]:
                outcomes["benchmark_publication_fence_observed"] = True
                break
        if not rename_thread.is_alive():
            break
        time.sleep(0.01)
    if not outcomes.get("benchmark_publication_fence_observed"):
        raise RuntimeError(f"The API publication fence was not observed: {outcomes}")
    editor_thread = threading.Thread(target=editor)
    editor_thread.start()
    rename_thread.join(300)
    editor_thread.join(300)
    if rename_thread.is_alive() or editor_thread.is_alive():
        raise RuntimeError("Benchmark timeout")
    if "rename_error" in outcomes or "editor_error" in outcomes:
        raise RuntimeError(json.dumps(outcomes, ensure_ascii=False))
    report = {
        "database": args.database,
        "fixture": {"kind": "synthetic", "published_objects": args.objects, "taxonomy_nodes": 3, "maximum_depth": 2},
        "concurrency": {key: outcomes.get(key) for key in ("observed_assignment_wait", "assignment_rejected", "assignment_sqlstate", "retirement_ms")},
        "benchmark": {"preview_ms": outcomes["preview_ms"], "publication_ms": outcomes["publication_ms"], "editor_wait_ms": outcomes["editor_wait_ms"], "affected_objects": outcomes["rename"]["affected_objects"], "observed_publication_fence": outcomes["benchmark_publication_fence_observed"], "within_2s_editor_budget": outcomes["editor_wait_ms"] <= 2000},
    }
    output = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output + "\n", encoding="utf-8")
    print(output, flush=True)
    observer.close()
    db.close()


if __name__ == "__main__":
    main()
