/** Pointer adapter for a single game canvas; all positions use CSS pixels.
 * The renderer keeps zoom limits and camera state. No global listeners or RAF. */
type Point={x:number;y:number};
type Pointer={point:Point;start:Point};
export type CameraInput={
  pan:(dx:number,dy:number)=>void;
  /** Multiplicative zoom, anchored at canvas x/y. */
  zoomAt:(factor:number,x:number,y:number)=>void;
  interact?:()=>void;
  hover?:(x:number,y:number)=>boolean;
  select?:(x:number,y:number,options:{double:boolean})=>void;
};
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const center=(a:Point,b:Point)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});

export function attachCameraInput(canvas:HTMLCanvasElement,input:CameraInput):()=>void {
  const pointers=new Map<number,Pointer>();
  let moved=false,dragging=false,lastTap:{point:Point;time:number}|null=null;
  const originalCursor=canvas.style.cursor;
  const local=(e:PointerEvent|WheelEvent)=>{const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};};
  const down=(e:PointerEvent)=>{
    if(e.button!==0)return;
    input.interact?.();canvas.focus();
    const point=local(e);pointers.set(e.pointerId,{point,start:{...point}});
    canvas.setPointerCapture(e.pointerId);
    if(pointers.size>1){moved=true;dragging=true;lastTap=null;}
  };
  const move=(e:PointerEvent)=>{
    const pointer=pointers.get(e.pointerId),point=local(e);
    if(!pointer){if(!pointers.size)canvas.style.cursor=input.hover?.(point.x,point.y)?'pointer':'grab';return;}
    const before=[...pointers.values()].map(p=>p.point);
    const previous=pointer.point;pointer.point=point;
    if(pointers.size>=2){
      const after=[...pointers.values()].map(p=>p.point);
      const oldCenter=center(before[0],before[1]),newCenter=center(after[0],after[1]);
      const oldDistance=distance(before[0],before[1]),newDistance=distance(after[0],after[1]);
      input.pan(newCenter.x-oldCenter.x,newCenter.y-oldCenter.y);
      if(oldDistance>1&&newDistance>1)input.zoomAt(newDistance/oldDistance,newCenter.x,newCenter.y);
    }else{
      if(!dragging&&distance(point,pointer.start)>5){dragging=true;moved=true;input.pan(point.x-pointer.start.x,point.y-pointer.start.y);}
      else if(dragging)input.pan(point.x-previous.x,point.y-previous.y);
    }
    if(dragging)canvas.style.cursor='grabbing';
  };
  const remove=(e:PointerEvent,cancelled:boolean)=>{
    const pointer=pointers.get(e.pointerId);if(!pointer)return;
    const point=local(e),wasMoved=moved||distance(point,pointer.start)>5;
    pointers.delete(e.pointerId);
    if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
    if(!cancelled&&!wasMoved&&!pointers.size){
      const now=e.timeStamp,double=!!lastTap&&now-lastTap.time<340&&distance(lastTap.point,point)<22;
      input.select?.(point.x,point.y,{double});lastTap=double?null:{point,time:now};
    }
    for(const remaining of pointers.values())remaining.start={...remaining.point};
    if(!pointers.size){moved=false;dragging=false;canvas.style.cursor='grab';}
    if(cancelled)lastTap=null;
  };
  const up=(e:PointerEvent)=>remove(e,false);
  const cancel=(e:PointerEvent)=>remove(e,true);
  const wheel=(e:WheelEvent)=>{
    e.preventDefault();input.interact?.();lastTap=null;
    const point=local(e),unit=e.deltaMode===1?16:e.deltaMode===2?canvas.clientHeight:1;
    const pixels=Math.max(-800,Math.min(800,e.deltaY*unit));
    input.zoomAt(Math.exp(-pixels*.0015),point.x,point.y);
  };
  canvas.addEventListener('pointerdown',down);
  canvas.addEventListener('pointermove',move);
  canvas.addEventListener('pointerup',up);
  canvas.addEventListener('pointercancel',cancel);
  canvas.addEventListener('lostpointercapture',cancel);
  canvas.addEventListener('wheel',wheel,{passive:false});
  return()=>{
    canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);
    canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',cancel);
    canvas.removeEventListener('lostpointercapture',cancel);canvas.removeEventListener('wheel',wheel);
    for(const id of pointers.keys())if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);
    pointers.clear();canvas.style.cursor=originalCursor;
  };
}
