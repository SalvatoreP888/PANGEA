"""Actual HTTP/file launch, city UI, render and persistence QA. No remote requests."""
from pathlib import Path
from playwright.sync_api import sync_playwright,Error as PlaywrightError
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
import json,os,statistics,time,hashlib
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'EVIDENCE/cities';OUT.mkdir(parents=True,exist_ok=True)
report={'checks':[],'pageErrors':[],'externalRequests':[],'buildSha256':hashlib.sha256((ROOT/'index.html').read_bytes()).hexdigest()}
def ok(name):report['checks'].append(name)
class QuietHandler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT)))
Thread(target=server.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{server.server_port}/'
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':1600,'height':1000},accept_downloads=True)
  page.on('pageerror',lambda e:report['pageErrors'].append(str(e)))
  page.on('request',lambda r:report['externalRequests'].append(r.url) if not r.url.startswith(url) and not r.url.startswith('blob:') else None)
  page.goto(url);page.wait_for_function('window.PANGAEA');page.evaluate('PANGAEA.pause()');assert page.evaluate('PANGAEA.inspect().population')==4;ok('HTTP boot preserves exactly four founders')
  page.locator('[data-tab="knowledge"]').click();page.locator('[data-open-tech]').click();assert page.locator('#techAtlasContent [data-tech-node]').count()==36;assert page.locator('.tech-connections path').count()>25;assert page.locator('.atlas-lane').count()==25;ok('Atlas renders all 36 technologies, branch lanes and prerequisite connections')
  page.locator('[data-close="techDialog"]').click()
  page.locator('#menuBtn').click();page.locator('#cityLabBtn').click();assert page.evaluate('PANGAEA.inspect().population')==1000;assert 'sandbox' in page.evaluate('PANGAEA.snapshot().scenario');assert page.evaluate('PANGAEA.paused');ok('City laboratory creates 1,000 actual people and labels its constructed origin')
  assert page.locator('.route-card').count()==2;assert 'Steam railway' in page.locator('#panel').inner_text();assert 'Graded dirt road' in page.locator('#panel').inner_text();assert '1 passengers' in page.locator('#panel').inner_text();ok('Transport inspector exposes live road/rail capacities and cargo')
  page.evaluate("PANGAEA.setTab('settlement')");page.wait_for_function('!PANGAEA.renderer.transition')
  assert page.evaluate('PANGAEA.simulation.state.towns[0].buildings.length')>80
  assert page.evaluate('PANGAEA.simulation.state.towns[0].land.streets.filter(x=>x>0).length')>200
  assert page.evaluate('PANGAEA.renderer.camera.zoom')<1;ok('Dense city contains over 80 buildings and connected street tiles')
  page.screenshot(path=str(OUT/'city-desktop.png'))
  # Search/pagination never renders thousands of DOM rows at once.
  page.locator('[data-tab="people"]').click();assert page.locator('.person-row').count()==60
  page.locator('#peopleSearch').fill('Iris');assert page.locator('.person-row').count()==1;page.locator('.person-row').click();assert 'Decision inspector' in page.locator('#panel').inner_text();ok('Resident search, pagination and individual inspection work at city scale')
  page.evaluate("PANGAEA.setTab('transport')");page.locator('[data-town-picker]').select_option('2');assert page.evaluate('PANGAEA.renderer.townId')==2;ok('Town selector switches actual settlement state')
  page.locator('[data-visit-town="1"]').first.click();page.evaluate("PANGAEA.setTab('knowledge')");page.locator('[data-open-tech]').click();page.screenshot(path=str(OUT/'technology-atlas.png'));page.locator('[data-close="techDialog"]').click()
  page.evaluate("PANGAEA.setTab('transport')");page.screenshot(path=str(OUT/'transport-desktop.png'))
  before=page.evaluate('PANGAEA.simulation.state.towns[1].res.food');page.evaluate('PANGAEA.advance(10)');assert page.evaluate('PANGAEA.simulation.state.links[0].delivered')>0;assert page.evaluate('PANGAEA.inspect().issues')==[];ok('Advancing the city delivers real cargo without invariant violations')
  # Render cost is distinct from real browser frame pacing and simulation throughput.
  report['renderMs']=page.evaluate('''()=>{const times=[];for(let i=0;i<60;i++){const start=performance.now();PANGAEA.renderer.draw(i/60);times.push(performance.now()-start);}times.sort((a,b)=>a-b);return {median:times[30],p95:times[57],viewport:[innerWidth,innerHeight],population:PANGAEA.inspect().population};}''')
  page.locator('#menuBtn').click();page.locator('#saveBtn').click();assert 'saved' in page.locator('#toast').inner_text().lower();page.reload();page.wait_for_function('window.PANGAEA');page.locator('#menuBtn').click();page.locator('#loadBtn').click();assert page.evaluate('PANGAEA.inspect().population')==1000;ok('City localStorage save survives actual origin reload')
  page.locator('#menuBtn').click()
  with page.expect_download() as dl:page.locator('#exportBtn').click()
  exported=OUT/'city-browser-export.json';dl.value.save_as(str(exported));assert json.loads(exported.read_text())['version']==3
  page.locator('#importInput').set_input_files(str(exported));assert page.evaluate('PANGAEA.inspect().population')==1000;assert page.evaluate('PANGAEA.inspect().issues')==[];ok('Version 3 city JSON export/import round-trip')
  page.evaluate("PANGAEA.setView('globe');PANGAEA.setTab('transport')");page.screenshot(path=str(OUT/'network-world.png'))
  mobile=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
  mobile.on('pageerror',lambda e:report['pageErrors'].append(str(e)))
  mobile.goto(url);mobile.wait_for_function('window.PANGAEA');mobile.evaluate('PANGAEA.cityLaboratory()');mobile.wait_for_function('!PANGAEA.renderer.transition');mobile.screenshot(path=str(OUT/'city-mobile.png'))
  mobile.locator('#inspectToggle').click();mobile.locator('[data-tab="transport"]').click();assert mobile.locator('.route-card').count()==2;assert mobile.evaluate('document.documentElement.scrollWidth<=innerWidth');ok('Mobile city and transport sheet stay within 390px')
  mobile.locator('[data-tab="knowledge"]').click();mobile.locator('[data-open-tech]').click();assert mobile.locator('#techAtlasContent [data-tech-node]').count()==36;assert mobile.evaluate('document.getElementById("techDialog").scrollWidth<=document.getElementById("techDialog").clientWidth');mobile.screenshot(path=str(OUT/'technology-mobile.png'));ok('Mobile technology atlas remains usable without horizontal overflow')
  mobile.locator('[data-close="techDialog"]').click();mobile.set_viewport_size({'width':844,'height':390});assert mobile.evaluate('document.documentElement.scrollWidth<=innerWidth');ok('Landscape resize keeps the game inside the viewport')
  filepage=browser.new_page()
  try:
   filepage.goto((ROOT/'index.html').as_uri());filepage.wait_for_function('window.PANGAEA');filepage.evaluate('PANGAEA.pause()');assert filepage.evaluate('PANGAEA.inspect().population')==4;ok('Standalone file launches without a web server')
  except PlaywrightError as error:
   if 'ERR_BLOCKED_BY_ADMINISTRATOR' not in str(error):raise
   report['blockedChecks']=['Direct file launch: Chromium administrator policy blocks file:// navigation; HTTP and identical standalone content passed.']
  report['browserVersion']=browser.version
  assert not report['pageErrors'],report['pageErrors'];assert not report['externalRequests'],report['externalRequests'];ok('No page exceptions or external requests')
  browser.close()
finally:
 server.shutdown();server.server_close()
(OUT/'city-browser-results.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
