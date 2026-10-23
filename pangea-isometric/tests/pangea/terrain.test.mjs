import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {getTerrain,TERRAIN_W,TERRAIN_H} from '../../src/pangea/simulation/terrain.mjs';
import {geography,geoAt,findFirstSite,generateLocal,globalRoute,worldRivers,townClimate} from '../../src/pangea/simulation/world.mjs';
import {Simulation} from '../../src/pangea/simulation/sim.mjs';
import {DEFAULT_PLANET} from '../../src/pangea/simulation/data.mjs';

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const terrainDigest=t=>digest([Array.from(t.field),Array.from(t.moisture),Array.from(t.downstream),Array.from(t.flow),t.rivers]);

test('Legacy terrain and complete local generation retain their pre-upgrade fingerprints',()=>{
  const points=[];
  for(const seed of [1,481217,98765])for(let y=0;y<20;y++)for(let x=0;x<30;x++)points.push(geography(x/30,y/20,seed,DEFAULT_PLANET,1));
  assert.equal(digest(points),'714138f146853b717c50590477f0af9bef6168f559785b64805bc017587ca00f');
  const local=generateLocal(481217,{id:1,...findFirstSite(481217)},DEFAULT_PLANET,1);
  assert.equal(digest(local),'607d385aef1bc3c6d85da8799e2c3ef94d807cedc8b115295f93a17c614f7dc4');
  assert.deepEqual(worldRivers(481217,1),[]);
});

test('Seeded continents and watersheds regenerate exactly after cache eviction without global randomness',()=>{
  const originalRandom=Math.random;
  try{
    Math.random=()=>{throw new Error('Terrain must not use global random state');};
    const original=getTerrain(481217),fingerprint=terrainDigest(original),site=findFirstSite(481217,DEFAULT_PLANET,2);
    for(let seed=100;seed<110;seed++)getTerrain(seed);
    const regenerated=getTerrain(481217);
    assert.notEqual(original,regenerated);
    assert.equal(terrainDigest(regenerated),fingerprint);
    assert.deepEqual(findFirstSite(481217,DEFAULT_PLANET,2),site);
    assert.equal(worldRivers(481217,2),regenerated.rivers);
  }finally{Math.random=originalRandom;}
});

test('Different seeds alter continental layout and a seed corpus has usable climates and founding sites',()=>{
  const first=getTerrain(1),second=getTerrain(2);
  const different=first.land.reduce((n,v,i)=>n+(v!==second.land[i]?1:0),0)/first.land.length;
  assert.ok(different>.15,`continental occupancy differs by ${different}`);
  for(const seed of [0,1,2,3,4,9,42,817,98765,481217,2147483647,4294967295]){
    const t=getTerrain(seed),coverage=t.land.reduce((n,v)=>n+v,0)/t.land.length;
    assert.ok(coverage>.12&&coverage<.60,`${seed}: ${coverage} land coverage`);
    assert.ok(t.rivers.length>30,`${seed}: visible branching rivers`);
    const biomes=new Set();let mountains=0;
    for(let y=0;y<TERRAIN_H;y+=2)for(let x=0;x<TERRAIN_W;x+=2){const g=geography(x/TERRAIN_W,y/TERRAIN_H,seed,DEFAULT_PLANET,2);if(g.land){biomes.add(g.biome);if(g.elevation>2)mountains++;}}
    assert.ok(biomes.size>=4,`${seed}: ${[...biomes]}`);assert.ok(mountains>0);
    const site=findFirstSite(seed,DEFAULT_PLANET,2),g=geoAt(site.lon,site.lat,seed,DEFAULT_PLANET,2);
    assert.ok(g.land&&g.slope<=.65&&g.elevation<=1.2);
    assert.ok(g.meanTemperature>5&&g.meanTemperature<28);
    assert.ok(g.river>0||g.coastDistance<=3,'founders have access to water');
  }
});

