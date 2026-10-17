/** Natural runs only: no grants, injected residents, or inherited sandbox state. */
import {Simulation} from '../src/sim.mjs';
import {writeFileSync,mkdirSync} from 'node:fs';
const seed=Number(process.argv[2]||481217),years=Number(process.argv[3]||20);
if(!Number.isInteger(seed)||seed<1||seed>2147483647||!Number.isInteger(years)||years<1||years>200)throw new Error('Use an integer seed and 1–200 years. Long runs are deliberately bounded.');
const sim=new Simulation(seed),start=performance.now(),checkpoints=[];
for(let year=1;year<=years;year++){
 sim.advanceDays(360);const issues=sim.invariants();if(issues.length)throw new Error(JSON.stringify({seed,year,issues}));
 if(year%10===0||year===years){const c={year,population:sim.alive.length,towns:sim.state.towns.length,technologies:sim.town(1).knowledge.length,beds:sim.capacity(sim.town(1)),foodDays:sim.foodDays(sim.town(1)),births:sim.state.totals.births,deaths:sim.state.totals.deaths,issues};checkpoints.push(c);console.log(c);}
}
const output=new URL('../EVIDENCE/cities/',import.meta.url);mkdirSync(output,{recursive:true});
const report={seed,years,constructed:false,ruleset:sim.state.ruleset,node:process.version,elapsedMs:performance.now()-start,checkpoints};
writeFileSync(new URL(`scenario-${seed}-${years}.json`,output),JSON.stringify(report,null,2));
if(process.argv.includes('--save'))writeFileSync(new URL(`scenario-${seed}-${years}-world.json`,output),JSON.stringify(sim.snapshot()));
