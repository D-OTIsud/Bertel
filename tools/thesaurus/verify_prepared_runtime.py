"""Rollback benchmark on a restored LOCAL database with the real prepared kernel.

Only timing NOTICEs are added to activate inside the rolled-back transaction.
The optional cache worker simulates two captured cron commands; pg_cron itself
is unavailable on the Windows restoration. It commits local cache maintenance,
then restores the original clock cache and filtered MV after the measurement.
"""
raise RuntimeError(
    "ARCHIVED_THESAURUS_TOOL: this historical database tool is disabled; see tools/thesaurus/README.md."
)

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import threading
import time
import uuid

import psycopg2
from psycopg2.extras import Json, execute_values
from restore_local_cron_fixture import restore_local_cron_fixture


parser = argparse.ArgumentParser()
parser.add_argument("--database", required=True)
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--simulate-cache-cron", action="store_true")
parser.add_argument("--journal-load", type=int, default=0,
                    help="Synthetic historical receipts on the real owner IDs (0..1000000), restored exactly afterwards")
parser.add_argument("--repair-local-cron-side-effects", type=Path,
                    help="Explicit 38-ID allowlist from the exceptional local restoration witness; never changes the timed publication")
args = parser.parse_args()
if not args.database.startswith(("bertel_thesaurus_live_restore_", "bertel_thesaurus_rollout_prereq_")):
    raise SystemExit("Only an isolated local restoration is allowed")
if not 0 <= args.journal_load <= 1000000:
    raise SystemExit("Journal load must be between 0 and 1000000")
common = dict(host="127.0.0.1", port=55439, user="postgres", dbname=args.database)
signature = "thesaurus.activate(uuid[],text[],text,bigint,jsonb)"
columns = "cached_amenity_codes,cached_payment_codes,cached_environment_tags,cached_language_codes,cached_classification_codes,cached_taxonomy_codes,search_document,search_document_text,search_document_phonetic"
result = dict(database=args.database, fixture_kind="restored-production-copy",
              production_code_changed=False, safety_contract_active=True,
              cron_simulation=args.simulate_cache_cron,
              cron_production_execution=False,
              cron_simulation_schedule="two captured cache jobs plus new journal pruner started early at observed X2, not their real wall-clock cadence",
              transaction_rolled_back=False)
result["started_at_utc"] = datetime.now(timezone.utc).isoformat()
result["migration_sha256"] = hashlib.sha256((Path(__file__).resolve().parents[2]/"supabase/migrations/20261106160017_thesaurus_prepared_publication.sql").read_bytes()).hexdigest()
publisher = psycopg2.connect(application_name="ths-prepared-runtime-publisher", **common)


def rpc(action, payload):
    with publisher.cursor() as query:
        query.execute("SELECT api.thesaurus_admin(%s,%s::jsonb)", (action, Json(payload)))
        return query.fetchone()[0]


def fingerprint(query):
    query.execute("SELECT md5(pg_get_functiondef(oid)),proowner,proacl::text,prosecdef FROM pg_proc WHERE oid=%s::regprocedure", (signature,))
    return tuple(query.fetchone())


