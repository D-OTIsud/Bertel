import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const project = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(path.join(project, 'package.json'));
const manifest = require('./package.json');
const cliPackagePath = require.resolve('supabase/package.json');
const cliPackage = JSON.parse(fs.readFileSync(cliPackagePath, 'utf8'));
const cli = path.join(path.dirname(cliPackagePath), 'dist/supabase.js');
const wrapper = path.join(project, 'scripts/run-supabase.mjs');
// An unissued sentinel prevents accidental use of a developer's real token.
const fakeToken = `sbp_${'0'.repeat(40)}`;

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bertel-cli-test-'));
  const home = path.join(root, 'home');
  const temporary = path.join(root, 'tmp');
  fs.mkdirSync(home);
  fs.mkdirSync(temporary);
  const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'ComSpec', 'PATH', 'PATHEXT', 'TEMP', 'TMP']
    .filter(key => process.env[key]).map(key => [key, process.env[key]]));
  Object.assign(env, { HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: home,
    XDG_CACHE_HOME: home, XDG_DATA_HOME: home, APPDATA: home, LOCALAPPDATA: home, TEMP: temporary, TMP: temporary,
    BERTEL_SUPABASE_HOME: home, SUPABASE_ACCESS_TOKEN: fakeToken, CI: 'true', DO_NOT_TRACK: '1',
    HTTP_PROXY: 'http://127.0.0.1:9', HTTPS_PROXY: 'http://127.0.0.1:9',
    http_proxy: 'http://127.0.0.1:9', https_proxy: 'http://127.0.0.1:9', NO_PROXY: '', no_proxy: '' });
  return { root, home, env, cleanup() {
    const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(root));
    assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    assert(path.basename(root).startsWith('bertel-cli-test-'));
    fs.rmSync(root, { recursive: true, force: true });
  } };
}

function run(entry, args, { cwd, env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry, ...args], {
      cwd, env, windowsHide: true, detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '', stopped = false, failure;
    function stop(message) {
      if (stopped) return;
      stopped = true; failure = new Error(message);
      if (!child.pid) return;
      try {
        if (process.platform === 'win32') {
          execFileSync(path.join(process.env.SystemRoot, 'System32/taskkill.exe'),
            ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        } else process.kill(-child.pid, 'SIGKILL');
      } catch { /* A process may have exited between the deadline and the kill. */ }
    }
    const timer = setTimeout(() => stop('CLI probe exceeded 15 seconds'), 15_000);
    child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > 256 * 1024) stop('CLI stdout exceeded bound'); });
    child.stderr.on('data', chunk => { stderr += chunk; if (stderr.length > 256 * 1024) stop('CLI stderr exceeded bound'); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (failure) reject(failure); else resolve({ code, signal, stdout, stderr });
    });
  });
}

test('the operator CLI stays on the exact supported v2 release and platform artifacts', () => {
  assert.equal(manifest.devDependencies.supabase, '2.122.1');
  assert.equal(cliPackage.version, '2.122.1');
  assert.equal(cliPackage.bin.supabase, 'dist/supabase.js');
  assert.equal(cliPackage.dependencies.effect, undefined);
  assert.equal(cliPackage.dependencies.toml, undefined);
  assert.equal(Object.keys(cliPackage.optionalDependencies).length, 8);
  for (const [name, version] of Object.entries(cliPackage.optionalDependencies)) {
    assert.match(name, /^@supabase\/cli-/);
    assert.equal(version, '2.122.1');
  }
});

test('PostCSS keeps its existing optional YAML configuration capability after removing the CLI parser tree', async () => {
  assert.equal(manifest.devDependencies.yaml, '2.9.0');
  const temp = fixture();
  try {
    fs.writeFileSync(path.join(temp.root, '.postcssrc.yaml'), 'plugins: []\nmap: false\n');
    const result = await require('postcss-load-config')({}, temp.root, { stopDir: temp.root });
    assert.equal(path.basename(result.file), '.postcssrc.yaml');
    assert.equal(result.plugins.length, 0);
    assert.equal(result.options.map, false);
    assert.equal(require('yaml/package.json').version, '2.9.0');
  } finally { temp.cleanup(); }
});

