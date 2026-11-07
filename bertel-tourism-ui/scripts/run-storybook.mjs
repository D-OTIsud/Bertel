import { mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const cwd = process.cwd();
const repoRoot = path.resolve(cwd, '..');
const storybookHome = process.env.BERTEL_STORYBOOK_HOME ?? path.join(repoRoot, '.storybook-home');
const cli = path.join(cwd, 'node_modules', 'storybook', 'dist', 'bin', 'dispatcher.js');

mkdirSync(storybookHome, { recursive: true });

const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  cwd,
  env: {
    ...process.env,
    HOME: storybookHome,
    USERPROFILE: storybookHome,
  },
  stdio: 'inherit',
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
