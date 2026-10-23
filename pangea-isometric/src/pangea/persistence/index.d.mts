import type { WorldState } from '../model';
export interface SaveMetadata { id:string; worldId:string; revision:number; savedAt:number; seed:number; tick:number; label:string; paused:boolean; speed:number }
export interface SaveEnvelope extends SaveMetadata { formatVersion:1; snapshot:WorldState; recovered:boolean }
export interface SaveOptions { worldId?:string; expectedRevision?:number; label?:string; paused?:boolean; speed?:number }
export interface CheckpointStore { save(snapshot:WorldState,options?:SaveOptions):Promise<SaveMetadata>; list():Promise<SaveMetadata[]>; latest():Promise<SaveMetadata|null>; load(id?:string):Promise<SaveEnvelope|null>; remove(id:string):Promise<void>; close():Promise<void> }
export declare const checkpointStore:CheckpointStore;
export declare function createCheckpointStore(options?:{name?:string}):CheckpointStore;
export declare function newWorldId():string;
export declare class CheckpointError extends Error { code:string }
export interface RemoteEnvelope { worldId:string; revision:number; savedAt:number; paused:boolean; speed:number; snapshot:WorldState; serverTime:number; backlogTicks:number; token?:string }
export type RemoteCommand={type:'pause'|'resume'}|{type:'speed';speed:number}|{type:'import';snapshot:WorldState};
export declare class RemoteWorldClient {
  constructor(endpoint:string,options?:{token?:string;worldId?:string});
  endpoint:string; worldId:string; token:string; revision:number;
  static configured():{endpoint:string;worldId:string;token:string}|null;
  create(options?:{seed?:number;snapshot?:WorldState;paused?:boolean;speed?:number}):Promise<RemoteEnvelope>;
  read():Promise<RemoteEnvelope>; connect():Promise<RemoteEnvelope>;
  command(command:RemoteCommand,expectedRevision?:number):Promise<RemoteEnvelope>;
  disconnect():void;
}
export declare class RemoteWorldError extends Error { status:number; code:string }
