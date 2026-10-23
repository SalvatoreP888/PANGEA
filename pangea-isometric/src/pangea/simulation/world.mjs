import FlatQueue from './vendor/flatqueue.mjs';
import {BUILDINGS,DEFAULT_PLANET,YEAR} from './data.mjs';
import {getTerrain,terrainAt,TERRAIN_W,TERRAIN_H} from './terrain.mjs';
/** Seeded geography and walkable settlement grids. No renderer or wall clock dependency. */
export const TAU = Math.PI * 2, RAD = Math.PI / 180;
export const GRID_W = 96, GRID_H = 80, TILE = 16;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const mix = (a, b, t) => a + (b - a) * t;
export function hash(x, y, seed = 1) {
  let n = Math.imul((x | 0) ^ seed, 374761393) + Math.imul((y | 0) ^ seed, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
export function noise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let tx = x - ix, ty = y - iy; tx *= tx * (3 - 2 * tx); ty *= ty * (3 - 2 * ty);
  return mix(mix(hash(ix, iy, seed), hash(ix + 1, iy, seed), tx), mix(hash(ix, iy + 1, seed), hash(ix + 1, iy + 1, seed), tx), ty);
}
export function fbm(x, y, seed) {
  let a = .5, total = 0;
  for (let i = 0; i < 4; i++) { total += noise(x, y, seed + i * 19) * a; x *= 2; y *= 2; a *= .5; }
  return total / .9375;
}
const ell = (u, v, x, y, rx, ry) => 1 - ((u - x) / rx) ** 2 - ((v - y) / ry) ** 2;
// Keep generation 1 unchanged: imported worlds retain their original coastlines.
function legacyGeography(u, v, seed,planet=DEFAULT_PLANET) {
  const mass = Math.max(ell(u, v, .505, .50, .235, .35), ell(u, v, .60, .37, .18, .22), ell(u, v, .40, .34, .17, .23), ell(u, v, .575, .72, .145, .19), ell(u, v, .32, .55, .145, .11));
  const field = mass + (fbm(u * 13, v * 13, seed) - .49) * .5 + (fbm(u * 32, v * 29, seed + 32) - .5) * .17;
  const moisture = fbm(u * 11 + 9, v * 10 + 3, seed + 17);
  const ridge = fbm(u * 20, v * 19, seed + 12) * .54 + Math.max(0, field) * .25;
  const climate=latitudeClimate((.5-v)*Math.PI,Math.max(0,Math.pow(clamp((ridge-.4)*3.5+Math.max(0,field)*.16,0,1),2)*4.2),moisture,planet,0);
  return {field,moisture,ridge,land:field>.018,coast:field<.20,...climate};
}
export function geography(u,v,seed,planet=DEFAULT_PLANET,generationVersion=1) {
  if(generationVersion===1)return legacyGeography(u,v,seed,planet);
  if(generationVersion!==2)throw new Error('Unsupported terrain generation version.');
  const g=terrainAt(u,v,seed);
  return {...g,...latitudeClimate((.5-v)*Math.PI,g.elevation,g.moisture,planet,0)};
}
export function geoAt(lon,lat,seed,planet=DEFAULT_PLANET,generationVersion=1) {return geography(((lon/TAU+.5)%1+1)%1,.5-lat/Math.PI,seed,planet,generationVersion);}
export function worldRivers(seed,generationVersion=1) {return generationVersion===2?getTerrain(seed).rivers:[];}
export function findFirstSite(seed,planet=DEFAULT_PLANET,generationVersion=1) {
  if(generationVersion===2){
    const t=getTerrain(seed);let best=null,bestScore=-Infinity;
    for(let y=12;y<TERRAIN_H-12;y++)for(let x=1;x<TERRAIN_W-1;x++){
      const id=y*TERRAIN_W+x;
      if(!t.land[id]||t.field[id]<.08||t.elevation[id]>1.2||t.slope[id]>.65)continue;
      const lon=(x/TERRAIN_W-.5)*TAU,lat=(.5-y/TERRAIN_H)*Math.PI;
      const g=geoAt(lon,lat,seed,planet,2);
      const comfort=1-Math.abs(g.meanTemperature-18)/35;
      const water=Math.min(1,t.flow[id]/8)*.85+(t.flow[id]>=8?.25:0)+(t.coastDistance[id]<=3?.35:0);
      const value=comfort*2+water+g.moisture*.65-g.elevation*.8-g.slope*.6+hash(x,y,seed)*.12;
      if(value>bestScore){best={lon,lat};bestScore=value;}
    }
    if(!best)throw new Error('Generated terrain has no safe founding site.');
    return best;
  }
  let best, score = -Infinity;
  for (let y = -12; y < 30; y += 2) for (let x = -80; x < -22; x += 2) {
    const lon = x * RAD, lat = y * RAD, g = geoAt(lon, lat, seed);
    if (!g.land || g.field < .05 || g.field > .5) continue;
    const s = -Math.abs(g.field - .22) * 3 + g.moisture - Math.abs(lat - .12) * .3;
    if (s > score) { best = { lon, lat }; score = s; }
  }
  return best || { lon: -.5, lat: .1 };
}
/** Original grid drainage: a least-cost downslope tree rooted at a boundary outlet. */
export function localDrainage(seed,townId) {
  const count=GRID_W*GRID_H,heights=new Float64Array(count);heights.fill(Infinity);
  const parent=new Int32Array(count);parent.fill(-1);const queue=new FlatQueue(),mouth=(GRID_H-1)*GRID_W+74;
  heights[mouth]=0;queue.push(mouth,0);
  while(queue.length){const id=queue.pop(),x=id%GRID_W,y=Math.floor(id/GRID_W);
    for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=GRID_W||ny>=GRID_H)continue;
      const next=ny*GRID_W+nx,centre=72+(noise(ny*.055,3,seed+townId)-.5)*12;
      const elevation=heights[id]+1+noise(nx*.13,ny*.13,seed+townId*17)*2+Math.abs(nx-centre)*.13;
      if(elevation<heights[next]){heights[next]=elevation;parent[next]=id;queue.push(next,elevation);}
    }
  }
  const cells=[];for(let id=72;id!==-1;id=parent[id])cells.push(id);
  return {cells,heights:Array.from(heights),outlet:mouth};
}
export function generateLocal(seed, town,planet=DEFAULT_PLANET,generationVersion=1) {
  const s = (seed + town.id * 1987) >>> 0, geo = geoAt(town.lon,town.lat,seed,planet,generationVersion);
  const forestStress=Math.max(0,.42-geo.precipitation)*.6+(geo.meanTemperature<0?.28:geo.meanTemperature<5?.1:0)+Math.max(0,geo.meanTemperature-32)*.015;
  const tiles=[],nodes=[],roads=new Array(GRID_W*GRID_H).fill(0),drainage=localDrainage(seed,town.id),riverCells=new Set(drainage.cells),riverX=new Array(GRID_H).fill(74);
  for(const id of drainage.cells)riverX[Math.floor(id/GRID_W)]=id%GRID_W;
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
    const coast = 14 + 7 * Math.sin(y * .063 + town.id) + 5 * (fbm(y * .07, 4, s) - .5);
    const river=riverX[y];
    const water = geo.coast && x < coast;
    const stream=riverCells.has(y*GRID_W+x);
    const ford = stream && (Math.abs(y - 22) < 2 || Math.abs(y - 57) < 2);
    const n = fbm(x * .072, y * .072, s);
    const safe = Math.hypot(x - 47, y - 40) < 13;
    const rockLimit=generationVersion===2?.70-geo.elevation*.055:.65;
    const type = water ? 'water' : stream && !safe ? (ford ? 'ford' : 'river') : geo.coast && x < coast + 2 ? 'sand' : n > rockLimit ? 'rock' : 'grass';
    const climateSoil=generationVersion===2?clamp(.65+geo.precipitation*.6-geo.elevation*.08,.45,1.15):1;
    const fertility = clamp((.45 + noise(x * .08, y * .08, s + 73) * .65 + (Math.abs(x - river) < 7 ? .15 : 0))*climateSoil, .3, 1);
    tiles.push({ type, fertility, forest: !safe && n > .48-(planet.forestCover-1)*.1+forestStress, walkable: type !== 'water' && type !== 'river' });
    if (safe || type === 'water' || type === 'river' || type === 'ford') continue;
    const r = hash(x, y, s + 121); let kind = null;
    if (n > .47-(planet.forestCover-1)*.08+forestStress && r > .83-(planet.forestCover-1)*.05) kind = 'wood';
    else if (r < .011 && n < .67) kind = 'food';
    else if (n > .59 && r < .06) kind = 'stone';
    else if (r > .79 && r < .795) kind = 'herbs';
    if (kind) { const max = { wood: 36, food: 60, stone: 170, herbs: 24 }[kind]; nodes.push({ id: nodes.length, x, y, kind, amount: max, max }); }
  }
  // A guaranteed reachable starter grove avoids seed-specific unwinnable openings.
  for (const [kind, x, y] of [['food', 37, 30], ['food', 35, 35], ['food', 40, 26], ['wood', 59, 34], ['wood', 59, 35], ['stone', 57, 50]]) {
    const max = { food: 70, wood: 50, stone: 170 }[kind];
    nodes.push({ id: nodes.length, x, y, kind, amount: max, max });
    tiles[y * GRID_W + x] = { type: 'grass', fertility: .85, forest: kind === 'wood', walkable: true };
  }
  // Geology is finite. These seams are authored starter guarantees, like the grove.
  for (let [kind,x,y] of [['ore',65,52],['coal',67,54],['ore',62,57],['coal',68,58],['clay',72,52],['clay',72,56]]) {
    if(!tiles[y*GRID_W+x].walkable){const choices=[];for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++)if(tiles[(y+dy)*GRID_W+x+dx]?.walkable)choices.push({x:x+dx,y:y+dy,d:Math.abs(dx)+Math.abs(dy)});choices.sort((a,b)=>a.d-b.d);if(!choices.length)continue;({x,y}=choices[0]);}
    const max=kind==='ore'?18000:kind==='clay'?14000:22000;
    nodes.push({id:nodes.length,x,y,kind,amount:max,max});
    tiles[y*GRID_W+x]={type:'rock',fertility:.4,forest:false,walkable:true};
  }
  const terrain=generationVersion===2?{generationVersion,biome:geo.biome,elevation:geo.elevation,moisture:geo.moisture,riverFlow:geo.riverFlow,basin:geo.basin,riverOrigin:geo.river?'watershed':'headwater'}:undefined;
  return { tiles, nodes, roads, drainage, ...(terrain?{terrain}:{}),streets:new Array(GRID_W*GRID_H).fill(0), streetEdges:new Array(GRID_W*GRID_H).fill(0), streetNetworkVersion:2, revision:0, navRevision:0 };
}
export function footprint(building) {
  const [w,h]=BUILDINGS[building.type]?.size||[2,2];
  return {x0:building.x-Math.floor(w/2),y0:building.y-Math.floor(h/2),w,h};
}
// Derived occupancy is rebuilt only after a layout change, not per A* neighbour.
const navigationCache=new WeakMap();
function navigation(town) {
  let cache=navigationCache.get(town);
  const rev=town.land.navRevision||0;
  if(cache && cache.count===town.buildings.length && cache.revision===rev)return cache;
  const blocked=new Uint8Array(GRID_W*GRID_H);
  for(let y=0;y<GRID_H;y++)for(let x=0;x<GRID_W;x++)if(x<1||y<1||x>=GRID_W-1||y>=GRID_H-1||!town.land.tiles[y*GRID_W+x]?.walkable)blocked[y*GRID_W+x]=1;
  for(const b of town.buildings){
    if(['fire','farm','well','market'].includes(b.type))continue;
    const f=footprint(b);
    for(let y=f.y0;y<f.y0+f.h;y++)for(let x=f.x0;x<f.x0+f.w;x++)if(x>=0&&y>=0&&x<GRID_W&&y<GRID_H)blocked[y*GRID_W+x]=1;
  }
  cache={count:town.buildings.length,revision:rev,blocked};navigationCache.set(town,cache);return cache;
}
export function walkable(town,x,y) {
  return Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x<GRID_W&&y<GRID_H&&!navigation(town).blocked[y*GRID_W+x];
}
export function entrance(b) {const f=footprint(b);return {x:b.x,y:f.y0+f.h};}
// Scratch state belongs to the local map, never a save or a returned route.
// Searches are synchronous; each result owns its point objects.
const pathScratch=new WeakMap(),PATH_DX=[1,-1,0,0],PATH_DY=[0,0,1,-1],PATH_CACHE_LIMIT=512;
/** Four-neighbour A*: no corner cutting, no water crossing; foot traffic lowers cost. */
export function findPath(town, ax, ay, bx, by) {
  const sx = Math.round(ax), sy = Math.round(ay), tx = Math.round(bx), ty = Math.round(by);
  if (!walkable(town, tx, ty)) return null;
  const start = sy * GRID_W + sx, goal = ty * GRID_W + tx;
  if (start === goal) return [];
  let scratch=pathScratch.get(town);
  if(!scratch){const size=GRID_W*GRID_H;scratch={g:new Float32Array(size),parent:new Int32Array(size),closed:new Uint8Array(size),open:new FlatQueue(),routes:new Map()};pathScratch.set(town,scratch);}
  const {g,parent,closed,open,routes}=scratch,blocked=navigation(town).blocked,tiles=town.land.tiles,streets=town.land.streets;
  if(scratch.blocked!==blocked||scratch.tiles!==tiles||scratch.streets!==streets){routes.clear();scratch.blocked=blocked;scratch.tiles=tiles;scratch.streets=streets;}
  const routeKey=start*(GRID_W*GRID_H)+goal;
  if(routes.has(routeKey)){
    const route=routes.get(routeKey);routes.delete(routeKey);routes.set(routeKey,route);
    return route===null?null:Array.from(route,id=>({x:id%GRID_W,y:Math.floor(id/GRID_W)}));
  }
  const rememberRoute=path=>{routes.set(routeKey,path===null?null:Uint16Array.from(path,p=>p.y*GRID_W+p.x));if(routes.size>PATH_CACHE_LIMIT)routes.delete(routes.keys().next().value);return path;};
  g.fill(Infinity);g[start]=0;parent.fill(-1);closed.fill(0);open.clear();
  open.push(start, 0); let count = 0;
  while (open.length && count++ < 6000) {
    const id = open.pop(); if (closed[id]) continue; closed[id] = 1;
    if (id === goal) { const path = []; let j = goal; while (j !== start) { path.push({ x: j % GRID_W, y: Math.floor(j / GRID_W) }); j = parent[j]; if (j < 0) return null; } return rememberRoute(path.reverse()); }
    const x = id % GRID_W, y = Math.floor(id / GRID_W);
    for (let direction=0;direction<4;direction++) {
      const nx=x+PATH_DX[direction],ny=y+PATH_DY[direction];
      if(nx<0||ny<0||nx>=GRID_W||ny>=GRID_H)continue;
      const ni=ny*GRID_W+nx;if(blocked[ni])continue;
      const tile=tiles[ni];
      const cost = (tile.type === 'ford' ? 1.8 : tile.type === 'rock' ? 1.25 : 1) - Math.min(.25, (streets?.[ni]||0) * .08);
      const value = g[id] + cost;
      if (value < g[ni]) { g[ni] = value; parent[ni] = id; open.push(ni, value + .75 * (Math.abs(tx - nx) + Math.abs(ty - ny))); }
    }
  }
  return rememberRoute(null);
}
/** Migration routes stay on a coarse land grid; detailed local maps are separate views. */
export function globalRoute(seed, from, to,generationVersion=1) {
  const w = 180, h = 90, cell = p => ({ x: generationVersion===2?((Math.round((p.lon / TAU + .5)*w)%w)+w)%w:clamp(Math.round((p.lon / TAU + .5) * w), 0, w - 1), y: clamp(Math.round((.5 - p.lat / Math.PI) * h), 1, h - 2) });
  const a = cell(from), b = cell(to), start = a.y * w + a.x, end = b.y * w + b.x;
  const terrain=generationVersion===2?getTerrain(seed):null;
  if(terrain&&(!terrain.land[start]||!terrain.land[end]))return null;
  const parent = new Int32Array(w * h); parent.fill(-1); parent[start] = start; const q = [start]; let head = 0;
  while (head < q.length) {
    const id = q[head++]; if (id === end) break;
    const x = id % w, y = Math.floor(id / w);
    for (const [xx, yy] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const nx = (xx + w) % w; if (yy <= 0 || yy >= h - 1) continue; const ni = yy * w + nx;
      if (parent[ni] !== -1 || !(terrain?terrain.land[ni]:geography(nx / w, yy / h, seed).land)) continue; parent[ni] = id; q.push(ni);
    }
  }
  if (parent[end] === -1) return null;
  const out = []; let id = end;
  while (id !== start) { out.push({ lon: ((id % w) / w - .5) * TAU, lat: (.5 - Math.floor(id / w) / h) * Math.PI }); id = parent[id]; }
  out.push({lon:from.lon,lat:from.lat}); out.reverse(); return out;
}

