import {RECIPES,BUILDINGS,RESOURCE_NAMES,YEAR} from './data.mjs';
import {entrance} from './world.mjs';

// Small workshop buffers make carrying distance part of the economy. These are
// inventories, not copies of the common store. Rendering never initializes them.
export function productionBuffer(b) {
  return b.production??={inputs:{},outputs:{},batches:0};
}
export function productionReady(b,r) {
  for(const k in r.inputs)if(Object.hasOwn(r.inputs,k)&&!((b.production?.inputs[k]||0)>=r.inputs[k]))return false;
  return true;
}
export function productionFull(b,r) {
  for(const k in r.outputs)if(Object.hasOwn(r.outputs,k)&&(b.production?.outputs[k]||0)+r.outputs[k]>r.outputs[k]*4+1e-8)return true;
  return false;
}
function productionHasOutput(b){if(b.production)for(const k in b.production.outputs)if(Object.hasOwn(b.production.outputs,k)&&b.production.outputs[k]>0)return true;return false;}
function productionShipment(t,b,r) {
  if(productionReady(b,r))return null;
  const costs=Object.fromEntries(Object.entries(r.inputs).map(([k,v])=>[k,Math.max(0,Math.min(t.res[k],v*2-(b.production?.inputs[k]||0)))]));
  return Object.entries(r.inputs).every(([k,v])=>(b.production?.inputs[k]||0)+costs[k]>=v)?costs:null;
}
/** Derived once per town/tick, then updated around each resident's turn. */
export function productionAssignments(people,omitId) {
  const index={tasks:new Map(),inbound:new Map(),nodes:new Map(),adultBuildings:new Map()};
  for(const p of people)if(p.id!==omitId)trackProductionAssignment(index,p,1);
  return index;
}
export function trackProductionAssignment(index,p,delta) {
  const adjust=(map,key)=>{const count=(map.get(key)||0)+delta;if(count)map.set(key,count);else map.delete(key);};
  if(p.task?.buildingId!==undefined)adjust(index.tasks,`${p.task.buildingId}:${p.task.kind}`);
  if(p.task?.buildingId!==undefined&&p.ageDays>=18*YEAR)adjust(index.adultBuildings,p.task.buildingId);
  if(p.task?.nodeId!==undefined)adjust(index.nodes,p.task.nodeId);
  if(p.productionDelivery!==undefined)adjust(index.inbound,p.productionDelivery);
}
function productionDemand(sim,t,r,pop) {
  const output=Object.keys(r.outputs)[0],project=sim.project(t);
  const costs=project&&!project.funded?BUILDINGS[project.type].cost:{};
  const need=(costs[output]||0)+(['flour','bread','meals'].includes(output)?Math.max(30,pop*3):output==='steel'?160:output==='iron'?100:60);
  const queued=sim.buildings(t,r.building).reduce((n,b)=>n+(b.production?.outputs[output]||0),0);
  return t.res[output]+queued<need;
}
export function productionActions(sim,p,t,add,jobs) {
  const people=sim.residents(t),pop=people.length;
  const assignments=sim._activeTown?.id===t.id?sim._activeTown.productionAssignments:productionAssignments(people,p.id);
  for(const [kind,r] of Object.entries(RECIPES)){
    if(!sim.knowledge(t,r.tech))continue;
    const producers=sim.buildings(t,r.building),wanted=productionDemand(sim,t,r,pop);
    for(const b of producers){
      const occupied=job=>(assignments.tasks.get(`${b.id}:${job}`)||0)>0;
      if(productionHasOutput(b)&&!occupied('haulOutput'))add('haulOutput',74+p.skills.building,'Collect finished goods; they are not in the common store yet.',{buildingId:b.id,recipeKind:kind});
      if(!wanted)continue;
      if(productionReady(b,r)&&!productionFull(b,r)&&!occupied(kind)&&jobs(kind)<Math.max(1,Math.ceil(pop/35)))add(kind,60+p.skills.building*2,'Use materials delivered to this workshop. Finished goods need collection.',{buildingId:b.id});
      const inbound=(assignments.inbound.get(b.id)||0)>0||occupied('supply');
      if(!inbound&&jobs('supply')<Math.max(1,Math.ceil(pop/20))&&productionShipment(t,b,r))add('supply',66+p.skills.building,'Collect workshop inputs at the common store and carry them to the producer.',{buildingId:b.id,recipeKind:kind});
    }
  }
}
function productionAt(p,point) {return p.x===point.x&&p.y===point.y;}
export function productionWork(sim,p,t) {
  const task=p.task,r=RECIPES[task.recipeKind||task.kind],b=t.buildings.find(q=>q.id===task.buildingId&&q.complete);
  if(!r||!b||b.type!==r.building||!sim.knowledge(t,r.tech))return;
  if(task.kind==='supply'){
    if(!productionAt(p,{x:47,y:43})||productionReady(b,r)||Object.values(p.carry).some(v=>v>0))return;
    // Refill toward two batches. Nothing is taken unless one whole batch can
    // run after delivery; residual perishable ingredients are not discarded.
    const costs=productionShipment(t,b,r);if(!costs)return;
    // Eating a carried ration or an empty catch can leave zero-valued keys.
    // A fresh marked shipment contains only its producer's actual ingredients.
    p.carry={};
    for(const [k,v]of Object.entries(costs))if(v>0){sim.transaction(t,k,-v,'Inputs collected for workshop delivery');p.carry[k]=v;}
    p.productionDelivery=b.id;
    return;
  }
  if(!productionAt(p,entrance(b)))return;
  const buffer=productionBuffer(b);
  if(task.kind==='haulOutput'){
    for(const[k,v]of Object.entries(buffer.outputs))if(v>0){p.carry[k]=(p.carry[k]||0)+v;buffer.outputs[k]=0;}
    return;
  }
  if(!productionReady(b,r)||productionFull(b,r))return;
  for(const[k,v]of Object.entries(r.inputs))buffer.inputs[k]-=v;
  for(const[k,v]of Object.entries(r.outputs))buffer.outputs[k]=(buffer.outputs[k]||0)+v;
  buffer.batches++;
}
export function productionDeliveryTarget(p,t) {
  if(p.productionDelivery===undefined)return;
  const b=t.buildings.find(b=>b.id===p.productionDelivery&&b.complete&&Object.values(RECIPES).some(r=>r.building===b.type));
  if(!b)return;
  const allowed=new Set(Object.values(RECIPES).filter(r=>r.building===b.type).flatMap(r=>Object.keys(r.inputs)));
  if(Object.entries(p.carry).some(([k,v])=>!allowed.has(k)||!Number.isFinite(v)||v<0))return;
  return b;
}
export function deliverProduction(p,t) {
  const b=productionDeliveryTarget(p,t);
  if(!b||!productionAt(p,entrance(b)))return false;
  const buffer=productionBuffer(b);
  for(const[k,v]of Object.entries(p.carry))if(v>0)buffer.inputs[k]=(buffer.inputs[k]||0)+v;
  p.carry={};delete p.productionDelivery;
  return true;
}
/** Pure, read-only status for both inspectors. */
export function productionStatus(sim,t,kind) {
  const r=RECIPES[kind],producers=sim.buildings(t,r.building),people=sim.residents(t);
  const workers=people.filter(p=>p.task?.kind===kind).length;
  const ids=new Set(producers.map(b=>b.id));
  const haulers=people.filter(p=>ids.has(p.productionDelivery)||(['supply','haulOutput'].includes(p.task?.kind)&&ids.has(p.task.buildingId))).length;
  const inputs={},outputs={};let batches=0;
  for(const b of producers){for(const[k,v]of Object.entries(b.production?.inputs||{}))inputs[k]=(inputs[k]||0)+v;for(const[k,v]of Object.entries(b.production?.outputs||{}))outputs[k]=(outputs[k]||0)+v;batches+=b.production?.batches||0;}
  const ready=producers.some(b=>productionReady(b,r)),missing=Object.keys(r.inputs).filter(k=>!producers.some(b=>(b.production?.inputs[k]||0)>=r.inputs[k])&&t.res[k]<r.inputs[k]);
  const status=!sim.knowledge(t,r.tech)?'Discovery required':!producers.length?`Build ${BUILDINGS[r.building].name}`:producers.every(b=>productionFull(b,r))?'Output full · awaiting collection':workers?`${workers} workers assigned`:ready?'Workshop supplied · awaiting a worker':haulers?`${haulers} hauling inputs or outputs`:missing.length?`Waiting for ${missing.map(k=>RESOURCE_NAMES[k]).join(', ')}`:'Inputs in storage · awaiting delivery';
  return {status,inputs,outputs,batches,workers,haulers};
}
