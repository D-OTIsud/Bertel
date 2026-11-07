"""Prototype-only DTO gate. No network/database imports or physical operator path."""
import hashlib
import re
from dataclasses import dataclass, field
from types import MappingProxyType
from urllib.parse import urlsplit
from uuid import UUID

BINDING_KEYS = {
    'project_ref', 'storage_origin_sha256', 'namespace_id', 'epoch', 'manifest_sha256',
    'bucket', 'key', 'document_id', 'object_id', 'source_fingerprint_sha256',
    'payload_sha256', 'payload_bytes', 'mime',
}
TARGET_KEYS = {
    'fixture_id', 'db_host', 'db_port', 'db_name', 'http_origin', 'project_ref',
    'storage_origin_sha256', 'namespace_id', 'epoch', 'manifest_sha256',
}
INTENT_KEYS = {'schema_version', 'binding', 'owner_secret', 'attempt_id'}
MAX_FIXTURE_BYTES = 10 * 1024 * 1024


class Refused(Exception):
    pass


def require(condition, code):
    if not condition:
        raise Refused(code)


def exact_keys(value, expected, code):
    require(type(value) is dict and set(value) == expected, code)


def uuid(value):
    require(type(value) is str and len(value) == 36, 'uuid_shape')
    try:
        require(str(UUID(value)) == value, 'uuid_canonical')
    except ValueError:
        raise Refused('uuid_shape') from None


def digest(value):
    require(type(value) is str and re.fullmatch('[a-f0-9]{64}', value), 'sha256_shape')


def canonical_fixture_key(binding):
    # Research fixture only. This does not select a destination for a real batch.
    return '/'.join(('proto', binding['namespace_id'], binding['object_id'],
                     binding['document_id'], binding['payload_sha256']))


def validate_binding(binding):
    exact_keys(binding, BINDING_KEYS, 'binding_keys')
    require(type(binding['project_ref']) is str and
            re.fullmatch('[a-z][a-z0-9-]{2,62}', binding['project_ref']), 'project_shape')
    for key in ('storage_origin_sha256', 'manifest_sha256', 'source_fingerprint_sha256', 'payload_sha256'):
        digest(binding[key])
    for key in ('namespace_id', 'epoch', 'document_id'):
        uuid(binding[key])
    require(binding['bucket'] == 'legal-documents', 'bucket')
    require(type(binding['object_id']) is str and
            re.fullmatch('[A-Za-z0-9][A-Za-z0-9._-]{0,63}', binding['object_id']), 'object_shape')
    key = binding['key']
    require(type(key) is str and len(key) <= 512 and key.isascii() and
            re.fullmatch('[A-Za-z0-9._/-]+', key) and
            all(part not in ('', '.', '..') for part in key.split('/')), 'key_canonical')
    require(key == canonical_fixture_key(binding), 'key_binding')
    require(type(binding['payload_bytes']) is int and
            0 < binding['payload_bytes'] <= MAX_FIXTURE_BYTES, 'payload_size')
    require(binding['mime'] in ('application/pdf', 'image/jpeg'), 'mime')


def validate_target(target):
    exact_keys(target, TARGET_KEYS, 'target_keys')
    uuid(target['fixture_id'])
    require(target['db_host'] == '127.0.0.1' and type(target['db_port']) is int and
            1024 <= target['db_port'] <= 65535, 'fixture_database_target')
    expected_name = 'storage_reservation_fixture_' + target['fixture_id'].replace('-', '')[:16]
    require(target['db_name'] == expected_name, 'fixture_database_name')
    origin = target['http_origin']
    require(type(origin) is str and 0 < len(origin) < 128 and origin.isascii() and
            all(32 < ord(c) < 127 for c in origin), 'fixture_http_target')
    try:
        parsed = urlsplit(origin)
        port = parsed.port
    except ValueError:
        raise Refused('fixture_http_target') from None
    require(parsed.scheme == 'http' and parsed.hostname == '127.0.0.1' and
            type(port) is int and 1024 <= port <= 65535 and parsed.netloc == '127.0.0.1:' + str(port) and
            not (parsed.path or parsed.query or parsed.fragment), 'fixture_http_target')
    require(target['storage_origin_sha256'] == hashlib.sha256(origin.encode('ascii')).hexdigest(),
            'fixture_origin_fingerprint')
    digest(target['manifest_sha256'])
    uuid(target['namespace_id'])
    uuid(target['epoch'])


@dataclass(frozen=True)
class AdmittedIntent:
    binding: object
    target: object
    owner_secret: str = field(repr=False)
    owner_sha256: str
    attempt_id: str
    payload: bytes = field(repr=False)


def validate_intent(intent, admitted_binding, target, payload):
    """Return an owned snapshot. This entire function runs before any connection."""
    exact_keys(intent, INTENT_KEYS, 'intent_keys')
    require(type(intent['schema_version']) is int and intent['schema_version'] == 1, 'intent_schema')
    validate_binding(admitted_binding)
    validate_binding(intent['binding'])
    require(intent['binding'] == admitted_binding, 'foreign_binding')
    validate_target(target)
    for key in ('project_ref', 'storage_origin_sha256', 'namespace_id', 'epoch', 'manifest_sha256'):
        require(intent['binding'][key] == target[key], 'foreign_target')
    digest(intent['owner_secret'])
    uuid(intent['attempt_id'])
    require(type(payload) in (bytes, bytearray), 'payload_type')
    frozen_payload = bytes(payload)
    require(len(frozen_payload) == intent['binding']['payload_bytes'] and
            hashlib.sha256(frozen_payload).hexdigest() == intent['binding']['payload_sha256'], 'payload_identity')
    return AdmittedIntent(
        MappingProxyType(dict(intent['binding'])), MappingProxyType(dict(target)), intent['owner_secret'],
        hashlib.sha256(bytes.fromhex(intent['owner_secret'])).hexdigest(), intent['attempt_id'], frozen_payload)


def admit_and_open(intent, admitted_binding, target, payload, connect):
    admitted = validate_intent(intent, admitted_binding, target, payload)
    return admitted, connect(admitted.target)
