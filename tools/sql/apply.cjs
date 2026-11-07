#!/usr/bin/env node
/* Applique un fichier SQL a la base live via node-pg.
 *
 * Usage: node tools/sql/apply.cjs <fichier.sql> [--dry-run]
 *   --dry-run : execute tout puis ROLLBACK (le COMMIT final du fichier est neutralise).
 *
 * psql n'est pas installe sur ce poste (cf. tools/db-graph/README) — d'ou ce
 * runner. Il n'execute qu'UN fichier : les meta-commandes psql (\set, \echo, \ir)
 * sont retirees, il ne remplace donc pas ci_fresh_apply.sql.
 *
 * Creds : .env.schemaspy a la racine du depot (jamais commitee).
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadEnv() {
  const candidates = [
    path.resolve(process.cwd(), '.env.schemaspy'),
    path.resolve(process.cwd(), '../../../.env.schemaspy'),
    'C:/Users/dphil/Bertel3.0/.env.schemaspy',
  ];
  for (const f of candidates) {
    if (!fs.existsSync(f)) continue;
    const env = {};
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    return env;
  }
  throw new Error('.env.schemaspy introuvable');
}

(async () => {
  const file = process.argv[2];
  const dry = process.argv.includes('--dry-run');
  if (!file) {
    console.error('usage: apply.cjs <fichier.sql> [--dry-run]');
    process.exit(2);
  }

  let sql = fs.readFileSync(file, 'utf8');

  // Meta-commandes psql : pas du SQL, le protocole les rejette.
  sql = sql
    .split(/\r?\n/)
    .filter(function (l) { return !/^\s*\\/.test(l); })
    .join('\n');

  // Le fichier porte son propre BEGIN/COMMIT ; en dry-run on remplace le COMMIT
  // final par un ROLLBACK pour valider la totalite sans rien laisser derriere.
  if (dry) sql = sql.replace(/^COMMIT;\s*$/m, 'ROLLBACK;');

  const env = loadEnv();
  const client = new Client({
    host: env.SCHEMASPY_HOST || env.PGHOST,
    port: Number(env.SCHEMASPY_PORT || env.PGPORT || 5432),
    user: env.SCHEMASPY_USER || env.PGUSER,
    password: env.SCHEMASPY_PASSWORD || env.PGPASSWORD,
    database: env.SCHEMASPY_DB || env.PGDATABASE || 'postgres',
    ssl: { rejectUnauthorized: false },
    statement_timeout: 600000,
  });

  client.on('notice', (n) => console.log('  NOTICE:', n.message));
  await client.connect();
  try {
    await client.query(sql);
    console.log(dry ? 'DRY-RUN OK (annule)' : 'APPLIQUE');
  } catch (e) {
    console.error('ECHEC:', e.message);
    if (e.position) {
      const p = Number(e.position);
      console.error('  contexte:', JSON.stringify(sql.slice(Math.max(0, p - 250), p + 250)));
    }
    if (e.where) console.error('  where:', e.where);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
