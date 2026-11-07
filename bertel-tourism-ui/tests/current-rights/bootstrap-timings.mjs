import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const FRONT = 'bertel-tourism-ui';
const HOOK = 'src/hooks/useBootstrapSession.ts';
const RUNTIME_PINS = {
  src: 'a2d5c61df6e84d939371feb34b0bb727d23eb5b7',
  'package-lock.json': '6e288cdae6d2111e1c034d0c17c4221cbd975f10',
  'next.config.ts': '808e1a09f8914971c60c72278497c48bb182e580',
};
const CURRENT_HOOK_BLOB = '041ec2dea395a198b1c7857ca910af9382655b78';
const PROFILE_DELAY_MS = 80;
const RUN_ORDER = ['sequential', 'parallel', 'parallel', 'sequential'];

export const bootstrapProbes = new Set([
  'current_user_can_edit_objects', 'user_can_create_object', 'current_user_active_org',
  'current_user_admin_rank', 'current_user_admin_role_code', 'current_user_test_realm',
]);

const parallel = `      // These read-only probes depend on the authenticated user, not on each
      // other. Keep profile/persona resolution ahead of the batch and publish
      // only its complete result for the still-current auth generation.
      const [canEditObjects, canCreateObjects, activeOrg, adminRank, adminRoleCode, isTestRealm] = await Promise.all([
        fetchCanEditObjects(),
        fetchCanCreateObjects(),
        fetchActiveOrg(),
        fetchAdminRank(),
        fetchAdminRoleCode(),
        fetchTestRealm(),
      ]);`;

const sequential = `      const canEditObjects = await fetchCanEditObjects();
      if (!isCurrent(run)) {
        return;
      }

      const canCreateObjects = await fetchCanCreateObjects();
      if (!isCurrent(run)) {
        return;
      }

      const activeOrg = await fetchActiveOrg();
      if (!isCurrent(run)) {
        return;
      }

      const adminRank = await fetchAdminRank();
      if (!isCurrent(run)) {
        return;
      }
      const adminRoleCode = await fetchAdminRoleCode();
      if (!isCurrent(run)) {
        return;
      }
      const isTestRealm = await fetchTestRealm();`;

export function calibrateSequential(raw) {
  const blob = createHash('sha1').update(`blob ${raw.length}\0`).update(raw).digest('hex');
  assert.equal(blob, CURRENT_HOOK_BLOB, 'expected the exact reviewed bootstrap hook');
  const source = raw.toString('utf8');
  assert.equal(source.split(parallel).length, 2, 'parallel hunk must occur once');
  const variant = source.replace(parallel, sequential);
  assert.equal(variant.replace(sequential, parallel), source, 'the calibration may change only the PR87 hunk');
  return variant;
}

export function summarizeBootstrap(probes, readyAt) {
  assert.equal(probes.length, bootstrapProbes.size, 'exactly six requests before readiness');
  assert.deepEqual(new Set(probes.map((probe) => probe.name)), bootstrapProbes);
  assert.ok(probes.every(({ started, dispatched, received, delivered }) =>
    started <= dispatched && dispatched <= received && received <= delivered && delivered <= readyAt),
  'all six responses precede readiness');
  const first = Math.min(...probes.map((probe) => probe.started));
  const last = Math.max(...probes.map((probe) => probe.delivered));
  return {
    calls: probes.length,
    overlap: Math.max(...probes.map(({ started }) =>
      probes.filter((p) => p.started <= started && p.delivered > started).length)),
    batchMs: last - first,
    firstProbeToEditorMs: readyAt - first,
    trace: probes.map(({ name, started, dispatched, received, delivered }) => ({
      rpc: name, startMs: started - first, upstreamMs: received - dispatched, deliveredMs: delivered - first,
    })),
  };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2;
}

export async function testBootstrapTimings({ local, ...fixture }) {
  assert.equal(process.platform, 'linux', 'owned Linux runner required');
  const front = resolve(FRONT);
  const runnerTemp = realpathSync(process.env.RUNNER_TEMP);
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  for (const [file, pin] of Object.entries(RUNTIME_PINS)) {
    const actual = execFileSync('git', ['rev-parse', `${head}:${FRONT}/${file}`], { encoding: 'utf8' }).trim();
    assert.equal(actual, pin, `benchmark runtime pin: ${file}`);
  }
  const archive = execFileSync('git', ['archive', head, FRONT], { maxBuffer: 32 * 1024 * 1024 });
  const dependencies = realpathSync(join(front, 'node_modules'));
  const temporary = mkdtempSync(join(runnerTemp, 'bertel-fq03-'));
  const variants = {};
  try {
    for (const name of ['parallel', 'sequential']) {
      const parent = join(temporary, name);
      mkdirSync(parent);
      execFileSync('tar', ['-xf', '-', '-C', parent], { input: archive });
      const directory = join(parent, FRONT);
      const hook = join(directory, HOOK);
      const baseline = calibrateSequential(readFileSync(hook));
      if (name === 'sequential') writeFileSync(hook, baseline);
      symlinkSync(dependencies, join(directory, 'node_modules'), 'dir');
      variants[name] = directory;
    }
    const { testEditorRaces } = await import('./editor-races.mjs');
    const results = [];
    for (const variant of RUN_ORDER) {
      const samples = await testEditorRaces({
        local, ...fixture, benchmark: {
          directory: variants[variant], delays: [0, PROFILE_DELAY_MS, PROFILE_DELAY_MS, 0],
          probes: bootstrapProbes, summarize: summarizeBootstrap,
        },
      });
      for (const sample of samples) {
        assert.equal(sample.calls, bootstrapProbes.size);
        if (sample.delayMs) {
          if (variant === 'sequential') assert.equal(sample.overlap, 1, 'sequential negative control must never overlap');
          else assert.ok(sample.overlap > 1, 'parallel probes must overlap with controlled delay');
        }
        results.push({ variant, ...sample });
      }
    }
    const medians = ['sequential', 'parallel'].flatMap((variant) =>
      [0, PROFILE_DELAY_MS].map((delayMs) => {
        const group = results.filter((sample) => sample.variant === variant && sample.delayMs === delayMs);
        assert.equal(group.length, 4, 'same sample size for every measurement condition');
        return {
          variant, condition: delayMs === 0 ? 'loopback-observed' : 'controlled-response-delay',
          delayMs, samples: group.length, callsPerSample: bootstrapProbes.size,
          medianBatchMs: median(group.map((sample) => sample.batchMs)),
          medianFirstProbeToEditorMs: median(group.map((sample) => sample.firstProbeToEditorMs)),
          medianOverlap: median(group.map((sample) => sample.overlap)),
        };
      }));
    console.log(JSON.stringify({ witness: 'FQ03', source: head, hookBlob: CURRENT_HOOK_BLOB,
      transport: 'owned loopback; artificial response delay reported separately', medians, samples: results }));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
