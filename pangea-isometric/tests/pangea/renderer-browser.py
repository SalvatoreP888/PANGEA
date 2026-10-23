"""Compare cached rendering, interaction and invalidation against an archived app.
Browser plugin not available; uses Python Playwright and system Chromium. Bundles,
reports and screenshots stay in --out (a fresh /tmp directory by default).
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
import argparse, base64, hashlib, json, os, subprocess, tempfile

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--baseline', type=Path, required=True)
parser.add_argument('--out', type=Path)
args = parser.parse_args()
OUT = args.out or Path(tempfile.mkdtemp(prefix='pangea-renderer-'))
OUT.mkdir(parents=True, exist_ok=True)
report = {'checks': [], 'views': [], 'pageErrors': [], 'browserPath': 'Browser plugin not available',
          'rendererSha256': hashlib.sha256((ROOT / 'src/pangea/renderer.ts').read_bytes()).hexdigest(),
          'tolerance': 'Hits, picks and state exact. Native camera-motion/world/oversized frames exact. Cached alpha-edge rounding has explicit per-view bounds (max8/255, ≤1% changed, RMS≤0.1/255, ≤0.03% above2).'}
build = '''
import {build} from 'esbuild';import {resolve} from 'node:path';
const [root,out,name]=process.argv.slice(1);
const contents=`export {PangeaRenderer} from ${JSON.stringify(resolve(root,'src/pangea/renderer.ts'))};
export {Simulation} from ${JSON.stringify(resolve(root,'src/pangea/simulation/sim.mjs'))};
export {createCityLaboratory} from ${JSON.stringify(resolve(root,'src/pangea/simulation/scenarios.mjs'))};`;
await build({stdin:{contents,resolveDir:root,loader:'ts'},bundle:true,format:'iife',globalName:name,
nodePaths:[resolve(process.cwd(),'node_modules')],outfile:out,alias:{'@':resolve(root,'src')},tsconfig:resolve(root,'tsconfig.json')});
'''
for name, directory in [('Baseline', args.baseline), ('Candidate', ROOT)]:
    subprocess.run(['node', '--input-type=module', '-e', build, str(directory.resolve()), str((OUT / f'{name}.js').resolve()), name], cwd=ROOT, check=True)
(OUT / 'index.html').write_text('<title>PANGEA renderer regression</title><style>html,body{margin:0;overflow:hidden}canvas{position:absolute;inset:0;width:100vw;height:100vh;display:block}</style><canvas id="before"></canvas><canvas id="after"></canvas><script src="Baseline.js"></script><script src="Candidate.js"></script>')
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
        for device, viewport, dpr in [('desktop', {'width':1536, 'height':1024}, 1), ('phone', {'width':390, 'height':844}, 2)]:
            page = browser.new_page(viewport=viewport, device_scale_factor=dpr, reduced_motion='reduce')
            page.on('pageerror', lambda error: report['pageErrors'].append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_port}/')
            assert page.title() == 'PANGEA renderer regression'
            page.evaluate('''async()=>{
              const world=Baseline.createCityLaboratory(481217,1000).snapshot();window.renderers=[];
              for(const [api,id] of [[Baseline,'before'],[Candidate,'after']]){
                const sim=api.Simulation.fromSnapshot(world),renderer=new api.PangeaRenderer(document.getElementById(id),sim);
                await renderer.init();renderer.setView('settlement');renderers.push(renderer);
              }
              window.compare=async(time,warm)=>{
                const before=renderers.map(r=>JSON.stringify(r.sim.snapshot()));
                for(let n=0;n<(warm?3:1);n++)for(const r of renderers)r.draw(time);
                const [a,b]=renderers.map(r=>r.ctx.getImageData(0,0,r.canvas.width,r.canvas.height).data);
                let max=0,changed=0,above2=0,sum=0;for(let i=0;i<a.length;i+=4){let pixel=0;for(let c=0;c<4;c++){const delta=Math.abs(a[i+c]-b[i+c]);pixel=Math.max(pixel,delta);sum+=delta*delta;}max=Math.max(max,pixel);if(pixel)changed++;if(pixel>2)above2++;}
                const hash=async raw=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw))).map(n=>n.toString(16).padStart(2,'0')).join('');
                const hits=renderers.map(r=>JSON.stringify(r.hits));
                const picks=renderers.map(r=>r.hits.filter((_,i)=>i%Math.max(1,Math.ceil(r.hits.length/80))===0).map(h=>{const hit=r.hit(h.x,h.y);return hit?[hit.kind,hit.id]:null;}));
                return {maxChannelDelta:max,changedPixels:changed,pixels:a.length/4,changedPixelRatio:changed/(a.length/4),pixelsAbove2:above2,rmsChannelDelta:Math.sqrt(sum/a.length),
                  beforeRgbaSha256:await hash(a),afterRgbaSha256:await hash(b),hitGeometryExact:hits[0]===hits[1],hitPicksExact:JSON.stringify(picks[0])===JSON.stringify(picks[1]),
                  stateUnchanged:renderers.every((r,i)=>JSON.stringify(r.sim.snapshot())===before[i])};
              };
            }''')
            def check(label, warm=True, time=.5, exact=False, screenshot=False):
                row = page.evaluate('([time,warm])=>compare(time,warm)', [time,warm])
                row.update(device=device, name=label)
                report['views'].append(row)
                assert row['hitGeometryExact'] and row['hitPicksExact'] and row['stateUnchanged'], row
                if exact:
                    assert row['changedPixels'] == 0, row
                else:
                    # Fractional transforms and fractional DPR can round transparent
                    # alpha edges differently when the same pixels are composited.
                    # Keep desktop fixed views strict; wider explicit bounds cover
                    # fractional camera/DPR and resize cases without hiding shifts.
                    if device == 'desktop':
                        limit = (4, .01) if label == 'pan-settled' else (6, .0001)
                    else:
                        limit = (7, .004)
                    if label == 'resize-settled':
                        limit = (8, .01)
                    row['allowedMaxChannelDelta'], row['allowedChangedPixelRatio'] = limit
                    assert row['maxChannelDelta'] <= limit[0] and row['changedPixelRatio'] <= limit[1], row
                    assert row['rmsChannelDelta'] <= .1 and row['pixelsAbove2']/row['pixels'] <= .0003, row
                if screenshot:
                    for name in ['before','after']:
                        png = page.evaluate('(id)=>document.getElementById(id).toDataURL()', name)
                        (OUT / f'{device}-{label}-{name}.png').write_bytes(base64.b64decode(png.split(',')[1]))
                return row
            page.evaluate('renderers.forEach(r=>r.camera.zoom=.35)')
            check('overview', screenshot=True)
            page.emulate_media(reduced_motion='no-preference')
            a=check('moving-ocean-start', time=.5);b=check('moving-ocean-later', time=2.5)
            assert a['beforeRgbaSha256']!=b['beforeRgbaSha256'] and a['afterRgbaSha256']!=b['afterRgbaSha256']
            page.emulate_media(reduced_motion='reduce')
            page.evaluate('renderers.forEach(r=>{r.camera.x+=123.25;r.camera.y-=42.75;})')
            check('pan-native', warm=False, exact=True);check('pan-settled')
            page.evaluate('renderers.forEach(r=>r.camera.zoom=.9)')
            check('zoom-native', warm=False, exact=True);check('zoom-settled', screenshot=True)
            page.evaluate("renderers.forEach(r=>{const t=r.sim.town(r.townId);r.selected={kind:'building',id:t.buildings[0].id};r.hovered=r.hits.find(h=>h.kind==='person')||null;})")
            check('selection-and-hover')
            page.evaluate("renderers.forEach(r=>{r.lighting='night';r.sim.town(r.townId).weather.kind='Storm';})")
            check('night-and-storm')
            page.evaluate("renderers.forEach(r=>{r.layer='resources';r.terrainKey='';})")
            check('resources-rebuild')
            page.evaluate("renderers.forEach(r=>{const t=r.sim.town(r.townId);t.land.streetEdges.fill(0);t.land.streets.fill(0);t.land.navRevision++;})")
            check('streets-removed')
            page.evaluate("renderers.forEach(r=>{r.reset(r.sim);r.camera.zoom=.35;})")
            check('same-world-reset')
            page.set_viewport_size({'width':viewport['width']+67,'height':viewport['height']+31})
            page.evaluate('renderers.forEach(r=>r.resize())')
            check('resize-native', warm=False, exact=True);check('resize-settled')
            assert page.evaluate('renderers[1].terrainRaster.width===renderers[1].canvas.width&&renderers[1].terrainRaster.height===renderers[1].canvas.height')
            if device == 'desktop':
                page.set_viewport_size({'width':3000,'height':2800})
                page.evaluate('renderers.forEach(r=>r.resize())')
                check('oversized-native', exact=True)
                assert page.evaluate('renderers[1].canvas.width*renderers[1].canvas.height>8000000&&renderers[1].terrainRaster===null')
                page.set_viewport_size(viewport)
                page.evaluate('renderers.forEach(r=>r.resize())')
                check('resize-restored')
                assert page.evaluate('renderers[1].terrainRaster!==null')
            page.evaluate("renderers.forEach(r=>r.setView('world'))")
            check('world-release', exact=True)
            assert page.evaluate('renderers[1].terrainRaster===null')
            report['checks'].append(f'{device}: stable/pan/zoom, live ocean, hits, selection/hover, night/storm, layer/nav/reset/resize invalidation, world memory release')
            page.close()
        assert not report['pageErrors']
        browser.close()
finally:
    server.shutdown()
    server.server_close()
(OUT / 'results.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(report, indent=2))
print(f'Artifacts: {OUT}')
