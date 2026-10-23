# PANGEA — A living world

A playable isometric foundation built in a clone of [amilich/isometric-city](https://github.com/amilich/isometric-city), connected to the existing PANGAEA autonomous civilization simulation.

The world is an isometric continent. Every settlement opens its own seeded city with actual residents, buildings, streets, inventories and work. The interface uses generated medieval architecture and terrain art, dark charcoal surfaces, warm brass details and ivory typography.

## Run

Node.js 22 or later:

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. The original IsoCity remains available at `/isocity`. The clone retains its original city/coaster source and assets.

```sh
npm test                  # 56 simulation and migration regressions
npm run lint:pangea       # Strict checks for the new PANGEA surface
npx tsc --noEmit           # Whole-repository TypeScript check
npm run build             # Production Next.js build
npm start
npm run build:standalone   # dist/PANGEA.html: self-contained, no runtime network
```

Browser integration checks require Python Playwright, Chromium, and a running server:

```sh
npm run test:browser
# Optional: PANGEA_URL=http://127.0.0.1:3001/ npm run test:browser
```

## Explore

The first screen is an explicitly labelled **constructed preview**, containing 240 people and three cities. Every fresh launch generates a new random seed for the preview. It starts paused. Use the play control to let their work and lives continue. This preview has granted buildings, discoveries and resources; it does not claim to be natural simulation growth.

World settings → **New world · Four founders** begins a natural world with a fresh random seed. Leave the optional seed field blank for automatic generation, or enter a seed to recreate its geography. Saves retain their seed and restore the same world. Export the current world first if you want to keep it. The existing simulation's growth, households, species, finite resources, production, transport, research and version 2/3 save migrations are preserved.

- Select a settlement marker, then **Enter settlement**. The settlement picker also travels between cities.
- Click a resident or structure to inspect its real state. The rail opens resources, people, knowledge and history.
- Drag to pan, scroll or use ± to zoom. **F** recentres, **G** opens the world, **C** opens the city, **I** toggles the inspector, **Space** pauses.
- World settings supports browser save/load and portable JSON import/export. Malformed imports leave the current world unchanged.
- The phone layout keeps the map clear until an inspector is opened. Reduced-motion settings disable ambient motion and transitions.

## Architecture and provenance

`src/pangea/renderer.ts` uses the upstream IsoCity `gridToScreen`, `drawIsometricDiamond`, tile dimensions, and cached image loader. The world is generated from the same seeded geography as the simulation; it is not a screenshot with static buttons. Streets trace actual connected simulation edges. Sprite depth, pointer hit testing, camera transforms and terrain caches live in the renderer.

`src/pangea/simulation/` contains the renderer-independent PANGAEA Realms 0.5 simulation copied from the existing project. `model.ts` supplies a typed boundary; React owns the interface, while the simulation owns every person, inventory and tick. A bounded simulation budget yields to rendering and input.

`src/pangea/components/` contains the app shell, inspector and compass artwork. `scripts/build-standalone.mjs` bundles the same React application, sprites, ground material and fonts into one HTML file.

Source baseline: IsoCity `b774dd7913103e9dd9ec51b2151893c22683886e`; existing PANGAEA workspace baseline `bd967b4`.

## Scope

This is a browser-local playable foundation, not a finished AAA release or a hosted multiplayer backend. There is no server database, account system or background simulation after the tab closes. World and city are two separate map scales. The new art atlas currently has eight archetypes; several building classes share an illustration, and residents retain small procedural silhouettes. The complete industrial-era art progression, combat and neural/LLM agents are not implemented.

The optional compact source download includes all application code and PANGEA's generated PNG/WebP artwork and fonts. Its PANGEA application runs immediately after npm install. This GitHub tree includes the original IsoCity WebP art sheets and points direct sprite loaders at those files. Full PNG originals remain in the complete workspace clone; run `npm run fetch:upstream-assets` to restore their WebP versions when using `/isocity` from the compact download. This optional command fetches the documented upstream commit.

## Attribution

IsoCity is MIT licensed; see `LICENSE` and `README.upstream.md`. The vendored FlatQueue license remains beside its source. Manrope is included under its SIL Open Font License in `public/pangea/Manrope-OFL.txt`. PANGEA's new building atlas and ground texture were generated for this implementation.
