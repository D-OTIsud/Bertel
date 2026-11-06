"""Synthetic Docker outcomes and real Node probe; no Docker daemon or application."""
import hashlib
import http.server
import importlib.util
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import tempfile
import threading
import unittest
from unittest import mock

spec = importlib.util.spec_from_file_location('import_smoke', Path(__file__).with_name('import_and_smoke.py'))
ops = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ops)
NODE = os.environ.get('NODE_BINARY') or shutil.which('node')
NONCE = 'c' * 32
CONTAINER = 'b' * 64
PUBLIC = {key: 'synthetic-' + key for key in ops.PUBLIC_KEYS}
PUBLIC[ops.PUBLIC_KEYS[0]] = 'https://example.invalid'
PUBLIC[ops.PUBLIC_KEYS[1]] = 'synthetic-public-key'
PUBLIC[ops.PUBLIC_KEYS[3]] = 'accent-é\n"quoted"'
EXPECTED = {'source_sha': 'a' * 40, 'image_id': 'sha256:' + 'd' * 64, 'image_size': 1024,
            'public_config_sha256': ops.config_hash(PUBLIC)}


class MemoryJournal:
    def __init__(self, fail=None):
        self.records = {}
        self.fail = fail

    def record(self, name, value):
        if name == self.fail:
            raise OSError('synthetic journal failure')
        if name in self.records:
            raise FileExistsError(name)
        self.records[name] = value


class FakeDocker(ops.Docker):
    """Effects occur in Python state; even an acknowledged create has no daemon."""
    def __init__(self, journal, failure=None):
        self.journal, self.failure, self.calls = journal, failure, []
        self.created = False
        self.tag = EXPECTED['image_id']
        self.name = None

    def invoke(self, args, timeout=60):
        self.calls.append(args)
        if args[1:3] == ['image', 'load']:
            return subprocess.CompletedProcess(args, 0, '', '')
        if args[1:3] == ['image', 'inspect']:
            if args[4] == '{{.Id}}':
                if self.failure == 'tag_divergent':
                    return subprocess.CompletedProcess(args, 0, 'sha256:' + 'e' * 64, '')
                if self.failure == 'tag_missing':
                    return subprocess.CompletedProcess(args, 1, '', 'No such image')
                return subprocess.CompletedProcess(args, 0, self.tag, '')
            image = {'id': EXPECTED['image_id'], 'size': EXPECTED['image_size'], 'os': 'linux',
                     'arch': 'amd64', 'user': 'node', 'revision': EXPECTED['source_sha'], 'source': ops.SOURCE}
            return subprocess.CompletedProcess(args, 0, json.dumps(image), '')
        if args[1:3] == ['image', 'tag']:
            if self.failure == 'tag_unknown':
                raise ops.UnknownOutcome('synthetic_ack_lost')
            return subprocess.CompletedProcess(args, 0, '', '')
        if args[1] == 'create':
            assert '30-create-intent.json' in self.journal.records
            assert self.journal.records['30-create-intent.json']['nonce'] == NONCE
            self.name = args[args.index('--name') + 1]
            self.created = True
            if self.failure == 'create_unknown':
                raise ops.UnknownOutcome('synthetic_ack_lost')
            return subprocess.CompletedProcess(args, 0, '' if self.failure == 'create_bad_ack' else CONTAINER, '')
        if args[1] == 'start':
            assert self.journal.records['31-create-ack.json']['container_id'] == CONTAINER
            assert '34-created-identity-ack.json' in self.journal.records
            assert '40-start-intent.json' in self.journal.records
            if self.failure == 'start_unknown':
                raise ops.UnknownOutcome('synthetic_ack_lost')
            return subprocess.CompletedProcess(args, 1 if self.failure == 'start_failed' else 0, '', '')
        if args[1] == 'exec':
            if self.failure == 'probe_unknown':
                raise ops.UnknownOutcome('synthetic_ack_lost')
            return subprocess.CompletedProcess(args, 1 if self.failure == 'probe_failed' else 0,
                                               '' if self.failure == 'probe_failed' else 'health2/2', '')
        if args[1] == 'inspect':
            owner = {'id': CONTAINER, 'image': EXPECTED['image_id'], 'name': '/' + self.name, 'nonce': NONCE}
            for key in ['id', 'image', 'nonce', 'name']:
                if self.failure == 'wrong_' + key or (self.failure == 'cleanup_wrong_' + key and self.count('inspect') >= 2):
                    owner[key] = 'wrong'
            return subprocess.CompletedProcess(args, 0, json.dumps(owner), '')
        if args[1] == 'rm':
            assert '61-cleanup-intent.json' in self.journal.records
            if self.failure == 'cleanup_unknown':
                raise ops.UnknownOutcome('synthetic_ack_lost')
            return subprocess.CompletedProcess(args, 1 if self.failure == 'cleanup_failed' else 0, '', '')
        raise AssertionError('unexpected synthetic Docker command')

    def count(self, command):
        return sum(args[1] == command for args in self.calls)


