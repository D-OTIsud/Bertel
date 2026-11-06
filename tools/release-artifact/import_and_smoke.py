"""Reviewed image import/tag and isolated smoke. Never deploys the application.

Requires an exclusive writer freeze for the candidate tag and inspected images.
Tag inspection followed by tagging is not compare-and-swap. An unknown Docker
outcome is journalled and never automatically replayed or cleaned up.
"""
import base64
import hashlib
import json
import os
import re
import secrets
import stat
import subprocess
import sys
import time

PUBLIC_KEYS = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
               'NEXT_PUBLIC_ENABLE_DEMO_MODE', 'NEXT_PUBLIC_MAP_STYLE_CLASSIC',
               'NEXT_PUBLIC_MAP_STYLE_SATELLITE', 'NEXT_PUBLIC_MAP_STYLE_TOPO']
SOURCE = 'https://github.com/D-OTIsud/Bertel'
INSPECT = ('{"id":{{json .Id}},"size":{{.Size}},"os":{{json .Os}},'
           '"arch":{{json .Architecture}},"user":{{json .Config.User}},'
           '"revision":{{json (index .Config.Labels "org.opencontainers.image.revision")}},'
           '"source":{{json (index .Config.Labels "org.opencontainers.image.source")}}}')
OWNER_INSPECT = ('{"id":{{json .Id}},"image":{{json .Image}},"name":{{json .Name}},'
                 '"nonce":{{json (index .Config.Labels "bertel.private-smoke")}}}')
SCOPE = 'No authenticated, readiness, mail, AI, document or Storage operation tested.'

PROBE = r"""(async()=>{
const a=await fetch(PROBE_ORIGIN_PLACEHOLDER+'/api/health',{redirect:'error',signal:AbortSignal.timeout(3000)});
const b=await fetch(PROBE_ORIGIN_PLACEHOLDER+'/api/app-version',{redirect:'error',signal:AbortSignal.timeout(3000)});
const c=await fetch(PROBE_ORIGIN_PLACEHOLDER+'/runtime-config.js',{redirect:'error',signal:AbortSignal.timeout(3000)});
if(!a.ok||!b.ok||!c.ok)throw Error('http');
const h=await a.json(),v=await b.json();
if(h.ok!==true||h.service!=='bertel-tourism-ui'||v.minimumClientVersion!==2||v.writeContractVersion!==2)throw Error('contract');
const text=await c.text();
if(text.length>16384)throw Error('configuration');
const wrapper=/^\s*window\.__APP_CONFIG__\s*=\s*\{([\s\S]*)\}\s*;\s*$/.exec(text);
if(!wrapper)throw Error('configuration');
const keys=PUBLIC_KEYS_PLACEHOLDER,config={},body=wrapper[1];
const entry=/\s*([A-Z_]+)\s*:\s*("(?:[^"\\\r\n]|\\["\\/bfnrt]|\\u[0-9a-fA-F]{4})*")\s*(,|$)/y;
let offset=0;
while(body.slice(offset).trim()){
entry.lastIndex=offset;const m=entry.exec(body);
if(!m||!keys.includes(m[1])||Object.hasOwn(config,m[1]))throw Error('configuration');
config[m[1]]=JSON.parse(m[2]);offset=entry.lastIndex;
}
if(Object.keys(config).length!==keys.length)throw Error('configuration');
const hash=require('node:crypto').createHash('sha256').update(JSON.stringify(Object.fromEntries(keys.map(k=>[k,config[k]])))).digest('hex');
if(hash!==PUBLIC_HASH_PLACEHOLDER)throw Error('configuration');
process.stdout.write('health2/2');
})().catch(()=>process.exitCode=1)"""


class Refused(Exception):
    """Constant codes only; never attach raw Docker output."""


class UnknownOutcome(Refused):
    """A request may already have reached Docker: stop, inspect, never retry."""


class KnownFailure(Refused):
    """Docker returned a negative acknowledgement."""


def require(value, code):
    if not value:
        raise Refused(code)


def probe_script(public_hash, origin='http://127.0.0.1:3000'):
    require(re.fullmatch(r'[a-f0-9]{64}', public_hash), 'probe_hash')
    require(re.fullmatch(r'http://127\.0\.0\.1:[1-9][0-9]{0,4}', origin), 'probe_origin')
    return PROBE.replace('PUBLIC_KEYS_PLACEHOLDER', json.dumps(PUBLIC_KEYS)).replace(
        'PUBLIC_HASH_PLACEHOLDER', json.dumps(public_hash)).replace('PROBE_ORIGIN_PLACEHOLDER', json.dumps(origin))