test('Every watershed is acyclic, strictly drains to ocean and accumulates tributary rainfall',()=>{
  for(const seed of [1,481217,98765]){
    const t=getTerrain(seed);
    for(let id=0;id<t.land.length;id++){
      assert.ok(Number.isFinite(t.filled[id])&&Number.isFinite(t.flow[id])&&t.flow[id]>=0);
      if(!t.land[id]){assert.equal(t.downstream[id],-1);continue;}
      const to=t.downstream[id];assert.ok(to>=0);
      const dx=Math.abs(id%TERRAIN_W-to%TERRAIN_W),dy=Math.abs(Math.floor(id/TERRAIN_W)-Math.floor(to/TERRAIN_W));
      assert.equal(Math.min(dx,TERRAIN_W-dx)+dy,1);
      assert.ok(t.filled[id]>t.filled[to]);assert.ok(t.flow[to]>=t.flow[id]);assert.equal(t.basin[id],t.basin[to]);
      let last=id,steps=0;
      while(t.downstream[last]>=0){last=t.downstream[last];assert.ok(++steps<t.land.length);}
      assert.equal(t.land[last],0);assert.equal(last,t.basin[id]);
    }
    for(const segment of t.rivers){
      const id=Math.round(segment.from.v*TERRAIN_H)*TERRAIN_W+Math.round(segment.from.u*TERRAIN_W);
      assert.equal(t.flow[id],segment.flow);assert.ok(t.land[id]);assert.ok(segment.flow>=8);
      assert.equal(geoAt((segment.from.u-.5)*Math.PI*2,(.5-segment.from.v)*Math.PI,seed,DEFAULT_PLANET,2).land,true);
    }
  }
});

test('Local geography inherits the authoritative biome, water and soil conditions without moving founders',()=>{
  const sim=new Simulation(481217),t=sim.town(1),g=geoAt(t.lon,t.lat,sim.state.seed,sim.state.planet,sim.state.generationVersion);
  assert.equal(sim.state.generationVersion,2);assert.equal(sim.alive.length,4);
  assert.equal(t.land.terrain.biome,g.biome);assert.equal(t.land.terrain.basin,g.basin);assert.equal(t.land.terrain.riverFlow,g.riverFlow);
  assert.equal(t.land.terrain.moisture,g.moisture);
  for(const p of sim.alive)assert.ok(t.land.tiles[p.y*96+p.x].walkable);
  const climate=townClimate(sim.state.seed,t,sim.state.planet,0,2);assert.equal(climate.biome,g.biome);
  const route=globalRoute(sim.state.seed,t,t,2);assert.ok(route?.length);
  assert.deepEqual(sim.invariants(),[]);
});

test('Old saves explicitly retain generation 1 while new save/resume remains exact',()=>{
  const old=JSON.parse(readFileSync(new URL('../saves/cities-seed-481217-after-100-years.json',import.meta.url)));
  const loaded=Simulation.fromSnapshot(old);
  assert.equal(loaded.state.generationVersion,1);
  assert.deepEqual(loaded.state.towns.map(t=>[t.lon,t.lat,t.land.tiles]),old.towns.map(t=>[t.lon,t.lat,t.land.tiles]));
  assert.deepEqual(loaded.state.people.map(p=>[p.id,p.x,p.y]),old.people.map(p=>[p.id,p.x,p.y]));
  const fresh=new Simulation(817,{events:false});fresh.advanceDays(50);
  const resumed=Simulation.fromSnapshot(fresh.snapshot());
  // Evict derived terrain between copies; cache history cannot change simulation.
  for(let seed=20;seed<30;seed++)getTerrain(seed);
  fresh.advanceDays(30);resumed.advanceDays(30);
  assert.deepEqual(resumed.snapshot(),fresh.snapshot());assert.equal(resumed.state.generationVersion,2);
  const bad=fresh.snapshot();bad.generationVersion=99;assert.throws(()=>Simulation.fromSnapshot(bad));
  assert.throws(()=>new Simulation(1,{generationVersion:99}));
});
