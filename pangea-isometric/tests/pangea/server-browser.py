"""Exercise the real frontend against an isolated, running authoritative server.
Requires a frontend at PANGEA_URL (default http://127.0.0.1:3002).
The temporary SQLite database and server are removed afterwards.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
from urllib.parse import urlparse
from urllib.request import Request, urlopen
import json, os, re, subprocess, tempfile, time

ROOT = Path(__file__).resolve().parents[2]
URL = os.environ.get('PANGEA_URL', 'http://127.0.0.1:3002/')
parsed = urlparse(URL)
origin = parsed.scheme + '://' + parsed.netloc
checks, page_errors = [], []
def settings(page):
    page.locator('.p-rail [aria-label="World settings"]').click()
    page.locator('.world-connection summary').click()

def rejoin(page, connection):
    settings(page)
    page.get_by_label('Server URL', exact=True).fill(connection['endpoint'])
    page.get_by_label('World ID', exact=True).fill(connection['worldId'])
    page.get_by_label('Private key', exact=True).fill(connection['token'])
    page.get_by_role('button', name='Rejoin world', exact=True).click()
    page.get_by_role('button', name='Disconnect to local copy', exact=True).wait_for(timeout=30000)

def wait_held(page, held):
    for _ in range(120):
        if held: return
        page.wait_for_timeout(50)
    raise AssertionError('The expected delayed server response was not requested')

with tempfile.TemporaryDirectory(prefix='pangea-server-ui-') as folder:
    env = dict(os.environ, PANGEA_PORT='0', PANGEA_HOST='127.0.0.1', PANGEA_DB_PATH=str(Path(folder) / 'worlds.sqlite'), PANGEA_ALLOWED_ORIGINS=origin)
    env.pop('PANGEA_CREATE_KEY', None)
    process = subprocess.Popen(['node', 'server/index.mjs'], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        line = process.stdout.readline()
        match = re.search(r'listening on 127\.0\.0\.1:(\d+)', line)
        if not match: raise RuntimeError('World server did not start: ' + process.stderr.read())
        endpoint = 'http://127.0.0.1:' + match.group(1)
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
            context = browser.new_context(viewport={'width':1536, 'height':1024})
            page = context.new_page(); page.on('pageerror', lambda error: page_errors.append(str(error)))
            page.goto(URL, wait_until='networkidle'); page.wait_for_function('window.PANGEA?.renderer.ready', timeout=60000)
            seed = page.evaluate('PANGEA.simulation.state.seed')
            settings(page)
            page.get_by_label('Server URL', exact=True).fill(endpoint)
            page.get_by_role('button', name='Create server world', exact=True).click()
            page.get_by_role('button', name='Disconnect to local copy', exact=True).wait_for(timeout=30000)
            connection = page.evaluate("JSON.parse(localStorage.getItem('pangea-server-connection-v1'))")
            assert connection['worldId'] and len(connection['token']) >= 32
            checks.append('Frontend creates a protected server world and remembers its private connection locally')
            page.get_by_role('button', name='Close world settings', exact=True).click()
            page.get_by_role('button', name='Resume simulation', exact=True).click()
            page.get_by_role('button', name='Pause simulation', exact=True).wait_for()
            before = page.evaluate('PANGEA.simulation.state.tick')
            page.close(); time.sleep(0.8)
            request = Request(endpoint + '/api/worlds/' + connection['worldId'], headers={'Authorization':'Bearer ' + connection['token']})
            with urlopen(request) as response: server_world = json.load(response)
            assert server_world['snapshot']['tick'] > before
            checks.append('Authoritative simulation advances after the browser page is closed')
            page = context.new_page(); page.on('pageerror', lambda error: page_errors.append(str(error)))
            page.goto(URL, wait_until='networkidle'); page.wait_for_function('window.PANGEA?.renderer.ready', timeout=60000)
            assert page.evaluate('PANGEA.simulation.state.seed') != seed
            settings(page)
            assert page.get_by_label('World ID', exact=True).input_value() == connection['worldId']
            page.get_by_role('button', name='Rejoin world', exact=True).click()
            page.get_by_role('button', name='Disconnect to local copy', exact=True).wait_for(timeout=30000)
            assert page.evaluate('PANGEA.simulation.state.seed') == seed
            assert page.evaluate('PANGEA.simulation.state.tick') >= server_world['snapshot']['tick']
            checks.append('Fresh launch remains random and explicit Rejoin restores server progression')
            page.get_by_role('button', name='Close world settings', exact=True).click()
            page.get_by_role('button', name='Pause simulation', exact=True).click()
            page.get_by_role('button', name='Resume simulation', exact=True).wait_for()
            with urlopen(request) as response: paused = json.load(response)
            time.sleep(0.25)
            with urlopen(request) as response: later = json.load(response)
            assert paused['paused'] and paused['snapshot']['tick'] == later['snapshot']['tick']
            checks.append('Frontend pause command is persisted and freezes the server clock')
            # Same seed, different world structure: the selected third town is
            # removed by the import, so renderer and React selection must reset.
            page.get_by_role('combobox', name='Select settlement', exact=True).select_option('3')
            page.get_by_role('navigation', name='World view', exact=True).get_by_role('button', name='Settlement', exact=True).click()
            assert page.evaluate('PANGEA.renderer.townId') == 3
            natural = subprocess.run(['node', '--input-type=module', '-e', "import {Simulation} from './src/pangea/simulation/sim.mjs';console.log(JSON.stringify(new Simulation(Number(process.argv[1])).snapshot()))", str(seed)], cwd=ROOT, check=True, capture_output=True, text=True).stdout
            import_path = Path(folder) / 'same-seed-natural.json'; import_path.write_text(natural)
            settings(page); page.locator('input[type="file"]').set_input_files(str(import_path))
            page.wait_for_function('PANGEA.simulation.state.towns.length===1', timeout=30000)
            assert page.evaluate('PANGEA.simulation.state.seed') == seed
            assert page.evaluate('PANGEA.renderer.townId') == 1
            page.get_by_role('button', name='Close world settings', exact=True).click(); page.wait_for_timeout(250)
            assert page.locator('.map-title').inner_text()
            checks.append('Same-seed server import resets removed town selection and the settlement renderer')

            # Hold the completed command response while the user disconnects.
            # Releasing it must not replace the new local simulation.
            command_pattern = endpoint + '/api/worlds/' + connection['worldId'] + '/commands'
            held = {}
            def delay_command(route): held.update(route=route, response=route.fetch())
            page.route(command_pattern, delay_command)
            page.get_by_role('button', name='Set speed to 64 times', exact=True).click(); wait_held(page, held)
            settings(page)
            page.get_by_role('button', name='Disconnect to local copy', exact=True).click()
            page.get_by_role('button', name='Rejoin world', exact=True).wait_for()
            page.evaluate('PANGEA.advance(2)'); local_tick = page.evaluate('PANGEA.simulation.state.tick')
            held['route'].fulfill(response=held['response']); page.unroute(command_pattern); page.wait_for_timeout(200)
            assert page.evaluate('PANGEA.simulation.state.tick') == local_tick
            assert page.evaluate("localStorage.getItem('pangea-server-connection-v1')") is None
            checks.append('Delayed command response cannot overwrite the disconnected local copy')
            page.get_by_role('button', name='Close world settings', exact=True).click()
            rejoin(page, connection)
            page.get_by_role('button', name='Close world settings', exact=True).click()
            read_pattern = endpoint + '/api/worlds/' + connection['worldId']; held = {}
            def delay_read(route): held.update(route=route, response=route.fetch())
            page.route(read_pattern, delay_read); wait_held(page, held)
            settings(page); page.get_by_role('button', name='Disconnect to local copy', exact=True).click()
            page.evaluate('PANGEA.showcase()'); local_seed = page.evaluate('PANGEA.simulation.state.seed')
            held['route'].fulfill(response=held['response']); page.unroute(read_pattern); page.wait_for_timeout(200)
            assert page.evaluate('PANGEA.simulation.state.seed') == local_seed and local_seed != seed
            checks.append('Delayed polling response cannot overwrite a new local world after disconnect')
            checks.append('Explicit disconnect forks a paused local copy and clears saved connection credentials')
            assert not page_errors, page_errors
            browser.close()
        print(json.dumps({'status':'passed','checks':checks,'pageErrors':page_errors}, indent=2))
    finally:
        process.terminate()
        try: process.wait(timeout=10)
        except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=5)
