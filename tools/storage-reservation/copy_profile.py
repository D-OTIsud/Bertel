"""Strict copy profile. Existing research protocol/key grammar stays separate."""
from pathlib import Path
import hashlib
import re
from types import MappingProxyType, SimpleNamespace
from protocol import BINDING_KEYS, exact_keys, require, digest, uuid

MIME = ('application/pdf', 'image/jpeg', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/heif')
MAX_BYTES = 42305170


def validate_copy_binding(binding):
    exact_keys(binding, BINDING_KEYS, 'copy_binding_keys')
    for key in ('storage_origin_sha256', 'manifest_sha256', 'source_fingerprint_sha256', 'payload_sha256'):
        digest(binding[key])
    for key in ('namespace_id', 'epoch', 'document_id'):
        uuid(binding[key])
    require(type(binding['project_ref']) is str and re.fullmatch('[a-z0-9]{20}', binding['project_ref']), 'copy_project')
    require(type(binding['object_id']) is str and re.fullmatch('[A-Z0-9]{16}', binding['object_id']), 'copy_object')
    require(binding['bucket'] == 'legal-documents' and binding['key'] == 'objects/' + binding['object_id'] + '/' + binding['document_id'], 'copy_target')
    require(type(binding['payload_bytes']) is int and 0 < binding['payload_bytes'] <= MAX_BYTES, 'copy_size')
    require(type(binding['mime']) is str and binding['mime'] in MIME, 'copy_mime')


def admitted_copy(binding, owner_secret, attempt_id):
    validate_copy_binding(binding)
    digest(owner_secret)
    uuid(attempt_id)
    return SimpleNamespace(binding=MappingProxyType(dict(binding)), owner_secret=owner_secret,
        owner_sha256=hashlib.sha256(bytes.fromhex(owner_secret)).hexdigest(), attempt_id=attempt_id)


def fixture_profile_sql():
    """Exact derived local fixture, not an installer for a hosted project."""
    source = (Path(__file__).parent / 'prototype.sql').read_text(encoding='utf-8')
    changes = [
        ("(b->>'project_ref') !~ '^[a-z][a-z0-9-]{2,62}$'", "(b->>'project_ref') !~ '^[a-z0-9]{20}$'"),
        ("(b->>'object_id') !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'", "(b->>'object_id') !~ '^[A-Z0-9]{16}$'"),
        ("b->>'mime' not in ('application/pdf','image/jpeg')", "b->>'mime' not in (" + ','.join("'" + value + "'" for value in MIME) + ')'),
        ("(b->>'payload_bytes')::bigint > 10485760", "(b->>'payload_bytes')::bigint > 42305170"),
        ("b->>'key' <> 'proto/'||(b->>'namespace_id')||'/'||(b->>'object_id')||'/'||\n       (b->>'document_id')||'/'||(b->>'payload_sha256')", "b->>'key' <> 'objects/'||(b->>'object_id')||'/'||(b->>'document_id')"),
        ("prefix text not null check(prefix='proto/'||id::text||'/')", "prefix text not null check(prefix='objects/')"),
    ]
    for old, new in changes:
        require(source.count(old) == 1, 'copy_profile_source_drift')
        source = source.replace(old, new)
    source = source.replace('begin;\n', 'begin;\nset local search_path=pg_catalog,pg_temp;\n', 1)
    source = source.replace('set search_path=pg_catalog as', 'set search_path=pg_catalog,pg_temp as')
    source = source.replace('-- Exact ASCII fixture grammar, identical to protocol.canonical_fixture_key.', '-- Exact ASCII copy grammar, distinct from the research key profile.')
    return source.replace('-- PROTOTYPE FIXTURE ONLY.', '-- COPY PROFILE LOCAL FIXTURE ONLY.', 1)


def fixture_profile_check():
    return (Path(__file__).parent / 'check_fixture.sql').read_text(encoding='utf-8').replace(
        "array['search_path=pg_catalog']::text[]", "array['search_path=pg_catalog, pg_temp']::text[]")
