/** Synthetic measurements are separate from natural-growth evidence. */
import {performance} from 'node:perf_hooks';
import {writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import os from 'node:os';
import {Simulation} from '../src/sim.mjs';
import {createCityLaboratory} from '../src/scenarios.mjs';
const report={node:process.version,platform:os.platform(),cpu:os.cpus()[0]?.model,availableParallelism:os.availableParallelism(),buildSha256:createHash('sha256').update(readFileSync(new URL('../index.html',import.meta.url))).digest('hex'),measurements:[]};
// Same opening-workload definition used in the baseline comparison (12 ticks).
for(const population of [4,250,1000,2000]){
 const runs=[];for(let r=0;r<3;r++){
  const sim=new Simulation(481217,{events:false}),t=sim.town(1);while(sim.state.people.length<population)sim.addPerson(t,{age:24});t.res.food=population*100;t.res.wood=t.res.stone=10000;
  const start=performance.now();sim.advanceDays(3);runs.push(performance.now()-start);if(sim.invariants().length)throw new Error('Opening workload invariant failure');
 }
 report.measurements.push({kind:'synthetic opening',population,ticks:12,ms:runs,medianMs:[...runs].sort((a,b)=>a-b)[1]});
}
for(const population of [250,1000,2000]){
 const sim=createCityLaboratory(481217,population),start=performance.now();sim.advanceDays(3);const ms=performance.now()-start;const issues=sim.invariants();if(issues.length)throw new Error(JSON.stringify(issues));
 const save=sim.snapshot(),loadStart=performance.now(),resumed=Simulation.fromSnapshot(save),loadMs=performance.now()-loadStart;
 sim.advanceDays(2);resumed.advanceDays(2);if(JSON.stringify(sim.snapshot())!==JSON.stringify(resumed.snapshot()))throw new Error(`City replay failed at ${population}`);
 report.measurements.push({kind:'constructed city',population,towns:sim.state.towns.length,buildings:sim.state.towns.reduce((n,t)=>n+t.buildings.length,0),ticks:12,ms,saveBytes:Buffer.byteLength(JSON.stringify(save)),loadMs,exactReplay:true,issues});
}
writeFileSync(new URL('../EVIDENCE/cities/benchmark.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
