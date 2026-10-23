import { getDarkness, pseudoRandom } from '@/components/game/lightingSystem';
import { tripActivity } from './activity.mjs';
import type { ActivityBuilding, ActivityTrip, BuildingActivity, CarrierActivity } from './activity.mjs';

// IsoCity lighting utilities: MIT, copyright (c) 2025 amilich. Its full notice is
// retained in /LICENSE; exact source provenance is recorded in docs/oss/city-life.md.
export type CityLightingMode = 'day' | 'dusk' | 'night';
export { CityActivityTracker } from './activity.mjs';
export interface CityLight {x:number;y:number;width:number;id:number;hearth:boolean}
const TAU=Math.PI*2;

function diamond(c:CanvasRenderingContext2D,x:number,y:number,w:number,h:number) {
  c.beginPath();c.moveTo(x,y-h);c.lineTo(x+w,y);c.lineTo(x,y+h);c.lineTo(x-w,y);c.closePath();
}
function stroke(c:CanvasRenderingContext2D,points:number[],color:string,width=1) {
  c.beginPath();c.moveTo(points[0],points[1]);for(let i=2;i<points.length;i+=2)c.lineTo(points[i],points[i+1]);c.strokeStyle=color;c.lineWidth=width;c.stroke();
}
function crate(c:CanvasRenderingContext2D,x:number,y:number,size:number,color='#a58b58') {
  c.fillStyle='#392f2366';c.beginPath();c.ellipse(x,y+2,size*.8,size*.3,0,0,TAU);c.fill();
  c.fillStyle=color;c.fillRect(x-size*.5,y-size,size,size);
  stroke(c,[x-size*.5,y-size,x+size*.5,y,x+size*.5,y-size,x-size*.5,y],'#5e5037',.8);
  stroke(c,[x-size*.45,y-size*.8,x+size*.45,y-size*.8],'#d2bf8d',.7);
}

/** Replaces the completed sprite on unfinished sites. No ghost finished roof. */
export function drawConstruction(c:CanvasRenderingContext2D,b:ActivityBuilding,a:BuildingActivity,x:number,y:number,width:number) {
  if(b.complete||a.phase==='complete')return;
  c.save();c.lineJoin='round';c.lineCap='round';
  const w=width*.43,h=width*.2;
  diamond(c,x,y,w,h);c.fillStyle=a.phase==='planned'?'#8d805625':'#5a58475c';c.fill();
  c.strokeStyle=a.phase==='planned'?'#ddc99b88':'#b3a284';c.lineWidth=1;c.setLineDash(a.phase==='planned'?[3,4]:[]);c.stroke();c.setLineDash([]);
  const corners=[[x-w,y],[x,y-h],[x+w,y],[x,y+h]];
  for(const [px,py]of corners)stroke(c,[px,py+2,px,py-6],'#dfcfa6',1.5);
  if(a.phase==='planned'){c.restore();return;}
  // Pale laid stones and real funded timber piles retain a painterly palette.
  for(let i=0;i<6;i++){c.fillStyle=i%2?'#a7a38a':'#bbb59c';c.fillRect(x-w*.7+i*w*.25,y+h*.25,5,3);}
  stroke(c,[x-w*.8,y+h*.65,x-w*.28,y+h*.85],'#8a6940',3);
  stroke(c,[x-w*.8,y+h*.65-4,x-w*.28,y+h*.85-4],'#b89760',2);
  if(a.phase!=='foundation'){
    const height=width*(a.phase==='roof'?.49:.35);
    for(const [px,py]of corners)stroke(c,[px,py,px,py-height],'#a78b60',2.6);
    for(let i=0;i<4;i++){
      const [px,py]=corners[i], [qx,qy]=corners[(i+1)%4];
      stroke(c,[px,py-height,qx,qy-height],'#c5ac78',2);
      if(i===2||i===3)stroke(c,[px,py-height*.2,qx,qy-height*.9],'#8b744e',1.3);
    }
    if(a.phase==='roof'){
      stroke(c,[x-w,y-height,x,y-h-height-width*.16,x+w,y-height],'#c9b182',2.5);
      stroke(c,[x,y+h-height,x,y-h-height-width*.16],'#9a7c50',2);
      c.fillStyle='#b6a17b66';c.beginPath();c.moveTo(x-w,y-height);c.lineTo(x,y-h-height-width*.16);c.lineTo(x,y+h-height);c.closePath();c.fill();
    }
  }
  c.restore();
}

