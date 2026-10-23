import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../../src/pangea/simulation/sim.mjs';
import {ResidentIndex} from '../../src/pangea/simulation/resident-index.mjs';
import {findPath,GRID_W,GRID_H,entrance} from '../../src/pangea/simulation/world.mjs';
import {YEAR,BUILDINGS} from '../../src/pangea/simulation/data.mjs';
import {citySite,connectStreet} from '../../src/pangea/simulation/city.mjs';

test('Spatial social pools retain resident order, age preference and moved contacts',()=>{
 const people=Array.from({length:320},(_,i)=>({id:500-i,x:(i*37)%GRID_W,y:(i*19)%GRID_H,ageDays:(i%3?24:8)*YEAR,health:100,sick:0}));
 const index=new ResidentIndex(people);
 const verify=()=>{for(const p of people.filter((_,i)=>i%13===0))for(const radius of [8,20,35])for(const prefer of [false,true]){
  const all=people.filter(q=>q.id!==p.id&&Math.hypot(q.x-p.x,q.y-p.y)<radius),same=all.filter(q=>(q.ageDays>=18*YEAR)===(p.ageDays>=18*YEAR));
  assert.deepEqual(index.nearby(p,radius,prefer),prefer&&same.length?same:all);
 }};
 verify();for(let i=0;i<people.length;i+=3){people[i].x=(people[i].x+29)%GRID_W;people[i].y=(people[i].y+43)%GRID_H;index.move(people[i]);}verify();
 const village=people.slice(0,8),smallIndex=new ResidentIndex(village);for(const p of village){const all=village.filter(q=>q.id!==p.id&&Math.hypot(q.x-p.x,q.y-p.y)<20);assert.deepEqual(smallIndex.nearby(p),all);}
 // Check the radius boundary against the old hypot predicate over the whole grid.
 for(let dx=-GRID_W;dx<=GRID_W;dx++)for(let dy=-GRID_H;dy<=GRID_H;dy++)assert.equal(dx*dx+dy*dy<400,Math.hypot(dx,dy)<20);
});
test('Patient lookup updates immediately for illness, healing and original resident priority',()=>{
 const people=[{id:9,x:1,y:1,health:100,sick:0},{id:2,x:2,y:2,health:74,sick:0},{id:5,x:3,y:3,health:100,sick:3}];
 const index=new ResidentIndex(people),check=()=>assert.equal(index.patient(),people.find(p=>p.health<75||p.sick>0));check();
 for(const [i,health,sick]of [[0,73,0],[0,100,0],[1,100,0],[2,100,0],[0,100,1],[0,100,0]]){Object.assign(people[i],{health,sick});index.updatePatient(people[i]);check();}
});
test('Direct social choices match every ordered candidate after interleaved moves and age-group fallback',()=>{
 const people=Array.from({length:96},(_,i)=>({id:800-i,x:10+i%12,y:10+Math.floor(i/12),ageDays:(i===1||i===2?9:24)*YEAR,health:100,sick:0}));
 Object.assign(people[0],{x:21,y:20});Object.assign(people[1],{x:90,y:70});Object.assign(people[31],{x:40,y:20});Object.assign(people[63],{x:41,y:20});
 const index=new ResidentIndex(people),check=p=>{
  const all=people.filter(q=>q.id!==p.id&&Math.hypot(q.x-p.x,q.y-p.y)<20),same=all.filter(q=>(q.ageDays>=18*YEAR)===(p.ageDays>=18*YEAR)),pool=same.length?same:all;
  if(!pool.length){let calls=0;assert.equal(index.socialContact(p,()=>{calls++;return 0;}),undefined);assert.equal(calls,0);}
  for(let pick=0;pick<pool.length;pick++){let calls=0;assert.equal(index.socialContact(p,size=>{calls++;assert.equal(size,pool.length);return pick;}),pool[pick]);assert.equal(calls,1);}
 };
 check(people[0]);check(people[1]);
 // Both moves cross the strict radius boundary while staying in the same bucket;
 // their ranks also exercise the high bit of two different 32-bit words.
 for(const [rank,x,y]of [[31,41,20],[63,40,20],[31,40,20],[63,89,70],[2,88,70]]){Object.assign(people[rank],{x,y});index.move(people[rank]);for(const p of [people[0],people[1],people[2],people[31],people[63]])check(p);}
 // An actor can finish walking and choose a contact before its outer turn moves
 // the spatial index; excluding its own rank must still give the same pool.
 people[0].x=45;check(people[0]);index.move(people[0]);check(people[31]);
 Object.assign(people[5],{x:44,y:20});index.move(people[5]);people[5].alive=false;check(people[0]); // Original tick membership includes this nearby resident.
 for(let x=25;x<70;x++){people[31].x=x;index.move(people[31]);check(people[31]);}
 for(const p of [people[0],people[1],people[2],people[31],people[63]])check(p);
});
test('Route caches own their points and invalidate for buildings, paving and disconnected paths',()=>{
 const t={buildings:[],land:{navRevision:0,tiles:Array.from({length:GRID_W*GRID_H},()=>({walkable:true,type:'grass'})),streets:new Array(GRID_W*GRID_H).fill(0)}};
 const first=findPath(t,5,5,15,5),expected=structuredClone(first);assert.equal(first.length,10);first[0].x=91;assert.deepEqual(findPath(t,5,5,15,5),expected);
 findPath(t,20,20,40,30);assert.deepEqual(findPath(t,5,5,15,5),expected);
 t.buildings.push({id:1,type:'hut',x:9,y:5});t.land.navRevision++;assert.ok(findPath(t,5,5,15,5).every(p=>p.x!==9||p.y!==5));
 t.buildings=[];t.land.navRevision++;assert.deepEqual(findPath(t,5,5,15,5),expected);
 for(let x=5;x<=15;x++)t.land.streets[6*GRID_W+x]=3;t.land.navRevision++;assert.ok(findPath(t,5,5,15,5).some(p=>p.y===6));
 for(const[x,y]of [[14,5],[16,5],[15,4],[15,6]])t.land.tiles[y*GRID_W+x].walkable=false;t.land.navRevision++;assert.equal(findPath(t,5,5,15,5),null);
 t.land.tiles[5*GRID_W+14].walkable=true;t.land.navRevision++;assert.ok(findPath(t,5,5,15,5));
});
test('Research cache advances through multiple discoveries within the same tick',()=>{
 const s=new Simulation(481217,{events:false}),t=s.town(1);t.research=2000;for(const p of s.alive)p.task={kind:'study',stage:'work',work:0};s.step();
 assert.deepEqual(t.knowledge,['agriculture','masonry','preservation','craft']);assert.equal(s.currentTech(t).id,'medicine');assert.deepEqual(Simulation.fromSnapshot(s.snapshot()).snapshot(),s.snapshot());
});
test('A field sown early in a tick leaves the next farmer free to sow another field',()=>{
 const s=new Simulation(481217,{events:false}),t=s.town(1);t.knowledge=['agriculture'];t.res.food=10000;t.res.wood=t.res.stone=1000;
 const fields=[];for(let i=0;i<2;i++){const site=citySite(s,t,'farm');assert.ok(site);const b={id:s.state.nextBuilding++,type:'farm',...site,complete:true,funded:true,progress:BUILDINGS.farm.work,created:s.day,crop:{sown:false,growth:0,yield:0},condition:100};t.buildings.push(b);t.land.navRevision++;connectStreet(s,t,b,true);fields.push(b);}
 for(const p of s.alive){p.skills.farming=20;p.needs.food=p.needs.energy=p.needs.social=100;Object.assign(p,entrance(fields[1]));}
 Object.assign(s.person(2),entrance(fields[0]));s.step();assert.ok(fields.every(b=>b.crop.sown));assert.deepEqual(s.invariants(),[]);
});
