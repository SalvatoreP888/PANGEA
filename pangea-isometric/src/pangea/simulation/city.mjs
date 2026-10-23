import FlatQueue from './vendor/flatqueue.mjs';
import {BUILDINGS} from './data.mjs';
import {GRID_W,GRID_H,footprint,entrance,walkable,findPath,hash} from './world.mjs';
export const housingBeds=b=>BUILDINGS[b.type]?.beds||0;
export function housingType(sim,t) {
  const production={iron:'furnace',steel:'steelworks',goods:'factory',bricks:'kiln'};
  return ['apartment','tenement','rowhouse','cottage','hut'].find(type=>{
    const def=BUILDINGS[type];return (!def.tech||sim.knowledge(t,def.tech))&&Object.entries(def.cost).every(([k,n])=>!production[k]||t.res[k]>=n||sim.buildings(t,production[k]).length);
  });
}
/** Irregular frontage parcels grow around actual streets; no reserved tile lattice. */
export function citySite(sim,t,type) {
  if(type==='fire')return {x:47,y:40};
  const candidates=[], occupied=new Uint8Array(GRID_W*GRID_H), nodes=new Set(t.land.nodes.filter(n=>n.amount>0).map(n=>n.y*GRID_W+n.x));
  for(const b of t.buildings){const f=footprint(b);for(let y=f.y0-1;y<=f.y0+f.h;y++)for(let x=f.x0-1;x<=f.x0+f.w;x++)if(x>=0&&y>=0&&x<GRID_W&&y<GRID_H)occupied[y*GRID_W+x]=1;const d=entrance(b);occupied[d.y*GRID_W+d.x]=1;}
  for(const p of sim.residents(t))occupied[p.y*GRID_W+p.x]=1;
  for(let y=5;y<GRID_H-5;y++)for(let x=5;x<GRID_W-5;x++){
    if(hash(x,y,sim.state.seed+t.id*37)>.32)continue;
    if(type==='fishery'&&!riverBank(t,x,y))continue;
    const f=footprint({x,y,type});let legal=true;
    for(let yy=f.y0;yy<f.y0+f.h;yy++)for(let xx=f.x0;xx<f.x0+f.w;xx++){
      const i=yy*GRID_W+xx;
      if(!walkable(t,xx,yy)||occupied[i]||nodes.has(i)||t.land.streets?.[i])legal=false;
    }
    const d=entrance({x,y,type});if(!legal||!walkable(t,d.x,d.y)||occupied[d.y*GRID_W+d.x])continue;
    const r=Math.hypot(x-47,(y-40)*1.1),industrial=['mine','furnace','steelworks','factory','station'].includes(type);
    let frontage=7;
    for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++)if(t.land.streets?.[(d.y+dy)*GRID_W+d.x+dx])frontage=Math.min(frontage,Math.hypot(dx,dy));
    const score=['farm','wheatfield','flaxfield'].includes(type)?Math.abs(r-23)*.8-t.land.tiles[y*GRID_W+x].fertility*8:r*.45+frontage*2.2+(industrial?(x<52?12:0):0)+hash(x,y,t.id)*3.5;
    candidates.push({x,y,score});
  }
  candidates.sort((a,b)=>a.score-b.score||a.y-b.y||a.x-b.x);
  for(const site of candidates){const d=entrance({...site,type});if(findPath(t,47,43,d.x,d.y))return {x:site.x,y:site.y};}
  return null;
}
// Reciprocal, explicit edges: proximity alone never implies a road junction.
export const STREET_DIRECTIONS=[{dx:1,dy:0,bit:1,opposite:4},{dx:0,dy:1,bit:2,opposite:8},{dx:-1,dy:0,bit:4,opposite:1},{dx:0,dy:-1,bit:8,opposite:2}];
export const STREET_NETWORK_VERSION=2;
/** Connect a door to the first existing street reached, not another full route to the hearth. */
export function streetBranch(t,door) {
  if(!walkable(t,door.x,door.y))return null;
  const start=door.y*GRID_W+door.x,root=43*GRID_W+47;
  if(t.land.streets?.[start])return [door];
  const size=GRID_W*GRID_H,g=new Float64Array(size);g.fill(Infinity);g[start]=0;
  const parent=new Int32Array(size);parent.fill(-1);const visited=new Uint8Array(size),queue=new FlatQueue();queue.push(start,0);
  const resources=new Set(t.land.nodes.filter(n=>n.amount>0).map(n=>n.y*GRID_W+n.x));
  while(queue.length){
    const id=queue.pop();if(visited[id])continue;visited[id]=1;
    if(id===root||t.land.streets?.[id]){
      const branch=[];for(let k=id;k!==-1;k=parent[k])branch.push({x:k%GRID_W,y:Math.floor(k/GRID_W)});
      return branch.reverse();
    }
    const x=id%GRID_W,y=Math.floor(id/GRID_W),previous=parent[id];
    for(const {dx,dy}of STREET_DIRECTIONS){
      const nx=x+dx,ny=y+dy;if(!walkable(t,nx,ny))continue;
      const ni=ny*GRID_W+nx,turn=previous<0?0:((id-previous)===(ni-id)?0:.35);
      const cost=1+turn+(resources.has(ni)?3:0)+(t.land.tiles[ni].type==='ford'?2:0)+hash(nx,ny,t.id)*.08;
      if(g[id]+cost<g[ni]){g[ni]=g[id]+cost;parent[ni]=id;queue.push(ni,g[ni]);}
    }
  }
  return null;
}
export function connectStreet(sim,t,b,trailOnly=false,restoredTier=0) {
  t.land.streets||=new Array(GRID_W*GRID_H).fill(0);
  t.land.streetEdges||=new Array(GRID_W*GRID_H).fill(0);
  t.land.streetNetworkVersion=STREET_NETWORK_VERSION;
  const path=streetBranch(t,entrance(b));if(!path)return false;
  const fresh=path.filter(p=>!t.land.streets[p.y*GRID_W+p.x]);
  const desired=restoredTier||(trailOnly?1:sim.knowledge(t,'paving')?3:sim.knowledge(t,'roads')?2:1);
  const price=desired===3?{stone:fresh.length*.4}:desired===2?{wood:fresh.length*.08,stone:fresh.length*.08}:{};
  const tier=restoredTier||((sim.spend(t,price,'Local street construction'))?desired:1);
  for(let i=0;i<path.length;i++){
    const q=path[i],index=q.y*GRID_W+q.x;t.land.streets[index]=Math.max(tier,t.land.streets[index]);
    if(i){const prev=path[i-1],pi=prev.y*GRID_W+prev.x,d=STREET_DIRECTIONS.find(d=>q.x-prev.x===d.dx&&q.y-prev.y===d.dy);t.land.streetEdges[pi]|=d.bit;t.land.streetEdges[index]|=d.opposite;}
  }
  t.land.navRevision=(t.land.navRevision||0)+1;t.land.revision++;
  return true;
}
/** Repair old saves once. Preserve people/buildings/supplies and existing surface investment. */
export function repairStreetNetwork(sim,t) {
  if(t.land.streetNetworkVersion===STREET_NETWORK_VERSION&&t.land.streetEdges)return false;
  const old=t.land.streets||[],highest=Math.max(1,...old);
  t.land.streets=new Array(GRID_W*GRID_H).fill(0);t.land.streetEdges=new Array(GRID_W*GRID_H).fill(0);
  t.land.streetNetworkVersion=STREET_NETWORK_VERSION;
  for(const b of [...t.buildings].filter(b=>b.complete).sort((a,b)=>a.id-b.id)){
    const d=entrance(b),tier=old[d.y*GRID_W+d.x]||highest;connectStreet(sim,t,b,true,tier);
  }
  return true;
}
/** Trace real edges into continuous strokes, stopping only at a junction or terminus. */
export function streetPolylines(t) {
  const edges=t.land.streetEdges||[],visited=new Set(),paths=[];
  const neighbours=id=>STREET_DIRECTIONS.filter(d=>(edges[id]&d.bit)).map(d=>id+d.dy*GRID_W+d.dx);
  const key=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;
  const trace=(start,next)=>{
    const ids=[start];let prev=start,id=next;visited.add(key(prev,id));
    while(true){ids.push(id);const adjacent=neighbours(id);if(adjacent.length!==2)break;const target=adjacent.find(n=>n!==prev);if(visited.has(key(id,target)))break;visited.add(key(id,target));prev=id;id=target;}
    const points=ids.map(id=>({x:id%GRID_W,y:Math.floor(id/GRID_W)}));
    paths.push({points,tier:Math.min(...ids.map(id=>t.land.streets[id]||1))});
  };
  for(let id=0;id<edges.length;id++)if(edges[id]&&neighbours(id).length!==2)for(const n of neighbours(id))if(!visited.has(key(id,n)))trace(id,n);
  for(let id=0;id<edges.length;id++)if(edges[id])for(const n of neighbours(id))if(!visited.has(key(id,n)))trace(id,n);
  return paths;
}
export function upgradeStreets(sim,t) {
  const desired=sim.knowledge(t,'paving')?3:sim.knowledge(t,'roads')?2:1;
  if(desired===1||!t.land.streets)return;
  const cells=[];for(let i=0;i<t.land.streets.length&&cells.length<12;i++)if(t.land.streets[i]>0&&t.land.streets[i]<desired)cells.push(i);
  if(!cells.length||!sim.spend(t,{stone:cells.length*(desired===3?.4:.08)},'Street resurfacing'))return;
  for(const i of cells)t.land.streets[i]=desired;
  t.land.navRevision=(t.land.navRevision||0)+1;t.land.revision++;
}

export function riverBank(t,x,y) {
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
    const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=GRID_W||ny>=GRID_H)continue;
    if(['river','water','ford'].includes(t.land.tiles[ny*GRID_W+nx]?.type))return true;
  }
  return false;
}
