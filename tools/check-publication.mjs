import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Git blob fingerprints identify known private exports even if renamed.
const PRIVATE_BLOBS = new Set(['2bba23973481b36e2585201ffbbd9faa2cd2231b']);
const PRIVATE_PATH = /^docs\/research\/berta-deletes-backup-.*\.json$/i;
const MAX_RANGE_COMMITS = 500;

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function isPrivate(path, blob, privateBlobs) {
  return PRIVATE_PATH.test(path) || privateBlobs.has(blob);
}

export function checkPublication(cwd = process.cwd(), privateBlobs = PRIVATE_BLOBS) {
  // Read the index, so staged bytes and deletions are checked rather than a
  // potentially different working copy. No file contents are read or logged.
  const index = git(cwd, ['ls-files', '--stage', '-z']);
  const failures = [];
  for (const record of index.split('\0').filter(Boolean)) {
    const separator = record.indexOf('\t');
    const [, blob] = record.slice(0, separator).split(' ');
    const path = record.slice(separator + 1);
    if (isPrivate(path, blob, privateBlobs)) {
      failures.push(path);
    }
  }
  return [...new Set(failures)];
}

export function checkPublicationRange(base, cwd = process.cwd(), privateBlobs = PRIVATE_BLOBS) {
  const baseCommit = git(cwd, ['rev-parse', '--verify', '--end-of-options', `${base}^{commit}`]).trim();
  git(cwd, ['merge-base', '--is-ancestor', baseCommit, 'HEAD']);
  const commits = git(cwd, [
    'rev-list', '--parents', `--max-count=${MAX_RANGE_COMMITS + 1}`, `${baseCommit}..HEAD`,
  ]).trim().split('\n').filter(Boolean);
  if (commits.length > MAX_RANGE_COMMITS) {
    throw new Error('Publication range exceeds 500 commits; select a reviewed, closer base.');
  }
  const failures = new Set();
  for (const line of commits) {
    const [commit, parent] = line.split(' ');
    // Compare with the first parent, or treat every entry of a newly reachable
    // root as an addition. Never read blobs or rescan unchanged base history.
    const changes = git(cwd, [
      'diff-tree', '--no-commit-id', '--raw', '-r', '-z', '--no-abbrev', '--no-renames',
      ...(parent ? [parent, commit] : ['--root', commit]),
    ]).split('\0');
    for (let i = 0; i + 1 < changes.length; i += 2) {
      const [, newMode, , blob] = changes[i].split(' ');
      const path = changes[i + 1];
      if (newMode !== '000000' && isPrivate(path, blob, privateBlobs)) failures.add(path);
    }
  }
  return [...failures];
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 0 && (args.length !== 2 || args[0] !== '--base' || !args[1] || args[1].startsWith('-'))) {
      throw new Error('Usage: node tools/check-publication.mjs [--base <commit>]');
    }
    const failures = args.length ? checkPublicationRange(args[1]) : checkPublication();
    if (failures.length) {
      console.error('Publication blocked: a known private CRM export is tracked or introduced in the selected range.');
      for (const path of failures) console.error(`  ${JSON.stringify(path)}`);
      console.error(args.length
        ? 'Remove the export from the candidate commits; keep required local copies outside Git.'
        : 'Keep the file local and remove it from the Git index.');
      process.exitCode = 1;
    } else {
      console.log(`Publication check passed: no known private CRM export in the ${args.length ? 'selected commit changes' : 'Git index'}.`);
    }
  } catch {
    console.error('Publication check failed. Usage: node tools/check-publication.mjs [--base <commit>].');
    console.error('The base must be an available ancestor of HEAD, with at most 500 commits in the range.');
    process.exitCode = 1;
  }
}
