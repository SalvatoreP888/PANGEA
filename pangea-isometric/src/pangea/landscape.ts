/** Painted terrain derived exclusively from authoritative geography. All costly
 * mesh, shelf and grain work belongs to the existing terrain rebuild cache. */
import { noise, hash } from './simulation/world.mjs';

export interface LandSample {land:boolean;field:number;ridge:number;moisture:number;biome:string}
export interface LandscapePoint {x:number;y:number}
interface Vertex extends LandscapePoint {field:number;sample:LandSample;gx:number;gy:number}
type Layer='natural'|'fertility'|'resources';
const SEA=.018;
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const polygon=(c:CanvasRenderingContext2D,points:LandscapePoint[])=>{c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();};

/** Clip a surface triangle at sea level, interpolating rather than drawing a
 * staircase of full diamond tiles. Simulation coordinates remain unchanged. */
function dryPolygon(vertices:Vertex[]) {
  const points:LandscapePoint[]=[],shore:LandscapePoint[]=[];
  for(let i=0;i<vertices.length;i++){
    const a=vertices[i],b=vertices[(i+1)%vertices.length];
    if(a.field>SEA)points.push(a);
    if((a.field>SEA)!==(b.field>SEA)){
      const t=clamp((SEA-a.field)/(b.field-a.field),0,1),p={x:mix(a.x,b.x,t),y:mix(a.y,b.y,t)};
      points.push(p);shore.push(p);
    }
  }
  return {points,shore};
}

function surfaceColor(g:LandSample,x:number,y:number,seed:number,layer:Layer,shade:number) {
  const grain=noise(x*.13,y*.13,seed),wet=g.moisture;
  if(layer==='fertility')return `hsl(${38+wet*80} 30% ${36+grain*4}%)`;
  const smooth=(v:number)=>{const t=clamp(v,0,1);return t*t*(3-2*t);};
  const blend=(a:number[],b:number[],t:number)=>a.map((v,i)=>mix(v,b[i],t));
  let rgb=[105-wet*16,122+wet*9,77+wet*9];
  rgb=blend([161,151,113],rgb,smooth((g.field-.018)/.36));
  rgb=blend(rgb,[127,131,116],smooth((g.ridge-.47)/.28)*.8);
  if(g.biome==='Desert')rgb=blend(rgb,[176,157,114],.7);
  if(g.biome==='Ice cap')rgb=blend(rgb,[189,198,185],.8);
  else if(g.biome==='Tundra')rgb=blend(rgb,[153,157,132],.6);
  const gain=.91+grain*.16+shade*.007;
  return `rgb(${rgb.map(v=>Math.round(clamp(v*gain,0,255))).join(',')})`;
}

