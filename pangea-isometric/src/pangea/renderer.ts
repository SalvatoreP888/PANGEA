/** PANGEA's two-scale renderer. IsoCity supplies projection, tiles and image caching;
 * PANGAEA owns every person, structure, inventory, route and simulation tick. */
import { gridToScreen } from '@/components/game/utils';
import { drawIsometricDiamond } from '@/components/game/drawing';
import { loadImage } from '@/components/game/imageLoader';
import { TILE_WIDTH, TILE_HEIGHT } from '@/components/game/types';
import { streetPolylines } from './simulation/city.mjs';
import { geography, hash, noise, worldRivers } from './simulation/world.mjs';
import type { WorldSimulation, Town, Selection, View, Building } from './model';
import { CameraTransition, zoomAt } from './camera.mjs';
import { buildingArt, buildingArtRect, loadBuildingArt, type BuildingArtImages } from './art';
import { settlementEmblem } from './simulation/identity.mjs';
import { CityActivityTracker, drawConstruction, drawBuildingActivity, drawCarrierCargo, drawTrip, buildingLight, drawCityLighting, type CityLight, type CityLightingMode } from './cityLife';

const NX = 104, NY = 96, PAD = 240;
const GW = 96, GH = 80;
const W = TILE_WIDTH, H = TILE_HEIGHT;
type Point = { x: number; y: number };
export type Hit = Point & { kind: 'town' | 'building' | 'person'; id: number; r: number; rect?:{w:number;h:number} };
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
type Geography = {land: boolean; field: number; moisture: number; ridge: number; biome: string};
const geo = geography as unknown as (u: number, v: number, seed: number, planet: Record<string, number>, generationVersion?:number) => Geography;
const random = hash as (x: number,y: number,seed: number) => number;
const colors = (top: string) => ({ top, left: '#4c523c', right: '#626549', stroke: top });