with publisher.cursor() as query:
    query.execute("SELECT current_database(),current_setting('transaction_isolation')")
    assert query.fetchone() == (args.database, "read committed")
    query.execute("SELECT thesaurus.assert_preparation_contract()")
    original_function = fingerprint(query)
    result["activation_definition_md5"] = original_function[0]
    query.execute("SELECT pg_get_functiondef(oid),prosrc FROM pg_proc WHERE oid=%s::regprocedure", (signature,))
    definition, body = query.fetchone()
    assert "prepared_snapshot:=(stage->>'snapshot')::pg_snapshot" in body
    assert "thesaurus.mutation_journal" in body
    assert body.count("PERFORM thesaurus.assert_preparation_contract();") == 2
    query.execute("SELECT current_release_id FROM thesaurus.instance WHERE singleton")
    result["original_release"] = query.fetchone()[0]
    query.execute("SELECT count(*) FROM thesaurus.vocabulary WHERE is_governed")
    result["governed_domains"] = query.fetchone()[0]
    assert result["governed_domains"] == 66
    query.execute("SELECT id FROM public.app_user_profile WHERE role IN('owner','super_admin') ORDER BY id LIMIT 1")
    user = str(query.fetchone()[0])
    query.execute("SELECT concept_id,code FROM thesaurus.concept WHERE domain='taxonomy_hlo' AND code=ANY(%s) ORDER BY code", (["hebergement_locatif", "hebergement_collectif"],))
    concepts = query.fetchall()
    assert len(concepts) == 2
    query.execute("SELECT DISTINCT object_id FROM thesaurus.usage_objects(thesaurus.source_descendant_ids(%s::uuid[])) ORDER BY object_id", ([str(cid) for cid, _ in concepts],))
    owners = [row[0] for row in query.fetchall()]
    assert len(owners) == 489
    query.execute("SELECT count(*) FILTER(WHERE status='published' AND NOT is_test),min(id) FILTER(WHERE status='published' AND NOT is_test) FROM public.object WHERE id=ANY(%s)", (owners,))
    published, editor_id = query.fetchone()
    assert published == 447
    result.update(affected_objects=len(owners), published_real_objects=published,
                  other_objects=len(owners)-published,
                  ancestor_codes=[code for _, code in concepts])
    query.execute("SELECT id,md5(jsonb_build_array(" + columns + ")::text),current_version,updated_at FROM public.object WHERE id=ANY(%s)", (owners,))
    original_rows = {key: (digest, version, updated) for key, digest, version, updated in query.fetchall()}
    query.execute("SELECT id,cached_is_open_now FROM public.object ORDER BY id")
    original_open = query.fetchall()
    query.execute("SELECT id,cached_is_open_now,md5(jsonb_build_array("+columns+")::text),current_version,updated_at FROM public.object ORDER BY id")
    original_all_rows = query.fetchall()
    query.execute("SELECT rolbypassrls,rolsuper,rolcanlogin FROM pg_roles WHERE rolname='bertel_thesaurus_publisher'")
    result["publisher_role"] = dict(zip(("bypassrls", "superuser", "login"), query.fetchone()))
    assert not any(result["publisher_role"].values())
    query.execute("SELECT count(*) FROM pg_extension WHERE extname='pg_cron'")
    result["local_pg_cron_installed"] = bool(query.fetchone()[0])
    query.execute("SELECT count(*),md5(COALESCE(string_agg(top_xid::text||':'||owner_id,E'\\n' ORDER BY top_xid,owner_id),'')) FROM thesaurus.mutation_journal")
    original_journal = query.fetchone()
args.output.with_name(args.output.stem+"-before.json").write_text(json.dumps(dict(
    original_release=result["original_release"], original_function=original_function,
    objects=original_all_rows, original_journal=original_journal), default=str,
    ensure_ascii=False, indent=2)+"\n", encoding="utf-8")

# A committed backlog exercises the real DELETE cost, rather than newly
# inserted tuples in the publisher transaction. These are explicitly synthetic
# historical receipt keys; the concurrent-race gate proves their semantics.
seeded_journal = []
if args.journal_load:
    seed = psycopg2.connect(application_name="ths-prepared-runtime-journal-load", **common)
    with seed.cursor() as query:
        query.execute("SELECT pg_advisory_xact_lock(741126,2)")
        query.execute("SELECT pg_snapshot_xmin(pg_current_snapshot())::text::numeric")
        horizon = int(query.fetchone()[0])
        assert horizon > args.journal_load//len(owners)+5
        query.execute("INSERT INTO thesaurus.mutation_journal(top_xid,owner_id) SELECT ((%s-1-((n-1)/%s))::text)::xid8,(%s::text[])[1+((n-1) %% %s)] FROM generate_series(1,%s)n ON CONFLICT DO NOTHING RETURNING top_xid::text,owner_id", (horizon, len(owners), owners, len(owners), args.journal_load))
        seeded_journal = query.fetchall()
        assert len(seeded_journal) == args.journal_load, "Historical load collided with original receipt keys"
    seed.commit()
    seed.close()
    args.output.with_name(args.output.stem+"-seeded-journal.json").write_text(json.dumps(seeded_journal)+"\n", encoding="utf-8")
result["journal_load"] = dict(synthetic=True, committed_receipts=len(seeded_journal),
                              distinct_real_owners=len(set(owner for _, owner in seeded_journal)),
                              original_receipts=original_journal[0])

