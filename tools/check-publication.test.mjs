import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { checkPublication } from './check-publication.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'bertel-publication-test-'));
  t.after(() => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(root.startsWith(join(tmpdir(), 'bertel-publication-test-')));
    rmSync(root, { recursive: true, force: true });
  });
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '--quiet');
  git('config', 'core.autocrlf', 'false');
  const stage = (path, value = '{"synthetic":true}\n') => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), value);
    git('add', '--', path);
    return git('rev-parse', `:${path}`);
  };
  return { root, git, stage };
}

test('technical JSON and synthetic fixtures remain publishable', (t) => {
  const { root, stage } = fixture(t);
  stage('docs/research/schema-summary.json');
  stage('tools/fixtures/crm-synthetic.json');
  assert.deepEqual(checkPublication(root), []);
});

test('a dated CRM export path is refused even with synthetic bytes', (t) => {
  const { root, stage } = fixture(t);
  const path = 'docs/research/berta-deletes-backup-2099-01-01.json';
  stage(path);
  assert.deepEqual(checkPublication(root), [path]);
});

test('a renamed exact private blob is refused using a synthetic fingerprint', (t) => {
  const { root, stage } = fixture(t);
  const path = 'docs/research/renamed-example.txt';
  const blob = stage(path);
  assert.deepEqual(checkPublication(root, new Set([blob])), [path]);
});

test('staged private bytes are checked even when the working copy is replaced', (t) => {
  const { root, stage } = fixture(t);
  const path = 'docs/research/example.txt';
  const blob = stage(path);
  writeFileSync(join(root, path), 'different synthetic working copy');
  assert.deepEqual(checkPublication(root, new Set([blob])), [path]);
});

test('removing a private export from the index allows the retained local copy', (t) => {
  const { root, git, stage } = fixture(t);
  const path = 'docs/research/berta-deletes-backup-2099-01-01.json';
  stage(path);
  git('rm', '--cached', '--', path);
  assert.deepEqual(checkPublication(root), []);
});
