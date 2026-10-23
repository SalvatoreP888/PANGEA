/** Compare complete worlds against an archived checkout; never modifies saves.
 * Timings exclude construction, hashing, validation and save/load. Constructed
 * cities measure scale, not natural growth. No baseline means no speedup claim. */
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import os from 'node:os';

const root=fileURLToPath(new URL('..',import.meta.url));
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){
  if(!['--baseline','--out'].includes(args[i])||!args[i+1])throw new Error('Usage: node tests/optimization-benchmark.mjs [--baseline archived-app-directory] [--out report.json]');
  options[args[i].slice(2)]=resolve(args[i+1]);
}
const sha=value=>createHash('sha256').update(value).digest('hex');
const snapshotHash=sim=>sha(JSON.stringify(sim.snapshot()));
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
function sourceHash(directory){
  const digest=createHash('sha256');
  for(const name of readdirSync(resolve(directory,'src')).filter(name=>name.endsWith('.mjs')).sort()){
    digest.update(name);digest.update('\0');digest.update(readFileSync(resolve(directory,'src',name)));
  }
  return digest.digest('hex');
}
async function implementation(directory){
  const {Simulation}=await import(pathToFileURL(resolve(directory,'src/sim.mjs')));
  const {createCityLaboratory}=await import(pathToFileURL(resolve(directory,'src/scenarios.mjs')));
  return {Simulation,createCityLaboratory};
}
const candidate=await implementation(root),baseline=options.baseline?await implementation(options.baseline):null;
const report={
  measuredAt:new Date().toISOString(),node:process.version,platform:os.platform(),cpu:os.cpus()[0]?.model,
  availableParallelism:os.availableParallelism(),buildSha256:sha(readFileSync(resolve(root,'index.html'))),
  sourceSha256:sourceHash(root),baseline:baseline?{sourceSha256:sourceHash(options.baseline),buildSha256:sha(readFileSync(resolve(options.baseline,'index.html')))}:null,
  method:'Three samples per implementation, alternating baseline/candidate order in one process after warm-up. Complete snapshot SHA-256 equality, invariant and exact save/resume checks are outside the timed section.',
  measurements:[],parity:[]
};
for(const impl of [baseline,candidate].filter(Boolean))impl.createCityLaboratory(481217,250).advanceDays(5);
for(const population of [4,250,1000,2000]){
  const days=population===4?30:3;
  const row={kind:population===4?'natural four-founder opening':'constructed city',population,days,ticks:days*4,baselineMs:[],candidateMs:[]};
  const order=baseline?['baseline','candidate','candidate','baseline','baseline','candidate']:['candidate','candidate','candidate'];
  let expected;
  for(const name of order){
    const impl=name==='baseline'?baseline:candidate;
    const sim=population===4?new impl.Simulation(481217,{events:false}):impl.createCityLaboratory(481217,population);
    const start=performance.now();sim.advanceDays(days);const ms=performance.now()-start;
    row[`${name}Ms`].push(ms);const checksum=snapshotHash(sim);expected??=checksum;
    assert.equal(checksum,expected,`Complete-world mismatch: ${population} people, ${name}`);
    assert.deepEqual(sim.invariants(),[],`Invariant failure: ${population} people, ${name}`);
    const resumed=impl.Simulation.fromSnapshot(sim.snapshot());sim.advanceDays(2);resumed.advanceDays(2);
    assert.equal(snapshotHash(resumed),snapshotHash(sim),`Save/resume mismatch: ${population} people, ${name}`);
    console.log(`${population} people, ${name}: ${ms.toFixed(1)} ms; exact state/resume`);
  }
  row.candidateMedianMs=median(row.candidateMs);row.snapshotSha256=expected;row.exactSaveResume=true;row.invariantIssues=[];
  if(baseline){row.baselineMedianMs=median(row.baselineMs);row.speedup=row.baselineMedianMs/row.candidateMedianMs;row.exactBaselineSnapshot=true;}
  report.measurements.push(row);
}
if(baseline){
  const fixture=name=>JSON.parse(readFileSync(resolve(root,'saves',name),'utf8'));
  const cases=[
    ...[481217,17,9901].map(seed=>({name:`natural seed ${seed}, events enabled`,days:720,make:impl=>new impl.Simulation(seed,{events:true})})),
    {name:'Realms 0.5 natural 30-year save',days:180,make:impl=>impl.Simulation.fromSnapshot(fixture('logistics-seed-481217-after-30-years.json'))},
    {name:'Legacy v2 40-year save migration',days:45,make:impl=>impl.Simulation.fromSnapshot(fixture('seed-481217-after-40-years.json'))},
    {name:'Cities century save migration',days:15,make:impl=>impl.Simulation.fromSnapshot(fixture('cities-seed-481217-after-100-years.json'))},
    {name:'Constructed scarcity, illness, interrupted work, death and paving',days:10,make:impl=>{
      const sim=impl.createCityLaboratory(17,250);sim.advanceDays(3);sim.state.options.events=true;
      for(const t of sim.state.towns){
        t.res.food=t.res.meals=t.res.bread=0;
        for(let i=0;i<t.land.streets.length;i++)if(t.land.streets[i])t.land.streets[i]=3;
        t.land.navRevision++;
      }
      for(const [i,p]of sim.alive.entries())if(i%11===0){p.sick=20;p.needs.food=0;p.task=null;if(i%33===0)p.health=.1;}
      return sim;
    }}
  ];
  for(const scenario of cases){
    const a=scenario.make(baseline),b=scenario.make(candidate);
    assert.equal(snapshotHash(a),snapshotHash(b),`Initial/migration mismatch: ${scenario.name}`);
    a.advanceDays(scenario.days);b.advanceDays(scenario.days);
    assert.equal(snapshotHash(a),snapshotHash(b),`Continuation mismatch: ${scenario.name}`);
    assert.deepEqual(b.invariants(),[],scenario.name);
    const resumed=candidate.Simulation.fromSnapshot(b.snapshot());b.advanceDays(2);resumed.advanceDays(2);a.advanceDays(2);
    assert.equal(snapshotHash(resumed),snapshotHash(b),`Replay mismatch: ${scenario.name}`);
    assert.equal(snapshotHash(a),snapshotHash(b),`Resumed baseline mismatch: ${scenario.name}`);
    report.parity.push({name:scenario.name,days:scenario.days,exactBaselineSnapshot:true,exactSaveResume:true,invariantIssues:[],snapshotSha256:snapshotHash(b),living:b.alive.length,deaths:b.state.totals.deaths});
    console.log(`Exact baseline continuation and save/resume: ${scenario.name}`);
  }
}
if(options.out){mkdirSync(dirname(options.out),{recursive:true});writeFileSync(options.out,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report,null,2));
