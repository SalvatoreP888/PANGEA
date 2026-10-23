export interface IdentityBuilding {
  type:string; complete:boolean; production?:{batches:number};
}
export interface IdentityTown {
  id:number;name:string;created:number;parentId?:number|null;buildings:IdentityBuilding[];
}
export interface IdentityState {
  seed:number;scenario?:string;towns:{id:number;name:string}[];
  people:{id:number;family:string;alive:boolean;townId:number;tripId?:number|null;generation:number}[];
  events:{id:number;day:number;type:string;title:string;detail:string;townId?:number|null}[];
}
export interface SettlementEmblem {
  accent:string;field:string;motif:'sun'|'chevron'|'bars'|'diamond';
}
export interface SettlementArchitecture {
  key:'camp'|'timber'|'courtyard'|'terraced'|'urban'|'metropolitan';
  label:string;detail:string;material:'none'|'timber'|'masonry'|'steel';dominantType:string|null;
  homes:number;beds:number;counts:{type:string;name:string;homes:number;beds:number}[];
}
export interface SettlementMilestone {id:number;day:number;type:string;title:string;detail:string}
export interface SettlementIdentityProfile {
  emblem:SettlementEmblem;architecture:SettlementArchitecture;residents:number;
  families:{name:string;count:number;memberIds:number[];generation:number}[];
  industries:{kind:string;name:string;building:string;structures:number;batches:number;outputs:string[]}[];
  specialty:{label:string;detail:string};milestones:SettlementMilestone[];
  origin:{day:number;parentName:string|null;constructed:boolean};
}
export function settlementEmblem(seed:number,townId:number):SettlementEmblem;
export function settlementArchitecture(town:Pick<IdentityTown,'buildings'>):SettlementArchitecture;
export function settlementMilestones(state:Pick<IdentityState,'events'>,townId:number,limit?:number):SettlementMilestone[];
export function deriveSettlementIdentity(state:IdentityState,town:IdentityTown):SettlementIdentityProfile;