/** Output stacks are inventories, while moving work accents require on-site tasks. */
export function drawBuildingActivity(c:CanvasRenderingContext2D,b:ActivityBuilding,a:BuildingActivity,x:number,y:number,width:number,time:number,reducedMotion:boolean) {
  c.save();c.lineCap='round';
  if(a.phase==='complete'&&a.outputUnits>0){
    const count=Math.min(3,Math.ceil(a.outputUnits/4));
    for(let i=0;i<count;i++)crate(c,x+width*.26+i*6,y+width*.04-i*2,7);
  }
  if(a.phase==='complete'&&a.inputUnits>0){c.fillStyle='#b8aa84';c.beginPath();c.ellipse(x-width*.27,y+4,4,5,-.15,0,TAU);c.fill();stroke(c,[x-width*.3,y-1,x-width*.25,y-1],'#746443');}
  const work=a.activeWork||a.recentProduction;
  if((!a.workers&&!a.productionPulse)||!work){c.restore();return;}
  const clock=reducedMotion?0:time,phase=Math.sin(clock*5+b.id);
  if(work==='build'){
    const xx=x+width*.4,yy=y+5;
    stroke(c,[xx,yy,xx+4+phase*2,yy-11],'#725c3f',1.8);
    stroke(c,[xx+1+phase*2,yy-12,xx+8+phase*2,yy-10],'#c4c1a5',3);
  }else if(['smelt','steel','fireBricks','bake','manufacture','craft'].includes(work)){
    const xx=x-width*.08,yy=y-width*.17;
    c.fillStyle='#e2a95a';c.beginPath();c.ellipse(xx,yy,3.2+phase*.5,2,0,0,TAU);c.fill();
    // A capped plume only at an occupied, working producer. No saved particles.
    for(let i=0;i<3;i++){
      const f=reducedMotion?(i+1)/4:(clock*.13+i/3+b.id*.17)%1;
      c.fillStyle=`rgba(208,211,190,${(1-f)*.2})`;c.beginPath();c.ellipse(x-width*.16+Math.sin(f*4+b.id)*5,y-width*.62-f*30,2+f*6,3+f*7,0,0,TAU);c.fill();
    }
  }else if(work==='mill'){
    const xx=x+width*.22,yy=y-width*.29,r=width*.09,angle=reducedMotion?.6:clock*.8;
    for(let i=0;i<4;i++){const p=angle+i*Math.PI/2;stroke(c,[xx,yy,xx+Math.cos(p)*r,yy+Math.sin(p)*r],'#d2c399',1.3);}
  }else if(work==='weave'){
    c.fillStyle='#b9a093';c.fillRect(x+width*.2,y-width*.19,8,9);stroke(c,[x+width*.2,y-width*.19+5+phase*2,x+width*.2+8,y-width*.19+5+phase*2],'#d9c6ac');
  }else{
    // Dust/pollen belongs only to a real farm, quarry or other staffed site.
    c.fillStyle='#dfc99177';for(let i=0;i<3;i++){c.beginPath();c.arc(x+width*.25+i*3,y-4-(reducedMotion?i*2:(clock*8+i*5)%13),1,0,TAU);c.fill();}
  }
  c.restore();
}

const cargoColors:Record<string,string>={wood:'#a58a53',stone:'#a6aaa0',ore:'#8e9290',coal:'#565e59',iron:'#a8b3af',steel:'#a8b3af',fish:'#93ada4',flax:'#c6bc8c',cloth:'#b09b9a',food:'#bdab77',grain:'#d0b975',flour:'#d9ceb0',bread:'#be9b61',bricks:'#bb8e6b'};
export function drawCarrierCargo(c:CanvasRenderingContext2D,a:CarrierActivity,x:number,y:number,time:number,reducedMotion:boolean) {
  if(!a.loaded)return;
  c.save();const bob=reducedMotion?0:Math.sin(time*5)*.25;
  crate(c,x-4,y-2+bob,Math.min(5,3+Math.sqrt(a.units)*.3),cargoColors[a.resource||'']||'#b9ac87');c.restore();
}

