import {Simulation} from '../src/sim.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
const root=new URL('../',import.meta.url),startName='seed-481217-after-40-years.json';
const sim=Simulation.fromSnapshot(JSON.parse(readFileSync(new URL('saves/'+startName,root))));
const began=performance.now(),checkpoints=[];
for(let y=41;y<=60;y++){
  sim.advanceDays(360);const issues=sim.invariants();if(issues.length)throw new Error(JSON.stringify({y,issues}));
  if(y%5===0){const row={elapsedYears:y,population:sim.alive.length,towns:sim.state.towns.length,...sim.state.totals,issues};checkpoints.push(row);console.log(row);}
}
writeFileSync(new URL('tests/continuation-60-years.json',root),JSON.stringify({startCheckpoint:startName,elapsedMs:Math.round(performance.now()-began),checkpoints},null,2));
