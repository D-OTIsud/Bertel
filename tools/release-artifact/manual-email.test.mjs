import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, unlink, rmdir, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROOF_VERSION, MODES, CALIBRATION_SOURCE, CALIBRATION_TREE, manualEmailProfile, caseNames,
  assertObservation, assertCalibration, validateManualEmailProof, requireManualEmailProofFile, manualEmailToolsHash } from './manual-email-contract.mjs';
import { containerArguments, assertContainer, assertRuntimeCI } from './manual-email-runtime.mjs';
import { PROJECT_ORIGIN } from './candidate.mjs';
const base = dirname(fileURLToPath(import.meta.url));
const context = (profile = 'protocol-v1') => ({ profile, source_sha: 'a'.repeat(40), source_tree: 'b'.repeat(40),
  image_id: `sha256:${'c'.repeat(64)}`, public_config_sha256: 'd'.repeat(64), tools_sha256: 'e'.repeat(64), run_id: '1234', run_attempt: '2' });
const observation = (profile, mode) => ({ status: 503, body: { error: profile === 'protocol-v1' && mode === 'protocol-v1'
  ? 'smtp_not_configured' : 'email_protection_unavailable' }, cacheControl: 'no-store',
events: { auth: profile === 'protocol-v1' ? 1 : 0, config: profile === 'protocol-v1' && mode === 'protocol-v1' ? 1 : 0,
  deniedFetch: 0, deniedSocket: 0, boot: 1 } });
function proof(profile = 'protocol-v1') {
  const ctx = context(profile);
  return { schema: PROOF_VERSION, status: 'passed', ...ctx,
    cases: MODES.flatMap((mode, i) => caseNames(profile).map((name) => ({ mode, name, image_id: ctx.image_id, container_id: String(i + 1).repeat(64), observation: observation(profile, mode) }))),
    calibration: { source_sha: CALIBRATION_SOURCE, source_tree: CALIBRATION_TREE, image_id: `sha256:${'f'.repeat(64)}`,
      container_id: '9'.repeat(64), public_config_sha256: ctx.public_config_sha256, observation: observation('protocol-v1', 'protocol-v1') } };
}
const copy = (v) => JSON.parse(JSON.stringify(v));
const config = () => ({ NEXT_PUBLIC_SUPABASE_URL: PROJECT_ORIGIN, NEXT_PUBLIC_SUPABASE_ANON_KEY: `sb_publishable_${'x'.repeat(28)}`,
  NEXT_PUBLIC_ENABLE_DEMO_MODE: 'false', NEXT_PUBLIC_MAP_STYLE_CLASSIC: 'https://demotiles.maplibre.org/style.json',
  NEXT_PUBLIC_MAP_STYLE_SATELLITE: 'https://tiles.openfreemap.org/styles/liberty', NEXT_PUBLIC_MAP_STYLE_TOPO: 'https://tiles.openfreemap.org/styles/bright' });
