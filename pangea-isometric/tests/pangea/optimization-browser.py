"""Compare isometric renderer pixels/hits against an archived app and check idle
React work on the production app. Requires npm ci and optional --url app server.
All generated bundles/screenshots stay in --out (a fresh /tmp directory by default)."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
import argparse, base64, hashlib, json, os, subprocess, tempfile
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--baseline', type=Path, required=True)
parser.add_argument('--out', type=Path)
parser.add_argument('--url')
parser.add_argument('--max-channel-delta', type=int, default=0)
parser.add_argument('--max-changed-pixel-ratio', type=float, default=0)
args = parser.parse_args()
assert 0 <= args.max_channel_delta <= 255
assert 0 <= args.max_changed_pixel_ratio <= 1
OUT = args.out or Path(tempfile.mkdtemp(prefix='pangea-isometric-optimization-'))
OUT.mkdir(parents=True, exist_ok=True)
report = {'checks': [], 'pageErrors': [], 'implementations': {}, 'comparisons': [],
          'method': '1536x1024 Chromium, paused constructed generation-2 city, fixed time 0.5. Ten RAF warmups, 48 paced frames including final presentation boundary; then 45 tight CPU submissions plus readback. Not end-to-end simulation FPS.'}
build = '''
import {build} from 'esbuild';import {resolve} from 'node:path';
const [root,out,name]=process.argv.slice(1);
const contents=`export {PangeaRenderer} from ${JSON.stringify(resolve(root,'src/pangea/renderer.ts'))};
export {Simulation} from ${JSON.stringify(resolve(root,'src/pangea/simulation/sim.mjs'))};
export {createCityLaboratory} from ${JSON.stringify(resolve(root,'src/pangea/simulation/scenarios.mjs'))};`;
await build({stdin:{contents,resolveDir:root,loader:'ts'},bundle:true,format:'iife',globalName:name,nodePaths:[resolve(process.cwd(),'node_modules')],
outfile:out,alias:{'@':resolve(root,'src')},tsconfig:resolve(root,'tsconfig.json')});
'''
for name, directory in [('baseline', args.baseline), ('candidate', ROOT)]:
    subprocess.run(['node', '--input-type=module', '-e', build, str(directory.resolve()), str((OUT / f'{name}.js').resolve()), 'Harness'], cwd=ROOT, check=True)
    (OUT / f'{name}.html').write_text(f'<style>html,body{{margin:0;overflow:hidden}}canvas{{width:100vw;height:100vh;display:block}}</style><canvas></canvas><script src="{name}.js"></script>')
if not (OUT / 'pangea').exists():
    (OUT / 'pangea').symlink_to(ROOT / 'public/pangea', target_is_directory=True)

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(OUT)))
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
        report['browserVersion'] = browser.version
        for name in ['baseline', 'candidate']:
            page = browser.new_page(viewport={'width': 1536, 'height': 1024}, reduced_motion='reduce')
            page.on('pageerror', lambda error: report['pageErrors'].append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_port}/{name}.html')
            measurements = []
            report['implementations'][name] = measurements
            for population in [1000, 2000]:
                page.evaluate('''async n=>{window.sim=Harness.createCityLaboratory(481217,n);
                  window.renderer=new Harness.PangeaRenderer(document.querySelector('canvas'),sim);
                  await renderer.init();renderer.setView('settlement');}''', population)
                for zoom in [.35, .9]:
                    row = page.evaluate('''async zoom=>{const before=JSON.stringify(sim.snapshot());renderer.camera.zoom=zoom;
                      const raf=()=>new Promise(resolve=>requestAnimationFrame(resolve));
                      for(let i=0;i<10;i++){await raf();renderer.draw(.5);}
                      const cpu=[],intervals=[];let first=null,last=null;
                      for(let i=0;i<48;i++){const t=await raf();if(first===null)first=t;if(last!==null)intervals.push(t-last);last=t;
                        const start=performance.now();renderer.draw(.5);cpu.push(performance.now()-start);}
                      const finish=await raf();intervals.push(finish-last);
                      const stats=a=>{const sorted=[...a].sort((a,b)=>a-b);return {meanMs:a.reduce((x,y)=>x+y,0)/a.length,medianMs:sorted[Math.floor(a.length/2)],p95Ms:sorted[Math.floor(a.length*.95)],maxMs:sorted.at(-1)};};
                      const samples=[],startBatch=performance.now();
                      for(let i=0;i<45;i++){const start=performance.now();renderer.draw(.5);samples.push(performance.now()-start);}
                      renderer.ctx.getImageData(0,0,1,1);const flushed=performance.now()-startBatch;
                      return {rafCpu:stats(cpu),rafIntervals:stats(intervals),rafAggregatePerFrameMs:(finish-first)/48,
                        tightCpu:stats(samples),tightFlushedPerFrameMs:flushed/45,pixels:renderer.canvas.toDataURL(),
                        hits:JSON.stringify(renderer.hits),stateUnchanged:before===JSON.stringify(sim.snapshot())};}''', zoom)
                    assert row.pop('stateUnchanged')
                    pixels = base64.b64decode(row.pop('pixels').split(',')[1])
                    row.update(population=population, zoom=zoom, pixelSha256=hashlib.sha256(pixels).hexdigest(), hitSha256=hashlib.sha256(row.pop('hits').encode()).hexdigest())
                    measurements.append(row)
                    (OUT / f'{name}-{population}-{zoom}.png').write_bytes(pixels)
            report['checks'].append(f'{name}: rendering preserves complete simulation state')
            page.close()
        for before, after in zip(report['implementations']['baseline'], report['implementations']['candidate']):
            exact = before['pixelSha256'] == after['pixelSha256']
            filename = f"{after['population']}-{after['zoom']}.png"
            with Image.open(OUT / f'baseline-{filename}') as a, Image.open(OUT / f'candidate-{filename}') as b:
                assert a.size == b.size
                diff = ImageChops.difference(a.convert('RGBA'), b.convert('RGBA'))
                max_delta = max(channel[1] for channel in diff.getextrema())
                changed = sum(any(pixel) for pixel in diff.getdata())
                ratio = changed / (a.width * a.height)
            assert max_delta <= args.max_channel_delta and ratio <= args.max_changed_pixel_ratio, (filename, max_delta, ratio)
            assert before['hitSha256'] == after['hitSha256']
            report['comparisons'].append({'population': after['population'], 'zoom': after['zoom'], 'identicalPixels': exact, 'maxChannelDelta': max_delta, 'changedPixelRatio': ratio, 'identicalHits': True, 'rafAggregateSpeedup': before['rafAggregatePerFrameMs'] / after['rafAggregatePerFrameMs'], 'tightFlushedMeanSpeedup': before['tightFlushedPerFrameMs'] / after['tightFlushedPerFrameMs']})
        report['checks'].append('Four isometric views meet explicit pixel bounds and match complete hit geometry/order')
        if args.url:
            page = browser.new_page(viewport={'width': 1536, 'height': 1024}, reduced_motion='reduce')
            page.on('pageerror', lambda error: report['pageErrors'].append(str(error)))
            page.goto(args.url)
            page.wait_for_function('window.PANGEA?.renderer.ready')
            page.evaluate('PANGEA.pause()')
            page.wait_for_timeout(700)
            page.evaluate('''()=>{const sim=PANGEA.simulation,original=sim.foodDays;window.idleReads=0;
              sim.foodDays=function(...args){idleReads++;return original.apply(this,args);};}''')
            page.wait_for_timeout(1100)
            report['idleInspectorFoodQueries'] = page.evaluate('idleReads')
            assert report['idleInspectorFoodQueries'] == 0
            page.evaluate('PANGEA.advance(1)')
            page.wait_for_timeout(100)
            assert page.evaluate('idleReads') > 0
            report['checks'].append('Paused production UI skips periodic inspector computation and refreshes after advancing')
            page.screenshot(path=str(OUT / 'desktop.png'))
        assert not report['pageErrors']
        browser.close()
finally:
    server.shutdown()
    server.server_close()
(OUT / 'results.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
print(f'Artifacts: {OUT}')
