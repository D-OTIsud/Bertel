/** Explicit live validation of admission only. Creates expiring, unusable-key fixtures,
 * removes them in finally, and reports timings/counts without credentials or identifiers.
 * Run from repository root: node tools/partner-admission-validation.cjs --run
 */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { Client } = require('pg');
if (!process.argv.includes('--run')) { console.log('Requires --run for live admission validation.'); process.exit(0); }
const env = Object.fromEntries(fs.readFileSync('.env.schemaspy','utf8').split(/\r?\n/)
  .filter(x=>/^PG[A-Z]+=/.test(x)).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1).trim().replace(/^['"]|['"]$/g,'')];}));
assert.equal(env.PGUSER,'postgres.ryycrdhlkmzpxwwwwupy','Unexpected database target');
const config={host:env.PGHOST,port:+env.PGPORT,database:env.PGDATABASE,user:env.PGUSER,
  password:env.PGPASSWORD,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000};
const admin=new Client(config);
const workers=[];
const ids=[];
const window=2147483647;
const report={kind:'live-postgres-admission-only',samples:5,results:{}};
async function fixture(){
  // Random SHA-shaped value without a corresponding raw API key; cannot be used over HTTP.
  const hash=randomBytes(32).toString('hex');
  const id=(await admin.query("INSERT INTO internal.partner_api_key(label,key_hash,key_prefix,expires_at) VALUES('__gateway_validation__',$1,'__test__',now()+interval '10 minutes') RETURNING id",[hash])).rows[0].id;
  ids.push(id);return {id,hash};
}
async function worker(){
  const c=new Client(config);workers.push(c);await c.connect();
  await c.query("SET ROLE service_role; SET statement_timeout='8s'; SET lock_timeout='3s'; SET request.jwt.claims='{\"role\":\"service_role\"}'");
  return c;
}
async function admission(c,f,limit=1000){
  const r=(await c.query('SELECT api.partner_admit($1,$2,$3) AS r',[f.hash,limit,window])).rows[0].r;
  assert.equal(r.ok,true);assert.equal(r.id,f.id);return r.rate;
}
function stats(values){const ordered=[...values].sort((a,b)=>a-b);return {median_ms:+ordered[2].toFixed(1),min_ms:+ordered[0].toFixed(1),max_ms:+ordered.at(-1).toFixed(1),samples_ms:values.map(x=>+x.toFixed(1))};}
(async()=>{
  await admin.connect();
  await admin.query("SET statement_timeout='8s'; SET lock_timeout='3s'");
  const f=await fixture();const c=await worker();
  const times={before:[],after:[]};
  for(let i=-1;i<5;i++){
    for(const phase of i%2 ? ['after','before'] : ['before','after']){
      const start=performance.now();
      if(phase==='before'){
        const auth=(await c.query('SELECT api.partner_authenticate($1) AS r',[f.hash])).rows[0].r;
        assert.equal(auth.ok,true);assert.equal(auth.id,f.id);
        const rate=(await c.query('SELECT api.partner_rate_check($1,$2,$3) AS r',[auth.id,1000,window])).rows[0].r;
        assert.equal(rate.allowed,true);
      }else assert.equal((await admission(c,f)).allowed,true);
      if(i>=0) times[phase].push(performance.now()-start);
    }
  }
  report.results={before:stats(times.before),after:stats(times.after)};
  assert.equal((await admin.query('SELECT sum(count)::int AS n FROM internal.partner_rate_bucket WHERE key_id=$1',[f.id])).rows[0].n,12);
  await admin.query('UPDATE internal.partner_api_key SET revoked_at=now() WHERE id=$1',[f.id]);
  assert.equal((await c.query('SELECT api.partner_admit($1) AS r',[f.hash])).rows[0].r.ok,false);
  assert.equal((await admin.query('SELECT sum(count)::int AS n FROM internal.partner_rate_bucket WHERE key_id=$1',[f.id])).rows[0].n,12);
  report.revocation_immediate=true;
  const concurrent=await fixture();
  const clients=[c,...await Promise.all([worker(),worker(),worker()])];
  const start=performance.now();
  const batches=await Promise.all(clients.map(async client=>{
    const rates=[];for(let i=0;i<3;i++)rates.push(await admission(client,concurrent,5));return rates;
  }));
  const rates=batches.flat();
  assert.equal(rates.filter(x=>x.allowed).length,5);
  assert.equal(rates.filter(x=>!x.allowed).length,7);
  assert.deepEqual(rates.filter(x=>x.allowed).map(x=>x.remaining).sort((a,b)=>a-b),[0,1,2,3,4]);
  assert(rates.filter(x=>!x.allowed).every(x=>x.remaining===0&&x.retry_after>0));
  assert.equal((await admin.query('SELECT sum(count)::int AS n FROM internal.partner_rate_bucket WHERE key_id=$1',[concurrent.id])).rows[0].n,12);
  report.concurrent={connections:4,requests:12,allowed:5,denied:7,counter:12,ms:Math.round(performance.now()-start)};
})().catch(e=>{console.error(JSON.stringify({validation:'failed',code:e.code??null,error:e.name}));process.exitCode=1;})
  .finally(async()=>{
    await Promise.allSettled(workers.map(c=>c.end()));
    try {
      if(ids.length){await admin.query('DELETE FROM internal.partner_api_key WHERE id=ANY($1::uuid[])',[ids]);
        assert.equal((await admin.query('SELECT count(*)::int AS n FROM internal.partner_api_key WHERE id=ANY($1::uuid[])',[ids])).rows[0].n,0);}
      report.fixtures_removed=true;
      if(!process.exitCode){fs.writeFileSync('.tmp_partner_admission_live_report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
    }catch(e){console.error(JSON.stringify({cleanup:'failed',code:e.code??null}));process.exitCode=1;}
    await admin.end();
  });
