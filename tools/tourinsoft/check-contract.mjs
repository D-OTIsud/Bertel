#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dir = path.join(root, 'docs', 'integrations', 'tourinsoft', 'reunion-hebergement-v1');
const schema = JSON.parse(fs.readFileSync(path.join(dir, 'source-schema.json'), 'utf8'));

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') {
      value += '"'; i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(value); value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(value); value = '';
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
    } else {
      value += char;
    }
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  const [headers, ...body] = rows;
  return body.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])));
}

const mappings = parseCsv(fs.readFileSync(path.join(dir, 'field-mapping.csv'), 'utf8'));
const crosswalks = parseCsv(fs.readFileSync(path.join(dir, 'value-crosswalk.csv'), 'utf8'));
const expected = new Set(schema.object_fields.map((field) => `object.${field.name}`));
for (const [relation, data] of Object.entries(schema.relations)) {
  data.fields.forEach((field) => expected.add(`${relation}.${field.name}`));
}
const actual = new Set(mappings.map((row) => `${row.tourinsoft_collection || 'object'}.${row.tourinsoft_field}`));
const missing = [...expected].filter((key) => !actual.has(key));
const extra = [...actual].filter((key) => !expected.has(key));
const invalidStatus = mappings.filter((row) => !['approved', 'pending_crt', 'excluded'].includes(row.review_status));
const invalidApproved = mappings.filter((row) => row.review_status === 'approved' && (!row.bertel_table || !row.bertel_field || !row.transform));
const crosswalkKeys = new Set(crosswalks.filter((row) => row.review_status === 'approved').map((row) => row.domain));
const missingCrosswalk = mappings.filter((row) => row.review_status === 'approved' && row.crosswalk_domain && !crosswalkKeys.has(row.crosswalk_domain));
const duplicateScalarTargets = [];
const seen = new Set();
for (const row of mappings.filter((item) => item.review_status === 'approved' && item.cardinality === '0..1')) {
  const key = `${row.tourinsoft_collection}.${row.tourinsoft_field}`;
  if (seen.has(key)) duplicateScalarTargets.push(key);
  seen.add(key);
}

const errors = [
  ...missing.map((value) => `missing mapping: ${value}`),
  ...extra.map((value) => `unknown mapping: ${value}`),
  ...invalidStatus.map((row) => `invalid review status: ${row.tourinsoft_field}`),
  ...invalidApproved.map((row) => `approved mapping without source/transform: ${row.tourinsoft_field}`),
  ...missingCrosswalk.map((row) => `approved mapping without crosswalk domain data: ${row.crosswalk_domain}`),
  ...duplicateScalarTargets.map((value) => `duplicate scalar target: ${value}`),
];

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

const summary = mappings.reduce((acc, row) => {
  acc[row.review_status] = (acc[row.review_status] ?? 0) + 1;
  return acc;
}, {});
console.log(`Tourinsoft contract OK: ${mappings.length} fields classified (${JSON.stringify(summary)}), ${crosswalks.length} value crosswalks`);
