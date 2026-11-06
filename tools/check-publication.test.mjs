import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkPublication, checkPublicationRange } from './check-publication.mjs';

const cli = fileURLToPath(new URL('./check-publication.mjs', import.meta.url));

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
  git('config', 'user.name', 'Synthetic Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  const stage = (path, value = '{"synthetic":true}\n') => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), value);
    git('add', '--', path);
    return git('rev-parse', `:${path}`);
  };
  const commit = () => {
    git('commit', '--quiet', '-m', 'Synthetic fixture');
    return git('rev-parse', 'HEAD');
  };
  return { root, git, stage, commit };
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

test('range refuses an export introduced then deleted before a clean HEAD', (t) => {
  const { root, git, stage, commit } = fixture(t);
  stage('readme.txt');
  const base = commit();
  const path = 'docs/research/berta-deletes-backup-2099-01-01.json';
  stage(path);
  commit();
  git('rm', '--', path);
  commit();
  assert.deepEqual(checkPublication(root), []);
  assert.deepEqual(checkPublicationRange(base, root), [path]);
  const result = spawnSync(process.execPath, [cli, '--base', base], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes(path));
  assert.ok(!result.stderr.includes('"synthetic":true'));
});

test('range refuses a renamed private fingerprint introduced then deleted', (t) => {
  const { root, git, stage, commit } = fixture(t);
  stage('readme.txt');
  const base = commit();
  const path = 'docs/research/renamed-example.txt';
  const blob = stage(path);
  commit();
  git('rm', '--', path);
  commit();
  assert.deepEqual(checkPublicationRange(base, root, new Set([blob])), [path]);
});

test('range permits removing a private blob inherited from the base', (t) => {
  const { root, git, stage, commit } = fixture(t);
  const path = 'docs/research/berta-deletes-backup-2099-01-01.json';
  const blob = stage(path);
  const base = commit();
  git('rm', '--', path);
  commit();
  assert.deepEqual(checkPublicationRange(base, root, new Set([blob])), []);
  assert.equal(spawnSync(process.execPath, [cli, '--base', base], { cwd: root }).status, 0);
});

test('range does not rescan unchanged private blobs from the base', (t) => {
  const { root, stage, commit } = fixture(t);
  const path = 'docs/research/berta-deletes-backup-2099-01-01.json';
  stage(path);
  const base = commit();
  stage('readme.txt');
  commit();
  assert.deepEqual(checkPublicationRange(base, root), []);
  assert.deepEqual(checkPublication(root), [path]);
});

test('range catches an intermediate modification even after restoring safe bytes', (t) => {
  const { root, stage, commit } = fixture(t);
  const path = 'docs/research/example.txt';
  stage(path, 'safe synthetic data');
  const base = commit();
  const blob = stage(path, 'private synthetic data');
  commit();
  stage(path, 'safe synthetic data');
  commit();
  assert.deepEqual(checkPublicationRange(base, root, new Set([blob])), [path]);
});

test('range inspects merged branch commits even if the merge tree is clean', (t) => {
  const { root, git, stage, commit } = fixture(t);
  stage('readme.txt');
  const base = commit();
  git('checkout', '--quiet', '-b', 'synthetic-side');
  const path = 'docs/research/berta-deletes-backup-2099-01-01.json';
  stage(path);
  commit();
  git('rm', '--', path);
  commit();
  git('checkout', '--quiet', '-b', 'synthetic-main', base);
  stage('main.txt');
  commit();
  git('merge', '--quiet', '--no-ff', 'synthetic-side', '-m', 'Synthetic merge');
  assert.deepEqual(checkPublication(root), []);
  assert.deepEqual(checkPublicationRange(base, root), [path]);
});

test('range refuses a base that is not an ancestor of HEAD', (t) => {
  const { root, git, stage, commit } = fixture(t);
  stage('readme.txt');
  const common = commit();
  stage('side.txt');
  const other = commit();
  git('checkout', '--quiet', '--detach', common);
  stage('main.txt');
  commit();
  assert.throws(() => checkPublicationRange(other, root));
});

test('CLI rejects unknown, incomplete, and duplicate arguments', (t) => {
  const { root } = fixture(t);
  for (const args of [['--unknown'], ['--base'], ['--base', 'HEAD', '--base', 'HEAD'], ['HEAD']]) {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('Usage:'));
  }
});
