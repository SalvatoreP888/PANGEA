import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Simulation} from '../src/sim.mjs';
import {BUILDINGS,RECIPES,TECH,DEFAULT_PLANET,RESOURCE_NAMES} from '../src/data.mjs';
import {citySite,connectStreet,streetPolylines,STREET_DIRECTIONS,riverBank} from '../src/city.mjs';
import {latitudeClimate,geoAt,GRID_W,GRID_H,entrance,walkable} from '../src/world.mjs';
import {fishWork,cropClimate,tickEconomy} from '../src/economy.mjs';
const fresh=planet=>new Simulation(481217,{events:false,planet});
function build(s,t,type){const site=citySite(s,t,type);assert.ok(site,`site for ${type}`);const b={id:s.state.nextBuilding++,type,...site,complete:true,funded:true,progress:BUILDINGS[type].work,created:s.day,crop:{sown:false,growth:0,yield:0},condition:100};t.buildings.push(b);t.land.navRevision++;connectStreet(s,t,b,true);return b;}
const job=(p,kind,extra={})=>p.task={kind,stage:'work',work:0,...extra};
function batch(s,t,p,kind){const r=RECIPES[kind],b=s.buildings(t,r.building)[0];p.x=47;p.y=43;job(p,'supply',{buildingId:b.id,recipeKind:kind});s.work(p,t);const shipment={...p.carry};Object.assign(p,entrance(b));job(p,'deliverInput',{buildingId:b.id});s.work(p,t);job(p,kind,{buildingId:b.id});s.work(p,t);job(p,'haulOutput',{buildingId:b.id,recipeKind:kind});s.work(p,t);p.x=47;p.y=43;job(p,'deliver');s.work(p,t);return shipment;}
function graph(t){let nodes=0,edges=0;for(const mask of t.land.streetEdges){if(mask)nodes++;if(mask&1)edges++;if(mask&2)edges++;}return {nodes,edges};}

