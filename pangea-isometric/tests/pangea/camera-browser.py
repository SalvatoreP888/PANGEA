"""Camera continuity and real touch regression checks against a running frontend."""
import json, math, os
from pathlib import Path
from playwright.sync_api import sync_playwright

URL=os.environ.get('PANGEA_URL','http://127.0.0.1:3002')
report={'checks':[],'errors':[]}
OUTPUT=Path(__file__).resolve().parents[2]/'work'
OUTPUT.mkdir(parents=True,exist_ok=True)

def ok(message):
    report['checks'].append(message)
    print('PASS',message,flush=True)

def near(actual,expected,tolerance=1e-7):
    assert abs(actual-expected)<tolerance,(actual,expected)

def equal_camera(a,b):
    for key in ['x','y','zoom']:near(a[key],b[key])

def finish(page):
    page.wait_for_function('!PANGEA.renderer.transition.active')

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1440,'height':900},device_scale_factor=1)
    page.on('pageerror',lambda error:report['errors'].append(str(error)))
    page.goto(URL,wait_until='networkidle')
    page.wait_for_function('PANGEA?.renderer.ready')
    page.evaluate('PANGEA.pause()')
    seam=page.evaluate('''()=>{const r=PANGEA.renderer;r.pan(48,-22);r.zoomBy(1.13,430,350);const camera={...r.camera},source=r.screen(r.sceneAnchor());PANGEA.setView('settlement');return{camera,source,target:r.screen(r.sceneAnchor()),active:r.transition.active};}''')
    near(seam['source']['x'],seam['target']['x']);near(seam['source']['y'],seam['target']['y']);assert seam['active']
    ok('Selected world-town and city-hall anchors align at semantic handoff')
    finish(page)
    page.evaluate('PANGEA.setView("world")');finish(page)
    equal_camera(page.evaluate('({...PANGEA.renderer.camera})'),seam['camera'])
    ok('Returning to the world restores its exact panned and zoomed camera')

    page.evaluate('PANGEA.setView("settlement")');finish(page)
    camera_a=page.evaluate('''()=>{const r=PANGEA.renderer;r.pan(123,-44);r.zoomBy(1.15,510,330);return{...r.camera};}''')
    page.get_by_role('combobox',name='Select settlement').select_option('2');finish(page)
    camera_b=page.evaluate('''()=>{const r=PANGEA.renderer;r.pan(-77,60);return{...r.camera};}''')
    page.get_by_role('combobox',name='Select settlement').select_option('1');finish(page)
    equal_camera(page.evaluate('({...PANGEA.renderer.camera})'),camera_a)
    page.get_by_role('combobox',name='Select settlement').select_option('2');finish(page)
    equal_camera(page.evaluate('({...PANGEA.renderer.camera})'),camera_b)
    ok('Each settlement restores its own independent camera')

    page.evaluate('PANGEA.setView("world")');page.wait_for_timeout(120)
    bounds=page.locator('canvas').bounding_box();page.mouse.move(bounds['x']+bounds['width']/2,bounds['y']+bounds['height']/2)
    page.mouse.wheel(0,-150);page.wait_for_timeout(40)
    assert not page.evaluate('PANGEA.renderer.transition.active')
    interrupted=page.evaluate('({...PANGEA.renderer.camera})')
    page.wait_for_timeout(850);equal_camera(page.evaluate('({...PANGEA.renderer.camera})'),interrupted)
    ok('Wheel input interrupts the displayed camera without a later animation snap')

    page.evaluate('PANGEA.renderer.focus()');page.wait_for_timeout(60)
    hit=page.evaluate('PANGEA.renderer.hits.find(h=>h.kind==="town"&&h.id===2&&h.rect)')
    assert hit
    bounds=page.locator('canvas').bounding_box()
    page.mouse.dblclick(bounds['x']+hit['x'],bounds['y']+hit['y'],delay=90)
    assert page.evaluate('PANGEA.renderer.view')=='settlement'
    assert page.evaluate('PANGEA.renderer.townId')==2
    finish(page)
    ok('Double-clicking the selected map town opens that authoritative settlement')

    page.evaluate('PANGEA.setView("world")');page.wait_for_timeout(100)
    expected=page.evaluate('({...PANGEA.renderer.transition.motion.target})')
    page.emulate_media(reduced_motion='reduce');page.wait_for_timeout(80)
    assert not page.evaluate('PANGEA.renderer.transition.active')
    equal_camera(page.evaluate('({...PANGEA.renderer.camera})'),expected)
    assert page.evaluate('PANGEA.renderer.transitionSnapshot') is None
    page.evaluate('PANGEA.setView("settlement")')
    assert not page.evaluate('PANGEA.renderer.transition.active')
    ok('Reduced motion finishes active camera travel and makes later navigation immediate')

    page.emulate_media(reduced_motion='no-preference')
    page.evaluate('PANGEA.setView("world")')
    page.set_viewport_size({'width':1100,'height':760});page.wait_for_timeout(120)
    assert not page.evaluate('PANGEA.renderer.transition.active')
    assert page.evaluate('PANGEA.renderer.transitionSnapshot') is None
    assert page.evaluate('Object.values(PANGEA.renderer.camera).every(Number.isFinite)')
    ok('Resizing during travel releases the snapshot and leaves a finite usable camera')

    mobile=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True,reduced_motion='reduce')
    mobile.on('pageerror',lambda error:report['errors'].append(str(error)))
    mobile.goto(URL,wait_until='networkidle');mobile.wait_for_function('PANGEA?.renderer.ready')
    mobile.emulate_media(reduced_motion='no-preference')
    tiny=mobile.evaluate('''()=>{PANGEA.setView('settlement');const r=PANGEA.renderer,before=r.camera.zoom;r.zoomBy(1.01);return{before,after:r.camera.zoom};}''')
    near(tiny['after'],tiny['before']*1.01,1e-5)
    ok('Tiny input during phone-scale travel preserves proportional zoom without a minimum-bound jump')
    mobile.emulate_media(reduced_motion='reduce')
    mobile.evaluate('PANGEA.pause();PANGEA.setView("settlement")')
    bounds=mobile.locator('canvas').bounding_box()
    initial=mobile.evaluate('''()=>{const r=PANGEA.renderer;r.focus();const x=r.width/2,y=r.height/2;return{camera:{...r.camera},x,y,world:{x:r.camera.x,y:r.camera.y}};}''')
    cdp=mobile.context.new_cdp_session(mobile)
    def touch(type_,points):
        cdp.send('Input.dispatchTouchEvent',{'type':type_,'touchPoints':[{'x':bounds['x']+x,'y':bounds['y']+y,'id':id_,'radiusX':2,'radiusY':2} for id_,x,y in points]})
    x,y=initial['x'],initial['y']
    touch('touchStart',[(1,x-60,y),(2,x+60,y)])
    touch('touchMove',[(1,x-78,y-15),(2,x+102,y-15)])
    touch('touchEnd',[])
    result=mobile.evaluate('''()=>{const r=PANGEA.renderer;const x=r.width/2+12,y=r.height/2-15;return{camera:{...r.camera},selected:r.selected,world:{x:(x-r.width/2)/r.camera.zoom+r.camera.x,y:(y-r.height/2)/r.camera.zoom+r.camera.y}};}''')
    near(result['camera']['zoom'],initial['camera']['zoom']*1.5,1e-5)
    near(result['world']['x'],initial['world']['x'],1e-4);near(result['world']['y'],initial['world']['y'],1e-4)
    assert result['selected'] is None
    ok('Real touch input preserves the moving pinch centroid at DPR2 and makes no phantom selection')
    assert not report['errors'],report['errors']
    browser.close()

(OUTPUT/'camera-browser-report.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
