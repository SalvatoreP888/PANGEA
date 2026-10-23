export type Point={x:number;y:number};
export type Camera={x:number;y:number;zoom:number};
export type Viewport={width:number;height:number};
export type CameraSample={camera:Camera;progress:number;active:boolean;sourceOpacity:number;sourceAnchor:Point;anchor:Point;sourceScale:number};
export type CameraPath=((progress:number)=>Camera)&{duration:number};
export function project(point:Point,camera:Camera,viewport:Viewport):Point;
export function unproject(point:Point,camera:Camera,viewport:Viewport):Point;
export function cameraAtAnchor(anchor:Point,screenAnchor:Point,zoom:number,viewport:Viewport):Camera;
export function zoomAt(camera:Camera,nextZoom:number,screenAnchor:Point,viewport:Viewport):Camera;
export function interpolateCamera(from:Camera,to:Camera,viewport:Viewport):CameraPath;
export class CameraTransition {
  readonly active:boolean;
  remember(key:string,camera:Camera):void;
  recall(key:string,fallback:Camera):Camera;
  clear():void;
  begin(options:{fromKey:string;toKey:string;sourceCamera:Camera;targetCamera:Camera;sourceAnchor:Point;targetAnchor:Point;viewport:Viewport;entryZoom?:number;now?:number;duration?:number;reducedMotion?:boolean}):CameraSample;
  sample(now:number,reducedMotion?:boolean):CameraSample|null;
  finish():CameraSample|null;
  cancel(now:number):CameraSample|null;
}
