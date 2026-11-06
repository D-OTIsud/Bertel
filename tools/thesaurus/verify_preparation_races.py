"""Adversarial, real-role, two-connection publication preparation checks.

Only a newly created loopback database is accepted. The temporary barrier wraps
the pure preparation helper in that database; production SQL has no test hook.
All original function definitions/owners/ACLs are checked after restoration.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import threading
import time
import uuid

import psycopg2
from psycopg2 import sql
from psycopg2.extras import Json
from preparation_test_oracle import BUSINESS_EXCLUDED_COLUMNS, verify_success

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase/migrations/20261106160017_thesaurus_prepared_publication.sql"
SIGNATURE = "thesaurus.prepare_affected_objects(text[])"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--acl-source", type=Path, help="Captured production ACL metadata, for a schema-only template that omitted Supabase bootstrap ACLs")
    args = parser.parse_args()
    if not args.database.startswith("bertel_thesaurus_preparation_"):
        raise SystemExit("Only the isolated preparation-test database prefix is accepted")
    common = dict(host="127.0.0.1", port=55439, user="postgres", connect_timeout=10)
    admin = psycopg2.connect(dbname="postgres", **common)
    admin.autocommit = True
    with admin.cursor() as q:
        q.execute("SELECT 1 FROM pg_database WHERE datname=%s", (args.database,))
        if q.fetchone():
            raise SystemExit("Choose a new database name; existing databases are never overwritten")
        q.execute(sql.SQL("CREATE DATABASE {} TEMPLATE bertel_thesaurus_test").format(sql.Identifier(args.database)))
    admin.close()
    actor = str(uuid.uuid4())
    claims = json.dumps(dict(sub=actor, role="authenticated"))

    def connect(name, authenticated=False, role="authenticated"):
        c = psycopg2.connect(dbname=args.database, application_name=name, **common)
        with c.cursor() as q:
            q.execute("SET statement_timeout='30s'")
            q.execute("SELECT set_config('request.jwt.claims',%s,false)", (json.dumps(dict(sub=actor, role=role)),))
            if authenticated:
                q.execute(sql.SQL("SET ROLE {}").format(sql.Identifier(role)))
        c.commit()
        return c

    def execute(c, query, params=()):
        with c.cursor() as q:
            q.execute(query, params)
            return q.fetchone()[0] if q.description else None

    def rpc(c, action, payload):
        return execute(c, "SELECT api.thesaurus_admin(%s,%s::jsonb)", (action, Json(payload)))

    setup = connect("preparation-setup")
    setup.autocommit = True
    with setup.cursor() as q:
        if args.acl_source:
            metadata = json.loads(args.acl_source.read_text(encoding="utf-8"))
            # Restore only the application grants actually captured, and only
            # on pre-existing objects. Never grant an invented test super-role.
            privileges = dict(r="SELECT", a="INSERT", w="UPDATE", d="DELETE", D="TRUNCATE", x="REFERENCES", t="TRIGGER", m="MAINTAIN", U="USAGE")
            for role in ("authenticated", "service_role"):
                for entry in metadata["schemas"]:
                    if any(a.startswith(role + "=") and "U" in a.split("=", 1)[1].split("/", 1)[0] for a in entry["acl"] or []):
                        q.execute("SELECT to_regnamespace(%s)", (entry["name"],))
                        if q.fetchone()[0]:
                            q.execute(sql.SQL("GRANT USAGE ON SCHEMA {} TO {}").format(sql.Identifier(entry["name"]), sql.Identifier(role)))
                for entry in metadata["relations"]:
                    if entry["schema"] != "public":
                        continue
                    for grant in entry["acl"] or []:
                        if not grant.startswith(role + "="):
                            continue
                        modes = grant.split("=", 1)[1].split("/", 1)[0]
                        wanted = [privileges[x] for x in modes if x in privileges]
                        q.execute("SELECT to_regclass(%s)", ("public." + entry["name"],))
                        if wanted and q.fetchone()[0]:
                            kind = "SEQUENCE" if entry["kind"] == "S" else "TABLE"
                            q.execute(sql.SQL("GRANT {} ON {} {} TO {}").format(
                                sql.SQL(",".join(wanted)), sql.SQL(kind), sql.Identifier("public", entry["name"]), sql.Identifier(role)))
                for entry in metadata["functions"]:
                    if any(a.startswith(role + "=") and "X" in a.split("=", 1)[1].split("/", 1)[0] for a in entry["acl"] or []):
                        q.execute("SELECT CASE WHEN to_regprocedure(%s)IS NOT NULL THEN format('GRANT EXECUTE ON FUNCTION %%s TO %%I',to_regprocedure(%s),%s)END", (entry["signature"], entry["signature"], role))
                        grant = q.fetchone()[0]
                        if grant:
                            q.execute(grant)
        q.execute(MIGRATION.read_text(encoding="utf-8"))
        q.execute("SELECT current_release_id FROM thesaurus.instance WHERE singleton")
        assert q.fetchone()[0] is None, "Template must have no active publication"
        q.execute("SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)")
        q.execute("GRANT USAGE ON SCHEMA api TO authenticated")
        q.execute("INSERT INTO auth.users(id,email)VALUES(%s,%s)", (actor, actor + "@example.invalid"))
        q.execute("INSERT INTO public.app_user_profile(id,role)VALUES(%s,'super_admin')ON CONFLICT(id)DO UPDATE SET role='super_admin'", (actor,))
        q.execute("SELECT set_config('request.jwt.claims',%s,false)", (claims,))
    source = str(uuid.uuid4())
    tag = str(uuid.uuid4())
    execute(setup, "INSERT INTO public.ref_code_domain_registry(domain,name,object_type,is_hierarchical,is_taxonomy)VALUES('taxonomy_hlo','Preparation fixture','HLO',true,true)ON CONFLICT DO NOTHING")
    execute(setup, "INSERT INTO public.ref_code(id,domain,code,name,description)VALUES(%s,'taxonomy_hlo',%s,'Preparation original','Concurrent preparation fixture')", (source, "prepare_" + uuid.uuid4().hex[:10]))
    execute(setup, "INSERT INTO public.ref_tag(id,slug,name)VALUES(%s,%s,'Original tag')", (tag, "prepare_" + uuid.uuid4().hex[:10]))
    rpc(setup, "configure_instance", dict(base_uri="https://preparation.invalid/concepts/", license="fixture-only", attribution="Isolated test"))
    rpc(setup, "bootstrap", dict(domains=["taxonomy_hlo"], idempotency_key="preparation-bootstrap"))
    concept = execute(setup, "SELECT concept_id::text FROM thesaurus.concept WHERE source_id=%s AND domain='taxonomy_hlo'", (source,))

    with setup.cursor() as q:
        q.execute("SELECT pg_get_functiondef(oid),md5(pg_get_functiondef(oid)),proowner,proacl::text FROM pg_proc WHERE oid=%s::regprocedure", (SIGNATURE,))
        original, checksum, owner, acl = q.fetchone()
        # Test-only instrumentation: the result and its snapshot are obtained
        # before waiting, precisely where a concurrent edit could stale them.
        oracle = original.replace("FUNCTION thesaurus.prepare_affected_objects(", "FUNCTION thesaurus.preparation_test_oracle(", 1)
        assert oracle != original
        q.execute(oracle)
        q.execute("ALTER FUNCTION thesaurus.preparation_test_oracle(text[])OWNER TO bertel_thesaurus_publisher")
        q.execute("REVOKE ALL ON FUNCTION thesaurus.preparation_test_oracle(text[])FROM PUBLIC")
        q.execute("""CREATE OR REPLACE FUNCTION thesaurus.prepare_affected_objects(p_object_ids text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,thesaurus AS $$
DECLARE staged jsonb;
BEGIN
 staged:=thesaurus.preparation_test_oracle(p_object_ids);
 IF cardinality(p_object_ids)>0 THEN PERFORM pg_advisory_xact_lock_shared(741126,99);END IF;
 RETURN staged;
END $$""")
        q.execute("ALTER FUNCTION thesaurus.prepare_affected_objects(text[])OWNER TO bertel_thesaurus_publisher")

    results = dict(database=args.database, fixture="isolated-local", actual_role="authenticated", cases=[])
    observer = connect("preparation-observer")
    observer.autocommit = True
    barrier = connect("preparation-barrier")
    barrier.autocommit = True
    serial = 0

    def new_fixture():
        nonlocal serial
        serial += 1
        ids = [f"HLOPREP{serial:04d}{i:05d}" for i in range(3)]
        for oid in ids:
            execute(setup, "INSERT INTO public.object(id,object_type,name,status)VALUES(%s,'HLO','Preparation object','published')", (oid,))
            execute(setup, "INSERT INTO public.object_description(object_id,description,visibility)VALUES(%s,'Original description','public')", (oid,))
        for oid in ids[:2]:
            execute(setup, "INSERT INTO public.object_taxonomy(object_id,domain,ref_code_id)VALUES(%s,'taxonomy_hlo',%s)", (oid, source))
        execute(setup, "INSERT INTO public.tag_link(tag_id,target_table,target_pk)VALUES(%s,'object',%s)", (tag, ids[0]))
        return ids

    def draft():
        doc = execute(setup, "SELECT thesaurus.concept_document(%s::uuid)", (concept,))
        doc["name"] = "Preparation publication " + uuid.uuid4().hex[:10]
        r = rpc(setup, "save_draft", dict(concept_id=concept, expected_version=0, document=doc))
        r = rpc(setup, "validate_draft", dict(revision_id=r["revision_id"], expected_version=r["version"]))
        r["_expected_name"] = doc["name"]
        return r

    def capture_rows(ids):
        with setup.cursor() as q:
            q.execute("SELECT id,current_version,md5(to_jsonb(o)::text)FROM public.object o WHERE id=ANY(%s)ORDER BY id", (ids,))
            complete = q.fetchall()
            q.execute("SELECT id,md5((to_jsonb(o)-%s::text[])::text)FROM public.object o WHERE id=ANY(%s)ORDER BY id", (list(BUSINESS_EXCLUDED_COLUMNS), ids))
            business = q.fetchall()
        return complete, business

    def case(name, expected="PT409", before=None, during=None, verify=None, after=None, writer_role="authenticated", late_commit=False):
        ids = new_fixture()
        revision = draft()
        previous = execute(setup, "SELECT current_release_id FROM thesaurus.instance WHERE singleton")
        old_name = execute(setup, "SELECT name FROM public.ref_code WHERE id=%s AND domain='taxonomy_hlo'", (source,))
        old_outbox = execute(setup, "SELECT count(*)FROM thesaurus.outbox")
        record = dict(name=name, expected_sqlstate=expected, writer_role=writer_role)
        writer = connect("preparation-writer-" + name, True, writer_role)
        pending = before(writer, ids, record) if before else None
        execute(barrier, "SELECT pg_advisory_lock(741126,99)")
        publisher = connect("preparation-publisher-" + name, True)
        pid = publisher.get_backend_pid()

        def publish():
            try:
                record["publication"] = rpc(publisher, "publish", dict(
                    revision_ids=[revision["revision_id"]],
                    expected_revision_versions={revision["revision_id"]: revision["version"]},
                    expected_release_id=previous,
                    idempotency_key="prep-" + uuid.uuid4().hex))
                publisher.commit()
                record["sqlstate"] = "00000"
            except psycopg2.Error as er:
                publisher.rollback()
                record["sqlstate"] = er.pgcode
                record["message"] = er.diag.message_primary
            finally:
                publisher.close()

        thread = threading.Thread(target=publish)
        thread.start()
        try:
            deadline = time.monotonic() + 20
            while time.monotonic() < deadline and thread.is_alive():
                waiting = execute(observer, "SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=%s AND locktype='advisory'AND classid=741126 AND objid=99 AND NOT granted)", (pid,))
                if waiting:
                    break
                time.sleep(.01)
            else:
                raise AssertionError(f"Publisher did not reach post-snapshot barrier: {record}")
            record["preparation_holds_source_only"] = execute(observer, "SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=%s AND locktype='advisory'AND classid=741126 AND objid=2 AND mode='ExclusiveLock'AND granted)AND NOT EXISTS(SELECT 1 FROM pg_locks WHERE pid=%s AND locktype='advisory'AND classid=741126 AND objid=1)", (pid, pid))
            assert record["preparation_holds_source_only"]
            if name == "tag-link":
                prune_started = time.monotonic()
                assert execute(setup, "SELECT thesaurus.prune_mutation_journal(10000)") == 0
                record["busy_pruner_ms"] = round((time.monotonic() - prune_started) * 1000, 2)
                assert record["busy_pruner_ms"] < 1000
            started = time.monotonic()
            if during:
                during(writer, ids, record, pending)
            record["concurrent_operation_ms"] = round((time.monotonic() - started) * 1000, 2)
            if not late_commit:
                writer.rollback()  # An explicit callback commit is never undone.
                committed_rows, business_rows = capture_rows(ids)
        finally:
            try:
                execute(barrier, "SELECT pg_advisory_unlock(741126,99)")
                if late_commit and thread.is_alive():
                    deadline = time.monotonic() + 1.5
                    while time.monotonic() < deadline:
                        polling = execute(observer, "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=%s AND wait_event='PgSleep')", (pid,))
                        if polling:
                            break
                        time.sleep(.001)
                    else:
                        raise AssertionError("Did not observe the late try-lock loop")
                    assert not execute(observer, "SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=%s AND locktype='advisory'AND classid=741126 AND objid=1 AND mode='ExclusiveLock'AND NOT granted)", (pid,))
                    arriving = connect("preparation-arriving-editor", True)
                    try:
                        started = time.monotonic()
                        with arriving.cursor() as q:
                            q.execute("UPDATE public.object SET name='Arriving editor retained'WHERE id=%s", (ids[2],))
                            assert q.rowcount == 1
                        arriving.commit()
                    finally:
                        arriving.close()
                    record["arriving_editor_ms"] = round((time.monotonic() - started) * 1000, 2)
                    assert record["arriving_editor_ms"] < 1000, record
                    record["late_writer_polled_without_queued_exclusive"] = True
                    writer.commit()
                    committed_rows, business_rows = capture_rows(ids)
                thread.join(35)
            finally:
                # Closing an uncommitted writer releases S1 even when an
                # observation assertion fails before the normal join/commit.
                try:
                    writer.close()
                finally:
                    thread.join(35)
        assert not thread.is_alive(), "Publisher failed to terminate"
        if after:
            after()
        assert record["sqlstate"] == expected, record
        if expected != "00000":
            assert execute(setup, "SELECT current_release_id FROM thesaurus.instance WHERE singleton") == previous, record
            assert execute(setup, "SELECT name FROM public.ref_code WHERE id=%s AND domain='taxonomy_hlo'", (source,)) == old_name, record
            assert execute(setup, "SELECT count(*)FROM thesaurus.outbox") == old_outbox, record
            with setup.cursor() as q:
                q.execute("SELECT id,current_version,md5(to_jsonb(o)::text)FROM public.object o WHERE id=ANY(%s)ORDER BY id", (ids,))
                assert q.fetchall() == committed_rows, record
            record["concurrent_object_rows_preserved"] = True
            assert execute(setup, "SELECT status FROM thesaurus.revision WHERE revision_id=%s", (revision["revision_id"],)) == "validated", record
            # Role-revocation cases restore the actor solely through trusted local
            # maintenance, after recording the rejected authenticated publication.
            execute(setup, "SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)")
            execute(setup, "UPDATE public.app_user_profile SET role='super_admin'WHERE id=%s", (actor,))
            execute(setup, "SELECT set_config('request.jwt.claims',%s,false)", (claims,))
            rpc(setup, "discard_draft", dict(revision_id=revision["revision_id"], expected_version=revision["version"]))
            record["publication_fully_rolled_back"] = True
        else:
            record["success_oracle"] = verify_success(setup, ids, business_rows,
                record["publication"]["release_id"], concept, revision["_expected_name"])
        if verify:
            verify(ids, record)
            assert all(value for key, value in record.items() if key.endswith("_preserved")), record
        record["passed"] = True
        results["cases"].append(record)
        print(json.dumps(record), flush=True)

    def mutation(query, params):
        def callback(c, ids, record, pending):
            with c.cursor() as q:
                q.execute(query, params(ids))
                assert q.rowcount > 0, "RLS or fixture made the intended mutation a no-op"
                record["mutation_row_count"] = q.rowcount
            c.commit()
        return callback

    try:
        case("tag-link", during=mutation("INSERT INTO public.tag_link(tag_id,target_table,target_pk)VALUES(%s,'object',%s)", lambda ids: (tag, ids[1])))
        case("tag-rename", writer_role="service_role", during=mutation("UPDATE public.ref_tag SET name=name||' changed'WHERE id=%s", lambda ids: (tag,)))
        case("new-owner", during=mutation("INSERT INTO public.object_taxonomy(object_id,domain,ref_code_id)VALUES(%s,'taxonomy_hlo',%s)", lambda ids: (ids[2], source)))
        case("removed-owner", during=mutation("DELETE FROM public.object_taxonomy WHERE object_id=%s", lambda ids: (ids[0],)))
        case("deleted-owner", during=mutation("DELETE FROM public.object WHERE id=%s", lambda ids: (ids[0],)), verify=lambda ids, r: r.update(deletion_preserved=execute(setup, "SELECT count(*)FROM public.object WHERE id=%s", (ids[0],)) == 0))

        def pending_edit(c, ids, record):
            with c.cursor() as q:
                q.execute("UPDATE public.object_description SET description='Older uncommitted writer'WHERE object_id=%s", (ids[0],))
                assert q.rowcount == 1, "Pending writer must actually change its description"
            record["writer_top_xid"] = execute(c, "SELECT pg_current_xact_id()::text")

        case("older-transaction-late-commit", before=pending_edit, during=lambda c, ids, r, p: c.commit())
        case("writer-held-through-late-fence", before=pending_edit, late_commit=True)
        case("rolled-back-writer", expected="00000", before=pending_edit, during=lambda c, ids, r, p: c.rollback())

        def savepoint_edit(c, ids, record):
            execute(c, "SELECT pg_current_xact_id()")
            execute(c, "SAVEPOINT child_edit")
            pending_edit(c, ids, record)
            record["row_sub_xid"] = execute(c, "SELECT xmin::text FROM public.object_description WHERE object_id=%s", (ids[0],))
            assert record["writer_top_xid"] != record["row_sub_xid"], record
            execute(c, "RELEASE SAVEPOINT child_edit")

        case("savepoint-top-xid", before=savepoint_edit, during=lambda c, ids, r, p: c.commit())

        def out_of_order(c, ids, record):
            pending_edit(c, ids, record)
            higher = connect("preparation-higher-xid", True)
            with higher.cursor() as q:
                q.execute("UPDATE public.object_description SET description='Higher xid committed first'WHERE object_id=%s", (ids[2],))
                assert q.rowcount == 1
            record["higher_xid"] = execute(higher, "SELECT pg_current_xact_id()::text")
            higher.commit()
            higher.close()
            assert int(record["higher_xid"]) > int(record["writer_top_xid"])
            record["pruned_while_older_writer_in_progress"] = execute(setup, "SELECT thesaurus.prune_mutation_journal(10000)")
            assert record["pruned_while_older_writer_in_progress"] > 0

        case("out-of-order-commit", before=out_of_order, during=lambda c, ids, r, p: c.commit())
        case("unrelated-owner", expected="00000", during=mutation("UPDATE public.object_description SET description='Unrelated edit retained'WHERE object_id=%s", lambda ids: (ids[2],)))
        case("object-name-only", expected="00000", during=mutation("UPDATE public.object SET name='Unsaved editor name retained'WHERE id=%s", lambda ids: (ids[0],)), verify=lambda ids, r: r.update(name_preserved=execute(setup, "SELECT name FROM public.object WHERE id=%s", (ids[0],)) == "Unsaved editor name retained"))

        def prepare_parent(c, ids, record):
            return execute(setup, "INSERT INTO public.object_place(object_id,label)VALUES(%s,'Transfer witness')RETURNING id", (ids[0],))

        def transfer_parent(c, ids, record, pending):
            execute(c, "UPDATE public.object_place SET object_id=%s WHERE id=%s", (ids[2], pending))
            top = execute(c, "SELECT pg_current_xact_id()::text")
            c.commit()
            owners = execute(setup, "SELECT array_agg(owner_id ORDER BY owner_id)FROM thesaurus.mutation_journal WHERE top_xid=%s::xid8", (top,))
            assert ids[0] in owners and ids[2] in owners, owners
            record["old_and_new_owners_journaled"] = True

        case("parent-transfer", before=prepare_parent, during=transfer_parent)

        def revoke(c, ids, record, pending):
            # A local trusted administrator acts as the second RBAC connection.
            privileged = connect("preparation-authority-revoker")
            execute(privileged, "SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)")
            execute(privileged, "UPDATE public.app_user_profile SET role='tourism_agent'WHERE id=%s", (actor,))
            privileged.commit()
            privileged.close()

        case("authority-revoked", expected="42501", during=revoke)

        # This case is separate because the row lock must remain held until the
        # publication returns; NOWAIT must prevent an RBAC wait under X1.
        held = {}
        def keep_profile_lock(c, ids, record, pending):
            privileged = connect("preparation-authority-locker")
            execute(privileged, "SELECT id FROM public.app_user_profile WHERE id=%s FOR UPDATE", (actor,))
            held["connection"] = privileged
        try:
            case("authority-row-locked", expected="PT409", during=keep_profile_lock,
                 after=lambda: held["connection"].rollback())
        finally:
            if "connection" in held:
                held["connection"].rollback()
                held["connection"].close()

        def mixed(c, ids, record, pending):
            execute(c, "UPDATE public.object SET name='Mixed writer'WHERE id=%s", (ids[0],))
            started = time.monotonic()
            try:
                rpc(c, "configure_domain", dict(domain="taxonomy_hlo", is_public=True))
                raise AssertionError("Mixed S1→S2 transaction unexpectedly waited/succeeded")
            except psycopg2.Error as er:
                assert er.pgcode == "PT409", er
                c.rollback()
                record["mixed_transaction_sqlstate"] = er.pgcode
                record["mixed_transaction_ms"] = round((time.monotonic() - started) * 1000, 2)
                assert record["mixed_transaction_ms"] < 1000
        case("mixed-lock-order", expected="00000", during=mixed)

        isolated = connect("preparation-repeatable-read", True)
        execute(isolated, "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")
        r = draft()
        try:
            rpc(isolated, "publish", dict(revision_ids=[r["revision_id"]], expected_revision_versions={r["revision_id"]: r["version"]}, idempotency_key="repeatable-read"))
            raise AssertionError("REPEATABLE READ caller accepted")
        except psycopg2.Error as er:
            assert er.pgcode == "PT409", er
            results["repeatable_read_rejected"] = True
        finally:
            isolated.rollback()
            isolated.close()
            rpc(setup, "discard_draft", dict(revision_id=r["revision_id"], expected_version=r["version"]))

        try:
            execute(setup, "TRUNCATE public.tag_link")
            raise AssertionError("Active publication allowed TRUNCATE")
        except psycopg2.Error as er:
            assert er.pgcode in ("PT409", "42501"), er
            results["truncate_rejected"] = True
        assert all(r["passed"] for r in results["cases"])
        results["passed"] = True
    finally:
        execute(barrier, "SELECT pg_advisory_unlock_all()")
        with setup.cursor() as q:
            q.execute(original)
            q.execute("DROP FUNCTION thesaurus.preparation_test_oracle(text[])")
            q.execute("SELECT md5(pg_get_functiondef(oid)),proowner,proacl::text FROM pg_proc WHERE oid=%s::regprocedure", (SIGNATURE,))
            restored = q.fetchone()
        results["instrumentation_restored_exactly"] = restored == (checksum, owner, acl)
        assert results["instrumentation_restored_exactly"], restored
        observer.close()
        barrier.close()
        setup.close()
        args.output.write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