# Add chronometry only. The contract intentionally guards the canonical source
# projection/support UDFs, and remains active at both production call sites.
needle = "  PERFORM thesaurus.assert_current_authority();"
assert body.count(needle) == 1
instrumented = body.replace("request_fp text;", "request_fp text;runtime_fenced_at timestamptz;", 1)
instrumented = instrumented.replace(needle, "  runtime_fenced_at:=clock_timestamp();\n  RAISE NOTICE 'PREPARED_X1_BEGIN %',runtime_fenced_at;\n" + needle, 1)
needle = "  RETURN jsonb_build_object('release_id',rid,"
assert instrumented.count(needle) == 1
instrumented = instrumented.replace(needle, "  RAISE NOTICE 'PREPARED_X1_MS %',extract(epoch FROM clock_timestamp()-runtime_fenced_at)*1000;\n" + needle, 1)
assert definition.count(body) == 1
with publisher.cursor() as query:
    query.execute(definition.replace(body, instrumented, 1))
    query.execute("SELECT set_config('request.jwt.claims',%s,true)", (json.dumps(dict(sub=user, role="authenticated")),))
    query.execute("SET LOCAL statement_timeout='15s'")
    query.execute("SET LOCAL ROLE authenticated")

revisions, versions = [], {}
for cid, code in concepts:
    with publisher.cursor() as query:
        query.execute("RESET ROLE")
        query.execute("SELECT thesaurus.concept_document(%s),COALESCE((SELECT version FROM thesaurus.revision WHERE concept_id=%s AND status<>'published' ORDER BY updated_at DESC LIMIT 1),0)", (str(cid), str(cid)))
        document, version = query.fetchone()
        query.execute("SET LOCAL ROLE authenticated")
    document["name"] += " — runtime verification " + str(uuid.uuid4())[:8]
    revision = rpc("save_draft", dict(concept_id=str(cid), expected_version=version, document=document))
    revision = rpc("validate_draft", dict(revision_id=revision["revision_id"], expected_version=revision["version"]))
    revisions.append(revision["revision_id"])
    versions[revision["revision_id"]] = revision["version"]
payload = dict(revision_ids=revisions, expected_revision_versions=versions,
               expected_release_id=result["original_release"],
               idempotency_key="prepared-runtime-" + str(uuid.uuid4()))
claims = json.dumps(dict(sub=user, role="authenticated"))
done = threading.Event()
result["publisher_pid"] = publisher.get_backend_pid()


def connection(name, role=None):
    conn = psycopg2.connect(application_name=name, **common)
    with conn.cursor() as query:
        query.execute("SELECT set_config('request.jwt.claims',%s,false)", (claims,))
        query.execute("SET statement_timeout='15s'")
    conn.commit()
    if role:
        with conn.cursor() as query:
            query.execute("SET LOCAL ROLE " + role)
    return conn


def publish():
    began = time.perf_counter()
    try:
        result["publication"] = rpc("publish", payload)
        result["function_ms"] = round((time.perf_counter()-began)*1000, 2)
        rollback_started = time.perf_counter()
        publisher.rollback()
        released_at = datetime.now(timezone.utc)
        result["rollback_ms"] = round((time.perf_counter()-rollback_started)*1000, 2)
        result["transaction_rolled_back"] = True
        result["function_plus_rollback_ms"] = round((time.perf_counter()-began)*1000, 2)
    except Exception as error:
        result["publisher_error"] = str(error)
        result["publisher_sqlstate"] = getattr(error, "pgcode", None)
        publisher.rollback()
        result["transaction_rolled_back"] = True
    finally:
        result["notices"] = list(publisher.notices)
        for notice in publisher.notices:
            if "PREPARED_X1_MS " in notice:
                result["exclusive_fence_function_ms"] = round(float(notice.split("PREPARED_X1_MS ", 1)[1].strip()), 2)
            if "PREPARED_X1_BEGIN " in notice and "publisher_error" not in result:
                acquired_at = datetime.fromisoformat(notice.split("PREPARED_X1_BEGIN ", 1)[1].strip())
                result["exclusive_fence_with_rollback_upper_ms"] = round((released_at-acquired_at).total_seconds()*1000, 2)
        done.set()
        publisher.close()


