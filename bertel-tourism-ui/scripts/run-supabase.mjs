import { mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const cwd = process.cwd();
const repoRoot = path.resolve(cwd, '..');
const supabaseHome = process.env.BERTEL_SUPABASE_HOME ?? path.join(repoRoot, '.supabase-home');
const cli = path.join(cwd, 'node_modules', 'supabase', 'dist', 'supabase.js');
const args = process.argv.slice(2);

mkdirSync(supabaseHome, { recursive: true });

const child = spawn(process.execPath, [cli, ...args], {
  cwd,
  env: {
    ...process.env,
    HOME: supabaseHome,
    USERPROFILE: supabaseHome,
  },
  stdio: 'inherit',
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
