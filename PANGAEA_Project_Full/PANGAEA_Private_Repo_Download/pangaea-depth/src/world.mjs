/** Seeded geography and walkable settlement grids. No renderer or wall clock dependency. */
export const TAU = Math.PI * 2, RAD = Math.PI / 180;
export const GRID_W = 96, GRID_H = 80, TILE = 20;
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
export function geography(u, v, seed) {
  const mass = Math.max(ell(u, v, .505, .50, .235, .35), ell(u, v, .60, .37, .18, .22), ell(u, v, .40, .34, .17, .23), ell(u, v, .575, .72, .145, .19), ell(u, v, .32, .55, .145, .11));
  const field = mass + (fbm(u * 13, v * 13, seed) - .49) * .5 + (fbm(u * 32, v * 29, seed + 32) - .5) * .17;
  const moisture = fbm(u * 11 + 9, v * 10 + 3, seed + 17);
  const ridge = fbm(u * 20, v * 19, seed + 12) * .54 + Math.max(0, field) * .25;
  return { field, moisture, ridge, land: field > .018, coast: field < .20, biome: moisture > .58 ? 'Temperate forest' : moisture > .39 ? 'Grassland' : 'Dry steppe' };
}
export function geoAt(lon, lat, seed) { return geography(((lon / TAU + .5) % 1 + 1) % 1, .5 - lat / Math.PI, seed); }
export function findFirstSite(seed) {
  let best, score = -Infinity;
  for (let y = -12; y < 30; y += 2) for (let x = -80; x < -22; x += 2) {
    const lon = x * RAD, lat = y * RAD, g = geoAt(lon, lat, seed);
    if (!g.land || g.field < .05 || g.field > .5) continue;
    const s = -Math.abs(g.field - .22) * 3 + g.moisture - Math.abs(lat - .12) * .3;
    if (s > score) { best = { lon, lat }; score = s; }
  }
  return best || { lon: -.5, lat: .1 };
}
/** A small original binary heap used by A*. This is not a copied library. */
export class MinHeap {
  constructor() { this.items = []; }
  push(id, score) {
    const a = this.items, item = { id, score }; let i = a.length; a.push(item);
    while (i > 0) { const p = (i - 1) >> 1; if (a[p].score <= score) break; a[i] = a[p]; i = p; } a[i] = item;
  }
  pop() {
    const a = this.items, root = a[0], last = a.pop(); if (!a.length) return root;
    let i = 0; while (i * 2 + 1 < a.length) { let c = i * 2 + 1; if (c + 1 < a.length && a[c + 1].score < a[c].score) c++; if (a[c].score >= last.score) break; a[i] = a[c]; i = c; } a[i] = last; return root;
  }
  get length() { return this.items.length; }
}
export function generateLocal(seed, town) {
  const s = (seed + town.id * 1987) >>> 0, geo = geoAt(town.lon, town.lat, seed);
  const tiles = [], nodes = [], roads = new Array(GRID_W * GRID_H).fill(0);
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
    const coast = 14 + 7 * Math.sin(y * .063 + town.id) + 5 * (fbm(y * .07, 4, s) - .5);
    const river = 78 + Math.sin(y * .09 + town.id) * 7;
    const water = geo.coast && x < coast;
    const stream = Math.abs(x - river) < .9;
    const ford = stream && (Math.abs(y - 22) < 2 || Math.abs(y - 57) < 2);
    const n = fbm(x * .072, y * .072, s);
    const safe = Math.hypot(x - 47, y - 40) < 13;
    const type = water ? 'water' : stream && !safe ? (ford ? 'ford' : 'river') : geo.coast && x < coast + 2 ? 'sand' : n > .65 ? 'rock' : 'grass';
    const fertility = clamp(.45 + noise(x * .08, y * .08, s + 73) * .65 + (Math.abs(x - river) < 7 ? .15 : 0), .3, 1);
    tiles.push({ type, fertility, forest: !safe && n > .48, walkable: type !== 'water' && type !== 'river' });
    if (safe || type === 'water' || type === 'river' || type === 'ford') continue;
    const r = hash(x, y, s + 121); let kind = null;
    if (n > .47 && r > .83) kind = 'wood';
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
  return { tiles, nodes, roads, revision: 0 };
}
export function footprint(building) {
  const w = building.type === 'farm' ? 5 : building.type === 'hall' ? 5 : 3;
  const h = building.type === 'farm' ? 4 : building.type === 'hall' ? 4 : 3;
  return { x0: building.x - Math.floor(w / 2), y0: building.y - Math.floor(h / 2), w, h };
}
export function walkable(town, x, y) {
  if (x < 1 || y < 1 || x >= GRID_W - 1 || y >= GRID_H - 1 || !town.land.tiles[y * GRID_W + x]?.walkable) return false;
  for (const b of town.buildings) {
    if (b.type === 'fire' || b.type === 'farm' || b.type === 'well') continue;
    const f = footprint(b); if (x >= f.x0 && x < f.x0 + f.w && y >= f.y0 && y < f.y0 + f.h) return false;
  }
  return true;
}
export function entrance(b) { const f = footprint(b); return { x: b.x, y: f.y0 + f.h }; }
/** Four-neighbour A*: no corner cutting, no water crossing; foot traffic lowers cost. */
export function findPath(town, ax, ay, bx, by) {
  const sx = Math.round(ax), sy = Math.round(ay), tx = Math.round(bx), ty = Math.round(by);
  if (!walkable(town, tx, ty)) return null;
  const start = sy * GRID_W + sx, goal = ty * GRID_W + tx;
  if (start === goal) return [];
  const g = new Float32Array(GRID_W * GRID_H); g.fill(Infinity); g[start] = 0;
  const parent = new Int32Array(g.length); parent.fill(-1); const closed = new Uint8Array(g.length), open = new MinHeap();
  open.push(start, 0); let count = 0;
  while (open.length && count++ < 6000) {
    const id = open.pop().id; if (closed[id]) continue; closed[id] = 1;
    if (id === goal) { const path = []; let j = goal; while (j !== start) { path.push({ x: j % GRID_W, y: Math.floor(j / GRID_W) }); j = parent[j]; if (j < 0) return null; } return path.reverse(); }
    const x = id % GRID_W, y = Math.floor(id / GRID_W);
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (!walkable(town, nx, ny)) continue;
      const ni = ny * GRID_W + nx, tile = town.land.tiles[ni];
      const cost = (tile.type === 'ford' ? 1.8 : tile.type === 'rock' ? 1.25 : 1) - Math.min(.25, town.land.roads[ni] * .003);
      const value = g[id] + cost;
      if (value < g[ni]) { g[ni] = value; parent[ni] = id; open.push(ni, value + .75 * (Math.abs(tx - nx) + Math.abs(ty - ny))); }
    }
  }
  return null;
}
/** Migration routes stay on a coarse land grid; detailed local maps are separate views. */
export function globalRoute(seed, from, to) {
  const w = 180, h = 90, cell = p => ({ x: clamp(Math.round((p.lon / TAU + .5) * w), 0, w - 1), y: clamp(Math.round((.5 - p.lat / Math.PI) * h), 1, h - 2) });
  const a = cell(from), b = cell(to), start = a.y * w + a.x, end = b.y * w + b.x;
  const parent = new Int32Array(w * h); parent.fill(-1); parent[start] = start; const q = [start]; let head = 0;
  while (head < q.length) {
    const id = q[head++]; if (id === end) break;
    const x = id % w, y = Math.floor(id / w);
    for (const [xx, yy] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const nx = (xx + w) % w; if (yy <= 0 || yy >= h - 1) continue; const ni = yy * w + nx;
      if (parent[ni] !== -1 || !geography(nx / w, yy / h, seed).land) continue; parent[ni] = id; q.push(ni);
    }
  }
  if (parent[end] === -1) return null;
  const out = []; let id = end;
  while (id !== start) { out.push({ lon: ((id % w) / w - .5) * TAU, lat: (.5 - Math.floor(id / w) / h) * Math.PI }); id = parent[id]; }
  out.push(from); out.reverse(); return out;
}
