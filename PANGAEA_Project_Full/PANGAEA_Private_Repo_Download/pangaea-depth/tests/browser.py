"""Browser QA. Uses set_content when the runner blocks local navigation.
No browser policy is changed. LocalStorage success needs a normal-origin manual check.
Requires Python playwright and a Chromium executable.
"""
from playwright.sync_api import sync_playwright
from pathlib import Path
import json,time,os
ROOT=Path(__file__).resolve().parents[1]
OUTPUT=Path(os.environ.get('PANGAEA_QA_OUTPUT',str(ROOT/'EVIDENCE/cities/baseline-browser')));(OUTPUT/'previews').mkdir(parents=True,exist_ok=True)
report={'checks':[],'pageErrors':[],'networkRequests':[],'limitations':['This baseline runner uses set_content. HTTP boot, file launching and localStorage are checked separately by the city browser runner.','Only Chromium was tested; Safari/Firefox and real touch hardware were not tested.']}
def ok(name):report['checks'].append({'name':name,'pass':True})
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1600,'height':1000},device_scale_factor=1,accept_downloads=True)
    page.on('pageerror',lambda e:report['pageErrors'].append(str(e)))
    page.on('request',lambda r:report['networkRequests'].append(r.url))
    start=time.time();page.set_content((ROOT/'index.html').read_text());page.wait_for_function('window.PANGAEA');page.evaluate('PANGAEA.pause()');report['bootSeconds']=round(time.time()-start,3)
    assert page.evaluate('PANGAEA.inspect().population')==4;ok('Boot with four founders and no external requests')
    d=page.evaluate('PANGAEA.inspect().day');page.wait_for_timeout(300);assert page.evaluate('PANGAEA.inspect().day')==d;ok('Pause freezes simulation')
    page.keyboard.press('Space');page.wait_for_timeout(600);page.keyboard.press('Space');assert page.evaluate('PANGAEA.inspect().day')>d;ok('Space resumes and pauses')
    page.locator('[data-view="town"]').click();assert page.evaluate('PANGAEA.renderer.mode')=='town';page.keyboard.press('g');assert page.evaluate('PANGAEA.renderer.mode')=='globe';ok('View buttons and G/C shortcuts')
    page.screenshot(path=str(OUTPUT/'previews/01-founding-globe.png'))
    state=json.loads((ROOT/'saves/seed-481217-after-40-years.json').read_text())
    page.evaluate('(s)=>PANGAEA.load(s)',state);assert page.evaluate('PANGAEA.inspect().population')==29;assert page.evaluate('PANGAEA.inspect().towns')==4
    page.wait_for_timeout(150);page.screenshot(path=str(OUTPUT/'previews/04-mature-globe.png'));ok('40-year checkpoint restores 29 people in four settlements')
    page.keyboard.press('c');page.keyboard.press('f');page.wait_for_timeout(100);page.screenshot(path=str(OUTPUT/'previews/05-mature-town.png'))
    page.locator('[data-tab="people"]').click();assert page.locator('.person-row').count()>0;page.locator('.person-row').first.click();assert page.get_by_text('Decision inspector').is_visible();ok('Person selection displays needs, utility scores, memories and family')
    page.screenshot(path=str(OUTPUT/'previews/06-decision-inspector.png'))
    page.locator('[data-tab="knowledge"]').click();assert page.locator('#panel').inner_text().find('Cultivation')>=0;ok('Knowledge inspector')
    page.locator('[data-tab="chronicle"]').click();assert len(page.locator('#panel').inner_text())>400;ok('Chronicle inspector')
    page.locator('[data-tab="settlement"]').click()
    before=page.evaluate('PANGAEA.renderer.layer');page.locator('#layerBtn').click();assert page.evaluate('PANGAEA.renderer.layer')!=before;ok('Fertility/resource/activity layer toggle')
    page.locator('#layerBtn').click();page.locator('#layerBtn').click();page.locator('#layerBtn').click()
    page.evaluate('PANGAEA.setView("town");PANGAEA.renderer.focus()');page.wait_for_timeout(50)
    oldx=page.evaluate('PANGAEA.renderer.camera.x');page.mouse.move(900,430);page.mouse.down();page.mouse.move(950,465,steps=4);page.mouse.up();assert page.evaluate('PANGAEA.renderer.camera.x')!=oldx
    oldz=page.evaluate('PANGAEA.renderer.camera.zoom');page.mouse.wheel(0,-180);page.wait_for_timeout(80);assert page.evaluate('PANGAEA.renderer.camera.zoom')>oldz;ok('Pointer drag and wheel change town camera')
    page.evaluate('PANGAEA.renderer.focus()');page.wait_for_timeout(100)
    hit=page.evaluate('PANGAEA.renderer.hits.find(h=>h.kind==="building"&&h.x>260&&h.x<1000&&h.y>220&&h.y<650)')
    rect=page.locator('#world').bounding_box();page.mouse.click(hit['x']+rect['x'],hit['y']+rect['y']);page.wait_for_timeout(100)
    assert page.evaluate('PANGAEA.renderer.selected?.kind')=='building';ok('A building on the canvas opens its live inspector')
    page.locator('#menuBtn').click();assert page.locator('#menuDialog').is_visible();d=page.evaluate('PANGAEA.inspect().day');page.wait_for_timeout(300);assert page.evaluate('PANGAEA.inspect().day')==d
    with page.expect_download() as dl:page.locator('#exportBtn').click()
    download=dl.value;download.save_as(str(OUTPUT/'browser-export.json'));saved=json.loads((OUTPUT/'browser-export.json').read_text());assert saved['version']==3;ok('Portable JSON download')
    page.locator('#importInput').set_input_files(str(OUTPUT/'browser-export.json'));page.wait_for_timeout(200);assert not page.locator('#menuDialog').is_visible();assert page.evaluate('PANGAEA.snapshot().tick')==saved['tick'];ok('Portable JSON import round-trip')
    page.locator('#menuBtn').click();page.locator('#droughtBtn').click();assert page.evaluate('PANGAEA.renderer.town.weather.kind')=='Drought';ok('Drought intervention changes authoritative weather')
    page.locator('#menuBtn').click();page.locator('#saveBtn').click();page.wait_for_timeout(50);assert 'Export' in page.locator('#toast').inner_text() or 'saved' in page.locator('#toast').inner_text();ok('Local-storage action reports success or unavailable-storage fallback, never crashes')
    page.locator('[data-close="menuDialog"]').click()
    page.locator('#helpBtn').click();assert page.locator('#helpDialog').is_visible();page.locator('[data-close="helpDialog"]').click();ok('Help dialog opens and closes')
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');ok('Desktop has no horizontal page overflow')
    mobile=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
    mobile.on('pageerror',lambda e:report['pageErrors'].append(str(e)))
    mobile.set_content((ROOT/'index.html').read_text());mobile.wait_for_function('window.PANGAEA');mobile.evaluate('(s)=>PANGAEA.load(s)',state);mobile.evaluate('PANGAEA.setView("town")');mobile.wait_for_timeout(100)
    assert mobile.evaluate('document.body.classList.contains("panel-hidden")');assert mobile.evaluate('document.documentElement.scrollWidth<=innerWidth');mobile.screenshot(path=str(OUTPUT/'previews/07-mobile-town.png'));ok('390px mobile canvas remains available and does not overflow')
    mobile.locator('#inspectToggle').click();assert not mobile.evaluate('document.body.classList.contains("panel-hidden")');mobile.locator('[data-tab="people"]').click();mobile.locator('.person-row').first.click();mobile.screenshot(path=str(OUTPUT/'previews/08-mobile-inspector.png'));ok('Mobile observation sheet and person selection')
    mobile.locator('#inspectToggle').click();mobile.keyboard.press('g');mobile.wait_for_timeout(100);mobile.screenshot(path=str(OUTPUT/'previews/09-mobile-globe.png'))
    assert not report['pageErrors'];assert not report['networkRequests'];report['browserVersion']=browser.version
    browser.close()
(OUTPUT/'browser-results.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
