import { Simulation } from './simulation/sim.mjs';
import { createCityLaboratory } from './simulation/scenarios.mjs';

export type View = 'world' | 'settlement';
export type Section = 'overview' | 'people' | 'supply' | 'knowledge' | 'chronicle';
export type Selection = { kind: 'building' | 'person'; id: number } | null;
export interface Person {
  id: number; name: string; family: string; species: string; alive: boolean; townId: number;
  x: number; y: number; ageDays: number; mood: number; health: number; color: string;
  needs: Record<string, number>; skills: Record<string, number>; carry: Record<string, number>;
  task: { kind: string; stage: string; buildingId?: number; path?: {x:number;y:number}[]; index?:number } | null; houseId?: number|null; tripId?: number|null; why: string; reflection: string;
  memories: { day: number; text: string; tag: string }[]; generation: number;
}
export interface Building {
  id: number; type: string; x: number; y: number; complete: boolean;
  progress: number; funded: boolean; crop?: { sown?: boolean; growth: number; yield: number };
  production?: { inputs: Record<string, number>; outputs: Record<string, number>; batches: number };
}
export interface Town {
  id: number; parentId?: number|null; name: string; lon: number; lat: number; created: number;
  res: Record<string, number>; buildings: Building[]; knowledge: string[]; research: number;
  policy: string; policyReason: string; weather: { kind: string };
  land: {
    tiles: { type: string; forest: boolean; fertility: number; walkable: boolean }[];
    nodes: { id: number; x: number; y: number; kind: string; amount: number; max: number }[];
    streets: number[]; streetEdges: number[]; navRevision: number;
  };
}
export interface WorldState {
  version: number; generationVersion?: number; seed: number; tick: number; scenario?: string; planet: Record<string, number>;
  towns: Town[]; people: Person[];
  events: { id: number; day: number; title: string; detail: string; text?: string; type: string; townId?: number|null; people?: number[] }[];
  links: { id: number; from: number; to: number; tier: number; route: { lon: number; lat: number }[] }[];
  trips: { id: number; start: number; arrival: number; mode?: number; cargo?: Record<string, number>; people?: number[]; route: { lon: number; lat: number }[] }[];
}
export interface WorldSimulation {
  state: WorldState; day: number; year: number; season: number; alive: Person[];
  step(): void; snapshot(): WorldState; invariants(): string[];
  town(id: number): Town | undefined; residents(town: Town): Person[];
  level(town: Town): string; capacity(town: Town): number; foodDays(town: Town): number;
  currentTech(town: Town): { id: string; name: string; cost: number } | undefined;
  advanceDays(days: number): void;
}
const Engine = Simulation as unknown as {
  new(seed?: number): WorldSimulation;
  fromSnapshot(state: unknown): WorldSimulation;
};
/** Fresh worlds choose a seed once; snapshots retain it for exact restoration. */
export const randomSeed = () => {
  const value=new Uint32Array(1);
  if(typeof crypto!=='undefined'&&crypto.getRandomValues)crypto.getRandomValues(value);
  else value[0]=Math.floor(Math.random()*0x100000000);
  return value[0]%2147483646+1;
};
export const makeWorld = (seed = randomSeed()) => { const sim=new Engine(seed); sim.state.towns[0].name="Alderhaven"; return sim; };
export const loadWorld = (state: unknown) => Engine.fromSnapshot(state);
export const makeShowcase = (seed = randomSeed()) => { const sim=createCityLaboratory(seed, 240) as unknown as WorldSimulation; sim.state.towns.forEach((t,i)=>{t.name=["Alderhaven","Stoneford","Willowmere"][i]||t.name;}); return sim; };
export const format = (value: number) => Math.floor(value || 0).toLocaleString('en-US');
export const seasons = ['Spring', 'Summer', 'Autumn', 'Winter'];
export const resourceLabels: Record<string, string> = {food:'Food', wood:'Timber', stone:'Stone', tools:'Tools', meals:'Meals', grain:'Grain', flour:'Flour', bread:'Bread', fish:'Fish', ore:'Iron ore', coal:'Coal', iron:'Iron', steel:'Steel', clay:'Clay', bricks:'Bricks', flax:'Flax', cloth:'Cloth', herbs:'Herbs', goods:'Goods'};
