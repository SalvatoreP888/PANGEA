/*! @license Apache-2.0
 * PANGEA grid drainage is adapted from Mapgen4 map.ts by Red Blob Games.
 * Copyright 2018 Red Blob Games <redblobgames@gmail.com>
 * Source: https://github.com/redblobgames/mapgen4/tree/c1d8cb018a11a8b9e17d59233c36c176429d37eb
 * Changes: orthogonal grid, priority-flood depression filling, independent physical
 * elevation, grid rainfall, basin identifiers and normalized river segments.
 * Full license: ./vendor/mapgen4.LICENSE
 */
import FlatQueue from './vendor/flatqueue.mjs';
import {createNoise2D} from './vendor/simplex-noise.mjs';

/** Generation is independent of the simulation RNG, render order and wall clock. */
export const TERRAIN_VERSION=2,TERRAIN_W=180,TERRAIN_H=90;
const COUNT=TERRAIN_W*TERRAIN_H,SEA_LEVEL=.018,RIVER_THRESHOLD=8;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const wrap=u=>((u%1)+1)%1;
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
function randomStream(seed) {
  // Avalanche nearby user seeds before constructing independent field streams.
  let state=Math.imul(seed^(seed>>>13),1274126177);state=(state^(state>>>16))>>>0;
  return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
}
function neighbours(id) {
  const x=id%TERRAIN_W,y=Math.floor(id/TERRAIN_W),out=[y*TERRAIN_W+(x+1)%TERRAIN_W,y*TERRAIN_W+(x+TERRAIN_W-1)%TERRAIN_W];
  if(y>0)out.push(id-TERRAIN_W);if(y<TERRAIN_H-1)out.push(id+TERRAIN_W);
  return out;
}
function makeFields(seed) {
  const rand=randomStream(seed^0x71b9c4e3),n=createNoise2D(randomStream(seed^0x53a9267f));
  const continents=[],count=2+Math.floor(rand()*3),anchorU=.32+rand()*.36,anchorV=.44+rand()*.12;
  const rotation=rand()*Math.PI*2,spread=.10+rand()*.11;
  for(let i=0;i<count;i++){
    const angle=rotation+i/count*Math.PI*2+(rand()-.5)*.8;
    continents.push({u:clamp(anchorU+Math.cos(angle)*spread,.20,.80),v:clamp(anchorV+Math.sin(angle)*spread,.26,.74),rx:.15+rand()*.10,ry:.18+rand()*.12,angle:(rand()-.5)*1.5});
  }
  // Small independent islands make archipelagos without a shared ellipse template.
  for(let i=0;i<3;i++)continents.push({u:.12+rand()*.76,v:.20+rand()*.60,rx:.035+rand()*.045,ry:.045+rand()*.075,angle:rand()*Math.PI});
  const warp=.035+rand()*.025,beltAngle=rand()*Math.PI,c=Math.cos(beltAngle),s=Math.sin(beltAngle);
  function fields(u,v) {
    const wu=u+warp*n(u*3.1+17,v*3.1+29),wv=v+warp*n(u*3.1+43,v*3.1+7);
    let mass=-10;
    for(const continent of continents){
      const dx=wu-continent.u,dy=wv-continent.v,ca=Math.cos(continent.angle),sa=Math.sin(continent.angle);
      mass=Math.max(mass,1-((dx*ca+dy*sa)/continent.rx)**2-((-dx*sa+dy*ca)/continent.ry)**2);
    }
    const field=Math.min(mass+n(u*15+13,v*15+23)*.13+n(u*37+41,v*37+11)*.045,(Math.min(u,1-u)-.025)*30,(Math.min(v,1-v)-.05)*15);
    const interior=smooth((field-SEA_LEVEL)/.55);
    const bx=(u*c+v*s)*4.6+n(u*3+53,v*3+67)*.3,by=(-u*s+v*c)*3.4;
    const belt=Math.pow(1-Math.abs(n(bx+83,by+97)),5);
    const ridge=.20+interior*(.12+belt*.58);
    const elevation=field>SEA_LEVEL?.04+interior*.28+Math.pow(belt,1.2)*interior*3.5:Math.min(-.01,(field-SEA_LEVEL)*.5);
    const wetness=.5+n(u*5+107,v*5+131)*.3+n(u*17+3,v*17+47)*.08;
    return {field,ridge,elevation,wetness};
  }
  return {fields,continents};
}

/** Ocean-rooted priority flood. Flow follows a strict drainage surface; mountains
 * retain their physical elevation even where the drainage surface fills a basin. */
function drainage(elevation,land,moisture) {
  const downstream=new Int32Array(COUNT);downstream.fill(-1);
  const basin=new Int32Array(COUNT),filled=new Float64Array(COUNT),visited=new Uint8Array(COUNT),order=[];
  const queue=new FlatQueue();
  for(let i=0;i<COUNT;i++)if(!land[i]){visited[i]=1;filled[i]=elevation[i];basin[i]=i;queue.push(i,filled[i]);}
  while(queue.length){
    const id=queue.pop();order.push(id);
    for(const next of neighbours(id))if(!visited[next]){
      visited[next]=1;downstream[next]=id;basin[next]=basin[id];
      filled[next]=Math.max(elevation[next],filled[id]+.00001);
      queue.push(next,filled[next]);
    }
  }
  const flow=new Float64Array(COUNT);
  for(let i=0;i<COUNT;i++)if(land[i])flow[i]=.3+moisture[i]*moisture[i];
  for(let i=order.length-1;i>=0;i--){const id=order[i],target=downstream[id];if(target>=0)flow[target]+=flow[id];}
  return {downstream,basin,filled,flow};
}

