"""Explicit, exceptional restoration of the disposable LOCAL cron benchmark.

This is never product code or part of publication. The captured 38 allowed IDs
come from the failed global restoration witness. Only four legacy business
triggers are briefly disabled, after all timing and concurrent workers finish.
The thesaurus fences/journal remain enabled. No role or ACL is changed.
"""
import argparse
from datetime import datetime
import json
from pathlib import Path

import psycopg2
from psycopg2 import sql
from psycopg2.extras import execute_values

DATABASE = "bertel_thesaurus_live_restore_20261106"
COLUMNS = "cached_amenity_codes,cached_payment_codes,cached_environment_tags,cached_language_codes,cached_classification_codes,cached_taxonomy_codes,search_document,search_document_text,search_document_phonetic"
TRIGGERS = ("trg_increment_object_version", "trg_object_version",
            "update_object_updated_at", "trg_audit_object")


def restore_local_cron_fixture(connection, expected_rows, allowed_differences):
    """Caller owns this one local maintenance transaction and must commit it."""
    parameters = connection.get_dsn_parameters()
    loopback = ("127.0.0.1", "localhost", "::1")
    if (parameters.get("host") not in loopback
            or parameters.get("hostaddr", "") not in ("", *loopback)
            or parameters.get("port") != "55439" or parameters.get("dbname") != DATABASE):
        raise RuntimeError("Repair requires the exact disposable loopback database on port 55439")
    expected = {row[0]: (row[1], row[2], row[3],
                datetime.fromisoformat(row[4]) if isinstance(row[4], str) else row[4])
                for row in expected_rows}
    allowed_ids = {row["id"] for row in allowed_differences}
    if len(allowed_ids) != 38:
        raise RuntimeError("Only the explicitly captured 38 cron side-effect IDs are authorized")
    with connection.cursor() as query:
        query.execute("SELECT current_database(),current_user,(SELECT rolsuper FROM pg_roles WHERE rolname=current_user)")
        if query.fetchone() != (DATABASE, "postgres", True):
            raise RuntimeError("Repair is restricted to the disposable loopback clone and local postgres superuser")
        query.execute("SELECT pid,application_name FROM pg_stat_activity WHERE datname=current_database()AND pid<>pg_backend_pid()")
        others = query.fetchall()
        if others:
            raise RuntimeError("Other clone workers must finish before exceptional restoration")
        query.execute("SELECT pg_advisory_xact_lock(741126,1)")
        query.execute("SELECT id,cached_is_open_now,md5(jsonb_build_array("+COLUMNS+")::text),current_version,updated_at FROM public.object ORDER BY id")
        current = {row[0]: tuple(row[1:]) for row in query.fetchall()}
        if current.keys() != expected.keys():
            raise RuntimeError("The complete object inventory changed; this repair is not authorized")
        repairs = []
        for owner, before in expected.items():
            after = current[owner]
            if after[1] != before[1]:
                raise RuntimeError("A nine-column projection changed; restoration must not mask it")
            if after != before:
                if owner not in allowed_ids:
                    raise RuntimeError("A changed object is outside the captured 38-ID repair scope")
                repairs.append((owner, before[0], before[2], before[3]))
        query.execute("SELECT tgname,tgenabled,pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid='public.object'::regclass AND tgname=ANY(%s) ORDER BY tgname", (list(TRIGGERS),))
        original_triggers = query.fetchall()
        if len(original_triggers) != 4:
            raise RuntimeError("Expected exactly four captured legacy business triggers")
        for name in TRIGGERS:
            query.execute(sql.SQL("ALTER TABLE public.object DISABLE TRIGGER {}").format(sql.Identifier(name)))
        if repairs:
            execute_values(query, "UPDATE public.object o SET cached_is_open_now=prior.opening,current_version=prior.version,updated_at=prior.updated_at FROM (VALUES %s)prior(id,opening,version,updated_at) WHERE o.id=prior.id", repairs, template="(%s::text,%s::boolean,%s::integer,%s::timestamptz)")
        removed_versions = 0
        for owner, _, version, _ in repairs:
            query.execute("DELETE FROM public.object_version WHERE object_id=%s AND version_number>%s", (owner, version))
            removed_versions += query.rowcount
        enabled = {"O": "ENABLE", "R": "ENABLE REPLICA", "A": "ENABLE ALWAYS", "D": "DISABLE"}
        for name, state, _ in original_triggers:
            query.execute(sql.SQL("ALTER TABLE public.object "+enabled[state]+" TRIGGER {}").format(sql.Identifier(name)))
        query.execute("SELECT tgname,tgenabled,pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid='public.object'::regclass AND tgname=ANY(%s) ORDER BY tgname", (list(TRIGGERS),))
        if query.fetchall() != original_triggers:
            raise RuntimeError("Legacy trigger definitions/enabled states were not restored exactly")
        query.execute("SELECT thesaurus.assert_preparation_contract()")
        query.execute("SELECT id,cached_is_open_now,md5(jsonb_build_array("+COLUMNS+")::text),current_version,updated_at FROM public.object ORDER BY id")
        restored = {row[0]: tuple(row[1:]) for row in query.fetchall()}
        if restored != expected:
            raise RuntimeError("Global clock/projection/version/timestamp restoration failed")
    return dict(database=DATABASE, exceptional_local_repair=True,
                timed_publication_changed=False, publisher_acl_changed=False,
                triggers_restored_exactly=True, preparation_contract_passed=True,
                repaired_objects=len(repairs), checked_objects=len(expected),
                removed_derived_version_rows=removed_versions,
                retained_audit_history=True, database_byte_for_byte_restore_claim=False,
                global_clock_projection_versions_restored=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", required=True, type=Path)
    parser.add_argument("--allowed-differences", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    baseline = json.loads(args.baseline.read_text(encoding="utf-8"))
    allowed = json.loads(args.allowed_differences.read_text(encoding="utf-8"))
    connection = psycopg2.connect(host="127.0.0.1", port=55439, user="postgres", dbname=DATABASE,
                                  application_name="ths-exceptional-local-cron-repair")
    try:
        result = restore_local_cron_fixture(connection, baseline["objects"], allowed)
        connection.commit()
    finally:
        connection.close()
    args.output.write_text(json.dumps(result, indent=2)+"\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
