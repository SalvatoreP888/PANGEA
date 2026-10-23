"""Verify the actual single-file export embeds artwork, fonts and license notices."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, os
root = Path(__file__).resolve().parents[2]
out = root / 'work/qa-standalone'
out.mkdir(parents=True, exist_ok=True)
report = {'checks': [], 'errors': [], 'requests': []}
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width':1536,'height':1024})
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    page.on('request', lambda r: report['requests'].append(r.url) if r.url.startswith(('http:','https:')) else None)
    page.set_content((root/'dist/PANGEA.html').read_text(), wait_until='networkidle')
    page.wait_for_function('window.PANGEA?.renderer.ready')
    assert page.evaluate('PANGEA.renderer.artImages.size') == 30
    assert page.evaluate('PANGEA.snapshot().generationVersion') == 2
    assert page.evaluate('PANGEA.inspect().issues') == []
    report['checks'].append('Self-contained export loads all30 architecture sprites and a valid generation2 world')
    page.get_by_role('button',name='Enter settlement',exact=True).click()
    page.wait_for_function('!PANGEA.renderer.transition.active')
    page.screenshot(path=str(out/'standalone-city.png'))
    page.locator('.p-rail [aria-label="World settings"]').click()
    page.get_by_role('button',name='night',exact=True).click()
    tick=page.evaluate('PANGEA.snapshot().tick')
    page.get_by_role('button',name='Close world settings',exact=True).click()
    assert page.evaluate('PANGEA.renderer.lighting')=='night'
    assert page.evaluate('PANGEA.snapshot().tick')==tick
    page.screenshot(path=str(out/'standalone-night.png'))
    report['checks'].append('Offline settlement navigation and static night presentation work')
    page.locator('.p-rail [aria-label="World settings"]').click()
    page.get_by_text('Open-source credits and licenses',exact=True).click()
    assert page.locator('.p-credits section').count()==9
    licenses=page.locator('.p-credits').text_content()
    for needle in ['Apache License','Mike Bostock','Jonas Wagner','Jake Archibald','OFL','amilich']:
        assert needle in licenses, needle
    report['checks'].append('Complete incorporated-source license notices are embedded in the export')
    assert not report['requests'], report['requests']
    assert not report['errors'], report['errors']
    report['checks'].append('No runtime HTTP requests or JavaScript errors')
    browser.close()
(out/'report.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
