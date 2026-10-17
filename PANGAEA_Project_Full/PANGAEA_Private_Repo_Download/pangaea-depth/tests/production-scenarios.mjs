/** Natural growth only: no population or workshop inventory injection. */
import {Simulation} from '../src/sim.mjs';
import {YEAR} from '../src/data.mjs';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
const out=new URL('../EVIDENCE/logistics/',import.meta.url);mkdirSync(out,{recursive:true});
const report={buildSha256:createHash('sha256').update(readFileSync(new URL('../index.html',import.meta.url))).digest('hex'),ruleset:'realms-0.5',constructed:false,seeds:[]};
for(const seed of [481217,17,9901]){
 const sim=new Simulation(seed,{events:false}),start=performance.now(),entry={seed,checkpoints:[]};
 for(let year=10;year<=30;year+=10){sim.advanceDays(YEAR*10);const issues=sim.invariants();if(issues.length)throw Error(JSON.stringify(issues));entry.checkpoints.push({year,population:sim.alive.length,towns:sim.state.towns.length,births:sim.state.totals.births,deaths:sim.state.totals.deaths,foodDays:sim.foodDays(sim.town(1)),technologies:sim.town(1).knowledge.length,batches:sim.state.towns.flatMap(t=>t.buildings).reduce((n,b)=>n+(b.production?.batches||0),0),issues});}
 entry.elapsedMs=performance.now()-start;report.seeds.push(entry);console.log(JSON.stringify(entry));
 if(seed===481217)writeFileSync(new URL('../saves/logistics-seed-481217-after-30-years.json',import.meta.url),JSON.stringify(sim.snapshot()));
}
writeFileSync(new URL('natural-scenarios.json',out),JSON.stringify(report,null,2));
