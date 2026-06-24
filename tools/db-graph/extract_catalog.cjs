#!/usr/bin/env node
/**
 * extract_catalog.cjs — run tools/db-graph/db_supplement_extract.sql against the live DB and
 * write its single JSON document to db-graph-out/catalog_extra.json.
 *
 *   node tools/db-graph/extract_catalog.cjs
 *
 * This is the psql-free replacement for the `psql -tAf db_supplement_extract.sql` step in
 * tools/db-graph/README.md: psql is not installed in this environment, but Node `pg` is, and the
 * pooler creds already live in .env.schemaspy. Writing the file locally also avoids the Supabase
 * MCP response-truncation risk on the large functions-with-bodies payload (~700 KB+).
 *
 * Reads pooler creds from .env.schemaspy (PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD).
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const repoRoot = path.resolve(__dirname, '..', '..');

function loadEnv() {
  const txt = fs.readFileSync(path.join(repoRoot, '.env.schemaspy'), 'utf8');
  const env = {};
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

async function main() {
  const sqlPath = path.join(__dirname, 'db_supplement_extract.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const outPath = path.join(repoRoot, 'db-graph-out', 'catalog_extra.json');

  const env = loadEnv();
  const client = new Client({
    host: env.PGHOST,
    port: parseInt(env.PGPORT || '5432', 10),
    database: env.PGDATABASE,
    user: env.PGUSER,
    password: env.PGPASSWORD,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 180000,
  });

  await client.connect();
  try {
    const res = await client.query(sql);
    const extra = res.rows[0].extra;
    fs.writeFileSync(outPath, JSON.stringify(extra), 'utf8');
    const c = (k) => (Array.isArray(extra[k]) ? extra[k].length : 0);
    console.log(
      `catalog_extra.json: ${c('functions')} functions, ${c('policies')} policies, ` +
      `${c('enums')} enums, ${c('partitions')} partitions, ${c('applicability')} applicability rows ` +
      `(${fs.statSync(outPath).size} bytes)`
    );
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
