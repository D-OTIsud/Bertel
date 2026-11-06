"""Prove that a real tag writer arriving after journal validation waits for X1.

Only an existing, disposable loopback preparation database is accepted. This
tool commits local fixtures and a real publication, then restores every modified
helper definition, owner and ACL. It does not install production test hooks.
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
from psycopg2.extras import Json

from preparation_test_oracle import BUSINESS_EXCLUDED_COLUMNS, verify_success


APPLY = "thesaurus.apply_prepared_objects(jsonb,text[])"
ALIAS = "thesaurus.preparation_late_writer_oracle(jsonb,text[])"
CHECKED_FUNCTIONS = (
    APPLY,
    "thesaurus.prepare_affected_objects(text[])",
    "thesaurus.activate(uuid[],text[],text,bigint,jsonb)",
)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if not args.database.startswith("bertel_thesaurus_preparation_"):
        raise SystemExit("Only an existing isolated preparation-test database is accepted")
    if args.output.exists():
        raise SystemExit("Choose a new evidence output path; previous results are never overwritten")
    common = dict(host="127.0.0.1", port=55439, user="postgres", connect_timeout=10)
    actor = str(uuid.uuid4())
    claims = json.dumps(dict(sub=actor, role="authenticated"))

    def connect(name, authenticated=False):
        connection = psycopg2.connect(dbname=args.database, application_name=name, **common)
        with connection.cursor() as cursor:
            cursor.execute("SET statement_timeout='30s'")
            cursor.execute("SELECT set_config('request.jwt.claims',%s,false)", (claims,))
            if authenticated:
                cursor.execute("SET ROLE authenticated")
        connection.commit()
        return connection

    def execute(connection, query, params=()):
        with connection.cursor() as cursor:
            cursor.execute(query, params)
            return cursor.fetchone()[0] if cursor.description else None

    def rpc(connection, action, payload):
        return execute(connection, "SELECT api.thesaurus_admin(%s,%s::jsonb)", (action, Json(payload)))

    setup = connect("late-writer-setup")
    setup.autocommit = True
    observer = connect("late-writer-observer")
    observer.autocommit = True
    barrier = connect("late-writer-barrier")
    barrier.autocommit = True
    original = None
    fingerprints = None
    instrumented = False
    publisher = None
    writer = None
    publisher_thread = None
    writer_thread = None
    writer_inserted = threading.Event()
    commit_writer = threading.Event()
    abort_writer = threading.Event()
    result = dict(database=args.database, fixture="isolated-local", publisher_role="authenticated",
                  writer_role="authenticated", instrumented_functional_race_only=True, passed=False)

    def fingerprint():
        with setup.cursor() as cursor:
            cursor.execute(
                "SELECT signature,md5(pg_get_functiondef(signature::regprocedure)),proowner,proacl::text "
                "FROM unnest(%s::text[])signature JOIN pg_proc ON oid=signature::regprocedure ORDER BY signature",
                (list(CHECKED_FUNCTIONS),),
            )
            return cursor.fetchall()

    def business_rows(ids):
        with setup.cursor() as cursor:
            cursor.execute("SELECT id,md5((to_jsonb(o)-%s::text[])::text)FROM public.object o WHERE id=ANY(%s)ORDER BY id",
                           (list(BUSINESS_EXCLUDED_COLUMNS), ids))
            return cursor.fetchall()

    def versions(ids):
        with setup.cursor() as cursor:
            cursor.execute("SELECT id,current_version FROM public.object WHERE id=ANY(%s)ORDER BY id", (ids,))
            return cursor.fetchall()

    def wait_for(predicate, description, seconds=20):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            if predicate():
                return
            time.sleep(.005)
        raise AssertionError(description)

    try:
        assert execute(setup, "SELECT current_database()") == args.database
        assert execute(setup, "SELECT NOT rolsuper AND NOT rolbypassrls FROM pg_roles WHERE rolname='bertel_thesaurus_publisher'"), "Publisher must retain its non-superuser, NOBYPASSRLS role"
        assert execute(setup, "SELECT current_release_id FROM thesaurus.instance WHERE singleton") is not None
        assert execute(setup, "SELECT to_regprocedure(%s)IS NULL", (ALIAS,))
        assert execute(setup, "SELECT to_regprocedure('thesaurus.preparation_test_oracle(text[])')IS NULL"), "Finish and restore the preparation race harness first"
        execute(setup, "SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)")
        execute(setup, "INSERT INTO auth.users(id,email)VALUES(%s,%s)", (actor, actor + "@example.invalid"))
        execute(setup, "INSERT INTO public.app_user_profile(id,role)VALUES(%s,'super_admin')ON CONFLICT(id)DO UPDATE SET role='super_admin'", (actor,))
        execute(setup, "SELECT set_config('request.jwt.claims',%s,false)", (claims,))
        with setup.cursor() as cursor:
            cursor.execute("SELECT concept_id::text,source_id,domain FROM thesaurus.concept c WHERE source_kind='ref_code'AND domain='taxonomy_hlo'AND NOT EXISTS(SELECT 1 FROM thesaurus.revision r WHERE r.concept_id=c.concept_id AND r.status IN('draft','validated'))ORDER BY concept_id LIMIT 1")
            chosen = cursor.fetchone()
        assert chosen, "A free governed taxonomy fixture concept is required"
        concept, source, domain = chosen
        object_id = "HLOPREPL" + uuid.uuid4().hex[:8].upper()
        ids = [object_id]
        tag_id = str(uuid.uuid4())
        tag_name = "Latewriter " + uuid.uuid4().hex[:10]
        execute(setup, "INSERT INTO public.object(id,object_type,name,status)VALUES(%s,'HLO','Late writer object','published')", (object_id,))
        execute(setup, "INSERT INTO public.object_description(object_id,description)VALUES(%s,'Late writer baseline')", (object_id,))
        execute(setup, "INSERT INTO public.object_taxonomy(object_id,domain,ref_code_id)VALUES(%s,%s,%s)", (object_id, domain, source))
        execute(setup, "INSERT INTO public.ref_tag(id,slug,name)VALUES(%s,%s,%s)", (tag_id, "late_" + uuid.uuid4().hex, tag_name))
        document = execute(setup, "SELECT thesaurus.concept_document(%s::uuid)", (concept,))
        document["name"] = "Late writer publication " + uuid.uuid4().hex[:10]
        revision = rpc(setup, "save_draft", dict(concept_id=concept, expected_version=0, document=document))
        revision = rpc(setup, "validate_draft", dict(revision_id=revision["revision_id"], expected_version=revision["version"]))
        previous = execute(setup, "SELECT current_release_id FROM thesaurus.instance WHERE singleton")
        before_business = business_rows(ids)
        before_versions = versions(ids)
        fingerprints = fingerprint()
        assert execute(setup, "SELECT pg_get_userbyid(proowner)FROM pg_proc WHERE oid=%s::regprocedure", (APPLY,)) == "bertel_thesaurus_publisher", "Unexpected native apply helper owner"
        original = execute(setup, "SELECT pg_get_functiondef(%s::regprocedure)", (APPLY,))
        alias = original.replace("FUNCTION thesaurus.apply_prepared_objects(", "FUNCTION thesaurus.preparation_late_writer_oracle(", 1)
        assert alias != original
        with setup.cursor() as cursor:
            cursor.execute("BEGIN")
            try:
                cursor.execute(alias)
                cursor.execute("ALTER FUNCTION thesaurus.preparation_late_writer_oracle(jsonb,text[])OWNER TO bertel_thesaurus_publisher")
                cursor.execute("REVOKE ALL ON FUNCTION thesaurus.preparation_late_writer_oracle(jsonb,text[])FROM PUBLIC,anon,authenticated,service_role")
                cursor.execute("""CREATE OR REPLACE FUNCTION thesaurus.apply_prepared_objects(p_stage jsonb,p_live_ids text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,thesaurus AS $$
BEGIN
 PERFORM pg_advisory_xact_lock_shared(741126,100);
 PERFORM thesaurus.preparation_late_writer_oracle(p_stage,p_live_ids);
END $$""")
                cursor.execute("ALTER FUNCTION thesaurus.apply_prepared_objects(jsonb,text[])OWNER TO bertel_thesaurus_publisher")
                cursor.execute("COMMIT")
                instrumented = True
            except BaseException:
                cursor.execute("ROLLBACK")
                raise
        execute(barrier, "SELECT pg_advisory_lock(741126,100)")
        publisher = connect("late-writer-publisher", True)
        writer = connect("late-writer-editor", True)
        publisher_pid, writer_pid = publisher.get_backend_pid(), writer.get_backend_pid()

        def publish():
            try:
                result["publication"] = rpc(publisher, "publish", dict(revision_ids=[revision["revision_id"]],
                    expected_revision_versions={revision["revision_id"]: revision["version"]}, expected_release_id=previous,
                    idempotency_key="late-writer-" + uuid.uuid4().hex))
                publisher.commit()
                result["publisher_sqlstate"] = "00000"
            except psycopg2.Error as error:
                publisher.rollback()
                result["publisher_sqlstate"] = error.pgcode
                result["publisher_error"] = error.diag.message_primary

        def write_tag():
            try:
                with writer.cursor() as cursor:
                    cursor.execute("INSERT INTO public.tag_link(tag_id,target_table,target_pk)VALUES(%s,'object',%s)", (tag_id, object_id))
                    assert cursor.rowcount == 1, "Authenticated tag insertion was an RLS no-op"
                    cursor.execute("SELECT pg_current_xact_id()::text")
                    result["writer_top_xid"] = cursor.fetchone()[0]
                writer_inserted.set()
                assert commit_writer.wait(30), "Commit barrier was not released"
                if abort_writer.is_set():
                    writer.rollback()
                else:
                    writer.commit()
                    result["writer_sqlstate"] = "00000"
            except BaseException as error:
                writer.rollback()
                result["writer_sqlstate"] = getattr(error, "pgcode", None)
                result["writer_error"] = str(error)
                writer_inserted.set()

        publisher_thread = threading.Thread(target=publish, daemon=True)
        publisher_thread.start()
        wait_for(lambda: execute(observer, "SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=%s AND locktype='advisory'AND classid=741126 AND objid=100 AND NOT granted)", (publisher_pid,)), "Publication did not reach the post-validation barrier")
        assert execute(observer, "SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=%s AND locktype='advisory'AND classid=741126 AND objid=1 AND mode='ExclusiveLock'AND granted)", (publisher_pid,))
        writer_thread = threading.Thread(target=write_tag, daemon=True)
        writer_thread.start()
        wait_for(lambda: execute(observer, "SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=%s AND locktype='advisory'AND classid=741126 AND objid=1 AND mode='ShareLock'AND NOT granted)", (writer_pid,)), "Authenticated tag writer did not wait for the publisher's X1")
        assert publisher_thread.is_alive() and not writer_inserted.is_set()
        result["writer_waited_for_publication_fence"] = True
        execute(barrier, "SELECT pg_advisory_unlock(741126,100)")
        publisher_thread.join(35)
        assert not publisher_thread.is_alive(), "Publication did not finish"
        assert result.get("publisher_sqlstate") == "00000", result
        assert writer_inserted.wait(20), "Tag writer did not resume after publication"
        assert "writer_error" not in result, result
        # The resumed writer is still uncommitted. This fresh MVCC read isolates
        # publication's business/version effects from legitimate writer effects.
        assert business_rows(ids) == before_business, "Publication changed committed object business/version/sync columns"
        assert versions(ids) == before_versions, "Publication fabricated an object version"
        result["publisher_business_and_version_preserved_before_writer_commit"] = True
        result["before_publication_versions"] = before_versions
        commit_writer.set()
        writer_thread.join(35)
        assert not writer_thread.is_alive() and result.get("writer_sqlstate") == "00000", result
        assert execute(setup, "SELECT count(*)FROM public.tag_link WHERE tag_id=%s AND target_table='object'AND target_pk=%s", (tag_id, object_id)) == 1
        assert execute(setup, "SELECT EXISTS(SELECT 1 FROM thesaurus.mutation_journal WHERE top_xid=%s::xid8 AND owner_id=%s)", (result["writer_top_xid"], object_id)), "The post-publication writer's journal entry was lost"
        result["post_publication_writer_journal_preserved"] = True
        search_text = execute(setup, "SELECT search_document_text FROM public.object WHERE id=%s", (object_id,))
        assert tag_name.casefold() in (search_text or "").casefold(), "The tag committed after publication is missing from the final search projection"
        result["tag_assignment_and_payload_preserved"] = True
        result["post_writer_versions"] = versions(ids)
        result["success_oracle"] = verify_success(setup, ids, business_rows(ids),
            result["publication"]["release_id"], concept, document["name"])
        result["passed"] = True
    except BaseException as error:
        result["failure"] = str(error)
        raise
    finally:
        abort_writer.set()
        commit_writer.set()
        execute(barrier, "SELECT pg_advisory_unlock_all()")
        for thread, connection in ((publisher_thread, publisher), (writer_thread, writer)):
            if thread and thread.is_alive():
                connection.cancel()
                thread.join(5)
            if connection:
                connection.close()
        if instrumented:
            execute(setup, original)
            execute(setup, "DROP FUNCTION thesaurus.preparation_late_writer_oracle(jsonb,text[])")
            result["instrumentation_restored_exactly"] = fingerprint() == fingerprints
        else:
            result["instrumentation_restored_exactly"] = not instrumented
        result["passed"] = result["passed"] and result["instrumentation_restored_exactly"]
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        observer.close()
        barrier.close()
        setup.close()
        assert result["instrumentation_restored_exactly"], "Original helper definitions/owners/ACLs were not restored"


if __name__ == "__main__":
    main()
