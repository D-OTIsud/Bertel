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
MAX_IMAGE_BYTES = 1024 * 1024 * 1024
PREDECESSOR_OPERATOR_SHA = '0b37375bf632d27df2000497bd6f06af1ec0a633bd50572252ad55580403f2ad'
PREDECESSOR_FILES = ('00-intent.json', '10-load-intent.json', '11-load-ack.json')
CONTINUATION_JOURNAL = 'import-smoke-after-confirmed-load-4db'
INSPECT = ('{"id":{{json .Id}},"size":{{.Size}},"os":{{json .Os}},'
           '"arch":{{json .Architecture}},"user":{{json .Config.User}},'
           '"revision":{{json (index .Config.Labels "org.opencontainers.image.revision")}},'
           '"source":{{json (index .Config.Labels "org.opencontainers.image.source")}},'
           '"rootfs":{{json .RootFS}},"repo_tags":{{json .RepoTags}}}')
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
            # Exit status alone does not prove that the daemon rejected a write.
            raise UnknownOutcome('docker_nonzero_ack_unknown')
        return result.stdout.strip()


class Journal:
    """Exclusive immutable records; file and directory fsync at every transition."""
    def __init__(self, folder, name='import-smoke-operation'):
        require(name in {'import-smoke-operation', CONTINUATION_JOURNAL}, 'operation_journal_name')
        self.path = folder + '/' + name
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


def validate_image_identity(expected, identity):
    require(type(identity) is dict and set(identity) == {'config_sha256', 'rootfs'}, 'identity_pin_keys')
    require(type(identity['config_sha256']) is str and re.fullmatch(r'[a-f0-9]{64}', identity['config_sha256'])
            and 'sha256:' + identity['config_sha256'] == expected['image_id'], 'identity_config_pin')
    rootfs = identity['rootfs']
    require(type(rootfs) is dict and set(rootfs) == {'type', 'diff_ids'} and rootfs['type'] == 'layers'
            and type(rootfs['diff_ids']) is list and len(rootfs['diff_ids']) > 0
            and all(type(v) is str and re.fullmatch(r'sha256:[a-f0-9]{64}', v) for v in rootfs['diff_ids']), 'identity_rootfs_pin')
    require(type(expected['image_size']) is int and 0 < expected['image_size'] <= MAX_IMAGE_BYTES, 'ci_size_pin')


def image(client, target, expected, identity, *, require_untagged=False):
    validate_image_identity(expected, identity)
    try:
        actual = json.loads(client.run(['docker', 'image', 'inspect', '--format', INSPECT, target]))
    except (ValueError, TypeError):
        raise Refused('image_identity') from None
    require(type(actual) is dict and set(actual) == {'id', 'size', 'os', 'arch', 'user', 'revision', 'source', 'rootfs', 'repo_tags'}, 'image_identity')
    expected_attributes = {'id': expected['image_id'], 'os': 'linux', 'arch': 'amd64', 'user': 'node',
                           'revision': expected['source_sha'], 'source': SOURCE}
    require({k: actual[k] for k in expected_attributes} == expected_attributes, 'image_identity')
    require(actual['rootfs'] == {'Type': identity['rootfs']['type'], 'Layers': identity['rootfs']['diff_ids']}, 'image_rootfs')
    require(type(actual['size']) is int and 0 < actual['size'] <= MAX_IMAGE_BYTES, 'host_image_size')
    if require_untagged:
        require(actual['repo_tags'] == [], 'continuation_image_already_tagged')
    portable = dict(expected_attributes, rootfs=identity['rootfs'])
    return {'identity': portable,
            'size_measurements': {'ci_reported_bytes': expected['image_size'], 'host_reported_bytes': actual['size'],
                                  'host_limit_bytes': MAX_IMAGE_BYTES},
            'repo_tags': actual['repo_tags']}


def strict_json(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, 'journal_duplicate_key')
            result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=pairs,
                      parse_constant=lambda _: (_ for _ in ()).throw(Refused('journal_json_constant')))


def validate_continuation_pins(value):
    require(type(value) is dict and set(value) == {'kind', 'operator_sha256', 'records'}
            and value['kind'] == 'after_confirmed_load_4db' and value['operator_sha256'] == PREDECESSOR_OPERATOR_SHA,
            'continuation_kind')
    require(type(value['records']) is dict and set(value['records']) == set(PREDECESSOR_FILES), 'continuation_record_set')
    for pin in value['records'].values():
        require(type(pin) is dict and set(pin) == {'bytes', 'sha256'}
                and type(pin['bytes']) is int and 0 < pin['bytes'] <= 8192
                and type(pin['sha256']) is str and re.fullmatch(r'[a-f0-9]{64}', pin['sha256']), 'continuation_record_pin')


