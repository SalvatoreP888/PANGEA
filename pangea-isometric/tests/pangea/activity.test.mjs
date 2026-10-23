import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILDINGS,TECH} from '../../src/pangea/simulation/data.mjs';
import {Simulation} from '../../src/pangea/simulation/sim.mjs';
import {citySite,connectStreet} from '../../src/pangea/simulation/city.mjs';
import {entrance} from '../../src/pangea/simulation/world.mjs';
import {createCityLaboratory} from '../../src/pangea/simulation/scenarios.mjs';
import {carrierActivity,constructionPhase,deriveTownActivity,tripActivity,CityActivityTracker} from '../../src/pangea/activity.mjs';

const structure=(id,type='mill',changes={})=>({id,type,x:48+id*3,y:40,complete:true,funded:true,progress:BUILDINGS[type].work,...changes});
const person=(id,changes={})=>({id,x:0,y:0,townId:1,alive:true,carry:{},task:null,...changes});

test('Construction presentation follows actual funding and required labor',()=>{
  const b=structure(1,'hut',{complete:false,funded:false,progress:8});
  assert.deepEqual(constructionPhase(b),{phase:'planned',progress:0});
  b.funded=true;b.progress=0;assert.equal(constructionPhase(b).phase,'foundation');
  b.progress=BUILDINGS.hut.work*.25;assert.equal(constructionPhase(b).phase,'frame');
  b.progress=BUILDINGS.hut.work*.7;assert.equal(constructionPhase(b).phase,'roof');
  b.complete=true;assert.deepEqual(constructionPhase(b),{phase:'complete',progress:1});
  const unknown=structure(2,'hut',{type:'future-building',complete:false});assert.equal(constructionPhase(unknown).progress,0);
});

test('Only on-site real residents work a building; walking, dead, foreign and traveling agents do not',()=>{
  const b=structure(1,'hut',{complete:false,progress:4}),point=entrance(b),task={kind:'build',stage:'work',buildingId:b.id};
  const workers=[person(1,{...point,task}),person(2,{...point,task:{...task,stage:'walk'}}),person(3,{...point,task,alive:false}),person(4,{...point,task,townId:2}),person(5,{...point,task,tripId:8}),person(6,{x:0,y:0,task})];
  const frame=deriveTownActivity({id:1,buildings:[b]},workers),activity=frame.buildings.get(b.id);
  assert.equal(activity.workers,1);assert.equal(activity.assignedWorkers,3);assert.equal(frame.carriers.size,3);
  b.funded=false;assert.equal(deriveTownActivity({id:1,buildings:[b]},workers).buildings.get(b.id).workers,0);
});

test('Cargo ignores empty and invalid amounts and never fabricates a loaded carrier',()=>{
  assert.deepEqual(carrierActivity({carry:{wood:0,stone:-2,food:NaN,grain:Infinity}}),{units:0,resource:null,loaded:false});
  assert.deepEqual(carrierActivity({carry:{grain:8,wood:2,stone:0}}),{units:10,resource:'grain',loaded:true});
});

test('Workshop stock and work status are distinct, and reading cannot initialize a production buffer',()=>{
  const b=structure(1),town={id:1,buildings:[b]},before=JSON.stringify(town);
  assert.equal(deriveTownActivity(town,[]).buildings.get(1).status,'awaiting-inputs');assert.equal(JSON.stringify(town),before);assert.equal(Object.hasOwn(b,'production'),false);
  b.production={inputs:{grain:8},outputs:{},batches:0};
  let a=deriveTownActivity(town,[]).buildings.get(1);assert.equal(a.status,'supplied');assert.equal(a.inputUnits,8);assert.equal(a.workers,0);
  b.production.outputs.flour=12;a=deriveTownActivity(town,[]).buildings.get(1);assert.equal(a.status,'awaiting-collection');assert.equal(a.outputUnits,12);
  b.production.outputs={};const p=person(1,{...entrance(b),task:{kind:'mill',stage:'work',buildingId:1}});
  a=deriveTownActivity(town,[p]).buildings.get(1);assert.equal(a.status,'working');assert.equal(a.activeWork,'mill');
  p.task.stage='walk';assert.equal(deriveTownActivity(town,[p]).buildings.get(1).activeWork,null);
});

