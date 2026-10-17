"""Road saturation, MAX/replay, supply, planet and fantasy transition acceptance checks."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
import json,hashlib,time,os
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'EVIDENCE/realms';OUT.mkdir(parents=True,exist_ok=True)
report={'checks':[],'pageErrors':[],'buildSha256':hashlib.sha256((ROOT/'index.html').read_bytes()).hexdigest()}
def ok(name):report['checks'].append(name)
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)));Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':1600,'height':1000},accept_downloads=True);page.on('pageerror',lambda e:report['pageErrors'].append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/');page.wait_for_function('window.PANGAEA');page.evaluate('PANGAEA.pause()')
  assert set(page.evaluate('PANGAEA.simulation.alive.map(p=>p.species)'))=={'human','elf','dwarf','orc'};ok('Four species begin together in one settlement')
  page.evaluate("PANGAEA.setView('town')");assert page.evaluate('!!PANGAEA.renderer.transition');page.wait_for_function('!PANGAEA.renderer.transition');assert page.evaluate("PANGAEA.renderer.mode==='town'");ok('World-to-city descent animates and reaches the correct view')
  # Actual time scheduling must not skip deterministic work or change outcomes.
  page.evaluate("PANGAEA.load(new (PANGAEA.simulation.constructor)(481217,{events:false}).snapshot());PANGAEA.setSpeed('max')")
  start=time.monotonic();page.wait_for_timeout(800);page.locator('#pauseBtn').click(timeout=3000);elapsed=time.monotonic()-start
  result=page.evaluate('''()=>{const state=PANGAEA.snapshot(),control=new (PANGAEA.simulation.constructor)(state.seed,{events:false});control.step(state.tick);return {exact:JSON.stringify(state)===JSON.stringify(control.snapshot()),days:PANGAEA.inspect().day,paused:PANGAEA.paused,mode:PANGAEA.inspect().requestedSpeed};}''')
  assert result['exact'] and result['paused'] and result['mode']=='max' and result['days']>0;report['maxObservation']={**result,'wallSeconds':elapsed,'observedDaysPerSecond':result['days']/elapsed};ok('MAX executes real ticks, pauses responsively and matches exact reference replay')
  page.locator('[data-speed="16"]').click();assert page.evaluate('PANGAEA.inspect().requestedSpeed')==16;page.evaluate('PANGAEA.pause()');ok('MAX can switch back to a fixed speed')
  # Check the exact late-world condition missed by the original city-only screenshots.
  state=json.loads((ROOT/'saves/cities-seed-481217-after-100-years.json').read_text());page.evaluate('(s)=>PANGAEA.load(s)',state);page.evaluate("PANGAEA.setView('town');PANGAEA.renderer.transition=null;PANGAEA.renderer.draw(0)")
  comparison=page.evaluate("()=>{PANGAEA.renderer.draw(0);const before=PANGAEA.renderer.canvas.toDataURL();PANGAEA.renderer.town.land.roads.fill(120);PANGAEA.renderer.streetKey=null;PANGAEA.renderer.draw(0);return {equal:before===PANGAEA.renderer.canvas.toDataURL(),before};}");baseline=comparison['before'];assert comparison['equal'];ok('Saturated foot traffic produces no extra normal-view streets or lattice')
  page.screenshot(path=str(OUT/'mature-roads-fixed.png'))
  page.evaluate("PANGAEA.renderer.layer='activity';PANGAEA.renderer.streetKey=null;PANGAEA.renderer.draw(0)");assert page.evaluate('PANGAEA.renderer.canvas.toDataURL()')!=baseline;ok('Traffic remains visible as an explicit activity heatmap')
  page.evaluate("PANGAEA.renderer.layer='natural';PANGAEA.cityLaboratory()");page.wait_for_function('!PANGAEA.renderer.transition');page.locator('[data-tab="supply"]').click();assert page.locator('.supply-chain').count()==5
  panel=page.locator('#panel').inner_text();assert 'grain' in panel.lower() and 'flour' in panel.lower() and 'clay' in panel.lower() and 'River stocks' in panel;ok('Supply view exposes all five chains, inputs, worker and resource blockers')
  page.screenshot(path=str(OUT/'city-supply.png'))
  assert page.evaluate("PANGAEA.simulation.state.towns.some(t=>t.buildings.some(b=>b.type==='fishery'))");ok('City laboratory includes actual bank-sited fisheries and industry')
  page.locator('[data-tab="settlement"]').click();assert page.locator('.species-mix span').count()==4;ok('Population inspector exposes mixed city composition')
  page.locator('#menuBtn').click();page.locator('.planet-controls summary').click();assert page.locator('[data-planet]').count()==6
  page.locator('[data-planet="temperature"]').fill('3');page.locator('[data-planet="stormFrequency"]').fill('0');page.locator('[data-planet="rainfall"]').fill('1.4');page.locator('#applyClimateBtn').click();assert page.evaluate('PANGAEA.simulation.state.planet.temperature')==3;assert page.evaluate('PANGAEA.simulation.state.planet.stormFrequency')==0;assert page.evaluate('PANGAEA.inspect().population')==1000;ok('Climate controls apply temperature, rainfall and storms without replacing cities')
  page.screenshot(path=str(OUT/'planet-controls.png'));page.locator('[data-close="menuDialog"]').click()
  # Space/settlement scrolling and reduced-motion behavior.
  page.evaluate("PANGAEA.setView('globe');PANGAEA.renderer.transition=null;PANGAEA.renderer.orbit.zoom=1.4;PANGAEA.renderer.draw(0)");page.locator('#world').hover();page.mouse.wheel(0,-100);page.wait_for_function("PANGAEA.renderer.mode==='town'");page.wait_for_function('!PANGAEA.renderer.transition');ok('Scrolling inward from space enters the selected settlement')
  page.evaluate('PANGAEA.renderer.camera.zoom=.2');page.mouse.wheel(0,100);page.wait_for_function("PANGAEA.renderer.mode==='globe'");page.wait_for_function('!PANGAEA.renderer.transition');ok('Scrolling out of a settlement returns to the planet')
  page.evaluate('PANGAEA.renderer.orbit.zoom=1;PANGAEA.renderer.dirty=true;PANGAEA.renderer.draw(0)');page.screenshot(path=str(OUT/'climate-globe.png'))
  page.emulate_media(reduced_motion='reduce');page.evaluate("PANGAEA.setView('town')");assert not page.evaluate('!!PANGAEA.renderer.transition');ok('Reduced motion skips the transition')
  mobile=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True);mobile.on('pageerror',lambda e:report['pageErrors'].append(str(e)));mobile.goto(f'http://127.0.0.1:{server.server_port}/');mobile.wait_for_function('window.PANGAEA');mobile.evaluate('PANGAEA.pause()');assert mobile.locator('[data-speed="max"]').is_visible();assert mobile.evaluate('document.documentElement.scrollWidth<=innerWidth');mobile.locator('#menuBtn').click();mobile.locator('.planet-controls summary').click();assert mobile.locator('[data-planet]').count()==6;assert mobile.evaluate('document.getElementById("menuDialog").scrollWidth<=document.getElementById("menuDialog").clientWidth');mobile.screenshot(path=str(OUT/'mobile-planet.png'));ok('Mobile exposes MAX and all climate controls without horizontal overflow')
  assert not report['pageErrors'];report['browserVersion']=browser.version;browser.close()
finally:
 server.shutdown();server.server_close()
(OUT/'browser-results.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
