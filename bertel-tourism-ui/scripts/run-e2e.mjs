import { mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const cwd = process.cwd();
const port = Number(process.env.PLAYWRIGHT_PORT ?? process.env.PORT ?? 3002);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH ?? path.join(cwd, '.playwright-browsers');
const nextCli = path.join(cwd, 'node_modules', 'next', 'dist', 'bin', 'next');
const playwrightCli = path.join(cwd, 'node_modules', '@playwright', 'test', 'cli.js');

mkdirSync(browsersPath, { recursive: true });

function pipeWithPrefix(stream, prefix) {
  stream.on('data', (chunk) => {
    String(chunk)
      .split(/\r?\n/)
      .filter(Boolean)
      .forEach((line) => process.stdout.write(`${prefix} ${line}\n`));
  });
}

async function waitForServer(timeoutMs = 120000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1000);
      const response = await fetch(baseURL, { signal: controller.signal });
      clearTimeout(timeout);
      if (response.status < 500) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`Timed out waiting for ${baseURL}`);
}

function runNodeCli(cli, args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd,
      env,
      stdio: 'inherit',
    });
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

function killTree(pid) {
  if (!pid) return Promise.resolve();
  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      const killer = spawn('taskkill.exe', ['/pid', String(pid), '/t', '/f'], {
        stdio: 'ignore',
      });
      killer.on('exit', () => resolve());
      killer.on('error', () => resolve());
    });
  }
  return new Promise((resolve) => {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      resolve();
      return;
    }
    setTimeout(resolve, 500);
  });
}

const server = spawn(process.execPath, [nextCli, 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
  cwd,
  env: {
    ...process.env,
    NEXT_PUBLIC_ENABLE_DEMO_MODE: 'true',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

pipeWithPrefix(server.stdout, '[Next]');
pipeWithPrefix(server.stderr, '[Next]');

let serverExitCode = null;
server.on('exit', (code) => {
  serverExitCode = code ?? 0;
});

try {
  await waitForServer();
  if (serverExitCode !== null) {
    throw new Error(`Next dev server exited before tests could run with code ${serverExitCode}.`);
  }
  const code = await runNodeCli(playwrightCli, ['test', ...process.argv.slice(2)], {
    ...process.env,
    PLAYWRIGHT_BASE_URL: baseURL,
    PLAYWRIGHT_BROWSERS_PATH: browsersPath,
    PLAYWRIGHT_SKIP_WEBSERVER: '1',
  });
  process.exitCode = code;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await killTree(server.pid);
  process.exit(process.exitCode ?? 0);
}
