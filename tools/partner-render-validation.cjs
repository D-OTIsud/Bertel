/** Differential render validation on the existing database; all candidate DDL rolls back.
 * Run from repository root with --run. Reports only counts/timings, never resource payloads.
 */
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {Client}=require('pg');
if(!process.argv.includes('--run')){console.log('Requires --run; candidate changes are rolled back.');process.exit(0);}
const timingsOnly=process.argv.includes('--timings-only');
const env=Object.fromEntries(fs.readFileSync('.env.schemaspy','utf8').split(/\r?\n/).filter(x=>/^PG[A-Z]+=/.test(x)).map(x=>{const i=x.indexOf('=');return[x.slice(0,i),x.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}));
assert.equal(env.PGUSER,'postgres.ryycrdhlkmzpxwwwwupy','Unexpected target');
const c=new Client({host:env.PGHOST,port:+env.PGPORT,database:env.PGDATABASE,user:env.PGUSER,password:env.PGPASSWORD,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
const read=p=>fs.readFileSync(p,'utf8');
const migration=read('supabase/migrations/20261019151241_partner_resource_render_reuse.sql');
const rollback=read('Base de donnée DLL et API/rollback/rollback_partner_resource_render_reuse.sql');
const catalogue="SELECT pg_get_functiondef(oid) AS def,prosrc,prosecdef,provolatile,proconfig,proacl::text,proowner FROM pg_proc WHERE oid='api.get_object_resource(text,text[],text,jsonb)'::regprocedure";
const report={kind:timingsOnly?'same-snapshot-render-timings':'same-snapshot-render-differential',comparisons:0,benchmarks:[]};
c.on('notice',notice=>{const match=notice.message.match(/^PASS render reuse: (\d+) full JSON comparisons/);if(match)report.fixture_comparisons=Number(match[1]);});
let stage='connect';let original;
function metadata({def,prosrc,...rest}){return rest;}
async function compare(ids,lang,options){
  const r=(await c.query(`WITH compared AS MATERIALIZED (
    SELECT pg_temp.render_reuse_baseline(id,$2::text[],'none',$3::jsonb)::jsonb AS before,
           api.get_object_resource(id,$2::text[],'none',$3::jsonb)::jsonb AS after
    FROM unnest($1::text[]) AS ids(id))
    SELECT count(*)::int AS n,count(*) FILTER(WHERE before IS DISTINCT FROM after)::int AS different,
      count(*) FILTER(WHERE before IS NULL OR after IS NULL)::int AS missing FROM compared`,[ids,[lang],JSON.stringify(options)])).rows[0];
  assert.equal(r.n,ids.length,'corpus count changed');assert.equal(r.different,0,'JSON difference detected');assert.equal(r.missing,0,'unexpected missing resource');report.comparisons+=r.n;
}
async function timing(ids,options,baseline){
  const fn=baseline?'pg_temp.render_reuse_baseline':'api.get_object_resource';
  const r=await c.query(`EXPLAIN (ANALYZE, FORMAT JSON, TIMING OFF) SELECT jsonb_agg(${fn}(id,ARRAY['fr'],'none',$2::jsonb)::jsonb) FROM unnest($1::text[]) AS ids(id)`,[ids,JSON.stringify(options)]);
  return r.rows[0]['QUERY PLAN'][0]['Execution Time'];
}
function stats(values){const sorted=[...values].sort((a,b)=>a-b);return{median_ms:sorted[Math.floor(sorted.length/2)],min_ms:sorted[0],max_ms:sorted.at(-1),samples_ms:values};}
(async()=>{
  await c.connect();await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ; SET LOCAL lock_timeout='2s';SET LOCAL statement_timeout='8s'");
  original=(await c.query(catalogue)).rows[0];
  // Reproduce the old/new comparison after deployment too, without exposing the
  // predecessor outside this transaction or losing unrelated live changes.
  if(original.prosrc.includes('v_contact_lines JSONB;'))await c.query(rollback);
  const predecessor=(await c.query(catalogue)).rows[0];
  stage='baseline capture';await c.query(read('Base de donnée DLL et API/tests/fixtures/capture_render_reuse_baseline.sql'));
  await c.query('GRANT EXECUTE ON FUNCTION pg_temp.render_reuse_baseline(text,text[],text,jsonb) TO service_role');
  stage='migration';await c.query(migration);const candidate=(await c.query(catalogue)).rows[0];
  assert.deepEqual(metadata(candidate),metadata(original),'security metadata changed');
  await c.query(migration);assert.deepEqual((await c.query(catalogue)).rows[0],candidate,'migration is not idempotent');
  await c.query(rollback);assert.deepEqual((await c.query(catalogue)).rows[0],predecessor,'rollback differs from predecessor');
  await c.query(rollback);assert.deepEqual((await c.query(catalogue)).rows[0],predecessor,'rollback is not idempotent');
  await c.query(migration);report.migration_and_rollback_idempotent=true;report.metadata_preserved=true;
  if(!timingsOnly){
    stage='fixtures';await c.query("SET LOCAL statement_timeout='30s'");await c.query(read('Base de donnée DLL et API/tests/test_render_reuse.sql'));assert(report.fixture_comparisons>0,'fixture count missing');
  }
  const objects=(await c.query("SELECT id,object_type::text AS type FROM public.object WHERE status='published' AND NOT is_test ORDER BY id")).rows;
  report.objects=objects.length;report.types=[...new Set(objects.map(x=>x.type))].sort();
  await c.query("SET LOCAL ROLE service_role; SET LOCAL request.jwt.claims='{\"role\":\"service_role\"}';SET LOCAL statement_timeout='8s'");
  if(!timingsOnly){
  stage='full corpus';
  for(let i=0;i<objects.length;i+=20){await compare(objects.slice(i,i+20).map(x=>x.id),'fr',{});if(i%100===0)console.log(JSON.stringify({stage,checked:Math.min(i+20,objects.length),total:objects.length}));}
  const sample=report.types.flatMap(type=>objects.filter(x=>x.type===type).slice(0,3).map(x=>x.id));
  stage='language and options';
  for(const lang of ['en','zz'])for(let i=0;i<sample.length;i+=15)await compare(sample.slice(i,i+15),lang,{});
  for(const options of [{render:false},{fields:['capacity','amenities']},{fields:[]},{fields:['capacity','amenities'],render:false,include:['render']},{omit_empty:true}])
    for(let i=0;i<sample.length;i+=15)await compare(sample.slice(i,i+15),'fr',options);
  console.log(JSON.stringify({stage:'equivalence passed',objects:report.objects,comparisons:report.comparisons,types:report.types.length}));
  }
  const hlo=objects.filter(x=>x.type==='HLO').slice(0,50).map(x=>x.id);
  const act=objects.filter(x=>x.type==='ACT').slice(0,50).map(x=>x.id);
  const buckets=report.types.map(type=>objects.filter(x=>x.type===type));
  const mixed=[];
  for(let row=0;mixed.length<Math.min(50,objects.length);row++)for(const bucket of buckets){
    if(bucket[row]&&mixed.length<50)mixed.push(bucket[row].id);
  }
  const byId=new Map(objects.map(x=>[x.id,x.type]));
  stage='timings';
  for(const [name,ids,options] of [['hlo-full50',hlo,{}],['act-full50',act,{}],['mixed-full50',mixed,{}],['hlo-render-off50',hlo,{render:false}],['hlo-render-blocks50',hlo,{fields:['capacity','amenities','contacts','media']}]]){
    const before=[],after=[],pairedDeltaPct=[];
    for(let i=-1;i<7;i++){
      const pair={};
      for(const baseline of i%2?[false,true]:[true,false]){
        const ms=await timing(ids,options,baseline);pair[baseline?'before':'after']=ms;
        if(i>=0)(baseline?before:after).push(ms);
      }
      if(i>=0)pairedDeltaPct.push(100*(pair.after-pair.before)/pair.before);
    }
    const typeCounts={};for(const id of ids)typeCounts[byId.get(id)]=(typeCounts[byId.get(id)]??0)+1;
    const result={name,count:ids.length,type_counts:typeCounts,before:stats(before),after:stats(after),paired_delta_pct:pairedDeltaPct,
      median_paired_delta_pct:[...pairedDeltaPct].sort((a,b)=>a-b)[3],slower_pairs:pairedDeltaPct.filter(x=>x>0).length};
    report.benchmarks.push(result);console.log(JSON.stringify(result));
  }
  await c.query('ROLLBACK');assert.deepEqual((await c.query(catalogue)).rows[0],original,'live definition not restored');
  report.rolled_back=true;fs.writeFileSync(timingsOnly?'.tmp_partner_render_timings_report.json':'.tmp_partner_render_report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({validated:true,comparisons:report.comparisons,fixtures:report.fixture_comparisons,rolled_back:true}));
})().catch(e=>{console.error(JSON.stringify({stage,code:e.code??null,message:e.message.slice(0,240),position:e.internalPosition??e.position,context:e.internalQuery&&e.internalPosition?e.internalQuery.slice(Math.max(0,Number(e.internalPosition)-180),Number(e.internalPosition)+180):undefined}));process.exitCode=1;})
  .finally(async()=>{try{await c.query('ROLLBACK')}catch{}await c.end();});
