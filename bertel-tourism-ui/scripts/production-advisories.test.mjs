import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ADVISORY } from './build-maplibre-backport.mjs';
import { evaluateProductionAudit } from './check-production-advisories.mjs';

function report(...issues) {
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: issues.length };
  for (const issue of issues) counts[issue.severity] += 1;
  return { auditReportVersion: 2, vulnerabilities: Object.fromEntries(issues.map((issue) => [issue.name, issue])),
    metadata: { vulnerabilities: counts } };
}

const backport = {
  name: 'maplibre-gl', severity: 'critical', isDirect: true,
  via: [{ name: 'maplibre-gl', severity: 'critical', url: 'https://github.com/advisories/' + ADVISORY }],
  nodes: ['node_modules/maplibre-gl'],
};

test('a valid clean report or a lower-severity finding needs no exception', () => {
  assert.equal(evaluateProductionAudit(report(), 0).verifyMapLibreBackport, false);
  assert.equal(evaluateProductionAudit(report({ name: 'fixture', severity: 'moderate' }), 1).counts.moderate, 1);
});

test('the exact MapLibre advisory requires installed artifact verification', () => {
  assert.equal(evaluateProductionAudit(report(backport), 1).verifyMapLibreBackport, true);
});

test('an unrelated high-severity finding is blocked alongside the backport', () => {
  assert.throws(() => evaluateProductionAudit(report(backport, { name: 'fixture', severity: 'high' }), 1), /Unreviewed/);
});

test('additional findings and nested MapLibre copies cannot use the exception', () => {
  assert.throws(() => evaluateProductionAudit(report({ ...backport, via: [...backport.via, 'fixture'] }), 1), /Unreviewed/);
  assert.throws(() => evaluateProductionAudit(report({ ...backport, nodes: ['node_modules/fixture/node_modules/maplibre-gl'] }), 1), /Unreviewed/);
  assert.throws(() => evaluateProductionAudit(report({ ...backport,
    via: [{ ...backport.via[0], url: 'https://github.com/advisories/GHSA-test-test-test' }] }), 1), /Unreviewed/);
});

test('invalid, failed, and inconsistent reports are blocked', () => {
  assert.throws(() => evaluateProductionAudit({ error: {} }, 1), /Invalid npm audit report/);
  assert.throws(() => evaluateProductionAudit(report(), 1), /exit status/);
  assert.throws(() => evaluateProductionAudit(report(backport), 2), /exit status/);
  const inconsistent = report();
  inconsistent.metadata.vulnerabilities.critical = 1;
  assert.throws(() => evaluateProductionAudit(inconsistent, 0), /Inconsistent/);
});