test('the real native binary provides v2 help and the exact version without a linked project', { timeout: 45_000 }, async () => {
  const temp = fixture();
  try {
    // No binary override is inherited: these calls execute the real installed
    // platform distribution, rather than the observer used in the wrapper test.
    const help = await run(cli, ['--help'], { cwd: temp.root, env: temp.env });
    assert.equal(help.code, 0, help.stderr);
    assert.match(help.stdout, /--version/);
    for (const name of ['init', 'status', 'migration', 'storage']) assert.match(help.stdout, new RegExp(`\\b${name}\\b`));
    const version = await run(cli, ['--version'], { cwd: temp.root, env: temp.env });
    assert.equal(version.code, 0, version.stderr);
    assert.equal(version.stdout.trim(), '2.122.1');
  } finally { temp.cleanup(); }
});

test('the real CLI initializes a disposable project and distinguishes invalid TOML from a missing local stack', { timeout: 60_000 }, async () => {
  const temp = fixture();
  try {
    const help = await run(cli, ['init', '--help'], { cwd: temp.root, env: temp.env });
    assert.equal(help.code, 0, help.stderr);
    assert.match(help.stdout, /Initialize a local project/i);
    assert.match(help.stdout, /--workdir/);
    const initialized = await run(cli, ['init', '--workdir', temp.root], { cwd: temp.root, env: temp.env });
    assert.equal(initialized.code, 0, initialized.stderr);
    const configPath = path.join(temp.root, 'supabase/config.toml');
    const original = fs.readFileSync(configPath, 'utf8');
    assert.match(original, /project_id\s*=/);
    const statusHelp = await run(cli, ['status', '--help'], { cwd: temp.root, env: temp.env });
    assert.equal(statusHelp.code, 0, statusHelp.stderr);
    assert.match(statusHelp.stdout, /local Supabase containers/i);
    fs.writeFileSync(configPath, '[api\n');
    const invalid = await run(cli, ['status', '--workdir', temp.root], { cwd: temp.root, env: temp.env });
    assert.notEqual(invalid.code, 0);
    assert.match(invalid.stderr, /Invalid TOML document/i);
    const nested = path.join(temp.root, 'nested');
    fs.mkdirSync(nested);
    const inherited = await run(cli, ['status'], { cwd: nested, env: temp.env });
    assert.notEqual(inherited.code, 0);
    assert.match(inherited.stderr, /Invalid TOML document/i); // Default cwd still searches upward.
    const explicit = await run(cli, ['status', '--workdir', nested], { cwd: nested, env: temp.env });
    assert.notEqual(explicit.code, 0);
    assert.match(explicit.stderr, /docker|container|podman/i);
    assert.doesNotMatch(explicit.stderr, /Invalid TOML document/i); // Explicit path must not read its ancestor.
    fs.writeFileSync(configPath, original);
    const valid = await run(cli, ['status', '--workdir', temp.root], { cwd: temp.root, env: temp.env });
    assert.notEqual(valid.code, 0); // No stack is created or started for this fixture.
    assert.match(valid.stderr, /docker|container|podman/i);
    assert.doesNotMatch(valid.stderr, /Invalid TOML document/i);
    // This proves local parsing/dispatch, not successful Docker/Supabase startup.
  } finally { temp.cleanup(); }
});

test('the unchanged repository wrapper preserves arguments, private home and failure exits through the actual shim', { timeout: 45_000 }, async () => {
  const temp = fixture();
  try {
    // Deliberately substitute a harmless Node observer only in this transport
    // test. The real native distribution is exercised separately above.
    const env = { ...temp.env, SUPABASE_CLI_BINARY_OVERRIDE: process.execPath };
    const args = ['argument with spaces', 'literal-$(not-executed)', 'quote"and-apostrophe\''];
    const observer = 'console.log(JSON.stringify({args:process.argv.slice(1),home:process.env.HOME,profile:process.env.USERPROFILE}))';
    const output = await run(wrapper, ['--eval', observer, '--', ...args], { cwd: project, env });
    assert.equal(output.code, 0, output.stderr);
    assert.deepEqual(JSON.parse(output.stdout), { args, home: temp.home, profile: temp.home });
    const failed = await run(wrapper, ['--eval', 'process.exit(23)'], { cwd: project, env });
    assert.equal(failed.code, 23);
  } finally { temp.cleanup(); }
});
