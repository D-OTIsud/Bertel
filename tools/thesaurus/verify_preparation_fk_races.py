"""Real authenticated FK writers while name-only publication holds X2, not X1.

Creates a new loopback fixture database, never overwrites a database, and restores
the exact pure-preparation function after its test-only post-snapshot barrier.
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
from psycopg2.extras import Json


SIGNATURE = "thesaurus.prepare_affected_objects(text[])"


def restore_captured_acl(cursor, path):
    """Apply only application grants captured from the real source catalog."""
    metadata = json.loads(path.read_text(encoding="utf-8"))
    privileges = dict(r="SELECT", a="INSERT", w="UPDATE", d="DELETE", D="TRUNCATE",
                      x="REFERENCES", t="TRIGGER", m="MAINTAIN")
    for role in ("authenticated", "service_role"):
        for entry in metadata["schemas"]:
            if any(a.startswith(role + "=") and "U" in a.split("=", 1)[1].split("/", 1)[0]
                   for a in entry["acl"] or []):
                cursor.execute("SELECT to_regnamespace(%s)", (entry["name"],))
                if cursor.fetchone()[0]:
                    cursor.execute(sql.SQL("GRANT USAGE ON SCHEMA {} TO {}").format(
                        sql.Identifier(entry["name"]), sql.Identifier(role)))
        for entry in metadata["relations"]:
            if entry["schema"] != "public":
                continue
            for grant in entry["acl"] or []:
                if not grant.startswith(role + "="):
                    continue
                wanted = [privileges[x] for x in grant.split("=", 1)[1].split("/", 1)[0]
                          if x in privileges]
                cursor.execute("SELECT to_regclass(%s)", ("public." + entry["name"],))
                if wanted and cursor.fetchone()[0]:
                    cursor.execute(sql.SQL("GRANT {} ON {} {} TO {}").format(
                        sql.SQL(",".join(wanted)),
                        sql.SQL("SEQUENCE" if entry["kind"] == "S" else "TABLE"),
                        sql.Identifier("public", entry["name"]), sql.Identifier(role)))
        for entry in metadata["functions"]:
            if any(a.startswith(role + "=") and "X" in a.split("=", 1)[1].split("/", 1)[0]
                   for a in entry["acl"] or []):
                cursor.execute("SELECT CASE WHEN to_regprocedure(%s) IS NOT NULL THEN "
                               "format('GRANT EXECUTE ON FUNCTION %%s TO %%I',"
                               "to_regprocedure(%s),%s)END", (entry["signature"], entry["signature"], role))
                grant = cursor.fetchone()[0]
                if grant:
                    cursor.execute(grant)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", required=True)
    parser.add_argument("--template", default="bertel_thesaurus_prepared_activate_test")
    parser.add_argument("--acl-source", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if not args.database.startswith("bertel_thesaurus_prepared_fk_"):
        raise SystemExit("Only the isolated FK-test database prefix is accepted")
    if not args.template.startswith("bertel_thesaurus_"):
        raise SystemExit("Only a local thesaurus test template is accepted")
    common = dict(host="127.0.0.1", port=55439, user="postgres", connect_timeout=10)
    admin = psycopg2.connect(dbname="postgres", **common)
    admin.autocommit = True
    with admin.cursor() as q:
        q.execute("SELECT 1 FROM pg_database WHERE datname=%s", (args.database,))
        if q.fetchone():
            raise SystemExit("Choose a new database; existing databases are never overwritten")
        q.execute(sql.SQL("CREATE DATABASE {} TEMPLATE {}").format(
            sql.Identifier(args.database), sql.Identifier(args.template)))
    admin.close()
    actor = str(uuid.uuid4())
    claims = json.dumps(dict(sub=actor, role="authenticated"))

    def connect(name, authenticated=False):
        connection = psycopg2.connect(dbname=args.database, application_name=name, **common)
        with connection.cursor() as q:
            q.execute("SET statement_timeout='8s'")
            q.execute("SELECT set_config('request.jwt.claims',%s,false)", (claims,))
            if authenticated:
                q.execute("SET ROLE authenticated")
        connection.commit()
        return connection

    def execute(connection, query, params=()):
        with connection.cursor() as q:
            q.execute(query, params)
            return q.fetchone()[0] if q.description else None

    def rpc(connection, action, payload):
        return execute(connection, "SELECT api.thesaurus_admin(%s,%s::jsonb)", (action, Json(payload)))

    setup = connect("prepared-fk-setup")
    setup.autocommit = True
    with setup.cursor() as q:
        if args.acl_source:
            restore_captured_acl(q, args.acl_source)
        q.execute("SELECT current_release_id FROM thesaurus.instance WHERE singleton")
        assert q.fetchone()[0] is None, "Template must be unactivated"
        q.execute("SELECT set_config('request.jwt.claims','{}',false)")
        q.execute("INSERT INTO auth.users(id,email)VALUES(%s,%s)", (actor, actor + "@example.invalid"))
        q.execute("INSERT INTO public.app_user_profile(id,role)VALUES(%s,'super_admin')"
                  "ON CONFLICT(id)DO UPDATE SET role='super_admin'", (actor,))
        q.execute("SELECT set_config('request.jwt.claims',%s,false)", (claims,))
    ids = {name: str(uuid.uuid4()) for name in
           ("term", "family", "amenity", "scheme", "value", "detail", "language", "category", "action")}
    token = uuid.uuid4().hex[:10]
    object_ids = ["HOTFK" + token.upper() + suffix for suffix in ("A", "B", "C")]
    execute(setup, "INSERT INTO public.ref_code_domain_registry(domain,name,object_type,is_hierarchical,is_taxonomy)"
                  "VALUES('taxonomy_hlo','FK fixture','HLO',true,true)ON CONFLICT DO NOTHING")
    for key, domain in (("term", "taxonomy_hlo"), ("family", "amenity_family")):
        execute(setup, "INSERT INTO public.ref_code(id,domain,code,name,description)VALUES(%s,%s,%s,%s,'Definition fixture')",
                (ids[key], domain, "fk_" + key + token, "Original " + key))
    execute(setup, "INSERT INTO public.ref_amenity(id,code,name,family_id,description)VALUES(%s,%s,'Original amenity',%s,'Definition fixture')",
            (ids["amenity"], "fk_amenity" + token, ids["family"]))
    execute(setup, "INSERT INTO public.ref_classification_scheme(id,code,name,description,is_distinction)VALUES(%s,%s,'Original scheme','Definition fixture',true)",
            (ids["scheme"], "FK_SCHEME" + token))
    for key in ("value", "detail"):
        execute(setup, "INSERT INTO public.ref_classification_value(id,scheme_id,code,name)VALUES(%s,%s,%s,%s)",
                (ids[key], ids["scheme"], "fk_" + key + token, "Original " + key))
    execute(setup, "INSERT INTO public.ref_language(id,code,name)VALUES(%s,'qaa','Original language')", (ids["language"],))
    execute(setup, "INSERT INTO public.ref_commune(insee_code,name)VALUES('97499','Original commune')")
    execute(setup, "INSERT INTO public.ref_sustainability_action_category(id,code,name,description)VALUES(%s,%s,'Original category','Definition fixture')",
            (ids["category"], "fk_category" + token))
    execute(setup, "INSERT INTO public.ref_sustainability_action(id,category_id,code,label,description)VALUES(%s,%s,%s,'Original action','Definition fixture')",
            (ids["action"], ids["category"], "fk_action" + token))
    for oid in object_ids:
        execute(setup, "INSERT INTO public.object(id,object_type,name,status)VALUES(%s,'HOT','FK object','published')", (oid,))

    def assignment(connection, kind, oid):
        with connection.cursor() as q:
            if kind == "classification_value":
                q.execute("INSERT INTO public.object_classification(id,object_id,scheme_id,value_id,subvalue_ids,status)"
                          "VALUES(%s,%s,%s,%s,ARRAY[%s]::uuid[],'granted')",
                          (str(uuid.uuid4()), oid, ids["scheme"], ids["value"], ids["detail"]))
            else:
                q.execute("INSERT INTO public.object_sustainability_action(object_id,action_id)VALUES(%s,%s)", (oid, ids["action"]))
            assert q.rowcount == 1

    assignment(setup, "classification_value", object_ids[0])
    assignment(setup, "sustainability_action", object_ids[0])
    domains = ["taxonomy_hlo", "amenity_family", "amenity", "classification_scheme", "classification_value",
               "language", "commune", "sustainability_category", "sustainability_action"]
    rpc(setup, "configure_instance", dict(base_uri="https://fk.invalid/concepts/", license="fixture-only", attribution="Isolated FK test"))
    bootstrap = connect("prepared-fk-bootstrap", True)
    rpc(bootstrap, "bootstrap", dict(domains=domains, idempotency_key="fk-bootstrap"))
    bootstrap.commit()
    bootstrap.close()
    source_ids = [("ref_code", ids["term"]), ("amenity", ids["amenity"]),
                  ("classification_scheme", ids["scheme"]), ("classification_value", ids["value"]),
                  ("language", ids["language"]), ("commune", "97499"),
                  ("sustainability_category", ids["category"]), ("sustainability_action", ids["action"])]

    def draft(kind, source, marker):
        cid = execute(setup, "SELECT concept_id::text FROM thesaurus.concept WHERE source_kind=%s AND source_id=%s", (kind, source))
        doc = execute(setup, "SELECT thesaurus.concept_document(%s::uuid)", (cid,))
        doc["name"] = doc["name"] + marker
        revision = rpc(setup, "save_draft", dict(concept_id=cid, expected_version=0, document=doc))
        revision = rpc(setup, "validate_draft", dict(revision_id=revision["revision_id"], expected_version=revision["version"]))
        assert revision["status"] == "validated" and not revision["errors"], revision
        return revision

    def publish_payload(revisions):
        return dict(revision_ids=[r["revision_id"] for r in revisions],
                    expected_revision_versions={r["revision_id"]: r["version"] for r in revisions},
                    expected_release_id=execute(setup, "SELECT current_release_id FROM thesaurus.instance WHERE singleton"),
                    idempotency_key="fk-" + uuid.uuid4().hex)

    results = dict(database=args.database, actual_role="authenticated", fixture="isolated-local", passed=False, cases=[])
    # A fresh backend, unlike a multi-publication SQL DO, has no previously held
    # X1. Every source adapter really updates its native name before late X1.
    batch = [draft(kind, source, " freshly published") for kind, source in source_ids]
    publisher = connect("prepared-fk-all-eight", True)
    publication = rpc(publisher, "publish", publish_payload(batch))
    publisher.commit()
    publisher.close()
    for kind, source in source_ids:
        name = execute(setup, "SELECT COALESCE(payload->>'name',payload->>'label')FROM thesaurus.source_rows WHERE source_kind=%s AND source_id=%s", (kind, source))
        assert name.endswith(" freshly published"), (kind, name)
    results["fresh_backend_eight_native_renames"] = dict(passed=True, release=publication["release_id"], source_kinds=[k for k, _ in source_ids])

    with setup.cursor() as q:
        q.execute("SELECT pg_get_functiondef(oid),md5(pg_get_functiondef(oid)),proowner,proacl::text FROM pg_proc WHERE oid=%s::regprocedure", (SIGNATURE,))
        original, checksum, owner, acl = q.fetchone()
        oracle = original.replace("FUNCTION thesaurus.prepare_affected_objects(", "FUNCTION thesaurus.fk_preparation_oracle(", 1)
        assert oracle != original
        q.execute(oracle)
        q.execute("ALTER FUNCTION thesaurus.fk_preparation_oracle(text[])OWNER TO bertel_thesaurus_publisher")
        q.execute("REVOKE ALL ON FUNCTION thesaurus.fk_preparation_oracle(text[])FROM PUBLIC")
        q.execute("""CREATE OR REPLACE FUNCTION thesaurus.prepare_affected_objects(p_object_ids text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,thesaurus AS $$
DECLARE staged jsonb;
BEGIN
 staged:=thesaurus.fk_preparation_oracle(p_object_ids);
 IF cardinality(p_object_ids)>0 THEN PERFORM pg_advisory_xact_lock_shared(741126,98);END IF;
 RETURN staged;
END $$""")
        q.execute("ALTER FUNCTION thesaurus.prepare_affected_objects(text[])OWNER TO bertel_thesaurus_publisher")
    observer = connect("prepared-fk-observer")
    observer.autocommit = True
    barrier = connect("prepared-fk-barrier")
    barrier.autocommit = True

    def object_hashes():
        with setup.cursor() as q:
            q.execute("SELECT id,md5(to_jsonb(o)::text)FROM public.object o WHERE id=ANY(%s)ORDER BY id", (object_ids,))
            return q.fetchall()

    try:
        for index, kind in enumerate(("classification_value", "sustainability_action"), 1):
            source = ids["value"] if kind == "classification_value" else ids["action"]
            revision = draft(kind, source, " refused concurrent rename")
            payload = publish_payload([revision])
            old_source = execute(setup, "SELECT payload FROM thesaurus.source_rows WHERE source_kind=%s AND source_id=%s", (kind, source))
            old_release_count = execute(setup, "SELECT count(*)FROM thesaurus.release")
            old_outbox = execute(setup, "SELECT count(*)FROM thesaurus.outbox")
            record = dict(source_kind=kind, passed=False)
            results["cases"].append(record)
            execute(barrier, "SELECT pg_advisory_lock(741126,98)")
            publisher = connect("prepared-fk-publisher-" + kind, True)
            pid = publisher.get_backend_pid()

            def publish():
                try:
                    record["publication"] = rpc(publisher, "publish", payload)
                    publisher.commit()
                    record["sqlstate"] = "00000"
                except psycopg2.Error as error:
                    publisher.rollback()
                    record["sqlstate"] = error.pgcode
                    record["message"] = error.diag.message_primary
                finally:
                    publisher.close()

            thread = threading.Thread(target=publish)
            thread.start()
            try:
                deadline = time.monotonic() + 6
                while thread.is_alive() and time.monotonic() < deadline:
                    waiting = execute(observer, "SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=%s AND locktype='advisory'AND classid=741126 AND objid=98 AND NOT granted)", (pid,))
                    if waiting:
                        break
                    time.sleep(.005)
                else:
                    raise AssertionError("Publisher did not reach the post-snapshot barrier: " + repr(record))
                record["preparation_holds_x2_without_k1"] = execute(observer, "SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=%s AND locktype='advisory'AND classid=741126 AND objid=2 AND mode='ExclusiveLock'AND granted)AND NOT EXISTS(SELECT 1 FROM pg_locks WHERE pid=%s AND locktype='advisory'AND classid=741126 AND objid=1)", (pid, pid))
                assert record["preparation_holds_x2_without_k1"]
                writer = connect("prepared-fk-writer-" + kind, True)
                try:
                    execute(writer, "SET LOCAL lock_timeout='900ms'")
                    started = time.monotonic()
                    assignment(writer, kind, object_ids[index])
                    writer.commit()
                    record["authenticated_assignment_commit_ms"] = round((time.monotonic() - started) * 1000, 2)
                    assert record["authenticated_assignment_commit_ms"] < 1000, record
                finally:
                    writer.close()
                committed_objects = object_hashes()
            finally:
                execute(barrier, "SELECT pg_advisory_unlock(741126,98)")
                thread.join(timeout=10)
            assert not thread.is_alive(), "Publisher did not finish"
            assert record["sqlstate"] == "PT409", record
            assert execute(setup, "SELECT current_release_id FROM thesaurus.instance WHERE singleton") == payload["expected_release_id"]
            assert execute(setup, "SELECT count(*)FROM thesaurus.release") == old_release_count
            assert execute(setup, "SELECT count(*)FROM thesaurus.outbox") == old_outbox
            assert execute(setup, "SELECT payload FROM thesaurus.source_rows WHERE source_kind=%s AND source_id=%s", (kind, source)) == old_source
            assert execute(setup, "SELECT status FROM thesaurus.revision WHERE revision_id=%s", (revision["revision_id"],)) == "validated"
            assert object_hashes() == committed_objects, "Rejected publication changed an object after the committed writer"
            table = "object_classification" if kind == "classification_value" else "object_sustainability_action"
            assert execute(setup, sql.SQL("SELECT count(*)FROM public.{} WHERE object_id=%s").format(sql.Identifier(table)), (object_ids[index],)) == 1
            record["complete_publication_rollback_and_writer_retained"] = True
            record["passed"] = True
            rpc(setup, "discard_draft", dict(revision_id=revision["revision_id"], expected_version=revision["version"]))
        results["passed"] = True
    finally:
        execute(barrier, "SELECT pg_advisory_unlock_all()")
        with setup.cursor() as q:
            q.execute(original)
            q.execute("DROP FUNCTION thesaurus.fk_preparation_oracle(text[])")
            q.execute("SELECT md5(pg_get_functiondef(oid)),proowner,proacl::text FROM pg_proc WHERE oid=%s::regprocedure", (SIGNATURE,))
            results["instrumentation_restored_exactly"] = q.fetchone() == (checksum, owner, acl)
        assert results["instrumentation_restored_exactly"]
        observer.close()
        barrier.close()
        setup.close()
        args.output.write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