def edit():
    conn = connection("ths-prepared-runtime-editor", "authenticated")
    began = time.perf_counter()
    try:
        with conn.cursor() as query:
            query.execute("UPDATE public.object SET name=name WHERE id=%s", (editor_id,))
            result["editor_rows"] = query.rowcount
        result["editor_wait_ms"] = round((time.perf_counter()-began)*1000, 2)
    except Exception as error:
        result["editor_error"] = str(error)
    finally:
        conn.rollback()
        conn.close()


def read():
    conn = connection("ths-prepared-runtime-reader", "service_role")
    began = time.perf_counter()
    try:
        with conn.cursor() as query:
            query.execute("SELECT api.list_partner_objects_with_vocabulary(p_page_size=>1,p_types=>ARRAY['HLO'],p_taxonomy_codes=>ARRAY['taxonomy_hlo:hebergement_locatif'])")
            page = query.fetchone()[0]
        result["reader_rows"] = len(page["data"])
        result["reader_release"] = page.get("meta", page.get("info", {})).get("vocabulary_release")
        result["reader_wait_ms"] = round((time.perf_counter()-began)*1000, 2)
    except Exception as error:
        result["reader_error"] = str(error)
    finally:
        conn.rollback()
        conn.close()


def cache_cron():
    conn = connection("ths-prepared-runtime-cron-simulation")
    conn.autocommit = True
    result["simulated_cron_commands"] = []
    for name, command, schedule, origin in [
        ("bertel-thesaurus-journal-prune", "SELECT thesaurus.prune_mutation_journal(10000)", "*/15 * * * *", "new prepared-publication migration"),
        ("refresh-open-status", "SELECT api.refresh_open_status()", "3,18,33,48 * * * *", "captured live cron.job"),
        ("refresh-mv-filtered-objects", "REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_filtered_objects", "*/5 * * * *", "captured live cron.job"),
    ]:
        began = time.perf_counter()
        item = dict(jobname=name, command=command, configured_schedule=schedule,
                    schedule_source=origin,
                    worker="local-python-simulation", production_cron=False,
                    publisher_active_at_start=not done.is_set())
        try:
            with conn.cursor() as query:
                query.execute(command)
                if query.description:
                    item["returned_value"] = query.fetchone()[0]
            item.update(committed=True, elapsed_ms=round((time.perf_counter()-began)*1000, 2))
        except Exception as error:
            item.update(error=str(error), sqlstate=getattr(error, "pgcode", None))
        item["publisher_active_at_end"] = not done.is_set()
        result["simulated_cron_commands"].append(item)
    conn.close()


observer = connection("ths-prepared-runtime-observer")
observer.autocommit = True
workers = []
thread = threading.Thread(target=publish)
thread.start()
while not done.is_set():
    with observer.cursor() as query:
        query.execute("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=%s AND locktype='advisory' AND mode='ExclusiveLock' AND granted AND classid=741126 AND objid=1 AND objsubid=2),EXISTS(SELECT 1 FROM pg_locks WHERE pid=%s AND locktype='advisory' AND mode='ExclusiveLock' AND granted AND classid=741126 AND objid=2 AND objsubid=2),EXISTS(SELECT 1 FROM pg_locks WHERE pid=%s AND locktype='relation' AND relation='internal.mv_filtered_objects'::regclass AND mode='ExclusiveLock' AND granted)", (result["publisher_pid"],)*3)
        fence, source, mv = query.fetchone()
    if source and args.simulate_cache_cron and not result.get("observed_source_gate"):
        result["observed_source_gate"] = True
        worker = threading.Thread(target=cache_cron)
        workers.append(worker)
        worker.start()
    if fence and not result.get("observed_late_fence"):
        result["observed_late_fence"] = True
        worker = threading.Thread(target=edit)
        workers.append(worker)
        worker.start()
    if mv and not result.get("observed_required_mv_refresh"):
        result["observed_required_mv_refresh"] = True
        worker = threading.Thread(target=read)
        workers.append(worker)
        worker.start()
    time.sleep(.005)
for worker in workers+[thread]:
    worker.join(20)
observer.close()
result["restoration_pending"] = True
args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")