def validate_predecessor(folder, expected, current, pins):
    validate_continuation_pins(pins)
    path = folder + '/import-smoke-operation'
    info = os.stat(path, follow_symlinks=False)
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and stat.S_IMODE(info.st_mode) == 0o700, 'predecessor_directory')
    require(set(os.listdir(path)) == set(PREDECESSOR_FILES), 'predecessor_entries')
    records = {}
    for name in PREDECESSOR_FILES:
        filename = path + '/' + name
        info = os.stat(filename, follow_symlinks=False)
        pin = pins['records'][name]
        require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and stat.S_IMODE(info.st_mode) == 0o600
                and info.st_nlink == 1 and info.st_size == pin['bytes'], 'predecessor_file')
        with open(filename, 'rb') as source:
            raw = source.read(8193)
        require(len(raw) == pin['bytes'] and hashlib.sha256(raw).hexdigest() == pin['sha256'], 'predecessor_hash')
        records[name] = strict_json(raw)
    old = records['00-intent.json']
    keys = {'schema_version', 'source_sha', 'image_id', 'tag', 'smoke_name', 'smoke_nonce',
            'current_container', 'writers_frozen_required', 'scope'}
    require(type(old) is dict and set(old) == keys and type(old['schema_version']) is int and old['schema_version'] == 1
            and old['source_sha'] == expected['source_sha'] and old['image_id'] == expected['image_id']
            and old['tag'] == 'bertel-candidate:' + expected['source_sha'] and old['current_container'] == current
            and old['writers_frozen_required'] is True and old['scope'] == SCOPE
            and type(old['smoke_nonce']) is str and re.fullmatch(r'[a-f0-9]{32}', old['smoke_nonce'])
            and old['smoke_name'] == 'bertel-private-smoke-' + expected['source_sha'][:12] + '-' + old['smoke_nonce'],
            'predecessor_intent')
    require(records['10-load-intent.json'] == {'image_id': expected['image_id']}, 'predecessor_load_intent')
    require(type(records['11-load-ack.json']) is dict and set(records['11-load-ack.json']) == {'loaded'}
            and records['11-load-ack.json']['loaded'] is True, 'predecessor_load_ack')
    return {'operator_sha256': pins['operator_sha256'], 'records': pins['records'],
            'old_smoke_name': old['smoke_name'], 'old_smoke_nonce': old['smoke_nonce']}


def operation_intent(expected, current, nonce=None):
    nonce = nonce or secrets.token_hex(16)
    require(re.fullmatch(r'[a-f0-9]{32}', nonce), 'operation_nonce')
    return {'schema_version': 2, 'source_sha': expected['source_sha'], 'image_id': expected['image_id'],
            'tag': 'bertel-candidate:' + expected['source_sha'],
            'smoke_name': 'bertel-private-smoke-' + expected['source_sha'][:12] + '-' + nonce,
            'smoke_nonce': nonce, 'current_container': current, 'writers_frozen_required': True, 'scope': SCOPE}


def require_container_identity(client, container, name, nonce, image_id, code):
    try:
        owner = json.loads(client.run(['docker', 'inspect', '--format', OWNER_INSPECT, container]))
    except (ValueError, TypeError):
        raise Refused(code) from None
    require(owner == {'id': container, 'name': '/' + name, 'nonce': nonce, 'image': image_id}, code)


def cleanup(client, journal, container, name, nonce, image_id):
    journal.record('60-cleanup-check.json', {'container_id': container, 'name': name, 'nonce': nonce, 'image_id': image_id})
    require_container_identity(client, container, name, nonce, image_id, 'smoke_cleanup_identity')
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


def perform_operations(client, journal, expected, folder, current, public, *, image_identity,
                       clock=time.monotonic, sleep=time.sleep, nonce=None):
    public_hash = config_hash(public)
    require(public_hash == expected['public_config_sha256'], 'public_configuration_changed')
    intent = operation_intent(expected, current, nonce)
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
    checked = image(client, expected['image_id'], expected, image_identity)
    journal.record('15-image-verified.json', checked)
    return tag_and_smoke(client, journal, expected, image_identity, public, intent, checked, clock=clock, sleep=sleep)


