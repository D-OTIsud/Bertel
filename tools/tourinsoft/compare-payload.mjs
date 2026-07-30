#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const inputArg = process.argv.find((arg) => arg.startsWith('--input='));
if (!inputArg) {
  console.error('Usage: node tools/tourinsoft/compare-payload.mjs --input=<payload.json>');
  process.exit(2);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') {
      value += '"'; index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(value); value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
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

function leafPaths(value, prefix = '') {
  if (value === null || typeof value !== 'object') return [prefix];
  if (Array.isArray(value)) return value.flatMap((item) => leafPaths(item, prefix));
  return Object.entries(value).flatMap(([key, child]) => leafPaths(child, prefix ? `${prefix}.${key}` : key));
}

function extractDocuments(payload) {
  if (Array.isArray(payload?.data)) return payload.data.map((item) => item?.tourinsoft).filter(Boolean);
  if (payload?.data?.tourinsoft) return [payload.data.tourinsoft];
  if (payload?.tourinsoft) return [payload.tourinsoft];
  return payload && typeof payload === 'object' ? [payload] : [];
}

const root = process.cwd();
const contractDir = path.join(root, 'docs', 'integrations', 'tourinsoft', 'reunion-hebergement-v1');
const mappings = parseCsv(fs.readFileSync(path.join(contractDir, 'field-mapping.csv'), 'utf8'));
const approved = mappings.filter((row) => row.review_status === 'approved');
const allowedPaths = new Set(approved.map((row) =>
  row.tourinsoft_collection
    ? `${row.tourinsoft_collection}.${row.tourinsoft_field}`
    : row.tourinsoft_field,
));
const allowedCollections = new Set(approved.map((row) => row.tourinsoft_collection).filter(Boolean));
const allowedRootKeys = new Set(approved
  .filter((row) => !row.tourinsoft_collection)
  .map((row) => row.tourinsoft_field.split('.')[0]));

const inputPath = path.resolve(root, inputArg.slice('--input='.length));
const documents = extractDocuments(JSON.parse(fs.readFileSync(inputPath, 'utf8')));
if (!documents.length) {
  console.error('No Tourinsoft document found in the payload');
  process.exit(1);
}

const errors = [];
documents.forEach((document, documentIndex) => {
  for (const [key, value] of Object.entries(document)) {
    if (allowedCollections.has(key)) {
      if (!Array.isArray(value)) {
        errors.push(`document[${documentIndex}].${key}: expected an array`);
        continue;
      }
    } else if (!allowedRootKeys.has(key)) {
      errors.push(`document[${documentIndex}].${key}: not approved by the contract`);
    }
  }
  for (const leafPath of leafPaths(document)) {
    if (leafPath && !allowedPaths.has(leafPath)) {
      errors.push(`document[${documentIndex}].${leafPath}: field is pending CRT, excluded or unknown`);
    }
  }
});

if (errors.length) {
  console.error([...new Set(errors)].join('\n'));
  process.exit(1);
}

console.log(`Tourinsoft payload OK: ${documents.length} document(s), approved fields only`);