/** One visible vehicle per actual trip, with existing cargo/passenger data. */
export function drawTrip(c:CanvasRenderingContext2D,trip:ActivityTrip,x:number,y:number,angle:number,time:number,reducedMotion:boolean) {
  const a=tripActivity(trip);c.save();c.translate(x,y);c.rotate(angle);
  c.fillStyle='#242f2866';c.beginPath();c.ellipse(0,3,a.kind==='train'?16:10,4,0,0,TAU);c.fill();
  if(a.kind==='foot'){
    c.fillStyle='#d9c9a2';c.beginPath();c.arc(0,-4,2.3,0,TAU);c.fill();c.fillStyle='#93a89d';c.fillRect(-2,-2,4,6);if(a.cargoUnits>0)crate(c,-4,1,4);
  }else if(a.kind==='cart'){
    stroke(c,[-8,0,10,0],'#b89d68',2);c.fillStyle='#5c5b47';for(const xx of [-5,5]){c.beginPath();c.ellipse(xx,4,2,3,0,0,TAU);c.fill();}
    c.fillStyle='#b49b70';c.fillRect(-7,-4,14,6);stroke(c,[-7,-5,7,-5],'#d8c69e',1);
    if(a.cargoUnits>0){crate(c,-3,-3,5);if(a.cargoUnits>20)crate(c,3,-4,5);}else if(a.passengers>0){c.fillStyle='#d9c39a';c.beginPath();c.arc(1,-7,2,0,TAU);c.fill();}
  }else{
    c.fillStyle=a.mode===4?'#a7bcb1':'#68776b';c.fillRect(-12,-5,22,9);c.fillStyle='#c5ad78';c.fillRect(2,-9,6,5);c.fillStyle='#35463f';c.fillRect(8,-6,6,8);
    for(let i=0;i<4;i++){c.fillStyle='#343f35';c.beginPath();c.arc(-9+i*6,5,1.9,0,TAU);c.fill();}
    if(a.mode===3){c.fillStyle='#d5d5ba88';const drift=reducedMotion?3:(time*6)%8;c.beginPath();c.ellipse(10-drift,-14-drift,3,4,0,0,TAU);c.fill();}
    if(a.cargoUnits>0)crate(c,-7,-4,6);
  }
  c.restore();
}

/** Coordinates and width must use the same (normally screen) coordinate space. */
export function buildingLight(b:ActivityBuilding,a:BuildingActivity,x:number,y:number,width:number):CityLight|null {
  if(!b.complete||a.occupants+a.workers+(b.type==='fire'?a.visitors:0)<1)return null;
  return {x,y,width,id:b.id,hearth:b.type==='fire'};
}

/** Static presentation avoids flicker at accelerated simulation speeds. Call
 * after restoring the camera transform and before labels. IsoCity's pure
 * darkness curve and deterministic window pattern are reused directly. */
export function drawCityLighting(c:CanvasRenderingContext2D,lights:CityLight[],width:number,height:number,mode:CityLightingMode) {
  if(mode==='day')return;
  const darkness=getDarkness(mode==='dusk'?19:22);
  c.save();c.fillStyle=`rgba(19,30,49,${darkness*.46})`;c.fillRect(0,0,width,height);
  c.globalCompositeOperation='screen';
  for(const light of lights){
    const radius=Math.max(7,light.width*.29);
    if(light.x+radius<0||light.x-radius>width||light.y+radius<0||light.y-radius>height)continue;
    const yy=light.y-light.width*.24;
    const gradient=c.createRadialGradient(light.x,yy,0,light.x,yy,radius);
    gradient.addColorStop(0,`rgba(237,181,91,${darkness*.38})`);gradient.addColorStop(.45,`rgba(218,163,78,${darkness*.14})`);gradient.addColorStop(1,'rgba(205,145,61,0)');
    c.fillStyle=gradient;c.beginPath();c.ellipse(light.x,yy,radius,radius*.7,0,0,TAU);c.fill();
    if(!light.hearth)for(let i=0;i<2;i++){
      const xx=light.x+(pseudoRandom(light.id,i+10)-.5)*light.width*.2,wy=yy+(pseudoRandom(light.id,i+20)-.5)*light.width*.1;
      c.fillStyle=`rgba(244,211,136,${darkness*.65})`;c.fillRect(xx,wy,Math.max(1,light.width*.021),Math.max(1.3,light.width*.027));
    }
  }
  c.restore();
}