/** A compact climatology model: latitude heating, lapse rate, season and moisture belts. */
export function latitudeClimate(lat,elevation=0,moisture=.5,planet=DEFAULT_PLANET,day=0) {
  const latitude=Math.abs(lat)/(Math.PI/2),seasonal=Math.sin(day/YEAR*TAU)*10*Math.sin(lat);
  const meanTemperature=planet.temperature+16-50*Math.pow(latitude,1.15)-6.5*elevation;
  const temperature=meanTemperature+seasonal;
  // Equatorial rain, dry subtropics, temperate westerlies; elevation dries leeward proxy cells.
  const rainBelt=.65+.65*Math.exp(-(((latitude-.06)/.13)**2))-.35*Math.exp(-(((latitude-.33)/.12)**2))+.3*Math.exp(-(((latitude-.58)/.16)**2));
  const precipitation=clamp(moisture*planet.rainfall*rainBelt-elevation*.035,.03,1);
  const biome=meanTemperature< -6?'Ice cap':meanTemperature<2?'Tundra':meanTemperature<10?(precipitation>.3?'Taiga':'Cold steppe'):precipitation<.22?'Desert':meanTemperature>23?(precipitation>.55?'Rainforest':precipitation>.35?'Seasonal forest':'Savanna'):precipitation>.5?'Temperate forest':'Grassland';
  return {temperature,meanTemperature,precipitation,biome,elevation};
}
export function townClimate(seed,town,planet=DEFAULT_PLANET,day=0,generationVersion=1) {
  const g=geoAt(town.lon,town.lat,seed,planet,generationVersion);return latitudeClimate(town.lat,g.elevation,g.moisture,planet,day);
}
