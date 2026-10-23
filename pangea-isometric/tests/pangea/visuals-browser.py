"""Compare visual update against PR6: real state, entity hits, cache and frame cost.
Requires --baseline pointing to an archived0.7.2 app. Visual pixels intentionally change.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
import argparse, base64, json, os, subprocess, tempfile
ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--baseline',type=Path,required=True)
parser.add_argument('--out',type=Path)
args=parser.parse_args();OUT=args.out or Path(tempfile.mkdtemp(prefix='pangea-visuals-'));OUT.mkdir(parents=True,exist_ok=True)
report={'checks':[],'views':[],'errors':[],'baseline':'741e8f4 / PR6','measurement':'24 paced frames after6 warmups, paused1000-person constructed city; softwareChromium, one run, CPU submission and RAF interval measured separately; only the timed canvas is visible to avoid occlusion bias.'}
build="""import{build}from'esbuild';import{resolve}from'node:path';const[root,out,name]=process.argv.slice(1);await build({stdin:{contents:`export {PangeaRenderer} from ${JSON.stringify(resolve(root,'src/pangea/renderer.ts'))};export {createCityLaboratory} from ${JSON.stringify(resolve(root,'src/pangea/simulation/scenarios.mjs'))};export {Simulation} from ${JSON.stringify(resolve(root,'src/pangea/simulation/sim.mjs'))};`,resolveDir:root,loader:'ts'},bundle:true,format:'iife',globalName:name,nodePaths:[resolve(process.cwd(),'node_modules')],outfile:out,alias:{'@':resolve(root,'src')},tsconfig:resolve(root,'tsconfig.json')});"""
for name,directory in [('Baseline',args.baseline),('Candidate',ROOT)]:subprocess.run(['node','--input-type=module','-e',build,str(directory.resolve()),str(OUT/f'{name}.js'),name],cwd=ROOT,check=True)
(OUT/'index.html').write_text('<style>body{margin:0}canvas{position:absolute;inset:0;width:100vw;height:100vh}</style><canvas id="before"></canvas><canvas id="after"></canvas><script src="Baseline.js"></script><script src="Candidate.js"></script>')
if not (OUT/'pangea').exists():(OUT/'pangea').symlink_to(ROOT/'public/pangea',target_is_directory=True)
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(OUT)));Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
  for device,viewport,dpr in [('desktop',{'width':1536,'height':1024},1),('phone',{'width':390,'height':844},2)]:
   page=browser.new_page(viewport=viewport,device_scale_factor=dpr,reduced_motion='reduce');page.on('pageerror',lambda e:report['errors'].append(str(e)));page.goto(f'http://127.0.0.1:{server.server_port}/')
   page.evaluate('''async()=>{window.renderers=[];const state=Baseline.createCityLaboratory(481217,1000).snapshot();for(const[api,id]of[[Baseline,'before'],[Candidate,'after']]){const r=new api.PangeaRenderer(document.getElementById(id),api.Simulation.fromSnapshot(state));await r.init();r.setView('settlement');renderers.push(r);}window.original=JSON.stringify(renderers[0].sim.snapshot());}''')
   for label,zoom in [('city-overview',.35),('city-detail',.85),('world',None)]:
    if label=='world':page.evaluate("renderers.forEach(r=>r.setView('world'));renderers[1].camera={...renderers[0].camera}")
    else:page.evaluate('zoom=>renderers.forEach(r=>r.camera.zoom=zoom)',zoom)
    result=page.evaluate('''()=>{for(const r of renderers)for(let i=0;i<3;i++)r.draw(.5);const entities=r=>r.hits.filter(h=>!(r.view==='world'&&h.rect));return {stateUnchanged:renderers.every(r=>JSON.stringify(r.sim.snapshot())===original),hitsExact:JSON.stringify(entities(renderers[0]))===JSON.stringify(entities(renderers[1])),picksExact:renderers[0].view==='world'||JSON.stringify(renderers.map(r=>r.hits.filter((_,i)=>i%17===0).map(h=>{const p=r.hit(h.x,h.y);return[p?.kind,p?.id]}))[0])===JSON.stringify(renderers.map(r=>r.hits.filter((_,i)=>i%17===0).map(h=>{const p=r.hit(h.x,h.y);return[p?.kind,p?.id]}))[1]),loadedEnvironment:renderers[1].environment.every(i=>i.naturalWidth>0),raster:renderers[1].terrainRaster!==null};}''')
    assert result['stateUnchanged'] and result['hitsExact'] and result['picksExact'] and result['loadedEnvironment'],(device,label,result)
    assert result['raster']==(label!='world')
    if device=='desktop':
     timings=page.evaluate('''async()=>{const all=[];for(const r of renderers){for(const other of renderers)other.canvas.style.visibility=other===r?'visible':'hidden';const cpu=[],raf=[];let last=0;for(let i=0;i<30;i++){const now=await new Promise(requestAnimationFrame);if(i>=6)raf.push(now-last);last=now;const start=performance.now();r.draw(.5);if(i>=6)cpu.push(performance.now()-start);}const median=a=>a.sort((x,y)=>x-y)[Math.floor(a.length/2)];all.push({cpuMedianMs:median(cpu),rafMedianMs:median(raf)});}for(const r of renderers)r.canvas.style.visibility='visible';return all;}''');result['timings']={'baseline':timings[0],'candidate':timings[1]}
    if label=='city-detail':
     assert page.evaluate("""()=>{const r=renderers[1],t=r.sim.town(r.townId),hit=r.hits.find(h=>h.kind==='building'),b=t.buildings.find(b=>b.id===hit.id),index=t.buildings.indexOf(b),x=b.x,complete=b.complete;const pixels=()=>{r.draw(.5);r.draw(.5);return r.ctx.getImageData(0,0,r.canvas.width,r.canvas.height).data};const matches=()=>{const hot=pixels();r.terrainRasterKey='';const cold=pixels();return hot.every((v,i)=>v===cold[i]);};b.x+=3;const moved=matches();b.x=x;b.complete=false;const construction=matches();b.complete=complete;t.buildings.splice(index,1);const removed=matches();t.buildings.splice(index,0,b);pixels();return moved&&construction&&removed&&JSON.stringify(r.sim.snapshot())===original;}""")
     report['checks'].append(f'{device}: moved/unfinished/removed actual building ground agrees pixel-for-pixel with a forced cache rebuild; original state restored')
    for name in ['before','after']:
     data=page.evaluate('id=>document.getElementById(id).toDataURL()',name);(OUT/f'{device}-{label}-{name}.png').write_bytes(base64.b64decode(data.split(',')[1]))
    report['views'].append({'device':device,'view':label,**result})
   report['checks'].append(f'{device}: actual entities/picks and full state preserved at two city scales and world; terrain raster retained in city and released in world')
   page.close()
  assert not report['errors'];browser.close()
finally:server.shutdown();server.server_close()
(OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
