"""Merge two body-free production RPC records; retain every baseline node/edge."""
import copy
import json
import re
from pathlib import Path

from dbgraph.classify import classify
from dbgraph.infer import _resolve
from dbgraph.load import load_extra
from dbgraph.render import write_functions_md
from dbgraph.typemap import write_function_access_md
from merge_partner_selection_catalog import patch_function_sections, sections


def main():
    root = Path(__file__).resolve().parents[2]
    out = root / 'db-graph-out'
    capture = json.loads((out / 'PARTNER_SELECTION_MEMBERSHIPS_CATALOG.json').read_text(encoding='utf-8'))
    expected = {'api.list_partner_objects_with_vocabulary': 'ddcb1112ad9cdb9b7fcba9bfd4a881e6',
                'api.list_partner_selection_objects_with_vocabulary': 'b39369e86bff568b267e832da825dfe9',
                'api.get_partner_object_with_vocabulary': '665e3aae006cc8a55a14562ae8f07f79',
                'api.get_filtered_object_ids': 'd4905c8d789de044d82fe65dba4633c1'}
    assert {r['name']: r['body_md5'] for r in capture['preserved_readers']} == expected
    assert capture['_capture']['project_ref'] == 'ryycrdhlkmzpxwwwwupy'
    assert capture['_capture']['database_name'] == 'postgres'
    assert len(capture['functions']) == 2
    assert {(f['schema'], f['name']) for f in capture['functions']} == {
        ('api', 'list_partner_objects_with_selection_ids'), ('internal', 'partner_selection_memberships')}
    for f in capture['functions']:
        assert not f['security_definer'] and f['volatility'] == 's'
        assert f['effective_execute'] == {'anon': False, 'authenticated': False, 'service_role': True}
        assert 'body' not in f
    baseline = json.loads((out / 'graph.json').read_text(encoding='utf-8'))
    graph = copy.deepcopy(baseline)
    nodes, _ = load_extra({'functions': capture['functions']})
    ids = {n['id'] for n in nodes}
    existing = {n['id'] for n in graph['nodes']}
    assert not (ids & existing), 'Already merged; do not duplicate this supplement'
    sources = ['supabase/migrations/20261109100741_partner_selection_memberships.sql',
               'Base de donnée DLL et API/migration_partner_selection_memberships.sql']
    for n, f in zip(nodes, capture['functions']):
        assert (n['schema'], n['label']) == (f['schema'], f['name'])
        n['domain'] = classify(n)
        n['props'].update({key: f[key] for key in ('body_md5', 'owner', 'settings', 'execute_roles', 'effective_execute', 'dynamic_sql')})
        n['props']['catalog_captured_at'] = capture['_capture']['captured_at']
        n['props']['sources'] = []
        for relative in sources:
            for line, value in enumerate((root / relative).read_text(encoding='utf-8').splitlines(), 1):
                if re.search(r'CREATE FUNCTION\s+' + re.escape(f['schema']+'.'+f['name']) + r'\(', value):
                    n['props']['sources'].append({'path': relative, 'line': line})
    graph['nodes'].extend(nodes)
    tables = {n['id'] for n in graph['nodes'] if n['kind'] in ('table', 'view', 'matview')}
    edges = []
    for n, f in zip(nodes, capture['functions']):
        for ref in f['references']:
            target, confidence = _resolve(ref['identifier'], tables)
            if target and ref['kind'] in ('reads', 'writes'):
                edge = {'source': n['id'], 'target': target, 'kind': ref['kind'],
                        'props': {'inference': {'method': 'regex', 'confidence': confidence, 'evidence': ref['evidence']}}}
                if not any((e['source'], e['target'], e['kind']) == (edge['source'], edge['target'], edge['kind']) for e in edges):
                    edges.append(edge)
    graph['edges'].extend(edges)
    graph['meta']['function_count'] += 2
    graph['meta']['edge_count'] = len(graph['edges'])
    graph.setdefault('catalog_provenance', {}).setdefault('targeted_catalog_updates', []).append({
        'scope': 'two additive opt-in membership functions only; not a complete catalogue refresh',
        **capture['_capture'], 'functions': sorted(ids), 'migration_history': capture['migration_history'],
        'preserved_readers': expected, 'ledger_count': capture['ledger_count']})
    assert graph['nodes'][:-2] == baseline['nodes']
    assert graph['edges'][:len(baseline['edges'])] == baseline['edges']
    for filename, generated, level in [('FUNCTIONS.md', write_functions_md(graph), 2),
                                        ('FUNCTION_ACCESS.md', write_function_access_md(graph, {}), 3)]:
        path = out / filename
        if filename == 'FUNCTION_ACCESS.md':
            for identity, (_, _, block) in list(sections(generated, level).items()):
                if identity in ids:
                    lines = block.splitlines(keepends=True)
                    revised = ''.join(lines[:2]) + '- **Effective EXECUTE:** service_role only; anon and authenticated denied. STABLE SECURITY INVOKER.\n' + ''.join(lines[2:])
                    generated = generated.replace(block, revised, 1)
        text = patch_function_sections(path.read_text(encoding='utf-8'), generated, set(), ids, level)
        path.write_text(text, encoding='utf-8', newline='\n')
    note = ('\nMembership supplement captured at %s: two service-only STABLE SECURITY INVOKER functions, '
            'migration 20261109100741 (ledger observed: %s). Baseline 212 and previous supplements remain unchanged; '
            'this is not a full refresh. See [PARTNER_SELECTION_MEMBERSHIPS.md](PARTNER_SELECTION_MEMBERSHIPS.md).\n') % (
                capture['_capture']['captured_at'], capture['ledger_count'])
    index = out / 'DB_AGENT_INDEX.md'
    text = index.read_text(encoding='utf-8')
    text = re.sub(r'(?m)^- tables:.*$', '- tables: {table_count} · views: {view_count} · functions: {function_count} · policies: {policy_count} · triggers: {trigger_count} · enums: {enum_count} · edges: {edge_count}'.format(**graph['meta']), text, count=1)
    text = text.replace('## Provenance du catalogue\n', '## Provenance du catalogue\n' + note, 1)
    index.write_text(text, encoding='utf-8', newline='\n')
    doc = '# Optional general-list selection memberships — production catalogue supplement\n\n' + note.strip() + '\n\n'
    doc += 'Metadata only, read via Bertel Supabase MCP; no function bodies or business rows captured. Four existing reader/core hashes are unchanged. All baseline nodes/edges are retained, in their original order. Only two functions and their inferred direct reads are appended. The table metadata in the JSON was observed but does not replace the baseline table node or per-table documentation.\n\n'
    doc += '| Function | Body MD5 | Effective EXECUTE |\n|---|---|---|\n'
    for f in capture['functions']:
        doc += '| `%s.%s` | `%s` | service_role only |\n' % (f['schema'], f['name'], f['body_md5'])
    doc += '\nSee [body-free catalogue evidence](PARTNER_SELECTION_MEMBERSHIPS_CATALOG.json). SQL installation is attested; this capture does not attest application deployment or HTTP activation. Membership may change without object.updated_at changing. Other derived views, graph.html and table docs retain their previous provenance.\n'
    (out / 'PARTNER_SELECTION_MEMBERSHIPS.md').write_text(doc, encoding='utf-8', newline='\n')
    (out / 'graph.json').write_text(json.dumps(graph, indent=1, ensure_ascii=False)+'\n', encoding='utf-8', newline='\n')
    print(json.dumps({'appended_functions': 2, 'appended_reads': len(edges), 'meta': graph['meta']}))


if __name__ == '__main__':
    main()
