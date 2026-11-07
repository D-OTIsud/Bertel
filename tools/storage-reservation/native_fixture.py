"""Owned, new, loopback-only PostgreSQL17 fixture. No inherited DSN or cleanup."""
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import uuid

from protocol import Refused, require


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def json_literal(value):
    return literal(json.dumps(value, sort_keys=True, separators=(',', ':'))) + '::jsonb'


def exclusive_json(path, value):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as output:
        json.dump(value, output, sort_keys=True, indent=2)
        output.write('\n')
        output.flush()
        os.fsync(output.fileno())


class SqlFailure(Refused):
    def __init__(self, code):
        self.sqlstate = code
        super().__init__('sql_' + code)


class OwnedPostgres:
    def __init__(self, artifact_root, pg_bin=Path('C:/Program Files/PostgreSQL/17/bin')):
        self.pg_bin = Path(pg_bin).resolve()
        self.fixture_id = str(uuid.uuid4())
        self.root = Path(artifact_root).resolve() / ('storage-reservation-native-' + self.fixture_id)
        self.root.mkdir(mode=0o700)
        self.data = self.root / 'data'
        self.db = 'storage_reservation_fixture_' + self.fixture_id.replace('-', '')[:16]
        with socket.socket() as candidate:
            candidate.bind(('127.0.0.1', 0))
            self.port = candidate.getsockname()[1]
        self.started, self.pid = False, None
        self.marker = self.root / 'ownership.json'
        # Before initdb, pg_ctl, roles, database or schema mutation.
        exclusive_json(self.marker, {'fixture_id': self.fixture_id, 'root': str(self.root),
                                     'data': str(self.data), 'host': '127.0.0.1', 'port': self.port,
                                     'database': self.db, 'pg_bin': str(self.pg_bin)})
        empty = self.root / 'empty-credentials'
        with empty.open('x'):
            pass
        # Windows restricted-process startup needs ordinary OS profile/runtime
        # variables. Explicit allowlist only: never copy account/PG credentials.
        self.env = {name: os.environ[name] for name in (
            'SystemRoot','SystemDrive','WINDIR','COMSPEC','PATHEXT','USERNAME',
            'USERDOMAIN','USERPROFILE','APPDATA','LOCALAPPDATA') if name in os.environ}
        system_root = Path(self.env.get('SystemRoot', 'C:/Windows'))
        self.env.update({'SystemRoot': str(system_root),
                    'PATH': os.pathsep.join((str(self.pg_bin), str(system_root / 'System32'), str(system_root))),
                    'TEMP': str(self.root), 'TMP': str(self.root), 'LC_ALL': 'C',
                    'PGPASSFILE': str(empty), 'PGSERVICEFILE': str(empty), 'PGSYSCONFDIR': str(self.root),
                    'PGCONNECT_TIMEOUT': '3', 'PGSSLMODE': 'disable'})

    def command(self, program, args, script=None, timeout=20):
        suffix = '.exe' if os.name == 'nt' else ''
        command = [str(self.pg_bin / (program + suffix)), *args]
        options = {'text': True, 'encoding': 'utf-8', 'timeout': timeout, 'env': self.env,
                   'creationflags': getattr(subprocess, 'CREATE_NO_WINDOW', 0)}
        if program == 'pg_ctl':
            # A daemon can inherit pipe handles on Windows. File-backed capture
            # lets pg_ctl completion remain bounded independently of its child.
            tag = uuid.uuid4().hex
            out_path, err_path = self.root / ('pgctl-' + tag + '.out'), self.root / ('pgctl-' + tag + '.err')
            with out_path.open('x') as out, err_path.open('x') as err:
                result = subprocess.run(command, stdin=subprocess.DEVNULL, stdout=out, stderr=err, **options)
            result.stdout, result.stderr = out_path.read_text(), err_path.read_text()
        else:
            result = subprocess.run(command, input=script, capture_output=True, **options)
        if program in ('initdb', 'pg_ctl'):
            exclusive_json(self.root / (program + '-' + uuid.uuid4().hex + '.json'),
                           {'exit': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr})
        return result

    def verify_owned(self):
        marker = json.loads(self.marker.read_text())
        require(marker['fixture_id'] == self.fixture_id and Path(marker['data']).resolve() == self.data.resolve()
                and self.data.parent == self.root and marker['host'] == '127.0.0.1'
                and marker['port'] == self.port, 'fixture_ownership')
        if self.pid is not None:
            require(int((self.data / 'postmaster.pid').read_text().splitlines()[0]) == self.pid, 'fixture_pid')

    def start(self):
        self.verify_owned()
        initialized = self.command('initdb', ['-D', str(self.data), '-U', 'fixture_admin', '--encoding=UTF8',
                                               '--locale=C', '--auth=trust'])
        require(initialized.returncode == 0, 'fixture_initdb_failed')
        options = ('-h 127.0.0.1 -p ' + str(self.port) + ' -c fsync=on -c synchronous_commit=on'
                   ' -c full_page_writes=on -c log_statement=none -c log_min_error_statement=panic')
        try:
            started = self.command('pg_ctl', ['-D', str(self.data), '-l', str(self.root / 'server.log'),
                                               '-o', options, '-w', 'start'])
        finally:
            if (self.data / 'postmaster.pid').exists():
                self.pid = int((self.data / 'postmaster.pid').read_text().splitlines()[0])
                self.started = True
        require(started.returncode == 0 and self.started, 'fixture_start_failed')
        self.verify_owned()
        self.sql('create database ' + self.db + ';', database='postgres')
        self.sql('''create role anon nologin; create role authenticated nologin;
            create role fixture_publisher nologin; create role service_role nologin bypassrls;
            create role fixture_client login noinherit nosuperuser nocreatedb nocreaterole;
            grant service_role to fixture_client;''')
        exclusive_json(self.root / 'started.json', {'pid': self.pid, 'fixture_id': self.fixture_id,
                                                   'version': self.scalar('show server_version;')})
        return self

    def config(self):
        self.verify_owned()
        return {'pg_bin': str(self.pg_bin), 'root': str(self.root), 'fixture_id': self.fixture_id,
                'data': str(self.data), 'pid': self.pid, 'port': self.port, 'db': self.db, 'env': self.env}

    def psql_args(self, user='fixture_admin', database=None, application='fixture-test'):
        require(re.fullmatch('[a-z0-9-]{1,40}', application), 'fixture_application')
        return ['-X', '-q', '-A', '-t', '-h', '127.0.0.1', '-p', str(self.port), '-U', user,
                '-d', database or self.db, '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate']

    def sql(self, script, user='fixture_admin', database=None):
        self.verify_owned()
        result = self.command('psql', self.psql_args(user, database), script, timeout=20)
        if result.returncode != 0:
            match = re.search(r'(?:ERROR|FATAL):\s+([0-9A-Z]{5})\b', result.stderr)
            raise SqlFailure(match.group(1) if match else 'io_unknown')
        return result.stdout.strip()

    def scalar(self, script):
        return self.sql(script).splitlines()[-1]

    def install(self):
        return self.sql((Path(__file__).parent / 'prototype.sql').read_text())

    def stop(self):
        if not self.started:
            return
        self.verify_owned()
        result = self.command('pg_ctl', ['-D', str(self.data), '-m', 'fast', '-w', 'stop'])
        require(result.returncode == 0, 'fixture_stop_failed')
        self.started = False
        exclusive_json(self.root / 'stopped.json', {'fixture_id': self.fixture_id, 'pid': self.pid,
                                                   'data_retained': True})


def from_config(config):
    """Child worker handle to this already owned fixture; never starts/reuses a DSN."""
    item = object.__new__(OwnedPostgres)
    item.pg_bin, item.root, item.data = Path(config['pg_bin']), Path(config['root']), Path(config['data'])
    item.fixture_id, item.port, item.db, item.pid = config['fixture_id'], config['port'], config['db'], config['pid']
    item.marker, item.env, item.started = item.root / 'ownership.json', config['env'], True
    item.verify_owned()
    require(item.db == 'storage_reservation_fixture_' + item.fixture_id.replace('-', '')[:16], 'fixture_database_name')
    return item
