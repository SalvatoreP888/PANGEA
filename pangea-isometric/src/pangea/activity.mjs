import {BUILDINGS,RECIPES} from './simulation/data.mjs';
import {entrance} from './simulation/world.mjs';
import {productionReady,productionFull} from './simulation/production.mjs';

// Presentation reads existing inventories and tasks. It never initializes buffers,
// credits a delivery, advances work, or creates an inhabitant.
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
export const inventoryUnits = inventory => Object.values(inventory || {}).reduce((n,value)=>n+positive(value),0);

export function carrierActivity(person) {
  const cargo=Object.entries(person.carry || {}).filter(([,value])=>positive(value)>0).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
  const units=inventoryUnits(person.carry);
  return {units,resource:cargo[0]?.[0]||null,loaded:units>0};
}

export function constructionPhase(building) {
  if(building.complete)return {phase:'complete',progress:1};
  if(!building.funded)return {phase:'planned',progress:0};
  const required=BUILDINGS[building.type]?.work;
  const progress=required>0?Math.min(1,positive(building.progress)/required):0;
  return {phase:progress<.25?'foundation':progress<.7?'frame':'roof',progress};
}

export function tripActivity(trip) {
  const mode=Number.isInteger(trip.mode)?Math.max(0,Math.min(4,trip.mode)):0;
  return {kind:mode>=3?'train':mode>=1?'cart':'foot',mode,cargoUnits:inventoryUnits(trip.cargo),passengers:Array.isArray(trip.people)?trip.people.length:0};
}

const buildingJobs=new Set(['build','farm','fish','craft','care',...Object.keys(RECIPES)]);

export function deriveTownActivity(town,residents) {
  const buildings=new Map(),carriers=new Map();
  const byId=new Map(town.buildings.map(building=>[building.id,building])),hearths=town.buildings.filter(building=>building.complete&&building.type==='fire');
  const present=residents.filter(person=>person.alive!==false && (person.townId===undefined || person.townId===town.id) && !person.tripId);
  for(const building of town.buildings){
    const recipe=Object.values(RECIPES).find(recipe=>recipe.building===building.type);
    buildings.set(building.id,{
      ...constructionPhase(building),workers:0,assignedWorkers:0,activeWork:null,occupants:0,visitors:0,
      inputUnits:inventoryUnits(building.production?.inputs),outputUnits:inventoryUnits(building.production?.outputs),incomingUnits:0,
      recentProduction:null,productionPulse:0,
      status:!building.complete?'construction':recipe?(productionFull(building,recipe)?'awaiting-collection':productionReady(building,recipe)?'supplied':'awaiting-inputs'):'idle',
    });
  }
  for(const person of present){
    const cargo=carrierActivity(person);carriers.set(person.id,cargo);
    const home=buildings.get(person.houseId);if(home)home.occupants++;
    // Hearth light follows people actually gathering at the hearth, not a
    // fabricated household assignment or the town's headline population.
    for(const building of hearths)if(Math.hypot(person.x-building.x,person.y-building.y)<=7)buildings.get(building.id).visitors++;
    const delivery=buildings.get(person.productionDelivery);if(delivery)delivery.incomingUnits+=cargo.units;
    const task=person.task;if(!task || !buildingJobs.has(task.kind))continue;
    let building=byId.get(task.buildingId);
    // Toolmaking and care predate per-building task IDs. Resolve only an exact
    // authoritative work position, never the closest arbitrary workshop.
    if(!building && task.stage==='work' && (task.kind==='craft'||task.kind==='care')){
      const type=task.kind==='craft'?'workshop':'clinic';
      building=town.buildings.find(building=>{
        if(!building.complete||building.type!==type)return false;
        const point=entrance(building);return point.x===person.x&&point.y===person.y;
      });
    }
    if(!building)continue;
    const activity=buildings.get(building.id);activity.assignedWorkers++;
    if(task.stage!=='work')continue;
    const point=entrance(building);
    if(point.x!==person.x||point.y!==person.y)continue;
    if(task.kind==='build'&&(!building.funded||building.complete))continue;
    if(task.kind!=='build'&&!building.complete)continue;
    activity.workers++;activity.activeWork=task.kind;
    if(building.complete)activity.status='working';
  }
  // A stockpile indicates goods awaiting collection even if no new batch can run.
  for(const activity of buildings.values())if(activity.status!=='working'&&activity.phase==='complete'&&activity.outputUnits>0)activity.status='awaiting-collection';
  return {buildings,carriers};
}

/** Recipe jobs finish inside one simulation tick and clear their task. Retain a
 * short visual completion pulse only after observing a real batch increment.
 * First observation is a silent baseline; this cache belongs to the renderer. */
export class CityActivityTracker {
  constructor(){this.towns=new Map();}
  reset(){this.towns.clear();}
  sample(town,residents,time){
    const frame=deriveTownActivity(town,residents),previous=this.towns.get(town.id)||new Map(),next=new Map();
    for(const building of town.buildings){
      const batches=positive(building.production?.batches),last=previous.get(building.id);
      // Returning to a city after watching the world must not replay production
      // that happened long before this view. A long frame is a fresh baseline.
      const observed=last&&time>=last.at&&time-last.at<=.5;
      const until=observed&&batches>last.batches?time+.9:observed&&batches>=last.batches?last.until:0;
      next.set(building.id,{batches,until,at:time});
      if(building.complete&&until>time){
        const recipe=Object.entries(RECIPES).find(([,recipe])=>recipe.building===building.type);
        if(recipe){const activity=frame.buildings.get(building.id);activity.recentProduction=recipe[0];activity.productionPulse=Math.min(1,(until-time)/.9);}
      }
    }
    this.towns.set(town.id,next);return frame;
  }
}
