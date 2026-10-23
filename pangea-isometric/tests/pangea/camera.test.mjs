import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transformSync} from 'esbuild';
import {project,unproject,cameraAtAnchor,zoomAt,interpolateCamera,CameraTransition} from '../../src/pangea/camera.mjs';

const viewport={width:1200,height:760};
const near=(actual,expected,epsilon=1e-8)=>assert.ok(Math.abs(actual-expected)<epsilon,`${actual} should be near ${expected}`);
const nearPoint=(a,b)=>{near(a.x,b.x);near(a.y,b.y);};
const setup=overrides=>({fromKey:'world',toKey:'settlement:1',sourceCamera:{x:3000,y:1800,zoom:.3},
  targetCamera:{x:4600,y:2000,zoom:1.1},sourceAnchor:{x:3100,y:1850},targetAnchor:{x:4590,y:1980},
  viewport,entryZoom:.06,now:100,duration:720,...overrides});

test('camera projection roundtrips CSS pixels across phone and desktop zoom ranges',()=>{
  for(const size of [viewport,{width:390,height:620}])for(const zoom of [.13,.24,1,2.7]){
    const camera={x:3123,y:-104,zoom};
    for(const point of [{x:0,y:0},{x:5123,y:1900},{x:-20,y:100}])nearPoint(unproject(project(point,camera,size),camera,size),point);
  }
});

test('anchored wheel and pinch zoom leave the world point beneath the cursor unchanged',()=>{
  const camera={x:3050,y:1400,zoom:.42},anchor={x:137,y:526};
  const worldPoint=unproject(anchor,camera,viewport);
  for(const zoom of [.13,.25,1.6,2.7])nearPoint(project(worldPoint,zoomAt(camera,zoom,anchor,viewport),viewport),anchor);
});

test('world-town and local-hall registration aligns distinct coordinate domains',()=>{
  const screenAnchor={x:171,y:333};
  for(const anchor of [{x:3000,y:1200},{x:5110,y:2500}])for(const zoom of [.06,.3,1.2])
    nearPoint(project(anchor,cameraAtAnchor(anchor,screenAnchor,zoom,viewport),viewport),screenAnchor);
});

test('adapted D3 camera path agrees with upstream midpoint and returns exact endpoints',()=>{
  const size={width:1000,height:700},from={x:1300,y:1200,zoom:.25},to={x:1900,y:1500,zoom:1000/900};
  const path=interpolateCamera(from,to,size),midpoint=path(.5);
  near(midpoint.x,1789.7959183673468);near(midpoint.y,1444.8979591836733);near(midpoint.zoom,1000/1967.20297551002);
  assert.deepEqual(path(0),from);assert.deepEqual(path(1),to);
  from.x=0;to.x=0;assert.equal(path(0).x,1300);assert.equal(path(1).x,1900);
});

test('zoom paths stay finite for same, near-coincident and reciprocal zoom endpoints',()=>{
  for(const [from,to] of [[{x:0,y:0,zoom:1},{x:0,y:0,zoom:2}],
    [{x:0,y:0,zoom:2},{x:0,y:0,zoom:1}],
    [{x:1,y:1,zoom:.1},{x:1+1e-9,y:1+1e-9,zoom:3}],
    [{x:100,y:200,zoom:.8},{x:100,y:200,zoom:.8}]]){
    const path=interpolateCamera(from,to,viewport);
    assert.ok(Number.isFinite(path.duration)&&path.duration>=0);
    for(let n=0;n<=100;n++){const c=path(n/100);assert.ok(Number.isFinite(c.x)&&Number.isFinite(c.y)&&Number.isFinite(c.zoom)&&c.zoom>0);}
    assert.deepEqual(path(0),from);assert.deepEqual(path(1),to);
  }
  assert.throws(()=>interpolateCamera({x:0,y:0,zoom:0},{x:1,y:1,zoom:1},viewport),RangeError);
});

test('saved cameras are isolated per settlement and copied at the boundary',()=>{
  const transition=new CameraTransition(),camera={x:1,y:2,zoom:.4};
  transition.remember('world',camera);camera.x=800;
  transition.remember('settlement:1',{x:10,y:20,zoom:1});transition.remember('settlement:2',{x:30,y:40,zoom:2});
  const recalled=transition.recall('world',camera);assert.equal(recalled.x,1);recalled.x=900;
  assert.equal(transition.recall('world',camera).x,1);
  assert.equal(transition.recall('settlement:1',camera).x,10);assert.equal(transition.recall('settlement:2',camera).x,30);
});

test('transition begins on the selected town pixel and finishes on the remembered city camera',()=>{
  const transition=new CameraTransition(),options=setup(),remembered={x:4900,y:2100,zoom:1.5};
  transition.remember(options.toKey,remembered);
  const first=transition.begin(options);
  nearPoint(project(options.targetAnchor,first.camera,viewport),project(options.sourceAnchor,options.sourceCamera,viewport));
  assert.equal(first.sourceOpacity,1);assert.equal(first.active,true);
  assert.deepEqual(transition.recall('world',options.targetCamera),options.sourceCamera);
  let opacity=1;
  for(let now=100;now<820;now+=12){const frame=transition.sample(now);assert.ok(frame.sourceOpacity<=opacity);opacity=frame.sourceOpacity;assert.ok(frame.sourceScale>0);}
  const last=transition.sample(820);assert.deepEqual(last.camera,remembered);assert.equal(last.sourceOpacity,0);assert.equal(transition.active,false);
});

