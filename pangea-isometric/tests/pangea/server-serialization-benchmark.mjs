/** Paired server read/storage benchmark. Creates only disposable worlds and
 * databases, never loads a user database or modifies a saved fixture. */
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {mkdtempSync,rmSync,writeFileSync,readFileSync,mkdirSync} from 'node:fs';
import {tmpdir,cpus,platform} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

const usage='Usage: node tests/pangea/server-serialization-benchmark.mjs --baseline archived-app-directory [--out report.json]';
const options={},args=process.argv.slice(2);
for(let i=0;i<args.length;i+=2){
  if(!['--baseline','--out'].includes(args[i])||!args[i+1])throw new Error(usage);
  options[args[i].slice(2)]=resolve(args[i+1]);
}
if(!options.baseline)throw new Error(usage);
const root=fileURLToPath(new URL('../..',import.meta.url));
const sha=value=>createHash('sha256').update(value).digest('hex');
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
async function implementation(directory){
  const {createWorldServer}=await import(pathToFileURL(resolve(directory,'server/app.mjs')));
  const {openWorldStore}=await import(pathToFileURL(resolve(directory,'server/store.mjs')));
  return {server:createWorldServer,store:openWorldStore};
}
const implementations={baseline:await implementation(options.baseline),candidate:await implementation(root)};
// Both implementations receive the very same immutable baseline-built fixture.
// No simulation stepping is included in either timed workload.
const {Simulation}=await import(pathToFileURL(resolve(options.baseline,'src/pangea/simulation/sim.mjs')));
const {createCityLaboratory}=await import(pathToFileURL(resolve(options.baseline,'src/pangea/simulation/scenarios.mjs')));
const sourceHashes=directory=>Object.fromEntries(['server/app.mjs','server/store.mjs'].map(file=>[file,sha(readFileSync(resolve(directory,file)))]));
const order=['baseline','candidate','candidate','baseline','baseline','candidate'];
const report={node:process.version,platform:platform(),cpu:cpus()[0]?.model,measuredAt:new Date().toISOString(),
  baselineSources:sourceHashes(options.baseline),candidateSources:sourceHashes(root),
  method:'Three paired samples per implementation in alternating order. Paused localhost HTTP reads include complete response text transfer; exclude setup, warmup and JSON verification. Durable commits include unchanged full-world JSON and SQLite WAL/FULL checkpoint writes; exclude fixture/load/warmup and verification. Constructed snapshots are identical baseline inputs, no simulation stepping is timed. Not a full-tick throughput or client-validation benchmark.',measurements:[]};

for(const population of [240,2000]){
  const snapshot=createCityLaboratory(481217,population).snapshot(),json=JSON.stringify(snapshot),expected=sha(json);
  const row={population,snapshotBytes:Buffer.byteLength(json),snapshotSha256:expected,readsPerSample:8,commitsPerSample:8,
    baselineReadMs:[],candidateReadMs:[],baselineCommitMs:[],candidateCommitMs:[],exactPayloadSnapshots:true,exactDurableSnapshots:true};
  for(const name of order){
    const impl=implementations[name],app=impl.server({dbPath:':memory:',tickIntervalMs:100000,now:()=>1000000});
    try{
      const {port}=await app.start({port:0}),url=`http://127.0.0.1:${port}`;
      const response=await fetch(url+'/api/worlds',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({snapshot})});
      assert.equal(response.status,201);const created=await response.json();assert.equal(sha(JSON.stringify(created.snapshot)),expected);
      const read=()=>fetch(url+'/api/worlds/'+created.worldId,{headers:{Authorization:'Bearer '+created.token}}).then(async response=>{assert.equal(response.status,200);return response.text();});
      for(let i=0;i<2;i++)await read();
      const bodies=[],start=performance.now();
      for(let i=0;i<row.readsPerSample;i++)bodies.push(await read());
      const ms=performance.now()-start;row[name+'ReadMs'].push(ms);
      for(const body of bodies){const data=JSON.parse(body);assert.equal(sha(JSON.stringify(data.snapshot)),expected);assert.equal(data.revision,1);assert.equal(data.paused,true);assert.equal('token' in data,false);}
      console.log(`${population} ${name} complete HTTP reads: ${ms.toFixed(2)} ms (${row.readsPerSample})`);
    }finally{await app.stop();}

    const folder=mkdtempSync(join(tmpdir(),'pangea-serialization-bench-')),dbPath=join(folder,'worlds.sqlite');
    let store;
    try{
      store=impl.store(dbPath);
      const sim=Simulation.fromSnapshot(snapshot);
      const record={id:'a'.repeat(32),token_hash:sha('test-only'),snapshot:JSON.stringify(sim.snapshot()),revision:1,paused:1,speed:16,wallclock:1000000,pending:0,saved_at:1000000};
      const entry=store.create(record,sim);store.commit(entry,{saved_at:1000001});
      const start=performance.now();
      for(let i=0;i<row.commitsPerSample;i++)store.commit(entry,{saved_at:1000002+i});
      const ms=performance.now()-start;row[name+'CommitMs'].push(ms);
      assert.equal(sha(entry.row.snapshot),expected);assert.equal(entry.row.revision,row.commitsPerSample+2);
      const db=new DatabaseSync(dbPath,{readOnly:true});
      try{assert.equal(sha(db.prepare('SELECT snapshot FROM worlds').get().snapshot),expected);assert.equal(db.prepare('SELECT count(*) AS n FROM world_checkpoints').get().n,3);}finally{db.close();}
      console.log(`${population} ${name} durable full-world commits: ${ms.toFixed(2)} ms (${row.commitsPerSample})`);
    }finally{store?.close();rmSync(folder,{recursive:true,force:true});}
  }
  row.baselineReadMedianMs=median(row.baselineReadMs);row.candidateReadMedianMs=median(row.candidateReadMs);row.readSpeedup=row.baselineReadMedianMs/row.candidateReadMedianMs;
  row.baselineCommitMedianMs=median(row.baselineCommitMs);row.candidateCommitMedianMs=median(row.candidateCommitMs);row.commitSpeedup=row.baselineCommitMedianMs/row.candidateCommitMedianMs;
  report.measurements.push(row);
}
if(options.out){mkdirSync(dirname(options.out),{recursive:true});writeFileSync(options.out,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report,null,2));
