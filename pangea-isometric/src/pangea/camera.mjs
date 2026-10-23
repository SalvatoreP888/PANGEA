/** Camera geometry and registered world/city transitions, in CSS pixels.
 * Zoom interpolation adapted from d3-interpolate/src/zoom.js, ISC.
 * Copyright 2010-2021 Mike Bostock. Upstream revision:
 * 2eeffc0d02f2947552cf0a0b73bdf26fe90e1c28.
 * Full notice: LICENSES/d3-interpolate-ISC.txt.
 * PANGEA adds camera conversion, exact endpoints, registration and lifecycle.
 */

const copy = camera => ({x:camera.x, y:camera.y, zoom:camera.zoom});
const clamp01 = value => Math.max(0, Math.min(1, value));

export function project(point, camera, viewport) {
  return {x:(point.x-camera.x)*camera.zoom+viewport.width/2,
    y:(point.y-camera.y)*camera.zoom+viewport.height/2};
}

export function unproject(point, camera, viewport) {
  return {x:(point.x-viewport.width/2)/camera.zoom+camera.x,
    y:(point.y-viewport.height/2)/camera.zoom+camera.y};
}

export function cameraAtAnchor(anchor, screenAnchor, zoom, viewport) {
  return {x:anchor.x-(screenAnchor.x-viewport.width/2)/zoom,
    y:anchor.y-(screenAnchor.y-viewport.height/2)/zoom, zoom};
}

/** nextZoom is absolute; clamps belong to the renderer's view-specific policy. */
export function zoomAt(camera, nextZoom, screenAnchor, viewport) {
  return cameraAtAnchor(unproject(screenAnchor,camera,viewport),screenAnchor,nextZoom,viewport);
}

// van Wijk/Nuij interpolation from d3-interpolate. This module has no dependency
// on d3-color or a second animation loop. Coordinates share one scene domain.
function zoomInterpolator(p0,p1) {
  const rho=Math.SQRT2, rho2=2, rho4=4;
  const [ux0,uy0,w0]=p0, [ux1,uy1,w1]=p1;
  const dx=ux1-ux0, dy=uy1-uy0, d2=dx*dx+dy*dy;
  let interpolate, distance;
  if(d2<1e-12) {
    distance=Math.log(w1/w0)/rho;
    interpolate=t=>[ux0+t*dx,uy0+t*dy,w0*Math.exp(rho*t*distance)];
  } else {
    const d1=Math.sqrt(d2);
    const b0=(w1*w1-w0*w0+rho4*d2)/(2*w0*rho2*d1);
    const b1=(w1*w1-w0*w0-rho4*d2)/(2*w1*rho2*d1);
    const r0=-Math.asinh(b0), r1=-Math.asinh(b1);
    distance=(r1-r0)/rho;
    interpolate=t=>{
      const s=t*distance;
      const u=w0/(rho2*d1)*(Math.cosh(r0)*Math.tanh(rho*s+r0)-Math.sinh(r0));
      return [ux0+u*dx,uy0+u*dy,w0*Math.cosh(r0)/Math.cosh(rho*s+r0)];
    };
  }
  interpolate.duration=Math.abs(distance*1000*rho/Math.SQRT2);
  return interpolate;
}

function validCamera(camera) {
  return Number.isFinite(camera.x)&&Number.isFinite(camera.y)&&Number.isFinite(camera.zoom)&&camera.zoom>0;
}

export function interpolateCamera(from,to,viewport) {
  if(!validCamera(from)||!validCamera(to)||!Number.isFinite(viewport.width)||viewport.width<=0)
    throw new RangeError('Camera interpolation needs finite centers, positive zoom and viewport width.');
  const start=copy(from),end=copy(to),width=viewport.width;
  const interpolate=zoomInterpolator([start.x,start.y,width/start.zoom],[end.x,end.y,width/end.zoom]);
  const sample=progress=>{
    if(progress<=0)return copy(start);
    if(progress>=1)return copy(end);
    const [x,y,w]=interpolate(progress);
    return {x,y,zoom:width/w};
  };
  sample.duration=interpolate.duration;
  return sample;
}

/** Transition across two coordinate domains, without owning a RAF or renderer.
 * Renderer changes its semantic view at begin(), and can crossfade a single old
 * canvas snapshot using sourceAnchor/anchor/sourceScale from sample(). */
export class CameraTransition {
  constructor() { this.cameras=new Map();this.motion=null;this.current=null; }
  get active() { return this.motion!==null; }
  remember(key,camera) { this.cameras.set(key,copy(camera)); }
  recall(key,fallback) { return copy(this.cameras.get(key)||fallback); }
  clear() { this.cameras.clear();this.motion=null;this.current=null; }
  begin(options) {
    const {fromKey,toKey,sourceCamera,targetCamera,sourceAnchor,targetAnchor,viewport,entryZoom,
      now=0,reducedMotion=false,duration=720}=options;
    this.remember(fromKey,sourceCamera);
    const target=this.recall(toKey,targetCamera);
    const screenAnchor=project(sourceAnchor,sourceCamera,viewport);
    const start=cameraAtAnchor(targetAnchor,screenAnchor,entryZoom??target.zoom,viewport);
    const interpolate=interpolateCamera(start,target,viewport);
    this.motion={toKey,target,start,viewport:{width:viewport.width,height:viewport.height},sourceAnchor:screenAnchor,
      targetAnchor:{...targetAnchor},startTime:now,duration:Math.max(0,duration),interpolate};
    if(reducedMotion||duration<=0)return this.finish();
    return this.sample(now);
  }
  sample(now,reducedMotion=false) {
    if(!this.motion)return this.current;
    if(reducedMotion)return this.finish();
    const m=this.motion,progress=clamp01((now-m.startTime)/m.duration);
    if(progress>=1)return this.finish();
    // Ease wall time to avoid instantaneous camera velocity at either endpoint.
    const t=progress*progress*(3-2*progress),camera=m.interpolate(t);
    const anchor=project(m.targetAnchor,camera,m.viewport);
    const fade=clamp01(progress/.48);
    this.current={camera,progress,active:true,
      sourceOpacity:1-fade*fade*(3-2*fade),sourceAnchor:{...m.sourceAnchor},anchor,
      sourceScale:camera.zoom/m.start.zoom};
    return this.current;
  }
  finish() {
    if(!this.motion)return this.current;
    const m=this.motion,camera=copy(m.target);
    this.remember(m.toKey,camera);
    this.current={camera,progress:1,active:false,sourceOpacity:0,
      sourceAnchor:{...m.sourceAnchor},anchor:project(m.targetAnchor,camera,m.viewport),sourceScale:1};
    this.motion=null;
    return this.current;
  }
  /** Sample first, so input never snaps back to a stale start/end camera. */
  cancel(now) {
    if(!this.motion)return null;
    const current=this.sample(now);
    if(!current)return null;
    if(this.motion)this.remember(this.motion.toKey,current.camera);
    this.motion=null;
    this.current={...current,camera:copy(current.camera),active:false,sourceOpacity:0};
    return this.current;
  }
}