test('Repeated foot traffic cannot create constructed streets or imaginary junctions',()=>{
 const s=fresh(),t=s.town(1);build(s,t,'cottage');build(s,t,'well');const before=JSON.stringify({streets:t.land.streets,edges:t.land.streetEdges,lines:streetPolylines(t)});t.land.roads.fill(120);assert.equal(JSON.stringify({streets:t.land.streets,edges:t.land.streetEdges,lines:streetPolylines(t)}),before);
});
test('Street branches join one existing network without creating grid loops',()=>{
 const s=fresh(),t=s.town(1);for(let i=0;i<30;i++)build(s,t,i%6===0?'farm':'cottage');
 const g=graph(t);assert.ok(g.nodes>40);assert.equal(g.edges,g.nodes-1,'new streets must form a connected tree, not lattice cycles');
 for(let i=0;i<t.land.streetEdges.length;i++)for(const d of STREET_DIRECTIONS)if(t.land.streetEdges[i]&d.bit)assert.ok(t.land.streetEdges[i+d.dy*GRID_W+d.dx]&d.opposite);
 const homes=t.buildings.filter(b=>b.type==='cottage');assert.ok(new Set(homes.map(b=>b.x%3)).size>1);assert.ok(new Set(homes.map(b=>b.y%3)).size>1);
});
test('Old city saves repair road geometry without moving people, buildings or stockpiles',()=>{
 const old=JSON.parse(readFileSync(new URL('../saves/cities-seed-481217-after-100-years.json',import.meta.url)));const s=Simulation.fromSnapshot(old);
 for(const original of old.towns){const t=s.town(original.id);assert.deepEqual(t.buildings,original.buildings);for(const[k,n]of Object.entries(original.res))assert.equal(t.res[k],n);assert.equal(t.land.streetNetworkVersion,2);const g=graph(t);assert.equal(g.edges,g.nodes-1);}
 assert.deepEqual(s.state.people.map(p=>[p.id,p.x,p.y,p.alive]),old.people.map(p=>[p.id,p.x,p.y,p.alive]));const again=Simulation.fromSnapshot(s.snapshot());assert.deepEqual(again.snapshot(),s.snapshot());
});
test('Unreciprocated street edges are rejected before a save replaces the live world',()=>{
 const s=fresh(),t=s.town(1);build(s,t,'cottage');const data=s.snapshot();const i=data.towns[0].land.streetEdges.findIndex(v=>v);data.towns[0].land.streetEdges[i]^=1;assert.throws(()=>Simulation.fromSnapshot(data));
});
test('Fisheries are sited on real banks and catch finite fish into carried inventory',()=>{
 const s=fresh(),t=s.town(1),b=build(s,t,'fishery'),p=s.alive[0];assert.ok(riverBank(t,b.x,b.y));const before=t.land.fishStock,stock=t.res.fish;job(p,'fish',{buildingId:b.id});s.work(p,t);assert.ok(p.carry.fish>0);assert.equal(t.res.fish,stock);assert.ok(Math.abs(before-t.land.fishStock-p.carry.fish)<1e-8);const cargo=p.carry.fish;job(p,'deliver');s.work(p,t);assert.equal(t.res.fish,stock+cargo);
 t.land.fishStock=0;job(p,'fish',{buildingId:b.id});s.work(p,t);assert.ok(!p.carry.fish);tickEconomy(s,t);assert.ok(t.land.fishStock>0&&t.land.fishStock<=t.land.fishCapacity);
});
test('Grain fields harvest grain, which is unavailable as bread until milling and baking',()=>{
 const s=fresh(),t=s.town(1),p=s.alive[0],field=build(s,t,'wheatfield');field.crop.yield=20;field.crop.sown=true;job(p,'farm',{buildingId:field.id});s.work(p,t);assert.ok(p.carry.grain>0);assert.equal(t.res.grain,0);assert.equal(t.res.bread,0);job(p,'deliver');s.work(p,t);assert.ok(t.res.grain>0);
 t.knowledge.push('milling');const mill=build(s,t,'mill'),bakery=build(s,t,'bakery');const grain=t.res.grain;t.res.flour=0;batch(s,t,p,'mill');assert.equal(t.res.grain+(mill.production.inputs.grain||0),grain-4);assert.equal(t.res.flour,3);const wood=t.res.wood;batch(s,t,p,'bake');assert.equal(t.res.flour,0);assert.equal(t.res.bread,3);assert.equal(t.res.wood+(bakery.production.inputs.wood||0),wood-.5);
 const bread=t.res.bread;job(p,'eat');s.work(p,t);assert.equal(t.res.bread,bread-1);
});
test('Brick and textile chains require their inputs and affect construction and warmth',()=>{
 const s=fresh(),t=s.town(1),p=s.alive[0];t.knowledge.push('ceramics','textiles');build(s,t,'kiln');build(s,t,'weaver');t.res.clay=3;t.res.flax=3;t.res.wood=1;batch(s,t,p,'fireBricks');assert.equal(t.res.clay,0);assert.equal(t.res.wood,0);assert.equal(t.res.bricks,2);assert.ok(BUILDINGS.tenement.cost.bricks>0);batch(s,t,p,'weave');assert.equal(t.res.flax,0);assert.equal(t.res.cloth,1);
 s.configurePlanet({...DEFAULT_PLANET,temperature:-15});p.needs.warmth=10;tickEconomy(s,t);assert.ok(t.res.cloth<1);assert.ok(p.needs.warmth>10);
});
test('Every production recipe fails atomically when one ingredient is unavailable',()=>{
 const s=fresh(),t=s.town(1),p=s.alive[0];t.knowledge=TECH.map(k=>k.id);
 for(const [kind,r]of Object.entries(RECIPES)){if(!s.buildings(t,r.building).length)build(s,t,r.building);for(const key of Object.keys(RESOURCE_NAMES))t.res[key]=0;const first=Object.keys(r.inputs)[0];for(const[k,v]of Object.entries(r.inputs))if(k!==first)t.res[k]=v;const before={...t.res};job(p,kind);s.work(p,t);assert.deepEqual(t.res,before,kind);}
});
test('Latitude, hemisphere season, elevation, rain and temperature change climate coherently',()=>{
 const equator=latitudeClimate(0),north=latitudeClimate(1.4),south=latitudeClimate(-1.4),mountain=latitudeClimate(0,3);assert.ok(equator.temperature>north.temperature+30);assert.equal(north.temperature,south.temperature);assert.ok(mountain.temperature<equator.temperature-18);
 assert.ok(latitudeClimate(.8,0,.5,DEFAULT_PLANET,90).temperature>latitudeClimate(-.8,0,.5,DEFAULT_PLANET,90).temperature);
 assert.ok(latitudeClimate(.2,0,.5,{...DEFAULT_PLANET,rainfall:.25}).precipitation<latitudeClimate(.2,0,.5,{...DEFAULT_PLANET,rainfall:2}).precipitation);
 assert.ok(cropClimate({...DEFAULT_PLANET,temperature:-15})<cropClimate(DEFAULT_PLANET));
});
test('Planet settings persist, reject malformed parameters and alter generated forest density',()=>{
 const sparse=fresh({...DEFAULT_PLANET,forestCover:.25}),dense=fresh({...DEFAULT_PLANET,forestCover:2});assert.ok(dense.town(1).land.nodes.filter(n=>n.kind==='wood').length>sparse.town(1).land.nodes.filter(n=>n.kind==='wood').length);
 for(const values of [{temperature:NaN},{rainfall:-1},{forestCover:99}])assert.throws(()=>sparse.configurePlanet(values));sparse.configurePlanet({...DEFAULT_PLANET,stormFrequency:0,droughtFrequency:0,temperature:3});const saved=Simulation.fromSnapshot(sparse.snapshot());assert.deepEqual(saved.state.planet,sparse.state.planet);
});
test('Zero storm/drought settings disable random events while explicit interventions remain available',()=>{
 const s=new Simulation(17,{planet:{stormFrequency:0,droughtFrequency:0}});s.advanceDays(360);assert.ok(!s.state.events.some(e=>e.type==='weather'));s.weatherEvent(s.town(1),'Storm');assert.equal(s.town(1).weather.kind,'Storm');
});
test('Mixed fantasy founders share settlement work and children inherit both lineages',()=>{
 const s=fresh(),t=s.town(1);assert.deepEqual(new Set(s.alive.map(p=>p.species)),new Set(['human','elf','dwarf','orc']));const [a,b]=s.alive;a.partnerId=b.id;b.partnerId=a.id;a.due=0;a.pregnantWith=b.id;s.demographics(t);const child=s.alive.at(-1);assert.deepEqual(new Set(child.heritage),new Set(['human','elf']));assert.equal(child.townId,t.id);assert.ok(child.species==='human'||child.species==='elf');const resumed=Simulation.fromSnapshot(s.snapshot());assert.deepEqual(resumed.snapshot(),s.snapshot());
});
test('Fisheries, crops and industry remain exact across a climate-aware save/resume',()=>{
 const a=fresh({...DEFAULT_PLANET,temperature:8,rainfall:1.3});a.advanceDays(500);const b=Simulation.fromSnapshot(a.snapshot());a.advanceDays(30);b.advanceDays(30);assert.equal(JSON.stringify(a.snapshot()),JSON.stringify(b.snapshot()));assert.deepEqual(a.invariants(),[]);
});

test('Generated river cells follow a strictly descending height field into the outlet',()=>{
 const s=fresh();for(const t of s.state.towns){const {cells,heights,outlet}=t.land.drainage;assert.ok(cells.length>=GRID_H);assert.equal(cells.at(-1),outlet);assert.equal(new Set(cells).size,cells.length);for(let i=1;i<cells.length;i++){assert.ok(heights[cells[i]]<heights[cells[i-1]]);const a=cells[i-1],b=cells[i];assert.equal(Math.abs(a%GRID_W-b%GRID_W)+Math.abs(Math.floor(a/GRID_W)-Math.floor(b/GRID_W)),1);}assert.ok(cells.every(i=>['river','ford','water'].includes(t.land.tiles[i].type)));}
});

test('Specialist fields stop consuming labour when their stored output exceeds local demand',()=>{
 const s=fresh(),t=s.town(1),p=s.alive[0],field=build(s,t,'wheatfield');field.crop.sown=true;field.crop.yield=25;t.res.grain=10000;assert.ok(!s.scoreActions(p,t).some(c=>c.kind==='farm'&&c.buildingId===field.id));t.res.grain=0;assert.ok(s.scoreActions(p,t).some(c=>c.kind==='farm'&&c.buildingId===field.id));
});
