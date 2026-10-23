"""Real Chromium IndexedDB verification; no application server or extra npm dependency needed."""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright
import json, os

ROOT = Path(__file__).resolve().parents[2]
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_): pass

http = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
Thread(target=http.serve_forever, daemon=True).start()
try:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
        page = browser.new_page()
        page.goto(f'http://127.0.0.1:{http.server_port}/')
        checks = page.evaluate("""async () => {
          const {createCheckpointStore}=await import('/src/pangea/persistence/index.mjs');
          const {Simulation}=await import('/src/pangea/simulation/sim.mjs');
          const name='pangea-real-idb-test',store=createCheckpointStore({name});
          const assert=(condition,message)=>{if(!condition)throw Error(message)};
          const sim=new Simulation(481217),checks=[];
          assert((await store.latest())===null,'empty store');
          const pending=[];
          for(let i=1;i<=4;i++){sim.step();pending.push(store.save(sim.snapshot(),{worldId:'world-one',paused:true,speed:16}));}
          const saved=await Promise.all(pending);
          assert(saved[3].revision===4,'serialized revision');
          assert((await store.list()).length===3,'rotating retention');
          assert((await store.load()).snapshot.tick===4,'newest state');
          checks.push('Overlapping autosaves capture each state and retain three atomic checkpoints');
          const other=createCheckpointStore({name});
          let conflict=false;try{await other.save(sim.snapshot(),{worldId:'world-one',expectedRevision:1})}catch(error){conflict=error.code==='conflict'}
          assert(conflict,'cross-connection conflict');checks.push('Concurrent connections reject stale optimistic revisions');
          await new Promise((resolve,reject)=>{const open=indexedDB.open(name,1);open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction('snapshots','readwrite');tx.objectStore('snapshots').put({id:saved[3].id,snapshot:{invalid:true}});tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error)}});
          const recovered=await store.load(saved[3].id);
          assert(recovered.recovered&&recovered.snapshot.tick===3,'valid recovery');
          checks.push('Malformed newest checkpoint restores the prior validated world');
          await store.close();await other.close();
          const reopened=createCheckpointStore({name});assert((await reopened.load()).snapshot.tick===3,'reopen checkpoint');await reopened.close();
          checks.push('Closing and reopening IndexedDB preserves recoverable snapshots');
          localStorage.setItem('pangea-isometric-world-v1',JSON.stringify(sim.snapshot()));
          const migrated=createCheckpointStore({name:'pangea-legacy-idb-test'});
          assert((await migrated.load()).snapshot.seed===481217,'legacy snapshot');
          assert(localStorage.getItem('pangea-isometric-world-v1')===null,'legacy removed after commit');await migrated.close();
          checks.push('Legacy localStorage save migrates after successful IndexedDB commit');
          sim.step();localStorage.setItem('pangea-isometric-world-v1',JSON.stringify(sim.snapshot()));
          const changedLegacy=createCheckpointStore({name:'pangea-legacy-idb-test'});
          assert((await changedLegacy.load()).snapshot.tick===5,'changed legacy migration preserved');
          assert((await changedLegacy.list()).length===2,'distinct legacy snapshot retained');await changedLegacy.close();
          checks.push('A newer legacy save is preserved even when an earlier migration exists');
          return checks;
        }""")
        browser.close()
        print(json.dumps({'status':'passed','checks':checks}, indent=2))
finally:
    http.shutdown(); http.server_close()
