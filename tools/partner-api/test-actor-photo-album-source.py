"""Offline source/SQL checks, never opens a database or starts a service.

Run from the worktree: python tools/partner-api/test-actor-photo-album-source.py
This validates packaging and syntax, not PostgreSQL permissions/concurrency.
"""
from pathlib import Path
import hashlib
import re

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / 'supabase/migrations/20261104151051_partner_photo_actor_workspace_texts.sql'
CANONICAL = ROOT / 'Base de donnée DLL et API/migration_actor_portal_media.sql'
STOCK = ROOT / 'supabase/migrations/20261103072105_partner_portal_photo_stock_and_gallery_contract.sql'
ASSESSMENT = ROOT / 'supabase/migrations/20261103084816_partner_portal_photo_assessment_foundation_off.sql'


def source(text: str, name: str) -> str:
    pattern = (r'CREATE(?: OR REPLACE)? FUNCTION\s+' + re.escape(name)
               + r'\s*\([\s\S]*?\bAS\s+(\$\w*\$)([\s\S]*?)\1\s*;')
    found = re.search(pattern, text, re.I)
    assert found, name
    return found[2]


def md5(value: str) -> str:
    return hashlib.md5(value.encode()).hexdigest()


def apply(value: str, pairs: list[tuple[str, str]]) -> str:
    for old, new in pairs:
        assert value.count(old) == 1, f'Anchor occurs {value.count(old)} times: {old[:90]}'
        value = value.replace(old, new)
    return value


def current_sources() -> dict[str, str]:
    canonical = CANONICAL.read_text(encoding='utf-8')
    stock = STOCK.read_text(encoding='utf-8')
    result = {}
    for name, block, target in [
        ('internal.validate_portal_photo_additions', 'validate_portal_photo_additions_stock', 'f2141450982dafb04be58f5967913aca'),
        ('api.publish_portal_photo_additions', 'publish_portal_photo_additions_stock', '6f678c3f978cb836d0521c1727fe2846'),
    ]:
        body = re.search(r'DO \$' + block + r'\$([\s\S]*?)\$' + block + r'\$;', stock)[1]
        pairs = [(m[2], m[3]) for m in re.finditer(
            r'\$r5_before_(\d+)\$([\s\S]*?)\$r5_before_\1\$[\s\S]*?'
            r'\$r5_after_\1\$([\s\S]*?)\$r5_after_\1\$', body)]
        result[name] = apply(source(canonical, name), pairs)
        assert md5(result[name]) == target, name
    result['api.appeal_portal_photo_analysis'] = source(ASSESSMENT.read_text(encoding='utf-8'), 'api.appeal_portal_photo_analysis')
    result['api.withdraw_portal_photo'] = source(canonical, 'api.withdraw_portal_photo')
    result['internal.gallery_bind_photo_proposal'] = source(stock, 'internal.gallery_bind_photo_proposal')
    for name in ['api.reserve_portal_photo_upload', 'api.cancel_portal_photo_upload', 'api.complete_portal_photo_upload']:
        result[name] = source(stock, name)
    return result


