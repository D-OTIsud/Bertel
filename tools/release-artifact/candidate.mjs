// Manual candidate preparation only. No registry, production Docker, DB write or deployment.
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, open, link, unlink, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { createGzip } from 'node:zlib';

export const CONFIG_URL = 'https://bertel.otisud.re/runtime-config.js';
export const PROJECT_ORIGIN = 'https://ryycrdhlkmzpxwwwwupy.supabase.co';
export const MAX_ARCHIVE_BYTES = 300 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 1024 * 1024 * 1024;
export const KEYS = Object.freeze(['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_ENABLE_DEMO_MODE', 'NEXT_PUBLIC_MAP_STYLE_CLASSIC', 'NEXT_PUBLIC_MAP_STYLE_SATELLITE', 'NEXT_PUBLIC_MAP_STYLE_TOPO']);
const styles = ['https://demotiles.maplibre.org/style.json', 'https://tiles.openfreemap.org/styles/liberty',
  'https://tiles.openfreemap.org/styles/bright'];
const SHA = /^[a-f0-9]{40}$/;
const requireThat = (value, code) => { if (!value) throw new Error(code); };
export const digest = (value) => createHash('sha256').update(value).digest('hex');

export function releaseContext({ expected, actual, workflowSha, event, ref }) {
  requireThat(SHA.test(expected) && expected === actual && expected === workflowSha
    && event === 'workflow_dispatch' && ref === 'refs/heads/master', 'release_source');
  return expected;
}

export function validatePublicConfig(config) {
  requireThat(config && Object.keys(config).length === KEYS.length
    && KEYS.every((key) => typeof config[key] === 'string' && !/[\u0000-\u001f\u007f]/.test(config[key])), 'public_config_keys');
  requireThat([PROJECT_ORIGIN, `${PROJECT_ORIGIN}/`].includes(config.NEXT_PUBLIC_SUPABASE_URL), 'public_project');
  requireThat(config.NEXT_PUBLIC_ENABLE_DEMO_MODE === 'false', 'public_demo');
  const key = config.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  requireThat(key.length <= 4096, 'public_key');
  if (!/^sb_publishable_[A-Za-z0-9_-]{20,4096}$/.test(key)) {
    requireThat(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key), 'public_key');
    let claims;
    try { claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')); }
    catch { throw new Error('public_key'); }
    requireThat(claims?.role === 'anon' && claims?.ref === 'ryycrdhlkmzpxwwwwupy', 'public_key');
  }
  requireThat(KEYS.slice(3).every((name, index) => config[name] === styles[index]), 'public_styles');
  return Object.fromEntries(KEYS.map((name) => [name, config[name]]));
}

// Parse only the six string literals of our template. Never evaluate downloaded JS.
export function parsePublicConfig(text) {
  requireThat(Buffer.byteLength(text) <= 16384, 'public_config_size');
  const wrapper = /^\s*window\.__APP_CONFIG__\s*=\s*\{([\s\S]*)\}\s*;\s*$/.exec(text);
  requireThat(wrapper, 'public_config_syntax');
  const body = wrapper[1]; const config = {};
  const entry = /\s*([A-Z_]+)\s*:\s*("(?:[^"\\\r\n]|\\["\\/bfnrt]|\\u[0-9a-fA-F]{4})*")\s*(,|$)/y;
  let offset = 0;
  while (body.slice(offset).trim()) {
    entry.lastIndex = offset;
    const match = entry.exec(body);
    requireThat(match && KEYS.includes(match[1]) && !Object.hasOwn(config, match[1]), 'public_config_syntax');
    config[match[1]] = JSON.parse(match[2]); offset = entry.lastIndex;
  }
  return validatePublicConfig(config);
}

