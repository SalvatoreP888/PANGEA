import {GRID_W,GRID_H,walkable,entrance,clamp,townClimate} from './world.mjs';
import {DEFAULT_PLANET,RECIPES,RESOURCE_NAMES,planetSettings} from './data.mjs';
import {riverBank} from './city.mjs';
/** Only actual river/coastal habitat supports the town's renewable fish population. */
export function initializeEconomy(t) {
  for(const key of Object.keys(RESOURCE_NAMES))t.res[key]??=0;
  const water=t.land.tiles.filter(q=>['river','water','ford'].includes(q.type)).length;
  t.land.fishCapacity??=Math.max(80,Math.min(1400,water*1.8));
  t.land.fishStock??=t.land.fishCapacity;
}
export function economyActions(sim,p,t,add,jobs) {
  const pop=sim.residents(t).length;
  const landing=sim.buildings(t,'fishery')[0];
  if(landing&&t.land.fishStock>=1&&t.res.fish<Math.max(24,pop*3)&&sim.foodDays(t)<t.reserve*1.4&&jobs('fish')<Math.max(1,Math.ceil(pop/16)))add('fish',58+p.skills.foraging*2+(sim.foodDays(t)<12?50:0),'Catch finite river fish and carry them to storage.',{buildingId:landing.id});
  if(sim.buildings(t,'claypit').length&&t.res.clay<80&&jobs('clay')<Math.max(1,Math.ceil(pop/35)))add('clay',54+p.skills.forestry,'Extract clay for the brick kilns.');
}
export function fishWork(sim,p,t,rate) {
  const b=t.buildings.find(b=>b.id===p.task.buildingId&&b.type==='fishery'&&b.complete);
  if(!b||!riverBank(t,b.x,b.y))return;
  const catchSize=Math.min(t.land.fishStock,4*rate*(sim.knowledge(t,'aquaculture')?1.4:1));
  if(catchSize<=0)return;
  t.land.fishStock-=catchSize;p.carry.fish=(p.carry.fish||0)+catchSize;t.stats.foodProduced+=catchSize;
}
export function tickEconomy(sim,t) {
  const climate={...sim.state.planet,temperature:townClimate(sim.state.seed,t,sim.state.planet,sim.day,sim.state.generationVersion).temperature};
  const thermal=clamp(1-Math.abs(climate.temperature-14)/40,.12,1);
  const weather=t.weather.kind==='Storm'?.45:t.weather.kind==='Drought'?.25:1;
  const regen=thermal*climate.rainfall*weather*(sim.knowledge(t,'aquaculture')?2:1);
  t.land.fishStock=Math.min(t.land.fishCapacity,t.land.fishStock+regen*t.land.fishCapacity*.0025);
  for(const key of ['fish','bread']){
    const fraction=(key==='fish'?.006:.0015)*(sim.knowledge(t,'refrigeration')?.2:1);
    const lost=t.res[key]*fraction;t.res[key]-=lost;t.stats.waste+=lost;
    for(const b of t.buildings)if(b.production)for(const bin of [b.production.inputs,b.production.outputs])if(bin[key]){const lost=bin[key]*fraction;bin[key]-=lost;t.stats.waste+=lost;}
  }
  const winter=climate.temperature<7;
  if(winter){const amount=Math.min(t.res.cloth,sim.residents(t).length/900);if(amount>0){sim.transaction(t,'cloth',-amount,'Cloth worn for winter warmth');for(const p of sim.residents(t))p.needs.warmth=clamp(p.needs.warmth+amount/Math.max(1,sim.residents(t).length)*500,0,100);}}
}
export function cropClimate(planet) {
  const p=planet||DEFAULT_PLANET;
  return clamp(1-Math.abs(p.temperature-14)/35,.1,1)*p.fertility*clamp(p.rainfall,.3,1.5);
}