def config_hash(public):
    require(type(public) is dict and set(public) == set(PUBLIC_KEYS) and
            all(type(public[k]) is str for k in PUBLIC_KEYS), 'public_keys')
    ordered = {k: public[k] for k in PUBLIC_KEYS}
    return hashlib.sha256(json.dumps(ordered, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


class Docker:
    def __init__(self, config):
        self.prefix = ['docker', '--host', 'unix:///var/run/docker.sock', '--config', config]

    def invoke(self, args, timeout=60):
        require(args and args[0] == 'docker', 'local_docker_not_bound')
        environment = {key: os.environ[key] for key in ('PATH', 'LANG', 'LC_ALL') if key in os.environ}
        try:
            return subprocess.run(self.prefix + args[1:], capture_output=True, text=True,
                                  timeout=timeout, env=environment)
        except BaseException:
            raise UnknownOutcome('docker_ack_unknown') from None

    def run(self, args, timeout=60):
        result = self.invoke(args, timeout)
        if result.returncode != 0:
            raise KnownFailure('docker_negative_ack')
        return result.stdout.strip()


class Journal:
    """Exclusive immutable records; file and directory fsync at every transition."""
    def __init__(self, folder):
        self.path = folder + '/import-smoke-operation'
        os.mkdir(self.path, mode=0o700)  # Never adopt/replay a previous operation.
        parent = os.open(folder, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
        try:
            os.fsync(parent)
        finally:
            os.close(parent)
        self.fd = os.open(self.path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
        info = os.fstat(self.fd)
        require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and stat.S_IMODE(info.st_mode) == 0o700, 'operation_ownership')

    def record(self, name, value):
        require(re.fullmatch(r'[a-z0-9_-]+\.json', name), 'journal_name')
        fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
                     0o600, dir_fd=self.fd)
        try:
            info = os.fstat(fd)
            require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and stat.S_IMODE(info.st_mode) == 0o600
                    and info.st_nlink == 1, 'journal_ownership')
            with os.fdopen(fd, 'wb', closefd=False) as output:
                output.write((json.dumps(value, sort_keys=True, indent=2) + '\n').encode())
                output.flush()
                os.fsync(fd)
            os.fsync(self.fd)
        finally:
            os.close(fd)

    def close(self):
        os.close(self.fd)


def file_hash(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def image(client, target, expected):
    try:
        actual = json.loads(client.run(['docker', 'image', 'inspect', '--format', INSPECT, target]))
    except (ValueError, TypeError):
        raise Refused('image_identity') from None
    require(actual == {'id': expected['image_id'], 'size': expected['image_size'],
                       'os': 'linux', 'arch': 'amd64', 'user': 'node',
                       'revision': expected['source_sha'], 'source': SOURCE}, 'image_identity')
    return actual


def cleanup(client, journal, container, name, nonce, image_id):
    journal.record('60-cleanup-check.json', {'container_id': container, 'name': name, 'nonce': nonce, 'image_id': image_id})
    try:
        owner = json.loads(client.run(['docker', 'inspect', '--format', OWNER_INSPECT, container]))
    except (ValueError, TypeError):
        raise Refused('smoke_cleanup_identity') from None
    require(owner == {'id': container, 'name': '/' + name, 'nonce': nonce, 'image': image_id}, 'smoke_cleanup_identity')
    journal.record('61-cleanup-intent.json', {'container_id': container, 'identity_checked': True})
    try:
        client.run(['docker', 'rm', '--force', container])
    except UnknownOutcome:
        journal.record('62-cleanup-unknown.json', {'status': 'unknown', 'action': 'inspect_readonly_no_replay'})
        raise
    except BaseException:
        journal.record('62-cleanup-failed.json', {'status': 'failed', 'action': 'inspect_readonly_no_replay'})
        raise
    journal.record('63-cleanup-ack.json', {'container_id': container, 'removed': True})


def perform_operations(client, journal, expected, folder, current, public, *, clock=time.monotonic,
                       sleep=time.sleep, nonce=None):
    public_hash = config_hash(public)
    require(public_hash == expected['public_config_sha256'], 'public_configuration_changed')
    nonce = nonce or secrets.token_hex(16)
    require(re.fullmatch(r'[a-f0-9]{32}', nonce), 'operation_nonce')
    name = 'bertel-private-smoke-' + expected['source_sha'][:12] + '-' + nonce
    tag = 'bertel-candidate:' + expected['source_sha']
    intent = {'schema_version': 1, 'source_sha': expected['source_sha'], 'image_id': expected['image_id'],
              'tag': tag, 'smoke_name': name, 'smoke_nonce': nonce, 'current_container': current,
              'writers_frozen_required': True, 'scope': SCOPE}
    journal.record('00-intent.json', intent)

    journal.record('10-load-intent.json', {'image_id': expected['image_id']})
    try:
        client.run(['docker', 'image', 'load', '--input', folder + '/bertel-' + expected['source_sha'] + '.docker.tar.gz'], timeout=120)
    except UnknownOutcome:
        journal.record('12-load-unknown.json', {'status': 'unknown', 'action': 'inspect_readonly_no_replay'})
        raise
    except BaseException:
        journal.record('12-load-failed.json', {'status': 'failed', 'action': 'inspect_readonly_no_replay'})
        raise
    journal.record('11-load-ack.json', {'loaded': True})
    checked = image(client, expected['image_id'], expected)

    existing = client.invoke(['docker', 'image', 'inspect', '--format', '{{.Id}}', tag], timeout=15)
    if existing.returncode == 0:
        require(existing.stdout.strip() == expected['image_id'], 'tag_points_elsewhere')
        journal.record('20-tag-matched.json', {'image_id': expected['image_id']})
    else:
        require('No such image' in existing.stderr, 'tag_inspection_failed')
        # Requires the explicit external writer freeze; inspection + tag is not CAS.
        journal.record('20-tag-intent.json', {'image_id': expected['image_id'], 'tag': tag, 'requires_writer_freeze': True})
        try:
            client.run(['docker', 'image', 'tag', expected['image_id'], tag])
        except UnknownOutcome:
            journal.record('22-tag-unknown.json', {'status': 'unknown', 'action': 'inspect_readonly_no_replay'})
            raise
        journal.record('21-tag-ack.json', {'tagged': True})
    image(client, tag, expected)

    args = ['docker', 'create', '--pull', 'never', '--name', name, '--network', 'none', '--no-healthcheck',
            '--memory', '768m', '--cpus', '1', '--pids-limit', '128', '--cap-drop', 'ALL',
            '--security-opt', 'no-new-privileges', '--label', 'bertel.private-smoke=' + nonce]
    for key in PUBLIC_KEYS:
        args += ['--env', key + '=' + public[key]]
    args += ['--env', 'SOURCE_COMMIT=' + expected['source_sha'], expected['image_id']]
    journal.record('30-create-intent.json', {'name': name, 'nonce': nonce, 'image_id': expected['image_id']})
    try:
        container = client.run(args)
    except UnknownOutcome:
        journal.record('32-create-unknown.json', {'status': 'unknown', 'action': 'inspect_readonly_no_replay'})
        raise
    except BaseException:
        journal.record('32-create-failed.json', {'status': 'failed', 'action': 'inspect_readonly_no_replay'})
        raise
    if not re.fullmatch(r'[a-f0-9]{64}', container):
        journal.record('32-create-unknown.json', {'status': 'invalid_ack', 'action': 'inspect_readonly_no_replay'})
        raise UnknownOutcome('created_container_ack_unknown')
    # A crash/failure before this durable ACK leaves intent only: no automatic rm.
    journal.record('31-create-ack.json', {'container_id': container, 'name': name, 'nonce': nonce, 'image_id': expected['image_id']})
    ambiguous = False
    try:
        journal.record('40-start-intent.json', {'container_id': container})
        try:
            client.run(['docker', 'start', container])
        except UnknownOutcome:
            ambiguous = True
            journal.record('42-start-unknown.json', {'status': 'unknown', 'action': 'inspect_readonly_no_replay'})
            raise
        except BaseException:
            journal.record('42-start-failed.json', {'status': 'failed'})
            raise
        journal.record('41-start-ack.json', {'started': True})
        script = probe_script(public_hash)
        until, passed = clock() + 45, False
        journal.record('50-probe-intent.json', {'paths': ['/api/health', '/api/app-version', '/runtime-config.js'],
                                               'redirect': 'error', 'healthcheck_disabled': True})
        while clock() < until:
            try:
                outcome = client.invoke(['docker', 'exec', container, 'node', '-e', script], timeout=10)
            except UnknownOutcome:
                ambiguous = True
                journal.record('52-probe-unknown.json', {'status': 'unknown', 'action': 'inspect_readonly_no_replay'})
                raise
            if outcome.returncode == 0 and outcome.stdout == 'health2/2':
                passed = True
                break
            sleep(1)
        if not passed:
            journal.record('52-probe-failed.json', {'status': 'failed'})
            raise Refused('isolated_smoke_failed')
        journal.record('51-probe-ack.json', {'health': True, 'contract': '2/2'})
        image(client, tag, expected)
    finally:
        if not ambiguous:
            cleanup(client, journal, container, name, nonce, expected['image_id'])

    receipt = {'status': 'imported_tagged_isolated_smoke', 'image': checked, 'tag': tag,
               'public_config_sha256': public_hash, 'health': True, 'contract': '2/2',
               'network': 'none', 'published_ports': False, 'service_secret_supplied': False,
               'healthcheck_disabled': True, 'redirect': 'error', 'writer_freeze_required': True,
               'scope': SCOPE}
    journal.record('70-complete.json', receipt)
    return receipt


def validate_inputs(p):
    require(sys.platform.startswith('linux') and os.geteuid() == 0, 'linux_root_required')
    require(type(p) is dict and set(p) == {'folder', 'expected', 'receiver_succeeded', 'current_container', 'writers_frozen'}, 'operator_parameters')
    require(p['receiver_succeeded'] is True and p['writers_frozen'] is True, 'operator_preconditions')
    expected, folder = p['expected'], p['folder']
    require(type(expected) is dict and type(folder) is str and
            re.fullmatch(r'[a-f0-9]{40}', expected['source_sha']) and
            re.fullmatch(r'[1-9][0-9]*', expected['run_id']) and
            re.fullmatch(r'sha256:[a-f0-9]{64}', expected['image_id']), 'source_parameters')
    require(type(p['current_container']) is str and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,127}', p['current_container']), 'current_container')
    prefix = '/root/bertel-releases/' + expected['source_sha'] + '-' + expected['run_id'] + '-'
    require(folder.startswith(prefix) and re.fullmatch(r'[a-f0-9]{24}', folder[len(prefix):]), 'owned_folder')
    require(os.path.realpath(folder) == folder, 'folder_symlink')
    info = os.stat(folder, follow_symlinks=False)
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and stat.S_IMODE(info.st_mode) == 0o700, 'folder_ownership')
    require(not os.path.lexists(folder + '/FAILURE.json'), 'failed_quarantine')
    with open(folder + '/VERIFIED.json') as verified_file:
        verified = json.load(verified_file)
    require(verified == {'status': 'verified_archive_only', 'expected': expected, 'docker_action': False,
                        'extracted': ['manifest.json', 'bertel-' + expected['source_sha'] + '.docker.tar.gz']}, 'receipt_identity')
    filename = 'bertel-' + expected['source_sha'] + '.docker.tar.gz'
    for name, count, digest in [('artifact.zip', expected['zip_bytes'], expected['zip_sha256']),
                              ('manifest.json', None, expected['manifest_sha256']),
                              (filename, expected['gzip_bytes'], expected['gzip_sha256'])]:
        path = folder + '/' + name
        info = os.stat(path, follow_symlinks=False)
        require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and stat.S_IMODE(info.st_mode) == 0o600
                and (count is None or info.st_size == count) and file_hash(path) == digest, 'archive_recheck')
    return expected, folder


def main(p):
    expected, folder = validate_inputs(p)
    os.umask(0o077)
    journal = Journal(folder)  # Exclusive and durable before Docker mutation.
    try:
        cli_config = folder + '/docker-cli'
        os.mkdir(cli_config, mode=0o700)
        client = Docker(cli_config)
        public_script = 'process.stdout.write(JSON.stringify(Object.fromEntries(' + json.dumps(PUBLIC_KEYS) + '.map(k=>[k,process.env[k]||""]))))'
        public = json.loads(client.run(['docker', 'exec', p['current_container'], 'node', '-e', public_script]))
        receipt = perform_operations(client, journal, expected, folder, p['current_container'], public)
        print(json.dumps(receipt))
    finally:
        journal.close()


if __name__ == '__main__':
    try:
        require(len(sys.argv) == 2 and len(sys.argv[1]) < 16384, 'arguments')
        main(json.loads(base64.b64decode(sys.argv[1], validate=True)))
    except BaseException:
        print('REFUSED import/smoke; inspect the known operation before any retry', file=sys.stderr)
        sys.exit(1)