export function paintWorldSurface(c:CanvasRenderingContext2D,options:{
  nx:number;ny:number;seed:number;layer:Layer;sample:(x:number,y:number)=>LandSample;
  project:(x:number,y:number,g:LandSample)=>LandscapePoint;
  texture:CanvasPattern|null;
}) {
  const {nx,ny,seed,layer,sample,project,texture}=options;
  const vertices=Array.from({length:ny+1},(_,y)=>Array.from({length:nx+1},(_,x)=>{
    const g=sample(x-.5,y-.5),p=project(x,y,g);return {...p,field:g.field,sample:g,gx:x,gy:y};
  }));
  const surfaces:{points:LandscapePoint[];shore:LandscapePoint[];fill:string}[]=[];
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(let sum=0;sum<nx+ny;sum++)for(let y=0;y<ny;y++){
    const x=sum-y;if(x<0||x>=nx)continue;
    const a=vertices[y][x],b=vertices[y][x+1],d=vertices[y+1][x],e=vertices[y+1][x+1];
    const g=sample(x,y),slope=clamp((a.y+d.y-b.y-e.y)*.12,-3,3);
    for(const triangle of [[a,b,e],[a,e,d]]){
      const clipped=dryPolygon(triangle);if(clipped.points.length<3)continue;
      for(const p of clipped.points){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y-110);maxY=Math.max(maxY,p.y+15);}
      surfaces.push({...clipped,fill:surfaceColor(g,x,y,seed,layer,slope)});
    }
  }
  // Wide, translucent shelves lie below the exact land silhouette. Their joins
  // follow the same interpolated coastline, including bays and tiny islands.
  c.lineCap='round';c.lineJoin='round';
  for(const [width,color]of [[66,'#4e8b8b18'],[38,'#5b9b9830'],[19,'#76a8a359']] as const){
    c.beginPath();for(const s of surfaces)if(s.shore.length===2){c.moveTo(s.shore[0].x,s.shore[0].y+5);c.lineTo(s.shore[1].x,s.shore[1].y+5);}c.strokeStyle=color;c.lineWidth=width;c.stroke();
  }
  for(const s of surfaces)if(s.shore.length===2){
    const [a,b]=s.shore;polygon(c,[a,b,{x:b.x,y:b.y+9},{x:a.x,y:a.y+9}]);c.fillStyle='#4d6350';c.fill();
  }
  const land=new Path2D();
  for(const s of surfaces){
    polygon(c,s.points);c.fillStyle=s.fill;c.fill();c.strokeStyle=s.fill;c.lineWidth=.7;c.stroke();
    land.moveTo(s.points[0].x,s.points[0].y);for(const p of s.points.slice(1))land.lineTo(p.x,p.y);land.closePath();
  }
  // One tiny top-down material field is bilinearly magnified under the land
  // clip. It removes categorical tile seams without per-frame shader work.
  const material=document.createElement('canvas');material.width=nx+1;material.height=ny+1;
  const mc=material.getContext('2d')!;
  for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++){const v=vertices[y][x];mc.fillStyle=surfaceColor(v.sample,x,y,seed,layer,0);mc.fillRect(x,y,1,1);}
  const zero:LandSample={land:false,field:0,ridge:0,moisture:0,biome:'Ocean'},origin=project(0,0,zero),dx=project(1,0,zero),dy=project(0,1,zero);
  c.save();c.clip(land);c.transform(dx.x-origin.x,dx.y-origin.y,dy.x-origin.x,dy.y-origin.y,origin.x,origin.y);c.globalAlpha=.97;c.imageSmoothingEnabled=true;c.drawImage(material,-.5,-.5);c.restore();
  if(layer==='natural'&&texture){c.save();c.clip(land);c.globalCompositeOperation='soft-light';c.globalAlpha=.25;c.fillStyle=texture;c.fillRect(minX,minY,maxX-minX,maxY-minY);c.restore();}
  // A narrow bright sand/wash edge replaces the repeated square water tiles.
  c.beginPath();for(const s of surfaces)if(s.shore.length===2){c.moveTo(s.shore[0].x,s.shore[0].y);c.lineTo(s.shore[1].x,s.shore[1].y);}c.strokeStyle='#d4d2aa8a';c.lineWidth=2.4;c.stroke();
  return {minX,maxX,minY,maxY};
}

/** A read-only ground material. Continuous low-frequency tone avoids alternating
 * diamond colors; the real tile type still controls water and exposed rock. */
export function localMaterial(type:string,fertility:number,x:number,y:number,seed:number,layer:Layer) {
  const n=noise(x*.045,y*.045,seed),fine=noise(x*.17,y*.17,seed+47);
  if(['water','river','ford'].includes(type))return `hsl(185 28% ${28+n*8}%)`;
  if(type==='sand')return `hsl(43 27% ${55+n*6}%)`;
  if(type==='rock')return `hsl(76 10% ${43+n*6}%)`;
  if(layer==='fertility')return `hsl(${fertility*108} 33% 39%)`;
  return `hsl(${78+n*9} ${20+fine*4}% ${36+n*6+fine*2}%)`;
}

export function paintGroundGrain(c:CanvasRenderingContext2D,x:number,y:number,seed:number) {
  const n=hash(Math.round(x),Math.round(y),seed);
  if(n>.83){c.fillStyle='#decfa026';c.beginPath();c.ellipse(x,y,2.2,1,0,0,Math.PI*2);c.fill();}
}

/** Rounded marching-square shorelines through real water cells. The ford
 * remains water with a visible stone crossing; navigation data is untouched.
 * Closed contours, highlights and reflections are baked into terrain once. */
