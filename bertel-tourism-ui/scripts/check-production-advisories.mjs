import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ADVISORY } from './build-maplibre-backport.mjs';
import { verifyInstalled } from './verify-maplibre-backport.mjs';

const levels = ['info', 'low', 'moderate', 'high', 'critical'];

export function evaluateProductionAudit(report, auditStatus) {
  const issues = report?.vulnerabilities;
  assert.ok(report?.auditReportVersion === 2 && !report.error && issues
    && typeof issues === 'object' && !Array.isArray(issues), 'Invalid npm audit report');
  const entries = Object.entries(issues);
  assert.ok(auditStatus === 0 || (auditStatus === 1 && entries.length > 0), 'Unexpected npm audit exit status');

  const counts = Object.fromEntries(levels.map((level) => [level, 0]));
  let verifyMapLibreBackport = false;
  for (const [name, issue] of entries) {
    assert.ok(issue?.name === name && levels.includes(issue.severity), 'Invalid npm advisory entry');
    counts[issue.severity] += 1;
    if (issue.severity !== 'critical' && issue.severity !== 'high') continue;

    const advisory = issue.via?.[0];
    const isReviewedBackport = name === 'maplibre-gl' && issue.isDirect === true
      && issue.severity === 'critical' && Array.isArray(issue.nodes) && issue.nodes.length === 1
      && issue.nodes[0] === 'node_modules/maplibre-gl' && Array.isArray(issue.via) && issue.via.length === 1
      && advisory?.name === name && advisory.severity === 'critical'
      && advisory.url === 'https://github.com/advisories/' + ADVISORY;
    assert.ok(isReviewedBackport, 'Unreviewed high or critical production advisory: ' + JSON.stringify(name));
    verifyMapLibreBackport = true;
  }
  const reported = report.metadata?.vulnerabilities;
  assert.ok(reported?.total === entries.length && levels.every((level) => reported[level] === counts[level]),
    'Inconsistent npm audit counts');
  return { counts, verifyMapLibreBackport };
}

async function main() {
  let report;
  try {
    report = JSON.parse(await readFile(process.argv[2], 'utf8'));
  } catch {
    throw new Error('Missing or invalid npm audit JSON');
  }
  const result = evaluateProductionAudit(report, Number(process.argv[3]));
  const backport = result.verifyMapLibreBackport ? await verifyInstalled() : null;
  console.log(JSON.stringify({ counts: result.counts, backport }));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error('Production dependency audit failed: ' + error.message);
    process.exitCode = 1;
  });
}
