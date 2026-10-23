import {BUILDINGS, RECIPES, RESOURCE_NAMES} from './data.mjs';
import {hash} from './world.mjs';

// Identity is a view of existing records. Reading it never advances the world,
// reserves goods, creates relationships, or consumes the simulation's RNG.
const housingStyles = {
  hut: {key:'timber',label:'Timber hearths',material:'timber'},
  cottage: {key:'courtyard',label:'Courtyard homes',material:'timber'},
  rowhouse: {key:'terraced',label:'Brick terraces',material:'masonry'},
  tenement: {key:'urban',label:'Dense city blocks',material:'masonry'},
  apartment: {key:'metropolitan',label:'Metropolitan skyline',material:'steel'},
};
const industryNames = {
  smelt:'Ironworking',steel:'Steelmaking',manufacture:'Machine making',
  mill:'Grain milling',bake:'Bread baking',fireBricks:'Brickmaking',
  weave:'Cloth weaving',preserveFish:'Fish preparation',
};
const palettes = [
  ['#ddb675','#253b3a'],['#9fc9be','#283743'],['#c7b5e1','#363242'],
  ['#dba799','#41342d'],['#bfc993','#293a32'],['#99bbd6','#303848'],
];
const motifs = ['sun','chevron','bars','diamond'];
const milestoneTypes = new Set(['founding','build','knowledge','family','birth','death','migration','council','weather','transport']);
const byName = (a,b) => a < b ? -1 : a > b ? 1 : 0;

/** Stable decorative emblem; it makes no claim about history or culture. */
export function settlementEmblem(seed,townId) {
  const [accent,field] = palettes[Math.floor(hash(townId,307,seed)*palettes.length)];
  return {accent,field,motif:motifs[Math.floor(hash(townId,911,seed)*motifs.length)]};
}

/** Built housing character, weighted by installed beds rather than planned roofs. */
export function settlementArchitecture(town) {
  const grouped = new Map();
  for(const b of town.buildings) {
    const beds = BUILDINGS[b.type]?.beds || 0;
    if(!b.complete || !beds)continue;
    const count = grouped.get(b.type) || {type:b.type,name:BUILDINGS[b.type].name,homes:0,beds:0};
    count.homes++;count.beds+=beds;grouped.set(b.type,count);
  }
  const counts = [...grouped.values()].sort((a,b)=>b.beds-a.beds||byName(a.type,b.type));
  const homes = counts.reduce((n,b)=>n+b.homes,0), beds = counts.reduce((n,b)=>n+b.beds,0);
  const dominantType = counts[0]?.type || null;
  const style = housingStyles[dominantType] || {key:'camp',label:'An open camp',material:'none'};
  return {...style,dominantType,homes,beds,counts,
    detail:homes?`${homes} completed housing ${homes===1?'structure':'structures'} · ${beds} installed beds`:'No permanent homes completed yet.'};
}

/** Factual town-scoped retained events, newest first. The event log is bounded. */
export function settlementMilestones(state,townId,limit=5) {
  return state.events.filter(e=>e.townId===townId&&milestoneTypes.has(e.type))
    .sort((a,b)=>b.day-a.day||b.id-a.id).slice(0,Math.max(0,Math.floor(limit)))
    .map(e=>({id:e.id,day:e.day,type:e.type,title:e.title,detail:e.detail}));
}

/** A surname grouping is observable; shared ancestry is never inferred from it. */
export function deriveSettlementIdentity(state,town) {
  const residents = state.people.filter(p=>p.alive&&p.townId===town.id&&!p.tripId);
  const grouped = new Map();
  for(const p of residents) {
    const family = grouped.get(p.family) || {name:p.family,count:0,memberIds:[],generation:0};
    family.count++;family.memberIds.push(p.id);family.generation=Math.max(family.generation,p.generation+1);
    grouped.set(p.family,family);
  }
  const families = [...grouped.values()].map(f=>({...f,memberIds:f.memberIds.sort((a,b)=>a-b)}))
    .sort((a,b)=>b.count-a.count||byName(a.name,b.name));
  const producers = new Map();
  for(const b of town.buildings)if(b.complete) {
    const group = producers.get(b.type) || {count:0,batches:0};
    group.count++;group.batches+=b.production?.batches||0;producers.set(b.type,group);
  }
  const industries = Object.entries(RECIPES).flatMap(([kind,r])=>{
    const producer = producers.get(r.building);if(!producer)return [];
    return [{kind,name:industryNames[kind]||BUILDINGS[r.building].name,building:r.building,
      structures:producer.count,batches:producer.batches,
      outputs:Object.keys(r.outputs).map(k=>RESOURCE_NAMES[k]||k)}];
  }).sort((a,b)=>b.batches-a.batches||b.structures-a.structures||byName(a.kind,b.kind));
  const achieved = industries.filter(i=>i.batches>0), top = achieved[0];
  const fields = town.buildings.filter(b=>b.complete&&['farm','wheatfield','flaxfield'].includes(b.type)).length;
  const specialty = top?{label:top.name,detail:`${top.batches} recorded ${top.batches===1?'batch':'batches'} · ${top.structures} completed ${top.structures===1?'producer':'producers'}`}:
    fields?{label:'Cultivated land',detail:`${fields} completed crop ${fields===1?'field':'fields'} · no workshop batches recorded yet`}:
    {label:'A community taking shape',detail:industries.length?'Workshops are built; no completed batches recorded yet.':'Residents are establishing homes and livelihoods.'};
  const parent = state.towns.find(t=>t.id===town.parentId);
  return {emblem:settlementEmblem(state.seed,town.id),architecture:settlementArchitecture(town),
    residents:residents.length,families,industries,specialty,milestones:settlementMilestones(state,town.id),
    origin:{day:town.created,parentName:parent?.name||null,constructed:Boolean(state.scenario)}};
}
