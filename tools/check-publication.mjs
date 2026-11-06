import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Git blob fingerprints identify known private exports even if renamed.
const PRIVATE_BLOBS = new Set(['2bba23973481b36e2585201ffbbd9faa2cd2231b']);
const PRIVATE_PATH = /^docs\/research\/berta-deletes-backup-.*\.json$/i;

export function checkPublication(cwd = process.cwd(), privateBlobs = PRIVATE_BLOBS) {
  // Read the index, so staged bytes and deletions are checked rather than a
  // potentially different working copy. No file contents are read or logged.
  const index = execFileSync('git', ['ls-files', '--stage', '-z'], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const failures = [];
  for (const record of index.split('\0').filter(Boolean)) {
    const separator = record.indexOf('\t');
    const [, blob] = record.slice(0, separator).split(' ');
    const path = record.slice(separator + 1);
    if (PRIVATE_PATH.test(path) || privateBlobs.has(blob)) {
      failures.push(path);
    }
  }
  return [...new Set(failures)];
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const failures = checkPublication();
    if (failures.length) {
      console.error('Publication blocked: a known private CRM export is tracked.');
      for (const path of failures) console.error(`  ${JSON.stringify(path)}`);
      console.error('Keep the file local and remove it from the Git index.');
      process.exitCode = 1;
    } else {
      console.log('Publication check passed: no known private CRM export in the Git index.');
    }
  } catch {
    console.error('Publication check failed: could not inspect the Git index.');
    process.exitCode = 1;
  }
}