export function paintLocalWater(c:CanvasRenderingContext2D,options:{nx:number;ny:number;seed:number;tiles:{type:string}[];project:(x:number,y:number)=>LandscapePoint}) {
  const {nx,ny,seed,tiles,project}=options;
  const wet=(x:number,y:number)=>x>=0&&y>=0&&x<nx&&y<ny&&['water','river','ford'].includes(tiles[y*nx+x].type);
  const cases:number[][][]=[[],[[3,0]],[[0,1]],[[3,1]],[[1,2]],[[3,0],[1,2]],[[0,2]],[[3,2]],[[2,3]],[[0,2]],[[0,1],[2,3]],[[1,2]],[[1,3]],[[0,1]],[[3,0]],[]];
  const graph=new Map<string,string[]>(),points=new Map<string,LandscapePoint>();
  const connect=(a:LandscapePoint,b:LandscapePoint)=>{
    const ka=`${a.x},${a.y}`,kb=`${b.x},${b.y}`;
    points.set(ka,a);points.set(kb,b);graph.set(ka,[...(graph.get(ka)||[]),kb]);graph.set(kb,[...(graph.get(kb)||[]),ka]);
  };
  for(let y=-1;y<ny;y++)for(let x=-1;x<nx;x++){
    const mask=(wet(x,y)?1:0)|(wet(x+1,y)?2:0)|(wet(x+1,y+1)?4:0)|(wet(x,y+1)?8:0);
    const edges=[{x:x+.5,y},{x:x+1,y:y+.5},{x:x+.5,y:y+1},{x,y:y+.5}];
    for(const [a,b]of cases[mask])connect(edges[a],edges[b]);
  }
  const water=new Path2D(),visited=new Set<string>();
  for(const start of graph.keys()){
    if(visited.has(start))continue;
    const contour:LandscapePoint[]=[];let current=start,previous='';
    while(!visited.has(current)){
      visited.add(current);const v=points.get(current)!;contour.push(project(v.x,v.y));
      const next=graph.get(current)!.find(k=>k!==previous)!;previous=current;current=next;
    }
    if(contour.length<3)continue;
    const last=contour.at(-1)!,first=contour[0];water.moveTo((last.x+first.x)/2,(last.y+first.y)/2);
    for(let i=0;i<contour.length;i++){const a=contour[i],b=contour[(i+1)%contour.length];water.quadraticCurveTo(a.x,a.y,(a.x+b.x)/2,(a.y+b.y)/2);}
    water.closePath();
  }
  c.save();c.lineJoin='round';c.lineCap='round';
  c.strokeStyle='#59674d77';c.lineWidth=15;c.stroke(water);
  c.strokeStyle='#b4ac7d';c.lineWidth=8;c.stroke(water);
  c.strokeStyle='#3a5148';c.lineWidth=3;c.stroke(water);
  const from=project(0,0),to=project(nx,ny),gradient=c.createLinearGradient(from.x,from.y,to.x,to.y);
  gradient.addColorStop(0,'#537f7d');gradient.addColorStop(.5,'#38636b');gradient.addColorStop(1,'#527f7e');
  c.fillStyle=gradient;c.fill(water,'evenodd');c.clip(water,'evenodd');
  c.strokeStyle='#a1b7a160';c.lineWidth=13;c.stroke(water);
  c.strokeStyle='#d5dfc870';c.lineWidth=1.1;c.stroke(water);
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
    if(!wet(x,y))continue;const q=hash(x,y,seed),v=project(x,y);
    if(q>.57){c.strokeStyle=q>.87?'#b0d0c366':'#9bbdb333';c.lineWidth=.8;c.beginPath();c.moveTo(v.x-8-q*8,v.y+q*7);c.quadraticCurveTo(v.x,v.y-2+q*7,v.x+12+q*10,v.y+q*7);c.stroke();}
    if(tiles[y*nx+x].type==='ford')for(let i=-2;i<=2;i++){
      const p=project(x+i*.22,y);c.fillStyle='#294a4980';c.beginPath();c.ellipse(p.x+1,p.y+2,5.5,2.5,0,0,Math.PI*2);c.fill();c.fillStyle=i%2?'#b7b69c':'#a6ad97';c.beginPath();c.ellipse(p.x,p.y,5.2,2.6,-.1,0,Math.PI*2);c.fill();
    }
  }
  c.restore();
}
