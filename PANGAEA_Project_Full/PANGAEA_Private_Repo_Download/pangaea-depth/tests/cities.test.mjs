import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Simulation,validateSave} from '../src/sim.mjs';
import {createCityLaboratory} from '../src/scenarios.mjs';
import {TECH,BUILDINGS,TRANSPORT,RECIPES,YEAR} from '../src/data.mjs';
import {citySite,housingType,connectStreet} from '../src/city.mjs';
import {ensureLink,upgradeLink,dispatch,dailyNetwork} from '../src/transport.mjs';
import {walkable,entrance,findPath,GRID_W} from '../src/world.mjs';
import FlatQueue from '../src/vendor/flatqueue.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const fresh=()=>new Simulation(481217,{events:false});
const structure=(s,t,type)=>{const site=citySite(s,t,type);assert.ok(site,`site for ${type}`);const b={id:s.state.nextBuilding++,type,...site,complete:true,funded:true,progress:BUILDINGS[type].work,created:s.day,crop:{sown:false,growth:0,yield:0},condition:100};t.buildings.push(b);t.land.navRevision++;return b;};
const network=()=>{const s=createCityLaboratory(481217,80);s.state.trips=[];for(const p of s.alive)p.tripId=null;for(const t of s.state.towns)s.assignHomes(t);s.state.links.forEach(l=>l.lastDispatch=-99999);return s;};