def main() -> None:
    from pglast import parse_sql
    # The installed pglast JSON decoder cannot decode its own trigger NEW/OLD
    # datum output (also on the unchanged R5 trigger). The parser entry point
    # still validates grammar and raises on invalid PL/pgSQL; do not JSON-decode
    # that diagnostic representation. This does not compile against a catalog.
    from pglast.parser import parse_plpgsql_json as parse_plpgsql
    sql = MIGRATION.read_text(encoding='utf-8')
    before = current_sources()
    patched = {}
    for name, tag in [
        ('internal.validate_portal_photo_additions', 'album_validator'),
        ('api.publish_portal_photo_additions', 'album_publish'),
        ('api.appeal_portal_photo_analysis', 'album_appeal'),
        ('api.withdraw_portal_photo', 'album_withdraw'),
        ('internal.gallery_bind_photo_proposal', 'album_bind'),
        ('api.reserve_portal_photo_upload', 'album_reserve'),
        ('api.cancel_portal_photo_upload', 'album_cancel'),
        ('api.complete_portal_photo_upload', 'album_complete'),
    ]:
        pairs = [(m[2], m[3]) for m in re.finditer(
            rf'\${tag}_before_(\d+)\$([\s\S]*?)\${tag}_before_\1\$[\s\S]*?'
            rf'\${tag}_after_\1\$([\s\S]*?)\${tag}_after_\1\$', sql)]
        assert pairs, name
        after = apply(before[name], pairs)
        patched[name] = after
        print(f'{name}: {md5(before[name])} -> {md5(after)} ({len(pairs)} exact anchors)')
        # Guards must name both exact reference and target. No permissive hash list.
        assert md5(before[name]) in sql and md5(after) in sql
        # Parse the function actually produced by the source-aligned patch too.
        original_file = ASSESSMENT if name == 'api.appeal_portal_photo_analysis' else STOCK if name in [
            'internal.gallery_bind_photo_proposal','api.reserve_portal_photo_upload','api.cancel_portal_photo_upload','api.complete_portal_photo_upload'] else CANONICAL
        original = original_file.read_text(encoding='utf-8')
        definition = re.search(r'CREATE(?: OR REPLACE)? FUNCTION\s+' + re.escape(name)
            + r'\s*\([\s\S]*?\bAS\s+(\$\w*\$)[\s\S]*?\1\s*;', original, re.I)[0]
        parse_plpgsql(definition.replace(source(original, name), after))
    parse_sql(sql)
    for match in re.finditer(r'CREATE FUNCTION [\s\S]*?\bAS (\$\w*\$)([\s\S]*?)\1;', sql):
        if re.search(r'LANGUAGE plpgsql', match[0], re.I):
            parse_plpgsql(match[0])
        else:
            parse_sql(match[2])
    for match in re.finditer(r'DO (\$\w*\$)[\s\S]*?\1;', sql):
        parse_plpgsql(match[0])
    for name in ['partner_photo_actor_album.sql', 'close_partner_photo_actor_album.sql']:
        text = (ROOT / 'supabase/cutovers' / name).read_text(encoding='utf-8')
        parse_sql(text)
        for match in re.finditer(r'DO (\$\w*\$)[\s\S]*?\1;', text):
            parse_plpgsql(match[0])
    cutover = (ROOT / 'supabase/cutovers/partner_photo_actor_album.sql').read_text(encoding='utf-8')
    for signature, expected in re.findall(r"\('([^']+\([^']*\))','([0-9a-f]{32})'\)", cutover):
        name = signature.split('(')[0]
        if name in {'api.approve_pending_change', 'api.reject_pending_change'}:
            continue  # R6 hashes are independently reviewed; not rebuilt here.
        actual = patched[name] if name in patched else source(sql, name)
        assert md5(actual) == expected, f'Stale cutover source hash: {signature}'
    # Parse the reviewable recipes too, without executing psql meta commands or
    # using their placeholder pilot identifiers as real data.
    test_dir = ROOT / 'Base de donnée DLL et API/tests'
    paths = set(test_dir.glob('*photo_actor_album*.sql')) | set(test_dir.glob('*actor_photo_album*.sql'))
    for path in sorted(paths):
        lines = []
        for line in path.read_text(encoding='utf-8').splitlines():
            if line.startswith('\\gset'):
                lines.append(';')
            elif not line.startswith('\\'):
                lines.append(line)
        recipe = re.sub(r":'[A-Za-z_][A-Za-z0-9_]*'", "'pilot-value'", '\n'.join(lines))
        parse_sql(recipe)
        for match in re.finditer(r'DO (\$\w*\$)[\s\S]*?\1;', recipe):
            parse_plpgsql(match[0])
        print(f'{path.name}: grammar PASS; not executed')
    assert 'GRANT EXECUTE ON FUNCTION api.get_my_portal_photo_workspace(text) TO authenticated;' in sql
    assert 'm.xmin::text||\':\'||m.ctid::text' in sql
    assert 'd.xmin::text||\':\'||d.ctid::text' in sql
    assert "IS DISTINCT FROM p_expected" in sql
    assert "'writesEnabled',internal.portal_photo_actor_writes_enabled()" in sql
    print('PASS offline source guards, SQL and PL/pgSQL syntax; no DB execution')


if __name__ == '__main__':
    main()
