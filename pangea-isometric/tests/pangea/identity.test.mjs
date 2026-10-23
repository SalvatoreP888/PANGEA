import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../../src/pangea/simulation/sim.mjs';
import {BUILDINGS} from '../../src/pangea/simulation/data.mjs';
import {deriveSettlementIdentity,settlementArchitecture,settlementEmblem,settlementMilestones} from '../../src/pangea/simulation/identity.mjs';

const fresh = () => new Simulation(481217);
const structure = (type,complete=true,batches=0) => ({type,complete,production:{inputs:{},outputs:{},batches}});

test('Settlement identity is read-only and never changes subsequent simulation replay',()=>{
  const a=fresh(),b=Simulation.fromSnapshot(a.snapshot()),before=a.snapshot();
  const profile=deriveSettlementIdentity(a.state,a.town(1));
  assert.deepEqual(a.snapshot(),before);
  assert.deepEqual(deriveSettlementIdentity(a.state,a.town(1)),profile);
  a.advanceDays(18);b.advanceDays(18);
  assert.deepEqual(a.snapshot(),b.snapshot(),'UI inspection must not consume simulation RNG');
});

test('Decorative emblems depend only on seed and town, not query order or time',()=>{
  const first=settlementEmblem(481217,1),second=settlementEmblem(481217,2);
  assert.notDeepEqual(first,second);
  assert.notDeepEqual(first,settlementEmblem(72031,1));
  settlementEmblem(12,9);
  assert.deepEqual(first,settlementEmblem(481217,1));
});

test('Current family-name groups exclude dead residents, travellers and other towns',()=>{
  const s=fresh(),t=s.town(1);
  s.state.people.push(
    {id:90,name:'Test',family:'Vale',alive:true,townId:1,tripId:null,generation:2},
    {id:91,family:'Vale',alive:false,townId:1,generation:3},
    {id:92,family:'Vale',alive:true,townId:1,tripId:3,generation:4},
    {id:93,family:'Vale',alive:true,townId:2,generation:5},
  );
  const profile=deriveSettlementIdentity(s.state,t);
  assert.equal(profile.residents,5);
  assert.deepEqual(profile.families[0],{name:'Vale',count:2,memberIds:[1,90],generation:3});
  assert.deepEqual(profile.families.slice(1).map(f=>f.name),['Ash','Reed','Stone']);
  assert.equal(profile.families.reduce((n,f)=>n+f.count,0),profile.residents);
});

test('Achieved specialty uses actual completed batches rather than stockpiles or planned workshops',()=>{
  const s=fresh(),t=s.town(1);
  t.buildings=[structure('kiln',true,8),structure('kiln',true,4),structure('mill',true,10),structure('weaver',false,800)];
  t.res.cloth=100000;
  let profile=deriveSettlementIdentity(s.state,t);
  assert.equal(profile.specialty.label,'Brickmaking');
  assert.match(profile.specialty.detail,/12 recorded batches · 2 completed producers/);
  assert.equal(profile.industries.find(i=>i.kind==='weave'),undefined);
  t.buildings[2].production.batches=13;
  profile=deriveSettlementIdentity(s.state,t);
  assert.equal(profile.specialty.label,'Grain milling');
  assert.equal(t.res.cloth,100000);
  assert.deepEqual(t.buildings[0].production,{inputs:{},outputs:{},batches:8});
});

test('Constructed capacity and crops cannot manufacture production history',()=>{
  const s=fresh(),t=s.town(1);s.state.scenario='Constructed test';
  t.buildings=[structure('kiln'),structure('mill')];
  let profile=deriveSettlementIdentity(s.state,t);
  assert.equal(profile.origin.constructed,true);
  assert.equal(profile.specialty.label,'A community taking shape');
  assert.match(profile.specialty.detail,/no completed batches recorded/);
  assert.ok(profile.industries.every(i=>i.batches===0));
  t.buildings.push(structure('farm'),structure('wheatfield'),structure('flaxfield',false));
  profile=deriveSettlementIdentity(s.state,t);
  assert.equal(profile.specialty.label,'Cultivated land');
  assert.match(profile.specialty.detail,/2 completed crop fields/);
});

test('Architectural character counts completed housing and weights actual installed beds',()=>{
  const t={buildings:[...Array.from({length:5},()=>structure('hut')),structure('rowhouse'),structure('tenement'),structure('apartment',false),structure('kiln')]};
  const profile=settlementArchitecture(t);
  assert.equal(profile.key,'urban');assert.equal(profile.material,'masonry');
  assert.equal(profile.dominantType,'tenement');assert.equal(profile.homes,7);
  assert.equal(profile.beds,5*BUILDINGS.hut.beds+BUILDINGS.rowhouse.beds+BUILDINGS.tenement.beds);
  assert.equal(profile.counts.find(h=>h.type==='apartment'),undefined);
  assert.deepEqual(settlementArchitecture({buildings:[]}),{
    key:'camp',label:'An open camp',material:'none',dominantType:null,homes:0,beds:0,counts:[],detail:'No permanent homes completed yet.',
  });
});

test('Recorded milestones keep actual source details and newest town events, without mutating log order',()=>{
  const event=(id,day,type,townId)=>({id,day,type,townId,title:`Event ${id}`,detail:`Actual detail ${id}`});
  const state={events:[event(4,14,'knowledge',2),event(1,0,'founding',1),event(6,20,'plan',1),event(3,14,'build',1),event(7,21,'sandbox',null),event(2,10,'birth',1),event(5,14,'knowledge',1)]};
  const before=structuredClone(state);
  const milestones=settlementMilestones(state,1,2);
  assert.deepEqual(milestones.map(e=>e.id),[5,3]);
  assert.equal(milestones[0].detail,'Actual detail 5');
  assert.deepEqual(state,before);
  assert.deepEqual(settlementMilestones(state,1,0),[]);
  assert.deepEqual(settlementMilestones({events:[]},1),[]);
});

test('Identity survives save/load without a schema addition and reports the real founding origin',()=>{
  const s=fresh(),t=s.town(1);s.advanceDays(8);
  const before=deriveSettlementIdentity(s.state,t),resumed=Simulation.fromSnapshot(s.snapshot());
  assert.deepEqual(deriveSettlementIdentity(resumed.state,resumed.town(1)),before);
  const child={id:2,name:'New Reach',parentId:1,created:987,buildings:[]};
  s.state.towns.push(child);
  const profile=deriveSettlementIdentity(s.state,child);
  assert.deepEqual(profile.origin,{day:987,parentName:t.name,constructed:false});
  assert.deepEqual(profile.milestones,[],'Do not invent founding events when none remain in the retained log');
});