test('Thirty-six discoveries form an acyclic five-era tree with usable unlocks',()=>{
 assert.equal(TECH.length,36);assert.equal(new Set(TECH.map(k=>k.id)).size,36);assert.equal(new Set(TECH.map(k=>k.era)).size,5);
 const visit=(id,stack=new Set())=>{assert.ok(!stack.has(id),'technology cycle');const k=TECH.find(k=>k.id===id);assert.ok(k);for(const parent of k.parents)visit(parent,new Set([...stack,id]));};
 for(const k of TECH)visit(k.id);for(const b of Object.values(BUILDINGS))if(b.tech)assert.ok(TECH.some(k=>k.id===b.tech));
 for(const r of Object.values(RECIPES))assert.ok(BUILDINGS[r.building]);
});
test('Vendored FlatQueue orders priorities, empties, and can be reused',()=>{
 const q=new FlatQueue();for(let i=60;i>=0;i--)q.push(i,i);for(let i=0;i<=60;i++)assert.equal(q.pop(),i);assert.equal(q.pop(),undefined);q.push('ok',1);q.clear();assert.equal(q.length,0);q.push('again',2);assert.equal(q.pop(),'again');
});
test('Housing chooses buildable material chains rather than deadlocking on future industry',()=>{
 const s=fresh(),t=s.state.towns[0];t.knowledge=TECH.map(k=>k.id);assert.equal(housingType(s,t),'cottage');structure(s,t,'furnace');assert.equal(housingType(s,t),'cottage');structure(s,t,'kiln');assert.equal(housingType(s,t),'tenement');structure(s,t,'steelworks');structure(s,t,'factory');assert.equal(housingType(s,t),'apartment');
 assert.ok(!BUILDINGS.university.cost.goods,'universities must not depend on post-university machinery');
});
test('Dense city fixture houses actual individuals and keeps doors connected',()=>{
 const s=createCityLaboratory(),t=s.state.towns[0];assert.equal(s.alive.length,1000);assert.ok(s.state.scenario.includes('sandbox'));assert.ok(t.buildings.length>80);assert.ok(s.capacity(t)>=s.residents(t).length);
 for(const town of s.state.towns){const usage=new Map();for(const p of s.residents(town)){assert.ok(p.houseId);usage.set(p.houseId,(usage.get(p.houseId)||0)+1);}for(const b of town.buildings){const door=entrance(b);assert.ok(walkable(town,door.x,door.y),`door ${b.id}`);assert.ok(findPath(town,47,43,door.x,door.y));assert.ok((usage.get(b.id)||0)<=(BUILDINGS[b.type].beds||0));}}
 assert.deepEqual(s.invariants(),[]);
});
test('Local roads connect real completed buildings without changing stocks when unfunded',()=>{
 const s=fresh(),t=s.state.towns[0],b=structure(s,t,'cottage');t.res.wood=t.res.stone=0;t.knowledge=['roads'];const before={...t.res};connectStreet(s,t,b);assert.deepEqual(t.res,before);const door=entrance(b);assert.ok(t.land.streets[door.y*GRID_W+door.x]>0);assert.ok(findPath(t,47,43,door.x,door.y));
});
test('Research priority retains per-topic progress and cannot bypass prerequisites/population',()=>{
 const s=fresh(),t=s.state.towns[0];assert.equal(s.selectResearch(t,'railways'),false);t.knowledge=['agriculture'];t.research=37;assert.equal(s.currentTech(t).id,'masonry');assert.ok(s.selectResearch(t,'preservation'));assert.equal(t.research,0);t.research=21;assert.ok(s.selectResearch(t,'masonry'));assert.equal(t.research,37);const resumed=Simulation.fromSnapshot(s.snapshot());assert.ok(resumed.selectResearch(resumed.state.towns[0],'preservation'));assert.equal(resumed.state.towns[0].research,21);
});
test('Industrial conversions require the building, knowledge and every input',()=>{
 const s=fresh(),t=s.state.towns[0],p=s.alive[0];t.res.ore=4;t.res.coal=0;p.task={kind:'smelt',stage:'work',work:0};s.work(p,t);assert.equal(t.res.iron,0);structure(s,t,'furnace');t.knowledge.push('metallurgy');p.task={kind:'smelt',stage:'work',work:0};s.work(p,t);assert.equal(t.res.ore,4);t.res.coal=1;p.task={kind:'smelt',stage:'work',work:0};s.work(p,t);assert.equal(t.res.ore,2);assert.equal(t.res.coal,0);assert.equal(t.res.iron,1);
});
test('Crop improvements change real harvest yield and sanitation does not create supplies',()=>{
 const a=fresh(),b=fresh(),ta=a.state.towns[0],tb=b.state.towns[0],fa=structure(a,ta,'farm'),fb=structure(b,tb,'farm');fa.crop.sown=fb.crop.sown=true;fa.crop.growth=fb.crop.growth=79;tb.knowledge=['irrigation','rotation','agronomy'];a.dailyTown(ta);b.dailyTown(tb);assert.ok(fb.crop.yield>fa.crop.yield*3);assert.equal(ta.res.iron,0);assert.equal(tb.res.iron,0);
});
test('Road and railway upgrades consume materials once and require real labour',()=>{
 const s=network(),l=s.state.links[0],t=s.town(l.from),p=s.residents(t)[0];l.tier=0;l.project=null;for(const k of Object.keys(t.res))t.res[k]=10000;
 for(let tier=1;tier<=4;tier++){
  const wood=t.res.wood;assert.ok(upgradeLink(s,l));assert.equal(l.tier,tier-1);assert.equal(upgradeLink(s,l),false);assert.equal(t.res.wood,wood-(TRANSPORT[tier].cost.wood||0));
  while(l.project){p.task={kind:'infrastructure',stage:'work',work:0,linkId:l.id};s.work(p,t);}assert.equal(l.tier,tier);
 }
});
test('Railway construction requires stations, knowledge and sufficient materials',()=>{
 const s=network(),l=s.state.links[0],t=s.town(l.from),to=s.town(l.to);l.tier=2;l.project=null;t.res.steel=0;assert.equal(upgradeLink(s,l),false);t.res.steel=1000;
 to.buildings=to.buildings.filter(b=>b.type!=='station');to.land.navRevision++;assert.equal(upgradeLink(s,l),false);structure(s,to,'station');to.knowledge=to.knowledge.filter(k=>k!=='railways');assert.equal(upgradeLink(s,l),false);
});
test('Freight departs immediately, consumes steam fuel and arrives exactly once',()=>{
 const s=network(),l=s.state.links[0],a=s.town(l.from),b=s.town(l.to),food=a.res.food,target=b.res.food,coal=a.res.coal;
 const tr=dispatch(s,l,a,{food:100});assert.ok(tr);assert.equal(a.res.food,food-100);assert.equal(a.res.coal,coal-2);assert.equal(b.res.food,target);
 s.state.tick=Math.ceil(tr.arrival*4);s.dailyTrips();assert.equal(b.res.food,target+100);assert.equal(l.delivered,100);s.dailyTrips();assert.equal(b.res.food,target+100);
});
test('Passengers reserve destination beds, keep identity and carry provisions',()=>{
 const s=network(),l=s.state.links[0],a=s.town(l.from),b=s.town(l.to),p=s.residents(a)[0],start=s.alive.length;
 b.knowledge=['agriculture'];const tr=dispatch(s,l,a,{},[p.id]);assert.ok(tr);assert.equal(p.tripId,tr.id);assert.ok(tr.cargo.food>0);assert.ok(!s.residents(a).some(q=>q.id===p.id));assert.equal(dispatch(s,l,a,{},[p.id]),false);
 const food=tr.cargo.food;s.state.tick=4;s.dailyTrips();assert.ok(tr.cargo.food<food);s.state.tick=Math.ceil(tr.arrival*4);s.dailyTrips();assert.equal(p.townId,b.id);assert.equal(p.tripId,null);assert.ok(p.houseId);assert.equal(s.alive.length,start);assert.equal(l.passengers,1);assert.ok(b.knowledge.includes('railways'));assert.deepEqual(s.invariants(),[]);
});
test('Over-capacity, invalid cargo and full destinations are rejected atomically',()=>{
 const s=network(),l=s.state.links[0],a=s.town(l.from),b=s.town(l.to),before={...a.res},p=s.residents(a)[0];
 for(const cargo of [{food:481},{food:-1},{food:NaN},{unobtainium:1}])assert.equal(dispatch(s,l,a,cargo),false);assert.deepEqual(a.res,before);
 p.carry={wood:900};assert.equal(dispatch(s,l,a,{},[p.id]),false);assert.deepEqual(a.res,before);p.carry={};
 b.buildings=b.buildings.filter(b=>!BUILDINGS[b.type].beds);b.land.navRevision++;assert.equal(dispatch(s,l,a,{},[p.id]),false);assert.deepEqual(a.res,before);
});
test('Market logistics carries scarce material; surplus is not duplicated',()=>{
 const s=network(),l=s.state.links[0],a=s.town(l.from),b=s.town(l.to);s.state.links=[l];a.res.food=0;a.res.meals=0;b.res.food=0;b.res.meals=0;a.res.steel=500;b.res.steel=0;l.lastDispatch=-99999;
 dailyNetwork(s);const trip=s.state.trips.find(tr=>tr.linkId===l.id);assert.ok(trip?.cargo.steel>0);assert.equal(a.res.steel+trip.cargo.steel+(l.project?(TRANSPORT[l.project.tier].cost.steel||0):0),500);assert.equal(b.res.steel,0);
});
test('Save/resume with city caches and an in-flight train remains deterministic',()=>{
 const a=network(),l=a.state.links[0];dispatch(a,l,a.town(l.from),{food:50});a.advanceDays(1);const b=Simulation.fromSnapshot(a.snapshot());a.advanceDays(8);b.advanceDays(8);assert.equal(JSON.stringify(a.snapshot()),JSON.stringify(b.snapshot()),'authoritative replay diverged');assert.deepEqual(a.invariants(),[]);
});
test('Legacy mature save migrates with every person and existing stockpile preserved',()=>{
 const old=JSON.parse(readFileSync(new URL('../saves/seed-481217-after-40-years.json',import.meta.url))),s=Simulation.fromSnapshot(old);
 assert.equal(s.state.version,3);assert.equal(s.alive.length,29);assert.equal(s.state.towns.length,4);assert.ok(s.state.links.length>0);
 for(const t of old.towns)for(const[k,v]of Object.entries(t.res))close(s.town(t.id).res[k],v);
 assert.deepEqual(old.people.map(p=>p.id),s.state.people.map(p=>p.id));assert.deepEqual(s.invariants(),[]);s.advanceDays(2);assert.deepEqual(s.invariants(),[]);
});
test('Malformed links, overfull trains and duplicate passengers cannot enter a live save',()=>{
 const s=network(),before=s.snapshot();
 for(const change of [d=>d.links[0].tier=99,d=>d.links[0].route[0].lat=99,d=>d.links[0].delivered=-1,d=>d.nextLink=1,d=>d.links.push({...d.links[0]}),d=>d.towns[0].land.streets[0]=99,d=>d.trips.push({id:999,kind:'freight',linkId:1,mode:3,from:1,to:2,start:0,arrival:5,route:d.links[0].route,cargo:{food:9000},people:[]})]){const data=s.snapshot();change(data);assert.throws(()=>Simulation.fromSnapshot(data));}
 assert.deepEqual(s.snapshot(),before);assert.equal(validateSave(before),true);
});