// Derived, bounded cache; never serialized, never consumes the simulation RNG.
const cache=new Map();
export function getTerrain(seed) {
  seed>>>=0;
  if(cache.has(seed)){const value=cache.get(seed);cache.delete(seed);cache.set(seed,value);return value;}
  const {fields,continents}=makeFields(seed);
  const field=new Float64Array(COUNT),ridge=new Float64Array(COUNT),elevation=new Float64Array(COUNT),moisture=new Float64Array(COUNT),land=new Uint8Array(COUNT),slope=new Float64Array(COUNT);
  const coastDistance=new Int16Array(COUNT);coastDistance.fill(-1);
  const coastQueue=[];
  for(let id=0;id<COUNT;id++){
    const g=fields(id%TERRAIN_W/TERRAIN_W,Math.floor(id/TERRAIN_W)/TERRAIN_H);
    field[id]=g.field;ridge[id]=g.ridge;elevation[id]=g.elevation;moisture[id]=g.wetness;
    land[id]=g.field>SEA_LEVEL?1:0;
    if(!land[id]){coastDistance[id]=0;coastQueue.push(id);}
  }
  for(let head=0;head<coastQueue.length;head++)for(const next of neighbours(coastQueue[head]))if(coastDistance[next]<0){coastDistance[next]=coastDistance[coastQueue[head]]+1;coastQueue.push(next);}
  // Prevailing winds supply coastal moisture; uplift rains on the windward face
  // and reduces humidity available to the lee. Each row has open ocean at its edge.
  for(let y=0;y<TERRAIN_H;y++){
    const tropical=Math.abs(.5-y/TERRAIN_H)<1/6,direction=tropical?-1:1;
    let humidity=.85,previousHeight=0;
    for(let step=0;step<TERRAIN_W;step++){
      const x=direction===1?step:TERRAIN_W-1-step,id=y*TERRAIN_W+x;
      if(!land[id]){humidity=.85;previousHeight=0;continue;}
      const rise=Math.max(0,elevation[id]-previousHeight),lee=Math.max(0,previousHeight-elevation[id]);
      moisture[id]=clamp(moisture[id]*.52+humidity*.47+rise*.12-lee*.09,.10,.98);
      humidity=clamp(humidity*.96-rise*.09+.01,.12,.9);previousHeight=elevation[id];
    }
  }
  for(let id=0;id<COUNT;id++)if(land[id])for(const other of neighbours(id))if(land[other])slope[id]=Math.max(slope[id],Math.abs(elevation[id]-elevation[other]));
  const hydrology=drainage(elevation,land,moisture),rivers=[];
  for(let id=0;id<COUNT;id++)if(land[id]&&hydrology.flow[id]>=RIVER_THRESHOLD){
    const to=hydrology.downstream[id];
    rivers.push(Object.freeze({from:Object.freeze({u:id%TERRAIN_W/TERRAIN_W,v:Math.floor(id/TERRAIN_W)/TERRAIN_H}),to:Object.freeze({u:to%TERRAIN_W/TERRAIN_W,v:Math.floor(to/TERRAIN_W)/TERRAIN_H}),flow:hydrology.flow[id],basin:hydrology.basin[id]}));
  }
  const terrain={seed,width:TERRAIN_W,height:TERRAIN_H,field,ridge,elevation,moisture,land,slope,coastDistance,...hydrology,rivers:Object.freeze(rivers),continents,fields};
  cache.set(seed,terrain);if(cache.size>8)cache.delete(cache.keys().next().value);
  return terrain;
}

export function terrainAt(u,v,seed) {
  u=wrap(u);v=clamp(v,0,1);
  const t=getTerrain(seed),x=Math.round(u*TERRAIN_W)%TERRAIN_W,y=clamp(Math.round(v*TERRAIN_H),0,TERRAIN_H-1),id=y*TERRAIN_W+x;
  const raw=t.fields(u,v),isLand=raw.field>SEA_LEVEL,target=t.downstream[id],flow=isLand&&t.land[id]?t.flow[id]:0;
  return {field:raw.field,ridge:raw.ridge,elevation:Math.max(0,raw.elevation),land:isLand,coast:isLand&&t.coastDistance[id]<=2,
    moisture:t.moisture[id],slope:t.slope[id],coastDistance:t.coastDistance[id],river:flow>=RIVER_THRESHOLD?clamp(Math.log2(flow/RIVER_THRESHOLD+1)/5,0,1):0,
    riverFlow:flow,basin:t.basin[id],downstream:target<0?null:{u:target%TERRAIN_W/TERRAIN_W,v:Math.floor(target/TERRAIN_W)/TERRAIN_H}};
}
