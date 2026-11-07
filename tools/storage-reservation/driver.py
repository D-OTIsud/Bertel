"""Synthetic-only conforming driver. Never uses a hosted/physical Storage client."""
import hashlib
import http.client
import json
from pathlib import Path
import uuid
from urllib.parse import urlsplit

from native_fixture import exclusive_json, json_literal, literal
from protocol import Refused, admit_and_open, exact_keys, require, validate_binding, uuid as valid_uuid


class SqlClient:
    as_current_operator = False

    def __init__(self, fixture, target):
        fixture.verify_owned()
        require(target['db_host'] == '127.0.0.1' and target['db_port'] == fixture.port
                and target['db_name'] == fixture.db and target['fixture_id'] == fixture.fixture_id,
                'fixture_connection_target')
        self.fixture = fixture

    def transaction(self, expression, nonce):
        marker = 'COMMIT_CONFIRMED_' + nonce
        role_sql = '' if self.as_current_operator else 'set local role service_role; '
        script = ('begin; ' + role_sql + 'select ' + expression + '; commit;\n'
                  '\\echo ' + marker + '\n')
        raw = self.fixture.sql(script, user='fixture_client')
        lines = raw.splitlines()
        require(len(lines) == 2 and lines[1] == marker, 'commit_ack_unknown')
        return json.loads(lines[0])

    def rpc(self, function, arguments):
        require(function in ('reserve', 'claim', 'inspect'), 'fixture_rpc')
        nonce = uuid.uuid4().hex  # Capture before the DB operation, not after COMMIT.
        return self.transaction('storage_reservation_api.' + function + '(' + ','.join(arguments) + ')', nonce)

    def reserve(self, admitted):
        return self.rpc('reserve', [json_literal(dict(admitted.binding)), literal(admitted.owner_sha256)])

    def claim(self, receipt, admitted):
        return self.rpc('claim', [literal(receipt) + '::uuid', json_literal(dict(admitted.binding)),
                                  literal(admitted.owner_secret), literal(admitted.attempt_id) + '::uuid'])

    def inspect(self, receipt, admitted):
        return self.rpc('inspect', [literal(receipt) + '::uuid', json_literal(dict(admitted.binding)), literal(admitted.owner_secret)])


class Journal:
    def __init__(self, root, admitted, owned_root):
        self.root = Path(root).resolve()
        require(self.root != Path(owned_root).resolve() and Path(owned_root).resolve() in self.root.parents,
                'journal_target')
        require(not self.root.exists(), 'existing_journal_requires_review')
        self.root.mkdir(mode=0o700, parents=True)
        self.write('owner.json', {'schema_version': 1, 'binding': dict(admitted.binding),
                                 'owner_secret': admitted.owner_secret, 'attempt_id': admitted.attempt_id})

    def write(self, name, value):
        require(name in {'owner.json', 'reserve-started.json', 'reservation.json', 'claim-started.json',
                         'dispatch-intent.json', 'observed.json', 'quarantine.json'}, 'journal_record')
        exclusive_json(self.root / name, value)


def reservation_reply(reply, admitted, binding_validator=validate_binding):
    exact_keys(reply, {'schema_version', 'phase', 'may_post', 'receipt_id', 'binding', 'state'}, 'reservation_reply')
    binding_validator(reply['binding'])
    require(type(reply['schema_version']) is int and reply['schema_version'] == 1
            and reply['phase'] == 'reservation' and reply['may_post'] is False
            and reply['binding'] == dict(admitted.binding)
            and reply['state'] in ('reserved', 'dispatch_started'), 'reservation_reply')
    valid_uuid(reply['receipt_id'])
    require(reply['state'] == 'reserved', 'dispatch_already_consumed')
    return reply['receipt_id']


def committed_claim_reply(reply, receipt, admitted, binding_validator=validate_binding):
    exact_keys(reply, {'schema_version', 'phase', 'may_post', 'receipt_id', 'binding', 'attempt_id'}, 'claim_reply')
    binding_validator(reply['binding'])
    require(type(reply['schema_version']) is int and reply['schema_version'] == 1
            and type(reply['may_post']) is bool and reply['receipt_id'] == receipt
            and reply['binding'] == dict(admitted.binding) and reply['attempt_id'] == admitted.attempt_id,
            'claim_reply')
    require(reply['phase'] == 'dispatch_granted' and reply['may_post'] is True, 'dispatch_already_consumed')


def post_fixture(admitted, payload=None):
    """One request, no redirects/retry/fallback/DELETE/move. Counts belong to the server."""
    data = admitted.payload if payload is None else payload
    require(type(data) is bytes and len(data) == admitted.binding['payload_bytes'] and
            hashlib.sha256(data).hexdigest() == admitted.binding['payload_sha256'], 'frontier_payload_identity')
    origin = urlsplit(admitted.target['http_origin'])
    require(origin.hostname == '127.0.0.1' and origin.scheme == 'http', 'fixture_http_only')
    connection = http.client.HTTPConnection('127.0.0.1', origin.port, timeout=2)
    try:
        path = '/storage/v1/object/' + admitted.binding['bucket'] + '/' + admitted.binding['key']
        connection.request('POST', path, body=data, headers={
            'Content-Type': admitted.binding['mime'], 'Content-Length': str(len(data)), 'x-upsert': 'false'})
        response = connection.getresponse()
        require(response.status == 200, 'storage_result_unknown')
        raw = response.read(65537)
        require(len(raw) <= 65536, 'storage_result_unknown')
        body = json.loads(raw)
        require(body == {'ok': True, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()},
                'storage_result_unknown')
        return body
    except Refused:
        raise
    except Exception:
        raise Refused('storage_result_unknown') from None
    finally:
        connection.close()


def run_flow(intent, admission, target, payload, fixture, journal_path, barrier=None,
             journal_type=Journal, client_type=SqlClient, frontier=post_fixture):
    # Snapshot/validate all DTO/payload before the first DB or HTTP connection.
    admitted, client = admit_and_open(intent, admission, target, payload,
                                     lambda pinned: client_type(fixture, pinned))
    journal = journal_type(journal_path, admitted, fixture.root)
    try:
        journal.write('reserve-started.json', {'attempt_id': admitted.attempt_id})
        receipt = reservation_reply(client.reserve(admitted), admitted)
        journal.write('reservation.json', {'receipt_id': receipt, 'binding': dict(admitted.binding)})
        if barrier is not None:
            barrier.wait(timeout=10)
        journal.write('claim-started.json', {'receipt_id': receipt, 'attempt_id': admitted.attempt_id})
        # This returns only after COMMIT and the exact marker, never on SELECT alone.
        reply = client.claim(receipt, admitted)
        committed_claim_reply(reply, receipt, admitted)
        journal.write('dispatch-intent.json', {'receipt_id': receipt, 'attempt_id': admitted.attempt_id})
        observed = frontier(admitted)
        journal.write('observed.json', observed)
        return {'state': 'observed', 'receipt_id': receipt}
    except Exception as error:
        code = error.args[0] if isinstance(error, Refused) else 'ambiguous_requires_review'
        try:
            journal.write('quarantine.json', {'state': 'quarantine', 'code': code})
        except Exception:
            pass
        return {'state': 'quarantine', 'code': code}
