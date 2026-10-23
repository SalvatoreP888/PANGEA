"""Render parity/performance and inspector acceptance checks; artifacts stay outside
the checkout unless --out names a directory there. Optional --baseline is an
archived, already built app directory. Python Playwright + system Chromium."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
import argparse, base64, hashlib, json, os, tempfile

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--baseline', type=Path)
parser.add_argument('--out', type=Path, default=None)
args = parser.parse_args()
OUT = args.out or Path(tempfile.mkdtemp(prefix='pangaea-optimization-browser-'))
OUT.mkdir(parents=True, exist_ok=True)
report = {'checks': [], 'pageErrors': [], 'implementations': {}, 'comparisons': [],
          'method': '1600x1000 Chromium canvas; paused constructed city, fixed draw time 0.5; five warm-up draws, 45 measured submissions per view. These are CPU submission times, not sustained frame rates.'}

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

servers = []
try:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
        report['browserVersion'] = browser.version
        implementations = ([('baseline', args.baseline)] if args.baseline else []) + [('candidate', ROOT)]
        for name, directory in implementations:
            server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(directory)))
            Thread(target=server.serve_forever, daemon=True).start()
            servers.append(server)
            url = f'http://127.0.0.1:{server.server_port}/'
            context = browser.new_context(viewport={'width': 1600, 'height': 1000}, reduced_motion='reduce')
            page = context.new_page()
            page.on('pageerror', lambda error: report['pageErrors'].append(str(error)))
            page.goto(url)
            page.wait_for_function('window.PANGAEA')
            page.evaluate('PANGAEA.pause()')
            assert 'PANGAEA' in page.title().upper() and page.locator('#world').is_visible()
            data = {'buildSha256': hashlib.sha256((directory / 'index.html').read_bytes()).hexdigest(), 'measurements': []}
            report['implementations'][name] = data
            for population in [1000, 2000]:
                page.evaluate('(n)=>PANGAEA.cityLaboratory(n)', population)
                for zoom in [.72, 1.7]:
                    measurement = page.evaluate('''zoom=>{
                      const r=PANGAEA.renderer,before=JSON.stringify(PANGAEA.snapshot());r.camera.zoom=zoom;
                      for(let i=0;i<5;i++)r.draw(.5);const samples=[];
                      for(let i=0;i<45;i++){const start=performance.now();r.draw(.5);samples.push(performance.now()-start);}
                      samples.sort((a,b)=>a-b);
                      return {medianMs:samples[22],p95Ms:samples[42],hitOrder:JSON.stringify(r.hits.map(h=>[h.kind,h.id])),
                        pixels:r.canvas.toDataURL(),stateUnchanged:before===JSON.stringify(PANGAEA.snapshot())};
                    }''', zoom)
                    assert measurement.pop('stateUnchanged')
                    pixels = base64.b64decode(measurement.pop('pixels').split(',')[1])
                    measurement['pixelSha256'] = hashlib.sha256(pixels).hexdigest()
                    measurement['hitOrderSha256'] = hashlib.sha256(measurement.pop('hitOrder').encode()).hexdigest()
                    measurement.update(population=population, zoom=zoom)
                    data['measurements'].append(measurement)
                    (OUT / f'{name}-{population}-{zoom}.png').write_bytes(pixels)
            report['checks'].append(f'{name}: rendering preserves complete simulation snapshots')
            page.evaluate('''()=>{PANGAEA.setTab('people');const panel=document.getElementById('panel');
              window.keptNode=panel.querySelector('.person-row');keptNode.focus({preventScroll:true});panel.scrollTop=160;
              window.keptScroll=panel.scrollTop;window.panelChanges=0;
              window.panelWatch=new MutationObserver(()=>panelChanges++);panelWatch.observe(panel,{childList:true});}''')
            page.wait_for_timeout(1300)
            idle = page.evaluate('''()=>{panelWatch.disconnect();const p=document.getElementById('panel');
              return {replacements:panelChanges,sameNode:p.contains(keptNode),sameFocus:document.activeElement===keptNode,sameScroll:p.scrollTop===keptScroll};}''')
            data['idleInspector'] = idle
            if name == 'candidate':
                assert idle['replacements'] == 0 and idle['sameNode'] and idle['sameFocus'] and idle['sameScroll']
                report['checks'].append('Idle inspector retains DOM nodes, keyboard focus and scroll without replacement')
                changed = page.evaluate('''()=>{const id=PANGAEA.simulation.alive[0].id;PANGAEA.selectPerson(id);
                  const before=document.getElementById('panel').innerHTML,tick=PANGAEA.snapshot().tick;
                  PANGAEA.advance(1);const advanceRefresh=tick+4===PANGAEA.snapshot().tick&&before!==document.getElementById('panel').innerHTML;
                  const state=PANGAEA.snapshot();state.people.find(p=>p.id===id).name='Inspector refresh check';PANGAEA.load(state);PANGAEA.selectPerson(id);
                  return {advanceRefresh,loadRefresh:document.querySelector('#panel h2').textContent.includes('Inspector refresh check')};}''')
                assert changed['advanceRefresh'] and changed['loadRefresh']
                report['checks'].append('Inspector refreshes after simulation advances and a different save loads')
                page.evaluate("PANGAEA.setTab('supply')")
                page.screenshot(path=str(OUT / 'desktop-supply.png'))
                mobile = context.new_page()
                mobile.set_viewport_size({'width': 390, 'height': 844})
                mobile.on('pageerror', lambda error: report['pageErrors'].append(str(error)))
                mobile.goto(url)
                mobile.wait_for_function('window.PANGAEA')
                mobile.evaluate("PANGAEA.pause();PANGAEA.cityLaboratory(250);PANGAEA.setTab('supply')")
                mobile.locator('#inspectToggle').click()
                assert mobile.locator('#panel .supply-chain').first.is_visible()
                assert mobile.evaluate('document.documentElement.scrollWidth<=innerWidth')
                mobile.screenshot(path=str(OUT / 'mobile-supply.png'))
                report['checks'].append('Mobile supply inspector opens without horizontal overflow')
            context.close()
        if args.baseline:
            for before, after in zip(report['implementations']['baseline']['measurements'], report['implementations']['candidate']['measurements']):
                assert before['pixelSha256'] == after['pixelSha256']
                assert before['hitOrderSha256'] == after['hitOrderSha256']
                report['comparisons'].append({'population': after['population'], 'zoom': after['zoom'], 'identicalPixels': True,
                    'identicalHitOrder': True, 'speedup': before['medianMs'] / after['medianMs']})
            report['checks'].append('All four city views match baseline pixels and complete click-target priority order')
        assert not report['pageErrors']
        browser.close()
finally:
    for server in servers:
        server.shutdown()
        server.server_close()
(OUT / 'results.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
print(f'Artifacts: {OUT}')