test('Physical input deliveries and household assignments drive incoming stock and occupied lamps',()=>{
  const mill=structure(1),home=structure(2,'hut'),town={id:1,buildings:[mill,home]};
  const p=person(1,{houseId:home.id,productionDelivery:mill.id,carry:{grain:8}});
  const frame=deriveTownActivity(town,[p]);assert.equal(frame.buildings.get(mill.id).incomingUnits,8);assert.equal(frame.buildings.get(mill.id).inputUnits,0);assert.equal(frame.buildings.get(home.id).occupants,1);
  assert.equal(frame.buildings.get(mill.id).occupants,0);assert.deepEqual(p.carry,{grain:8});
});

test('Legacy toolmaking tasks resolve only at the exact authoritative workshop entrance',()=>{
  const b=structure(1,'workshop'),town={id:1,buildings:[b]},p=person(1,{task:{kind:'craft',stage:'work'}});
  assert.equal(deriveTownActivity(town,[p]).buildings.get(1).workers,0);
  Object.assign(p,entrance(b));const activity=deriveTownActivity(town,[p]).buildings.get(1);assert.equal(activity.workers,1);assert.equal(activity.activeWork,'craft');
});

test('Hearth presence follows people physically nearby rather than settlement population',()=>{
  const hearth=structure(1,'fire'),town={id:1,buildings:[hearth]};
  const near=person(1,{x:hearth.x+1,y:hearth.y}),far=person(2,{x:0,y:0});
  assert.equal(deriveTownActivity(town,[near,far]).buildings.get(1).visitors,1);
  assert.equal(deriveTownActivity(town,[far]).buildings.get(1).visitors,0);
});

test('Actual trip modes determine foot carriers, road carts and trains',()=>{
  for(const [mode,kind]of [[0,'foot'],[1,'cart'],[2,'cart'],[3,'train'],[4,'train']])assert.equal(tripActivity({mode}).kind,kind);
  assert.deepEqual(tripActivity({cargo:{food:40,wood:2},people:[1,2]}),{kind:'foot',mode:0,cargoUnits:42,passengers:2});
  assert.equal(tripActivity({mode:1,cargo:{food:0},people:[1]}).cargoUnits,0);
});

test('One-tick production is visible only after a real batch completes, expires and resets cleanly',()=>{
  const s=new Simulation(481217,{events:false}),t=s.town(1),p=s.alive[0],site=citySite(s,t,'mill');assert.ok(site);
  const b={...structure(s.state.nextBuilding++),...site,crop:{sown:false,growth:0,yield:0},condition:100};
  t.buildings.push(b);t.land.navRevision++;connectStreet(s,t,b,true);t.knowledge=TECH.map(k=>k.id);b.production={inputs:{grain:8},outputs:{},batches:0};
  const tracker=new CityActivityTracker();assert.equal(tracker.sample(t,s.residents(t),10).buildings.get(b.id).productionPulse,0);
  Object.assign(p,entrance(b));p.task={kind:'mill',stage:'work',buildingId:b.id,work:0};s.work(p,t);assert.equal(p.task,null);assert.equal(b.production.batches,1);
  const pulse=tracker.sample(t,s.residents(t),10.1).buildings.get(b.id);assert.equal(pulse.recentProduction,'mill');assert.ok(pulse.productionPulse>.99);assert.equal(pulse.workers,0,'the completion effect does not invent a worker');
  assert.equal(tracker.sample(t,s.residents(t),11.1).buildings.get(b.id).productionPulse,0);
  b.production.batches++;assert.equal(tracker.sample(t,s.residents(t),20).buildings.get(b.id).productionPulse,0,'returning from another city does not replay old production');
  tracker.reset();assert.equal(tracker.sample(t,s.residents(t),21).buildings.get(b.id).productionPulse,0,'save/load does not replay old production');
});

test('Activity reads and presentation history leave natural and constructed simulation snapshots unchanged',()=>{
  for(const s of [new Simulation(481217,{events:false}),createCityLaboratory(481217,240)]){
    const before=s.snapshot(),tracker=new CityActivityTracker();
    for(const town of s.state.towns){deriveTownActivity(town,s.residents(town));tracker.sample(town,s.residents(town),0);tracker.sample(town,s.residents(town),2);}
    for(const trip of s.state.trips)tripActivity(trip);
    assert.deepEqual(s.snapshot(),before);assert.deepEqual(s.invariants(),[]);
  }
});
