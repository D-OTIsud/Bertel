/** Existing security suites against the render candidate; every write rolls back.
 * Requires --run and the same explicitly asserted project as render validation.
 * Database output is deliberately limited to pass/count (no fixture data/errors).
 */
const fs = require('node:fs');
const assert = require('node:assert/strict');

// Split only SQL-level statements. Dollar-quoted DO/function bodies, strings,
// quoted identifiers, nested comments and their semicolons remain unchanged.
// Masking quoted/comment text lets us recognize transaction wrappers without
// touching PL/pgSQL BEGIN/ROLLBACK or text containing those words.
function prepareSuite(source) {
  let state = 'normal', dollar = '', depth = 0, start = 0, mask = '', i = 0;
  const statements = [];
  let psqlLines = 0, beginCount = 0, rollbackCount = 0;
  function emit(end) {
    const keyword = mask.replace(/;\s*$/, '').trim().replace(/\s+/g, ' ').toUpperCase();
    if (/^BEGIN(?: WORK| TRANSACTION)?$/.test(keyword)) beginCount++;
    else if (/^ROLLBACK(?: WORK| TRANSACTION)?$/.test(keyword)) rollbackCount++;
    else {
      assert(!/^(?:COMMIT|END|ABORT|START TRANSACTION|SAVEPOINT|RELEASE|ROLLBACK)\b/.test(keyword),
        'Unexpected top-level transaction control in suite');
      statements.push(source.slice(start, end));
    }
    start = end; mask = '';
  }
  while (i < source.length) {
    const ch = source[i], next = source[i + 1];
    if (state === 'line') {
      if (ch === '\n') { state = 'normal'; mask += '\n'; }
      i++; continue;
    }
    if (state === 'block') {
      if (ch === '/' && next === '*') { depth++; i += 2; }
      else if (ch === '*' && next === '/') { if (--depth === 0) state = 'normal'; i += 2; }
      else i++;
      continue;
    }
    if (state === 'dollar') {
      if (source.startsWith(dollar, i)) { i += dollar.length; state = 'normal'; }
      else i++;
      continue;
    }
    if (state === 'single' || state === 'double') {
      const quote = state === 'single' ? "'" : '"';
      if (ch === quote && next === quote) i += 2;
      else if (ch === quote) { state = 'normal'; i++; }
      else if (state === 'single' && ch === '\\') i += 2;
      else i++;
      continue;
    }
    // psql commands are whole physical lines, only outside SQL literals/bodies.
    if ((i === 0 || source[i - 1] === '\n') && /^[ \t]*\\/.test(source.slice(i))) {
      const end = source.indexOf('\n', i);
      const until = end === -1 ? source.length : end;
      // Keep offsets stable, and retain comments/SQL accumulated before the line.
      source = source.slice(0, i) + ' '.repeat(until - i) + source.slice(until);
      psqlLines++; i = until; continue;
    }
    if (ch === '-' && next === '-') { state = 'line'; mask += ' '; i += 2; continue; }
    if (ch === '/' && next === '*') { state = 'block'; depth = 1; mask += ' '; i += 2; continue; }
    if (ch === "'") { state = 'single'; mask += ' quoted '; i++; continue; }
    if (ch === '"') { state = 'double'; mask += ' quoted '; i++; continue; }
    if (ch === '$') {
      const match = source.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/);
      if (match) { dollar = match[0]; state = 'dollar'; mask += ' body '; i += dollar.length; continue; }
    }
    mask += ch; i++;
    if (ch === ';') emit(i);
  }
  assert(state === 'normal' || state === 'line', 'Unterminated SQL lexical construct');
  if (start < source.length) emit(source.length);
  assert.equal(beginCount, 1, 'Expected exactly one top-level BEGIN');
  assert.equal(rollbackCount, 1, 'Expected exactly one top-level ROLLBACK');
  const sql = statements.join('');
  assert(/\bDO\s+\$/.test(sql), 'Suite must retain executable assertions');
  return {sql, psqlLines, beginCount, rollbackCount};
}

const suiteNames = [
  'test_partner_identity_gate', 'test_read_gate_setbased', 'test_actor_email_realm',
  'test_actor_test_realm', 'test_actor_contacts_org_gate',
];
module.exports = {prepareSuite, suiteNames};

async function run() {
  const {Client} = require('pg');
  const read = path => fs.readFileSync(path, 'utf8');
  const env = Object.fromEntries(read('.env.schemaspy').split(/\r?\n/)
    .filter(line => /^PG[A-Z]+=/.test(line)).map(line => {
      const i = line.indexOf('=');
      return [line.slice(0, i), line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')];
    }));
  assert.equal(env.PGUSER, 'postgres.ryycrdhlkmzpxwwwwupy', 'Unexpected target');
  const c = new Client({host:env.PGHOST, port:+env.PGPORT, database:env.PGDATABASE,
    user:env.PGUSER, password:env.PGPASSWORD, ssl:{rejectUnauthorized:false}, connectionTimeoutMillis:10000});
  const catalogue = "SELECT pg_get_functiondef(oid) AS def,prosrc,prosecdef,provolatile,proconfig,proacl::text,proowner FROM pg_proc WHERE oid='api.get_object_resource(text,text[],text,jsonb)'::regprocedure";
  const metadata = ({def, prosrc, ...rest}) => rest;
  // Parse all suites before connecting: malformed wrappers must fail before DDL.
  const suites = suiteNames.map(name => prepareSuite(read(`Base de donnée DLL et API/tests/${name}.sql`)).sql);
  let original, count = 0, failed = false, phase = 'connect', failure;
  try {
    await c.connect();
    await c.query("BEGIN; SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='30s'; SET LOCAL plpgsql.check_asserts=on");
    original = (await c.query(catalogue)).rows[0];
    phase = 'candidate migration';
    await c.query(read('supabase/migrations/20261019151241_partner_resource_render_reuse.sql'));
    const candidate = (await c.query(catalogue)).rows[0];
    assert.deepEqual(metadata(candidate), metadata(original), 'Candidate security metadata changed');
    for (const [index, sql] of suites.entries()) {
      phase = suiteNames[index];
      await c.query('SAVEPOINT render_security_suite');
      try {
        await c.query({text:sql, query_timeout:30000});
        count++;
      } finally {
        // Restores role, claims, GUCs and fixture writes even if a suite fails.
        await c.query('ROLLBACK TO SAVEPOINT render_security_suite');
        await c.query('RELEASE SAVEPOINT render_security_suite');
      }
      assert.deepEqual((await c.query(catalogue)).rows[0], candidate, 'Suite changed candidate definition or metadata');
    }
  } catch (error) {
    failed = true;
    failure = {phase, code:error.code || 'VALIDATION_ERROR'};
  } finally {
    try {
      await c.query('ROLLBACK');
      if (original) assert.deepEqual((await c.query(catalogue)).rows[0], original, 'Original definition/metadata not restored');
    } catch (error) { failed = true; failure ||= {phase:'rollback verification',code:error.code || 'VALIDATION_ERROR'}; }
    await c.end().catch(() => { failed = true; });
  }
  console.log(JSON.stringify({pass:!failed && count === suiteNames.length, count, ...failure}));
  if (failed || count !== suiteNames.length) process.exitCode = 1;
}

if (require.main === module) {
  if (!process.argv.includes('--run')) console.log('Requires --run; no database connection made.');
  else run().catch(() => { console.log(JSON.stringify({pass:false,count:0})); process.exitCode = 1; });
}
