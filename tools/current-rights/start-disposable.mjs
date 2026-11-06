import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateEnvironment } from './disposable.mjs';

const workdir = validateEnvironment(process.env);
assert.ok(readFileSync(resolve(workdir, '.bertel-current-rights-disposable'), 'utf8').trim() === 'BERTEL_CURRENT_RIGHTS_DISPOSABLE_V1', 'owned CI stack marker required');
try {
  // The native CLI normally prints generated keys. Capture both streams only in
  // memory; never persist/re-emit the raw log or attach an exception cause.
  execFileSync('supabase', ['start', '--workdir', workdir], {
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, maxBuffer: 32 * 1024 * 1024,
  });
} catch { throw new Error('Disposable Supabase startup failed; raw output withheld because it can contain local keys'); }
console.log('Disposable Supabase stack started; generated keys withheld.');
