# PANGAEA — Many Peoples, One World

**Realms 0.5** is an autonomous fantasy settlement simulation: human, elf, dwarf and orc founders build a shared village that can grow into a connected industrial civilization. People are persistent individuals with needs, work, families, memories and mixed heritage.

## Run

Node 22+ and Python 3 are sufficient; no npm install, API key or runtime network access is needed.

```sh
npm run build
npm test
python3 -m http.server 8000 --bind 127.0.0.1
```

The generated `index.html` is self-contained. Serve it in a browser; direct file launch is blocked by this cloud Chromium policy and remains unverified here.

## Explore

- **World menu → City laboratory** opens an explicitly constructed 1,000-person sandbox with three mixed-species settlements, fisheries, mills, bakeries, material industry and working road/rail services. Export your current world first; the laboratory replaces it and opens paused.
- **Click a settlement or scroll inward from space** to enter its city with a zoom/fade transition. Scroll far outward to return to the planet. Reduced-motion preferences skip the animation. These are separate map scales, not continuous planetary terrain.
- **MAX** runs exact simulation ticks at the current machine's available throughput, without a simulated-days target. It yields to render and handle controls. Fixed 1×/16×/64×/256× speeds remain available. This is a single deterministic simulation thread.
- **Supply** shows grain → flour → bread, fish → meals, clay → bricks, flax → cloth, and the iron/steel/machinery chain. Residents collect inputs, carry them into workshop buffers and collect finished outputs. Stocks, hauling, missing inputs and full output buffers are visible. Click a producer to inspect its own inventory.
- **World menu → Planet climate & terrain** exposes temperature, rainfall, storms, droughts, fertility and forest cover. Apply climate to a running world or use the parameters for a new one. Cities and people are preserved; forest cover affects new density and ongoing regrowth.
- **Knowledge → Technology atlas** shows 36 practical discoveries across five eras. Research priorities preserve earlier progress.
- **Transport** shows persistent trails, dirt roads, highways, steam and electric rail, with real materials, labor, fuel, freight, passengers, travel time and delivered totals.

People are small relative to compact houses. Housing progresses from 4 to 96 beds per structure. Roads are explicit connected branches, not all neighboring traffic cells; heavy walking cannot draw a countryside lattice. The Activity layer shows walking intensity separately. New parcels are irregular; existing saves repair streets without moving buildings or inventing people/resources.

## Planet and people

The equator is warmer than both poles; elevation cools terrain, hemisphere seasons oppose, and moisture/latitude determine ice, tundra, taiga, forest, savanna and desert biomes. Climate affects vegetation, crops, warmth and fish recovery. New local rivers follow a descending drainage path. This is a compact game model, not a plate-tectonics or atmospheric solver, and local maps remain separate from the globe projection.

Species share jobs, homes, food and settlement institutions. Children retain both parents' heritage. Distinct magic, racial warfare and species-specific lifespan economies are not implemented.

## Controls and saves

Drag to pan/rotate; wheel to zoom; click a person/building to inspect. **C** city, **G** globe, **F** recenter, **I** observation panel, **Space** pause. Browser tabs do not simulate after closing.

Use JSON export for portable worlds. Version 2/3 saves migrate with existing individuals, terrain and stockpiles retained; new resources initialize empty and missing fantasy/climate metadata is added. New rules affect future outcomes. Browser storage can fill with large worlds.

Fresh natural example: import `saves/logistics-seed-481217-after-30-years.json`. The original v0.2, Cities 0.3 and Realms 0.4 fixtures remain preserved; their historical population results are not claims about the current ruleset.

## Verify

```sh
npm test                         # 56 simulation/city/economy/climate regressions
npm run test:browser              # Python Playwright + /usr/bin/chromium
npm run benchmark                # synthetic scale checks and exact save/resume
npm run scenarios -- 481217 30    # natural run; optional --save writes a separate fixture
node tests/production-scenarios.mjs # three natural 30-year runs, separate current fixture
```

[Fresh verification](docs/LOGISTICS_QA.md) · [Nine-game research and next work](docs/DEEP_RESEARCH.md) · [Earlier Realms changes](docs/REALMS_CHANGES.md) · [Architecture](docs/ARCHITECTURE.md) · [Third-party notices](THIRD_PARTY_NOTICES.md)

The old scenario runners can overwrite preserved v0.2 fixtures; use the city/production runners for new runs. Renderer and simulation performance are measured separately. District warehouses, storage filters/capacity, permanent hauling crews, vehicle ownership and worker-thread execution remain future work. Basic hearth cooking and primitive toolmaking retain communal-input production; the eight industrial recipes use physical buffers and hauling.
