// Manual CI qualification only. Never a production Docker/SMTP/SQL operator.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, lstat } from 'node:fs/promises';
import { mkdirSync, writeFileSync, lstatSync, realpathSync, unlinkSync, rmdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildArguments, validateImageMetadata, validatePublicConfig, releaseContext, isReleaseDispatch, digest } from './candidate.mjs';
import { PROOF_VERSION, MODES, CALIBRATION_SOURCE, CALIBRATION_TREE, caseNames, manualEmailProfile,
  assertObservation, assertCalibration, validateManualEmailProof, manualEmailToolsHash } from './manual-email-contract.mjs';

const requireThat = (value, code) => { if (!value) throw new Error(code); };
const root = realpathSync(process.cwd());
export function assertRuntimeCI(env) {
  requireThat(env.CI === 'true' && env.GITHUB_ACTIONS === 'true' && env.RUNNER_OS === 'Linux'
    && isReleaseDispatch(env.GITHUB_EVENT_NAME, env.GITHUB_REF)
    && /^[1-9][0-9]{0,18}$/.test(env.GITHUB_RUN_ID ?? '') && /^[1-9][0-9]{0,18}$/.test(env.GITHUB_RUN_ATTEMPT ?? ''), 'manual_email_ci');
  requireThat(['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH', 'NODE_OPTIONS'].every((key) => !env[key]), 'manual_email_endpoint_override');
}
function command(file, args, options = {}) {
  const result = spawnSync(file, args, { cwd: options.cwd ?? root, encoding: 'utf8', shell: false,
    stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'], timeout: options.timeout ?? 60000, maxBuffer: 2 * 1024 * 1024 });
  requireThat(!result.error && result.status === 0, 'manual_email_command');
  return options.inherit ? '' : result.stdout.trim();
}
const docker = (args, options) => command('docker', ['--context', 'default', ...args], options);
async function readJson(path) {
  const st = await lstat(path); requireThat(st.isFile() && !st.isSymbolicLink() && st.size > 0 && st.size <= 262144, 'manual_email_file');
  return JSON.parse(await readFile(path, 'utf8'));
}
function inspectImage(sha, tag) { return validateImageMetadata(JSON.parse(docker(['image', 'inspect', tag]))[0], sha); }
export function containerArguments({ imageId, source, run, attempt, nonce, mode, config, fixtureDirectory, runtimeConfigFile }) {
  requireThat(/^sha256:[a-f0-9]{64}$/.test(imageId) && /^[a-f0-9]{40}$/.test(source) && /^[a-f0-9]{32}$/.test(nonce)
    && MODES.includes(mode) && /^[1-9][0-9]{0,18}$/.test(run) && /^[1-9][0-9]{0,18}$/.test(attempt), 'manual_email_resource');
  const env = { ...validatePublicConfig(config), SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-key-not-real',
    NEXT_PUBLIC_APP_URL: 'https://synthetic.example.invalid', NEXT_TELEMETRY_DISABLED: '1',
    NODE_OPTIONS: '--require=/bertel-smtp-probe/manual-email-preload.cjs',
    BERTEL_SMTP_PROBE_ID: nonce, BERTEL_SMTP_PROBE_ORIGIN: new URL(config.NEXT_PUBLIC_SUPABASE_URL).origin,
    BERTEL_SMTP_PROBE_LOG: '/tmp/events.jsonl', HOSTNAME: '127.0.0.1', PORT: '3000' };
  if (mode !== 'absent') env.LIST_EMAIL_MODE = mode === 'unknown' ? 'not-a-mode' : mode;
  return ['create', '--name', `bertel-mail-${source.slice(0, 12)}-${run}-${attempt}-${nonce}`,
    '--label', `io.bertel.manual-email-probe=${nonce}`, '--label', `io.bertel.manual-email-source=${source}`,
    '--network', 'none', '--read-only', '--user', 'node', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--cpus', '1', '--memory', '768m', '--pids-limit', '64', '--no-healthcheck',
    '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=32m,uid=1000,gid=1000,mode=1777',
    '--mount', `type=bind,source=${fixtureDirectory},target=/bertel-smtp-probe,readonly`,
    '--mount', `type=bind,source=${runtimeConfigFile},target=/app/public/runtime-config.js`,
    ...Object.entries(env).flatMap(([key, value]) => ['-e', `${key}=${value}`]),
    imageId]; // Keep the image's real entrypoint and CMD; only its generated output is writable.
}
export function assertContainer(info, imageId, nonce, mode, runtimeConfigFile) {
  requireThat(info && /^[a-f0-9]{64}$/.test(info.Id) && info.Image === imageId && info.Config?.User === 'node'
    && info.Config.Labels?.['io.bertel.manual-email-probe'] === nonce && info.HostConfig?.NetworkMode === 'none'
    && info.HostConfig.ReadonlyRootfs === true && info.HostConfig.Memory === 768 * 1024 * 1024
    && info.HostConfig.NanoCpus === 1000000000 && info.HostConfig.PidsLimit === 64
    && info.HostConfig.CapDrop?.includes('ALL') && info.HostConfig.SecurityOpt?.some((v) => v.startsWith('no-new-privileges')),
  'manual_email_container_identity');
  const entries = info.Config.Env.filter((entry) => entry.startsWith('LIST_EMAIL_MODE='));
  requireThat(mode === 'absent' ? entries.length === 0 : entries.length === 1
    && entries[0] === `LIST_EMAIL_MODE=${mode === 'unknown' ? 'not-a-mode' : mode}`, 'manual_email_container_mode');
  requireThat(info.Config.Entrypoint?.length === 1 && info.Config.Entrypoint[0] === '/entrypoint.sh'
    && JSON.stringify(info.Config.Cmd) === JSON.stringify(['node', 'server.js'])
    && JSON.stringify(info.Config.Healthcheck?.Test) === JSON.stringify(['NONE'])
    && Array.isArray(info.Mounts) && info.Mounts.some((m) => m.Destination === '/app/public/runtime-config.js'
      && m.Source === runtimeConfigFile && m.RW === true && m.Type === 'bind')
    && info.Mounts.some((m) => m.Destination === '/bertel-smtp-probe' && m.RW === false)
    && info.Mounts.every((m) => ['/tmp', '/bertel-smtp-probe', '/app/public/runtime-config.js'].includes(m.Destination))
    && !info.Mounts.some((m) => m.Destination.startsWith('/app/') && m.Destination !== '/app/public/runtime-config.js'), 'manual_email_mounts');
}
function writableRuntimeOutput(nonce) {
  const base = resolve(root, '.release-work/manual-email-runs');
  if (!existsSync(base)) mkdirSync(base, { mode: 0o700 });
  const parent = lstatSync(base);
  requireThat(parent.isDirectory() && !parent.isSymbolicLink() && parent.uid === process.getuid()
    && (parent.mode & 0o777) === 0o700 && realpathSync(base) === base, 'manual_email_owned_directory');
  const folder = resolve(base, nonce); mkdirSync(folder, { mode: 0o700 });
  const file = resolve(folder, 'runtime-config.js'); writeFileSync(file, '', { flag: 'wx', mode: 0o600 });
  const before = lstatSync(file);
  requireThat(before.isFile() && !before.isSymbolicLink() && before.uid === process.getuid()
    && before.size === 0 && (before.mode & 0o777) === 0o600 && realpathSync(file) === file, 'manual_email_owned_file');
  command('sudo', ['-n', 'chown', '1000:1000', file]);
  const after = lstatSync(file);
  requireThat(after.isFile() && !after.isSymbolicLink() && after.uid === 1000 && after.gid === 1000
    && after.size === 0 && (after.mode & 0o777) === 0o600, 'manual_email_writable_output');
  return { folder, file };
}
function probe({ image, sha, config, profile, mode, calibration = false }) {
  const nonce = randomBytes(16).toString('hex'); let id; let originalError;
  const output = writableRuntimeOutput(nonce);
  const observations = [];
  try {
    id = docker(containerArguments({ imageId: image.id, source: sha, run: process.env.GITHUB_RUN_ID,
      attempt: process.env.GITHUB_RUN_ATTEMPT, nonce, mode, config,
      fixtureDirectory: resolve(root, 'tools/release-artifact/fixtures'), runtimeConfigFile: output.file }));
    requireThat(/^[a-f0-9]{64}$/.test(id), 'manual_email_container_ack');
    assertContainer(JSON.parse(docker(['inspect', id]))[0], image.id, nonce, mode, output.file);
    docker(['start', id]);
    for (const name of calibration ? ['prepare'] : caseNames(profile)) {
      const response = docker(['exec', '-e', 'NODE_OPTIONS=', id, 'node', '/bertel-smtp-probe/manual-email-request.cjs', name]);
      requireThat(Buffer.byteLength(response) <= 16384, 'manual_email_response_size');
      const observation = JSON.parse(response);
      if (!calibration) assertObservation(profile, mode, name, observation);
      observations.push({ mode, name, image_id: image.id, container_id: id, observation });
    }
    return observations;
  } catch (error) { originalError = error; throw error; }
  finally {
    if (id && /^[a-f0-9]{64}$/.test(id)) {
      try {
        assertContainer(JSON.parse(docker(['inspect', id]))[0], image.id, nonce, mode, output.file);
        docker(['rm', '-f', id]);
        unlinkSync(output.file); rmdirSync(output.folder); // Exact owned files only; never recursive deletion.
      } catch (error) { if (!originalError) throw error; }
    }
    // Missing/unknown create ACK is never permission to delete by an inferred name.
    // This ephemeral CI VM is discarded; the qualification fails and no export follows.
  }
}
async function calibrationImage(inputs) {
  const source = resolve(root, '.release-work/calibration-source');
  requireThat(command('git', ['rev-parse', 'HEAD'], { cwd: source }) === CALIBRATION_SOURCE
    && command('git', ['rev-parse', 'HEAD^{tree}'], { cwd: source }) === CALIBRATION_TREE
    && command('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: source }) === '', 'manual_email_calibration_checkout');
  const tag = `bertel-mail-calibration:${CALIBRATION_SOURCE.slice(0, 12)}-${randomBytes(16).toString('hex')}`;
  const args = buildArguments(CALIBRATION_SOURCE, inputs.config);
  const index = args.indexOf('-t'); requireThat(index > 0, 'manual_email_build_args'); args[index + 1] = tag;
  // Build the true pinned source, not a condition edited into the final image.
  docker(args, { cwd: source, inherit: true, timeout: 1200000 });
  return inspectImage(CALIBRATION_SOURCE, tag);
}
export async function qualify() {
  assertRuntimeCI(process.env);
  requireThat(JSON.parse(docker(['context', 'inspect', 'default', '--format', '{{json .Endpoints.docker.Host}}'])) === 'unix:///var/run/docker.sock', 'manual_email_docker_endpoint');
  const profile = manualEmailProfile(process.env.MANUAL_EMAIL_PROFILE);
  const sha = releaseContext({ expected: process.env.EXPECTED_SOURCE_SHA, actual: command('git', ['rev-parse', 'HEAD']),
    workflowSha: process.env.GITHUB_SHA, event: process.env.GITHUB_EVENT_NAME, ref: process.env.GITHUB_REF });
  requireThat(command('git', ['status', '--porcelain', '--untracked-files=no']) === '', 'manual_email_source_dirty');
  const inputs = await readJson(resolve(root, '.release-work/inputs.json'));
  requireThat(inputs.sha === sha && inputs.tree === command('git', ['rev-parse', 'HEAD^{tree}'])
    && inputs.manual_email_profile === profile && inputs.config_sha256 === digest(JSON.stringify(validatePublicConfig(inputs.config))), 'manual_email_inputs');
  const image = inspectImage(sha, `bertel-candidate:${sha}`);
  const cases = MODES.flatMap((mode) => probe({ image, sha, profile, mode, config: inputs.config }));
  const baseline = await calibrationImage(inputs);
  const baselineCase = probe({ image: baseline, sha: CALIBRATION_SOURCE, config: inputs.config, profile: 'protocol-v1', mode: 'closed', calibration: true })[0];
  const calibration = { source_sha: CALIBRATION_SOURCE, source_tree: CALIBRATION_TREE, image_id: baseline.id, container_id: baselineCase.container_id,
    public_config_sha256: inputs.config_sha256,
    observation: baselineCase.observation };
  assertCalibration(calibration, inputs.config_sha256, image.id);
  const context = { profile, source_sha: sha, source_tree: inputs.tree, image_id: image.id, public_config_sha256: inputs.config_sha256,
    tools_sha256: await manualEmailToolsHash(root), run_id: process.env.GITHUB_RUN_ID, run_attempt: process.env.GITHUB_RUN_ATTEMPT };
  const proof = { schema: PROOF_VERSION, status: 'passed', ...context, cases, calibration,
    scope: 'Compiled HTTP handler; Auth and first config RPC synthetic; no real SMTP/SQL/provider, not deployed Auth or fleet.' };
  validateManualEmailProof(proof, context);
  await writeFile(resolve(root, '.release-work/manual-email-proof.json'), JSON.stringify(proof, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log('Manual email runtime profile and real ungated calibration qualified; separate proof written.');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  (process.argv[2] === 'qualify' ? qualify() : Promise.reject(new Error('manual_email_command')))
    .catch((error) => { console.error(`Manual email qualification refused: ${/^[a-z_]+$/.test(error.message) ? error.message : 'io_or_input'}`); process.exitCode = 1; });
}
