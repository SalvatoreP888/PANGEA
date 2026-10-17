import {clamp,mix,hash,fbm,geography,geoAt,TAU,RAD,GRID_W,GRID_H,TILE,footprint,entrance} from './world.mjs';
import {YEAR,BUILDINGS,ACTION_NAMES} from './data.mjs';
/** Canvas renderer. Never modifies simulation state; animation uses its own clock. */
export class WorldRenderer {
  constructor(canvas,sim) {
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.sim=sim;this.mode='globe';this.townId=1;
    this.camera={x:48*TILE,y:40*TILE,zoom:.72};this.orbit={lon:sim.state.towns[0].lon+.26,lat:.12,zoom:1};
    this.selected=null;this.layer='natural';this.labels=true;this.hits=[];this.terrainCache=new Map();this.dirty=true;this.texture=null;this.globe=null;
    this.width=800;this.height=700;this.dpr=1;this.resize();this.makeTexture();
  }
  get town(){return this.sim.town(this.townId)||this.sim.state.towns[0];}
  resize(){const r=this.canvas.getBoundingClientRect();this.width=Math.max(200,r.width);this.height=Math.max(200,r.height);this.dpr=Math.min(devicePixelRatio||1,1.65);this.canvas.width=Math.round(this.width*this.dpr);this.canvas.height=Math.round(this.height*this.dpr);this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);this.dirty=true;}
  reset(sim){this.sim=sim;this.townId=1;this.selected=null;this.camera={x:48*TILE,y:40*TILE,zoom:.72};this.orbit={lon:sim.state.towns[0].lon+.26,lat:.12,zoom:1};this.terrainCache.clear();this.makeTexture();}
  geometry(){return{r:Math.min(this.width*.39,this.height*.41)*this.orbit.zoom,x:this.width*.52,y:this.height*.53};}
  project(lon,lat){const dl=lon-this.orbit.lon,cl=Math.cos(lat),sl=Math.sin(lat),ca=Math.cos(this.orbit.lat),sa=Math.sin(this.orbit.lat),g=this.geometry();
    const x=cl*Math.sin(dl),y=sl*ca-cl*Math.cos(dl)*sa,z=sl*sa+cl*Math.cos(dl)*ca;return{x:g.x+x*g.r,y:g.y-y*g.r,z,visible:z>0};}
  makeTexture(){
    const w=1000,h=500,c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d'),im=ctx.createImageData(w,h),seed=this.sim.state.seed;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const u=x/w,v=y/h,p=geography(u,v,seed),i=(y*w+x)*4,grain=(hash(x,y,seed+16)-.5)*(p.land?28:9);let col;
      if(!p.land){const shore=clamp((p.field+.15)/.16,0,1);col=[mix(12,46,shore),mix(42,90,shore),mix(57,96,shore)];}
      else if(p.field<.048)col=[203,187,132];
      else if(p.ridge>.63)col=[165,158,135];
      else if(p.ridge>.57)col=[140,145,112];
      else if(p.moisture>.56){const shade=clamp((p.moisture-.56)*3,0,1);col=[mix(112,52,shade),mix(140,98,shade),mix(77,57,shade)];}
      else if(p.moisture>.43)col=[169,174,112];else col=[191,170,111];
      const ridgeShade=1+(geography(u-.001,v-.001,seed).ridge-p.ridge)*12;
      im.data[i]=clamp(col[0]*(p.land?ridgeShade:1)+grain,0,255);im.data[i+1]=clamp(col[1]*(p.land?ridgeShade:1)+grain,0,255);im.data[i+2]=clamp(col[2]*(p.land?ridgeShade:1)+grain,0,255);im.data[i+3]=255;
    }
    ctx.putImageData(im,0,0);this.texture={data:im.data,w,h};this.dirty=true;
  }
  shadeGlobe(){
    const size=600;if(!this.globe){this.globe=document.createElement('canvas');this.globe.width=size;this.globe.height=size;}
    const ctx=this.globe.getContext('2d'),im=ctx.createImageData(size,size),pix=im.data,cl=Math.cos(this.orbit.lat),sl=Math.sin(this.orbit.lat),t=this.texture;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const nx=(2*x+1)/size-1,ny=1-(2*y+1)/size,r=nx*nx+ny*ny,i=(y*size+x)*4;if(r>=1)continue;
      const z=Math.sqrt(1-r),lat=Math.asin(clamp(ny*cl+z*sl,-1,1)),lon=this.orbit.lon+Math.atan2(nx,z*cl-ny*sl);
      const u=((lon/TAU+.5)%1+1)%1,v=.5-lat/Math.PI,tx=Math.floor(u*t.w),ty=clamp(Math.floor(v*t.h),0,t.h-1),j=(ty*t.w+tx)*4;
      const light=.24+.81*clamp(-nx*.45+ny*.34+z*.86,0,1),rim=.89+.11*z;
      pix[i]=t.data[j]*light*rim;pix[i+1]=t.data[j+1]*light*rim;pix[i+2]=t.data[j+2]*light*rim;pix[i+3]=255;
    }
    ctx.putImageData(im,0,0);this.dirty=false;
  }
  draw(time){const c=this.ctx;c.setTransform(this.dpr,0,0,this.dpr,0,0);this.hits=[];if(this.mode==='globe')this.drawGlobe(time);else this.drawTown(time);}
  drawGlobe(time){
    const c=this.ctx,W=this.width,H=this.height,g=this.geometry();
    const bg=c.createRadialGradient(g.x,g.y,20,g.x,g.y,Math.max(W,H)*.8);bg.addColorStop(0,'#183641');bg.addColorStop(.55,'#09212d');bg.addColorStop(1,'#06131d');c.fillStyle=bg;c.fillRect(0,0,W,H);
    for(let i=0;i<230;i++){c.globalAlpha=.10+hash(i,1,77)*.4;c.fillStyle='#d1ded7';c.fillRect(hash(i,2,88)*W,hash(i,3,98)*H,hash(i,4,34)>.93?1.7:.7,.9);}c.globalAlpha=1;
    const glow=c.createRadialGradient(g.x,g.y,g.r*.92,g.x,g.y,g.r*1.17);glow.addColorStop(0,'#72a7a133');glow.addColorStop(.42,'#759da033');glow.addColorStop(1,'#63959500');c.fillStyle=glow;c.beginPath();c.arc(g.x,g.y,g.r*1.17,0,TAU);c.fill();
    if(this.dirty)this.shadeGlobe();c.drawImage(this.globe,g.x-g.r,g.y-g.r,g.r*2,g.r*2);
    c.strokeStyle='#b9d8cb44';c.lineWidth=1.2;c.beginPath();c.arc(g.x,g.y,g.r,0,TAU);c.stroke();
    c.strokeStyle='#d4dccb15';c.lineWidth=.7;
    for(let lat=-60;lat<=60;lat+=30){c.beginPath();let open=false;for(let lon=-180;lon<=180;lon+=3){const p=this.project(lon*RAD,lat*RAD);if(p.visible){if(!open)c.moveTo(p.x,p.y);else c.lineTo(p.x,p.y);open=true;}else open=false;}c.stroke();}
    for(let lon=-180;lon<180;lon+=30){c.beginPath();let open=false;for(let lat=-85;lat<=85;lat+=2){const p=this.project(lon*RAD,lat*RAD);if(p.visible){if(!open)c.moveTo(p.x,p.y);else c.lineTo(p.x,p.y);open=true;}else open=false;}c.stroke();}
    for(const town of this.sim.state.towns){
      if(town.parentId){const parent=this.sim.town(town.parentId);if(parent){const a=this.project(parent.lon,parent.lat),b=this.project(town.lon,town.lat);if(a.visible&&b.visible){c.setLineDash([2,5]);c.strokeStyle='#dfbf7777';c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();c.setLineDash([]);}}}
      const p=this.project(town.lon,town.lat);if(!p.visible)continue;
      const n=this.sim.residents(town).length,selected=town.id===this.townId;
      c.fillStyle='#d6b87518';c.beginPath();c.arc(p.x,p.y,(selected?20:13)+Math.sin(time*1.8)*1.3,0,TAU);c.fill();
      c.strokeStyle=selected?'#e5c789cc':'#d7bb7266';c.lineWidth=1;c.beginPath();c.arc(p.x,p.y,selected?12:8,0,TAU);c.stroke();
      c.fillStyle=n?'#f0d49a':'#7a9990';c.beginPath();c.arc(p.x,p.y,selected?4.7:3.7,0,TAU);c.fill();
      if(this.labels){this.shadowText(town.name,p.x+19,p.y-4,13,'#f2e8cb');this.shadowText(`${n} lives · ${this.sim.level(town)}`,p.x+19,p.y+13,10,'#b5c9b2');}
      this.hits.push({x:p.x,y:p.y,r:20,kind:'town',id:town.id});
    }
    for(const trip of this.sim.state.trips){
      c.strokeStyle=trip.kind==='migration'?'#e2c58fcc':'#91c6b0bb';c.lineWidth=2;c.setLineDash([3,5]);c.lineDashOffset=-time*8;c.beginPath();let started=false;
      for(const point of trip.route){const p=this.project(point.lon,point.lat);if(p.visible){if(!started)c.moveTo(p.x,p.y);else c.lineTo(p.x,p.y);started=true;}else started=false;}c.stroke();c.setLineDash([]);
      const f=clamp((this.sim.day-trip.start)/(trip.arrival-trip.start),0,1),a=trip.route[Math.min(trip.route.length-1,Math.floor(f*trip.route.length))];
      if(a){const p=this.project(a.lon,a.lat);if(p.visible){c.fillStyle='#fff5cf';c.fillRect(p.x-3,p.y-3,6,6);}}
    }
    c.fillStyle='#c6d7c050';c.font='10px ui-monospace,monospace';c.textAlign='center';c.fillText('P A N G A E A   /   O N E   C O N T I N E N T',g.x,g.y+g.r+37);c.textAlign='left';
  }
  shadowText(text,x,y,size,color){const c=this.ctx;c.save();c.font=`${size>=12?'600 ':''}${size}px system-ui`;c.textAlign='left';c.fillStyle=color;c.shadowColor='#061922';c.shadowBlur=6;c.fillText(text,x,y);c.restore();}
  baseTerrain(t){
    const key=`${t.id}:${this.sim.season}:${this.layer}`;if(this.terrainCache.has(key))return this.terrainCache.get(key);
    const cv=document.createElement('canvas');cv.width=GRID_W*TILE;cv.height=GRID_H*TILE;const c=cv.getContext('2d');
    const winter=this.sim.season===3,autumn=this.sim.season===2,seed=this.sim.state.seed+t.id*7;
    for(let y=0;y<GRID_H;y++)for(let x=0;x<GRID_W;x++){
      const tile=t.land.tiles[y*GRID_W+x],n=hash(x,y,seed),water=tile.type==='water'||tile.type==='river'||tile.type==='ford';
      let col;
      if(water)col=tile.type==='water'?`rgb(${27+n*7},${65+n*12},${78+n*13})`:tile.type==='ford'?'#63817b':'#3a7277';
      else if(tile.type==='sand')col='#c4b17e';
      else if(tile.type==='rock')col=`rgb(${139+n*13},${143+n*13},${116+n*11})`;
      else if(winter)col=`rgb(${172+n*18},${178+n*16},${151+n*17})`;
      else if(autumn)col=`rgb(${147+n*22},${151+n*19},${92+n*16})`;
      else col=`rgb(${139+n*20},${158+n*20},${93+n*18})`;
      c.fillStyle=col;c.fillRect(x*TILE,y*TILE,TILE,TILE);
      for(let k=0;k<7;k++){
        const q=hash(x*9+k,y,seed+50);c.fillStyle=water?(q>.5?'#9ec5b51a':'#102c3620'):(q>.72?'#f5eab33b':'#4e692626');
        c.fillRect(x*TILE+hash(x,y*9+k,seed+2)*TILE,y*TILE+q*TILE,q>.7?2:1,q>.8?2:1);
      }
      if(!water&&this.layer==='fertility'){c.fillStyle=`rgba(${Math.round(170*(1-tile.fertility))},140,90,0.45)`;c.fillRect(x*TILE,y*TILE,TILE,TILE);}
    }
    this.terrainCache.set(key,cv);if(this.terrainCache.size>10)this.terrainCache.delete(this.terrainCache.keys().next().value);return cv;
  }
  drawTown(time){
    const c=this.ctx,t=this.town,W=this.width,H=this.height,z=this.camera.zoom;c.fillStyle='#122d37';c.fillRect(0,0,W,H);
    c.save();c.translate(W/2,H/2);c.scale(z,z);c.translate(-this.camera.x,-this.camera.y);c.imageSmoothingEnabled=false;c.drawImage(this.baseTerrain(t),0,0);
    const bounds={x0:Math.floor((this.camera.x-W/2/z)/TILE)-4,x1:Math.ceil((this.camera.x+W/2/z)/TILE)+4,y0:Math.floor((this.camera.y-H/2/z)/TILE)-4,y1:Math.ceil((this.camera.y+H/2/z)/TILE)+4};
    for(let y=Math.max(0,bounds.y0);y<Math.min(GRID_H,bounds.y1);y++)for(let x=Math.max(0,bounds.x0);x<Math.min(GRID_W,bounds.x1);x++){
      const traffic=t.land.roads[y*GRID_W+x];if(traffic<2)continue;
      c.fillStyle=this.layer==='activity'?`rgba(236,177,91,${clamp(traffic/100,.08,.65)})`:`rgba(136,108,68,${clamp(traffic/70,.06,.5)})`;
      c.fillRect(x*TILE+TILE*.23,y*TILE+TILE*.23,TILE*.54,TILE*.54);
      if(x+1<GRID_W&&t.land.roads[y*GRID_W+x+1]>2)c.fillRect(x*TILE+TILE*.7,y*TILE+TILE*.23,TILE*.58,TILE*.54);
      if(y+1<GRID_H&&t.land.roads[(y+1)*GRID_W+x]>2)c.fillRect(x*TILE+TILE*.23,y*TILE+TILE*.7,TILE*.54,TILE*.58);
    }
    const objects=[];
    for(const n of t.land.nodes)if(n.x>=bounds.x0&&n.x<=bounds.x1&&n.y>=bounds.y0&&n.y<=bounds.y1)objects.push({y:n.y,kind:'node',item:n});
    for(const b of t.buildings)objects.push({y:b.y+1,kind:'building',item:b});
    for(const p of this.sim.residents(t))objects.push({y:p.y+.5,kind:'person',item:p});
    objects.sort((a,b)=>a.y-b.y);
    for(const o of objects){if(o.kind==='node')this.drawNode(o.item,time);else if(o.kind==='building')this.drawBuilding(o.item,time);else this.drawPerson(o.item,time);}
    if(this.selected?.kind==='person'){
      const p=this.sim.person(this.selected.id);
      if(p?.task?.path){c.strokeStyle='#f1df9faa';c.lineWidth=1.8;c.setLineDash([3,5]);c.beginPath();c.moveTo(p.x*TILE+10,p.y*TILE+10);for(const pt of p.task.path.slice(p.task.index))c.lineTo(pt.x*TILE+10,pt.y*TILE+10);c.stroke();c.setLineDash([]);}
    }
    c.restore();
    const tint=c.createLinearGradient(0,0,0,H);tint.addColorStop(0,'#08212b30');tint.addColorStop(.32,'#103d1900');tint.addColorStop(1,'#061a2450');c.fillStyle=tint;c.fillRect(0,0,W,H);
    if(t.weather.kind==='Storm'){
      c.strokeStyle='#dde7d835';c.lineWidth=1;for(let i=0;i<80;i++){const x=(hash(i,7,35)*W+time*55)%W,y=(hash(i,8,49)*H+time*250)%H;c.beginPath();c.moveTo(x,y);c.lineTo(x-5,y+15);c.stroke();}
    }
    if(t.weather.kind==='Drought'){c.fillStyle='#d6a96416';c.fillRect(0,0,W,H);}
  }
  screen(x,y){return{x:(x*TILE+TILE/2-this.camera.x)*this.camera.zoom+this.width/2,y:(y*TILE+TILE/2-this.camera.y)*this.camera.zoom+this.height/2};}
  drawNode(n,time){
    const c=this.ctx,x=n.x*TILE+10,y=n.y*TILE+12,seed=this.sim.state.seed,amount=n.amount/n.max;
    if(n.kind==='wood'){
      if(amount<.05){c.fillStyle='#6d583b';c.fillRect(x-3,y-4,6,6);c.fillStyle='#aa8c5b';c.fillRect(x-3,y-5,6,2);return;}
      const h=22+hash(n.x,n.y,seed)*12;
      c.fillStyle='#253e322d';c.beginPath();c.ellipse(x+7,y+2,12,5,-.25,0,TAU);c.fill();
      c.fillStyle='#6b6043';c.fillRect(x-2,y-14,4,15);
      const autumn=this.sim.season===2,winter=this.sim.season===3;
      c.fillStyle=winter?'#5e7867':autumn?'#757d41':'#466b42';
      c.beginPath();c.moveTo(x,y-h);c.lineTo(x+11,y-7);c.lineTo(x-10,y-7);c.closePath();c.fill();
      c.fillStyle=winter?'#8b9d80':autumn?'#9c9551':'#6b8a4d';c.beginPath();c.moveTo(x,y-h);c.lineTo(x+1,y-7);c.lineTo(x-10,y-7);c.closePath();c.fill();
      c.fillStyle='#b7c18244';c.fillRect(x-5,y-h+13,3,2);
    }else if(n.kind==='stone'){
      if(amount<.05)return;c.fillStyle='#334a322e';c.beginPath();c.ellipse(x+3,y+2,9,4,0,0,TAU);c.fill();
      c.fillStyle='#a3a58f';c.beginPath();c.moveTo(x-8,y);c.lineTo(x-7,y-8);c.lineTo(x,y-13);c.lineTo(x+8,y-7);c.lineTo(x+9,y);c.closePath();c.fill();c.fillStyle='#c6c3a3';c.beginPath();c.moveTo(x-7,y-8);c.lineTo(x,y-13);c.lineTo(x+3,y-4);c.closePath();c.fill();
    }else{
      c.fillStyle=n.kind==='food'?'#668342':'#799556';c.beginPath();c.ellipse(x,y-3,7,5,0,0,TAU);c.fill();
      if(amount>.2){c.fillStyle=n.kind==='food'?'#a9a2b1':'#e1d3a0';for(let j=0;j<4;j++)c.fillRect(x-4+(j%2)*5,y-6+Math.floor(j/2)*3,2,2);}
    }
    if(this.layer==='resources'&&amount>.1){c.fillStyle=n.kind==='food'?'#eed08c':n.kind==='wood'?'#adcf9c':n.kind==='stone'?'#dee0d1':'#cba8cb';c.fillRect(x-2,y+6,4,4);}
  }
  drawBuilding(b,time){
    const c=this.ctx,x=b.x*TILE+10,y=b.y*TILE+10,f=footprint(b),w=f.w*TILE,h=f.h*TILE,px=f.x0*TILE,py=f.y0*TILE;
    if(this.selected?.kind==='building'&&this.selected.id===b.id){c.strokeStyle='#f4d58c';c.lineWidth=2;c.strokeRect(px-5,py-7,w+10,h+14);}
    const screen=this.screen(b.x,b.y);this.hits.push({x:screen.x,y:screen.y,r:Math.max(20,w*this.camera.zoom*.6),kind:'building',id:b.id});
    if(!b.complete){
      c.fillStyle='#705a3f55';c.fillRect(px,py,w,h);c.strokeStyle=b.funded?'#d8c48a':'#b0bca2';c.lineWidth=1.5;c.setLineDash([5,4]);c.strokeRect(px,py,w,h);c.setLineDash([]);
      c.strokeStyle='#af8d5a';c.lineWidth=3;for(let i=0;i<3;i++){c.beginPath();c.moveTo(px+i*w/2,py+h);c.lineTo(px+i*w/2,py);c.stroke();}c.beginPath();c.moveTo(px,py);c.lineTo(px+w,py+h);c.stroke();
      c.fillStyle='#152c28';c.fillRect(px,py+h+6,w,4);c.fillStyle='#dfc589';c.fillRect(px,py+h+6,w*b.progress/BUILDINGS[b.type].work,4);
      return;
    }
    if(b.type==='fire'){
      c.fillStyle='#4b482e38';c.beginPath();c.ellipse(x+6,y+8,26,12,0,0,TAU);c.fill();
      c.strokeStyle='#888773';c.lineWidth=5;c.beginPath();c.ellipse(x,y+2,12,8,0,0,TAU);c.stroke();c.fillStyle='#d98c43';c.beginPath();c.moveTo(x-6,y+4);c.lineTo(x-3,y-9-Math.sin(time*8)*2);c.lineTo(x+2,y-4);c.lineTo(x+5,y-12);c.lineTo(x+8,y+4);c.fill();c.fillStyle='#f4ce7a';c.fillRect(x-2,y-4,4,8);this.smoke(x,y-16,time,b.id);return;
    }
    if(b.type==='farm'){
      c.fillStyle='#a89c67';c.fillRect(px-3,py-3,w+6,h+6);c.fillStyle='#786344';c.fillRect(px,py,w,h);
      for(let row=0;row<6;row++){
        c.fillStyle='#524c3266';c.fillRect(px+4,py+7+row*12,w-8,3);
        if(b.crop.sown||b.crop.yield>0)for(let col=0;col<9;col++){
          const growth=b.crop.yield>0?1:b.crop.growth/80;
          c.fillStyle=growth>.8?'#c6bd70':'#83a04d';c.fillRect(px+7+col*10,py+5+row*12,4,2+growth*6);
          c.fillStyle=growth>.8?'#eee1a1':'#abc574';c.fillRect(px+7+col*10,py+4+row*12,2,2);
        }
      }return;
    }
    if(b.type==='well'){
      c.fillStyle='#b1af91';c.fillRect(x-12,y-6,25,17);c.fillStyle='#34606a';c.fillRect(x-8,y-4,17,9);c.fillStyle='#736446';c.fillRect(x-13,y-24,3,25);c.fillRect(x+11,y-24,3,25);c.fillStyle='#a17b4f';c.beginPath();c.moveTo(x-18,y-24);c.lineTo(x,y-35);c.lineTo(x+18,y-24);c.fill();return;
    }
    // Layered walls, pitched roofs, rafters, glazing, chimneys and ground props.
    c.fillStyle='#233a3035';c.beginPath();c.moveTo(px+6,py+h);c.lineTo(px+w+18,py+h+10);c.lineTo(px+w+23,py+12);c.lineTo(px+w,py);c.closePath();c.fill();
    const wall=b.type==='clinic'?'#c0bca0':b.type==='hall'?'#b7b199':'#b8aa84';
    c.fillStyle='#635b44';c.fillRect(px+3,py+9,w-6,h-5);c.fillStyle=wall;c.fillRect(px+4,py+8,w-8,h-8);
    c.fillStyle='#72664b';for(let k=8;k<w-4;k+=18)c.fillRect(px+k,py+h-21,3,21);
    c.fillStyle='#3e4838';c.fillRect(x-6,py+h-19,12,19);c.fillStyle='#e4cb82';c.fillRect(px+12,py+h-17,8,8);c.fillRect(px+w-21,py+h-17,8,8);
    c.fillStyle='#92704b';c.beginPath();c.moveTo(px-5,py+h*.47);c.lineTo(px+4,py-12);c.lineTo(px+w-4,py-12);c.lineTo(px+w+5,py+h*.47);c.closePath();c.fill();
    c.fillStyle=b.type==='hall'?'#8c7660':b.type==='workshop'?'#947357':'#b39161';c.beginPath();c.moveTo(px-5,py+h*.47);c.lineTo(px+4,py-12);c.lineTo(x,py-12);c.lineTo(x,py+h*.47);c.closePath();c.fill();
    c.strokeStyle='#5f574547';c.lineWidth=1;for(let yy=py-6;yy<py+h*.47;yy+=8){c.beginPath();c.moveTo(px+2,yy);c.lineTo(px+w-2,yy);c.stroke();}
    c.fillStyle='#cec299';c.fillRect(px+2,py-14,w-4,3);c.fillStyle='#a0a38c';c.fillRect(px+w-18,py-17,8,14);c.fillStyle='#646958';c.fillRect(px+w-19,py-20,10,4);this.smoke(px+w-14,py-23,time,b.id);
    if(b.type==='store'){c.fillStyle='#9c8457';c.fillRect(px+w+3,py+h-14,9,14);c.fillStyle='#d0b775';c.fillRect(px+w+2,py+h-15,11,3);}
    if(b.type==='workshop'){c.fillStyle='#6b614c';c.fillRect(px-10,py+h-11,10,8);c.fillStyle='#a2a38d';c.fillRect(px-13,py+h-14,16,4);}
    if(b.type==='clinic'){c.fillStyle='#71916d';c.fillRect(x-5,py+h-32,10,9);c.fillStyle='#ded8ad';c.fillRect(x-1,py+h-31,2,7);c.fillRect(x-4,py+h-29,8,2);}
  }
  smoke(x,y,time,seed){const c=this.ctx;for(let j=0;j<3;j++){const f=((time*.25+j*.33+hash(seed,j,88))%1);c.fillStyle=`rgba(219,222,199,${(1-f)*.15})`;c.beginPath();c.arc(x+Math.sin(f*4+seed)*6,y-f*29,2+f*5,0,TAU);c.fill();}}
  drawPerson(p,time){
    const c=this.ctx,x=p.x*TILE+10,y=p.y*TILE+10,child=p.ageDays<12*YEAR,scale=child?.75:1,selected=this.selected?.kind==='person'&&this.selected.id===p.id;
    c.save();c.translate(x,y);c.scale(scale,scale);
    c.fillStyle='#203f3444';c.beginPath();c.ellipse(2,2,6,3,0,0,TAU);c.fill();
    if(selected){c.strokeStyle='#ffe2a0';c.lineWidth=1.5;c.beginPath();c.ellipse(0,1,11,6,0,0,TAU);c.stroke();}
    const walking=p.task?.stage==='walk', stride=walking?Math.sin(time*12+p.id)*2:0;
    c.fillStyle='#37483c';c.fillRect(-3+stride,-4,3,7);c.fillRect(1-stride,-4,3,7);
    c.fillStyle=p.color;c.fillRect(-5,-14,10,11);c.fillStyle='#e0bc94';c.fillRect(-3,-22,7,8);c.fillStyle='#62533a';c.fillRect(-4,-24,8,4);
    c.fillStyle='#e3c69d';c.fillRect(-7,-12-stride,2,6);c.fillRect(5,-12+stride,2,6);
    if(Object.values(p.carry).some(n=>n>0)){c.fillStyle='#a38757';c.fillRect(-9,-10,6,7);c.strokeStyle='#e2c48a';c.strokeRect(-9,-10,6,7);}
    if(p.sick){c.fillStyle='#cad2a0';c.fillRect(6,-25,3,3);}
    c.restore();
    if(this.labels&&(selected||this.camera.zoom>.62)){c.font=`${selected?'600 ':''}10px system-ui`;c.textAlign='center';const w=c.measureText(p.name).width;c.fillStyle='#19382ec9';c.fillRect(x-w/2-4,y-39,w+8,14);c.fillStyle=selected?'#fff1c8':'#e4e5d1';c.fillText(p.name,x,y-29);c.textAlign='left';}
    const pt=this.screen(p.x,p.y);this.hits.unshift({x:pt.x,y:pt.y-9*this.camera.zoom,r:Math.max(12,13*this.camera.zoom),kind:'person',id:p.id});
  }
  hit(x,y){return this.hits.find(h=>Math.hypot(h.x-x,h.y-y)<=h.r)||null;}
  pan(dx,dy){if(this.mode==='globe'){this.orbit.lon-=dx/this.width*4;this.orbit.lat=clamp(this.orbit.lat+dy/this.height*2.5,-1.3,1.3);this.dirty=true;}else{this.camera.x=clamp(this.camera.x-dx/this.camera.zoom,0,GRID_W*TILE);this.camera.y=clamp(this.camera.y-dy/this.camera.zoom,0,GRID_H*TILE);}}
  zoom(delta,x,y){const factor=delta>0?.88:1.14;if(this.mode==='globe'){this.orbit.zoom=clamp(this.orbit.zoom*factor,.65,1.4);this.dirty=true;}else{const wx=(x-this.width/2)/this.camera.zoom+this.camera.x,wy=(y-this.height/2)/this.camera.zoom+this.camera.y;this.camera.zoom=clamp(this.camera.zoom*factor,.35,1.9);this.camera.x=wx-(x-this.width/2)/this.camera.zoom;this.camera.y=wy-(y-this.height/2)/this.camera.zoom;}}
  focus(){if(this.mode==='globe'){this.orbit.lon=this.town.lon;this.orbit.lat=this.town.lat;this.dirty=true;}else{this.camera.x=48*TILE;this.camera.y=40*TILE;this.camera.zoom=Math.min(.9,this.width/1200);}}
}
