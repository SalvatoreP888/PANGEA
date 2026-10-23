import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../../src/pangea/simulation/sim.mjs';
import {TECH,BUILDINGS,RECIPES} from '../../src/pangea/simulation/data.mjs';
import {citySite,connectStreet} from '../../src/pangea/simulation/city.mjs';
import {entrance,walkable,findPath,GRID_W,GRID_H} from '../../src/pangea/simulation/world.mjs';
import {productionStatus,productionBuffer} from '../../src/pangea/simulation/production.mjs';
import {tickEconomy} from '../../src/pangea/simulation/economy.mjs';
const fresh=()=>new Simulation(481217,{events:false});
function building(s,t,type){const site=citySite(s,t,type);assert.ok(site);const b={id:s.state.nextBuilding++,type,...site,complete:true,funded:true,progress:BUILDINGS[type].work,created:s.day,crop:{sown:false,growth:0,yield:0},condition:100};t.buildings.push(b);t.land.navRevision++;connectStreet(s,t,b,true);return b;}
function atWork(s,p,t,kind,b,recipeKind){p.task={kind,stage:'work',work:0,buildingId:b?.id,recipeKind};s.work(p,t);}
const sum=(s,t,key)=>t.res[key]+s.residents(t).reduce((n,p)=>n+(p.carry[key]||0),0)+t.buildings.reduce((n,b)=>n+(b.production?.inputs[key]||0)+(b.production?.outputs[key]||0),0);

