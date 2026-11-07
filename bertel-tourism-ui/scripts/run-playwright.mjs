import { mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const cwd = process.cwd();
const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH ?? path.join(cwd, '.playwright-browsers');
const cli = path.join(cwd, 'node_modules', '@playwright', 'test', 'cli.js');
const args = process.argv.slice(2);

mkdirSync(browsersPath, { recursive: true });

const child = spawn(process.execPath, [cli, ...args], {
  cwd,
  env: {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: browsersPath,
  },
  stdio: 'inherit',
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
