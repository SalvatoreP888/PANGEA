# PANGEA — A living world

An isometric world of autonomous settlements, built on [IsoCity](https://github.com/amilich/isometric-city) and the existing PANGAEA civilization simulation.

## Run

Node.js **24.15 or later**:

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. The original IsoCity remains at `/isocity`.

```sh
npm test                    # Simulation, terrain, camera, identity, art and persistence
npm run lint:pangea
npx tsc --noEmit
npm run build               # Production Next.js application
npm start
npm run build:standalone     # dist/PANGEA.html, including artwork/fonts/credits
npm run build:site           # dist/index.html for the private static preview
npm run server              # Optional authoritative Node + SQLite world server
```

Browser checks use Python Playwright and Chromium against a running production server:

```sh
PANGEA_URL=http://127.0.0.1:3002/ npm run test:browser
PANGEA_URL=http://127.0.0.1:3002/ npm run test:evolution
```

## The six improvements

1. **World generation.** Each seed selects different continental positions, orientations, islands and mountain belts. An ocean-rooted drainage graph accumulates rainfall into basins and tributaries; geography, founding suitability and rendering share the generated terrain. New worlds use generation 2. Saves without a generation version retain their exact generation 1 geography.
2. **Architecture progression.** Thirty trimmed, anchored sprites cover 25 building types plus five civic variants triggered by actual discoveries. Industrial housing, mills, mines, furnaces, factories, stations and apartments have separate silhouettes. Existing huts remain huts until the simulation builds their replacements.
3. **Visible work.** Foundations and scaffolds use actual construction progress and funding. Carried bundles, workshop inventory piles and foot/cart/train trips reflect actual goods and trips. Production effects follow real work or recorded batch completion. Day/dusk/night is a static presentation choice, avoiding flashing at accelerated simulation speeds.
4. **World/city continuity.** Camera transitions register the selected town to the local hall, remember the world and each city's camera, and yield to dragging, wheel or pinch. Reduced motion switches directly; mobile supports two-finger pan/zoom and double-tap entry.
5. **Persistence.** IndexedDB stores automatic checkpoints every 15 seconds and when the page becomes hidden, with three rotating checkpoints per world, recovery and legacy manual-save migration. Fresh launches remain random: choose a checkpoint explicitly to continue a saved world. An optional Node/SQLite server provides protected, authoritative worlds with independent ticking, restart catch-up and reconnect from another device. See [server deployment](docs/PERSISTENCE.md).
6. **Settlement identity.** Profiles derive architectural character, recorded production specializations, current family names, a stable decorative emblem and settlement-scoped history from real state. No invented biographies or prosperity counters. Chronicles use actual event details in newest-first order.

## Explore

Fresh launches open a paused, clearly labelled **constructed preview** with 240 people and three cities. Its granted resources/buildings demonstrate the simulation; they are not claimed as natural growth. World settings → **New world · Four founders** starts a natural world. Leave the seed blank for fresh randomness or enter one for reproducible geography. JSON export/import preserves the full world.

Select a town and enter its settlement; inspect real residents or buildings. Drag to pan, scroll/pinch or use ± to zoom. **F** recentres, **G** opens the world, **C** opens the city, **I** toggles the inspector, **Space** pauses. World settings contains recent checkpoints, server connection, presentation lighting and complete open-source credits.

## Architecture and source credit

Simulation owns people, buildings, resources and ticks. React owns the interface; the Canvas renderer reads state. `src/pangea/simulation/` remains independent of browser APIs and also runs on the server. Art preparation and provenance hashes are reproducible with `scripts/prepare-pangea-era-art.mjs`. The self-contained HTML bundles the same app, local art/fonts and full license notices.

The OSS research happened before implementation: twelve local candidate checkouts plus canonical art downloads were inspected, including source-level licenses and separate art rights. Only the selected, narrow pieces were incorporated. [Research and attribution](docs/oss/README.md) records each source/revision, code inspected, adaptations, alternatives and obligations. No upstream contribution or endorsement is claimed.

PANGEA-specific code is MIT except the explicitly marked Apache-2.0 terrain adaptation. Incorporated sources retain their own MIT, ISC, Apache-2.0 and SIL OFL notices. See [THIRD_PARTY_PANGEA.md](THIRD_PARTY_PANGEA.md), the retained license files, and World settings → Open-source credits. Run `npm run build:credits` after updating an incorporated source to regenerate the bundled notices.

## Deployment and current limits

The private Sites preview is a static application with **device-local** autosaves. Its optional server connection requires a separately running reachable server; the preview does not silently provision a database or claim continuous server operation. The Node server is implemented and integration-tested, with deployment instructions and explicit host/CORS/creation-key configuration. It must run as one authoritative process with durable storage.

World and city remain two map scales registered at the selected settlement; local rivers inherit watershed/climate information but are not an exact geometric zoom of global river cells. Family names describe current surname groups, not inferred ancestry. History reflects the simulation's bounded retained log. People are small procedural figures; combat, multiplayer collaboration and neural agents are outside this change.

The compact source download includes all PANGEA assets and runnable code. The complete GitHub tree also contains IsoCity's WebP sheets. `npm run fetch:upstream-assets` restores those sheets at the documented source revision when using `/isocity` from the compact download. Historical `PANGAEA_Project_Full/` files remain preserved in the parent repository.
