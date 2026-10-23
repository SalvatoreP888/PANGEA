import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,validateSave} from '../../src/pangea/simulation/sim.mjs';
import {YEAR,BUILDINGS} from '../../src/pangea/simulation/data.mjs';
import {findPath,walkable,globalRoute,geoAt} from '../../src/pangea/simulation/world.mjs';
const fresh=()=>new Simulation(481217,{events:false});
const job=(p,kind,extra={})=>p.task={kind,stage:'work',work:0,...extra};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('Exactly four adult founders; same seed and actions produce the same complete state',()=>{
 const a=fresh(),b=fresh();assert.equal(a.alive.length,4);assert.ok(a.alive.every(p=>p.ageDays>=18*YEAR));
 a.advanceDays(70);b.advanceDays(70);assert.deepEqual(a.snapshot(),b.snapshot());assert.deepEqual(a.invariants(),[]);
});
test('Save round-trip continues the seeded simulation without divergence',()=>{
 const a=fresh();a.advanceDays(90);const b=Simulation.fromSnapshot(a.snapshot());a.advanceDays(60);b.advanceDays(60);assert.deepEqual(a.snapshot(),b.snapshot());
});
test('Reject old, malformed, unsafe styling and invalid enum saves without mutating the original',()=>{
 const sim=fresh(),before=sim.snapshot();
 for(const mutate of [s=>s.version=1,s=>s.people[0].color='red;position:fixed',s=>s.people[0].needs.food=-1,s=>s.people[0].x=999,s=>s.towns[0].res.wood=-1,s=>s.towns[0].land.tiles[0].type='lava',s=>s.nextPerson=1,s=>s.people[0].skills.insight='Infinity']){
  const data=sim.snapshot();mutate(data);assert.throws(()=>Simulation.fromSnapshot(data));
 }
 assert.deepEqual(before,sim.snapshot());assert.equal(validateSave(before),true);
});
test('Spending checks all inputs atomically and never creates a negative inventory',()=>{
 const sim=fresh(),t=sim.state.towns[0],before={...t.res};assert.equal(sim.spend(t,{wood:999999,stone:1},'test'),false);assert.deepEqual(t.res,before);
 assert.equal(sim.spend(t,{wood:5,stone:3},'test'),true);near(t.res.wood,before.wood-5);near(t.res.stone,before.stone-3);
});
test('Foraging depletes a node into carried inventory; storage changes only at delivery',()=>{
 const sim=fresh(),t=sim.state.towns[0],p=sim.alive[0],n=t.land.nodes.find(n=>n.kind==='food'),before=n.amount,store=t.res.food;
 p.x=n.x;p.y=n.y;job(p,'forage',{nodeId:n.id});sim.work(p,t);assert.ok(n.amount<before);near(before-n.amount,p.carry.food);near(t.res.food,store);
 const cargo=p.carry.food;p.x=47;p.y=43;job(p,'deliver');sim.work(p,t);near(t.res.food,store+cargo);assert.deepEqual(p.carry,{});
});
test('Construction reserves its material costs before a worker can add progress',()=>{
 const sim=fresh(),t=sim.state.towns[0],p=sim.alive[0],b=sim.project(t);t.res.wood=0;t.res.stone=0;
 sim.dailyTown(t);assert.equal(b.funded,false);job(p,'build',{buildingId:b.id});sim.work(p,t);near(b.progress,0);
 t.res.wood=100;t.res.stone=100;sim.dailyTown(t);assert.equal(b.funded,true);near(t.res.wood,100-BUILDINGS[b.type].cost.wood);
 p.x=b.x;p.y=b.y+2;job(p,'build',{buildingId:b.id});sim.work(p,t);assert.ok(b.progress>0);
});
test('Cooking transforms food and fuel without adding net rations',()=>{
 const sim=fresh(),t=sim.state.towns[0],p=sim.alive[0],before={...t.res};job(p,'cook');sim.work(p,t);
 near(t.res.food,before.food-3);near(t.res.meals,before.meals+3);near(t.res.wood,before.wood-.6);
});
test('Fractional food does not trap hungry agents in impossible eating tasks',()=>{
 const sim=fresh(),t=sim.state.towns[0],p=sim.alive[0];t.res.food=.4;t.res.meals=.8;p.needs.food=0;
 const choices=sim.scoreActions(p,t);assert.equal(choices.some(c=>c.kind==='eat'),false);assert.ok(choices.some(c=>c.kind==='forage'));
});
test('Memory retrieval weights context and reflection changes food caution',()=>{
 const sim=fresh(),t=sim.state.towns[0],p=sim.alive[0];p.memories=[];
 sim.remember(p,'hunger','A test shortage.',10,-12);sim.remember(p,'friendship','A shared afternoon.',3,3);
 assert.equal(sim.retrieve(p,'hunger',1)[0].tag,'hunger');sim.reflect(p);assert.ok(p.beliefs.foodSafety>0);assert.ok(p.reflection.includes('hungry'));
 const cautious=sim.scoreActions(p,t).find(c=>c.kind==='forage')?.score;p.beliefs.foodSafety=0;const naive=sim.scoreActions(p,t).find(c=>c.kind==='forage')?.score;
 // Force a genuine low-pantry choice for a behavioral ablation.
 t.res.food=8;t.res.meals=0;sim.reflect(p);const high=sim.scoreActions(p,t).find(c=>c.kind==='forage').score;
 p.beliefs.foodSafety=0;const low=sim.scoreActions(p,t).find(c=>c.kind==='forage').score;assert.ok(high>low);
});
test('Children do not get adult labor or partnership decisions; close family is excluded',()=>{
 const sim=fresh(),t=sim.state.towns[0],a=sim.alive[0],b=sim.alive[1];
 const child=sim.addPerson(t,{name:'Test child',age:10,parents:[a.id,b.id]});
 assert.ok(sim.scoreActions(child,t).every(c=>['eat','rest','learn','play'].includes(c.kind)));
 assert.equal(sim.related(a,child),true);const sibling=sim.addPerson(t,{age:20,parents:[a.id,b.id]});assert.equal(sim.related(sibling,child),true);
 sim.bond(a,child,99);sim.demographics(t);assert.equal(child.partnerId,null);
});
test('Birth records both parents and is a person, not just a population increment',()=>{
 const sim=fresh(),t=sim.state.towns[0],a=sim.alive[0],b=sim.alive[1];a.partnerId=b.id;b.partnerId=a.id;a.due=0;a.pregnantWith=b.id;
 sim.demographics(t);assert.equal(sim.alive.length,5);const c=sim.alive[4];assert.deepEqual(c.parents,[a.id,b.id]);assert.ok(a.children.includes(c.id)&&b.children.includes(c.id));assert.equal(c.ageDays,0);
});
test('Regrowth is slower in drought and resources stay finite',()=>{
 const a=fresh(),b=fresh(),ta=a.state.towns[0],tb=b.state.towns[0],na=ta.land.nodes.find(n=>n.kind==='food'),nb=tb.land.nodes.find(n=>n.id===na.id);
 na.amount=nb.amount=0;tb.weather={kind:'Drought',until:60};a.dailyTown(ta);b.dailyTown(tb);assert.ok(na.amount>nb.amount&&nb.amount>=0);
});
test('A* uses adjacent walkable tiles and rejects water targets',()=>{
 const sim=fresh(),t=sim.state.towns[0],goal=t.land.nodes.find(n=>n.kind==='food'&&n.x===37&&n.y===30),path=findPath(t,47,43,goal.x,goal.y);assert.ok(path?.length);
 let prev={x:47,y:43};for(const next of path){assert.equal(Math.abs(prev.x-next.x)+Math.abs(prev.y-next.y),1);assert.ok(walkable(t,next.x,next.y));prev=next;}
 const water=t.land.tiles.findIndex(q=>!q.walkable);assert.notEqual(water,-1);assert.equal(findPath(t,47,43,water%96,Math.floor(water/96)),null);
});
test('Death is recorded and partnership is released, without erasing family history',()=>{
 const sim=fresh(),t=sim.state.towns[0],a=sim.alive[0],b=sim.alive[1];a.partnerId=b.id;b.partnerId=a.id;sim.die(a,'test');
 assert.equal(sim.alive.length,3);assert.equal(b.partnerId,null);assert.ok(b.memories.some(m=>m.tag==='grief'));assert.equal(sim.state.totals.deaths,1);assert.ok(sim.person(a.id));
});
