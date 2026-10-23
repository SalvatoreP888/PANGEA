export interface ActivityBuilding {
  id:number; type:string; x:number; y:number; complete:boolean; funded:boolean; progress:number;
  production?:{inputs:Record<string,number>;outputs:Record<string,number>;batches:number};
}
export interface ActivityPerson {
  id:number;x:number;y:number;alive?:boolean;townId?:number;tripId?:number|null;houseId?:number|null;
  productionDelivery?:number;carry:Record<string,number>;
  task:{kind:string;stage:string;buildingId?:number}|null;
}
export interface BuildingActivity {
  phase:'planned'|'foundation'|'frame'|'roof'|'complete';progress:number;
  workers:number;assignedWorkers:number;activeWork:string|null;occupants:number;visitors:number;
  inputUnits:number;outputUnits:number;incomingUnits:number;
  recentProduction:string|null;productionPulse:number;
  status:'construction'|'working'|'awaiting-collection'|'supplied'|'awaiting-inputs'|'idle';
}
export interface CarrierActivity {units:number;resource:string|null;loaded:boolean}
export interface ActivityTrip {mode?:number;cargo?:Record<string,number>;people?:number[]}
export function inventoryUnits(inventory?:Record<string,number>):number;
export function carrierActivity(person:Pick<ActivityPerson,'carry'>):CarrierActivity;
export function constructionPhase(building:ActivityBuilding):Pick<BuildingActivity,'phase'|'progress'>;
export function tripActivity(trip:ActivityTrip):{kind:'train'|'cart'|'foot';mode:number;cargoUnits:number;passengers:number};
export function deriveTownActivity(town:{id:number;buildings:ActivityBuilding[]},residents:ActivityPerson[]):{
  buildings:Map<number,BuildingActivity>;carriers:Map<number,CarrierActivity>;
};
export class CityActivityTracker {
  reset():void;
  sample(town:{id:number;buildings:ActivityBuilding[]},residents:ActivityPerson[],time:number):ReturnType<typeof deriveTownActivity>;
}
