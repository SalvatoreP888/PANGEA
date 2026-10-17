import {TRANSPORT,BUILDINGS,YEAR,RESOURCE_NAMES} from './data.mjs';
import {globalRoute,entrance} from './world.mjs';
export function ensureLink(sim,from,to,route=null) {
  const existing=sim.state.links.find(l=>(l.from===from.id&&l.to===to.id)||(l.to===from.id&&l.from===to.id));if(existing)return existing;
  route||=globalRoute(sim.state.seed,from,to);if(!route?.length)return null;
  const link={id:sim.state.nextLink++,from:from.id,to:to.id,route:route.map(p=>({lon:p.lon,lat:p.lat})),tier:0,project:null,lastDispatch:-99999,delivered:0,passengers:0,status:'Open foot trail'};
  sim.state.links.push(link);return link;
}
export function upgradeLink(sim,link) {
  if(!link||link.project||link.tier>=TRANSPORT.length-1)return false;
  const a=sim.town(link.from),b=sim.town(link.to),next=TRANSPORT[link.tier+1];
  if(!a||!b||![a,b].every(t=>sim.knowledge(t,next.tech))){link.status=`Needs ${next.tech} at both ends`;return false;}
  if(link.tier+1>=3&&![a,b].every(t=>sim.buildings(t,'station').length)){link.status='A terminus is required at both ends';return false;}
  if(!sim.spend(a,next.cost,`Materials for ${next.name} to ${b.name}`)){link.status=`Waiting for ${Object.entries(next.cost).map(([k,n])=>`${n} ${k}`).join(', ')}`;return false;}
  link.project={tier:link.tier+1,progress:0,work:next.work,paid:true};link.status=`Workers are building ${next.name.toLowerCase()}`;
  sim.event('transport',`${a.name} commissions ${next.name.toLowerCase()}`,`Materials are reserved; ${next.work} units of labour still need to be performed.`,a.id);return true;
}
export function workLink(sim,p,t,id,rate) {
  const link=sim.state.links.find(l=>l.id===id);if(!link?.project||![link.from,link.to].includes(t.id))return;
  link.project.progress+=2*rate;
  if(link.project.progress>=link.project.work){link.tier=link.project.tier;link.project=null;link.status='Service open';sim.event('transport',`${TRANSPORT[link.tier].name} opens`,`${sim.town(link.from).name} ↔ ${sim.town(link.to).name}. Real freight and passengers can now use the service.`,t.id,[p.id]);}
}
export function inboundPeople(sim,t) {
  return sim.state.trips.filter(tr=>tr.to===t.id&&tr.kind==='passenger').reduce((n,tr)=>n+tr.people.filter(id=>sim.person(id)?.alive).length,0);
}
export function dispatch(sim,link,from,cargo={},people=[]) {
  if(!link||!from||![link.from,link.to].includes(from.id))return false;
  const to=sim.town(link.from===from.id?link.to:link.from),mode=TRANSPORT[link.tier];
  const duration=Math.max(1,(link.route.length+6)/mode.speed);
  cargo={...cargo};if(people.length)cargo.food=(cargo.food||0)+Math.ceil(people.reduce((n,id)=>n+(sim.person(id)?.ageDays<12*YEAR?.48:.82),0)*duration);
  const amount=Object.values(cargo).reduce((n,v)=>n+v,0),unique=new Set(people);
  if(!to||people.length>mode.seats||unique.size!==people.length||amount>mode.cargo||amount<0||Object.entries(cargo).some(([k,n])=>!Object.hasOwn(from.res,k)||!Number.isFinite(n)||n<0))return false;
  if(people.length&&sim.capacity(to)-sim.residents(to).length-inboundPeople(sim,to)-sim.residents(to).filter(p=>p.due!==null).length<people.length)return false;
  if(people.some(id=>{const p=sim.person(id);return !p?.alive||p.tripId||p.townId!==from.id||p.due!==null;}))return false;
  if(link.tier>=3&&![from,to].every(t=>sim.buildings(t,'station').length)){link.status='Terminus unavailable';return false;}
  const fuel=mode.fuel||{},cost={...cargo};for(const[k,v]of Object.entries(fuel))cost[k]=(cost[k]||0)+v;
  // Validate passenger belongings before any stockpile or fuel mutation.
  const travelCargo={...cargo};for(const id of people){const p=sim.person(id);for(const[k,v]of Object.entries(p.carry))travelCargo[k]=(travelCargo[k]||0)+v;}
  if(Object.values(travelCargo).reduce((n,v)=>n+v,0)>mode.cargo)return false;
  if((!amount&&!people.length)||!sim.spend(from,cost,`${mode.short} departure`)){link.status=mode.fuel&&!sim.afford(from,fuel)?'Waiting for coal fuel':'Waiting for cargo';return false;}
  const trip={id:sim.state.nextTrip++,kind:people.length?'passenger':'freight',linkId:link.id,mode:link.tier,from:from.id,to:to.id,route:from.id===link.from?link.route:[...link.route].reverse(),start:sim.day,arrival:sim.day+duration,cargo:travelCargo,people:[...people],knowledge:people.length?[...from.knowledge]:[]};
  sim.state.trips.push(trip);for(const id of people){const p=sim.person(id);p.tripId=trip.id;p.houseId=null;p.task=null;p.carry={};}
  link.lastDispatch=sim.day;link.status=`${mode.short} in transit`;
  sim.event('transport',`${mode.short} departs ${from.name}`,`${amount.toFixed(0)} cargo and ${people.length} passengers bound for ${to.name}. Nothing is credited there until arrival.`,from.id,people);return trip;
}
function demand(sim,t,key) {
  if(key==='food')return sim.residents(t).length*20;
  const project=sim.project(t),needed=project&&!project.funded?(BUILDINGS[project.type].cost[key]||0):0;
  const recipes={grain:sim.residents(t).length*4,flour:sim.residents(t).length*2,bread:sim.residents(t).length*2,fish:sim.residents(t).length*2,clay:80,bricks:100,flax:60,cloth:60,wood:70,stone:70,ore:30,coal:35,iron:35,steel:100,goods:25,tools:10};
  const infrastructure=sim.state.links.filter(l=>l.from===t.id&&!l.project&&l.tier<4).reduce((n,l)=>n+(TRANSPORT[l.tier+1].cost[key]||0),0);
  return Math.max(needed,infrastructure,recipes[key]||0);
}
export function dailyNetwork(sim) {
  if(sim.day%30===0)for(const t of sim.state.towns)if(t.parentId){const parent=sim.town(t.parentId);if(parent)ensureLink(sim,parent,t);}
  for(const link of sim.state.links){
    if(sim.day%15===0&&!link.project)upgradeLink(sim,link);
    if(sim.state.trips.some(tr=>tr.linkId===link.id)||sim.day-link.lastDispatch<3)continue;
    const a=sim.town(link.from),b=sim.town(link.to);if(!a||!b)continue;
    const mode=TRANSPORT[link.tier];let sent=false;
    for(const [from,to] of [[a,b],[b,a]]){
      if(!sim.buildings(from,'market').length||!sim.residents(to).length)continue;
      const cargo={};let room=mode.cargo;
      for(const key of ['food','steel','iron','coal','ore','goods','wood','stone','tools','grain','flour','bread','fish','clay','bricks','flax','cloth']){
        const incoming=sim.state.trips.filter(tr=>tr.to===to.id).reduce((n,tr)=>n+(tr.cargo[key]||0),0);
        const missing=demand(sim,to,key)-to.res[key]-incoming;
        const floor=key==='food'?sim.residents(from).length*(sim.knowledge(from,'logistics')?10:18):demand(sim,from,key)*.65;
        const qty=Math.floor(Math.min(room,missing,from.res[key]-floor));
        if(qty>0){cargo[key]=qty;room-=qty;}
      }
      if(Object.keys(cargo).length){sent=!!dispatch(sim,link,from,cargo);if(sent)break;}
      // Relocation is household based; births remain the only natural source of people.
      if(sim.day%15===0&&sim.residents(from).length>=24&&sim.foodDays(to)>20&&sim.capacity(from)<sim.residents(from).length*1.15){
        const p=sim.adults(from).find(p=>p.sex==='F'&&p.partnerId&&p.due===null&&p.ageDays<55*YEAR);
        if(p){const family=sim.residents(from).filter(q=>q.id===p.id||q.id===p.partnerId||(q.ageDays<18*YEAR&&q.parents.includes(p.id))).map(q=>q.id);if(family.length<=mode.seats){sent=!!dispatch(sim,link,from,{},family);if(sent)break;}}
      }
    }
    if(!sent&&!link.project)link.status='Awaiting surplus or passengers';
  }
}
export function arriveTransport(sim,trip) {
  const target=sim.town(trip.to);if(!target)return;
  for(const[k,v]of Object.entries(trip.cargo))sim.transaction(target,k,v,'Intercity cargo delivered');
  for(const id of trip.people){const p=sim.person(id);if(!p?.alive)continue;p.townId=target.id;p.tripId=null;p.x=47;p.y=43;p.task=null;sim.remember(p,'belonging',`I arrived in ${target.name} by ${TRANSPORT[trip.mode].short.toLowerCase()}.`,7,6);}
  if(trip.people.some(id=>sim.person(id)?.alive))for(const id of trip.knowledge||[])if(!target.knowledge.includes(id)){target.knowledge.push(id);sim.event('knowledge',`${target.name} learns from arrivals`,`${id} was carried by people who travelled here, rather than researched again.`,target.id,trip.people);}
  sim.assignHomes(target);
  const link=sim.state.links.find(l=>l.id===trip.linkId);if(link){link.delivered+=Object.values(trip.cargo).reduce((n,v)=>n+v,0);link.passengers+=trip.people.filter(id=>sim.person(id)?.alive).length;link.status='Arrived';}
  sim.event('transport',`Service arrives at ${target.name}`,`${trip.people.length} passengers and ${Object.values(trip.cargo).reduce((n,v)=>n+v,0).toFixed(0)} cargo delivered.`,target.id,trip.people);
}