class OperationTests(unittest.TestCase):
    def execute(self, failure=None, fail_journal=None):
        journal = MemoryJournal(fail_journal)
        client = FakeDocker(journal, failure)
        ticks = iter(range(0, 1000, 20))
        return journal, client, lambda: ops.perform_operations(
            client, journal, EXPECTED, '/synthetic/quarantine', 'synthetic-current', PUBLIC,
            clock=lambda: next(ticks), sleep=lambda _: None, nonce=NONCE)

    def test_positive_intent_before_create_ack_before_start_and_cleanup(self):
        journal, client, execute = self.execute()
        receipt = execute()
        self.assertTrue(receipt['healthcheck_disabled'])
        self.assertEqual(receipt['redirect'], 'error')
        self.assertTrue(receipt['writer_freeze_required'])
        create = next(args for args in client.calls if args[1] == 'create')
        self.assertIn('--no-healthcheck', create)
        self.assertIn('--network', create)
        self.assertEqual(create[create.index('--network') + 1], 'none')
        self.assertNotIn('--publish', create)
        self.assertEqual(client.count('create'), 1)
        self.assertEqual(client.count('rm'), 1)
        self.assertIn('63-cleanup-ack.json', journal.records)
        self.assertIn('70-complete.json', journal.records)
        self.assertEqual(journal.records['00-intent.json']['smoke_nonce'], NONCE)

    def test_create_effect_then_lost_ack_stops_without_start_cleanup_or_replay(self):
        journal, client, execute = self.execute('create_unknown')
        with self.assertRaises(ops.UnknownOutcome):
            execute()
        self.assertTrue(client.created)
        self.assertEqual(client.count('create'), 1)
        self.assertEqual(client.count('start'), 0)
        self.assertEqual(client.count('inspect'), 0)
        self.assertEqual(client.count('rm'), 0)
        self.assertIn('32-create-unknown.json', journal.records)
        self.assertNotIn('31-create-ack.json', journal.records)
        with self.assertRaises(FileExistsError):
            execute()
        self.assertEqual(client.count('create'), 1)

    def test_invalid_create_ack_is_ambiguous_and_never_cleaned(self):
        journal, client, execute = self.execute('create_bad_ack')
        with self.assertRaises(ops.UnknownOutcome):
            execute()
        self.assertIn('32-create-unknown.json', journal.records)
        self.assertEqual(client.count('start'), 0)
        self.assertEqual(client.count('rm'), 0)

    def test_ack_cannot_be_persisted_no_start_or_cleanup(self):
        journal, client, execute = self.execute(fail_journal='31-create-ack.json')
        with self.assertRaises(OSError):
            execute()
        self.assertTrue(client.created)
        self.assertEqual(client.count('start'), 0)
        self.assertEqual(client.count('rm'), 0)

    def test_intent_cannot_be_persisted_no_create(self):
        journal, client, execute = self.execute(fail_journal='30-create-intent.json')
        with self.assertRaises(OSError):
            execute()
        self.assertEqual(client.count('create'), 0)

    def test_start_or_probe_ack_unknown_never_automatically_cleaned(self):
        for stage in ['start', 'probe']:
            with self.subTest(stage=stage):
                journal, client, execute = self.execute(stage + '_unknown')
                with self.assertRaises(ops.UnknownOutcome):
                    execute()
                self.assertEqual(client.count('rm'), 0)
                self.assertIn('42-start-unknown.json' if stage == 'start' else '52-probe-unknown.json', journal.records)

    def test_start_nonzero_or_lost_ack_never_triggers_automatic_cleanup(self):
        for failure in ['start_failed', 'start_unknown']:
            with self.subTest(failure=failure):
                journal, client, execute = self.execute(failure)
                with self.assertRaises(ops.UnknownOutcome):
                    execute()
                self.assertEqual(client.count('rm'), 0)
                self.assertIn('42-start-unknown.json', journal.records)
                self.assertNotIn('70-complete.json', journal.records)

    def test_acknowledged_negative_readonly_probe_only_cleans_confirmed_identity(self):
        journal, client, execute = self.execute('probe_failed')
        with self.assertRaises(ops.Refused):
            execute()
        self.assertEqual(client.count('rm'), 1)
        self.assertIn('52-probe-failed.json', journal.records)
        self.assertIn('63-cleanup-ack.json', journal.records)
        self.assertNotIn('70-complete.json', journal.records)

    def test_cleanup_nonzero_and_lost_ack_are_unknown_without_second_rm(self):
        for failure in ['cleanup_failed', 'cleanup_unknown']:
            with self.subTest(failure=failure):
                journal, client, execute = self.execute(failure)
                with self.assertRaises(ops.Refused):
                    execute()
                self.assertEqual(client.count('rm'), 1)
                self.assertIn('62-cleanup-unknown.json', journal.records)
                self.assertNotIn('70-complete.json', journal.records)

    def test_wrong_created_id_nonce_image_or_name_forbids_start_and_rm(self):
        for key in ['id', 'nonce', 'image', 'name']:
            with self.subTest(key=key):
                journal, client, execute = self.execute('wrong_' + key)
                with self.assertRaisesRegex(ops.Refused, 'created_identity'):
                    execute()
                self.assertEqual(client.count('start'), 0)
                self.assertEqual(client.count('rm'), 0)
                self.assertIn('35-created-identity-refused.json', journal.records)
                self.assertNotIn('40-start-intent.json', journal.records)

    def test_changed_cleanup_id_nonce_image_or_name_forbids_rm(self):
        for key in ['id', 'nonce', 'image', 'name']:
            with self.subTest(key=key):
                journal, client, execute = self.execute('cleanup_wrong_' + key)
                with self.assertRaisesRegex(ops.Refused, 'cleanup_identity'):
                    execute()
                self.assertEqual(client.count('start'), 1)
                self.assertEqual(client.count('rm'), 0)
                self.assertIn('34-created-identity-ack.json', journal.records)
                self.assertNotIn('61-cleanup-intent.json', journal.records)

    def test_divergent_tag_is_not_replaced_or_used_to_create(self):
        journal, client, execute = self.execute('tag_divergent')
        with self.assertRaisesRegex(ops.Refused, 'tag_points_elsewhere'):
            execute()
        self.assertFalse(any(args[1:3] == ['image', 'tag'] for args in client.calls))
        self.assertEqual(client.count('create'), 0)

    def test_public_hash_mismatch_stops_before_docker_effect(self):
        journal, client, _ = self.execute()
        public = dict(PUBLIC)
        public[ops.PUBLIC_KEYS[0]] = 'changed'
        with self.assertRaisesRegex(ops.Refused, 'configuration_changed'):
            ops.perform_operations(client, journal, EXPECTED, '/synthetic', 'synthetic-current', public, nonce=NONCE)
        self.assertEqual(client.calls, [])

    def test_transport_exception_is_constant_without_raw_output_or_environment(self):
        client = ops.Docker('/synthetic/private-config')
        with mock.patch.object(ops.subprocess, 'run', side_effect=subprocess.TimeoutExpired('PRIVATE_SENTINEL', 1)) as call:
            with self.assertRaises(ops.UnknownOutcome) as error:
                client.run(['docker', 'create', 'synthetic'])
            self.assertEqual(str(error.exception), 'docker_ack_unknown')
            self.assertIsNone(error.exception.__cause__)
            child_env = call.call_args.kwargs['env']
            self.assertNotIn('DOCKER_HOST', child_env)
            self.assertNotIn('SUPABASE_ACCESS_TOKEN', child_env)

    def nonzero_transport_after_effect(self, stage):
        journal, fake, _ = self.execute()
        client = ops.Docker('/synthetic/private-config')
        effects = []
        def transport(args, **kwargs):
            self.assertEqual(args[:len(client.prefix)], client.prefix)
            command = ['docker'] + args[len(client.prefix):]
            outcome = fake.invoke(command, kwargs.get('timeout', 60))
            if command[1] == stage:
                effects.append(stage)  # The daemon effect preceded the failed CLI ACK.
                return subprocess.CompletedProcess(args, 1, '', 'connection reset by peer')
            return outcome
        ticks = iter(range(0, 1000, 20))
        observed = None
        with mock.patch.object(ops.subprocess, 'run', side_effect=transport):
            try:
                ops.perform_operations(client, journal, EXPECTED, '/synthetic/quarantine', 'synthetic-current', PUBLIC,
                                       clock=lambda: next(ticks), sleep=lambda _: None, nonce=NONCE)
            except BaseException as error:
                observed = error
        self.assertEqual(effects, [stage])
        marker = {'create': '32-create-unknown.json', 'start': '42-start-unknown.json',
                  'rm': '62-cleanup-unknown.json'}[stage]
        state = {'classification': type(observed).__name__, 'rm_calls': fake.count('rm'),
                 'create_calls': fake.count('create'), 'unknown_record': marker in journal.records,
                 'complete': '70-complete.json' in journal.records}
        self.assertEqual(state, {'classification': 'UnknownOutcome', 'rm_calls': 1 if stage == 'rm' else 0,
                                 'create_calls': 1, 'unknown_record': True, 'complete': False})

    def test_actual_docker_run_create_nonzero_after_effect_is_unknown(self):
        self.nonzero_transport_after_effect('create')

    def test_actual_docker_run_start_nonzero_after_effect_never_triggers_rm(self):
        self.nonzero_transport_after_effect('start')

    def test_actual_docker_run_rm_nonzero_after_effect_never_retries_rm(self):
        self.nonzero_transport_after_effect('rm')

    def test_hex64_create_ack_for_foreign_container_never_starts_or_removes_it(self):
        journal = MemoryJournal()
        foreign_id = 'f' * 64
        class ForeignAckDocker(FakeDocker):
            def invoke(self, args, timeout=60):
                if args[1] == 'create':
                    super().invoke(args, timeout)
                    return subprocess.CompletedProcess(args, 0, foreign_id, '')
                if args[1] == 'inspect':
                    self.calls.append(args)
                    return subprocess.CompletedProcess(args, 0, json.dumps({
                        'id': foreign_id, 'name': '/unrelated-container', 'nonce': 'unrelated-nonce',
                        'image': 'sha256:' + 'e' * 64,
                    }), '')
                if args[1] == 'start':
                    self.calls.append(args)
                    return subprocess.CompletedProcess(args, 0, '', '')
                return super().invoke(args, timeout)
        client = ForeignAckDocker(journal)
        ticks = iter(range(0, 1000, 20))
        with self.assertRaises(ops.Refused):
            ops.perform_operations(client, journal, EXPECTED, '/synthetic/quarantine', 'synthetic-current', PUBLIC,
                                   clock=lambda: next(ticks), sleep=lambda _: None, nonce=NONCE)
        self.assertEqual(journal.records['31-create-ack.json']['container_id'], foreign_id)
        self.assertEqual(client.count('start'), 0)
        self.assertEqual(client.count('rm'), 0)
        self.assertIn('35-created-identity-refused.json', journal.records)
        self.assertNotIn('40-start-intent.json', journal.records)


class NodeProbeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not NODE:
            raise unittest.SkipTest('Node is required for native probe qualification')
        cls.mode, cls.hits = 'positive', []

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                cls.hits.append(self.path)
                if cls.mode == 'redirect_' + self.path:
                    self.send_response(302)
                    self.send_header('Location', '/redirect-trap')
                    self.end_headers()
                    return
                if self.path == '/api/health':
                    value = {'ok': cls.mode != 'health', 'service': 'bertel-tourism-ui'}
                    body = json.dumps(value)
                elif self.path == '/api/app-version':
                    body = json.dumps({'minimumClientVersion': 1 if cls.mode == 'version' else 2, 'writeContractVersion': 2})
                else:
                    entries = [(key, PUBLIC[key]) for key in ops.PUBLIC_KEYS]
                    if cls.mode == 'duplicate':
                        entries.append(entries[0])
                    if cls.mode == 'missing':
                        entries.pop()
                    if cls.mode == 'unknown':
                        entries.append(('UNKNOWN_KEY', 'synthetic'))
                    body = 'window.__APP_CONFIG__ = {' + ','.join(k + ':' + json.dumps(v) for k, v in entries) + '};'
                    if cls.mode == 'malformed':
                        body = 'window.__APP_CONFIG__ = {bad syntax};'
                    if cls.mode == 'injected':
                        body += 'process.stdout.write("MUST_NOT_EXECUTE");'
                    if cls.mode == 'oversized':
                        body = 'x' * 16385
                self.send_response(200)
                self.send_header('Content-Type', 'text/javascript' if self.path == '/runtime-config.js' else 'application/json')
                self.send_header('Content-Length', str(len(body.encode())))
                self.end_headers()
                self.wfile.write(body.encode())

            def log_message(self, *args):
                pass
        cls.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.origin = 'http://127.0.0.1:' + str(cls.server.server_port)

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls, 'server'):
            cls.server.shutdown()
            cls.server.server_close()
            cls.thread.join(2)

    def node(self, script):
        environment = {key: os.environ[key] for key in ['PATH', 'LANG', 'LC_ALL', 'SystemRoot', 'WINDIR', 'TMP', 'TEMP'] if key in os.environ}
        return subprocess.run([NODE, '-e', script], capture_output=True, text=True, timeout=15, env=environment)

    def test_real_node_positive_contract_and_escaped_config(self):
        type(self).mode, type(self).hits = 'positive', []
        result = self.node(ops.probe_script(EXPECTED['public_config_sha256'], self.origin))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, 'health2/2')
        self.assertEqual(type(self).hits, ['/api/health', '/api/app-version', '/runtime-config.js'])

    def test_real_node_negative_contract_and_configuration_variants(self):
        for mode in ['health', 'version', 'duplicate', 'missing', 'unknown', 'malformed', 'injected', 'oversized', 'hash']:
            with self.subTest(mode=mode):
                type(self).mode, type(self).hits = mode, []
                digest = '0' * 64 if mode == 'hash' else EXPECTED['public_config_sha256']
                result = self.node(ops.probe_script(digest, self.origin))
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(result.stdout, '')
                self.assertEqual(result.stderr, '')

    def test_real_node_refuses_redirect_at_each_of_the_three_endpoints(self):
        for path in ['/api/health', '/api/app-version', '/runtime-config.js']:
            with self.subTest(path=path):
                type(self).mode, type(self).hits = 'redirect_' + path, []
                result = self.node(ops.probe_script(EXPECTED['public_config_sha256'], self.origin))
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn('/redirect-trap', type(self).hits)
                self.assertEqual(result.stdout, '')
                self.assertEqual(result.stderr, '')

    def test_real_node_with_fake_fetch_requires_all_three_redirect_options(self):
        type(self).mode = 'positive'
        config = 'window.__APP_CONFIG__={' + ','.join(k + ':' + json.dumps(v) for k, v in PUBLIC.items()) + '};'
        prelude = """let count=0;global.fetch=async(url,options)=>{
if(options.redirect!=='error')throw Error('redirect option');
count++;const text=url.endsWith('/api/health')?JSON.stringify({ok:true,service:'bertel-tourism-ui'}):
url.endsWith('/api/app-version')?JSON.stringify({minimumClientVersion:2,writeContractVersion:2}):CONFIG;
return new Response(text,{status:200});};
process.on('exit',()=>{if(count!==3)process.exitCode=1;});""".replace('CONFIG', json.dumps(config))
        result = self.node(prelude + ops.probe_script(EXPECTED['public_config_sha256']))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, 'health2/2')


