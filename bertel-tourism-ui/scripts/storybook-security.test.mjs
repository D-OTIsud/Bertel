import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
// CI defaults to its own npm-ci installation. Local before/after probes can read
// a separate installation without changing any shared dependency files.
const project = path.resolve(process.env.STORYBOOK_TEST_PROJECT_ROOT || appRoot);
const fromProject = createRequire(path.join(project, 'package.json'));
const probe = fileURLToPath(new URL('./probe-storybook-channel.mjs', import.meta.url));
function inspect(scenario) {
  const result = spawnSync(process.execPath, ['--max-old-space-size=256', probe, project, scenario],
    { encoding: 'utf8', timeout: 10_000, maxBuffer: 256 * 1024, windowsHide: true });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const line = result.stdout.split(/\r?\n/).find((text) => text.startsWith('STORYBOOK_CHANNEL_PROOF '));
  assert.ok(line, `Missing real transport proof: ${result.stdout}`);
  const proof = JSON.parse(line.slice('STORYBOOK_CHANNEL_PROOF '.length));
  assert.deepEqual(proof.errors, [], `Transport errors: ${result.stderr}`);
  return proof;
}

test('the installed Storybook family is aligned on the patched release', () => {
  const packages = ['storybook', '@storybook/nextjs', '@storybook/addon-a11y', '@storybook/builder-webpack5'];
  for (const name of packages) {
    const metadata = JSON.parse(fs.readFileSync(fromProject.resolve(`${name}/package.json`), 'utf8'));
    assert.equal(metadata.version, '10.6.2', name);
  }
});

test('dev preview rejects foreign and opaque senders while retaining same-origin and local messages', () => {
  assert.deepEqual(inspect('preview-dev').delivered, ['same', 'local', 'after']);
});

test('dev manager pins the registered iframe origin after navigation', () => {
  assert.deepEqual(inspect('manager-dev').delivered, ['same', 'after']);
});

test('dev manager accepts a configured remote ref and rejects a foreign navigated sender', () => {
  assert.deepEqual(inspect('manager-ref').delivered, ['registered-ref', 'after']);
});

test('dev manager rejects a frame after it loses its Storybook registration', () => {
  assert.deepEqual(inspect('manager-unregistered').delivered, ['same', 'after']);
});

test('built preview preserves intentional cross-origin embedding messages', () => {
  assert.deepEqual(inspect('preview-static').delivered, ['same', 'local', 'foreign', 'opaque', 'after']);
});