def continue_loaded_operations(client, journal, expected, folder, current, public, image_identity, predecessor, *,
                               clock=time.monotonic, sleep=time.sleep, nonce=None):
    require(predecessor['operator_sha256'] == PREDECESSOR_OPERATOR_SHA
            and set(predecessor['records']) == set(PREDECESSOR_FILES), 'continuation_admission')
    require(config_hash(public) == expected['public_config_sha256'], 'public_configuration_changed')
    intent = operation_intent(expected, current, nonce)
    require(intent['smoke_nonce'] != predecessor['old_smoke_nonce'], 'continuation_fresh_nonce')
    journal.record('00-intent.json', intent)
    journal.record('01-predecessor-verified.json', predecessor)
    checked = image(client, expected['image_id'], expected, image_identity, require_untagged=True)
    journal.record('05-confirmed-load-adopted.json', {'load_performed': False, 'predecessor': predecessor,
                                                    'image_identity': checked['identity'],
                                                    'size_measurements': checked['size_measurements'],
                                                    'repo_tags_at_admission': checked['repo_tags']})
    return tag_and_smoke(client, journal, expected, image_identity, public, intent, checked, clock=clock, sleep=sleep)


def tag_and_smoke(client, journal, expected, image_identity, public, intent, checked, *,
                  clock=time.monotonic, sleep=time.sleep):
    public_hash = config_hash(public)
    name, nonce, tag = intent['smoke_name'], intent['smoke_nonce'], intent['tag']
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
    image(client, tag, expected, image_identity)

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
    # A syntactically valid ACK is not authority over the returned container.
    # Validate outside the cleanup zone: a foreign ID must never start or be rm'd.
    journal.record('33-created-identity-check.json', {'container_id': container, 'name': name,
                                                   'nonce': nonce, 'image_id': expected['image_id']})
    try:
        require_container_identity(client, container, name, nonce, expected['image_id'], 'smoke_created_identity')
    except UnknownOutcome:
        journal.record('35-created-identity-unknown.json', {'status': 'unknown', 'action': 'inspect_readonly_no_start_no_cleanup'})
        raise
    except BaseException:
        journal.record('35-created-identity-refused.json', {'status': 'unverified', 'action': 'inspect_readonly_no_start_no_cleanup'})
        raise
    journal.record('34-created-identity-ack.json', {'container_id': container, 'identity_checked': True})
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
        checked = image(client, tag, expected, image_identity)
        journal.record('55-final-image-verified.json', checked)
    finally:
        if not ambiguous:
            cleanup(client, journal, container, name, nonce, expected['image_id'])

    receipt = {'schema_version': 2, 'status': 'imported_tagged_isolated_smoke',
               'image_identity': checked['identity'], 'size_measurements': checked['size_measurements'], 'tag': tag,
               'public_config_sha256': public_hash, 'health': True, 'contract': '2/2',
               'network': 'none', 'published_ports': False, 'service_secret_supplied': False,
               'healthcheck_disabled': True, 'redirect': 'error', 'writer_freeze_required': True,
               'scope': SCOPE}
    journal.record('70-complete.json', receipt)
    return receipt


def validate_inputs(p):
    require(sys.platform.startswith('linux') and os.geteuid() == 0, 'linux_root_required')
    required_keys = {'folder', 'expected', 'receiver_succeeded', 'current_container', 'writers_frozen', 'image_identity'}
    require(type(p) is dict and set(p) in (required_keys, required_keys | {'continuation'}), 'operator_parameters')
    require(p['receiver_succeeded'] is True and p['writers_frozen'] is True, 'operator_preconditions')
    expected, folder = p['expected'], p['folder']
    require(type(expected) is dict and type(folder) is str and
            re.fullmatch(r'[a-f0-9]{40}', expected['source_sha']) and
            re.fullmatch(r'[1-9][0-9]*', expected['run_id']) and
            re.fullmatch(r'sha256:[a-f0-9]{64}', expected['image_id']), 'source_parameters')
    validate_image_identity(expected, p['image_identity'])
    if 'continuation' in p:
        validate_continuation_pins(p['continuation'])
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
    continuation = p.get('continuation')
    predecessor = validate_predecessor(folder, expected, p['current_container'], continuation) if continuation is not None else None
    journal = Journal(folder, CONTINUATION_JOURNAL if predecessor is not None else 'import-smoke-operation')
    try:
        cli_config = journal.path + '/docker-cli' if predecessor is not None else folder + '/docker-cli'
        os.mkdir(cli_config, mode=0o700)
        client = Docker(cli_config)
        public_script = 'process.stdout.write(JSON.stringify(Object.fromEntries(' + json.dumps(PUBLIC_KEYS) + '.map(k=>[k,process.env[k]||""]))))'
        public = json.loads(client.run(['docker', 'exec', p['current_container'], 'node', '-e', public_script]))
        if predecessor is not None:
            receipt = continue_loaded_operations(client, journal, expected, folder, p['current_container'], public,
                                                  p['image_identity'], predecessor)
        else:
            receipt = perform_operations(client, journal, expected, folder, p['current_container'], public,
                                         image_identity=p['image_identity'])
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