export async function readBounded(response, limit = 16384) {
  if (!response.ok || !response.body) { await response.body?.cancel().catch(() => {}); throw new Error('public_config_http'); }
  const chunks = []; let count = 0;
  for await (const chunk of response.body) {
    count += chunk.length; requireThat(count <= limit, 'public_config_size'); chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function buildArguments(sha, config) {
  requireThat(SHA.test(sha), 'release_source'); validatePublicConfig(config);
  return ['build', '--platform', 'linux/amd64', '--label', `org.opencontainers.image.revision=${sha}`,
    '--label', 'org.opencontainers.image.source=https://github.com/D-OTIsud/Bertel',
    ...KEYS.flatMap((key) => ['--build-arg', `${key}=${config[key]}`]), '-t', `bertel-candidate:${sha}`, 'bertel-tourism-ui'];
}

export async function compressedArchive(stream, filename, limit = MAX_ARCHIVE_BYTES) {
  const partial = `${filename}.partial`; let bytes = 0; const hash = createHash('sha256');
  requireThat(!await stat(filename).then(() => true, (error) => { if (error.code === 'ENOENT') return false; throw error; }), 'archive_exists');
  const handle = await open(partial, 'wx', 0o600); // Never remove a partial owned by an earlier attempt.
  try {
    await pipeline(stream, createGzip(), new Transform({ transform(chunk, encoding, done) {
      bytes += chunk.length;
      if (bytes > limit) { done(new Error('archive_size')); return; }
      hash.update(chunk); done(null, chunk);
    } }), handle.createWriteStream());
    await link(partial, filename); // Exclusive publication; does not overwrite an existing finished file.
    await unlink(partial);
    return { bytes, sha256: hash.digest('hex') };
  } catch (error) {
    // This one private output belongs to this invocation; never remove a finished archive.
    await handle.close().catch(() => {}); await rm(partial, { force: true }).catch(() => {}); throw error;
  }
}

const work = resolve('.release-work');
const exec = (file, args, capture = false) => {
  const result = spawnSync(file, args, { encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
  requireThat(result.status === 0, 'command_failed'); return capture ? result.stdout.trim() : '';
};
function sourceContext() {
  const sha = releaseContext({ expected: process.env.EXPECTED_SOURCE_SHA, actual: exec('git', ['rev-parse', 'HEAD'], true),
    workflowSha: process.env.GITHUB_SHA, ref: process.env.GITHUB_REF, event: process.env.GITHUB_EVENT_NAME });
  requireThat(exec('git', ['status', '--porcelain', '--untracked-files=no'], true) === '', 'source_dirty');
  return sha;
}
const localJson = async (base, path) => {
  const response = await fetch(base + path, { redirect: 'error', signal: AbortSignal.timeout(6000) });
  return JSON.parse(await readBounded(response));
};

async function prepare() {
  const sha = sourceContext();
  const response = await fetch(CONFIG_URL, { redirect: 'error', signal: AbortSignal.timeout(10000), cache: 'no-store' });
  const config = parsePublicConfig(await readBounded(response));
  console.log(`::add-mask::${config.NEXT_PUBLIC_SUPABASE_ANON_KEY}`);
  await mkdir(work, { recursive: true, mode: 0o700 });
  await writeFile(resolve(work, 'inputs.json'), JSON.stringify({ sha, tree: exec('git', ['rev-parse', 'HEAD^{tree}'], true),
    config, config_sha256: digest(JSON.stringify(config)), captured_at: new Date().toISOString() }), { flag: 'wx', mode: 0o600 });
  console.log('Public configuration captured and validated; no server credential accepted.');
}

export function validateImageMetadata(info, sha) {
  requireThat(info?.Os === 'linux' && info.Architecture === 'amd64' && info.Config?.User === 'node'
    && info.Config.Labels?.['org.opencontainers.image.revision'] === sha
    && info.Config.Labels?.['org.opencontainers.image.source'] === 'https://github.com/D-OTIsud/Bertel'
    && /^sha256:[a-f0-9]{64}$/.test(info.Id), 'image_identity');
  requireThat(Number.isSafeInteger(info.Size) && info.Size > 0 && info.Size <= MAX_IMAGE_BYTES, 'image_size');
  const allowedEnvironment = new Set(['PATH', 'NODE_VERSION', 'YARN_VERSION', 'NODE_ENV', 'PORT', 'HOSTNAME']);
  requireThat(Array.isArray(info.Config.Env) && info.Config.Env.every((entry) => typeof entry === 'string'
    && allowedEnvironment.has(entry.split('=')[0]) && !entry.includes('sb_secret_')), 'image_credential');
  return { id: info.Id, size: info.Size, platform: 'linux/amd64', user: 'node', revision: sha,
    source: 'https://github.com/D-OTIsud/Bertel' };
}
async function imageMetadata(sha) {
  return validateImageMetadata(JSON.parse(exec('docker', ['image', 'inspect', `bertel-candidate:${sha}`], true))[0], sha);
}

async function smoke(inputs) {
  const image = await imageMetadata(inputs.sha); let container; let originalError;
  try {
    container = exec('docker', ['create', '--name', `bertel-candidate-${inputs.sha}`, '-p', '127.0.0.1::3000',
      ...KEYS.flatMap((key) => ['-e', `${key}=${inputs.config[key]}`]), '-e', 'NEXT_PUBLIC_APP_URL=https://bertel.otisud.re',
      '-e', `SOURCE_COMMIT=${inputs.sha}`, `bertel-candidate:${inputs.sha}`], true);
    requireThat(/^[a-f0-9]{64}$/.test(container), 'container_identity');
    exec('docker', ['start', container], true);
    const binding = exec('docker', ['port', container, '3000/tcp'], true);
    requireThat(/^127\.0\.0\.1:\d+$/.test(binding), 'container_binding');
    const base = `http://${binding}`;
    let health;
    for (let attempt = 0; attempt < 30; attempt++) {
      try { health = await localJson(base, '/api/health'); if (health.ok === true) break; } catch {}
      await new Promise((done) => setTimeout(done, 1000));
    }
    requireThat(health?.ok === true && health.service === 'bertel-tourism-ui', 'image_health');
    const version = await localJson(base, '/api/app-version');
    requireThat(version.minimumClientVersion === 2 && version.writeContractVersion === 2, 'image_contract');
    const ready = await localJson(base, '/api/ready');
    requireThat(ready.ready === true && ready.mode === 'live', 'image_readiness');
    const configResponse = await fetch(base + '/runtime-config.js', { redirect: 'error', signal: AbortSignal.timeout(6000) });
    requireThat(JSON.stringify(parsePublicConfig(await readBounded(configResponse))) === JSON.stringify(inputs.config), 'image_public_config');
    await writeFile(resolve(work, 'smoke.json'), JSON.stringify({ ...image, health: true, contract: '2/2',
      public_config_matches: true, auth_gateway_reachable: true, service_secret_supplied: false,
      scope: 'No authenticated business, email, AI, document or Storage operation tested.' }), { flag: 'wx' });
  } catch (error) { originalError = error; throw error; }
  finally {
    if (container && /^[a-f0-9]{64}$/.test(container)) {
      try { exec('docker', ['rm', '-f', container], true); } catch (error) { if (!originalError) throw error; }
    }
  }
}

async function exportImage(inputs) {
  const image = await imageMetadata(inputs.sha);
  const proof = JSON.parse(await readFile(resolve(work, 'smoke.json'), 'utf8'));
  requireThat(proof.id === image.id && proof.public_config_matches && proof.contract === '2/2', 'smoke_missing');
  const folder = resolve(work, 'artifact'); await mkdir(folder, { recursive: true, mode: 0o700 });
  const name = `bertel-${inputs.sha}.docker.tar.gz`;
  const child = spawn('docker', ['image', 'save', image.id], { stdio: ['ignore', 'pipe', 'inherit'] });
  // Resolve failures immediately to avoid an unhandled rejection while streaming.
  const completion = new Promise((done) => { child.once('error', () => done(false)); child.once('close', (code) => done(code === 0)); });
  try {
    const archive = await compressedArchive(child.stdout, resolve(folder, name));
    requireThat(await completion, 'image_save');
    await writeFile(resolve(folder, 'manifest.json'), JSON.stringify({ schema_version: 1, source_sha: inputs.sha,
      source_tree: inputs.tree, image, archive: { filename: name, ...archive }, public_config_sha256: inputs.config_sha256,
      public_config_captured_at: inputs.captured_at, smoke: proof, created_at: new Date().toISOString(),
      run_id: process.env.GITHUB_RUN_ID, run_attempt: process.env.GITHUB_RUN_ATTEMPT,
      repository: 'D-OTIsud/Bertel', registry_published: false, deployed: false }, null, 2), { flag: 'wx' });
  } catch (error) { child.kill('SIGTERM'); await completion; throw error; }
}

async function main(command) {
  if (command === 'prepare') return prepare();
  const sha = sourceContext();
  const inputs = JSON.parse(await readFile(resolve(work, 'inputs.json'), 'utf8'));
  requireThat(inputs.sha === sha && inputs.tree === exec('git', ['rev-parse', 'HEAD^{tree}'], true)
    && inputs.config_sha256 === digest(JSON.stringify(validatePublicConfig(inputs.config))), 'inputs_changed');
  if (command === 'build') return exec('docker', buildArguments(sha, inputs.config));
  if (command === 'smoke') return smoke(inputs);
  if (command === 'export') return exportImage(inputs);
  throw new Error('command');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv[2]).catch((error) => { console.error(`Candidate refused: ${/^[a-z_]+$/.test(error.message) ? error.message : 'io_or_input'}`); process.exitCode = 1; });
}
