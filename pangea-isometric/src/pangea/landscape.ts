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