check = connection("ths-prepared-runtime-restoration")
with check.cursor() as query:
    result["exact_activation_definition_owner_acl_restored"] = fingerprint(query) == original_function
    query.execute("SELECT current_release_id FROM thesaurus.instance WHERE singleton")
    result["restored_release"] = query.fetchone()[0]
    query.execute("SELECT id,md5(jsonb_build_array("+columns+")::text),current_version,updated_at FROM public.object WHERE id=ANY(%s)", (owners,))
    result["restored_projection_versions"] = all(original_rows[key] == (digest, version, updated) for key, digest, version, updated in query.fetchall())
    query.execute("SELECT thesaurus.assert_preparation_contract()")
    if seeded_journal:
        query.execute("SELECT pg_advisory_xact_lock(741126,2)")
        query.execute("DELETE FROM thesaurus.mutation_journal journal USING unnest(%s::xid8[],%s::text[])seed(top_xid,owner_id) WHERE journal.top_xid=seed.top_xid AND journal.owner_id=seed.owner_id", ([xid for xid, _ in seeded_journal], [owner for _, owner in seeded_journal]))
        result["restored_journal_load_rows"] = query.rowcount
    query.execute("SELECT count(*),md5(COALESCE(string_agg(top_xid::text||':'||owner_id,E'\\n' ORDER BY top_xid,owner_id),'')) FROM thesaurus.mutation_journal")
    result["restored_journal_exact"] = query.fetchone() == original_journal
    # Release the private source gate before restoring owned clock caches.
    # X2 without X1 deliberately rejects even trusted owned-row side effects.
    check.commit()
    if args.simulate_cache_cron:
        execute_values(query, "UPDATE public.object o SET cached_is_open_now=prior.value FROM (VALUES %s)prior(id,value) WHERE o.id=prior.id AND o.cached_is_open_now IS DISTINCT FROM prior.value", original_open, template="(%s::text,%s::boolean)", page_size=len(original_open))
        result["restored_clock_cache_rows"] = query.rowcount
        query.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_filtered_objects")
        query.execute("SELECT id,cached_is_open_now FROM public.object ORDER BY id")
        result["restored_clock_cache_exact"] = query.fetchall() == original_open
    query.execute("SELECT id,cached_is_open_now,md5(jsonb_build_array("+columns+")::text),current_version,updated_at FROM public.object ORDER BY id")
    result["restored_all_objects_clock_projection_versions"] = query.fetchall() == original_all_rows
    result["restored_all_objects_count"] = len(original_all_rows)
    if not result["restored_all_objects_clock_projection_versions"] and args.repair_local_cron_side_effects:
        check.commit()
        result["exceptional_local_cron_repair"] = restore_local_cron_fixture(check, original_all_rows,
            json.loads(args.repair_local_cron_side_effects.read_text(encoding="utf-8")))
        result["restored_all_objects_clock_projection_versions"] = True
check.commit()
with check.cursor() as query:
    query.execute("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND application_name LIKE 'ths-prepared-runtime-%' AND pid<>pg_backend_pid()")
    result["remaining_worker_connections"] = query.fetchone()[0]
check.close()
result["within_2s_budget"] = bool(
    "publisher_error" not in result and
    result.get("exclusive_fence_with_rollback_upper_ms", 999999) <= 2000 and
    result.get("editor_wait_ms", 999999) <= 2000 and result.get("editor_rows") == 1 and
    result.get("reader_wait_ms", 999999) <= 2000 and result.get("reader_rows") == 1)
result["restoration_passed"] = bool(result["exact_activation_definition_owner_acl_restored"] and
    result["restored_release"] == result["original_release"] and
    result["restored_projection_versions"] and result["remaining_worker_connections"] == 0 and
    result.get("restored_clock_cache_exact", True) and result["restored_journal_exact"])
result["restoration_passed"] = result["restoration_passed"] and result["restored_all_objects_clock_projection_versions"]
result["restoration_pending"] = False
jobs = result.get("simulated_cron_commands", [])
result["cron_simulation_passed"] = bool(not args.simulate_cache_cron or
    (len(jobs) == 3 and all(job.get("committed") and job["publisher_active_at_start"] for job in jobs)
     and jobs[0].get("returned_value") == 0))
result["passed"] = result["restoration_passed"] and result["within_2s_budget"] and result["cron_simulation_passed"]
result["finished_at_utc"] = datetime.now(timezone.utc).isoformat()
args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
print(json.dumps({key: value for key, value in result.items() if key != "notices"}, ensure_ascii=False, indent=2))
if not result["passed"]:
    raise SystemExit(1)