async function temp() { return mkdtemp(join(tmpdir(), 'bertel-mail-unit-')); }
async function clean(folder, names = []) {
  assert.equal(dirname(resolve(folder)), resolve(tmpdir())); assert.ok(basename(folder).startsWith('bertel-mail-unit-'));
  for (const name of names) await unlink(join(folder, name)).catch((e) => { if (e.code !== 'ENOENT') throw e; });
  await rmdir(folder);
}
test('profile is mandatory and exact, without inference from a file or a default', () => {
  for (const v of [undefined, null, '', 'closed', 'PROTOCOL-V1', ' protocol-v1', 'unknown']) assert.throws(() => manualEmailProfile(v), /manual_email_profile/);
  assert.equal(manualEmailProfile('hard-closed'), 'hard-closed'); assert.equal(manualEmailProfile('protocol-v1'), 'protocol-v1');
});
test('both nonempty profile matrices and real-ungated calibration meet the exact verdict', () => {
  for (const p of ['hard-closed', 'protocol-v1']) assert.equal(validateManualEmailProof(proof(p), context(p)).cases.length, p === 'hard-closed' ? 32 : 4);
});
test('absent or failed proof cannot stand in for real observations', () => {
  for (const p of [undefined, {}, { ...proof(), status: 'failed' }, { ...proof(), cases: [] }]) assert.throws(() => validateManualEmailProof(p, context()));
});
test('all release identities bind the image/source/tree/run/attempt/config/tools/profile', () => {
  for (const [key, value] of Object.entries({ profile: 'hard-closed', source_sha: '1'.repeat(40), source_tree: '2'.repeat(40),
    image_id: `sha256:${'3'.repeat(64)}`, run_id: '999', run_attempt: '3', public_config_sha256: '4'.repeat(64), tools_sha256: '5'.repeat(64) })) {
    assert.throws(() => validateManualEmailProof({ ...proof(), [key]: value }, context()), /identity/);
  }
});
test('no missing mode, duplicate entry or extra case substitutes for the four process modes', () => {
  for (const mutate of [(p) => p.cases.pop(), (p) => p.cases.push(p.cases[0]), (p) => { p.cases[1] = p.cases[0]; },
    (p) => { p.cases[0].mode = 'other'; }]) { const p = proof(); mutate(p); assert.throws(() => validateManualEmailProof(p, context()), /cases/); }
});
test('wrong B/N selection fails on observations, including an open residual mode in B', () => {
  assert.throws(() => assertObservation('hard-closed', 'closed', 'prepare', observation('protocol-v1', 'closed')), /observation/);
  assert.throws(() => assertObservation('protocol-v1', 'protocol-v1', 'prepare', observation('hard-closed', 'protocol-v1')), /observation/);
  assert.throws(() => assertObservation('hard-closed', 'protocol-v1', 'prepare', observation('protocol-v1', 'protocol-v1')), /observation/);
});
test('case evidence cannot substitute another image or reuse a process for different modes', () => {
  for (const mutate of [(p) => { p.cases[0].image_id = `sha256:${'7'.repeat(64)}`; },
    (p) => { p.cases[0].container_id = 'unknown'; }, (p) => { p.cases[1].container_id = p.cases[0].container_id; }]) {
    const p = proof(); mutate(p); assert.throws(() => validateManualEmailProof(p, context()), /case_identity/);
  }
});
test('500/200, missing preload, extra JSON and any unexpected network boundary refuse qualification', () => {
  for (const patch of [{ status: 500 }, { status: 200 }, { body: { error: 'other' } },
    { body: { error: 'email_protection_unavailable', detail: 'PRIVATE_SENTINEL' } }, { cacheControl: null },
    ...['auth', 'config', 'deniedFetch', 'deniedSocket', 'boot'].map((key) => ({ events: { ...observation('hard-closed', 'closed').events, [key]: key === 'boot' ? 0 : 1 } }))]) {
    assert.throws(() => assertObservation('hard-closed', 'closed', 'prepare', { ...observation('hard-closed', 'closed'), ...patch }));
  }
});
test('only Auth1/config1/503smtp_not_configured on the real ungated identity qualifies the calibration RED', () => {
  const ctx = context();
  for (const mutate of [(c) => { c.source_sha = ctx.source_sha; }, (c) => { c.source_tree = ctx.source_tree; },
    (c) => { c.image_id = ctx.image_id; }, (c) => { c.observation.status = 500; }, (c) => { delete c.observation; },
    (c) => { c.observation.events.config = 0; }, (c) => { c.observation.events.auth = 0; },
    (c) => { c.observation = observation('protocol-v1', 'closed'); }]) {
    const c = copy(proof().calibration); mutate(c); assert.throws(() => assertCalibration(c, ctx.public_config_sha256, ctx.image_id));
  }
});
test('actual export gate reads a bounded regular proof; absence/directory/bad JSON/failed/foreign refuse', async () => {
  const folder = await temp(), file = join(folder, 'proof.json'), directory = join(folder, 'directory');
  try {
    await assert.rejects(requireManualEmailProofFile(file, context()), /proof_file/);
    await mkdir(directory); await assert.rejects(requireManualEmailProofFile(directory, context()), /proof_file/);
    for (const content of ['', '{bad', 'x'.repeat(262145), JSON.stringify({ ...proof(), status: 'failed' }), JSON.stringify({ ...proof(), run_attempt: '99' })]) {
      await writeFile(file, content); await assert.rejects(requireManualEmailProofFile(file, context()));
    }
    await writeFile(file, JSON.stringify(proof())); assert.equal((await requireManualEmailProofFile(file, context())).image_id, context().image_id);
  } finally { await rmdir(directory); await clean(folder, ['proof.json']); }
});
test('CI and Docker endpoint overrides refuse before any local/remote Docker operation', () => {
  const env = { CI: 'true', GITHUB_ACTIONS: 'true', RUNNER_OS: 'Linux', GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REF: 'refs/heads/master', GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1' };
  assert.doesNotThrow(() => assertRuntimeCI(env));
  for (const patch of [{ CI: '' }, { RUNNER_OS: 'Windows' }, { GITHUB_EVENT_NAME: 'push' }, { GITHUB_REF: 'refs/heads/test' }, { GITHUB_RUN_ID: '' },
    ...['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH', 'NODE_OPTIONS'].map((k) => ({ [k]: 'override' }))]) assert.throws(() => assertRuntimeCI({ ...env, ...patch }));
});
test('manual email runtime CI admits the exact SEC04 return ref', () => {
  const fallback = 'refs/heads/codex/release-n2-loopback-fallback-20261107';
  const env = { CI: 'true', GITHUB_ACTIONS: 'true', RUNNER_OS: 'Linux', GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REF: fallback, GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1' };
  assert.doesNotThrow(() => assertRuntimeCI(env));
  for (const patch of [{ GITHUB_REF: fallback + '-other' }, { GITHUB_REF: fallback.replace('/heads/', '/tags/') },
    { GITHUB_EVENT_NAME: 'push' }, { GITHUB_EVENT_NAME: 'pull_request' }]) {
    assert.throws(() => assertRuntimeCI({ ...env, ...patch }), /manual_email_ci/);
  }
});
test('container keeps entrypoint/CMD, one immutable image, network none, only generated config writable', () => {
  for (const mode of MODES) {
    const args = containerArguments({ imageId: context().image_id, source: context().source_sha, run: '123', attempt: '1',
      nonce: 'a'.repeat(32), mode, config: config(), fixtureDirectory: '/owned/fixtures', runtimeConfigFile: '/owned/nonce/runtime-config.js' });
    assert.equal(args[args.indexOf('--network') + 1], 'none'); assert.ok(args.includes('--read-only')); assert.ok(args.includes('--no-healthcheck'));
    assert.equal(args[args.indexOf('--user') + 1], 'node'); assert.ok(!args.includes('--entrypoint')); assert.equal(args.at(-1), context().image_id);
    assert.ok(args.includes('type=bind,source=/owned/nonce/runtime-config.js,target=/app/public/runtime-config.js'));
    assert.ok(args.includes('type=bind,source=/owned/fixtures,target=/bertel-smtp-probe,readonly'));
    assert.deepEqual(args.filter((v) => v.startsWith('LIST_EMAIL_MODE=')), mode === 'absent' ? [] : [`LIST_EMAIL_MODE=${mode === 'unknown' ? 'not-a-mode' : mode}`]);
  }
});
test('startup and cleanup need physical ownership, image/mode/mounts and resource bounds', () => {
  const nonce = 'a'.repeat(32), image = context().image_id, output = '/owned/nonce/runtime-config.js';
  const info = { Id: 'b'.repeat(64), Image: image, Config: { User: 'node', Labels: { 'io.bertel.manual-email-probe': nonce },
    Env: [], Entrypoint: ['/entrypoint.sh'], Cmd: ['node', 'server.js'], Healthcheck: { Test: ['NONE'] } }, HostConfig: { NetworkMode: 'none', ReadonlyRootfs: true,
    Memory: 768 * 1024 * 1024, NanoCpus: 1000000000, PidsLimit: 64, CapDrop: ['ALL'], SecurityOpt: ['no-new-privileges'] },
  Mounts: [{ Destination: '/app/public/runtime-config.js', Source: output, Type: 'bind', RW: true }, { Destination: '/bertel-smtp-probe', RW: false }] };
  assert.doesNotThrow(() => assertContainer(info, image, nonce, 'absent', output));
  for (const mutate of [(v) => { v.Image = `sha256:${'d'.repeat(64)}`; }, (v) => { v.Config.Labels = {}; }, (v) => { v.Config.User = 'root'; },
    (v) => { v.Config.Env.push('LIST_EMAIL_MODE=protocol-v1'); }, (v) => { v.HostConfig.NetworkMode = 'bridge'; },
    (v) => { v.HostConfig.Memory = 0; }, (v) => { v.HostConfig.ReadonlyRootfs = false; }, (v) => { v.Config.Entrypoint = ['node']; },
    (v) => { v.Config.Healthcheck.Test = ['CMD', 'wget']; },
    (v) => { v.Mounts[0].Source = '/foreign/file'; }, (v) => { v.Mounts.push({ Destination: '/app/public', RW: true }); }]) {
    const bad = copy(info); mutate(bad); assert.throws(() => assertContainer(bad, image, nonce, 'absent', output));
  }
});
async function preloadChild(code, mode = 'closed') {
  const folder = await temp(), file = join(folder, 'events.jsonl'), env = {};
  for (const k of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP']) if (process.env[k] !== undefined) env[k] = process.env[k];
  Object.assign(env, { BERTEL_SMTP_PROBE_ID: 'a'.repeat(32), BERTEL_SMTP_PROBE_LOG: file, BERTEL_SMTP_PROBE_ORIGIN: 'https://synthetic.example.invalid', LIST_EMAIL_MODE: mode });
  try {
    const child = spawnSync(process.execPath, ['--require', join(base, 'fixtures/manual-email-preload.cjs'), '--input-type=module', '-e', code], { env, encoding: 'utf8', timeout: 10000, maxBuffer: 65536, shell: false });
    return { child, events: (await readFile(file, 'utf8')).trim().split('\n').map((line) => JSON.parse(line).event) };
  } finally { await clean(folder, ['events.jsonl']); }
}
test('real preload gives only synthetic SDK responses, identically under closed/open modes', async () => {
  const code = `const a=await fetch('https://synthetic.example.invalid/auth/v1/user',{headers:{authorization:'Bearer synthetic-manual-email-token'}});
    const c=await fetch('https://synthetic.example.invalid/rest/v1/rpc/get_smtp_config_secret',{method:'POST',body:'{}',headers:{authorization:'Bearer synthetic-service-key-not-real','content-profile':'api'}});console.log(JSON.stringify({user:(await a.json()).id,config:await c.json()}));`;
  for (const mode of ['closed', 'protocol-v1']) {
    const { child, events } = await preloadChild(code, mode); assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(events, ['boot', 'auth', 'config']); assert.deepEqual(JSON.parse(child.stdout), { user: 'd4000000-0000-4000-8000-000000000010', config: [{ enabled: false }] });
  }
});
test('real preload denies unknown URLs, wrong methods/DTO and direct sockets before network', async () => {
  const code = `for(const [u,i] of [['https://unexpected.example.invalid/URL_SENTINEL',{}],['https://synthetic.example.invalid/auth/v1/user',{method:'POST'}],['https://synthetic.example.invalid/rest/v1/rpc/get_smtp_config_secret',{method:'POST',body:'{"unexpected":true}',headers:{authorization:'Bearer synthetic-service-key-not-real','content-profile':'api'}}]]){try{await fetch(u,i);throw Error('allowed')}catch(e){if(e.message!=='SMTP_PROBE_REFUSED')throw e;}}const n=await import('node:net');try{new n.Socket().connect(9,'127.0.0.1');throw Error('allowed')}catch(e){if(e.message!=='SMTP_PROBE_REFUSED')throw e;}`;
  const { child, events } = await preloadChild(code); assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(events, ['boot', 'denied_fetch', 'denied_fetch', 'denied_fetch', 'denied_socket']);
  assert.ok(!child.stderr.includes('URL_SENTINEL')); assert.ok(!child.stdout.includes('URL_SENTINEL'));
});
test('preload never reads admission mode; missing required tool files cannot be skipped', async () => {
  assert.ok(!(await readFile(join(base, 'fixtures/manual-email-preload.cjs'), 'utf8')).includes('LIST_EMAIL_MODE'));
  assert.match(await manualEmailToolsHash(resolve(base, '../..')), /^[a-f0-9]{64}$/);
  await assert.rejects(manualEmailToolsHash(resolve(base, 'absent-tools')));
});
