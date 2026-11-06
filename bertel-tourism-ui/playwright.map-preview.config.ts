import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { defineConfig } from '@playwright/test';
import base from './playwright.config';

const cwd = process.cwd();
const repo = path.resolve(cwd, '..');
const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
const sourceCommit = git('rev-parse', 'HEAD');
if (!/^[a-f0-9]{40}$/.test(process.env.MAP_PREVIEW_EXPECTED_COMMIT ?? '')
  || process.env.MAP_PREVIEW_EXPECTED_COMMIT !== sourceCommit) throw new Error('Expected source commit must match this worktree');
if (git('diff', '--name-only', 'HEAD')) throw new Error('Commit tracked changes before the fresh-server proof');
const server = base.webServer;
if (!server || Array.isArray(server) || !server.url) throw new Error('A newly spawned local server is mandatory');
const endpoint = new URL(server.url);
if (endpoint.hostname !== '127.0.0.1' || endpoint.protocol !== 'http:') throw new Error('Only a local owned server is accepted');

export default defineConfig({
  ...base,
  testMatch: '**/map-preview.spec.ts',
  workers: 1,
  retries: 0,
  metadata: {
    sourceCommit,
    sourceTree: git('rev-parse', 'HEAD^{tree}'),
    mapPanelBlob: git('rev-parse', 'HEAD:bertel-tourism-ui/src/components/explorer/MapPanel.tsx'),
    freshServer: true,
  },
  webServer: { ...server, cwd, reuseExistingServer: false },
});
