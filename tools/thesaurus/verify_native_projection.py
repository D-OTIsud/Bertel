"""Rollback proof: two assignable HLO ancestors change all 489 real cache rows."""
raise RuntimeError(
    "ARCHIVED_THESAURUS_TOOL: this historical database tool is disabled; see tools/thesaurus/README.md."
)

import argparse
import json
from pathlib import Path
import time
import uuid
import psycopg2
from psycopg2.extras import Json

parser=argparse.ArgumentParser()
parser.add_argument("--database",required=True)
parser.add_argument("--output",type=Path,required=True)
args=parser.parse_args()
if not args.database.startswith("bertel_thesaurus_live_restore_"):
    raise SystemExit("Only an isolated local restoration is allowed")
connection=psycopg2.connect(host="127.0.0.1",port=55439,user="postgres",dbname=args.database)
columns="cached_amenity_codes,cached_payment_codes,cached_environment_tags,cached_language_codes,cached_classification_codes,cached_taxonomy_codes,search_document,search_document_text,search_document_phonetic"
result=dict(database=args.database,fixture_kind="restored-production-copy",ancestor_codes=["hebergement_locatif","hebergement_collectif"])
def rpc(action,payload):
    with connection.cursor()as cursor:
        cursor.execute("SELECT api.thesaurus_admin(%s,%s::jsonb)",(action,Json(payload)))
        return cursor.fetchone()[0]
try:
    with connection.cursor()as cursor:
        cursor.execute("SET LOCAL statement_timeout='8s'")
        cursor.execute("SELECT id FROM public.app_user_profile WHERE role IN('owner','super_admin')ORDER BY id LIMIT 1")
        user_id=str(cursor.fetchone()[0])
        cursor.execute("SELECT set_config('request.jwt.claims',%s,true)",(json.dumps(dict(sub=user_id,role="authenticated")),))
        cursor.execute("SELECT concept_id,thesaurus.concept_document(concept_id)FROM thesaurus.concept WHERE domain='taxonomy_hlo'AND code=ANY(%s)",(result["ancestor_codes"],))
        concepts=cursor.fetchall()
        if len(concepts)!=2:raise SystemExit("The complete two-branch native corpus is required")
        cursor.execute("CREATE TEMP TABLE native_projection_before AS SELECT id,current_version,updated_at,"+columns+" FROM public.object WHERE id IN(SELECT object_id FROM thesaurus.usage_objects(thesaurus.source_descendant_ids(%s::uuid[])))",([str(row[0])for row in concepts],))
        cursor.execute("SELECT count(*),count(*)FILTER(WHERE o.status='published'AND NOT o.is_test)FROM native_projection_before b JOIN public.object o USING(id)")
        owners,published=cursor.fetchone()
        result.update(affected_objects=owners,published_real_objects=published,other_objects=owners-published)
        if(owners,published)!=(489,447):raise SystemExit("The full publication corpus must remain 489/447")
    revision_ids=[];versions={}
    for concept_id,document in concepts:
        document["name"]+=" — vérification fonctionnelle "+str(uuid.uuid4())[:8]
        revision=rpc("save_draft",dict(concept_id=str(concept_id),expected_version=0,document=document))
        revision=rpc("validate_draft",dict(revision_id=revision["revision_id"],expected_version=revision["version"]))
        revision_ids.append(revision["revision_id"]);versions[revision["revision_id"]]=revision["version"]
    with connection.cursor()as cursor:cursor.execute("SET LOCAL ROLE authenticated")
    began=time.perf_counter()
    result["publication"]=rpc("publish",dict(revision_ids=revision_ids,expected_revision_versions=versions,idempotency_key=str(uuid.uuid4())))
    result["publication_ms"]=round((time.perf_counter()-began)*1000,2)
    with connection.cursor()as cursor:
        cursor.execute("RESET ROLE")
        cursor.execute("CREATE TEMP TABLE native_projection_after AS SELECT o.id,"+",".join("o."+name for name in columns.split(","))+" FROM public.object o JOIN native_projection_before b USING(id)")
        cursor.execute("SELECT count(*)FROM public.object o JOIN native_projection_before b USING(id)WHERE(o.search_document,o.search_document_text,o.search_document_phonetic)IS DISTINCT FROM(b.search_document,b.search_document_text,b.search_document_phonetic)")
        result["changed_search_rows"]=cursor.fetchone()[0]
        cursor.execute("SELECT count(*)FROM public.object o JOIN native_projection_before b USING(id)WHERE o.current_version<>b.current_version OR o.updated_at<=b.updated_at")
        result["version_or_sync_errors"]=cursor.fetchone()[0]
        cursor.execute("SELECT id FROM native_projection_before ORDER BY id")
        object_ids=[row[0]for row in cursor.fetchall()]
        for object_id in object_ids:
            cursor.execute("SELECT api.refresh_object_filter_caches(%s)",(object_id,))
        cursor.execute("SELECT count(*)FROM public.object o JOIN native_projection_after b USING(id)WHERE ROW("+",".join("o."+name for name in columns.split(","))+")IS DISTINCT FROM ROW("+",".join("b."+name for name in columns.split(","))+")")
        result["canonical_nine_column_mismatches"]=cursor.fetchone()[0]
    result["passed"]=result["changed_search_rows"]==489 and result["version_or_sync_errors"]==0 and result["canonical_nine_column_mismatches"]==0
finally:
    connection.rollback()
    connection.close()
args.output.write_text(json.dumps(result,indent=2)+"\n",encoding="utf-8")
print(json.dumps(result,indent=2))
if not result["passed"]:raise SystemExit(1)
