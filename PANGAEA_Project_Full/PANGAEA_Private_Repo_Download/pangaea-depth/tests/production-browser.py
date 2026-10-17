"""Visible workshop inventories and their actual saved simulation transitions."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from functools import partial
import json,hashlib,os
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'EVIDENCE/logistics';OUT.mkdir(parents=True,exist_ok=True)
report={'checks':[],'pageErrors':[],'externalRequests':[],'constructed':True,'buildSha256':hashlib.sha256((ROOT/'index.html').read_bytes()).hexdigest()}
def ok(name):report['checks'].append(name)
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)));Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':1600,'height':1000});page.on('pageerror',lambda e:report['pageErrors'].append(str(e)))
  page.on('request',lambda r:report['externalRequests'].append(r.url) if r.url.startswith('http') and '127.0.0.1' not in r.url else None)
  page.goto(f'http://127.0.0.1:{server.server_port}/');page.wait_for_function('window.PANGAEA');page.evaluate('PANGAEA.pause();PANGAEA.cityLaboratory(250)');page.wait_for_function('!PANGAEA.renderer.transition')
  page.evaluate("""()=>{const s=PANGAEA.simulation,t=s.town(1),p=s.residents(t)[0],b=s.buildings(t,'mill')[0];window.workshopTest={p:p.id,b:b.id};b.production={inputs:{},outputs:{},batches:0};t.res.grain=8;t.res.flour=0;PANGAEA.setTab('supply');}""")
  card=page.locator('[data-production="mill"]');assert 'awaiting delivery' in card.inner_text();ok('Supply view distinguishes common storage from empty workshop inputs')
  page.evaluate("""()=>{const s=PANGAEA.simulation,t=s.town(1),p=s.person(workshopTest.p);p.x=47;p.y=43;p.task={kind:'supply',stage:'work',work:0,buildingId:workshopTest.b,recipeKind:'mill'};s.work(p,t);PANGAEA.pause();}""")
  assert 'hauling inputs or outputs' in card.inner_text();assert page.evaluate('PANGAEA.simulation.person(workshopTest.p).carry.grain')==8;ok('An actual resident carries the reserved grain while the inspector reports hauling')
  page.evaluate("""()=>{const s=PANGAEA.simulation,t=s.town(1),p=s.person(workshopTest.p),b=t.buildings.find(b=>b.id===workshopTest.b);p.x=b.x;p.y=b.y+1;p.task={kind:'deliverInput',stage:'work',work:0};s.work(p,t);PANGAEA.pause();}""")
  assert 'Workshop supplied' in card.inner_text() and '8.0 at workshop' in card.inner_text();ok('Delivery changes the visible workshop buffer without duplicating storage')
  page.evaluate("""()=>{const s=PANGAEA.simulation,t=s.town(1),p=s.person(workshopTest.p);p.task={kind:'mill',stage:'work',work:0,buildingId:workshopTest.b};s.work(p,t);PANGAEA.pause();}""")
  assert page.evaluate('PANGAEA.simulation.town(1).res.flour')==0;assert 'Flour to collect' in card.inner_text() and '1 batches completed' in card.inner_text();card.evaluate("el=>el.scrollIntoView({block:'center',behavior:'instant'})");page.screenshot(path=str(OUT/'workshop-output.png'));ok('Finished flour remains uncollected and unavailable to the town')
  state=page.evaluate('PANGAEA.snapshot()');page.evaluate('(s)=>PANGAEA.load(s)',state);assert page.evaluate('PANGAEA.snapshot()')==state;ok('Visible workshop inventories and unfinished delivery state round-trip exactly')
  page.evaluate("PANGAEA.renderer.selected={kind:'building',id:workshopTest.b};PANGAEA.pause()");assert 'Workshop inventory' in page.locator('#panel').inner_text();assert '3.0 Flour' in page.locator('#panel').inner_text();page.screenshot(path=str(OUT/'workshop-inspector.png'));ok('Selecting the mill shows its own input and output inventory')
  page.evaluate("""()=>{const s=PANGAEA.simulation,t=s.town(1),p=s.person(workshopTest.p);p.task={kind:'haulOutput',stage:'work',work:0,buildingId:workshopTest.b,recipeKind:'mill'};s.work(p,t);p.x=47;p.y=43;p.task={kind:'deliver',stage:'work',work:0};s.work(p,t);PANGAEA.setTab('supply');}""")
  assert page.evaluate('PANGAEA.simulation.town(1).res.flour')==3;assert not page.evaluate('PANGAEA.inspect().issues');ok('Collected flour reaches shared storage exactly once without invariant failures')
  page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');assert page.locator('.production-card').count()==8;page.locator('[data-production="mill"]').evaluate("el=>el.scrollIntoView({block:'center',behavior:'instant'})");page.screenshot(path=str(OUT/'mobile-supply.png'));ok('Mobile supply cards stay inside the viewport')
  assert not report['pageErrors'] and not report['externalRequests'];report['browserVersion']=browser.version;browser.close()
finally:server.shutdown();server.server_close()
(OUT/'browser-results.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
