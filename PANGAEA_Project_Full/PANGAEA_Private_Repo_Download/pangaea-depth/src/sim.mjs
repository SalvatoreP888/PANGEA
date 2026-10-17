/**
 * PANGAEA / Depth 0.2
 * Authoritative, deterministic, renderer-independent simulation.
 * Original implementations inspired by cited agent research; no LLM calls.
 * Every production job must reach a legal tile. Inventories move explicitly.
 */
import {clamp,hash,mix,geoAt,findFirstSite,generateLocal,findPath,walkable,entrance,footprint,globalRoute,GRID_W,GRID_H} from './world.mjs';
import {YEAR,STEPS_PER_DAY,MAX_POPULATION,SEASONS,COLORS,GIVEN,TOWN_NAMES,BUILDINGS,TECH,SKILLS,TRAITS,ACTION_NAMES} from './data.mjs';
export class Simulation {
  constructor(seed = 481217, options = {}) {
    if (!Number.isInteger(seed)) throw new Error('Seed must be an integer.');
    this.state = {version:2,seed:seed>>>0,rng:(seed^0x85671abc)>>>0,tick:0,nextPerson:1,nextTown:1,nextBuilding:1,nextEvent:1,nextTrip:1,
      people:[],towns:[],trips:[],events:[],history:[],ledger:[],totals:{births:0,deaths:0,buildings:0,migrations:0,deliveries:0,meals:0},
      options:{memory:true,events:true,...options}};
    const site = findFirstSite(seed), t = this.addTown(site, null, {food:120,meals:8,wood:62,stone:22,tools:0,herbs:4});
    const founders = [['Iris','F',23,'Kind'],['Rowan','M',26,'Industrious'],['Mara','F',22,'Curious'],['Tomas','M',25,'Cautious']];
    for (const [name,sex,age,trait] of founders) this.addPerson(t, {name,sex,age,trait});
    this.state.people[0].skills.foraging=6; this.state.people[1].skills.building=7;
    this.state.people[2].skills.insight=7; this.state.people[3].skills.forestry=6;
    this.event('founding','Four lives at the edge of the world','Iris, Rowan, Mara and Tomas have food, timber, stone and no permanent homes.',t.id);
    this.planTown(t); this.recordHistory();
  }
  get day() { return this.state.tick / STEPS_PER_DAY; }
  get season() { return Math.floor(this.day % YEAR / 90); }
  get year() { return Math.floor(this.day / YEAR) + 1; }
  get alive() { return this.state.people.filter(p=>p.alive); }
  random() { this.state.rng=(Math.imul(this.state.rng,1664525)+1013904223)>>>0; return this.state.rng/4294967296; }
  integer(a,b) { return a + Math.floor(this.random()*(b-a+1)); }
  person(id) { return this.state.people.find(p=>p.id===id); }
  town(id) { return this.state.towns.find(t=>t.id===id); }
  residents(t) { return this.state.people.filter(p=>p.alive&&p.townId===t.id&&!p.tripId); }
  adults(t) { return this.residents(t).filter(p=>p.ageDays>=18*YEAR); }
  buildings(t,type) { return t.buildings.filter(b=>b.complete&&b.type===type); }
  capacity(t) { return this.buildings(t,'hut').length*4; }
  foodDays(t) { return (t.res.food+t.res.meals)/Math.max(.1,this.residents(t).reduce((n,p)=>n+(p.ageDays<12*YEAR?.48:.82),0)); }
  level(t) { const n=this.residents(t).length; return n>=40?'Town':n>=16?'Village':n>=7?'Hamlet':'Camp'; }
  knowledge(t,id) { return t.knowledge.includes(id); }
  currentTech(t) { return TECH.find(k=>!t.knowledge.includes(k.id)&&k.parents.every(id=>t.knowledge.includes(id))); }
  event(type,title,detail,townId=null,people=[]) {
    const e={id:this.state.nextEvent++,day:this.day,type,title,detail,townId,people};
    this.state.events.unshift(e); if(this.state.events.length>350)this.state.events.length=350; return e;
  }
  transaction(t,kind,amount,reason) {
    if(!Number.isFinite(amount))throw new Error('Invalid resource transaction');
    if(amount<0 && t.res[kind]+amount < -1e-7) return false;
    t.res[kind]=Math.max(0,(t.res[kind]||0)+amount);
    if(Math.abs(amount)>.05){this.state.ledger.unshift({day:this.day,townId:t.id,kind,amount,reason});if(this.state.ledger.length>160)this.state.ledger.length=160;}
    return true;
  }
  afford(t,cost) { return Object.entries(cost).every(([k,n])=>t.res[k]>=n); }
  spend(t,cost,reason) { if(!this.afford(t,cost))return false; for(const[k,n]of Object.entries(cost))this.transaction(t,k,-n,reason);return true; }
  addTown(site,parentId,resources) {
    const id=this.state.nextTown++, t={id,name:TOWN_NAMES[id-1]||`Hearth ${id}`,lon:site.lon,lat:site.lat,parentId,created:this.day,
      res:{food:0,meals:0,wood:0,stone:0,tools:0,herbs:0,...resources},buildings:[],projectId:null,knowledge:[],research:0,
      weather:{kind:'Clear',until:0},policy:'Find shelter',policyReason:'Four people need permanent roofs.',reserve:18,scarcity:0,
      lastMigration:-99999,lastAid:-99999,lastElection:0,leaderId:null,stats:{foodProduced:0,foodConsumed:0,waste:0},lastPlan:-99};
    t.land=generateLocal(this.state.seed,t); this.state.towns.push(t); return t;
  }
  addPerson(t,{name,sex,age=0,trait,parents=[],family}={}) {
    const id=this.state.nextPerson++;
    const p={id,name:name||GIVEN[this.integer(4,GIVEN.length-1)],family:family||(['Vale','Reed','Ash','Stone'][((id-1)%4)]),sex:sex||(this.random()<.5?'F':'M'),
      ageDays:age*YEAR,alive:true,born:this.day,deathDay:null,townId:t.id,tripId:null,parents,generation:parents.length?1+Math.max(...parents.map(i=>this.person(i)?.generation||0)):0,
      partnerId:null,children:[],due:null,lastBirth:-99999,houseId:null,trait:trait||TRAITS[this.integer(0,TRAITS.length-1)],
      needs:{food:85,energy:88,social:75,warmth:80},health:100,mood:76,sick:0,x:47+(id%4),y:43,task:null,carry:{},
      skills:Object.fromEntries(SKILLS.map(k=>[k,2+this.random()*3])),memories:[],reflection:'A safe home comes first.',beliefs:{foodSafety:0,community:.5},
      choices:[],why:'Getting to know the coast.',color:COLORS[(id-1)%COLORS.length],lastMemory:{},workCount:0};
    this.state.people.push(p);
    this.remember(p,'belonging',age?'We arrived together at First Hearth.':'I was born into this community.',7,8,parents);
    return p;
  }
  remember(p,tag,text,importance=5,mood=0,people=[]) {
    if(!this.state.options.memory)return;
    const prior=p.lastMemory[tag], cooldown=({hunger:90,comfort:45,friendship:45,ecology:90,illness:90,home:100000})[tag]||0;
    if(prior!==undefined&&this.day-prior<cooldown)return;
    p.lastMemory[tag]=this.day;
    p.memories.unshift({id:`${p.id}:${this.state.tick}:${tag}`,day:this.day,tag,text,importance,mood,people});
    if(p.memories.length>45){p.memories.sort((a,b)=>this.memoryScore(b,'')-this.memoryScore(a,''));p.memories.length=40;p.memories.sort((a,b)=>b.day-a.day);}
  }
  memoryScore(m,context) { return m.importance*.5 + Math.exp(-(this.day-m.day)/180)*3 + (m.tag===context?4:0); }
  retrieve(p,context,n=3) { return [...p.memories].sort((a,b)=>this.memoryScore(b,context)-this.memoryScore(a,context)).slice(0,n); }
  reflect(p) {
    if(!this.state.options.memory){p.beliefs.foodSafety=0;return;}
    const fear=p.memories.filter(m=>m.tag==='hunger').reduce((a,m)=>a+m.importance/10*Math.exp(-(this.day-m.day)/720),0);
    p.beliefs.foodSafety=clamp(fear,0,2);
    const social=p.memories.filter(m=>m.tag==='friendship').length;
    p.beliefs.community=clamp(.45+social*.03,0,1);
    const strongest=this.retrieve(p,fear>.2?'hunger':'belonging',1)[0];
    p.reflection=fear>.2?'I remember going hungry. We should keep a larger food reserve.':p.partnerId?'A home is more than shelter now. My family needs a future.':social>2?'These people have helped me. I want to do my part.':p.trait==='Curious'?'Surviving is not enough. There is still so much we could learn.':'A warm home and a full pantry are worth working for.';
    p.reflectionEvidence=strongest?.id||null;
  }
  related(a,b) {
    if(a.id===b.id||a.parents.includes(b.id)||b.parents.includes(a.id))return true;
    if(a.parents.some(id=>b.parents.includes(id)))return true;
    const grandparents=p=>p.parents.flatMap(id=>this.person(id)?.parents||[]);
    return grandparents(a).includes(b.id)||grandparents(b).includes(a.id);
  }
  relationship(a,b) { return (a.relations||{})[b.id]||0; }
  bond(a,b,amount=3) {
    if(a.id===b.id)return;a.relations||={};b.relations||={};a.relations[b.id]=clamp((a.relations[b.id]||0)+amount,-100,100);b.relations[a.id]=clamp((b.relations[a.id]||0)+amount,-100,100);
  }
  assignHomes(t) {
    const houses=this.buildings(t,'hut'), residents=this.residents(t), usage={};
    for(const p of residents){if(!houses.some(h=>h.id===p.houseId))p.houseId=null;if(p.houseId)usage[p.houseId]=(usage[p.houseId]||0)+1;}
    for(const p of residents.filter(p=>!p.houseId)){
      const family=[this.person(p.partnerId),...p.parents.map(id=>this.person(id))].filter(Boolean);
      const home=houses.find(h=>family.some(f=>f.houseId===h.id)&&(usage[h.id]||0)<4)||houses.find(h=>(usage[h.id]||0)<4);
      if(home){p.houseId=home.id;usage[home.id]=(usage[home.id]||0)+1;this.remember(p,'home','For the first time, I slept under our own roof.',8,8);}
    }
  }
  homePoint(p,t) { const b=t.buildings.find(b=>b.id===p.houseId);return b?entrance(b):{x:47,y:43}; }
  project(t) { return t.buildings.find(b=>b.id===t.projectId)||null; }
  siteFor(t,type) {
    if(type==='fire')return {x:47,y:40};
    let best=null,bestScore=-Infinity;
    for(let r=6;r<37;r+=4)for(let i=0;i<20;i++){
      const angle=i/20*Math.PI*2 + hash(t.id,r,this.state.seed)*.4;
      const x=Math.round(47+Math.cos(angle)*r),y=Math.round(40+Math.sin(angle)*r*.82);
      const f=footprint({x,y,type});let legal=true;
      for(let yy=f.y0-1;yy<=f.y0+f.h;yy++)for(let xx=f.x0-1;xx<=f.x0+f.w;xx++){
        if(!walkable(t,xx,yy)||t.land.nodes.some(n=>n.x===xx&&n.y===yy&&n.amount>0)){legal=false;break;}
        if(t.buildings.some(b=>{const q=footprint(b);return xx>=q.x0-1&&xx<=q.x0+q.w&&yy>=q.y0-1&&yy<=q.y0+q.h;})){legal=false;break;}
      }
      if(!legal)continue;
      const door=entrance({x,y,type});if(!findPath(t,47,43,door.x,door.y))continue;
      const fertility=t.land.tiles[y*GRID_W+x].fertility;
      const score=-r + (type==='farm'?fertility*10+(y>40?3:0):0)+hash(x,y,t.id)*3;
      if(score>bestScore){bestScore=score;best={x,y};}
    }
    return best;
  }
  planTown(t) {
    const people=this.residents(t), pop=people.length;if(!pop)return;
    t.lastPlan=this.day;
    const safety=people.reduce((a,p)=>a+p.beliefs.foodSafety,0)/pop;
    t.reserve=18+(this.season===2?18:this.season===3?12:0)+safety*10+(this.buildings(t,'store').length?10:0);
    const food=this.foodDays(t), capacity=this.capacity(t);
    t.policy=food<8?'Secure food':capacity<pop?'Shelter everyone':food<t.reserve*.65?'Build reserves':this.buildings(t,'farm').length<Math.ceil(pop/4)?'Cultivate the land':'Learn & flourish';
    t.policyReason=food<8?`Only ${food.toFixed(1)} days of food remain.`:capacity<pop?`${pop-capacity} people are without a permanent bed.`:food<t.reserve*.65?`A ${Math.round(t.reserve)}-day reserve protects the next generation.`:'Stable households can invest in knowledge and future settlements.';
    const old=this.project(t);if(old&&!old.complete)return;
    let next=null;
    if(!this.buildings(t,'fire').length)next='fire';
    else if(capacity<pop+2)next='hut';
    else if(this.knowledge(t,'agriculture')&&this.buildings(t,'farm').length<Math.max(2,Math.ceil(pop/3)))next='farm';
    else if(this.knowledge(t,'masonry')&&!this.buildings(t,'well').length)next='well';
    else if(this.knowledge(t,'preservation')&&!this.buildings(t,'store').length)next='store';
    else if(this.knowledge(t,'craft')&&!this.buildings(t,'workshop').length)next='workshop';
    else if(this.knowledge(t,'medicine')&&!this.buildings(t,'clinic').length)next='clinic';
    else if(this.knowledge(t,'civic')&&!this.buildings(t,'hall').length)next='hall';
    if(!next){t.projectId=null;return;}
    const site=this.siteFor(t,next);if(!site){t.projectId=null;return;}
    const b={id:this.state.nextBuilding++,type:next,...site,complete:false,funded:false,progress:0,created:this.day,
      crop:{sown:false,growth:0,yield:0},condition:100};
    t.buildings.push(b);t.projectId=b.id;t.land.revision++;
    this.event('plan',`${t.name} plans ${BUILDINGS[next].name.toLowerCase()}`,t.policyReason,t.id);
  }
  chooseNode(p,t,kind) {
    const nodes=t.land.nodes.filter(n=>n.kind===kind&&n.amount>=1&&walkable(t,n.x,n.y));
    nodes.sort((a,b)=>(Math.abs(a.x-p.x)+Math.abs(a.y-p.y))-(Math.abs(b.x-p.x)+Math.abs(b.y-p.y)));
    for(const n of nodes.slice(0,16)){
      const reserved=this.residents(t).filter(q=>q.id!==p.id&&q.task?.nodeId===n.id).length;if(reserved>=2)continue;
      const path=findPath(t,p.x,p.y,n.x,n.y);if(path)return {node:n,path};
    }
    return null;
  }
  scoreActions(p,t) {
    const people=this.residents(t), adults=people.filter(q=>q.ageDays>=18*YEAR), pop=people.length;
    const jobs=k=>adults.filter(q=>q.id!==p.id&&q.task?.kind===k).length;
    const project=this.project(t), costs=project&&!project.funded?BUILDINGS[project.type].cost:{};
    const fd=this.foodDays(t), fear=p.beliefs.foodSafety, n=p.needs, choices=[];
    const add=(kind,score,reason,extra={})=>{if(Number.isFinite(score)&&score>0)choices.push({kind,score,reason,...extra});};
    if(t.res.food>=1 || t.res.meals>=1 || (p.carry.food||0)>=1)add('eat',(100-n.food)*1.25+(n.food<30?110:0),`Fullness is ${Math.round(n.food)}%.`);
    add('rest',(100-n.energy)*1.05+(n.energy<25?120:0),`Energy is ${Math.round(n.energy)}%.`);
    if(p.ageDays<18*YEAR){
      add('learn',42+p.skills.insight,'Observe the adults and gradually learn their skills.');
      add('play',38+(100-n.social)*.8,'A child needs companionship and time to play.');return choices.sort((a,b)=>b.score-a.score);
    }
    const availableFood=t.land.nodes.some(r=>r.kind==='food'&&r.amount>=1);
    if(availableFood&&fd<t.reserve*1.4&&jobs('forage')<Math.max(1,Math.ceil(pop/3)))add('forage',clamp((t.reserve-fd)/t.reserve,0,1)*105+p.skills.foraging*2+fear*12+(fd<5?45:0)-(jobs('forage')*18),`${fd.toFixed(1)} food days; ${Math.round(t.reserve)} desired${fear>.2?'; hunger memories raise urgency':''}.`);
    const woodNeed=(costs.wood||0)+35+(this.season===3?pop*5:0);
    if(t.res.wood<woodNeed&&jobs('wood')<Math.max(1,Math.ceil(pop/10)))add('wood',40+clamp((woodNeed-t.res.wood)/woodNeed,0,1)*45+p.skills.forestry*2,`${Math.floor(t.res.wood)} timber available; ${Math.ceil(woodNeed)} needed for projects and fuel.`);
    const stoneNeed=(costs.stone||0)+18;
    if(t.res.stone<stoneNeed&&jobs('stone')<Math.max(1,Math.ceil(pop/14)))add('stone',35+clamp((stoneNeed-t.res.stone)/stoneNeed,0,1)*40+p.skills.forestry,`${Math.floor(t.res.stone)} stone available; ${Math.ceil(stoneNeed)} wanted.`);
    if(project?.funded&&!project.complete&&jobs('build')<Math.max(1,Math.ceil(adults.length/6)))add('build',65+(this.capacity(t)<pop?24:0)+p.skills.building*2,`${BUILDINGS[project.type].name} has materials and needs labour.`,{buildingId:project.id});
    const farms=this.buildings(t,'farm').filter(b=>b.crop.yield>0||(!b.crop.sown&&this.season!==3));
    if(farms.length&&jobs('farm')<farms.length){
      const farm=farms.find(b=>!adults.some(q=>q.id!==p.id&&q.task?.buildingId===b.id));
      if(farm)add('farm',(farm.crop.yield>0?85:57)+p.skills.farming*2+(fd<10?24:0),farm.crop.yield>0?'Mature crops need harvesting before they spoil.':'Sow a new crop for a future harvest.',{buildingId:farm.id});
    }
    if(this.buildings(t,'fire').length&&t.res.food>=4&&t.res.meals<pop*2&&t.res.wood>=2&&!jobs('cook'))add('cook',35+p.skills.care*2+(t.res.meals<pop?12:0),'Convert raw food and fuel into comforting cooked meals.');
    if(this.currentTech(t)&&fd>5&&jobs('study')<Math.max(1,Math.ceil(adults.length/8)))add('study',28+p.skills.insight*2+(p.trait==='Curious'?16:0)+(fd>t.reserve?12:0),`Investigate ${this.currentTech(t).name.toLowerCase()}; the pantry can support some study.`);
    if(this.buildings(t,'workshop').length&&t.res.tools<Math.max(5,adults.length)&&this.afford(t,{wood:3,stone:2})&&!jobs('craft'))add('craft',45+p.skills.building,'Tools improve gathering and construction, but wear with use.');
    if(this.buildings(t,'clinic').length&&t.res.herbs<10&&!jobs('herbs'))add('herbs',35+p.skills.care,'Stock herbs for the sick.');
    const patient=people.find(q=>q.health<75||q.sick>0);
    if(patient&&this.buildings(t,'clinic').length&&t.res.herbs>=1&&!jobs('care'))add('care',65+p.skills.care*2,'A neighbour is unwell and treatment is available.',{patientId:patient.id});
    add('social',22+(100-n.social)*.90+(p.trait==='Sociable'?10:0),'Spend time with neighbours; closeness grows through contact.');
    return choices.sort((a,b)=>b.score-a.score||a.kind.localeCompare(b.kind));
  }
  decide(p,t) {
    // Carried inventory is never erased when replanning.
    if(Object.values(p.carry).some(n=>n>0)){
      if((p.carry.food||0)>=1&&p.needs.food<30){p.carry.food--;p.needs.food=clamp(p.needs.food+62,0,100);p.why='Eat one of the gathered rations before carrying the rest home.';return;}
      this.makeTask(p,t,{kind:'deliver',score:200,reason:'Resources only enter the communal stockpile when delivered.'},{x:47,y:43});return;
    }
    const choices=this.scoreActions(p,t);p.choices=choices.slice(0,5).map(x=>({...x,score:Math.round(x.score)}));
    for(const choice of choices){
      let target=this.homePoint(p,t), extra={};
      if(['forage','wood','stone','herbs'].includes(choice.kind)){
        const result=this.chooseNode(p,t,choice.kind==='forage'?'food':choice.kind);if(!result)continue;
        target=result.node;extra={nodeId:result.node.id,path:result.path};
      } else if(choice.kind==='build'||choice.kind==='farm') {const b=t.buildings.find(b=>b.id===choice.buildingId);if(!b)continue;target=entrance(b);extra.buildingId=b.id;}
      else if(['study','cook','social','play','learn'].includes(choice.kind))target={x:46+this.integer(0,4),y:43+this.integer(0,2)};
      else if(choice.kind==='craft'){target=entrance(this.buildings(t,'workshop')[0]);}
      else if(choice.kind==='care'){target=entrance(this.buildings(t,'clinic')[0]);extra.patientId=choice.patientId;}
      if(this.makeTask(p,t,choice,target,extra))return;
    }
    p.task={kind:'idle',stage:'work',work:1};p.why='No reachable task currently meets the requirements.';
  }
  makeTask(p,t,choice,target,extra={}) {
    const path=extra.path||findPath(t,p.x,p.y,target.x,target.y);if(path===null)return false;
    p.task={kind:choice.kind,stage:path.length?'walk':'work',path,index:0,tx:target.x,ty:target.y,work:0,...extra};
    p.why=choice.reason;return true;
  }
  stepPerson(p,t) {
    const child=p.ageDays<12*YEAR, n=p.needs;
    n.food=clamp(n.food-(child?6.6:10.8),0,100);n.energy=clamp(n.energy-5.6,0,100);n.social=clamp(n.social-1.4,0,100);
    const winter=this.season===3, warm=this.capacity(t)>=this.residents(t).length || !!p.houseId;
    n.warmth=clamp(n.warmth+(winter?(warm?.6:-3):2),0,100);
    if(n.food<=0){p.health-=.38;p.starveTicks=(p.starveTicks||0)+1;if(p.starveTicks>=8)this.remember(p,'hunger','There was not enough to eat. I do not want to feel that again.',9,-12);}else p.starveTicks=0;
    if(n.food>40&&!p.sick)p.health=clamp(p.health+.14,0,100);
    if(n.warmth<20)p.health-=.20;
    if(p.sick>0){p.sick--;p.health-=.16;}
    if(p.health<=0){this.die(p,'hardship');return;}
    let memoryMood=0;const felt=new Set();for(const m of p.memories){if(felt.has(m.tag))continue;felt.add(m.tag);memoryMood+=m.mood*Math.exp(-(this.day-m.day)/60)*.4;}memoryMood=clamp(memoryMood,-28,22);
    p.mood=clamp(28+n.food*.20+n.social*.17+n.warmth*.10+(p.houseId?8:0)+memoryMood-(p.sick?12:0),0,100);
    // Emergency needs preempt a job; inventory survives the interruption.
    if(p.task && p.task.kind!=='eat'&&p.task.kind!=='rest'&&p.task.kind!=='deliver'&&(n.food<13||n.energy<12))p.task=null;
    if(!p.task)this.decide(p,t);if(!p.task)return;
    const task=p.task;
    if(task.stage==='walk'){
      const distance=18+(p.trait==='Industrious'?2:0);
      for(let i=0;i<distance&&task.index<task.path.length;i++){
        const next=task.path[task.index];if(!walkable(t,next.x,next.y)){p.task=null;return;}
        p.x=next.x;p.y=next.y;task.index++;
        const tile=p.y*GRID_W+p.x;t.land.roads[tile]=Math.min(120,t.land.roads[tile]+.5);
      }
      if(task.index>=task.path.length)task.stage='work';else return;
    }
    this.work(p,t);
  }
  work(p,t) {
    const task=p.task;if(!task)return;task.work++;
    const skillName={forage:'foraging',wood:'forestry',stone:'forestry',build:'building',farm:'farming',study:'insight',cook:'care',care:'care',craft:'building',herbs:'care'}[task.kind];
    const skill=skillName?p.skills[skillName]:0;
    let rate=1+skill*.035;
    if(t.res.tools>.015&&['wood','stone','build','farm'].includes(task.kind)){rate*=1.25;t.res.tools=Math.max(0,t.res.tools-.012);}
    let done=true;
    switch(task.kind){
      case 'eat':{
        let kind=t.res.meals>=1?'meals':'food';
        if(this.transaction(t,kind,-1,'A resident ate a ration')){
          p.needs.food=clamp(p.needs.food+62,0,100);t.stats.foodConsumed++;
          if(kind==='meals'){p.mood=clamp(p.mood+4,0,100);this.remember(p,'comfort','A warm meal made a difficult day better.',3,3);}
        }break;
      }
      case 'rest':p.needs.energy=clamp(p.needs.energy+(p.houseId?80:61),0,100);if(p.houseId)p.needs.warmth=clamp(p.needs.warmth+24,0,100);break;
      case 'forage':case 'wood':case 'stone':case 'herbs':{
        const node=t.land.nodes.find(n=>n.id===task.nodeId);if(!node||node.amount<=0)break;
        const amount=Math.min(node.amount,({food:5.5,wood:5,stone:4,herbs:3}[node.kind])*rate);
        node.amount-=amount;p.carry[node.kind]=(p.carry[node.kind]||0)+amount;
        if(node.kind==='food')t.stats.foodProduced+=amount;
        t.land.revision++;
        done=task.work>=2||node.amount<1;
        if(node.amount<1&&node.kind==='food')this.remember(p,'ecology','The nearby berry patch is exhausted. We must give it time to regrow.',5,-2);
        break;
      }
      case 'deliver':{
        for(const[k,v]of Object.entries(p.carry))if(v>0)this.transaction(t,k,v,`${p.name} delivered ${k}`);
        p.carry={};this.state.totals.deliveries++;break;
      }
      case 'build':{
        const b=t.buildings.find(b=>b.id===task.buildingId);if(!b||b.complete||!b.funded)break;
        b.progress+=2.2*rate;
        done=b.progress>=BUILDINGS[b.type].work||task.work>=5;
        if(b.progress>=BUILDINGS[b.type].work){
          b.complete=true;b.progress=BUILDINGS[b.type].work;t.projectId=null;this.state.totals.buildings++;t.land.revision++;
          this.event('build',`${BUILDINGS[b.type].name} completed`,`${p.name} finished the work at ${t.name}. Materials were consumed before construction.`,t.id,[p.id]);
          this.remember(p,'achievement',`I helped build the ${BUILDINGS[b.type].name.toLowerCase()}.`,7,7);
          this.assignHomes(t);this.planTown(t);
        }break;
      }
      case 'farm':{
        const b=t.buildings.find(b=>b.id===task.buildingId);if(!b||!b.complete)break;
        if(b.crop.yield>0){const amount=Math.min(b.crop.yield,12*rate);b.crop.yield-=amount;p.carry.food=(p.carry.food||0)+amount;t.stats.foodProduced+=amount;if(b.crop.yield<.001){b.crop.sown=false;b.crop.growth=0;}done=true;}
        else if(!b.crop.sown&&this.season!==3){b.crop.sown=true;b.crop.growth=0;done=true;}
        break;
      }
      case 'cook':if(this.spend(t,{food:3,wood:.6},'Cooking inputs')){this.transaction(t,'meals',3,'Cooked meal output');this.state.totals.meals+=3;}break;
      case 'study':{
        const tech=this.currentTech(t);if(!tech)break;
        t.research+=1.0*rate*(this.buildings(t,'hall').length?1.7:1);
        if(t.research>=tech.cost){t.research-=tech.cost;t.knowledge.push(tech.id);this.event('knowledge',`${t.name} learned ${tech.name.toLowerCase()}`,tech.effect,t.id,[p.id]);this.remember(p,'knowledge',`Our work led to ${tech.name.toLowerCase()}.`,8,9);this.planTown(t);}
        done=task.work>=3;break;
      }
      case 'craft':if(this.spend(t,{wood:3,stone:2},'Toolmaking inputs'))this.transaction(t,'tools',1,'Toolmaking output');break;
      case 'care':{
        const patient=this.person(task.patientId);if(patient?.alive&&this.spend(t,{herbs:1},'Treatment')){patient.health=clamp(patient.health+7*rate,0,100);patient.sick=Math.max(0,patient.sick-12);this.bond(p,patient,4);this.remember(patient,'friendship',`${p.name} cared for me while I was unwell.`,8,8,[p.id]);}break;
      }
      case 'learn':{
        const mentor=this.adults(t).sort((a,b)=>b.skills.insight-a.skills.insight)[0];
        if(mentor){const top=SKILLS.reduce((a,b)=>mentor.skills[a]>mentor.skills[b]?a:b);p.skills[top]=Math.min(mentor.skills[top],p.skills[top]+.035);this.bond(p,mentor,.5);}p.needs.social=clamp(p.needs.social+17,0,100);break;
      }
      case 'social':case 'play':{
        const others=this.residents(t).filter(q=>q.id!==p.id&&Math.hypot(q.x-p.x,q.y-p.y)<20);
        const compatible=others.filter(q=>(q.ageDays>=18*YEAR) === (p.ageDays>=18*YEAR));
        const pool=compatible.length?compatible:others, q=pool.length?pool[this.integer(0,pool.length-1)]:null;
        p.needs.social=clamp(p.needs.social+48,0,100);
        if(q){q.needs.social=clamp(q.needs.social+18,0,100);this.bond(p,q,p.trait==='Kind'?5:3.5);if(this.relationship(p,q)>30)this.remember(p,'friendship',`Sharing time with ${q.name} makes this place feel like home.`,5,5,[q.id]);}
        break;
      }
    }
    if(skillName){p.skills[skillName]=Math.min(20,p.skills[skillName]+.013);p.workCount++;}
    if(done)p.task=null;
  }
  die(p,cause) {
    if(!p.alive)return;p.alive=false;p.deathDay=this.day;p.task=null;p.due=null;this.state.totals.deaths++;
    const t=this.town(p.townId);if(t)for(const[k,v]of Object.entries(p.carry))if(v>0)this.transaction(t,k,v,'Recovered belongings after a death');p.carry={};
    this.event('death',`${p.name} ${p.family} died`,`${Math.floor(p.ageDays/YEAR)} years old. Cause: ${cause}.`,p.townId,[p.id]);
    for(const q of this.alive)if(q.partnerId===p.id||q.parents.includes(p.id)||this.relationship(q,p)>40){
      this.remember(q,'grief',`I miss ${p.name}. Their absence changed our home.`,10,-20,[p.id]);if(q.partnerId===p.id)q.partnerId=null;
    }
  }
  demographics(t) {
    const people=this.residents(t);
    if(Math.floor(this.day)%12===0){
      const singles=people.filter(p=>p.ageDays>=18*YEAR&&!p.partnerId&&p.mood>30);
      for(const p of singles){if(p.partnerId)continue;
        const candidates=singles.filter(q=>q.id!==p.id&&!q.partnerId&&q.sex!==p.sex&&!this.related(p,q)&&Math.abs(p.ageDays-q.ageDays)<20*YEAR&&this.relationship(p,q)>=35);
        candidates.sort((a,b)=>this.relationship(p,b)-this.relationship(p,a));const q=candidates[0];
        if(q){p.partnerId=q.id;q.partnerId=p.id;this.event('family',`${p.name} and ${q.name} became partners`,'Closeness grew through repeated contact, not an automatic pairing timer.',t.id,[p.id,q.id]);this.remember(p,'belonging',`${q.name} and I chose a life together.`,10,15,[q.id]);this.remember(q,'belonging',`${p.name} and I chose a life together.`,10,15,[p.id]);}
      }
    }
    for(const p of people){
      if(p.sex!=='F')continue;
      if(p.due!==null&&this.day>=p.due){
        p.due=null;p.lastBirth=this.day;const other=p.pregnantWith;p.pregnantWith=null;
        const child=this.addPerson(t,{parents:[p.id,other].filter(Boolean),family:p.family});p.children.push(child.id);if(other&&this.person(other))this.person(other).children.push(child.id);
        child.x=p.x;child.y=p.y;this.state.totals.births++;this.assignHomes(t);
        this.event('birth',`${child.name} ${child.family} was born`,`Generation ${child.generation+1}. ${p.name}'s household has grown.`,t.id,[p.id,child.id]);
        this.remember(p,'family',`The day ${child.name} was born changed everything.`,10,18,[child.id]);
      } else if(p.due===null&&p.ageDays>=18*YEAR&&p.ageDays<43*YEAR&&p.partnerId&&this.alive.length+this.alive.filter(q=>q.due!==null).length<MAX_POPULATION){
        const partner=this.person(p.partnerId), expecting=people.filter(q=>q.due!==null).length;
        const possible=partner?.alive&&!partner.tripId&&partner.townId===t.id&&partner.ageDays>=18*YEAR&&this.day-p.lastBirth>690&&p.health>65&&p.mood>40&&this.foodDays(t)>12&&this.capacity(t)>=people.length+expecting+1;
        if(possible&&this.random()<.006){p.due=this.day+270;p.pregnantWith=partner.id;this.event('family',`${p.name} and ${partner.name} are expecting`,'Food, health and a spare place at home made a new child possible.',t.id,[p.id,partner.id]);}
      }
    }
  }
  dailyTown(t) {
    const residents=this.residents(t);if(!residents.length)return;
    const season=this.season;
    if(t.weather.until<=this.day)t.weather={kind:'Clear',until:0};
    const drought=t.weather.kind==='Drought', winter=season===3;
    const regen=[1,1.3,.65,.12][season]*(drought?.2:1);
    for(const n of t.land.nodes){
      const base=n.kind==='food'?.10:n.kind==='wood'?.009:n.kind==='herbs'?.025:0;
      if(base)n.amount=Math.min(n.max,n.amount+base*regen);
    }
    for(const b of this.buildings(t,'farm')){
      if(b.crop.yield>0){if(winter)b.crop.yield*=.994;continue;}
      if(!b.crop.sown)continue;
      const fertility=t.land.tiles[b.y*GRID_W+b.x].fertility;
      b.crop.growth+=1.8*fertility*[1,1.4,.8,0][season]*(drought?(this.buildings(t,'well').length?.65:.20):1);
      if(b.crop.growth>=80){b.crop.growth=80;b.crop.yield=135*fertility;}
    }
    const spoil=this.buildings(t,'store').length?.0006:.0025;
    for(const kind of ['food','meals']){const lost=t.res[kind]*(kind==='meals'?spoil*1.8:spoil);t.res[kind]-=lost;t.stats.waste+=lost;}
    if(winter&&this.buildings(t,'fire').length){const fuel=Math.min(t.res.wood,residents.length*.025);t.res.wood-=fuel;if(fuel>0)for(const p of residents)p.needs.warmth=clamp(p.needs.warmth+5,0,100);}
    const pr=this.project(t);if(pr&&!pr.funded&&this.spend(t,BUILDINGS[pr.type].cost,`Reserved materials for ${BUILDINGS[pr.type].name}`))pr.funded=true;
    if(Math.floor(this.day)%5===0){this.planTown(t);this.assignHomes(t);}
    if(Math.floor(this.day)%28===0){for(const p of residents)this.reflect(p);this.elect(t);}
    if(Math.floor(this.day)%90===0){
      if(this.state.options.events&&this.random()<.16)this.weatherEvent(t,this.random()<.5?'Storm':'Drought');
      this.tryMigration(t);this.tryAid(t);
    }
    for(const p of residents){
      if(p.ageDays>74*YEAR&&this.random()<.0004*(1+(p.ageDays/YEAR-74)*.18))this.die(p,'old age');
      else if(this.state.options.events&&p.ageDays>3*YEAR&&this.random()<(this.buildings(t,'well').length?.00006:.00015)){
        p.sick=48;this.remember(p,'illness','Illness has made even simple work exhausting.',6,-7);
      }
    }
    this.demographics(t);
  }
  elect(t) {
    const adults=this.adults(t);if(!adults.length)return;
    adults.sort((a,b)=>{
      const respect=p=>p.skills.insight+p.skills.care*.5+adults.reduce((s,q)=>s+this.relationship(q,p)*.01,0)+(p.trait==='Kind'?2:0);
      return respect(b)-respect(a)||a.id-b.id;
    });
    const leader=adults[0];if(t.leaderId!==leader.id){t.leaderId=leader.id;this.event('council',`${leader.name} is the community's trusted voice`,'Experience, care and social ties determine whom the settlement respects.',t.id,[leader.id]);}
  }
  weatherEvent(t,kind='Drought') {
    t.weather={kind,until:this.day+(kind==='Drought'?60:12)};
    if(kind==='Storm'){
      const loss=t.res.food*.08;this.transaction(t,'food',-loss,'Storm damaged food stores');
      for(const p of this.residents(t))if(!p.houseId)p.health=Math.max(1,p.health-8);
    }
    this.event('weather',`${kind} at ${t.name}`,kind==='Drought'?'For sixty days, wild regrowth and crop growth slow. Wells soften the impact.':'Some food was lost. People without shelter were exposed.',t.id);
    for(const p of this.residents(t))this.remember(p,'weather',`We endured a ${kind.toLowerCase()} together.`,6,-5);
  }
  tryMigration(t) {
    if(this.day<8*YEAR||this.day-t.lastMigration<3*YEAR||this.state.towns.length>=12)return;
    const residents=this.residents(t), adults=this.adults(t);
    if(residents.length<14||adults.length<6||this.foodDays(t)<23||!this.afford(t,{food:100,wood:90,stone:24}))return;
    const candidates=adults.filter(p=>p.partnerId&&p.sex==='F'&&!p.due&&p.ageDays<45*YEAR);
    candidates.sort((a,b)=>(b.trait==='Restless'?20:0)-(a.trait==='Restless'?20:0)||a.ageDays-b.ageDays);
    for(const p of candidates){
      const q=this.person(p.partnerId);if(!q?.alive||q.tripId||q.townId!==t.id)continue;
      const family=[p,q,...residents.filter(c=>c.ageDays<18*YEAR&&(c.parents.includes(p.id)||c.parents.includes(q.id)))];
      if(residents.length-family.length<8)continue;
      let site=null,route=null;
      for(let a=0;a<16;a++){
        const angle=this.random()*Math.PI*2,dist=.22+this.random()*.35;
        const s={lon:t.lon+Math.cos(angle)*dist,lat:clamp(t.lat+Math.sin(angle)*dist,-1.1,1.1)},g=geoAt(s.lon,s.lat,this.state.seed);
        if(!g.land||g.field<.08||g.field>.8||this.state.towns.some(v=>Math.hypot(v.lon-s.lon,v.lat-s.lat)<.16))continue;
        route=globalRoute(this.state.seed,t,s);if(route?.length){site=s;break;}
      }
      if(!site)continue;
      const duration=Math.min(45,14+route.length),needed=family.length*.82*duration+80;
      if(t.res.food<needed+residents.length*8)continue;
      const cargo={food:needed,meals:0,wood:90,stone:24,tools:0,herbs:2};if(!this.afford(t,cargo))continue;
      this.spend(t,cargo,'Supplies packed for a new settlement');
      const trip={id:this.state.nextTrip++,kind:'migration',from:t.id,to:null,site,route,start:this.day,arrival:this.day+duration,
        cargo,people:family.map(p=>p.id),knowledge:[...t.knowledge],research:0};
      this.state.trips.push(trip);for(const member of family){member.tripId=trip.id;member.houseId=null;member.task=null;
        for(const[k,v]of Object.entries(member.carry))cargo[k]=(cargo[k]||0)+v;member.carry={};}
      t.lastMigration=this.day;this.state.totals.migrations++;this.event('migration',`${p.name}'s household sets out`,`They packed ${Math.round(needed)} food, 90 timber and 24 stone. The land journey will take ${duration} days.`,t.id,trip.people);return;
    }
  }
  tryAid(t) {
    if(this.day-t.lastAid<180||this.foodDays(t)<35)return;
    const target=this.state.towns.find(q=>q.id!==t.id&&this.residents(q).length>0&&this.foodDays(q)<12);
    if(!target)return;const route=globalRoute(this.state.seed,t,target);if(!route)return;
    const amount=Math.min(80,t.res.food*.15);if(amount<10)return;
    this.transaction(t,'food',-amount,'Provision convoy dispatched');
    this.state.trips.push({id:this.state.nextTrip++,kind:'aid',from:t.id,to:target.id,route,start:this.day,arrival:this.day+Math.min(35,route.length+5),cargo:{food:amount},people:[]});t.lastAid=this.day;
    this.event('aid',`${t.name} sends provisions to ${target.name}`,`${Math.round(amount)} food leaves the donor's stockpile now and arrives only after travel. Transport labour is abstracted in this prototype.`,t.id);
  }
  dailyTrips() {
    for(const trip of [...this.state.trips]){
      if(trip.kind==='migration')for(const id of trip.people){const p=this.person(id);if(!p?.alive)continue;
        const ration=p.ageDays<12*YEAR?.48:.82,ate=Math.min(trip.cargo.food,ration);trip.cargo.food-=ate;
        p.needs.food=clamp(p.needs.food+(ate>=ration?8:-20),0,100);p.needs.energy=clamp(p.needs.energy+5,0,100);if(!ate)p.health-=1;
        if(p.health<=0)this.die(p,'starvation while travelling');
      }
      if(this.day<trip.arrival)continue;
      if(trip.kind==='migration'){
        const t=this.addTown(trip.site,trip.from,trip.cargo);t.knowledge=[...trip.knowledge];
        for(const id of trip.people){const p=this.person(id);if(!p?.alive)continue;p.townId=t.id;p.tripId=null;p.x=47+(p.id%3);p.y=43;p.task=null;this.remember(p,'belonging',`We founded ${t.name}. A new chapter begins.`,10,12);}
        this.planTown(t);this.event('migration',`${t.name} was founded`,'The travellers arrived with their remaining supplies and shared knowledge.',t.id,trip.people);
      } else {const target=this.town(trip.to);if(target){for(const[k,v]of Object.entries(trip.cargo))this.transaction(target,k,v,'Provision convoy arrived');this.event('aid',`Provisions arrived at ${target.name}`,'The cargo has reached its destination.',target.id);}}
      this.state.trips=this.state.trips.filter(x=>x.id!==trip.id);
    }
  }
  recordHistory() {
    const people=this.alive, food=this.state.towns.reduce((n,t)=>n+t.res.food+t.res.meals,0), homes=this.state.towns.reduce((n,t)=>n+this.capacity(t),0);
    this.state.history.push({day:this.day,pop:people.length,towns:this.state.towns.length,food,homes,mood:people.reduce((n,p)=>n+p.mood,0)/Math.max(1,people.length)});
    if(this.state.history.length>360)this.state.history.shift();
  }
  step(count=1) {
    for(let i=0;i<count;i++){
      this.state.tick++;
      for(const p of this.state.people)if(p.alive)p.ageDays+=1/STEPS_PER_DAY;
      for(const t of this.state.towns){
        const people=this.residents(t);
        // Rotate the processing order deterministically so founder #1 cannot monopolize jobs.
        const offset=people.length?this.state.tick%people.length:0;
        for(let j=0;j<people.length;j++){const p=people[(j+offset)%people.length];if(p.alive)this.stepPerson(p,t);}
      }
      if(this.state.tick%STEPS_PER_DAY===0){
        for(const t of [...this.state.towns])this.dailyTown(t);
        this.dailyTrips();if(Math.floor(this.day)%30===0)this.recordHistory();
      }
    }
  }
  advanceDays(days) { this.step(Math.floor(days*STEPS_PER_DAY)); }
  snapshot() { return JSON.parse(JSON.stringify(this.state)); }
  static fromSnapshot(data) {
    validateSave(data);const sim=Object.create(Simulation.prototype);sim.state=JSON.parse(JSON.stringify(data));return sim;
  }
  invariants() {
    const issues=[], ids=new Set();
    for(const p of this.state.people){if(ids.has(p.id))issues.push('duplicate person');ids.add(p.id);
      if(!Number.isFinite(p.ageDays)||p.ageDays<0)issues.push(`bad age ${p.id}`);
      if(p.partnerId){const q=this.person(p.partnerId);if(p.alive&&(!q?.alive||q.partnerId!==p.id))issues.push(`nonreciprocal partner ${p.id}`);}
      if(p.alive&&!p.tripId){const t=this.town(p.townId);if(!t||!walkable(t,p.x,p.y))issues.push(`unwalkable position ${p.id}`);}
      for(const [k,n]of Object.entries(p.needs))if(!Number.isFinite(n)||n<0||n>100)issues.push(`bad need ${p.id}:${k}`);
      for(const n of Object.values(p.carry))if(n<0||!Number.isFinite(n))issues.push('bad carried resource');
    }
    for(const t of this.state.towns){for(const v of Object.values(t.res))if(!Number.isFinite(v)||v<-.00001)issues.push(`bad resource ${t.id}`);
      for(const n of t.land.nodes)if(!Number.isFinite(n.amount)||n.amount<-.001||n.amount>n.max+.001)issues.push('bad natural stock');}
    return [...new Set(issues)];
  }
}
/** Reject malformed/oversized inputs before replacing a running simulation. */
export function validateSave(s) {
  const fail=()=>{throw new Error('Invalid or incompatible PANGAEA Depth save. Version 0.1 saves are not compatible.');};
  if(!s||s.version!==2||!Number.isInteger(s.seed)||!Number.isInteger(s.rng)||!Number.isInteger(s.tick)||s.tick<0||s.tick>1e9)fail();
  if(!Array.isArray(s.people)||s.people.length>3000||!Array.isArray(s.towns)||!s.towns.length||s.towns.length>20||!Array.isArray(s.trips)||s.trips.length>40)fail();
  const numeric=v=>typeof v==='number'&&Number.isFinite(v);
  const walk=(obj,depth=0)=>{if(depth>20)fail();if(typeof obj==='number'&&!Number.isFinite(obj))fail();if(typeof obj==='string'&&obj.length>4000)fail();if(Array.isArray(obj)&&obj.length>9000)fail();if(obj&&typeof obj==='object')for(const[k,v]of Object.entries(obj)){if(['__proto__','constructor','prototype'].includes(k))fail();walk(v,depth+1);}};walk(s);
  const ids=new Set();for(const p of s.people){if(!Number.isInteger(p.id)||ids.has(p.id)||typeof p.name!=='string'||p.name.length>80||!numeric(p.ageDays)||p.ageDays<0||!p.needs||!p.skills||!Array.isArray(p.memories)||!Array.isArray(p.parents)||!p.carry)fail();ids.add(p.id);
    if(p.id<1||!Number.isInteger(p.x)||!Number.isInteger(p.y)||p.x<0||p.x>=GRID_W||p.y<0||p.y>=GRID_H||!/^#[0-9a-f]{6}$/i.test(p.color)||typeof p.family!=='string'||!['F','M'].includes(p.sex)||!TRAITS.includes(p.trait)||typeof p.alive!=='boolean'||!Array.isArray(p.children)||!Array.isArray(p.choices)||!p.beliefs||!p.lastMemory||!numeric(p.health)||!numeric(p.mood))fail();
    for(const k of ['food','energy','social','warmth'])if(!numeric(p.needs[k])||p.needs[k]<0||p.needs[k]>100)fail();
    for(const k of SKILLS)if(!numeric(p.skills[k])||p.skills[k]<0)fail();
    for(const v of Object.values(p.carry))if(!numeric(v)||v<0)fail();
    if(!numeric(p.beliefs.foodSafety)||!numeric(p.beliefs.community)||p.memories.some(m=>!numeric(m.day)||!numeric(m.importance)||!numeric(m.mood)||typeof m.text!=='string'||typeof m.tag!=='string'))fail();
    if(p.task){if(!Object.hasOwn(ACTION_NAMES,p.task.kind)||!['walk','work'].includes(p.task.stage)||!numeric(p.task.work))fail();if(p.task.stage==='walk'&&(!Array.isArray(p.task.path)||!Number.isInteger(p.task.index)||p.task.index<0||p.task.index>p.task.path.length||p.task.path.some(q=>!Number.isInteger(q.x)||!Number.isInteger(q.y)||q.x<0||q.x>=GRID_W||q.y<0||q.y>=GRID_H)))fail();}
  }
  const tids=new Set();for(const t of s.towns){if(!Number.isInteger(t.id)||tids.has(t.id)||!t.land||t.land.tiles?.length!==GRID_W*GRID_H||t.land.roads?.length!==GRID_W*GRID_H||!Array.isArray(t.land.nodes)||!Array.isArray(t.buildings)||t.buildings.length>500||!Array.isArray(t.knowledge))fail();tids.add(t.id);
    for(const k of ['food','meals','wood','stone','tools','herbs'])if(!numeric(t.res?.[k])||t.res[k]<0)fail();
    if(typeof t.name!=='string'||!numeric(t.lon)||!numeric(t.lat)||Math.abs(t.lat)>Math.PI/2||!numeric(t.research)||!numeric(t.reserve)||!t.stats||!t.weather||!['Clear','Drought','Storm'].includes(t.weather.kind)||!numeric(t.weather.until)||t.knowledge.some(k=>!TECH.some(q=>q.id===k)))fail();
    if(t.land.tiles.some(q=>!q||!['grass','sand','rock','river','ford','water'].includes(q.type)||!numeric(q.fertility)||q.fertility<0||q.fertility>1||typeof q.walkable!=='boolean')||t.land.roads.some(n=>!numeric(n)||n<0))fail();
    if(t.land.nodes.some(n=>!['food','wood','stone','herbs'].includes(n.kind)||!Number.isInteger(n.x)||!Number.isInteger(n.y)||n.x<0||n.x>=GRID_W||n.y<0||n.y>=GRID_H||!numeric(n.amount)||!numeric(n.max)||n.amount<0||n.max<=0||n.amount>n.max+.001))fail();
    for(const b of t.buildings)if(!Object.hasOwn(BUILDINGS,b.type)||!Number.isInteger(b.id)||!Number.isInteger(b.x)||!Number.isInteger(b.y)||b.x<2||b.x>=GRID_W-2||b.y<2||b.y>=GRID_H-2||!b.crop||!numeric(b.progress)||!numeric(b.crop.growth)||!numeric(b.crop.yield)||typeof b.complete!=='boolean'||typeof b.funded!=='boolean')fail();
  }
  for(const p of s.people)if(!tids.has(p.townId)||p.parents.some(id=>!ids.has(id))||(p.partnerId&&!ids.has(p.partnerId)))fail();
  for(const tr of s.trips){if(!['migration','aid'].includes(tr.kind)||!tids.has(tr.from)||(!tids.has(tr.to)&&tr.to!==null)||!numeric(tr.start)||!numeric(tr.arrival)||!Array.isArray(tr.route)||!tr.route.length||!Array.isArray(tr.people)||tr.people.some(id=>!ids.has(id))||!tr.cargo||Object.values(tr.cargo).some(v=>!numeric(v)||v<0))fail();if(tr.kind==='migration'&&(!tr.site||!numeric(tr.site.lon)||!numeric(tr.site.lat)||!Array.isArray(tr.knowledge)))fail();}
  if(!Array.isArray(s.events)||!Array.isArray(s.history)||!Array.isArray(s.ledger)||!s.options||!s.totals)fail();
  for(const k of ['nextPerson','nextTown','nextBuilding','nextEvent','nextTrip'])if(!Number.isInteger(s[k])||s[k]<1)fail();
  if(typeof s.options.memory!=='boolean'||typeof s.options.events!=='boolean')fail();
  if(s.nextPerson<=Math.max(0,...ids)||s.nextTown<=Math.max(0,...tids))fail();
  return true;
}
