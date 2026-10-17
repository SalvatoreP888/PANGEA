# PANGAEA — A World Remembered
## Depth 0.2 · autonomous settlement prototype

A local, renderer-independent world simulation with four founders, survival needs, memories, relationships, families, construction, material production, travel and multiple settlements.

### Play

Open `index.html` in a modern desktop browser. It is designed as a standalone HTML file; there are no CDN requests, model credentials or runtime dependencies. A local web server is also an option:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Then visit `http://127.0.0.1:8000`. Save/download the file before opening it; a chat attachment preview may not execute JavaScript.

The world starts with four people. Press **C** or select **Settlement** to visit. **G** returns to the globe. Drag to move the camera, scroll to zoom, and click people/buildings to inspect. **Space** pauses; **F** recenters; **I** toggles the inspector. Speed buttons request 1/16/64/256 simulated days per second; the footer reports actual throughput. Speed is limited by available CPU time.

On mobile, **Observe** opens the inspector. The menu contains portable save export/import, a seeded restart and drought/storm interventions. Browser-local storage may be unavailable in private or restricted contexts; JSON export is the portable alternative.

### See a developed world immediately

Menu → Import world → `saves/seed-481217-after-40-years.json`. This real simulation checkpoint has 29 living people, four settlements and 49 completed structures across the world. It starts paused. Year 41, day 1 means forty full years have elapsed. Other included checkpoints show the world after one and thirty years.

### Build and test

Node 22 was used. There are no npm dependencies.

```sh
npm run build
npm test
node tests/long-run.mjs 481217 40
```

`npm run build` combines the ESM sources and CSS into the standalone HTML. Do not maintain a separate hand-edited version of the compiled HTML.

Browser QA requires Python Playwright and Chromium, supplied separately:

```sh
CHROMIUM_PATH=/usr/bin/chromium python3 tests/browser.py
```

The browser QA in this environment used `page.set_content` because navigation to local files and loopback addresses was blocked by runner policy. It tested the identical compiled HTML, including actual JSON export/import. Successful browser-local persistence and ordinary file launching still need checking in a normal browser context. Safari and Firefox have not been verified.

### Files

- `src/world.mjs`: seeded terrain, local maps, A*, coarse land routes.
- `src/data.mjs`: game rules, buildings, technology, traits and limits.
- `src/sim.mjs`: serializable deterministic simulation and save validation.
- `src/render.mjs`: globe/town drawing and camera; no gameplay mutation.
- `src/ui.mjs`: DOM inspectors, controls, imports/exports and frame scheduling.
- `src/style.css`: responsive game HUD.
- `docs/RESEARCH_INTEGRATION.md`: inspected papers/repos, license observations, integration decisions and the next milestones.
- `docs/ARCHITECTURE.md`: implementation boundaries and current abstractions.
- `docs/QA.md`, `tests/`: test evidence and limitations.
- `previews/`: screenshots of the actual running build.

### Important boundaries

This build is rule-based AI, not a language-model agent system. No LLM or external model is connected. Memories are structured; reflections are template-based. None of the reviewed third-party frameworks is included as a dependency. The original reference image is not shipped as a game texture.

This is not AAA-complete. Combat, deep diplomacy, markets, emergent laws, detailed genetics, interiors and seamless planetary terrain remain future work. Homes have abstract beds rather than room-level occupation. Convoy labor is abstracted. See the research report for a grounded next-stage plan.

The save format is version 2. Previous prototype 0.1 saves are intentionally rejected rather than silently misinterpreted.
