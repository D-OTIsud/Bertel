"""Measure real filter results and expansion calls on an isolated local corpus."""
import argparse
import json
from pathlib import Path
import statistics
import time
import psycopg2
from psycopg2.extras import Json

parser = argparse.ArgumentParser()
parser.add_argument('--database', required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
if not args.database.startswith('bertel_thesaurus_'):
    raise SystemExit('Only an isolated local thesaurus database is allowed')
connection = psycopg2.connect(host='127.0.0.1', port=55439, user='postgres', dbname=args.database)
try:
    with connection.cursor() as query:
        query.execute("SET LOCAL track_functions='all'")
        query.execute("SELECT code,count(*) FROM public.object o CROSS JOIN LATERAL unnest(o.cached_taxonomy_codes) code WHERE o.status='published' AND NOT o.is_test AND code LIKE 'taxonomy_hlo:%' GROUP BY code ORDER BY count(*) DESC,code LIMIT 1")
        code, count = query.fetchone()
        filters = {'taxonomy_any': [{'domain': code.split(':')[0], 'code': code.split(':')[1]}]}
        timings = {}
        results = {}
        calls = {}
        for enabled in (False, True):
            filters['include_equivalent_predecessors'] = enabled
            query.execute("SELECT coalesce(sum(calls),0) FROM pg_stat_xact_user_functions WHERE funcname='thesaurus_expand_taxonomy_codes'")
            before = query.fetchone()[0]
            elapsed = []
            for _ in range(5):
                started = time.perf_counter()
                query.execute("SELECT array_agg(object_id ORDER BY object_id) FROM api.get_filtered_object_ids(%s::jsonb,ARRAY['HLO']::public.object_type[],ARRAY['published']::public.object_status[],NULL)", (Json(filters),))
                results[str(enabled)] = query.fetchone()[0] or []
                elapsed.append((time.perf_counter() - started) * 1000)
            query.execute("SELECT coalesce(sum(calls),0) FROM pg_stat_xact_user_functions WHERE funcname='thesaurus_expand_taxonomy_codes'")
            calls[str(enabled)] = int(query.fetchone()[0] - before)
            timings[str(enabled)] = round(statistics.median(elapsed[1:]), 3)
        assert count > 0 and results['False'], 'A populated real filter corpus is required'
        assert calls['True'] == 5, 'Equivalence must expand exactly once per filter query'
        assert calls['False'] == 0, 'Opt-out must not expand equivalences'
        report = {'database': args.database, 'selected_code': code, 'assigned_objects': count,
                  'result_counts': {key: len(value) for key, value in results.items()},
                  'median_ms': timings, 'expansion_calls_for_five_queries': calls,
                  'same_result_set': results['False'] == results['True']}
        args.output.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(report, indent=2))
finally:
    connection.rollback()
    connection.close()
