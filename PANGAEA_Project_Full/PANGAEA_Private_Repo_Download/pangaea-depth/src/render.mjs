import {streetPolylines} from './city.mjs';
import {clamp,mix,hash,fbm,geography,geoAt,TAU,RAD,GRID_W,GRID_H,TILE,footprint,entrance,findPath,townClimate} from './world.mjs';
import {YEAR,BUILDINGS,ACTION_NAMES,TRANSPORT,SPECIES} from './data.mjs';
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
  reset(sim){this.sim=sim;this.townId=1;this.selected=null;this.camera={x:48*TILE,y:40*TILE,zoom:.72};this.orbit={lon:sim.state.towns[0].lon+.26,lat:.12,zoom:1};this.terrainCache.clear();this.nodeSprites?.clear();this.transition=null;this.streetKey=null;this.railKey=null;this.makeTexture();}
  geometry(){return{r:Math.min(this.width*.39,this.height*.41)*this.orbit.zoom,x:this.width*.52,y:this.height*.53};}
  project(lon,lat){const dl=lon-this.orbit.lon,cl=Math.cos(lat),sl=Math.sin(lat),ca=Math.cos(this.orbit.lat),sa=Math.sin(this.orbit.lat),g=this.geometry();
    const x=cl*Math.sin(dl),y=sl*ca-cl*Math.cos(dl)*sa,z=sl*sa+cl*Math.cos(dl)*ca;return{x:g.x+x*g.r,y:g.y-y*g.r,z,visible:z>0};}
  makeTexture(){
    const w=1000,h=500,c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d'),im=ctx.createImageData(w,h),seed=this.sim.state.seed;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const u=x/w,v=y/h,p=geography(u,v,seed,this.sim.state.planet),i=(y*w+x)*4,grain=(hash(x,y,seed+16)-.5)*(p.land?28:9);let col;
      if(!p.land&&p.meanTemperature< -12&&Math.abs(v-.5)>.4)col=[173,198,199];
      else if(!p.land){const shore=clamp((p.field+.15)/.16,0,1);col=[mix(12,46,shore),mix(42,90,shore),mix(57,96,shore)];}
      else if(p.field<.048)col=[203,187,132];
      else if(p.biome==='Ice cap')col=[214,220,212];
      else if(p.biome==='Tundra')col=[159,174,155];
      else if(p.biome==='Taiga')col=[78,112,91];
      else if(p.biome==='Desert')col=[199,172,113];
      else if(p.biome==='Rainforest')col=[63,115,68];
      else if(p.ridge>.63)col=[165,158,135];
      else if(p.ridge>.57)col=[140,145,112];
      else if(p.moisture>.56){const shade=clamp((p.moisture-.56)*3,0,1);col=[mix(112,52,shade),mix(140,98,shade),mix(77,57,shade)];}
      else if(p.moisture>.43)col=[169,174,112];else col=[191,170,111];
      const ridgeShade=1+(geography(u-.001,v-.001,seed,this.sim.state.planet).ridge-p.ridge)*12;
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
  transitionTo(mode){
    if(mode===this.mode)return;
    if(matchMedia('(prefers-reduced-motion: reduce)').matches){this.mode=mode;this.transition=null;return;}
    const snapshot=document.createElement('canvas');snapshot.width=this.canvas.width;snapshot.height=this.canvas.height;snapshot.getContext('2d').drawImage(this.canvas,0,0);
    const townPoint=this.mode==='globe'?this.project(this.town.lon,this.town.lat):{x:this.width/2,y:this.height/2};
    this.transition={snapshot,from:this.mode,to:mode,start:performance.now(),duration:1000,anchor:townPoint};this.mode=mode;
  }
  draw(time){
    const c=this.ctx;c.setTransform(this.dpr,0,0,this.dpr,0,0);this.hits=[];
    if(this.mode==='globe')this.drawGlobe(time);else this.drawTown(time);
    if(this.transition){
      const t=this.transition,p=clamp((performance.now()-t.start)/t.duration,0,1),ease=p*p*(3-2*p);
      if(p>=1){this.transition=null;return;}
      const zoom=t.to==='town'?1+ease*4:1-ease*.55;
      c.save();c.globalAlpha=1-clamp((p-.15)/.75,0,1);c.translate(this.width/2,this.height/2);c.scale(zoom,zoom);c.translate(-mix(this.width/2,t.anchor.x,ease),-mix(this.height/2,t.anchor.y,ease));c.drawImage(t.snapshot,0,0,this.width,this.height);c.restore();
    }
  }
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
    for(const link of this.sim.state.links||[])this.drawWorldRoute(link,time);
    for(const town of this.sim.state.towns){
      const p=this.project(town.lon,town.lat);if(!p.visible)continue;
      const n=this.sim.residents(town).length,selected=town.id===this.townId;
      c.fillStyle='#d6b87518';c.beginPath();c.arc(p.x,p.y,(selected?20:13)+Math.sin(time*1.8)*1.3,0,TAU);c.fill();
      c.strokeStyle=selected?'#e5c789cc':'#d7bb7266';c.lineWidth=1;c.beginPath();c.arc(p.x,p.y,selected?12:8,0,TAU);c.stroke();
      c.fillStyle=n?'#f0d49a':'#7a9990';c.beginPath();c.arc(p.x,p.y,selected?4.7:3.7,0,TAU);c.fill();
      if(this.labels){this.shadowText(town.name,p.x+19,p.y-4,13,'#f2e8cb');this.shadowText(`${n} lives · ${this.sim.level(town)}`,p.x+19,p.y+13,10,'#b5c9b2');}
      this.hits.push({x:p.x,y:p.y,r:20,kind:'town',id:town.id});
    }
    for(const trip of this.sim.state.trips){
      if(!trip.linkId)this.drawWorldRoute({route:trip.route,tier:0},time);
      const point=this.routePoint(trip),p=this.project(point.lon,point.lat);if(!p.visible)continue;
      c.save();c.translate(p.x,p.y);c.rotate(point.angle||0);
      c.fillStyle=trip.mode>=3?'#f3d89e':'#c9e0c1';c.strokeStyle='#173a3d';c.lineWidth=1;
      const wagons=trip.mode>=3?4:1;
      for(let j=0;j<wagons;j++){c.fillRect(-j*5-4,-2.5,4,5);c.strokeRect(-j*5-4,-2.5,4,5);}
      c.restore();
    }
    c.fillStyle='#c6d7c050';c.font='10px ui-monospace,monospace';c.textAlign='center';c.fillText('P A N G A E A   /   O N E   C O N T I N E N T',g.x,g.y+g.r+37);c.textAlign='left';
  }
  routePoint(trip){
    const f=clamp((this.sim.day-trip.start)/(trip.arrival-trip.start),0,1),v=f*(trip.route.length-1),i=Math.min(trip.route.length-1,Math.floor(v)),a=trip.route[i],b=trip.route[Math.min(i+1,trip.route.length-1)];
    return {lon:mix(a.lon,b.lon,v-i),lat:mix(a.lat,b.lat,v-i)};
  }
  drawWorldRoute(link,time){
    const c=this.ctx,mode=TRANSPORT[link.tier||0],rail=link.tier>=3,points=link.route.map(p=>this.project(p.lon,p.lat));
    const draw=()=>{c.beginPath();let started=false;for(const p of points){if(p.visible){if(started)c.lineTo(p.x,p.y);else c.moveTo(p.x,p.y);started=true;}else started=false;}c.stroke();};
    c.save();c.lineJoin='round';c.lineCap='round';c.strokeStyle='#0d252acf';c.lineWidth=rail?5:3;draw();
    c.strokeStyle=mode.color;c.lineWidth=rail?2.5:1.3;if(!link.tier)c.setLineDash([2,4]);draw();c.setLineDash([]);
    if(rail){c.strokeStyle='#233c3b';c.lineWidth=.8;draw();}
    if(link.project){c.strokeStyle='#e6d3a6';c.lineWidth=1;c.setLineDash([2,5]);draw();}
    c.restore();
  }
  drawStreets(t,bounds){
    const key=`${t.id}:${t.land.navRevision}:${this.layer}:${Math.floor(this.sim.day/5)}`;
    if(this.streetKey!==key){
      const cv=document.createElement('canvas');cv.width=GRID_W*TILE;cv.height=GRID_H*TILE;
      const original=this.ctx;this.ctx=cv.getContext('2d');
      this.drawStreetsLive(t,{x0:0,y0:0,x1:GRID_W,y1:GRID_H});this.ctx=original;
      this.streetImage=cv;this.streetKey=key;
    }
    this.ctx.drawImage(this.streetImage,0,0);
  }
  drawStreetsLive(t,bounds){
    const c=this.ctx;c.save();
    // Activity is a heatmap, never a fabricated network of neighbouring worn cells.
    if(this.layer==='activity')for(let y=1;y<GRID_H-1;y++)for(let x=1;x<GRID_W-1;x++){
      const traffic=t.land.roads[y*GRID_W+x];if(traffic<3)continue;
      c.fillStyle=`rgba(196,147,79,${Math.min(.28,traffic/600)})`;c.beginPath();c.ellipse((x+.5)*TILE,(y+.5)*TILE,6,5,0,0,TAU);c.fill();
    }
    c.lineCap='round';c.lineJoin='round';
    const stroke=points=>{
      if(points.length<2)return;c.beginPath();c.moveTo((points[0].x+.5)*TILE,(points[0].y+.5)*TILE);
      for(let i=1;i<points.length-1;i++){
        const a=points[i],b=points[i+1];c.quadraticCurveTo((a.x+.5)*TILE,(a.y+.5)*TILE,(a.x+b.x+1)*TILE/2,(a.y+b.y+1)*TILE/2);
      }
      const last=points[points.length-1];c.lineTo((last.x+.5)*TILE,(last.y+.5)*TILE);c.stroke();
    };
    for(const {points,tier}of streetPolylines(t)){
      c.strokeStyle=tier===3?'#7f806b88':'#7f704b44';c.lineWidth=tier===3?6.5:tier===2?6:3.5;stroke(points);
      c.strokeStyle=tier===3?'#b3b29a':tier===2?'#bba57a':'#a5966a99';c.lineWidth=tier===3?4.8:tier===2?4:2.1;stroke(points);
      if(tier===3){c.strokeStyle='#d5ceb422';c.lineWidth=.65;stroke(points);}
    }
    c.restore();
  }
  drawLocalRail(t,time){
    const links=(this.sim.state.links||[]).filter(l=>l.tier>=3&&[l.from,l.to].includes(t.id)),station=t.buildings.find(b=>b.type==='station'&&b.complete);if(!links.length||!station)return;
    const key=`${t.id}:${t.land.navRevision}:${station.id}`;
    if(this.railKey!==key){const door=entrance(station);this.railPath=findPath(t,door.x,door.y,74,57)||[];this.railKey=key;}
    const path=this.railPath,c=this.ctx;if(!path.length)return;
    c.save();c.lineJoin='round';c.lineCap='round';
    const stroke=()=>{c.beginPath();path.forEach((p,i)=>{const x=(p.x+.5)*TILE,y=(p.y+.5)*TILE;if(i)c.lineTo(x,y);else c.moveTo(x,y);});c.stroke();};
    c.strokeStyle='#6b705e';c.lineWidth=8;stroke();c.strokeStyle='#d3c49e';c.lineWidth=7;c.setLineDash([1.4,4]);stroke();c.setLineDash([]);c.strokeStyle='#2d403b';c.lineWidth=5;stroke();c.strokeStyle='#c0c2af';c.lineWidth=2.7;stroke();c.strokeStyle='#4b5b51';c.lineWidth=1;stroke();
    for(const trip of this.sim.state.trips.filter(tr=>tr.mode>=3&&(tr.from===t.id||tr.to===t.id))){
      const f=clamp((this.sim.day-trip.start)/(trip.arrival-trip.start),0,1),local=trip.from===t.id?f/.28:(1-f)/.28;if(local>1)continue;
      const index=Math.floor(local*(path.length-1));for(let j=0;j<5;j++){const p=path[Math.max(0,index-j)];c.fillStyle=j?'#a58d63':'#334f4b';c.fillRect(p.x*TILE+4,p.y*TILE+5,10,7);c.fillStyle='#e3cea0';c.fillRect(p.x*TILE+6,p.y*TILE+6,2,2);if(!j&&trip.mode===3)this.smoke(p.x*TILE+7,p.y*TILE+4,time,trip.id);}
    }c.restore();
  }
  shadowText(text,x,y,size,color){const c=this.ctx;c.save();c.font=`${size>=12?'600 ':''}${size}px system-ui`;c.textAlign='left';c.fillStyle=color;c.shadowColor='#061922';c.shadowBlur=6;c.fillText(text,x,y);c.restore();}
  baseTerrain(t){
    const climate=townClimate(this.sim.state.seed,t,this.sim.state.planet,this.sim.day);
    this.localClimate=climate;const key=`${t.id}:${this.sim.season}:${Math.floor(climate.temperature/2)}:${this.layer}:${JSON.stringify(this.sim.state.planet)}`;if(this.terrainCache.has(key))return this.terrainCache.get(key);
    const cv=document.createElement('canvas');cv.width=GRID_W*TILE;cv.height=GRID_H*TILE;const c=cv.getContext('2d');
    const winter=climate.temperature<1,autumn=climate.meanTemperature<18&&this.sim.season===2,seed=this.sim.state.seed+t.id*7;
    for(let y=0;y<GRID_H;y++)for(let x=0;x<GRID_W;x++){
      const tile=t.land.tiles[y*GRID_W+x],n=fbm(x*.07,y*.07,seed),water=tile.type==='water'||tile.type==='river'||tile.type==='ford';
      let col;
      if(water)col=tile.type==='water'?`rgb(${27+n*7},${65+n*12},${78+n*13})`:tile.type==='ford'?'#63817b':'#3a7277';
      else if(tile.type==='sand')col='#c4b17e';
      else if(tile.type==='rock')col=`rgb(${139+n*13},${143+n*13},${116+n*11})`;
      else if(winter)col=`rgb(${172+n*18},${178+n*16},${151+n*17})`;
      else if(autumn)col=`rgb(${147+n*22},${151+n*19},${92+n*16})`;
      else if(climate.biome==='Desert')col=`rgb(${183+n*20},${163+n*16},${103+n*14})`;else col=`rgb(${139+n*20},${158+n*20},${93+n*18})`;
      c.fillStyle=col;c.fillRect(x*TILE,y*TILE,TILE,TILE);
      for(let k=0;k<2;k++){
        const q=hash(x*9+k,y,seed+50);c.fillStyle=water?(q>.5?'#9ec5b51a':'#102c3620'):(q>.72?'#f5eab318':'#4e692614');
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
    this.drawStreets(t,bounds);
    this.drawLocalRail(t,time);
    const objects=[];
    for(const n of t.land.nodes)if(n.x>=bounds.x0&&n.x<=bounds.x1&&n.y>=bounds.y0&&n.y<=bounds.y1)objects.push({y:n.y,kind:'node',item:n});
    for(const b of t.buildings)if(b.x>=bounds.x0-4&&b.x<=bounds.x1+4&&b.y>=bounds.y0-4&&b.y<=bounds.y1+4)objects.push({y:b.y+1,kind:'building',item:b});
    for(const p of this.sim.residents(t))if(p.x>=bounds.x0&&p.x<=bounds.x1&&p.y>=bounds.y0&&p.y<=bounds.y1)objects.push({y:p.y+.5,kind:'person',item:p});
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
    this.nodeSprites||=new Map();const phase=n.amount/n.max<.05?0:n.amount/n.max>.2?2:1;
    const key=`${n.kind}:${phase}:${this.sim.season}:${Math.floor((this.localClimate?.temperature||14)/2)}:${this.layer}:${Math.floor(hash(n.x,n.y,this.sim.state.seed)*8)}`;
    let sprite=this.nodeSprites.get(key);
    if(!sprite){
      sprite=document.createElement('canvas');sprite.width=48;sprite.height=64;
      const original=this.ctx;this.ctx=sprite.getContext('2d');this.ctx.translate(24-(n.x*TILE+10),48-(n.y*TILE+12));
      this.drawNodeArt(n,time);this.ctx=original;this.nodeSprites.set(key,sprite);
      if(this.nodeSprites.size>240)this.nodeSprites.delete(this.nodeSprites.keys().next().value);
    }
    this.ctx.drawImage(sprite,n.x*TILE+10-24,n.y*TILE+12-48);
  }
  drawNodeArt(n,time){
    const c=this.ctx,x=n.x*TILE+10,y=n.y*TILE+12,seed=this.sim.state.seed,amount=n.amount/n.max;
    if(n.kind==='wood'){
      if(amount<.05){c.fillStyle='#6d583b';c.fillRect(x-3,y-4,6,6);c.fillStyle='#aa8c5b';c.fillRect(x-3,y-5,6,2);return;}
      const h=22+hash(n.x,n.y,seed)*12;
      c.fillStyle='#253e322d';c.beginPath();c.ellipse(x+7,y+2,12,5,-.25,0,TAU);c.fill();
      c.fillStyle='#6b6043';c.fillRect(x-2,y-14,4,15);
      const autumn=(this.localClimate?.meanTemperature||14)<18&&this.sim.season===2,winter=(this.localClimate?.temperature||14)<1;
      c.fillStyle=winter?'#5e7867':autumn?'#757d41':'#466b42';
      c.beginPath();c.moveTo(x,y-h);c.lineTo(x+11,y-7);c.lineTo(x-10,y-7);c.closePath();c.fill();
      c.fillStyle=winter?'#8b9d80':autumn?'#9c9551':'#6b8a4d';c.beginPath();c.moveTo(x,y-h);c.lineTo(x+1,y-7);c.lineTo(x-10,y-7);c.closePath();c.fill();
      c.fillStyle='#b7c18244';c.fillRect(x-5,y-h+13,3,2);
    }else if(['stone','ore','coal','clay'].includes(n.kind)){
      if(amount<.05)return;c.fillStyle='#334a322e';c.beginPath();c.ellipse(x+3,y+2,9,4,0,0,TAU);c.fill();
      c.fillStyle=n.kind==='coal'?'#4d5853':n.kind==='ore'?'#9e7961':n.kind==='clay'?'#af8e67':'#a3a58f';c.beginPath();c.moveTo(x-8,y);c.lineTo(x-7,y-8);c.lineTo(x,y-13);c.lineTo(x+8,y-7);c.lineTo(x+9,y);c.closePath();c.fill();c.fillStyle=n.kind==='coal'?'#7d8376':n.kind==='ore'?'#c29b76':'#c6c3a3';c.beginPath();c.moveTo(x-7,y-8);c.lineTo(x,y-13);c.lineTo(x+3,y-4);c.closePath();c.fill();
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
    if(['farm','wheatfield','flaxfield'].includes(b.type)){
      c.fillStyle='#a89c67';c.fillRect(px-3,py-3,w+6,h+6);c.fillStyle='#786344';c.fillRect(px,py,w,h);
      for(let row=0;row<5;row++){
        c.fillStyle='#524c3266';c.fillRect(px+4,py+5+row*(h-8)/5,w-8,3);
        if(b.crop.sown||b.crop.yield>0)for(let col=0;col<6;col++){
          const growth=b.crop.yield>0?1:b.crop.growth/80;
          c.fillStyle=b.type==='flaxfield'?'#94a7b4':growth>.8?'#c6bd70':'#83a04d';c.fillRect(px+5+col*(w-8)/6,py+3+row*(h-8)/5,4,2+growth*6);
          c.fillStyle=growth>.8?'#eee1a1':'#abc574';c.fillRect(px+5+col*(w-8)/6,py+2+row*(h-8)/5,2,2);
        }
      }return;
    }
    if(b.type==='well'){
      c.fillStyle='#b1af91';c.fillRect(x-12,y-6,25,17);c.fillStyle='#34606a';c.fillRect(x-8,y-4,17,9);c.fillStyle='#736446';c.fillRect(x-13,y-24,3,25);c.fillRect(x+11,y-24,3,25);c.fillStyle='#a17b4f';c.beginPath();c.moveTo(x-18,y-24);c.lineTo(x,y-35);c.lineTo(x+18,y-24);c.fill();return;
    }
    // A coherent small-scale kit: material, roof, floor count and actual use drive form.
    const floors={hut:1,cottage:1,rowhouse:2,tenement:3,apartment:5}[b.type]||1;
    const rise=(floors-1)*4,roof=py-rise,body=h*.68+rise;
    c.fillStyle='#19392b33';c.beginPath();c.moveTo(px+3,py+h);c.lineTo(px+w+8,py+h+6);c.lineTo(px+w+9,roof+5);c.lineTo(px+w,roof);c.closePath();c.fill();
    c.fillStyle=b.type==='apartment'?'#aaa998':b.type==='tenement'?'#bda989':'#b6ae8c';c.fillRect(px+1,roof+5,w-2,body);
    c.fillStyle='#726b55';c.fillRect(px+w-5,roof+5,4,body);
    for(let floor=0;floor<floors;floor++)for(let col=0;col<Math.max(1,Math.floor(w/9));col++){
      c.fillStyle=(col+floor+b.id)%3?'#e2cf97':'#526457';c.fillRect(px+4+col*8,py+h-6-floor*5,3,3);
    }
    c.fillStyle='#3b4d40';c.fillRect(b.x*TILE+6,py+h-6,4,6);
    const industry=['workshop','furnace','steelworks','factory','mine','sawmill','mill','bakery','kiln','claypit','weaver'].includes(b.type);
    const roofs=['#ab7958','#997451','#b1946c','#8c7865','#a36e53'];
    c.fillStyle=b.type==='apartment'?'#657e7a':industry?'#6d7c78':roofs[b.id%roofs.length];
    c.beginPath();c.moveTo(px-2,roof+10);c.lineTo(px+3,roof-2);c.lineTo(px+w-3,roof-2);c.lineTo(px+w+2,roof+10);c.closePath();c.fill();
    c.fillStyle='#dfc69b44';c.fillRect(px+3,roof-2,w-6,2);
    c.strokeStyle='#554d443a';c.lineWidth=.6;for(let yy=roof+2;yy<roof+10;yy+=3){c.beginPath();c.moveTo(px+1,yy);c.lineTo(px+w-1,yy);c.stroke();}
    if(industry){c.fillStyle='#746e61';c.fillRect(px+w-8,roof-9,4,14);this.smoke(px+w-6,roof-10,time,b.id);c.fillStyle='#8b8062';c.fillRect(px-3,py+h-3,6,4);}
    if(b.type==='mill'){
      c.save();c.translate(px+w/2,roof+6);c.strokeStyle='#d6ccac';c.lineWidth=2;const turning=this.sim.residents(this.town).some(p=>p.task?.kind==='mill');c.rotate(turning?this.sim.state.tick*.07:.4);for(let j=0;j<4;j++){c.rotate(Math.PI/2);c.beginPath();c.moveTo(0,0);c.lineTo(0,-12);c.stroke();c.fillStyle='#b8b79a';c.fillRect(-3,-12,3,8);}c.restore();
    }
    if(b.type==='fishery'){c.fillStyle='#8e7957';c.fillRect(px-2,py+h,w+4,5);c.strokeStyle='#bbac80';c.lineWidth=.6;for(let j=2;j<w;j+=4){c.beginPath();c.moveTo(px+j,py+h);c.lineTo(px+j,py+h+5);c.stroke();}c.fillStyle='#476e70';c.beginPath();c.ellipse(px+w-3,py+h+8,8,3,-.15,0,TAU);c.fill();}
    if(b.type==='station'){
      c.fillStyle='#d8cbb0';c.fillRect(px-3,py+h,w+6,4);c.fillStyle='#4d6863';c.fillRect(px-2,py+h+1,w+4,1);
      c.fillStyle='#eee2b9';c.fillRect(px+w/2-3,roof+2,6,6);c.fillStyle='#334a42';c.fillRect(px+w/2,roof+3,1,3);
    }
    if(b.type==='clinic'){c.fillStyle='#d9ddc3';c.fillRect(px+w/2-1,roof+3,2,6);c.fillRect(px+w/2-3,roof+5,6,2);}
    if(b.type==='school'||b.type==='university'){c.fillStyle='#d9c17e';c.fillRect(px+w/2-1,roof-9,1,8);c.fillRect(px+w/2,roof-9,6,3);}
  }
  smoke(x,y,time,seed){const c=this.ctx;for(let j=0;j<3;j++){const f=((time*.25+j*.33+hash(seed,j,88))%1);c.fillStyle=`rgba(219,222,199,${(1-f)*.15})`;c.beginPath();c.arc(x+Math.sin(f*4+seed)*6,y-f*29,2+f*5,0,TAU);c.fill();}}
  drawPerson(p,time){
    const c=this.ctx,x=p.x*TILE+10,y=p.y*TILE+10,child=p.ageDays<12*YEAR,scale=(child?.75:1)*.24,selected=this.selected?.kind==='person'&&this.selected.id===p.id;
    c.save();c.translate(x,y);c.scale(scale,scale);
    c.fillStyle='#203f3444';c.beginPath();c.ellipse(2,2,6,3,0,0,TAU);c.fill();
    if(selected){c.strokeStyle='#ffe2a0';c.lineWidth=1.5;c.beginPath();c.ellipse(0,1,11,6,0,0,TAU);c.stroke();}
    const walking=p.task?.stage==='walk', stride=walking?Math.sin(time*12+p.id)*2:0;
    c.fillStyle='#37483c';c.fillRect(-3+stride,-4,3,7);c.fillRect(1-stride,-4,3,7);
    if(p.species==='elf'){c.fillStyle=SPECIES.elf.skin;c.fillRect(-5,-21,11,2);}
    c.fillStyle=p.color;c.fillRect(-5,-14,10,11);c.fillStyle=SPECIES[p.species]?.skin||'#e0bc94';c.fillRect(-3,-22,7,8);c.fillStyle='#62533a';c.fillRect(-4,-24,8,4);
    c.fillStyle=SPECIES[p.species]?.skin||'#e3c69d';c.fillRect(-7,-12-stride,2,6);c.fillRect(5,-12+stride,2,6);
    if(Object.values(p.carry).some(n=>n>0)){c.fillStyle='#a38757';c.fillRect(-9,-10,6,7);c.strokeStyle='#e2c48a';c.strokeRect(-9,-10,6,7);}
    if(p.sick){c.fillStyle='#cad2a0';c.fillRect(6,-25,3,3);}
    c.restore();
    if(selected){c.strokeStyle='#ffe2a0';c.lineWidth=1; c.beginPath();c.ellipse(x,y+1,6,3,0,0,TAU);c.stroke();}
    if(this.labels&&(selected||this.camera.zoom>1.45&&this.sim.residents(this.town).length<80)){c.font=`${selected?'600 ':''}10px system-ui`;c.textAlign='center';const w=c.measureText(p.name).width;c.fillStyle='#19382ec9';c.fillRect(x-w/2-4,y-20,w+8,14);c.fillStyle=selected?'#fff1c8':'#e4e5d1';c.fillText(p.name,x,y-10);c.textAlign='left';}
    const pt=this.screen(p.x,p.y);this.hits.unshift({x:pt.x,y:pt.y-3*this.camera.zoom,r:Math.max(3,4*this.camera.zoom),kind:'person',id:p.id});
  }
  hit(x,y){return this.hits.find(h=>Math.hypot(h.x-x,h.y-y)<=h.r)||null;}
  pan(dx,dy){if(this.mode==='globe'){this.orbit.lon-=dx/this.width*4;this.orbit.lat=clamp(this.orbit.lat+dy/this.height*2.5,-1.3,1.3);this.dirty=true;}else{this.camera.x=clamp(this.camera.x-dx/this.camera.zoom,0,GRID_W*TILE);this.camera.y=clamp(this.camera.y-dy/this.camera.zoom,0,GRID_H*TILE);}}
  zoom(delta,x,y){const factor=delta>0?.88:1.14;if(this.mode==='globe'){this.orbit.zoom=clamp(this.orbit.zoom*factor,.65,1.4);this.dirty=true;}else{const wx=(x-this.width/2)/this.camera.zoom+this.camera.x,wy=(y-this.height/2)/this.camera.zoom+this.camera.y;this.camera.zoom=clamp(this.camera.zoom*factor,.2,3.5);this.camera.x=wx-(x-this.width/2)/this.camera.zoom;this.camera.y=wy-(y-this.height/2)/this.camera.zoom;}}
  focus(){if(this.mode==='globe'){this.orbit.lon=this.town.lon;this.orbit.lat=this.town.lat;this.dirty=true;}else{this.camera.x=48*TILE;this.camera.y=40*TILE;this.camera.zoom=Math.min(.95,this.width/(this.town.buildings.length>60?1450:1000));}}
}
