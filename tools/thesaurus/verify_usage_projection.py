"""Compare candidate usage resolution with the existing complete FK walker."""
raise RuntimeError(
    "ARCHIVED_THESAURUS_TOOL: this historical database tool is disabled; see tools/thesaurus/README.md."
)

import argparse
import json
from pathlib import Path
import time
import psycopg2
from psycopg2.extras import register_uuid

register_uuid()

parser=argparse.ArgumentParser()
parser.add_argument("--database",required=True)
parser.add_argument("--output",type=Path,required=True)
args=parser.parse_args()
if not args.database.startswith("bertel_thesaurus_live_restore_"):
    raise SystemExit("Only an isolated local restoration is allowed")
connection=psycopg2.connect(host="127.0.0.1",port=55439,user="postgres",dbname=args.database)
source=Path("supabase/migrations/20261106112948_thesaurus_publication.sql").read_text(encoding="utf-8")
start=source.index("CREATE OR REPLACE FUNCTION thesaurus.usage_objects(")
end=source.index("-- Natural source parents",start)
replacement=source[start:end]
result=dict(database=args.database,cases=[])
try:
    with connection.cursor()as cursor:
        cursor.execute("SET LOCAL statement_timeout='30s'")
        cursor.execute("CREATE TEMP TABLE usage_projection_probe(marker boolean)")
        cursor.execute("SELECT pg_get_functiondef('thesaurus.usage_objects(uuid[])'::regprocedure)")
        previous=cursor.fetchone()[0]
        previous=previous.replace("thesaurus.usage_objects(","pg_temp.usage_objects_previous(",1)
        cursor.execute(previous)
        cursor.execute(replacement)
        cursor.execute("SELECT array_agg(c.concept_id)FROM thesaurus.concept c JOIN thesaurus.vocabulary v USING(domain)WHERE v.is_governed")
        all_concepts=cursor.fetchone()[0]
        cursor.execute("SELECT thesaurus.source_descendant_ids(ARRAY[concept_id])FROM thesaurus.concept WHERE domain='taxonomy_hlo'AND code='root'")
        root_concepts=cursor.fetchone()[0]
        for name,concepts in (("all-governed-adapters",all_concepts),("root-publication-corpus",root_concepts)):
            entries={}
            # Prepare both dynamic-query paths before measuring the comparison.
            for function in ("pg_temp.usage_objects_previous","thesaurus.usage_objects"):
                cursor.execute("SELECT count(*)FROM "+function+"(%s::uuid[])",(concepts,))
                cursor.fetchone()
            for key,function in (("previous","pg_temp.usage_objects_previous"),("optimized","thesaurus.usage_objects")):
                began=time.perf_counter()
                cursor.execute("SELECT ARRAY(SELECT DISTINCT object_id FROM "+function+"(%s::uuid[])ORDER BY object_id)",(concepts,))
                entries[key]=cursor.fetchone()[0]
                entries[key+"_ms"]=round((time.perf_counter()-began)*1000,2)
            cursor.execute("SELECT count(*)FILTER(WHERE status='published'AND NOT is_test),count(*)FILTER(WHERE status<>'published'OR is_test)FROM public.object WHERE id=ANY(%s)",(entries["optimized"],))
            published,others=cursor.fetchone()
            result["cases"].append(dict(case=name,concept_count=len(concepts),exact_owner_set_match=entries["previous"]==entries["optimized"],unique_owners=len(entries["optimized"]),published_real_owners=published,other_owners=others,previous_ms=entries["previous_ms"],optimized_ms=entries["optimized_ms"]))
        result["passed"]=all(case["exact_owner_set_match"]for case in result["cases"])and result["cases"][1]["published_real_owners"]==447 and result["cases"][1]["other_owners"]==42
finally:
    # The proof changes function definitions only in this rolled-back transaction.
    connection.rollback()
    connection.close()
args.output.write_text(json.dumps(result,indent=2)+"\n",encoding="utf-8")
print(json.dumps(result,indent=2))
if not result["passed"]:raise SystemExit(1)
