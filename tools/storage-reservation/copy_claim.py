"""One-shot copy claim bridge. Private JSON stdin/stdout; no Storage calls."""
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import uuid

from copy_profile import admitted_copy, validate_copy_binding
from driver import Journal, SqlClient, reservation_reply, committed_claim_reply
from protocol import Refused, exact_keys, require

CONFIG_KEYS = {'mode', 'project_ref', 'storage_origin_sha256', 'namespace_id', 'epoch', 'manifest_sha256',
               'journal_root', 'psql_bin', 'host', 'port', 'database', 'user', 'sslmode', 'sslrootcert', 'password_file', 'fixture_root'}


def validate_config(config, binding):
    exact_keys(config, CONFIG_KEYS, 'copy_config_keys')
    validate_copy_binding(binding)
    for key in ('project_ref', 'storage_origin_sha256', 'namespace_id', 'epoch', 'manifest_sha256'):
        require(config[key] == binding[key], 'copy_target_binding')
    require(type(config['port']) is int and 1024 <= config['port'] <= 65535, 'copy_port')
    require(type(config['database']) is str and re.fullmatch('[a-z0-9_]{1,63}', config['database']), 'copy_database')
    require(type(config['user']) is str and re.fullmatch('[a-z0-9_]{1,63}', config['user']), 'copy_user')
    for key in ('journal_root', 'psql_bin', 'password_file'):
        require(type(config[key]) is str and Path(config[key]).is_absolute(), 'copy_private_path')
    root = Path(config['journal_root'])
    require(root.is_dir() and not root.is_symlink(), 'copy_journal_root')
    require(Path(config['psql_bin']).is_file() and Path(config['password_file']).is_file(), 'copy_local_files')
    if config['mode'] == 'owned_fixture':
        require(config['host'] == '127.0.0.1' and config['sslmode'] == 'disable' and config['sslrootcert'] == '', 'copy_owned_target')
        owner = json.loads((Path(config['fixture_root']) / 'ownership.json').read_bytes())
        require(owner['host'] == config['host'] and owner['port'] == config['port'] and owner['database'] == config['database'], 'copy_owned_target')
        require((Path(owner['data']) / 'postmaster.pid').is_file(), 'copy_owned_running')
    else:
        require(config['mode'] == 'hosted' and config['fixture_root'] == ''
                and config['host'] == 'db.' + config['project_ref'] + '.supabase.co'
                and config['port'] == 5432 and config['database'] == config['user'] == 'postgres'
                and config['sslmode'] == 'verify-full' and Path(config['sslrootcert']).is_absolute()
                and Path(config['sslrootcert']).is_file(), 'copy_hosted_target')


class PinnedPsql:
    def __init__(self, config):
        self.config = config

    def sql(self, script, user='fixture_client'):
        # SqlClient.transaction preserves nonce/COMMIT parsing.
        require(user == 'fixture_client', 'copy_protocol_user')
        c = self.config
        environment = {key: os.environ[key] for key in ('SystemRoot', 'SystemDrive', 'WINDIR', 'COMSPEC', 'PATHEXT',
            'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP') if key in os.environ}
        environment.update({'PGPASSFILE': c['password_file'], 'PGSERVICEFILE': c['password_file'],
            'PGSSLMODE': c['sslmode'], 'PGSSLROOTCERT': c['sslrootcert'], 'PGCONNECT_TIMEOUT': '5',
            'PGOPTIONS': '-c synchronous_commit=on -c statement_timeout=15000 -c lock_timeout=3000 -c search_path=pg_catalog,pg_temp', 'PGGSSENCMODE': 'disable'})
        # Quiet DO adds no DataRow; reject a wrong DB/executor before any RPC.
        guard = ("DO $copy_target$ BEGIN IF pg_catalog.current_database() <> '" + c['database']
            + "' OR session_user <> '" + c['user'] + "' OR pg_catalog.current_setting('server_version_num')::pg_catalog.int4 / 10000 <> 17"
            + " OR pg_catalog.current_setting('synchronous_commit') <> 'on' OR pg_catalog.current_setting('fsync') <> 'on'"
            + " OR pg_catalog.current_setting('full_page_writes') <> 'on'"
            + " THEN RAISE EXCEPTION 'copy_database_target'; END IF; END $copy_target$;\n")
        result = subprocess.run([c['psql_bin'], '-X', '-q', '-A', '-t', '-h', c['host'], '-p', str(c['port']),
            '-U', c['user'], '-d', c['database'], '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate'],
            input=guard + script, capture_output=True, text=True, encoding='utf-8', env=environment, timeout=25,
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        require(result.returncode == 0, 'copy_database_result_unknown')
        return result.stdout.strip()


class CopySqlClient(SqlClient):
    def __init__(self, config):
        self.fixture = PinnedPsql(config)
        self.as_current_operator = config['mode'] == 'hosted'


def claim_copy(binding, config, *, client_type=CopySqlClient, journal_type=Journal):
    binding, config = dict(binding), dict(config)
    validate_config(config, binding)  # Before opening any DB connection.
    admitted = admitted_copy(binding, secrets.token_hex(32), str(uuid.uuid4()))
    key = hashlib.sha256((admitted.binding['bucket'] + '\0' + admitted.binding['key']).encode('ascii')).hexdigest()
    journal_path = Path(config['journal_root']) / key
    journal = journal_type(journal_path, admitted, config['journal_root'])
    try:
        client = client_type(config)
        journal.write('reserve-started.json', {'attempt_id': admitted.attempt_id})
        receipt = reservation_reply(client.reserve(admitted), admitted, validate_copy_binding)
        journal.write('reservation.json', {'receipt_id': receipt, 'binding': dict(admitted.binding)})
        journal.write('claim-started.json', {'receipt_id': receipt, 'attempt_id': admitted.attempt_id})
        reply = client.claim(receipt, admitted)
        committed_claim_reply(reply, receipt, admitted, validate_copy_binding)
        journal.write('dispatch-intent.json', {'receipt_id': receipt, 'attempt_id': admitted.attempt_id})
        # This is an ephemeral one-use answer, never persisted as a replay grant.
        return {'schema_version': 1, 'state': 'dispatch_granted', 'receipt_id': receipt,
            'binding': dict(admitted.binding), 'attempt_id': admitted.attempt_id}
    except Exception as error:
        code = error.args[0] if isinstance(error, Refused) else 'copy_claim_unknown'
        try:
            journal.write('quarantine.json', {'state': 'quarantine', 'code': code})
        except Exception:
            pass
        raise Refused(code) from None


def main():
    request = json.load(sys.stdin)
    exact_keys(request, {'schema_version', 'binding', 'config'}, 'copy_request')
    require(type(request['schema_version']) is int and request['schema_version'] == 1, 'copy_schema')
    print(json.dumps(claim_copy(request['binding'], request['config']), separators=(',', ':')))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        code = error.args[0] if isinstance(error, Refused) and re.fullmatch('[a-z_]+', str(error.args[0])) else 'copy_claim_unknown'
        print(json.dumps({'state': 'quarantine', 'code': code}))
        sys.exit(1)
