import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createWorldServer} from '../../server/app.mjs';
import {openWorldStore} from '../../server/store.mjs';
import {Simulation} from '../../src/pangea/simulation/sim.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const jsonHash=value=>sha(JSON.stringify(value));
const rowFor=(snapshot,token)=>({id:randomBytes(16).toString('hex'),token_hash:sha(token),snapshot,revision:1,paused:1,speed:16,wallclock:1000000,pending:0,saved_at:1000000});
const temporary=t=>{const folder=mkdtempSync(join(tmpdir(),'pangea-serialization-')),resource={dbPath:join(folder,'worlds.sqlite'),close:[]};t.after(async()=>{for(const close of resource.close.reverse())await close();rmSync(folder,{recursive:true,force:true});});return resource;};
async function server(resource){
  const app=createWorldServer({dbPath:resource.dbPath,tickIntervalMs:100000,now:()=>1000000});
  const {port}=await app.start({port:0});resource.close.push(()=>app.stop());return {app,url:`http://127.0.0.1:${port}`};
}
async function request(url,path,{token,body}={}){
  const response=await fetch(url+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const text=await response.text();return {status:response.status,text,data:JSON.parse(text)};
}

test('Committed HTTP snapshots keep canonical JSON and escape arbitrary world text across reads and controls',async t=>{
  const {url}=await server(temporary(t)),sim=new Simulation(481217,{events:false});
  sim.town(1).name='Harbor "$&" \\ \n 🐟';sim.state.people[0].family='$` $\' family';
  sim.state.people[0].reflection='Text </script> with $& and a lone surrogate \ud800';
  const expected=Simulation.fromSnapshot(sim.snapshot()).snapshot(),canonical=JSON.stringify(expected);
  const created=await request(url,'/api/worlds',{body:{snapshot:expected}});assert.equal(created.status,201);
  assert.deepEqual(Object.keys(created.data),['worldId','revision','savedAt','paused','speed','snapshot','serverTime','backlogTicks','token']);
  assert.equal(jsonHash(created.data.snapshot),sha(canonical));assert.ok(created.text.includes(`"snapshot":${canonical},"serverTime":`));
  const path=`/api/worlds/${created.data.worldId}`,token=created.data.token;
  assert.equal((await request(url,path)).status,401);
  created.data.snapshot.towns[0].res.food=-123;
  const read=await request(url,path,{token});assert.equal(read.status,200);assert.equal(jsonHash(read.data.snapshot),sha(canonical));assert.equal('token' in read.data,false);
  const changed=await request(url,path+'/commands',{token,body:{expectedRevision:1,command:{type:'speed',speed:64}}});
  assert.equal(changed.status,200);assert.equal(changed.data.revision,2);assert.equal(jsonHash(changed.data.snapshot),sha(canonical));
  const replacement=new Simulation(17,{events:false}).snapshot();
  const imported=await request(url,path+'/commands',{token,body:{expectedRevision:2,command:{type:'import',snapshot:replacement}}});
  assert.equal(imported.status,200);assert.equal(imported.data.revision,3);assert.ok(imported.data.paused);assert.equal(jsonHash(imported.data.snapshot),jsonHash(Simulation.fromSnapshot(replacement).snapshot()));
});

test('A cached response normalizes a loaded legacy save without rewriting its committed history',async t=>{
  const resource=temporary(t),{dbPath}=resource,legacy=JSON.parse(readFileSync(new URL('../saves/seed-481217-after-40-years.json',import.meta.url)));
  assert.equal(legacy.version,2);const raw=JSON.stringify(legacy),expected=Simulation.fromSnapshot(legacy).snapshot(),token='test-serialization-private-key';
  const store=openWorldStore(dbPath),row=rowFor(raw,token);store.create(row,Simulation.fromSnapshot(legacy));store.close();
  const {url}=await server(resource),result=await request(url,`/api/worlds/${row.id}`,{token});
  assert.equal(result.status,200);assert.equal(result.data.snapshot.version,3);assert.equal(result.data.snapshot.generationVersion,1);assert.equal(jsonHash(result.data.snapshot),jsonHash(expected));assert.equal(result.data.revision,1);
  const db=new DatabaseSync(dbPath,{readOnly:true});
  try{const retained=db.prepare('SELECT snapshot,revision FROM worlds WHERE id=?').get(row.id);assert.equal(sha(retained.snapshot),sha(raw));assert.equal(retained.revision,1);assert.equal(db.prepare('SELECT count(*) AS n FROM world_checkpoints WHERE world_id=?').get(row.id).n,1);}finally{db.close();}
});

test('A failed checkpoint rolls back the row, simulation and cached response before a later durable commit',t=>{
  const resource=temporary(t),{dbPath}=resource,store=openWorldStore(dbPath);resource.close.push(()=>store.close());
  const sim=new Simulation(481217,{events:false}),initial=sim.snapshot(),row=rowFor(JSON.stringify(initial),'test-private-key'),entry=store.create(row,sim);
  const db=new DatabaseSync(dbPath);resource.close.push(()=>db.close());
  db.exec("CREATE TRIGGER fail_checkpoint BEFORE INSERT ON world_checkpoints BEGIN SELECT RAISE(ABORT,'injected checkpoint failure'); END");
  sim.advanceDays(1);assert.notEqual(jsonHash(sim.snapshot()),jsonHash(initial));
  assert.throws(()=>store.commit(entry,{saved_at:1000100}),/injected checkpoint failure/);
  assert.equal(entry.row.revision,1);assert.equal(sha(entry.snapshotJson),jsonHash(initial));assert.equal(jsonHash(entry.sim.snapshot()),jsonHash(initial));
  assert.equal(db.prepare('SELECT revision FROM worlds WHERE id=?').get(row.id).revision,1);assert.equal(db.prepare('SELECT count(*) AS n FROM world_checkpoints WHERE world_id=?').get(row.id).n,1);
  db.exec('DROP TRIGGER fail_checkpoint');
  for(let i=0;i<4;i++){entry.sim.advanceDays(.25);store.commit(entry,{saved_at:1000200+i});assert.equal(sha(entry.snapshotJson),jsonHash(entry.sim.snapshot()));}
  assert.equal(entry.row.revision,5);assert.equal(db.prepare('SELECT count(*) AS n FROM world_checkpoints WHERE world_id=?').get(row.id).n,3);
  assert.equal(sha(db.prepare('SELECT snapshot FROM worlds WHERE id=?').get(row.id).snapshot),sha(entry.snapshotJson));
});

test('A busy database cannot leave an uncommitted imported world in memory after BEGIN fails',t=>{
  const resource=temporary(t),{dbPath}=resource,store=openWorldStore(dbPath);resource.close.push(()=>store.close());
  const sim=new Simulation(481217,{events:false}),initial=sim.snapshot(),entry=store.create(rowFor(JSON.stringify(initial),'test-private-key'),sim);
  const other=new DatabaseSync(dbPath);resource.close.push(()=>other.close());
  entry.sim=new Simulation(9901,{events:false});other.exec('BEGIN IMMEDIATE');
  try{assert.throws(()=>store.commit(entry,{paused:1,pending:0}),/locked|busy/i);}finally{other.exec('ROLLBACK');}
  assert.equal(entry.row.revision,1);assert.equal(sha(entry.row.snapshot),jsonHash(initial));assert.equal(sha(entry.snapshotJson),jsonHash(initial));assert.equal(jsonHash(entry.sim.snapshot()),jsonHash(initial));
  const retained=other.prepare('SELECT snapshot,revision FROM worlds').get();assert.equal(sha(retained.snapshot),jsonHash(initial));assert.equal(retained.revision,1);
  store.commit(entry,{speed:64});assert.equal(entry.row.revision,2);assert.equal(entry.sim.state.seed,481217);assert.equal(sha(entry.snapshotJson),jsonHash(initial));
});

test('Recovering an older checkpoint advances the observed revision and preserves all historical checkpoint rows',async t=>{
  const resource=temporary(t),{dbPath}=resource,token='test-recovery-private-key';
  const initial=new Simulation(481217,{events:false}),expected=initial.snapshot(),store=openWorldStore(dbPath);
  const entry=store.create(rowFor(JSON.stringify(expected),token),initial),id=entry.row.id;
  entry.sim=new Simulation(17,{events:false});store.commit(entry,{saved_at:1000001});
  const seenRevision=entry.row.revision;assert.equal(seenRevision,2);assert.equal(entry.sim.state.seed,17);store.close();
  const damage=new DatabaseSync(dbPath);let history;
  try{
    damage.prepare('UPDATE worlds SET snapshot=? WHERE id=?').run('{"damaged":true}',id);
    damage.prepare('UPDATE world_checkpoints SET snapshot=? WHERE world_id=? AND revision=?').run('{"damaged":true}',id,seenRevision);
    history=damage.prepare('SELECT revision,snapshot,saved_at FROM world_checkpoints WHERE world_id=? ORDER BY revision').all(id);
  }finally{damage.close();}
  const recoveredAfter=Date.now(),{url}=await server(resource),path=`/api/worlds/${id}`,read=await request(url,path,{token});
  assert.equal(read.status,200);assert.equal(read.data.revision,seenRevision+1);assert.ok(read.data.paused);assert.equal(read.data.backlogTicks,0);
  assert.equal(jsonHash(read.data.snapshot),jsonHash(expected));assert.ok(read.data.savedAt>=recoveredAfter);
  const db=new DatabaseSync(dbPath,{readOnly:true});
  try{
    const retained=db.prepare('SELECT snapshot,revision,saved_at,wallclock,pending,paused FROM worlds WHERE id=?').get(id);
    assert.equal(retained.revision,seenRevision+1);assert.equal(sha(retained.snapshot),jsonHash(expected));assert.equal(retained.pending,0);assert.equal(retained.paused,1);assert.equal(retained.saved_at,retained.wallclock);
    assert.equal(jsonHash(db.prepare('SELECT revision,snapshot,saved_at FROM world_checkpoints WHERE world_id=? ORDER BY revision').all(id)),jsonHash(history));
  }finally{db.close();}
  const stale=await request(url,path+'/commands',{token,body:{expectedRevision:seenRevision,command:{type:'resume'}}});
  assert.equal(stale.status,409);assert.equal(stale.data.revision,seenRevision+1);
  const still=await request(url,path,{token});assert.equal(still.data.revision,seenRevision+1);assert.ok(still.data.paused);assert.equal(jsonHash(still.data.snapshot),jsonHash(expected));
});