test('interrupting motion retains the displayed camera and a new view replaces pending motion',()=>{
  const transition=new CameraTransition(),options=setup();transition.begin(options);
  const displayed=transition.sample(360),cancelled=transition.cancel(360);
  assert.deepEqual(cancelled.camera,displayed.camera);assert.equal(cancelled.active,false);assert.equal(cancelled.sourceOpacity,0);
  assert.deepEqual(transition.sample(10000).camera,displayed.camera);assert.equal(transition.cancel(10000),null);
  transition.begin(setup({fromKey:'settlement:1',toKey:'world',sourceCamera:displayed.camera,
    sourceAnchor:options.targetAnchor,targetAnchor:options.sourceAnchor,now:400}));
  const last=transition.sample(2000);assert.deepEqual(last.camera,options.sourceCamera);
});

test('reduced motion, preference changes and zero duration complete immediately',()=>{
  for(const override of [{reducedMotion:true},{duration:0}]){
    const transition=new CameraTransition(),options=setup(override),frame=transition.begin(options);
    assert.deepEqual(frame.camera,options.targetCamera);assert.equal(frame.active,false);assert.equal(frame.sourceOpacity,0);
  }
  const transition=new CameraTransition(),options=setup();transition.begin(options);
  assert.deepEqual(transition.sample(130,true).camera,options.targetCamera);assert.equal(transition.active,false);
  transition.clear();assert.equal(transition.sample(900),null);assert.deepEqual(transition.recall('world',options.targetCamera),options.targetCamera);
});

// Exercise the actual TypeScript pointer adapter without a browser or a second
// generated source copy. esbuild is already the standalone packager dependency.
const inputSource=await readFile(new URL('../../src/pangea/input.ts',import.meta.url),'utf8');
const {attachCameraInput}=await import(`data:text/javascript;base64,${Buffer.from(transformSync(inputSource,{loader:'ts',format:'esm'}).code).toString('base64')}`);
class Canvas extends EventTarget {
  style={cursor:'crosshair'};clientHeight=760;captured=new Set();
  focus(){}
  getBoundingClientRect(){return{left:10,top:20};}
  setPointerCapture(id){this.captured.add(id);}
  hasPointerCapture(id){return this.captured.has(id);}
  releasePointerCapture(id){this.captured.delete(id);this.fire('lostpointercapture',{pointerId:id});}
  fire(type,props={}){const event=new Event(type,{cancelable:true});for(const [key,value]of Object.entries(props))Object.defineProperty(event,key,{value});this.dispatchEvent(event);return event;}
}
const pointer=(canvas,type,id,x,y,time=100)=>canvas.fire(type,{pointerId:id,button:0,clientX:x+10,clientY:y+20,timeStamp:time});

test('two moving fingers preserve their centroid world anchor and suppress selection',()=>{
  const canvas=new Canvas();let camera={x:3000,y:1200,zoom:1},selections=0;
  const initial=unproject({x:150,y:100},camera,viewport);
  const cleanup=attachCameraInput(canvas,{
    pan(dx,dy){camera={...camera,x:camera.x-dx/camera.zoom,y:camera.y-dy/camera.zoom};},
    zoomAt(factor,x,y){camera=zoomAt(camera,camera.zoom*factor,{x,y},viewport);},select(){selections++;}
  });
  pointer(canvas,'pointerdown',1,100,100);pointer(canvas,'pointerdown',2,200,100);
  pointer(canvas,'pointermove',1,80,110);pointer(canvas,'pointermove',2,240,110);
  near(camera.zoom,1.6);nearPoint(unproject({x:160,y:110},camera,viewport),initial);
  pointer(canvas,'pointerup',1,80,110);pointer(canvas,'pointerup',2,240,110);
  assert.equal(selections,0);assert.equal(canvas.captured.size,0);cleanup();assert.equal(canvas.style.cursor,'crosshair');
});

test('pointer cancellation, double tap, wheel units and cleanup do not leave stale gestures',()=>{
  const canvas=new Canvas(),taps=[],zooms=[];let pans=0;
  const cleanup=attachCameraInput(canvas,{pan(){pans++;},zoomAt(...args){zooms.push(args);},select(x,y,options){taps.push(options.double);}});
  pointer(canvas,'pointerdown',1,80,100);pointer(canvas,'pointercancel',1,80,100);
  pointer(canvas,'pointerdown',2,80,100,500);pointer(canvas,'pointerup',2,80,100,510);
  pointer(canvas,'pointerdown',3,80,100,700);pointer(canvas,'pointerup',3,80,100,710);
  assert.deepEqual(taps,[false,true]);
  const wheel=canvas.fire('wheel',{deltaY:3,deltaMode:1,clientX:90,clientY:120});
  assert.equal(wheel.defaultPrevented,true);near(zooms[0][0],Math.exp(-48*.0015));near(zooms[0][1],80);near(zooms[0][2],100);
  pointer(canvas,'pointerdown',4,0,0);cleanup();assert.equal(canvas.captured.size,0);
  pointer(canvas,'pointermove',4,100,100);assert.equal(pans,0);
});