@unittest.skipUnless(sys_platform_linux := (os.name == 'posix' and hasattr(os, 'geteuid') and os.geteuid() == 0),
                     'Requires the isolated native Linux root CI filesystem')
class PosixJournalTests(unittest.TestCase):
    def test_operation_directory_and_records_are_exclusive_private_and_synced(self):
        with tempfile.TemporaryDirectory() as folder:
            journal = ops.Journal(folder)
            try:
                journal.record('00-intent.json', {'synthetic': True})
                self.assertEqual(stat.S_IMODE(os.stat(journal.path).st_mode), 0o700)
                self.assertEqual(stat.S_IMODE(os.stat(journal.path + '/00-intent.json').st_mode), 0o600)
                with self.assertRaises(FileExistsError):
                    journal.record('00-intent.json', {'overwrite': True})
                with self.assertRaises(FileExistsError):
                    ops.Journal(folder)
                with self.assertRaises(ops.Refused):
                    journal.record('../escape.json', {})
            finally:
                journal.close()

    def test_symlink_record_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as folder:
            journal = ops.Journal(folder)
            try:
                other = Path(folder) / 'sentinel'
                other.write_text('unchanged')
                os.symlink(other, journal.path + '/00-intent.json')
                with self.assertRaises(FileExistsError):
                    journal.record('00-intent.json', {})
                self.assertEqual(other.read_text(), 'unchanged')
            finally:
                journal.close()

    def test_fsync_failure_before_create_blocks_create(self):
        class RecordingJournal(ops.Journal):
            def __init__(self, folder):
                super().__init__(folder)
                self.records, self.current = {}, None

            def record(self, name, value):
                self.current = name
                super().record(name, value)
                self.records[name] = value

        with tempfile.TemporaryDirectory() as folder:
            journal = RecordingJournal(folder)
            client = FakeDocker(journal)
            real_fsync = os.fsync
            def fsync(fd):
                if journal.current == '30-create-intent.json':
                    raise OSError('synthetic fsync failure')
                real_fsync(fd)
            try:
                with mock.patch.object(ops.os, 'fsync', side_effect=fsync):
                    with self.assertRaises(OSError):
                        ops.perform_operations(client, journal, EXPECTED, folder, 'synthetic-current', PUBLIC, nonce=NONCE)
                self.assertEqual(client.count('create'), 0)
            finally:
                journal.close()

    def test_file_hash_recheck_and_current_folder_scope(self):
        base = Path('/root/bertel-releases')
        base.mkdir(mode=0o700, exist_ok=True)
        import secrets
        folder = base / (EXPECTED['source_sha'] + '-123-' + secrets.token_hex(12))
        folder.mkdir(mode=0o700)
        try:
            expected = dict(EXPECTED, run_id='123')
            for name, bytes_key, hash_key, content in [
                ('artifact.zip', 'zip_bytes', 'zip_sha256', b'synthetic-zip'),
                ('manifest.json', None, 'manifest_sha256', b'{}'),
                ('bertel-' + EXPECTED['source_sha'] + '.docker.tar.gz', 'gzip_bytes', 'gzip_sha256', b'synthetic-gzip'),
            ]:
                path = folder / name
                path.write_bytes(content)
                path.chmod(0o600)
                if bytes_key:
                    expected[bytes_key] = len(content)
                expected[hash_key] = hashlib.sha256(content).hexdigest()
            receipt = {'status': 'verified_archive_only', 'expected': expected, 'docker_action': False,
                       'extracted': ['manifest.json', 'bertel-' + EXPECTED['source_sha'] + '.docker.tar.gz']}
            (folder / 'VERIFIED.json').write_text(json.dumps(receipt))
            (folder / 'VERIFIED.json').chmod(0o600)
            params = {'folder': str(folder), 'expected': expected, 'receiver_succeeded': True,
                      'current_container': 'synthetic-current', 'writers_frozen': True}
            self.assertEqual(ops.validate_inputs(params), (expected, str(folder)))
            bad = dict(params, writers_frozen=False)
            with self.assertRaisesRegex(ops.Refused, 'preconditions'):
                ops.validate_inputs(bad)
            bad = dict(params, current_container='--not-a-container')
            with self.assertRaisesRegex(ops.Refused, 'current_container'):
                ops.validate_inputs(bad)
            (folder / 'artifact.zip').write_bytes(b'corruption')
            (folder / 'artifact.zip').chmod(0o600)
            with self.assertRaisesRegex(ops.Refused, 'archive_recheck'):
                ops.validate_inputs(params)
        finally:
            shutil.rmtree(folder)


if __name__ == '__main__':
    unittest.main()