test('Every recipe waits for physical input delivery and output collection',()=>{
 const s=fresh(),t=s.town(1),p=s.alive[0];t.knowledge=TECH.map(k=>k.id);
 for(const[kind,r]of Object.entries(RECIPES)){
  const b=building(s,t,r.building);for(const[k,v]of Object.entries(r.inputs))t.res[k]=v*2;
  Object.assign(p,entrance(b));atWork(s,p,t,kind,b);assert.equal(b.production?.batches||0,0,'a full common store is not a workshop buffer');
  p.x=47;p.y=43;atWork(s,p,t,'supply',b,kind);const shipment={...p.carry};assert.ok(Object.values(shipment).some(v=>v>0));
  assert.equal(b.production?.batches||0,0);Object.assign(p,entrance(b));atWork(s,p,t,'deliverInput',b);const before=Object.fromEntries(Object.keys({...r.inputs,...r.outputs}).map(k=>[k,sum(s,t,k)]));
  atWork(s,p,t,kind,b);assert.equal(b.production.batches,1);
  for(const[k,v]of Object.entries(r.inputs))assert.equal(sum(s,t,k),before[k]-v);
  for(const[k,v]of Object.entries(r.outputs)){assert.equal(sum(s,t,k),before[k]+v);const stored=t.res[k];atWork(s,p,t,'haulOutput',b,kind);assert.equal(t.res[k],stored,'pickup does not credit storage');assert.equal(p.carry[k],v);p.x=47;p.y=43;atWork(s,p,t,'deliver');assert.equal(t.res[k],stored+v);}
 }
});
test('A material shipment cannot be collected or delivered from a distance',()=>{
 const s=fresh(),t=s.town(1),p=s.alive[0],b=building(s,t,'mill');t.knowledge.push('milling');t.res.grain=8;
 let point,path;for(let y=2;y<GRID_H-2&&!point;y++)for(let x=2;x<GRID_W-2;x++)if(walkable(t,x,y)){const candidate=findPath(t,x,y,47,43);if(candidate?.length>40){point={x,y};path=candidate;break;}}
 assert.ok(point);Object.assign(p,point);assert.ok(s.makeTask(p,t,{kind:'supply',reason:'Test a distant input run'},{x:47,y:43},{buildingId:b.id,recipeKind:'mill',path}));s.stepPerson(p,t);assert.equal(t.res.grain,8);assert.deepEqual(p.carry,{});
 for(let i=0;p.task&&i<20;i++){p.needs.food=p.needs.energy=100;s.stepPerson(p,t);}assert.equal(t.res.grain,0);assert.equal(p.carry.grain,8);
 // Even a forged work-stage task cannot deposit at a remote workshop.
 Object.assign(p,point);atWork(s,p,t,'deliverInput',b);assert.equal(p.carry.grain,8);assert.equal(b.production?.inputs.grain||0,0);Object.assign(p,entrance(b));atWork(s,p,t,'deliverInput',b);assert.equal(b.production.inputs.grain,8);assert.deepEqual(p.carry,{});
});
test('A missing workshop ingredient consumes nothing, including other buffered inputs',()=>{
 const s=fresh(),t=s.town(1),p=s.alive[0];t.knowledge=TECH.map(k=>k.id);
 for(const[kind,r]of Object.entries(RECIPES)){
  const b=building(s,t,r.building),buffer=productionBuffer(b),missing=Object.keys(r.inputs)[0];Object.assign(p,entrance(b));
  for(const[k,v]of Object.entries(r.inputs))buffer.inputs[k]=k===missing?0:v;
  const before=JSON.stringify(buffer);atWork(s,p,t,kind,b);assert.equal(JSON.stringify(buffer),before);
 }
});
test('Full output buffers stop production until goods are collected',()=>{
 const s=fresh(),t=s.town(1),p=s.alive[0],b=building(s,t,'mill');t.knowledge.push('milling');const buffer=productionBuffer(b);buffer.inputs.grain=40;Object.assign(p,entrance(b));
 for(let i=0;i<10;i++)atWork(s,p,t,'mill',b);assert.equal(buffer.outputs.flour,12);assert.equal(buffer.inputs.grain,24);assert.match(productionStatus(s,t,'mill').status,/Output full/);
 atWork(s,p,t,'haulOutput',b,'mill');assert.equal(p.carry.flour,12);atWork(s,p,t,'mill',b);assert.equal(buffer.batches,5);assert.equal(buffer.outputs.flour,3);assert.equal(t.res.flour,0);
});
test('Interrupted input deliveries survive save/resume and match exact autonomous replay',()=>{
 const a=fresh(),t=a.town(1),p=a.alive[0],b=building(a,t,'mill');t.knowledge.push('milling');t.res.grain=8;p.x=47;p.y=43;atWork(a,p,t,'supply',b,'mill');p.task=null;
 const resumed=Simulation.fromSnapshot(a.snapshot());a.advanceDays(20);resumed.advanceDays(20);assert.deepEqual(resumed.snapshot(),a.snapshot());assert.deepEqual(a.invariants(),[]);
});
test('Input reservations prevent duplicate pickup assignments and inspectors are read-only',()=>{
 const s=fresh(),t=s.town(1),[p,q]=s.alive,b=building(s,t,'mill');t.knowledge.push('milling');t.res.grain=20;
 assert.ok(s.scoreActions(p,t).some(c=>c.kind==='supply'&&c.buildingId===b.id));p.x=47;p.y=43;atWork(s,p,t,'supply',b,'mill');assert.ok(!s.scoreActions(q,t).some(c=>c.kind==='supply'&&c.buildingId===b.id));const before=s.snapshot();productionStatus(s,t,'mill');assert.deepEqual(s.snapshot(),before);
});
test('Empty-catch and eaten-ration carry keys cannot corrupt a later workshop shipment',()=>{
 const s=fresh(),t=s.town(1),p=s.alive[0],b=building(s,t,'mill');t.knowledge.push('milling');t.res.grain=8;p.carry={fish:0,food:0};p.x=47;p.y=43;atWork(s,p,t,'supply',b,'mill');assert.deepEqual(p.carry,{grain:8});assert.equal(p.productionDelivery,b.id);assert.deepEqual(Simulation.fromSnapshot(s.snapshot()).snapshot(),s.snapshot());Object.assign(p,entrance(b));atWork(s,p,t,'deliverInput',b);assert.equal(b.production.inputs.grain,8);assert.deepEqual(p.carry,{});
});
test('Workshop perishables decay, leave no oversized output and retain usable residual inputs',()=>{
 const s=fresh(),t=s.town(1),p=s.alive[0],b=building(s,t,'fishery');t.knowledge.push('fishing');const buffer=productionBuffer(b);buffer.inputs.fish=3;buffer.inputs.wood=.3;const waste=t.stats.waste;tickEconomy(s,t);assert.ok(buffer.inputs.fish<3);assert.ok(t.stats.waste>waste);
 t.res.fish=1;t.res.wood=1;p.x=47;p.y=43;atWork(s,p,t,'supply',b,'preserveFish');Object.assign(p,entrance(b));atWork(s,p,t,'deliverInput',b);atWork(s,p,t,'preserveFish',b);assert.equal(buffer.outputs.meals,3);assert.ok(buffer.inputs.fish>=0&&buffer.inputs.fish<1);
 const bakery=building(s,t,'bakery');t.knowledge.push('milling');const bread=productionBuffer(bakery);bread.inputs.flour=100;bread.inputs.wood=100;bread.outputs.bread=12;tickEconomy(s,t);Object.assign(p,entrance(bakery));atWork(s,p,t,'bake',bakery);assert.ok(bread.outputs.bread<=12);
});
test('Malformed or foreign workshop inventories and delivery targets are rejected',()=>{
 const s=fresh(),t=s.town(1),b=building(s,t,'mill');productionBuffer(b);
 for(const mutation of [w=>w.towns[0].buildings.find(q=>q.id===b.id).production.inputs.grain=-1,w=>w.towns[0].buildings.find(q=>q.id===b.id).production.outputs.unobtainium=1,w=>w.people[0].productionDelivery=999999,w=>{w.people[0].productionDelivery=b.id;w.people[0].carry={wood:1};},w=>{w.people[0].productionDelivery=b.id;w.people[0].carry={};}]){const data=s.snapshot();mutation(data);assert.throws(()=>Simulation.fromSnapshot(data));}
 const p=s.alive[0];p.productionDelivery=b.id;p.carry={wood:1};Object.assign(p,entrance(b));atWork(s,p,t,'deliverInput',b);assert.equal(b.production.inputs.wood,undefined);s.decide(p,t);assert.equal(p.task.kind,'deliver');assert.equal(p.productionDelivery,undefined);assert.equal(p.carry.wood,1);
});
test('Autonomous workers sustain milling and baking without injected workshop stocks',()=>{
 const s=fresh(),t=s.town(1);t.knowledge=TECH.map(k=>k.id);t.res.food=2000;t.res.grain=300;t.res.wood=t.res.stone=2000;t.res.tools=50;const mill=building(s,t,'mill'),bakery=building(s,t,'bakery');s.advanceDays(180);assert.ok(mill.production?.batches>0);assert.ok(bakery.production?.batches>0);assert.ok(s.state.totals.deliveries>4);assert.deepEqual(s.invariants(),[]);
});
