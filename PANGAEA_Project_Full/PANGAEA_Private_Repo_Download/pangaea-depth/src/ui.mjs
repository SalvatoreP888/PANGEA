import {Simulation} from './sim.mjs';
import {createCityLaboratory} from './scenarios.mjs';
import {WorldRenderer} from './render.mjs';
import {YEAR,STEPS_PER_DAY,SEASONS,TECH,BUILDINGS,SKILLS,ACTION_NAMES,RESOURCE_NAMES,MAX_POPULATION,ERAS,TRANSPORT,RECIPES,SPECIES,PLANET_RANGES} from './data.mjs';
import {clamp,RAD,townClimate} from './world.mjs';
import {productionStatus} from './production.mjs';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>Math.floor(v).toLocaleString('en-US');
const initials=p=>esc(p.name.slice(0,1));
const eventIcons={founding:'✦',build:'⌂',plan:'⌁',family:'♡',birth:'✳',knowledge:'✧',council:'◈',weather:'☂',migration:'➤',death:'✝',aid:'⇄'};
let simulation=new Simulation(481217),renderer=new WorldRenderer($('world'),simulation);
let peopleQuery='',peoplePage=0;
let tab='settlement',paused=false,speed=16,accumulator=0,last=0,lastUI=0,toastTimer=0;
let frameCount=0,perfAt=0,perfDay=0,actualRate=0,autoStopped=false;
if(innerWidth<=760)document.body.classList.add('panel-hidden');
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),4000);}
function personLink(id){const p=simulation.person(id);return p?`<button class="person-link" data-person="${p.id}">${esc(p.name)}${!p.alive?' †':''}</button>`:'Unknown';}
function fmtDay(d){const day=Math.floor(d),year=Math.floor(day/YEAR)+1,season=SEASONS[Math.floor((day%YEAR)/90)];return `Year ${year} · ${season} · Day ${day%90+1}`;}
function miniBar(n,color=''){return `<div class="bar"><div style="width:${clamp(n,0,100).toFixed(1)}%;${color?`background:${color}`:''}"></div></div>`;}
function sparkline(){
  const h=simulation.state.history,values=h.length>1?h:[{pop:4},{pop:4}],max=Math.max(8,...values.map(p=>p.pop));
  const points=values.map((p,i)=>[i/(values.length-1)*280,45-p.pop/max*37]);
  const line=points.map((p,i)=>`${i?'L':'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  return `<div class="legend-label"><span>POPULATION THROUGH TIME</span><span>${num(simulation.state.totals.births)} BIRTHS · ${num(simulation.state.totals.deaths)} DEATHS</span></div><svg class="spark" viewBox="0 0 280 50" preserveAspectRatio="none" role="img" aria-label="Population history"><path class="sparkfill" d="${line} L280,50 L0,50 Z"></path><path class="sparkline" d="${line}"></path></svg>`;
}
function settlementPanel(){
  const t=renderer.town,pop=simulation.residents(t).length,project=simulation.project(t),leader=simulation.person(t.leaderId),fd=simulation.foodDays(t);
  const forests=t.land.nodes.filter(n=>n.kind==='wood'),forest=forests.reduce((a,n)=>a+n.amount/n.max,0)/Math.max(1,forests.length)*100;
  const foodNodes=t.land.nodes.filter(n=>n.kind==='food'),wild=foodNodes.reduce((a,n)=>a+n.amount/n.max,0)/Math.max(1,foodNodes.length)*100;
  const icons={food:'◇',meals:'♨',wood:'♧',stone:'◆',tools:'⚒',herbs:'✿',ore:'◈',coal:'●',iron:'▰',steel:'▱',goods:'⚙'};
  return `<div class="panel-subhead"><div class="eyebrow" style="font-size:8px;color:#8da994">${esc(simulation.level(t).toUpperCase())} · EST. YEAR ${Math.floor(t.created/YEAR)+1}</div><span class="badge">${esc(t.weather.kind)}</span></div>
    ${townPicker()}<h2>${esc(t.name)}</h2><div class="subtle">${esc(renderer.mode==='globe'?'A small light on a very large continent.':'Lives unfolding, one decision at a time.')}</div>
    <div class="big-stats"><div><strong>${pop}</strong><small>RESIDENTS</small></div><div><strong>${simulation.capacity(t)}</strong><small>BEDS</small></div><div><strong style="${fd<8?'color:#e3a780':''}">${fd>999?'999+':Math.floor(fd)}</strong><small>FOOD DAYS</small></div></div>
    ${renderer.mode==='globe'?'<button class="primary wide" id="visitBtn">Visit this settlement ↗</button>':''}
    <div class="species-mix">${Object.entries(SPECIES).map(([id,def])=>`<span style="border-color:${def.accent}55">${def.plural} ${simulation.residents(t).filter(p=>p.species===id).length}</span>`).join('')}</div><p class="microcopy">${esc(townClimate(simulation.state.seed,t,simulation.state.planet,simulation.day).biome)} · ${townClimate(simulation.state.seed,t,simulation.state.planet,simulation.day).temperature.toFixed(1)}°C · Shared homes and workplaces.</p>${sparkline()}
    <div class="section"><div class="section-title"><span>The common store</span><small>DELIVERED INVENTORY</small></div><div class="resources">${Object.entries(RESOURCE_NAMES).map(([key,title])=>`<div class="resource"><span class="resource-icon">${icons[key]||'◇'}</span><strong>${num(t.res[key])}</strong><small>${esc(title)}</small></div>`).join('')}</div></div>
    <div class="intent"><span class="eyebrow">COMMUNITY INTENT</span><strong>${esc(t.policy)}</strong><p>${esc(t.policyReason)}</p>${leader?`<p>Trusted voice: ${personLink(leader.id)}</p>`:''}</div>
    <div class="section"><div class="section-title"><span>Taking shape</span><small>${t.buildings.filter(b=>b.complete).length} COMPLETED</small></div>
    ${project?`<div class="project-row"><span>${esc(BUILDINGS[project.type].name)}</span><small>${Math.floor(project.progress/BUILDINGS[project.type].work*100)}%</small></div>${miniBar(project.progress/BUILDINGS[project.type].work*100)}<p class="microcopy">${project.funded?'Materials reserved. A builder must reach the site and complete the work.':`Waiting for ${Object.entries(BUILDINGS[project.type].cost).map(([k,n])=>`${n} ${k} (${num(t.res[k])} available)`).join(' · ')}`}</p>`:'<p class="microcopy">Current building needs are met. People can invest time in food, family and learning.</p>'}</div>
    <div class="section"><div class="section-title"><span>The land gives back</span><small>FINITE RESOURCES</small></div><div class="keyvalue"><span>Standing timber</span><strong>${Math.floor(forest)}%</strong></div>${miniBar(forest)}<div class="keyvalue"><span>Wild-food reserves</span><strong>${Math.floor(wild)}%</strong></div>${miniBar(wild)}<div class="keyvalue"><span>Active crop fields</span><strong>${simulation.buildings(t,'farm').length}</strong></div><div class="keyvalue"><span>Planned food buffer</span><strong>${Math.round(t.reserve)} days</strong></div><p class="microcopy">Harvested patches deplete. Regrowth slows in winter and drought. Crops need workers, soil and time.</p></div>
    <button class="wide" data-open-transport>Inspect transport network ↗</button>
    ${simulation.state.trips.length?`<div class="section"><div class="section-title">On the road</div>${simulation.state.trips.map(tr=>`<p class="microcopy">${tr.kind==='migration'?`${tr.people.length} travellers seeking a new home`:tr.kind==='passenger'?`${tr.people.length} passengers`:tr.kind==='freight'?`${TRANSPORT[tr.mode].short} freight`:'A provision convoy'} · ${Math.max(0,Math.ceil(tr.arrival-simulation.day))} days remaining.</p>`).join('')}</div>`:''}`;
}
function peoplePanel(){
  const all=simulation.residents(renderer.town),matches=all.filter(p=>`${p.name} ${p.family} ${p.id} ${SPECIES[p.species].name} ${p.heritage.join(' ')}`.toLowerCase().includes(peopleQuery.toLowerCase())),residents=matches.slice(peoplePage*60,peoplePage*60+60);
  return `<div class="panel-subhead"><div class="eyebrow" style="font-size:8px;color:#99af99">LIVING STORIES</div><span class="badge">${all.length} PEOPLE</span></div><h2>No two lives alike.</h2><p class="microcopy" style="margin-bottom:16px">Inspect a person to see their needs, family, skills and the actual scores behind their next decision.</p><label class="people-search">Find a resident<input id="peopleSearch" placeholder="Name, family, or ID" value="${esc(peopleQuery)}"></label><p class="microcopy">${matches.length} matches · showing ${peoplePage*60+1}–${Math.min(matches.length,peoplePage*60+60)}</p><div class="people">${residents.map(p=>`<button class="person-row" data-person="${p.id}"><span class="avatar" style="background:${p.color}">${initials(p)}</span><span class="info"><strong>${esc(p.name)} ${esc(p.family)}</strong><small>${Math.floor(p.ageDays/YEAR)} years · ${esc(SPECIES[p.species].name)} · Gen ${p.generation+1}</small></span><span class="job">${esc(ACTION_NAMES[p.task?.kind]||'Choosing work')}</span></button>`).join('')}</div><div class="menu-grid"><button data-people-page="-1" ${peoplePage===0?'disabled':''}>Previous</button><button data-people-page="1" ${(peoplePage+1)*60>=matches.length?'disabled':''}>Next</button></div>${!residents.length?'<p class="empty-state">This hearth has fallen silent. Its history remains in the chronicle.</p>':''}`;
}
function personPanel(p){
  const needs=[['food','Fullness'],['energy','Energy'],['social','Belonging'],['warmth','Warmth']];
  const sorted=[...p.memories].sort((a,b)=>b.day-a.day).slice(0,8),scoreMax=Math.max(1,...p.choices.map(c=>c.score));
  return `<button class="back-btn" id="backPeople">← All people</button><div class="profile-head"><span class="avatar" style="background:${p.color}">${initials(p)}</span><div><h2>${esc(p.name)} ${esc(p.family)}</h2><small>${Math.floor(p.ageDays/YEAR)} years · ${esc(SPECIES[p.species].name)} · Generation ${p.generation+1}${p.alive?'':' · Remembered'}</small></div></div>
    <div class="section"><div class="section-title"><span>${p.alive?'A life, right now':'Their final chapter'}</span><small>MOOD ${Math.floor(p.mood)} / 100</small></div>${needs.map(([key,name])=>`<div class="need"><div class="keyvalue"><span>${name}</span><strong>${Math.floor(p.needs[key])}%</strong></div>${miniBar(p.needs[key],p.needs[key]<25?'#d79d76':'')}</div>`).join('')}<div class="keyvalue"><span>Health${p.sick?' · Unwell':''}</span><strong>${Math.floor(p.health)}%</strong></div></div>
    <div class="section"><div class="section-title"><span>Decision inspector</span><small>UTILITY AI</small></div><div class="decision"><strong>${esc(ACTION_NAMES[p.task?.kind]||'Choosing the next task')}${p.task?.stage==='walk'?' · En route':''}</strong><p>${esc(p.why)}</p></div>${p.choices.slice(0,4).map(choice=>`<div class="choice"><span>${esc(ACTION_NAMES[choice.kind]||choice.kind)}</span><span class="mini-bar"><i style="width:${choice.score/scoreMax*100}%"></i></span><b>${choice.score}</b></div>`).join('')}<p class="microcopy">Scores come from current needs, shortages and abilities. Memories ${simulation.state.options.memory?'are enabled':'are disabled'}. This is not a generated internal monologue.</p>${Object.values(p.carry).some(n=>n>0)?`<p class="microcopy">Carrying: ${Object.entries(p.carry).filter(([k,n])=>n>0).map(([k,n])=>`${n.toFixed(1)} ${esc(k)}`).join(', ')}. Not yet in storage.</p>`:''}</div>
    <div class="section"><div class="section-title"><span>What experience changed</span><small>REFLECTION</small></div><p class="thought">“${esc(p.reflection)}”</p><div class="keyvalue"><span>Extra caution about food</span><strong>${p.beliefs.foodSafety.toFixed(2)} / 2</strong></div></div>
    <div class="section"><div class="section-title"><span>People who matter</span></div><div class="keyvalue"><span>Partner</span><strong>${p.partnerId?personLink(p.partnerId):'Not partnered'}</strong></div><div class="keyvalue"><span>Parents</span><strong>${p.parents.length?p.parents.map(personLink).join(' & '):'One of the four founders'}</strong></div><div class="keyvalue"><span>Children</span><strong>${p.children.length?p.children.map(personLink).join(', '):'None'}</strong></div>${p.due!==null?`<p class="microcopy">Expecting a child in about ${Math.ceil(p.due-simulation.day)} days.</p>`:''}<div class="keyvalue"><span>Home</span><strong>${p.houseId?`${BUILDINGS[simulation.town(p.townId)?.buildings.find(b=>b.id===p.houseId)?.type]?.name||'Home'} #${p.houseId}`:p.tripId?'Travelling':'No permanent bed'}</strong></div></div>
    <div class="section"><div class="section-title"><span>Skills earned through use</span></div>${SKILLS.map(key=>`<div class="keyvalue"><span>${key[0].toUpperCase()+key.slice(1)}</span><strong>${p.skills[key].toFixed(1)} / 20</strong></div>${miniBar(p.skills[key]*5)}`).join('')}</div>
    <div class="section"><div class="section-title"><span>Remembered moments</span><small>${p.memories.length} RETAINED</small></div>${sorted.map(m=>`<div class="memory"><small>${esc(fmtDay(m.day))} · ${esc(m.tag.toUpperCase())}</small><p>${esc(m.text)}</p></div>`).join('')||'<p class="microcopy">No memories recorded.</p>'}</div>`;
}
function buildingPanel(b){
  const t=renderer.town,occupants=simulation.residents(t).filter(p=>p.houseId===b.id),def=BUILDINGS[b.type];
  const producer=Object.values(RECIPES).some(r=>r.building===b.type);
  return `<button class="back-btn" id="backSettlement">← Settlement overview</button><span class="eyebrow" style="font-size:8px">${b.complete?'COMPLETED STRUCTURE':'CONSTRUCTION SITE'} #${b.id}</span><h2>${esc(def.name)}</h2><p>${esc(def.desc)}</p><div class="section"><div class="section-title"><span>Construction</span><small>${Math.floor(b.progress/def.work*100)}%</small></div>${miniBar(b.progress/def.work*100)}<div class="keyvalue"><span>Materials</span><strong>${b.funded?'Reserved and consumed':'Not yet available'}</strong></div>${Object.entries(def.cost).map(([k,n])=>`<div class="keyvalue"><span>${esc(k)}</span><strong>${n}</strong></div>`).join('')}<p class="microcopy">A building never appears just because time passed. Its inputs and labour must be supplied.</p></div>
    ${['farm','wheatfield','flaxfield'].includes(b.type)?`<div class="section"><div class="section-title">Crop lifecycle</div><div class="keyvalue"><span>Status</span><strong>${b.crop.yield>0?'Ready for harvest':b.crop.sown?'Growing':'Needs sowing'}</strong></div>${miniBar(b.crop.growth/80*100)}<div class="keyvalue"><span>Standing harvest</span><strong>${Math.floor(b.crop.yield)} food</strong></div><p class="microcopy">Standing crops are not yet usable food. Someone must harvest and deliver them.</p></div>`:''}
    ${producer?`<div class="section"><div class="section-title">Workshop inventory</div><p class="microcopy">${b.production?.batches||0} batches completed. Inputs arrive with residents; outputs wait for collection.</p>${['inputs','outputs'].map(field=>`<p class="microcopy">${field==='inputs'?'Delivered inputs':'Uncollected outputs'}: ${Object.entries(b.production?.[field]||{}).filter(([k,v])=>v>0).map(([k,v])=>`${v.toFixed(1)} ${RESOURCE_NAMES[k]}`).join(', ')||'empty'}</p>`).join('')}</div>`:''}
    ${occupants.length?`<div class="section"><div class="section-title">This is home to</div>${occupants.map(p=>`<div class="keyvalue">${personLink(p.id)}<span>${Math.floor(p.ageDays/YEAR)} years</span></div>`).join('')}</div>`:''}`;
}
function townPicker(){return simulation.state.towns.length>1?`<label class="town-picker">Settlement<select data-town-picker>${simulation.state.towns.map(t=>`<option value="${t.id}" ${t.id===renderer.townId?'selected':''}>${esc(t.name)} · ${simulation.residents(t).length}</option>`).join('')}</select></label>`:'';}
function techCard(k,t,current,atlas=false){
  const known=simulation.knowledge(t,k.id),ready=k.parents.every(id=>simulation.knowledge(t,id))&&simulation.residents(t).length>=k.minPopulation,active=current?.id===k.id;
  return `<article class="tech ${known?'unlocked':ready?'available':'locked'}" data-tech-node="${k.id}"><div class="tech-head"><h3>${esc(k.name)}</h3><span class="tech-icon">${known?'✓':active?'◈':ready?'○':'◇'}</span></div><small>${esc(k.branch)} · ${k.cost} insight</small><p>${esc(k.effect)}</p>${active?`${miniBar(t.research/k.cost*100)}<small>${num(t.research)} / ${k.cost} insight · researching</small>`:`<small>${known?'Shared knowledge':`Requires: ${k.parents.map(id=>TECH.find(q=>q.id===id).name).join(' + ')||'observation'}${k.minPopulation?` · ${k.minPopulation} residents`:''}`}</small>`}<p class="tech-parents">${k.parents.map(id=>`<button data-tech-jump="${id}">← ${esc(TECH.find(q=>q.id===id).name)}</button>`).join('')}</p>${!known&&ready&&!active?`<button class="research-btn" data-research="${k.id}">Prioritize research</button>`:''}</article>`;
}
function knowledgePanel(){
  const t=renderer.town,current=simulation.currentTech(t);
  return `<span class="eyebrow">FIVE ERAS · FIVE BRANCHES</span><h2>From hearth to railway.</h2><p class="microcopy">${t.knowledge.length} of ${TECH.length} discoveries. People must study; population and prerequisite discoveries support later eras. You can prioritize any available topic without losing earlier progress.</p><button class="primary wide" data-open-tech>Open technology atlas ↗</button>${ERAS.map((era,i)=>`<section class="tech-era"><h3 class="era-title">0${i+1} / ${esc(era)}</h3>${TECH.filter(k=>k.era===i).map(k=>techCard(k,t,current)).join('')}</section>`).join('')}`;
}
function openTechAtlas(){
  const t=renderer.town,current=simulation.currentTech(t);$('techAtlasTitle').textContent=`${t.name} · Technology atlas`;
  const branches=['Food','Cities','Industry','Transport','Knowledge'];
  $('techAtlasContent').innerHTML='<svg class="tech-connections" aria-hidden="true"></svg>'+ERAS.map((era,i)=>`<section class="atlas-era"><h3>0${i+1} / ${esc(era)}</h3><div class="atlas-nodes">${branches.map(branch=>`<div class="atlas-lane"><div class="lane-title">${branch}</div>${TECH.filter(k=>k.era===i&&k.branch===branch).map(k=>techCard(k,t,current,true)).join('')}</div>`).join('')}</div></section>`).join('');
  if(!$('techDialog').open)$('techDialog').showModal();requestAnimationFrame(drawTechConnections);
}
function drawTechConnections(){
  if(!$('techDialog').open)return;const root=$('techAtlasContent'),svg=root.querySelector('svg'),origin=root.getBoundingClientRect();svg.setAttribute('width',root.clientWidth);svg.setAttribute('height',root.scrollHeight);
  let paths='';for(const k of TECH){const child=root.querySelector(`[data-tech-node="${k.id}"]`)?.getBoundingClientRect();if(!child)continue;for(const id of k.parents){const parent=root.querySelector(`[data-tech-node="${id}"]`)?.getBoundingClientRect();if(!parent)continue;const x1=parent.x+parent.width/2-origin.x,y1=parent.bottom-origin.y,x2=child.x+child.width/2-origin.x,y2=child.y-origin.y;paths+=`<path d="M${x1},${y1} C${x1},${y1+24} ${x2},${y2-24} ${x2},${y2}"/>`;}}
  svg.innerHTML=paths;
}
function transportPanel(){
  const links=simulation.state.links||[],t=renderer.town;
  return `<span class="eyebrow">A CONNECTED CIVILIZATION</span><h2>Roads become railways.</h2>${townPicker()}<p class="microcopy">Trails → graded dirt → paved highways → steam rail → electric rail. Every upgrade consumes materials and requires workers. Rail needs stations at both ends; steam services burn coal.</p><div class="transport-summary"><strong>${links.length}</strong><span>INTERCITY LINKS</span><strong>${simulation.state.trips.filter(tr=>tr.linkId).length}</strong><span>SERVICES IN TRANSIT</span></div>${!links.length?'<p class="empty-state">The first trail opens when a family founds a second settlement. Grow this village, or open the clearly labelled City laboratory from the world menu to inspect a developed network.</p>':''}${links.map(l=>{
    const mode=TRANSPORT[l.tier],next=TRANSPORT[l.tier+1],trips=simulation.state.trips.filter(tr=>tr.linkId===l.id);
    return `<article class="route-card"><div class="route-tier">${esc(mode.name)}</div><h3>${esc(simulation.town(l.from)?.name)} <span>↔</span> ${esc(simulation.town(l.to)?.name)}</h3><p>${mode.cargo} cargo · ${mode.seats} seats · ${Math.max(1,Math.ceil((l.route.length+6)/mode.speed))} days</p><div class="keyvalue"><span>Delivered</span><strong>${num(l.delivered)} cargo · ${l.passengers} people</strong></div><p class="microcopy">${esc(l.status)}</p>${l.project?`${miniBar(l.project.progress/l.project.work*100)}<p class="microcopy">Building ${esc(TRANSPORT[l.project.tier].name)} · ${Math.floor(l.project.progress)}/${l.project.work} labour</p>`:next?`<p class="microcopy">Next: ${esc(next.name)} · ${Object.entries(next.cost).map(([k,v])=>`${v} ${k}`).join(' + ')}</p><button class="wide" data-upgrade-route="${l.id}">Commission upgrade</button>`:'<span class="badge">ELECTRIC NETWORK</span>'}${trips.map(tr=>`<div class="transit-row">${tr.people.length?`${tr.people.length} passengers`:'Freight'} · ${Object.entries(tr.cargo).map(([k,v])=>`${num(v)} ${esc(k)}`).join(', ')||'no cargo'}<br><small>${Math.max(0,Math.ceil(tr.arrival-simulation.day))} days until arrival</small>${miniBar((simulation.day-tr.start)/(tr.arrival-tr.start)*100)}</div>`).join('')}<div class="menu-grid"><button data-visit-town="${l.from}">Visit origin</button><button data-visit-town="${l.to}">Visit destination</button></div></article>`;
  }).join('')}<p class="settings-note">Convoy staffing is abstracted. Infrastructure construction uses real builder work. Passengers are existing individuals, never decorative population. Inbound passengers reserve beds.</p>`;
}
function supplyPanel(){
  const t=renderer.town,people=simulation.residents(t);
  const chains=[['River fisheries','Fish → prepared meals'],['Bakeries','Wheat field → grain → mill → flour → bakery → bread'],['Building materials','Clay seam → clay yard → kiln → bricks → dense housing'],['Textiles','Flax field → fibre → weaving shed → cloth → winter clothing & machinery'],['Heavy industry','Ore + coal → foundry → iron → steelworks → rail & apartments']];
  return `<span class="eyebrow">A WORKING ECONOMY</span><h2>From field to city.</h2>${townPicker()}<p class="microcopy">Storage → input delivery → workshop → output collection → storage. Residents carry every workshop shipment. Finished goods cannot feed people or build cities until delivered.</p>${chains.map(([title,chain])=>`<div class="supply-chain"><strong>${title}</strong><p>${chain}</p></div>`).join('')}<div class="section"><div class="section-title">River stocks</div>${miniBar(t.land.fishStock/t.land.fishCapacity*100)}<p class="microcopy">${num(t.land.fishStock)} / ${num(t.land.fishCapacity)} fish in local habitat · ${simulation.buildings(t,'fishery').length} fisheries · ${people.filter(p=>p.task?.kind==='fish').length} fishing. Weather and managed fisheries affect recovery.</p></div>${Object.entries(RECIPES).map(([job,r])=>{
    const {status,inputs,outputs,batches,haulers}=productionStatus(simulation,t,job);
    return `<article class="production-card" data-production="${job}"><h3>${BUILDINGS[r.building].name}</h3><p>${Object.entries(r.inputs).map(([k,v])=>`${v} ${RESOURCE_NAMES[k]}`).join(' + ')} → ${Object.entries(r.outputs).map(([k,v])=>`${v} ${RESOURCE_NAMES[k]}`).join(' + ')}</p><span class="badge">${esc(status)}</span>${Object.entries(r.inputs).map(([k,v])=>`<div class="keyvalue"><span>${RESOURCE_NAMES[k]}</span><strong>${num(t.res[k])} stored · ${(inputs[k]||0).toFixed(1)} at workshop</strong></div>`).join('')}${Object.keys(r.outputs).map(k=>`<div class="keyvalue"><span>${RESOURCE_NAMES[k]} to collect</span><strong>${(outputs[k]||0).toFixed(1)}</strong></div>`).join('')}<p class="microcopy">${batches} batches completed · ${haulers} carrying or collecting · output buffer: 4 batches per workshop</p></article>`;
  }).join('')}`;
}
function readPlanetControls(){return Object.fromEntries(Object.keys(PLANET_RANGES).map(key=>[key,Number(document.querySelector(`[data-planet="${key}"]`).value)]));}
function syncPlanetControls(){for(const [key,value]of Object.entries(simulation.state.planet)){const input=document.querySelector(`[data-planet="${key}"]`);input.value=value;input.nextElementSibling.value=value;}}
function chroniclePanel(){
  const events=simulation.state.events.slice(0,90);
  return `<span class="eyebrow" style="font-size:8px;color:#9bb18e">THE WORLD REMEMBERS</span><h2>A history of small things.</h2><p class="microcopy" style="margin-bottom:25px">Each entry records an actual state change. No language model invents outcomes.</p>${events.map(e=>`<article class="chronicle-item"><div class="event-marker">${eventIcons[e.type]||'·'}</div><div><strong>${esc(e.title)}</strong><p>${esc(e.detail)}</p><small>${esc(fmtDay(e.day))}${e.townId?' · '+esc(simulation.town(e.townId)?.name||''):''}</small>${e.people?.length?`<div style="margin-top:7px">${e.people.slice(0,4).map(personLink).join(' ')}</div>`:''}</div></article>`).join('')}`;
}
function updateUI(){
  const t=renderer.town,residents=simulation.residents(t),season=simulation.season;
  $('globalPeople').textContent=num(simulation.alive.length);$('globalTowns').textContent=simulation.state.towns.length;
  $('date').textContent=`Year ${simulation.year} · ${SEASONS[season]}`;
  $('day').textContent=`Day ${Math.floor(simulation.day%90)+1} · ${['Dawn','Midday','Evening','Night'][simulation.state.tick%4]}`;
  $('seasonIcon').textContent=['✺','☀','❧','❄'][season];
  $('runtimeLabel').textContent=simulation.alive.length===0?'○ DORMANT':paused?'Ⅱ PAUSED':'● LIVE';
  $('pauseBtn').textContent=paused?'▶':'Ⅱ';$('pauseBtn').setAttribute('aria-label',paused?'Resume simulation':'Pause simulation');
  $('sceneLabel').classList.toggle('town-label',renderer.mode==='town');
  if(renderer.mode==='globe'){
    $('sceneEyebrow').textContent=simulation.state.scenario?'SANDBOX · CONSTRUCTED CITY LAB':simulation.state.towns.length>1?'A CIVILIZATION TAKES ROOT':'THE FIRST CHAPTER';
    $('sceneTitle').innerHTML=simulation.state.scenario?'A connected<br>city laboratory.':simulation.state.towns.length>1?'A world woven<br>from small lives.':simulation.alive.length>4?'One hearth.<br>Growing roots.':'Four lives.<br>A world ahead.';
    $('sceneDescription').textContent=`${simulation.alive.length} people · ${simulation.state.towns.length} ${simulation.state.towns.length===1?'settlement':'settlements'} · Generation ${Math.max(0,...simulation.alive.map(p=>p.generation))+1}`;
  }else{
    $('sceneEyebrow').textContent=`${simulation.state.scenario?'SANDBOX · ':''}${simulation.level(t).toUpperCase()} · ${t.weather.kind.toUpperCase()}`;$('sceneTitle').textContent=t.name;
    $('sceneDescription').textContent=`${residents.length} lives · ${t.buildings.filter(b=>b.complete).length} structures · ${Math.floor(simulation.foodDays(t))} food days`;
  }
  $('worldCoordinates').textContent=`${Math.abs(t.lat/RAD).toFixed(1)}° ${t.lat>=0?'N':'S'} · ${Math.abs(t.lon/RAD).toFixed(1)}° ${t.lon>=0?'E':'W'}`;
  $('mapHelp').textContent=renderer.mode==='globe'?'DRAG TO ROTATE · CLICK A HEARTH TO VISIT':'DRAG TO PAN · SCROLL TO ZOOM · CLICK TO INSPECT';
  if($('panel').contains(document.activeElement)&&document.activeElement.matches('input,select'))return;
  const scroll=$('panel').scrollTop;
  if(renderer.selected?.kind==='person'){const p=simulation.person(renderer.selected.id);$('panel').innerHTML=p?personPanel(p):peoplePanel();}
  else if(renderer.selected?.kind==='building'){const b=t.buildings.find(b=>b.id===renderer.selected.id);$('panel').innerHTML=b?buildingPanel(b):settlementPanel();}
  else $('panel').innerHTML=tab==='people'?peoplePanel():tab==='knowledge'?knowledgePanel():tab==='chronicle'?chroniclePanel():tab==='transport'?transportPanel():tab==='supply'?supplyPanel():settlementPanel();
  $('panel').scrollTop=scroll;
  document.querySelectorAll('[data-tab]').forEach(b=>{const selected=b.dataset.tab===tab;b.classList.toggle('active',selected);b.setAttribute('aria-selected',String(selected));});
}
function setView(view){renderer.transitionTo(view);renderer.selected=null;document.querySelectorAll('[data-view]').forEach(b=>{const selected=b.dataset.view===view;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});renderer.dirty=true;updateUI();}
function setTab(next){tab=next;renderer.selected=null;$('panel').scrollTop=0;updateUI();}
function selectPerson(id){const p=simulation.person(id);if(!p)return;renderer.selected={kind:'person',id};renderer.townId=p.townId;tab='people';showPanel(true);$('panel').scrollTop=0;updateUI();}
function showPanel(show){document.body.classList.toggle('panel-hidden',!show);$('inspectToggle').setAttribute('aria-expanded',String(show));requestAnimationFrame(()=>renderer.resize());}
function loadState(state){const next=Simulation.fromSnapshot(state);simulation=next;renderer.reset(next);accumulator=0;paused=true;autoStopped=false;last=0;perfAt=0;perfDay=simulation.day;updateUI();}
function saveLocal(){try{localStorage.setItem('pangaea-depth-v03',JSON.stringify(simulation.snapshot()));toast('World saved in this browser.');$('menuStatus').textContent='Saved successfully.';}catch(e){toast('Browser storage is full or unavailable. Export the world instead.');}}
function downloadWorld(){const blob=new Blob([JSON.stringify(simulation.snapshot())],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`pangaea-depth-year-${simulation.year}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);toast('Portable world exported.');}
function modalOpen(){return document.querySelector('dialog[open]')!==null;}
$('menuBtn').addEventListener('click',()=>{$('menuStatus').textContent='';syncPlanetControls();$('menuDialog').showModal();});
$('helpBtn').addEventListener('click',()=>$('helpDialog').showModal());
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));
$('pauseBtn').addEventListener('click',()=>{paused=!paused;updateUI();});
function setSpeed(value){
  if(![1,16,64,256,'max'].includes(value))throw new Error('Unknown simulation speed');
  speed=value;accumulator=0;paused=false;
  document.querySelectorAll('[data-speed]').forEach(b=>{const selected=b.dataset.speed===String(value);b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));});updateUI();
}
document.querySelectorAll('[data-speed]').forEach(b=>b.addEventListener('click',()=>setSpeed(b.dataset.speed==='max'?'max':Number(b.dataset.speed))));
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
$('focusBtn').addEventListener('click',()=>{renderer.focus();});
$('labelBtn').addEventListener('click',()=>{renderer.labels=!renderer.labels;$('labelBtn').setAttribute('aria-pressed',String(renderer.labels));});
$('layerBtn').addEventListener('click',()=>{const layers=['natural','fertility','resources','activity'];renderer.layer=layers[(layers.indexOf(renderer.layer)+1)%layers.length];$('layerKey').textContent=renderer.layer.toUpperCase()+' VIEW';if(renderer.mode==='globe')setView('town');toast(renderer.layer==='natural'?'Natural terrain':renderer.layer==='fertility'?'Soil fertility: greener ground is more productive.':renderer.layer==='resources'?'Resource nodes: food, wood, stone and herbs.':'Foot traffic heatmap. Constructed roads remain separate.');});
$('inspectToggle').addEventListener('click',()=>showPanel(document.body.classList.contains('panel-hidden')));
$('panel').addEventListener('click',e=>{const p=e.target.closest('[data-person]');if(p){selectPerson(Number(p.dataset.person));return;}if(e.target.id==='backPeople')setTab('people');if(e.target.id==='backSettlement')setTab('settlement');if(e.target.id==='visitBtn'){setView('town');renderer.focus();}});
function handleResearch(e){const jump=e.target.closest('[data-tech-jump]');if(jump){const node=(jump.closest('#techAtlasContent')||$('panel')).querySelector(`[data-tech-node="${jump.dataset.techJump}"]`);node?.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});return;}const button=e.target.closest('[data-research]');if(!button)return;const changed=simulation.selectResearch(renderer.town,button.dataset.research);if(changed){updateUI();if($('techDialog').open)openTechAtlas();toast('Research priority updated. Existing progress is retained.');}}
$('techAtlasContent').addEventListener('click',handleResearch);
$('panel').addEventListener('click',e=>{
  handleResearch(e);
  if(e.target.closest('[data-open-tech]'))openTechAtlas();
  if(e.target.closest('[data-open-transport]'))setTab('transport');
  const route=e.target.closest('[data-upgrade-route]');if(route){const success=simulation.upgradeRoute(Number(route.dataset.upgradeRoute));toast(success?'Materials paid. Builders can begin the upgrade.':simulation.state.links.find(l=>l.id===Number(route.dataset.upgradeRoute))?.status||'Cannot upgrade');updateUI();}
  const visit=e.target.closest('[data-visit-town]');if(visit){renderer.townId=Number(visit.dataset.visitTown);setView('town');renderer.focus();setTab('settlement');}
  const paginate=e.target.closest('[data-people-page]');if(paginate){peoplePage=Math.max(0,peoplePage+Number(paginate.dataset.peoplePage));updateUI();$('panel').scrollTop=0;}
});
$('panel').addEventListener('change',e=>{if(e.target.matches('[data-town-picker]')){renderer.townId=Number(e.target.value);renderer.selected=null;renderer.focus();e.target.blur();updateUI();}});
$('panel').addEventListener('input',e=>{if(e.target.id==='peopleSearch'){peopleQuery=e.target.value;peoplePage=0;const caret=e.target.selectionStart;e.target.blur();updateUI();const input=$('peopleSearch');input.focus();input.setSelectionRange(caret,caret);}});
$('cityLabBtn').addEventListener('click',()=>{loadState(createCityLaboratory(Number($('seedInput').value)||481217).snapshot());setView('town');renderer.focus();setTab('transport');$('menuDialog').close();toast('City laboratory: a constructed 1,000-person sandbox, paused.');});
$('saveBtn').addEventListener('click',saveLocal);$('exportBtn').addEventListener('click',downloadWorld);
$('loadBtn').addEventListener('click',()=>{try{const raw=(localStorage.getItem('pangaea-depth-v03')||localStorage.getItem('pangaea-depth-v02'));if(!raw){toast('No Depth save exists in this browser yet.');return;}loadState(JSON.parse(raw));$('menuDialog').close();toast('Saved world restored, paused.');}catch(e){toast('Could not load: '+e.message);}});
$('importBtn').addEventListener('click',()=>$('importInput').click());
$('importInput').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>25*1024*1024)throw new Error('World file exceeds 25 MB.');loadState(JSON.parse(await file.text()));$('menuDialog').close();toast('World imported, paused.');}catch(error){toast(error.message);$('menuStatus').textContent=error.message;}e.target.value='';});
$('newBtn').addEventListener('click',()=>{const seed=Number($('seedInput').value);if(!Number.isInteger(seed)||seed<1||seed>2147483647){$('menuStatus').textContent='Use an integer seed from 1 to 2147483647.';return;}simulation=new Simulation(seed,{planet:readPlanetControls()});renderer.reset(simulation);accumulator=0;paused=false;autoStopped=false;setView('globe');$('menuDialog').close();toast('Four founders. A new beginning.');perfAt=0;perfDay=0;});
document.querySelectorAll('[data-planet]').forEach(input=>input.addEventListener('input',()=>input.nextElementSibling.value=input.value));
$('applyClimateBtn').addEventListener('click',()=>{simulation.configurePlanet(readPlanetControls());renderer.terrainCache.clear();renderer.nodeSprites?.clear();renderer.makeTexture();updateUI();toast('Planet climate applied. Existing cities and people are preserved.');});
$('droughtBtn').addEventListener('click',()=>{simulation.weatherEvent(renderer.town,'Drought');$('menuDialog').close();updateUI();toast('A sixty-day drought has begun.');});
$('stormBtn').addEventListener('click',()=>{simulation.weatherEvent(renderer.town,'Storm');$('menuDialog').close();updateUI();toast('A storm has reached the settlement.');});
let pointer=null;const canvas=$('world');
canvas.addEventListener('pointerdown',e=>{if(e.button!==0||renderer.transition)return;canvas.setPointerCapture(e.pointerId);pointer={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};});
canvas.addEventListener('pointermove',e=>{if(!pointer)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;if(Math.hypot(e.clientX-pointer.startX,e.clientY-pointer.startY)>5)pointer.moved=true;if(pointer.moved)renderer.pan(dx,dy);pointer.x=e.clientX;pointer.y=e.clientY;});
canvas.addEventListener('pointerup',e=>{if(!pointer)return;const moved=pointer.moved;pointer=null;if(moved)return;const rect=canvas.getBoundingClientRect(),hit=renderer.hit(e.clientX-rect.left,e.clientY-rect.top);if(!hit)return;if(hit.kind==='town'){renderer.townId=hit.id;setView('town');renderer.focus();setTab('settlement');}else if(hit.kind==='person')selectPerson(hit.id);else{renderer.selected={kind:'building',id:hit.id};tab='settlement';showPanel(true);$('panel').scrollTop=0;updateUI();}});
canvas.addEventListener('pointercancel',()=>{pointer=null;});
canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect();if(renderer.mode==='globe'&&e.deltaY<0&&renderer.orbit.zoom>=1.35){setView('town');renderer.focus();}else if(renderer.mode==='town'&&e.deltaY>0&&renderer.camera.zoom<=.22){setView('globe');renderer.focus();}else renderer.zoom(e.deltaY,e.clientX-r.left,e.clientY-r.top);},{passive:false});
window.addEventListener('resize',()=>{renderer.resize();drawTechConnections();});
document.addEventListener('keydown',e=>{if(e.target.matches('input,select,textarea')||modalOpen())return;if(e.code==='Space'){e.preventDefault();paused=!paused;updateUI();}else if(e.key.toLowerCase()==='g')setView('globe');else if(e.key.toLowerCase()==='c')setView('town');else if(e.key.toLowerCase()==='f')renderer.focus();else if(e.key.toLowerCase()==='i')showPanel(document.body.classList.contains('panel-hidden'));else if(e.key==='Escape'){renderer.selected=null;updateUI();}});
document.addEventListener('visibilitychange',()=>{last=0;accumulator=0;});
function frame(now){
  const dt=last?Math.min(.1,(now-last)/1000):0;last=now;
  if(!paused&&!modalOpen()&&!document.hidden){
    const begin=performance.now();
    if(speed==='max'){
      // No simulated-days or tick-count ceiling. Yield on elapsed CPU time for input/rendering.
      while(performance.now()-begin<40)simulation.step();
      accumulator=0;
    }else{
      accumulator=Math.min(accumulator+dt*speed*STEPS_PER_DAY,2000);let steps=0;
      while(accumulator>=1&&steps<280&&performance.now()-begin<10){simulation.step();accumulator--;steps++;}
    }
  }
  if(!simulation.alive.length&&!autoStopped){paused=true;autoStopped=true;toast('The last hearth has fallen silent. Its story remains.');}
  renderer.draw(now/1000);
  if(now-lastUI>500){updateUI();lastUI=now;}
  frameCount++;
  if(!perfAt){perfAt=now;perfDay=simulation.day;}
  if(now-perfAt>1500){actualRate=(simulation.day-perfDay)/((now-perfAt)/1000);$('performance').textContent=`${speed==='max'?'MAX · ':''}${Math.round(actualRate)} days/s`;perfDay=simulation.day;perfAt=now;frameCount=0;}
  requestAnimationFrame(frame);
}
// Local development hooks for reproducible headless tests and save validation.
window.PANGAEA={get simulation(){return simulation;},get renderer(){return renderer;},get paused(){return paused;},pause(){paused=true;updateUI();},resume(){paused=false;updateUI();},advance(days){paused=true;simulation.advanceDays(days);updateUI();renderer.draw(performance.now()/1000);return simulation.snapshot();},snapshot:()=>simulation.snapshot(),load:loadState,setView,selectPerson,setTab,setSpeed,cityLaboratory(population=1000){loadState(createCityLaboratory(481217,population).snapshot());setView('town');renderer.focus();return simulation.snapshot();},
  inspect:()=>({version:'0.5-realms',seed:simulation.state.seed,day:simulation.day,population:simulation.alive.length,towns:simulation.state.towns.length,issues:simulation.invariants(),actualDaysPerSecond:actualRate,requestedSpeed:speed})};
updateUI();renderer.draw(0);$('loading').remove();requestAnimationFrame(frame);
