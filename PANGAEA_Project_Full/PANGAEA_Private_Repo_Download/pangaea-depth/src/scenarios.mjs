import {Simulation} from './sim.mjs';
import {TECH,BUILDINGS,YEAR} from './data.mjs';
import {citySite,connectStreet,housingBeds} from './city.mjs';
import {globalRoute,geoAt,entrance,walkable} from './world.mjs';
import {ensureLink,dispatch} from './transport.mjs';
/** Explicit sandbox only. Never used by a new natural world or ordinary progression. */
export function createCityLaboratory(seed=481217,population=1000) {
  if(!Number.isInteger(population)||population<4||population>2000)throw new Error('City laboratory supports 4–2000 people.');
  const sim=new Simulation(seed,{events:false});sim.state.scenario='City laboratory — constructed sandbox';
  const first=sim.state.towns[0];first.name='Hearthford';
  const towns=[first];
  for(const delta of [.3,.52]){
    let site=null,route=null;
    for(let i=0;i<36;i++){const angle=i/36*Math.PI*2,s={lon:first.lon+Math.cos(angle)*delta,lat:first.lat+Math.sin(angle)*delta};if(geoAt(s.lon,s.lat,seed).land&&(route=globalRoute(seed,first,s))?.length){site=s;break;}}
    if(site){const t=sim.addTown(site,first.id,{});t.name=towns.length===1?'Stonewater':'Willow Junction';towns.push(t);ensureLink(sim,first,t,route);}
  }
  while(sim.state.people.length<population)sim.addPerson(first,{age:18+(sim.state.people.length%38)});
  const shares=towns.length===3?[.7,.18,.12]:towns.map(()=>1/towns.length);let cursor=0;
  for(let i=0;i<towns.length;i++){
    const t=towns[i],count=i===towns.length-1?population-cursor:Math.floor(population*shares[i]);
    const people=sim.state.people.slice(cursor,cursor+count);cursor+=count;for(const p of people){p.townId=t.id;p.task=null;}
    t.knowledge=TECH.map(k=>k.id);t.research=0;
    for(const k of Object.keys(t.res))t.res[k]=100000;
    const construct=type=>{
      const site=citySite(sim,t,type);if(!site)return null;
      const b={id:sim.state.nextBuilding++,type,...site,complete:true,funded:true,progress:BUILDINGS[type].work,created:sim.day,crop:{sown:type==='farm',growth:45,yield:0},condition:100};
      if(!sim.spend(t,BUILDINGS[type].cost,'Explicit sandbox construction grant'))throw new Error('Sandbox grant exhausted');
      t.buildings.push(b);t.land.navRevision++;connectStreet(sim,t,b);return b;
    };
    // Many small buildings, compact streets, and a visible industrial edge.
    for(let h=0;h<Math.ceil(count/11);h++)construct(h%7===0?'rowhouse':'cottage');
    while(sim.capacity(t)<count+Math.ceil(count*.18)){if(!construct('tenement'))throw new Error('Sandbox housing exhausted the map');}
    for(const type of ['fishery','wheatfield','mill','bakery','claypit','kiln','flaxfield','weaver','well','store','workshop','hall','clinic','school','university','market','mine','furnace','steelworks','factory','sawmill','station'])construct(type);
    for(let f=0;f<Math.ceil(count/9);f++)construct('farm');
    sim.assignHomes(t);
    const houses=t.buildings.filter(b=>housingBeds(b));
    people.forEach((p,j)=>{const b=houses[j%houses.length],d=entrance(b);p.x=d.x;p.y=d.y;for(const [dx,dy]of [[j%3-1,0],[0,1],[0,0]])if(walkable(t,d.x+dx,d.y+dy)){p.x=d.x+dx;p.y=d.y+dy;break;}});
    t.res={fish:60,grain:150,flour:90,bread:count*2,clay:160,bricks:120,flax:80,cloth:40,food:count*(i===0?42:12),meals:count*3,wood:380,stone:480,tools:count*.8,herbs:90,ore:240,coal:400,iron:160,steel:240,goods:120};
    // Construction sites from the four-founder setup are removed only in this explicit fixture.
    t.buildings=t.buildings.filter(b=>b.complete);t.projectId=null;t.land.navRevision++;t.policy='A connected city';t.policyReason='Constructed laboratory: inspect housing, industry, freight and population at city scale.';
  }
  for(const [i,link]of sim.state.links.entries()){
    link.tier=i===0?3:1;link.status='Sandbox service open';
    dispatch(sim,link,first,{food:Math.min(TRANSPORT_CAPACITY(link.tier),180)});
  }
  const passenger=sim.residents(first).find(p=>p.id>4);if(passenger&&sim.state.links[0])dispatch(sim,sim.state.links[0],first,{},[passenger.id]);
  sim.state.totals.buildings=towns.reduce((n,t)=>n+t.buildings.filter(b=>b.complete).length,0);
  sim.state.events=[];sim.event('sandbox','City laboratory loaded',`${population} people, technologies, buildings and supplies were explicitly constructed for inspection and stress testing. This is not an organically grown world.`);
  sim.state.history=[];sim.recordHistory();return sim;
}
function TRANSPORT_CAPACITY(tier){return [20,60,140,480,900][tier];}
