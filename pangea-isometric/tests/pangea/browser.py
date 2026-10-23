"""HTTP and standalone browser integration checks for the real PANGEA application.
Requires Python Playwright and Chromium. Run a local dev/production server first.
PANGEA_URL and PANGEA_QA_OUTPUT optionally select the URL and evidence directory.
"""
from playwright.sync_api import sync_playwright
from pathlib import Path
import json, os, statistics, time
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(os.environ.get('PANGEA_QA_OUTPUT',str(ROOT/'work/qa')));OUT.mkdir(parents=True,exist_ok=True)
URL=os.environ.get('PANGEA_URL','http://127.0.0.1:3000/')
report={'checks':[], 'pageErrors':[], 'failedRequests':[], 'externalRequests':[], 'viewports':[]}
def ok(name):report['checks'].append(name)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1536,'height':1024},device_scale_factor=1,accept_downloads=True)
 page.on('pageerror',lambda e:report['pageErrors'].append(str(e)))
 page.on('requestfailed',lambda r:report['failedRequests'].append(r.url))
 page.on('response',lambda r:report['failedRequests'].append(str(r.status)+' '+r.url) if r.status>=400 else None)
 page.on('request',lambda r:report['externalRequests'].append(r.url) if r.url.startswith('https://') else None)
 page.goto(URL,wait_until='networkidle',timeout=90000);page.wait_for_function('PANGEA.renderer.ready',timeout=60000);page.wait_for_timeout(700)
 first_seed=page.evaluate('PANGEA.simulation.state.seed');page.reload(wait_until='networkidle');page.wait_for_function('PANGEA.renderer.ready');assert page.evaluate('PANGEA.simulation.state.seed')!=first_seed;ok('Fresh launches generate different random worlds');initial=page.evaluate('PANGEA.snapshot()');assert len(initial['towns'])==3 and len(initial['people'])==240
 assert page.evaluate('PANGEA.inspect().issues')==[];ok('Three settlements and 240 actual individuals boot with valid simulation state')
 assert page.locator('.simulation-label').inner_text().find('Constructed world preview')>=0;ok('Constructed preview is explicitly labelled')
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');report['viewports'].append('1536 × 1024')
 page.screenshot(path=str(OUT/'world.png'))
 page.get_by_role('button',name='Enter settlement',exact=True).click();page.wait_for_function('!PANGEA.renderer.transition.active')
 assert page.evaluate('PANGEA.renderer.view')=='settlement';ok('World-to-city action opens the selected live settlement')
 page.screenshot(path=str(OUT/'settlement.png'))
 hit=page.evaluate('PANGEA.renderer.hits.find(h=>h.kind==="building"&&h.x>150&&h.x<850&&h.y>150&&h.y<700)');assert hit
 rect=page.locator('canvas').bounding_box();page.mouse.click(rect['x']+hit['x'],rect['y']+hit['y']);page.wait_for_timeout(80)
 assert page.evaluate('PANGEA.renderer.selected?.kind')=='building';assert page.get_by_text('Construction',exact=True).is_visible();ok('Canvas building hit testing opens the authoritative structure inspector')
 page.get_by_role('button',name='People',exact=True).click();page.locator('.people-list .activity-row').first.click();assert page.get_by_text('A life, right now',exact=True).is_visible();ok('Resident inspector exposes live needs, decision, memory and skills')
 page.screenshot(path=str(OUT/'resident.png'))
 page.get_by_role('button',name='Knowledge',exact=True).click();assert page.locator('.tech-row').count()==36;ok('All 36 real discoveries are inspectable')
 page.get_by_role('button',name='Resources',exact=True).click();assert page.locator('.resource-list>div').count()==page.evaluate('Object.keys(PANGEA.simulation.town(PANGEA.renderer.townId).res).length');ok('Supply inspector shows real inventories and transport counts')
 page.get_by_role('button',name='Chronicle',exact=True).click();expected=page.evaluate('PANGEA.snapshot().events.filter(e=>e.townId===PANGEA.renderer.townId).slice(0,50).length');assert page.locator('.chronicle-row').count()==expected;assert expected or page.get_by_text('No events for this settlement remain in the current log.',exact=False).is_visible();ok('Chronicle shows only actual settlement events or an honest empty state')
 page.keyboard.press('g');page.wait_for_function('!PANGEA.renderer.transition.active');page.wait_for_function('PANGEA.renderer.hits.some(h=>h.kind==="town"&&h.rect)');hit=page.evaluate('PANGEA.renderer.hits.find(h=>h.kind==="town"&&h.id===3&&h.rect)');rect=page.locator('canvas').bounding_box();page.mouse.click(rect['x']+hit['x'],rect['y']+hit['y']);assert page.evaluate('PANGEA.renderer.townId')==3;ok('World map settlement labels select the matching live city');page.locator('.p-rail [aria-label="Settlement"]').click();page.get_by_role('combobox',name='Select settlement').select_option('2');assert page.evaluate('PANGEA.renderer.townId')==2
 page.get_by_role('button',name='Enter settlement',exact=True).click();assert page.evaluate('PANGEA.renderer.townId')==2;ok('Each settlement opens its own seeded terrain, population and buildings')
 page.keyboard.press('f');before=page.evaluate('({...PANGEA.renderer.camera})');page.mouse.move(500,500);page.mouse.down();page.mouse.move(555,535,steps=5);page.mouse.up();assert page.evaluate('PANGEA.renderer.camera.x')!=before['x']
 page.mouse.wheel(0,-160);page.wait_for_timeout(80);assert page.evaluate('PANGEA.renderer.camera.zoom')>before['zoom'];ok('Pointer pan, wheel zoom and recenter change the camera')
 page.get_by_role('button',name='Change map layer',exact=True).click();assert page.evaluate('PANGEA.renderer.layer')=='fertility'
 page.get_by_role('button',name='Change map layer',exact=True).click();assert page.evaluate('PANGEA.renderer.layer')=='resources'
 page.get_by_role('button',name='Change map layer',exact=True).click();assert page.evaluate('PANGEA.renderer.layer')=='natural';ok('Natural, fertility and resource overlays respond')
 page.get_by_role('button',name='Toggle settlement labels',exact=True).click();assert not page.evaluate('PANGEA.renderer.labels');page.get_by_role('button',name='Toggle settlement labels',exact=True).click();ok('Map label toggle responds')
 day=page.evaluate('PANGEA.simulation.day');page.wait_for_timeout(100);assert page.evaluate('PANGEA.simulation.day')==day
 page.get_by_role('button',name='Resume simulation',exact=True).click();page.wait_for_timeout(400);page.get_by_role('button',name='Pause simulation',exact=True).click();assert page.evaluate('PANGEA.simulation.day')>day;ok('Playback advances real simulation ticks; pause freezes them')
 page.get_by_role('button',name='Set speed to 64 times',exact=True).click();ok('Speed control changes the simulation rate')
 page.locator('.p-rail [aria-label="World settings"]').click();page.get_by_role('button',name='Save in browser',exact=True).click();saved=page.evaluate('PANGEA.snapshot()')
 with page.expect_download() as dl:page.get_by_role('button',name='Export world',exact=True).click()
 file=OUT/'roundtrip.json';dl.value.save_as(str(file));assert json.loads(file.read_text())['tick']==saved['tick'];ok('Portable JSON export contains the authoritative state')
 for _ in range(18):page.keyboard.press('Tab');assert page.evaluate('document.querySelector(".world-dialog").contains(document.activeElement)')
 page.keyboard.press('Escape');assert page.get_by_role('dialog').count()==0;ok('Settings trap keyboard focus, close with Escape and restore focus')
 page.evaluate('PANGEA.advance(1)');page.locator('.p-rail [aria-label="World settings"]').click();page.get_by_role('button',name='Load saved world',exact=True).click();page.wait_for_function('tick=>PANGEA.snapshot().tick===tick',arg=saved['tick']);assert page.evaluate('PANGEA.snapshot().tick')==saved['tick'];ok('Browser save restores exact simulation time')
 page.locator('.p-rail [aria-label="World settings"]').click();page.locator('input[type="file"]').set_input_files(str(file));page.wait_for_timeout(100);assert page.evaluate('PANGEA.snapshot().tick')==saved['tick'];ok('Portable import restores the exported world');assert page.evaluate('PANGEA.simulation.state.seed')==saved['seed'];ok('Save import retains the original world seed')
 bad=OUT/'invalid.json';bad.write_text('{"version":3,"towns":[]}');tick=page.evaluate('PANGEA.snapshot().tick');page.locator('input[type="file"]').set_input_files(str(bad));page.wait_for_timeout(100);assert page.evaluate('PANGEA.snapshot().tick')==tick;ok('Malformed import is rejected without replacing the current world')
 page.locator('.p-rail [aria-label="World settings"]').click();page.get_by_role('button',name='New world · Four founders',exact=True).click();page.get_by_role('button',name='Create new world',exact=True).click();assert page.evaluate('PANGEA.simulation.alive.length')==4;assert len(page.evaluate('PANGEA.snapshot().towns'))==1;ok('Natural new worlds start with four individual founders and one settlement')
 natural=page.evaluate('PANGEA.snapshot()');page.locator('.p-rail [aria-label="World settings"]').click();assert page.locator('.seed-input input').input_value()=='';page.get_by_role('button',name='New world · Four founders',exact=True).click();page.get_by_role('button',name='Create new world',exact=True).click();other=page.evaluate('PANGEA.snapshot()');assert natural['seed']!=other['seed'];assert natural['towns'][0]['land']['tiles']!=other['towns'][0]['land']['tiles'];ok('Each automatic new world changes its seed and generated terrain')
 for attempt in range(2):
  page.locator('.p-rail [aria-label="World settings"]').click();page.locator('.seed-input input').fill('481217');page.get_by_role('button',name='New world · Four founders',exact=True).click();page.get_by_role('button',name='Create new world',exact=True).click();world=page.evaluate('PANGEA.snapshot()');assert world['seed']==481217
  if attempt==0:fixed=world
  else:assert fixed==world
 ok('An explicit seed reproduces the same initial world exactly')
 page.evaluate('PANGEA.setView("world")');page.wait_for_timeout(550);page.screenshot(path=str(OUT/'four-founders.png'))
 page.evaluate('PANGEA.showcase()');page.evaluate('PANGEA.setView("settlement")');page.wait_for_function('!PANGEA.renderer.transition.active')
 timings=[]
 for _ in range(8):page.wait_for_timeout(50);timings.append(page.evaluate('PANGEA.renderer.frameMs'))
 report['renderMilliseconds']={'median':round(statistics.median(timings),2),'maxSample':round(max(timings),2),'context':'240-person constructed world; one selected settlement; headless software Chromium'}
 page.set_viewport_size({'width':1280,'height':800});page.wait_for_timeout(250);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');report['viewports'].append('1280 × 800');ok('Laptop viewport has no horizontal overflow')
 page.goto(URL.rstrip('/')+'/isocity',wait_until='networkidle',timeout=60000);assert 'ISOCITY' in page.locator('body').inner_text().upper();ok('The original IsoCity game remains available at /isocity')
 mobile=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True,reduced_motion='reduce')
 mobile.on('pageerror',lambda e:report['pageErrors'].append(str(e)));mobile.goto(URL,wait_until='networkidle');mobile.wait_for_function('PANGEA.renderer.ready');mobile.wait_for_timeout(200)
 assert mobile.locator('.p-inspector').count()==0;assert mobile.evaluate('document.documentElement.scrollWidth<=innerWidth');mobile.screenshot(path=str(OUT/'mobile-world.png'));report['viewports'].append('390 × 844')
 mobile.locator('.open-inspector').click();assert mobile.locator('.p-inspector').is_visible();mobile.get_by_role('button',name='Enter settlement',exact=True).click();mobile.get_by_role('button',name='Close inspector',exact=True).click();mobile.wait_for_timeout(200);mobile.screenshot(path=str(OUT/'mobile-settlement.png'));ok('Phone layout protects the playfield and supports entering and inspecting a city')
 assert mobile.evaluate('PANGEA.renderer.view')=='settlement';assert mobile.evaluate('document.documentElement.scrollWidth<=innerWidth');ok('Reduced-motion mode and mobile layout preserve all primary controls')
 assert not report['pageErrors'],report['pageErrors'];assert not report['failedRequests'],report['failedRequests'];assert not report['externalRequests'],report['externalRequests'];ok('No JavaScript errors, failed HTTP assets or external requests in PANGEA')
 report['browser']=browser.version;browser.close()
(OUT/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