export class PangeaRenderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  sim: WorldSimulation;
  view: View = 'world';
  townId = 1;
  selected: Selection = null;
  labels = true;
  layer: 'natural' | 'fertility' | 'resources' = 'natural';
  lighting: CityLightingMode = 'day';
  width = 1000; height = 800; dpr = 1;
  camera = { x: 0, y: 0, zoom: .35 };
  hits: Hit[] = [];
  atlas: HTMLImageElement | null = null;
  groundPattern: CanvasPattern | null = null;
  ready = false;
  terrain: HTMLCanvasElement | null = null;
  terrainKey = '';
  worldBounds = {minX: 0, maxX: 1, minY: 0, maxY: 1};
  hovered: Hit | null = null;
  frameMs = 0;
  onReady?: () => void;
  private reduceMotion = false;
  private streetKey="";
  private streetPaths:{points:Point[];tier:number}[]=[];
  private artImages:BuildingArtImages = new Map();
  private activityTracker=new CityActivityTracker();
  private activity:ReturnType<CityActivityTracker['sample']>|null=null;
  private cityLights:CityLight[]=[];
  private transition = new CameraTransition();
  private transitionSnapshot: HTMLCanvasElement|null = null;
  constructor(canvas: HTMLCanvasElement, sim: WorldSimulation) {
    this.canvas = canvas; this.sim = sim;
    const ctx = canvas.getContext('2d', {alpha:false});
    if (!ctx) throw new Error('Canvas rendering is unavailable.');
    this.ctx = ctx;
    this.reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resize();
  }
  async init() {
    const [atlas,ground,art]=await Promise.all([loadImage('/pangea/atlas.png'),loadImage('/pangea/ground.png'),loadBuildingArt(loadImage)]);
    this.artImages=art;
    this.atlas=atlas; this.groundPattern=this.ctx.createPattern(ground,'repeat');this.groundPattern?.setTransform(new DOMMatrix().scale(.35));
    this.ready = true; this.rebuild(); this.focus(); this.onReady?.();
  }
  resize() {
    if(this.transition.active){const frame=this.transition.finish();if(frame)this.camera=frame.camera;this.transitionSnapshot=null;}
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width; this.height = rect.height;
    this.dpr = Math.min(devicePixelRatio || 1, 1.75);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
  }
  reset(sim: WorldSimulation) { this.activityTracker.reset();this.activity=null;this.transition.clear();this.transitionSnapshot=null;this.sim = sim; this.townId = sim.state.towns[0].id; this.selected=null; this.streetKey=''; this.terrainKey=''; this.rebuild(); this.focus(); }
  private sceneKey() {return this.view==='world'?'world':`settlement:${this.townId}`;}
  private sceneAnchor() {const town=this.sim.town(this.townId)!;if(this.view==='world')return this.worldPoint(town);const hall=town.buildings.find(b=>b.type==='hall'&&b.complete)||town.buildings[0];const p=this.iso(hall?.x??48,hall?.y??40);return {x:p.x+W/2,y:p.y+H/2};}
  cancelTransition() {if(this.transition.active){const frame=this.transition.cancel(performance.now());if(frame)this.camera=frame.camera;this.hits=[];this.hovered=null;}this.transitionSnapshot=null;}
  private moveScene(view:View,townId:number) {
    this.cancelTransition();const fromKey=this.sceneKey(),sourceCamera={...this.camera},sourceAnchor=this.sceneAnchor();
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(!reduced){const snapshot=document.createElement('canvas');snapshot.width=this.width;snapshot.height=this.height;snapshot.getContext('2d')?.drawImage(this.canvas,0,0,this.width,this.height);this.transitionSnapshot=snapshot;}
    this.view=view;this.townId=townId;this.selected=null;this.hovered=null;this.hits=[];this.streetKey='';this.terrainKey='';this.rebuild();this.focus(false);
    const frame=this.transition.begin({fromKey,toKey:this.sceneKey(),sourceCamera,targetCamera:this.camera,sourceAnchor,targetAnchor:this.sceneAnchor(),viewport:this,entryZoom:this.camera.zoom*(view==='settlement'?.24:2.2),now:performance.now(),reducedMotion:reduced});
    this.camera=frame.camera;if(!frame.active)this.transitionSnapshot=null;
  }
  setView(view: View) {if(view!==this.view)this.moveScene(view,this.townId);}
  setTown(id:number) {if(id===this.townId)return;if(this.view==='settlement')this.moveScene(this.view,id);else this.townId=id;}
  iso(x: number,y: number): Point {
    const p = gridToScreen(x,y,0,0);
    return { x:p.screenX+NY*W/2+PAD, y:p.screenY+PAD };
  }
  worldGrid(t: {lon: number;lat: number}) { return {x:(t.lon/(Math.PI*2)+.5)*NX, y:(.5-t.lat/Math.PI)*NY}; }
  worldPoint(t: {lon: number;lat: number}) {
    const g=this.worldGrid(t),p=this.iso(g.x,g.y);
    const e=geo(g.x/NX,g.y/NY,this.sim.state.seed,this.sim.state.planet,this.sim.state.generationVersion||1);
    return {x:p.x+W/2,y:p.y+H/2-this.elevation(e)};
  }
  private elevation(g: {field:number;ridge:number}) { return Math.max(0,g.field)*20+Math.max(0,g.ridge-.50)*65; }
  screen(p: Point): Point { return { x:(p.x-this.camera.x)*this.camera.zoom+this.width/2,y:(p.y-this.camera.y)*this.camera.zoom+this.height/2 }; }
  private sprite(c: CanvasRenderingContext2D,index: number,x: number,y: number,width: number,alpha=1) {
    if (!this.atlas) return;
    const sw=this.atlas.width/4,sh=this.atlas.height/2,h=width*sh/sw;
    c.save(); c.globalAlpha=alpha;
    c.drawImage(this.atlas,(index%4)*sw,Math.floor(index/4)*sh,sw,sh,x-width/2,y-h,width,h);c.restore();
  }
  private diamond(c: CanvasRenderingContext2D,x: number,y: number,fill: string) { drawIsometricDiamond(c,x,y,colors(fill),{drawStroke:false}); }
  private texture(c:CanvasRenderingContext2D,x:number,y:number) {
    if(!this.groundPattern||this.layer!=='natural')return;
    c.save();c.globalCompositeOperation='soft-light';c.globalAlpha=.72;c.fillStyle=this.groundPattern;
    c.beginPath();c.moveTo(x+W/2,y);c.lineTo(x+W,y+H/2);c.lineTo(x+W/2,y+H);c.lineTo(x,y+H/2);c.closePath();c.fill();c.restore();
  }
  rebuild() {
    if(!this.ready)return;
    const t=this.sim.town(this.townId)||this.sim.state.towns[0];
    const key=this.view==='world'?`w:${this.sim.state.seed}:${this.sim.state.generationVersion||1}:${this.sim.state.towns.length}:${this.layer}`:`t:${t.id}:${this.sim.season}:${this.layer}`;
    if(key===this.terrainKey)return;
    this.terrainKey=key;
    const terrain=document.createElement('canvas');
    terrain.width=(NX+NY)*W/2+PAD*2;terrain.height=(NX+NY)*H/2+PAD*2;
    const c=terrain.getContext('2d')!;
    if(this.view==='world')this.worldTerrain(c);else this.localTerrain(c,t);
    this.terrain=terrain;
  }
  private worldTerrain(c: CanvasRenderingContext2D) {
    const seed=this.sim.state.seed,planet=this.sim.state.planet;
    const version=this.sim.state.generationVersion||1;
    const data=Array.from({length:NY},(_,y)=>Array.from({length:NX},(_,x)=>geo(x/NX,y/NY,seed,planet,version)));
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    // Ocean contour bands follow the same seeded land mask as the simulation.
    for(let y=0;y<NY;y++)for(let x=0;x<NX;x++){
      const g=data[y][x];if(g.land)continue;const p=this.iso(x,y);
      const shore=[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>data[y+dy]?.[x+dx]?.land);
      if(shore){this.diamond(c,p.x,p.y,'#43727a');c.strokeStyle='#bed2bf33';c.lineWidth=1;c.beginPath();c.moveTo(p.x+5,p.y+H/2);c.lineTo(p.x+W/2,p.y+H-3);c.lineTo(p.x+W-5,p.y+H/2);c.stroke();}
    }
    for(let sum=0;sum<NX+NY;sum++)for(let y=0;y<NY;y++){
      const x=sum-y;if(x<0||x>=NX)continue;const g=data[y][x];if(!g.land)continue;
      const p=this.iso(x,y),e=this.elevation(g),q=random(x,y,seed),smooth=noise(x*.12,y*.12,seed);
      minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x+W);minY=Math.min(minY,p.y-e-80);maxY=Math.max(maxY,p.y+H);
      // Visible cliff faces supply actual height and depth, rather than a flat diamond map.
      c.fillStyle='#62674c';c.beginPath();c.moveTo(p.x,p.y+H/2-e);c.lineTo(p.x+W/2,p.y+H-e);c.lineTo(p.x+W/2,p.y+H+7);c.lineTo(p.x,p.y+H/2+7);c.fill();
      c.fillStyle='#454d40';c.beginPath();c.moveTo(p.x+W/2,p.y+H-e);c.lineTo(p.x+W,p.y+H/2-e);c.lineTo(p.x+W,p.y+H/2+7);c.lineTo(p.x+W/2,p.y+H+7);c.fill();
      const nearCoast=g.field<.12;
      let fill=nearCoast?`hsl(48 25% ${50+smooth*4}%)`:`hsl(${62+g.moisture*28} ${21+g.moisture*9}% ${31+smooth*4+(1-g.moisture)*7}%)`;
      if(g.biome==='Desert')fill=`hsl(42 31% ${52+smooth*6}%)`;
      if(g.biome==='Ice cap'||g.biome==='Tundra')fill=`hsl(80 8% ${52+smooth*5}%)`;
      if(this.layer==='fertility')fill=`hsl(${35+g.moisture*95} 35% ${30+q*6}%)`;
      this.diamond(c,p.x,p.y-e,fill);this.texture(c,p.x,p.y-e);
      // Fine meadow grain, cached once; geometry is always generated from the world's seed.
      for(let j=0;j<5;j++){const rx=random(x*9+j,y,seed+12),ry=random(x,y*8+j,seed+23);c.fillStyle=j%2?'#e1d19c14':'#293c2825';c.fillRect(p.x+W/2+(rx-.5)*35,p.y-e+H/2+(ry-.5)*14,2+q*3,.8);}
      const cityNear=this.sim.state.towns.some(t=>{const a=this.worldGrid(t);return Math.hypot(a.x-x,a.y-y)<2.5;});
      if(this.layer==='resources'&&g.ridge>.54&&q>.9){c.fillStyle='#e5d8a9';c.beginPath();c.arc(p.x+W/2,p.y+H/2-e,4,0,Math.PI*2);c.fill();}
      if(!cityNear&&g.ridge>.54&&g.field>.35&&q>.64)this.sprite(c,5,p.x+W/2,p.y+H/2-e+6,95+q*55);
      else if(!cityNear&&g.moisture>.43&&g.field>.15&&q>.28){this.sprite(c,g.moisture>.54?4:6,p.x+W/2,p.y+H/2-e+8,32+q*25);if(q>.77)this.sprite(c,4,p.x+W/2-17,p.y+H/2-e+12,34);}
    }
    // Join authoritative drainage edges into continuous, softly curved channels.
    // This smooths their presentation without changing a basin or river mouth.
    const rivers=worldRivers(seed,version).filter(r=>r.flow>=12),key=(p:{u:number;v:number})=>`${p.u},${p.v}`;
    const downstream=new Map(rivers.map(r=>[key(r.from),r])),incoming=new Map<string,number>();
    for(const r of rivers)incoming.set(key(r.to),(incoming.get(key(r.to))||0)+1);
    c.lineCap='round';c.lineJoin='round';
    for(const start of rivers){
      if(incoming.get(key(start.from))===1)continue;
      const chain=[start.from];let edge=start,flow=start.flow;
      for(let guard=0;guard<rivers.length;guard++){chain.push(edge.to);flow=Math.max(flow,edge.flow);const next=downstream.get(key(edge.to));if(!next||incoming.get(key(edge.to))!==1)break;edge=next;}
      const points=chain.map(r=>{const p=this.iso(r.u*NX,r.v*NY),g=geo(r.u,r.v,seed,planet,version);return {x:p.x+W/2,y:p.y+H/2-this.elevation(g)};});
      const width=clamp(Math.log2(1+flow)*.38,1,3.8);
      c.beginPath();c.moveTo(points[0].x,points[0].y);
      for(let i=1;i<points.length-1;i++)c.quadraticCurveTo(points[i].x,points[i].y,(points[i].x+points[i+1].x)/2,(points[i].y+points[i+1].y)/2);
      c.lineTo(points.at(-1)!.x,points.at(-1)!.y);c.strokeStyle='#263f3b80';c.lineWidth=width+2;c.stroke();c.strokeStyle='#668f93';c.lineWidth=width;c.stroke();
    }
    this.worldBounds={minX,maxX,minY,maxY};
  }
  private localTerrain(c: CanvasRenderingContext2D,t: Town) {
    const seed=this.sim.state.seed+t.id*1987;
    for(let sum=0;sum<GW+GH;sum++)for(let y=0;y<GH;y++){
      const x=sum-y;if(x<0||x>=GW)continue;const tile=t.land.tiles[y*GW+x];const p=this.iso(x,y),q=random(x,y,seed),smooth=noise(x*.11,y*.11,seed);
      let fill=['water','river','ford'].includes(tile.type)?`hsl(192 29% ${30+smooth*4}%)`:tile.type==='sand'?`hsl(46 27% ${53+smooth*5}%)`:tile.type==='rock'?`hsl(75 9% ${40+smooth*8}%)`:`hsl(${73+tile.fertility*10} 26% ${34+smooth*5}%)`;
      if(this.layer==='fertility'&&tile.walkable)fill=`hsl(${tile.fertility*110} 36% 37%)`;
      this.diamond(c,p.x,p.y,fill);if(tile.walkable)this.texture(c,p.x,p.y);
      if(tile.walkable)for(let j=0;j<5;j++){c.fillStyle=j%2?'#d8d2a81c':'#233c3225';const xx=p.x+W/2+(random(x*8+j,y,seed)-.5)*36,yy=p.y+H/2+(random(x,y*8+j,seed)-.5)*17;c.fillRect(xx,yy,1+q*3,.8);}
      else{c.strokeStyle='#c7ded21a';c.lineWidth=.6;c.beginPath();c.moveTo(p.x+15,p.y+H/2);c.lineTo(p.x+28,p.y+H/2+2);c.stroke();}
    }
  }
  focus(cancel=true) {
    if(cancel)this.cancelTransition();
    if(this.view==='world'){
      const b=this.worldBounds;
      this.camera={x:(b.minX+b.maxX)/2,y:(b.minY+b.maxY)/2,zoom:Math.min(this.width/(b.maxX-b.minX+280),this.height/(b.maxY-b.minY+180))};
      if(this.width<600){const p=this.worldPoint(this.sim.town(this.townId)!);this.camera.zoom*=2.2;this.camera.x=p.x+200;this.camera.y=p.y+270;}
    }else{
      const t=this.sim.town(this.townId)!;const buildings=t.buildings;
      const x=buildings.reduce((n,b)=>n+b.x,0)/Math.max(1,buildings.length),y=buildings.reduce((n,b)=>n+b.y,0)/Math.max(1,buildings.length),p=this.iso(x||48,y||40);
      this.camera={x:p.x+W/2,y:p.y,zoom:Math.min(this.width/1100,this.height/720,1.2)};
    }
  }
  pan(dx: number,dy: number) { this.cancelTransition();this.camera.x-=dx/this.camera.zoom;this.camera.y-=dy/this.camera.zoom; }
  zoom(delta: number,x=this.width/2,y=this.height/2) {
    this.zoomBy(delta>0?.88:1.14,x,y);
  }
  zoomBy(factor:number,x=this.width/2,y=this.height/2) {this.cancelTransition();const lower=Math.min(this.camera.zoom,this.view==='world'?.08:.16),upper=Math.max(this.camera.zoom,this.view==='world'?1.7:2.7);const next=clamp(this.camera.zoom*factor,lower,upper);this.camera=zoomAt(this.camera,next,{x,y},this);}
  hit(x: number,y: number) { return [...this.hits].reverse().find(h=>h.rect?Math.abs(h.x-x)<=h.rect.w/2&&Math.abs(h.y-y)<=h.rect.h/2:Math.hypot(h.x-x,h.y-y)<h.r)||null; }
  private line(points: Point[],color: string,width: number,dash: number[]=[]) {
    const c=this.ctx;c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.strokeStyle=color;c.lineWidth=width;c.setLineDash(dash);c.stroke();c.setLineDash([]);
  }
  draw(time: number) {
    if(!this.ready)return;
    const begin=performance.now();this.reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(this.transition.active){const frame=this.transition.sample(begin,this.reduceMotion);if(frame)this.camera=frame.camera;if(!frame?.active)this.transitionSnapshot=null;}
    this.rebuild();const c=this.ctx;this.hits=[];
    c.setTransform(this.dpr,0,0,this.dpr,0,0);
    const bg=c.createRadialGradient(this.width*.5,this.height*.45,30,this.width*.5,this.height*.5,this.width*.85);
    bg.addColorStop(0,'#31545c');bg.addColorStop(.65,'#1a3a47');bg.addColorStop(1,'#132c37');c.fillStyle=bg;c.fillRect(0,0,this.width,this.height);
    // Subtle ocean movement. Reduced-motion preferences also stop ambient animation.
    const clock=this.reduceMotion?0:time;
    c.strokeStyle='#abc6bd0d';c.lineWidth=.7;
    for(let i=0;i<64;i++){const x=random(i,2,712)*this.width,y=random(i,8,812)*this.height;const d=Math.sin(clock*.3+i)*4;c.beginPath();c.moveTo(x+d,y);c.quadraticCurveTo(x+15+d,y+2,x+25+d,y);c.stroke();}
    c.save();c.translate(this.width/2,this.height/2);c.scale(this.camera.zoom,this.camera.zoom);c.translate(-this.camera.x,-this.camera.y);
    if(this.terrain)c.drawImage(this.terrain,0,0);
    if(this.view==='world')this.drawWorld(clock);else this.drawSettlement(clock,time);
    c.restore();
    if(this.view==='settlement')drawCityLighting(c,this.cityLights,this.width,this.height,this.lighting);
    // Lens vignette frames the scene without washing out its materials.
    const vignette=c.createRadialGradient(this.width*.5,this.height*.4,this.height*.25,this.width*.5,this.height*.5,this.width*.8);vignette.addColorStop(0,'#07151a00');vignette.addColorStop(1,'#07151a44');c.fillStyle=vignette;c.fillRect(0,0,this.width,this.height);
    this.drawLabels();
    if(this.transitionSnapshot&&this.transition.active){const frame=this.transition.sample(begin);if(frame&&frame.sourceOpacity>0){c.save();c.translate(frame.anchor.x,frame.anchor.y);c.scale(frame.sourceScale,frame.sourceScale);c.globalAlpha=frame.sourceOpacity;c.drawImage(this.transitionSnapshot,-frame.sourceAnchor.x,-frame.sourceAnchor.y,this.width,this.height);c.restore();}}
    this.frameMs=performance.now()-begin;
  }
  private drawWorld(time: number) {
    const c=this.ctx;
    for(const l of this.sim.state.links){const points=l.route.map(p=>this.worldPoint(p));this.line(points,'#333a2a',7);this.line(points,'#d1b47d',3,l.tier<1?[7,8]:[]);}
    for(const t of [...this.sim.state.towns].sort((a,b)=>this.worldPoint(a).y-this.worldPoint(b).y)){
      const p=this.worldPoint(t),selected=t.id===this.townId;
      if(selected){c.strokeStyle='#e5ca8d70';c.lineWidth=2;c.beginPath();c.ellipse(p.x,p.y+5,83,40,0,0,Math.PI*2);c.stroke();}
      const types=[...new Set(t.buildings.filter(b=>b.complete&&buildingArt(b.type,t.knowledge)).map(b=>b.type))].sort((a,b)=>(buildingArt(b,t.knowledge)?.era||0)-(buildingArt(a,t.knowledge)?.era||0)).slice(0,6);
      for(let i=types.length-1;i>=0;i--){const angle=i*2.399,r=i?28+i*5:0;this.structure(c,types[i],t,p.x+Math.cos(angle)*r,p.y+Math.sin(angle)*r*.5,i===0?.8:.58);}
      if(!types.length){c.fillStyle='#cebb89';c.beginPath();c.arc(p.x,p.y,5,0,Math.PI*2);c.fill();}
      const s=this.screen(p);this.hits.push({...s,kind:'town',id:t.id,r:Math.max(28,80*this.camera.zoom)});
    }
    for(const tr of this.sim.state.trips){if(!tr.route.length)continue;const f=clamp((this.sim.day-tr.start)/Math.max(.001,tr.arrival-tr.start),0,1)*(tr.route.length-1),index=Math.min(tr.route.length-1,Math.floor(f)),a=this.worldPoint(tr.route[index]),b=this.worldPoint(tr.route[Math.min(index+1,tr.route.length-1)]),mix=f-index;drawTrip(c,tr,a.x+(b.x-a.x)*mix,a.y+(b.y-a.y)*mix,Math.atan2(b.y-a.y,b.x-a.x),time,this.reduceMotion);}
  }
  private drawSettlement(time: number,realTime:number) {
    const c=this.ctx,t=this.sim.town(this.townId)!;
    const residents=this.sim.residents(t);this.activity=this.activityTracker.sample(t,residents,realTime);this.cityLights=[];
    c.lineCap='round';c.lineJoin='round';
    const streetKey=`${t.id}:${t.land.navRevision}`;if(streetKey!==this.streetKey){this.streetPaths=streetPolylines(t) as {points:Point[];tier:number}[];this.streetKey=streetKey;}const paths=this.streetPaths;
    for(const path of paths){const points=path.points.map(p=>{const v=this.iso(p.x,p.y);return {x:v.x+W/2,y:v.y+H/2};});this.line(points,'#56573c',13);this.line(points,'#aaa080',9);this.line(points,'#c4b99666',3);}
    if(this.layer==='resources')for(const n of t.land.nodes){if(n.amount<1)continue;const p=this.iso(n.x,n.y);c.fillStyle=n.kind==='wood'?'#b9d499':n.kind==='food'?'#e3c780':n.kind==='stone'?'#e0e0ca':'#b9a5c3';c.strokeStyle='#34483a';c.lineWidth=1;c.beginPath();c.arc(p.x+W/2,p.y+H/2,5,0,Math.PI*2);c.fill();c.stroke();}

    const objects: {depth:number; kind:'tree'|'building'|'person';item:Town['land']['nodes'][0]|Building|ReturnType<WorldSimulation['residents']>[0]}[]=[];
    for(const n of t.land.nodes)if(n.kind==='wood'&&n.amount>n.max*.05)objects.push({depth:n.x+n.y,kind:'tree',item:n});
    for(const b of t.buildings)objects.push({depth:b.x+b.y+.2,kind:'building',item:b});
    for(const person of residents)objects.push({depth:person.x+person.y+.5,kind:'person',item:person});
    objects.sort((a,b)=>a.depth-b.depth);
    for(const o of objects){const p=this.iso(o.item.x,o.item.y),x=p.x+W/2,y=p.y+H/2;
      const screen=this.screen({x,y});if(screen.x< -180||screen.x>this.width+180||screen.y< -180||screen.y>this.height+180)continue;
      if(o.kind==='tree'){this.sprite(c,random(o.item.x,o.item.y,t.id)>.25?4:6,x,y+9,58+random(o.item.x,o.item.y,12)*28);}
      else if(o.kind==='building')this.building(o.item as Building,x,y,time);
      else{const person=o.item as ReturnType<WorldSimulation['residents']>[0];const selected=this.selected?.kind==='person'&&this.selected.id===person.id;
        if(selected){c.strokeStyle='#f3d39a';c.lineWidth=1.5;c.beginPath();c.ellipse(x,y+1,7,3,0,0,Math.PI*2);c.stroke();}
        c.fillStyle='#12241d70';c.beginPath();c.ellipse(x+2,y+1,3.6,1.7,0,0,Math.PI*2);c.fill();
        const walk=person.task?.stage==='walk'?Math.sin(time*9+person.id)*1.5:0;
        c.strokeStyle='#3c3830';c.lineWidth=1.8;c.beginPath();c.moveTo(x-1,y-1);c.lineTo(x-1+walk,y+2);c.moveTo(x+1,y-1);c.lineTo(x+1-walk,y+2);c.stroke();
        c.fillStyle=person.color;c.fillRect(x-2,y-6,4,5);c.fillStyle='#d9ba8f';c.beginPath();c.arc(x,y-8,1.8,0,Math.PI*2);c.fill();
        const cargo=this.activity.carriers.get(person.id);if(cargo)drawCarrierCargo(c,cargo,x,y,time,this.reduceMotion);
        this.hits.push({...screen,kind:'person',id:person.id,r:6});
      }
    }
    if(t.weather.kind==='Storm'){c.strokeStyle='#e0e6d433';c.lineWidth=.7;for(let i=0;i<40;i++){const x=this.camera.x+(random(i,1,4)-.5)*this.width/this.camera.zoom,y=this.camera.y+((time*100+random(i,8,7)*1300)%1300)-650;c.beginPath();c.moveTo(x,y);c.lineTo(x-8,y+17);c.stroke();}}
  }
  private building(b: Building,x: number,y: number,time: number) {
    const c=this.ctx,selected=this.selected?.kind==='building'&&this.selected.id===b.id;
    const field=['farm','wheatfield','flaxfield'].includes(b.type);
    if(selected||!b.complete){c.strokeStyle=selected?'#f4d69b':'#e1c69177';c.lineWidth=1.5;c.setLineDash(b.complete?[]:[4,4]);c.beginPath();c.ellipse(x,y,field?76:53,field?38:26,0,0,Math.PI*2);c.stroke();c.setLineDash([]);}
    const town=this.sim.town(this.townId)!,art=buildingArt(b.type,town.knowledge),width=art?.width||(field?120:80),activity=this.activity?.buildings.get(b.id);
    if(!b.complete&&activity)drawConstruction(c,b,activity,x,y,width);
    else if(field){c.save();c.translate(x,y);c.transform(1,.6,-1,.6,0,0);c.fillStyle='#817343';c.fillRect(-43,-43,86,86);for(let i=0;i<11;i++){c.strokeStyle=i%2?'#c0ac63':'#a7984f';c.lineWidth=3;c.beginPath();c.moveTo(-39+i*7,-39);c.lineTo(-39+i*7,39);c.stroke();}c.restore();}
    else if(b.type==='fire'){c.fillStyle='#726c51';c.beginPath();c.ellipse(x,y,11,5,0,0,Math.PI*2);c.fill();c.fillStyle='#e1ae56';c.beginPath();c.moveTo(x-4,y-2);c.lineTo(x+1,y-15+Math.sin(time*5)*2);c.lineTo(x+5,y-1);c.fill();this.smoke(c,x,y-12,time,b.id);}
    else this.structure(c,b.type,town,x,y);
    if(activity){drawBuildingActivity(c,b,activity,x,y,width,time,this.reduceMotion);const p=this.screen({x,y}),light=buildingLight(b,activity,p.x,p.y,width*this.camera.zoom);if(light)this.cityLights.push(light);}
    if(art&&b.complete){const rect=buildingArtRect(art,x,y),s=this.screen({x:rect.x+rect.width/2,y:rect.y+rect.height/2});this.hits.push({...s,kind:'building',id:b.id,r:20,rect:{w:rect.width*this.camera.zoom,h:rect.height*this.camera.zoom}});}
    else{const s=this.screen({x,y:y-20});this.hits.push({...s,kind:'building',id:b.id,r:Math.max(14,(field?45:34)*this.camera.zoom)});}
  }
  private structure(c:CanvasRenderingContext2D,type:string,town:Town,x:number,y:number,scale=1) {
    const art=buildingArt(type,town.knowledge),image=art&&this.artImages.get(art.src);
    if(!art||!image){this.sprite(c,type==='hall'?1:type==='mill'?2:0,x,y,85*scale);return;}
    const rect=buildingArtRect(art,x,y,scale);c.drawImage(image,rect.x,rect.y,rect.width,rect.height);
    if(type==='hall'||type==='station'){const emblem=settlementEmblem(this.sim.state.seed,town.id),xx=rect.x+rect.width*art.accent.x,yy=rect.y+rect.height*art.accent.y;c.strokeStyle='#b6a57b';c.lineWidth=1*scale;c.beginPath();c.moveTo(xx,yy);c.lineTo(xx,yy-16*scale);c.stroke();c.fillStyle=emblem.field;c.fillRect(xx,yy-16*scale,12*scale,7*scale);c.fillStyle=emblem.accent;c.fillRect(xx+2*scale,yy-14*scale,6*scale,2*scale);}
  }
  private smoke(c: CanvasRenderingContext2D,x: number,y: number,time: number,id: number) {
    for(let j=0;j<3;j++){const f=(time*.12+j/3+id*.17)%1;c.fillStyle=`rgba(214,220,204,${(1-f)*.16})`;c.beginPath();c.ellipse(x+Math.sin(f*4+id)*7,y-f*45,3+f*8,4+f*8,0,0,Math.PI*2);c.fill();}
  }
  private drawLabels() {
    const c=this.ctx,placed:{x:number;y:number;w:number;h:number}[]=[];
    if(this.view==='world'&&this.labels)for(const t of this.sim.state.towns){const p=this.screen(this.worldPoint(t)),selected=t.id===this.townId;
      const name=t.name;c.font='14px Georgia,serif';const tw=c.measureText(name).width+28;
      let xx=p.x-tw/2,yy=p.y+18;
      for(let tries=0;tries<10;tries++){if(!placed.some(r=>xx<r.x+r.w+8&&xx+tw>r.x-8&&yy<r.y+r.h+6&&yy+30>r.y-6))break;yy+=36;}
      xx=clamp(xx,8,this.width-tw-8);placed.push({x:xx,y:yy,w:tw,h:30});
      if(yy>p.y+25){c.strokeStyle='#d2b77d88';c.lineWidth=.8;c.beginPath();c.moveTo(p.x,p.y+8);c.lineTo(xx+tw/2,yy);c.stroke();}
      c.fillStyle=selected?'#1d2928f2':'#1d2928dc';c.strokeStyle=selected?'#cbb17f':'#cbb17f55';c.lineWidth=1;c.fillRect(xx,yy,tw,30);c.strokeRect(xx,yy,tw,30);
      c.fillStyle='#eaddbd';c.textAlign='center';c.fillText(name,xx+tw/2,yy+19);c.textAlign='left';
      this.hits.push({x:xx+tw/2,y:yy+15,kind:'town',id:t.id,r:tw/2,rect:{w:tw,h:30}});
    }
    if(this.hovered&&this.view==='settlement'){
      const h=this.hovered,t=this.sim.town(this.townId)!;
      const label=h.kind==='person'?this.sim.residents(t).find(p=>p.id===h.id)?.name:t.buildings.find(b=>b.id===h.id)?.type.replaceAll('_',' ');
      if(label){c.font='12px sans-serif';const w=c.measureText(label).width;c.fillStyle='#172220ee';c.fillRect(h.x-w/2-9,h.y-39,w+18,25);c.strokeStyle='#b9a47766';c.strokeRect(h.x-w/2-9,h.y-39,w+18,25);c.fillStyle='#efe4cb';c.fillText(label,h.x-w/2,h.y-22);}
    }
  }
}
