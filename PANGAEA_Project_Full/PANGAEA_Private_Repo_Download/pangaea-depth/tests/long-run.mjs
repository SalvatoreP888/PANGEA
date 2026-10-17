import {Simulation} from '../src/sim.mjs';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const seed=Number(process.argv[2]||481217),years=Number(process.argv[3]||40);
const sim=new Simulation(seed),start=performance.now(),checkpoints=[];
for(let y=1;y<=years;y++){
 sim.advanceDays(360);const issues=sim.invariants();if(issues.length)throw new Error(JSON.stringify({y,issues}));
 if(y%10===0||y===years){const c={elapsedYears:y,day:sim.day,population:sim.alive.length,towns:sim.state.towns.length,...sim.state.totals,issues};checkpoints.push(c);console.log(c);}
 if(seed===481217&&(y===1||y===30||y===40))writeFileSync(root+`saves/seed-${seed}-after-${y}-years.json`,JSON.stringify(sim.snapshot()));
}
const report={seed,years,elapsedMs:Math.round(performance.now()-start),node:process.version,checkpoints};
writeFileSync(root+`tests/scenario-${seed}.json`,JSON.stringify(report,null,2));
console.log('Finished',report.elapsedMs,'ms');
