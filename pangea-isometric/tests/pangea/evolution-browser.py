"""Focused browser regressions for the six PANGEA evolution tracks.

Run against a production server, e.g. PANGEA_URL=http://127.0.0.1:3002/
python3 tests/pangea/evolution-browser.py. Complements browser.py's generic flow.
Requires Python Playwright and Chromium. Evidence stays under work/ by default.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
import os
import time

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(os.environ.get("PANGEA_QA_OUTPUT", str(ROOT / "work/qa-evolution")))
OUT.mkdir(parents=True, exist_ok=True)
URL = os.environ.get("PANGEA_URL", "http://127.0.0.1:3002/")
report = {"checks": [], "pageErrors": [], "failedRequests": []}


def ok(name):
    report["checks"].append(name)
    print("PASS", name, flush=True)


def settings(page):
    if not page.get_by_role("dialog").count():
        page.locator('.p-rail [aria-label="World settings"]').click()


def close_settings(page):
    if page.get_by_role("dialog").count():
        page.get_by_role("button", name="Close world settings", exact=True).click()


def new_seed(page, seed):
    settings(page)
    page.locator(".seed-input input").fill(str(seed))
    page.get_by_role("button", name="New world · Four founders", exact=True).click()
    page.get_by_role("button", name="Create new world", exact=True).click()
    page.wait_for_function("seed => PANGEA.snapshot().seed === seed", arg=seed)


GEOGRAPHY_DIGEST = """async () => {
  const t=PANGEA.snapshot().towns[0];
  const bytes=new TextEncoder().encode(JSON.stringify({lon:t.lon,lat:t.lat,tiles:t.land.tiles,nodes:t.land.nodes}));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
}"""
CHECKPOINTS = """() => new Promise((resolve,reject)=>{
  const req=indexedDB.open('pangea-checkpoints-v1',1);
  req.onerror=()=>reject(req.error);
  req.onsuccess=()=>{const db=req.result;const read=db.transaction('metadata').objectStore('metadata').getAll();
    read.onsuccess=()=>{db.close();resolve(read.result)};read.onerror=()=>{db.close();reject(read.error)};};
})"""


def wait_checkpoint(page, seed, tick):
    # This environment's Playwright treats a returned Promise as truthy before
    # its false value resolves. Await the IndexedDB read through evaluate first.
    deadline = time.monotonic() + 22
    while time.monotonic() < deadline:
        records = page.evaluate(CHECKPOINTS)
        if any(record["seed"] == seed and record["tick"] == tick for record in records):
            return records
        page.wait_for_timeout(500)
    raise AssertionError(f"No committed checkpoint for seed {seed}, tick {tick}: {records}")

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=os.environ.get("CHROMIUM_PATH", "/usr/bin/chromium"),
            headless=True, args=["--no-sandbox"],
        )
        page = browser.new_page(viewport={"width": 1536, "height": 1024}, device_scale_factor=1)
        page.on("pageerror", lambda error: report["pageErrors"].append(str(error)))
        page.on("requestfailed", lambda request: report["failedRequests"].append(request.url))
        page.goto(URL, wait_until="networkidle", timeout=90000)
        page.wait_for_function("window.PANGEA?.renderer.ready", timeout=60000)

        # Check the actual shipped art and successful runtime image loads, not only filenames.
        manifest = page.request.get(URL.rstrip("/") + "/pangea/buildings/manifest.json").json()
        types = ["furnace", "steelworks", "factory", "mill", "bakery", "kiln", "weaver", "station"]
        sprites = [manifest["sprites"][name] for name in types]
        assert len({sprite["sha256"] for sprite in sprites}) == len(types)
        assert all(sprite["size"]["width"] > 0 and sprite["size"]["height"] > 0 for sprite in sprites)
        assert page.evaluate("sources => sources.every(src => PANGEA.renderer.artImages.get(src)?.naturalWidth > 0)", [sprite["src"] for sprite in sprites])
        page.evaluate("PANGEA.setView('settlement')")
        page.wait_for_function("!PANGEA.renderer.transition.active")
        page.screenshot(path=str(OUT / "evolution-developed-art.png"))
        page.evaluate("PANGEA.setView('world')")
        page.wait_for_function("!PANGEA.renderer.transition.active")
        ok("Eight industrial and transport structures have distinct shipped pixels, positive bounds and loaded images")

        # A family-name shortcut must open one of that town's real current residents.
        family_button = page.locator(".identity-family button").first
        family = family_button.inner_text().strip()
        expected = page.evaluate("family => PANGEA.simulation.residents(PANGEA.simulation.town(PANGEA.renderer.townId)).filter(p=>p.family===family).sort((a,b)=>a.id-b.id)[0]", family)
        assert expected
        family_button.focus()
        page.keyboard.press("Enter")
        assert page.locator(".resident-profile h2").inner_text() == expected["name"]
        assert page.evaluate("PANGEA.renderer.selected.id") == expected["id"]
        page.screenshot(path=str(OUT / "evolution-family-resident.png"))
        ok("Family-name keyboard activation opens the matching actual resident")

        # Legacy terrain remains legacy. Compare all saved tiles and sites after the real file-import path.
        legacy_file = ROOT / "tests/saves/seed-481217-after-40-years.json"
        legacy = json.loads(legacy_file.read_text())
        settings(page)
        page.locator('input[type="file"]').set_input_files(str(legacy_file))
        page.wait_for_function("tick => PANGEA.snapshot().tick === tick", arg=legacy["tick"])
        restored = page.evaluate("({seed:PANGEA.snapshot().seed,generationVersion:PANGEA.snapshot().generationVersion,towns:PANGEA.snapshot().towns.map(t=>({id:t.id,lon:t.lon,lat:t.lat,tiles:t.land.tiles}))})")
        assert restored["seed"] == legacy["seed"] and restored["generationVersion"] == 1
        assert restored["towns"] == [{"id": t["id"], "lon": t["lon"], "lat": t["lat"], "tiles": t["land"]["tiles"]} for t in legacy["towns"]]
        ok("Version-2 portable save imports with generationVersion 1 and retains every saved terrain tile and settlement site")

        # Chronicle detail, scope and newest-first ordering are checked against the imported source records.
        page.locator('.p-rail [aria-label="Chronicle"]').click()
        town_id = page.evaluate("PANGEA.renderer.townId")
        expected_events = sorted([event for event in legacy["events"] if event.get("townId") == town_id], key=lambda event: (event["day"], event["id"]), reverse=True)[:50]
        actual_events = page.locator(".chronicle-row").evaluate_all("rows=>rows.map(row=>({title:row.querySelector('h3').textContent,detail:row.querySelector('p').textContent}))")
        assert actual_events == [{"title": event["title"], "detail": event["detail"]} for event in expected_events]
        assert actual_events
        page.get_by_role("combobox", name="Select settlement").select_option(str(legacy["towns"][1]["id"]))
        page.locator('.p-rail [aria-label="Chronicle"]').click()
        other_id = page.evaluate("PANGEA.renderer.townId")
        other_events = sorted([event for event in legacy["events"] if event.get("townId") == other_id], key=lambda event: (event["day"], event["id"]), reverse=True)[:50]
        assert page.locator(".chronicle-row h3").all_text_contents() == [event["title"] for event in other_events]
        ok("Chronicle renders actual detail text, limits events to the selected town and puts newest source records first")

        # Recreating an explicit seed repeats the new version's real generated geography.
        new_seed(page, 90210)
        first_digest = page.evaluate(GEOGRAPHY_DIGEST)
        assert page.evaluate("PANGEA.snapshot().generationVersion") == 2
        assert page.evaluate("PANGEA.simulation.alive.length") == 4
        new_seed(page, 90210)
        assert page.evaluate(GEOGRAPHY_DIGEST) == first_digest
        new_seed(page, 90211)
        assert page.evaluate(GEOGRAPHY_DIGEST) != first_digest
        new_seed(page, 90210)
        ok("Fresh worlds use terrain generation version 2; same seed repeats all local geography and a changed seed changes it")

        # Time-of-day presentation changes only the renderer.
        page.get_by_role("button", name="Enter settlement", exact=True).click()
        page.wait_for_function("!PANGEA.renderer.transition.active")
        tick = page.evaluate("PANGEA.snapshot().tick")
        settings(page)
        page.get_by_role("button", name="night", exact=True).click()
        assert page.evaluate("PANGEA.renderer.lighting") == "night"
        assert page.evaluate("PANGEA.snapshot().tick") == tick
        page.get_by_role("button", name="day", exact=True).click()
        assert page.evaluate("PANGEA.renderer.lighting") == "day"
        assert page.evaluate("PANGEA.snapshot().tick") == tick
        ok("Day/night presentation switches renderer lighting while keeping authoritative simulation time fixed")

        # First establish a manual checkpoint, then require a later tick to be written by the automatic timer.
        page.get_by_role("button", name="Save in browser", exact=True).click()
        wait_checkpoint(page, 90210, tick)
        page.wait_for_function("document.querySelectorAll('.checkpoint-list button').length>0")
        assert any(record["seed"] == 90210 and record["tick"] == tick for record in page.evaluate(CHECKPOINTS))
        close_settings(page)
        page.evaluate("PANGEA.advance(1)")
        auto_tick = page.evaluate("PANGEA.snapshot().tick")
        report["committedAutosave"] = wait_checkpoint(page, 90210, auto_tick)
        page.reload(wait_until="networkidle")
        page.wait_for_function("window.PANGEA?.renderer.ready", timeout=60000)
        settings(page)
        checkpoint = page.locator(".checkpoint-list button").filter(has_text="Seed 90210").first
        checkpoint.wait_for()
        report["restoreAttempt"] = {"checkpoint": checkpoint.inner_text(), "expectedTick": auto_tick,
                                    "records": page.evaluate(CHECKPOINTS)}
        checkpoint.click()
        page.wait_for_timeout(500)
        report["restoreAttempt"]["result"] = page.evaluate("({seed:PANGEA.snapshot().seed,tick:PANGEA.snapshot().tick,toast:document.querySelector('.p-toast')?.textContent})")
        page.wait_for_function("({seed,tick})=>PANGEA.snapshot().seed===seed&&PANGEA.snapshot().tick===tick", arg={"seed": 90210, "tick": auto_tick})
        assert page.get_by_role("button", name="Resume simulation", exact=True).is_visible()
        ok("Timer autosave writes the later state; checkpoint list survives reload and restores its seed/tick paused")

        page.screenshot(path=str(OUT / "evolution-restored.png"))

        # Real Chromium touch input exercises pointer capture and CSS-pixel coordinates at DPR 2.
        mobile = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                                  is_mobile=True, has_touch=True, reduced_motion="reduce")
        mobile.on("pageerror", lambda error: report["pageErrors"].append(str(error)))
        mobile.goto(URL, wait_until="networkidle")
        mobile.wait_for_function("window.PANGEA?.renderer.ready", timeout=60000)
        mobile.evaluate("PANGEA.pause();PANGEA.setView('settlement')")
        bounds = mobile.locator("canvas").bounding_box()
        initial = mobile.evaluate("""()=>{const r=PANGEA.renderer;r.focus();return {
          zoom:r.camera.zoom,x:r.width/2,y:r.height/2,world:{x:r.camera.x,y:r.camera.y}}} """)
        cdp = mobile.context.new_cdp_session(mobile)

        def touch(kind, points):
            cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": [
                {"x": bounds["x"] + x, "y": bounds["y"] + y, "id": pointer,
                 "radiusX": 2, "radiusY": 2} for pointer, x, y in points
            ]})

        x, y = initial["x"], initial["y"]
        touch("touchStart", [(1, x - 60, y), (2, x + 60, y)])
        touch("touchMove", [(1, x - 78, y - 15), (2, x + 102, y - 15)])
        touch("touchEnd", [])
        result = mobile.evaluate("""()=>{const r=PANGEA.renderer,x=r.width/2+12,y=r.height/2-15;
          return {zoom:r.camera.zoom,selected:r.selected,world:{
            x:(x-r.width/2)/r.camera.zoom+r.camera.x,y:(y-r.height/2)/r.camera.zoom+r.camera.y}}} """)
        assert abs(result["zoom"] - initial["zoom"] * 1.5) < 1e-5
        assert abs(result["world"]["x"] - initial["world"]["x"]) < 1e-4
        assert abs(result["world"]["y"] - initial["world"]["y"]) < 1e-4
        assert result["selected"] is None
        ok("Real phone touch pinch preserves the moving world centroid at DPR 2 without selecting an object")
        mobile.screenshot(path=str(OUT / "evolution-phone-pinch.png"))
        assert not report["pageErrors"], report["pageErrors"]
        assert not report["failedRequests"], report["failedRequests"]
        browser.close()
except Exception as error:
    report["failure"] = str(error)
    raise
finally:
    (OUT / "evolution-report.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
